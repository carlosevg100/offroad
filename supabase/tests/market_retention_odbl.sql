-- Market reference M2 part 3 (ADR 0023): retention on every path, the reading contract (closure, modes,
-- revocation), relink under it, the ODbL edition (canonical bytes, selection, replay, alterations,
-- withdrawal) and its one anonymous reader. Synthetic, dated in 2025, rolls back.
begin;
-- This transaction reads and then revokes, as an operator's combined write would: it takes the market
-- authority exclusively first, so its whole set is held before any read.
select private.begin_market_authority_write_v1();
set local statement_timeout='60s';
select set_config('request.jwt.claims','{}',true);
select set_config('request.jwt.claim.sub','',true);
-- 1 founder, 2 operator, 4 worker account.
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
select ('3a7b0000-0000-4000-8000-00000000000'||n)::uuid,'authenticated','authenticated','3a7b0000-'||n||'@example.invalid','{}','{}',now(),now(),false,false
from unnest(array[1,2,4]) n;
insert into private.platform_principals(user_id,role,label) values
 ('3a7b0000-0000-4000-8000-000000000001','founder','Synthetic ODbL founder'),
 ('3a7b0000-0000-4000-8000-000000000002','operator','Synthetic ODbL operator');
insert into private.worker_tokens(id,label,token_sha256,execution_account_user_id) values
 ('3a7b0000-0000-4000-8000-000000000011','Synthetic ODbL worker',extensions.digest('synthetic-odbl-worker-token-3a7b0000-a','sha256'),'3a7b0000-0000-4000-8000-000000000004');
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
create temporary table facts(name text primary key,value text);
grant all on facts to anon;
create function pg_temp.license(p_extra jsonb default '{}') returns jsonb language sql as $$
 select jsonb_build_object('kind','open','license','ODbL-1.0','attribution','Banco Central do Brasil',
  'evidenceIds',jsonb_build_array('bcb-catalog-meta-selic-432','bcb-catalog-atas-comunicados-copom','bcb-site-termos-de-uso'),'retainAdoptedValues',true,'storeDays',null)||p_extra;
$$;
create function pg_temp.revision(p_command text,p_license jsonb,p_source text default 'bcb') returns integer language sql as $$
 select private.record_market_source_revision_v1(p_command::uuid,p_source,jsonb_build_object('registryId','bcb_sgs','license',p_license,
  'allowedHosts',jsonb_build_array('api.bcb.gov.br','www.bcb.gov.br'),'calendar','br_business_days','expectedPublication','09:00','maximumAgeHours',30,'enabled',true,
  'reason','Fonte sintética para o teste de retenção e ODbL'),'3a7b0000-0000-4000-8000-000000000002');
$$;
select private.register_market_publisher_v1('3a7b0000-0000-4000-a000-000000000001','Offroad, referência de mercado','3a7b0000-0000-4000-8000-000000000001');
select pg_temp.revision('3a7b0000-0000-4000-a000-000000000011',pg_temp.license());
select private.release_market_acquisition_transport_v1('3a7b0000-0000-4000-a000-000000000021',true,'3a7b0000-0000-4000-8000-000000000002','Synthetic opening for the ODbL test');
select private.grant_market_acquisition_delegation_v1('3a7b0000-0000-4000-a000-000000000022','3a7b0000-0000-4000-8000-000000000011','bcb','Synthetic delegation of the ODbL worker','3a7b0000-0000-4000-8000-000000000002');
create function pg_temp.sgs(p_start date,p_end date,p_change date,p_before text,p_after text) returns bytea language sql as $$
 select convert_to(json_agg(json_build_object('data',to_char(d,'DD/MM/YYYY'),'valor',case when d<p_change then p_before else p_after end) order by d)::text,'UTF8')
 from generate_series(p_start,p_end,interval '1 day') d;
