-- Market event outbox (ADR 0023, M2 part 3): fan-out in the event's transaction, consumer commands,
-- per-subject order, lease, effect and completion in one transaction with an immutable receipt, retry
-- budget and block, delegation fencing, disabling, isolation and closed surfaces. Synthetic, rolls back.
begin;
set local statement_timeout='60s';
select set_config('request.jwt.claims','{}',true);
select set_config('request.jwt.claim.sub','',true);
-- 1 founder, 2 operator, 4 worker account, 5 second worker account.
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
select ('3a790000-0000-4000-8000-00000000000'||n)::uuid,'authenticated','authenticated','3a790000-'||n||'@example.invalid','{}','{}',now(),now(),false,false
from unnest(array[1,2,4,5]) n;
insert into private.platform_principals(user_id,role,label) values
 ('3a790000-0000-4000-8000-000000000001','founder','Synthetic outbox founder'),
 ('3a790000-0000-4000-8000-000000000002','operator','Synthetic outbox operator');
insert into private.worker_tokens(id,label,token_sha256,execution_account_user_id) values
 ('3a790000-0000-4000-8000-000000000011','Synthetic outbox worker',extensions.digest('synthetic-outbox-worker-token-3a790000-a','sha256'),'3a790000-0000-4000-8000-000000000004'),
 ('3a790000-0000-4000-8000-000000000012','Synthetic second outbox worker',extensions.digest('synthetic-outbox-worker-token-3a790000-b','sha256'),'3a790000-0000-4000-8000-000000000005');
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
select private.register_market_publisher_v1('3a790000-0000-4000-a000-000000000001','Offroad, referência de mercado','3a790000-0000-4000-8000-000000000001');
select private.record_market_source_revision_v1('3a790000-0000-4000-a000-000000000011','bcb',jsonb_build_object('registryId','bcb_sgs',
 'license',jsonb_build_object('kind','open','license','ODbL-1.0','attribution','Banco Central do Brasil',
  'evidenceIds',jsonb_build_array('bcb-catalog-meta-selic-432','bcb-catalog-atas-comunicados-copom','bcb-site-termos-de-uso'),'retainAdoptedValues',true,'storeDays',null),
 'allowedHosts',jsonb_build_array('api.bcb.gov.br','www.bcb.gov.br'),'calendar','br_business_days','expectedPublication','09:00','maximumAgeHours',30,'enabled',true,
 'reason','Fonte sintética para o teste da outbox'),'3a790000-0000-4000-8000-000000000002');
-- An event on the source, as the camada records it.
create function pg_temp.event(p_event text) returns bigint language sql as $$
 insert into private.market_events(subject_kind,subject_id,event,reason,actor_user_id) values('source','bcb',p_event,'Evento sintético da outbox','3a790000-0000-4000-8000-000000000002')
 returning sequence;
$$;
create function pg_temp.claim(p_name text,p_token text default 'synthetic-outbox-worker-token-3a790000-a',p_account text default '3a790000-0000-4000-8000-000000000004') returns jsonb
language plpgsql as $$
declare c jsonb;begin
 perform pg_temp.as_account(p_account::uuid);
 c:=private.worker_claim_market_event_v1(p_token,'rg-01-test');
 perform pg_temp.as_account(null);
 insert into claims values(p_name,c) on conflict(name) do update set claim=excluded.claim;
 return c;
end $$;
create function pg_temp.complete(p_name text,p_effect jsonb,p_account text default '3a790000-0000-4000-8000-000000000004') returns jsonb language plpgsql as $$
declare c jsonb;r jsonb;begin
 select claim into strict c from claims where name=p_name;
 perform pg_temp.as_account(p_account::uuid);
 r:=private.worker_complete_market_event_v1('rg-01-test',(c->>'eventSequence')::bigint,c->>'capability',(c->>'leaseId')::uuid,p_effect);
 perform pg_temp.as_account(null);
 return r;
