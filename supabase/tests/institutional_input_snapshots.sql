begin;
\ir support/institutional_result_setup.sql
-- Assertions run as the caller; this helper does not confer a privileged execution path.
create function pg_temp.expect_capture_error(statement text,expected text) returns void language plpgsql as $$
begin
 begin execute statement;exception when others then
  if position(expected in sqlerrm)>0 then return;end if;
  raise exception 'Unexpected capture error: % (expected %)',sqlerrm,expected;
 end;
 raise exception 'Expected capture denial: %',expected;
end $$;
set local role authenticated;
select pg_temp.expect_capture_error(format('select public.worker_record_institutional_model_result_v2(%L,repeat(''x'',64),%L::jsonb)',current_setting('test.result_job'),jsonb_build_object('status','completed','artifact',current_setting('test.result_artifact')::jsonb)), 'institutional_result_snapshot_unbound');
-- Completed legacy results retain their original status, without retrospective history.
do $$declare result jsonb;begin
 begin
  perform public.worker_record_institutional_model_result_v1(current_setting('test.result_job')::uuid,repeat('x',64),jsonb_build_object('status','completed','artifact',current_setting('test.result_artifact')::jsonb));
  result:=public.worker_load_institutional_model_context_v2(current_setting('test.result_job')::uuid,repeat('x',64));
  if result ? 'inputSnapshot' or result#>>'{modelResultRequest,status}'<>'completed' then raise exception 'Legacy history fabricated';end if;
  raise exception 'rollback_legacy_probe' using errcode='ZX001';
 exception when sqlstate 'ZX001' then null;end;
end $$;
-- Setup remains compatible and cannot manufacture a result capture.
do $$declare result jsonb;begin
 result:=public.worker_load_institutional_model_context_v2(current_setting('test.setup_job')::uuid,repeat('w',64));
 if result ? 'inputSnapshot' or result->'pendingSetup' is null then raise exception 'Setup compatibility failed';end if;
end $$;
-- Extending the current license cannot retroactively extend the license pinned at capture.
do $$begin
 begin
  perform public.set_source_rights_v1('50000000-0000-4000-8000-000000000882',1,array['read','process','store','derive','export'],array['analysis'],clock_timestamp()+interval '1 second',null,'50000000-0000-4000-8000-000000000882',repeat('b',64));
  perform public.worker_load_institutional_model_context_v2(current_setting('test.result_job')::uuid,repeat('x',64));
  perform public.set_source_rights_v1('50000000-0000-4000-8000-000000000882',2,array['read','process','store','derive','export'],array['analysis'],null,null,'50000000-0000-4000-8000-000000000882',repeat('c',64));
  perform pg_sleep(1.5);
  perform pg_temp.expect_capture_error(format('select public.worker_load_institutional_model_context_v2(%L,repeat(''x'',64))',current_setting('test.result_job')),'institutional_capture_rights_revoked');
  raise exception 'rollback_pinned_expiry_probe' using errcode='ZX001';
 exception when sqlstate 'ZX001' then null;end;
end $$;
select set_config('test.capture',public.worker_load_institutional_model_context_v2(current_setting('test.result_job')::uuid,repeat('x',64))::text,true);
select set_config('test.pin',(current_setting('test.capture')::jsonb->'inputSnapshot')::text,true);
select set_config('test.pinned_result',jsonb_build_object('status','completed','artifact',current_setting('test.result_artifact')::jsonb,'inputSnapshot',current_setting('test.pin')::jsonb)::text,true);
do $$declare result jsonb;begin
 result:=public.worker_load_institutional_model_context_v2(current_setting('test.result_job')::uuid,repeat('x',64));
 if result is distinct from current_setting('test.capture')::jsonb then raise exception 'Retry changed original context';end if;
