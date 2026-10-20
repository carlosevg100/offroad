-- Market reference foundation (ADR 0023): publisher and sources by platform commands only, strict
-- licences and hosts, replay by fingerprint, links that prove identity, versions sealed to their
-- fingerprint, events on existing subjects, finite values and ordered dates, purge by event only,
-- and every table and command closed to the API roles. Everything here is synthetic and rolls back.
begin;
set local statement_timeout='60s';
select set_config('request.jwt.claims','{}',true);
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
select ('3a710000-0000-4000-8000-00000000000'||n)::uuid,'authenticated','authenticated','3a710000-'||n||'@example.invalid','{}','{}',now(),now(),false,false
from generate_series(1,5) n;
-- 1 founder, 2 operator, 3 nobody, 4 evaluator, 5 revoked founder.
insert into private.platform_principals(user_id,role,label) values
 ('3a710000-0000-4000-8000-000000000001','founder','Synthetic market founder'),
 ('3a710000-0000-4000-8000-000000000002','operator','Synthetic market operator'),
 ('3a710000-0000-4000-8000-000000000004','evaluator','Synthetic market evaluator'),
 ('3a710000-0000-4000-8000-000000000005','founder','Synthetic revoked founder');
update private.platform_principals set revoked_at=now(),revoked_by=current_user,revoked_reason='Synthetic revocation for the test' where user_id='3a710000-0000-4000-8000-000000000005';

create function pg_temp.expect(p_sql text,p_state text,p_label text) returns void language plpgsql as $$
begin
 begin execute p_sql; exception when others then
  if sqlstate=p_state then return; end if;
  raise exception '% failed with % (%) instead of %',p_label,sqlstate,sqlerrm,p_state;
 end;
 raise exception '% was accepted',p_label;
end $$;

-- 1. Publisher.
do $$
declare org uuid;
begin
 perform pg_temp.expect($q$select private.register_market_publisher_v1('3a710000-0000-4000-a000-000000000001','Offroad, referência de mercado','3a710000-0000-4000-8000-000000000002')$q$,'42501','operator registers publisher');
 perform pg_temp.expect($q$select private.register_market_publisher_v1('3a710000-0000-4000-a000-000000000001','Offroad, referência de mercado','3a710000-0000-4000-8000-000000000003')$q$,'42501','non-principal registers publisher');
 perform pg_temp.expect($q$select private.register_market_publisher_v1('3a710000-0000-4000-a000-000000000001','Offroad, referência de mercado','3a710000-0000-4000-8000-000000000005')$q$,'42501','revoked founder registers publisher');
 org:=private.register_market_publisher_v1('3a710000-0000-4000-a000-000000000001','Offroad, referência de mercado','3a710000-0000-4000-8000-000000000001');
 if (select organization_type from public.organizations where id=org)<>'offroad' then raise exception 'publisher not an offroad organization';end if;
 if private.register_market_publisher_v1('3a710000-0000-4000-a000-000000000001','Offroad, referência de mercado','3a710000-0000-4000-8000-000000000001')<>org then raise exception 'publisher command did not replay';end if;
 perform pg_temp.expect($q$select private.register_market_publisher_v1('3a710000-0000-4000-a000-000000000001','Outro nome','3a710000-0000-4000-8000-000000000001')$q$,'23505','publisher replay with another name');
 perform pg_temp.expect($q$select private.register_market_publisher_v1('3a710000-0000-4000-a000-000000000002','Outra publicadora','3a710000-0000-4000-8000-000000000001')$q$,'23505','second publisher');
 if exists(select 1 from public.organization_memberships where organization_id=org and status='active') then raise exception 'the publisher has tenant members';end if;
end $$;

create function pg_temp.open_def() returns jsonb language sql as $$
 select jsonb_build_object('registryId','bcb_sgs','license',jsonb_build_object('kind','open','license','ODbL-1.0','attribution','Banco Central do Brasil, SGS',
  'evidenceIds',jsonb_build_array('bcb-open-data'),'retainAdoptedValues',true,'storeDays',null),'allowedHosts',jsonb_build_array('api.bcb.gov.br'),
  'calendar','br_business_days','expectedPublication','09:00','maximumAgeHours',30,'enabled',false,'reason','Série do CDI realizado, aberta');
$$;
create function pg_temp.contract(p_from text) returns jsonb language sql as $$
 select jsonb_build_object('kind','contracted','provider','anbima','contractReference','Contrato hipotético',
  'entitlements',jsonb_build_array(jsonb_build_object('product','secondary','audience','all_tenants','operations',jsonb_build_array('read'),'outputs',jsonb_build_array('screen'),
   'validFrom',p_from,'validUntil',null,'retainAdoptedValues',false,'storeDays',30)),
  'policies',jsonb_build_array(jsonb_build_object('instrument','Política','version','1','evidenceId','b3-consumo-v1.1','sha256',repeat('a',64),'effectiveFrom','2026-11-01','effectiveUntil',null)));
