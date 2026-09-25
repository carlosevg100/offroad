-- The new queue execution_id column must not shadow the legacy PL/pgSQL variable.
begin;
\ir support/execution_commands_fixture.sql
update public.document_intake_sessions set current_run_id='a11b0000-0000-4000-9000-000000000005',status='processing'
where id='a11b0000-0000-4000-9000-000000000003';
insert into public.preliminary_understandings(organization_id,intake_session_id,processing_run_id,object_version,status,input_fingerprint,object_fingerprint,payload,decided_by,decided_at)
values('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003','a11b0000-0000-4000-9000-000000000005',1,'confirmed',repeat('a',64),repeat('b',64),'{}','a11b0000-0000-4000-8000-000000000001',now());
do $$ declare first_job uuid; replay_job uuid; begin
 first_job:=private.enqueue_primary_case_analysis('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000005','a11b0000-0000-4000-9000-000000000003');
 replay_job:=private.enqueue_primary_case_analysis('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000005','a11b0000-0000-4000-9000-000000000003');
 if first_job is null or first_job is distinct from replay_job then raise exception 'legacy enqueue replay lost identity';end if;
 if not exists(select 1 from public.processing_jobs where id=first_job and kind='case_analysis' and execution_id is null and controlled_execution_id is not null and payload->>'execution_id'=controlled_execution_id::text) then
  raise exception 'legacy execution identity or payload changed';
 end if;
 if (select count(*) from public.processing_jobs where kind='case_analysis')<>1 then raise exception 'legacy enqueue duplicated job';end if;
 -- The fixture run names no case share, so the job takes the production case ceiling
 -- (migration production_budget_ceilings) and the usual four calls.
 if (select (payload#>>'{model_budget,max_cost_usd}')::numeric from public.processing_jobs where id=first_job) is distinct from 3.10
 or (select (payload#>>'{model_budget,max_calls}')::integer from public.processing_jobs where id=first_job) is distinct from 4 then
  raise exception 'legacy enqueue did not fall back to the production case budget';
 end if;
end $$;
select 'execution_legacy_enqueue: PASS' result;
rollback;
