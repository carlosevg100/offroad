-- Stage 10 entry commands. Install only after the v4 consumer is deployed.

set search_path='';
drop trigger capital_projects_bind_workspace_group on public.capital_projects;
drop function private.bind_workspace_group_after_capital_project_insert();

create function private.enqueue_work_turn_v1(p_work_id uuid,p_message_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.capital_projects; m public.agent_messages; existing public.processing_jobs; run_id uuid:=gen_random_uuid(); job_id uuid:=gen_random_uuid(); next_no integer;
begin
 perform private.require_resource_access_v1(p_work_id,'work');
 select * into strict p from public.capital_projects where id=p_work_id and status<>'archived' for update;
 select * into m from public.agent_messages where organization_id=p.organization_id and work_id=p.id and id=p_message_id and role='user' and created_by=auth.uid() for update;
 if not found or m.intake_session_id is not null then raise exception 'work_turn_not_available' using errcode='42501'; end if;
 select * into existing from public.processing_jobs where organization_id=p.organization_id and work_id=p.id and kind='work_conversation' and payload->>'message_id'=m.id::text;
 if found then return jsonb_build_object('workId',p.id,'messageId',m.id,'jobId',existing.id,'status',existing.status,'replayed',true); end if;
 if exists(select 1 from public.agent_messages where organization_id=p.organization_id and conversation_id=m.conversation_id and id<>m.id and role='user' and status in ('queued','processing')) then raise exception 'advisor_message_in_progress' using errcode='55000'; end if;
 select coalesce(max(run_no),0)+1 into next_no from public.processing_runs where organization_id=p.organization_id and work_id=p.id and intake_session_id is null;
 insert into public.processing_runs(id,organization_id,work_id,run_no,trigger,pipeline_version,budget,versions,created_by)
 values(run_id,p.organization_id,p.id,next_no,'answer','work-conversation-v1','{"maxCalls":1,"maxCostUsd":0.25}','{"contract":"work-conversation-v1"}',auth.uid());
 insert into public.processing_jobs(id,organization_id,work_id,processing_run_id,kind,payload,max_attempts)
 values(job_id,p.organization_id,p.id,run_id,'work_conversation',jsonb_build_object('message_id',m.id,'locale',m.locale,'model_budget',jsonb_build_object('max_calls',1,'max_cost_usd',0.25)),2);
 update public.agent_messages set status='queued' where organization_id=p.organization_id and id=m.id;
 update public.agent_conversations set state='analyzing' where organization_id=p.organization_id and id=m.conversation_id;
 update public.capital_projects set updated_at=now() where organization_id=p.organization_id and id=p.id;
 return jsonb_build_object('workId',p.id,'messageId',m.id,'jobId',job_id,'status','queued','replayed',false);
end $$;
revoke all on function private.enqueue_work_turn_v1(uuid,uuid) from public,anon,authenticated,service_role;

create function private.start_work_v1(p_request_id uuid,p_locale text,p_title text,p_prompt text,p_entry_job text default 'company_debt_view',p_access_basis text default 'public_information',p_plan jsonb default null,p_group_id uuid default null,p_enqueue boolean default true) returns jsonb
language plpgsql security definer set search_path='' as $$
declare org uuid; p public.capital_projects; m public.agent_messages; conversation_id uuid; title text:=btrim(regexp_replace(coalesce(p_title,''),'\s+',' ','g')); result jsonb;
begin
 if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
 select organization_id into org from private.workspace_membership_v1();
 if org is null then raise exception 'workspace_membership_not_found' using errcode='42501'; end if;
 perform private.require_workspace_capability(org,'own_analysis');
 if p_entry_job='origination_thesis' then perform private.require_workspace_capability(org,'origination_representation'); end if;
 if p_request_id is null or p_locale is null or p_locale not in ('pt-BR','en-US') or length(title) not between 2 and 80
 or p_prompt is null or length(btrim(p_prompt)) not between 2 and 8000
 or p_entry_job is null or p_entry_job not in ('company_debt_view','origination_thesis','capital_planning','structure_from_documents','review_existing_operation')
 or p_access_basis is null or p_access_basis not in ('public_information','authorized_private')
 or (p_plan is not null and (jsonb_typeof(p_plan)<>'object' or p_plan#>>'{job,id}' is distinct from p_entry_job)) then raise exception 'invalid_work_request' using errcode='22023'; end if;
 -- Serialize the request key even across different project titles; replay never grants access.
 perform pg_advisory_xact_lock(hashtextextended(org::text||p_request_id::text,0));
 select * into m from public.agent_messages where id=p_request_id;
 if found then
  if m.organization_id<>org or m.created_by<>auth.uid() or m.work_id is null then raise exception 'work_request_denied' using errcode='42501'; end if;
  perform private.require_resource_access_v1(m.work_id,'work');
  select * into strict p from public.capital_projects where organization_id=org and id=m.work_id;
  if m.content is distinct from btrim(p_prompt) or m.locale is distinct from p_locale or p.entry_job<>p_entry_job then raise exception 'work_request_replay_conflict' using errcode='22023'; end if;
  return jsonb_build_object('workId',p.id,'capital_project_id',p.id,'intake_session_id',m.intake_session_id,'conversation_id',m.conversation_id,'message_id',m.id,'workspace_group_id',p.workspace_group_id,'replayed',true);
 end if;
 if p_access_basis='authorized_private' and not exists(select 1 from public.organization_legal_acceptances a join public.platform_legal_documents d on d.id=a.legal_document_id
  where a.organization_id=org and a.document_key='private_workspace_terms' and a.document_version=d.version and a.document_hash=d.document_hash and d.status='active') then raise exception 'private_workspace_terms_required' using errcode='42501'; end if;
 if p_group_id is not null and not exists(select 1 from public.workspace_project_groups where organization_id=org and id=p_group_id and archived_at is null) then raise exception 'workspace_project_group_not_found' using errcode='42501'; end if;
 -- Human titles may repeat; immutable identity is the UUID, never a company or folder.
 if exists(select 1 from public.capital_projects where organization_id=org and lower(project_name)=lower(title) and status<>'archived') then title:=left(title,69)||' · '||left(p_request_id::text,8); end if;
 insert into public.capital_projects(organization_id,project_name,entry_job,access_basis,status,current_phase,workspace_group_id,created_by)
 values(org,title,p_entry_job,p_access_basis,'active','understand',p_group_id,auth.uid()) returning * into p;
 insert into public.work_contexts(organization_id,work_id,purpose) values(org,p.id,btrim(p_prompt));
 if p_plan is not null then perform private.record_capital_project_plan(p.id,p_plan); end if;
 insert into public.agent_conversations(organization_id,work_id,state,created_by) values(org,p.id,'idle',auth.uid()) returning id into conversation_id;
 insert into public.agent_messages(id,organization_id,work_id,conversation_id,role,status,content,locale,metadata,created_by)
 values(p_request_id,org,p.id,conversation_id,'user','completed',btrim(p_prompt),p_locale,jsonb_build_object('kind','request','entryJob',p_entry_job),auth.uid());
 result:=jsonb_build_object('workId',p.id,'capital_project_id',p.id,'intake_session_id',null,'conversation_id',conversation_id,'message_id',p_request_id,'workspace_group_id',p_group_id,'replayed',false);
 if p_enqueue then result:=result||private.enqueue_work_turn_v1(p.id,p_request_id); end if;
 return result;
end $$;
create function public.start_work_v1(p_request_id uuid,p_locale text,p_title text,p_prompt text,p_entry_job text default 'company_debt_view',p_access_basis text default 'public_information',p_plan jsonb default null,p_group_id uuid default null,p_enqueue boolean default true) returns jsonb
language sql security invoker set search_path='' as $$ select private.start_work_v1(p_request_id,p_locale,p_title,p_prompt,p_entry_job,p_access_basis,p_plan,p_group_id,p_enqueue); $$;

create function private.append_work_turn_v1(p_work_id uuid,p_message_id uuid,p_locale text,p_content text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.capital_projects; c public.agent_conversations; prior public.agent_messages;
begin
 perform private.require_resource_access_v1(p_work_id,'work');
 if p_message_id is null or p_locale is null or p_locale not in ('pt-BR','en-US') or p_content is null or length(btrim(p_content)) not between 1 and 8000 then raise exception 'invalid_work_turn' using errcode='22023'; end if;
 select * into strict p from public.capital_projects where id=p_work_id and status<>'archived' for update;
 if exists(select 1 from public.document_intake_sessions where organization_id=p.organization_id and capital_project_id=p.id) then
  return private.submit_advisor_turn_v1(p.id,p_message_id,p_locale,p_content);
 end if;
 select * into strict c from public.agent_conversations where organization_id=p.organization_id and work_id=p.id and intake_session_id is null for update;
 select * into prior from public.agent_messages where id=p_message_id;
 if found then
  if prior.organization_id<>p.organization_id or prior.work_id is distinct from p.id or prior.created_by<>auth.uid() then raise exception 'work_turn_replay_denied' using errcode='42501'; end if;
  if prior.content is distinct from btrim(p_content) or prior.locale<>p_locale then raise exception 'work_turn_replay_conflict' using errcode='22023'; end if;
 else
  insert into public.agent_messages(id,organization_id,work_id,conversation_id,role,status,content,locale,metadata,created_by)
  values(p_message_id,p.organization_id,p.id,c.id,'user','completed',btrim(p_content),p_locale,'{"kind":"message"}',auth.uid());
 end if;
 return private.enqueue_work_turn_v1(p.id,p_message_id);
end $$;
create function public.append_work_turn_v1(p_work_id uuid,p_message_id uuid,p_locale text,p_content text) returns jsonb
language sql security invoker set search_path='' as $$ select private.append_work_turn_v1(p_work_id,p_message_id,p_locale,p_content); $$;

-- Explicit document ingestion boundary, not a prerequisite for speaking to Offroad.
create function private.prepare_work_document_intake_v1(p_work_id uuid,p_locale text,p_plan jsonb default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare p public.capital_projects; session_id uuid; journey text;
begin
 perform private.require_resource_access_v1(p_work_id,'work');
 if p_locale is null or p_locale not in ('pt-BR','en-US') then raise exception 'invalid_locale' using errcode='22023'; end if;
 select * into strict p from public.capital_projects where id=p_work_id and status<>'archived' for update;
 select id into session_id from public.document_intake_sessions where organization_id=p.organization_id and capital_project_id=p.id order by created_at,id limit 1;
 if found then perform private.require_resource_access_v1(session_id,'work'); return session_id; end if;
 perform private.authorize_capital_project_private_work(p.id,true);
 if p_plan is not null and not exists(select 1 from public.capital_project_plans where organization_id=p.organization_id and capital_project_id=p.id and status='active') then
  if p_plan#>>'{job,id}' is distinct from p.entry_job then raise exception 'work_document_plan_mismatch' using errcode='22023'; end if;
  perform private.record_capital_project_plan(p.id,p_plan);
 end if;
 select organization_type into journey from public.organizations where id=p.organization_id;
 insert into public.document_intake_sessions(organization_id,capital_project_id,started_by,journey,locale,project_name,identity_policy,privacy_status,representation_status,company_profile)
 values(p.organization_id,p.id,auth.uid(),journey,p_locale,p.project_name,'identified_restricted','private','not_claimed','{}') returning id into session_id;
 -- In-flight context must not survive the boundary change. History is conserved in the same conversation.
 update public.processing_jobs set status='cancelled',capability_sha256=null,lease_expires_at=null,leased_by=null
 where organization_id=p.organization_id and work_id=p.id and kind='work_conversation' and status in ('queued','leased');
 update public.processing_runs set status='cancelled',completed_at=now() where organization_id=p.organization_id and work_id=p.id and intake_session_id is null and status in ('queued','running');
 update public.agent_conversations set intake_session_id=session_id,state='idle' where organization_id=p.organization_id and work_id=p.id and intake_session_id is null;
 update public.agent_messages set intake_session_id=session_id where organization_id=p.organization_id and work_id=p.id and intake_session_id is null;
 return session_id;
end $$;
create function public.prepare_work_document_intake_v1(p_work_id uuid,p_locale text,p_plan jsonb default null) returns uuid
language sql security invoker set search_path='' as $$ select private.prepare_work_document_intake_v1(p_work_id,p_locale,p_plan); $$;

create function private.link_work_dossier_v1(p_work_id uuid,p_dossier_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare p public.capital_projects; d public.dossiers; result uuid;
begin
 perform private.require_resource_access_v1(p_work_id,'work'); d:=private.require_dossier_v1(p_dossier_id,'read');
 select * into strict p from public.capital_projects where id=p_work_id and status<>'archived' for update;
 if d.organization_id<>p.organization_id then raise exception 'work_dossier_scope_denied' using errcode='42501'; end if;
 insert into public.work_dossiers(organization_id,work_id,dossier_id,linked_by) values(p.organization_id,p.id,d.id,auth.uid()) on conflict(organization_id,work_id,dossier_id) do nothing;
 select id into result from public.work_dossiers where organization_id=p.organization_id and work_id=p.id and dossier_id=d.id;
 return result;
end $$;
create function public.link_work_dossier_v1(p_work_id uuid,p_dossier_id uuid) returns uuid
language sql security invoker set search_path='' as $$ select private.link_work_dossier_v1(p_work_id,p_dossier_id); $$;

create function private.update_work_context_v1(p_work_id uuid,p_expected_revision bigint,p_context jsonb) returns bigint
language plpgsql security definer set search_path='' as $$
declare p public.capital_projects; c public.work_contexts;
begin
 perform private.require_resource_access_v1(p_work_id,'work');
 select * into strict p from public.capital_projects where id=p_work_id and status<>'archived' for update;
 select * into strict c from public.work_contexts where organization_id=p.organization_id and work_id=p.id for update;
 if c.revision is distinct from p_expected_revision then raise exception 'work_context_changed' using errcode='40001'; end if;
 if coalesce(jsonb_typeof(p_context)<>'object' or p_context-array['purpose','audience','deadline','commitment','stage']<>'{}'::jsonb
 or not(p_context ?& array['purpose','audience','deadline','commitment','stage'])
 or jsonb_typeof(p_context->'purpose')<>'string'
 or jsonb_typeof(p_context->'audience') not in ('string','null')
 or jsonb_typeof(p_context->'deadline') not in ('string','null')
 or jsonb_typeof(p_context->'commitment')<>'string'
 or jsonb_typeof(p_context->'stage')<>'string',true) then raise exception 'invalid_work_context' using errcode='22023'; end if;
 update public.work_contexts set purpose=p_context->>'purpose',audience=p_context->>'audience',deadline=nullif(p_context->>'deadline','')::timestamptz,
 commitment=p_context->>'commitment',stage=p_context->>'stage',revision=revision+1 where id=c.id returning revision into c.revision;
 return c.revision;
end $$;
create function public.update_work_context_v1(p_work_id uuid,p_expected_revision bigint,p_context jsonb) returns bigint
language sql security invoker set search_path='' as $$ select private.update_work_context_v1(p_work_id,p_expected_revision,p_context); $$;

revoke all on function private.start_work_v1(uuid,text,text,text,text,text,jsonb,uuid,boolean),public.start_work_v1(uuid,text,text,text,text,text,jsonb,uuid,boolean),
private.append_work_turn_v1(uuid,uuid,text,text),public.append_work_turn_v1(uuid,uuid,text,text),
private.prepare_work_document_intake_v1(uuid,text,jsonb),public.prepare_work_document_intake_v1(uuid,text,jsonb),
private.link_work_dossier_v1(uuid,uuid),public.link_work_dossier_v1(uuid,uuid),
private.update_work_context_v1(uuid,bigint,jsonb),public.update_work_context_v1(uuid,bigint,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.start_work_v1(uuid,text,text,text,text,text,jsonb,uuid,boolean),public.start_work_v1(uuid,text,text,text,text,text,jsonb,uuid,boolean),
private.append_work_turn_v1(uuid,uuid,text,text),public.append_work_turn_v1(uuid,uuid,text,text),
private.prepare_work_document_intake_v1(uuid,text,jsonb),public.prepare_work_document_intake_v1(uuid,text,jsonb),
private.link_work_dossier_v1(uuid,uuid),public.link_work_dossier_v1(uuid,uuid),
private.update_work_context_v1(uuid,bigint,jsonb),public.update_work_context_v1(uuid,bigint,jsonb) to authenticated;

create function private.manage_work_v1(p_work_id uuid,p_action text,p_title text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.capital_projects; session_id uuid; title text:=btrim(regexp_replace(coalesce(p_title,''),'\s+',' ','g'));
begin
 if p_action is null or p_action not in ('rename','archive') then raise exception 'invalid_project_action' using errcode='22023'; end if;
 perform private.require_resource_access_v1(p_work_id,case when p_action='archive' then 'manage' else 'work' end);
 select * into strict p from public.capital_projects where id=p_work_id for update;
 select id into session_id from public.document_intake_sessions where organization_id=p.organization_id and capital_project_id=p.id order by created_at,id limit 1;
 if found then return private.manage_workspace_project(session_id,p_action,p_title); end if;
 if p_action='rename' then
  if p.status='archived' then raise exception 'project_archived' using errcode='55000'; end if;
  if length(title) not between 2 and 80 then raise exception 'invalid_project_name' using errcode='22023'; end if;
  update public.capital_projects set project_name=title,updated_at=now() where id=p.id;
  return jsonb_build_object('workId',p.id,'action','renamed','project_name',title);
 end if;
 update public.processing_jobs set status='cancelled',capability_sha256=null,lease_expires_at=null,leased_by=null
 where organization_id=p.organization_id and work_id=p.id and kind='work_conversation' and status in ('queued','leased');
 update public.processing_runs set status='cancelled',completed_at=now() where organization_id=p.organization_id and work_id=p.id and intake_session_id is null and status in ('queued','running');
 update public.capital_projects set status='archived',updated_at=now() where id=p.id;
 return jsonb_build_object('workId',p.id,'action','archived');
exception when unique_violation then raise exception 'project_name_already_in_use' using errcode='23505';
end $$;
create function public.manage_work_v1(p_work_id uuid,p_action text,p_title text default null) returns jsonb
language sql security invoker set search_path='' as $$ select private.manage_work_v1(p_work_id,p_action,p_title); $$;
revoke all on function private.manage_work_v1(uuid,text,text),public.manage_work_v1(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function private.manage_work_v1(uuid,text,text),public.manage_work_v1(uuid,text,text) to authenticated;
