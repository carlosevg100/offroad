-- Market reference M2 part 2 (ADR 0023): the scheduler. Grant and revocation with receipts, the firing's
-- blockers and its hours, the daily list that records what it discovered, the conflict between lists and
-- details, the reconciliation of details with its named blocks, the series window, anchor and recovery by the
-- outcome of the last occurrence, the manual occurrence through the same checks, the integrity of occurrences
-- and closed surfaces. Synthetic, dated relative to the day of the run; another day or hour is simulated by the
-- firing's own instant. Cases that need a revocation after a reading run in the two-session races. Rolls back.
begin;
set local statement_timeout='120s';
select set_config('request.jwt.claims','{}',true);
select set_config('request.jwt.claim.sub','',true);
-- 1 founder, 2 operator, 4 worker account, 5 second worker account.
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
select ('3a810000-0000-4000-8000-00000000000'||n)::uuid,'authenticated','authenticated','3a810000-'||n||'@example.invalid','{}','{}',now(),now(),false,false
from unnest(array[1,2,4,5]) n;
insert into private.platform_principals(user_id,role,label) values
 ('3a810000-0000-4000-8000-000000000001','founder','Synthetic scheduler founder'),
 ('3a810000-0000-4000-8000-000000000002','operator','Synthetic scheduler operator');
insert into private.worker_tokens(id,label,token_sha256,execution_account_user_id) values
 ('3a810000-0000-4000-8000-000000000011','Synthetic scheduler worker',extensions.digest('synthetic-scheduler-worker-token-3a810000-a','sha256'),'3a810000-0000-4000-8000-000000000004'),
 ('3a810000-0000-4000-8000-000000000012','Synthetic scheduler second worker',extensions.digest('synthetic-scheduler-worker-token-3a810000-b','sha256'),'3a810000-0000-4000-8000-000000000005');
create function pg_temp.expect(p_sql text,p_state text,p_label text) returns void language plpgsql as $$
begin
 begin execute p_sql; exception when others then
  if p_state='*' or sqlstate=p_state or sqlerrm=p_state then return; end if;
  raise exception '% failed with % (%) instead of %',p_label,sqlstate,sqlerrm,p_state;
 end;
 raise exception '% was accepted',p_label;
end $$;
create function pg_temp.as_account(p_user uuid) returns void language sql as $$ select set_config('request.jwt.claim.sub',coalesce(p_user::text,''),true); $$;
create temporary table facts(name text primary key,value text);
create function pg_temp.fact(p_name text) returns text language sql as $$ select value from facts where name=p_name $$;
create function pg_temp.put(p_name text,p_value text) returns void language sql as $$
 insert into facts values(p_name,p_value) on conflict(name) do update set value=excluded.value;
$$;
create function pg_temp.revision(p_command text,p_evidence jsonb,p_hosts jsonb,p_enabled boolean default true) returns integer language sql as $$
 select private.record_market_source_revision_v1(p_command::uuid,'bcb',jsonb_build_object('registryId','bcb_sgs','license',jsonb_build_object('kind','open',
  'license','ODbL-1.0','attribution','Banco Central do Brasil','evidenceIds',p_evidence,'retainAdoptedValues',true,'storeDays',null),
  'allowedHosts',p_hosts,'calendar','br_business_days','expectedPublication','09:00','maximumAgeHours',30,'enabled',p_enabled,
  'reason','Fonte sintética para o teste do agendador'),'3a810000-0000-4000-8000-000000000002');
$$;
select private.register_market_publisher_v1('3a810000-0000-4000-a000-000000000001','Offroad, referência de mercado','3a810000-0000-4000-8000-000000000001');
select pg_temp.revision('3a810000-0000-4000-a000-000000000011','["bcb-catalog-meta-selic-432","bcb-catalog-atas-comunicados-copom","bcb-site-termos-de-uso"]','["api.bcb.gov.br","www.bcb.gov.br"]');
select private.release_market_acquisition_transport_v1('3a810000-0000-4000-a000-000000000021',true,'3a810000-0000-4000-8000-000000000002','Synthetic opening for the scheduler test');
select private.grant_market_acquisition_delegation_v1('3a810000-0000-4000-a000-000000000022','3a810000-0000-4000-8000-000000000011','bcb','Synthetic delegation of the scheduler worker','3a810000-0000-4000-8000-000000000002');
select pg_temp.put('D',private.market_sao_paulo_date_v1(clock_timestamp())::text);
create function pg_temp.d(p_offset integer) returns date language sql stable as $$ select pg_temp.fact('D')::date-p_offset $$;
create function pg_temp.sgs(p_start date,p_end date,p_points jsonb,p_skip date default null) returns bytea language sql as $$
 select convert_to(json_agg(json_build_object('data',to_char(d,'DD/MM/YYYY'),'valor',
  (select x->>1 from jsonb_array_elements(p_points) x where (x->>0)::date<=d order by (x->>0)::date desc limit 1)) order by d)::text,'UTF8')
 from generate_series(p_start,p_end,interval '1 day') d where p_skip is null or d::date<>p_skip;
$$;
create function pg_temp.detail(p_meeting integer,p_reference date,p_verb text,p_pct text) returns bytea language sql as $$
 select convert_to(json_build_object('conteudo',json_build_array(json_build_object('nro_reuniao',p_meeting,'dataReferencia',to_char(p_reference,'YYYY-MM-DD'),
  'titulo',case p_verb when 'hold' then 'Copom mantém a taxa Selic em '||p_pct||'% a.a.' else 'Copom reduz a taxa Selic para '||p_pct||'% a.a.' end,
  'textoComunicado',case p_verb when 'hold' then '<p>O Copom decidiu manter a taxa Selic em '||p_pct||'% a.a.</p>'
   else '<p>O Copom decidiu reduzir a taxa Selic em 0,25 ponto percentual, para '||p_pct||'% a.a.</p>' end)))::text,'UTF8');
$$;
create function pg_temp.list(p_meetings jsonb) returns bytea language sql as $$
 select convert_to(json_build_object('conteudo',(select json_agg(json_build_object('nro_reuniao',(x->>0)::int,'dataReferencia',x->>1,'titulo',(x->>0)||'ª reunião')
  order by (x->>0)::int desc) from jsonb_array_elements(p_meetings) x))::text,'UTF8');
