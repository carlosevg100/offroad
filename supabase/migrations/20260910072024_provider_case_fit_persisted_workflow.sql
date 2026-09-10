-- Explicit case-specific research inside the existing project. No disclosure or contact grant.
create function private.provider_case_fit_plan_v1(p_entry text) returns jsonb
language sql immutable set search_path='' as $fn$ select ($plans${"company_debt_view":{"schemaVersion":"capital-project-plan.v1","compilerVersion":"2026.09.01-v3","registryVersion":"2026.09.10-v14","job":{"id":"company_debt_view","targetTaskIds":["K02"],"firstWorkProduct":"provider_case_fit","confirmationGate":"diagnostic","accessPolicy":"public_or_private","inputPolicy":{"company":"not_applicable","documents":"not_applicable","capitalIntent":"required","existingTransaction":"not_applicable","publicResearch":"not_applicable"}},"taskSpecs":[{"id":"M01","label":"Resolver companhia, grupo, jurisdição e regime de evidência","graph":"case","dependencies":[],"executionClass":"extraction","effect":"propose_state","maturity":"specified","readingStrategies":["exhaustive_corpus"],"ordinal":0,"batch":0},{"id":"K01","label":"Atualizar universo de financiadores","graph":"market","dependencies":["M01"],"executionClass":"research","effect":"commit","maturity":"specified","readingStrategies":["exact_search","semantic_retrieval"],"ordinal":1,"batch":1},{"id":"K02","label":"Normalizar mandatos","graph":"market","dependencies":["K01"],"executionClass":"deterministic","effect":"commit","maturity":"specified","readingStrategies":["structured_query"],"ordinal":2,"batch":2}],"parallelBatches":[["M01"],["K01"],["K02"]]},"origination_thesis":{"schemaVersion":"capital-project-plan.v1","compilerVersion":"2026.09.01-v3","registryVersion":"2026.09.10-v14","job":{"id":"origination_thesis","targetTaskIds":["K02"],"firstWorkProduct":"provider_case_fit","confirmationGate":"preliminary_understanding","accessPolicy":"public_or_private","inputPolicy":{"company":"not_applicable","documents":"not_applicable","capitalIntent":"required","existingTransaction":"not_applicable","publicResearch":"not_applicable"}},"taskSpecs":[{"id":"M01","label":"Resolver companhia, grupo, jurisdição e regime de evidência","graph":"case","dependencies":[],"executionClass":"extraction","effect":"propose_state","maturity":"specified","readingStrategies":["exhaustive_corpus"],"ordinal":0,"batch":0},{"id":"K01","label":"Atualizar universo de financiadores","graph":"market","dependencies":["M01"],"executionClass":"research","effect":"commit","maturity":"specified","readingStrategies":["exact_search","semantic_retrieval"],"ordinal":1,"batch":1},{"id":"K02","label":"Normalizar mandatos","graph":"market","dependencies":["K01"],"executionClass":"deterministic","effect":"commit","maturity":"specified","readingStrategies":["structured_query"],"ordinal":2,"batch":2}],"parallelBatches":[["M01"],["K01"],["K02"]]},"capital_planning":{"schemaVersion":"capital-project-plan.v1","compilerVersion":"2026.09.01-v3","registryVersion":"2026.09.10-v14","job":{"id":"capital_planning","targetTaskIds":["K02"],"firstWorkProduct":"provider_case_fit","confirmationGate":"structure","accessPolicy":"public_or_private","inputPolicy":{"company":"not_applicable","documents":"not_applicable","capitalIntent":"required","existingTransaction":"not_applicable","publicResearch":"not_applicable"}},"taskSpecs":[{"id":"M01","label":"Resolver companhia, grupo, jurisdição e regime de evidência","graph":"case","dependencies":[],"executionClass":"extraction","effect":"propose_state","maturity":"specified","readingStrategies":["exhaustive_corpus"],"ordinal":0,"batch":0},{"id":"K01","label":"Atualizar universo de financiadores","graph":"market","dependencies":["M01"],"executionClass":"research","effect":"commit","maturity":"specified","readingStrategies":["exact_search","semantic_retrieval"],"ordinal":1,"batch":1},{"id":"K02","label":"Normalizar mandatos","graph":"market","dependencies":["K01"],"executionClass":"deterministic","effect":"commit","maturity":"specified","readingStrategies":["structured_query"],"ordinal":2,"batch":2}],"parallelBatches":[["M01"],["K01"],["K02"]]},"structure_from_documents":{"schemaVersion":"capital-project-plan.v1","compilerVersion":"2026.09.01-v3","registryVersion":"2026.09.10-v14","job":{"id":"structure_from_documents","targetTaskIds":["K02"],"firstWorkProduct":"provider_case_fit","confirmationGate":"structure","accessPolicy":"private_required","inputPolicy":{"company":"not_applicable","documents":"not_applicable","capitalIntent":"required","existingTransaction":"not_applicable","publicResearch":"not_applicable"}},"taskSpecs":[{"id":"M01","label":"Resolver companhia, grupo, jurisdição e regime de evidência","graph":"case","dependencies":[],"executionClass":"extraction","effect":"propose_state","maturity":"specified","readingStrategies":["exhaustive_corpus"],"ordinal":0,"batch":0},{"id":"K01","label":"Atualizar universo de financiadores","graph":"market","dependencies":["M01"],"executionClass":"research","effect":"commit","maturity":"specified","readingStrategies":["exact_search","semantic_retrieval"],"ordinal":1,"batch":1},{"id":"K02","label":"Normalizar mandatos","graph":"market","dependencies":["K01"],"executionClass":"deterministic","effect":"commit","maturity":"specified","readingStrategies":["structured_query"],"ordinal":2,"batch":2}],"parallelBatches":[["M01"],["K01"],["K02"]]},"review_existing_operation":{"schemaVersion":"capital-project-plan.v1","compilerVersion":"2026.09.01-v3","registryVersion":"2026.09.10-v14","job":{"id":"review_existing_operation","targetTaskIds":["K02"],"firstWorkProduct":"provider_case_fit","confirmationGate":"structure","accessPolicy":"private_required","inputPolicy":{"company":"not_applicable","documents":"not_applicable","capitalIntent":"required","existingTransaction":"not_applicable","publicResearch":"not_applicable"}},"taskSpecs":[{"id":"M01","label":"Resolver companhia, grupo, jurisdição e regime de evidência","graph":"case","dependencies":[],"executionClass":"extraction","effect":"propose_state","maturity":"specified","readingStrategies":["exhaustive_corpus"],"ordinal":0,"batch":0},{"id":"K01","label":"Atualizar universo de financiadores","graph":"market","dependencies":["M01"],"executionClass":"research","effect":"commit","maturity":"specified","readingStrategies":["exact_search","semantic_retrieval"],"ordinal":1,"batch":1},{"id":"K02","label":"Normalizar mandatos","graph":"market","dependencies":["K01"],"executionClass":"deterministic","effect":"commit","maturity":"specified","readingStrategies":["structured_query"],"ordinal":2,"batch":2}],"parallelBatches":[["M01"],["K01"],["K02"]]},"prepare_materials_and_process":{"schemaVersion":"capital-project-plan.v1","compilerVersion":"2026.09.01-v3","registryVersion":"2026.09.10-v14","job":{"id":"prepare_materials_and_process","targetTaskIds":["K02"],"firstWorkProduct":"provider_case_fit","confirmationGate":"production_plan","accessPolicy":"existing_project","inputPolicy":{"company":"not_applicable","documents":"not_applicable","capitalIntent":"required","existingTransaction":"not_applicable","publicResearch":"not_applicable"}},"taskSpecs":[{"id":"M01","label":"Resolver companhia, grupo, jurisdição e regime de evidência","graph":"case","dependencies":[],"executionClass":"extraction","effect":"propose_state","maturity":"specified","readingStrategies":["exhaustive_corpus"],"ordinal":0,"batch":0},{"id":"K01","label":"Atualizar universo de financiadores","graph":"market","dependencies":["M01"],"executionClass":"research","effect":"commit","maturity":"specified","readingStrategies":["exact_search","semantic_retrieval"],"ordinal":1,"batch":1},{"id":"K02","label":"Normalizar mandatos","graph":"market","dependencies":["K01"],"executionClass":"deterministic","effect":"commit","maturity":"specified","readingStrategies":["structured_query"],"ordinal":2,"batch":2}],"parallelBatches":[["M01"],["K01"],["K02"]]}}$plans$::jsonb)->p_entry; $fn$;
revoke all on function private.provider_case_fit_plan_v1(text) from public,anon,authenticated;
do $migration$
declare signature text; definition text; needle text;
begin
 foreach signature in array array['private.record_capital_project_plan(uuid,jsonb)','private.record_execution_proposal_plan_as_actor(uuid,jsonb,uuid)'] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  needle:='and p_snapshot=private.provider_research_plan_v1());';
  if position(needle in definition)=0 then raise exception 'case_fit_plan_admission_drift'; end if;
  execute replace(definition,needle,'and p_snapshot=private.provider_research_plan_v1()) or p_snapshot=private.provider_case_fit_plan_v1(project_row.entry_job);');
 end loop;
