-- Market acquisition job (ADR 0023, decision 3; M2 part 1): enqueue by contract and platform principals
-- only (the database builds the URL), a closed switch, a lease bound to the worker account and its
-- capability, exact-path storage, a confirmation that receives the bytes and checks them against the
-- stored object, terminal states and closed surfaces. Every account, token, source and object here is
-- synthetic and rolls back.
begin;
set local statement_timeout='60s';
select set_config('request.jwt.claims','{}',true);
select set_config('request.jwt.claim.sub','',true);
-- 1 founder, 2 operator, 3 tenant human, 4 worker account, 5 second worker account.
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
select ('3a730000-0000-4000-8000-00000000000'||n)::uuid,'authenticated','authenticated','3a730000-'||n||'@example.invalid','{}','{}',now(),now(),false,false
from generate_series(1,5) n;
insert into private.platform_principals(user_id,role,label) values
 ('3a730000-0000-4000-8000-000000000001','founder','Synthetic acquisition founder'),
 ('3a730000-0000-4000-8000-000000000002','operator','Synthetic acquisition operator');
insert into private.worker_tokens(id,label,token_sha256,execution_account_user_id) values
 ('3a730000-0000-4000-8000-000000000011','Synthetic market worker',extensions.digest('synthetic-market-worker-token-3a730000-a','sha256'),'3a730000-0000-4000-8000-000000000004'),
 ('3a730000-0000-4000-8000-000000000012','Synthetic second market worker',extensions.digest('synthetic-market-worker-token-3a730000-b','sha256'),'3a730000-0000-4000-8000-000000000005');

create function pg_temp.expect(p_sql text,p_state text,p_label text) returns void language plpgsql as $$
begin
 begin execute p_sql; exception when others then
  if p_state='*' or sqlstate=p_state or sqlerrm=p_state then return; end if;
  raise exception '% failed with % (%) instead of %',p_label,sqlstate,sqlerrm,p_state;
 end;
 raise exception '% was accepted',p_label;
end $$;
create function pg_temp.as_account(p_user uuid) returns void language sql as $$ select set_config('request.jwt.claim.sub',coalesce(p_user::text,''),true); $$;
create temporary table claims(name text primary key,claim jsonb);
grant all on claims to authenticated;
create function pg_temp.def(p_enabled boolean,p_evidence jsonb default '["bcb-catalog-meta-selic-432","bcb-catalog-atas-comunicados-copom","bcb-site-termos-de-uso"]') returns jsonb language sql as $$
 select jsonb_build_object('registryId','bcb_sgs','license',jsonb_build_object('kind','open','license','ODbL-1.0','attribution','Banco Central do Brasil',
  'evidenceIds',p_evidence,'retainAdoptedValues',true,'storeDays',null),'allowedHosts',jsonb_build_array('api.bcb.gov.br','www.bcb.gov.br'),
  'calendar','br_business_days','expectedPublication','09:00','maximumAgeHours',30,'enabled',p_enabled,'reason','Fonte sintética para o teste do job de aquisição');
$$;
select private.register_market_publisher_v1('3a730000-0000-4000-a000-000000000001','Offroad, referência de mercado','3a730000-0000-4000-8000-000000000001');
select private.record_market_source_revision_v1('3a730000-0000-4000-a000-000000000011','bcb',pg_temp.def(true),'3a730000-0000-4000-8000-000000000002');
create function pg_temp.enqueue(p_command text,p_request jsonb default '{"size":5}',p_contract text default 'bcb-copom-comunicados-lista',p_actor text default '3a730000-0000-4000-8000-000000000002') returns jsonb language sql as $$
 select private.enqueue_market_contract_acquisition_v1(p_command::uuid,p_contract,p_request,'Aquisição sintética do teste',p_actor::uuid);
$$;
-- The list answer used as content: strict JSON the database reads itself.
create function pg_temp.content() returns bytea language sql as $$
 select convert_to('{"conteudo":[{"nro_reuniao":281,"dataReferencia":"2026-09-16","titulo":"281ª reunião"}]}','UTF8');
$$;
create function pg_temp.claim(p_name text,p_token text default 'synthetic-market-worker-token-3a730000-a',p_account text default '3a730000-0000-4000-8000-000000000004') returns jsonb language plpgsql as $$
declare c jsonb;begin
 perform pg_temp.as_account(p_account::uuid);
 c:=private.worker_claim_market_acquisition_v1(p_token);
 insert into claims values(p_name,c) on conflict(name) do update set claim=excluded.claim;
 perform pg_temp.as_account(null);
 return c;
end $$;
create function pg_temp.put_object(p_path text,p_size bigint,p_mime text,p_md5 text) returns void language sql as $$
 insert into storage.objects(bucket_id,name,metadata,version) values('market-reference',p_path,
  jsonb_build_object('size',p_size,'mimetype',p_mime,'eTag','"'||p_md5||'"'),'market-acquisition-sql-v1');
