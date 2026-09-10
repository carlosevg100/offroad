-- Synthetic rollback-only contract for project review roles: preparer, reviewer and approver.
-- The fixture binds a held execution job to a brief through the production binding; every
-- command below is the real public RPC under the actual caller's JWT.
begin;
\ir support/execution_approval.sql

insert into auth.users (id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous) values
  ('10000000-0000-4000-8000-000000000901','authenticated','authenticated','roles-owner@example.invalid','{}','{}',now(),now(),false,false),
  ('10000000-0000-4000-8000-000000000902','authenticated','authenticated','roles-preparer@example.invalid','{}','{}',now(),now(),false,false),
  ('10000000-0000-4000-8000-000000000903','authenticated','authenticated','roles-reviewer@example.invalid','{}','{}',now(),now(),false,false),
  ('10000000-0000-4000-8000-000000000904','authenticated','authenticated','roles-approver@example.invalid','{}','{}',now(),now(),false,false),
  ('10000000-0000-4000-8000-000000000905','authenticated','authenticated','roles-reader@example.invalid','{}','{}',now(),now(),false,false),
  ('10000000-0000-4000-8000-000000000906','authenticated','authenticated','roles-foreign@example.invalid','{}','{}',now(),now(),false,false);
insert into public.organizations (id,organization_type,name,created_by) values
  ('20000000-0000-4000-8000-000000000901','company','Synthetic review roles tenant','10000000-0000-4000-8000-000000000901'),
  ('20000000-0000-4000-8000-000000000902','company','Synthetic foreign tenant','10000000-0000-4000-8000-000000000906');
insert into public.organization_memberships (organization_id,user_id,role,status,joined_at) values
  ('20000000-0000-4000-8000-000000000901','10000000-0000-4000-8000-000000000901','owner','active',now()),
  ('20000000-0000-4000-8000-000000000901','10000000-0000-4000-8000-000000000902','analyst','active',now()),
  ('20000000-0000-4000-8000-000000000901','10000000-0000-4000-8000-000000000903','member','active',now()),
  ('20000000-0000-4000-8000-000000000901','10000000-0000-4000-8000-000000000904','member','active',now()),
  ('20000000-0000-4000-8000-000000000901','10000000-0000-4000-8000-000000000905','member','active',now()),
  ('20000000-0000-4000-8000-000000000902','10000000-0000-4000-8000-000000000906','owner','active',now());
insert into public.document_intake_sessions (id,organization_id,started_by,journey,locale)
values ('40000000-0000-4000-8000-000000000901','20000000-0000-4000-8000-000000000901','10000000-0000-4000-8000-000000000901','company','pt-BR');
insert into public.source_documents (id,organization_id,intake_session_id,object_path,original_name,sha256,processing_status,created_by)
values ('50000000-0000-4000-8000-000000000901','20000000-0000-4000-8000-000000000901','40000000-0000-4000-8000-000000000901','20000000-0000-4000-8000-000000000901/40000000-0000-4000-8000-000000000901/source.pdf','synthetic-source.pdf',repeat('b',64),'ready','10000000-0000-4000-8000-000000000901');
insert into public.intake_field_candidates (id,organization_id,intake_session_id,source_document_id,extractor_key,field_path,field_group,label,normalized_value,value_type,information_class,evidence_rank,source_anchor,confidence,extraction_method,created_by)
values ('51000000-0000-4000-8000-000000000901','20000000-0000-4000-8000-000000000901','40000000-0000-4000-8000-000000000901','50000000-0000-4000-8000-000000000901','roles-fact','transaction.requested_amount','transaction','Synthetic amount','100','number','company_document',6,'{}',1,'user_entry','10000000-0000-4000-8000-000000000901');
insert into public.processing_runs (id,organization_id,intake_session_id,run_no,trigger,status,pipeline_version,created_by)
values ('70000000-0000-4000-8000-000000000901','20000000-0000-4000-8000-000000000901','40000000-0000-4000-8000-000000000901',1,'manual','queued','roles-fixture-v1','10000000-0000-4000-8000-000000000901');
insert into public.processing_jobs (id,organization_id,intake_session_id,processing_run_id,kind,status,payload)
values ('80000000-0000-4000-8000-000000000901','20000000-0000-4000-8000-000000000901','40000000-0000-4000-8000-000000000901','70000000-0000-4000-8000-000000000901','case_analysis','queued','{"analysis_scope":"full_case"}');
select pg_temp.fixture_approve_execution('80000000-0000-4000-8000-000000000901',false,false);

