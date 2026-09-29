begin;
\ir support/institutional_closure_setup.sql
set local role authenticated;
select set_config('test.closure_capture',public.worker_load_institutional_model_context_v2(current_setting('test.result_job')::uuid,repeat('x',64))::text,true);
select public.worker_record_institutional_model_result_v2(current_setting('test.result_job')::uuid,repeat('x',64),jsonb_build_object('status','completed','artifact',current_setting('test.result_artifact')::jsonb,'inputSnapshot',current_setting('test.closure_capture')::jsonb->'inputSnapshot'));
reset role;
create function pg_temp.closure() returns jsonb language sql as $$select private.institutional_result_source_closure_v1(current_setting('test.result_job')::uuid,repeat('x',64));$$;
do $$declare a jsonb;begin
 a:=pg_temp.closure();
 if a->>'state' is distinct from 'closed' or a->>'authorization' is distinct from 'current_execution_only' or jsonb_array_length(a->'sources')<>2 or jsonb_array_length(a->'configurations')<>1 then raise exception 'closure_complete_and_uncited: %',a;end if;
 if a is distinct from pg_temp.closure() then raise exception 'closure_nondeterministic';end if;
 if has_function_privilege('anon','private.institutional_result_source_closure_v1(uuid,text)','execute') or has_function_privilege('authenticated','private.institutional_result_source_closure_v1(uuid,text)','execute') or has_function_privilege('service_role','private.institutional_result_source_closure_v1(uuid,text)','execute') then raise exception 'closure_grant';end if;
end $$;
-- Revocation keeps process/store to reach the extra derive check.
do $$declare a jsonb;begin
 begin
  perform public.set_source_rights_v1('50000000-0000-4000-8000-000000000882',1,array['read','process','store'],array['analysis'],null,null,'50000000-0000-4000-8000-000000000882',repeat('b',64));
  a:=pg_temp.closure();if a->>'state' is distinct from 'denied' or a ? 'sources' then raise exception 'closure_revocation: %',a;end if;
  raise exception 'rollback_case' using errcode='ZX001';
 exception when sqlstate 'ZX001' then null;end;
end $$;

-- Privileged synthetic captures for adversarial shape tests. Existing immutable rows are never changed.
\ir support/institutional_closure_clone.sql
do $$declare ctx jsonb:=current_setting('test.closure_capture')::jsonb-'inputSnapshot';a jsonb;job uuid;right_id uuid;begin
 -- Calculation without documents still inherits uncited root documents.
 job:=pg_temp.clone_closure(jsonb_set(ctx,'{currentSources}','[]'));
 a:=private.institutional_result_source_closure_v1(job,repeat('x',64));
 if a->>'state' is distinct from 'closed' or jsonb_array_length(a->'sources')<>2 then raise exception 'closure_ancestry_only: %',a;end if;
 job:=pg_temp.clone_closure(ctx,null,false);a:=private.institutional_result_source_closure_v1(job,repeat('x',64));
 if a->>'state' is distinct from 'unresolved' or a ? 'sources' then raise exception 'closure_missing_binding';end if;
 job:=pg_temp.clone_closure(ctx,null,true,true);a:=private.institutional_result_source_closure_v1(job,repeat('x',64));
 if a->>'state' is distinct from 'unresolved' or a ? 'sources' then raise exception 'closure_wrong_binding_hash';end if;
 job:=pg_temp.clone_closure(jsonb_set(ctx,'{approvedConfigurations,0,fingerprint}',to_jsonb(repeat('f',64))));
 a:=private.institutional_result_source_closure_v1(job,repeat('x',64));
 if a->>'state' is distinct from 'unresolved' or a ? 'sources' then raise exception 'closure_configuration_hash';end if;
 job:=pg_temp.clone_closure(jsonb_set(ctx,'{approvedConfigurations}',(ctx->'approvedConfigurations')||jsonb_build_array(jsonb_build_object('id',gen_random_uuid()))));
 a:=private.institutional_result_source_closure_v1(job,repeat('x',64));
 if a->>'state' is distinct from 'unresolved' or a ? 'sources' then raise exception 'closure_second_configuration_unproven';end if;
 job:=pg_temp.clone_closure(jsonb_set(ctx,'{currentSources,0,hash}',to_jsonb(repeat('f',64))));
 a:=private.institutional_result_source_closure_v1(job,repeat('x',64));
 if a->>'state' is distinct from 'unresolved' or a ? 'sources' then raise exception 'closure_source_hash';end if;
 -- One source has a new fixed license in calculation and its original license in ancestry.
 begin
  right_id:=public.set_source_rights_v1('50000000-0000-4000-8000-000000000882',1,array['read','process','store','derive','export'],array['analysis'],clock_timestamp()+interval '3 seconds',null,'50000000-0000-4000-8000-000000000882',repeat('b',64));
  job:=pg_temp.clone_closure(jsonb_set(ctx,'{currentSources}',(select jsonb_agg(value) from jsonb_array_elements(ctx->'currentSources') where value->>'sourceDocument'='50000000-0000-4000-8000-000000000882')),right_id);
  a:=private.institutional_result_source_closure_v1(job,repeat('x',64));
  if a->>'state' is distinct from 'closed' or jsonb_array_length(a->'sources')<>3 then raise exception 'closure_distinct_rights_collapsed: %',a;end if;
  perform public.set_source_rights_v1('50000000-0000-4000-8000-000000000882',2,array['read','process','store','derive','export'],array['analysis'],null,null,'50000000-0000-4000-8000-000000000882',repeat('c',64));
  perform pg_sleep(3.1);
  a:=private.institutional_result_source_closure_v1(job,repeat('x',64));
  if a->>'state' is distinct from 'denied' or a->>'reason'<>'fixed_rights' or a ? 'sources' then raise exception 'closure_expired_pin_widened: %',a;end if;
  raise exception 'rollback_case' using errcode='ZX001';
 exception when sqlstate 'ZX001' then null;end;
