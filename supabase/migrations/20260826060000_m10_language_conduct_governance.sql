-- M10 governs language, conflicts, confidentiality and external communication. It does not
-- approve credit, waive deterministic controls or extend the product beyond qualified introduction.

create table public.conduct_policies (
  id uuid primary key default gen_random_uuid(),
  version text not null unique check (length(trim(version)) between 3 and 120),
  status text not null default 'draft' check (status in ('draft', 'active', 'superseded', 'invalidated')),
  disclaimer_id text not null check (length(trim(disclaimer_id)) between 10 and 200),
  valid_from date not null,
  valid_until date,
  rules jsonb not null default '{}'::jsonb check (jsonb_typeof(rules) = 'object'),
  methodology_source text not null check (length(trim(methodology_source)) between 10 and 500),
  approved_by uuid references auth.users (id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_until is null or valid_until >= valid_from),
  check (status <> 'active' or (approved_by is not null and approved_at is not null))
);
create unique index conduct_policies_one_active_idx on public.conduct_policies (status) where status = 'active';
create index conduct_policies_approved_by_fk_idx on public.conduct_policies (approved_by);
create trigger conduct_policies_set_updated_at before update on public.conduct_policies
  for each row execute function private.set_updated_at();

create table public.engagement_conflict_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  intake_session_id uuid not null,
  case_fingerprint text not null check (case_fingerprint ~ '^[0-9a-f]{64}$'),
  status text not null check (status in ('clear', 'disclosed_accepted', 'unresolved')),
  counterparties jsonb not null default '[]'::jsonb check (jsonb_typeof(counterparties) = 'array'),
  rationale text not null check (length(trim(rationale)) between 20 and 2000),
  reviewed_by uuid not null references auth.users (id),
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, intake_session_id, case_fingerprint),
  foreign key (organization_id, intake_session_id)
    references public.document_intake_sessions (organization_id, id) on delete cascade
);
create index engagement_conflict_reviews_session_idx on public.engagement_conflict_reviews
  (organization_id, intake_session_id, reviewed_at desc);
create index engagement_conflict_reviews_reviewed_by_fk_idx on public.engagement_conflict_reviews (reviewed_by);

create table public.material_communication_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  intake_session_id uuid not null,
  package_fingerprint text not null check (package_fingerprint ~ '^[0-9a-f]{64}$'),
  recipient_id text not null check (length(trim(recipient_id)) between 2 and 320),
  channel text not null check (channel in ('email', 'meeting', 'phone', 'platform')),
  content_fingerprint text not null check (content_fingerprint ~ '^[0-9a-f]{64}$'),
  has_material_commitment boolean not null default false,
  recorded_by uuid not null references auth.users (id),
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, intake_session_id, package_fingerprint, recipient_id, content_fingerprint),
  foreign key (organization_id, intake_session_id)
    references public.document_intake_sessions (organization_id, id) on delete cascade
);
create index material_communication_records_session_idx on public.material_communication_records
  (organization_id, intake_session_id, recorded_at desc);
create index material_communication_records_recorded_by_fk_idx on public.material_communication_records (recorded_by);

create table public.diligence_surprises (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  intake_session_id uuid not null,
  description text not null check (length(trim(description)) between 20 and 2000),
  responsible_procedure_id text check (responsible_procedure_id is null or responsible_procedure_id ~ '^[A-Z]{1,3}-[0-9]{2}$'),
  corrective_action_id text check (corrective_action_id is null or length(trim(corrective_action_id)) between 3 and 200),
  reported_by uuid not null references auth.users (id),
  reported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, intake_session_id)
    references public.document_intake_sessions (organization_id, id) on delete cascade
);
create index diligence_surprises_session_idx on public.diligence_surprises
  (organization_id, intake_session_id, reported_at desc);
create index diligence_surprises_reported_by_fk_idx on public.diligence_surprises (reported_by);

