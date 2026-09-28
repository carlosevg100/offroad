begin;
\ir support/institutional_setup_pending.sql
set local role authenticated;
select set_config('test.ancestry_capture',public.worker_load_institutional_model_context_v3(current_setting('test.setup_job')::uuid,repeat('w',64))::text,true);
select set_config('test.ancestry_root',public.worker_record_initial_institutional_candidate_v2(current_setting('test.setup_job')::uuid,repeat('w',64),'90000000-0000-4000-8000-000000000881',current_setting('test.setup_candidate')::jsonb,current_setting('test.ancestry_capture')::jsonb->'setupInputSnapshot')->>'candidateId',true);
reset role;
create function pg_temp.ancestry(p_id uuid) returns jsonb language sql as $$select private.institutional_configuration_ancestry_v1('20000000-0000-4000-8000-000000000881','30000000-0000-4000-8000-000000000881',p_id);$$;
do $$declare result jsonb;begin
 result:=pg_temp.ancestry(current_setting('test.ancestry_root')::uuid);
 if result->>'state'<>'captured_lineage' or result->>'authorization'<>'not_evaluated' or jsonb_array_length(result->'nodes')<>1 or jsonb_array_length(result->'sources')<>2 then raise exception 'ancestry_root_and_uncited_source: %',result;end if;
 if result is distinct from pg_temp.ancestry(current_setting('test.ancestry_root')::uuid) then raise exception 'ancestry_nondeterministic';end if;
 if private.institutional_configuration_ancestry_v1('20000000-0000-4000-8000-000000000882','30000000-0000-4000-8000-000000000881',current_setting('test.ancestry_root')::uuid)->>'state'<>'unresolved' then raise exception 'ancestry_foreign_tenant';end if;
 if private.institutional_configuration_ancestry_v1('20000000-0000-4000-8000-000000000881','30000000-0000-4000-8000-000000000882',current_setting('test.ancestry_root')::uuid)->>'reason'<>'work_mismatch' then raise exception 'ancestry_foreign_work';end if;
end $$;
-- Real 3E writer on each edge. Only messages/requests/jobs are privileged synthetic fixtures.
create function pg_temp.add_ancestry_contribution(p_parent uuid,p_value text) returns uuid language plpgsql as $$
declare c private.institutional_model_configurations; conf jsonb; a jsonb; b jsonb; evidence jsonb; application jsonb;
 request_id uuid:=gen_random_uuid(); message_id uuid:=gen_random_uuid(); job_id uuid:=gen_random_uuid(); conversation_id uuid;
 answer_time text:=clock_timestamp()::text; source_hash text; idx integer; result jsonb;