$$;
create function pg_temp.commit_claim(p_name text,p_content bytea,p_mime text,p_at timestamptz default null) returns jsonb language plpgsql as $$
declare c jsonb;r jsonb;begin
 select claim into strict c from claims where name=p_name;
 perform pg_temp.as_account('3a730000-0000-4000-8000-000000000004');
 r:=private.worker_commit_market_version_v1((c->>'jobId')::uuid,c->>'capability',(c->>'leaseId')::uuid,p_content,p_mime,coalesce(p_at,clock_timestamp()));
 perform pg_temp.as_account(null);
 return r;
end $$;

-- 1. Enqueue: a live founder or operator, a contract, a request the database turns into the URL; the
-- free-URL enqueue is closed.
do $$ begin
 perform pg_temp.expect($q$select pg_temp.enqueue('3a730000-0000-4000-a000-000000000101','{"size":5}','bcb-copom-comunicados-lista','3a730000-0000-4000-8000-000000000003')$q$,'platform_principal_required','tenant human enqueues');
 perform pg_temp.expect($q$select pg_temp.enqueue('3a730000-0000-4000-a000-000000000101','{"size":5}','bcb-copom-comunicados-lista','3a730000-0000-4000-8000-000000000004')$q$,'platform_principal_required','worker account enqueues');
 perform pg_temp.expect($q$select private.enqueue_market_acquisition_v1('3a730000-0000-4000-a000-000000000102','bcb','https://api.bcb.gov.br/x','json','Pedido livre sintético','3a730000-0000-4000-8000-000000000002')$q$,'market_enqueue_requires_contract','free URL enqueue');
 perform pg_temp.expect($q$select pg_temp.enqueue('3a730000-0000-4000-a000-000000000103','{"size":5}','no-contract')$q$,'market_contract_unknown','unknown contract');
 perform pg_temp.expect($q$select pg_temp.enqueue('3a730000-0000-4000-a000-000000000104','{"size":101}')$q$,'market_communique_list_size','list larger than the contract');
 perform pg_temp.expect($q$select pg_temp.enqueue('3a730000-0000-4000-a000-000000000105','{"size":5,"extra":1}')$q$,'market_request_invalid','extra request field');
 perform pg_temp.expect($q$select pg_temp.enqueue('3a730000-0000-4000-a000-000000000106','{"size":"5"}')$q$,'market_request_invalid','request number as text');
 perform pg_temp.expect($q$select pg_temp.enqueue('3a730000-0000-4000-a000-000000000107','{"meeting":281.0}','bcb-copom-comunicados-detalhe')$q$,'market_communique_meeting','meeting with a fraction');
 perform pg_temp.expect($q$select pg_temp.enqueue('3a730000-0000-4000-a000-000000000108','{"window":{"start":"2021-01-13","end":"2021-02-01"}}','bcb-sgs-432-endpoint')$q$,'market_window_before_homologation','window before homologation');
 perform pg_temp.expect($q$select pg_temp.enqueue('3a730000-0000-4000-a000-000000000109','{"window":{"start":"2021-01-14","end":"2031-01-14"}}','bcb-sgs-432-endpoint')$q$,'market_window_too_long','window of ten years');
 perform pg_temp.expect(format($q$select pg_temp.enqueue('3a730000-0000-4000-a000-000000000110','{"window":{"start":"2026-01-02","end":"%s"}}','bcb-sgs-432-endpoint')$q$,
  to_char(private.market_sao_paulo_date_v1(clock_timestamp())+1,'YYYY-MM-DD')),'market_window_in_future','window ending tomorrow');
 perform pg_temp.expect($q$insert into private.market_acquisition_jobs(id,command_id,requested_by,reason,source_id,source_revision,url,extension)
  values(gen_random_uuid(),gen_random_uuid(),'3a730000-0000-4000-8000-000000000002','Inserção direta sintética','bcb',1,'https://api.bcb.gov.br/x','json')$q$,'23514','job without a contract');
end $$;
do $$ declare a jsonb;b jsonb;begin
 a:=pg_temp.enqueue('3a730000-0000-4000-a000-000000000201','{"window":{"start":"2026-09-14","end":"2026-09-20"}}','bcb-sgs-432-endpoint');
 if (select url from private.market_acquisition_jobs where id=(a->>'jobId')::uuid)<>'https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados?formato=json&dataInicial=14/09/2026&dataFinal=20/09/2026'
 then raise exception 'URL not built from the contract';end if;
 b:=pg_temp.enqueue('3a730000-0000-4000-a000-000000000201','{"window":{"start":"2026-09-14","end":"2026-09-20"}}','bcb-sgs-432-endpoint');
 if (b->>'replayed')::boolean is not true or a->>'jobId'<>b->>'jobId' then raise exception 'enqueue did not replay';end if;
 perform pg_temp.expect($q$select pg_temp.enqueue('3a730000-0000-4000-a000-000000000201','{"window":{"start":"2026-09-14","end":"2026-09-19"}}','bcb-sgs-432-endpoint')$q$,'platform_method_request_reused','enqueue command reused');
 if (select count(*) from private.market_acquisition_job_events where job_id=(a->>'jobId')::uuid and event='enqueued' and actor_user_id='3a730000-0000-4000-8000-000000000002')<>1
 then raise exception 'enqueue not ledgered once';end if;
 update private.market_acquisition_jobs set available_at=clock_timestamp()+interval '1 day' where id=(a->>'jobId')::uuid;
 if (select url from private.market_acquisition_jobs where id=(pg_temp.enqueue('3a730000-0000-4000-a000-000000000202','{"meeting":281}','bcb-copom-comunicados-detalhe')->>'jobId')::uuid)
  <>'https://www.bcb.gov.br/api/servico/sitebcb/copom/comunicados_detalhes?nro_reuniao=281' then raise exception 'detail URL not built from the contract';end if;
 update private.market_acquisition_jobs set available_at=clock_timestamp()+interval '1 day' where status='queued';
 perform pg_temp.enqueue('3a730000-0000-4000-a000-000000000203');
