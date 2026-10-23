-- Market reference M2 part 6 (ADR 0023): the RG-01 monitor. Declaration and its guard, the Copom calendar
-- command, the shared selection, snapshot and evaluation at the current D and K, reuse and idle, incident,
-- witnesses and support, the operator's review, dispute, reopening by a new witness, the consumer handler,
-- schedule and evaluation entries, the operator read and closed surfaces. Synthetic: a regime declared in
-- this transaction with dates relative to the day of the run, so the result does not depend on when CI runs.
-- Rolls back.
begin;
set local statement_timeout='120s';
select set_config('request.jwt.claims','{}',true);
select set_config('request.jwt.claim.sub','',true);
-- 1 founder, 2 operator, 4 worker account, 5 second worker account.
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
select ('3a7c0000-0000-4000-8000-00000000000'||n)::uuid,'authenticated','authenticated','3a7c0000-'||n||'@example.invalid','{}','{}',now(),now(),false,false
from unnest(array[1,2,4,5]) n;
insert into private.platform_principals(user_id,role,label) values
 ('3a7c0000-0000-4000-8000-000000000001','founder','Synthetic RG-01 founder'),
 ('3a7c0000-0000-4000-8000-000000000002','operator','Synthetic RG-01 operator');
insert into private.worker_tokens(id,label,token_sha256,execution_account_user_id) values
 ('3a7c0000-0000-4000-8000-000000000011','Synthetic RG-01 worker',extensions.digest('synthetic-rg01-worker-token-3a7c0000-a','sha256'),'3a7c0000-0000-4000-8000-000000000004'),
 ('3a7c0000-0000-4000-8000-000000000012','Synthetic RG-01 second worker',extensions.digest('synthetic-rg01-worker-token-3a7c0000-b','sha256'),'3a7c0000-0000-4000-8000-000000000005');
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
select private.register_market_publisher_v1('3a7c0000-0000-4000-a000-000000000001','Offroad, referência de mercado','3a7c0000-0000-4000-8000-000000000001');
select private.record_market_source_revision_v1('3a7c0000-0000-4000-a000-000000000011','bcb',jsonb_build_object('registryId','bcb_sgs',
 'license',jsonb_build_object('kind','open','license','ODbL-1.0','attribution','Banco Central do Brasil',
  'evidenceIds',jsonb_build_array('bcb-catalog-meta-selic-432','bcb-catalog-atas-comunicados-copom','bcb-site-termos-de-uso'),'retainAdoptedValues',true,'storeDays',null),
 'allowedHosts',jsonb_build_array('api.bcb.gov.br','www.bcb.gov.br'),'calendar','br_business_days','expectedPublication','09:00','maximumAgeHours',30,'enabled',true,
 'reason','Fonte sintética para o teste do monitor RG-01'),'3a7c0000-0000-4000-8000-000000000002');
select private.release_market_acquisition_transport_v1('3a7c0000-0000-4000-a000-000000000021',true,'3a7c0000-0000-4000-8000-000000000002','Synthetic opening for the RG-01 test');
select private.grant_market_acquisition_delegation_v1('3a7c0000-0000-4000-a000-000000000022','3a7c0000-0000-4000-8000-000000000011','bcb','Synthetic delegation of the RG-01 worker','3a7c0000-0000-4000-8000-000000000002');

-- The day of the run and the synthetic cycle: a hold at 15.00 (e0), five cuts of 25 bps to 13.75, then a
-- raise R and a second raise R2. Meeting ends are spaced so that no first day falls in a previous year.
create function pg_temp.day(p_offset integer) returns date language sql stable as $$
 select case when to_char(d,'MM-DD')='01-01' then d+1 else d end from (select private.market_sao_paulo_date_v1(clock_timestamp())-p_offset d) x;
$$;
select pg_temp.put('D',private.market_sao_paulo_date_v1(clock_timestamp())::text);
select pg_temp.put('e0',pg_temp.day(32)::text),pg_temp.put('e1',pg_temp.day(26)::text),pg_temp.put('e2',pg_temp.day(23)::text),pg_temp.put('e3',pg_temp.day(20)::text),
 pg_temp.put('e4',pg_temp.day(17)::text),pg_temp.put('e5',pg_temp.day(14)::text),pg_temp.put('R',pg_temp.day(8)::text),pg_temp.put('R2',pg_temp.day(4)::text);
create function pg_temp.d(p_name text) returns date language sql stable as $$ select pg_temp.fact(p_name)::date $$;

-- SGS daily bytes over a window, the value of each day the last point at or before it.
create function pg_temp.sgs(p_start date,p_end date,p_points jsonb) returns bytea language sql as $$
 select convert_to(json_agg(json_build_object('data',to_char(d,'DD/MM/YYYY'),'valor',
  (select x->>1 from jsonb_array_elements(p_points) x where (x->>0)::date<=d order by (x->>0)::date desc limit 1)) order by d)::text,'UTF8')
 from generate_series(p_start,p_end,interval '1 day') d;
$$;
create function pg_temp.detail(p_meeting integer,p_reference date,p_verb text,p_pct text) returns bytea language sql as $$
 select convert_to(json_build_object('conteudo',json_build_array(json_build_object('nro_reuniao',p_meeting,'dataReferencia',to_char(p_reference,'YYYY-MM-DD'),
  'titulo',case p_verb when 'hold' then 'Copom mantém a taxa Selic em '||p_pct||'% a.a.' when 'cut' then 'Copom reduz a taxa Selic para '||p_pct||'% a.a.'
   else 'Copom eleva a taxa Selic para '||p_pct||'% a.a.' end,
  'textoComunicado',case p_verb when 'hold' then '<p>O Copom decidiu manter a taxa Selic em '||p_pct||'% a.a.</p>'
   when 'cut' then '<p>O Copom decidiu reduzir a taxa Selic em 0,25 ponto percentual, para '||p_pct||'% a.a.</p>'
   else '<p>O Copom decidiu elevar a taxa Selic em 0,25 ponto percentual, para '||p_pct||'% a.a.</p>' end)))::text,'UTF8');
