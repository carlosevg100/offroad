-- Rollback-only synthetic entry and upload continuity; never call a model/provider.
begin;
\ir support/source_rights_fixture.sql
\ir support/legacy_workspace_capabilities.sql
\ir support/legacy_resource_fixture.sql
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
select set_config('request.headers','{"x-offroad-workspace":"a11b0000-0000-4000-9000-000000000001"}',true);
set local role authenticated;
do $$ declare result jsonb; replay jsonb; work_id uuid; before_sessions bigint; before_companies bigint; before_groups bigint; d uuid; linked uuid; revision bigint; begin
 select count(*) into before_sessions from public.document_intake_sessions;
 select count(*) into before_companies from public.companies;
 select count(*) into before_groups from public.workspace_project_groups;
 result:=public.start_work_v1('a4100000-0000-4000-8000-000000000010','pt-BR','Synthetic standalone question','Synthetic conceptual alternatives');
 work_id:=(result->>'workId')::uuid;
 perform set_config('test.work',work_id::text,true);
 if result->>'intake_session_id' is not null or (select count(*) from public.document_intake_sessions)<>before_sessions
 or (select count(*) from public.companies)<>before_companies or (select count(*) from public.workspace_project_groups)<>before_groups
 or exists(select 1 from public.capital_project_plans where capital_project_id=work_id) then raise exception 'question manufactured a company, folder, intake or plan'; end if;
 if (select count(*) from public.agent_messages m where m.work_id=(result->>'workId')::uuid)<>1 then raise exception 'entry manufactured guidance or documentary request'; end if;
 replay:=public.start_work_v1('a4100000-0000-4000-8000-000000000010','pt-BR','Synthetic standalone question','Synthetic conceptual alternatives');
 if replay->>'workId'<>result->>'workId' or replay->>'replayed'<>'true' then raise exception 'retry changed work identity'; end if;
 begin perform public.start_work_v1('a4100000-0000-4000-8000-000000000010','pt-BR','Synthetic standalone question','Changed intent'); raise exception 'request key silently changed intent'; exception when invalid_parameter_value then null; end;
 begin perform public.append_work_turn_v1(work_id,gen_random_uuid(),'pt-BR','Concurrent turn'); raise exception 'overlapping turn accepted'; exception when object_not_in_prerequisite_state then null; end;
 revision:=public.update_work_context_v1(work_id,1,'{"purpose":"Synthetic decision","audience":"Board","deadline":null,"commitment":"deciding","stage":"analyze"}');
 if revision<>2 then raise exception 'context revision not advanced'; end if;
 begin perform public.update_work_context_v1(work_id,1,'{"purpose":"Lost update","audience":null,"deadline":null,"commitment":"exploring","stage":"understand"}'); raise exception 'stale context overwritten'; exception when serialization_failure then null; end;
 begin perform public.update_work_context_v1(work_id,2,'{"purpose":"Escalation","audience":null,"deadline":null,"commitment":"exploring","stage":"understand","authorized_services":["publish"]}'); raise exception 'context granted execution'; exception when invalid_parameter_value then null; end;
 for d in select id from public.dossiers where resource_id in ('a11b0000-0000-4000-9000-000000000002','a11b0000-0000-4000-9000-000000000003') loop
  linked:=public.link_work_dossier_v1(work_id,d);
  if linked<>public.link_work_dossier_v1(work_id,d) then raise exception 'dossier link duplicated'; end if;
 end loop;
 if (select count(*) from public.work_dossiers wd where wd.work_id=(result->>'workId')::uuid)<>2 then raise exception 'multiple dossiers not linked'; end if;
end $$;
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000002',true);
do $$ begin
 if exists(select 1 from public.agent_messages where work_id=current_setting('test.work')::uuid) then raise exception 'membership disclosed conversation'; end if;
 begin perform public.append_work_turn_v1(current_setting('test.work')::uuid,gen_random_uuid(),'pt-BR','Unauthorized turn'); raise exception 'membership wrote conversation'; exception when insufficient_privilege then null; end;
 begin perform public.prepare_work_document_intake_v1(current_setting('test.work')::uuid,'pt-BR'); raise exception 'membership created intake'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
select public.accept_private_workspace_terms('pt-BR','Synthetic work owner','',true,true);
do $$ declare session_id uuid; before_conversation uuid; begin
 select conversation_id into before_conversation from public.agent_messages where id='a4100000-0000-4000-8000-000000000010';
 session_id:=public.prepare_work_document_intake_v1(current_setting('test.work')::uuid,'pt-BR');
 if session_id<>public.prepare_work_document_intake_v1(current_setting('test.work')::uuid,'pt-BR') then raise exception 'upload retried into another intake'; end if;
 if not exists(select 1 from public.document_intake_sessions where id=session_id and capital_project_id=current_setting('test.work')::uuid) then raise exception 'upload changed work'; end if;
 if not exists(select 1 from public.agent_messages where id='a4100000-0000-4000-8000-000000000010' and conversation_id=before_conversation and intake_session_id=session_id and work_id=current_setting('test.work')::uuid) then raise exception 'upload lost transcript'; end if;
 if exists(select 1 from public.processing_jobs where work_id=current_setting('test.work')::uuid and kind='work_conversation' and status in ('queued','leased')) then raise exception 'old context job survived document boundary'; end if;
end $$;
-- A link never carries the dossier's access with it, and creation never defeats revocation.
select public.revoke_resource_access_v1('a11b0000-0000-4000-9000-000000000002','a11b0000-0000-4000-8000-000000000001');
do $$ begin
 if exists(select 1 from public.work_dossiers where work_id=current_setting('test.work')::uuid) then raise exception 'dossier link retained revoked source access'; end if;
end $$;
select public.revoke_resource_access_v1(current_setting('test.work')::uuid,'a11b0000-0000-4000-8000-000000000001');
do $$ begin
 begin perform public.start_work_v1('a4100000-0000-4000-8000-000000000010','pt-BR','Synthetic standalone question','Synthetic conceptual alternatives'); raise exception 'creator replay bypassed revocation'; exception when insufficient_privilege then null; end;
 begin perform public.manage_work_v1(current_setting('test.work')::uuid,'rename','Residual creator power'); raise exception 'creator rename bypassed revocation'; exception when insufficient_privilege then null; end;
 if exists(select 1 from public.agent_messages where work_id=current_setting('test.work')::uuid) then raise exception 'creator still reads revoked work'; end if;
end $$;
reset role;
do $$ begin
 if exists(select 1 from public.processing_jobs where work_id=current_setting('test.work')::uuid and kind='work_conversation' and capability_sha256 is not null) then raise exception 'old context capability survived document boundary'; end if;
end $$;
select 'persistent_work_without_intake: PASS' result;
rollback;