end $$;

-- 2. The switch starts closed; only the transport command opens it; no tenant or foreign account claims.
do $$ begin
 if (pg_temp.claim('closed')->>'claimed')::boolean then raise exception 'claimed while the transport is closed';end if;
 perform pg_temp.expect($q$select private.release_platform_capability_v1('3a730000-0000-4000-a000-000000000301','market-acquisition-transport',true,'internal','3a730000-0000-4000-8000-000000000002','Synthetic generic open attempt')$q$,'*','generic release opens the transport');
 if private.market_acquisition_transport_released_v1() then raise exception 'generic release opened the transport';end if;
 perform pg_temp.expect($q$select private.release_market_acquisition_transport_v1('3a730000-0000-4000-a000-000000000302',true,'3a730000-0000-4000-8000-000000000003','Synthetic tenant open attempt')$q$,'platform_principal_required','tenant opens the transport');
end $$;
select private.release_market_acquisition_transport_v1('3a730000-0000-4000-a000-000000000303',true,'3a730000-0000-4000-8000-000000000002','Synthetic opening for the acquisition test');
-- A valid worker token without a market delegation claims nothing; only a platform principal delegates.
do $$ begin
 if (pg_temp.claim('undelegated','synthetic-market-worker-token-3a730000-b','3a730000-0000-4000-8000-000000000005')->>'claimed')::boolean then raise exception 'claimed without a delegation';end if;
 if (pg_temp.claim('undelegated-a')->>'claimed')::boolean then raise exception 'claimed before the delegation';end if;
 perform pg_temp.expect($q$select private.grant_market_acquisition_delegation_v1('3a730000-0000-4000-a000-000000000311','3a730000-0000-4000-8000-000000000011','bcb','Synthetic delegation by a tenant','3a730000-0000-4000-8000-000000000003')$q$,'platform_principal_required','tenant delegates');
 perform pg_temp.expect($q$select private.grant_market_acquisition_delegation_v1('3a730000-0000-4000-a000-000000000312','3a730000-0000-4000-8000-000000000011','no-source','Synthetic delegation to an unknown source','3a730000-0000-4000-8000-000000000002')$q$,'market_source_unknown','delegation to an unknown source');
end $$;
select private.grant_market_acquisition_delegation_v1('3a730000-0000-4000-a000-000000000313','3a730000-0000-4000-8000-000000000011','bcb','Synthetic delegation of worker A','3a730000-0000-4000-8000-000000000002');
do $$ begin
 perform pg_temp.expect($q$select pg_temp.claim('tenant','synthetic-market-worker-token-3a730000-a','3a730000-0000-4000-8000-000000000003')$q$,'worker_account_binding_required','tenant account claims with a worker token');
 perform pg_temp.expect($q$select pg_temp.claim('crossed','synthetic-market-worker-token-3a730000-a','3a730000-0000-4000-8000-000000000005')$q$,'worker_account_binding_required','token of another account');
 perform pg_temp.expect($q$select pg_temp.claim('forged','not-a-worker-token-3a730000-000000000000','3a730000-0000-4000-8000-000000000004')$q$,'42501','unknown worker token');
end $$;
do $$ declare c jsonb;begin
 c:=pg_temp.claim('a');
 if (c->>'claimed')::boolean is not true or c->>'bucket'<>'market-reference' or c->>'objectPath' !~ '^bcb/[0-9]{4}/[0-9]{2}/[0-9a-f-]{36}\.json$'
 or c->>'contractId'<>'bcb-copom-comunicados-lista' or c->>'contractKind'<>'copom_communique_list' or c->'request'<>'{"size":5}'::jsonb
 or c->>'url'<>'https://www.bcb.gov.br/api/servico/sitebcb/copom/comunicados?quantidade=5' or (c->>'maxBytes')::bigint<>1048576 then raise exception 'claim answer wrong: %',c;end if;
 if (pg_temp.claim('none')->>'claimed')::boolean then raise exception 'a leased job was claimed twice';end if;
end $$;