$$;
create function pg_temp.detail(p_meeting integer,p_reference date,p_verb text,p_pct text) returns bytea language sql as $$
 select convert_to(json_build_object('conteudo',json_build_array(json_build_object('nro_reuniao',p_meeting,'dataReferencia',to_char(p_reference,'YYYY-MM-DD'),
  'titulo',case p_verb when 'hold' then 'Copom mantém a taxa Selic em '||p_pct||'% a.a.' else 'Copom reduz a taxa Selic para '||p_pct||'% a.a.' end,
  'textoComunicado',case p_verb when 'hold' then '<p>O Copom decidiu manter a taxa Selic em '||p_pct||'% a.a.</p>'
   else '<p>O Copom decidiu reduzir a taxa Selic em 0,50 ponto percentual, para '||p_pct||'% a.a.</p>' end)))::text,'UTF8');
$$;
create function pg_temp.run(p_name text,p_command text,p_contract text,p_request jsonb,p_content bytea) returns jsonb language plpgsql as $$
declare c jsonb;r jsonb;begin
 perform private.enqueue_market_contract_acquisition_v1(p_command::uuid,p_contract,p_request,'Aquisição sintética do teste de ODbL','3a7b0000-0000-4000-8000-000000000002');
 perform pg_temp.as_account('3a7b0000-0000-4000-8000-000000000004');
 c:=private.worker_claim_market_acquisition_v1('synthetic-odbl-worker-token-3a7b0000-a');
 perform pg_temp.as_account(null);
 if (c->>'claimed')::boolean is not true or c->>'contractId'<>p_contract then raise exception 'claim for % failed: %',p_name,c;end if;
 insert into storage.objects(bucket_id,name,metadata,version) values('market-reference',c->>'objectPath',
  jsonb_build_object('size',octet_length(p_content),'mimetype','application/json','eTag','"'||md5(p_content)||'"'),'market-odbl-sql-v1');
 insert into claims values(p_name,c);
 perform pg_temp.as_account('3a7b0000-0000-4000-8000-000000000004');
 r:=private.worker_commit_market_version_v1((c->>'jobId')::uuid,c->>'capability',(c->>'leaseId')::uuid,p_content,'application/json',clock_timestamp());
 perform pg_temp.as_account(null);
 return r;
end $$;
create function pg_temp.fact(p_name text) returns text language sql as $$ select value from facts where name=p_name $$;

-- 1. The licence predicate and the canonical bytes.
do $$ begin
 if not private.market_license_retains_v1(pg_temp.license()) or not private.market_license_retains_v1(pg_temp.license()-'storeDays')
 or private.market_license_retains_v1(pg_temp.license('{"storeDays":30}')) or private.market_license_retains_v1(pg_temp.license('{"retainAdoptedValues":false}'))
 or private.market_license_retains_v1(pg_temp.license('{"kind":"contracted"}')) or private.market_license_retains_v1(null)
 then raise exception 'retention predicate wrong';end if;
 if private.market_odbl_canonical_v1(jsonb_build_object('b','x"y'||chr(92),'a',jsonb_build_array(chr(10)||chr(31),true,null),'é',jsonb_build_object()))
  <>'{"a":["'||chr(92)||'u000a'||chr(92)||'u001f",true,null],"b":"x'||chr(92)||'"y'||chr(92)||chr(92)||'","é":{}}'
 then raise exception 'canonical text wrong';end if;
 perform pg_temp.expect($q$select private.market_odbl_canonical_v1('{"a":1}')$q$,'market_odbl_number_not_allowed','number in the canonical text');
 perform pg_temp.expect($q$select private.market_version_readable_v1(gen_random_uuid(),'public')$q$,'market_read_mode_invalid','unknown read mode');
end $$;

