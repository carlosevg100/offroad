\ir execution_artifact_setup.sql
create function pg_temp.commit_adopted(p_exec uuid,p_version uuid default 'a9990000-0000-4000-9000-000000000003',p_snapshot jsonb default '{}'::jsonb,p_sources jsonb default '[]'::jsonb) returns jsonb language plpgsql as $$
declare c jsonb;req jsonb;claim jsonb;packet text:=current_setting('test.producers.packet');
begin
 c:=pg_temp.execution_contract_fixture(p_exec);
 c:=jsonb_set(c,'{inputs,sources}',p_sources);
 c:=jsonb_set(c,'{inputs,fingerprint}',to_jsonb(encode(extensions.digest(p_snapshot::text,'sha256'),'hex')));
 c:=jsonb_set(c,array['inputs',case when exists(select 1 from private.assumption_version_items i join public.adoption_decisions a on a.organization_id=i.organization_id and a.id=i.decision_id where i.version_id=p_version and a.kind='hypothesis') then 'hypotheses' else 'adoptions' end],(select jsonb_build_array(jsonb_build_object('id',i.decision_id,'assumptionVersionId',v.id,'fingerprint',v.content_fingerprint))
 from public.assumption_versions v join private.assumption_version_items i on i.organization_id=v.organization_id and i.version_id=v.id
 where v.id=p_version));
 req:=private.request_work_execution_v1('a4171000-0000-4000-9000-000000000001',c::text,p_snapshot::text);
 claim:=private.claim_work_execution_v1('synthetic-policy-worker-fixture-token-v1',(req->>'jobId')::uuid,60);
 perform private.reserve_execution_operation_v1((req->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,p_exec,claim->>'contractFingerprint','synthetic#calculate','test-v1','read_only',0,0);
 perform private.settle_execution_operation_v2((req->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,p_exec,claim->>'contractFingerprint',packet,'succeeded','calculated',0,0);
 perform private.commit_work_execution_result_v1((req->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,claim->>'contractFingerprint',c#>>'{inputs,fingerprint}',packet,'succeeded','calculated');
 return req;
end $$;