$$;
create function pg_temp.claim(p_job uuid) returns jsonb language plpgsql as $$
declare c jsonb;begin
 perform pg_temp.as_account('3a810000-0000-4000-8000-000000000004');
 c:=private.worker_claim_market_acquisition_v1('synthetic-scheduler-worker-token-3a810000-a');
 perform pg_temp.as_account(null);
 if (c->>'claimed')::boolean is not true or (c->>'jobId')::uuid is distinct from p_job then raise exception 'claimed % instead of %',c,p_job;end if;
 return c;
end $$;
create function pg_temp.commit(c jsonb,p_content bytea) returns jsonb language plpgsql as $$
declare r jsonb;begin
 if not exists(select 1 from storage.objects where bucket_id='market-reference' and name=c->>'objectPath') then
  insert into storage.objects(bucket_id,name,metadata,version) values('market-reference',c->>'objectPath',
   jsonb_build_object('size',octet_length(p_content),'mimetype','application/json','eTag','"'||md5(p_content)||'"'),'market-scheduler-sql-v1');
 end if;
 perform pg_temp.as_account('3a810000-0000-4000-8000-000000000004');
 r:=private.worker_commit_market_version_v1((c->>'jobId')::uuid,c->>'capability',(c->>'leaseId')::uuid,p_content,'application/json',(c->>'acquiredAt')::timestamptz);
 perform pg_temp.as_account(null);
 return r;
end $$;
-- A claim carries the instant its bytes were received, so a replay of the confirmation sends the same one.
create function pg_temp.received(c jsonb) returns jsonb language sql as $$ select c||jsonb_build_object('acquiredAt',clock_timestamp()) $$;
create function pg_temp.fail(c jsonb,p_code text) returns jsonb language plpgsql as $$
declare r jsonb;begin
 perform pg_temp.as_account('3a810000-0000-4000-8000-000000000004');
 r:=private.worker_fail_market_acquisition_v1((c->>'jobId')::uuid,c->>'capability',(c->>'leaseId')::uuid,p_code,false,'Falha sintética');
 perform pg_temp.as_account(null);
 return r;
end $$;
create function pg_temp.fire(p_token text default 'synthetic-scheduler-worker-token-3a810000-a',p_account text default '3a810000-0000-4000-8000-000000000004') returns jsonb language plpgsql as $$
declare r jsonb;begin
 perform pg_temp.as_account(p_account::uuid);
 r:=private.worker_fire_market_schedules_v1(p_token);
 perform pg_temp.as_account(null);
 return r;
end $$;
create function pg_temp.fire_at(p_k timestamptz) returns jsonb language sql as $$
 select private.fire_market_schedules_at_v1('3a810000-0000-4000-8000-000000000011','3a810000-0000-4000-8000-000000000004',p_k);
$$;
create function pg_temp.of(r jsonb,p_kind text) returns jsonb language sql as $$ select x from jsonb_array_elements(r->'schedules') x where x->>'kind'=p_kind $$;
create function pg_temp.series(p_days integer default 0) returns jsonb language sql as $$
 select private.fire_market_series_schedule_v1(s,'3a810000-0000-4000-8000-000000000011','3a810000-0000-4000-8000-000000000004',clock_timestamp()+make_interval(days=>p_days))
 from private.market_acquisition_schedules s where kind='series_432' and revoked_at is null;
$$;
create function pg_temp.grant_series(p_command text,p_start date) returns uuid language sql as $$
 select (private.grant_market_acquisition_schedule_v1(p_command::uuid,'series_432',jsonb_build_object('coverageStart',to_char(p_start,'YYYY-MM-DD')),'00:00',false,
  'Agenda sintética da série','3a810000-0000-4000-8000-000000000002')->>'scheduleId')::uuid;
$$;
create function pg_temp.revoke_series(p_command text) returns void language sql as $$
 select private.revoke_market_acquisition_schedule_v1(p_command::uuid,id,'Fim do cenário sintético','3a810000-0000-4000-8000-000000000002')
 from private.market_acquisition_schedules where kind='series_432' and revoked_at is null;
$$;
create function pg_temp.schedule(p_kind text) returns uuid language sql as $$
 select id from private.market_acquisition_schedules where kind=p_kind and revoked_at is null
$$;
create function pg_temp.manual(p_command text,p_kind text,p_contract text,p_request jsonb,p_actor text default '3a810000-0000-4000-8000-000000000002') returns uuid language sql as $$
 select (private.record_market_schedule_occurrence_v1(p_command::uuid,pg_temp.schedule(p_kind),p_contract,p_request,p_actor::uuid)->>'jobId')::uuid;
$$;
create function pg_temp.window(p_start date,p_end date) returns jsonb language sql as $$
 select jsonb_build_object('window',jsonb_build_object('start',to_char(p_start,'YYYY-MM-DD'),'end',to_char(p_end,'YYYY-MM-DD')));
$$;
create function pg_temp.points(p_extra jsonb default '[]') returns jsonb language sql stable as $$
 select jsonb_build_array(jsonb_build_array(to_char(pg_temp.d(60),'YYYY-MM-DD'),'15.00'),jsonb_build_array(to_char(pg_temp.d(14),'YYYY-MM-DD'),'14.75'))||p_extra;
