-- Governed public research is external context, never case evidence. Only the capability-bound
-- worker writes it; tenants can read the lineage and sources for their own intake session.

create table public.public_research_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  intake_session_id uuid not null,
  processing_run_id uuid not null,
  status text not null check (status in ('succeeded', 'partial', 'abstained')),
  query_fingerprint text not null check (query_fingerprint ~ '^[0-9a-f]{64}$'),
  provider_chain jsonb not null default '[]'::jsonb check (jsonb_typeof(provider_chain) = 'array'),
  plan jsonb not null check (jsonb_typeof(plan) = 'array'),
  failures jsonb not null default '[]'::jsonb check (jsonb_typeof(failures) = 'array'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, intake_session_id)
    references public.document_intake_sessions(organization_id, id) on delete cascade,
  foreign key (organization_id, processing_run_id)
    references public.processing_runs(organization_id, id) on delete cascade
);

create table public.public_research_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  intake_session_id uuid not null,
  research_run_id uuid not null,
  topic text not null check (topic in ('identity', 'news', 'sector', 'regulation', 'market')),
  provider text not null check (provider in ('perplexity', 'openai', 'official', 'mcp')),
  title text not null check (char_length(trim(title)) between 1 and 500),
  url text not null check (url ~ '^https://'),
  snippet text not null default '' check (char_length(snippet) <= 8000),
  published_at text,
  retrieved_at timestamptz not null,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  context_class text not null default 'external_context' check (context_class = 'external_context'),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, research_run_id, topic, url),
  foreign key (organization_id, intake_session_id)
    references public.document_intake_sessions(organization_id, id) on delete cascade,
  foreign key (organization_id, research_run_id)
    references public.public_research_runs(organization_id, id) on delete cascade
);

create index public_research_runs_session_created_idx
  on public.public_research_runs (organization_id, intake_session_id, created_at desc);
create index public_research_sources_session_topic_idx
  on public.public_research_sources (organization_id, intake_session_id, topic, retrieved_at desc);

alter table public.public_research_runs enable row level security;
alter table public.public_research_runs force row level security;
alter table public.public_research_sources enable row level security;
alter table public.public_research_sources force row level security;

create policy public_research_runs_select
  on public.public_research_runs for select to authenticated
  using ((select private.can_access_intake_session(organization_id, intake_session_id)));

create policy public_research_sources_select
  on public.public_research_sources for select to authenticated
  using ((select private.can_access_intake_session(organization_id, intake_session_id)));

create trigger public_research_runs_audit
  after insert or update or delete on public.public_research_runs
  for each row execute function private.capture_audit_event();
create trigger public_research_sources_audit
  after insert or update or delete on public.public_research_sources
  for each row execute function private.capture_audit_event();

revoke all privileges on public.public_research_runs from anon, authenticated;
revoke all privileges on public.public_research_sources from anon, authenticated;
grant select on public.public_research_runs to authenticated;
grant select on public.public_research_sources to authenticated;

