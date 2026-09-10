-- Bounded, tenant-owned provider research. No shortlist or external-effect authority.
create function private.provider_research_plan_v1() returns jsonb
language sql immutable set search_path='' as $plan$
  select $snapshot${
  "schemaVersion": "capital-project-plan.v1",
  "compilerVersion": "2026.09.01-v3",
  "registryVersion": "2026.09.10-v14",
  "job": {
    "id": "company_debt_view",
    "targetTaskIds": [
      "K02"
    ],
    "firstWorkProduct": "provider_research",
    "confirmationGate": "diagnostic",
    "accessPolicy": "public_or_private",
    "inputPolicy": {
      "company": "not_applicable",
      "documents": "not_applicable",
      "capitalIntent": "not_applicable",
      "existingTransaction": "not_applicable",
      "publicResearch": "not_applicable"
    }
  },
  "taskSpecs": [
    {
      "id": "M01",
      "label": "Resolver companhia, grupo, jurisdição e regime de evidência",
      "graph": "case",
      "dependencies": [],
      "executionClass": "extraction",
      "effect": "propose_state",
      "maturity": "specified",
      "readingStrategies": [
        "exhaustive_corpus"
      ],
      "ordinal": 0,
      "batch": 0
    },
    {
      "id": "K01",
      "label": "Atualizar universo de financiadores",
      "graph": "market",
      "dependencies": [
        "M01"
      ],
      "executionClass": "research",
      "effect": "commit",
      "maturity": "specified",
      "readingStrategies": [
        "exact_search",
        "semantic_retrieval"
      ],
      "ordinal": 1,
      "batch": 1
    },
    {
      "id": "K02",
      "label": "Normalizar mandatos",
      "graph": "market",
      "dependencies": [
        "K01"
      ],
      "executionClass": "deterministic",
      "effect": "commit",
      "maturity": "specified",
      "readingStrategies": [
        "structured_query"
      ],
      "ordinal": 2,
      "batch": 2
    }
  ],
  "parallelBatches": [
    [
      "M01"
    ],
    [
      "K01"
    ],
    [
      "K02"
    ]
  ]
}$snapshot$::jsonb;
$plan$;
revoke all on function private.provider_research_plan_v1() from public,anon,authenticated;

-- Exact additional graph admission; retain every existing actor, membership and target guard.
do $migration$
declare signature text; definition text; needle text;
begin
  foreach signature in array array['private.record_capital_project_plan(uuid,jsonb)',
    'private.record_execution_proposal_plan_as_actor(uuid,jsonb,uuid)'] loop
    definition := pg_get_functiondef(signature::regprocedure);
    needle := 'documentary := private.is_released_documentary_plan_v1(p_snapshot, project_row.entry_job);';
    if position(needle in definition)=0 then raise exception 'provider_research_plan_admission_drift'; end if;
    definition := replace(definition,needle,
      'documentary := private.is_released_documentary_plan_v1(p_snapshot, project_row.entry_job) or (project_row.entry_job=''company_debt_view'' and p_snapshot=private.provider_research_plan_v1());');
    execute definition;
  end loop;
end;
$migration$;

alter table public.capital_project_briefs drop constraint capital_project_briefs_brief_kind_check;
alter table public.capital_project_briefs add constraint capital_project_briefs_brief_kind_check
  check(brief_kind in ('origination_thesis','company_debt_view','capital_planning','integration_preview','provider_research'));

