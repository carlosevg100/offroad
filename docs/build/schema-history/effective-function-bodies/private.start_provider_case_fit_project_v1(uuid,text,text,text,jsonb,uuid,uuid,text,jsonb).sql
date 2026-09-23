CREATE OR REPLACE FUNCTION private.start_provider_case_fit_project_v1(p_request_id uuid, p_locale text, p_project_name text, p_prompt text, p_plan jsonb, p_group_id uuid DEFAULT NULL::uuid, p_project_id uuid DEFAULT NULL::uuid, p_expected_plan_fingerprint text DEFAULT NULL::text, p_case_criteria jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  result jsonb; project public.capital_projects; session public.document_intake_sessions;
  plan public.capital_project_plans; existing public.capital_project_briefs; j public.processing_jobs;
  brief_id uuid:=gen_random_uuid(); run_id uuid:=gen_random_uuid(); job_id uuid:=gen_random_uuid();
  reference_time timestamptz:=now(); sources jsonb; content jsonb; original public.agent_messages; conversation_id uuid; parent_plan public.capital_project_plans; next_run integer;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if p_plan is distinct from private.provider_case_fit_plan_v1(p_plan#>>'{job,id}') then
    raise exception 'provider_case_fit_plan_invalid' using errcode='22023';
  end if;
  if p_request_id is null or p_locale not in ('pt-BR','en-US') or char_length(trim(p_prompt)) not between 2 and 8000
    or coalesce(jsonb_typeof(p_case_criteria),'null')<>'object'
    or p_case_criteria->>'schemaVersion' is distinct from 'provider-case-criteria.v1'
    or p_case_criteria#>>'{source,kind}' is distinct from 'user_confirmed'
    or p_case_criteria#>>'{source,referenceId}' is distinct from p_request_id::text
    or coalesce(p_case_criteria->>'currency','') not in ('BRL','USD','EUR')
    or p_case_criteria->>'asOf' is null or (p_case_criteria->>'asOf')::timestamptz>now()
    or exists(select 1 from jsonb_object_keys(p_case_criteria)key where key not in ('schemaVersion','asOf','currency','amount','termMonths','sector','geography','instruments','collateral','leverage','dscr','source','mandateMaxAgeMonths'))
  then raise exception 'provider_case_criteria_invalid' using errcode='22023'; end if;
  perform private.validate_provider_case_criteria_v1(p_case_criteria);
  reference_time:=(p_case_criteria->>'asOf')::timestamptz;
  if p_project_id is null then
   if p_plan#>>'{job,id}' is distinct from 'company_debt_view' then raise exception 'case_fit_new_entry_invalid'; end if;
   result:=private.start_advisor_project_in_group_v1(p_request_id,p_locale,p_project_name,'company_debt_view',p_prompt,'public_information',p_plan,p_group_id);
  else
   select * into project from public.capital_projects where id=p_project_id for update;
   if not found or not private.can_access_capital_project(project.organization_id,project.id) then raise exception 'case_fit_project_denied' using errcode='42501'; end if;
   if p_plan#>>'{job,id}' is distinct from project.entry_job then raise exception 'case_fit_entry_mismatch'; end if;
   perform private.assert_capital_project_review_action(project.organization_id,project.id,'prepare');
   select * into session from public.document_intake_sessions where organization_id=project.organization_id and capital_project_id=project.id order by created_at desc,id desc limit 1 for update;
   if not found then
    select * into original from public.agent_messages where id=p_request_id;
    if found and original.metadata ? 'caseCriteria' and original.metadata->'caseCriteria' is distinct from p_case_criteria then raise exception 'case_fit_criteria_replay_conflict' using errcode='22023'; end if;
    result:=private.append_work_turn_v1(project.id,p_request_id,p_locale,p_prompt);
    update public.agent_messages set metadata=metadata||jsonb_build_object('caseCriteria',p_case_criteria)
      where organization_id=project.organization_id and work_id=project.id and id=p_request_id;
    return result||jsonb_build_object('capital_project_id',project.id,'intake_session_id',null,'executionState','conversation_only');
   end if;
   select id into conversation_id from public.agent_conversations where organization_id=project.organization_id and intake_session_id=session.id order by created_at desc,id desc limit 1;
   if conversation_id is null then raise exception 'case_fit_conversation_missing'; end if;
   select * into original from public.agent_messages where id=p_request_id;
   if found then
    if original.organization_id<>project.organization_id or original.intake_session_id<>session.id or original.created_by<>auth.uid() then raise exception 'case_fit_replay_forbidden' using errcode='42501'; end if;
    if original.metadata->>'parentPlanFingerprint' is distinct from p_expected_plan_fingerprint then raise exception 'case_fit_parent_replay_mismatch' using errcode='40001'; end if;
   else
    select * into parent_plan from public.capital_project_plans where organization_id=project.organization_id and capital_project_id=project.id and status='active';
    if parent_plan.plan_fingerprint is distinct from p_expected_plan_fingerprint or p_expected_plan_fingerprint is null then raise exception 'case_fit_parent_plan_stale' using errcode='40001'; end if;
    if exists(select 1 from public.processing_jobs where organization_id=project.organization_id and intake_session_id=session.id and status in ('queued','leased','awaiting_approval')) then raise exception 'case_fit_project_work_in_progress' using errcode='40001'; end if;
    perform private.record_capital_project_plan(project.id,p_plan);
    insert into public.agent_messages(id,organization_id,conversation_id,intake_session_id,role,status,content,locale,metadata,created_by)
     values(p_request_id,project.organization_id,conversation_id,session.id,'user','completed',trim(p_prompt),p_locale,jsonb_build_object('kind','request','caseFit',true,'parentPlanFingerprint',p_expected_plan_fingerprint),auth.uid());
   end if;
   result:=jsonb_build_object('capital_project_id',project.id,'intake_session_id',session.id,'conversation_id',conversation_id,'message_id',p_request_id);
  end if;
  -- No documentary executor or fictional intake for a standalone conversation.
  if result->>'intake_session_id' is null then
   select * into strict original from public.agent_messages where id=p_request_id;
   if original.metadata ? 'caseCriteria' and original.metadata->'caseCriteria' is distinct from p_case_criteria then raise exception 'case_fit_criteria_replay_conflict' using errcode='22023'; end if;
   update public.agent_messages set metadata=metadata||jsonb_build_object('caseCriteria',p_case_criteria)
     where organization_id=original.organization_id and id=p_request_id;
   return result||private.enqueue_work_turn_v1((result->>'capital_project_id')::uuid,p_request_id)||jsonb_build_object('executionState','conversation_only');
  end if;
  select * into project from public.capital_projects where id=(result->>'capital_project_id')::uuid;
  if not private.can_access_capital_project(project.organization_id,project.id) then
    raise exception 'provider_case_fit_project_denied' using errcode='42501'; end if;
  select * into session from public.document_intake_sessions where organization_id=project.organization_id
    and id=(result->>'intake_session_id')::uuid for update;
  perform 1 from public.capital_projects where id=project.id for update;
  select * into original from public.agent_messages where organization_id=project.organization_id and id=p_request_id;
  if original.content is distinct from trim(p_prompt) or original.locale is distinct from p_locale
    or original.created_by is distinct from auth.uid() then
    raise exception 'provider_case_fit_request_replay_conflict' using errcode='22023'; end if;
  select * into plan from public.capital_project_plans where organization_id=project.organization_id
    and capital_project_id=project.id and status='active';
  if not found or plan.snapshot is distinct from p_plan then
    raise exception 'provider_case_fit_plan_stale' using errcode='40001'; end if;
  select * into existing from public.capital_project_briefs where organization_id=project.organization_id
    and capital_project_id=project.id and request_id=p_request_id and brief_kind='provider_case_fit';
  if found then
    if existing.content->'caseCriteria' is distinct from p_case_criteria then raise exception 'case_fit_criteria_replay_conflict'; end if;
    select * into j from public.processing_jobs where organization_id=project.organization_id
      and intake_session_id=session.id and payload->>'capital_project_brief_id'=existing.id::text
      and payload->>'analysis_scope'='provider_case_fit';
    if not found then raise exception 'provider_case_fit_dispatch_missing' using errcode='40001'; end if;
    return result||jsonb_build_object('research_job_id',j.id,'replayed',true);
  end if;
  sources:=private.provider_case_fit_owned_sources_v1(project.organization_id,reference_time);
  if jsonb_array_length(sources)>500 or octet_length(sources::text)>2000000 then
    raise exception 'provider_case_fit_source_limit' using errcode='54000'; end if;
  content:=jsonb_build_object('schemaVersion','provider-case-fit-context.v1','organizationId',project.organization_id,
    'projectId',project.id,'planId',plan.id,'planFingerprint',plan.plan_fingerprint,
    'objective',trim(p_prompt),'locale',p_locale,'asOf',reference_time,'providers',sources,'caseCriteria',p_case_criteria,
    'tasks','[{"id":"M01","dependencies":[]},{"id":"K01","dependencies":["M01"]},{"id":"K02","dependencies":["K01"]}]'::jsonb);
  insert into public.capital_project_briefs(id,organization_id,capital_project_id,request_id,brief_kind,
    brief_version,status,content,content_fingerprint,created_by)
    values(brief_id,project.organization_id,project.id,p_request_id,'provider_case_fit',1,'active',content,
      encode(extensions.digest(convert_to(content::text,'utf8'),'sha256'),'hex'),auth.uid());
  select coalesce(max(run_no),0)+1 into next_run from public.processing_runs where organization_id=project.organization_id and intake_session_id=session.id;
  insert into public.processing_runs(id,organization_id,intake_session_id,run_no,trigger,status,pipeline_version,budget,versions,created_by)
    values(run_id,project.organization_id,session.id,next_run,'manual','queued','provider-case-fit-2026.09.10-v1',
      '{"maxCalls":0,"maxCostUsd":0,"externalSearchMaxUsd":0}'::jsonb,
      jsonb_build_object('planId',plan.id,'briefId',brief_id,'executor','provider_case_fit'),auth.uid());
  insert into public.processing_jobs(id,organization_id,processing_run_id,intake_session_id,kind,payload,max_attempts)
    values(job_id,project.organization_id,run_id,session.id,'capital_project_analysis',jsonb_build_object(
      'analysis_scope','provider_case_fit','locale',p_locale,'capital_project_id',project.id,
      'capital_project_plan_id',plan.id,'capital_project_brief_id',brief_id,
      'capital_task_ids','["M01","K01","K02"]'::jsonb,'capital_artifact_required',true,
      'trigger_event',jsonb_build_object('type','provider_case_fit_request','sourceMessageId',p_request_id),
      'model_budget','{"max_cost_usd":0,"max_calls":0}'::jsonb),2);
  -- Queue trigger holds the research pending explicit approval and prepares a visible plan.
  if (select status from public.processing_jobs where id=job_id)<>'awaiting_approval' then
    raise exception 'provider_case_fit_approval_hold_missing' using errcode='42501'; end if;
  update public.agent_messages target_message set content=case p_locale when 'en-US' then
    'I will compare your transaction criteria with authorized mandates and prepare a lender list for your review.'
    else 'Vou comparar os critérios do caso com os mandatos autorizados e preparar uma lista de financiadores para sua revisão.' end
    where target_message.organization_id=project.organization_id and target_message.conversation_id=original.conversation_id
      and role='assistant' and reply_to_message_id=p_request_id;
  return result||jsonb_build_object('research_job_id',job_id);
end;
$function$