-- 3. The lease belongs to its account and capability.
do $$ declare c jsonb;begin
 select claim into strict c from claims where name='a';
 perform pg_temp.as_account('3a730000-0000-4000-8000-000000000004');
 perform pg_temp.expect(format($q$select private.worker_renew_market_acquisition_v1(%L,%L,%L)$q$,c->>'jobId',repeat('f',64),c->>'leaseId'),'market_acquisition_lease_denied','wrong capability');
 perform pg_temp.expect(format($q$select private.worker_renew_market_acquisition_v1(%L,%L,%L)$q$,c->>'jobId',c->>'capability',gen_random_uuid()),'market_acquisition_lease_denied','wrong lease');
 perform pg_temp.as_account('3a730000-0000-4000-8000-000000000005');
 perform pg_temp.expect(format($q$select private.worker_renew_market_acquisition_v1(%L,%L,%L)$q$,c->>'jobId',c->>'capability',c->>'leaseId'),'market_acquisition_lease_denied','another worker account');
 perform pg_temp.as_account('3a730000-0000-4000-8000-000000000004');
 if (private.worker_renew_market_acquisition_v1((c->>'jobId')::uuid,c->>'capability',(c->>'leaseId')::uuid)->>'renewed')::boolean is not true then raise exception 'renew failed';end if;
 perform pg_temp.as_account(null);
end $$;

-- 4. Exact-path storage: only the lease holder writes to the allocated path; nobody reads the bytes.
set local role authenticated;
do $$ declare c jsonb;begin
 select claim into strict c from claims where name='a';
 perform set_config('storage.operation','object.upload',true);
 perform set_config('request.jwt.claim.sub','3a730000-0000-4000-8000-000000000005',true);
 begin insert into storage.objects(bucket_id,name,metadata,version) values('market-reference',c->>'objectPath','{"size":1}','x');
  raise exception 'another account uploaded to the allocated path';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub','3a730000-0000-4000-8000-000000000003',true);
 begin insert into storage.objects(bucket_id,name,metadata,version) values('market-reference',c->>'objectPath','{"size":1}','x');
  raise exception 'a tenant account uploaded to the market bucket';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub','3a730000-0000-4000-8000-000000000004',true);
 begin insert into storage.objects(bucket_id,name,metadata,version) values('market-reference','bcb/2026/10/'||gen_random_uuid()||'.json','{"size":1}','x');
  raise exception 'the worker uploaded outside its allocation';exception when insufficient_privilege then null;end;
 perform set_config('storage.operation','object.upload_update',true);
 begin insert into storage.objects(bucket_id,name,metadata,version) values('market-reference',c->>'objectPath','{"size":1}','x');
  raise exception 'an upsert reached the allocated path';exception when insufficient_privilege then null;end;
 perform set_config('storage.operation','object.upload',true);
 insert into storage.objects(bucket_id,name,metadata,version) values('market-reference',c->>'objectPath',
  jsonb_build_object('size',octet_length(pg_temp.content()),'mimetype','application/json','eTag','"'||md5(pg_temp.content())||'"'),'market-acquisition-sql-v1');
 perform set_config('storage.operation','object.get_authenticated',true);
 if exists(select 1 from storage.objects where bucket_id='market-reference') then raise exception 'the worker can download market bytes';end if;
 perform set_config('storage.operation','object.get_authenticated_info',true);
 if not exists(select 1 from storage.objects where bucket_id='market-reference' and name=c->>'objectPath') then raise exception 'the lease holder cannot read its metadata';end if;
 perform set_config('request.jwt.claim.sub','3a730000-0000-4000-8000-000000000003',true);
 if exists(select 1 from storage.objects where bucket_id='market-reference') then raise exception 'a tenant sees market objects';end if;
 perform set_config('storage.operation','',true);
 perform set_config('request.jwt.claim.sub','',true);
end $$;
reset role;