$$;

-- 2. Sources.
do $$
declare r integer;op uuid:='3a710000-0000-4000-8000-000000000002';
begin
 r:=private.record_market_source_revision_v1('3a710000-0000-4000-a000-000000000011','bcb-sgs-cdi',pg_temp.open_def(),op);
 if r<>1 then raise exception 'first revision is not 1';end if;
 r:=private.record_market_source_revision_v1('3a710000-0000-4000-a000-000000000011','bcb-sgs-cdi',pg_temp.open_def(),op);
 if r<>1 then raise exception 'source command did not replay';end if;
 perform pg_temp.expect(format($q$select private.record_market_source_revision_v1('3a710000-0000-4000-a000-000000000011','bcb-sgs-cdi',%L::jsonb,%L)$q$,pg_temp.open_def()||'{"enabled":true}',op),'22023','replay with another definition');
 perform pg_temp.expect(format($q$select private.record_market_source_revision_v1('3a710000-0000-4000-a000-000000000011','other-source',%L::jsonb,%L)$q$,pg_temp.open_def(),op),'22023','command reused for another source');
 r:=private.record_market_source_revision_v1('3a710000-0000-4000-a000-000000000012','bcb-sgs-cdi',pg_temp.open_def()||'{"enabled":true}',op);
 if r<>2 then raise exception 'second revision is not 2';end if;
 if not private.market_source_acquirable_v1('bcb-sgs-cdi',current_date) then raise exception 'enabled open source not acquirable';end if;
 perform pg_temp.expect(format($q$select private.record_market_source_revision_v1('3a710000-0000-4000-a000-000000000013','anbima-secondary',%L::jsonb,%L)$q$,
  pg_temp.open_def()||jsonb_build_object('registryId','anbima_feed','license',pg_temp.contract('2099-01-01'),'allowedHosts',jsonb_build_array('api.anbima.com.br'),'enabled',true),op),'42501','licensed source enabled without contract');
 perform private.record_market_source_revision_v1('3a710000-0000-4000-a000-000000000014','anbima-secondary',
  pg_temp.open_def()||jsonb_build_object('registryId','anbima_feed','license',pg_temp.contract('2099-01-01'),'allowedHosts',jsonb_build_array('api.anbima.com.br'),'enabled',false),op);
 if private.market_source_acquirable_v1('anbima-secondary',current_date) then raise exception 'disabled licensed source acquirable';end if;
 perform pg_temp.expect(format($q$select private.record_market_source_revision_v1('3a710000-0000-4000-a000-000000000015','x',%L::jsonb,%L)$q$,pg_temp.open_def(),'3a710000-0000-4000-8000-000000000004'),'42501','evaluator records a source');
 perform pg_temp.expect(format($q$select private.record_market_source_revision_v1('3a710000-0000-4000-a000-000000000016','x',%L::jsonb,%L)$q$,pg_temp.open_def()||'{"extra":1}',op),'22023','unknown definition key');
 -- Hosts.
 perform pg_temp.expect(format($q$select private.record_market_source_revision_v1(gen_random_uuid(),'x',%L::jsonb,%L)$q$,pg_temp.open_def()||'{"allowedHosts":["localhost"]}',op),'23514','localhost');
 perform pg_temp.expect(format($q$select private.record_market_source_revision_v1(gen_random_uuid(),'x',%L::jsonb,%L)$q$,pg_temp.open_def()||'{"allowedHosts":["127.0.0.1.nip.io"]}',op),'23514','embedded IPv4');
 perform pg_temp.expect(format($q$select private.record_market_source_revision_v1(gen_random_uuid(),'x',%L::jsonb,%L)$q$,pg_temp.open_def()||'{"allowedHosts":["api.bcb.gov.br","api.bcb.gov.br"]}',op),'23514','duplicate host');
 perform pg_temp.expect(format($q$select private.record_market_source_revision_v1(gen_random_uuid(),'x',%L::jsonb,%L)$q$,pg_temp.open_def()||'{"allowedHosts":["api.bcb.gov.br",null]}',op),'23514','null host');
 perform pg_temp.expect(format($q$select private.record_market_source_revision_v1(gen_random_uuid(),'x',%L::jsonb,%L)$q$,pg_temp.open_def()||'{"allowedHosts":["intranet.corp"]}',op),'23514','reserved suffix');
 -- Licences: every field, every element.
 perform pg_temp.expect(format($q$select private.record_market_source_revision_v1(gen_random_uuid(),'x',%L::jsonb,%L)$q$,pg_temp.open_def()||'{"license":{"kind":"open","license":"ODbL-1.0","attribution":"Banco Central"}}',op),'23514','open licence missing fields');
 perform pg_temp.expect(format($q$select private.record_market_source_revision_v1(gen_random_uuid(),'x',%L::jsonb,%L)$q$,pg_temp.open_def()||jsonb_build_object('license',(pg_temp.open_def()->'license')||'{"extra":true}'),op),'23514','open licence extra key');
 perform pg_temp.expect(format($q$select private.record_market_source_revision_v1(gen_random_uuid(),'x',%L::jsonb,%L)$q$,pg_temp.open_def()||jsonb_build_object('license',(pg_temp.open_def()->'license')||'{"storeDays":-1}'),op),'23514','negative retention');
 perform pg_temp.expect(format($q$select private.record_market_source_revision_v1(gen_random_uuid(),'x',%L::jsonb,%L)$q$,pg_temp.open_def()||jsonb_build_object('license',(pg_temp.open_def()->'license')||'{"storeDays":1.5}'),op),'23514','fractional retention');
 perform pg_temp.expect(format($q$select private.record_market_source_revision_v1(gen_random_uuid(),'x',%L::jsonb,%L)$q$,pg_temp.open_def()||jsonb_build_object('license',(pg_temp.open_def()->'license')||'{"evidenceIds":[null]}'),op),'23514','null evidence id');
 perform pg_temp.expect(format($q$select private.record_market_source_revision_v1(gen_random_uuid(),'x',%L::jsonb,%L)$q$,pg_temp.open_def()||jsonb_build_object('license',
  pg_temp.contract('2099-01-01')||'{"entitlements":[{"validFrom":"2026-01-01"}]}'),op),'23514','entitlement missing fields');
 perform pg_temp.expect(format($q$select private.record_market_source_revision_v1(gen_random_uuid(),'x',%L::jsonb,%L)$q$,pg_temp.open_def()||jsonb_build_object('license',
  pg_temp.contract('2099-01-01')||'{"policies":[null]}'),op),'23514','null policy');
 perform pg_temp.expect(format($q$select private.record_market_source_revision_v1(gen_random_uuid(),'x',%L::jsonb,%L)$q$,pg_temp.open_def()||jsonb_build_object('license',
  pg_temp.contract('2026-02-30')),op),'23514','impossible date');
 -- A valid element next to a NULL or incomplete one never passes.
 perform pg_temp.expect(format($q$select private.record_market_source_revision_v1(gen_random_uuid(),'x',%L::jsonb,%L)$q$,pg_temp.open_def()||jsonb_build_object('license',
  pg_temp.contract('2099-01-01')||jsonb_build_object('entitlements',(pg_temp.contract('2099-01-01')->'entitlements')||'[{"validFrom":"2026-01-01"}]'::jsonb)),op),'23514','valid and incomplete entitlement');
 perform pg_temp.expect(format($q$select private.record_market_source_revision_v1(gen_random_uuid(),'x',%L::jsonb,%L)$q$,pg_temp.open_def()||jsonb_build_object('license',
  pg_temp.contract('2099-01-01')||jsonb_build_object('policies',(pg_temp.contract('2099-01-01')->'policies')||'[{}]'::jsonb)),op),'23514','valid and empty policy');
 perform pg_temp.expect(format($q$select private.record_market_source_revision_v1(gen_random_uuid(),'x',%L::jsonb,%L)$q$,pg_temp.open_def()||jsonb_build_object('license',
  pg_temp.contract('2099-01-01')||jsonb_build_object('entitlements',jsonb_build_array((pg_temp.contract('2099-01-01')->'entitlements'->0)||'{"outputs":[null]}'))),op),'23514','null output');
 perform pg_temp.expect(format($q$select private.record_market_source_revision_v1(gen_random_uuid(),'x',%L::jsonb,%L)$q$,pg_temp.open_def()||jsonb_build_object('license',
  pg_temp.contract('2099-01-01')||jsonb_build_object('entitlements',jsonb_build_array((pg_temp.contract('2099-01-01')->'entitlements'->0)||'{"operations":["read",null]}'))),op),'23514','null operation');
 -- A second open source, for acquisitions of another source.
 perform private.record_market_source_revision_v1('3a710000-0000-4000-a000-000000000017','bcb-sgs-selic',pg_temp.open_def()||'{"enabled":true}',op);
