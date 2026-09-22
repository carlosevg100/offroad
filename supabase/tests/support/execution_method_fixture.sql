-- Synthetic profile and commands fixture; caller provisions the isolated legacy workspace.
insert into private.platform_capability_releases(capability_key,released,exposure,method_id,method_version,method_maturity,approved_by,approved_at,approval_source)
values('synthetic-execution',true,'universal','synthetic-execution','test-v1','tested','Synthetic approver',current_date,'Synthetic rollback-only fixture');
insert into private.platform_method_releases(id,method_id,version,manifest_hash,manifest,components,evidence,approval,capability_key)
values('synthetic-execution-test-v1','synthetic-execution','test-v1',repeat('a',64),
 jsonb_build_object('budget',jsonb_build_object('currency','BRL','maxCostMinorUnits',0,'maxModelCalls',0,'maxDurationMs',31000),'compiler',jsonb_build_object('hash',repeat('b',64),'version','test-v1')),
 '[]','["Synthetic fixture; not professional approval"]','{}','synthetic-execution');
insert into private.execution_method_profiles(id,platform_release_id,serialization_version,canonical_payload,payload_fingerprint,adapter_source_commit,review_evidence)
select 'a4171000-0000-4000-9000-000000000001','synthetic-execution-test-v1','offroad-execution-json-utf16-v1',payload::text,
 encode(extensions.digest(payload::text,'sha256'),'hex'),repeat('c',40),jsonb_build_object('result','approved','subjectCommit',repeat('c',40),'reviewer','Synthetic independent reviewer','sourceHash',repeat('d',64))
from (select jsonb_build_object('schemaVersion','execution-profile.v1','adapter','compiled-single-deterministic.v1','grantsExecution',false,
 'method',jsonb_build_object('platformReleaseId',r.id,'houseReleaseId',null,'methodId',r.method_id,'methodVersion',r.version,'manifestHash',r.manifest_hash,'baseManifestHash',r.manifest_hash,
 'compilerVersion','test-v1','compilerHash',repeat('b',64),'executor',jsonb_build_object('key','synthetic#calculate','version','test-v1','sourceClosureHash',repeat('c',64),'inputContractHash',repeat('d',64),'outputContractHash',repeat('e',64)),'formulas','[]'::jsonb),
 'tools','[]'::jsonb,'allowedEffects','["read_only"]'::jsonb,'limits',jsonb_build_object('maxCostMicrousd',0,'maxModelCalls',0,'maxDurationMs',31000),'originalBudget',r.manifest->'budget') payload
 from private.platform_method_releases r where id='synthetic-execution-test-v1') f;

create function pg_temp.execution_contract_fixture(p_execution uuid,p_duration bigint default 31000) returns jsonb language plpgsql as $$
declare p private.execution_method_profiles;human uuid;revision bigint;policy text;org uuid:='a11b0000-0000-4000-9000-000000000001';work uuid:='a11b0000-0000-4000-9000-000000000002';begin
 select * into strict p from private.execution_method_profiles where id='a4171000-0000-4000-9000-000000000001';
 select id into strict human from private.principals where organization_id=org and user_id='a11b0000-0000-4000-8000-000000000001' and kind='human';
 insert into private.authorization_revisions(organization_id,resource_id,subject_user_id) values(org,work,'a11b0000-0000-4000-8000-000000000001') on conflict do nothing;
 select r.revision into revision from private.authorization_revisions r where organization_id=org and resource_id=work and subject_user_id='a11b0000-0000-4000-8000-000000000001';
 policy:=private.execution_policy_fingerprint_v1(org,work,human,revision);
 return jsonb_build_object('schemaVersion','execution-contract.v1','executionId',p_execution,'organizationId',org,'workId',work,'principalId',human,'requestId',p_execution,'processingRunId',p_execution,
 'purpose','Synthetic deterministic execution proof','method',p.payload->'method','tools','[]'::jsonb,'allowedEffects','["read_only"]'::jsonb,
 'audience',jsonb_build_object('kind','work_participants','workId',work,'policyFingerprint',policy),
 'policy',jsonb_build_object('version','execution-authority.v1','authorityRevision',revision::text,'fingerprint',policy),
 'inputs',jsonb_build_object('snapshotId',p_execution,'fingerprint',encode(extensions.digest('{}','sha256'),'hex'),'sources','[]'::jsonb,'adoptions','[]'::jsonb,'hypotheses','[]'::jsonb),
 'budget',jsonb_build_object('maxCostMicrousd',0,'maxModelCalls',0,'maxDurationMs',p_duration,'expiresAt',clock_timestamp()+interval '1 hour'),'requestedAt',clock_timestamp());
end $$;
create temporary table execution_fixture(contract jsonb,request jsonb,claim jsonb);
insert into execution_fixture(contract) select pg_temp.execution_contract_fixture('a4171000-0000-4000-9000-000000000002');
create function pg_temp.expect_execution_command_error(command text,expected text,test_name text) returns void language plpgsql as $$
begin
 begin execute command;exception when others then
  if sqlerrm=expected then raise notice 'PASS: %',test_name;return;end if;raise;
 end;raise exception 'Missing expected rejection: %',test_name;
end $$;