end $$;

-- A calculation-only source is included even though the root predates it.
do $$declare ctx jsonb:=current_setting('test.closure_capture')::jsonb-'inputSnapshot';job uuid;a jsonb;sid uuid;begin
 insert into public.source_documents(id,organization_id,intake_session_id,object_path,original_name,sha256,sha256_verified_at,scan_result,processing_status,created_by)
 values('50000000-0000-4000-8000-000000000883','20000000-0000-4000-8000-000000000881','40000000-0000-4000-8000-000000000881','20000000-0000-4000-8000-000000000881/40000000-0000-4000-8000-000000000881/calculation.txt','Synthetic calculation-only.txt',repeat('e',64),now(),'{"verdict":"clean"}','ready','10000000-0000-4000-8000-000000000881');
 ctx:=jsonb_set(ctx,'{currentSources}',ctx->'currentSources'||jsonb_build_array(jsonb_build_object('sourceDocument','50000000-0000-4000-8000-000000000883','version',1,'hash',repeat('e',64))));
 job:=pg_temp.clone_closure(ctx);
 select id into sid from private.institutional_input_snapshots where job_id=job;
 insert into private.institutional_input_source_links(organization_id,snapshot_id,source_version_id,rights_version_id)
 select organization_id,sid,source_version_id,id from private.source_rights_versions where source_version_id='50000000-0000-4000-8000-000000000883';
 a:=private.institutional_result_source_closure_v1(job,repeat('x',64));
 if a->>'state' is distinct from 'closed' or jsonb_array_length(a->'sources')<>3 then raise exception 'closure_calculation_only: %',a;end if;
end $$;
-- Wrong caller/capability cannot use the original capture subject as a permanent grant.
do $$begin
 begin perform private.institutional_result_source_closure_v1(current_setting('test.result_job')::uuid,repeat('z',64));raise exception 'closure_wrong_capability_accepted';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000882","role":"authenticated"}',true);
 begin perform pg_temp.closure();raise exception 'closure_wrong_caller_accepted';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000881","role":"authenticated"}',true);
end $$;

-- Preserve the real authorization predicate; inject latency only, within the rollback subtransaction.
do $$declare definition text;ctx jsonb:=current_setting('test.closure_capture')::jsonb-'inputSnapshot';job uuid;rid uuid;a jsonb;begin
 begin
  select pg_get_functiondef('private.institutional_result_source_closure_v1(uuid,text)'::regprocedure) into definition;
  if position('-- Track all current dependency deadlines' in definition)=0 then raise exception 'temporal_test_baseline_changed';end if;
  definition:=replace(definition,'-- Track all current dependency deadlines','perform pg_sleep(1.5); -- Track all current dependency deadlines');
  execute definition;
  rid:=public.set_source_rights_v1('50000000-0000-4000-8000-000000000881',1,array['read','process','store','derive','export'],array['analysis'],clock_timestamp()+interval '1 second',null,'50000000-0000-4000-8000-000000000881',repeat('b',64));
  job:=pg_temp.clone_closure(jsonb_set(ctx,'{currentSources}',(select jsonb_agg(value) from jsonb_array_elements(ctx->'currentSources') where value->>'sourceDocument'='50000000-0000-4000-8000-000000000881')),rid);
  perform public.set_source_rights_v1('50000000-0000-4000-8000-000000000881',2,array['read','process','store','derive','export'],array['analysis'],null,null,'50000000-0000-4000-8000-000000000881',repeat('c',64));
  a:=private.institutional_result_source_closure_v1(job,repeat('x',64));
  if a->>'reason' is distinct from 'rights_expired' or a ? 'sources' then raise exception 'closure_expiry_during_later_pin: %',a;end if;
  raise exception 'rollback_latency' using errcode='ZX002';
 exception when sqlstate 'ZX002' then null;end;
