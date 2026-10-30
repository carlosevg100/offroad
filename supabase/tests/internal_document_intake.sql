-- Synthetic internal workspace, transaction-local identity and rollback only; no provider call.
begin;
insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values
 ('a4500000-0000-4000-8000-000000000001','internal-intake-owner@example.invalid','{"full_name":"Synthetic internal owner"}',now()),
 ('a4500000-0000-4000-8000-000000000002','internal-intake-member@example.invalid','{"full_name":"Synthetic internal member"}',now()),
 ('a4500000-0000-4000-8000-000000000003','internal-intake-outsider@example.invalid','{"full_name":"Synthetic outsider"}',now());
insert into public.organizations(id,organization_type,name,created_by)
 values('a4500000-0000-4000-9000-000000000001','offroad','Synthetic internal document analysis','a4500000-0000-4000-8000-000000000001');
insert into public.organization_memberships(organization_id,user_id,role,status) values
 ('a4500000-0000-4000-9000-000000000001','a4500000-0000-4000-8000-000000000001','owner','active'),
 ('a4500000-0000-4000-9000-000000000001','a4500000-0000-4000-8000-000000000002','member','active');
insert into private.workspace_capability_grants(organization_id,capability,enabled,basis,granted_by)
 values('a4500000-0000-4000-9000-000000000001','own_analysis',true,'explicit_administration',null);
create function pg_temp.internal_intake_denied(p_sql text,p_states text[]) returns void language plpgsql as $$
begin
 begin execute p_sql; exception when others then if sqlstate=any(p_states) then return;end if;raise;end;
 raise exception 'Expected internal intake denial: %',p_sql;
end $$;
select set_config('request.jwt.claim.sub','a4500000-0000-4000-8000-000000000001',true);
select set_config('request.headers','{"x-offroad-workspace":"a4500000-0000-4000-9000-000000000001"}',true);
set local role authenticated;
select pg_temp.internal_intake_denied($q$select public.start_work_v1('a4500000-0000-4000-8000-000000000010','pt-BR','Synthetic document analysis','Organize this synthetic kit','structure_from_documents','authorized_private',null,null,false)$q$,array['42501']);
select public.accept_private_workspace_terms('pt-BR','Synthetic internal owner','',true,true);
select set_config('test.internal_work',(public.start_work_v1('a4500000-0000-4000-8000-000000000010','pt-BR','Synthetic document analysis','Organize this synthetic kit','structure_from_documents','authorized_private',null,null,false)->>'workId'),true);
do $$ declare s uuid; original_conversation uuid; begin
 select conversation_id into original_conversation from public.agent_messages where id='a4500000-0000-4000-8000-000000000010';
 s:=public.prepare_work_document_intake_v1(current_setting('test.internal_work')::uuid,'pt-BR');
 if s<>public.prepare_work_document_intake_v1(current_setting('test.internal_work')::uuid,'pt-BR') then raise exception 'Internal upload retry created another session';end if;
 if not exists(select 1 from public.document_intake_sessions where id=s and capital_project_id=current_setting('test.internal_work')::uuid and journey='institutional' and privacy_status='private' and representation_status='not_claimed') then raise exception 'Internal upload did not use the private institutional journey';end if;
 if (select count(*) from public.document_intake_sessions where capital_project_id=current_setting('test.internal_work')::uuid)<>1 then raise exception 'Internal intake session duplicated';end if;
 if not exists(select 1 from public.agent_messages where id='a4500000-0000-4000-8000-000000000010' and work_id=current_setting('test.internal_work')::uuid and intake_session_id=s and conversation_id=original_conversation) then raise exception 'Internal upload lost the original request';end if;
 if exists(select 1 from public.processing_jobs where work_id=current_setting('test.internal_work')::uuid) then raise exception 'Internal upload preparation called a worker before a file';end if;
 if public.get_workspace_context_v1()#>>'{capabilities,origination_representation}'<>'false' or public.get_workspace_context_v1()#>>'{capabilities,external_disclosure}'<>'false' then raise exception 'Internal upload expanded capabilities';end if;
end $$;
select set_config('request.jwt.claim.sub','a4500000-0000-4000-8000-000000000002',true);
select pg_temp.internal_intake_denied($q$select public.prepare_work_document_intake_v1(current_setting('test.internal_work')::uuid,'pt-BR')$q$,array['42501']);
select set_config('request.jwt.claim.sub','a4500000-0000-4000-8000-000000000003',true);
select pg_temp.internal_intake_denied($q$select public.prepare_work_document_intake_v1(current_setting('test.internal_work')::uuid,'pt-BR')$q$,array['42501']);
reset role;
update public.organization_memberships set status='suspended' where organization_id='a4500000-0000-4000-9000-000000000001' and user_id='a4500000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.sub','a4500000-0000-4000-8000-000000000001',true);
set local role authenticated;
select pg_temp.internal_intake_denied($q$select public.prepare_work_document_intake_v1(current_setting('test.internal_work')::uuid,'pt-BR')$q$,array['42501']);
reset role;
update public.organization_memberships set status='active' where organization_id='a4500000-0000-4000-9000-000000000001' and user_id='a4500000-0000-4000-8000-000000000001';
update public.capital_projects set status='archived',archived_at=now(),archived_by='a4500000-0000-4000-8000-000000000001' where id=current_setting('test.internal_work')::uuid;
set local role authenticated;
select pg_temp.internal_intake_denied($q$select public.prepare_work_document_intake_v1(current_setting('test.internal_work')::uuid,'pt-BR')$q$,array['42501','P0002']);
reset role;
select 'internal_document_intake: PASS' result;
rollback;
