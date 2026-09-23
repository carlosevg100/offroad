-- A receipt is an immutable worker assertion, not an execution grant.
begin;
\ir support/r01_preparation_setup.sql
\ir support/r01_execution_profile.sql
update private.worker_tokens set execution_account_user_id='10000000-0000-4000-8000-000000000732' where id='a3300000-0000-4000-8000-000000000001';
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000732","role":"authenticated","aal":"aal1"}',true);
create temporary table r01_receipt_fixture as select gen_random_uuid() id,pg_temp.insert_r01_profile(payload) profile_id from r01_profile_test;
create function pg_temp.receipt_state() returns jsonb language sql as $$
 select private.load_r01_preparation_for_receipt_v1('80000000-0000-4000-8000-000000000731',repeat('u',64));
$$;
create temporary table r01_receipt_loaded as select pg_temp.receipt_state() state;
create function pg_temp.record_receipt(input_text text default '{}',expected text default null) returns uuid language sql as $$
 select private.record_r01_preparation_receipt_v1(f.id,'80000000-0000-4000-8000-000000000731',repeat('u',64),f.profile_id,
 coalesce(expected,s.state->>'authoritySnapshotHash'),input_text) from r01_receipt_fixture f cross join r01_receipt_loaded s;
$$;
create function pg_temp.receipt_denied(label text,command text,expected text default null) returns void language plpgsql as $$begin
 begin execute command;exception when others then
 if expected is not null and sqlerrm<>expected then raise;end if;
 if sqlstate not in ('42501','23505','22023') then raise;end if;
 raise notice 'PASS: %',label;return;end;
 raise exception 'Expected receipt denial: %',label;
end $$;
select pg_temp.record_receipt();

insert into public.capital_project_information_requests (
  id, organization_id, capital_project_id, requirement_key, question, why_it_matters,
  decision_impact, acceptable_evidence, answer_kind, choices, priority,
  information_gain, materiality, answerability, redundancy_penalty, status, source_namespace
) values
  ('50000000-0000-4000-8000-000000000731', '20000000-0000-4000-8000-000000000731',
   '30000000-0000-4000-8000-000000000731', 'receivables.r01.field.structure.advance_rate',
   'Qual advance rate devemos testar?', 'Altera o borrowing base.', 'Vira input do modelo.',
   array['Confirmação expressa'], 'number', '{}', 'blocking', 1, 1, 1, 0, 'open',
   'receivables_method_r01_fields'),
  ('50000000-0000-4000-8000-000000000732', '20000000-0000-4000-8000-000000000731',
   '30000000-0000-4000-8000-000000000731', 'receivables.r01.field.structure.reserve_rate',
   'Qual reserve rate devemos testar?', 'Altera a proteção.', 'Vira input do modelo.',
   array['Confirmação expressa'], 'number', '{}', 'blocking', 0.9, 1, 1, 0, 'open',
   'receivables_method_r01_fields');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000732","role":"authenticated","aal":"aal1"}', true);

do $$
declare
  projection jsonb := jsonb_build_object(
    'schemaVersion','project-information-request-projection.v1',
    'projectId','30000000-0000-4000-8000-000000000731',
    'sourceNamespace','receivables_method_r01_fields',
    'requests',jsonb_build_array(
      jsonb_build_object(
        'requirementKey','receivables.r01.field.structure.advance_rate',
        'producerBinding',jsonb_build_object(
          'schemaVersion','receivables-information-request-binding.v1','methodId','R01',
          'sourceDatasetHash','2f825e42d7b1f9ce7f564c55f66ab9ba4822bc6af38586f2c4e42715f4eb5fb8','fieldPath','/structure/advanceRate',
          'valueKind','percentage','unit','percent_0_100','minimum',0,'maximum',100,'options',jsonb_build_array()
        )
      ),
      jsonb_build_object(
        'requirementKey','receivables.r01.field.structure.reserve_rate',
        'producerBinding',jsonb_build_object(
          'schemaVersion','receivables-information-request-binding.v1','methodId','R01',
          'sourceDatasetHash','2f825e42d7b1f9ce7f564c55f66ab9ba4822bc6af38586f2c4e42715f4eb5fb8','fieldPath','/structure/reserveRate',
          'valueKind','percentage','unit','percent_0_100','minimum',0,'maximum',100,'options',jsonb_build_array()
        )
      )
    )
  );
  result jsonb;
begin
  result := public.worker_bind_receivables_information_request_fields_v1(
    '80000000-0000-4000-8000-000000000731', repeat('u',64), projection
  );
  if result ->> 'bound_count' <> '2' then raise exception 'bindings not recorded: %', result; end if;
  result := public.worker_bind_receivables_information_request_fields_v1(
    '80000000-0000-4000-8000-000000000731', repeat('u',64), projection
  );
  if result ->> 'replayed_count' <> '2' then raise exception 'bindings did not replay: %', result; end if;
end;
$$;

reset role;

select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000731","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select public.submit_advisor_information_response_v1('30000000-0000-4000-8000-000000000731','50000000-0000-4000-8000-000000000731',
 (select updated_at from public.capital_project_information_requests where id='50000000-0000-4000-8000-000000000731'),
 '90000000-0000-4000-8000-000000000731','pt-BR','custom','72,5%');
reset role;
-- The next answer needs the previous turn finished; a second queued user message is refused as in progress.
update public.agent_messages set status='completed' where organization_id='20000000-0000-4000-8000-000000000731' and role='user' and status in ('queued','processing');
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000731","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select public.submit_advisor_information_response_v1('30000000-0000-4000-8000-000000000731','50000000-0000-4000-8000-000000000732',
 (select updated_at from public.capital_project_information_requests where id='50000000-0000-4000-8000-000000000732'),
 '90000000-0000-4000-8000-000000000732','pt-BR','custom','3%');
