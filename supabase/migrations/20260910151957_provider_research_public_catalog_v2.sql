-- Versioned public research pin plus unchanged tenant-owned evidence. No directory/mandate writes.
-- Old plans and v1 receipts remain valid; an approved v2 request cannot drift to a newer catalog.
create function private.provider_research_public_catalog_pin_v2() returns jsonb
language sql immutable set search_path='' as $$ select '{"schemaVersion":"offroad.public-capital-research.v1","snapshotId":"br-capital-2026-09-10.v1","sourceFingerprint":"f158ac09fc2a44a77d608cc57a1fbb074f7de8b88d558ce9d29bff917429f235","asOf":"2026-09-10"}'::jsonb; $$;
create function private.provider_research_plan_v2() returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_set(jsonb_set(private.provider_research_plan_v1(), '{registryVersion}',
  '"2026.09.10-public-research-v2"'), '{job,inputPolicy,publicResearch}', '"allowed"');
$$;
revoke all on function private.provider_research_public_catalog_pin_v2(),private.provider_research_plan_v2() from public,anon,authenticated;

-- Extend only the exact research graph admission; preserve all prior documentary/case-fit guards.
do $migration$
declare signature text; definition text; needle text:='p_snapshot=private.provider_research_plan_v1()';
begin
 foreach signature in array array['private.record_capital_project_plan(uuid,jsonb)','private.record_execution_proposal_plan_as_actor(uuid,jsonb,uuid)'] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  if position(needle in definition)=0 then raise exception 'provider_public_plan_admission_drift'; end if;
  execute replace(definition,needle,'(p_snapshot=private.provider_research_plan_v1() or p_snapshot=private.provider_research_plan_v2())');
 end loop;
end;
$migration$;