$$;
-- 1. Grant: parameters, principal, replay, reuse, one active schedule per kind, immutability.
do $$ declare r jsonb;begin
 perform pg_temp.expect($q$select private.grant_market_acquisition_schedule_v1('3a810000-0000-4000-a000-000000000101','series_432','{"coverageStart":"2020-01-01"}','00:00',false,'Agenda sintética da série','3a810000-0000-4000-8000-000000000002')$q$,
  'market_schedule_invalid','coverage before the homologated start');
 perform pg_temp.expect($q$select private.grant_market_acquisition_schedule_v1('3a810000-0000-4000-a000-000000000102','copom_communiques','{"size":5}','00:00',false,'Agenda sintética de comunicados','3a810000-0000-4000-8000-000000000002')$q$,
  'market_schedule_invalid','list too small');
 perform pg_temp.expect($q$select private.grant_market_acquisition_schedule_v1('3a810000-0000-4000-a000-000000000103','copom_communiques','{"size":20,"x":1}','24:00',false,'Agenda sintética de comunicados','3a810000-0000-4000-8000-000000000002')$q$,
  'market_schedule_invalid','extra key and bad hour');
 perform pg_temp.expect($q$select private.grant_market_acquisition_schedule_v1('3a810000-0000-4000-a000-000000000104','copom_communiques','{"size":20}','00:00',false,'Agenda sintética de comunicados','3a810000-0000-4000-8000-000000000004')$q$,
  'platform_principal_required','schedule by a non-principal');
 r:=private.grant_market_acquisition_schedule_v1('3a810000-0000-4000-a000-000000000105','copom_communiques','{"size":20}','00:00',false,'Agenda sintética de comunicados','3a810000-0000-4000-8000-000000000002');
 if (r->>'replayed')::boolean is not false then raise exception 'grant replayed';end if;
 r:=private.grant_market_acquisition_schedule_v1('3a810000-0000-4000-a000-000000000105','copom_communiques','{"size":20}','00:00',false,'Agenda sintética de comunicados','3a810000-0000-4000-8000-000000000002');
 if (r->>'replayed')::boolean is not true then raise exception 'grant did not replay';end if;
 perform pg_temp.expect($q$select private.grant_market_acquisition_schedule_v1('3a810000-0000-4000-a000-000000000105','copom_communiques','{"size":30}','00:00',false,'Agenda sintética de comunicados','3a810000-0000-4000-8000-000000000002')$q$,
  'platform_method_request_reused','grant command reused');
 perform pg_temp.expect($q$select private.grant_market_acquisition_schedule_v1('3a810000-0000-4000-a000-000000000106','copom_communiques','{"size":30}','00:00',false,'Agenda sintética de comunicados','3a810000-0000-4000-8000-000000000002')$q$,
  'market_schedule_active_exists','second active schedule of a kind');
 perform pg_temp.grant_series('3a810000-0000-4000-a000-000000000107',pg_temp.d(20));
 if (select contracts from private.market_acquisition_schedules where kind='copom_communiques' and revoked_at is null) is distinct from array['bcb-copom-comunicados-lista','bcb-copom-comunicados-detalhe']
 then raise exception 'communique schedule contracts';end if;
 perform pg_temp.expect($q$update private.market_acquisition_schedules set local_time='01:00'$q$,'market_schedule_immutable','schedule edited');
end $$;
-- 2. Blockers: delegation, worker identity, transport and source; nothing is written while blocked.
do $$ declare r jsonb;begin
 r:=pg_temp.fire('synthetic-scheduler-worker-token-3a810000-b','3a810000-0000-4000-8000-000000000005');
 if pg_temp.of(r,'series_432')->>'reason' is distinct from 'delegation_missing' or pg_temp.of(r,'copom_communiques')->>'reason' is distinct from 'delegation_missing'
 then raise exception 'undelegated firing: %',r;end if;
 perform pg_temp.expect($q$select pg_temp.fire('synthetic-scheduler-worker-token-3a810000-b','3a810000-0000-4000-8000-000000000004')$q$,'worker_account_binding_required','token with another account');
 perform pg_temp.expect($q$select pg_temp.fire('synthetic-scheduler-worker-token-unknown','3a810000-0000-4000-8000-000000000004')$q$,'*','unknown token');
 perform private.release_market_acquisition_transport_v1('3a810000-0000-4000-a000-000000000023',false,'3a810000-0000-4000-8000-000000000002','Synthetic pause');
 r:=pg_temp.fire();
 if pg_temp.of(r,'copom_communiques')->>'reason' is distinct from 'transport_paused' then raise exception 'paused firing: %',r;end if;
 perform private.release_market_acquisition_transport_v1('3a810000-0000-4000-a000-000000000024',true,'3a810000-0000-4000-8000-000000000002','Synthetic reopening');
 perform pg_temp.revision('3a810000-0000-4000-a000-000000000015','["bcb-catalog-meta-selic-432","bcb-catalog-atas-comunicados-copom","bcb-site-termos-de-uso"]','["api.bcb.gov.br","www.bcb.gov.br"]',false);
 r:=pg_temp.fire();
 if pg_temp.of(r,'copom_communiques')->>'reason' is distinct from 'source_not_acquirable' then raise exception 'disabled source: %',r;end if;
 perform pg_temp.revision('3a810000-0000-4000-a000-000000000016','["bcb-catalog-meta-selic-432","bcb-catalog-atas-comunicados-copom","bcb-site-termos-de-uso"]','["api.bcb.gov.br","www.bcb.gov.br"]');
 if exists(select 1 from private.market_schedule_occurrences) or exists(select 1 from private.market_acquisition_jobs) or exists(select 1 from private.market_acquisition_allocations)
 then raise exception 'a blocked firing wrote';end if;
end $$;
-- 3. First firing: no anchor for the series; the day's list fires once and returns its job on replay.
do $$ declare r jsonb;o private.market_schedule_occurrences;j private.market_acquisition_jobs;begin
 r:=pg_temp.fire();
 if pg_temp.of(r,'series_432')->>'reason' is distinct from 'anchor_missing' or pg_temp.of(r,'copom_communiques')->>'list' is distinct from 'fired' then raise exception 'first firing: %',r;end if;
 select * into o from private.market_schedule_occurrences where occurrence_key='list:'||pg_temp.fact('D');
 select * into j from private.market_acquisition_jobs where id=o.job_id;
 if o.worker_token_id is distinct from '3a810000-0000-4000-8000-000000000011' or o.account_user_id is distinct from '3a810000-0000-4000-8000-000000000004'
 or o.request is distinct from '{"size":20}' or o.actor_user_id is not null or (pg_temp.of(r,'copom_communiques')->>'listJobId')::uuid is distinct from o.job_id
 or j.requested_by is distinct from '3a810000-0000-4000-8000-000000000002'
 or j.command_id is distinct from extensions.uuid_generate_v5('6f0d1c7a-2b4e-5d3f-8a91-4c2e7b5d9e10','market-schedule:'||o.schedule_id||':'||o.occurrence_key)
 or j.status is distinct from 'queued' then raise exception 'list occurrence or job: % %',row_to_json(o),row_to_json(j);end if;
 r:=pg_temp.fire();
 if pg_temp.of(r,'copom_communiques')->>'list' is distinct from 'already_fired' or (pg_temp.of(r,'copom_communiques')->>'listJobId')::uuid is distinct from o.job_id
 or (select count(*) from private.market_acquisition_jobs)<>1 then raise exception 'second firing of the day: %',r;end if;
 perform pg_temp.put('list1',o.job_id::text);