end $$;

-- 3. Identity links, seal, events, dates, derived versions and purge.
create function pg_temp.obs_line(p_end text,p_avail timestamptz,p_acq timestamptz,p_value text) returns text language sql as $$
 select concat_ws('|','',p_end,to_char(p_avail at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),to_char(p_acq at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),p_value,'percent_per_year','1');
$$;
create function pg_temp.incomplete_purge(p_version uuid) returns void language plpgsql as $$
begin
 insert into private.market_events(subject_kind,subject_id,event,reason,actor_user_id) values('version',p_version::text,'purged','Synthetic incomplete purge','3a710000-0000-4000-8000-000000000002');
 set constraints private.market_events_purge_complete immediate;
end $$;
do $$
declare org uuid:=private.market_publisher_organization_v1();acq uuid:='3a710000-0000-4000-c000-000000000001';bad uuid:='3a710000-0000-4000-c000-000000000009';
 a_ver uuid:='3a710000-0000-4000-c000-000000000002';b_ver uuid:='3a710000-0000-4000-c000-000000000003';c_ver uuid:='3a710000-0000-4000-c000-000000000004';
 d_ver uuid:='3a710000-0000-4000-c000-000000000005';e_ver uuid:='3a710000-0000-4000-c000-000000000006';
 lic jsonb:=(private.market_source_in_force_v1('bcb-sgs-cdi')).license;
 at timestamptz:=clock_timestamp();avail timestamptz:=clock_timestamp()-interval '1 hour';f_ver uuid:='3a710000-0000-4000-c000-000000000007';
 canonical text;iso text;german text;
