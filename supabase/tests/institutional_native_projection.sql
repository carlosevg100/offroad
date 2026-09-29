begin;
\ir support/institutional_closure_setup.sql
set local role authenticated;
select set_config('test.native_capture',public.worker_load_institutional_model_context_v2(current_setting('test.result_job')::uuid,repeat('x',64))::text,true);
reset role;
-- Inject a failure at the final authority check. The inner exception block rolls
-- back both the temporary function and every write made by the public command.
do $test$ declare body text; before_revisions bigint; before_bindings bigint; begin
 select count(*) into before_revisions from public.artifact_revisions;
 select count(*) into before_bindings from private.institutional_native_bindings;
 begin
  body:=pg_get_functiondef('private.project_institutional_native_result_v1(uuid,text)'::regprocedure);
  if position('final_proof:=private.institutional_result_source_closure_v1(p_job,p_capability);' in body)=0 then raise exception 'fault_injection_target_missing';end if;
  body:=replace(body,'final_proof:=private.institutional_result_source_closure_v1(p_job,p_capability);',
   'raise exception ''native_final_authority_fault'' using errcode=''ZX123''; final_proof:=private.institutional_result_source_closure_v1(p_job,p_capability);');
  execute body;
  perform public.worker_record_institutional_model_result_v3(current_setting('test.result_job')::uuid,repeat('x',64),jsonb_build_object('status','completed','artifact',current_setting('test.result_artifact')::jsonb,'inputSnapshot',current_setting('test.native_capture')::jsonb->'inputSnapshot'));
  raise exception 'fault_injection_not_reached';
 exception when sqlstate 'ZX123' then null;end;
 if (select count(*) from public.artifact_revisions)<>before_revisions or (select count(*) from private.institutional_native_bindings)<>before_bindings then raise exception 'native_atomic_rollback_failed';end if;
 if (select status from private.institutional_model_results where id=(select (payload->>'message_id')::uuid from public.processing_jobs where id=current_setting('test.result_job')::uuid))<>'queued'
  or exists(select 1 from private.institutional_result_input_bindings where result_id=(select (payload->>'message_id')::uuid from public.processing_jobs where id=current_setting('test.result_job')::uuid))
 then raise exception 'native_raw_result_rollback_failed';end if;