-- The owner filter is the data boundary. Never reuse the internal cross-tenant matching loader.
create function private.provider_research_owned_sources_v1(p_organization_id uuid,p_as_of timestamptz)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(provider order by provider->>'sourceClass',provider->>'providerId'),'[]'::jsonb)
  from (
    select jsonb_build_object('providerId',f.id,'name',f.name,'sourceClass','registered',
      'ownerOrganizationId',f.organization_id,'observations',coalesce((
        select jsonb_agg(jsonb_build_object('criterion',c.key,
          'value',case when jsonb_typeof(c.value)='string' then c.value#>>'{}' else c.value::text end,
          'provenance',case when m.source_kind='declared' then 'Declared mandate' when m.source_kind='public' then 'Public-source mandate' when m.source_kind='synthetic' then 'Synthetic mandate' else 'Recorded coverage observation' end,
          'observedAt',m.created_at) order by c.key)
        from jsonb_each(coalesce(m.constraints,'{}'::jsonb)) c
        where c.key in ('ticket','ticket_min','ticket_max','term_months','term_months_min','term_months_max','sectors','instruments','structure_types','collateral','geographies','leverage_ceiling','minimum_dscr')
      ),'[]'::jsonb)) provider
    from public.funds f
    left join lateral (select mv.* from public.mandate_versions mv
      where mv.organization_id=p_organization_id and mv.fund_id=f.id and mv.status='active'
        and mv.created_at<=p_as_of and mv.valid_from<=p_as_of::date
        and (mv.valid_until is null or mv.valid_until>=p_as_of::date)
      order by mv.version_number desc limit 1) m on true
    where f.organization_id=p_organization_id and f.status='active' and f.created_at<=p_as_of
    union all
    select jsonb_build_object('providerId',d.id,'name',coalesce(d.short_name,d.legal_name),
      'sourceClass','directory','ownerOrganizationId',d.claimed_by_organization_id,'observations','[]'::jsonb)
    from public.fund_directory d
    where d.claimed_by_organization_id=p_organization_id and d.claimed_at<=p_as_of and d.status='registered'
  ) owned;
$$;
revoke all on function private.provider_research_owned_sources_v1(uuid,timestamptz) from public,anon,authenticated;

