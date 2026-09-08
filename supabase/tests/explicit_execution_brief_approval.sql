-- Synthetic rollback-only consent boundary regression. Legacy metadata setup uses the
-- shared fixture helper; the owner calls the real public approval RPC directly.
begin;
\ir support/execution_approval.sql

insert into auth.users (id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
values ('10000000-0000-4000-8000-000000000801','authenticated','authenticated','approval-owner@example.invalid','{}','{}',now(),now(),false,false);
insert into public.organizations (id,organization_type,name,created_by)
values ('20000000-0000-4000-8000-000000000801','company','Synthetic approval tenant','10000000-0000-4000-8000-000000000801');
insert into public.organization_memberships (organization_id,user_id,role,status,joined_at)
values ('20000000-0000-4000-8000-000000000801','10000000-0000-4000-8000-000000000801','owner','active',now());
insert into public.document_intake_sessions (id,organization_id,started_by,journey,locale)
values ('40000000-0000-4000-8000-000000000801','20000000-0000-4000-8000-000000000801','10000000-0000-4000-8000-000000000801','company','pt-BR');
insert into public.source_documents (id,organization_id,intake_session_id,object_path,original_name,sha256,processing_status,created_by)
values ('50000000-0000-4000-8000-000000000801','20000000-0000-4000-8000-000000000801','40000000-0000-4000-8000-000000000801','20000000-0000-4000-8000-000000000801/40000000-0000-4000-8000-000000000801/source.pdf','synthetic-source.pdf',repeat('a',64),'ready','10000000-0000-4000-8000-000000000801');
insert into public.intake_field_candidates (id,organization_id,intake_session_id,source_document_id,extractor_key,field_path,field_group,label,normalized_value,value_type,information_class,evidence_rank,source_anchor,confidence,extraction_method,created_by)
values ('51000000-0000-4000-8000-000000000801','20000000-0000-4000-8000-000000000801','40000000-0000-4000-8000-000000000801','50000000-0000-4000-8000-000000000801','approval-fact','transaction.requested_amount','transaction','Synthetic amount','100','number','company_document',6,'{}',1,'user_entry','10000000-0000-4000-8000-000000000801');
insert into public.processing_runs (id,organization_id,intake_session_id,run_no,trigger,status,pipeline_version,created_by)
values ('70000000-0000-4000-8000-000000000801','20000000-0000-4000-8000-000000000801','40000000-0000-4000-8000-000000000801',1,'manual','queued','approval-fixture-v1','10000000-0000-4000-8000-000000000801');
insert into public.processing_jobs (id,organization_id,intake_session_id,processing_run_id,kind,status,payload)
values ('80000000-0000-4000-8000-000000000801','20000000-0000-4000-8000-000000000801','40000000-0000-4000-8000-000000000801','70000000-0000-4000-8000-000000000801','case_analysis','queued','{"analysis_scope":"full_case"}');
-- A creator may finish bounded routing metadata before any brief is bound.
update public.processing_jobs set payload=payload||'{"trigger_event":{"type":"synthetic_initial_route"}}'::jsonb
where id='80000000-0000-4000-8000-000000000801';
do $$
declare rejected boolean:=false;
begin
  begin
    update public.processing_jobs set payload=payload||'{"analysis_scope":"different"}'::jsonb
    where id='80000000-0000-4000-8000-000000000801';
  exception when insufficient_privilege then rejected:=true;
  end;
  if not rejected then raise exception 'unbound dispatch allowed execution scope mutation'; end if;
end;
$$;
select pg_temp.fixture_approve_execution('80000000-0000-4000-8000-000000000801',false,false);

do $$
declare job_id constant uuid:='80000000-0000-4000-8000-000000000801'; rejected boolean;
begin
  if (select status from public.processing_jobs where id=job_id)<>'awaiting_approval'
    or exists(select 1 from public.capital_project_execution_brief_dispatches where processing_job_id=job_id and accepted_at is not null) then
    raise exception 'proposing work implicitly authorized execution';
  end if;
  rejected:=false;
  begin
    update public.processing_jobs set status='queued' where id=job_id;
  exception when insufficient_privilege then rejected:=true;
  end;
  if not rejected then raise exception 'held dispatch escaped without owner approval'; end if;
  rejected:=false;
  begin
    update public.processing_jobs set payload='{"analysis_scope":"different"}' where id=job_id;
  exception when insufficient_privilege then rejected:=true;
  end;
  if not rejected then raise exception 'held dispatch payload was mutable'; end if;
  rejected:=false;
  begin
    update public.processing_jobs set payload=payload||'{"trigger_event":{"type":"synthetic_rewritten_route"}}'::jsonb where id=job_id;
  exception when insufficient_privilege then rejected:=true;
  end;
  if not rejected then raise exception 'bound dispatch permitted routing metadata rewrite'; end if;
  rejected:=false;
  begin
    update public.processing_jobs set intake_session_id=null where id=job_id;
  exception when insufficient_privilege then rejected:=true;
  end;
  if not rejected then raise exception 'linked dispatch downgraded to projectless'; end if;
  rejected:=false;
  begin
    update public.document_intake_sessions set capital_project_id=null where id='40000000-0000-4000-8000-000000000801';
  exception when insufficient_privilege then rejected:=true;
  end;
  if not rejected then raise exception 'session lost immutable project binding'; end if;
end;
$$;

insert into public.agent_conversations (id,organization_id,intake_session_id,state,created_by)
values ('60000000-0000-4000-8000-000000000801','20000000-0000-4000-8000-000000000801','40000000-0000-4000-8000-000000000801','idle','10000000-0000-4000-8000-000000000801');
insert into public.agent_messages (id,organization_id,conversation_id,intake_session_id,role,status,content,locale,metadata,created_by)
values ('90000000-0000-4000-8000-000000000801','20000000-0000-4000-8000-000000000801','60000000-0000-4000-8000-000000000801','40000000-0000-4000-8000-000000000801','user','queued','Qual o status?','pt-BR','{}','10000000-0000-4000-8000-000000000801');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000801","role":"authenticated","aal":"aal1"}',true);
do $$
declare d public.capital_project_execution_brief_dispatches; fingerprint text; rejected boolean:=false;
begin
  select * into strict d from public.capital_project_execution_brief_dispatches where processing_job_id='80000000-0000-4000-8000-000000000801';
  select brief_fingerprint into fingerprint from public.capital_project_execution_briefs where id=d.execution_brief_id;
  begin
    perform public.approve_advisor_execution_brief_v1(d.capital_project_id,d.execution_brief_id,fingerprint,'a0000000-0000-4000-8000-000000000801');
  exception when object_not_in_prerequisite_state then rejected:=true;
  end;
  if not rejected then raise exception 'approval raced an unresolved ordinary followup'; end if;
end;
$$;
reset role;
update public.agent_messages set status='completed' where id='90000000-0000-4000-8000-000000000801';

-- Cancellation of an unaccepted target must not offer an actionable approval.
-- The nested rollback restores the same target for the positive approval below.
do $$
declare d public.capital_project_execution_brief_dispatches; result jsonb;
begin
  select * into strict d from public.capital_project_execution_brief_dispatches where processing_job_id='80000000-0000-4000-8000-000000000801';
  begin
    update public.processing_jobs set status='cancelled' where id=d.processing_job_id;
    result:=public.read_advisor_execution_brief_approval_v1(d.capital_project_id,d.execution_brief_id);
    if result->>'status'<>'unavailable' then raise exception 'terminal unaccepted dispatch still offers approval: %',result; end if;
    raise exception using errcode='ZX001',message='rollback isolated terminal fixture';
  exception when sqlstate 'ZX001' then null;
  end;
end;
$$;
set local role authenticated;
do $$
declare d public.capital_project_execution_brief_dispatches; fingerprint text; first_result jsonb; replay jsonb; rejected boolean:=false;
begin
  select * into strict d from public.capital_project_execution_brief_dispatches where processing_job_id='80000000-0000-4000-8000-000000000801';
  select brief_fingerprint into fingerprint from public.capital_project_execution_briefs where id=d.execution_brief_id;
  begin
    perform public.approve_advisor_execution_brief_v1(d.capital_project_id,d.execution_brief_id,repeat('0',64),'a0000000-0000-4000-8000-000000000801');
  exception when serialization_failure then rejected:=true;
  end;
  if not rejected then raise exception 'approval accepted a different brief fingerprint'; end if;
  first_result:=public.approve_advisor_execution_brief_v1(d.capital_project_id,d.execution_brief_id,fingerprint,'a0000000-0000-4000-8000-000000000801');
  replay:=public.approve_advisor_execution_brief_v1(d.capital_project_id,d.execution_brief_id,fingerprint,'a0000000-0000-4000-8000-000000000801');
  if first_result->>'status'<>'queued' or replay->>'status'<>'already_approved'
    or first_result->>'processing_job_id'<>d.processing_job_id::text
    or replay->>'processing_job_id'<>d.processing_job_id::text
    or (select count(*) from public.capital_project_execution_brief_events where execution_brief_id=d.execution_brief_id and event_type='accepted')<>1 then
    raise exception 'exact approval did not enqueue the same job idempotently';
  end if;
end;
$$;
reset role;

-- Each semantic change is independently rolled back, retaining the original approval
-- as the control. Timestamp/status churn is intentionally not an economic input.
do $$
declare job_id constant uuid:='80000000-0000-4000-8000-000000000801'; mutation text;
begin
  if not private.execution_dispatch_is_current(job_id,true) then raise exception 'harmless completed status turn invalidated approval'; end if;
  update public.source_documents set processing_status='processing',updated_at=now()+interval '1 second' where id='50000000-0000-4000-8000-000000000801';
  if not private.execution_dispatch_is_current(job_id,true) then raise exception 'document operational churn invalidated approval'; end if;
  foreach mutation in array array[
    $q$update public.intake_field_candidates set normalized_value='101' where id='51000000-0000-4000-8000-000000000801'$q$,
    $q$delete from public.intake_field_candidates where id='51000000-0000-4000-8000-000000000801'$q$,
    $q$update public.document_intake_sessions set requested_amount=101 where id='40000000-0000-4000-8000-000000000801'$q$,
    $q$update public.source_documents set document_version=document_version+1 where id='50000000-0000-4000-8000-000000000801'$q$
  ] loop
    begin
      execute mutation;
      if private.execution_dispatch_is_current(job_id,true) then raise exception 'semantic source change preserved stale approval: %',mutation; end if;
      raise exception using errcode='ZX001',message='rollback isolated input mutation';
    exception when sqlstate 'ZX001' then null;
    end;
  end loop;
  if not private.execution_dispatch_is_current(job_id,true) then raise exception 'isolated mutation fixture did not restore control'; end if;
end;
$$;
rollback;
select 'explicit_execution_brief_approval_passed' as result;