end $$;
-- 4. The list records what it discovered; a replay of its confirmation does not record it again; the next
-- firing creates the missing details and then reports them in flight.
do $$ declare c jsonb;r jsonb;body bytea;begin
 c:=pg_temp.received(pg_temp.claim(pg_temp.fact('list1')::uuid));
 body:=pg_temp.list(jsonb_build_array(jsonb_build_array(9300,to_char(pg_temp.d(30),'YYYY-MM-DD')),jsonb_build_array(9301,to_char(pg_temp.d(15),'YYYY-MM-DD')),
  jsonb_build_array(9302,to_char(pg_temp.d(3),'YYYY-MM-DD')),jsonb_build_array(9303,to_char(pg_temp.d(2),'YYYY-MM-DD'))));
 r:=pg_temp.commit(c,body);
 if (r->>'listed')::int is distinct from 4 or (select count(*) from private.market_copom_listings where list_acquisition_id=(r->>'acquisitionId')::uuid)<>4 then raise exception 'list discovery: %',r;end if;
 r:=pg_temp.commit(c,body);
 if (r->>'replayed')::boolean is not true or (select count(*) from private.market_copom_listings)<>4 then raise exception 'list replay: %',r;end if;
 r:=pg_temp.fire();
 if jsonb_array_length(pg_temp.of(r,'copom_communiques')->'details') is distinct from 4 then raise exception 'details: %',r;end if;
 r:=pg_temp.fire();
 if jsonb_array_length(pg_temp.of(r,'copom_communiques')->'details') is distinct from 0 or jsonb_array_length(pg_temp.of(r,'copom_communiques')->'inFlight') is distinct from 4
 then raise exception 'details in flight: %',r;end if;
end $$;
-- 5. Detail outcomes: confirmed, refused against its listing, disputed, three failures.
do $$ declare c jsonb;r jsonb;job uuid;n integer;begin
 select job_id into job from private.market_schedule_occurrences where occurrence_key='detail:9300:1';
 r:=pg_temp.commit(pg_temp.received(pg_temp.claim(job)),pg_temp.detail(9300,pg_temp.d(30),'hold','15,00'));
 select job_id into job from private.market_schedule_occurrences where occurrence_key='detail:9301:1';
 r:=pg_temp.commit(pg_temp.received(pg_temp.claim(job)),pg_temp.detail(9301,pg_temp.d(15),'cut','14,75'));
 select job_id into job from private.market_schedule_occurrences where occurrence_key='detail:9302:1';
 c:=pg_temp.received(pg_temp.claim(job));
 perform pg_temp.expect(format('select pg_temp.commit(%L::jsonb,%L::bytea)',c,pg_temp.detail(9302,pg_temp.d(4),'hold','14,75')),'market_copom_list_conflict','detail against its listing');
 perform pg_temp.fail(c,'verification_failed');
 select job_id into job from private.market_schedule_occurrences where occurrence_key='detail:9303:1';
 perform pg_temp.fail(pg_temp.claim(job),'meeting_disagreement');
 perform pg_temp.revoke_series('3a810000-0000-4000-a000-000000000300');
 for n in 2..3 loop
  r:=pg_temp.fire();
  if pg_temp.of(r,'copom_communiques')->'details'->0->>'meeting' is distinct from '9302' or jsonb_array_length(pg_temp.of(r,'copom_communiques')->'details') is distinct from 1
  then raise exception 'retry of a failed detail: %',r;end if;
  select job_id into job from private.market_schedule_occurrences where occurrence_key='detail:9302:'||n;
  perform pg_temp.fail(pg_temp.claim(job),'http_status');
 end loop;
 r:=pg_temp.fire();
 if jsonb_array_length(pg_temp.of(r,'copom_communiques')->'details') is distinct from 0
 or ((pg_temp.of(r,'copom_communiques')->'blocked') @> '[{"meeting":9302,"reason":"detail_failures"},{"meeting":9303,"reason":"meeting_disputed"}]') is not true
 then raise exception 'detail blocks: %',r;end if;
end $$;
-- 6. Ten blocked meetings do not take the batch: ten cancelled details are reported and the eleventh is created.
do $$ declare r jsonb;job uuid;n integer;begin
 job:=pg_temp.manual('3a810000-0000-4000-a000-000000000207','copom_communiques','bcb-copom-comunicados-lista','{"size":20}');
 perform pg_temp.commit(pg_temp.received(pg_temp.claim(job)),pg_temp.list((select jsonb_agg(jsonb_build_array(9303+k,to_char(pg_temp.d(200-k),'YYYY-MM-DD'))) from generate_series(1,11) g(k))));
 r:=pg_temp.fire();
 if (select jsonb_agg((x->>'meeting')::int order by (x->>'meeting')::int) from jsonb_array_elements(pg_temp.of(r,'copom_communiques')->'details') x)
  is distinct from (select jsonb_agg(k) from generate_series(9304,9313) g(k)) then raise exception 'batch of ten: %',r;end if;
 for n in 9304..9313 loop
  select job_id into job from private.market_schedule_occurrences where occurrence_key='detail:'||n||':1';
  perform private.cancel_market_acquisition_v1(('3a810000-0000-4000-a000-0000000'||(5000+n))::uuid,job,'Cancelamento sintético','3a810000-0000-4000-8000-000000000002');
 end loop;
 r:=pg_temp.fire();
 if (select count(*) from jsonb_array_elements(pg_temp.of(r,'copom_communiques')->'blocked') x where x->>'reason'='detail_cancelled')<>10
 or pg_temp.of(r,'copom_communiques')->'details' is distinct from jsonb_build_array(jsonb_build_object('meeting',9314,'jobId',
  (select job_id from private.market_schedule_occurrences where occurrence_key='detail:9314:1'))) then raise exception 'eleventh meeting: %',r;end if;
 select job_id into job from private.market_schedule_occurrences where occurrence_key='detail:9314:1';
 perform private.cancel_market_acquisition_v1('3a810000-0000-4000-a000-000000005314',job,'Cancelamento sintético','3a810000-0000-4000-8000-000000000002');
end $$;
-- 7. A manual list against a recorded meeting refuses; a manual request stays inside the schedule.
do $$ declare r jsonb;job uuid;begin
 job:=pg_temp.manual('3a810000-0000-4000-a000-000000000201','copom_communiques','bcb-copom-comunicados-lista','{"size":20}');
 perform pg_temp.expect(format('select pg_temp.commit(pg_temp.received(pg_temp.claim(%L)),pg_temp.list(%L))',job,jsonb_build_array(jsonb_build_array(9301,to_char(pg_temp.d(16),'YYYY-MM-DD')))),
  'market_copom_list_conflict','list against a recorded meeting');
 perform private.cancel_market_acquisition_v1('3a810000-0000-4000-a000-000000000320',job,'Cancelamento sintético','3a810000-0000-4000-8000-000000000002');
 perform pg_temp.expect($q$select pg_temp.manual('3a810000-0000-4000-a000-000000000208','copom_communiques','bcb-copom-comunicados-lista','{"size":30}')$q$,
  'market_schedule_request_outside','list larger than granted');
 perform pg_temp.grant_series('3a810000-0000-4000-a000-000000000299',pg_temp.d(20));
 perform pg_temp.expect(format($q$select pg_temp.manual('3a810000-0000-4000-a000-000000000209','series_432','bcb-sgs-432-endpoint',%L)$q$,pg_temp.window(pg_temp.d(21),pg_temp.d(1))),
  'market_schedule_request_outside','series before the granted start');