end $$;

\ir support/institutional_contribution_builder.sql
do $$declare ctx jsonb:=current_setting('test.closure_capture')::jsonb-'inputSnapshot';child uuid; c private.institutional_model_configurations;job uuid;a jsonb;kind text;rev integer:=200;begin
 child:=pg_temp.add_ancestry_contribution(current_setting('test.setup_candidate_id')::uuid,'25');
 select * into c from private.institutional_model_configurations where id=child;
 ctx:=jsonb_set(ctx,'{approvedConfigurations}',ctx->'approvedConfigurations'||jsonb_build_array(jsonb_build_object('id',c.id,'configuration',c.configuration,'fingerprint',c.configuration_fingerprint,'revision',c.revision)));
 job:=pg_temp.clone_closure(ctx);a:=private.institutional_result_source_closure_v1(job,repeat('x',64));
 if a->>'state' is distinct from 'closed' then raise exception 'closure_contribution: %',a;end if;
 update public.agent_messages set content='Synthetic changed answer' where id=c.answer_message_id;
 a:=private.institutional_result_source_closure_v1(job,repeat('x',64));
 if a->>'reason' is distinct from 'ancestry_unresolved' or a ? 'sources' then raise exception 'closure_changed_message: %',a;end if;
 foreach kind in array array['initial_configuration','imported_workbook_proposal','unknown'] loop
  rev:=rev+1;
  insert into private.institutional_model_configurations(organization_id,capital_project_id,revision,configuration,configuration_fingerprint,status,answer_evidence)
  values(c.organization_id,c.capital_project_id,rev,jsonb_build_object('synthetic',kind),private.institutional_config_hash(jsonb_build_object('synthetic',kind)),'review_required',jsonb_build_object('kind',kind)) returning * into c;
  ctx:=current_setting('test.closure_capture')::jsonb-'inputSnapshot';
  ctx:=jsonb_set(ctx,'{approvedConfigurations}',ctx->'approvedConfigurations'||jsonb_build_array(jsonb_build_object('id',c.id,'configuration',c.configuration,'fingerprint',c.configuration_fingerprint,'revision',c.revision)));
  job:=pg_temp.clone_closure(ctx);a:=private.institutional_result_source_closure_v1(job,repeat('x',64));
  if a->>'reason' is distinct from 'ancestry_unresolved' or a ? 'sources' then raise exception 'closure_unsupported_origin: %, %',kind,a;end if;
 end loop;
end $$;

-- Explicit scope, independently of the current job subject's source permissions.
do $$declare job uuid;a jsonb;begin
 job:=pg_temp.clone_closure(current_setting('test.closure_capture')::jsonb-'inputSnapshot',null,true,false,'10000000-0000-4000-8000-000000000882');
 a:=private.institutional_result_source_closure_v1(job,repeat('x',64));
 if a->>'reason' is distinct from 'result_binding_mismatch' or a ? 'sources' then raise exception 'closure_snapshot_subject_mismatch: %',a;end if;
end $$;
-- A policy transition is refused conservatively even when another permanent grant remains.
do $$declare definition text;a jsonb;begin
 begin
  select pg_get_functiondef('private.institutional_result_source_closure_v1(uuid,text)'::regprocedure) into definition;
  definition:=replace(definition,'-- Track all current dependency deadlines','perform pg_sleep(1.5); -- Track all current dependency deadlines');
  execute definition;
  insert into private.resource_access_grants(organization_id,resource_id,subject_user_id,action,grant_basis,valid_from,expires_at) values('20000000-0000-4000-8000-000000000881','30000000-0000-4000-8000-000000000881','10000000-0000-4000-8000-000000000881','read','explicit',clock_timestamp()-interval '1 second',clock_timestamp()+interval '1 second');
  a:=pg_temp.closure();
  if a->>'state' is distinct from 'denied' or a ? 'sources' then raise exception 'closure_grant_expiry_during_evaluation: %',a;end if;
  raise exception 'rollback_policy_latency' using errcode='ZX002';
 exception when sqlstate 'ZX002' then null;end;
end $$;
select 'institutional_source_closure: PASS';
rollback;
