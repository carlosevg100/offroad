-- Stage 10C: apply only after the work-aware web entry is deployed.
-- Documentary setup keeps its declaration gates and enters through the canonical work command.
CREATE OR REPLACE FUNCTION private.start_workspace_intake(p_organization_id uuid, p_locale text, p_project_name text, p_identity_policy text, p_representation_declared boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id uuid := (select auth.uid());
  organization_type text;
  session_id uuid;
  normalized_project_name text := trim(regexp_replace(coalesce(p_project_name, ''), '\s+', ' ', 'g'));
  target_representation_kind text;
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_locale not in ('pt-BR', 'en-US')
    or char_length(normalized_project_name) not between 2 and 80
    or p_identity_policy not in ('identified_restricted', 'blind_initial')
    or not coalesce(p_representation_declared, false) then
    raise exception 'invalid_private_project_setup' using errcode = '22023';
  end if;

  select organization.organization_type into organization_type
  from public.organizations organization
  join public.organization_memberships membership
    on membership.organization_id = organization.id
   and membership.user_id = caller_id
   and membership.status = 'active'
  where organization.id = p_organization_id
    and organization.id = (select organization_id from private.workspace_membership_v1())
    and private.organization_has_workspace_capability(organization.id,'origination_representation')
  limit 1;
  if not found then
    raise exception 'organization_not_found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.organization_legal_acceptances acceptance
    join public.platform_legal_documents document on document.id = acceptance.legal_document_id
    where acceptance.organization_id = p_organization_id
      and acceptance.document_key = 'private_workspace_terms'
      and document.status = 'active'
      and acceptance.document_version = document.version
      and acceptance.document_hash = document.document_hash
  ) then
    raise exception 'private_workspace_terms_required' using errcode = '42501';
  end if;

  target_representation_kind := case organization_type when 'originator' then 'advisor' else 'company' end;

  session_id:=private.prepare_work_document_intake_v1(
    (private.start_work_v1(gen_random_uuid(),p_locale,normalized_project_name,normalized_project_name,
      'capital_planning','authorized_private',null,null,false)->>'workId')::uuid,p_locale);
  update public.document_intake_sessions set identity_policy=p_identity_policy,
    representation_kind=target_representation_kind,representation_status='declared' where id=session_id;

  insert into public.project_representation_evidence (
    organization_id, intake_session_id, representation_kind, evidence_type,
    statement, status, submitted_by
  ) values (
    p_organization_id, session_id, target_representation_kind, 'self_declaration',
    case target_representation_kind
      when 'advisor' then 'The user declares that they are authorized to prepare this project on behalf of the company.'
      else 'The user declares that they represent the company and are authorized to prepare this project.'
    end,
    'declared', caller_id
  );

  return session_id;
exception
  when unique_violation then
    raise exception 'project_name_already_in_use' using errcode = '23505';