create or replace function private.worker_record_public_research(
  p_job_id uuid,
  p_capability_token text,
  p_plan jsonb,
  p_result jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  research_id uuid;
  source_record jsonb;
  query_record jsonb;
  query_text text;
  result_status text := p_result ->> 'status';
begin
  if job_row.kind <> 'case_analysis' then
    raise exception 'case_analysis_capability_required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_plan) <> 'array'
    or jsonb_array_length(p_plan) not between 1 and 12
    or jsonb_typeof(p_result) <> 'object'
    or result_status not in ('succeeded', 'partial', 'abstained')
    or jsonb_typeof(coalesce(p_result -> 'sources', 'null'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_result -> 'failures', 'null'::jsonb)) <> 'array' then
    raise exception 'invalid_public_research_contract' using errcode = '22023';
  end if;

  for query_record in select value from jsonb_array_elements(p_plan) loop
    query_text := trim(coalesce(query_record ->> 'query', ''));
    if char_length(query_text) not between 3 and 400
      or query_text ~* '[[:alnum:]._%+-]+@[[:alnum:].-]+[.][[:alpha:]]{2,}'
      or query_text ~* '(R[$]|US[$]|BRL|USD)[[:space:]]*[0-9]'
      or query_text ~ '[0-9]{11,14}' then
      raise exception 'unsafe_public_research_query' using errcode = '22023';
    end if;
  end loop;

  insert into public.public_research_runs (
    organization_id, intake_session_id, processing_run_id, status, query_fingerprint,
    provider_chain, plan, failures, created_by
  ) values (
    job_row.organization_id,
    job_row.intake_session_id,
    job_row.processing_run_id,
    result_status,
    encode(extensions.digest(convert_to(p_plan::text, 'utf8'), 'sha256'), 'hex'),
    coalesce(p_result -> 'providerChain', '[]'::jsonb),
    p_plan,
    p_result -> 'failures',
    (select auth.uid())
  ) returning id into research_id;

  for source_record in select value from jsonb_array_elements(p_result -> 'sources') loop
    if source_record ->> 'topic' not in ('identity', 'news', 'sector', 'regulation', 'market')
      or source_record ->> 'provider' not in ('perplexity', 'openai', 'official', 'mcp')
      or coalesce(source_record ->> 'url', '') !~ '^https://'
      or coalesce(source_record ->> 'contentHash', '') !~ '^[0-9a-f]{64}$'
      or char_length(trim(coalesce(source_record ->> 'title', ''))) not between 1 and 500
      or char_length(coalesce(source_record ->> 'snippet', '')) > 8000 then
      raise exception 'invalid_public_research_source' using errcode = '22023';
    end if;
    insert into public.public_research_sources (
      organization_id, intake_session_id, research_run_id, topic, provider, title, url,
      snippet, published_at, retrieved_at, content_hash
    ) values (
      job_row.organization_id,
      job_row.intake_session_id,
      research_id,
      source_record ->> 'topic',
      source_record ->> 'provider',
      trim(source_record ->> 'title'),
      source_record ->> 'url',
      coalesce(source_record ->> 'snippet', ''),
      source_record ->> 'publishedAt',
      (source_record ->> 'retrievedAt')::timestamptz,
      source_record ->> 'contentHash'
    ) on conflict (organization_id, research_run_id, topic, url) do nothing;
  end loop;

  return research_id;
end;
$$;

create or replace function public.worker_record_public_research(
  p_job_id uuid,
  p_capability_token text,
  p_plan jsonb,
  p_result jsonb
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.worker_record_public_research(p_job_id, p_capability_token, p_plan, p_result);
$$;

revoke all on function private.worker_record_public_research(uuid, text, jsonb, jsonb)
  from public, anon;
revoke all on function public.worker_record_public_research(uuid, text, jsonb, jsonb)
  from public, anon;
grant execute on function private.worker_record_public_research(uuid, text, jsonb, jsonb)
  to authenticated;
grant execute on function public.worker_record_public_research(uuid, text, jsonb, jsonb)
  to authenticated;

comment on table public.public_research_runs is
  'Capability-written public research lineage. Queries contain public identity and sector terms only.';
comment on table public.public_research_sources is
  'Cited public context kept separate from company evidence, reconciled facts and mandate criteria.';

-- The conversational surface may propose a change, but it cannot apply one. Acceptance and
-- application are separate states so every domain mutation still passes through its own command.

create table public.agent_change_proposals (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  intake_session_id uuid not null,
  source_manifest_id uuid not null,
  base_manifest_fingerprint text not null check (base_manifest_fingerprint ~ '^[0-9a-f]{64}$'),
  proposal_fingerprint text not null check (proposal_fingerprint ~ '^[0-9a-f]{64}$'),
  target text not null check (target in (
    'company_profile', 'operation_brief', 'information_request', 'case_claim',
    'structure_alternative', 'material_section', 'market_shortlist'
  )),
  status text not null default 'proposed' check (status in (
    'proposed', 'accepted', 'rejected', 'applied', 'stale', 'reverted'
  )),
  title text not null check (char_length(trim(title)) between 3 and 180),
  rationale text not null check (char_length(trim(rationale)) between 10 and 2000),
  impact_summary text not null check (char_length(trim(impact_summary)) between 3 and 1000),
  proposal jsonb not null check (jsonb_typeof(proposal) = 'object'),
  proposed_by_kind text not null check (proposed_by_kind in ('user', 'offroad_agent', 'offroad_operator')),
  proposed_by uuid not null references auth.users(id) on delete restrict,
  proposed_at timestamptz not null,
  expires_at timestamptz not null check (expires_at > proposed_at),
  decided_by uuid references auth.users(id) on delete restrict,
  decided_at timestamptz,
  decision_reason text check (decision_reason is null or char_length(trim(decision_reason)) between 3 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, proposal_fingerprint),
  foreign key (organization_id, intake_session_id)
    references public.document_intake_sessions(organization_id, id) on delete cascade,
  foreign key (organization_id, source_manifest_id)
    references public.case_artifact_manifests(organization_id, id) on delete restrict,
  check (
    (status = 'proposed' and decided_by is null and decided_at is null)
    or (status <> 'proposed' and decided_by is not null and decided_at is not null)
  )
);

create index agent_change_proposals_session_status_idx
  on public.agent_change_proposals (organization_id, intake_session_id, status, proposed_at desc);

alter table public.agent_change_proposals enable row level security;
alter table public.agent_change_proposals force row level security;

create policy agent_change_proposals_select
  on public.agent_change_proposals for select to authenticated
  using ((select private.can_access_intake_session(organization_id, intake_session_id)));

create trigger agent_change_proposals_set_updated_at
  before update on public.agent_change_proposals
  for each row execute function private.set_updated_at();
create trigger agent_change_proposals_audit
  after insert or update or delete on public.agent_change_proposals
  for each row execute function private.capture_audit_event();

revoke all privileges on public.agent_change_proposals from anon, authenticated;
grant select on public.agent_change_proposals to authenticated;

create or replace function public.record_agent_change_proposal(
  p_organization_id uuid,
  p_session_id uuid,
  p_proposal jsonb
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
  proposal_id uuid;
  patch_record jsonb;
  evidence_record jsonb;
  recompute_stage text;
  proposed_at_value timestamptz;
  expires_at_value timestamptz;
begin
  if actor_id is null
    or not (select private.can_access_intake_session(p_organization_id, p_session_id)) then
    raise exception 'agent_proposal_access_denied' using errcode = '42501';
  end if;
  if jsonb_typeof(p_proposal) <> 'object'
    or p_proposal ->> 'schemaVersion' <> '2026.08.26-v1'
    or coalesce(p_proposal ->> 'caseId', '') <> p_session_id::text
    or coalesce(p_proposal ->> 'proposalFingerprint', '') !~ '^[0-9a-f]{64}$'
    or coalesce(p_proposal ->> 'baseManifestFingerprint', '') !~ '^[0-9a-f]{64}$'
    or coalesce(p_proposal ->> 'target', '') not in (
      'company_profile', 'operation_brief', 'information_request', 'case_claim',
      'structure_alternative', 'material_section', 'market_shortlist'
    )
    or coalesce(p_proposal ->> 'proposedBy', '') not in ('user', 'offroad_agent', 'offroad_operator')
    or char_length(trim(coalesce(p_proposal ->> 'title', ''))) not between 3 and 180
    or char_length(trim(coalesce(p_proposal ->> 'rationale', ''))) not between 10 and 2000
    or char_length(trim(coalesce(p_proposal ->> 'impactSummary', ''))) not between 3 and 1000
    or jsonb_typeof(coalesce(p_proposal -> 'patches', 'null'::jsonb)) <> 'array'
    or jsonb_array_length(p_proposal -> 'patches') not between 1 and 20
    or jsonb_typeof(coalesce(p_proposal -> 'evidence', 'null'::jsonb)) <> 'array'
    or jsonb_array_length(p_proposal -> 'evidence') not between 1 and 50
    or jsonb_typeof(coalesce(p_proposal -> 'recompute', 'null'::jsonb)) <> 'array'
    or jsonb_array_length(p_proposal -> 'recompute') > 10 then
    raise exception 'invalid_agent_change_proposal' using errcode = '22023';
  end if;

  for patch_record in select value from jsonb_array_elements(p_proposal -> 'patches') loop
    if jsonb_typeof(patch_record) <> 'object'
      or coalesce(patch_record ->> 'operation', '') not in ('set', 'append', 'remove', 'replace')
      or coalesce(patch_record ->> 'path', '') !~ '^/([^/~]|~0|~1)+(/([^/~]|~0|~1)+)*$'
      or (
        patch_record ? 'previousFingerprint'
        and patch_record -> 'previousFingerprint' <> 'null'::jsonb
        and coalesce(patch_record ->> 'previousFingerprint', '') !~ '^[0-9a-f]{64}$'
      )
      or (patch_record ->> 'operation' = 'remove' and patch_record ? 'value')
      or (patch_record ->> 'operation' <> 'remove' and not (patch_record ? 'value')) then
      raise exception 'invalid_agent_change_patch' using errcode = '22023';
    end if;
  end loop;

  for evidence_record in select value from jsonb_array_elements(p_proposal -> 'evidence') loop
    if jsonb_typeof(evidence_record) <> 'object'
      or coalesce(evidence_record ->> 'kind', '') not in (
        'document_anchor', 'reconciled_fact', 'calculation', 'public_source',
        'procedure', 'mandate_criterion'
      )
      or char_length(trim(coalesce(evidence_record ->> 'id', ''))) not between 1 and 300
      or (
        evidence_record ? 'fingerprint'
        and coalesce(evidence_record ->> 'fingerprint', '') !~ '^[0-9a-f]{64}$'
      ) then
      raise exception 'invalid_agent_change_evidence' using errcode = '22023';
    end if;
  end loop;

  for recompute_stage in select value from jsonb_array_elements_text(p_proposal -> 'recompute') loop
    if recompute_stage not in (
      'reconciliation', 'metrics', 'gaps', 'structure', 'red_flags', 'claims',
      'materials', 'language_conduct', 'matching', 'outcome'
    ) then
      raise exception 'invalid_agent_recompute_stage' using errcode = '22023';
    end if;
  end loop;

  select * into session_row
  from public.document_intake_sessions session
  where session.organization_id = p_organization_id and session.id = p_session_id
  for share;
  if not found then raise exception 'intake_session_not_found' using errcode = 'P0002'; end if;
  if session_row.result_summary #>> '{case_manifest,fingerprint}'
    <> p_proposal ->> 'baseManifestFingerprint' then
    raise exception 'agent_proposal_stale_manifest' using errcode = '40001';
  end if;
  begin
    manifest_id := (session_row.result_summary #>> '{case_manifest,id}')::uuid;
    proposal_id := (p_proposal ->> 'id')::uuid;
    proposed_at_value := (p_proposal ->> 'proposedAt')::timestamptz;
    expires_at_value := (p_proposal ->> 'expiresAt')::timestamptz;
  exception when invalid_text_representation or datetime_field_overflow then
    raise exception 'invalid_agent_change_proposal_id' using errcode = '22023';
  end;
  if expires_at_value <= proposed_at_value then
    raise exception 'invalid_agent_change_proposal_expiry' using errcode = '22023';
  end if;

  insert into public.agent_change_proposals (
    id, organization_id, intake_session_id, source_manifest_id, base_manifest_fingerprint,
    proposal_fingerprint, target, title, rationale, impact_summary, proposal,
    proposed_by_kind, proposed_by, proposed_at, expires_at
  ) values (
    proposal_id,
    p_organization_id,
    p_session_id,
    manifest_id,
    p_proposal ->> 'baseManifestFingerprint',
    p_proposal ->> 'proposalFingerprint',
    p_proposal ->> 'target',
    p_proposal ->> 'title',
    p_proposal ->> 'rationale',
    p_proposal ->> 'impactSummary',
    p_proposal,
    p_proposal ->> 'proposedBy',
    actor_id,
    proposed_at_value,
    expires_at_value
  ) on conflict (organization_id, proposal_fingerprint) do nothing
  returning id into proposal_id;

  if proposal_id is null then
    select stored.id into proposal_id
    from public.agent_change_proposals stored
    where stored.organization_id = p_organization_id
      and stored.proposal_fingerprint = p_proposal ->> 'proposalFingerprint'
      and stored.proposal = p_proposal;
    if proposal_id is null then
      raise exception 'agent_proposal_fingerprint_collision' using errcode = '23505';
    end if;
  end if;

  return proposal_id;
end;
$$;

create or replace function public.decide_agent_change_proposal(
  p_organization_id uuid,
  p_proposal_id uuid,
  p_decision text,
  p_reason text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  proposal_row public.agent_change_proposals;
begin
  if p_decision not in ('accepted', 'rejected')
    or char_length(trim(coalesce(p_reason, ''))) not between 3 and 1000 then
    raise exception 'invalid_agent_proposal_decision' using errcode = '22023';
  end if;
  select * into proposal_row
  from public.agent_change_proposals proposal
  where proposal.organization_id = p_organization_id and proposal.id = p_proposal_id
  for update;
  if not found then raise exception 'agent_proposal_not_found' using errcode = 'P0002'; end if;
  if actor_id is null
    or not (select private.can_access_intake_session(proposal_row.organization_id, proposal_row.intake_session_id)) then
    raise exception 'agent_proposal_access_denied' using errcode = '42501';
  end if;
  if proposal_row.status <> 'proposed' then
    raise exception 'agent_proposal_already_decided' using errcode = '55000';
  end if;
  if proposal_row.expires_at <= now() then
    update public.agent_change_proposals
    set status = 'stale', decided_by = actor_id, decided_at = now(), decision_reason = 'proposal_expired'
    where organization_id = p_organization_id and id = p_proposal_id;
    return 'stale';
  end if;
  update public.agent_change_proposals
  set status = p_decision, decided_by = actor_id, decided_at = now(), decision_reason = trim(p_reason)
  where organization_id = p_organization_id and id = p_proposal_id;
  return p_decision;
end;
$$;

revoke all on function public.record_agent_change_proposal(uuid, uuid, jsonb) from public, anon;
revoke all on function public.decide_agent_change_proposal(uuid, uuid, text, text) from public, anon;
grant execute on function public.record_agent_change_proposal(uuid, uuid, jsonb) to authenticated;
grant execute on function public.decide_agent_change_proposal(uuid, uuid, text, text) to authenticated;

comment on table public.agent_change_proposals is
  'Typed, snapshot-bound impact previews. Acceptance never applies the underlying domain mutation.';