end $migration$;
alter table public.capital_project_briefs drop constraint capital_project_briefs_brief_kind_check;
alter table public.capital_project_briefs add constraint capital_project_briefs_brief_kind_check check(brief_kind in ('origination_thesis','company_debt_view','capital_planning','integration_preview','provider_research','provider_case_fit'));

-- Only canonical typed fields are projected; no notes, contacts, inferred appetite or global directory.
create function private.provider_case_fit_owned_sources_v1(p_org uuid,p_as_of timestamptz) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb:='[]'; r record; c jsonb; fields jsonb; k text; raw jsonb; value jsonb; obs jsonb; provenance text;
begin
 for r in select f.id,f.name,f.organization_id,m.id mandate_id,m.constraints,m.source_kind,m.valid_from
 from public.funds f left join lateral(select mv.* from public.mandate_versions mv where mv.organization_id=p_org and mv.fund_id=f.id
 and mv.status='active' and mv.created_at<=p_as_of and mv.valid_from<=p_as_of::date and (mv.valid_until is null or mv.valid_until>=p_as_of::date)
 order by mv.version_number desc limit 1)m on true where f.organization_id=p_org and f.status='active' and f.created_at<=p_as_of
 order by f.id loop
  c:=coalesce(r.constraints,'{}'::jsonb); fields:='{}';
  provenance:=case r.source_kind when 'declared' then 'declared' when 'public' then 'published' else 'inferred' end;
  foreach k in array array['ticket','termMonths','sectors','instruments','collateral','geographies','leverageCeiling','minimumDscr','active','currencies'] loop
   value:=null;
   if k='ticket' and c->>'ticket_min' ~ '^(0|[1-9][0-9]*)([.][0-9]+)?$' and c->>'ticket_max' ~ '^(0|[1-9][0-9]*)([.][0-9]+)?$' then value:=jsonb_build_object('min',c->>'ticket_min','max',c->>'ticket_max');
   elsif k='termMonths' and c->>'term_months_min' ~ '^[0-9]{1,4}$' and c->>'term_months_max' ~ '^[0-9]{1,4}$' then value:=jsonb_build_object('min',(c->>'term_months_min')::integer,'max',(c->>'term_months_max')::integer);
   elsif k in ('leverageCeiling','minimumDscr') then raw:=c->case k when 'leverageCeiling' then 'leverage_ceiling' else 'minimum_dscr' end;
    if raw#>>'{}' ~ '^(0|[1-9][0-9]*)([.][0-9]+)?$' then value:=to_jsonb(raw#>>'{}'); end if;
   elsif k='active' and jsonb_typeof(c->'active')='boolean' then value:=c->'active';
   elsif k in ('sectors','instruments','collateral','geographies','currencies') and jsonb_typeof(c->k)='array' and jsonb_array_length(c->k)>0
    and not exists(select 1 from jsonb_array_elements(c->k)a where jsonb_typeof(a)<>'string') then value:=c->k;
   end if;
   obs:=case when value is not null then jsonb_build_array(jsonb_build_object('value',value,'provenance',provenance,'observedAt',(r.valid_from::timestamp at time zone 'UTC'),'note','mandate_versions/'||r.mandate_id::text||'; source='||r.source_kind||'; valid_from')) else '[]'::jsonb end;
   fields:=fields||jsonb_build_object(k,obs);
  end loop;
  result:=result||jsonb_build_array(jsonb_build_object('providerId',r.id,'name',r.name,'ownerOrganizationId',p_org,'sourceClass','registered','mandate',fields));
 end loop;
 return result;