create or replace function private.start_provider_research_project_v1(
  p_request_id uuid,p_locale text,p_project_name text,p_prompt text,p_plan jsonb,p_group_id uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  result jsonb; project public.capital_projects; session public.document_intake_sessions;
  plan public.capital_project_plans; existing public.capital_project_briefs; j public.processing_jobs;
  brief_id uuid:=gen_random_uuid(); run_id uuid:=gen_random_uuid(); job_id uuid:=gen_random_uuid();
  reference_time timestamptz:=now(); sources jsonb; content jsonb; original public.agent_messages;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if p_plan is distinct from private.provider_research_plan_v1() and p_plan is distinct from private.provider_research_plan_v2() then
    raise exception 'provider_research_plan_invalid' using errcode='22023';
  end if;
  result:=private.start_advisor_project_in_group_v1(p_request_id,p_locale,p_project_name,
    'company_debt_view',p_prompt,'public_information',p_plan,p_group_id);
  select * into project from public.capital_projects where id=(result->>'capital_project_id')::uuid;
  if not private.can_access_capital_project(project.organization_id,project.id) then
    raise exception 'provider_research_project_denied' using errcode='42501'; end if;
  select * into session from public.document_intake_sessions where organization_id=project.organization_id
    and id=(result->>'intake_session_id')::uuid for update;
  perform 1 from public.capital_projects where id=project.id for update;
  select * into original from public.agent_messages where organization_id=project.organization_id and id=p_request_id;
  if original.content is distinct from trim(p_prompt) or original.locale is distinct from p_locale
    or original.created_by is distinct from auth.uid() then
    raise exception 'provider_research_request_replay_conflict' using errcode='22023'; end if;
  select * into plan from public.capital_project_plans where organization_id=project.organization_id
    and capital_project_id=project.id and status='active';
  if not found or plan.snapshot is distinct from p_plan then
    raise exception 'provider_research_plan_stale' using errcode='40001'; end if;
  select * into existing from public.capital_project_briefs where organization_id=project.organization_id
    and capital_project_id=project.id and request_id=p_request_id and brief_kind='provider_research';
  if found then
    select * into j from public.processing_jobs where organization_id=project.organization_id
      and intake_session_id=session.id and payload->>'capital_project_brief_id'=existing.id::text
      and payload->>'analysis_scope'='provider_research';
    if not found then raise exception 'provider_research_dispatch_missing' using errcode='40001'; end if;
    return result||jsonb_build_object('research_job_id',j.id,'replayed',true);
  end if;
  sources:=private.provider_research_owned_sources_v1(project.organization_id,reference_time);
  if jsonb_array_length(sources)>500 or exists(select 1 from jsonb_array_elements(sources) provider,
    lateral jsonb_array_elements(provider->'observations') observation where length(observation->>'value')>2000) then
    raise exception 'provider_research_source_limit' using errcode='54000'; end if;
  content:=jsonb_build_object('schemaVersion','provider-research-context.v1','organizationId',project.organization_id,
    'projectId',project.id,'planId',plan.id,'planFingerprint',plan.plan_fingerprint,
    'objective',trim(p_prompt),'locale',p_locale,'asOf',reference_time,'providers',sources,
    'tasks','[{"id":"M01","dependencies":[]},{"id":"K01","dependencies":["M01"]},{"id":"K02","dependencies":["K01"]}]'::jsonb);
  if p_plan=private.provider_research_plan_v2() then
    content:=content||jsonb_build_object('schemaVersion','provider-research-context.v2',
      'publicCatalog',private.provider_research_public_catalog_pin_v2());
  end if;
  insert into public.capital_project_briefs(id,organization_id,capital_project_id,request_id,brief_kind,
    brief_version,status,content,content_fingerprint,created_by)
    values(brief_id,project.organization_id,project.id,p_request_id,'provider_research',1,'active',content,
      encode(extensions.digest(convert_to(content::text,'utf8'),'sha256'),'hex'),auth.uid());
  insert into public.processing_runs(id,organization_id,intake_session_id,run_no,trigger,status,pipeline_version,budget,versions,created_by)
    values(run_id,project.organization_id,session.id,1,'manual','queued',case when p_plan=private.provider_research_plan_v2() then 'provider-research-2026.09.10-v2' else 'provider-research-2026.09.10-v1' end,
      '{"maxCalls":0,"maxCostUsd":0,"externalSearchMaxUsd":0}'::jsonb,
      jsonb_build_object('planId',plan.id,'briefId',brief_id,'executor','provider_research'),auth.uid());
  insert into public.processing_jobs(id,organization_id,processing_run_id,intake_session_id,kind,payload,max_attempts)
    values(job_id,project.organization_id,run_id,session.id,'capital_project_analysis',jsonb_build_object(
      'analysis_scope','provider_research','locale',p_locale,'capital_project_id',project.id,
      'capital_project_plan_id',plan.id,'capital_project_brief_id',brief_id,
      'capital_task_ids','["M01","K01","K02"]'::jsonb,'capital_artifact_required',true,
      'trigger_event',jsonb_build_object('type','provider_research_request','sourceMessageId',p_request_id),
      'model_budget','{"max_cost_usd":0,"max_calls":0}'::jsonb),2);
  -- Queue trigger holds the research pending explicit approval and prepares a visible plan.
  if (select status from public.processing_jobs where id=job_id)<>'awaiting_approval' then
    raise exception 'provider_research_approval_hold_missing' using errcode='42501'; end if;
  update public.agent_messages set content=case p_locale when 'en-US' then
    case when p_plan=private.provider_research_plan_v2() then 'I will show a plan to research the dated public catalog and your authorized provider records. Review its scope before starting.' else 'I will show a plan to research the provider records available to your organization. Review its scope before starting.' end
    else case when p_plan=private.provider_research_plan_v2() then 'Vou apresentar o plano para pesquisar o catálogo público datado e os registros autorizados da sua organização. Revise o escopo antes de iniciar.' else 'Vou apresentar o plano para pesquisar os registros de financiadores disponíveis para sua organização. Revise o escopo antes de iniciar.' end end
    where organization_id=project.organization_id and conversation_id=original.conversation_id
      and role='assistant' and reply_to_message_id=p_request_id;
  return result||jsonb_build_object('research_job_id',job_id);
end;
$$;

create or replace function private.worker_load_provider_research_context(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token);
  p public.capital_project_plans; b public.capital_project_briefs; prior jsonb; v2 boolean;
begin
  if j.kind<>'capital_project_analysis' or j.payload->>'analysis_scope'<>'provider_research'
    or j.payload->'capital_task_ids' is distinct from '["M01","K01","K02"]'::jsonb
    or j.payload->'model_budget' is distinct from '{"max_cost_usd":0,"max_calls":0}'::jsonb
    or j.payload ? 'revision_of_artifact_id' then
    raise exception 'provider_research_capability_required' using errcode='42501'; end if;
  select * into p from public.capital_project_plans where organization_id=j.organization_id
    and id=(j.payload->>'capital_project_plan_id')::uuid and capital_project_id=(j.payload->>'capital_project_id')::uuid
    and status='active' and snapshot in (private.provider_research_plan_v1(),private.provider_research_plan_v2());
  if not found then raise exception 'provider_research_plan_stale' using errcode='40001'; end if;
  select * into b from public.capital_project_briefs where organization_id=j.organization_id
    and id=(j.payload->>'capital_project_brief_id')::uuid and capital_project_id=p.capital_project_id
    and brief_kind='provider_research' and status='active';
  if not found or b.content->>'organizationId' is distinct from j.organization_id::text
    or b.content->>'planId' is distinct from p.id::text or b.content->>'planFingerprint' is distinct from p.plan_fingerprint
    or b.content_fingerprint is distinct from encode(extensions.digest(convert_to(b.content::text,'utf8'),'sha256'),'hex') then
    raise exception 'provider_research_snapshot_invalid' using errcode='42501'; end if;
  v2:=p.snapshot=private.provider_research_plan_v2();
  if (v2 and (b.content->>'schemaVersion' is distinct from 'provider-research-context.v2'
      or b.content->'publicCatalog' is distinct from private.provider_research_public_catalog_pin_v2()))
    or (not v2 and (b.content->>'schemaVersion' is distinct from 'provider-research-context.v1' or b.content ? 'publicCatalog')) then
    raise exception 'provider_research_public_catalog_unbound' using errcode='42501';
  end if;
  -- A historical authorized copy remains project evidence; starting/resuming execution still requires current source ownership.
  if exists(select 1 from jsonb_array_elements(b.content->'providers') source where
    source->>'ownerOrganizationId' is distinct from j.organization_id::text or not (
      (source->>'sourceClass'='registered' and exists(select 1 from public.funds f
        where f.id=(source->>'providerId')::uuid and f.organization_id=j.organization_id))
      or (source->>'sourceClass'='directory' and exists(select 1 from public.fund_directory d
        where d.id=(source->>'providerId')::uuid and d.claimed_by_organization_id=j.organization_id))
    )) then raise exception 'provider_research_source_authorization_changed' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('taskId',t.task_id,'id',a.id,
    'artifactFingerprint',a.artifact_fingerprint,'inputFingerprint',a.input_fingerprint,'content',a.content) order by t.ordinal),'[]'::jsonb)
    into prior from public.capital_project_task_runs r
    join public.capital_project_plan_tasks t on t.organization_id=r.organization_id and t.id=r.plan_task_id
    join public.capital_project_artifacts a on a.organization_id=r.organization_id and a.task_run_id=r.id
    where r.organization_id=j.organization_id and r.processing_job_id=j.id and r.plan_id=p.id and r.status='succeeded'
      and a.plan_id=p.id and a.status not in ('stale','superseded')
      and a.artifact_type=case t.task_id when 'M01' then 'provider_research_scope' when 'K01' then 'provider_research_sources' when 'K02' then 'provider_research' end
      and r.output_reference->>'id'=a.id::text and r.output_fingerprint=a.artifact_fingerprint
      and r.input_fingerprint=a.input_fingerprint and r.executor_key='provider_research' and r.executor_version=case when v2 then '2026.09.10-v2' else '2026.09.10-v1' end
      and (not v2 or a.content->'publicCatalog'=b.content->'publicCatalog');
  return b.content||jsonb_build_object('approvalStatus','approved','priorArtifacts',prior);
