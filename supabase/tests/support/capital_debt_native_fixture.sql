-- Continuation of actual start_work -> brief compiler -> human approval.
-- Transaction-local Storage metadata proves SQL protocol only, not HTTP bytes.
reset role;
create temp table debt_proof(k text primary key,v jsonb);
grant all on debt_proof to authenticated;
insert into debt_proof select 'job',jsonb_build_object('id',id) from public.processing_jobs
where organization_id='a8800000-0000-4000-8000-000000000002' and kind='capital_project_analysis'
and id=(select(v#>>'{activation,job_id}')::uuid from agent_fixture where k='recorded');
do $$begin if(select count(*) from debt_proof where k='job')<>1 then raise exception 'debt_actual_activated_job_missing';end if;end$$;
update public.processing_jobs set available_at=(select coalesce(min(available_at),now())-interval '1 second' from public.processing_jobs where status in('queued','leased')) where id=(select(v->>'id')::uuid from debt_proof where k='job');
update private.capital_public_retention_controls set enabled=true;
set local role authenticated;
insert into debt_proof values('claim',public.worker_claim_job_v3(repeat('d',64),600));
do $$begin if(select v->>'job_id' from debt_proof where k='claim') is distinct from(select v->>'id' from debt_proof where k='job') then raise exception 'debt_exact_target_not_claimed';end if;end$$;
select public.worker_claim_capital_capture_purge_v1(repeat('d',64));
insert into debt_proof select 'base',public.worker_prepare_capital_debt_recipe_v1((v->>'job_id')::uuid,v->>'capability_token') from debt_proof where k='claim';
insert into debt_proof select 'context_allocation',public.worker_prepare_capital_debt_context_v1((j.v->>'job_id')::uuid,j.v->>'capability_token',(b.v->>'recipeId')::uuid,gen_random_uuid()) from debt_proof j,debt_proof b where j.k='claim' and b.k='base';
reset role;
insert into storage.objects(bucket_id,name,metadata,version) select v->>'bucket',v->>'path',jsonb_build_object('size',(v->>'byteLength')::bigint,'mimetype','application/json'),'debt-context-sql-v1' from debt_proof where k='context_allocation';
insert into debt_proof select 'context_object',jsonb_build_object('id',o.id) from storage.objects o,debt_proof f where f.k='context_allocation' and o.bucket_id=f.v->>'bucket' and o.name=f.v->>'path';
set local role authenticated;
insert into debt_proof select 'context_retained',public.worker_commit_capital_debt_body_v1((j.v->>'job_id')::uuid,j.v->>'capability_token',(a.v->>'allocationId')::uuid,(o.v->>'id')::uuid,'debt-context-sql-v1',a.v->>'payloadFingerprint',(a.v->>'byteLength')::bigint)
from debt_proof j,debt_proof a,debt_proof o where j.k='claim' and a.k='context_allocation' and o.k='context_object';
reset role;
-- Renderer receives only frozen finite context, never the capability or token.
insert into agent_fixture select 'debt_render_input',jsonb_build_object('context',(v->>'canonicalContext')::jsonb,'recipeId',v->>'recipeId') from debt_proof where k='base';
