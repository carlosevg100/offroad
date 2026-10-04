begin;
\ir support/institutional_setup_pending.sql
create function pg_temp.expect_setup_error(sql text,expected text) returns void language plpgsql as $$
begin
 begin execute sql;exception when others then
  if position(expected in sqlerrm)>0 then return;end if;raise;
 end;
 raise exception 'Expected error missing: %',expected;
end $$;
set local role authenticated;
-- Writer cannot invent a capture, and a completed legacy assessment gets no retrospective one.
select pg_temp.expect_setup_error(format('select public.worker_record_initial_institutional_candidate_v2(%L,repeat(''w'',64),%L,%L::jsonb,%L::jsonb)',current_setting('test.setup_job'),'90000000-0000-4000-8000-000000000881',current_setting('test.setup_candidate'),'{}'),'institutional_setup_snapshot_unbound');
do $$declare result jsonb;begin
 begin
  perform public.worker_record_initial_institutional_candidate_v1(current_setting('test.setup_job')::uuid,repeat('w',64),'90000000-0000-4000-8000-000000000881',current_setting('test.setup_candidate')::jsonb);
  result:=public.worker_load_institutional_model_context_v3(current_setting('test.setup_job')::uuid,repeat('w',64));
  if result ? 'setupInputSnapshot' or result#>>'{setupReplay,status}'<>'review_required' then raise exception 'Legacy setup history fabricated';end if;
  raise exception 'rollback_legacy' using errcode='ZX001';
 exception when sqlstate 'ZX001' then null;end;
end $$;
-- Legacy missing-input replay exposes only the basis needed to resume questions.
do $$declare result jsonb;candidate jsonb;begin
 begin
  candidate:=jsonb_build_object('willExecute',false,'status','missing_inputs','prepared',jsonb_build_object('configurationFingerprint',repeat('a',64),'missingInputs',jsonb_build_array(jsonb_build_object('targetPath','openingBalanceSheet.cash','code','fact_missing','detail','synthetic private detail'))));
  perform public.worker_record_initial_institutional_candidate_v1(current_setting('test.setup_job')::uuid,repeat('w',64),'90000000-0000-4000-8000-000000000881',candidate);
  result:=public.worker_load_institutional_model_context_v3(current_setting('test.setup_job')::uuid,repeat('w',64));
  if result ? 'setupInputSnapshot' or result#>'{setupReplay,informationRequestBasis}' is distinct from jsonb_build_object('configurationFingerprint',repeat('a',64),'missingInputs','[{"targetPath":"openingBalanceSheet.cash","code":"fact_missing"}]'::jsonb)
   or result::text like '%synthetic private detail%' then raise exception 'Legacy replay exposed more than minimal question basis';end if;
  raise exception 'rollback_legacy_missing' using errcode='ZX001';
 exception when sqlstate 'ZX001' then null;end;
end $$;
select set_config('test.setup_capture',public.worker_load_institutional_model_context_v3(current_setting('test.setup_job')::uuid,repeat('w',64))::text,true);
select set_config('test.setup_pin',(current_setting('test.setup_capture')::jsonb->'setupInputSnapshot')::text,true);
do $$begin
 if public.worker_load_institutional_model_context_v3(current_setting('test.setup_job')::uuid,repeat('w',64)) is distinct from current_setting('test.setup_capture')::jsonb then raise exception 'Setup retry changed context';end if;
end $$;
select pg_temp.expect_setup_error(format('select public.worker_load_institutional_model_context_v1(%L,repeat(''w'',64))',current_setting('test.setup_job')),'institutional_setup_snapshot_requires_v3');
select pg_temp.expect_setup_error(format('select public.worker_load_institutional_model_context_v2(%L,repeat(''w'',64))',current_setting('test.setup_job')),'institutional_setup_snapshot_requires_v3');
select pg_temp.expect_setup_error(format('select public.worker_record_initial_institutional_candidate_v1(%L,repeat(''w'',64),%L,%L::jsonb)',current_setting('test.setup_job'),'90000000-0000-4000-8000-000000000881',current_setting('test.setup_candidate')),'institutional_setup_snapshot_requires_v2');
select pg_temp.expect_setup_error(format('select public.worker_record_initial_institutional_candidate_v2(%L,repeat(''w'',64),%L,%L::jsonb,%L::jsonb)',current_setting('test.setup_job'),'90000000-0000-4000-8000-000000000881',current_setting('test.setup_candidate'),jsonb_set(current_setting('test.setup_pin')::jsonb,'{fingerprint}',to_jsonb(repeat('f',64)))),'institutional_setup_snapshot_unbound');
select pg_temp.expect_setup_error(format('select public.worker_record_initial_institutional_candidate_v2(%L,repeat(''w'',64),%L,%L::jsonb,%L::jsonb)',current_setting('test.setup_job'),'90000000-0000-4000-8000-000000000881',current_setting('test.setup_candidate'),jsonb_set(current_setting('test.setup_pin')::jsonb,'{id}','"95000000-0000-4000-8000-000000000999"')),'institutional_setup_snapshot_unbound');
select pg_temp.expect_setup_error(format('select public.worker_record_initial_institutional_candidate_v2(%L,repeat(''w'',64),%L,%L::jsonb,%L::jsonb)',current_setting('test.setup_job'),'90000000-0000-4000-8000-000000000881',current_setting('test.setup_candidate'),current_setting('test.setup_pin')::jsonb||'{"extra":true}'::jsonb),'institutional_setup_snapshot_unbound');
reset role;
do $$declare x private.institutional_setup_input_snapshots;begin
 select * into strict x from private.institutional_setup_input_snapshots where job_id=current_setting('test.setup_job')::uuid;
 if x.context is distinct from current_setting('test.setup_capture')::jsonb-'setupInputSnapshot'
 or x.context_fingerprint is distinct from private.institutional_config_hash(x.context)
 or (select count(*) from private.institutional_setup_source_links where snapshot_id=x.id)<>2 then raise exception 'Setup capture integrity mismatch';end if;
 if exists(select 1 from public.audit_events where resource_id=x.id::text and (metadata ? 'context' or metadata ? 'candidates')) then raise exception 'Setup capture leaked to audit';end if;
