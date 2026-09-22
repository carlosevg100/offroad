-- A decision pin belongs to one immutable version in the same work. Rollback only.
begin;
\ir support/contextual_adoption_setup.sql
\ir support/execution_method_fixture.sql
select public.adopt_observation_for_work_v1(current_setting('test.adoption.payload')::jsonb);
update execution_fixture set contract=jsonb_set(contract,'{inputs,adoptions}',(
 select jsonb_build_array(jsonb_build_object('id',i.decision_id,'assumptionVersionId',v.id,'fingerprint',v.content_fingerprint))
 from public.assumption_versions v join private.assumption_version_items i on i.organization_id=v.organization_id and i.version_id=v.id
 where v.id='a9990000-0000-4000-9000-000000000003'));
select pg_temp.expect_execution_command_error($q$select private.request_work_execution_v1('a4171000-0000-4000-9000-000000000001',jsonb_set(contract,'{inputs,adoptions,0,assumptionVersionId}',to_jsonb(gen_random_uuid()))::text,'{}') from execution_fixture$q$,'execution_basis_pin_denied','unknown basis version denied');
select pg_temp.expect_execution_command_error($q$select private.request_work_execution_v1('a4171000-0000-4000-9000-000000000001',jsonb_set(contract,'{inputs,adoptions,0,fingerprint}',to_jsonb(repeat('0',64)))::text,'{}') from execution_fixture$q$,'execution_basis_pin_denied','changed basis fingerprint denied');
select pg_temp.expect_execution_command_error($q$select private.request_work_execution_v1('a4171000-0000-4000-9000-000000000001',jsonb_set(contract,'{inputs,adoptions,0,id}',to_jsonb(gen_random_uuid()))::text,'{}') from execution_fixture$q$,'execution_basis_decision_denied','decision outside basis denied');
update execution_fixture set request=private.request_work_execution_v1('a4171000-0000-4000-9000-000000000001',contract::text,'{}');
update execution_fixture set claim=private.claim_work_execution_v1('synthetic-policy-worker-fixture-token-v1',(request->>'jobId')::uuid,60);
-- A basis reference must not conceal revocation of its underlying observation source.
select private.set_source_rights_v1('a11b0000-0000-4000-9000-000000000004',1,array['read','store'],array['analysis','retrieval'],null,null,gen_random_uuid(),repeat('c',64));
select pg_temp.expect_execution_command_error($q$select private.commit_work_execution_result_v1((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,claim->>'contractFingerprint',contract#>>'{inputs,fingerprint}','{}','succeeded','calculated') from execution_fixture$q$,'execution_authority_denied','basis inherits observation source revocation');
select 'execution_basis: PASS' result;
rollback;
