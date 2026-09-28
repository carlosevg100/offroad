begin;
\ir support/institutional_result_setup.sql
set local role authenticated;
do $$declare a jsonb:=current_setting('test.result_artifact')::jsonb;changed jsonb;result jsonb;accepted boolean:=false;begin
 result:=public.read_institutional_model_results_v1('30000000-0000-4000-8000-000000000881');
 if result#>>'{latest,status}'<>'queued' or result#>'{latest,artifact}'<>'null'::jsonb then raise exception 'Uncalculated artifact exposed';end if;
 if jsonb_array_length(result->'comparisonResults')<>0 then raise exception 'Uncalculated comparison exposed';end if;
 changed:=jsonb_set(a,'{institutional,scenarios,0,input,openingBalanceSheet,unrestrictedCash}','"777"');
 changed:=jsonb_set(changed,'{fingerprint}',to_jsonb(pg_temp.fixture_institutional_hash(changed-'fingerprint')));
 begin perform public.worker_record_institutional_model_result_v1(current_setting('test.result_job')::uuid,repeat('x',64),jsonb_build_object('status','completed','artifact',changed));accepted:=true;exception when others then null;end;
 if accepted then raise exception 'Forged historical economics accepted';end if;
 -- Probe editable v2 in a subtransaction, then roll back to exercise original v1 persistence too.
 changed:=jsonb_set(a,'{version}','"institutional-workbook-editable.v2"');
 changed:=jsonb_set(changed,'{fingerprint}',to_jsonb(pg_temp.fixture_institutional_hash(changed-'fingerprint')));
 begin
  result:=public.worker_record_institutional_model_result_v1(current_setting('test.result_job')::uuid,repeat('x',64),jsonb_build_object('status','completed','artifact',changed));
  if result->>'status'<>'completed' then raise exception 'Editable v2 result not accepted';end if;
  raise exception 'rollback_v2_probe' using errcode='ZX001';
 exception when sqlstate 'ZX001' then null;end;
 changed:=jsonb_set(a,'{version}','"institutional-workbook-unknown.v3"');
 changed:=jsonb_set(changed,'{fingerprint}',to_jsonb(pg_temp.fixture_institutional_hash(changed-'fingerprint')));
 accepted:=false;
 begin perform public.worker_record_institutional_model_result_v1(current_setting('test.result_job')::uuid,repeat('x',64),jsonb_build_object('status','completed','artifact',changed));accepted:=true;exception when others then null;end;
 if accepted then raise exception 'Unrecognized workbook contract accepted';end if;

 result:=public.worker_record_institutional_model_result_v1(current_setting('test.result_job')::uuid,repeat('x',64),jsonb_build_object('status','completed','artifact',a));
 if result->>'status'<>'completed' then raise exception 'Approved result not stored';end if;
 result:=public.worker_record_institutional_model_result_v1(current_setting('test.result_job')::uuid,repeat('x',64),jsonb_build_object('status','completed','artifact',a));
 if result->>'replayed'<>'true' then raise exception 'Result replay duplicated';end if;
 result:=public.read_institutional_model_results_v1('30000000-0000-4000-8000-000000000881');
 if result#>'{latest,artifact}' is distinct from a then raise exception 'Result download binding unavailable';end if;
 if jsonb_array_length(result->'comparisonResults')<>1 or result#>'{comparisonResults,0,artifact}' is distinct from a then raise exception 'Reviewed comparison not bound to completed artifact';end if;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000882","role":"authenticated"}',true);
set local role authenticated;
do $$declare accepted boolean:=false;begin
 begin perform public.read_institutional_model_results_v1('30000000-0000-4000-8000-000000000881');accepted:=true;exception when insufficient_privilege then null;end;
 if accepted then raise exception 'Other tenant read reviewed comparisons';end if;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000881","role":"authenticated"}',true);
insert into public.source_documents(organization_id,intake_session_id,opportunity_id,object_path,original_name,mime_type,byte_size,sha256,document_version,logical_source_id,created_by,processing_status) select organization_id,intake_session_id,opportunity_id,object_path||'.next',original_name,mime_type,byte_size,repeat('e',64),document_version+1,logical_source_id,created_by,'ready' from public.source_documents where id='50000000-0000-4000-8000-000000000881';
-- Replacing the active input detaches the old projection; its bytes remain in source_versions.
delete from public.source_documents where id='50000000-0000-4000-8000-000000000881';
set local role authenticated;
do $$declare result jsonb;begin
 result:=public.worker_load_institutional_model_context_v1(current_setting('test.setup_job')::uuid,repeat('w',64));
 if jsonb_array_length(result->'approvedConfigurations')<>0 or jsonb_array_length(result->'candidates')<>0 then raise exception 'Stale source extraction/configuration survived';end if;
 result:=public.read_institutional_model_results_v1('30000000-0000-4000-8000-000000000881');
 if result#>>'{latest,status}'<>'stale' or result#>'{latest,artifact}'<>'null'::jsonb then raise exception 'Stale artifact exposed';end if;
 if jsonb_array_length(result->'comparisonResults')<>0 then raise exception 'Stale source comparison exposed';end if;
end $$;
rollback;