-- 5. Confirmation receives the bytes, checks them against the stored object and reads them itself; the
-- receipt is recorded once and the old confirmation is closed.
do $$ declare c jsonb;r jsonb;at timestamptz:=clock_timestamp();begin
 select claim into strict c from claims where name='a';
 perform pg_temp.expect($q$select pg_temp.commit_claim('a',convert_to('{"conteudo":[]}','UTF8'),'application/json')$q$,'market_acquisition_object_mismatch','bytes other than the stored object');
 perform pg_temp.expect($q$select pg_temp.commit_claim('a',pg_temp.content(),'text/csv')$q$,'market_acquisition_invalid','type of another extension');
 perform pg_temp.expect($q$select pg_temp.commit_claim('a',pg_temp.content(),'application/json',clock_timestamp()-interval '1 day')$q$,'market_acquisition_invalid','acquired before the lease');
 perform pg_temp.as_account('3a730000-0000-4000-8000-000000000004');
 perform pg_temp.expect(format($q$select private.worker_commit_market_acquisition_v1(%L,%L,%L,'https://www.bcb.gov.br/x',repeat('a',64),md5('x'),1,'application/json',clock_timestamp())$q$,
  c->>'jobId',c->>'capability',c->>'leaseId'),'market_commit_superseded','old confirmation');
 perform pg_temp.as_account(null);
 r:=pg_temp.commit_claim('a',pg_temp.content(),'application/json',at);
 if (r->>'committed')::boolean is not true or (r->>'replayed')::boolean then raise exception 'commit failed: %',r;end if;
 if not exists(select 1 from private.market_acquisitions x where x.id=(r->>'acquisitionId')::uuid and x.processing_job_id=(c->>'jobId')::uuid
  and x.object_path=c->>'objectPath' and x.final_url=c->>'url' and x.byte_size=octet_length(pg_temp.content())
  and x.sha256=encode(extensions.digest(pg_temp.content(),'sha256'),'hex'))
 then raise exception 'receipt not recorded';end if;
 if (select status from private.market_acquisition_jobs where id=(c->>'jobId')::uuid)<>'succeeded' then raise exception 'job not succeeded';end if;
 r:=pg_temp.commit_claim('a',pg_temp.content(),'application/json',at);
 if (r->>'replayed')::boolean is not true then raise exception 'commit did not replay';end if;
 perform pg_temp.expect(format($q$select pg_temp.commit_claim('a',convert_to('{"conteudo":[{"nro_reuniao":280,"dataReferencia":"2026-08-05","titulo":"x"}]}','UTF8'),'application/json',%L)$q$,at),'market_acquisition_lease_denied','replay with other bytes');
 perform pg_temp.as_account('3a730000-0000-4000-8000-000000000004');
 perform pg_temp.expect(format($q$select private.worker_commit_market_version_v1(%L,%L,%L,%L,'application/json',%L)$q$,
  c->>'jobId',repeat('e',64),c->>'leaseId',pg_temp.content(),at),'market_acquisition_lease_denied','replay with a forged capability');
 perform pg_temp.as_account('3a730000-0000-4000-8000-000000000005');
 perform pg_temp.expect(format($q$select private.worker_commit_market_version_v1(%L,%L,%L,%L,'application/json',%L)$q$,
  c->>'jobId',c->>'capability',c->>'leaseId',pg_temp.content(),at),'market_acquisition_lease_denied','replay by another account');
 perform pg_temp.as_account(null);
 perform pg_temp.as_account('3a730000-0000-4000-8000-000000000004');
 perform pg_temp.expect(format($q$select private.worker_fail_market_acquisition_v1(%L,%L,%L,'network',true,null)$q$,c->>'jobId',c->>'capability',c->>'leaseId'),'market_acquisition_lease_denied','fail after commit');
 perform pg_temp.as_account(null);
end $$;
set local role authenticated;
do $$ declare c jsonb;begin
 select claim into strict c from claims where name='a';
 perform set_config('request.jwt.claim.sub','3a730000-0000-4000-8000-000000000004',true);
 perform set_config('storage.operation','object.delete',true);
 perform set_config('storage.allow_delete_query','true',true);
 delete from storage.objects where bucket_id='market-reference' and name=c->>'objectPath';
 perform set_config('storage.operation','',true);
 perform set_config('request.jwt.claim.sub','',true);
end $$;
reset role;
do $$ begin
 if not exists(select 1 from storage.objects o join claims c on c.name='a' where o.bucket_id='market-reference' and o.name=c.claim->>'objectPath')
 then raise exception 'the worker deleted a confirmed receipt object';end if;
end $$;

-- 6. Failure: a retryable error returns to the queue; a host refusal ends the job.
do $$ declare c jsonb;r jsonb;begin
 perform pg_temp.enqueue('3a730000-0000-4000-a000-000000000401');
 c:=pg_temp.claim('b');
 perform pg_temp.as_account('3a730000-0000-4000-8000-000000000004');
 perform pg_temp.expect(format($q$select private.worker_fail_market_acquisition_v1(%L,%L,%L,'anything',true,null)$q$,c->>'jobId',c->>'capability',c->>'leaseId'),'market_acquisition_invalid','unknown failure code');
 r:=private.worker_fail_market_acquisition_v1((c->>'jobId')::uuid,c->>'capability',(c->>'leaseId')::uuid,'network',true,'Synthetic timeout');
 if (r->>'retryScheduled')::boolean is not true or (select status from private.market_acquisition_jobs where id=(c->>'jobId')::uuid)<>'queued' then raise exception 'retry not scheduled';end if;
 perform pg_temp.as_account(null);
 update private.market_acquisition_jobs set available_at=clock_timestamp()-interval '1 second' where id=(c->>'jobId')::uuid;
 c:=pg_temp.claim('b2');
 if (c->>'attempt')::integer<>2 then raise exception 'second attempt not claimed: %',c;end if;
 perform pg_temp.as_account('3a730000-0000-4000-8000-000000000004');
 r:=private.worker_fail_market_acquisition_v1((c->>'jobId')::uuid,c->>'capability',(c->>'leaseId')::uuid,'redirect_not_allowed',true,'Synthetic redirect');
 if (r->>'retryScheduled')::boolean or (select status from private.market_acquisition_jobs where id=(c->>'jobId')::uuid)<>'failed' then raise exception 'host refusal retried';end if;
 perform pg_temp.as_account(null);
 update private.market_acquisition_jobs set available_at=clock_timestamp()+interval '1 hour' where status='queued';
 perform pg_temp.enqueue('3a730000-0000-4000-a000-000000000402');
 c:=pg_temp.claim('b3');
 perform pg_temp.as_account('3a730000-0000-4000-8000-000000000004');
 r:=private.worker_fail_market_acquisition_v1((c->>'jobId')::uuid,c->>'capability',(c->>'leaseId')::uuid,'parse_failed',true,'Synthetic parse failure');
 if (r->>'retryScheduled')::boolean or (select status from private.market_acquisition_jobs where id=(c->>'jobId')::uuid)<>'failed' then raise exception 'parse failure retried';end if;
 perform pg_temp.as_account(null);