-- 1b. Before anything is acquired: a queued job, then bytes at an allocated path, each block a revision
-- that would not retain; once both are gone it is accepted, and the source stops being acquirable.
do $$ declare j uuid;c jsonb;begin
 j:=(private.enqueue_market_contract_acquisition_v1('3a7b0000-0000-4000-a000-000000000051','bcb-copom-comunicados-lista','{"size":5}','Job sintético da retenção',
  '3a7b0000-0000-4000-8000-000000000002')->>'jobId')::uuid;
 perform pg_temp.expect($q$select pg_temp.revision('3a7b0000-0000-4000-a000-000000000052',pg_temp.license('{"storeDays":30}'))$q$,'market_retention_requires_purge','restrictive revision with a live job');
 perform private.cancel_market_acquisition_v1('3a7b0000-0000-4000-a000-000000000053',j,'Cancelamento sintético da retenção','3a7b0000-0000-4000-8000-000000000002');
 j:=(private.enqueue_market_contract_acquisition_v1('3a7b0000-0000-4000-a000-000000000054','bcb-copom-comunicados-lista','{"size":5}','Segundo job sintético da retenção',
  '3a7b0000-0000-4000-8000-000000000002')->>'jobId')::uuid;
 perform pg_temp.as_account('3a7b0000-0000-4000-8000-000000000004');
 c:=private.worker_claim_market_acquisition_v1('synthetic-odbl-worker-token-3a7b0000-a');
 perform pg_temp.as_account(null);
 insert into storage.objects(bucket_id,name,metadata,version) values('market-reference',c->>'objectPath',jsonb_build_object('size',2,'mimetype','application/json','eTag','"x"'),'market-odbl-sql-v1');
 perform private.cancel_market_acquisition_v1('3a7b0000-0000-4000-a000-000000000055',j,'Cancelamento sintético com objeto','3a7b0000-0000-4000-8000-000000000002');
 perform pg_temp.expect($q$select pg_temp.revision('3a7b0000-0000-4000-a000-000000000056',pg_temp.license('{"storeDays":30}'))$q$,'market_retention_requires_purge','restrictive revision with stored bytes');
 perform set_config('storage.allow_delete_query','true',true);
 delete from storage.objects where bucket_id='market-reference' and name=c->>'objectPath';
 perform pg_temp.revision('3a7b0000-0000-4000-a000-000000000057',pg_temp.license('{"storeDays":30}'));
 if private.market_source_acquirable_v1('bcb',current_date) then raise exception 'non-retaining source acquirable';end if;
 perform pg_temp.expect($q$select private.enqueue_market_contract_acquisition_v1('3a7b0000-0000-4000-a000-000000000058','bcb-copom-comunicados-lista','{"size":5}','Job recusado','3a7b0000-0000-4000-8000-000000000002')$q$,
  'market_source_not_acquirable','enqueue under a non-retaining revision');
 perform pg_temp.revision('3a7b0000-0000-4000-a000-000000000059',pg_temp.license());
end $$;