end;
$$;

create or replace function private.guard_provider_research_completion_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare plan_snapshot jsonb; frozen_context jsonb; v2 boolean;
begin
  if old.kind<>'capital_project_analysis' or old.payload->>'analysis_scope'<>'provider_research'
    or new.status<>'succeeded' or old.status='succeeded' then return new; end if;
  select p.snapshot,b.content into plan_snapshot,frozen_context
    from public.capital_project_plans p join public.capital_project_briefs b
      on b.organization_id=p.organization_id and b.capital_project_id=p.capital_project_id
      and b.id=(new.payload->>'capital_project_brief_id')::uuid and b.brief_kind='provider_research'
    where p.organization_id=new.organization_id and p.id=(new.payload->>'capital_project_plan_id')::uuid
      and p.capital_project_id=(new.payload->>'capital_project_id')::uuid;
  v2:=coalesce(plan_snapshot=private.provider_research_plan_v2(),false);
  if v2 and (frozen_context->>'schemaVersion' is distinct from 'provider-research-context.v2'
    or frozen_context->'publicCatalog' is distinct from private.provider_research_public_catalog_pin_v2()) then
    raise exception 'provider_research_public_catalog_unbound' using errcode='42501';
  end if;
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
      and a.id::text=new.result->>'provider_research_artifact_id'
      and a.artifact_fingerprint=new.result->>'artifact_fingerprint'
      and a.artifact_type='provider_research' and a.schema_version=case when v2 then 'provider-research.v2' else 'provider-research.v1' end
      and a.status not in ('stale','superseded') and t.task_id='K02' and r.status='succeeded'
      and r.executor_key='provider_research' and r.executor_version=case when v2 then '2026.09.10-v2' else '2026.09.10-v1' end
      and (not v2 or (a.content->'publicCatalog'=frozen_context->'publicCatalog' and a.content->>'schemaVersion'='provider-research.v2'))
      and r.output_reference->>'id'=a.id::text and r.output_fingerprint=a.artifact_fingerprint
      and r.input_fingerprint=a.input_fingerprint
      and a.content->>'scope'='research_only' and a.content->'shortlistAuthorized'='false'::jsonb
      and a.content->'externalEffectAllowed'='false'::jsonb
  ) then raise exception 'provider_research_completion_invalid' using errcode='42501'; end if;
  return new;