$$;
create function pg_temp.claim_job(p_command text,p_contract text,p_request jsonb) returns jsonb language plpgsql as $$
declare c jsonb;begin
 perform private.enqueue_market_contract_acquisition_v1(p_command::uuid,p_contract,p_request,'Aquisição sintética do teste do monitor RG-01','3a7c0000-0000-4000-8000-000000000002');
 perform pg_temp.as_account('3a7c0000-0000-4000-8000-000000000004');
 c:=private.worker_claim_market_acquisition_v1('synthetic-rg01-worker-token-3a7c0000-a');
 perform pg_temp.as_account(null);
 if (c->>'claimed')::boolean is not true or c->>'contractId'<>p_contract then raise exception 'claim failed: %',c;end if;
 return c;
end $$;
create function pg_temp.run(p_command text,p_contract text,p_request jsonb,p_content bytea) returns jsonb language plpgsql as $$
declare c jsonb;r jsonb;begin
 c:=pg_temp.claim_job(p_command,p_contract,p_request);
 insert into storage.objects(bucket_id,name,metadata,version) values('market-reference',c->>'objectPath',
  jsonb_build_object('size',octet_length(p_content),'mimetype','application/json','eTag','"'||md5(p_content)||'"'),'market-rg01-sql-v1');
 perform pg_temp.as_account('3a7c0000-0000-4000-8000-000000000004');
 r:=private.worker_commit_market_version_v1((c->>'jobId')::uuid,c->>'capability',(c->>'leaseId')::uuid,p_content,'application/json',clock_timestamp());
 perform pg_temp.as_account(null);
 return r;
end $$;
create function pg_temp.series(p_command text,p_start date) returns jsonb language plpgsql as $$
declare pts jsonb;r jsonb;begin
 pts:=jsonb_build_array(jsonb_build_array(to_char(pg_temp.d('e1')-100,'YYYY-MM-DD'),'15.00'),
  jsonb_build_array(to_char(pg_temp.d('e1')+1,'YYYY-MM-DD'),'14.75'),jsonb_build_array(to_char(pg_temp.d('e2')+1,'YYYY-MM-DD'),'14.50'),
  jsonb_build_array(to_char(pg_temp.d('e3')+1,'YYYY-MM-DD'),'14.25'),jsonb_build_array(to_char(pg_temp.d('e4')+1,'YYYY-MM-DD'),'14.00'),
  jsonb_build_array(to_char(pg_temp.d('e5')+1,'YYYY-MM-DD'),'13.75'));
 if pg_temp.fact('raise')='1' or pg_temp.fact('raise')='2' then pts:=pts||jsonb_build_array(jsonb_build_array(to_char(pg_temp.d('R')+1,'YYYY-MM-DD'),'14.00'));end if;
 if pg_temp.fact('raise')='2' then pts:=pts||jsonb_build_array(jsonb_build_array(to_char(pg_temp.d('R2')+1,'YYYY-MM-DD'),'14.25'));end if;
 r:=pg_temp.run(p_command,'bcb-sgs-432-endpoint',jsonb_build_object('window',jsonb_build_object('start',to_char(p_start,'YYYY-MM-DD'),'end',to_char(pg_temp.d('D')-1,'YYYY-MM-DD'))),
  pg_temp.sgs(p_start,pg_temp.d('D')-1,pts));
 if r->'quality'->>'status'<>'approved' then raise exception 'series not approved: %',r;end if;
 return r;
end $$;
-- The calendars of every year from the cycle start to D, from the given meeting ends; a year without one
-- gets a meeting after D, outside the reading.
create function pg_temp.calendars(p_ends date[]) returns void language plpgsql as $$
declare y integer;m jsonb;begin
 for y in extract(year from pg_temp.d('e1'))::int..extract(year from pg_temp.d('D'))::int loop
  select coalesce(jsonb_agg(jsonb_build_object('ordinal',o,'firstDay',to_char(e-1,'YYYY-MM-DD'),'secondDay',to_char(e,'YYYY-MM-DD')) order by o),'[]') into m
  from (select e,row_number() over (order by e) o from unnest(p_ends) e where extract(year from e)=y) x;
  if jsonb_array_length(m)=0 then
   m:=jsonb_build_array(jsonb_build_object('ordinal',1,'firstDay',to_char(pg_temp.d('D')+9,'YYYY-MM-DD'),'secondDay',to_char(pg_temp.d('D')+10,'YYYY-MM-DD')));
  end if;
  perform private.record_market_copom_calendar_v1(gen_random_uuid(),y,m,'https://www.bcb.gov.br/controleinflacao/calendarioreunioescopom',
   convert_to('<html>calendário sintético '||y||'</html>','UTF8'),'text/html','Calendário sintético do teste','3a7c0000-0000-4000-8000-000000000002');
 end loop;
end $$;
-- The synthetic declaration, its canonical text built by the database.
create function pg_temp.projection(p_regime text,p_steps integer[]) returns jsonb language sql stable as $$
 select jsonb_build_object('decidedBy','Operador sintético','easingCycle',jsonb_build_object(
   'copomDecisions',jsonb_build_array(pg_temp.fact('e1'),pg_temp.fact('e2'),pg_temp.fact('e3'),pg_temp.fact('e4'),pg_temp.fact('e5')),
   'cumulativeBps',-(p_steps[1]*p_steps[2]),'cuts',p_steps[2],'effectiveNextDay',true,'fromPct','15.00','startedOn',to_char(pg_temp.d('e1')+1,'YYYY-MM-DD'),'stepBps',p_steps[1]),
  'policyId','policy.pricing.regime','policyVersion','2099.01.01-test','regime',p_regime,'reviewDeadlineBusinessDays',5,'selicTargetPct','13.75',
  'trigger',jsonb_build_object('action','revisao_obrigatoria','condition','condição sintética','id','RG-01','scope','teste'),'validFrom',to_char(pg_temp.d('e1')+1,'YYYY-MM-DD'));