-- 2. Nothing to publish before an approved version; the series is quarantined before the communiqués.
do $$ declare r jsonb;begin
 perform pg_temp.expect($q$select private.publish_market_odbl_release_v1('3a7b0000-0000-4000-a000-000000000100',repeat('a',40),'3a7b0000-0000-4000-8000-000000000001')$q$,
  'market_odbl_nothing_to_publish','publication without data');
 r:=pg_temp.run('s1','3a7b0000-0000-4000-a000-000000000101','bcb-sgs-432-endpoint','{"window":{"start":"2025-09-17","end":"2025-10-10"}}',
  pg_temp.sgs('2025-09-17','2025-10-10','2025-10-08','15.00','14.50'));
 if r->'quality'->>'status'<>'quarantined' then raise exception 'series not quarantined: %',r;end if;
 insert into facts values('v1',r->>'versionId');
 if private.market_version_readable_v1((r->>'versionId')::uuid,'consume') or not private.market_version_readable_v1((r->>'versionId')::uuid,'reprocess')
 then raise exception 'quarantined version readable in consume or not in reprocess';end if;
 perform pg_temp.expect($q$select private.publish_market_odbl_release_v1('3a7b0000-0000-4000-a000-000000000102',repeat('a',40),'3a7b0000-0000-4000-8000-000000000001')$q$,
  'market_odbl_nothing_to_publish','publication of a quarantined series');
 r:=pg_temp.run('d1','3a7b0000-0000-4000-a000-000000000103','bcb-copom-comunicados-detalhe','{"meeting":9001}',pg_temp.detail(9001,'2025-09-16','hold','15,00'));
 r:=pg_temp.run('d2','3a7b0000-0000-4000-a000-000000000104','bcb-copom-comunicados-detalhe','{"meeting":9002}',pg_temp.detail(9002,'2025-10-07','cut','14,50'));
 insert into facts values('d2',r->>'acquisitionId');
 r:=pg_temp.run('s2','3a7b0000-0000-4000-a000-000000000105','bcb-sgs-432-endpoint','{"window":{"start":"2025-09-17","end":"2025-10-10"}}',
  pg_temp.sgs('2025-09-17','2025-10-10','2025-10-08','15.00','14.50'));
 if r->'quality'->>'status'<>'approved' or not private.market_version_readable_v1((r->>'versionId')::uuid,'consume') then raise exception 'approved version not consumable: %',r;end if;
 insert into facts values('v2',r->>'versionId');
end $$;

-- 3a. A change of the assembled manifest without its communiqué refuses the edition. The link is removed
-- with its triggers disabled inside a subtransaction that the refusal rolls back.
do $$ begin
 begin
  alter table private.market_version_evidence disable trigger user;
  delete from private.market_version_evidence where version_id=pg_temp.fact('v2')::uuid and meeting=9002;
  if not found then raise exception 'evidence link to remove not found';end if;
  alter table private.market_version_evidence enable trigger user;
  perform private.publish_market_odbl_release_v1('3a7b0000-0000-4000-a000-000000000200',repeat('a',40),'3a7b0000-0000-4000-8000-000000000001');
  raise exception 'edition published a change without its communique';
 exception when others then
  if sqlerrm<>'market_odbl_change_without_communique' then raise;end if;
 end;
 if not exists(select 1 from private.market_version_evidence where version_id=pg_temp.fact('v2')::uuid and meeting=9002) or exists(select 1 from private.market_odbl_releases)
 then raise exception 'refused edition left state behind';end if;
end $$;

