-- Market version confirmation (ADR 0023, M2 part 1): the database reads the acquired bytes, builds and
-- seals a v2 version of SGS 432 with the Copom evidence available for its data-base, evaluates it, keeps
-- one authority row per meeting, and relinks a sealed version into a new one when the evidence changes.
-- Every account, token, source, meeting and object here is synthetic, dated in 2025, and rolls back.
begin;
set local statement_timeout='60s';
select set_config('request.jwt.claims','{}',true);
select set_config('request.jwt.claim.sub','',true);
-- 1 founder, 2 operator, 4 worker account.
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
select ('3a780000-0000-4000-8000-00000000000'||n)::uuid,'authenticated','authenticated','3a780000-'||n||'@example.invalid','{}','{}',now(),now(),false,false
from unnest(array[1,2,4]) n;
insert into private.platform_principals(user_id,role,label) values
 ('3a780000-0000-4000-8000-000000000001','founder','Synthetic version founder'),
 ('3a780000-0000-4000-8000-000000000002','operator','Synthetic version operator');
insert into private.worker_tokens(id,label,token_sha256,execution_account_user_id) values
 ('3a780000-0000-4000-8000-000000000011','Synthetic version worker',extensions.digest('synthetic-version-worker-token-3a780000-a','sha256'),'3a780000-0000-4000-8000-000000000004');
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
select private.register_market_publisher_v1('3a780000-0000-4000-a000-000000000001','Offroad, referência de mercado','3a780000-0000-4000-8000-000000000001');
select private.record_market_source_revision_v1('3a780000-0000-4000-a000-000000000011','bcb',jsonb_build_object('registryId','bcb_sgs',
 'license',jsonb_build_object('kind','open','license','ODbL-1.0','attribution','Banco Central do Brasil',
  'evidenceIds',jsonb_build_array('bcb-catalog-meta-selic-432','bcb-catalog-atas-comunicados-copom','bcb-site-termos-de-uso'),'retainAdoptedValues',true,'storeDays',null),
 'allowedHosts',jsonb_build_array('api.bcb.gov.br','www.bcb.gov.br'),'calendar','br_business_days','expectedPublication','09:00','maximumAgeHours',30,'enabled',true,
 'reason','Fonte sintética para o teste da confirmação de versão'),'3a780000-0000-4000-8000-000000000002');
select private.release_market_acquisition_transport_v1('3a780000-0000-4000-a000-000000000021',true,'3a780000-0000-4000-8000-000000000002','Synthetic opening for the version test');
select private.grant_market_acquisition_delegation_v1('3a780000-0000-4000-a000-000000000022','3a780000-0000-4000-8000-000000000011','bcb','Synthetic delegation of the version worker','3a780000-0000-4000-8000-000000000002');

-- SGS daily JSON over a window, one value before the change date and another from it.
create function pg_temp.sgs(p_start date,p_end date,p_change date,p_before text,p_after text) returns bytea language sql as $$
 select convert_to(json_agg(json_build_object('data',to_char(d,'DD/MM/YYYY'),'valor',case when d<p_change then p_before else p_after end) order by d)::text,'UTF8')
 from generate_series(p_start,p_end,interval '1 day') d;
$$;
-- A Copom communiqué detail: hold, raise or cut to a rate.
create function pg_temp.detail(p_meeting integer,p_reference date,p_verb text,p_pct text) returns bytea language sql as $$
 select convert_to(json_build_object('conteudo',json_build_array(json_build_object('nro_reuniao',p_meeting,'dataReferencia',to_char(p_reference,'YYYY-MM-DD'),
  'titulo',case p_verb when 'hold' then 'Copom mantém a taxa Selic em '||p_pct||'% a.a.' when 'cut' then 'Copom reduz a taxa Selic para '||p_pct||'% a.a.'
   else 'Copom eleva a taxa Selic para '||p_pct||'% a.a.' end,
  'textoComunicado',case p_verb when 'hold' then '<p>O Copom decidiu manter a taxa Selic em '||p_pct||'% a.a.</p>'
   when 'cut' then '<p>O Copom decidiu reduzir a taxa Selic em 0,50 ponto percentual, para '||p_pct||'% a.a.</p>'
   else '<p>O Copom decidiu elevar a taxa Selic em 0,50 ponto percentual, para '||p_pct||'% a.a.</p>' end)))::text,'UTF8');