$$;
create function pg_temp.declare_regime(p_id uuid,p_regime text,p_projection jsonb,p_text text default null) returns void language plpgsql as $$
declare txt text:=coalesce(p_text,private.market_policy_canonical_v1(p_projection)||chr(10));begin
 insert into private.market_regime_declarations(id,policy_id,policy_version,regime_id,trigger_id,rule,projection_text,projection_sha256,active)
 values(p_id,'policy.pricing.regime','2099.01.01-test',p_regime,'RG-01','market-rg01.v1',txt,encode(extensions.digest(convert_to(txt,'UTF8'),'sha256'),'hex'),true);
end $$;
create function pg_temp.request(p_key text) returns void language sql as $$
 insert into private.market_rg01_requests(regime_id,trigger_id,key) values(pg_temp.fact('regime'),'RG-01',p_key);
$$;
create function pg_temp.evaluate() returns jsonb language sql as $$ select private.run_market_rg01_v1(pg_temp.fact('decl')::uuid) $$;
create function pg_temp.incident() returns private.market_regime_incidents language sql stable as $$
 select * from private.market_regime_incidents where regime_id=pg_temp.fact('regime') and trigger_id='RG-01';
$$;
select pg_temp.put('decl','3a7c0000-0000-4000-b000-000000000001'),pg_temp.put('regime','brl-teste-'||to_char(pg_temp.d('e1')+1,'YYYY-MM-DD')),pg_temp.put('raise','0');

-- 1. The seeded declaration is the pinned projection with its request; a declaration must be canonical and
-- hold together, and is immutable except for being superseded.
do $$ declare p jsonb;begin
 if (select projection_sha256 from private.market_regime_declarations where id='5f0c7a1e-3d1b-5c55-9a7e-6e3f0a8b2c01' and active)
  is distinct from '31656412a93a1c2d52a651308bbcc307266ba211b9d4089801203c982a3ce0d7' then raise exception 'seeded declaration drifted';end if;
 if not exists(select 1 from private.market_rg01_requests where key='declaration:5f0c7a1e-3d1b-5c55-9a7e-6e3f0a8b2c01' and satisfied_by is null)
 then raise exception 'seeded declaration has no pending request';end if;
 perform pg_temp.expect($q$select private.market_policy_canonical_v1('{"a":[1,{"b":0.5}]}')$q$,'market_policy_fraction_not_allowed','fraction in a policy');
 p:=pg_temp.projection(pg_temp.fact('regime'),array[25,5]);
 perform pg_temp.expect(format('select pg_temp.declare_regime(%L,%L,%L)','3a7c0000-0000-4000-b000-000000000002',pg_temp.fact('regime'),pg_temp.projection(pg_temp.fact('regime'),array[30,5])),
  'market_regime_declaration_invalid','cycle that does not add up');
 perform pg_temp.expect(format('select pg_temp.declare_regime(%L,%L,%L,%L)','3a7c0000-0000-4000-b000-000000000002',pg_temp.fact('regime'),p,p::text||chr(10)),
  'market_regime_declaration_invalid','declaration that is not canonical text');
 perform pg_temp.declare_regime(pg_temp.fact('decl')::uuid,pg_temp.fact('regime'),p);
 perform pg_temp.expect(format('select pg_temp.declare_regime(%L,%L,%L)','3a7c0000-0000-4000-b000-000000000003',pg_temp.fact('regime'),p),'23505','second active declaration');
 perform pg_temp.expect(format($q$update private.market_regime_declarations set policy_version='x' where id=%L$q$,pg_temp.fact('decl')),
  'market_regime_declaration_immutable','declaration edited');
 perform pg_temp.expect(format($q$delete from private.market_regime_declarations where id=%L$q$,pg_temp.fact('decl')),'market_regime_declaration_immutable','declaration deleted');
end $$;

