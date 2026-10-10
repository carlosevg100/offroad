-- Premise proposals: the worker proposes the premises of a governed calculation from the turn,
-- the person confirms them, and only the confirmation writes the working basis, as that person.
-- A proposal never adopts, never calculates and never grants execution.

create table public.work_premise_proposals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  capital_project_id uuid not null,
  intake_session_id uuid not null,
  source_message_id uuid not null,
  assistant_message_id uuid not null,
  method_id text not null check (method_id in ('analyze-investment-project')),
  method_version text not null check (method_version ~ '^\d{4}\.\d{2}\.\d{2}-v\d+$'),
  purpose text not null check (purpose = 'prepare-capital-structure-decision'),
  context_key text not null check (context_key = 'investimento'),
  facts jsonb not null check (jsonb_typeof(facts) = 'object'),
  hypotheses jsonb not null check (jsonb_typeof(hypotheses) = 'array' and jsonb_array_length(hypotheses) between 1 and 256),
  summary jsonb not null check (jsonb_typeof(summary) = 'object'),
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  status text not null default 'proposed' check (status in ('proposed', 'confirmed', 'superseded')),
  confirmed_version_id uuid,
  confirmed_by uuid references auth.users(id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, source_message_id, method_id),
  foreign key (organization_id, capital_project_id) references public.capital_projects(organization_id, id) on delete cascade,
  check ((status = 'confirmed') = (confirmed_version_id is not null and confirmed_by is not null and confirmed_at is not null))
);
create index work_premise_proposals_work_idx on public.work_premise_proposals (organization_id, capital_project_id, status, created_at desc);

alter table public.work_premise_proposals enable row level security;
alter table public.work_premise_proposals force row level security;
create policy work_premise_proposals_select on public.work_premise_proposals for select to authenticated
  using ((select private.can_access_capital_project(organization_id, capital_project_id)));
create policy work_premise_proposals_insert on public.work_premise_proposals for insert to authenticated with check (false);
create policy work_premise_proposals_update on public.work_premise_proposals for update to authenticated using (false) with check (false);
create policy work_premise_proposals_delete on public.work_premise_proposals for delete to authenticated using (false);
revoke all privileges on public.work_premise_proposals from public, anon, authenticated;
grant select on public.work_premise_proposals to authenticated;
create trigger work_premise_proposals_set_updated_at before update on public.work_premise_proposals
  for each row execute function private.set_updated_at();
create trigger work_premise_proposals_audit after insert or update or delete on public.work_premise_proposals
  for each row execute function private.capture_audit_event();
comment on table public.work_premise_proposals is
  'Premises the worker proposes for a governed calculation; only a person''s confirmation writes them to the working basis.';

-- Reviewed document candidates of the turn's session that can carry project facts. The worker
-- reads them with the job capability; values keep their source anchor and review state.
create function private.worker_load_premise_evidence_v1(p_job_id uuid, p_capability_token text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
begin
  if job_row.kind <> 'agent_operation_brief' then raise exception 'agent_operation_brief_capability_required' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'fieldPath', c.field_path, 'group', c.field_group, 'label', c.label, 'value', c.normalized_value, 'valueType', c.value_type,
      'unit', c.unit, 'currency', c.currency, 'periodStart', c.period_start, 'periodEnd', c.period_end,
      'informationClass', c.information_class, 'reviewState', c.review_state, 'confidence', c.confidence,
      'document', d.original_name) order by c.field_group, c.field_path)
    from (select * from public.intake_field_candidates
      where organization_id = job_row.organization_id and intake_session_id = job_row.intake_session_id
        and field_group in ('project', 'projections', 'transaction', 'historical_financials', 'interim_financials')
        and review_state in ('proposed', 'accepted', 'edited')
      order by evidence_rank, confidence desc limit 400) c
    left join public.source_documents d on d.organization_id = c.organization_id and d.id = c.source_document_id), '[]'::jsonb);