$$;
-- Enqueue, claim, store the exact bytes and confirm them, as the worker would.
create function pg_temp.run(p_name text,p_command text,p_contract text,p_request jsonb,p_content bytea) returns jsonb language plpgsql as $$
declare c jsonb;r jsonb;begin
 perform private.enqueue_market_contract_acquisition_v1(p_command::uuid,p_contract,p_request,'Aquisição sintética do teste de versão','3a780000-0000-4000-8000-000000000002');
 perform pg_temp.as_account('3a780000-0000-4000-8000-000000000004');
 c:=private.worker_claim_market_acquisition_v1('synthetic-version-worker-token-3a780000-a');
 perform pg_temp.as_account(null);
 if (c->>'claimed')::boolean is not true or c->>'contractId'<>p_contract then raise exception 'claim for % failed: %',p_name,c;end if;
 insert into storage.objects(bucket_id,name,metadata,version) values('market-reference',c->>'objectPath',
  jsonb_build_object('size',octet_length(p_content),'mimetype','application/json','eTag','"'||md5(p_content)||'"'),'market-version-sql-v1');
 insert into claims values(p_name,c);
 perform pg_temp.as_account('3a780000-0000-4000-8000-000000000004');
 r:=private.worker_commit_market_version_v1((c->>'jobId')::uuid,c->>'capability',(c->>'leaseId')::uuid,p_content,'application/json',clock_timestamp());
 perform pg_temp.as_account(null);
 return r;
end $$;
create function pg_temp.fact(p_name text) returns text language sql as $$ select value from facts where name=p_name $$;

-- 1. A series confirmed before any communiqué: version sealed, evaluated and quarantined.
do $$ declare r jsonb;v private.market_versions;e private.market_version_evaluations;begin
 r:=pg_temp.run('s1','3a780000-0000-4000-a000-000000000101','bcb-sgs-432-endpoint','{"window":{"start":"2025-09-17","end":"2025-10-10"}}',
  pg_temp.sgs('2025-09-17','2025-10-10','2025-10-08','15.00','14.50'));
 if (r->>'committed')::boolean is not true or r->'quality'->>'status'<>'quarantined' then raise exception 'series commit answer wrong: %',r;end if;
 select * into strict v from private.market_versions where id=(r->>'versionId')::uuid;
 if v.canonical_version<>'v2' or v.normalization_id<>'bcb-sgs-432' or v.data_base<>private.market_sao_paulo_date_v1(clock_timestamp())
 or v.window_start<>'2025-09-17' or v.window_end<>'2025-10-10' or v.supersedes is not null or v.logical_id<>'market:bcb:sgs:102a1aa7f870cb05'
 or v.acquisition_id<>(r->>'acquisitionId')::uuid or v.evidence_available_at<>(select acquired_at from private.market_acquisitions where id=v.acquisition_id)
 then raise exception 'version row wrong: %',to_jsonb(v);end if;
 if not exists(select 1 from private.market_version_seals where version_id=v.id) then raise exception 'version not sealed';end if;
 if (select count(*) from private.market_observations where version_id=v.id)<>24 or exists(select 1 from private.market_version_evidence where version_id=v.id)
 then raise exception 'observations or evidence wrong';end if;
 if encode(extensions.digest(convert_to(private.market_canonical_v2_text_v1(private.market_version_canonical_v2_input_v1(v.id)),'UTF8'),'sha256'),'hex')<>v.sha256
 then raise exception 'fingerprint does not rebuild from the rows';end if;
 select * into strict e from private.market_version_evaluations where version_id=v.id;
 if e.status<>'quarantined' or e.result<>'quarantined' or e.anchor_meeting is not null or e.data_base<>v.data_base
 or (select jsonb_agg(f->>'code' order by o) from jsonb_array_elements(e.findings) with ordinality x(f,o))<>'["start_without_anchor","change_without_communique"]'::jsonb
 then raise exception 'evaluation wrong: %',to_jsonb(e);end if;
 if not exists(select 1 from private.market_events where sequence=e.event_sequence and subject_kind='version' and subject_id=v.id::text and event='quarantined'
  and processing_job_id=(select (claim->>'jobId')::uuid from claims where name='s1')) then raise exception 'quality event not recorded';end if;
 insert into facts values('v1',v.id::text),('a1',v.acquisition_id::text);