end $$;
select pg_temp.expect_capture_error(format('select public.worker_load_institutional_model_context_v1(%L,repeat(''x'',64))',current_setting('test.result_job')), 'institutional_snapshot_requires_v2');
select pg_temp.expect_capture_error(format('select public.worker_record_institutional_model_result_v1(%L,repeat(''x'',64),%L::jsonb)',current_setting('test.result_job'),current_setting('test.pinned_result')), 'institutional_snapshot_requires_v2');
select pg_temp.expect_capture_error(format('select public.worker_record_institutional_model_result_v2(%L,repeat(''x'',64),%L::jsonb)',current_setting('test.result_job'),jsonb_set(current_setting('test.pinned_result')::jsonb,'{inputSnapshot,fingerprint}',to_jsonb(repeat('f',64)))), 'institutional_result_snapshot_unbound');
select pg_temp.expect_capture_error(format('select public.worker_record_institutional_model_result_v2(%L,repeat(''x'',64),%L::jsonb)',current_setting('test.result_job'),jsonb_set(current_setting('test.pinned_result')::jsonb,'{inputSnapshot,id}','"95000000-0000-4000-8000-000000000999"')), 'institutional_result_snapshot_unbound');
select pg_temp.expect_capture_error(format('select public.worker_record_institutional_model_result_v2(%L,repeat(''x'',64),%L::jsonb)',current_setting('test.result_job'),jsonb_set(current_setting('test.pinned_result')::jsonb,'{artifact,institutional,scenarios,0,configurationId}','"95000000-0000-4000-8000-000000000999"')), 'institutional_snapshot_scenario_unbound');
reset role;
do $$declare s private.institutional_input_snapshots;begin
 select * into strict s from private.institutional_input_snapshots where job_id=current_setting('test.result_job')::uuid;
 if s.context is distinct from current_setting('test.capture')::jsonb-'inputSnapshot'
 or s.context_fingerprint is distinct from private.institutional_config_hash(s.context)
 or (select count(*) from private.institutional_input_source_links where snapshot_id=s.id)<>2 then raise exception 'Capture integrity mismatch';end if;
 if exists(select 1 from public.audit_events where resource_id=s.id::text and (metadata ? 'context' or metadata ? 'candidates')) then raise exception 'Capture leaked to audit';end if;
end $$;
select pg_temp.expect_capture_error('update private.institutional_input_snapshots set context=''{}''::jsonb','review_history_immutable');
select pg_temp.expect_capture_error('delete from private.institutional_input_source_links','review_history_immutable');
select pg_temp.expect_capture_error(format('insert into public.processing_jobs(organization_id,processing_run_id,intake_session_id,kind,status,payload) select organization_id,processing_run_id,intake_session_id,kind,''queued'',payload from public.processing_jobs where id=%L',current_setting('test.result_job')),'processing_jobs_agent_message_idx');
-- A changed live candidate cannot replace the delivered body on retry and cannot be published.
do $$declare loaded jsonb;begin
 begin
  update public.intake_field_candidates set normalized_value='"777"'::jsonb where organization_id='20000000-0000-4000-8000-000000000881';
  loaded:=public.worker_load_institutional_model_context_v2(current_setting('test.result_job')::uuid,repeat('x',64));
  if loaded is distinct from current_setting('test.capture')::jsonb then raise exception 'Retry recaptured changed candidates';end if;
  perform pg_temp.expect_capture_error(format('select public.worker_record_institutional_model_result_v2(%L,repeat(''x'',64),%L::jsonb)',current_setting('test.result_job'),current_setting('test.pinned_result')),'institutional_result_stale_or_invalid');
  raise exception 'rollback_changed_input_probe' using errcode='ZX001';
 exception when sqlstate 'ZX001' then null;end;
end $$;
-- Source policy retains process/store so the extra derive gate must deny, not the old job check.
set local role authenticated;
do $$begin
 begin
  perform public.set_source_rights_v1('50000000-0000-4000-8000-000000000881',1,array['read','process','store'],array['analysis'],null,null,'50000000-0000-4000-8000-000000000881',repeat('b',64));
  perform pg_temp.expect_capture_error(format('select public.worker_load_institutional_model_context_v2(%L,repeat(''x'',64))',current_setting('test.result_job')),'institutional_capture_rights_revoked');
  perform pg_temp.expect_capture_error(format('select public.worker_record_institutional_model_result_v2(%L,repeat(''x'',64),%L::jsonb)',current_setting('test.result_job'),current_setting('test.pinned_result')),'institutional_capture_rights_revoked');
  raise exception 'rollback_rights_probe' using errcode='ZX001';
 exception when sqlstate 'ZX001' then null;end;