end $$;
-- 8. The series: two manual collections leave an internal gap; the firing starts its window at the gap and
-- returns its job on replay; the collection is approved and the coverage is complete. The job of a manual
-- occurrence is requested by the grantor and the occurrence records its author.
do $$ declare r jsonb;job uuid;begin
 job:=pg_temp.manual('3a810000-0000-4000-a000-000000000210','series_432','bcb-sgs-432-endpoint',pg_temp.window(pg_temp.d(20),pg_temp.d(11)),'3a810000-0000-4000-8000-000000000001');
 if (select requested_by from private.market_acquisition_jobs where id=job) is distinct from '3a810000-0000-4000-8000-000000000002'
 or (select actor_user_id from private.market_schedule_occurrences where job_id=job) is distinct from '3a810000-0000-4000-8000-000000000001'
 then raise exception 'manual occurrence author and grantor';end if;
 r:=pg_temp.commit(pg_temp.received(pg_temp.claim(job)),pg_temp.sgs(pg_temp.d(20),pg_temp.d(11),pg_temp.points()));
 if r#>>'{quality,status}' is distinct from 'approved' then raise exception 'first half not approved: %',r;end if;
 job:=pg_temp.manual('3a810000-0000-4000-a000-000000000211','series_432','bcb-sgs-432-endpoint',pg_temp.window(pg_temp.d(9),pg_temp.d(1)));
 r:=pg_temp.commit(pg_temp.received(pg_temp.claim(job)),pg_temp.sgs(pg_temp.d(9),pg_temp.d(1),pg_temp.points()));
 if r#>>'{quality,status}' is distinct from 'approved' then raise exception 'second half not approved: %',r;end if;
 r:=pg_temp.fire();
 if pg_temp.of(r,'series_432')->>'status' is distinct from 'fired' or pg_temp.of(r,'series_432')->>'windowStart' is distinct from to_char(pg_temp.d(10),'YYYY-MM-DD')
 or pg_temp.of(r,'series_432')->>'windowEnd' is distinct from to_char(pg_temp.d(1),'YYYY-MM-DD') then raise exception 'internal gap: %',r;end if;
 job:=(pg_temp.of(r,'series_432')->>'jobId')::uuid;
 r:=pg_temp.fire();
 if pg_temp.of(r,'series_432')->>'status' is distinct from 'already_fired' or (pg_temp.of(r,'series_432')->>'jobId')::uuid is distinct from job then raise exception 'series replay: %',r;end if;
 r:=pg_temp.commit(pg_temp.received(pg_temp.claim(job)),pg_temp.sgs(pg_temp.d(10),pg_temp.d(1),pg_temp.points()));
 if r#>>'{quality,status}' is distinct from 'approved' then raise exception 'series not approved: %',r;end if;
 perform pg_temp.revoke_series('3a810000-0000-4000-a000-000000000301');
 perform pg_temp.grant_series('3a810000-0000-4000-a000-000000000302',pg_temp.d(20));
 r:=pg_temp.series();
 if r->>'status' is distinct from 'covered' then raise exception 'coverage complete: %',r;end if;
end $$;
-- 9. Recovery by the outcome of the last occurrence.
do $$ declare r jsonb;begin
 perform pg_temp.revoke_series('3a810000-0000-4000-a000-000000000303');
 perform pg_temp.grant_series('3a810000-0000-4000-a000-000000000304',pg_temp.d(21));
 r:=pg_temp.series();
 r:=pg_temp.commit(pg_temp.received(pg_temp.claim((r->>'jobId')::uuid)),pg_temp.sgs(pg_temp.d(21),pg_temp.d(1),
  jsonb_build_array(jsonb_build_array(to_char(pg_temp.d(60),'YYYY-MM-DD'),'15.00'),jsonb_build_array(to_char(pg_temp.d(14),'YYYY-MM-DD'),'14.50'))));
 if r#>>'{quality,status}' is distinct from 'quarantined' then raise exception 'divergent series approved';end if;
 r:=pg_temp.series(1);
 if r->>'reason' is distinct from 'series_disagreement' then raise exception 'divergence: %',r;end if;
 perform pg_temp.revoke_series('3a810000-0000-4000-a000-000000000305');
 perform pg_temp.grant_series('3a810000-0000-4000-a000-000000000306',pg_temp.d(22));
 r:=pg_temp.series();
 r:=pg_temp.commit(pg_temp.received(pg_temp.claim((r->>'jobId')::uuid)),pg_temp.sgs(pg_temp.d(22),pg_temp.d(1),pg_temp.points(),pg_temp.d(10)));
 if r#>>'{quality,status}' is distinct from 'quarantined' then raise exception 'gapped series approved';end if;
 r:=pg_temp.series(1);
 if r->>'status' is distinct from 'fired' then raise exception 'calendar gap not recovered: %',r;end if;
 perform private.cancel_market_acquisition_v1('3a810000-0000-4000-a000-000000000321',(r->>'jobId')::uuid,'Cancelamento sintético','3a810000-0000-4000-8000-000000000002');
 r:=pg_temp.series(2);
 if r->>'reason' is distinct from 'series_cancelled' then raise exception 'cancelled series: %',r;end if;
 perform pg_temp.revoke_series('3a810000-0000-4000-a000-000000000307');
 perform pg_temp.grant_series('3a810000-0000-4000-a000-000000000308',pg_temp.d(24));
 r:=pg_temp.series();
 r:=pg_temp.commit(pg_temp.received(pg_temp.claim((r->>'jobId')::uuid)),pg_temp.sgs(pg_temp.d(24),pg_temp.d(1),
  pg_temp.points(jsonb_build_array(jsonb_build_array(to_char(pg_temp.d(22),'YYYY-MM-DD'),'14.90')))||jsonb_build_array(jsonb_build_array(to_char(pg_temp.d(14),'YYYY-MM-DD'),'14.75'))));
 if r#>>'{quality,status}' is distinct from 'quarantined' then raise exception 'undocumented change approved';end if;
 r:=pg_temp.series(1);
 if r->>'reason' is distinct from 'missing_communiques' or ((r->'periods') ? to_char(pg_temp.d(22),'YYYY-MM-DD')) is not true then raise exception 'documentary gap: %',r;end if;
 r:=pg_temp.series(2);
 if r->>'reason' is distinct from 'missing_communiques' then raise exception 'a later horizon released the window: %',r;end if;
 perform pg_temp.commit(pg_temp.received(pg_temp.claim(pg_temp.manual('3a810000-0000-4000-a000-000000000202','copom_communiques','bcb-copom-comunicados-detalhe','{"meeting":9297}'))),
  pg_temp.detail(9297,pg_temp.d(50),'hold','15,00'));
 r:=pg_temp.series(1);
 if r->>'reason' is distinct from 'missing_communiques' then raise exception 'unrelated communiqué released the window: %',r;end if;
 perform pg_temp.commit(pg_temp.received(pg_temp.claim(pg_temp.manual('3a810000-0000-4000-a000-000000000203','copom_communiques','bcb-copom-comunicados-detalhe','{"meeting":9298}'))),
  pg_temp.detail(9298,pg_temp.d(23),'cut','14,90'));
 r:=pg_temp.series(1);
 if r->>'status' is distinct from 'fired' then raise exception 'pending communiqué did not release the window: %',r;end if;
 perform private.cancel_market_acquisition_v1('3a810000-0000-4000-a000-000000000322',(r->>'jobId')::uuid,'Cancelamento sintético','3a810000-0000-4000-8000-000000000002');