end $$;

-- 2. Replay of the series confirmation returns the original answer.
do $$ declare c jsonb;r jsonb;at timestamptz;begin
 select claim into strict c from claims where name='s1';
 select acquired_at into strict at from private.market_acquisitions where processing_job_id=(c->>'jobId')::uuid;
 perform pg_temp.as_account('3a780000-0000-4000-8000-000000000004');
 r:=private.worker_commit_market_version_v1((c->>'jobId')::uuid,c->>'capability',(c->>'leaseId')::uuid,
  pg_temp.sgs('2025-09-17','2025-10-10','2025-10-08','15.00','14.50'),'application/json',at);
 perform pg_temp.as_account(null);
 if (r->>'replayed')::boolean is not true or r->>'versionId'<>pg_temp.fact('v1') then raise exception 'series replay wrong: %',r;end if;
end $$;

-- 3. Bytes the parser refuses never become a receipt.
do $$ begin
 perform pg_temp.expect($q$select pg_temp.run('bad','3a780000-0000-4000-a000-000000000102','bcb-sgs-432-endpoint','{"window":{"start":"2025-09-17","end":"2025-09-20"}}',
  pg_temp.sgs('2025-09-17','2025-09-21','2025-10-08','15.00','14.50'))$q$,'market_parse_outside_window','row outside the window');
 perform pg_temp.expect($q$select pg_temp.run('bad','3a780000-0000-4000-a000-000000000103','bcb-sgs-432-endpoint','{"window":{"start":"2025-09-17","end":"2025-09-20"}}',
  convert_to('[{"data":"17/09/2025","valor":"15.00","valor":"15.00"}]','UTF8'))$q$,'market_parse_json_duplicate_key','repeated key');
 perform pg_temp.expect($q$select pg_temp.run('bad','3a780000-0000-4000-a000-000000000104','bcb-copom-comunicados-detalhe','{"meeting":9001}',
  pg_temp.detail(9002,'2025-09-16','hold','15,00'))$q$,'market_parse_communique_meeting','detail of another meeting');
end $$;