end $$;
select pg_temp.expect_setup_error('update private.institutional_setup_input_snapshots set context=''{}''::jsonb','review_history_immutable');
select pg_temp.expect_setup_error('delete from private.institutional_setup_source_links','review_history_immutable');
-- A mutable current context is never substituted for the captured one.
do $$begin
 begin
  update public.intake_field_candidates set normalized_value='"777"'::jsonb where organization_id='20000000-0000-4000-8000-000000000881';
  if public.worker_load_institutional_model_context_v3(current_setting('test.setup_job')::uuid,repeat('w',64)) is distinct from current_setting('test.setup_capture')::jsonb then raise exception 'Setup recaptured changed input';end if;
  perform pg_temp.expect_setup_error(format('select public.worker_record_initial_institutional_candidate_v2(%L,repeat(''w'',64),%L,%L::jsonb,%L::jsonb)',current_setting('test.setup_job'),'90000000-0000-4000-8000-000000000881',current_setting('test.setup_candidate'),current_setting('test.setup_pin')),'institutional_setup_sources_changed');
  raise exception 'rollback_changed' using errcode='ZX001';
 exception when sqlstate 'ZX001' then null;end;
end $$;
set local role authenticated;
-- A source absent from selected lineage was nevertheless delivered and must constrain this setup.
do $$begin
 begin
  perform public.set_source_rights_v1('50000000-0000-4000-8000-000000000882',1,array['read','process','store'],array['analysis'],null,null,'50000000-0000-4000-8000-000000000882',repeat('b',64));
  perform pg_temp.expect_setup_error(format('select public.worker_load_institutional_model_context_v3(%L,repeat(''w'',64))',current_setting('test.setup_job')),'institutional_setup_capture_rights_revoked');
  perform pg_temp.expect_setup_error(format('select public.worker_record_initial_institutional_candidate_v2(%L,repeat(''w'',64),%L,%L::jsonb,%L::jsonb)',current_setting('test.setup_job'),'90000000-0000-4000-8000-000000000881',current_setting('test.setup_candidate'),current_setting('test.setup_pin')),'institutional_setup_capture_rights_revoked');
  raise exception 'rollback_rights' using errcode='ZX001';
 exception when sqlstate 'ZX001' then null;end;
end $$;
reset role;
-- Expiry during persistence rolls back both candidate and its binding.
create function pg_temp.slow_setup_binding() returns trigger language plpgsql as $$begin perform pg_sleep(1.5);return new;end $$;
create trigger synthetic_slow_setup_binding before insert on private.institutional_setup_input_bindings for each row execute function pg_temp.slow_setup_binding();
set local role authenticated;
do $$begin
 begin
  perform public.set_source_rights_v1('50000000-0000-4000-8000-000000000882',1,array['read','process','store','derive','export'],array['analysis'],clock_timestamp()+interval '1 second',null,'50000000-0000-4000-8000-000000000882',repeat('b',64));
  perform pg_temp.expect_setup_error(format('select public.worker_record_initial_institutional_candidate_v2(%L,repeat(''w'',64),%L,%L::jsonb,%L::jsonb)',current_setting('test.setup_job'),'90000000-0000-4000-8000-000000000881',current_setting('test.setup_candidate'),current_setting('test.setup_pin')),'institutional_setup_capture_rights_revoked');
  raise exception 'rollback_expiry' using errcode='ZX001';
 exception when sqlstate 'ZX001' then null;end;