-- 2. The calendar: a principal's command with its evidence, validated, replayed, refused when reused.
do $$ declare r jsonb;m jsonb:='[{"ordinal":1,"firstDay":"2099-01-27","secondDay":"2099-01-28"},{"ordinal":2,"firstDay":"2099-03-17","secondDay":"2099-03-18"}]';
 ev bytea:=convert_to('<html>calendário 2099</html>','UTF8');begin
 perform pg_temp.expect(format($q$select private.record_market_copom_calendar_v1('3a7c0000-0000-4000-a000-000000000031',2099,%L,'https://www.bcb.gov.br/x',%L,'text/html','Calendário sintético','3a7c0000-0000-4000-8000-000000000004')$q$,m,ev),
  'platform_principal_required','calendar by a non-principal');
 perform pg_temp.expect(format($q$select private.record_market_copom_calendar_v1('3a7c0000-0000-4000-a000-000000000032',2099,%L,'https://www.bcb.gov.br/x',%L,'text/html','Calendário sintético','3a7c0000-0000-4000-8000-000000000002')$q$,
  '[{"ordinal":1,"firstDay":"2099-01-27","secondDay":"2099-01-29"}]',ev),'market_calendar_invalid','meeting days not consecutive');
 perform pg_temp.expect(format($q$select private.record_market_copom_calendar_v1('3a7c0000-0000-4000-a000-000000000033',2099,%L,'https://www.bcb.gov.br/x',%L,'text/html','Calendário sintético','3a7c0000-0000-4000-8000-000000000002')$q$,
  '[{"ordinal":2,"firstDay":"2099-01-27","secondDay":"2099-01-28"}]',ev),'market_calendar_invalid','ordinal out of order');
 perform pg_temp.expect(format($q$select private.record_market_copom_calendar_v1('3a7c0000-0000-4000-a000-000000000034',2099,%L,'https://www.bcb.gov.br/x',%L,'text/html','Calendário sintético','3a7c0000-0000-4000-8000-000000000002')$q$,
  '[{"ordinal":1,"firstDay":"2099-03-17","secondDay":"2099-03-18"},{"ordinal":2,"firstDay":"2099-03-18","secondDay":"2099-03-19"}]',ev),'market_calendar_invalid','overlapping meetings');
 perform pg_temp.expect(format($q$select private.record_market_copom_calendar_v1('3a7c0000-0000-4000-a000-000000000035',2099,%L,'https://www.bcb.gov.br/x',%L,'text/html','Calendário sintético','3a7c0000-0000-4000-8000-000000000002')$q$,
  '[{"ordinal":1,"firstDay":"2098-12-31","secondDay":"2099-01-01"}]',ev),'market_calendar_invalid','meeting outside the year');
 perform pg_temp.expect(format($q$select private.record_market_copom_calendar_v1('3a7c0000-0000-4000-a000-000000000036',2099,%L,'https://example.com/x',%L,'text/html','Calendário sintético','3a7c0000-0000-4000-8000-000000000002')$q$,m,ev),
  '23514','evidence outside the central bank');
 r:=private.record_market_copom_calendar_v1('3a7c0000-0000-4000-a000-000000000037',2099,m,'https://www.bcb.gov.br/x',ev,'text/html','Calendário sintético','3a7c0000-0000-4000-8000-000000000002');
 if (r->>'revision')::int<>1 or (r->>'replayed')::boolean then raise exception 'first calendar revision: %',r;end if;
 r:=private.record_market_copom_calendar_v1('3a7c0000-0000-4000-a000-000000000037',2099,m,'https://www.bcb.gov.br/x',ev,'text/html','Calendário sintético','3a7c0000-0000-4000-8000-000000000002');
 if (r->>'replayed')::boolean is not true then raise exception 'calendar did not replay';end if;
 perform pg_temp.expect(format($q$select private.record_market_copom_calendar_v1('3a7c0000-0000-4000-a000-000000000037',2099,%L,'https://www.bcb.gov.br/x',%L,'text/html','Outro motivo','3a7c0000-0000-4000-8000-000000000002')$q$,m,ev),
  'platform_method_request_reused','calendar command reused');
 r:=private.record_market_copom_calendar_v1('3a7c0000-0000-4000-a000-000000000038',2099,m,'https://www.bcb.gov.br/x',ev,'text/html','Calendário sintético revisto','3a7c0000-0000-4000-8000-000000000002');
 if (r->>'revision')::int<>2 then raise exception 'second calendar revision: %',r;end if;
 if (select count(*) from private.market_copom_calendar_evidence where sha256=encode(extensions.digest(ev,'sha256'),'hex'))<>1 then raise exception 'evidence not kept once';end if;
 -- The normative act as the site's API serves it: JSON with its own media type; any other type is refused.
 r:=private.record_market_copom_calendar_v1('3a7c0000-0000-4000-a000-000000000039',2099,m,'https://www.bcb.gov.br/api/conteudo/app/normativos/x',
  convert_to('{"conteudo":[{"Titulo":"Comunicado sintético"}]}','UTF8'),'application/json','Calendário sintético por normativo','3a7c0000-0000-4000-8000-000000000002');
 if (r->>'revision')::int is distinct from 3 then raise exception 'calendar evidenced by JSON: %',r;end if;
 perform pg_temp.expect(format($q$select private.record_market_copom_calendar_v1('3a7c0000-0000-4000-a000-00000000003a',2099,%L,'https://www.bcb.gov.br/x',%L,'text/plain','Calendário sintético','3a7c0000-0000-4000-8000-000000000002')$q$,
  m,convert_to('calendário 2099 em texto','UTF8')),'23514','evidence of another media type');
end $$;