-- 4. Communiqués: the first acquisition of a meeting is its reference; a repeat agrees and is not.
do $$ declare r jsonb;m private.market_copom_meetings;begin
 r:=pg_temp.run('d1','3a780000-0000-4000-a000-000000000201','bcb-copom-comunicados-detalhe','{"meeting":9001}',pg_temp.detail(9001,'2025-09-16','hold','15,00'));
 if (r->>'reference')::boolean is not true or (r->>'meeting')::int<>9001 then raise exception 'first detail answer wrong: %',r;end if;
 select * into strict m from private.market_copom_meetings where meeting=9001;
 if m.reference_date<>'2025-09-16' or m.decision<>'hold' or m.target_pct<>'15.00' or m.series_change_date<>'2025-09-17'
 or m.reference_acquisition_id<>(r->>'acquisitionId')::uuid then raise exception 'meeting row wrong: %',to_jsonb(m);end if;
 if (select regulatory_effective_from from private.market_copom_communique_acquisitions where acquisition_id=m.reference_acquisition_id)<>'2025-09-17'
 then raise exception 'regulatory effective date wrong';end if;
 r:=pg_temp.run('d2','3a780000-0000-4000-a000-000000000202','bcb-copom-comunicados-detalhe','{"meeting":9002}',pg_temp.detail(9002,'2025-10-07','cut','14,50'));
 if (r->>'reference')::boolean is not true then raise exception 'second meeting not a reference: %',r;end if;
 r:=pg_temp.run('d3','3a780000-0000-4000-a000-000000000203','bcb-copom-comunicados-detalhe','{"meeting":9001}',pg_temp.detail(9001,'2025-09-16','hold','15,00'));
 if (r->>'reference')::boolean or (select count(*) from private.market_copom_communique_acquisitions where meeting=9001)<>2
 then raise exception 'repeat detail answer wrong: %',r;end if;
 perform pg_temp.expect($q$select pg_temp.run('x','3a780000-0000-4000-a000-000000000204','bcb-copom-comunicados-detalhe','{"meeting":9002}',
  pg_temp.detail(9002,'2025-10-07','cut','14,25'))$q$,'market_copom_meeting_disagreement','repeat that disagrees with the reference');
 perform pg_temp.expect($q$select pg_temp.run('x','3a780000-0000-4000-a000-000000000205','bcb-copom-comunicados-detalhe','{"meeting":9003}',
  pg_temp.detail(9003,'2025-09-16','hold','15,00'))$q$,'market_copom_meeting_day_collision','two meetings on one day');
 -- The same rate written with a leading zero agrees with the reference.
 r:=pg_temp.run('d4','3a780000-0000-4000-a000-000000000206','bcb-copom-comunicados-detalhe','{"meeting":9004}',pg_temp.detail(9004,'2025-12-10','hold','5,00'));
 r:=pg_temp.run('d5','3a780000-0000-4000-a000-000000000207','bcb-copom-comunicados-detalhe','{"meeting":9004}',pg_temp.detail(9004,'2025-12-10','hold','05,00'));
 if (r->>'reference')::boolean then raise exception 'rate spelled differently disagreed: %',r;end if;
 if (select count(*) from private.market_copom_meetings)<>3 then raise exception 'meeting rows wrong';end if;
 perform pg_temp.expect($q$update private.market_copom_meetings set target_pct='14.00'$q$,'*','meeting rewritten');
 if exists(select 1 from private.market_select_evidence_v1('2025-09-17','2025-10-10','2025-09-01')) then raise exception 'evidence acquired after the data-base was selected';end if;
end $$;

-- 5. A series confirmed with the communiqués available: anchor, change and link; approved.
do $$ declare r jsonb;v private.market_versions;begin
 r:=pg_temp.run('s2','3a780000-0000-4000-a000-000000000301','bcb-sgs-432-endpoint','{"window":{"start":"2025-09-17","end":"2025-10-10"}}',
  pg_temp.sgs('2025-09-17','2025-10-10','2025-10-08','15.00','14.50'));
 if r->'quality'->>'status'<>'approved' then raise exception 'series with evidence not approved: %',r;end if;
 select * into strict v from private.market_versions where id=(r->>'versionId')::uuid;
 if (select array_agg(meeting order by meeting) from private.market_version_evidence where version_id=v.id)<>array[9001,9002]
 or v.evidence_available_at<>greatest((select acquired_at from private.market_acquisitions where id=v.acquisition_id),(select max(reference_acquired_at) from private.market_copom_meetings))
 then raise exception 'evidence of the approved version wrong';end if;
 if (select anchor_meeting from private.market_version_evaluations where version_id=v.id)<>9001 then raise exception 'anchor wrong';end if;
 -- The same bytes with the change one day late: on the meeting's day the value holds (wrong rate and
 -- direction), and the next day changes with no communiqué.
 r:=pg_temp.run('s3','3a780000-0000-4000-a000-000000000302','bcb-sgs-432-endpoint','{"window":{"start":"2025-09-17","end":"2025-10-10"}}',
  pg_temp.sgs('2025-09-17','2025-10-10','2025-10-09','15.00','14.50'));
 if r->'quality'->>'status'<>'quarantined' or (select jsonb_agg(f->>'code' order by o) from private.market_version_evaluations x,
  jsonb_array_elements(x.findings) with ordinality y(f,o) where x.version_id=(r->>'versionId')::uuid)<>'["communique_value_mismatch","communique_direction_mismatch","change_without_communique"]'::jsonb
 then raise exception 'late change not quarantined as expected: %',r;end if;