begin
 select * into strict c from private.institutional_model_configurations where id=p_parent;
 update private.institutional_model_configurations set status='approved',reviewed_by='10000000-0000-4000-8000-000000000881',reviewed_at=clock_timestamp() where id=c.id;
 select value,ord::integer-1 into a,idx from jsonb_array_elements(c.configuration#>'{assumptionBook,assumptions}') with ordinality t(value,ord) where value->>'editable'='true' and value->>'unit'='percent' limit 1;
 if a is null then raise exception 'synthetic editable assumption missing';end if;
 b:=jsonb_build_object('schemaVersion','institutional-assumption-answer-binding.v1','category','forecast_premise','targetPaths',jsonb_build_array('assumptionBook.'||(a->>'id')||'.values.2027'),'expectedConfigurationFingerprint',c.configuration_fingerprint,'assumptionId',a->>'id','period','2027','unit','percent','currency','BRL','locale','en-US');
 source_hash:=encode(extensions.digest(convert_to(p_value,'utf8'),'sha256'),'hex');
 evidence:=jsonb_build_object('requestId',request_id,'messageId',message_id,'answeredBy','10000000-0000-4000-8000-000000000881','answeredAt',answer_time,'responseFingerprint',source_hash,'assumptionId',a->>'id','period','2027','unit','percent','priorValue',a#>>'{values,2027}','canonicalValue',private.institutional_response_value(p_value,b,a));
 insert into public.capital_project_information_requests(id,organization_id,capital_project_id,requirement_key,question,why_it_matters,decision_impact,acceptable_evidence,answer_kind,priority,information_gain,materiality,answerability,status,source_namespace)
 values(request_id,c.organization_id,c.capital_project_id,'synthetic.'||request_id::text,'Synthetic question','Synthetic reason','Synthetic impact',array['number'],'number','blocking',1,1,1,'open','institutional_model_assumptions');
 insert into private.institutional_information_request_bindings(organization_id,capital_project_id,information_request_id,binding) values(c.organization_id,c.capital_project_id,request_id,b);
 select id into conversation_id from public.agent_conversations where organization_id=c.organization_id and intake_session_id='40000000-0000-4000-8000-000000000881' limit 1;
 if conversation_id is null then insert into public.agent_conversations(organization_id,intake_session_id,state,created_by) values(c.organization_id,'40000000-0000-4000-8000-000000000881','idle','10000000-0000-4000-8000-000000000881') returning id into conversation_id;end if;
 insert into public.agent_messages(id,organization_id,conversation_id,intake_session_id,role,status,content,locale,metadata,created_by) values(message_id,c.organization_id,conversation_id,'40000000-0000-4000-8000-000000000881','user','queued',p_value,'en-US','{}','10000000-0000-4000-8000-000000000881');
 update public.capital_project_information_requests set status='answered',answer_ref=evidence||jsonb_build_object('answerSource','custom') where id=request_id;
 insert into public.processing_jobs(id,organization_id,processing_run_id,intake_session_id,kind,status,payload,attempts,lease_expires_at,capability_sha256)
 values(job_id,c.organization_id,'70000000-0000-4000-8000-000000000881','40000000-0000-4000-8000-000000000881','agent_operation_brief','leased',jsonb_build_object('message_id',message_id,'locale','en-US'),1,clock_timestamp()+interval '10 minutes',extensions.digest(repeat('w',64),'sha256'));
 conf:=c.configuration;
 a:=a||jsonb_build_object('values',jsonb_set(a->'values',array['2027'],evidence->'canonicalValue'),'sourceType','offroad_scenario','evidence','[]'::jsonb,'confidence','low','rationale','User-supplied value for scenario testing; still subject to review.','methodology','Explicit user scenario value; percent_to_ratio; answer '||message_id::text||'.');
 conf:=jsonb_set(conf,array['assumptionBook','assumptions',idx::text],a);
 conf:=jsonb_set(conf,'{assumptionBook}',conf->'assumptionBook'||jsonb_build_object('scenarioId','institutional-response:'||message_id::text,'scenarioName','User-proposed scenario','parentScenarioId',c.configuration#>>'{assumptionBook,scenarioId}','overrides',jsonb_build_array(jsonb_build_object('assumptionId',a->>'id','values',jsonb_build_object('2027',evidence->'canonicalValue'),'rationale',a->>'rationale','requestedBy',evidence->>'answeredBy','createdAt',answer_time))));
 application:=jsonb_build_object('status','review_required','willExecute',false,'patchId','information-response:'||message_id::text,'expectedConfigurationFingerprint',c.configuration_fingerprint,'nextConfigurationFingerprint',private.institutional_config_hash(conf),'nextConfiguration',conf,'answerEvidence',evidence);
 result:=public.worker_apply_institutional_assumption_answer_v1(job_id,repeat('w',64),application);
 return (result->>'candidateId')::uuid;
end $$;
select set_config('test.ancestry_child',pg_temp.add_ancestry_contribution(current_setting('test.ancestry_root')::uuid,'45')::text,true);
select set_config('test.ancestry_grandchild',pg_temp.add_ancestry_contribution(current_setting('test.ancestry_child')::uuid,'46')::text,true);
do $$declare result jsonb;begin
 result:=pg_temp.ancestry(current_setting('test.ancestry_grandchild')::uuid);
 if result->>'state'<>'captured_lineage' or jsonb_array_length(result->'nodes')<>3 or jsonb_array_length(result->'sources')<>2 then raise exception 'ancestry_two_real_contributions: %',result;end if;
 if result is distinct from pg_temp.ancestry(current_setting('test.ancestry_grandchild')::uuid) then raise exception 'ancestry_chain_nondeterministic';end if;
 begin
  update public.agent_messages set content='47' where id=(select answer_message_id from private.institutional_model_configurations where id=current_setting('test.ancestry_child')::uuid);
  result:=pg_temp.ancestry(current_setting('test.ancestry_grandchild')::uuid);
  if result->>'state'<>'unresolved' or result ? 'nodes' or result ? 'sources' then raise exception 'ancestry_mutated_ancestor_accepted';end if;
  raise exception 'rollback_mutation' using errcode='ZX001';
 exception when sqlstate 'ZX001' then null;end;
end $$;
-- A read-only integrity classification never confers currently revoked source rights.
do $$declare before jsonb;begin
 before:=pg_temp.ancestry(current_setting('test.ancestry_grandchild')::uuid);
 begin
  perform public.set_source_rights_v1('50000000-0000-4000-8000-000000000882',1,array['read','process','store'],array['analysis'],null,null,'50000000-0000-4000-8000-000000000882',repeat('b',64));
  if pg_temp.ancestry(current_setting('test.ancestry_grandchild')::uuid) is distinct from before then raise exception 'ancestry_rewrote_history_for_rights';end if;
  if private.institutional_setup_snapshot_authorized_v1((current_setting('test.ancestry_capture')::jsonb#>>'{setupInputSnapshot,id}')::uuid,current_setting('test.setup_job')::uuid) then raise exception 'ancestry_revocation_ignored_by_authority';end if;
  raise exception 'rollback_rights' using errcode='ZX001';
 exception when sqlstate 'ZX001' then null;end;
end $$;
do $$declare last_id uuid:=current_setting('test.ancestry_grandchild')::uuid; result jsonb;i integer;begin
 for i in 4..128 loop last_id:=pg_temp.add_ancestry_contribution(last_id,(50+i)::text);end loop;
 result:=pg_temp.ancestry(last_id);
 if result->>'state'<>'captured_lineage' or jsonb_array_length(result->'nodes')<>128 then raise exception 'ancestry_128_boundary: %',result;end if;
 last_id:=pg_temp.add_ancestry_contribution(last_id,'179');result:=pg_temp.ancestry(last_id);
 if result->>'reason'<>'depth_limit' or result ? 'nodes' or result ? 'sources' then raise exception 'ancestry_truncated_chain_accepted: %',result;end if;
end $$;
-- Parent substitution cannot redirect an existing receipt, and a result without a receipt stays unknown.
do $$declare result jsonb; c private.institutional_model_configurations; orphan uuid;begin
 begin
  update private.institutional_model_configurations set parent_fingerprint=repeat('f',64) where id=current_setting('test.ancestry_child')::uuid;
  result:=pg_temp.ancestry(current_setting('test.ancestry_grandchild')::uuid);
  if result->>'reason'<>'contribution_parent_mismatch' or result ? 'nodes' or result ? 'sources' then raise exception 'ancestry_parent_substitution_accepted: %',result;end if;
  raise exception 'rollback_parent' using errcode='ZX001';
 exception when sqlstate 'ZX001' then null;
 when raise_exception then if sqlerrm<>'institutional_revision_immutable' then raise;end if;end;
 select * into strict c from private.institutional_model_configurations where id=current_setting('test.ancestry_child')::uuid;
 insert into private.institutional_model_configurations(organization_id,capital_project_id,revision,configuration,configuration_fingerprint,parent_fingerprint,status,answer_evidence)
 values(c.organization_id,c.capital_project_id,150,c.configuration||'{"syntheticOrphan":true}',private.institutional_config_hash(c.configuration||'{"syntheticOrphan":true}'),c.parent_fingerprint,'review_required',c.answer_evidence) returning id into orphan;
 result:=pg_temp.ancestry(orphan);
 if result->>'reason'<>'contribution_receipt_missing' or result ? 'nodes' or result ? 'sources' then raise exception 'ancestry_missing_receipt_accepted';end if;
end $$;
do $$declare kind text;candidate uuid;rev integer:=200;result jsonb;begin
 foreach kind in array array['initial_configuration','imported_workbook_proposal','unknown'] loop
  rev:=rev+1;
  insert into private.institutional_model_configurations(organization_id,capital_project_id,revision,configuration,configuration_fingerprint,status,answer_evidence)
  values('20000000-0000-4000-8000-000000000881','30000000-0000-4000-8000-000000000881',rev,jsonb_build_object('synthetic',kind),private.institutional_config_hash(jsonb_build_object('synthetic',kind)),'review_required',jsonb_build_object('kind',kind)) returning id into candidate;
  result:=pg_temp.ancestry(candidate);
  if result->>'state'<>'unresolved' or result ? 'nodes' or result ? 'sources' then raise exception 'ancestry_unsupported_origin_accepted: %',kind;end if;
 end loop;
 if has_function_privilege('anon','private.institutional_configuration_ancestry_v1(uuid,uuid,uuid)','EXECUTE') or has_function_privilege('authenticated','private.institutional_configuration_ancestry_v1(uuid,uuid,uuid)','EXECUTE') or has_function_privilege('service_role','private.institutional_configuration_ancestry_v1(uuid,uuid,uuid)','EXECUTE') then raise exception 'ancestry_client_grant';end if;
end $$;
select 'institutional_configuration_ancestry: PASS';
rollback;