end $$;

-- 7. An expired last attempt ends the job; a newer source revision withdraws a queued job.
do $$ declare j uuid;begin
 j:=(pg_temp.enqueue('3a730000-0000-4000-a000-000000000501')->>'jobId')::uuid;
 perform pg_temp.expect(format('update private.market_acquisition_jobs set max_attempts=5 where id=%L',j),'23514','attempt limit raised after enqueue');
end $$;
do $$ declare c jsonb;j uuid;begin
 j:=(pg_temp.enqueue('3a730000-0000-4000-a000-000000000502')->>'jobId')::uuid;
 update private.market_acquisition_jobs set available_at=clock_timestamp()+interval '1 hour' where id<>j and status='queued';
 c:=pg_temp.claim('d');
 if (c->>'jobId')::uuid<>j then raise exception 'claimed another job: %',c;end if;
 update private.market_acquisition_jobs set attempts=max_attempts,lease_expires_at=clock_timestamp()-interval '1 second' where id=j;
 c:=pg_temp.claim('d2');
 if (select status||':'||(last_error->>'code') from private.market_acquisition_jobs where id=j)<>'failed:attempts_exhausted' then raise exception 'exhausted job not failed';end if;
 j:=(pg_temp.enqueue('3a730000-0000-4000-a000-000000000503')->>'jobId')::uuid;
 perform private.record_market_source_revision_v1('3a730000-0000-4000-a000-000000000013','bcb',pg_temp.def(true)||'{"reason":"Revisão sintética posterior ao pedido"}','3a730000-0000-4000-8000-000000000002');
 c:=pg_temp.claim('e');
 if (select status||':'||(last_error->>'code') from private.market_acquisition_jobs where id=j)<>'failed:source_not_acquirable'
 then raise exception 'job under a superseded revision was not withdrawn';end if;
end $$;

-- 8. Cancellation only of queued jobs, by platform principals; a pause stops claims and confirmations.
do $$ declare c jsonb;j uuid;k uuid;begin
 update private.market_acquisition_jobs set available_at=clock_timestamp()+interval '1 hour' where status='queued';
 j:=(pg_temp.enqueue('3a730000-0000-4000-a000-000000000601')->>'jobId')::uuid;
 perform pg_temp.expect(format($q$select private.cancel_market_acquisition_v1('3a730000-0000-4000-a000-000000000602',%L,'Synthetic cancellation by a tenant','3a730000-0000-4000-8000-000000000003')$q$,j),'platform_principal_required','tenant cancels');
 perform private.cancel_market_acquisition_v1('3a730000-0000-4000-a000-000000000603',j,'Synthetic cancellation of a queued job','3a730000-0000-4000-8000-000000000002');
 perform private.cancel_market_acquisition_v1('3a730000-0000-4000-a000-000000000603',j,'Synthetic cancellation of a queued job','3a730000-0000-4000-8000-000000000002');
 if (select status from private.market_acquisition_jobs where id=j)<>'cancelled' then raise exception 'not cancelled';end if;
 k:=(pg_temp.enqueue('3a730000-0000-4000-a000-000000000604')->>'jobId')::uuid;
 c:=pg_temp.claim('g');
 if (c->>'jobId')::uuid<>k then raise exception 'claimed another job: %',c;end if;
 perform private.cancel_market_acquisition_v1('3a730000-0000-4000-a000-000000000605',k,'Synthetic cancellation of a leased job','3a730000-0000-4000-8000-000000000002');
 perform pg_temp.put_object(c->>'objectPath',octet_length(pg_temp.content()),'application/json',md5(pg_temp.content()));
 perform pg_temp.expect($q$select pg_temp.commit_claim('g',pg_temp.content(),'application/json')$q$,'market_acquisition_lease_denied','confirmation after cancellation');
 if (select count(*) from private.market_acquisitions where processing_job_id=k)<>0 then raise exception 'receipt after cancellation';end if;
 -- The cancelled attempt left bytes: a delegated worker lists the path for the sweep.
 perform pg_temp.as_account('3a730000-0000-4000-8000-000000000004');
 if not (private.worker_list_market_orphans_v1('synthetic-market-worker-token-3a730000-a',100) ? (c->>'objectPath')) then raise exception 'orphan not listed';end if;
 perform pg_temp.as_account('3a730000-0000-4000-8000-000000000005');
 if private.worker_list_market_orphans_v1('synthetic-market-worker-token-3a730000-b',100)<>'[]'::jsonb then raise exception 'orphans listed to an undelegated worker';end if;
 perform pg_temp.as_account(null);
 insert into claims values('orphan',c) on conflict(name) do update set claim=excluded.claim;
 k:=(pg_temp.enqueue('3a730000-0000-4000-a000-000000000606')->>'jobId')::uuid;
 c:=pg_temp.claim('g2');
 if (c->>'jobId')::uuid<>k then raise exception 'claimed another job: %',c;end if;
 perform private.release_market_acquisition_transport_v1('3a730000-0000-4000-a000-000000000608',false,'3a730000-0000-4000-8000-000000000002','Synthetic pause of the transport');
 perform pg_temp.put_object(c->>'objectPath',octet_length(pg_temp.content()),'application/json',md5(pg_temp.content()));
 perform pg_temp.expect($q$select pg_temp.commit_claim('g2',pg_temp.content(),'application/json')$q$,'market_acquisition_transport_paused','confirmation while paused');
 perform pg_temp.enqueue('3a730000-0000-4000-a000-000000000607');
 if (pg_temp.claim('paused')->>'claimed')::boolean then raise exception 'claimed while paused';end if;