end;
$function$
;
CREATE OR REPLACE FUNCTION private.start_onboarding_intake(p_locale text, p_project_name text, p_identity_policy text, p_representation_declared boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id uuid := (select auth.uid());
  progress_row public.onboarding_progress;
  session_id uuid;
  normalized_project_name text := trim(regexp_replace(coalesce(p_project_name, ''), '\s+', ' ', 'g'));
  target_representation_kind text;
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_locale not in ('pt-BR', 'en-US')
    or char_length(normalized_project_name) not between 2 and 80
    or p_identity_policy not in ('identified_restricted', 'blind_initial')
    or not coalesce(p_representation_declared, false) then
    raise exception 'invalid_private_project_setup' using errcode = '22023';
  end if;

  select progress.* into progress_row
  from public.onboarding_progress progress
  join public.organization_memberships membership
    on membership.organization_id = progress.organization_id
   and membership.user_id = progress.user_id
  join public.organizations organization
    on organization.id = progress.organization_id
  where progress.organization_id = (select organization_id from private.workspace_membership_v1())
    and progress.user_id = caller_id
    and progress.completed_at is null
    and progress.journey in ('company', 'originator')
    and membership.status = 'active'
    and organization.organization_type in ('company', 'originator')
  order by progress.updated_at desc
  limit 1
  for update of progress;
  if not found then
    raise exception 'onboarding_progress_not_found' using errcode = 'P0002';
  end if;
  perform private.require_workspace_capability(progress_row.organization_id,'origination_representation');

  if not exists (
    select 1
    from public.organization_legal_acceptances acceptance
    join public.platform_legal_documents document on document.id = acceptance.legal_document_id
    where acceptance.organization_id = progress_row.organization_id
      and acceptance.document_key = 'private_workspace_terms'
      and document.status = 'active'
      and acceptance.document_version = document.version
      and acceptance.document_hash = document.document_hash
  ) then
    raise exception 'private_workspace_terms_required' using errcode = '42501';
  end if;

  target_representation_kind := case progress_row.journey when 'originator' then 'advisor' else 'company' end;

  if coalesce(progress_row.answers ->> 'intake_session_id', '') <> '' then
    select session.id into session_id
    from public.document_intake_sessions session
    where session.organization_id = progress_row.organization_id
      and session.id = (progress_row.answers ->> 'intake_session_id')::uuid
      and session.started_by = caller_id
      and session.status not in ('cancelled', 'confirmed')
    limit 1
    for update;
  end if;

  if session_id is null then
  session_id:=private.prepare_work_document_intake_v1(
    (private.start_work_v1(gen_random_uuid(),p_locale,normalized_project_name,normalized_project_name,
      'capital_planning','authorized_private',null,null,false)->>'workId')::uuid,p_locale);
  update public.document_intake_sessions set identity_policy=p_identity_policy,
    representation_kind=target_representation_kind,representation_status='declared' where id=session_id;
  else
    perform private.require_resource_access_v1(session_id,'work');
    update public.document_intake_sessions session
    set project_name = normalized_project_name,
        identity_policy = p_identity_policy,
        representation_kind = target_representation_kind,
        updated_at = now()
    where session.organization_id = progress_row.organization_id
      and session.id = session_id;
  end if;

  insert into public.project_representation_evidence (
    organization_id, intake_session_id, representation_kind, evidence_type,
    statement, status, submitted_by
  )
  select
    progress_row.organization_id, session_id, target_representation_kind, 'self_declaration',
    case target_representation_kind
      when 'advisor' then 'The user declares that they are authorized to prepare this project on behalf of the company.'
      else 'The user declares that they represent the company and are authorized to prepare this project.'
    end,
    'declared', caller_id
  where not exists (
    select 1
    from public.project_representation_evidence evidence
    where evidence.organization_id = progress_row.organization_id
      and evidence.intake_session_id = session_id
      and evidence.submitted_by = caller_id
      and evidence.evidence_type = 'self_declaration'
      and evidence.status <> 'revoked'
  );

  update public.onboarding_progress progress
  set current_step = 'organization',
      answers = coalesce(progress.answers, '{}'::jsonb)
        || jsonb_build_object(
          'intake_mode', 'documents',
          'intake_session_id', session_id,
          'guided_milestone', coalesce(progress.answers ->> 'guided_milestone', 'company'),
          'project_name', normalized_project_name,
          'identity_policy', p_identity_policy
        ),
      updated_at = now()
  where progress.organization_id = progress_row.organization_id
    and progress.user_id = caller_id
    and progress.journey = progress_row.journey;

  return session_id;
exception
  when unique_violation then
    raise exception 'project_name_already_in_use' using errcode = '23505';
end;
$function$
;

-- Existing work receives a context without inventing an audience, deadline, company or purpose.
insert into public.work_contexts(organization_id,work_id)
select organization_id,id from public.capital_projects on conflict(organization_id,work_id) do nothing;


-- Every conversational legacy entry delegates to the same work command and ACL.
create or replace function private.start_advisor_project_v1(p_request_id uuid,p_locale text,p_project_name text,p_entry_job text,p_prompt text,p_access_basis text,p_plan jsonb) returns jsonb
language sql security definer set search_path='' as $$
 select private.start_work_v1(p_request_id,p_locale,p_project_name,p_prompt,p_entry_job,p_access_basis,p_plan,null,false);
$$;
create or replace function private.start_advisor_project_in_group_v1(p_request_id uuid,p_locale text,p_project_name text,p_entry_job text,p_prompt text,p_access_basis text,p_plan jsonb,p_group_id uuid default null) returns jsonb
language sql security definer set search_path='' as $$
 select private.start_work_v1(p_request_id,p_locale,p_project_name,p_prompt,p_entry_job,p_access_basis,p_plan,p_group_id,false);
$$;
create or replace function public.start_advisor_project_v1(p_request_id uuid,p_locale text,p_project_name text,p_entry_job text,p_prompt text,p_access_basis text,p_plan jsonb) returns jsonb
language sql security invoker set search_path='' as $$
 select private.start_work_v1(p_request_id,p_locale,p_project_name,p_prompt,p_entry_job,p_access_basis,p_plan,null,false);
$$;
create or replace function public.start_advisor_project_in_group_v1(p_request_id uuid,p_locale text,p_project_name text,p_entry_job text,p_prompt text,p_access_basis text,p_plan jsonb,p_group_id uuid default null) returns jsonb
language sql security invoker set search_path='' as $$
 select private.start_work_v1(p_request_id,p_locale,p_project_name,p_prompt,p_entry_job,p_access_basis,p_plan,p_group_id,false);
$$;
-- Retire the unused canned assistant reply path; all turns use the canonical command.
create or replace function private.append_advisor_message_v1(p_project_id uuid,p_message_id uuid,p_locale text,p_content text) returns jsonb
language sql security definer set search_path='' as $$
 select private.append_work_turn_v1(p_project_id,p_message_id,p_locale,p_content);
$$;
CREATE OR REPLACE FUNCTION private.submit_advisor_turn_v1(p_project_id uuid, p_message_id uuid, p_locale text, p_content text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id uuid := (select auth.uid());
  project_row public.capital_projects;
  session_row public.document_intake_sessions;
  conversation_row public.agent_conversations;
  existing_message public.agent_messages;
  normalized_content text := trim(coalesce(p_content, ''));
  run_id uuid := gen_random_uuid();
  next_run_no integer;
  job_id uuid := gen_random_uuid();
begin
 perform private.require_resource_access_v1(p_project_id,'work');
 if not exists(select 1 from public.document_intake_sessions where capital_project_id=p_project_id) then
  return private.append_work_turn_v1(p_project_id,p_message_id,p_locale,p_content);
 end if;
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_message_id is null
    or p_locale not in ('pt-BR', 'en-US')
    or char_length(normalized_content) not between 1 and 8000 then
    raise exception 'invalid_advisor_message' using errcode = '22023';
  end if;

  select message.* into existing_message
  from public.agent_messages message
  where message.id = p_message_id and message.created_by = caller_id;
  if found then
    if existing_message.work_id is distinct from p_project_id then raise exception 'advisor_message_work_mismatch' using errcode='42501'; end if;
    if existing_message.content is distinct from normalized_content or existing_message.locale is distinct from p_locale then raise exception 'advisor_message_replay_conflict' using errcode='22023'; end if;
    return jsonb_build_object(
      'message_id', existing_message.id,
      'conversation_id', existing_message.conversation_id,
      'status', existing_message.status,
      'replayed', true
    );
  end if;

  perform 1 from public.document_intake_sessions approval_session
      join public.organization_memberships approval_member on approval_member.organization_id=approval_session.organization_id
      where approval_session.capital_project_id=p_project_id and approval_member.user_id=auth.uid() and approval_member.status='active'
      order by approval_session.id for update of approval_session;
    select project.* into project_row
  from public.capital_projects project
  join public.organization_memberships membership
    on membership.organization_id = project.organization_id
  where project.id = p_project_id
    and membership.user_id = caller_id
    and membership.status = 'active'
    and project.status <> 'archived'
  for update of project;
  if not found then
    raise exception 'capital_project_not_found' using errcode = 'P0002';
  end if;

  select session.* into strict session_row
  from public.document_intake_sessions session
  where session.organization_id = project_row.organization_id
    and session.capital_project_id = project_row.id
  order by session.created_at asc
  limit 1;

  select conversation.* into conversation_row
  from public.agent_conversations conversation
  where conversation.organization_id = project_row.organization_id
    and conversation.intake_session_id = session_row.id
  for update;
  if not found then
    insert into public.agent_conversations (
      organization_id, intake_session_id, state, created_by
    ) values (
      project_row.organization_id, session_row.id, 'idle', caller_id
    ) returning * into conversation_row;
  end if;

  if exists (
    select 1 from public.agent_messages message
    where message.organization_id = project_row.organization_id
      and message.conversation_id = conversation_row.id
      and message.role = 'user'
      and message.status in ('queued', 'processing')
  ) then
    raise exception 'advisor_message_in_progress' using errcode = '55000';
  end if;

  select coalesce(max(run.run_no), 0) + 1 into next_run_no
  from public.processing_runs run
  where run.organization_id = project_row.organization_id
    and run.intake_session_id = session_row.id;

  insert into public.processing_runs (
    id, organization_id, intake_session_id, run_no, trigger, status,
    pipeline_version, budget, versions, created_by
  ) values (
    run_id, project_row.organization_id, session_row.id, next_run_no,
    'answer', 'queued', 'advisor-conversation-2026.09.01-v1',
    jsonb_build_object('maxCalls', 1, 'maxCostUsd', 0.25),
    jsonb_build_object('agentContract', 'advisor-conversation-2026.09.01-v1'),
    caller_id
  );

  insert into public.agent_messages (
    id, organization_id, conversation_id, intake_session_id, role, status,
    content, locale, metadata, created_by
  ) values (
    p_message_id, project_row.organization_id, conversation_row.id, session_row.id,
    'user', 'queued', normalized_content, p_locale,
    jsonb_build_object('kind', 'message', 'projectId', project_row.id), caller_id
  );

  insert into public.processing_jobs (
    id, organization_id, processing_run_id, intake_session_id, kind, payload,
    max_attempts
  ) values (
    job_id, project_row.organization_id, run_id, session_row.id,
    'agent_operation_brief',
    jsonb_build_object('message_id', p_message_id, 'locale', p_locale, 'surface', 'project_workspace'),
    2
  );

  update public.agent_conversations
  set state = 'analyzing', updated_at = now()
  where organization_id = project_row.organization_id and id = conversation_row.id;
  update public.capital_projects
  set updated_at = now()
  where organization_id = project_row.organization_id and id = project_row.id;

  return jsonb_build_object(
    'message_id', p_message_id,
    'conversation_id', conversation_row.id,
    'job_id', job_id,
    'status', 'queued',
    'replayed', false
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION private.queue_advisor_initial_turn_v1(p_project_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id uuid := (select auth.uid());
  project_row public.capital_projects;
  session_row public.document_intake_sessions;
  source_message public.agent_messages;
  existing_job public.processing_jobs;
  run_id uuid := gen_random_uuid();
  next_run_no integer;
  job_id uuid := gen_random_uuid();
begin
 perform private.require_resource_access_v1(p_project_id,'work');
 if not exists(select 1 from public.document_intake_sessions where capital_project_id=p_project_id) then
  return private.enqueue_work_turn_v1(p_project_id,(select id from public.agent_messages where work_id=p_project_id and intake_session_id is null and role='user' and metadata->>'kind'='request' order by created_at,id limit 1));
 end if;
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select project.* into project_row
  from public.capital_projects project
  join public.organization_memberships membership
    on membership.organization_id = project.organization_id
  where project.id = p_project_id
    and membership.user_id = caller_id
    and membership.status = 'active'
    and project.status <> 'archived'
  for update of project;
  if not found then raise exception 'capital_project_not_found' using errcode = 'P0002'; end if;

  select session.* into strict session_row
  from public.document_intake_sessions session
  where session.organization_id = project_row.organization_id
    and session.capital_project_id = project_row.id
  order by session.created_at asc limit 1;

  select message.* into source_message
  from public.agent_messages message
  where message.organization_id = project_row.organization_id
    and message.intake_session_id = session_row.id
    and message.role = 'user'
    and message.metadata ->> 'kind' = 'request'
  order by message.created_at asc, message.id asc
  limit 1
  for update;
  if not found then raise exception 'advisor_initial_message_not_found' using errcode = 'P0002'; end if;

  select job.* into existing_job
  from public.processing_jobs job
  where job.organization_id = project_row.organization_id
    and job.intake_session_id = session_row.id
    and job.kind = 'agent_operation_brief'
    and job.payload ->> 'message_id' = source_message.id::text
  order by job.created_at asc, job.id asc limit 1;
  if found then
    return jsonb_build_object('message_id', source_message.id, 'job_id', existing_job.id, 'replayed', true);
  end if;

  if source_message.status <> 'completed' then
    raise exception 'advisor_initial_message_not_queueable' using errcode = '55000';
  end if;

  delete from public.agent_messages message
  where message.organization_id = project_row.organization_id
    and message.intake_session_id = session_row.id
    and message.role = 'assistant'
    and message.reply_to_message_id = source_message.id
    and message.metadata ->> 'kind' = 'guidance';

  select coalesce(max(run.run_no), 0) + 1 into next_run_no
  from public.processing_runs run
  where run.organization_id = project_row.organization_id
    and run.intake_session_id = session_row.id;

  insert into public.processing_runs (
    id, organization_id, intake_session_id, run_no, trigger, status,
    pipeline_version, budget, versions, created_by
  ) values (
    run_id, project_row.organization_id, session_row.id, next_run_no,
    'manual', 'queued', 'advisor-conversation-2026.09.01-v1',
    jsonb_build_object('maxCalls', 1, 'maxCostUsd', 0.25),
    jsonb_build_object('agentContract', 'advisor-conversation-2026.09.01-v1'),
    caller_id
  );

  update public.agent_messages
  set status = 'queued', updated_at = now()
  where organization_id = project_row.organization_id and id = source_message.id;

  insert into public.processing_jobs (
    id, organization_id, processing_run_id, intake_session_id, kind, payload,
    max_attempts
  ) values (
    job_id, project_row.organization_id, run_id, session_row.id,
    'agent_operation_brief',
    jsonb_build_object('message_id', source_message.id, 'locale', source_message.locale, 'surface', 'project_workspace'),
    2
  );

  update public.agent_conversations
  set state = 'analyzing', updated_at = now()
  where organization_id = project_row.organization_id
    and intake_session_id = session_row.id;

  return jsonb_build_object('message_id', source_message.id, 'job_id', job_id, 'replayed', false);
end;
$function$
;
CREATE OR REPLACE FUNCTION private.start_provider_research_project_v1(p_request_id uuid, p_locale text, p_project_name text, p_prompt text, p_plan jsonb, p_group_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  -- No documentary executor or fictional intake for a standalone conversation.
  if result->>'intake_session_id' is null then
   return result||private.enqueue_work_turn_v1((result->>'capital_project_id')::uuid,p_request_id)||jsonb_build_object('executionState','conversation_only');
  end if;
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
$function$
;
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
;

-- Public-information starters have no web consumers requiring a session. Their UUID is now work identity.
CREATE OR REPLACE FUNCTION private.start_public_capital_project(p_locale text, p_project_name text, p_entry_job text, p_company_name text, p_company_website text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id uuid := (select auth.uid());
  target_organization_id uuid;
  target_organization_type text;
  project_id uuid;
  work_id uuid;
  normalized_project_name text := trim(regexp_replace(coalesce(p_project_name, ''), '\s+', ' ', 'g'));
  normalized_company_name text := trim(regexp_replace(coalesce(p_company_name, ''), '\s+', ' ', 'g'));
  normalized_website text := nullif(trim(coalesce(p_company_website, '')), '');
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_locale not in ('pt-BR', 'en-US')
    or char_length(normalized_project_name) not between 2 and 80
    or char_length(normalized_company_name) not between 2 and 160
    or p_entry_job not in ('company_debt_view', 'origination_thesis', 'capital_planning')
    or coalesce(char_length(normalized_website), 0) > 500
    or (normalized_website is not null and normalized_website !~* '^https?://[^[:space:]]+$') then
    raise exception 'invalid_public_project_setup' using errcode = '22023';
  end if;

  -- Changed: the displayed tenant, checked for the public entry capability.
  select resolved.organization_id, resolved.organization_type
  into target_organization_id, target_organization_type
  from private.workspace_membership_v1() resolved;
  if target_organization_id is null then
    raise exception 'workspace_membership_not_found' using errcode = 'P0002';
  end if;
  perform private.require_workspace_capability(target_organization_id, 'origination_representation');

  project_id:=(private.start_work_v1(gen_random_uuid(),p_locale,normalized_project_name,
    normalized_project_name||' — '||normalized_company_name,p_entry_job,'public_information',null,null,true)->>'workId')::uuid;
  -- User-declared subject stays in the private dossier, never a canonical company or a public fact.
  update public.dossiers set profile=jsonb_strip_nulls(jsonb_build_object('name',normalized_company_name,'website',normalized_website))
    where organization_id=target_organization_id and resource_id=project_id;
  perform private.link_work_dossier_v1(project_id,(select id from public.dossiers where organization_id=target_organization_id and resource_id=project_id));
  return project_id;
exception
  when unique_violation then
    raise exception 'project_name_already_in_use' using errcode = '23505';
end;
$function$
;
CREATE OR REPLACE FUNCTION private.start_public_capital_project_v2(p_locale text, p_project_name text, p_entry_job text, p_company_name text, p_company_website text, p_plan jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  work_id uuid;
begin
  work_id := private.start_public_capital_project(
    p_locale, p_project_name, p_entry_job, p_company_name, p_company_website
  );
  perform private.record_capital_project_plan(
    work_id, p_plan
  );
  return work_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.start_public_onboarding_capital_project(p_locale text, p_project_name text, p_entry_job text, p_company_name text, p_company_website text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id uuid := (select auth.uid());
  work_id uuid;
  target_organization_id uuid;
begin
  work_id := private.start_public_capital_project(
    p_locale, p_project_name, p_entry_job, p_company_name, p_company_website
  );
  select work.organization_id into target_organization_id
  from public.capital_projects work
  where work.id = work_id;

  update public.onboarding_progress progress
  set completed_at = coalesce(progress.completed_at, now()),
      answers = coalesce(progress.answers, '{}'::jsonb) || jsonb_build_object(
        'work_id', work_id::text,
        'project_name', p_project_name,
        'entry_job', p_entry_job
      ),
      updated_at = now()
  where progress.user_id = caller_id
    and progress.organization_id = target_organization_id
    and progress.journey in ('company', 'originator');
  if not found then
    raise exception 'onboarding_progress_not_found' using errcode = 'P0002';
  end if;

  return work_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.start_public_onboarding_capital_project_v2(p_locale text, p_project_name text, p_entry_job text, p_company_name text, p_company_website text, p_plan jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  work_id uuid;
begin
  work_id := private.start_public_onboarding_capital_project(
    p_locale, p_project_name, p_entry_job, p_company_name, p_company_website
  );
  perform private.record_capital_project_plan(
    work_id, p_plan
  );
  return work_id;
end;
$function$
;


comment on function public.start_advisor_project_v1(uuid,text,text,text,text,text,jsonb) is 'Compatibility entry into start_work_v1; returns work identity and null intake until explicit document ingestion.';
comment on function public.start_public_capital_project(text,text,text,text,text) is 'Deprecated structured entry with no web consumer; UUID is now work identity, never an empty intake. Use start_work_v1.';
comment on function public.start_public_capital_project_v2(text,text,text,text,text,jsonb) is 'Deprecated structured entry; returns work UUID and records the supplied proposed plan without activating financial execution.';
