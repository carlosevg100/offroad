-- Market reference M2, part 6 (ADR 0023; docs/build/market-reference/M2-PARTE-6.md): the RG-01 monitor. The
-- Copom calendar, the declaration of the regime it watches, one selection for publication and monitor, a
-- snapshot taken by one statement, the evaluator, the incident with its witnesses and the operator's review,
-- and the worker's entries. Nothing here registers a consumer, records a calendar or opens the transport:
-- the monitor stays off until the acts of part 4.

-- 1. Business days and the freshness deadline of decision 5: the second business day after the first
-- business day strictly after the meeting's end (national holidays of the normalization's calendar).
create function private.market_business_day_after_v1(p date,p_n integer) returns date
language plpgsql immutable set search_path='' as $$
declare d date:=p;i integer;begin
 for i in 1..p_n loop d:=private.market_next_business_day_v1(d);end loop;
 return d;
end $$;
create function private.market_freshness_deadline_v1(p date) returns date
language sql immutable set search_path='' as $$ select private.market_business_day_after_v1(p,3); $$;

-- 2. The manifest of a reading, the SQL twin of manifestSha256 (market-manifest.v1).
create function private.market_manifest_sha256_v1(p_logical text,p_data_base date,p_knowledge timestamptz,p_start date,p_end date,p_entries text[]) returns text
language sql stable set search_path='' as $$
 select encode(extensions.digest(convert_to(array_to_string(array['market-manifest.v1','object:'||p_logical,'data-base:'||to_char(p_data_base,'YYYY-MM-DD'),
  'knowledge:'||private.market_instant_text_v1(p_knowledge),'window:'||to_char(p_start,'YYYY-MM-DD')||'..'||to_char(p_end,'YYYY-MM-DD')]||coalesce(p_entries,'{}'),E'\n'),'UTF8'),'sha256'),'hex');
$$;

-- 3. The Copom calendar: the ordinary meetings of a year, by operator command with a receipt and the
-- captured page as evidence (bytes kept in the database, at most 1 MiB). The highest revision of a year holds.
create table private.market_copom_calendar_evidence(
 sha256 text primary key check(sha256 ~ '^[a-f0-9]{64}$'),
 media_type text not null check(media_type in ('text/html','application/pdf')),
 bytes bytea not null check(octet_length(bytes) between 1 and 1048576),
 recorded_at timestamptz not null default clock_timestamp(),
 check(encode(extensions.digest(bytes,'sha256'),'hex')=sha256));

create table private.market_copom_calendar_revisions(
 year integer not null check(year between 2021 and 2100),
 revision integer not null check(revision>0),
 meetings jsonb not null check(jsonb_typeof(meetings)='array' and jsonb_array_length(meetings) between 1 and 12),
 evidence_url text not null check(evidence_url ~ '^https://www\.bcb\.gov\.br/'),
 evidence_sha256 text not null references private.market_copom_calendar_evidence(sha256),
 reason text not null check(length(btrim(reason)) between 5 and 500),
 command_id uuid not null unique,
 fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'),
 recorded_by uuid not null references auth.users(id),
 recorded_at timestamptz not null default clock_timestamp(),
 primary key(year,revision));
create index market_copom_calendar_revisions_by on private.market_copom_calendar_revisions(recorded_by);
create index market_copom_calendar_revisions_evidence on private.market_copom_calendar_revisions(evidence_sha256);