end $$;
-- 10. Budget: three automatic occurrences per window start, reset by a manual occurrence.
do $$ declare r jsonb;s uuid;j1 uuid;j2 uuid;begin
 perform pg_temp.revoke_series('3a810000-0000-4000-a000-000000000309');
 s:=pg_temp.grant_series('3a810000-0000-4000-a000-000000000310',pg_temp.d(26));
 -- Two earlier automatic occurrences of the same start, through the common enqueue, both failed.
 j1:=private.enqueue_market_schedule_job_v1(s,'series:2000-01-01','bcb-sgs-432-endpoint',pg_temp.window(pg_temp.d(26),pg_temp.d(1)),
  '3a810000-0000-4000-8000-000000000011','3a810000-0000-4000-8000-000000000004',null);
 j2:=private.enqueue_market_schedule_job_v1(s,'series:2000-01-02','bcb-sgs-432-endpoint',pg_temp.window(pg_temp.d(26),pg_temp.d(2)),
  '3a810000-0000-4000-8000-000000000011','3a810000-0000-4000-8000-000000000004',null);
 perform pg_temp.fail(pg_temp.claim(j1),'http_status');
 perform pg_temp.fail(pg_temp.claim(j2),'http_status');
 r:=pg_temp.series();
 if r->>'status' is distinct from 'fired' then raise exception 'third automatic occurrence: %',r;end if;
 perform pg_temp.fail(pg_temp.claim((r->>'jobId')::uuid),'http_status');
 r:=pg_temp.series(1);
 if r->>'reason' is distinct from 'series_budget' then raise exception 'budget: %',r;end if;
 j1:=pg_temp.manual('3a810000-0000-4000-a000-000000000212','series_432','bcb-sgs-432-endpoint',pg_temp.window(pg_temp.d(26),pg_temp.d(1)));
 perform pg_temp.fail(pg_temp.claim(j1),'http_status');
 r:=pg_temp.series(1);
 if r->>'status' is distinct from 'fired' then raise exception 'manual occurrence did not reset the budget: %',r;end if;
 perform private.cancel_market_acquisition_v1('3a810000-0000-4000-a000-000000000325',(r->>'jobId')::uuid,'Cancelamento sintético','3a810000-0000-4000-8000-000000000002');
end $$;
-- 11. Hours and business days: before the hour and on a holiday nothing is created, not even a detail.
do $$ declare r jsonb;n integer;begin
 perform pg_temp.revoke_series('3a810000-0000-4000-a000-000000000328');
 perform private.revoke_market_acquisition_schedule_v1('3a810000-0000-4000-a000-000000000403',pg_temp.schedule('copom_communiques'),'Troca sintética do horário','3a810000-0000-4000-8000-000000000002');
 perform private.grant_market_acquisition_schedule_v1('3a810000-0000-4000-a000-000000000404','copom_communiques','{"size":20}','10:00',true,'Agenda sintética em dias úteis','3a810000-0000-4000-8000-000000000002');
 select count(*) into n from private.market_schedule_occurrences;
 r:=pg_temp.fire_at('2026-12-25 12:00:00-03');
 if pg_temp.of(r,'copom_communiques')->>'status' is distinct from 'not_due' then raise exception 'holiday: %',r;end if;
 r:=pg_temp.fire_at('2026-12-28 09:59:00-03');
 if pg_temp.of(r,'copom_communiques')->>'status' is distinct from 'not_due' then raise exception 'before the hour: %',r;end if;
 if (select count(*) from private.market_schedule_occurrences)<>n then raise exception 'a firing out of hours wrote';end if;
 r:=pg_temp.fire_at('2026-12-28 10:00:00-03');
 if pg_temp.of(r,'copom_communiques')->>'list' is distinct from 'fired'
 or not exists(select 1 from private.market_schedule_occurrences where occurrence_key='list:2026-12-28') then raise exception 'on the hour: %',r;end if;
 perform private.revoke_market_acquisition_schedule_v1('3a810000-0000-4000-a000-000000000405',pg_temp.schedule('copom_communiques'),'Volta sintética do horário','3a810000-0000-4000-8000-000000000002');
 perform private.grant_market_acquisition_schedule_v1('3a810000-0000-4000-a000-000000000406','copom_communiques','{"size":20}','00:00',false,'Agenda sintética de comunicados','3a810000-0000-4000-8000-000000000002');
