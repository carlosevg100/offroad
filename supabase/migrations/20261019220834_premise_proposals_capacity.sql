-- Premise proposals for the capacity analysis (ficha C04). The capacity keeps its own working
-- context ('capacidade'), so its premises never share the 256-premise basis of the comparison or of
-- the investment analysis. A proposal still never adopts, never calculates and never grants.

alter table public.work_premise_proposals drop constraint work_premise_proposals_method_id_check;
alter table public.work_premise_proposals add constraint work_premise_proposals_method_id_check
  check (method_id in ('analyze-investment-project', 'compare-financing-proposals', 'assess-debt-capacity'));
alter table public.work_premise_proposals drop constraint work_premise_proposals_context_key_check;
alter table public.work_premise_proposals add constraint work_premise_proposals_context_key_check
  check ((method_id = 'analyze-investment-project' and context_key = 'investimento')
    or (method_id = 'compare-financing-proposals' and context_key = 'propostas')
    or (method_id = 'assess-debt-capacity' and context_key = 'capacidade'));

-- The turn's reply and its premise proposal in one transaction. Each method writes only its own field
-- paths into its own context; the proposal is keyed on the source message, so a retried job never
-- duplicates it, and an earlier open proposal of the same method is superseded.
create or replace function private.worker_record_agent_response_with_premises_v1(p_job_id uuid, p_capability_token text, p_assistant_message_id uuid, p_response jsonb, p_premises jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare job_row public.processing_jobs; session_row public.document_intake_sessions; result jsonb; source uuid; h jsonb; ctx text; prefix text;
begin
  result := private.worker_record_agent_response_and_activate_v7(p_job_id, p_capability_token, null, p_assistant_message_id, p_response);
  job_row := private.job_for_capability(p_job_id, p_capability_token);
  if job_row.kind <> 'agent_operation_brief' then raise exception 'agent_operation_brief_capability_required' using errcode = '42501'; end if;
  if p_premises is null or jsonb_typeof(p_premises) <> 'object' or octet_length(p_premises::text) > 1048576
    or p_premises - array['methodId', 'methodVersion', 'facts', 'hypotheses', 'summary', 'fingerprint'] <> '{}'::jsonb
    or not (p_premises ?& array['methodId', 'methodVersion', 'facts', 'hypotheses', 'summary', 'fingerprint'])
    or jsonb_typeof(p_premises -> 'hypotheses') <> 'array' then raise exception 'invalid_premise_proposal' using errcode = '22023'; end if;
  ctx := case p_premises ->> 'methodId' when 'analyze-investment-project' then 'investimento' when 'compare-financing-proposals' then 'propostas' when 'assess-debt-capacity' then 'capacidade' end;
  prefix := case p_premises ->> 'methodId' when 'analyze-investment-project' then 'investment' when 'compare-financing-proposals' then 'comparison' when 'assess-debt-capacity' then 'debt_capacity' end;
  if ctx is null then raise exception 'invalid_premise_proposal' using errcode = '22023'; end if;
  for h in select value from jsonb_array_elements(p_premises -> 'hypotheses') loop
    if jsonb_typeof(h) <> 'object' or h - array['fieldPath', 'dimensions', 'value', 'reason'] <> '{}'::jsonb
      or not (h ?& array['fieldPath', 'dimensions', 'value', 'reason']) or jsonb_typeof(h -> 'fieldPath') <> 'string'
      or (h ->> 'fieldPath') !~ ('^' || prefix || '\.[0-9a-f-]{36}\.[A-Za-z0-9_.-]{1,200}$')
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
    p_premises ->> 'methodId', p_premises ->> 'methodVersion', 'prepare-capital-structure-decision', ctx,
    p_premises -> 'facts', p_premises -> 'hypotheses', p_premises -> 'summary', p_premises ->> 'fingerprint')
  on conflict (organization_id, source_message_id, method_id) do nothing;
  return result;
end $$;