create function pg_temp.as_user(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims',jsonb_build_object('sub',p_user,'role','authenticated','aal','aal1')::text,true);
$$;
create function pg_temp.expect_denied(p_sql text,p_message text) returns void language plpgsql as $$
declare rejected boolean:=false;
begin
  begin
    execute p_sql;
  exception when insufficient_privilege then
    if sqlerrm<>p_message then raise exception 'expected % but got %',p_message,sqlerrm; end if;
    rejected:=true;
  end;
  if not rejected then raise exception 'command was not denied: %',p_sql; end if;
end;
$$;
create function pg_temp.expect_not_found(p_sql text) returns void language plpgsql as $$
declare rejected boolean:=false;
begin
  begin
    execute p_sql;
  exception when no_data_found then rejected:=true;
  end;
  if not rejected then raise exception 'foreign tenant command was not rejected: %',p_sql; end if;
end;
$$;

do $$
declare s public.document_intake_sessions; d public.capital_project_execution_brief_dispatches; fp text;
begin
  select * into strict s from public.document_intake_sessions where id='40000000-0000-4000-8000-000000000901';
  select * into strict d from public.capital_project_execution_brief_dispatches where processing_job_id='80000000-0000-4000-8000-000000000901';
  select brief_fingerprint into strict fp from public.capital_project_execution_briefs where id=d.execution_brief_id;
  perform set_config('test.project_id',s.capital_project_id::text,true);
  perform set_config('test.brief_id',d.execution_brief_id::text,true);
  perform set_config('test.brief_fingerprint',fp,true);
  perform set_config('test.dispatch_id',d.id::text,true);
  perform set_config('test.case_fit_plan',private.provider_case_fit_plan_v1('capital_planning')::text,true);
  -- Every prepare/return/approve command now carries the role gate.
  if position('assert_capital_project_review_action' in pg_get_functiondef('private.request_documentary_work_revision_v1(uuid,uuid,text,uuid,text,text,jsonb)'::regprocedure))=0
    or position('assert_capital_project_review_action' in pg_get_functiondef('private.submit_institutional_model_setup_v1(uuid,text,jsonb,jsonb,uuid,text)'::regprocedure))=0
    or position('assert_capital_project_review_action' in pg_get_functiondef('private.review_institutional_configuration_and_calculate_v1(uuid,uuid,text,text,text,uuid,text)'::regprocedure))=0
    or position('assert_capital_project_review_action' in pg_get_functiondef('private.start_provider_case_fit_project_v1(uuid,text,text,text,jsonb,uuid,uuid,text,jsonb)'::regprocedure))=0
    or position('review_execution_brief_edit_v1' in pg_get_functiondef('private.submit_advisor_execution_brief_edit_v1(uuid,uuid,text,uuid,text,text)'::regprocedure))=0
    or position('assert_capital_project_review_action' in pg_get_functiondef('private.approve_advisor_execution_brief_v1(uuid,uuid,text,uuid)'::regprocedure))=0 then
    raise exception 'a prepare, return or approve command lost its role gate';
  end if;
end;
$$;

-- Open mode: no assignment yet, so an active member keeps every action (compatibility policy),
-- and the approval record is persisted even then. The approval itself is rolled back.
set local role authenticated;
select pg_temp.as_user('10000000-0000-4000-8000-000000000905');
do $$
declare ctx jsonb; result jsonb; d public.capital_project_execution_brief_dispatches; approval jsonb;
begin
  ctx:=public.read_capital_project_review_context_v1(current_setting('test.project_id')::uuid);
  if ctx->>'mode'<>'open' or ctx#>>'{caller,can_prepare}'<>'true' or ctx#>>'{caller,can_return}'<>'true' or ctx#>>'{caller,can_approve}'<>'true'
    or ctx->>'can_manage'<>'false' or ctx#>>'{self_approval,effective}'<>'false' or jsonb_array_length(ctx->'members')<>5 then
    raise exception 'open mode context is wrong: %',ctx;
  end if;
  begin
    result:=public.approve_advisor_execution_brief_v1(current_setting('test.project_id')::uuid,current_setting('test.brief_id')::uuid,current_setting('test.brief_fingerprint'),'a0000000-0000-4000-8000-000000000901');
    if result->>'status'<>'queued' then raise exception 'open mode member approval failed: %',result; end if;
    select * into strict d from public.capital_project_execution_brief_dispatches where id=current_setting('test.dispatch_id')::uuid;
    if d.prepared_by<>'10000000-0000-4000-8000-000000000901' or d.reviewed_by<>'10000000-0000-4000-8000-000000000905' or d.review_decision<>'approved'
      or d.approved_brief_version<>1 or d.approved_brief_fingerprint<>current_setting('test.brief_fingerprint') or d.reviewed_at is null then
      raise exception 'open mode approval record incomplete: %',to_jsonb(d);
    end if;
    approval:=public.read_advisor_execution_brief_approval_v1(current_setting('test.project_id')::uuid,current_setting('test.brief_id')::uuid);
    if approval->>'status'<>'approved' or approval->>'prepared_by'<>'10000000-0000-4000-8000-000000000901' or approval->>'reviewed_by'<>'10000000-0000-4000-8000-000000000905'
      or approval->>'approved_brief_version'<>'1' or approval->>'review_mode'<>'open' then
      raise exception 'approval projection lost the review record: %',approval;
    end if;
    raise exception using errcode='ZX001',message='rollback open mode approval';
  exception when sqlstate 'ZX001' then null;
  end;
end;
$$;
reset role;

-- Management: only organization owners or admins assign roles; assignments require an active member.
set local role authenticated;
select pg_temp.as_user('10000000-0000-4000-8000-000000000905');
select pg_temp.expect_denied($q$select public.set_capital_project_review_assignment_v1(current_setting('test.project_id')::uuid,'10000000-0000-4000-8000-000000000904','approver',true)$q$,'capital_project_review_management_denied');
select pg_temp.expect_denied($q$select public.set_capital_project_review_policy_v1(current_setting('test.project_id')::uuid,'allowed')$q$,'capital_project_review_management_denied');
select pg_temp.expect_denied($q$select public.set_organization_review_policy_v1('20000000-0000-4000-8000-000000000901',true)$q$,'capital_project_review_management_denied');
select pg_temp.as_user('10000000-0000-4000-8000-000000000906');
select pg_temp.expect_not_found($q$select public.set_capital_project_review_assignment_v1(current_setting('test.project_id')::uuid,'10000000-0000-4000-8000-000000000906','approver',true)$q$);
select pg_temp.expect_not_found($q$select public.read_capital_project_review_context_v1(current_setting('test.project_id')::uuid)$q$);
select pg_temp.expect_not_found($q$select public.approve_advisor_execution_brief_v1(current_setting('test.project_id')::uuid,current_setting('test.brief_id')::uuid,current_setting('test.brief_fingerprint'),'a0000000-0000-4000-8000-000000000906')$q$);
select pg_temp.expect_denied($q$select public.set_organization_review_policy_v1('20000000-0000-4000-8000-000000000901',true)$q$,'capital_project_review_management_denied');
do $$ begin
  if (select count(*) from public.capital_project_review_assignments)<>0 then raise exception 'foreign tenant reads review assignments'; end if;
end $$;
select pg_temp.as_user('10000000-0000-4000-8000-000000000901');
do $$
declare first jsonb; replay jsonb; rejected boolean:=false;
begin
  first:=public.set_capital_project_review_assignment_v1(current_setting('test.project_id')::uuid,'10000000-0000-4000-8000-000000000902','preparer',true);
  replay:=public.set_capital_project_review_assignment_v1(current_setting('test.project_id')::uuid,'10000000-0000-4000-8000-000000000902','preparer',true);
  perform public.set_capital_project_review_assignment_v1(current_setting('test.project_id')::uuid,'10000000-0000-4000-8000-000000000903','reviewer',true);
  perform public.set_capital_project_review_assignment_v1(current_setting('test.project_id')::uuid,'10000000-0000-4000-8000-000000000904','approver',true);
  if (first->>'replayed')::boolean or not (replay->>'replayed')::boolean or first->>'assignment_id'<>replay->>'assignment_id'
    or (select count(*) from public.capital_project_review_assignments where capital_project_id=current_setting('test.project_id')::uuid)<>3 then
    raise exception 'assignment commands were not idempotent: % %',first,replay;
  end if;
  begin
    perform public.set_capital_project_review_assignment_v1(current_setting('test.project_id')::uuid,'10000000-0000-4000-8000-000000000906','approver',true);
  exception when invalid_parameter_value then rejected:=true;
  end;
  if not rejected then raise exception 'a non-member received a review role'; end if;
  rejected:=false;
  begin
    perform public.set_capital_project_review_assignment_v1(current_setting('test.project_id')::uuid,'10000000-0000-4000-8000-000000000904','owner',true);
  exception when invalid_parameter_value then rejected:=true;
  end;
  if not rejected then raise exception 'an unknown review role was accepted'; end if;
  rejected:=false;
  begin
    insert into public.capital_project_review_assignments(organization_id,capital_project_id,user_id,review_role,assigned_by)
      values('20000000-0000-4000-8000-000000000901',current_setting('test.project_id')::uuid,'10000000-0000-4000-8000-000000000905','approver','10000000-0000-4000-8000-000000000901');
  exception when insufficient_privilege then rejected:=true;
  end;
  if not rejected then raise exception 'review assignments are tenant-writable outside the command'; end if;
end;
$$;
reset role;

-- Assigned mode: project access alone no longer approves; each role keeps its own action.
set local role authenticated;
select pg_temp.as_user('10000000-0000-4000-8000-000000000905');
do $$
declare ctx jsonb;
begin
  ctx:=public.read_capital_project_review_context_v1(current_setting('test.project_id')::uuid);
  if ctx->>'mode'<>'assigned' or ctx#>>'{caller,can_prepare}'<>'false' or ctx#>>'{caller,can_return}'<>'false' or ctx#>>'{caller,can_approve}'<>'false'
    or (select count(*) from public.capital_project_review_assignments)<>3 then
    raise exception 'read-only member context is wrong: %',ctx;
  end if;
end;
$$;
select pg_temp.expect_denied($q$select public.approve_advisor_execution_brief_v1(current_setting('test.project_id')::uuid,current_setting('test.brief_id')::uuid,current_setting('test.brief_fingerprint'),'a0000000-0000-4000-8000-000000000905')$q$,'capital_project_review_role_required');
select pg_temp.expect_denied($q$select public.submit_advisor_execution_brief_edit_v1(current_setting('test.project_id')::uuid,current_setting('test.brief_id')::uuid,current_setting('test.brief_fingerprint'),'90000000-0000-4000-8000-000000000905','pt-BR','Devolvo o plano para ajustes.')$q$,'capital_project_review_role_required');
select pg_temp.expect_denied($q$select public.record_capital_project_work_request_v1(current_setting('test.project_id')::uuid,'b0000000-0000-4000-8000-000000000905','financial_result','Calcule os cenários.','pt-BR','2026.09.10-project-capabilities-v1','{}'::jsonb,null,'needs_information')$q$,'capital_project_review_role_required');
select pg_temp.expect_denied($q$select public.request_documentary_work_revision_v1(current_setting('test.project_id')::uuid,current_setting('test.brief_id')::uuid,current_setting('test.brief_fingerprint'),'90000000-0000-4000-8000-000000000915','pt-BR','Compare estas propostas.','{}'::jsonb)$q$,'capital_project_review_role_required');
select pg_temp.expect_denied($q$select public.submit_institutional_model_setup_v1(current_setting('test.project_id')::uuid,repeat('a',64),'{}'::jsonb,'[]'::jsonb,'c0000000-0000-4000-8000-000000000905','pt-BR')$q$,'capital_project_review_role_required');
select pg_temp.expect_denied(format($q$select public.start_provider_case_fit_project_v1('d0000000-0000-4000-8000-000000000905','pt-BR','Projeto','Pesquisar financiadores para o caso.',%L::jsonb,null,current_setting('test.project_id')::uuid,repeat('c',64),'{"schemaVersion":"provider-case-criteria.v1","asOf":"2026-09-01T00:00:00Z","currency":"BRL","source":{"kind":"user_confirmed","referenceId":"d0000000-0000-4000-8000-000000000905"}}'::jsonb)$q$,current_setting('test.case_fit_plan')),'capital_project_review_role_required');
select pg_temp.as_user('10000000-0000-4000-8000-000000000902');
select pg_temp.expect_denied($q$select public.approve_advisor_execution_brief_v1(current_setting('test.project_id')::uuid,current_setting('test.brief_id')::uuid,current_setting('test.brief_fingerprint'),'a0000000-0000-4000-8000-000000000902')$q$,'capital_project_review_role_required');
select pg_temp.as_user('10000000-0000-4000-8000-000000000903');
select pg_temp.expect_denied($q$select public.approve_advisor_execution_brief_v1(current_setting('test.project_id')::uuid,current_setting('test.brief_id')::uuid,current_setting('test.brief_fingerprint'),'a0000000-0000-4000-8000-000000000903')$q$,'capital_project_review_role_required');
select pg_temp.expect_denied($q$select public.record_capital_project_work_request_v1(current_setting('test.project_id')::uuid,'b0000000-0000-4000-8000-000000000903','financial_result','Calcule os cenários.','pt-BR','2026.09.10-project-capabilities-v1','{}'::jsonb,null,'needs_information')$q$,'capital_project_review_role_required');
reset role;

-- The preparer passes the prepare gate; the executors' own checks then still apply unchanged.
set local role authenticated;
select pg_temp.as_user('10000000-0000-4000-8000-000000000902');
do $$
declare first jsonb; replay jsonb; rejected boolean:=false; message text;
begin
  first:=public.record_capital_project_work_request_v1(current_setting('test.project_id')::uuid,'b0000000-0000-4000-8000-000000000902','financial_result','Calcule os cenários de serviço da dívida.','pt-BR','2026.09.10-project-capabilities-v1','{"surface":"institutional-setup"}'::jsonb,'document-review','needs_information');
  replay:=public.record_capital_project_work_request_v1(current_setting('test.project_id')::uuid,'b0000000-0000-4000-8000-000000000902','financial_result','Calcule os cenários de serviço da dívida.','pt-BR','2026.09.10-project-capabilities-v1','{"surface":"institutional-setup"}'::jsonb,'document-review','needs_information');
  if (first->>'replayed')::boolean or not (replay->>'replayed')::boolean or first->>'status'<>'needs_information'
    or (select count(*) from public.capital_project_work_requests where capital_project_id=current_setting('test.project_id')::uuid)<>1 then
    raise exception 'work request command was not idempotent: % %',first,replay;
  end if;
  begin
    perform public.record_capital_project_work_request_v1(current_setting('test.project_id')::uuid,'b0000000-0000-4000-8000-000000000902','financial_result','Outro objetivo.','pt-BR','2026.09.10-project-capabilities-v1','{}'::jsonb,null,'needs_information');
  exception when unique_violation then rejected:=true;
  end;
  if not rejected then raise exception 'a reused work request id changed its objective'; end if;
  rejected:=false;
  begin
    perform public.request_documentary_work_revision_v1(current_setting('test.project_id')::uuid,current_setting('test.brief_id')::uuid,current_setting('test.brief_fingerprint'),'90000000-0000-4000-8000-000000000916','pt-BR','Compare estas propostas.','{}'::jsonb);
  exception when insufficient_privilege then rejected:=true; message:=sqlerrm;
  end;
  if not rejected or message<>'documentary_work_scope_invalid' then raise exception 'documentary scope guard changed: %',message; end if;
  rejected:=false;
  begin
    perform public.submit_institutional_model_setup_v1(current_setting('test.project_id')::uuid,repeat('a',64),'{}'::jsonb,'[]'::jsonb,'c0000000-0000-4000-8000-000000000902','pt-BR');
  exception when others then rejected:=true; message:=sqlerrm;
  end;
  if not rejected or message<>'institutional_setup_invalid' then raise exception 'institutional setup validation changed: %',message; end if;
  rejected:=false;
  begin
    perform public.start_provider_case_fit_project_v1('d0000000-0000-4000-8000-000000000902','pt-BR','Projeto','Pesquisar financiadores para o caso.',current_setting('test.case_fit_plan')::jsonb,null,current_setting('test.project_id')::uuid,repeat('c',64),'{"schemaVersion":"provider-case-criteria.v1","asOf":"2026-09-01T00:00:00Z","currency":"BRL","source":{"kind":"user_confirmed","referenceId":"d0000000-0000-4000-8000-000000000902"}}'::jsonb);
  exception when others then rejected:=true; message:=sqlerrm;
  end;
  if not rejected or message<>'case_fit_conversation_missing' then raise exception 'provider case fit checks changed: %',message; end if;
end;
$$;
reset role;

-- A reviewer returns the version: the return is recorded on the approval record and the
-- version can no longer be approved; the preparer's own adjustment is preparation, not a return.
set local role authenticated;
select pg_temp.as_user('10000000-0000-4000-8000-000000000903');
do $$
declare result jsonb; d public.capital_project_execution_brief_dispatches; rejected boolean:=false;
begin
  begin
    result:=public.submit_advisor_execution_brief_edit_v1(current_setting('test.project_id')::uuid,current_setting('test.brief_id')::uuid,current_setting('test.brief_fingerprint'),'90000000-0000-4000-8000-000000000903','pt-BR','Devolvo o plano: inclua a base de cálculo antes de aprovar.');
    if result->>'status'<>'queued' then raise exception 'reviewer return was not accepted: %',result; end if;
    select * into strict d from public.capital_project_execution_brief_dispatches where id=current_setting('test.dispatch_id')::uuid;
    if d.review_decision<>'returned' or d.reviewed_by<>'10000000-0000-4000-8000-000000000903' or d.prepared_by<>'10000000-0000-4000-8000-000000000901' or d.accepted_at is not null then
      raise exception 'return was not recorded on the approval record: %',to_jsonb(d);
    end if;
    if public.read_advisor_execution_brief_approval_v1(current_setting('test.project_id')::uuid,current_setting('test.brief_id')::uuid)->>'status'<>'superseded' then raise exception 'returned version remained approvable'; end if;
    raise exception using errcode='ZX001',message='rollback reviewer return';
  exception when sqlstate 'ZX001' then null;
  end;
end;
$$;
select pg_temp.as_user('10000000-0000-4000-8000-000000000902');
do $$
declare result jsonb; d public.capital_project_execution_brief_dispatches;
begin
  begin
    result:=public.submit_advisor_execution_brief_edit_v1(current_setting('test.project_id')::uuid,current_setting('test.brief_id')::uuid,current_setting('test.brief_fingerprint'),'90000000-0000-4000-8000-000000000902','pt-BR','Inclua a comparação de prazo.');
    if result->>'status'<>'queued' then raise exception 'preparer adjustment was not accepted: %',result; end if;
    select * into strict d from public.capital_project_execution_brief_dispatches where id=current_setting('test.dispatch_id')::uuid;
    if d.review_decision is not null then raise exception 'preparer adjustment was recorded as a review decision'; end if;
    raise exception using errcode='ZX001',message='rollback preparer adjustment';
  exception when sqlstate 'ZX001' then null;
  end;
end;
$$;
reset role;

-- Self-approval: the owner prepared the version. As approver, they approve their own work only
-- when the explicit setting allows; the project setting overrides the organization setting.
set local role authenticated;
select pg_temp.as_user('10000000-0000-4000-8000-000000000901');
select public.set_capital_project_review_assignment_v1(current_setting('test.project_id')::uuid,'10000000-0000-4000-8000-000000000901','approver',true);
select pg_temp.expect_denied($q$select public.approve_advisor_execution_brief_v1(current_setting('test.project_id')::uuid,current_setting('test.brief_id')::uuid,current_setting('test.brief_fingerprint'),'a0000000-0000-4000-8000-000000000911')$q$,'capital_project_self_approval_forbidden');
do $$
declare result jsonb; ctx jsonb;
begin
  perform public.set_organization_review_policy_v1('20000000-0000-4000-8000-000000000901',true);
  ctx:=public.read_capital_project_review_context_v1(current_setting('test.project_id')::uuid);
  if ctx#>>'{self_approval,effective}'<>'true' or ctx#>>'{self_approval,project}'<>'inherit' or ctx#>>'{self_approval,organization}'<>'true' or ctx->>'can_manage'<>'true' then
    raise exception 'organization self-approval setting was not inherited: %',ctx;
  end if;
  begin
    result:=public.approve_advisor_execution_brief_v1(current_setting('test.project_id')::uuid,current_setting('test.brief_id')::uuid,current_setting('test.brief_fingerprint'),'a0000000-0000-4000-8000-000000000912');
    if result->>'status'<>'queued' then raise exception 'inherited self-approval was refused: %',result; end if;
    raise exception using errcode='ZX001',message='rollback inherited self-approval';
  exception when sqlstate 'ZX001' then null;
  end;
  perform public.set_capital_project_review_policy_v1(current_setting('test.project_id')::uuid,'forbidden');
end;
$$;
select pg_temp.expect_denied($q$select public.approve_advisor_execution_brief_v1(current_setting('test.project_id')::uuid,current_setting('test.brief_id')::uuid,current_setting('test.brief_fingerprint'),'a0000000-0000-4000-8000-000000000913')$q$,'capital_project_self_approval_forbidden');
do $$
declare result jsonb; ctx jsonb;
begin
  perform public.set_organization_review_policy_v1('20000000-0000-4000-8000-000000000901',false);
  perform public.set_capital_project_review_policy_v1(current_setting('test.project_id')::uuid,'allowed');
  ctx:=public.read_capital_project_review_context_v1(current_setting('test.project_id')::uuid);
  if ctx#>>'{self_approval,effective}'<>'true' or ctx#>>'{self_approval,project}'<>'allowed' then raise exception 'project self-approval setting was not applied: %',ctx; end if;
  begin
    result:=public.approve_advisor_execution_brief_v1(current_setting('test.project_id')::uuid,current_setting('test.brief_id')::uuid,current_setting('test.brief_fingerprint'),'a0000000-0000-4000-8000-000000000914');
    if result->>'status'<>'queued' then raise exception 'explicit self-approval was refused: %',result; end if;
    raise exception using errcode='ZX001',message='rollback explicit self-approval';
  exception when sqlstate 'ZX001' then null;
  end;
  perform public.set_capital_project_review_policy_v1(current_setting('test.project_id')::uuid,'inherit');
  result:=public.set_capital_project_review_assignment_v1(current_setting('test.project_id')::uuid,'10000000-0000-4000-8000-000000000901','approver',false);
  if (result->>'replayed')::boolean or result->>'status'<>'unassigned' then raise exception 'unassignment did not apply: %',result; end if;
  result:=public.set_capital_project_review_assignment_v1(current_setting('test.project_id')::uuid,'10000000-0000-4000-8000-000000000901','approver',false);
  if not (result->>'replayed')::boolean then raise exception 'repeated unassignment was not idempotent: %',result; end if;
end;
$$;
reset role;

-- The approver approves once; the same command replays without a second execution.
set local role authenticated;
select pg_temp.as_user('10000000-0000-4000-8000-000000000904');
do $$
declare first jsonb; replay jsonb; d public.capital_project_execution_brief_dispatches; approval jsonb;
begin
  first:=public.approve_advisor_execution_brief_v1(current_setting('test.project_id')::uuid,current_setting('test.brief_id')::uuid,current_setting('test.brief_fingerprint'),'a0000000-0000-4000-8000-000000000904');
  replay:=public.approve_advisor_execution_brief_v1(current_setting('test.project_id')::uuid,current_setting('test.brief_id')::uuid,current_setting('test.brief_fingerprint'),'a0000000-0000-4000-8000-000000000904');
  if first->>'status'<>'queued' or replay->>'status'<>'already_approved'
    or (select count(*) from public.capital_project_execution_brief_events where execution_brief_id=current_setting('test.brief_id')::uuid and event_type='accepted')<>1
    or (select status from public.processing_jobs where id='80000000-0000-4000-8000-000000000901')<>'queued' then
    raise exception 'approver approval did not enqueue exactly once: % %',first,replay;
  end if;
  select * into strict d from public.capital_project_execution_brief_dispatches where id=current_setting('test.dispatch_id')::uuid;
  if d.accepted_by<>'10000000-0000-4000-8000-000000000904' or d.reviewed_by<>'10000000-0000-4000-8000-000000000904' or d.prepared_by<>'10000000-0000-4000-8000-000000000901'
    or d.review_decision<>'approved' or d.approved_brief_version<>1 or d.approved_brief_fingerprint<>current_setting('test.brief_fingerprint') then
    raise exception 'approval record was not persisted: %',to_jsonb(d);
  end if;
  if (select event_payload->>'preparedBy' from public.capital_project_execution_brief_events where id=d.accepted_event_id)<>'10000000-0000-4000-8000-000000000901'
    or (select event_payload->>'reviewMode' from public.capital_project_execution_brief_events where id=d.accepted_event_id)<>'assigned' then
    raise exception 'accepted event lost the review record';
  end if;
  approval:=public.read_advisor_execution_brief_approval_v1(current_setting('test.project_id')::uuid,current_setting('test.brief_id')::uuid);
  if approval->>'status'<>'approved' or approval->>'review_decision'<>'approved' or approval->>'reviewed_by'<>'10000000-0000-4000-8000-000000000904' then
    raise exception 'approval projection is wrong after approval: %',approval;
  end if;
end;
$$;
reset role;

-- A material change after approval supersedes it: the same version cannot be approved again and
-- a new version must go through review. Each mutation is isolated and rolled back. This block
-- runs as the database owner with only the approver's claims: the current-state helper is private.
select pg_temp.as_user('10000000-0000-4000-8000-000000000904');
do $$
declare job_id constant uuid:='80000000-0000-4000-8000-000000000901'; approval jsonb; rejected boolean:=false;
begin
  if not private.execution_dispatch_is_current(job_id,true) then raise exception 'approved dispatch is not current before the change'; end if;
  begin
    update public.source_documents set document_version=document_version+1 where id='50000000-0000-4000-8000-000000000901';
    if private.execution_dispatch_is_current(job_id,true) then raise exception 'source change preserved a stale approval'; end if;
    approval:=public.read_advisor_execution_brief_approval_v1(current_setting('test.project_id')::uuid,current_setting('test.brief_id')::uuid);
    if approval->>'status'<>'superseded' then raise exception 'changed inputs still report an approved version: %',approval; end if;
    begin
      perform public.approve_advisor_execution_brief_v1(current_setting('test.project_id')::uuid,current_setting('test.brief_id')::uuid,current_setting('test.brief_fingerprint'),'a0000000-0000-4000-8000-000000000924');
    exception when serialization_failure then rejected:=true;
    end;
    if not rejected then raise exception 'a changed version was approved without a new review'; end if;
    raise exception using errcode='ZX001',message='rollback input mutation';
  exception when sqlstate 'ZX001' then null;
  end;
  if not private.execution_dispatch_is_current(job_id,true) then raise exception 'isolated mutation did not restore the approved dispatch'; end if;
end;
$$;

-- Tenant boundary on the new tables: members of the project read, foreign members see nothing.
set local role authenticated;
select pg_temp.as_user('10000000-0000-4000-8000-000000000905');
do $$ begin
  if (select count(*) from public.capital_project_review_assignments)<>3 or (select count(*) from public.capital_project_work_requests)<>1
    or (select count(*) from public.capital_project_review_policies)<>1 or (select count(*) from public.organization_review_policies)<>1 then
    raise exception 'project member cannot read the review configuration';
  end if;
end $$;
select pg_temp.as_user('10000000-0000-4000-8000-000000000906');
do $$ begin
  if (select count(*) from public.capital_project_review_assignments)+(select count(*) from public.capital_project_work_requests)
    +(select count(*) from public.capital_project_review_policies)+(select count(*) from public.organization_review_policies)<>0 then
    raise exception 'foreign tenant reads review configuration';
  end if;
end $$;
reset role;
rollback;
select 'project_review_roles_passed' as result;