end $$;
-- 12. Pure parts: the window at the homologated start and at the ten-year limit across a leap day, the
-- contract's own limit, and the decision over sets of findings.
do $$ declare r jsonb;begin
 if (select row(w.window_start,w.window_end)::text from private.market_series_window_v1('2021-01-14','2024-02-29','2035-01-01') w) is distinct from '(2024-02-29,2034-02-28)'
 or (select row(w.window_start,w.window_end)::text from private.market_series_window_v1('2021-01-14','2021-01-14','2035-01-01') w) is distinct from '(2021-01-14,2031-01-13)'
 or (select row(w.window_start,w.window_end)::text from private.market_series_window_v1('2021-01-14','2020-05-01','2021-02-01') w) is distinct from '(2021-01-14,2021-01-31)'
 then raise exception 'series window';end if;
 perform private.market_contract_url_v1('bcb-sgs-432-endpoint','{"window":{"start":"2024-02-29","end":"2034-02-28"}}','2035-01-01');
 perform private.market_contract_url_v1('bcb-sgs-432-endpoint','{"window":{"start":"2021-01-14","end":"2031-01-13"}}','2035-01-01');
 perform pg_temp.expect($q$select private.market_contract_url_v1('bcb-sgs-432-endpoint','{"window":{"start":"2024-02-29","end":"2034-03-01"}}','2035-01-01')$q$,'*','leap window past ten years');
 perform pg_temp.expect($q$select private.market_contract_url_v1('bcb-sgs-432-endpoint','{"window":{"start":"2021-01-14","end":"2031-01-14"}}','2035-01-01')$q$,'*','window past ten years');
 if private.market_series_quality_class_v1('[{"code":"calendar_gap","period":"2026-01-02"},{"code":"communique_value_mismatch","period":"2026-01-05"}]') is distinct from 'disagreement'
 or private.market_series_quality_class_v1('[{"code":"calendar_gap"},{"code":"change_without_communique","period":"2026-01-05"}]') is distinct from 'documentary'
 or private.market_series_quality_class_v1('[{"code":"start_without_anchor"},{"code":"anchor_value_mismatch"}]') is distinct from 'disagreement'
 or private.market_series_quality_class_v1('[{"code":"calendar_gap"},{"code":"something_new"}]') is distinct from 'unclassified'
 or private.market_series_quality_class_v1('[]') is distinct from 'unclassified'
 or private.market_series_quality_class_v1('[{"code":"no_observation"},{"code":"calendar_gap"}]') is distinct from 'calendar'
 then raise exception 'quality classes';end if;
 perform pg_temp.revoke_series('3a810000-0000-4000-a000-000000000326');
 perform pg_temp.grant_series('3a810000-0000-4000-a000-000000000327','2021-01-14');
 r:=pg_temp.series();
 if r->>'reason' is distinct from 'anchor_missing' or r->>'windowStart' is distinct from '2021-01-14' then raise exception 'homologated start: %',r;end if;
end $$;
-- 13. Shared checks through the manual occurrence; integrity of occurrences; nothing stays when the
-- occurrence fails after its job.
do $$ declare r jsonb;s uuid;n integer;j uuid;begin
 s:=pg_temp.schedule('copom_communiques');
 perform pg_temp.expect(format($q$select private.record_market_schedule_occurrence_v1('3a810000-0000-4000-a000-000000000204',%L,'bcb-sgs-432-endpoint','{"window":{"start":"2026-01-01","end":"2026-01-02"}}','3a810000-0000-4000-8000-000000000002')$q$,s),
  'market_schedule_contract','contract outside the schedule');
 perform pg_temp.revision('3a810000-0000-4000-a000-000000000012','["bcb-catalog-meta-selic-432","bcb-site-termos-de-uso"]','["api.bcb.gov.br","www.bcb.gov.br"]');
 select count(*) into n from private.market_schedule_occurrences;
 r:=pg_temp.fire();
 if pg_temp.of(r,'copom_communiques')->>'reason' is distinct from 'contract_evidence_missing' then raise exception 'evidence block: %',r;end if;
 perform pg_temp.expect(format($q$select private.record_market_schedule_occurrence_v1('3a810000-0000-4000-a000-000000000205',%L,'bcb-copom-comunicados-detalhe','{"meeting":9310}','3a810000-0000-4000-8000-000000000002')$q$,s),
  'market_schedule_blocked:contract_evidence_missing','manual occurrence without evidence');
 perform pg_temp.revision('3a810000-0000-4000-a000-000000000013','["bcb-catalog-meta-selic-432","bcb-catalog-atas-comunicados-copom","bcb-site-termos-de-uso"]','["api.bcb.gov.br"]');
 perform pg_temp.expect(format($q$select private.record_market_schedule_occurrence_v1('3a810000-0000-4000-a000-000000000206',%L,'bcb-copom-comunicados-detalhe','{"meeting":9310}','3a810000-0000-4000-8000-000000000002')$q$,s),
  'market_schedule_blocked:host_not_allowed','manual occurrence without the host');
 if (select count(*) from private.market_schedule_occurrences)<>n then raise exception 'a blocked occurrence was written';end if;
 perform pg_temp.revision('3a810000-0000-4000-a000-000000000014','["bcb-catalog-meta-selic-432","bcb-catalog-atas-comunicados-copom","bcb-site-termos-de-uso"]','["api.bcb.gov.br","www.bcb.gov.br"]');
 perform pg_temp.expect(format($q$select private.enqueue_market_schedule_job_v1(%L,'detail:9399:4','bcb-copom-comunicados-detalhe','{"meeting":9399}','3a810000-0000-4000-8000-000000000011','3a810000-0000-4000-8000-000000000004',null)$q$,s),
  'market_schedule_occurrence_invalid','fourth detail attempt');
 if exists(select 1 from private.market_acquisition_jobs where command_id=extensions.uuid_generate_v5('6f0d1c7a-2b4e-5d3f-8a91-4c2e7b5d9e10','market-schedule:'||s||':detail:9399:4'))
 then raise exception 'a job stayed without its occurrence';end if;
 perform pg_temp.expect(format($q$insert into private.market_schedule_occurrences(id,schedule_id,occurrence_key,contract_id,request,request_sha256,window_start,meeting,job_id,worker_token_id,account_user_id)
  select gen_random_uuid(),%L,'detail:9399:1','bcb-copom-comunicados-detalhe','{"meeting":9398}',repeat('0',64),null,9399,id,'3a810000-0000-4000-8000-000000000011','3a810000-0000-4000-8000-000000000004'
  from private.market_acquisition_jobs limit 1$q$,s),'market_schedule_occurrence_invalid','incoherent occurrence');
 -- A job of another command is not the job of a schedule's key.
 j:=(private.enqueue_market_contract_acquisition_v1('3a810000-0000-4000-a000-000000000213','bcb-copom-comunicados-lista','{"size":20}','Job sintético sem agenda',
  '3a810000-0000-4000-8000-000000000002')->>'jobId')::uuid;
 perform pg_temp.expect(format($q$insert into private.market_schedule_occurrences(id,schedule_id,occurrence_key,contract_id,request,request_sha256,job_id,worker_token_id,account_user_id)
  values(gen_random_uuid(),%L,'list:2000-01-01','bcb-copom-comunicados-lista','{"size":20}',encode(extensions.digest(convert_to('{"size": 20}','UTF8'),'sha256'),'hex'),%L,
  '3a810000-0000-4000-8000-000000000011','3a810000-0000-4000-8000-000000000004')$q$,s,j),'market_schedule_occurrence_invalid','job of another command');
 perform private.cancel_market_acquisition_v1('3a810000-0000-4000-a000-000000000330',j,'Cancelamento sintético','3a810000-0000-4000-8000-000000000002');
 -- The job of the key's own command, with a list larger than the schedule granted.
 insert into private.market_acquisition_jobs(id,command_id,requested_by,reason,source_id,source_revision,url,extension,contract_id,request)
 values(gen_random_uuid(),extensions.uuid_generate_v5('6f0d1c7a-2b4e-5d3f-8a91-4c2e7b5d9e10','market-schedule:'||s||':list:2000-01-02'),'3a810000-0000-4000-8000-000000000002',
  'Job sintético fora da agenda','bcb',(private.market_source_in_force_v1('bcb')).revision,private.market_contract_url_v1('bcb-copom-comunicados-lista','{"size":30}',null),
  'json','bcb-copom-comunicados-lista','{"size":30}') returning id into j;
 perform pg_temp.expect(format($q$insert into private.market_schedule_occurrences(id,schedule_id,occurrence_key,contract_id,request,request_sha256,job_id,worker_token_id,account_user_id)
  values(gen_random_uuid(),%L,'list:2000-01-02','bcb-copom-comunicados-lista','{"size":30}',encode(extensions.digest(convert_to('{"size": 30}','UTF8'),'sha256'),'hex'),%L,
  '3a810000-0000-4000-8000-000000000011','3a810000-0000-4000-8000-000000000004')$q$,s,j),'market_schedule_occurrence_invalid','list larger than granted');
 perform private.cancel_market_acquisition_v1('3a810000-0000-4000-a000-000000000331',j,'Cancelamento sintético','3a810000-0000-4000-8000-000000000002');