begin
 perform pg_temp.expect($q$insert into private.market_logical_objects(logical_id,source_id,family,kind,category,keys) values('market:no-source:daily:0123456789abcdef','no-source','daily','series','observed','{}')$q$,'23503','object of unknown source');
 insert into private.market_logical_objects(logical_id,source_id,family,kind,category,keys) values('market:bcb-sgs-cdi:daily:0123456789abcdef','bcb-sgs-cdi','daily','series','observed','{"series":"12"}');
 insert into private.market_logical_objects(logical_id,source_id,family,kind,category,keys) values('market:bcb-sgs-cdi:path:0123456789abcdef','bcb-sgs-cdi','path','series','consensus_scenario','{"method":"synthetic"}');
 insert into private.market_logical_objects(logical_id,source_id,family,kind,category,keys) values('market:bcb-sgs-selic:daily:0123456789abcdef','bcb-sgs-selic','daily','series','observed','{"series":"11"}');
 insert into public.organizations(id,organization_type,name,created_by) values('3a710000-0000-4000-9000-000000000001','company','Synthetic tenant','3a710000-0000-4000-8000-000000000003');
 -- Acquisitions: publisher only, own path, https, an enabled revision in force on the date.
 perform pg_temp.expect(format($q$insert into private.market_acquisitions(id,publisher_organization_id,source_id,source_revision,url,final_url,acquired_at,sha256,byte_size,content_type,object_path)
  values(gen_random_uuid(),'3a710000-0000-4000-9000-000000000001','bcb-sgs-cdi',2,'https://api.bcb.gov.br/x','https://api.bcb.gov.br/x',%L,repeat('d',64),1,'application/json','bcb-sgs-cdi/2026/10/'||gen_random_uuid()||'.json')$q$,at),'42501','acquisition by a tenant organization');
 perform pg_temp.expect(format($q$insert into private.market_acquisitions(id,publisher_organization_id,source_id,source_revision,url,final_url,acquired_at,sha256,byte_size,content_type,object_path)
  values(gen_random_uuid(),%L,'bcb-sgs-cdi',2,'https://api.bcb.gov.br/x','https://api.bcb.gov.br/x',%L,repeat('d',64),1,'application/json','other/2026/10/'||gen_random_uuid()||'.json')$q$,org,at),'22023','acquisition path of another source');
 perform pg_temp.expect(format($q$insert into private.market_acquisitions(id,publisher_organization_id,source_id,source_revision,url,final_url,acquired_at,sha256,byte_size,content_type,object_path)
  values(gen_random_uuid(),%L,'bcb-sgs-cdi',2,'http://api.bcb.gov.br/x','https://api.bcb.gov.br/x',%L,repeat('d',64),1,'application/json','bcb-sgs-cdi/2026/10/'||gen_random_uuid()||'.json')$q$,org,at),'23514','plain http');
 perform pg_temp.expect(format($q$insert into private.market_acquisitions(id,publisher_organization_id,source_id,source_revision,url,final_url,acquired_at,sha256,byte_size,content_type,object_path)
  values(gen_random_uuid(),%L,'anbima-secondary',1,'https://api.anbima.com.br/x','https://api.anbima.com.br/x',%L,repeat('d',64),1,'application/json','anbima-secondary/2026/10/'||gen_random_uuid()||'.json')$q$,org,at),'42501','acquisition of a disabled licensed source');
 perform pg_temp.expect(format($q$insert into private.market_acquisitions(id,publisher_organization_id,source_id,source_revision,url,final_url,acquired_at,sha256,byte_size,content_type,object_path)
  values(gen_random_uuid(),%L,'bcb-sgs-cdi',1,'https://api.bcb.gov.br/x','https://api.bcb.gov.br/x',%L,repeat('d',64),1,'application/json','bcb-sgs-cdi/2026/10/'||gen_random_uuid()||'.json')$q$,org,at),'42501','acquisition under a superseded revision');
 perform pg_temp.expect(format($q$insert into private.market_acquisitions(id,publisher_organization_id,source_id,source_revision,url,final_url,acquired_at,sha256,byte_size,content_type,object_path)
  values(gen_random_uuid(),%L,'bcb-sgs-cdi',2,'https://api.bcb.gov.br/x','https://api.bcb.gov.br/x','2020-01-01 00:00+00',repeat('d',64),1,'application/json','bcb-sgs-cdi/2026/10/'||gen_random_uuid()||'.json')$q$,org),'42501','acquisition before its revision');
 insert into private.market_acquisitions(id,publisher_organization_id,source_id,source_revision,url,final_url,acquired_at,sha256,byte_size,content_type,object_path)
 values(acq,org,'bcb-sgs-cdi',2,'https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados','https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados',at,repeat('a',64),100,'application/json','bcb-sgs-cdi/2026/10/'||acq||'.json');
 insert into private.market_acquisitions(id,publisher_organization_id,source_id,source_revision,url,final_url,acquired_at,sha256,byte_size,content_type,object_path)
 values(bad,org,'bcb-sgs-selic',1,'https://api.bcb.gov.br/y','https://api.bcb.gov.br/y',at,repeat('e',64),100,'application/json','bcb-sgs-selic/2026/10/'||bad||'.json');
 -- Version A: wrong fingerprint; its seal cannot be forged by a direct insert either.
 insert into private.market_versions(id,logical_id,parser_version,sha256,license) values(a_ver,'market:bcb-sgs-cdi:daily:0123456789abcdef','bcb-sgs-json.v1',repeat('b',64),lic);
 perform pg_temp.expect(format($q$insert into private.market_version_inputs(version_id,acquisition_id) values(%L,%L)$q$,a_ver,bad),'22023','input of another source');
 insert into private.market_version_inputs(version_id,acquisition_id) values(a_ver,acq);
 insert into private.market_observations(version_id,period_end,available_at,acquired_at,value,unit,scale) values(a_ver,'2026-10-16',avail,at,14.9,'percent_per_year','1');
 perform pg_temp.expect(format($q$select private.seal_market_version_v1(%L)$q$,a_ver),'22023','seal with wrong fingerprint');
 perform pg_temp.expect(format($q$insert into private.market_version_seals(version_id,observation_count,input_count) values(%L,1,1)$q$,a_ver),'22023','forged seal');
 perform pg_temp.expect(format($q$insert into private.market_events(subject_kind,subject_id,event,reason,actor_user_id) values('version',%L,'approved','Synthetic approval','3a710000-0000-4000-8000-000000000002')$q$,a_ver),'22023','approval of an unsealed version');
 -- Version B: the declared fingerprint is the canonical content, under any DateStyle.
 canonical:=concat_ws(E'\n','parser:bcb-sgs-json.v1','methodology:null','inputs:a:'||acq::text,pg_temp.obs_line('2026-10-16',avail,at,'14.9'));
 insert into private.market_versions(id,logical_id,parser_version,sha256,license)
 values(b_ver,'market:bcb-sgs-cdi:daily:0123456789abcdef','bcb-sgs-json.v1',encode(extensions.digest(convert_to(canonical,'UTF8'),'sha256'),'hex'),lic);
 insert into private.market_version_inputs(version_id,acquisition_id) values(b_ver,acq);
 perform pg_temp.expect(format($q$insert into private.market_observations(version_id,period_end,available_at,acquired_at,value,unit,scale) values(%L,'2026-10-15',%L,%L,1,'percent_per_year','1')$q$,b_ver,at+interval '1 minute',at),'23514','available after acquired');
 perform pg_temp.expect(format($q$insert into private.market_observations(version_id,period_end,available_at,acquired_at,value,unit,scale) values(%L,'2026-10-15',%L,%L,'NaN','percent_per_year','1')$q$,b_ver,avail,at),'23514','NaN value');
 insert into private.market_observations(version_id,period_end,available_at,acquired_at,value,unit,scale) values(b_ver,'2026-10-16',avail,at,14.90,'percent_per_year','1');
 perform set_config('datestyle','ISO, DMY',true); iso:=private.market_version_canonical_v1(b_ver);
 perform set_config('datestyle','German, DMY',true); german:=private.market_version_canonical_v1(b_ver);
 perform set_config('datestyle','ISO, MDY',true);
 if iso<>german or iso<>canonical then raise exception 'canonical text depends on DateStyle';end if;
 perform pg_temp.expect(format($q$insert into private.market_version_seals(version_id,observation_count,input_count) values(%L,2,1)$q$,b_ver),'22023','seal with wrong counts');
 -- Content that follows the seal row in the same command (a data-modifying CTE) is refused.
 perform pg_temp.expect(format($q$with s as (insert into private.market_version_seals(version_id,observation_count,input_count) values(%L,1,1) returning version_id)
  insert into private.market_observations(version_id,period_end,available_at,acquired_at,value,unit,scale) select version_id,'2026-10-17',%L,%L,1,'percent_per_year','1' from s$q$,b_ver,avail,at),'23514','observation after the seal in one command');
 perform pg_temp.expect(format($q$with s as (insert into private.market_version_seals(version_id,observation_count,input_count) values(%L,1,1) returning version_id)
  insert into private.market_version_inputs(version_id,acquisition_id) select version_id,%L from s$q$,b_ver,acq),'23514','input after the seal in one command');
 perform private.seal_market_version_v1(b_ver);
 perform pg_temp.expect(format($q$insert into private.market_observations(version_id,period_end,available_at,acquired_at,value,unit,scale) values(%L,'2026-10-17',%L,%L,1,'percent_per_year','1')$q$,b_ver,avail,at),'23514','observation after seal');
 perform pg_temp.expect(format($q$insert into private.market_version_inputs(version_id,acquisition_id) values(%L,%L)$q$,b_ver,acq),'23514','input after seal');
 perform pg_temp.expect(format($q$select private.seal_market_version_v1(%L)$q$,b_ver),'23514','second seal');
 perform pg_temp.expect(format($q$insert into private.market_versions(id,logical_id,parser_version,sha256,license,supersedes) values(gen_random_uuid(),'market:bcb-sgs-selic:daily:0123456789abcdef','p.v1',repeat('f',64),%L,%L)$q$,lic,b_ver),'23503','supersedes another object');
 -- Events.
 perform pg_temp.expect($q$insert into private.market_events(subject_kind,subject_id,event,reason,actor_user_id) values('version','3a710000-0000-4000-c000-0000000000ff','approved','Orphan approval','3a710000-0000-4000-8000-000000000002')$q$,'23503','orphan version event');
 perform pg_temp.expect($q$insert into private.market_events(subject_kind,subject_id,event,reason,actor_user_id) values('source','no-source','revoked','Orphan revocation','3a710000-0000-4000-8000-000000000002')$q$,'23503','orphan source event');
 if private.market_version_quality_approved_v1(b_ver) then raise exception 'sealed version approved without event';end if;
 -- Derived version D needs an approved dependency with content, and dates no earlier than it.
 insert into private.market_versions(id,logical_id,parser_version,methodology,sha256,license) values(d_ver,'market:bcb-sgs-cdi:path:0123456789abcdef','path.v1','{"id":"synthetic","version":"1"}',repeat('c',64),lic);
 perform pg_temp.expect(format($q$insert into private.market_version_inputs(version_id,dependency_version_id) values(%L,%L)$q$,d_ver,b_ver),'22023','dependency not approved');
 insert into private.market_events(subject_kind,subject_id,event,reason,actor_user_id) values('version',b_ver::text,'approved','Synthetic approval','3a710000-0000-4000-8000-000000000002');
 if not private.market_version_quality_approved_v1(b_ver) then raise exception 'approved version not approved';end if;
 perform pg_temp.expect(format($q$insert into private.market_version_inputs(version_id,acquisition_id) values(%L,%L)$q$,d_ver,acq),'22023','derived version with an acquisition');
 perform pg_temp.expect(format($q$insert into private.market_version_inputs(version_id,dependency_version_id) values(%L,%L)$q$,d_ver,d_ver),'22023','derived version on itself');
 insert into private.market_version_inputs(version_id,dependency_version_id) values(d_ver,b_ver);
 insert into private.market_observations(version_id,period_end,available_at,acquired_at,value,unit,scale) values(d_ver,'2027-12-31',avail-interval '1 day',at,13,'percent_per_year','1');
 canonical:=concat_ws(E'\n','parser:path.v1','methodology:{"id": "synthetic", "version": "1"}','inputs:v:'||b_ver::text,pg_temp.obs_line('2027-12-31',avail-interval '1 day',at,'13'));
 insert into private.market_versions(id,logical_id,parser_version,methodology,sha256,license) values(e_ver,'market:bcb-sgs-cdi:path:0123456789abcdef','path.v1','{"id":"synthetic","version":"1"}',
  encode(extensions.digest(convert_to(canonical,'UTF8'),'sha256'),'hex'),lic);
 insert into private.market_version_inputs(version_id,dependency_version_id) values(e_ver,b_ver);
 insert into private.market_observations(version_id,period_end,available_at,acquired_at,value,unit,scale) values(e_ver,'2027-12-31',avail-interval '1 day',at,13,'percent_per_year','1');
 perform pg_temp.expect(format($q$select private.seal_market_version_v1(%L)$q$,e_ver),'22023','derived dates before the dependency');
 -- Version F: a derived version with dates no earlier than its dependency seals.
 canonical:=concat_ws(E'\n','parser:path.v1','methodology:{"id": "synthetic", "version": "1"}','inputs:v:'||b_ver::text,pg_temp.obs_line('2027-12-31',avail,at,'13'));
 insert into private.market_versions(id,logical_id,parser_version,methodology,sha256,license) values(f_ver,'market:bcb-sgs-cdi:path:0123456789abcdef','path.v1','{"id":"synthetic","version":"1"}',
  encode(extensions.digest(convert_to(canonical,'UTF8'),'sha256'),'hex'),lic);
 insert into private.market_version_inputs(version_id,dependency_version_id) values(f_ver,b_ver);
 insert into private.market_observations(version_id,period_end,available_at,acquired_at,value,unit,scale) values(f_ver,'2027-12-31',avail,at,13,'percent_per_year','1');
 perform private.seal_market_version_v1(f_ver);
 -- One object, one identity: every non-canonical UUID spelling is refused, for versions and acquisitions.
 perform pg_temp.expect(format($q$insert into private.market_events(subject_kind,subject_id,event,reason,actor_user_id) values('version',%L,'revoked','Other spelling','3a710000-0000-4000-8000-000000000002')$q$,
  upper(b_ver::text)),'22023','non-canonical UUID subject');
 perform pg_temp.expect(format($q$insert into private.market_events(subject_kind,subject_id,event,reason,actor_user_id) values('version',%L,'revoked','Braces','3a710000-0000-4000-8000-000000000002')$q$,
  '{'||b_ver::text||'}'),'22023','braced UUID subject');
 perform pg_temp.expect(format($q$insert into private.market_events(subject_kind,subject_id,event,reason,actor_user_id) values('version',%L,'revoked','No hyphens','3a710000-0000-4000-8000-000000000002')$q$,
  replace(b_ver::text,'-','')),'22023','UUID subject without hyphens');
 perform pg_temp.expect(format($q$insert into private.market_events(subject_kind,subject_id,event,reason,actor_user_id) values('acquisition',%L,'quarantined','Other spelling','3a710000-0000-4000-8000-000000000002')$q$,
  upper(acq::text)),'22023','non-canonical acquisition subject');
 perform pg_temp.expect(format($q$insert into private.market_events(subject_kind,subject_id,event,reason,actor_user_id) values('acquisition',%L,'quarantined','No hyphens','3a710000-0000-4000-8000-000000000002')$q$,
  replace(acq::text,'-','')),'22023','acquisition subject without hyphens');
 -- The state row is the anchor: content and quality events move its revisions forward.
 if (select content_revision<2 or quality_revision<>1 from private.market_version_states where version_id=b_ver) then raise exception 'version state anchor not updated';end if;
 -- Version events carry the ordinal of the anchor they moved; acquisitions and sources carry none.
 if (select max(version_ordinal) from private.market_events where subject_kind='version' and subject_id=b_ver::text)
  <>(select quality_revision from private.market_version_states where version_id=b_ver) then raise exception 'event ordinal not taken from the anchor';end if;
 -- Purge: no session flag; a purge event of this transaction; purge is complete and terminal.
 perform set_config('offroad.market_purge','on',true);
 perform pg_temp.expect(format($q$delete from private.market_observations where version_id=%L$q$,b_ver),'23514','delete under the retired flag');
 insert into private.market_versions(id,logical_id,parser_version,sha256,license) values(c_ver,'market:bcb-sgs-cdi:daily:0123456789abcdef','bcb-sgs-json.v2',repeat('9',64),lic);
 insert into private.market_version_inputs(version_id,acquisition_id) values(c_ver,acq);
 insert into private.market_observations(version_id,period_end,available_at,acquired_at,value,unit,scale) values(c_ver,'2026-10-16',avail,at,14.9,'percent_per_year','1');
 -- A direct update of the state cannot replace the seal or the purge event, nor move a revision back.
 perform pg_temp.expect(format($q$update private.market_version_states set state='sealed' where version_id=%L$q$,c_ver),'23514','sealed state without a seal');
 perform pg_temp.expect(format($q$update private.market_version_states set state='purged' where version_id=%L$q$,c_ver),'23514','purged state without a purge event');
 perform pg_temp.expect(format($q$update private.market_version_states set state='purged' where version_id=%L$q$,b_ver),'23514','sealed to purged without a purge event');
 perform pg_temp.expect(format($q$update private.market_version_states set content_revision=0 where version_id=%L$q$,c_ver),'23514','content revision moved back');
 perform pg_temp.expect(format($q$update private.market_version_states set quality_revision=0 where version_id=%L$q$,b_ver),'23514','quality revision moved back');
 insert into private.market_events(subject_kind,subject_id,event,reason,actor_user_id) values('version',b_ver::text,'purged','Synthetic purge','3a710000-0000-4000-8000-000000000002');
 delete from private.market_observations where version_id=b_ver;
 if exists(select 1 from private.market_observations where version_id=b_ver) or private.market_version_quality_approved_v1(b_ver) then raise exception 'purge incomplete';end if;
 -- The complete purge passes its deferred check, and the purged version takes no content again.
 set constraints private.market_events_purge_complete immediate;
 set constraints private.market_events_purge_complete deferred;
 perform pg_temp.expect(format($q$insert into private.market_observations(version_id,period_end,available_at,acquired_at,value,unit,scale) values(%L,'2026-10-16',%L,%L,14.9,'percent_per_year','1')$q$,b_ver,avail,at),'23514','refill after a complete purge');
 perform pg_temp.expect(format($q$insert into private.market_version_inputs(version_id,acquisition_id) values(%L,%L)$q$,b_ver,acq),'23514','input after a complete purge');
 perform pg_temp.expect(format($q$insert into private.market_events(subject_kind,subject_id,event,reason,actor_user_id) values('version',%L,'approved','Approval after purge','3a710000-0000-4000-8000-000000000002')$q$,b_ver),'23514','approval after purge');
 -- A purge event that leaves content behind fails its check; the subtransaction leaves nothing pending.
 perform pg_temp.expect(format('select pg_temp.incomplete_purge(%L)',c_ver),'23514','purge event without removing the content');
 -- An unsealed version purged completely takes no content again (a later transaction is covered by
 -- scripts/ci/test-market-reference-concurrency.py).
 insert into private.market_events(subject_kind,subject_id,event,reason,actor_user_id) values('version',c_ver::text,'purged','Synthetic purge of an open version','3a710000-0000-4000-8000-000000000002');
 delete from private.market_observations where version_id=c_ver;
 set constraints private.market_events_purge_complete immediate;
 set constraints private.market_events_purge_complete deferred;
 perform pg_temp.expect(format($q$insert into private.market_observations(version_id,period_end,available_at,acquired_at,value,unit,scale) values(%L,'2026-10-18',%L,%L,1,'percent_per_year','1')$q$,c_ver,avail,at),'23514','refill of a purged unsealed version');
 perform pg_temp.expect(format($q$select private.seal_market_version_v1(%L)$q$,c_ver),'23514','seal of a purged version');