end $$;
reset role;
drop trigger synthetic_slow_setup_binding on private.institutional_setup_input_bindings;
do $$begin
 if exists(select 1 from private.institutional_model_configurations where organization_id='20000000-0000-4000-8000-000000000881')
 or exists(select 1 from private.institutional_setup_input_bindings where organization_id='20000000-0000-4000-8000-000000000881') then raise exception 'Setup expiry left partial output';end if;
end $$;
set local role authenticated;
select set_config('test.setup_stored',public.worker_record_initial_institutional_candidate_v2(current_setting('test.setup_job')::uuid,repeat('w',64),'90000000-0000-4000-8000-000000000881',current_setting('test.setup_candidate')::jsonb,current_setting('test.setup_pin')::jsonb)::text,true);
do $$declare result jsonb;begin
 result:=public.worker_record_initial_institutional_candidate_v2(current_setting('test.setup_job')::uuid,repeat('w',64),'90000000-0000-4000-8000-000000000881',current_setting('test.setup_candidate')::jsonb,current_setting('test.setup_pin')::jsonb);
 if result->>'replayed'<>'true' or result->>'candidateId' is distinct from current_setting('test.setup_stored')::jsonb->>'candidateId' then raise exception 'Setup replay duplicated';end if;
 if public.worker_load_institutional_model_context_v3(current_setting('test.setup_job')::uuid,repeat('w',64)) is distinct from current_setting('test.setup_capture')::jsonb then raise exception 'Completed captured setup changed body';end if;
end $$;
select pg_temp.expect_setup_error(format('select public.worker_record_initial_institutional_candidate_v2(%L,repeat(''w'',64),%L,%L::jsonb,%L::jsonb)',current_setting('test.setup_job'),'90000000-0000-4000-8000-000000000881',jsonb_set(current_setting('test.setup_candidate')::jsonb,'{resultFingerprint}',to_jsonb(repeat('b',64))),current_setting('test.setup_pin')),'institutional_setup_snapshot_replay_mismatch');
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000882","role":"authenticated"}',true);
-- The canonical assessment wrapper checks the capability and leased account first.
-- A different authenticated account is denied before any captured setup is read.
do $$begin
 begin
  perform public.worker_load_institutional_model_context_v3(current_setting('test.setup_job')::uuid,repeat('w',64));
  raise exception 'Foreign authenticated account read the captured institutional setup';
 exception when insufficient_privilege then
  if sqlerrm<>'job_capability_invalid' then raise;end if;
 end;
end $$;
reset role;
do $$declare result jsonb;c private.institutional_model_configurations;begin
 select * into strict c from private.institutional_model_configurations where id=(current_setting('test.setup_stored')::jsonb->>'candidateId')::uuid;
 result:=private.institutional_configuration_capture_state_v1(c.organization_id,c.id);
 if result->>'state'<>'captured_root' then raise exception 'Prospective root not recognized: %',result;end if;
 if private.institutional_configuration_capture_state_v1('20000000-0000-4000-8000-000000000882',c.id)->>'state'<>'unresolved' then raise exception 'Foreign root resolved';end if;
 -- An initial configuration with a parent cannot erase or silently close that ancestry.
 insert into private.institutional_model_configurations(organization_id,capital_project_id,revision,configuration,configuration_fingerprint,parent_fingerprint,status,answer_evidence)
 values(c.organization_id,c.capital_project_id,2,c.configuration||'{"synthetic":true}',private.institutional_config_hash(c.configuration||'{"synthetic":true}'),c.configuration_fingerprint,'review_required',c.answer_evidence) returning * into c;
 if private.institutional_configuration_capture_state_v1(c.organization_id,c.id)->>'reason'<>'parent_lineage_unclassified' then raise exception 'Parent ancestry silently discarded';end if;
 insert into private.institutional_model_configurations(organization_id,capital_project_id,revision,configuration,configuration_fingerprint,status,answer_evidence)
 values(c.organization_id,c.capital_project_id,3,'{}',private.institutional_config_hash('{}'),'review_required','{"kind":"imported_workbook_proposal"}') returning * into c;
 if private.institutional_configuration_capture_state_v1(c.organization_id,c.id)->>'state'<>'unresolved' then raise exception 'Import without bound upload resolved';end if;
 insert into private.institutional_model_configurations(organization_id,capital_project_id,revision,configuration,configuration_fingerprint,status,answer_evidence)
 values(c.organization_id,c.capital_project_id,4,'{"synthetic":true}',private.institutional_config_hash('{"synthetic":true}'),'review_required','{"kind":"initial_configuration"}') returning * into c;
 if private.institutional_configuration_capture_state_v1(c.organization_id,c.id)->>'reason'<>'setup_capture_missing' then raise exception 'Historical root invented';end if;
end $$;
rollback;