-- 3. The cycle's communiqués and series, then a reading without calendars: incomplete, and current while no
-- relevant meeting is due (decision 5 does not read the calendar); requests
-- seen are acknowledged, a run without requests is idle.
do $$ declare r jsonb;e private.market_regime_evaluations;begin
 -- The hold before the cycle anchors the first day of the series window.
 perform pg_temp.run('3a7c0000-0000-4000-a000-000000000100','bcb-copom-comunicados-detalhe','{"meeting":9100}',pg_temp.detail(9100,pg_temp.d('e0'),'hold','15,00'));
 perform pg_temp.run('3a7c0000-0000-4000-a000-00000000010'||n,'bcb-copom-comunicados-detalhe',jsonb_build_object('meeting',9100+n),
  pg_temp.detail(9100+n,pg_temp.d('e'||n),'cut',replace(to_char(15.00-0.25*n,'FM90.00'),'.',','))) from generate_series(1,5) n;
 perform pg_temp.series('3a7c0000-0000-4000-a000-000000000201',pg_temp.d('e1')-3);
 perform pg_temp.request('declaration:'||pg_temp.fact('decl'));
 r:=pg_temp.evaluate();
 if r->>'status'<>'evaluated' or r->>'result'<>'incomplete' or r->>'freshness'<>'current' or (r->>'reused')::boolean then raise exception 'reading without calendars: %',r;end if;
 select * into e from private.market_regime_evaluations where id=(r->>'evaluationId')::uuid;
 if not (e.evaluation->'gaps') ? ('calendar_missing:'||extract(year from pg_temp.d('e1'))) or jsonb_array_length(e.evaluation->'baselineContradictions')<>0
 or (e.snapshot->>'selectionEntries')::int=0 or jsonb_array_length(e.snapshot->'selection')<>(e.snapshot->>'selectionEntries')::int
 or e.snapshot#>>'{declaration,id}'<>pg_temp.fact('decl') or e.data_base<>pg_temp.d('D')
 or not (e.snapshot#>'{dependencies,acquisitions}') ? (select reference_acquisition_id::text from private.market_copom_meetings where meeting=9101)
 then raise exception 'evaluation content: %',e.evaluation;end if;
 if e.audit_sha256<>encode(extensions.digest(convert_to(e.snapshot::text,'UTF8'),'sha256'),'hex') or e.state_sha256<>e.evaluation->>'stateSha256'
 then raise exception 'evaluation digests';end if;
 if exists(select 1 from private.market_rg01_requests where regime_id=pg_temp.fact('regime') and satisfied_by is null)
 or not exists(select 1 from private.market_rg01_runs where evaluation_id=e.id and not reused and request_keys=array['declaration:'||pg_temp.fact('decl')])
 then raise exception 'requests not acknowledged by the run';end if;
 r:=pg_temp.evaluate();
 if r->>'status'<>'idle' then raise exception 'run without requests: %',r;end if;
 perform pg_temp.put('eval1',e.id::text);
end $$;

-- 4. With the calendars: not fired and current, no incident; the same state reuses the evaluation.
do $$ declare r jsonb;s jsonb;begin
 perform pg_temp.calendars(array[pg_temp.d('e1'),pg_temp.d('e2'),pg_temp.d('e3'),pg_temp.d('e4'),pg_temp.d('e5')]);
 perform pg_temp.request('hour:2099-01-01T01');
 r:=pg_temp.evaluate();
 if r->>'result'<>'not_fired' or r->>'freshness'<>'current' or (r->>'reused')::boolean then raise exception 'reading with calendars: %',r;end if;
 select snapshot into s from private.market_regime_evaluations where id=(r->>'evaluationId')::uuid;
 if jsonb_array_length(s->'meetings')<>5 or exists(select 1 from jsonb_array_elements(s->'meetings') m where m->'communique'->>'readable'<>'true')
 or s->'meetings'->0->>'previous'<>'15' or s->'meetings'->0->>'change'<>'14.75' then raise exception 'snapshot meetings: %',s->'meetings';end if;
 if (pg_temp.incident()).regime_id is not null then raise exception 'incident without a witness';end if;
 perform pg_temp.put('eval2',r->>'evaluationId');
 perform pg_temp.request('hour:2099-01-01T02');
 r:=pg_temp.evaluate();
 if (r->>'reused')::boolean is not true or r->>'evaluationId'<>pg_temp.fact('eval2') then raise exception 'equal state not reused: %',r;end if;
 if (select satisfied_by::text from private.market_rg01_requests where regime_id=pg_temp.fact('regime') and key='hour:2099-01-01T02')<>pg_temp.fact('eval2')
 or (select count(*) from private.market_regime_evaluations where regime_id=pg_temp.fact('regime'))<>2 then raise exception 'reuse wrote an evaluation';end if;
end $$;

-- 5. A raise corroborated by communiqué and series fires: incident opened with its review deadline, the
-- meeting registered as a supported witness.
do $$ declare r jsonb;i private.market_regime_incidents;begin
 perform pg_temp.run('3a7c0000-0000-4000-a000-000000000106','bcb-copom-comunicados-detalhe','{"meeting":9106}',pg_temp.detail(9106,pg_temp.d('R'),'raise','14,00'));
 perform pg_temp.put('raise','1');
 perform pg_temp.series('3a7c0000-0000-4000-a000-000000000202',pg_temp.d('R')-3);
 perform pg_temp.calendars(array[pg_temp.d('e1'),pg_temp.d('e2'),pg_temp.d('e3'),pg_temp.d('e4'),pg_temp.d('e5'),pg_temp.d('R')]);
 perform pg_temp.request('hour:2099-01-01T03');
 r:=pg_temp.evaluate();
 if r->>'result'<>'fired' then raise exception 'raise did not fire: %',r;end if;
 i:=pg_temp.incident();
 if i.review_state<>'open' or i.review_revision<>0 or i.opened_by_evaluation<>(r->>'evaluationId')::uuid
 or i.review_due_on<>private.market_business_day_after_v1(pg_temp.d('D'),5) then raise exception 'incident: %',row_to_json(i);end if;
 if (select array_agg(meeting_end order by meeting_end) from private.market_regime_witnesses where regime_id=pg_temp.fact('regime'))<>array[pg_temp.d('R')]
 or (select support from private.market_regime_witness_support where regime_id=pg_temp.fact('regime') and meeting_end=pg_temp.d('R') and revision=1)<>'supported'
 then raise exception 'witness not supported';end if;
end $$;

-- 6. The operator's review: expected revision, permitted transitions, receipt and replay.
do $$ declare r jsonb;begin
 perform pg_temp.expect(format($q$select private.dispose_market_regime_incident_v1('3a7c0000-0000-4000-a000-000000000301',%L,'RG-01',0,'review_opened','Revisão aberta pelo operador','3a7c0000-0000-4000-8000-000000000004')$q$,pg_temp.fact('regime')),
  'platform_principal_required','review by a non-principal');
 perform pg_temp.expect(format($q$select private.dispose_market_regime_incident_v1('3a7c0000-0000-4000-a000-000000000302',%L,'RG-01',1,'review_opened','Revisão aberta pelo operador','3a7c0000-0000-4000-8000-000000000002')$q$,pg_temp.fact('regime')),
  'market_regime_incident_revision_changed','stale expected revision');
 perform pg_temp.expect(format($q$select private.dispose_market_regime_incident_v1('3a7c0000-0000-4000-a000-000000000303',%L,'RG-01',0,'review_concluded','Conclusão sem abertura','3a7c0000-0000-4000-8000-000000000002')$q$,pg_temp.fact('regime')),
  'market_regime_transition_invalid','conclusion before opening');
 perform pg_temp.expect(format($q$select private.dispose_market_regime_incident_v1('3a7c0000-0000-4000-a000-000000000304',%L,'RG-01',0,'open','Volta ao início','3a7c0000-0000-4000-8000-000000000002')$q$,pg_temp.fact('regime')),
  'market_regime_disposition_invalid','disposition to open by hand');
 r:=private.dispose_market_regime_incident_v1('3a7c0000-0000-4000-a000-000000000305',pg_temp.fact('regime'),'RG-01',0,'review_opened','Revisão aberta pelo operador','3a7c0000-0000-4000-8000-000000000002');
 if r->>'reviewState'<>'review_opened' or (r->>'reviewRevision')::int<>1 then raise exception 'review opened: %',r;end if;
 r:=private.dispose_market_regime_incident_v1('3a7c0000-0000-4000-a000-000000000305',pg_temp.fact('regime'),'RG-01',0,'review_opened','Revisão aberta pelo operador','3a7c0000-0000-4000-8000-000000000002');
 if (r->>'replayed')::boolean is not true then raise exception 'review did not replay';end if;
 perform pg_temp.expect(format($q$select private.dispose_market_regime_incident_v1('3a7c0000-0000-4000-a000-000000000305',%L,'RG-01',0,'dismissed','Outro destino','3a7c0000-0000-4000-8000-000000000002')$q$,pg_temp.fact('regime')),
  'platform_method_request_reused','review command reused');
 r:=private.dispose_market_regime_incident_v1('3a7c0000-0000-4000-a000-000000000306',pg_temp.fact('regime'),'RG-01',1,'dismissed','Alta dentro do esperado para o regime','3a7c0000-0000-4000-8000-000000000002');
 if r->>'reviewState'<>'dismissed' or (r->>'reviewRevision')::int<>2 then raise exception 'dismissal: %',r;end if;
end $$;

-- 7. A second raise while the first witness is still supported is a new witness: the dismissed review reopens on
-- its own, with a new deadline, and a disposition against the revision before the reopening is refused.
do $$ declare r jsonb;i private.market_regime_incidents;x private.market_regime_dispositions;begin
 perform pg_temp.run('3a7c0000-0000-4000-a000-000000000107','bcb-copom-comunicados-detalhe','{"meeting":9107}',pg_temp.detail(9107,pg_temp.d('R2'),'raise','14,25'));
 perform pg_temp.put('raise','2');
 perform pg_temp.series('3a7c0000-0000-4000-a000-000000000203',pg_temp.d('R2')-3);
 perform pg_temp.calendars(array[pg_temp.d('e1'),pg_temp.d('e2'),pg_temp.d('e3'),pg_temp.d('e4'),pg_temp.d('e5'),pg_temp.d('R'),pg_temp.d('R2')]);
 perform pg_temp.request('hour:2099-01-01T04');
 r:=pg_temp.evaluate();
 if r->>'result'<>'fired' then raise exception 'second raise did not fire: %',r;end if;
 i:=pg_temp.incident();
 if i.review_state<>'open' or i.review_revision<>3 or i.review_due_on<>private.market_business_day_after_v1(pg_temp.d('D'),5) then raise exception 'review not reopened: %',row_to_json(i);end if;
 select * into x from private.market_regime_dispositions where regime_id=pg_temp.fact('regime') and revision_after=3;
 if x.actor_user_id is not null or x.command_id is not null or x.evaluation_id<>(r->>'evaluationId')::uuid or x.from_state<>'dismissed' then raise exception 'automatic reopening: %',row_to_json(x);end if;
 if (select count(*) from private.market_regime_witnesses where regime_id=pg_temp.fact('regime'))<>2
 or exists(select 1 from private.market_regime_witness_support s where s.regime_id=pg_temp.fact('regime') and s.support<>'supported')
 then raise exception 'both witnesses must stay supported';end if;
 perform pg_temp.expect(format($q$select private.dispose_market_regime_incident_v1('3a7c0000-0000-4000-a000-000000000307',%L,'RG-01',2,'review_opened','Revisão sobre a revisão anterior','3a7c0000-0000-4000-8000-000000000002')$q$,pg_temp.fact('regime')),
  'market_regime_incident_revision_changed','disposition against the revision before the reopening');
end $$;

-- 8. A disagreement with the first meeting's reference disputes it: that witness loses its support, the second
-- keeps the incident supported, nothing reopens, and the reading still fires on the second.
do $$ declare c jsonb;r jsonb;e jsonb;begin
 c:=pg_temp.claim_job('3a7c0000-0000-4000-a000-000000000401','bcb-copom-comunicados-detalhe','{"meeting":9106}');
 perform pg_temp.as_account('3a7c0000-0000-4000-8000-000000000004');
 r:=private.worker_fail_market_acquisition_v1((c->>'jobId')::uuid,c->>'capability',(c->>'leaseId')::uuid,'meeting_disagreement',true,'Referência difere do registro');
 perform pg_temp.as_account(null);
 if (r->>'retryScheduled')::boolean then raise exception 'disagreement retried';end if;
 perform pg_temp.request('hour:2099-01-01T05');
 r:=pg_temp.evaluate();
 select evaluation into e from private.market_regime_evaluations where id=(r->>'evaluationId')::uuid;
 if r->>'result'<>'fired' or not (e->'gaps') ? ('meeting_disputed:'||pg_temp.fact('R')) or e->'witnesses'<>jsonb_build_array(pg_temp.fact('R2'))
 then raise exception 'disputed reading: %',e;end if;
 if (select support from private.market_regime_witness_support where regime_id=pg_temp.fact('regime') and meeting_end=pg_temp.d('R') order by revision desc limit 1)<>'unavailable'
 or (select support from private.market_regime_witness_support where regime_id=pg_temp.fact('regime') and meeting_end=pg_temp.d('R2') order by revision desc limit 1)<>'supported'
 or (pg_temp.incident()).review_state<>'open' or (pg_temp.incident()).review_revision<>3 then raise exception 'dispute changed the review or the supports';end if;
end $$;

-- 8b. A communiqué acquired after the data-base limit is not read for that data-base, even with a later K.
do $$ declare s jsonb;begin
 s:=private.market_rg01_snapshot_v1(pg_temp.fact('decl')::uuid,pg_temp.d('D')-1,clock_timestamp());
 if exists(select 1 from jsonb_array_elements(s->'meetings') m where m->'communique' is not null and m->'communique'<>'null'::jsonb)
 then raise exception 'communiqué read before it was available: %',s->'meetings';end if;
end $$;

-- 9. The consumer's handler: founder registration, one per handler, the generic completion refused, the
-- handler's entry records a request for every active declaration with its receipt, and replays.
do $$ declare r jsonb;c jsonb;s bigint;k text;begin
 perform pg_temp.expect($q$select private.register_market_event_consumer_v2('3a7c0000-0000-4000-a000-000000000501','rg01-monitor',array['released'],array['source'],'rg01','Monitor RG-01','3a7c0000-0000-4000-8000-000000000002')$q$,
  'platform_principal_required','operator registers the monitor');
 perform pg_temp.expect($q$select private.register_market_event_consumer_v2('3a7c0000-0000-4000-a000-000000000502','rg01-x',array['released'],array['source'],'other','Monitor RG-01','3a7c0000-0000-4000-8000-000000000001')$q$,
  'market_event_consumer_invalid','unknown handler');
 r:=private.register_market_event_consumer_v2('3a7c0000-0000-4000-a000-000000000503','rg01-monitor',array['released'],array['source'],'rg01','Monitor RG-01 sintético','3a7c0000-0000-4000-8000-000000000001');
 if (r->>'replayed')::boolean then raise exception 'registration replayed';end if;
 perform pg_temp.expect($q$select private.register_market_event_consumer_v2('3a7c0000-0000-4000-a000-000000000504','rg01-monitor-2',array['released'],array['source'],'rg01','Segundo monitor','3a7c0000-0000-4000-8000-000000000001')$q$,
  'market_event_handler_taken','second consumer of the handler');
 perform private.grant_market_event_delegation_v1('3a7c0000-0000-4000-a000-000000000505','3a7c0000-0000-4000-8000-000000000011','rg01-monitor','Delegação sintética do monitor','3a7c0000-0000-4000-8000-000000000002');
 insert into private.market_events(subject_kind,subject_id,event,reason,actor_user_id) values('source','bcb','released','Evento sintético do monitor','3a7c0000-0000-4000-8000-000000000002')
 returning sequence into s;
 perform pg_temp.as_account('3a7c0000-0000-4000-8000-000000000004');
 c:=private.worker_claim_market_event_v1('synthetic-rg01-worker-token-3a7c0000-a','rg01-monitor');
 perform pg_temp.as_account(null);
 if (c->>'eventSequence')::bigint<>s then raise exception 'claim: %',c;end if;
 perform pg_temp.as_account('3a7c0000-0000-4000-8000-000000000004');
 perform pg_temp.expect(format($q$select private.worker_complete_market_event_v1('rg01-monitor',%s,%L,%L,'{}')$q$,s,c->>'capability',c->>'leaseId'),
  'market_event_handler_required','generic completion of the monitor');
 r:=private.worker_run_rg01_event_v1('rg01-monitor',s,c->>'capability',(c->>'leaseId')::uuid);
 k:='event:rg01-monitor:'||s;
 if (r->>'completed')::boolean is not true or (r->>'replayed')::boolean or r->>'request'<>k then raise exception 'event run: %',r;end if;
 r:=private.worker_run_rg01_event_v1('rg01-monitor',s,c->>'capability',(c->>'leaseId')::uuid);
 if (r->>'replayed')::boolean is not true then raise exception 'event run did not replay';end if;
 perform pg_temp.as_account(null);
 -- A receipt of a generic consumer is not replayed by the monitor's entry.
 perform private.register_market_event_consumer_v1('3a7c0000-0000-4000-a000-000000000506','generic-x',array['released'],array['source'],'Consumidor genérico sintético','3a7c0000-0000-4000-8000-000000000001');
 perform private.grant_market_event_delegation_v1('3a7c0000-0000-4000-a000-000000000507','3a7c0000-0000-4000-8000-000000000011','generic-x','Delegação sintética genérica','3a7c0000-0000-4000-8000-000000000002');
 insert into private.market_events(subject_kind,subject_id,event,reason,actor_user_id) values('source','bcb','released','Evento sintético genérico','3a7c0000-0000-4000-8000-000000000002');
 perform pg_temp.as_account('3a7c0000-0000-4000-8000-000000000004');
 c:=private.worker_claim_market_event_v1('synthetic-rg01-worker-token-3a7c0000-a','generic-x');
 perform private.worker_complete_market_event_v1('generic-x',(c->>'eventSequence')::bigint,c->>'capability',(c->>'leaseId')::uuid,'{"ok":true}');
 perform pg_temp.expect(format($q$select private.worker_run_rg01_event_v1('generic-x',%s,%L,%L)$q$,c->>'eventSequence',c->>'capability',c->>'leaseId'),
  'market_event_handler_mismatch','replay of a generic receipt by the monitor entry');
 perform pg_temp.as_account(null);
 if (select count(*) from private.market_rg01_requests where key=k and satisfied_by is null)<>(select count(*) from private.market_regime_declarations where active)
 or (select status from private.market_event_outbox where consumer_id='rg01-monitor' and event_sequence=s)<>'completed'
 or (select effect from private.market_event_receipts where consumer_id='rg01-monitor' and event_sequence=s)<>jsonb_build_object('handler','rg01','request',k)
 then raise exception 'event request, outbox or receipt';end if;
end $$;

-- 10. Schedule and evaluation by the delegated worker: the hour and every due deadline are requested, and
-- every active declaration is evaluated; a worker without the delegation is inactive.
do $$ declare r jsonb;begin
 perform pg_temp.as_account('3a7c0000-0000-4000-8000-000000000005');
 r:=private.worker_schedule_rg01_v1('synthetic-rg01-worker-token-3a7c0000-b');
 if (r->>'active')::boolean then raise exception 'undelegated worker scheduled';end if;
 r:=private.worker_evaluate_rg01_v1('synthetic-rg01-worker-token-3a7c0000-b');
 if (r->>'active')::boolean then raise exception 'undelegated worker evaluated';end if;
 perform pg_temp.as_account('3a7c0000-0000-4000-8000-000000000004');
 r:=public.worker_schedule_rg01_v1('synthetic-rg01-worker-token-3a7c0000-a');
 if (r->>'active')::boolean is not true or (r->>'scheduled')::int<2 then raise exception 'schedule: %',r;end if;
 if not exists(select 1 from private.market_rg01_requests where regime_id=pg_temp.fact('regime') and key='deadline:'||pg_temp.fact('R'))
 then raise exception 'due deadline not requested';end if;
 r:=public.worker_evaluate_rg01_v1('synthetic-rg01-worker-token-3a7c0000-a');
 perform pg_temp.as_account(null);
 if (r->>'active')::boolean is not true or jsonb_array_length(r->'runs')<>(select count(*) from private.market_regime_declarations where active)
 or exists(select 1 from jsonb_array_elements(r->'runs') x where x->>'status'<>'evaluated') then raise exception 'evaluation entry: %',r;end if;
 if exists(select 1 from private.market_rg01_requests where satisfied_by is null) then raise exception 'requests left pending';end if;
end $$;

-- 11. What the operator reads.
do $$ declare r jsonb;begin
 perform pg_temp.expect(format($q$select private.market_regime_incident_v1(%L,'RG-01','3a7c0000-0000-4000-8000-000000000004')$q$,pg_temp.fact('regime')),
  'platform_principal_required','incident read by a non-principal');
 r:=private.market_regime_incident_v1(pg_temp.fact('regime'),'RG-01','3a7c0000-0000-4000-8000-000000000002');
 if r#>>'{declaration,referenceStatus}'<>'draft' or r#>>'{incident,reviewState}'<>'open' or r#>>'{incident,support}'<>'supported'
 or jsonb_array_length(r#>'{incident,dispositions}')<>3 or jsonb_array_length(r#>'{incident,witnesses}')<>2 or r#>>'{lastEvaluation,result}'<>'fired'
 or jsonb_array_length(r->'pendingRequests')<>0 or not r ? 'nextDeadline'
 or r#>>'{incident,witnesses,0,support}'<>'unavailable' or r#>>'{incident,witnesses,1,meeting,meeting}'<>'9107'
 or r#>>'{incident,witnesses,1,series,previous}'<>'14' or r#>>'{incident,witnesses,1,series,change}'<>'14.25'
 or r#>>'{incident,witnesses,1,series,evaluationId}'<>r#>>'{lastEvaluation,id}'
 then raise exception 'operator read: %',r;end if;
end $$;

-- 12. Immutability and closed surfaces.
do $$ declare t text;f text;begin
 perform pg_temp.expect(format($q$update private.market_regime_evaluations set result='not_fired' where id=%L$q$,pg_temp.fact('eval1')),'market_record_immutable','evaluation edited');
 perform pg_temp.expect($q$delete from private.market_rg01_runs$q$,'market_record_immutable','runs deleted');
 perform pg_temp.expect($q$update private.market_regime_witness_support set support='supported'$q$,'market_record_immutable','support edited');
 perform pg_temp.expect($q$delete from private.market_regime_dispositions$q$,'market_record_immutable','dispositions deleted');
 perform pg_temp.expect($q$update private.market_copom_calendar_revisions set reason='outra'$q$,'market_record_immutable','calendar edited');
 perform pg_temp.expect(format($q$update private.market_rg01_requests set requested_at=now() where regime_id=%L$q$,pg_temp.fact('regime')),'market_rg01_request_immutable','request edited');
 perform pg_temp.expect(format($q$delete from private.market_rg01_requests where regime_id=%L$q$,pg_temp.fact('regime')),'market_rg01_request_immutable','request deleted');
 perform pg_temp.expect(format($q$update private.market_regime_incidents set review_state='dismissed' where regime_id=%L$q$,pg_temp.fact('regime')),'market_regime_incident_immutable','incident edited without its review');
 perform pg_temp.expect($q$truncate private.market_regime_evaluations cascade$q$,'*','evaluations truncated');
 foreach t in array array['market_copom_calendar_evidence','market_copom_calendar_revisions','market_regime_declarations','market_rg01_requests','market_regime_evaluations',
  'market_rg01_runs','market_regime_incidents','market_regime_witnesses','market_regime_witness_support','market_regime_dispositions'] loop
  if not (select relrowsecurity and relforcerowsecurity from pg_class where oid=('private.'||t)::regclass) then raise exception 'row security off on %',t;end if;
  if has_table_privilege('anon','private.'||t,'select') or has_table_privilege('authenticated','private.'||t,'select') or has_table_privilege('service_role','private.'||t,'select')
  then raise exception 'table % readable by an API role',t;end if;
 end loop;
 foreach f in array array['private.record_market_copom_calendar_v1(uuid,integer,jsonb,text,bytea,text,text,uuid)','private.run_market_rg01_v1(uuid)',
  'private.dispose_market_regime_incident_v1(uuid,text,text,integer,text,text,uuid)','private.market_regime_incident_v1(text,text,uuid)',
  'private.register_market_event_consumer_v2(uuid,text,text[],text[],text,text,uuid)','private.market_rg01_snapshot_v1(uuid,date,timestamp with time zone)',
  'private.market_evaluate_rg01_v1(jsonb)','private.market_selic_selection_v1(date,timestamp with time zone)'] loop
  if has_function_privilege('authenticated',f,'execute') or has_function_privilege('anon',f,'execute') or has_function_privilege('service_role',f,'execute')
  then raise exception '% executable by an API role',f;end if;
 end loop;
 foreach f in array array['public.worker_run_rg01_event_v1(text,bigint,text,uuid)','public.worker_schedule_rg01_v1(text)','public.worker_evaluate_rg01_v1(text)'] loop
  if not has_function_privilege('authenticated',f,'execute') or has_function_privilege('anon',f,'execute') then raise exception '% grants',f;end if;
 end loop;
 if public.worker_runtime_schema_contract_v1()::text not like '%market-regime-monitor.v1%' then raise exception 'capability not announced';end if;
end $$;
select 'market_rg01_monitor' as test,'PASS' as result;
rollback;