create function private.start_provider_research_project_v1(
  p_request_id uuid,p_locale text,p_project_name text,p_prompt text,p_plan jsonb,p_group_id uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  result jsonb; project public.capital_projects; session public.document_intake_sessions;
  plan public.capital_project_plans; existing public.capital_project_briefs; j public.processing_jobs;
  brief_id uuid:=gen_random_uuid(); run_id uuid:=gen_random_uuid(); job_id uuid:=gen_random_uuid();
  reference_time timestamptz:=now(); sources jsonb; content jsonb; original public.agent_messages;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if p_plan is distinct from private.provider_research_plan_v1() then
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
  insert into public.capital_project_briefs(id,organization_id,capital_project_id,request_id,brief_kind,
    brief_version,status,content,content_fingerprint,created_by)
    values(brief_id,project.organization_id,project.id,p_request_id,'provider_research',1,'active',content,
      encode(extensions.digest(convert_to(content::text,'utf8'),'sha256'),'hex'),auth.uid());
  insert into public.processing_runs(id,organization_id,intake_session_id,run_no,trigger,status,pipeline_version,budget,versions,created_by)
    values(run_id,project.organization_id,session.id,1,'manual','queued','provider-research-2026.09.10-v1',
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
    'I will show a plan to research the provider records available to your organization. Review its scope before starting.'
    else 'Vou apresentar o plano para pesquisar os registros de financiadores disponíveis para sua organização. Revise o escopo antes de iniciar.' end
    where organization_id=project.organization_id and conversation_id=original.conversation_id
      and role='assistant' and reply_to_message_id=p_request_id;
  return result||jsonb_build_object('research_job_id',job_id);
end;
$$;
create function public.start_provider_research_project_v1(
 p_request_id uuid,p_locale text,p_project_name text,p_prompt text,p_plan jsonb,p_group_id uuid default null
) returns jsonb language sql security invoker set search_path='' as $$
 select private.start_provider_research_project_v1(p_request_id,p_locale,p_project_name,p_prompt,p_plan,p_group_id);
$$;
revoke all on function private.start_provider_research_project_v1(uuid,text,text,text,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.start_provider_research_project_v1(uuid,text,text,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function private.start_provider_research_project_v1(uuid,text,text,text,jsonb,uuid) to authenticated;
grant execute on function public.start_provider_research_project_v1(uuid,text,text,text,jsonb,uuid) to authenticated;

create function private.worker_load_provider_research_context(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token);
  p public.capital_project_plans; b public.capital_project_briefs; prior jsonb;
begin
  if j.kind<>'capital_project_analysis' or j.payload->>'analysis_scope'<>'provider_research'
    or j.payload->'capital_task_ids' is distinct from '["M01","K01","K02"]'::jsonb
    or j.payload->'model_budget' is distinct from '{"max_cost_usd":0,"max_calls":0}'::jsonb
    or j.payload ? 'revision_of_artifact_id' then
    raise exception 'provider_research_capability_required' using errcode='42501'; end if;
  select * into p from public.capital_project_plans where organization_id=j.organization_id
    and id=(j.payload->>'capital_project_plan_id')::uuid and capital_project_id=(j.payload->>'capital_project_id')::uuid
    and status='active' and snapshot=private.provider_research_plan_v1();
  if not found then raise exception 'provider_research_plan_stale' using errcode='40001'; end if;
  select * into b from public.capital_project_briefs where organization_id=j.organization_id
    and id=(j.payload->>'capital_project_brief_id')::uuid and capital_project_id=p.capital_project_id
    and brief_kind='provider_research' and status='active';
  if not found or b.content->>'organizationId' is distinct from j.organization_id::text
    or b.content->>'planId' is distinct from p.id::text or b.content->>'planFingerprint' is distinct from p.plan_fingerprint
    or b.content_fingerprint is distinct from encode(extensions.digest(convert_to(b.content::text,'utf8'),'sha256'),'hex') then
    raise exception 'provider_research_snapshot_invalid' using errcode='42501'; end if;
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
      and r.input_fingerprint=a.input_fingerprint and r.executor_key='provider_research' and r.executor_version='2026.09.10-v1';
  return b.content||jsonb_build_object('approvalStatus','approved','priorArtifacts',prior);
end;
$$;
create function public.worker_load_provider_research_context(p_job_id uuid,p_capability_token text)
returns jsonb language sql security invoker set search_path='' as $$
 select private.worker_load_provider_research_context(p_job_id,p_capability_token);
$$;
revoke all on function private.worker_load_provider_research_context(uuid,text) from public,anon,authenticated;
revoke all on function public.worker_load_provider_research_context(uuid,text) from public,anon,authenticated;
grant execute on function private.worker_load_provider_research_context(uuid,text) to authenticated;
grant execute on function public.worker_load_provider_research_context(uuid,text) to authenticated;

-- A zero-call research job may finish only with all three tasks and its final research artifact.
create function private.guard_provider_research_completion_v1() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if old.kind<>'capital_project_analysis' or old.payload->>'analysis_scope'<>'provider_research'
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
      and a.id::text=new.result->>'provider_research_artifact_id'
      and a.artifact_fingerprint=new.result->>'artifact_fingerprint'
      and a.artifact_type='provider_research' and a.schema_version='provider-research.v1'
      and a.status not in ('stale','superseded') and t.task_id='K02' and r.status='succeeded'
      and r.executor_key='provider_research' and r.executor_version='2026.09.10-v1'
      and r.output_reference->>'id'=a.id::text and r.output_fingerprint=a.artifact_fingerprint
      and r.input_fingerprint=a.input_fingerprint
      and a.content->>'scope'='research_only' and a.content->'shortlistAuthorized'='false'::jsonb
      and a.content->'externalEffectAllowed'='false'::jsonb
  ) then raise exception 'provider_research_completion_invalid' using errcode='42501'; end if;
  return new;
end;
$$;
revoke all on function private.guard_provider_research_completion_v1() from public,anon,authenticated;
create trigger provider_research_completion_guard before update on public.processing_jobs
for each row execute function private.guard_provider_research_completion_v1();