end $test$;
set local role authenticated;
select set_config('test.native_result',public.worker_record_institutional_model_result_v3(current_setting('test.result_job')::uuid,repeat('x',64),jsonb_build_object('status','completed','artifact',current_setting('test.result_artifact')::jsonb,'inputSnapshot',current_setting('test.native_capture')::jsonb->'inputSnapshot'))::text,true);
reset role;
do $$declare result jsonb:=current_setting('test.native_result')::jsonb;r public.artifact_revisions;b private.institutional_native_bindings;reassembled jsonb;again jsonb;begin
 if result#>>'{nativeProjection,state}' is distinct from 'available' then raise exception 'native_projection_missing: %',result;end if;
 select * into strict r from public.artifact_revisions where id=(result#>>'{nativeProjection,revisionId}')::uuid;
 select * into strict b from private.institutional_native_bindings where revision_id=r.id;
 if private.artifact_revision_release_v1(r)<>'internal' then raise exception 'native_implicit_approval';end if;
 if jsonb_array_length(r.manifest->'sources')<>2 or jsonb_array_length(b.closure->'sources')<>2 then raise exception 'native_source_loss';end if;
 select content->'workbook' into reassembled from public.artifact_blocks where revision_id=r.id and block_key='workbook';
 reassembled:=jsonb_set(reassembled,'{institutional,scenarios}',(select jsonb_agg(content->'scenario' order by block_no) from public.artifact_blocks where revision_id=r.id and block_key like 'scenario:%'));
 if reassembled is distinct from current_setting('test.result_artifact')::jsonb then raise exception 'native_content_loss';end if;
 again:=private.project_institutional_native_result_v1(current_setting('test.result_job')::uuid,repeat('x',64));
 if again->>'revisionId'<>r.id::text or again->>'replayed'<>'true' then raise exception 'native_replay_changed';end if;
 if not private.artifact_review_sources_allowed_v1(r.organization_id,r.id,'10000000-0000-4000-8000-000000000881') then raise exception 'native_review_authority_missing';end if;
end $$;
\ir support/institutional_closure_clone.sql
do $test$ begin
 if has_table_privilege('authenticated','private.institutional_native_bindings','SELECT')
  or has_table_privilege('service_role','private.institutional_native_bindings','INSERT')
  or has_function_privilege('anon','public.worker_record_institutional_model_result_v3(uuid,text,jsonb)','EXECUTE')
  or has_function_privilege('authenticated','private.project_institutional_native_result_v1(uuid,text)','EXECUTE')
 then raise exception 'native_unscoped_privilege';end if;
 begin
  perform public.worker_record_institutional_model_result_v3(current_setting('test.result_job')::uuid,repeat('wrong',16),jsonb_build_object('status','completed','artifact',current_setting('test.result_artifact')::jsonb,'inputSnapshot',current_setting('test.native_capture')::jsonb->'inputSnapshot'));
  raise exception 'native_wrong_capability_accepted';
 exception when insufficient_privilege then null;end;
 begin
  update private.institutional_native_bindings set closure_fingerprint=repeat('f',64);
  raise exception 'native_binding_mutable';
 exception when check_violation then if sqlerrm<>'review_history_immutable' then raise;end if;end;
end $test$;
-- Structural fixtures exercise lossless fixed-license pairs and inherited access.
do $test$ declare ctx jsonb:=current_setting('test.native_capture')::jsonb-'inputSnapshot';job uuid;right_id uuid;outcome jsonb;r public.artifact_revisions;b private.institutional_native_bindings;derived jsonb;rr public.artifact_revisions;count_before bigint;begin
 select count(*) into count_before from private.institutional_native_bindings;
 job:=pg_temp.clone_closure(ctx,null,false);
 outcome:=private.project_institutional_native_result_v1(job,repeat('x',64));
 if outcome->>'state' is distinct from 'ineligible' or (select count(*) from private.institutional_native_bindings)<>count_before then raise exception 'native_unproven_projection_written';end if;
 right_id:=public.set_source_rights_v1('50000000-0000-4000-8000-000000000882',1,array['read','process','store','derive','export'],array['analysis'],clock_timestamp()+interval '5 seconds',null,'50000000-0000-4000-8000-000000000882',repeat('b',64));
 job:=pg_temp.clone_closure(jsonb_set(ctx,'{currentSources}',(select jsonb_agg(value) from jsonb_array_elements(ctx->'currentSources') where value->>'sourceDocument'='50000000-0000-4000-8000-000000000882')),right_id);
 outcome:=private.project_institutional_native_result_v1(job,repeat('x',64));
 select * into strict r from public.artifact_revisions where id=(outcome->>'revisionId')::uuid;
 select * into strict b from private.institutional_native_bindings where revision_id=r.id;
 if jsonb_array_length(r.manifest->'sources')<>3 or (select count(*) from private.artifact_dependency_links where revision_id=r.id and link_kind='source_version')<>3 then raise exception 'native_distinct_rights_collapsed';end if;
 begin
  perform private.create_artifact_revision_v1(r.organization_id,b.work_id,'model_result','native-test-ambiguous','internal','worker',r.manifest,'[]',jsonb_build_array(jsonb_build_object('kind','source_version','sourceVersionId','50000000-0000-4000-8000-000000000882','rightsVersionId',null)),null,null,null,null,'10000000-0000-4000-8000-000000000881');
  raise exception 'native_ambiguous_link_accepted';
 exception when invalid_parameter_value then if sqlerrm<>'ambiguous_source_rights' then raise;end if;end;
 derived:=private.create_artifact_revision_v1(r.organization_id,b.work_id,'model_result','native-test-derived','external','worker',jsonb_set(jsonb_set(r.manifest,'{audience}','"external"'),'{provenance,producer}','"different-producer"'),'[]',jsonb_build_array(jsonb_build_object('kind','artifact_revision','derivedFromRevisionId',r.id),jsonb_build_object('kind','source_version','sourceVersionId','50000000-0000-4000-8000-000000000882','rightsVersionId',right_id)),null,null,null,null,'10000000-0000-4000-8000-000000000881');
 select * into strict rr from public.artifact_revisions where id=(derived->>'revision_id')::uuid;
 if private.artifact_revision_release_v1(rr)<>'blocked' then raise exception 'native_derived_implicit_approval';end if;
 if not private.institutional_native_read_allowed_v1(r.organization_id,b.ancestor_revision_id,'10000000-0000-4000-8000-000000000881') then raise exception 'native_legacy_initially_unreadable';end if;
 perform public.set_source_rights_v1('50000000-0000-4000-8000-000000000882',2,array['read','process','store','derive','export'],array['analysis'],null,null,'50000000-0000-4000-8000-000000000882',repeat('c',64));
 perform pg_sleep(5.1);
 if private.institutional_native_read_allowed_v1(r.organization_id,r.id,'10000000-0000-4000-8000-000000000881')
  or private.institutional_native_read_allowed_v1(r.organization_id,b.ancestor_revision_id,'10000000-0000-4000-8000-000000000881')
  or private.institutional_native_read_allowed_v1(r.organization_id,rr.id,'10000000-0000-4000-8000-000000000881')
  or private.artifact_review_sources_allowed_v1(r.organization_id,r.id,'10000000-0000-4000-8000-000000000881')
 then raise exception 'native_expired_fixed_license_widened';end if;
 if private.read_artifact_revision_v1(r.id)#>>'{restriction,kind}' is distinct from 'source_rights'
  or private.read_artifact_revision_v1(b.ancestor_revision_id)#>>'{restriction,kind}' is distinct from 'source_rights'
  or private.read_artifact_revision_v1(rr.id)#>>'{restriction,kind}' is distinct from 'source_rights'
 then raise exception 'native_reader_bypassed_fixed_license';end if;
end $test$;
rollback;