create function private.record_market_copom_calendar_v1(p_command uuid,p_year integer,p_meetings jsonb,p_evidence_url text,p_evidence bytea,p_media_type text,p_reason text,p_actor uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare prior private.market_copom_calendar_revisions;fp text;sha text;n integer;begin
 perform private.market_require_read_committed_v1();
 perform private.require_platform_principal_v1(p_actor);
 if p_command is null or p_year is null or p_meetings is null or jsonb_typeof(p_meetings)<>'array' or p_evidence is null or p_reason is null
 then raise exception 'market_calendar_invalid' using errcode='22023';end if;
 -- Each meeting: ordinal 1..12 in order, two consecutive days inside the year, ascending.
 if exists(select 1 from jsonb_array_elements(p_meetings) with ordinality x(m,o)
   where jsonb_typeof(m)<>'object' or (select array_agg(k order by k) from jsonb_object_keys(m) k) is distinct from array['firstDay','ordinal','secondDay']
   or jsonb_typeof(m->'ordinal')<>'number' or (m->>'ordinal')::numeric<>o or not private.market_real_date_any_v1(m->>'firstDay')
   or not private.market_real_date_any_v1(m->>'secondDay') or (m->>'secondDay')::date<>(m->>'firstDay')::date+1
   or extract(year from (m->>'firstDay')::date)<>p_year or extract(year from (m->>'secondDay')::date)<>p_year)
 or exists(select 1 from jsonb_array_elements(p_meetings) with ordinality a(m,o) join jsonb_array_elements(p_meetings) with ordinality b(n2,o2) on o2=o+1
   where (n2->>'firstDay')::date<=(m->>'secondDay')::date)
 then raise exception 'market_calendar_invalid' using errcode='22023';end if;
 sha:=encode(extensions.digest(p_evidence,'sha256'),'hex');
 fp:=encode(extensions.digest(convert_to(concat_ws(E'\n','calendar',p_year::text,p_meetings::text,p_evidence_url,sha,p_media_type,btrim(p_reason),p_actor::text),'UTF8'),'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended('platform-command:'||p_command::text,0));
 select * into prior from private.market_copom_calendar_revisions where command_id=p_command;
 if found then
  if prior.fingerprint<>fp then raise exception 'platform_method_request_reused' using errcode='22023';end if;
  return jsonb_build_object('year',prior.year,'revision',prior.revision,'replayed',true);
 end if;
 perform pg_advisory_xact_lock(hashtextextended('market-copom-calendar:'||p_year::text,0));
 insert into private.market_copom_calendar_evidence(sha256,media_type,bytes) values(sha,p_media_type,p_evidence) on conflict (sha256) do nothing;
 select coalesce(max(revision),0)+1 into n from private.market_copom_calendar_revisions where year=p_year;
 insert into private.market_copom_calendar_revisions(year,revision,meetings,evidence_url,evidence_sha256,reason,command_id,fingerprint,recorded_by)
 values(p_year,n,p_meetings,p_evidence_url,sha,btrim(p_reason),p_command,fp,p_actor);
 return jsonb_build_object('year',p_year,'revision',n,'replayed',false);
end $$;

-- 4. The declaration of the regime the monitor reads: the RG-01 projection of policy.pricing.regime in
-- market-policy.v1 text, pinned by this migration and checked by a test of the package. One active per
-- regime and trigger.
create table private.market_regime_declarations(
 id uuid primary key,
 policy_id text not null,
 policy_version text not null,
 regime_id text not null check(regime_id ~ '^brl-[a-z0-9-]+-[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
 trigger_id text not null check(trigger_id='RG-01'),
 rule text not null check(rule='market-rg01.v1'),
 projection_text text not null,
 projection_sha256 text not null check(projection_sha256 ~ '^[a-f0-9]{64}$'),
 active boolean not null,
 superseded_by uuid references private.market_regime_declarations(id),
 created_at timestamptz not null default clock_timestamp(),
 check(encode(extensions.digest(convert_to(projection_text,'UTF8'),'sha256'),'hex')=projection_sha256),
 check(right(projection_text,1)=chr(10)),
 check((projection_text::jsonb)->>'regime'=regime_id and (projection_text::jsonb)->>'policyId'=policy_id
   and (projection_text::jsonb)->>'policyVersion'=policy_version and (projection_text::jsonb)#>>'{trigger,id}'=trigger_id),
 check(active=(superseded_by is null)));
create unique index market_regime_declarations_active on private.market_regime_declarations(regime_id,trigger_id) where active;
create index market_regime_declarations_superseded on private.market_regime_declarations(superseded_by);

-- A declaration's cycle must hold together: start, step, cuts, cumulative change and final target.
create function private.guard_market_regime_declaration_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare p jsonb;c jsonb;begin
 if tg_op='UPDATE' and old.active and not new.active and new.superseded_by is not null
 and (to_jsonb(new)-array['active','superseded_by']) is not distinct from (to_jsonb(old)-array['active','superseded_by']) then return new;end if;
 if tg_op<>'INSERT' then raise exception 'market_regime_declaration_immutable' using errcode='23514';end if;
 p:=new.projection_text::jsonb;c:=p->'easingCycle';
 if private.market_policy_canonical_v1(p)||chr(10)<>new.projection_text
 or jsonb_typeof(c->'copomDecisions')<>'array' or jsonb_array_length(c->'copomDecisions')<>(c->>'cuts')::int
 or (c->>'stepBps')::int*(c->>'cuts')::int<>-(c->>'cumulativeBps')::int
 or (c->>'fromPct')::numeric+(c->>'cumulativeBps')::numeric/100<>(p->>'selicTargetPct')::numeric
 or (c->>'effectiveNextDay')::boolean is not true
 then raise exception 'market_regime_declaration_invalid' using errcode='23514';end if;
 return new;
end $$;
create trigger market_regime_declarations_guard before insert or update or delete on private.market_regime_declarations for each row execute function private.guard_market_regime_declaration_v1();

-- market-policy.v1: the market-odbl.v1 bytes with JSON integers written as decimal text; a fraction is refused.
create function private.market_policy_canonical_v1(p jsonb) returns text
language plpgsql immutable set search_path='' as $$
declare t text;begin
 case jsonb_typeof(p)
 when 'object' then
  select '{'||coalesce(string_agg(private.market_odbl_string_v1(k)||':'||private.market_policy_canonical_v1(v),',' order by k collate "C"),'')||'}' into t from jsonb_each(p) x(k,v);
  return t;
 when 'array' then
  select '['||coalesce(string_agg(private.market_policy_canonical_v1(e),',' order by o),'')||']' into t from jsonb_array_elements(p) with ordinality x(e,o);
  return t;
 when 'string' then return private.market_odbl_string_v1(p#>>'{}');
 when 'boolean' then return p::text;
 when 'null' then return 'null';
 else
  if p::text !~ '^-?(0|[1-9][0-9]{0,17})$' then raise exception 'market_policy_fraction_not_allowed' using errcode='22023';end if;
  return p::text;
 end case;
end $$;

-- 5. One selection for publication and monitor: per chain of the SGS 432 object, the latest version
-- recorded by K whose evidence was available for D, readable in mode consume; per period the most recent
-- acquisition, ties by the greater version id. Stable: inside one statement it reads that statement's snapshot.
create function private.market_selic_selection_v1(p_data_base date,p_knowledge timestamptz)
returns table(period date,value numeric,version_id uuid,acquisition_id uuid,acquired_at timestamptz,normalization_id text)
language sql stable security definer set search_path='' as $$
 with nz as (select * from private.market_normalizations where endpoint_contract_id='bcb-sgs-432-endpoint' order by ordinal desc limit 1),
 ec as (select e.* from private.market_endpoint_contracts e join nz on e.id=nz.endpoint_contract_id),
 cand as (select distinct on (v.acquisition_id) v.id from private.market_versions v
  join private.market_normalizations vn on vn.id=v.normalization_id
  where v.canonical_version='v2' and v.logical_id=(select logical_id from nz) and vn.endpoint_contract_id=(select id from ec)
  and v.recorded_at<=p_knowledge and v.evidence_available_at<private.market_data_base_limit_v1(p_data_base)
  order by v.acquisition_id,v.recorded_at desc,v.id desc)
 select distinct on (o.period_end) o.period_end,o.value,v.id,v.acquisition_id,a.acquired_at,v.normalization_id
 from cand u join private.market_versions v on v.id=u.id join private.market_acquisitions a on a.id=v.acquisition_id
 join private.market_observations o on o.version_id=v.id
 where private.market_version_readable_v1(v.id,'consume') and o.period_end>=(select homologated_from from ec) and o.period_end<=p_data_base
 and o.acquired_at<private.market_data_base_limit_v1(p_data_base)
 order by o.period_end,a.acquired_at desc,v.id::text collate "C" desc;
$$;

-- The versions and acquisitions a reading at (D, K) may depend on, to lock before the snapshot.
create function private.market_selic_candidates_v1(p_data_base date,p_knowledge timestamptz,out versions uuid[],out acquisitions uuid[])
language sql stable security definer set search_path='' as $$
 with nz as (select * from private.market_normalizations where endpoint_contract_id='bcb-sgs-432-endpoint' order by ordinal desc limit 1),
 cand as (select distinct on (v.acquisition_id) v.id from private.market_versions v
  join private.market_normalizations vn on vn.id=v.normalization_id
  where v.canonical_version='v2' and v.logical_id=(select logical_id from nz) and vn.endpoint_contract_id=(select endpoint_contract_id from nz)
  and v.recorded_at<=p_knowledge and v.evidence_available_at<private.market_data_base_limit_v1(p_data_base)
  order by v.acquisition_id,v.recorded_at desc,v.id desc)
 select coalesce(array_agg(distinct c.version_id),'{}'),coalesce(array_agg(distinct c.acquisition_id) filter (where c.acquisition_id is not null),'{}')
 from cand u cross join lateral private.market_version_closure_v1(u.id) c;
$$;

-- 6. The monitor's tables.
create table private.market_rg01_requests(
 regime_id text not null,
 trigger_id text not null,
 key text not null check(key ~ '^(event:[a-z0-9][a-z0-9._-]{0,79}:[0-9]{1,19}|hour:[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}|deadline:[0-9]{4}-[0-9]{2}-[0-9]{2}|declaration:[0-9a-f-]{36})$'),
 requested_at timestamptz not null default clock_timestamp(),
 satisfied_by uuid,
 satisfied_at timestamptz,
 primary key(regime_id,trigger_id,key),
 check((satisfied_by is null)=(satisfied_at is null)));
create index market_rg01_requests_pending on private.market_rg01_requests(regime_id,trigger_id) where satisfied_by is null;

create table private.market_regime_evaluations(
 id uuid primary key,
 declaration_id uuid not null references private.market_regime_declarations(id),
 regime_id text not null,
 trigger_id text not null,
 data_base date not null,
 knowledge_at timestamptz not null,
 snapshot jsonb not null,
 evaluation jsonb not null,
 audit_sha256 text not null check(audit_sha256 ~ '^[a-f0-9]{64}$'),
 state_sha256 text not null check(state_sha256 ~ '^[a-f0-9]{64}$'),
 result text not null check(result in ('fired','pending_confirmation','not_fired','incomplete')),
 freshness text not null check(freshness in ('current','stale','absent')),
 created_at timestamptz not null default clock_timestamp());
create index market_regime_evaluations_regime on private.market_regime_evaluations(regime_id,trigger_id,created_at desc);
create index market_regime_evaluations_declaration on private.market_regime_evaluations(declaration_id);
alter table private.market_rg01_requests add constraint market_rg01_requests_satisfied_by_fkey foreign key(satisfied_by) references private.market_regime_evaluations(id);
create index market_rg01_requests_satisfied_by on private.market_rg01_requests(satisfied_by);

create table private.market_rg01_runs(
 id uuid primary key,
 regime_id text not null,
 trigger_id text not null,
 ran_at timestamptz not null default clock_timestamp(),
 evaluation_id uuid not null references private.market_regime_evaluations(id),
 reused boolean not null,
 request_keys text[] not null);
create index market_rg01_runs_regime on private.market_rg01_runs(regime_id,trigger_id,ran_at desc);
create index market_rg01_runs_evaluation on private.market_rg01_runs(evaluation_id);

create table private.market_regime_incidents(
 regime_id text not null,
 trigger_id text not null,
 opened_at timestamptz not null default clock_timestamp(),
 opened_by_evaluation uuid not null references private.market_regime_evaluations(id),
 review_due_on date not null,
 review_state text not null check(review_state in ('open','review_opened','review_concluded','dismissed')),
 review_revision integer not null check(review_revision>=0),
 primary key(regime_id,trigger_id));
create index market_regime_incidents_evaluation on private.market_regime_incidents(opened_by_evaluation);

create table private.market_regime_witnesses(
 regime_id text not null,
 trigger_id text not null,
 meeting_end date not null,
 first_seen_evaluation uuid not null references private.market_regime_evaluations(id),
 primary key(regime_id,trigger_id,meeting_end),
 foreign key(regime_id,trigger_id) references private.market_regime_incidents(regime_id,trigger_id));
create index market_regime_witnesses_evaluation on private.market_regime_witnesses(first_seen_evaluation);

create table private.market_regime_witness_support(
 regime_id text not null,
 trigger_id text not null,
 meeting_end date not null,
 revision integer not null check(revision>0),
 evaluation_id uuid not null references private.market_regime_evaluations(id),
 support text not null check(support in ('supported','unavailable')),
 recorded_at timestamptz not null default clock_timestamp(),
 primary key(regime_id,trigger_id,meeting_end,revision),
 foreign key(regime_id,trigger_id,meeting_end) references private.market_regime_witnesses(regime_id,trigger_id,meeting_end));
create index market_regime_witness_support_evaluation on private.market_regime_witness_support(evaluation_id);

create table private.market_regime_dispositions(
 id uuid primary key,
 regime_id text not null,
 trigger_id text not null,
 command_id uuid unique,
 fingerprint text check(fingerprint is null or fingerprint ~ '^[a-f0-9]{64}$'),
 from_state text not null,
 to_state text not null check(to_state in ('open','review_opened','review_concluded','dismissed')),
 revision_after integer not null,
 reason text not null check(length(btrim(reason)) between 5 and 1000),
 actor_user_id uuid references auth.users(id),
 evaluation_id uuid references private.market_regime_evaluations(id),
 recorded_at timestamptz not null default clock_timestamp(),
 foreign key(regime_id,trigger_id) references private.market_regime_incidents(regime_id,trigger_id),
 check((command_id is null)=(actor_user_id is null) and (command_id is null)=(fingerprint is null) and (command_id is null)=(evaluation_id is not null)));
create index market_regime_dispositions_incident on private.market_regime_dispositions(regime_id,trigger_id,recorded_at);
create index market_regime_dispositions_actor on private.market_regime_dispositions(actor_user_id);
create index market_regime_dispositions_evaluation on private.market_regime_dispositions(evaluation_id);

-- Requests change only from pending to satisfied; incidents only through their review fields.
create function private.guard_market_rg01_request_v1() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and old.satisfied_by is null and new.satisfied_by is not null
 and (to_jsonb(new)-array['satisfied_by','satisfied_at']) is not distinct from (to_jsonb(old)-array['satisfied_by','satisfied_at']) then return new;end if;
 raise exception 'market_rg01_request_immutable' using errcode='23514';
end $$;
create trigger market_rg01_requests_guard before update or delete on private.market_rg01_requests for each row execute function private.guard_market_rg01_request_v1();

create function private.guard_market_regime_incident_v1() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and new.review_revision=old.review_revision+1
 and (to_jsonb(new)-array['review_state','review_revision','review_due_on']) is not distinct from (to_jsonb(old)-array['review_state','review_revision','review_due_on'])
 then return new;end if;
 raise exception 'market_regime_incident_immutable' using errcode='23514';
end $$;
create trigger market_regime_incidents_guard before update or delete on private.market_regime_incidents for each row execute function private.guard_market_regime_incident_v1();
create trigger market_regime_evaluations_immutable before update or delete on private.market_regime_evaluations for each row execute function private.market_reject_change_v1();
create trigger market_rg01_runs_immutable before update or delete on private.market_rg01_runs for each row execute function private.market_reject_change_v1();
create trigger market_regime_witnesses_immutable before update or delete on private.market_regime_witnesses for each row execute function private.market_reject_change_v1();
create trigger market_regime_witness_support_immutable before update or delete on private.market_regime_witness_support for each row execute function private.market_reject_change_v1();
create trigger market_regime_dispositions_immutable before update or delete on private.market_regime_dispositions for each row execute function private.market_reject_change_v1();
create trigger market_copom_calendar_revisions_immutable before update or delete on private.market_copom_calendar_revisions for each row execute function private.market_reject_change_v1();
create trigger market_copom_calendar_evidence_immutable before update or delete on private.market_copom_calendar_evidence for each row execute function private.market_reject_change_v1();

-- 7. The snapshot of an evaluation, one statement: selection, meetings with their communiqué and the two
-- series days around the change, baseline, calendars, declaration, pending requests and dependencies.
create function private.market_rg01_snapshot_v1(p_declaration uuid,p_data_base date,p_knowledge timestamptz) returns jsonb
language sql stable security definer set search_path='' as $$
 with decl as (select * from private.market_regime_declarations where id=p_declaration),
 pj as (select projection_text::jsonb p from decl),
 cyc as (select p->'easingCycle' c from pj),
 dec_dates as (select x::date d from cyc,jsonb_array_elements_text(c->'copomDecisions') x),
 first_dec as (select min(d) d from dec_dates),
 nz as (select * from private.market_normalizations where endpoint_contract_id='bcb-sgs-432-endpoint' order by ordinal desc limit 1),
 ec as (select e.* from private.market_endpoint_contracts e join nz on e.id=nz.endpoint_contract_id),
 sel as (select * from private.market_selic_selection_v1(p_data_base,p_knowledge)),
 years as (select generate_series(extract(year from (select (c->>'startedOn')::date from cyc))::int,extract(year from p_data_base)::int) y),
 cal as (select distinct on (r.year) r.year,r.revision,r.meetings from private.market_copom_calendar_revisions r
  where r.year in (select y from years) and r.recorded_at<=p_knowledge order by r.year,r.revision desc),
 cal_meetings as (select (m->>'secondDay')::date end_date from cal,jsonb_array_elements(cal.meetings) m),
 comm as (select * from private.market_copom_meetings where reference_acquired_at<=p_knowledge),
 ends as (
  select end_date,'ordinary'::text kind from cal_meetings where end_date>=(select d from first_dec) and end_date<=p_data_base
  union select d,'ordinary' from dec_dates where d<=p_data_base
  union select c.reference_date,'extraordinary' from comm c where c.reference_date>=(select d from first_dec) and c.reference_date<=p_data_base
   and c.reference_date not in (select end_date from cal_meetings) and c.reference_date not in (select d from dec_dates)),
 mt as (select e.end_date,e.kind,c.meeting,c.decision,c.target_pct,c.reference_acquisition_id,c.record_sha256,
   (select s.value from sel s where s.period=e.end_date) prev,(select s.value from sel s where s.period=e.end_date+1) chg
  from ends e left join comm c on c.reference_date=e.end_date)
 select jsonb_build_object(
  'dataBase',to_char(p_data_base,'YYYY-MM-DD'),
  'knowledgeAt',private.market_instant_text_v1(p_knowledge),
  'declaration',(select jsonb_build_object('id',d.id::text,'sha256',d.projection_sha256,'rule',d.rule,'regimeId',d.regime_id,'triggerId',d.trigger_id,
   'cycle',jsonb_build_object('decisions',c->'copomDecisions','fromPct',c->>'fromPct','finalPct',(select p->>'selicTargetPct' from pj),
    'stepBps',(c->>'stepBps')::int,'cuts',(c->>'cuts')::int,'cumulativeBps',(c->>'cumulativeBps')::int)) from decl d,cyc),
  'calendarYearsRequired',(select jsonb_agg(y order by y) from years),
  'calendarYearsPresent',coalesce((select jsonb_agg(year order by year) from cal),'[]'),
  'calendarRevisions',coalesce((select jsonb_agg(jsonb_build_object('year',year,'revision',revision) order by year) from cal),'[]'),
  'rules',jsonb_build_object('evaluator','market-rg01.v1','freshness','market-freshness.v1','holidays',(select calendar from nz)),
  'selectionEntries',(select count(*) from sel),
  'entriesSha256',encode(extensions.digest(convert_to(coalesce((select string_agg(to_char(s.period,'YYYY-MM-DD')||'|'||s.version_id::text,E'\n' order by s.period) from sel s),''),'UTF8'),'sha256'),'hex'),
  'lastCoveredPeriod',(select to_char(max(s.period),'YYYY-MM-DD') from sel s),
  'manifestSha256',private.market_manifest_sha256_v1((select logical_id from nz),p_data_base,p_knowledge,(select homologated_from from ec),p_data_base,
   (select array_agg(to_char(s.period,'YYYY-MM-DD')||'|'||s.version_id::text order by s.period) from sel s)),
  'meetings',coalesce((select jsonb_agg(jsonb_build_object('endDate',to_char(m.end_date,'YYYY-MM-DD'),'kind',m.kind,
    'communique',case when m.meeting is null then null else jsonb_build_object('meeting',m.meeting,'decision',m.decision,'targetPct',m.target_pct,
     'readable',private.market_acquisition_readable_v1(m.reference_acquisition_id),
     'disputed',exists(select 1 from private.market_acquisition_jobs j where j.contract_id='bcb-copom-comunicados-detalhe' and j.status='failed'
      and j.last_error->>'code'='meeting_disagreement' and j.request->>'meeting'=m.meeting::text and j.updated_at<=p_knowledge),
     'acquisitionId',m.reference_acquisition_id::text,'recordSha256',m.record_sha256) end,
    'previous',case when m.prev is null then null else private.market_trim_decimal_v1(m.prev::text) end,
    'change',case when m.chg is null then null else private.market_trim_decimal_v1(m.chg::text) end) order by m.end_date) from mt m),'[]'),
  'requests',coalesce((select jsonb_agg(q.key order by q.key collate "C") from private.market_rg01_requests q,decl d
   where q.regime_id=d.regime_id and q.trigger_id=d.trigger_id and q.satisfied_by is null),'[]'),
  'dependencies',jsonb_build_object(
   'versions',coalesce((select jsonb_agg(distinct s.version_id::text) from sel s),'[]'),
   'acquisitions',coalesce((select jsonb_agg(distinct x) from (select s.acquisition_id::text x from sel s union select m.reference_acquisition_id::text from mt m where m.reference_acquisition_id is not null) z),'[]')));
$$;

-- 8. The evaluator (market-rg01.v1), twin of evaluateRg01 in packages/credit-playbook: one state per meeting
-- (a dispute wins over agreeing evidence), the witness set, the result, freshness, the baseline check and the
-- semantic state text.
create function private.market_evaluate_rg01_v1(s jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare d text:=s->>'dataBase';cyc jsonb:=s#>'{declaration,cycle}';last_dec text;m jsonb;c jsonb;st text;p numeric;n numeric;t numeric;ok boolean;
 mrows jsonb:='[]';r jsonb;gaps text[]:='{}';wit text[]:='{}';contra text[]:='{}';missing int[];result text;fresh text;entries int:=(s->>'selectionEntries')::int;
 total numeric:=0;step numeric;first_row jsonb;last_row jsonb;dd text;lines text[];txt text;has_base_issue boolean;begin
 select max(x) into last_dec from jsonb_array_elements_text(cyc->'decisions') x;
 select coalesce(array_agg(y::int order by y::int),'{}') into missing from jsonb_array_elements_text(s->'calendarYearsRequired') y
  where not (s->'calendarYearsPresent') @> jsonb_build_array(y::int);
 for m in select x from jsonb_array_elements(s->'meetings') x order by x->>'endDate' collate "C" loop
  c:=case when jsonb_typeof(m->'communique')='object' then m->'communique' end;
  if c is not null and (c->>'disputed')::boolean then st:='disputed';
  elsif c is not null and not (c->>'readable')::boolean then st:='unavailable';
  elsif c is null then st:='missing';
  elsif jsonb_typeof(m->'previous') is distinct from 'string' or jsonb_typeof(m->'change') is distinct from 'string' then st:='awaiting_series';
  else
   p:=(m->>'previous')::numeric;n:=(m->>'change')::numeric;t:=(c->>'targetPct')::numeric;
   ok:=(case c->>'decision' when 'raise' then n>p when 'cut' then n<p else n=p end) and n=t;
   st:=case when ok then 'corroborated' else 'series_disagreement' end;
  end if;
  mrows:=mrows||jsonb_build_array(jsonb_build_object('endDate',m->>'endDate','state',st,
   'deadline',to_char(private.market_freshness_deadline_v1((m->>'endDate')::date),'YYYY-MM-DD'),
   'relevant',(m->>'endDate') collate "C">last_dec collate "C" and (m->>'endDate') collate "C"<=d collate "C",
   'baseline',(cyc->'decisions') ? (m->>'endDate'),'decision',c->>'decision','previous',m->'previous','change',m->'change'));
 end loop;
 gaps:=gaps||(select coalesce(array_agg('calendar_missing:'||y),'{}') from unnest(missing) y);
 if entries=0 then gaps:=gaps||'series_absent'::text;end if;
 for r in select x from jsonb_array_elements(mrows) x where (x->>'relevant')::boolean loop
  if r->>'state'<>'corroborated' then
   gaps:=gaps||(case r->>'state' when 'missing' then 'communique_missing' when 'awaiting_series' then 'series_pending'
    when 'series_disagreement' then 'series_disagreement' when 'unavailable' then 'communique_unavailable' else 'meeting_disputed' end)||':'||(r->>'endDate');
  end if;
  if r->>'decision'='raise' and r->>'state'='corroborated' then wit:=wit||(r->>'endDate');end if;
 end loop;
 if cardinality(wit)>0 then result:='fired';
 elsif exists(select 1 from jsonb_array_elements(mrows) x where (x->>'relevant')::boolean and x->>'decision'='raise' and x->>'state'='awaiting_series') then result:='pending_confirmation';
 elsif cardinality(missing)=0 and entries>0 and not exists(select 1 from jsonb_array_elements(mrows) x where (x->>'relevant')::boolean and x->>'state'<>'corroborated') then result:='not_fired';
 else result:='incomplete';end if;
 fresh:=case when entries=0 then 'absent'
  when cardinality(missing)>0 or exists(select 1 from jsonb_array_elements(mrows) x where (x->>'relevant')::boolean
   and (x->>'deadline') collate "C"<d collate "C" and x->>'state'<>'corroborated') then 'stale' else 'current' end;
 -- Baseline.
 for dd in select x from jsonb_array_elements_text(cyc->'decisions') x loop
  select x into r from jsonb_array_elements(mrows) x where x->>'endDate'=dd and (x->>'baseline')::boolean;
  if r is null or r->>'state'<>'corroborated' or r->>'decision' is distinct from 'cut' then contra:=contra||('baseline_meeting:'||dd);end if;
 end loop;
 if jsonb_array_length(cyc->'decisions')<>(cyc->>'cuts')::int then contra:=contra||'baseline_count'::text;end if;
 has_base_issue:=exists(select 1 from unnest(contra) x where x like 'baseline_meeting:%');
 if not has_base_issue then
  select x into first_row from jsonb_array_elements(mrows) x where x->>'endDate'=cyc->'decisions'->>0;
  if (first_row->>'previous')::numeric<>(cyc->>'fromPct')::numeric then contra:=contra||'baseline_from'::text;end if;
  for dd in select x from jsonb_array_elements_text(cyc->'decisions') x loop
   select x into r from jsonb_array_elements(mrows) x where x->>'endDate'=dd;
   step:=((r->>'previous')::numeric-(r->>'change')::numeric)*100;total:=total+step;
   if step<>(cyc->>'stepBps')::numeric then contra:=contra||('baseline_step:'||dd);end if;
  end loop;
  select x into last_row from jsonb_array_elements(mrows) x where x->>'endDate'=cyc->'decisions'->>(jsonb_array_length(cyc->'decisions')-1);
  if (last_row->>'change')::numeric<>(cyc->>'finalPct')::numeric then contra:=contra||'baseline_final'::text;end if;
  if -total<>(cyc->>'cumulativeBps')::numeric then contra:=contra||'baseline_cumulative'::text;end if;
 end if;
 select coalesce(array_agg(x order by x collate "C"),'{}') into gaps from unnest(gaps) x;
 select coalesce(array_agg(x order by x collate "C"),'{}') into contra from unnest(contra) x;
 lines:=array['market-rg01-state.v1','declaration:'||(s#>>'{declaration,id}'),'result:'||result,'freshness:'||fresh,'primary:'||coalesce(wit[1],'')]
  ||(select coalesce(array_agg('witness:'||w order by o),'{}') from unnest(wit) with ordinality u(w,o))
  ||(select coalesce(array_agg('meeting:'||(x->>'endDate')||'|'||(x->>'state') order by o),'{}') from jsonb_array_elements(mrows) with ordinality u(x,o)
     where (x->>'relevant')::boolean or (x->>'baseline')::boolean)
  ||(select coalesce(array_agg('gap:'||g order by g collate "C"),'{}') from unnest(gaps) g)
  ||(select coalesce(array_agg('baseline:'||b order by b collate "C"),'{}') from unnest(contra) b)
  ||array['entries:'||(s->>'entriesSha256')];
 txt:=array_to_string(lines,E'\n');
 return jsonb_build_object('result',result,'freshness',fresh,'primaryWitness',to_jsonb(wit[1]),'witnesses',to_jsonb(wit),
  'meetings',(select coalesce(jsonb_agg(jsonb_build_object('endDate',x->>'endDate','state',x->>'state','deadline',x->>'deadline',
    'relevant',(x->>'relevant')::boolean,'baseline',(x->>'baseline')::boolean) order by o),'[]') from jsonb_array_elements(mrows) with ordinality u(x,o)),
  'gaps',to_jsonb(gaps),'baselineContradictions',to_jsonb(contra),'stateText',txt,
  'stateSha256',encode(extensions.digest(convert_to(txt,'UTF8'),'sha256'),'hex'));
end $$;

-- 9. The evaluation: under the door and a try-lock of the regime, at the current D and K; candidates are
-- locked before the snapshot, and a snapshot that depends on anything outside the locked set answers retry
-- without writing. A semantic state equal to the last one reuses that evaluation; requests seen by the
-- snapshot, and only those, are acknowledged.
create function private.run_market_rg01_v1(p_declaration uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare dl private.market_regime_declarations;k timestamptz;d date;cand record;comm_acq uuid[];snap jsonb;ev jsonb;eid uuid;prev_ev private.market_regime_evaluations;
 reused boolean;keys text[];w text;inc private.market_regime_incidents;new_witness boolean:=false;cur text;rev integer;support text;begin
 perform private.market_require_read_committed_v1();
 select * into dl from private.market_regime_declarations where id=p_declaration and active;
 if not found then raise exception 'market_regime_declaration_inactive' using errcode='22023';end if;
 if dl.rule<>'market-rg01.v1' then raise exception 'market_regime_rule_unsupported' using errcode='22023';end if;
 if not pg_try_advisory_xact_lock(hashtextextended('market-regime:'||dl.regime_id||':'||dl.trigger_id,0)) then return jsonb_build_object('status','busy');end if;
 if not exists(select 1 from private.market_rg01_requests where regime_id=dl.regime_id and trigger_id=dl.trigger_id and satisfied_by is null)
 then return jsonb_build_object('status','idle');end if;
 k:=clock_timestamp();d:=private.market_sao_paulo_date_v1(k);
 select * into cand from private.market_selic_candidates_v1(d,k);
 select coalesce(array_agg(reference_acquisition_id),'{}') into comm_acq from private.market_copom_meetings where reference_acquired_at<=k;
 perform private.lock_market_read_authority_v1(cand.versions,cand.acquisitions||comm_acq);
 snap:=private.market_rg01_snapshot_v1(dl.id,d,k);
 if exists(select 1 from jsonb_array_elements_text(snap#>'{dependencies,versions}') x where not x::uuid=any(cand.versions))
 or exists(select 1 from jsonb_array_elements_text(snap#>'{dependencies,acquisitions}') x where not x::uuid=any(cand.acquisitions||comm_acq))
 then return jsonb_build_object('status','retry');end if;
 ev:=private.market_evaluate_rg01_v1(snap);
 select coalesce(array_agg(x),'{}') into keys from jsonb_array_elements_text(snap->'requests') x;
 select * into prev_ev from private.market_regime_evaluations where regime_id=dl.regime_id and trigger_id=dl.trigger_id order by created_at desc,id desc limit 1;
 reused:=prev_ev.id is not null and prev_ev.state_sha256=ev->>'stateSha256' and prev_ev.declaration_id=dl.id;
 if reused then eid:=prev_ev.id;
 else
  eid:=gen_random_uuid();
  insert into private.market_regime_evaluations(id,declaration_id,regime_id,trigger_id,data_base,knowledge_at,snapshot,evaluation,audit_sha256,state_sha256,result,freshness)
  values(eid,dl.id,dl.regime_id,dl.trigger_id,d,k,snap,ev,encode(extensions.digest(convert_to(snap::text,'UTF8'),'sha256'),'hex'),ev->>'stateSha256',ev->>'result',ev->>'freshness');
  -- Incident: opened by the first witness; every evaluation registers new witnesses and refreshes the
  -- support of every registered one.
  select * into inc from private.market_regime_incidents where regime_id=dl.regime_id and trigger_id=dl.trigger_id;
  if not found and jsonb_array_length(ev->'witnesses')>0 then
   insert into private.market_regime_incidents(regime_id,trigger_id,opened_by_evaluation,review_due_on,review_state,review_revision)
   values(dl.regime_id,dl.trigger_id,eid,private.market_business_day_after_v1(d,((dl.projection_text::jsonb)->>'reviewDeadlineBusinessDays')::int),'open',0)
   returning * into inc;
  end if;
  if inc.regime_id is not null then
   for w in select x from jsonb_array_elements_text(ev->'witnesses') x loop
    if not exists(select 1 from private.market_regime_witnesses where regime_id=dl.regime_id and trigger_id=dl.trigger_id and meeting_end=w::date) then
     insert into private.market_regime_witnesses(regime_id,trigger_id,meeting_end,first_seen_evaluation) values(dl.regime_id,dl.trigger_id,w::date,eid);
     new_witness:=new_witness or inc.opened_by_evaluation<>eid;
    end if;
   end loop;
   for w,cur,rev in select x.meeting_end::text,(select s.support from private.market_regime_witness_support s where s.regime_id=x.regime_id and s.trigger_id=x.trigger_id
     and s.meeting_end=x.meeting_end order by s.revision desc limit 1),(select coalesce(max(s.revision),0) from private.market_regime_witness_support s
     where s.regime_id=x.regime_id and s.trigger_id=x.trigger_id and s.meeting_end=x.meeting_end)
    from private.market_regime_witnesses x where x.regime_id=dl.regime_id and x.trigger_id=dl.trigger_id order by x.meeting_end loop
    support:=case when (ev->'witnesses') ? w then 'supported' else 'unavailable' end;
    if cur is distinct from support then
     insert into private.market_regime_witness_support(regime_id,trigger_id,meeting_end,revision,evaluation_id,support) values(dl.regime_id,dl.trigger_id,w::date,rev+1,eid,support);
    end if;
   end loop;
   -- A new supported witness after a dismissal reopens the review, with a new deadline.
   if new_witness and inc.review_state='dismissed' then
    update private.market_regime_incidents set review_state='open',review_revision=review_revision+1,
     review_due_on=private.market_business_day_after_v1(d,((dl.projection_text::jsonb)->>'reviewDeadlineBusinessDays')::int)
    where regime_id=dl.regime_id and trigger_id=dl.trigger_id returning * into inc;
    insert into private.market_regime_dispositions(id,regime_id,trigger_id,from_state,to_state,revision_after,reason,evaluation_id)
    values(gen_random_uuid(),dl.regime_id,dl.trigger_id,'dismissed','open',inc.review_revision,'Nova testemunha comprovada depois da dispensa',eid);
   end if;
  end if;
 end if;
 update private.market_rg01_requests set satisfied_by=eid,satisfied_at=clock_timestamp()
 where regime_id=dl.regime_id and trigger_id=dl.trigger_id and key=any(keys) and satisfied_by is null;
 insert into private.market_rg01_runs(id,regime_id,trigger_id,evaluation_id,reused,request_keys) values(gen_random_uuid(),dl.regime_id,dl.trigger_id,eid,reused,keys);
 return jsonb_build_object('status','evaluated','evaluationId',eid,'reused',reused,'result',ev->>'result','freshness',ev->>'freshness','requests',to_jsonb(keys));
end $$;

-- 10. The consumer's handler: a consumer registered with handler rg01 is completed only by its own entry.
alter table private.market_event_consumers add column handler text check(handler is null or handler='rg01');
alter table private.market_event_consumer_commands drop constraint market_event_consumer_commands_action_check;
alter table private.market_event_consumer_commands add constraint market_event_consumer_commands_action_check check(action in ('register','disable','update_filter'));

create function private.register_market_event_consumer_v2(p_command uuid,p_consumer text,p_events text[],p_subject_kinds text[],p_handler text,p_reason text,p_actor_user_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare prior private.market_event_consumer_commands;fp text;begin
 perform private.market_require_read_committed_v1();
 perform private.require_platform_principal_v1(p_actor_user_id,true);
 if p_command is null or p_consumer is null or p_events is null or p_subject_kinds is null or p_reason is null or (p_handler is not null and p_handler<>'rg01')
 then raise exception 'market_event_consumer_invalid' using errcode='22023';end if;
 fp:=encode(extensions.digest(convert_to(concat_ws(E'\n','register',p_consumer,array_to_string(array(select x from unnest(p_events) x order by x),','),
  array_to_string(array(select x from unnest(p_subject_kinds) x order by x),','),coalesce(p_handler,''),btrim(p_reason),p_actor_user_id::text),'UTF8'),'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended('platform-command:'||p_command::text,0));
 select * into prior from private.market_event_consumer_commands where command_id=p_command;
 if found then
  if prior.fingerprint<>fp then raise exception 'platform_method_request_reused' using errcode='22023';end if;
  return jsonb_build_object('consumerId',prior.consumer_id,'replayed',true);
 end if;
 perform pg_advisory_xact_lock(hashtextextended('market-event-consumers',0));
 if exists(select 1 from private.market_event_consumers where id=p_consumer) then raise exception 'market_event_consumer_exists' using errcode='23505';end if;
 if p_handler is not null and exists(select 1 from private.market_event_consumers where handler=p_handler and state='enabled')
 then raise exception 'market_event_handler_taken' using errcode='23505';end if;
 insert into private.market_event_consumers(id,events,subject_kinds,state,reason,registered_by,handler)
 values(p_consumer,array(select distinct x from unnest(p_events) x order by x),array(select distinct x from unnest(p_subject_kinds) x order by x),'enabled',btrim(p_reason),p_actor_user_id,p_handler);
 insert into private.market_event_consumer_commands(command_id,consumer_id,action,actor_user_id,fingerprint) values(p_command,p_consumer,'register',p_actor_user_id,fp);
 return jsonb_build_object('consumerId',p_consumer,'replayed',false);
end $$;

-- The generic completion refuses a consumer with a handler.
create or replace function private.worker_complete_market_event_v1(p_consumer text,p_sequence bigint,p_capability text,p_lease uuid,p_effect jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r private.market_event_outbox;rc private.market_event_receipts;sha text;deadline timestamptz;begin
 perform private.market_require_read_committed_v1();
 if exists(select 1 from private.market_event_consumers where id=p_consumer and handler is not null) then raise exception 'market_event_handler_required' using errcode='42501';end if;
 if p_effect is null or jsonb_typeof(p_effect)<>'object' or octet_length(p_effect::text)>65536 then raise exception 'market_event_effect_invalid' using errcode='22023';end if;
 sha:=encode(extensions.digest(convert_to(p_effect::text,'UTF8'),'sha256'),'hex');
 select * into rc from private.market_event_receipts where consumer_id=p_consumer and event_sequence=p_sequence;
 if found then
  if rc.lease_id is distinct from p_lease or rc.account_user_id is distinct from auth.uid() or p_capability is null
  or rc.capability_sha256 is distinct from extensions.digest(p_capability,'sha256') or rc.effect_sha256<>sha
  or not exists(select 1 from private.worker_tokens w where w.id=rc.worker_token_id and w.execution_account_user_id=auth.uid() and w.status='active' and w.revoked_at is null)
  then raise exception 'market_event_lease_denied' using errcode='42501';end if;
  return jsonb_build_object('completed',true,'replayed',true);
 end if;
 r:=private.market_event_for_lease_v1(p_consumer,p_sequence,p_capability,p_lease);
 deadline:=r.lease_expires_at;
 insert into private.market_event_receipts(consumer_id,event_sequence,lease_id,worker_token_id,account_user_id,capability_sha256,effect,effect_sha256)
 values(p_consumer,p_sequence,p_lease,r.leased_by,auth.uid(),r.capability_sha256,p_effect,sha);
 update private.market_event_outbox set status='completed',completed_at=clock_timestamp(),lease_id=null,leased_by=null,leased_account_user_id=null,
  lease_expires_at=null,capability_sha256=null,last_error=null where consumer_id=p_consumer and event_sequence=p_sequence;
 -- No wait extends the lease: the deadline is read after the last write.
 if deadline<=clock_timestamp() then raise exception 'market_event_lease_denied' using errcode='42501';end if;
 return jsonb_build_object('completed',true,'replayed',false);
end $$;

-- 11. The worker's entries. An outbox row of the monitor records a request and its receipt, nothing else.
create function private.worker_run_rg01_event_v1(p_consumer text,p_sequence bigint,p_capability text,p_lease uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r private.market_event_outbox;rc private.market_event_receipts;effect jsonb;sha text;deadline timestamptz;v_key text:='event:'||p_consumer||':'||p_sequence::text;begin
 perform private.market_require_read_committed_v1();
 select * into rc from private.market_event_receipts where consumer_id=p_consumer and event_sequence=p_sequence;
 if found then
  if rc.lease_id is distinct from p_lease or rc.account_user_id is distinct from auth.uid() or p_capability is null
  or rc.capability_sha256 is distinct from extensions.digest(p_capability,'sha256')
  or not exists(select 1 from private.worker_tokens w where w.id=rc.worker_token_id and w.execution_account_user_id=auth.uid() and w.status='active' and w.revoked_at is null)
  then raise exception 'market_event_lease_denied' using errcode='42501';end if;
  return jsonb_build_object('completed',true,'replayed',true);
 end if;
 r:=private.market_event_for_lease_v1(p_consumer,p_sequence,p_capability,p_lease);
 if not exists(select 1 from private.market_event_consumers where id=p_consumer and handler='rg01' and state='enabled') then raise exception 'market_event_handler_mismatch' using errcode='42501';end if;
 insert into private.market_rg01_requests(regime_id,trigger_id,key)
 select regime_id,trigger_id,v_key from private.market_regime_declarations where active on conflict do nothing;
 effect:=jsonb_build_object('handler','rg01','request',v_key);
 sha:=encode(extensions.digest(convert_to(effect::text,'UTF8'),'sha256'),'hex');
 deadline:=r.lease_expires_at;
 insert into private.market_event_receipts(consumer_id,event_sequence,lease_id,worker_token_id,account_user_id,capability_sha256,effect,effect_sha256)
 values(p_consumer,p_sequence,p_lease,r.leased_by,auth.uid(),r.capability_sha256,effect,sha);
 update private.market_event_outbox set status='completed',completed_at=clock_timestamp(),lease_id=null,leased_by=null,leased_account_user_id=null,
  lease_expires_at=null,capability_sha256=null,last_error=null where consumer_id=p_consumer and event_sequence=p_sequence;
 if deadline<=clock_timestamp() then raise exception 'market_event_lease_denied' using errcode='42501';end if;
 return jsonb_build_object('completed',true,'replayed',false,'request',v_key);
end $$;

-- The delegated worker of the monitor's consumer.
create function private.market_rg01_worker_v1(p_worker_token text) returns uuid
language plpgsql security definer set search_path='' as $$
declare worker uuid;consumer text;begin
 worker:=private.market_worker_identity_v1(p_worker_token);
 select id into consumer from private.market_event_consumers where handler='rg01' and state='enabled';
 if consumer is null or not private.market_event_delegation_live_v1(worker,consumer) then return null;end if;
 return worker;
end $$;

-- Requests by schedule: the current hour in São Paulo and the deadline of every relevant meeting already due.
create function private.worker_schedule_rg01_v1(p_worker_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare n integer:=0;m integer;dl record;d date;begin
 perform private.market_require_read_committed_v1();
 if private.market_rg01_worker_v1(p_worker_token) is null then return jsonb_build_object('scheduled',0,'active',false);end if;
 d:=private.market_sao_paulo_date_v1(clock_timestamp());
 for dl in select * from private.market_regime_declarations where active loop
  insert into private.market_rg01_requests(regime_id,trigger_id,key)
  values(dl.regime_id,dl.trigger_id,'hour:'||to_char(clock_timestamp() at time zone 'America/Sao_Paulo','YYYY-MM-DD"T"HH24')) on conflict do nothing;
  get diagnostics m=row_count;n:=n+m;
  insert into private.market_rg01_requests(regime_id,trigger_id,key)
  select dl.regime_id,dl.trigger_id,'deadline:'||to_char(x.end_date,'YYYY-MM-DD')
  from (select (mt->>'secondDay')::date end_date from private.market_copom_calendar_revisions r,jsonb_array_elements(r.meetings) mt
   where r.revision=(select max(r2.revision) from private.market_copom_calendar_revisions r2 where r2.year=r.year)
   union select reference_date from private.market_copom_meetings) x
  where x.end_date>(select max(y::date) from jsonb_array_elements_text((dl.projection_text::jsonb)#>'{easingCycle,copomDecisions}') y)
  and private.market_freshness_deadline_v1(x.end_date)<d on conflict do nothing;
  get diagnostics m=row_count;n:=n+m;
 end loop;
 return jsonb_build_object('scheduled',n,'active',true);
end $$;

create function private.worker_evaluate_rg01_v1(p_worker_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare dl record;acc jsonb:='[]';begin
 perform private.market_require_read_committed_v1();
 if private.market_rg01_worker_v1(p_worker_token) is null then return jsonb_build_object('active',false,'runs','[]'::jsonb);end if;
 for dl in select id from private.market_regime_declarations where active order by regime_id,trigger_id loop
  acc:=acc||jsonb_build_array(private.run_market_rg01_v1(dl.id));
 end loop;
 return jsonb_build_object('active',true,'runs',acc);
end $$;

create function public.worker_run_rg01_event_v1(p_consumer text,p_sequence bigint,p_capability text,p_lease uuid) returns jsonb
language sql security invoker set search_path='' as $$select private.worker_run_rg01_event_v1(p_consumer,p_sequence,p_capability,p_lease);$$;
create function public.worker_schedule_rg01_v1(p_worker_token text) returns jsonb
language sql security invoker set search_path='' as $$select private.worker_schedule_rg01_v1(p_worker_token);$$;
create function public.worker_evaluate_rg01_v1(p_worker_token text) returns jsonb
language sql security invoker set search_path='' as $$select private.worker_evaluate_rg01_v1(p_worker_token);$$;

-- 12. The operator's review: one transition per command, against the expected revision, under the regime lock.
create function private.dispose_market_regime_incident_v1(p_command uuid,p_regime text,p_trigger text,p_expected_revision integer,p_disposition text,p_reason text,p_actor uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare inc private.market_regime_incidents;prior private.market_regime_dispositions;fp text;v_to text;v_from text;begin
 perform private.market_require_read_committed_v1();
 perform private.require_platform_principal_v1(p_actor);
 if p_command is null or p_regime is null or p_trigger is null or p_expected_revision is null or p_reason is null or length(btrim(p_reason))<5
 or p_disposition not in ('review_opened','review_concluded','dismissed') then raise exception 'market_regime_disposition_invalid' using errcode='22023';end if;
 fp:=encode(extensions.digest(convert_to(concat_ws(E'\n','dispose',p_regime,p_trigger,p_expected_revision::text,p_disposition,btrim(p_reason),p_actor::text),'UTF8'),'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended('platform-command:'||p_command::text,0));
 select * into prior from private.market_regime_dispositions where command_id=p_command;
 if found then
  if prior.fingerprint<>fp then raise exception 'platform_method_request_reused' using errcode='22023';end if;
  return jsonb_build_object('reviewState',prior.to_state,'reviewRevision',prior.revision_after,'replayed',true);
 end if;
 perform pg_advisory_xact_lock(hashtextextended('market-regime:'||p_regime||':'||p_trigger,0));
 select * into inc from private.market_regime_incidents where regime_id=p_regime and trigger_id=p_trigger;
 if not found then raise exception 'market_regime_incident_unknown' using errcode='22023';end if;
 if inc.review_revision<>p_expected_revision then raise exception 'market_regime_incident_revision_changed' using errcode='40001';end if;
 v_to:=p_disposition;v_from:=inc.review_state;
 if not ((v_from='open' and v_to in ('review_opened','dismissed')) or (v_from='review_opened' and v_to in ('review_concluded','dismissed')))
 then raise exception 'market_regime_transition_invalid' using errcode='22023';end if;
 update private.market_regime_incidents set review_state=v_to,review_revision=review_revision+1 where regime_id=p_regime and trigger_id=p_trigger returning * into inc;
 insert into private.market_regime_dispositions(id,regime_id,trigger_id,command_id,fingerprint,from_state,to_state,revision_after,reason,actor_user_id)
 values(gen_random_uuid(),p_regime,p_trigger,p_command,fp,v_from,v_to,inc.review_revision,btrim(p_reason),p_actor);
 return jsonb_build_object('reviewState',v_to,'reviewRevision',inc.review_revision,'replayed',false);
end $$;

-- 12b. Publication reads the one selection shared with the monitor.
create or replace function private.publish_market_odbl_release_v1(p_command uuid,p_code_commit text,p_actor_user_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare prior private.market_odbl_releases;prev private.market_odbl_releases;fp text;d date;k timestamptz;lim timestamptz;nz private.market_normalizations;
 ec private.market_endpoint_contracts;src private.market_source_revisions;
 obs jsonb;changes jsonb;alter_ jsonb;payload jsonb;txt text;rid uuid:=gen_random_uuid();num integer;contract_text text;policy_text text;nd private.market_normalizations;defs jsonb:='[]';pick jsonb;cand record;begin
 perform private.market_require_read_committed_v1();
 perform private.require_platform_principal_v1(p_actor_user_id,true);
 if p_command is null or p_code_commit is null or p_code_commit !~ '^[a-f0-9]{40}$' then raise exception 'market_odbl_invalid' using errcode='22023';end if;
 fp:=encode(extensions.digest(convert_to(concat_ws(E'\n','publish',p_code_commit,p_actor_user_id::text),'UTF8'),'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended('platform-command:'||p_command::text,0));
 select * into prior from private.market_odbl_releases where command_id=p_command;
 if found then
  if prior.request_sha256<>fp then raise exception 'platform_method_request_reused' using errcode='22023';end if;
  return jsonb_build_object('releaseNumber',prior.release_number,'sha256',prior.payload_sha256,'replayed',true);
 end if;
 perform private.market_require_read_committed_v1();
 perform pg_advisory_xact_lock(hashtextextended('market-odbl-publication',0));
 -- The newest normalization of the series names the object and the endpoint; versions of every normalization of the same
 -- endpoint and object form the chains.
 select * into strict nz from private.market_normalizations where endpoint_contract_id='bcb-sgs-432-endpoint' order by ordinal desc limit 1;
 select * into strict ec from private.market_endpoint_contracts where id=nz.endpoint_contract_id;
 perform pg_advisory_xact_lock_shared(hashtextextended('market-source:'||ec.source_id,0));
 src:=private.market_source_in_force_v1(ec.source_id);
 if src.source_id is null or not private.market_license_retains_v1(src.license) then raise exception 'market_odbl_source_not_publishable' using errcode='42501';end if;
 k:=clock_timestamp();d:=private.market_sao_paulo_date_v1(k);lim:=private.market_data_base_limit_v1(d);
 -- The one selection shared with the monitor: candidates locked first, then the manifest materialized once.
 select * into cand from private.market_selic_candidates_v1(d,k);
 perform private.lock_market_read_authority_v1(cand.versions,cand.acquisitions);
 select coalesce(jsonb_agg(jsonb_build_object('period',z.period,'value',z.value,'version_id',z.version_id,'acquisition_id',z.acquisition_id,
  'acquired_at',z.acquired_at,'normalization_id',z.normalization_id) order by z.period),'[]') into pick
 from private.market_selic_selection_v1(d,k) z;
 if jsonb_array_length(pick)=0 then raise exception 'market_odbl_nothing_to_publish' using errcode='55000';end if;
 select coalesce(jsonb_agg(jsonb_build_object('period',to_char(p.period,'YYYY-MM-DD'),'value',private.market_trim_decimal_v1(p.value::text),
  'versionId',p.version_id::text,'acquisitionId',p.acquisition_id::text,'normalization',p.normalization_id) order by p.period),'[]') into obs from jsonb_to_recordset(pick) as p(period date,value numeric,version_id uuid,acquisition_id uuid,acquired_at timestamptz,normalization_id text);
 -- Every change of the assembled manifest carries the communiqué of its meeting, in the direction and at
 -- the rate of the change; one without it makes the edition refuse.
 select coalesce(jsonb_agg(jsonb_build_object('period',to_char(p.period,'YYYY-MM-DD'),'from',private.market_trim_decimal_v1(q.value::text),
  'to',private.market_trim_decimal_v1(p.value::text),'meeting',m.meeting::text,'referenceDate',to_char(m.reference_date,'YYYY-MM-DD'),'decision',m.decision,
  'targetPct',private.market_trim_decimal_v1(m.target_pct),'recordSha256',m.record_sha256) order by p.period),'[]') into changes
 from jsonb_to_recordset(pick) as p(period date,value numeric,version_id uuid,acquisition_id uuid,acquired_at timestamptz,normalization_id text) join jsonb_to_recordset(pick) as q(period date,value numeric) on q.period=p.period-1
 left join private.market_copom_meetings m on m.series_change_date=p.period
 where p.value<>q.value;
 if exists(select 1 from jsonb_array_elements(changes) c where c->>'meeting' is null
  or (c->>'decision')<>(case when (c->>'to')::numeric>(c->>'from')::numeric then 'raise' else 'cut' end)
  or (c->>'targetPct')::numeric<>(c->>'to')::numeric
  or not exists(select 1 from jsonb_to_recordset(pick) as p(period date,value numeric,version_id uuid,acquisition_id uuid,acquired_at timestamptz,normalization_id text) join private.market_version_evidence e on e.version_id=p.version_id
    where p.period=(c->>'period')::date and e.meeting=(c->>'meeting')::int))
 then raise exception 'market_odbl_change_without_communique' using errcode='55000';end if;
 -- Each normalization the manifest actually uses is described as data, its contract text rebuilt and
 -- checked against its digest, and its quality policy text with its own digest.
 for nd in select x.* from private.market_normalizations x where x.id in (select distinct p.normalization_id from jsonb_to_recordset(pick) as p(period date,value numeric,version_id uuid,acquisition_id uuid,acquired_at timestamptz,normalization_id text)) order by x.id collate "C" loop
  contract_text:=concat_ws(E'\n','market-series-contract.v1','id:'||nd.id,'host:'||ec.host,'path:'||ec.path,'unit:'||nd.unit,'scale:'||nd.scale,
   'convention:'||nd.convention,'parser:'||nd.parser,'license:'||ec.license_evidence,'homologated-from:'||to_char(ec.homologated_from,'YYYY-MM-DD'),
   'max-window-years:'||ec.max_window_years,'calendar:'||nd.calendar);
  if encode(extensions.digest(convert_to(contract_text,'UTF8'),'sha256'),'hex')<>nd.normalization_sha256 then raise exception 'market_odbl_contract_drift' using errcode='55000';end if;
  policy_text:=private.market_quality_policy_text_v1(nd.quality_policy_id,nd.quality_policy_version);
  if policy_text is null then raise exception 'market_odbl_policy_unknown' using errcode='55000';end if;
  defs:=defs||jsonb_build_array(jsonb_build_object('id',nd.id,'contractSha256',nd.normalization_sha256,'contractText',contract_text,
   'unit',nd.unit,'scale',nd.scale,'convention',nd.convention,'calendar',nd.calendar,'parser',nd.parser,
   'qualityPolicy',jsonb_build_object('id',nd.quality_policy_id,'version',nd.quality_policy_version,'text',policy_text,
    'sha256',encode(extensions.digest(convert_to(policy_text,'UTF8'),'sha256'),'hex'))));
 end loop;
 select * into prev from private.market_odbl_releases order by release_number desc limit 1;
 num:=coalesce(prev.release_number,0)+1;
 if prev.id is null then
  alter_:=jsonb_build_object('previous',null);
 else
  with ol as (select x->>'period' period,x->>'value' value,x->>'versionId' version_id,x->>'acquisitionId' acquisition_id
    from jsonb_array_elements(prev.payload_text::jsonb->'observations') x),
   nw as (select x->>'period' period,x->>'value' value,x->>'versionId' version_id,x->>'acquisitionId' acquisition_id from jsonb_array_elements(obs) x)
  select jsonb_build_object('previous',jsonb_build_object('release',prev.release_number::text,'sha256',prev.payload_sha256),
   'added',coalesce((select jsonb_agg(n.period order by n.period) from nw n where not exists(select 1 from ol o where o.period=n.period)),'[]'),
   'removed',coalesce((select jsonb_agg(o.period order by o.period) from ol o where not exists(select 1 from nw n where n.period=o.period)),'[]'),
   'corrected',coalesce((select jsonb_agg(jsonb_build_object('period',n.period,'from',o.value,'to',n.value) order by n.period) from nw n join ol o on o.period=n.period
     where o.value<>n.value),'[]'),
   'provenanceChanged',coalesce((select jsonb_agg(n.period order by n.period) from nw n join ol o on o.period=n.period
     where o.value=n.value and (o.version_id<>n.version_id or o.acquisition_id<>n.acquisition_id)),'[]'),
   'rulesChanged',to_jsonb((prev.payload_text::jsonb#>'{series,normalizations}') is distinct from defs
     or (prev.payload_text::jsonb#>>'{rules,codeCommit}') is distinct from p_code_commit))
  into alter_;
 end if;
 payload:=jsonb_build_object(
  'format','offroad.market-odbl.v1',
  'database','Offroad: base derivada da meta Selic (série SGS 432) com vínculos aos comunicados do Copom',
  'release',num::text,
  'publishedAt',private.market_instant_text_v1(k),
  'license',jsonb_build_object('name','Open Database License (ODbL) v1.0','uri','https://opendatacommons.org/licenses/odbl/1-0/',
   'appliesTo','Esta base derivada, inteira. Qualquer uso público exige atribuição; uma base derivada desta que seja usada publicamente deve ser oferecida sob a ODbL.'),
  'source',jsonb_build_object('name','Banco Central do Brasil: Sistema Gerenciador de Séries Temporais, série 432 (meta Selic), e comunicados do Copom',
   'attribution',coalesce(src.license->>'attribution','Banco Central do Brasil'),'sourceLicense',coalesce(src.license->>'license',''),
   'evidenceIds',coalesce(src.license->'evidenceIds','[]'),'sourceRevision',src.revision::text),
  'attribution','Contém dados do Banco Central do Brasil (série SGS 432 e comunicados do Copom), transformados pela Offroad, disponibilizados sob a Open Database License (ODbL) v1.0.',
  'reading',jsonb_build_object('dataBase',to_char(d,'YYYY-MM-DD'),'knowledgeAt',private.market_instant_text_v1(k),
   'window',jsonb_build_object('start',to_char(ec.homologated_from,'YYYY-MM-DD'),'end',to_char(d,'YYYY-MM-DD'))),
  'series',jsonb_build_object('logicalId',nz.logical_id,'endpointContract',ec.id,'endpointContractSha256',ec.contract_sha256,'normalizations',defs),
  'rules',jsonb_build_object('codeCommit',p_code_commit,
   'parserAndRules','https://github.com/carlosevg100/offroad/tree/'||p_code_commit||'/packages/market-reference/src',
   'vectors','https://github.com/carlosevg100/offroad/tree/'||p_code_commit||'/packages/market-reference/vectors',
   'database','https://github.com/carlosevg100/offroad/tree/'||p_code_commit||'/supabase/migrations',
   'contracts','https://github.com/carlosevg100/offroad/blob/'||p_code_commit||'/docs/build/market-reference/M2-CONTRATOS.md'),
  'observations',obs,
  'changes',changes,
  'alterations',alter_);
 txt:=private.market_odbl_canonical_v1(payload)||chr(10);
 if octet_length(convert_to(txt,'UTF8'))>2097152 then raise exception 'market_odbl_too_large' using errcode='54000';end if;
 insert into private.market_odbl_releases(id,release_number,command_id,request_sha256,previous_release_id,data_base,knowledge_at,window_start,code_commit,
  payload_text,payload_sha256,byte_size,published_by)
 values(rid,num,p_command,fp,prev.id,d,k,ec.homologated_from,p_code_commit,txt,encode(extensions.digest(convert_to(txt,'UTF8'),'sha256'),'hex'),
  octet_length(convert_to(txt,'UTF8')),p_actor_user_id);
 insert into private.market_odbl_release_dependencies(release_id,version_id,acquisition_id)
 select distinct rid,p.version_id,p.acquisition_id from jsonb_to_recordset(pick) as p(period date,value numeric,version_id uuid,acquisition_id uuid,acquired_at timestamptz,normalization_id text);
 return jsonb_build_object('releaseNumber',num,'sha256',encode(extensions.digest(convert_to(txt,'UTF8'),'sha256'),'hex'),'replayed',false);
end $$;

-- 13. A disagreement with a meeting's reference is its own definitive failure code, kept on the job.
create or replace function private.worker_fail_market_acquisition_v1(p_job_id uuid,p_capability_token text,p_lease_id uuid,p_code text,p_retryable boolean,p_detail text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j private.market_acquisition_jobs;retry boolean;begin perform private.market_require_read_committed_v1();
 if p_code is null or p_code not in ('host_not_allowed','redirect_not_allowed','private_address','http_status','too_large','content_type','timeout','network',
  'upload_failed','verification_failed','transport_paused','source_not_acquirable','delegation_revoked','parse_failed','meeting_disagreement') or p_retryable is null or (p_detail is not null and length(p_detail)>500)
 then raise exception 'market_acquisition_invalid' using errcode='22023';end if;
 j:=private.market_acquisition_for_lease_v1(p_job_id,p_capability_token,p_lease_id);
 retry:=p_retryable and p_code not in ('host_not_allowed','redirect_not_allowed','private_address','source_not_acquirable','parse_failed','meeting_disagreement') and j.attempts<j.max_attempts;
 update private.market_acquisition_jobs set status=case when retry then 'queued' else 'failed' end,
  available_at=case when retry then clock_timestamp()+make_interval(secs=>30*j.attempts) else available_at end,
  lease_id=null,leased_by=null,leased_account_user_id=null,leased_at=null,lease_expires_at=null,capability_sha256=null,
  last_error=jsonb_build_object('code',p_code,'detail',p_detail) where id=j.id;
 insert into private.market_acquisition_job_events(job_id,event,worker_token_id,lease_id,detail)
 values(j.id,case when retry then 'retry_scheduled' else 'failed' end,j.leased_by,p_lease_id,jsonb_build_object('code',p_code,'detail',p_detail));
 return jsonb_build_object('retryScheduled',retry);
end $$;

-- 14. What an operator reads about a regime and trigger.
create function private.market_regime_incident_v1(p_regime text,p_trigger text,p_actor uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare dl private.market_regime_declarations;begin
 perform private.require_platform_principal_v1(p_actor);
 select * into dl from private.market_regime_declarations where regime_id=p_regime and trigger_id=p_trigger and active;
 return jsonb_build_object(
  'declaration',case when dl.id is null then null else jsonb_build_object('id',dl.id,'policyId',dl.policy_id,'policyVersion',dl.policy_version,'sha256',dl.projection_sha256,
   'referenceStatus','draft','decidedBy',(dl.projection_text::jsonb)->>'decidedBy','trigger',(dl.projection_text::jsonb)->'trigger') end,
  'incident',(select jsonb_build_object('reviewState',i.review_state,'reviewRevision',i.review_revision,'openedAt',private.market_instant_text_v1(i.opened_at),
   'reviewDueOn',to_char(i.review_due_on,'YYYY-MM-DD'),
   'dispositions',coalesce((select jsonb_agg(jsonb_build_object('from',x.from_state,'to',x.to_state,'revision',x.revision_after,'reason',x.reason,
     'actor',x.actor_user_id,'automatic',x.command_id is null,'at',private.market_instant_text_v1(x.recorded_at)) order by x.recorded_at,x.revision_after)
     from private.market_regime_dispositions x where x.regime_id=i.regime_id and x.trigger_id=i.trigger_id),'[]'),
   'witnesses',coalesce((select jsonb_agg(jsonb_build_object('meetingEnd',to_char(w.meeting_end,'YYYY-MM-DD'),
     'support',(select s.support from private.market_regime_witness_support s where s.regime_id=w.regime_id and s.trigger_id=w.trigger_id and s.meeting_end=w.meeting_end order by s.revision desc limit 1),
     'meeting',(select jsonb_build_object('meeting',m.meeting,'decision',m.decision,'targetPct',m.target_pct,'seriesChangeDate',to_char(m.series_change_date,'YYYY-MM-DD'),
       'acquisitionId',m.reference_acquisition_id,'recordSha256',m.record_sha256) from private.market_copom_meetings m where m.reference_date=w.meeting_end)) order by w.meeting_end)
     from private.market_regime_witnesses w where w.regime_id=i.regime_id and w.trigger_id=i.trigger_id),'[]'))
   from private.market_regime_incidents i where i.regime_id=p_regime and i.trigger_id=p_trigger),
  'lastEvaluation',(select jsonb_build_object('id',e.id,'dataBase',to_char(e.data_base,'YYYY-MM-DD'),'knowledgeAt',private.market_instant_text_v1(e.knowledge_at),
   'result',e.result,'freshness',e.freshness,'gaps',e.evaluation->'gaps','witnesses',e.evaluation->'witnesses','baselineContradictions',e.evaluation->'baselineContradictions',
   'auditSha256',e.audit_sha256) from private.market_regime_evaluations e where e.regime_id=p_regime and e.trigger_id=p_trigger order by e.created_at desc,e.id desc limit 1),
  'lastRunAt',(select private.market_instant_text_v1(max(r.ran_at)) from private.market_rg01_runs r where r.regime_id=p_regime and r.trigger_id=p_trigger),
  'pendingRequests',coalesce((select jsonb_agg(q.key order by q.key collate "C") from private.market_rg01_requests q where q.regime_id=p_regime and q.trigger_id=p_trigger and q.satisfied_by is null),'[]'),
  'blockedRows',coalesce((select jsonb_agg(o.event_sequence order by o.event_sequence) from private.market_event_outbox o join private.market_event_consumers c on c.id=o.consumer_id
   where c.handler='rg01' and o.status='blocked'),'[]'));
end $$;

-- 15. The declaration of the regime that policy.pricing.regime (2026.09.24-v1) declares, still a draft in the
-- reference registry; the test of the package recomputes this text from the policy.
do $$declare v_id uuid:='5f0c7a1e-3d1b-5c55-9a7e-6e3f0a8b2c01';begin
 perform pg_advisory_xact_lock(hashtextextended('market-regime:brl-afrouxamento-2026-03-19:RG-01',0));
 insert into private.market_regime_declarations(id,policy_id,policy_version,regime_id,trigger_id,rule,projection_text,projection_sha256,active)
 values(v_id,'policy.pricing.regime','2026.09.24-v1','brl-afrouxamento-2026-03-19','RG-01','market-rg01.v1',
  '{"decidedBy":"Head de Mercado e Distribuição, com registro datado da decisão e das evidências","easingCycle":{"copomDecisions":["2026-03-18","2026-04-29","2026-06-17","2026-08-05","2026-09-16"],"cumulativeBps":-125,"cuts":5,"effectiveNextDay":true,"fromPct":"15.00","startedOn":"2026-03-19","stepBps":25},"policyId":"policy.pricing.regime","policyVersion":"2026.09.24-v1","regime":"brl-afrouxamento-2026-03-19","reviewDeadlineBusinessDays":5,"selicTargetPct":"13.75","trigger":{"action":"revisao_obrigatoria","condition":"o Copom inverte a direção do ciclo de cortes iniciado em 19/03/2026","id":"RG-01","scope":"todas as classes"},"validFrom":"2026-03-19"}
',encode(extensions.digest(convert_to('{"decidedBy":"Head de Mercado e Distribuição, com registro datado da decisão e das evidências","easingCycle":{"copomDecisions":["2026-03-18","2026-04-29","2026-06-17","2026-08-05","2026-09-16"],"cumulativeBps":-125,"cuts":5,"effectiveNextDay":true,"fromPct":"15.00","startedOn":"2026-03-19","stepBps":25},"policyId":"policy.pricing.regime","policyVersion":"2026.09.24-v1","regime":"brl-afrouxamento-2026-03-19","reviewDeadlineBusinessDays":5,"selicTargetPct":"13.75","trigger":{"action":"revisao_obrigatoria","condition":"o Copom inverte a direção do ciclo de cortes iniciado em 19/03/2026","id":"RG-01","scope":"todas as classes"},"validFrom":"2026-03-19"}
','UTF8'),'sha256'),'hex'),true);
 if (select projection_sha256 from private.market_regime_declarations where id=v_id)<>'31656412a93a1c2d52a651308bbcc307266ba211b9d4089801203c982a3ce0d7'
 then raise exception 'market_regime_declaration_drift';end if;
 insert into private.market_rg01_requests(regime_id,trigger_id,key) values('brl-afrouxamento-2026-03-19','RG-01','declaration:'||v_id::text);
end $$;

-- 16. Closed surfaces, grants and the capability.
do $$ declare t text;begin
 foreach t in array array['market_copom_calendar_evidence','market_copom_calendar_revisions','market_regime_declarations','market_rg01_requests',
  'market_regime_evaluations','market_rg01_runs','market_regime_incidents','market_regime_witnesses','market_regime_witness_support','market_regime_dispositions'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('alter table private.%I force row level security',t);
  execute format('create policy %I on private.%I as restrictive for all to public using(false) with check(false)',t||'_deny',t);
  execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
  execute format('create trigger %I before truncate on private.%I for each statement execute function private.guard_platform_ledger_truncate_v1()',t||'_truncate_guard',t);
 end loop;
end $$;

do $$declare f record;begin
 for f in select p.oid::regprocedure::text signature,p.proname,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='private' and p.proname in ('market_business_day_after_v1','market_freshness_deadline_v1','market_manifest_sha256_v1','record_market_copom_calendar_v1',
  'guard_market_regime_declaration_v1','market_policy_canonical_v1','market_selic_selection_v1','market_selic_candidates_v1','guard_market_rg01_request_v1',
  'guard_market_regime_incident_v1','market_rg01_snapshot_v1','market_evaluate_rg01_v1','run_market_rg01_v1','register_market_event_consumer_v2',
  'worker_complete_market_event_v1','worker_run_rg01_event_v1','market_rg01_worker_v1','worker_schedule_rg01_v1','worker_evaluate_rg01_v1',
  'dispose_market_regime_incident_v1','worker_fail_market_acquisition_v1','market_regime_incident_v1','publish_market_odbl_release_v1'))
 or (n.nspname='public' and p.proname in ('worker_run_rg01_event_v1','worker_schedule_rg01_v1','worker_evaluate_rg01_v1'))
 loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
  if f.proname in ('worker_run_rg01_event_v1','worker_schedule_rg01_v1','worker_evaluate_rg01_v1','worker_complete_market_event_v1','worker_fail_market_acquisition_v1') then
   execute format('grant execute on function %s to authenticated',f.signature);
  end if;
 end loop;
end $$;

-- Boot contract: the database announces the monitor before any image requires it.
do $$declare body text;begin
 select pg_get_functiondef('public.worker_runtime_schema_contract_v1()'::regprocedure) into body;
 if position('market-regime-monitor.v1' in body)>0 then raise exception 'market_capability_already_registered';end if;
 if position('market-event-outbox.v1' in body)=0 then raise exception 'runtime_capability_anchor_missing';end if;
 body:=replace(body,'market-event-outbox.v1','market-event-outbox.v1","market-regime-monitor.v1');
 execute body;
end $$;

comment on table private.market_regime_evaluations is 'RG-01 monitor (ADR 0023, M2 part 6): evaluations by the database over a snapshot taken by one statement; internal, never shown to a tenant.';