end $$;
create function pg_temp.fail(p_name text) returns jsonb language plpgsql as $$
declare c jsonb;r jsonb;begin
 select claim into strict c from claims where name=p_name;
 perform pg_temp.as_account('3a790000-0000-4000-8000-000000000004');
 r:=private.worker_fail_market_event_v1('rg-01-test',(c->>'eventSequence')::bigint,c->>'capability',(c->>'leaseId')::uuid,'synthetic_failure','Falha sintética');
 perform pg_temp.as_account(null);
 return r;
end $$;
create function pg_temp.row_of(p_sequence bigint) returns private.market_event_outbox language sql as $$
 select * from private.market_event_outbox where consumer_id='rg-01-test' and event_sequence=p_sequence;
$$;

-- 1. Without a consumer an event fans out to nothing; registration is a founder command with a receipt.
do $$ declare s bigint;r jsonb;begin
 s:=pg_temp.event('released');
 if exists(select 1 from private.market_event_outbox where event_sequence=s) then raise exception 'row without a consumer';end if;
 perform pg_temp.expect($q$select private.register_market_event_consumer_v1('3a790000-0000-4000-a000-000000000101','rg-01-test',array['released'],array['source'],'Consumidor sintético','3a790000-0000-4000-8000-000000000002')$q$,
  'platform_principal_required','operator registers a consumer');
 r:=private.register_market_event_consumer_v1('3a790000-0000-4000-a000-000000000102','rg-01-test',array['released','approved'],array['source','version'],'Consumidor sintético do teste','3a790000-0000-4000-8000-000000000001');
 if (r->>'replayed')::boolean then raise exception 'registration replayed';end if;
 r:=private.register_market_event_consumer_v1('3a790000-0000-4000-a000-000000000102','rg-01-test',array['approved','released'],array['version','source'],'Consumidor sintético do teste','3a790000-0000-4000-8000-000000000001');
 if (r->>'replayed')::boolean is not true then raise exception 'registration did not replay';end if;
 perform pg_temp.expect($q$select private.register_market_event_consumer_v1('3a790000-0000-4000-a000-000000000102','rg-01-test',array['approved'],array['source'],'Consumidor sintético do teste','3a790000-0000-4000-8000-000000000001')$q$,
  'platform_method_request_reused','registration command reused');
 perform pg_temp.expect($q$select private.register_market_event_consumer_v1('3a790000-0000-4000-a000-000000000103','rg-01-test',array['approved'],array['source'],'Outro registro','3a790000-0000-4000-8000-000000000001')$q$,
  'market_event_consumer_exists','consumer registered twice');
 perform pg_temp.expect($q$select private.register_market_event_consumer_v1('3a790000-0000-4000-a000-000000000104','bad-events',array['created'],array['source'],'Evento desconhecido','3a790000-0000-4000-8000-000000000001')$q$,
  '23514','unknown event in the filter');
end $$;

-- 2. Fan-out in the event's transaction, per-subject ordinals, filter, and rollback leaves nothing.
do $$ declare s1 bigint;s2 bigint;s3 bigint;n integer;begin
 s1:=pg_temp.event('released');s2:=pg_temp.event('released');
 if (pg_temp.row_of(s1)).subject_key<>'source:bcb' or (pg_temp.row_of(s1)).subject_ordinal<>1 or (pg_temp.row_of(s2)).subject_ordinal<>2
 or (pg_temp.row_of(s1)).status<>'pending' then raise exception 'fan-out rows wrong';end if;
 s3:=pg_temp.event('purged');
 if exists(select 1 from private.market_event_outbox where event_sequence=s3) then raise exception 'event outside the filter fanned out';end if;
 select count(*) into n from private.market_event_outbox;
 begin perform pg_temp.event('released');raise exception 'rollback';exception when raise_exception then null;end;
 if (select count(*) from private.market_event_outbox)<>n then raise exception 'rolled back event left a row';end if;
 insert into claims values('s1',jsonb_build_object('seq',s1)),('s2',jsonb_build_object('seq',s2));