end $$;

-- 4. Immutability of every ledger table, update, delete and truncate.
do $$
declare t text;
begin
 foreach t in array array['market_publisher','market_source_revisions','market_logical_objects','market_acquisitions','market_versions','market_version_inputs','market_events','market_version_seals'] loop
  perform pg_temp.expect(format('update private.%I set %I=%I',t,(select a.attname from pg_attribute a where a.attrelid=('private.'||t)::regclass and a.attnum>0 and not a.attisdropped and a.attidentity='' order by a.attnum limit 1),
   (select a.attname from pg_attribute a where a.attrelid=('private.'||t)::regclass and a.attnum>0 and not a.attisdropped and a.attidentity='' order by a.attnum limit 1)),'23514','update '||t);
  perform pg_temp.expect(format('delete from private.%I',t),'23514','delete '||t);
  perform pg_temp.expect(format('truncate private.%I cascade',t),'23514','truncate '||t);
 end loop;
 perform pg_temp.expect('update private.market_observations set unit=unit','23514','update market_observations');
 perform pg_temp.expect('truncate private.market_observations','23514','truncate market_observations');
 perform pg_temp.expect('delete from private.market_version_states','23514','delete market_version_states');
 perform pg_temp.expect($q$update private.market_version_states set state='open'$q$,'23514','reopen a version');