end $$;

-- 6. Relink: the quarantined version gains the evidence in a new version; the command replays.
do $$ declare r jsonb;r2 jsonb;n uuid;begin
 perform pg_temp.expect(format($q$select private.relink_market_version_v1('3a780000-0000-4000-a000-000000000401',%L,'3a780000-0000-4000-8000-000000000004')$q$,
  pg_temp.fact('v1')),'platform_principal_required','worker account relinks');
 r:=private.relink_market_version_v1('3a780000-0000-4000-a000-000000000402',pg_temp.fact('v1')::uuid,'3a780000-0000-4000-8000-000000000002');
 if (r->>'relinked')::boolean is not true or r->>'supersedes'<>pg_temp.fact('v1') or r->'quality'->>'status'<>'approved' then raise exception 'relink answer wrong: %',r;end if;
 n:=(r->>'versionId')::uuid;
 if (select acquisition_id from private.market_versions where id=n)<>pg_temp.fact('a1')::uuid
 or (select count(*) from private.market_observations where version_id=n)<>24
 or (select array_agg(meeting order by meeting) from private.market_version_evidence where version_id=n)<>array[9001,9002]
 or exists(select 1 from private.market_version_evidence where version_id=pg_temp.fact('v1')::uuid)
 or (select status from private.market_version_evaluations where version_id=pg_temp.fact('v1')::uuid)<>'quarantined'
 then raise exception 'relinked version wrong';end if;
 r2:=private.relink_market_version_v1('3a780000-0000-4000-a000-000000000402',pg_temp.fact('v1')::uuid,'3a780000-0000-4000-8000-000000000002');
 if (r2->>'replayed')::boolean is not true or r2->>'versionId'<>r->>'versionId' then raise exception 'relink replay wrong: %',r2;end if;
 perform pg_temp.expect(format($q$select private.relink_market_version_v1('3a780000-0000-4000-a000-000000000402',%L,'3a780000-0000-4000-8000-000000000002')$q$,n),
  'platform_method_request_reused','relink command reused');
 perform pg_temp.expect(format($q$select private.relink_market_version_v1('3a780000-0000-4000-a000-000000000403',%L,'3a780000-0000-4000-8000-000000000002')$q$,
  pg_temp.fact('v1')),'market_relink_not_tip','relink of a superseded version');
 r2:=private.relink_market_version_v1('3a780000-0000-4000-a000-000000000404',n,'3a780000-0000-4000-8000-000000000002');
 if (r2->>'relinked')::boolean or r2->>'versionId'<>n::text then raise exception 'relink with the same evidence made a version: %',r2;end if;
 insert into facts values('v2',n::text);
end $$;