end $$;

-- 3. Claim needs a live delegation; the subject's next row waits for its predecessor.
do $$ declare c jsonb;begin
 if (pg_temp.claim('undelegated')->>'claimed')::boolean then raise exception 'claimed without a delegation';end if;
 perform pg_temp.expect($q$select private.grant_market_event_delegation_v1('3a790000-0000-4000-a000-000000000201','3a790000-0000-4000-8000-000000000011','rg-01-test','Delegação sintética','3a790000-0000-4000-8000-000000000004')$q$,
  'platform_principal_required','worker account delegates');
 perform private.grant_market_event_delegation_v1('3a790000-0000-4000-a000-000000000202','3a790000-0000-4000-8000-000000000011','rg-01-test','Delegação sintética do teste','3a790000-0000-4000-8000-000000000002');
 if (pg_temp.claim('other','synthetic-outbox-worker-token-3a790000-b','3a790000-0000-4000-8000-000000000005')->>'claimed')::boolean then raise exception 'undelegated worker claimed';end if;
 perform pg_temp.expect($q$select pg_temp.claim('crossed','synthetic-outbox-worker-token-3a790000-a','3a790000-0000-4000-8000-000000000005')$q$,'worker_account_binding_required','token of another account');
 c:=pg_temp.claim('a1');
 if (c->>'claimed')::boolean is not true or (c->>'eventSequence')::bigint<>(select (claim->>'seq')::bigint from claims where name='s1') or (c->>'attempt')::int<>1
 or c#>>'{event,subjectKind}'<>'source' or c#>>'{event,event}'<>'released' then raise exception 'first claim wrong: %',c;end if;
 if (pg_temp.claim('a2')->>'claimed')::boolean then raise exception 'successor claimed before its predecessor completed';end if;
end $$;

-- 4. Completion: lease checks, effect and receipt in one transaction, replay against the receipt.
do $$ declare c jsonb;r jsonb;begin
 select claim into strict c from claims where name='a1';
 perform pg_temp.as_account('3a790000-0000-4000-8000-000000000004');
 perform pg_temp.expect(format($q$select private.worker_complete_market_event_v1('rg-01-test',%s,%L,%L,'{"ok":true}')$q$,c->>'eventSequence',repeat('f',64),c->>'leaseId'),
  'market_event_lease_denied','wrong capability');
 perform pg_temp.expect(format($q$select private.worker_complete_market_event_v1('rg-01-test',%s,%L,%L,'[1]')$q$,c->>'eventSequence',c->>'capability',c->>'leaseId'),
  'market_event_effect_invalid','effect that is not an object');
 perform pg_temp.as_account(null);
 perform pg_temp.expect($q$select pg_temp.complete('a1','{"ok":true}','3a790000-0000-4000-8000-000000000005')$q$,'market_event_lease_denied','another account completes');
 r:=pg_temp.complete('a1','{"ok":true}');
 if (r->>'replayed')::boolean then raise exception 'first completion replayed';end if;
 if (pg_temp.row_of((c->>'eventSequence')::bigint)).status<>'completed' or (pg_temp.row_of((c->>'eventSequence')::bigint)).lease_id is not null
 or not exists(select 1 from private.market_event_receipts where event_sequence=(c->>'eventSequence')::bigint and effect='{"ok":true}'
  and worker_token_id='3a790000-0000-4000-8000-000000000011' and account_user_id='3a790000-0000-4000-8000-000000000004')
 then raise exception 'completion not recorded';end if;
 if (pg_temp.complete('a1','{"ok":true}')->>'replayed')::boolean is not true then raise exception 'completion did not replay';end if;
 perform pg_temp.expect($q$select pg_temp.complete('a1','{"ok":false}')$q$,'market_event_lease_denied','replay with another effect');
 perform pg_temp.expect($q$select pg_temp.complete('a1','{"ok":true}','3a790000-0000-4000-8000-000000000005')$q$,'market_event_lease_denied','replay by another account');