end $$;
-- 14. Revocation with receipts; an inactive grantor blocks the schedule.
do $$ declare r jsonb;s uuid;begin
 s:=pg_temp.schedule('copom_communiques');
 r:=private.revoke_market_acquisition_schedule_v1('3a810000-0000-4000-a000-000000000401',s,'Revogação sintética da agenda','3a810000-0000-4000-8000-000000000002');
 r:=private.revoke_market_acquisition_schedule_v1('3a810000-0000-4000-a000-000000000401',s,'Revogação sintética da agenda','3a810000-0000-4000-8000-000000000002');
 if (r->>'replayed')::boolean is not true then raise exception 'revocation did not replay';end if;
 perform pg_temp.expect(format($q$select private.revoke_market_acquisition_schedule_v1('3a810000-0000-4000-a000-000000000402',%L,'Revogação sintética da agenda','3a810000-0000-4000-8000-000000000002')$q$,s),
  'market_schedule_revoked','second revocation');
 r:=pg_temp.fire();
 if pg_temp.of(r,'copom_communiques') is not null then raise exception 'revoked schedule fired: %',r;end if;
 update private.platform_principals set revoked_at=clock_timestamp(),revoked_by='3a810000-0000-4000-8000-000000000001',revoked_reason='Revogação sintética do operador'
 where user_id='3a810000-0000-4000-8000-000000000002';
 r:=pg_temp.fire();
 if pg_temp.of(r,'series_432')->>'reason' is distinct from 'grantor_inactive' then raise exception 'inactive grantor: %',r;end if;
end $$;
-- 15. Closed surfaces.
do $$ declare t text;f text;begin
 perform pg_temp.expect($q$update private.market_schedule_occurrences set request='{}'$q$,'market_record_immutable','occurrence edited');
 perform pg_temp.expect($q$delete from private.market_copom_listings$q$,'market_record_immutable','listing deleted');
 perform pg_temp.expect($q$delete from private.market_acquisition_schedules$q$,'market_schedule_immutable','schedule deleted');
 foreach t in array array['market_acquisition_schedules','market_schedule_occurrences','market_copom_listings'] loop
  if not (select relrowsecurity and relforcerowsecurity from pg_class where oid=('private.'||t)::regclass) then raise exception 'row security off on %',t;end if;
  if has_table_privilege('anon','private.'||t,'select') or has_table_privilege('authenticated','private.'||t,'select') or has_table_privilege('service_role','private.'||t,'select')
  then raise exception 'table % readable by an API role',t;end if;
 end loop;
 foreach f in array array['private.grant_market_acquisition_schedule_v1(uuid,text,jsonb,text,boolean,text,uuid)','private.revoke_market_acquisition_schedule_v1(uuid,uuid,text,uuid)',
  'private.record_market_schedule_occurrence_v1(uuid,uuid,text,jsonb,uuid)','private.enqueue_market_schedule_job_v1(uuid,text,text,jsonb,uuid,uuid,uuid)',
  'private.fire_market_series_schedule_v1(private.market_acquisition_schedules,uuid,uuid,timestamp with time zone)',
  'private.fire_market_communique_schedule_v1(private.market_acquisition_schedules,uuid,uuid,timestamp with time zone)',
  'private.fire_market_schedules_at_v1(uuid,uuid,timestamp with time zone)','private.market_schedule_blocker_v1(private.market_acquisition_schedules,uuid,date)',
  'private.market_series_window_v1(date,date,date)','private.market_series_quality_class_v1(jsonb)','private.guard_market_schedule_occurrence_v1()',
  'private.market_parse_copom_list_meetings_v1(bytea,integer)'] loop
  if has_function_privilege('authenticated',f,'execute') or has_function_privilege('anon',f,'execute') or has_function_privilege('service_role',f,'execute')
  then raise exception '% executable by an API role',f;end if;
 end loop;
 if not has_function_privilege('authenticated','public.worker_fire_market_schedules_v1(text)','execute') or has_function_privilege('anon','public.worker_fire_market_schedules_v1(text)','execute')
 then raise exception 'firing grants';end if;
 if public.worker_runtime_schema_contract_v1()::text not like '%market-acquisition-scheduler.v1%' then raise exception 'capability not announced';end if;
end $$;
select 'market_scheduler' as test,'PASS' as result;
rollback;