end $$;
create function public.worker_load_premise_evidence_v1(p_job_id uuid, p_capability_token text)
returns jsonb language sql stable security invoker set search_path = '' as $$ select private.worker_load_premise_evidence_v1(p_job_id, p_capability_token); $$;

-- The turn's reply and its premise proposal in one transaction. The proposal is keyed on the source
-- message, so a retried job never duplicates it; an earlier open proposal of the same method is superseded.
create function private.worker_record_agent_response_with_premises_v1(p_job_id uuid, p_capability_token text, p_assistant_message_id uuid, p_response jsonb, p_premises jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare job_row public.processing_jobs; session_row public.document_intake_sessions; result jsonb; source uuid; h jsonb;
begin
  result := private.worker_record_agent_response_and_activate_v7(p_job_id, p_capability_token, null, p_assistant_message_id, p_response);
  job_row := private.job_for_capability(p_job_id, p_capability_token);
  if job_row.kind <> 'agent_operation_brief' then raise exception 'agent_operation_brief_capability_required' using errcode = '42501'; end if;
  if p_premises is null or jsonb_typeof(p_premises) <> 'object' or octet_length(p_premises::text) > 1048576
    or p_premises - array['methodId', 'methodVersion', 'facts', 'hypotheses', 'summary', 'fingerprint'] <> '{}'::jsonb
    or not (p_premises ?& array['methodId', 'methodVersion', 'facts', 'hypotheses', 'summary', 'fingerprint'])
    or jsonb_typeof(p_premises -> 'hypotheses') <> 'array' then raise exception 'invalid_premise_proposal' using errcode = '22023'; end if;
  for h in select value from jsonb_array_elements(p_premises -> 'hypotheses') loop
    if jsonb_typeof(h) <> 'object' or h - array['fieldPath', 'dimensions', 'value', 'reason'] <> '{}'::jsonb
      or not (h ?& array['fieldPath', 'dimensions', 'value', 'reason']) or jsonb_typeof(h -> 'fieldPath') <> 'string'
      or (h ->> 'fieldPath') !~ '^investment\.[0-9a-f-]{36}\.[A-Za-z0-9_.]{1,200}$'
      or jsonb_typeof(h -> 'dimensions') <> 'object' or jsonb_typeof(h -> 'value') <> 'object' or jsonb_typeof(h -> 'reason') <> 'string'
    then raise exception 'invalid_premise_hypothesis' using errcode = '22023'; end if;
  end loop;
  select * into session_row from public.document_intake_sessions where organization_id = job_row.organization_id and id = job_row.intake_session_id;
  source := (job_row.payload ->> 'message_id')::uuid;
  update public.work_premise_proposals set status = 'superseded'
    where organization_id = job_row.organization_id and capital_project_id = session_row.capital_project_id
      and method_id = p_premises ->> 'methodId' and status = 'proposed' and source_message_id <> source;
  insert into public.work_premise_proposals (organization_id, capital_project_id, intake_session_id, source_message_id, assistant_message_id,
    method_id, method_version, purpose, context_key, facts, hypotheses, summary, fingerprint)
  values (job_row.organization_id, session_row.capital_project_id, session_row.id, source, p_assistant_message_id,
    p_premises ->> 'methodId', p_premises ->> 'methodVersion', 'prepare-capital-structure-decision', 'investimento',
    p_premises -> 'facts', p_premises -> 'hypotheses', p_premises -> 'summary', p_premises ->> 'fingerprint')
  on conflict (organization_id, source_message_id, method_id) do nothing;
  return result;
end $$;
create function public.worker_record_agent_response_with_premises_v1(p_job_id uuid, p_capability_token text, p_assistant_message_id uuid, p_response jsonb, p_premises jsonb)
returns jsonb language sql volatile security invoker set search_path = '' as $$ select private.worker_record_agent_response_with_premises_v1(p_job_id, p_capability_token, p_assistant_message_id, p_response, p_premises); $$;

-- The person confirms: every proposed hypothesis is written to the working basis as that person,
-- in order and in one transaction, with the entity and definition the person's workspace chose.
-- A confirmed proposal returns its version again; a superseded or changed one is refused.
create function private.confirm_work_premise_proposal_v1(p_proposal_id uuid, p_expected_fingerprint text, p_entity_id uuid, p_definition_version_id uuid)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare p public.work_premise_proposals; h jsonb; prior uuid; latest uuid; s public.assumption_sets;
begin
  select * into p from public.work_premise_proposals where id = p_proposal_id for update;
  if p.id is null or not private.can_access_capital_project(p.organization_id, p.capital_project_id) then raise exception 'premise_proposal_access_denied' using errcode = '42501'; end if;
  perform private.require_resource_access_v1(p.capital_project_id, 'work');
  if p.status = 'confirmed' then
    if p.confirmed_by is distinct from auth.uid() or p.fingerprint <> p_expected_fingerprint then raise exception 'premise_proposal_already_confirmed' using errcode = '40001'; end if;
    return p.confirmed_version_id;
  end if;
  if p.status <> 'proposed' or p.fingerprint <> p_expected_fingerprint then raise exception 'premise_proposal_changed' using errcode = '40001'; end if;
  select * into s from public.assumption_sets where organization_id = p.organization_id and work_reference = p.capital_project_id and purpose = p.purpose and context_key = p.context_key;
  if s.id is not null then
    select id into prior from public.assumption_versions where organization_id = p.organization_id and set_id = s.id order by revision desc limit 1;
  end if;
  for h in select value from jsonb_array_elements(p.hypotheses) loop
    latest := private.write_contextual_adoption_v1(jsonb_build_object(
      'requestId', gen_random_uuid(), 'workId', p.capital_project_id, 'purpose', p.purpose, 'contextKey', p.context_key,
      'expectedVersionId', prior, 'reason', h ->> 'reason', 'fieldPath', h ->> 'fieldPath',
      'dimensions', (h -> 'dimensions') || jsonb_build_object('entityId', p_entity_id, 'definitionVersionId', p_definition_version_id),
      'value', h -> 'value', 'referenceObservationId', null), 'hypothesis');
    prior := latest;
  end loop;
  update public.work_premise_proposals set status = 'confirmed', confirmed_version_id = latest, confirmed_by = auth.uid(), confirmed_at = now()
    where organization_id = p.organization_id and id = p.id;
  return latest;
end $$;
create function public.confirm_work_premise_proposal_v1(p_proposal_id uuid, p_expected_fingerprint text, p_entity_id uuid, p_definition_version_id uuid)
returns uuid language sql volatile security invoker set search_path = '' as $$ select private.confirm_work_premise_proposal_v1(p_proposal_id, p_expected_fingerprint, p_entity_id, p_definition_version_id); $$;

revoke all on function private.worker_load_premise_evidence_v1(uuid, text), public.worker_load_premise_evidence_v1(uuid, text),
  private.worker_record_agent_response_with_premises_v1(uuid, text, uuid, jsonb, jsonb), public.worker_record_agent_response_with_premises_v1(uuid, text, uuid, jsonb, jsonb),
  private.confirm_work_premise_proposal_v1(uuid, text, uuid, uuid), public.confirm_work_premise_proposal_v1(uuid, text, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.worker_load_premise_evidence_v1(uuid, text), public.worker_load_premise_evidence_v1(uuid, text),
  private.worker_record_agent_response_with_premises_v1(uuid, text, uuid, jsonb, jsonb), public.worker_record_agent_response_with_premises_v1(uuid, text, uuid, jsonb, jsonb),
  private.confirm_work_premise_proposal_v1(uuid, text, uuid, uuid), public.confirm_work_premise_proposal_v1(uuid, text, uuid, uuid)
  to authenticated;
