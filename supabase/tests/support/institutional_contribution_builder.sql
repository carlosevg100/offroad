-- Synthetic helper that invokes the real contribution writer. Caller owns transaction.
create function pg_temp.add_ancestry_contribution(p_parent uuid,p_value text) returns uuid language plpgsql as $$
declare c private.institutional_model_configurations; conf jsonb; a jsonb; b jsonb; evidence jsonb; application jsonb;
 request_id uuid:=gen_random_uuid(); message_id uuid:=gen_random_uuid(); job_id uuid:=gen_random_uuid(); conversation_id uuid;
 answer_time text:=clock_timestamp()::text; source_hash text; idx integer; result jsonb;
begin
 select * into strict c from private.institutional_model_configurations where id=p_parent;
 update private.institutional_model_configurations set status='approved',reviewed_by='10000000-0000-4000-8000-000000000881',reviewed_at=clock_timestamp() where id=c.id and status='review_required';
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