-- 3. The first edition: founder only, canonical bytes, selection of approved chains only, replay.
do $$ declare r jsonb;e private.market_odbl_releases;p jsonb;begin
 perform pg_temp.expect($q$select private.publish_market_odbl_release_v1('3a7b0000-0000-4000-a000-000000000201',repeat('a',40),'3a7b0000-0000-4000-8000-000000000002')$q$,
  'platform_principal_required','operator publishes');
 perform pg_temp.expect($q$select private.publish_market_odbl_release_v1('3a7b0000-0000-4000-a000-000000000202','main','3a7b0000-0000-4000-8000-000000000001')$q$,
  'market_odbl_invalid','commit that is not a hash');
 r:=private.publish_market_odbl_release_v1('3a7b0000-0000-4000-a000-000000000203',repeat('a',40),'3a7b0000-0000-4000-8000-000000000001');
 if (r->>'releaseNumber')::int<>1 or (r->>'replayed')::boolean then raise exception 'first edition answer wrong: %',r;end if;
 select * into strict e from private.market_odbl_releases where release_number=1;
 p:=e.payload_text::jsonb;
 if e.payload_text<>private.market_odbl_canonical_v1(p)||chr(10) or e.payload_sha256<>encode(extensions.digest(convert_to(e.payload_text,'UTF8'),'sha256'),'hex')
 or e.byte_size<>octet_length(convert_to(e.payload_text,'UTF8')) or right(e.payload_text,1)<>chr(10) then raise exception 'edition bytes not canonical';end if;
 if jsonb_array_length(p->'observations')<>24 or exists(select 1 from jsonb_array_elements(p->'observations') x where x->>'versionId'<>pg_temp.fact('v2'))
 or p#>>'{observations,0,period}'<>'2025-09-17' or p#>>'{observations,0,value}'<>'15' or p#>>'{observations,23,value}'<>'14.5'
 then raise exception 'edition observations wrong';end if;
 if jsonb_array_length(p->'changes')<>1 or p#>>'{changes,0,period}'<>'2025-10-08' or p#>>'{changes,0,meeting}'<>'9002' or p#>>'{changes,0,from}'<>'15' or p#>>'{changes,0,to}'<>'14.5'
 or p#>>'{changes,0,decision}'<>'cut' then raise exception 'edition changes wrong: %',p->'changes';end if;
 if p#>>'{license,uri}'<>'https://opendatacommons.org/licenses/odbl/1-0/' or p#>>'{source,attribution}'<>'Banco Central do Brasil' or p#>>'{alterations,previous}' is not null
 or p#>>'{rules,codeCommit}'<>repeat('a',40) or p->>'release'<>'1' or p#>>'{series,logicalId}'<>'market:bcb:sgs:102a1aa7f870cb05'
 then raise exception 'edition metadata wrong';end if;
 if exists(select 1 from jsonb_array_elements(p->'observations') x where x->>'normalization' is distinct from 'bcb-sgs-432')
 or jsonb_array_length(p#>'{series,normalizations}') is distinct from 1 or p#>>'{series,normalizations,0,id}' is distinct from 'bcb-sgs-432'
 or encode(extensions.digest(convert_to(p#>>'{series,normalizations,0,contractText}','UTF8'),'sha256'),'hex') is distinct from p#>>'{series,normalizations,0,contractSha256}'
 or p#>>'{series,normalizations,0,contractSha256}' is distinct from (select normalization_sha256 from private.market_normalizations where id='bcb-sgs-432')
 or encode(extensions.digest(convert_to(p#>>'{series,normalizations,0,qualityPolicy,text}','UTF8'),'sha256'),'hex') is distinct from p#>>'{series,normalizations,0,qualityPolicy,sha256}'
 or p#>>'{series,normalizations,0,qualityPolicy,text}' is distinct from private.market_quality_policy_text_v1('bcb-sgs-432-quality','v2')
 or p#>>'{series,normalizations,0,qualityPolicy,text}' not like 'market-quality-policy.v1%' then raise exception 'edition snapshots wrong: %',p->'series';end if;
 if (select count(*) from private.market_odbl_release_dependencies where release_id=e.id)<>1 then raise exception 'dependencies wrong';end if;
 r:=private.publish_market_odbl_release_v1('3a7b0000-0000-4000-a000-000000000203',repeat('a',40),'3a7b0000-0000-4000-8000-000000000001');
 if (r->>'replayed')::boolean is not true or (r->>'releaseNumber')::int<>1 then raise exception 'publication did not replay';end if;
 perform pg_temp.expect($q$select private.publish_market_odbl_release_v1('3a7b0000-0000-4000-a000-000000000203',repeat('b',40),'3a7b0000-0000-4000-8000-000000000001')$q$,
  'platform_method_request_reused','publication command reused');
 insert into facts values('sha1',e.payload_sha256);
end $$;

-- 4. The second edition records its alterations; withdrawal stops serving it with no fallback.
do $$ declare r jsonb;p jsonb;begin
 r:=private.publish_market_odbl_release_v1('3a7b0000-0000-4000-a000-000000000301',repeat('b',40),'3a7b0000-0000-4000-8000-000000000001');
 if (r->>'releaseNumber')::int<>2 then raise exception 'second edition wrong: %',r;end if;
 select payload_text::jsonb into p from private.market_odbl_releases where release_number=2;
 if p#>>'{alterations,previous,release}'<>'1' or p#>>'{alterations,previous,sha256}'<>pg_temp.fact('sha1') or jsonb_array_length(p#>'{alterations,added}')<>0
 or jsonb_array_length(p#>'{alterations,corrected}')<>0 or (p#>>'{alterations,rulesChanged}')::boolean is not true then raise exception 'alterations wrong: %',p->'alterations';end if;
 perform pg_temp.expect($q$select private.withdraw_market_odbl_release_v1('3a7b0000-0000-4000-a000-000000000302',2,'quality','Retirada sintética','3a7b0000-0000-4000-8000-000000000002')$q$,
  'platform_principal_required','operator withdraws');
 perform private.withdraw_market_odbl_release_v1('3a7b0000-0000-4000-a000-000000000303',2,'quality','Retirada sintética do teste','3a7b0000-0000-4000-8000-000000000001');
 perform private.withdraw_market_odbl_release_v1('3a7b0000-0000-4000-a000-000000000303',2,'quality','Retirada sintética do teste','3a7b0000-0000-4000-8000-000000000001');
 perform pg_temp.expect($q$select private.withdraw_market_odbl_release_v1('3a7b0000-0000-4000-a000-000000000304',2,'rights','Segunda retirada','3a7b0000-0000-4000-8000-000000000001')$q$,
  'market_odbl_release_withdrawn','edition withdrawn twice');
end $$;

-- 5. The anonymous reader: only through the published wrapper, by number or the latest, served or withdrawn.
set local role anon;
do $$ declare r jsonb;begin
 r:=public.market_odbl_release_v1(1);
 if r is null or r->>'state' is distinct from 'served' or r->>'sha256' is distinct from pg_temp.fact('sha1') or right(r->>'payload',1) is distinct from chr(10)
 then raise exception 'edition 1 not served to anon: %',r;end if;
 r:=public.market_odbl_release_v1(2);
 if r is null or r->>'state' is distinct from 'withdrawn' or r ? 'payload' then raise exception 'withdrawn edition served: %',r;end if;
 r:=public.market_odbl_release_v1();
 if r is null or (r->>'releaseNumber')::int is distinct from 2 or r->>'state' is distinct from 'withdrawn' then raise exception 'latest fell back to an older edition: %',r;end if;
 if public.market_odbl_release_v1(3) is not null or public.market_odbl_release_v1(0) is not null or public.market_odbl_release_v1(-5) is not null then raise exception 'missing edition answered';end if;
 perform pg_temp.expect($q$select count(*) from private.market_odbl_releases$q$,'42501','anon reads the releases table');
 perform pg_temp.expect($q$select private.publish_market_odbl_release_v1(gen_random_uuid(),repeat('a',40),'3a7b0000-0000-4000-8000-000000000001')$q$,'42501','anon publishes');
end $$;
reset role;

-- 5b. A newer normalization describes the edition only once observations use it: unused, the edition
-- carries the one in use; mixed, it carries both, each referenced by its observations.
insert into private.market_normalizations(id,endpoint_contract_id,ordinal,parser,logical_id,family,logical_keys,unit,scale,convention,calendar,quality_policy_id,quality_policy_version,normalization_sha256)
values('bcb-sgs-432-test-p2','bcb-sgs-432-endpoint',2,'bcb-sgs-daily-json.v2','market:bcb:sgs:102a1aa7f870cb05','sgs','{"code":"432"}','percent_per_year','1','meta_copom',
 'financial-core.brazilian-national-holidays@2026.10.19-v1','bcb-sgs-432-quality','v2',
 private.market_series_contract_sha256_v1('bcb-sgs-432-test-p2','api.bcb.gov.br','/dados/serie/bcdata.sgs.432/dados','percent_per_year','1','meta_copom',
  'bcb-sgs-daily-json.v2','bcb-catalog-meta-selic-432','2021-01-14',10,'financial-core.brazilian-national-holidays@2026.10.19-v1'));
do $$ declare r jsonb;p jsonb;begin
 r:=private.publish_market_odbl_release_v1('3a7b0000-0000-4000-a000-000000000351',repeat('c',40),'3a7b0000-0000-4000-8000-000000000001');
 select payload_text::jsonb into p from private.market_odbl_releases where release_number=(r->>'releaseNumber')::int;
 if (select jsonb_agg(x->>'id') from jsonb_array_elements(p#>'{series,normalizations}') x) is distinct from '["bcb-sgs-432"]'::jsonb
 then raise exception 'unused normalization described: %',p#>'{series,normalizations}';end if;
 r:=pg_temp.run('s3','3a7b0000-0000-4000-a000-000000000352','bcb-sgs-432-endpoint','{"window":{"start":"2025-10-11","end":"2025-10-20"}}',
  pg_temp.sgs('2025-10-11','2025-10-20','2025-10-21','14.50','14.50'));
 if r->'quality'->>'status' is distinct from 'approved' or (select normalization_id from private.market_versions where id=(r->>'versionId')::uuid) is distinct from 'bcb-sgs-432-test-p2'
 then raise exception 'series under the new normalization wrong: %',r;end if;
 r:=private.publish_market_odbl_release_v1('3a7b0000-0000-4000-a000-000000000353',repeat('c',40),'3a7b0000-0000-4000-8000-000000000001');
 select payload_text::jsonb into p from private.market_odbl_releases where release_number=(r->>'releaseNumber')::int;
 if (select jsonb_agg(x->>'id') from jsonb_array_elements(p#>'{series,normalizations}') x) is distinct from '["bcb-sgs-432","bcb-sgs-432-test-p2"]'::jsonb
 or (select count(*) from jsonb_array_elements(p->'observations') x where x->>'normalization'='bcb-sgs-432-test-p2') is distinct from 10::bigint
 or (select count(*) from jsonb_array_elements(p->'observations') x where x->>'normalization'='bcb-sgs-432') is distinct from 24::bigint
 or exists(select 1 from jsonb_array_elements(p#>'{series,normalizations}') d
  where encode(extensions.digest(convert_to(d->>'contractText','UTF8'),'sha256'),'hex') is distinct from d->>'contractSha256')
 or (p#>>'{alterations,rulesChanged}')::boolean is not true or jsonb_array_length(p#>'{alterations,added}') is distinct from 10
 then raise exception 'mixed edition wrong: %',p#>'{series,normalizations}';end if;
end $$;

-- 6. Revoking a communiqué used as evidence withdraws every edition and version that depends on it, and
-- relink refuses to build on it.
do $$ declare r jsonb;begin
 insert into private.market_events(subject_kind,subject_id,event,reason,actor_user_id) values('acquisition',pg_temp.fact('d2'),'revoked','Revogação sintética do comunicado','3a7b0000-0000-4000-8000-000000000002');
 if private.market_acquisition_readable_v1(pg_temp.fact('d2')::uuid) or private.market_version_readable_v1(pg_temp.fact('v2')::uuid,'consume')
 or private.market_version_readable_v1(pg_temp.fact('v2')::uuid,'reprocess') then raise exception 'revoked evidence still readable';end if;
 if private.market_odbl_release_read_v1(1)->>'state'<>'withdrawn' then raise exception 'edition served after its evidence was revoked';end if;
 perform pg_temp.expect(format($q$select private.relink_market_version_v1('3a7b0000-0000-4000-a000-000000000401',%L,'3a7b0000-0000-4000-8000-000000000002')$q$,pg_temp.fact('v1')),
  'market_version_not_readable','relink onto revoked evidence');
 perform pg_temp.expect($q$select private.publish_market_odbl_release_v1('3a7b0000-0000-4000-a000-000000000402',repeat('c',40),'3a7b0000-0000-4000-8000-000000000001')$q$,
  'market_odbl_nothing_to_publish','publication over revoked evidence');
 -- A revoked source withdraws its acquisitions.
 insert into private.market_events(subject_kind,subject_id,event,reason,actor_user_id) values('source','bcb','revoked','Revogação sintética da fonte','3a7b0000-0000-4000-8000-000000000002');
 if private.market_acquisition_readable_v1((select acquisition_id from private.market_versions where id=pg_temp.fact('v1')::uuid)) then raise exception 'acquisition of a revoked source readable';end if;
 -- The refusals of a revocation after a read without the exclusive authority run across sessions in the
 -- outbox race script; this transaction holds it exclusively throughout.
 if private.market_authority_mode_v1() is distinct from 'exclusive' then raise exception 'authority not held exclusively';end if;
end $$;

-- 7. A revision that would not retain is refused while anything of the source is stored, and a source
-- that does not retain is not acquirable.
do $$ begin
 perform pg_temp.expect($q$select pg_temp.revision('3a7b0000-0000-4000-a000-000000000501',pg_temp.license('{"storeDays":30}'))$q$,'market_retention_requires_purge','restrictive revision with stored content');
 perform pg_temp.revision('3a7b0000-0000-4000-a000-000000000502',pg_temp.license('{"storeDays":30}'),'bcb-test-empty');
 if private.market_source_acquirable_v1('bcb-test-empty',current_date) then raise exception 'non-retaining source acquirable';end if;
end $$;

-- 8. Immutability and closed surfaces.
do $$ declare t text;r text;f text;begin
 perform pg_temp.expect($q$update private.market_odbl_releases set payload_text=payload_text||' '$q$,'23514','edition rewritten');
 perform pg_temp.expect($q$delete from private.market_odbl_release_withdrawals$q$,'23514','withdrawal deleted');
 perform pg_temp.expect($q$delete from private.market_odbl_release_dependencies$q$,'23514','dependency deleted');
 foreach t in array array['market_odbl_releases','market_odbl_release_dependencies','market_odbl_release_withdrawals'] loop
  foreach r in array array['anon','authenticated','service_role'] loop
   if has_table_privilege(r,'private.'||t,'select,insert,update,delete,truncate,references,trigger') then raise exception '% reaches %',r,t;end if;
  end loop;
  if not (select relrowsecurity and relforcerowsecurity from pg_class where oid=('private.'||t)::regclass) then raise exception 'RLS not forced on %',t;end if;
 end loop;
 for f,r in select p.oid::regprocedure::text,x.r from pg_proc p join pg_namespace n on n.oid=p.pronamespace,unnest(array['anon','authenticated','service_role']) x(r)
  where n.nspname in ('private','public') and p.proname ~ '^(market_odbl_|market_version_readable_|market_acquisition_readable_|market_license_retains_|market_version_closure_|lock_market_read_authority_|anchor_market_authority_|publish_market_odbl_|withdraw_market_odbl_|market_evidence_set_|market_quality_policy_text_|create_market_selic_version_|relink_market_version_|market_authority_|begin_market_authority_)' loop
  if has_function_privilege(r,f,'execute') and not (r='anon' and f in ('market_odbl_release_v1(integer)','private.market_odbl_release_read_v1(integer)'))
  then raise exception '% executes %',r,f;end if;
 end loop;
 if (select prosecdef from pg_proc where oid='public.market_odbl_release_v1(integer)'::regprocedure)
 or (select prosqlbody is null from pg_proc where oid='public.market_odbl_release_v1(integer)'::regprocedure)
 or has_schema_privilege('anon','private','usage') then raise exception 'anonymous reader is not bound at creation';end if;
 if (select proconfig from pg_proc where oid='public.market_odbl_release_v1(integer)'::regprocedure)<>array['search_path=""','statement_timeout=2s']
 then raise exception 'anonymous reader lost its own statement timeout';end if;
end $$;
select 'market_retention_odbl' as test,'PASS' as result;
rollback;