-- 7. Closed content and the v2 gates.
do $$ declare v private.market_versions;begin
 select * into strict v from private.market_versions where id=pg_temp.fact('v1')::uuid;
 perform pg_temp.expect(format($q$insert into private.market_version_evidence(version_id,meeting,acquisition_id,record_sha256)
  select %L,meeting,reference_acquisition_id,record_sha256 from private.market_copom_meetings where meeting=9001$q$,v.id),'market_version_closed','evidence after the seal');
 perform pg_temp.expect(format($q$insert into private.market_observations(version_id,period_start,period_end,available_at,acquired_at,value,unit,scale)
  select %L,null,'2025-10-11',acquired_at,acquired_at,14.50,unit,scale from private.market_observations where version_id=%L limit 1$q$,v.id,v.id),'market_version_closed','observation after the seal');
 perform pg_temp.expect(format($q$insert into private.market_versions(id,logical_id,parser_version,sha256,license,supersedes,canonical_version,normalization_id,acquisition_id,
  data_base,window_start,window_end,evidence_available_at) values(gen_random_uuid(),%L,%L,repeat('0',64),%L,null,'v2',%L,%L,%L,%L,%L,%L)$q$,
  v.logical_id,v.parser_version,v.license,v.normalization_id,v.acquisition_id,v.data_base,v.window_start,v.window_end,v.evidence_available_at),'23505','second root for an acquisition');
 perform pg_temp.expect(format($q$insert into private.market_versions(id,logical_id,parser_version,sha256,license,supersedes) values(gen_random_uuid(),%L,'x',repeat('0',64),%L,%L)$q$,
  v.logical_id,v.license,pg_temp.fact('v2')),'market_version_v2_required','v1 successor of a v2 version');
 perform pg_temp.expect(format($q$insert into private.market_versions(id,logical_id,parser_version,sha256,license,acquisition_id) values(gen_random_uuid(),%L,'x',repeat('0',64),%L,%L)$q$,
  v.logical_id,v.license,v.acquisition_id),'market_version_v2_invalid','v1 version naming a contract acquisition');
 insert into private.market_versions(id,logical_id,parser_version,sha256,license) values('3a780000-0000-4000-a000-000000000501',v.logical_id,'x',repeat('0',64),v.license);
 perform pg_temp.expect(format($q$insert into private.market_version_inputs(version_id,acquisition_id) values('3a780000-0000-4000-a000-000000000501',%L)$q$,v.acquisition_id),
  'market_version_v2_required','v1 version reading a contract acquisition');
 perform pg_temp.expect($q$update private.market_version_evaluations set status='approved'$q$,'*','evaluation rewritten');
 perform pg_temp.expect($q$delete from private.market_version_commits$q$,'*','confirmation receipt deleted');
 perform pg_temp.expect($q$delete from private.market_relink_commands$q$,'*','relink receipt deleted');
end $$;

-- 8. Revoking the worker token closes the replay of a confirmation.
do $$ declare c jsonb;at timestamptz;begin
 select claim into strict c from claims where name='s1';
 select acquired_at into strict at from private.market_acquisitions where processing_job_id=(c->>'jobId')::uuid;
 update private.worker_tokens set status='revoked',revoked_at=clock_timestamp() where id='3a780000-0000-4000-8000-000000000011';
 perform pg_temp.as_account('3a780000-0000-4000-8000-000000000004');
 perform pg_temp.expect(format($q$select private.worker_commit_market_version_v1(%L,%L,%L,%L,'application/json',%L)$q$,c->>'jobId',c->>'capability',c->>'leaseId',
  pg_temp.sgs('2025-09-17','2025-10-10','2025-10-08','15.00','14.50'),at),'market_acquisition_lease_denied','replay after the worker token was revoked');
 perform pg_temp.as_account(null);
end $$;

-- 9. Closed surfaces.
do $$ declare t text;r text;begin
 foreach t in array array['market_endpoint_contracts','market_normalizations','market_copom_communique_acquisitions','market_copom_meetings',
  'market_version_evidence','market_version_evaluations','market_version_commits','market_relink_commands'] loop
  foreach r in array array['anon','authenticated','service_role'] loop
   if has_table_privilege(r,'private.'||t,'select,insert,update,delete,truncate,references,trigger') then raise exception '% reaches %',r,t;end if;
  end loop;
  if not (select relrowsecurity and relforcerowsecurity from pg_class where oid=('private.'||t)::regclass) then raise exception 'RLS not forced on %',t;end if;
 end loop;
 foreach r in array array['anon','authenticated','service_role'] loop
  if has_function_privilege(r,'private.relink_market_version_v1(uuid,uuid,uuid)','execute') then raise exception '% relinks',r;end if;
  if has_function_privilege(r,'private.create_market_selic_version_v1(uuid,text,uuid,jsonb,date,date,date,uuid,uuid)','execute') then raise exception '% creates versions',r;end if;
 end loop;
end $$;
rollback;