end $$;

-- 9. Mid-lease: a revoked delegation or a withdrawn source stops renewal, confirmation and upload; the
-- lease holder may delete its own live object in a batch; a delegated worker sweeps abandoned bytes.
select private.release_market_acquisition_transport_v1('3a730000-0000-4000-a000-000000000701',true,'3a730000-0000-4000-8000-000000000002','Synthetic reopening after the pause');
do $$ declare c jsonb;k uuid;d uuid;begin
 update private.market_acquisition_jobs set available_at=clock_timestamp()+interval '1 hour' where status='queued';
 k:=(pg_temp.enqueue('3a730000-0000-4000-a000-000000000702')->>'jobId')::uuid;
 c:=pg_temp.claim('m');
 if (c->>'jobId')::uuid<>k then raise exception 'claimed another job: %',c;end if;
 select id into strict d from private.market_acquisition_delegations where worker_token_id='3a730000-0000-4000-8000-000000000011' and revoked_at is null;
 perform private.revoke_market_acquisition_delegation_v1('3a730000-0000-4000-a000-000000000703',d,'Synthetic revocation mid lease','3a730000-0000-4000-8000-000000000002');
 perform pg_temp.as_account('3a730000-0000-4000-8000-000000000004');
 perform pg_temp.expect(format($q$select private.worker_renew_market_acquisition_v1(%L,%L,%L)$q$,c->>'jobId',c->>'capability',c->>'leaseId'),'market_delegation_required','renewal after revocation');
 perform pg_temp.as_account(null);
 perform pg_temp.put_object(c->>'objectPath',octet_length(pg_temp.content()),'application/json',md5(pg_temp.content()));
 perform pg_temp.expect($q$select pg_temp.commit_claim('m',pg_temp.content(),'application/json')$q$,'market_delegation_required','confirmation after revocation');
 perform private.grant_market_acquisition_delegation_v1('3a730000-0000-4000-a000-000000000704','3a730000-0000-4000-8000-000000000011','bcb','Synthetic second delegation of worker A','3a730000-0000-4000-8000-000000000002');
 perform private.record_market_source_revision_v1('3a730000-0000-4000-a000-000000000705','bcb',pg_temp.def(false),'3a730000-0000-4000-8000-000000000002');
 perform pg_temp.as_account('3a730000-0000-4000-8000-000000000004');
 perform pg_temp.expect(format($q$select private.worker_renew_market_acquisition_v1(%L,%L,%L)$q$,c->>'jobId',c->>'capability',c->>'leaseId'),'market_source_not_acquirable','renewal after the source was disabled');
 perform pg_temp.as_account(null);
 perform pg_temp.expect($q$select pg_temp.commit_claim('m',pg_temp.content(),'application/json')$q$,'market_source_not_acquirable','confirmation after the source was disabled');
end $$;
set local role authenticated;
do $$ declare c jsonb;n integer;begin
 select claim into strict c from claims where name='m';
 perform set_config('request.jwt.claim.sub','3a730000-0000-4000-8000-000000000004',true);
 perform set_config('storage.operation','object.get_authenticated_info',true);
 if exists(select 1 from storage.objects where bucket_id='market-reference' and name=c->>'objectPath') then raise exception 'metadata visible after the source was disabled';end if;
 perform set_config('request.jwt.claim.sub','',true);
 perform set_config('storage.operation','',true);
end $$;
reset role;
select private.record_market_source_revision_v1('3a730000-0000-4000-a000-000000000706','bcb',pg_temp.def(true)||'{"reason":"Revisão sintética reabilitada para o teste"}','3a730000-0000-4000-8000-000000000002');
do $$ declare c jsonb;k uuid;begin
 update private.market_acquisition_jobs set available_at=clock_timestamp()+interval '1 hour' where status='queued';
 k:=(pg_temp.enqueue('3a730000-0000-4000-a000-000000000707')->>'jobId')::uuid;
 c:=pg_temp.claim('n');
 if (c->>'jobId')::uuid<>k then raise exception 'claimed another job: %',c;end if;