reset role;
-- The next answer needs the previous turn finished; a second queued user message is refused as in progress.
update public.agent_messages set status='completed' where organization_id='20000000-0000-4000-8000-000000000731' and role='user' and status in ('queued','processing');
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000732","role":"authenticated","aal":"aal1"}',true);
-- Persist synthetic derivations of the two actual human answers; this SQL test does
-- not claim semantic financial readiness or substitute for preparer replay.
do $$declare h jsonb;p jsonb;d jsonb;patch_id uuid;m uuid;request_id uuid;revision integer:=1;begin
 select draft into strict d from private.receivables_method_supplement_drafts;
 for m,request_id in select id,(metadata->>'informationRequestId')::uuid from public.agent_messages
 where id in ('90000000-0000-4000-8000-000000000731','90000000-0000-4000-8000-000000000732') order by id loop
 revision:=revision+1;
 p:=jsonb_build_object('schemaVersion','2026.09.07-v1','patchId','information-response:'||m::text,
 'sourceDatasetHash',d->>'sourceDatasetHash','sections','{}'::jsonb,'fields','[]'::jsonb,'evidence','{}'::jsonb,
 'suppliedBy',jsonb_build_object('evidence',jsonb_build_array(jsonb_build_object('sourceClass','user_confirmation','sourceId',m,'anchor','information_request:'||request_id::text))));
 d:=jsonb_set(d,'{revision}',to_jsonb(revision));
 insert into private.receivables_method_supplement_patches(organization_id,capital_project_id,intake_session_id,processing_run_id,processing_job_id,source_dataset_hash,patch_id,patch_fingerprint,patch)
 values('20000000-0000-4000-8000-000000000731','30000000-0000-4000-8000-000000000731','10000000-0000-4000-8000-000000000090',
 '70000000-0000-4000-8000-000000000731','80000000-0000-4000-8000-000000000731',d->>'sourceDatasetHash',p->>'patchId',encode(extensions.digest(convert_to(p::text,'UTF8'),'sha256'),'hex'),p) returning id into patch_id;
 insert into private.receivables_method_supplement_drafts(organization_id,capital_project_id,intake_session_id,source_dataset_hash,revision,draft_fingerprint,caused_by_patch_id,draft)
 values('20000000-0000-4000-8000-000000000731','30000000-0000-4000-8000-000000000731','10000000-0000-4000-8000-000000000090',d->>'sourceDatasetHash',revision,
 encode(extensions.digest(convert_to(d::text,'UTF8'),'sha256'),'hex'),patch_id,d);
 end loop;
end $$;
-- The answers change the approval input and a job carries exactly one dispatch, so the same job cannot be
-- approved again: the post-answer preparation runs on a new job of the same run and session, approved for the
-- current inputs and bound to the same operational account.
insert into public.processing_jobs(id,organization_id,processing_run_id,intake_session_id,kind,status,payload,attempts,lease_expires_at,capability_sha256,leased_by)
select '80000000-0000-4000-8000-000000000732',organization_id,processing_run_id,intake_session_id,kind,'leased',payload,attempts,now()+interval '10 minutes',capability_sha256,leased_by
from public.processing_jobs where id='80000000-0000-4000-8000-000000000731';
select pg_temp.fixture_approve_execution('80000000-0000-4000-8000-000000000732',true);
update public.processing_jobs set leased_account_user_id='10000000-0000-4000-8000-000000000732' where id='80000000-0000-4000-8000-000000000732';
create or replace function pg_temp.receipt_state() returns jsonb language sql as $$
 select private.load_r01_preparation_for_receipt_v1('80000000-0000-4000-8000-000000000732',repeat('u',64));
$$;
create or replace function pg_temp.record_receipt(input_text text default '{}',expected text default null) returns uuid language sql as $$
 select private.record_r01_preparation_receipt_v1(f.id,'80000000-0000-4000-8000-000000000732',repeat('u',64),f.profile_id,
 coalesce(expected,s.state->>'authoritySnapshotHash'),input_text) from r01_receipt_fixture f cross join r01_receipt_loaded s;
$$;
update r01_receipt_fixture set id=gen_random_uuid();
update r01_receipt_loaded set state=pg_temp.receipt_state();
select pg_temp.record_receipt();
do $$declare r record;begin
 select id,response_pins,authority_pins,history_pins into strict r from private.r01_preparation_receipts where id=(select id from r01_receipt_fixture);
 if jsonb_array_length(r.response_pins)<>2 or jsonb_array_length(r.history_pins)<>3
 or private.r01_preparation_receipt_current_v1('20000000-0000-4000-8000-000000000731',r.id,'10000000-0000-4000-8000-000000000731') is not true
 then raise exception 'Two human answers were not preserved';end if;
 raise notice 'PASS: receipt emission preserves every validated human answer';
end $$;
update public.agent_messages set content='82,5%' where id='90000000-0000-4000-8000-000000000731';
do $$begin
 if private.r01_preparation_receipt_current_v1('20000000-0000-4000-8000-000000000731',(select id from r01_receipt_fixture),'10000000-0000-4000-8000-000000000731') is not false then raise exception 'Changed answer remained current';end if;
 raise notice 'PASS: changed human answer invalidates metadata receipt';
end $$;
select 'r01_preparation_metadata_responses: PASS' result;
rollback;
