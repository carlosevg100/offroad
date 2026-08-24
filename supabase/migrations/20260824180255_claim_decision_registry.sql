-- Human claim decisions are append-only and bind to the exact claim and case snapshot reviewed.
-- A later case run may reuse a decision only while the claim fingerprint remains identical.

create table public.claim_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  intake_session_id uuid not null,
  source_manifest_id uuid not null,
  source_registry_fingerprint text not null check (source_registry_fingerprint ~ '^[0-9a-f]{64}$'),
  claim_id text not null check (char_length(trim(claim_id)) between 1 and 160),
  claim_fingerprint text not null check (claim_fingerprint ~ '^[0-9a-f]{64}$'),
  decision text not null check (decision in ('approved', 'rejected')),
  reason text not null check (char_length(trim(reason)) between 3 and 1000),
  decided_by uuid not null references auth.users(id) on delete restrict,
  decided_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, intake_session_id)
    references public.document_intake_sessions(organization_id, id) on delete cascade,
  foreign key (organization_id, source_manifest_id)
    references public.case_artifact_manifests(organization_id, id) on delete restrict
);

create index claim_decisions_session_claim_time_idx
  on public.claim_decisions (organization_id, intake_session_id, claim_id, decided_at desc, id desc);

alter table public.claim_decisions enable row level security;
alter table public.claim_decisions force row level security;

create or replace function private.can_review_intake_claims(
  p_organization_id uuid,
  p_session_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.document_intake_sessions session
      join public.organization_memberships membership
        on membership.organization_id = session.organization_id
      join public.organizations organization_record
        on organization_record.id = session.organization_id
      where session.organization_id = p_organization_id
        and session.id = p_session_id
        and session.status <> 'confirmed'
        and organization_record.organization_type in ('company', 'originator', 'offroad')
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'
        and membership.role in ('owner', 'admin', 'analyst', 'compliance')
    );
$$;

revoke all on function private.can_review_intake_claims(uuid, uuid) from public, anon;
grant execute on function private.can_review_intake_claims(uuid, uuid) to authenticated;

create policy claim_decisions_select
  on public.claim_decisions for select to authenticated
  using ((select private.can_access_intake_session(organization_id, intake_session_id)));

create policy claim_decisions_insert
  on public.claim_decisions for insert to authenticated
  with check (
    decided_by = (select auth.uid())
    and (select private.can_review_intake_claims(organization_id, intake_session_id))
  );

create trigger claim_decisions_audit
  after insert or update or delete on public.claim_decisions
  for each row execute function private.capture_audit_event();

revoke all privileges on public.claim_decisions from anon, authenticated;
grant select on public.claim_decisions to authenticated;

-- The browser writes through one command. It can only decide a material judgment that is
-- present in the latest immutable snapshot, with the exact fingerprint shown to the reviewer.
create or replace function public.record_claim_decision(
  p_organization_id uuid,
  p_session_id uuid,
  p_claim_id text,
  p_claim_fingerprint text,
  p_decision text,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  session_row public.document_intake_sessions;
  manifest_id uuid;
  registry_fingerprint text;
  current_claim jsonb;
  decision_id uuid;
begin
  if actor_id is null
    or not (select private.can_review_intake_claims(p_organization_id, p_session_id)) then
    raise exception 'claim_review_access_denied' using errcode = '42501';
  end if;
  if p_claim_fingerprint !~ '^[0-9a-f]{64}$'
    or p_decision not in ('approved', 'rejected')
    or char_length(trim(coalesce(p_reason, ''))) not between 3 and 1000 then
    raise exception 'invalid_claim_decision' using errcode = '22023';
  end if;

  select * into session_row
  from public.document_intake_sessions session
  where session.organization_id = p_organization_id and session.id = p_session_id
  for share;
  if not found then
    raise exception 'intake_session_not_found' using errcode = 'P0002';
  end if;

  begin
    manifest_id := (session_row.result_summary #>> '{case_manifest,id}')::uuid;
  exception when invalid_text_representation then
    manifest_id := null;
  end;
  registry_fingerprint := session_row.result_summary #>> '{case_state,claimRegistry,fingerprint}';
  if manifest_id is null or registry_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'claim_registry_not_available' using errcode = '55000';
  end if;

  select claim.value into current_claim
  from jsonb_array_elements(
    coalesce(session_row.result_summary #> '{case_state,claimRegistry,claims}', '[]'::jsonb)
  ) as claim(value)
  where claim.value ->> 'id' = p_claim_id
    and claim.value ->> 'fingerprint' = p_claim_fingerprint
    and claim.value ->> 'kind' = 'judgment'
    and claim.value ->> 'material' = 'true'
  limit 1;
  if current_claim is null then
    raise exception 'claim_not_current_material_judgment' using errcode = '22023';
  end if;

  insert into public.claim_decisions (
    organization_id, intake_session_id, source_manifest_id, source_registry_fingerprint,
    claim_id, claim_fingerprint, decision, reason, decided_by
  ) values (
    p_organization_id, p_session_id, manifest_id, registry_fingerprint,
    p_claim_id, p_claim_fingerprint, p_decision, trim(p_reason), actor_id
  ) returning id into decision_id;

  return decision_id;
end;
$$;

revoke all on function public.record_claim_decision(uuid, uuid, text, text, text, text)
  from public, anon;
grant execute on function public.record_claim_decision(uuid, uuid, text, text, text, text)
  to authenticated;

-- The worker reads the decision trail only through the same short-lived job capability used
-- for the case. It does not receive a tenant-wide decision directory.
create or replace function private.worker_load_claim_decisions(
  p_job_id uuid,
  p_capability_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  decisions jsonb;
begin
  if job_row.kind <> 'case_analysis' then
    raise exception 'case_analysis_capability_required' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'claimId', decision_row.claim_id,
    'decision', decision_row.decision,
    'claimFingerprint', decision_row.claim_fingerprint,
    'decidedBy', decision_row.decided_by,
    'decidedAt', decision_row.decided_at,
    'reason', decision_row.reason
  ) order by decision_row.decided_at, decision_row.id), '[]'::jsonb)
  into decisions
  from public.claim_decisions decision_row
  where decision_row.organization_id = job_row.organization_id
    and decision_row.intake_session_id = job_row.intake_session_id;

  return decisions;
end;
$$;

create or replace function public.worker_load_claim_decisions(
  p_job_id uuid,
  p_capability_token text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_load_claim_decisions(p_job_id, p_capability_token);
$$;

revoke all on function private.worker_load_claim_decisions(uuid, text) from public, anon;
revoke all on function public.worker_load_claim_decisions(uuid, text) from public, anon;
grant execute on function private.worker_load_claim_decisions(uuid, text) to authenticated;
grant execute on function public.worker_load_claim_decisions(uuid, text) to authenticated;

comment on table public.claim_decisions is
  'Append-only human decisions bound to an exact material judgment and immutable case snapshot.';
