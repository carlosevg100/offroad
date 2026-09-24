-- Synthetic governed evaluation fixture. Caller owns BEGIN/ROLLBACK, or the disposable CI database.
-- Every account, organization, principal, worker credential and provider assurance here is synthetic;
-- the prefix e5a10000 is rewritten by the concurrency case to keep its committed scopes apart.
select set_config('request.jwt.claims','{}',true);
select set_config('request.jwt.claim.sub','',true);
-- 1 founder, 2 operator, 3 evaluator, 4 second evaluator, 5 tenant human, 6 worker account.
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
select ('e5a10000-0000-4000-8000-00000000000'||n)::uuid,'authenticated','authenticated','e5a10000-'||n||'@example.invalid','{}','{}',now(),now(),false,false
from generate_series(1,6) n;
insert into public.organizations(id,organization_type,name,created_by) values
 ('e5a10000-0000-4000-9000-000000000001','company','Synthetic evaluation workspace','e5a10000-0000-4000-8000-000000000001'),
 ('e5a10000-0000-4000-9000-000000000002','company','Synthetic client organization','e5a10000-0000-4000-8000-000000000005');
insert into public.organization_memberships(organization_id,user_id,role,status) values
 ('e5a10000-0000-4000-9000-000000000001','e5a10000-0000-4000-8000-000000000001','owner','active'),
 ('e5a10000-0000-4000-9000-000000000002','e5a10000-0000-4000-8000-000000000005','owner','active');
insert into private.platform_principals(user_id,role,label) values
 ('e5a10000-0000-4000-8000-000000000001','founder','Synthetic evaluation founder'),
 ('e5a10000-0000-4000-8000-000000000002','operator','Synthetic evaluation operator'),
 ('e5a10000-0000-4000-8000-000000000003','evaluator','Synthetic evaluator'),
 ('e5a10000-0000-4000-8000-000000000004','evaluator','Synthetic second evaluator');
insert into private.worker_tokens(id,label,token_sha256,execution_account_user_id)
values('e5a10000-0000-4000-8000-000000000011','Synthetic evaluation worker',extensions.digest('synthetic-evaluation-worker-token-e5a10000','sha256'),'e5a10000-0000-4000-8000-000000000006');

-- One synthetic provider route, attested for evaluations only, under a synthetic account.
create function pg_temp.evaluation_route() returns jsonb language sql as $$
 select '{"provider":"openai","model":"synthetic-evaluation-model","accountRef":"synthetic-evaluation-account-e5a10000","projectRef":"synthetic-evaluation-project","credentialBinding":"synthetic-evaluation-binding","endpoint":"https://api.openai.com/v1/responses","region":"global","toolVersion":"synthetic-gateway.v1"}'::jsonb;
$$;
select private.record_provider_processing_assurance_v1((pg_temp.evaluation_route()-array['model','toolVersion'])||jsonb_build_object(
 'id','e5a10000-0000-4000-b000-000000000001','policyVersion','offroad-provider-retention-v2','models','["synthetic-evaluation-model"]'::jsonb,'resource','inference',
 'eligibility','supported','purposes','["evaluation"]'::jsonb,'classifications','["restricted"]'::jsonb,'rights','["process"]'::jsonb,'trainingUse','prohibited',
 'retention',jsonb_build_object('requestContentSeconds',0,'abuseMonitoringSeconds',2592000,'applicationStateSeconds',0,'cacheSeconds',86400,'metadataSeconds',2592000,'exceptions','["legal_hold"]'::jsonb),
 'zeroRetention','not_contracted',
 'evidence',(select jsonb_agg(jsonb_build_object('kind',k,'reference','synthetic-evaluation-proof','sha256',repeat('a',64))) from unnest(array['provider_terms','account_configuration','credential_binding']) k),
 'reviewedBy','Synthetic reviewer','reviewedAt',clock_timestamp()-interval '1 hour','validThrough',clock_timestamp()+interval '1 day','revokedAt',null),
 'Synthetic governed evaluation proof');

-- The operator registers the founder's own workspace for evaluations.
select private.register_platform_evaluation_organization_v1('e5a10000-0000-4000-a000-000000000001','e5a10000-0000-4000-9000-000000000001','Synthetic evaluation workspace','e5a10000-0000-4000-8000-000000000002');

create function pg_temp.evaluation_snapshot() returns text language sql as $$
 select '{"cases":[{"caseId":"synthetic-case","turns":["Synthetic question"]}]}';
$$;
create function pg_temp.evaluation_contract(p_execution uuid,p_cost bigint default 1000,p_calls integer default 3,p_duration bigint default 600000,
 p_organization uuid default 'e5a10000-0000-4000-9000-000000000001') returns jsonb language sql as $$
 select jsonb_build_object('schemaVersion','governed-evaluation-contract.v1','executionId',p_execution,'organizationId',p_organization,
  'requestId',p_execution,'processingRunId',p_execution,'purpose','evaluation',
  'audience',jsonb_build_object('kind','evaluation_panel','caseId','synthetic-case','caseVersion','v1','scriptId','run-gold-baseline'),
  'tools',jsonb_build_array(jsonb_build_object('id','provider:openai:synthetic-evaluation-model','version','synthetic-gateway.v1','effect','read_only')),
  'budget',jsonb_build_object('maxCostMicrousd',p_cost,'maxModelCalls',p_calls,'maxDurationMs',p_duration,'expiresAt',clock_timestamp()+interval '1 hour'),
  'inputs',jsonb_build_object('fingerprint',encode(extensions.digest(convert_to(pg_temp.evaluation_snapshot(),'UTF8'),'sha256'),'hex'),
   'sources',jsonb_build_array(jsonb_build_object('contentHash',encode(extensions.digest('synthetic evaluation source','sha256'),'hex')))),
  'requestedAt',clock_timestamp());
$$;
-- The request is an operator-surface command: no JWT subject, the evaluator named explicitly.
create function pg_temp.request_evaluation(p_contract jsonb,p_actor uuid default 'e5a10000-0000-4000-8000-000000000003') returns jsonb language sql as $$
 select set_config('request.jwt.claim.sub','',true);
 select private.request_governed_evaluation_v1(p_contract::text,pg_temp.evaluation_snapshot(),p_actor);
$$;
-- Worker commands run as the worker account bound to the synthetic credential.
create function pg_temp.as_worker() returns text language sql as $$
 select set_config('request.jwt.claim.sub','e5a10000-0000-4000-8000-000000000006',true);
$$;
create function pg_temp.claim_evaluation(p_job uuid,p_lease integer default 60) returns jsonb language sql as $$
 select pg_temp.as_worker();
 select private.claim_governed_evaluation_v1('synthetic-evaluation-worker-token-e5a10000',p_job,p_lease);
$$;
create function pg_temp.poll_evaluation() returns jsonb language sql as $$
 select pg_temp.as_worker();
 select public.worker_claim_evaluation_v1('synthetic-evaluation-worker-token-e5a10000');
$$;