do $$
declare table_name text;
begin
  foreach table_name in array array['conduct_policies','engagement_conflict_reviews','material_communication_records','diligence_surprises'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('revoke all on public.%I from public, anon, authenticated', table_name);
  end loop;
end $$;
create policy conduct_policies_service_only on public.conduct_policies for all to authenticated using (false) with check (false);
create policy engagement_conflict_reviews_select on public.engagement_conflict_reviews for select to authenticated
  using ((select private.can_access_intake_session(organization_id, intake_session_id)));
create policy material_communication_records_select on public.material_communication_records for select to authenticated
  using ((select private.can_access_intake_session(organization_id, intake_session_id)));
create policy diligence_surprises_select on public.diligence_surprises for select to authenticated
  using ((select private.can_access_intake_session(organization_id, intake_session_id)));
grant select on public.engagement_conflict_reviews, public.material_communication_records, public.diligence_surprises to authenticated;
grant select, insert, update, delete on public.conduct_policies, public.engagement_conflict_reviews, public.material_communication_records, public.diligence_surprises to service_role;

create trigger engagement_conflict_reviews_audit after insert or update or delete on public.engagement_conflict_reviews
  for each row execute function private.capture_audit_event();
create trigger material_communication_records_audit after insert or update or delete on public.material_communication_records
  for each row execute function private.capture_audit_event();
create trigger diligence_surprises_audit after insert or update or delete on public.diligence_surprises
  for each row execute function private.capture_audit_event();

create function private.review_engagement_conflict(
  p_organization_id uuid, p_intake_session_id uuid, p_case_fingerprint text,
  p_status text, p_counterparties jsonb, p_rationale text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare result_id uuid;
begin
  if not (select private.can_access_intake_session(p_organization_id, p_intake_session_id)) then raise exception 'conflict_review_forbidden' using errcode='42501'; end if;
  if not exists (select 1 from public.organization_memberships m where m.organization_id=p_organization_id and m.user_id=(select auth.uid()) and m.status='active' and m.role in ('owner','admin','compliance')) then raise exception 'conflict_reviewer_role_required' using errcode='42501'; end if;
  insert into public.engagement_conflict_reviews (organization_id,intake_session_id,case_fingerprint,status,counterparties,rationale,reviewed_by)
  values (p_organization_id,p_intake_session_id,p_case_fingerprint,p_status,p_counterparties,p_rationale,(select auth.uid())) returning id into result_id;
  return result_id;
end $$;

create function private.record_material_communication(
  p_organization_id uuid, p_intake_session_id uuid, p_package_fingerprint text,
  p_recipient_id text, p_channel text, p_content_fingerprint text, p_has_material_commitment boolean default false
) returns uuid language plpgsql security definer set search_path = '' as $$
declare result_id uuid;
begin
  if not (select private.can_access_intake_session(p_organization_id,p_intake_session_id)) then raise exception 'material_communication_forbidden' using errcode='42501'; end if;
  if not exists (select 1 from public.organization_memberships m where m.organization_id=p_organization_id and m.user_id=(select auth.uid()) and m.status='active' and m.role in ('owner','admin','relationship_manager','compliance')) then raise exception 'material_communicator_role_required' using errcode='42501'; end if;
  insert into public.material_communication_records (organization_id,intake_session_id,package_fingerprint,recipient_id,channel,content_fingerprint,has_material_commitment,recorded_by)
  values (p_organization_id,p_intake_session_id,p_package_fingerprint,p_recipient_id,p_channel,p_content_fingerprint,p_has_material_commitment,(select auth.uid())) returning id into result_id;
  return result_id;
end $$;

create function private.record_diligence_surprise(
  p_organization_id uuid, p_intake_session_id uuid, p_description text,
  p_responsible_procedure_id text default null, p_corrective_action_id text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare result_id uuid;
begin
  if not (select private.can_access_intake_session(p_organization_id,p_intake_session_id)) then raise exception 'diligence_surprise_forbidden' using errcode='42501'; end if;
  if not exists (select 1 from public.organization_memberships m where m.organization_id=p_organization_id and m.user_id=(select auth.uid()) and m.status='active' and m.role in ('owner','admin','analyst','compliance','relationship_manager')) then raise exception 'diligence_surprise_role_required' using errcode='42501'; end if;
  insert into public.diligence_surprises (organization_id,intake_session_id,description,responsible_procedure_id,corrective_action_id,reported_by)
  values (p_organization_id,p_intake_session_id,p_description,p_responsible_procedure_id,p_corrective_action_id,(select auth.uid())) returning id into result_id;
  return result_id;
end $$;

create function public.review_engagement_conflict(p_organization_id uuid,p_intake_session_id uuid,p_case_fingerprint text,p_status text,p_counterparties jsonb,p_rationale text)
returns uuid language sql security invoker set search_path='' as $$ select private.review_engagement_conflict(p_organization_id,p_intake_session_id,p_case_fingerprint,p_status,p_counterparties,p_rationale); $$;
create function public.record_material_communication(p_organization_id uuid,p_intake_session_id uuid,p_package_fingerprint text,p_recipient_id text,p_channel text,p_content_fingerprint text,p_has_material_commitment boolean default false)
returns uuid language sql security invoker set search_path='' as $$ select private.record_material_communication(p_organization_id,p_intake_session_id,p_package_fingerprint,p_recipient_id,p_channel,p_content_fingerprint,p_has_material_commitment); $$;
create function public.record_diligence_surprise(p_organization_id uuid,p_intake_session_id uuid,p_description text,p_responsible_procedure_id text default null,p_corrective_action_id text default null)
returns uuid language sql security invoker set search_path='' as $$ select private.record_diligence_surprise(p_organization_id,p_intake_session_id,p_description,p_responsible_procedure_id,p_corrective_action_id); $$;

revoke all on function private.review_engagement_conflict(uuid,uuid,text,text,jsonb,text), private.record_material_communication(uuid,uuid,text,text,text,text,boolean), private.record_diligence_surprise(uuid,uuid,text,text,text) from public,anon;
revoke all on function public.review_engagement_conflict(uuid,uuid,text,text,jsonb,text), public.record_material_communication(uuid,uuid,text,text,text,text,boolean), public.record_diligence_surprise(uuid,uuid,text,text,text) from public,anon;
grant execute on function private.review_engagement_conflict(uuid,uuid,text,text,jsonb,text), private.record_material_communication(uuid,uuid,text,text,text,text,boolean), private.record_diligence_surprise(uuid,uuid,text,text,text) to authenticated;
grant execute on function public.review_engagement_conflict(uuid,uuid,text,text,jsonb,text), public.record_material_communication(uuid,uuid,text,text,text,text,boolean), public.record_diligence_surprise(uuid,uuid,text,text,text) to authenticated;

create function private.worker_load_conduct_context(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job_row public.processing_jobs := private.job_for_capability(p_job_id,p_capability_token); policy public.conduct_policies; conflict public.engagement_conflict_reviews; surprises jsonb;
begin
  if job_row.kind <> 'case_analysis' then raise exception 'case_analysis_capability_required' using errcode='42501'; end if;
  select * into policy from public.conduct_policies p where p.status in ('active','invalidated') and p.valid_from<=current_date and (p.valid_until is null or p.valid_until>=current_date) order by p.valid_from desc limit 1;
  select * into conflict from public.engagement_conflict_reviews c where c.organization_id=job_row.organization_id and c.intake_session_id=job_row.intake_session_id order by c.reviewed_at desc,c.id desc limit 1;
  select coalesce(jsonb_agg(jsonb_build_object('id',s.id::text,'description',s.description,'responsibleProcedureId',s.responsible_procedure_id,'correctiveActionId',s.corrective_action_id) order by s.reported_at),'[]'::jsonb) into surprises from public.diligence_surprises s where s.organization_id=job_row.organization_id and s.intake_session_id=job_row.intake_session_id;
  return jsonb_build_object('organizationId',job_row.organization_id::text,'policy',case when policy.id is null then null else jsonb_build_object('version',policy.version,'status',policy.status,'disclaimerId',policy.disclaimer_id,'validFrom',policy.valid_from,'validUntil',policy.valid_until) end,'conflictReview',case when conflict.id is null then null else jsonb_build_object('caseFingerprint',conflict.case_fingerprint,'status',conflict.status,'reviewedBy',conflict.reviewed_by::text,'reviewedAt',conflict.reviewed_at) end,'diligenceSurprises',surprises);
end $$;

create or replace function public.worker_load_case_input(p_job_id uuid,p_capability_token text)
returns jsonb language sql security invoker set search_path='' as $$
  select private.worker_load_case_input(p_job_id,p_capability_token)
    || jsonb_build_object('pricing_context',private.worker_load_pricing_context(p_job_id,p_capability_token))
    || jsonb_build_object('market_distribution_context',private.worker_load_market_distribution_context(p_job_id,p_capability_token))
    || jsonb_build_object('red_flag_context',private.worker_load_red_flag_context(p_job_id,p_capability_token))
    || jsonb_build_object('conduct_context',private.worker_load_conduct_context(p_job_id,p_capability_token));
$$;
revoke all on function private.worker_load_conduct_context(uuid,text), public.worker_load_case_input(uuid,text) from public,anon;
grant execute on function private.worker_load_conduct_context(uuid,text), public.worker_load_case_input(uuid,text) to authenticated;