end $$;
-- Expiry may pass while the core is projecting the result, without any policy writer.
reset role;
create function pg_temp.slow_capture_binding() returns trigger language plpgsql as $$begin perform pg_sleep(1.5);return new;end $$;
create trigger synthetic_slow_capture_binding before insert on private.institutional_result_input_bindings for each row execute function pg_temp.slow_capture_binding();
set local role authenticated;
do $$begin
 begin
  perform public.set_source_rights_v1('50000000-0000-4000-8000-000000000882',1,array['read','process','store','derive','export'],array['analysis'],clock_timestamp()+interval '1 second',null,'50000000-0000-4000-8000-000000000882',repeat('b',64));
  perform pg_temp.expect_capture_error(format('select public.worker_record_institutional_model_result_v2(%L,repeat(''x'',64),%L::jsonb)',current_setting('test.result_job'),current_setting('test.pinned_result')),'institutional_capture_rights_revoked');
  raise exception 'rollback_expiry_probe' using errcode='ZX001';
 exception when sqlstate 'ZX001' then null;end;
end $$;
reset role;
drop trigger synthetic_slow_capture_binding on private.institutional_result_input_bindings;
do $$begin
 if (select status from private.institutional_model_results where id='90000000-0000-4000-8000-000000000883')<>'queued'
 or exists(select 1 from private.institutional_result_input_bindings where result_id='90000000-0000-4000-8000-000000000883') then raise exception 'Expiry did not roll back result and binding';end if;
end $$;
set local role authenticated;
-- A blocked result carries the same input binding and remains exactly replayable.
do $$declare r jsonb;v jsonb:=jsonb_build_object('status','blocked','blockers',jsonb_build_array('missing_inputs'),'inputSnapshot',current_setting('test.pin')::jsonb);begin
 begin
  r:=public.worker_record_institutional_model_result_v2(current_setting('test.result_job')::uuid,repeat('x',64),v);
  if r->>'status'<>'blocked' then raise exception 'Blocked capture missing';end if;
  r:=public.worker_record_institutional_model_result_v2(current_setting('test.result_job')::uuid,repeat('x',64),v);
  if r->>'replayed'<>'true' then raise exception 'Blocked replay missing';end if;
  raise exception 'rollback_blocked_probe' using errcode='ZX001';
 exception when sqlstate 'ZX001' then null;end;
end $$;
do $$declare r jsonb;begin
 r:=public.worker_record_institutional_model_result_v2(current_setting('test.result_job')::uuid,repeat('x',64),current_setting('test.pinned_result')::jsonb);
 if r->>'status'<>'completed' or r->>'replayed'<>'false' then raise exception 'Captured result not completed';end if;
 r:=public.worker_record_institutional_model_result_v2(current_setting('test.result_job')::uuid,repeat('x',64),current_setting('test.pinned_result')::jsonb);
 if r->>'replayed'<>'true' then raise exception 'Captured result duplicated';end if;
 r:=public.worker_load_institutional_model_context_v2(current_setting('test.result_job')::uuid,repeat('x',64));
 if r->'inputSnapshot' is distinct from current_setting('test.pin')::jsonb or r#>>'{modelResultRequest,status}'<>'completed' then raise exception 'Terminal capture envelope invalid';end if;
end $$;
reset role;
do $$begin
 if (select count(*) from private.institutional_input_snapshots where job_id=current_setting('test.result_job')::uuid)<>1
 or (select count(*) from private.institutional_result_input_bindings where result_id='90000000-0000-4000-8000-000000000883')<>1 then raise exception 'Capture/result binding not exactly once';end if;
end $$;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000882","role":"authenticated"}',true);
set local role authenticated;
select pg_temp.expect_capture_error(format('select public.worker_load_institutional_model_context_v2(%L,repeat(''x'',64))',current_setting('test.result_job')),'institutional_capture_denied');
select pg_temp.expect_capture_error('select * from private.institutional_input_snapshots','permission denied');
select pg_temp.expect_capture_error('select * from private.institutional_input_source_links','permission denied');
select pg_temp.expect_capture_error('select * from private.institutional_result_input_bindings','permission denied');
select pg_temp.expect_capture_error(format('select private.persist_institutional_model_result_v1(%L,repeat(''x'',64),%L::jsonb,null)',current_setting('test.result_job'),current_setting('test.pinned_result')),'permission denied');
reset role;
select 'institutional_input_snapshots: PASS' as eval;
rollback;