end $$;
set local role authenticated;
do $$ declare c jsonb;o jsonb;n integer;begin
 select claim into strict c from claims where name='n';
 perform set_config('request.jwt.claim.sub','3a730000-0000-4000-8000-000000000004',true);
 perform set_config('storage.operation','object.upload',true);
 insert into storage.objects(bucket_id,name,metadata,version) values('market-reference',c->>'objectPath',jsonb_build_object('size',3,'mimetype','application/json','eTag','"x"'),'v');
 perform set_config('storage.operation','object.delete_many',true);
 perform set_config('storage.allow_delete_query','true',true);
 delete from storage.objects where bucket_id='market-reference' and name=c->>'objectPath';
 get diagnostics n=row_count;
 if n<>1 then raise exception 'the lease holder could not delete its live object in a batch';end if;
 -- The abandoned object of the cancelled attempt is swept by the delegated worker.
 select claim into strict o from claims where name='orphan';
 delete from storage.objects where bucket_id='market-reference' and name=o->>'objectPath';
 get diagnostics n=row_count;
 if n<>1 then raise exception 'the delegated worker could not sweep an abandoned object';end if;
 perform set_config('request.jwt.claim.sub','3a730000-0000-4000-8000-000000000005',true);
 delete from storage.objects where bucket_id='market-reference' and name like 'bcb/%';
 get diagnostics n=row_count;
 if n<>0 then raise exception 'an undelegated worker deleted market objects';end if;
 perform set_config('request.jwt.claim.sub','',true);
 perform set_config('storage.operation','',true);
end $$;
reset role;

-- A confirmed attempt is replayed only while its worker token is active.
do $$ declare c jsonb;at timestamptz;begin
 select claim into strict c from claims where name='a';
 select x.acquired_at into strict at from private.market_acquisitions x where x.processing_job_id=(c->>'jobId')::uuid;
 update private.worker_tokens set status='revoked',revoked_at=clock_timestamp() where id='3a730000-0000-4000-8000-000000000011';
 perform pg_temp.expect(format($q$select pg_temp.commit_claim('a',pg_temp.content(),'application/json',%L)$q$,at),'market_acquisition_lease_denied','replay after the worker token was revoked');
end $$;

-- 10. Identity and history are immutable; nothing reaches the API roles.
do $$ declare t text;f text;r text;begin
 perform pg_temp.expect($q$update private.market_acquisition_jobs set url='https://api.bcb.gov.br/other'$q$,'23514','job URL rewritten');
 perform pg_temp.expect($q$update private.market_acquisition_jobs set request='{"size":6}'$q$,'23514','job request rewritten');
 perform pg_temp.expect($q$update private.market_acquisition_jobs set status='queued' where status='succeeded'$q$,'23514','terminal job reopened');
 perform pg_temp.expect($q$delete from private.market_acquisition_jobs$q$,'23514','job deleted');
 perform pg_temp.expect($q$update private.market_acquisition_allocations set object_path=object_path$q$,'23514','allocation rewritten');
 perform pg_temp.expect($q$delete from private.market_acquisition_job_events$q$,'23514','job event deleted');
 perform pg_temp.expect($q$update private.market_acquisition_delegations set source_id='other' where revoked_at is not null$q$,'23514','revoked delegation edited');
 perform pg_temp.expect($q$update private.market_acquisition_delegations set revoked_at=null where revoked_at is not null$q$,'23514','delegation revived');
 perform pg_temp.expect($q$delete from private.market_acquisition_delegations$q$,'23514','delegation deleted');
 foreach t in array array['market_acquisition_jobs','market_acquisition_allocations','market_acquisition_job_events','market_acquisition_delegations'] loop
  perform pg_temp.expect(format('truncate private.%I cascade',t),'23514','truncate '||t);
  foreach r in array array['anon','authenticated','service_role'] loop
   if has_table_privilege(r,'private.'||t,'select,insert,update,delete,truncate,references,trigger') then raise exception '% reaches %',r,t;end if;
  end loop;
  if not (select relrowsecurity and relforcerowsecurity from pg_class where oid=('private.'||t)::regclass) then raise exception 'RLS not forced on %',t;end if;
 end loop;
 for f,r in select p.oid::regprocedure::text,x.r from pg_proc p join pg_namespace n on n.oid=p.pronamespace,unnest(array['anon','authenticated','service_role']) x(r)
  where n.nspname in ('private','public') and (p.proname ~ 'market_acquisition|market_object|market_url|market_extension|market_reference_bucket|market_worker|market_orphans|market_delegation|market_source_gate|market_attempt|market_version|market_contract|market_commit') loop
  if has_function_privilege(r,f,'execute') and not (r='authenticated' and f ~ '^((private|public)\.)?worker_((claim|renew|commit|fail)_market_acquisition|commit_market_version|list_market_orphans)_v1|^private\.worker_can_access_market_object_v1')
  then raise exception '% executes %',r,f;end if;
 end loop;
 if position('market-acquisition-consumer.v1' in public.worker_runtime_schema_contract_v1()::text)=0 then raise exception 'runtime contract does not announce the consumer';end if;
 if position('market-version-commit.v1' in public.worker_runtime_schema_contract_v1()::text)=0 then raise exception 'runtime contract does not announce the version confirmation';end if;
end $$;
select 'market_acquisition_job' as test,'PASS' as result;
rollback;