end $$;

-- 5. Retry budget: every claim counts; the fifth unsuccessful attempt blocks, by failure or by expiry.
do $$ declare c jsonb;s bigint;i integer;r jsonb;begin
 select (claim->>'seq')::bigint into s from claims where name='s2';
 for i in 1..4 loop
  c:=pg_temp.claim('b'||i);
  if (c->>'eventSequence')::bigint<>s or (c->>'attempt')::int<>i then raise exception 'claim % wrong: %',i,c;end if;
  r:=pg_temp.fail('b'||i);
  if (r->>'blocked')::boolean or (pg_temp.row_of(s)).status<>'pending' then raise exception 'blocked too early at %',i;end if;
  update private.market_event_outbox set available_at=clock_timestamp()-interval '1 second' where consumer_id='rg-01-test' and event_sequence=s;
 end loop;
 c:=pg_temp.claim('b5');
 if (pg_temp.fail('b5')->>'blocked')::boolean is not true or (pg_temp.row_of(s)).status<>'blocked' then raise exception 'fifth failure did not block';end if;
 if (pg_temp.claim('b6')->>'claimed')::boolean then raise exception 'a sixth claim was allowed';end if;
 perform pg_temp.expect(format($q$select private.retry_blocked_market_event_v1('3a790000-0000-4000-a000-000000000301','rg-01-test',%s,'Retentativa sintética','3a790000-0000-4000-8000-000000000004')$q$,s),
  'platform_principal_required','worker account retries');
 r:=private.retry_blocked_market_event_v1('3a790000-0000-4000-a000-000000000302','rg-01-test',s,'Retentativa sintética do operador','3a790000-0000-4000-8000-000000000002');
 if (pg_temp.row_of(s)).status<>'pending' or (pg_temp.row_of(s)).attempts<>0 then raise exception 'retry did not reset the budget';end if;
 -- Expiry: four claims abandoned past their lease, then the fifth expires too and the next claim blocks.
 for i in 1..5 loop
  c:=pg_temp.claim('e'||i);
  if (c->>'attempt')::int<>i then raise exception 'expired attempt % not counted: %',i,c;end if;
  update private.market_event_outbox set lease_expires_at=clock_timestamp()-interval '1 second' where consumer_id='rg-01-test' and event_sequence=s;
 end loop;
 if (pg_temp.claim('e6')->>'claimed')::boolean or (pg_temp.row_of(s)).status<>'blocked' then raise exception 'fifth expiry did not block';end if;
 perform private.retry_blocked_market_event_v1('3a790000-0000-4000-a000-000000000303','rg-01-test',s,'Segunda retentativa sintética','3a790000-0000-4000-8000-000000000002');
end $$;

-- 6. A delegation revoked before completion: no effect and no receipt.
do $$ declare c jsonb;d uuid;s bigint;begin
 select (claim->>'seq')::bigint into s from claims where name='s2';
 c:=pg_temp.claim('r1');
 if (c->>'eventSequence')::bigint<>s then raise exception 'claimed another row: %',c;end if;
 select id into strict d from private.market_event_consumer_delegations where worker_token_id='3a790000-0000-4000-8000-000000000011' and revoked_at is null;
 perform private.revoke_market_event_delegation_v1('3a790000-0000-4000-a000-000000000401',d,'Revogação sintética','3a790000-0000-4000-8000-000000000002');
 perform pg_temp.expect($q$select pg_temp.complete('r1','{"ok":true}')$q$,'market_event_delegation_required','completion after revocation');
 if exists(select 1 from private.market_event_receipts where event_sequence=s) then raise exception 'receipt after revocation';end if;
 perform private.grant_market_event_delegation_v1('3a790000-0000-4000-a000-000000000402','3a790000-0000-4000-8000-000000000011','rg-01-test','Segunda delegação sintética','3a790000-0000-4000-8000-000000000002');