end $$;

-- 5. The API roles reach nothing.
do $$
declare t text;f text;r text;
begin
 foreach t in array array['market_publisher','market_source_revisions','market_logical_objects','market_acquisitions','market_versions','market_version_inputs','market_observations','market_events','market_version_seals','market_version_states'] loop
  foreach r in array array['anon','authenticated','service_role'] loop
   if has_table_privilege(r,'private.'||t,'select,insert,update,delete,truncate,references,trigger') then raise exception '% reaches %',r,t;end if;
  end loop;
  if not (select relrowsecurity and relforcerowsecurity from pg_class where oid=('private.'||t)::regclass) then raise exception 'RLS not forced on %',t;end if;
 end loop;
 foreach r in array array['anon','authenticated','service_role'] loop
  if has_sequence_privilege(r,'private.market_events_sequence_seq','usage,select,update') then raise exception '% reaches the event sequence',r;end if;
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname ~ '^(market_|register_market_|record_market_|seal_market_|guard_market_|mark_market_|lock_market_|open_market_)' loop
   if has_function_privilege(r,f,'execute') then raise exception '% executes %',r,f;end if;
  end loop;
 end loop;
 if not exists(select 1 from storage.buckets where id='market-reference' and not public and file_size_limit=52428800
  and allowed_mime_types=array['application/zip','text/csv','application/json','application/xml','text/xml','application/pdf','text/plain','text/html']::text[])
 then raise exception 'market bucket configuration changed';end if;
end $$;
set local role authenticated;
select pg_temp.expect('select count(*) from private.market_events','42501','authenticated reads events');
select pg_temp.expect($q$select private.register_market_publisher_v1(gen_random_uuid(),'x x x','3a710000-0000-4000-8000-000000000001')$q$,'42501','authenticated registers publisher');
reset role;
select 'market_reference_foundation' as test,'PASS' as result;
rollback;