end;
$$;

-- Bind the actual Execution Brief approval to the frozen research context, not merely to
-- the time at which that context was inserted. Existing v1/session hashes stay byte-identical.
do $migration$
declare definition text; needle text:='FUNCTION private.execution_approval_input_fingerprint(';
begin
 definition:=pg_get_functiondef('private.execution_approval_input_fingerprint(uuid,uuid)'::regprocedure);
 if position(needle in definition)=0 then raise exception 'provider_public_approval_fingerprint_drift'; end if;
 execute replace(definition,needle,'FUNCTION private.execution_approval_input_fingerprint_before_public_catalog(');
end;
$migration$;
revoke all on function private.execution_approval_input_fingerprint_before_public_catalog(uuid,uuid) from public,anon,authenticated;
create or replace function private.execution_approval_input_fingerprint(p_organization_id uuid,p_session_id uuid)
returns text language plpgsql stable security definer set search_path='' as $$
declare previous text; research jsonb;
begin
 previous:=private.execution_approval_input_fingerprint_before_public_catalog(p_organization_id,p_session_id);
 select jsonb_agg(jsonb_build_object('briefId',b.id,'storedFingerprint',b.content_fingerprint,
   'computedFingerprint',encode(extensions.digest(convert_to(b.content::text,'utf8'),'sha256'),'hex'),
   'publicCatalog',b.content->'publicCatalog') order by b.id) into research
 from public.document_intake_sessions s
 join public.capital_project_briefs b on b.organization_id=s.organization_id and b.capital_project_id=s.capital_project_id
 where s.organization_id=p_organization_id and s.id=p_session_id and b.brief_kind='provider_research'
   and b.status='active' and b.content->>'schemaVersion'='provider-research-context.v2';
 if research is null then return previous; end if;
 return encode(extensions.digest(convert_to(jsonb_build_object('previous',previous,'providerResearchV2',research)::text,'utf8'),'sha256'),'hex');
end;
$$;
revoke all on function private.execution_approval_input_fingerprint_before_public_catalog(uuid,uuid),
 private.execution_approval_input_fingerprint(uuid,uuid) from public,anon,authenticated;