end $$;

-- 7. Disabling cancels the open rows; later events do not fan out; claims stop.
do $$ declare s bigint;r jsonb;begin
 perform pg_temp.expect($q$select private.disable_market_event_consumer_v1('3a790000-0000-4000-a000-000000000501','rg-01-test','Desligamento sintético','3a790000-0000-4000-8000-000000000002')$q$,
  'platform_principal_required','operator disables a consumer');
 r:=private.disable_market_event_consumer_v1('3a790000-0000-4000-a000-000000000502','rg-01-test','Desligamento sintético do teste','3a790000-0000-4000-8000-000000000001');
 if (r->>'cancelled')::int<1 or exists(select 1 from private.market_event_outbox where consumer_id='rg-01-test' and status in ('pending','leased','blocked'))
 then raise exception 'disabling did not cancel the open rows: %',r;end if;
 s:=pg_temp.event('released');
 if exists(select 1 from private.market_event_outbox where event_sequence=s) then raise exception 'disabled consumer received an event';end if;
 if (pg_temp.claim('after')->>'claimed')::boolean then raise exception 'claimed from a disabled consumer';end if;
end $$;

-- 8. Immutability and closed surfaces.
do $$ declare t text;r text;f text;begin
 perform pg_temp.expect($q$update private.market_event_outbox set subject_ordinal=subject_ordinal+10$q$,'23514','ordinal rewritten');
 perform pg_temp.expect($q$update private.market_event_outbox set status='pending' where status='completed'$q$,'23514','completed row reopened');
 perform pg_temp.expect($q$delete from private.market_event_outbox$q$,'23514','outbox row deleted');
 perform pg_temp.expect($q$update private.market_event_receipts set effect='{}'$q$,'23514','receipt rewritten');
 perform pg_temp.expect($q$update private.market_event_consumers set events=array['approved']$q$,'23514','consumer filter rewritten');
 perform pg_temp.expect($q$delete from private.market_event_consumer_commands$q$,'23514','consumer command deleted');
 foreach t in array array['market_event_consumers','market_event_consumer_commands','market_event_subject_counters','market_event_outbox',
  'market_event_receipts','market_event_consumer_delegations','market_event_operator_commands'] loop
  perform pg_temp.expect(format('truncate private.%I cascade',t),'*','truncate '||t);
  foreach r in array array['anon','authenticated','service_role'] loop
   if has_table_privilege(r,'private.'||t,'select,insert,update,delete,truncate,references,trigger') then raise exception '% reaches %',r,t;end if;
  end loop;
  if not (select relrowsecurity and relforcerowsecurity from pg_class where oid=('private.'||t)::regclass) then raise exception 'RLS not forced on %',t;end if;
 end loop;
 for f,r in select p.oid::regprocedure::text,x.r from pg_proc p join pg_namespace n on n.oid=p.pronamespace,unnest(array['anon','authenticated','service_role']) x(r)
  where n.nspname in ('private','public') and p.proname ~ 'market_event' loop
  if has_function_privilege(r,f,'execute') and not (r='authenticated' and f ~ '^((private|public)\.)?worker_(claim|renew|complete|fail)_market_event_v1\(')
  then raise exception '% executes %',r,f;end if;
 end loop;
 if position('market-event-outbox.v1' in public.worker_runtime_schema_contract_v1()::text)=0 then raise exception 'runtime contract does not announce the outbox';end if;
end $$;
select 'market_event_outbox' as test,'PASS' as result;
rollback;

-- 9. A longer snapshot is refused at the door.
begin isolation level repeatable read;
select set_config('request.jwt.claims','{}',true);
do $$ begin
 begin
  perform private.market_require_read_committed_v1();
  raise exception 'repeatable read accepted';
 exception when sqlstate '25001' then null;
 end;
end $$;
rollback;