end $$;
revoke all on function private.provider_case_fit_owned_sources_v1(uuid,timestamptz) from public,anon,authenticated;
create function private.validate_provider_case_criteria_v1(c jsonb) returns void language plpgsql immutable set search_path='' as $$
declare k text; v jsonb;
begin
 if jsonb_typeof(c) is distinct from 'object' or jsonb_typeof(c->'source') is distinct from 'object' then raise exception 'case_criteria_shape_invalid' using errcode='22023'; end if;
 if (select count(*) from jsonb_object_keys(c->'source'))<>2 then raise exception 'case_criteria_source_invalid' using errcode='22023'; end if;
 foreach k in array array['amount','leverage','dscr'] loop
  if c ? k then
   if jsonb_typeof(c->k) is distinct from 'string' or coalesce(c->>k,'')!~'^(0|[1-9][0-9]{0,29})([.][0-9]{1,18})?$' then raise exception 'case_criteria_decimal_invalid' using errcode='22023'; end if;
  end if;
 end loop;
 foreach k in array array['termMonths','mandateMaxAgeMonths'] loop
  if c ? k then
   if jsonb_typeof(c->k) is distinct from 'number' or coalesce(c->>k,'')!~'^[1-9][0-9]{0,3}$' then raise exception 'case_criteria_integer_invalid' using errcode='22023'; end if;
   if (c->>k)::integer>(case k when 'termMonths' then 1200 else 120 end) then raise exception 'case_criteria_integer_range_invalid' using errcode='22023'; end if;
  end if;
 end loop;
 foreach k in array array['sector','geography'] loop
  if c ? k and (jsonb_typeof(c->k) is distinct from 'string' or char_length(trim(c->>k)) not between 1 and 200) then raise exception 'case_criteria_label_invalid' using errcode='22023'; end if;
 end loop;
 foreach k in array array['instruments','collateral'] loop
  if c ? k then
   if jsonb_typeof(c->k) is distinct from 'array' then raise exception 'case_criteria_list_invalid' using errcode='22023'; end if;
   if jsonb_array_length(c->k)<1 or jsonb_array_length(c->k)>(case k when 'collateral' then 9 else 10 end) then raise exception 'case_criteria_list_invalid' using errcode='22023'; end if;
   for v in select value from jsonb_array_elements(c->k) loop
    if jsonb_typeof(v) is distinct from 'string' or (k='instruments' and v#>>'{}' not in ('debenture','nota_comercial','ccb','cri','cra','fidc','direct_loan','receivables_purchase','project_finance','equity_kicker_debt'))
     or (k='collateral' and v#>>'{}' not in ('recebiveis','imovel','equipamento','estoque','aval_fianca','cessao_fiduciaria','alienacao_fiduciaria_quotas','conta_reserva','quirografario')) then raise exception 'case_criteria_enum_invalid' using errcode='22023'; end if;
   end loop;
  end if;
 end loop;
end $$;
revoke all on function private.validate_provider_case_criteria_v1(jsonb) from public,anon,authenticated;

create function private.start_provider_case_fit_project_v1(
  p_request_id uuid,p_locale text,p_project_name text,p_prompt text,p_plan jsonb,p_group_id uuid default null,p_project_id uuid default null,p_expected_plan_fingerprint text default null,p_case_criteria jsonb default null
) returns jsonb language plpgsql security definer set search_path='' as $$
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
   select * into session from public.document_intake_sessions where organization_id=project.organization_id and capital_project_id=project.id order by created_at desc,id desc limit 1 for update;
   if not found then raise exception 'case_fit_session_missing'; end if;
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
  update public.agent_messages set content=case p_locale when 'en-US' then
    'I will compare your transaction criteria with authorized mandates and prepare a lender list for your review.'
    else 'Vou comparar os critérios do caso com os mandatos autorizados e preparar uma lista de financiadores para sua revisão.' end
    where organization_id=project.organization_id and conversation_id=original.conversation_id
      and role='assistant' and reply_to_message_id=p_request_id;
  return result||jsonb_build_object('research_job_id',job_id);
end;
$$;
create function public.start_provider_case_fit_project_v1(
 p_request_id uuid,p_locale text,p_project_name text,p_prompt text,p_plan jsonb,p_group_id uuid default null,p_project_id uuid default null,p_expected_plan_fingerprint text default null,p_case_criteria jsonb default null
) returns jsonb language sql security invoker set search_path='' as $$
 select private.start_provider_case_fit_project_v1(p_request_id,p_locale,p_project_name,p_prompt,p_plan,p_group_id,p_project_id,p_expected_plan_fingerprint,p_case_criteria);
$$;
revoke all on function private.start_provider_case_fit_project_v1(uuid,text,text,text,jsonb,uuid,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.start_provider_case_fit_project_v1(uuid,text,text,text,jsonb,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function private.start_provider_case_fit_project_v1(uuid,text,text,text,jsonb,uuid,uuid,text,jsonb) to authenticated;
grant execute on function public.start_provider_case_fit_project_v1(uuid,text,text,text,jsonb,uuid,uuid,text,jsonb) to authenticated;

create function private.worker_load_provider_case_fit_context(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token);
  p public.capital_project_plans; b public.capital_project_briefs; prior jsonb;
begin
  if j.kind<>'capital_project_analysis' or j.payload->>'analysis_scope'<>'provider_case_fit'
    or j.payload->'capital_task_ids' is distinct from '["M01","K01","K02"]'::jsonb
    or j.payload->'model_budget' is distinct from '{"max_cost_usd":0,"max_calls":0}'::jsonb
    or j.payload ? 'revision_of_artifact_id' then
    raise exception 'provider_case_fit_capability_required' using errcode='42501'; end if;
  select * into p from public.capital_project_plans where organization_id=j.organization_id
    and id=(j.payload->>'capital_project_plan_id')::uuid and capital_project_id=(j.payload->>'capital_project_id')::uuid
    and status='active' and snapshot=private.provider_case_fit_plan_v1(snapshot#>>'{job,id}');
  if not found then raise exception 'provider_case_fit_plan_stale' using errcode='40001'; end if;
  select * into b from public.capital_project_briefs where organization_id=j.organization_id
    and id=(j.payload->>'capital_project_brief_id')::uuid and capital_project_id=p.capital_project_id
    and brief_kind='provider_case_fit' and status='active';
  if not found or b.content->>'organizationId' is distinct from j.organization_id::text
    or b.content->>'planId' is distinct from p.id::text or b.content->>'planFingerprint' is distinct from p.plan_fingerprint
    or b.content_fingerprint is distinct from encode(extensions.digest(convert_to(b.content::text,'utf8'),'sha256'),'hex') then
    raise exception 'provider_case_fit_snapshot_invalid' using errcode='42501'; end if;
  -- A historical authorized copy remains project evidence; starting/resuming execution still requires current source ownership.
  if exists(select 1 from jsonb_array_elements(b.content->'providers') source where
    source->>'ownerOrganizationId' is distinct from j.organization_id::text or not (
      (source->>'sourceClass'='registered' and exists(select 1 from public.funds f
        where f.id=(source->>'providerId')::uuid and f.organization_id=j.organization_id))
      or (source->>'sourceClass'='directory' and exists(select 1 from public.fund_directory d
        where d.id=(source->>'providerId')::uuid and d.claimed_by_organization_id=j.organization_id))
    )) then raise exception 'provider_case_fit_source_authorization_changed' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('taskId',t.task_id,'id',a.id,
    'artifactFingerprint',a.artifact_fingerprint,'inputFingerprint',a.input_fingerprint,'content',a.content) order by t.ordinal),'[]'::jsonb)
    into prior from public.capital_project_task_runs r
    join public.capital_project_plan_tasks t on t.organization_id=r.organization_id and t.id=r.plan_task_id
    join public.capital_project_artifacts a on a.organization_id=r.organization_id and a.task_run_id=r.id
    where r.organization_id=j.organization_id and r.processing_job_id=j.id and r.plan_id=p.id and r.status='succeeded'
      and a.plan_id=p.id and a.status not in ('stale','superseded')
      and a.artifact_type=case t.task_id when 'M01' then 'provider_case_fit_scope' when 'K01' then 'provider_case_fit_sources' when 'K02' then 'provider_case_fit' end
      and r.output_reference->>'id'=a.id::text and r.output_fingerprint=a.artifact_fingerprint
      and r.input_fingerprint=a.input_fingerprint and r.executor_key='provider_case_fit' and r.executor_version='2026.09.10-v1';
  return b.content||jsonb_build_object('approvalStatus','approved','priorArtifacts',prior);
end;
$$;
create function public.worker_load_provider_case_fit_context(p_job_id uuid,p_capability_token text)
returns jsonb language sql security invoker set search_path='' as $$
 select private.worker_load_provider_case_fit_context(p_job_id,p_capability_token);
$$;
revoke all on function private.worker_load_provider_case_fit_context(uuid,text) from public,anon,authenticated;
revoke all on function public.worker_load_provider_case_fit_context(uuid,text) from public,anon,authenticated;
grant execute on function private.worker_load_provider_case_fit_context(uuid,text) to authenticated;
grant execute on function public.worker_load_provider_case_fit_context(uuid,text) to authenticated;

-- A zero-call research job may finish only with all three tasks and its final research artifact.
create function private.guard_provider_case_fit_completion_v1() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if old.kind<>'capital_project_analysis' or old.payload->>'analysis_scope'<>'provider_case_fit'
    or new.status<>'succeeded' or old.status='succeeded' then return new; end if;
  if new.model_calls<>0 or new.model_cost_usd<>0 or exists(
    select 1 from public.capital_project_plan_tasks t where t.organization_id=new.organization_id
      and t.plan_id=(new.payload->>'capital_project_plan_id')::uuid and not exists(
        select 1 from public.capital_project_task_runs r where r.organization_id=t.organization_id
          and r.plan_task_id=t.id and r.processing_job_id=new.id and r.status='succeeded'
      )) or not exists(
    select 1 from public.capital_project_artifacts a
    join public.capital_project_task_runs r on r.organization_id=a.organization_id and r.id=a.task_run_id
    join public.capital_project_plan_tasks t on t.organization_id=r.organization_id and t.id=r.plan_task_id
    where a.organization_id=new.organization_id and a.processing_job_id=new.id
      and a.capital_project_id=(new.payload->>'capital_project_id')::uuid
      and a.plan_id=(new.payload->>'capital_project_plan_id')::uuid
      and a.id::text=new.result->>'provider_case_fit_artifact_id'
      and a.artifact_fingerprint=new.result->>'artifact_fingerprint'
      and a.artifact_type='provider_case_fit' and a.schema_version='provider-case-fit.v1'
      and a.status not in ('stale','superseded') and t.task_id='K02' and r.status='succeeded'
      and r.executor_key='provider_case_fit' and r.executor_version='2026.09.10-v1'
      and r.output_reference->>'id'=a.id::text and r.output_fingerprint=a.artifact_fingerprint
      and r.input_fingerprint=a.input_fingerprint
      and a.content->>'projectId'=a.capital_project_id::text and a.content->>'planId'=a.plan_id::text
      and exists(select 1 from public.capital_project_briefs b where b.organization_id=new.organization_id and b.id=(new.payload->>'capital_project_brief_id')::uuid and b.capital_project_id=a.capital_project_id and b.content->'caseCriteria'=a.content->'caseCriteria' and b.content->>'planFingerprint'=a.content->>'planFingerprint')
      and a.content->>'scope'='research_case_fit' and a.content->'shortlistAuthorized'='false'::jsonb
      and a.content->'externalEffectAllowed'='false'::jsonb
  ) then raise exception 'provider_case_fit_completion_invalid' using errcode='42501'; end if;
  return new;
end;
$$;
revoke all on function private.guard_provider_case_fit_completion_v1() from public,anon,authenticated;
create trigger provider_case_fit_completion_guard before update on public.processing_jobs
for each row execute function private.guard_provider_case_fit_completion_v1();

-- Bind the visible plan objective to this request, preserving earlier reader fences.
do $migration$
declare definition text:=pg_get_functiondef('private.worker_load_execution_brief_proposal_v3(uuid,text)'::regprocedure); needle text;
begin
 needle:='and m.role=''user'' and m.metadata->>''kind''=''request''';
 if position(needle in definition)=0 then raise exception 'case_fit_proposal_reader_drift'; end if;
 execute replace(definition,needle,needle||' and not exists(select 1 from public.processing_jobs target where target.organization_id=j.organization_id and target.id::text=base->>''target_job_id'' and target.payload->>''analysis_scope''=''provider_case_fit'' and m.id::text is distinct from target.payload#>>''{trigger_event,sourceMessageId}'')');
end $migration$;
