-- Market reference M2, part 3 (ADR 0023; docs/build/market-reference/M2-PARTE-3.md), second half: the
-- retention exception and the reading contract on every path, the authority anchors of revocation, and
-- the ODbL edition of the derived database with its one public reader.

-- 1. Retention: only an open licence with no storage term that keeps adopted values may be acquired,
-- confirmed or read. A contracted licence is refused for the whole of M2 (it would need proven purge).
create function private.market_license_retains_v1(p_license jsonb) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(p_license->>'kind'='open' and coalesce(jsonb_typeof(p_license->'storeDays'),'null')='null'
  and p_license->'retainAdoptedValues'='true'::jsonb,false);
$$;

create or replace function private.market_source_acquirable_v1(p_source_id text,p_on date) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select s.enabled and private.market_contract_in_force_v1(s.license,p_on) and private.market_license_retains_v1(s.license)
  from private.market_source_revisions s where s.source_id=p_source_id order by s.revision desc limit 1),false);
$$;

-- A revision whose licence would not retain is refused while the source has anything stored: a confirmed
-- acquisition, a live job or bytes at an allocated path. Under the exclusive source lock, so no claim,
-- upload or confirmation crosses the change.
create or replace function private.record_market_source_revision_v1(p_command uuid,p_source_id text,p_definition jsonb,p_actor uuid) returns integer
language plpgsql security invoker set search_path='' as $$
declare prior private.market_source_revisions;next_revision integer;fp text;begin
 perform private.require_platform_principal_v1(p_actor);
 if p_command is null or p_source_id is null or p_definition is null or jsonb_typeof(p_definition)<>'object'
 or p_definition - array['registryId','license','allowedHosts','calendar','expectedPublication','maximumAgeHours','enabled','reason'] <> '{}'::jsonb
 or jsonb_typeof(p_definition->'enabled')<>'boolean' or jsonb_typeof(p_definition->'allowedHosts')<>'array'
 then raise exception 'market_source_invalid' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('platform-command:'||p_command::text,0));
 fp:=encode(extensions.digest(convert_to(p_definition::text,'UTF8'),'sha256'),'hex');
 select * into prior from private.market_source_revisions where command_id=p_command;
 if found then
  if prior.source_id<>p_source_id or prior.recorded_by<>p_actor or prior.definition_sha256<>fp then raise exception 'market_source_command_reused' using errcode='22023';end if;
  return prior.revision;
 end if;
 perform private.market_require_read_committed_v1();
 perform pg_advisory_xact_lock(hashtextextended('market-source:'||p_source_id,0));
 -- A licensed source is never enabled outside a contract in force.
 if (p_definition->>'enabled')::boolean and not private.market_contract_in_force_v1(p_definition->'license',(clock_timestamp() at time zone 'America/Sao_Paulo')::date)
 then raise exception 'market_source_contract_not_in_force' using errcode='42501';end if;
 if not private.market_license_retains_v1(p_definition->'license') and (
  exists(select 1 from private.market_acquisitions a where a.source_id=p_source_id)
  or exists(select 1 from private.market_acquisition_jobs j where j.source_id=p_source_id and j.status in ('queued','leased'))
  or exists(select 1 from storage.objects o where o.bucket_id='market-reference' and left(o.name,length(p_source_id)+1)=p_source_id||'/'))
 then raise exception 'market_retention_requires_purge' using errcode='55000';end if;
 select coalesce(max(revision),0)+1 into next_revision from private.market_source_revisions where source_id=p_source_id;
 insert into private.market_source_revisions(source_id,revision,registry_id,license,allowed_hosts,calendar,expected_publication,maximum_age_hours,enabled,reason,recorded_by,command_id,definition_sha256)
 values(p_source_id,next_revision,p_definition->>'registryId',p_definition->'license',
  array(select jsonb_array_elements_text(p_definition->'allowedHosts')),p_definition->>'calendar',(p_definition->>'expectedPublication')::time,
  (p_definition->>'maximumAgeHours')::integer,(p_definition->>'enabled')::boolean,p_definition->>'reason',p_actor,p_command,fp);
 return next_revision;
end $$;

-- 2. Authority anchors: revoking or purging an acquisition or a source takes its anchor exclusively, so
-- whoever produces something durable from them (relink, publication) and holds the anchor shared sees
-- either the state before or the state after.
create function private.anchor_market_authority_v1() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.subject_kind in ('acquisition','source') and new.event in ('revoked','purged') then
  perform pg_advisory_xact_lock(hashtextextended('market-authority:'||new.subject_kind||':'||new.subject_id,0));
 end if;
 return new;
end $$;
create trigger market_events_authority before insert on private.market_events for each row execute function private.anchor_market_authority_v1();
create index market_events_subject_event on private.market_events(subject_kind,subject_id,event);

-- The closure of a version: itself, every version it depends on (any depth), the acquisition of each and
-- every communiqué acquisition linked as evidence.
create function private.market_version_closure_v1(p_version uuid)
returns table(version_id uuid,acquisition_id uuid)
language sql stable security definer set search_path='' as $$
 with recursive c(id) as (
  select p_version
  union
  select i.dependency_version_id from private.market_version_inputs i join c on i.version_id=c.id where i.dependency_version_id is not null)
 select c.id,null::uuid from c
 union
 select c.id,i.acquisition_id from c join private.market_version_inputs i on i.version_id=c.id where i.acquisition_id is not null
 union
 select c.id,e.acquisition_id from c join private.market_version_evidence e on e.version_id=c.id;
$$;

-- An acquisition is readable while neither it nor its source is revoked or purged, and both the licence
-- of the revision it was acquired under and the source's current licence retain. Disabling collection
-- does not withdraw reading.
create function private.market_acquisition_readable_v1(p_acquisition uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select
   not exists(select 1 from private.market_events e where e.subject_kind='acquisition' and e.subject_id=a.id::text and e.event in ('revoked','purged'))
   and not exists(select 1 from private.market_events e where e.subject_kind='source' and e.subject_id=a.source_id and e.event in ('revoked','purged'))
   and private.market_license_retains_v1((select s.license from private.market_source_revisions s where s.source_id=a.source_id and s.revision=a.source_revision))
   and private.market_license_retains_v1((private.market_source_in_force_v1(a.source_id)).license)
  from private.market_acquisitions a where a.id=p_acquisition),false);
$$;

-- The one reading contract. consume (resolver and publication) needs the current quality approved for
-- every version of the closure; reprocess (relink only) does not, because relinking is how a quarantined
-- version is repaired.
create function private.market_version_readable_v1(p_version uuid,p_mode text) returns boolean
language plpgsql stable security definer set search_path='' as $$
begin
 if p_mode is null or p_mode not in ('consume','reprocess') then raise exception 'market_read_mode_invalid' using errcode='22023';end if;
 if not exists(select 1 from private.market_versions where id=p_version) then return false;end if;
 return not exists(select 1 from (select distinct c.version_id from private.market_version_closure_v1(p_version) c) v
   where coalesce((select s.state from private.market_version_states s where s.version_id=v.version_id),'') is distinct from 'sealed'
   or exists(select 1 from private.market_events e where e.subject_kind='version' and e.subject_id=v.version_id::text and e.event in ('revoked','purged'))
   or (p_mode='consume' and not private.market_version_quality_approved_v1(v.version_id)))
  and not exists(select 1 from private.market_version_closure_v1(p_version) c
   where c.acquisition_id is not null and not private.market_acquisition_readable_v1(c.acquisition_id));
end $$;

-- Shared anchors for a set of versions and acquisitions, in ascending key order: the version states,
-- then the acquisition and source anchors.
create function private.lock_market_read_authority_v1(p_versions uuid[],p_acquisitions uuid[]) returns void
language plpgsql security definer set search_path='' as $$
declare k text;v uuid;begin
 for v in select distinct x from unnest(p_versions) x where x is not null order by 1 loop
  perform private.lock_market_version_state_v1(v,false);
 end loop;
 for k in select distinct key from (
   select 'market-authority:acquisition:'||x::text key from unnest(p_acquisitions) x where x is not null
   union select 'market-authority:source:'||a.source_id from private.market_acquisitions a where a.id=any(p_acquisitions)) z order by 1 loop
  perform pg_advisory_xact_lock_shared(hashtextextended(k,0));
 end loop;
end $$;

-- 3. Relink reads in mode reprocess, under the source locks and the anchors of the closure and of the
-- new evidence. A repeated command still returns its receipt without new work.
create or replace function private.relink_market_version_v1(p_command uuid,p_version uuid,p_actor_user_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare prior private.market_relink_commands;v private.market_versions;today date;obs jsonb;same boolean;created jsonb;result jsonb;
 versions uuid[];acquisitions uuid[];src text;begin
 perform private.require_platform_principal_v1(p_actor_user_id);
 if p_command is null or p_version is null then raise exception 'market_relink_invalid' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('platform-command:'||p_command::text,0));
 select * into prior from private.market_relink_commands where command_id=p_command;
 if found then
  if prior.version_id<>p_version or prior.actor_user_id<>p_actor_user_id then raise exception 'platform_method_request_reused' using errcode='22023';end if;
  return prior.result||jsonb_build_object('replayed',true);
 end if;
 perform private.market_require_read_committed_v1();
 select * into v from private.market_versions where id=p_version;
 if not found or v.canonical_version<>'v2' then raise exception 'market_relink_invalid' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('market-chain:'||v.acquisition_id::text,0));
 if exists(select 1 from private.market_versions x where x.supersedes=v.id) then raise exception 'market_relink_not_tip' using errcode='55000';end if;
 if private.lock_market_version_state_v1(v.id,false)<>'sealed' then raise exception 'market_relink_invalid' using errcode='22023';end if;
 today:=private.market_sao_paulo_date_v1(clock_timestamp());
 select array_agg(distinct c.version_id),array_agg(distinct c.acquisition_id) filter (where c.acquisition_id is not null)
 into versions,acquisitions from private.market_version_closure_v1(v.id) c;
 acquisitions:=coalesce(acquisitions,'{}')||coalesce((select array_agg(x.acquisition_id) from private.market_select_evidence_v1(v.window_start,v.window_end,today) x),'{}');
 for src in select distinct a.source_id from private.market_acquisitions a where a.id=any(acquisitions) order by 1 loop
  perform pg_advisory_xact_lock_shared(hashtextextended('market-source:'||src,0));
 end loop;
 perform private.lock_market_read_authority_v1(versions,acquisitions);
 if not private.market_version_readable_v1(v.id,'reprocess')
 or exists(select 1 from unnest(acquisitions) x where not private.market_acquisition_readable_v1(x))
 then raise exception 'market_version_not_readable' using errcode='42501';end if;
 select not exists(
  (select meeting,acquisition_id from private.market_select_evidence_v1(v.window_start,v.window_end,today))
  except (select meeting,acquisition_id from private.market_version_evidence where version_id=v.id))
 and not exists(
  (select meeting,acquisition_id from private.market_version_evidence where version_id=v.id)
  except (select meeting,acquisition_id from private.market_select_evidence_v1(v.window_start,v.window_end,today))) into same;
 if same then
  result:=jsonb_build_object('relinked',false,'replayed',false,'versionId',v.id);
 else
  select coalesce(jsonb_agg(jsonb_build_object('period',to_char(period_end,'YYYY-MM-DD'),'value',value::text) order by period_end),'[]') into obs
  from private.market_observations where version_id=v.id;
  created:=private.create_market_selic_version_v1(v.acquisition_id,v.normalization_id,v.id,obs,today,v.window_start,v.window_end,null,p_actor_user_id);
  result:=jsonb_build_object('relinked',true,'replayed',false,'versionId',created->'versionId','supersedes',v.id,'quality',created->'quality');
 end if;
 insert into private.market_relink_commands(command_id,version_id,actor_user_id,result) values(p_command,p_version,p_actor_user_id,result);
 return result;
end $$;

-- 4. ODbL edition. Canonical bytes market-odbl.v1: UTF-8 JSON, object keys by code point, no
-- whitespace, arrays in contract order, every number as a decimal string, minimal escaping (quote,
-- backslash, controls below U+0020 as a lowercase six-character escape), a final newline.
create function private.market_odbl_string_v1(p text) returns text
language plpgsql immutable set search_path='' as $$
declare s text;i int;begin
 s:=replace(replace(p,chr(92),chr(92)||chr(92)),'"',chr(92)||'"');
 for i in 1..31 loop
  if position(chr(i) in s)>0 then s:=replace(s,chr(i),chr(92)||'u00'||lpad(to_hex(i),2,'0'));end if;
 end loop;
 return '"'||s||'"';
end $$;

create function private.market_odbl_canonical_v1(p jsonb) returns text
language plpgsql immutable set search_path='' as $$
declare t text;begin
 case jsonb_typeof(p)
 when 'object' then
  select '{'||coalesce(string_agg(private.market_odbl_string_v1(k)||':'||private.market_odbl_canonical_v1(v),',' order by k collate "C"),'')||'}' into t from jsonb_each(p) x(k,v);
  return t;
 when 'array' then
  select '['||coalesce(string_agg(private.market_odbl_canonical_v1(e),',' order by o),'')||']' into t from jsonb_array_elements(p) with ordinality x(e,o);
  return t;
 when 'string' then return private.market_odbl_string_v1(p#>>'{}');
 when 'boolean' then return p::text;
 when 'null' then return 'null';
 else raise exception 'market_odbl_number_not_allowed' using errcode='22023';
 end case;
end $$;

create table private.market_odbl_releases(
 id uuid primary key,
 release_number integer not null unique check(release_number>0),
 command_id uuid not null unique,
 request_sha256 text not null check(request_sha256 ~ '^[a-f0-9]{64}$'),
 previous_release_id uuid unique references private.market_odbl_releases(id),
 data_base date not null,
 knowledge_at timestamptz not null,
 window_start date not null,
 code_commit text not null check(code_commit ~ '^[a-f0-9]{40}$'),
 payload_text text not null,
 payload_sha256 text not null check(payload_sha256 ~ '^[a-f0-9]{64}$'),
 byte_size integer not null check(byte_size between 1 and 2097152),
 published_by uuid not null references auth.users(id),
 published_at timestamptz not null default clock_timestamp(),
 check((release_number=1)=(previous_release_id is null)));
create index market_odbl_releases_published_by on private.market_odbl_releases(published_by);

create table private.market_odbl_release_dependencies(
 release_id uuid not null references private.market_odbl_releases(id),
 version_id uuid not null references private.market_versions(id),
 acquisition_id uuid not null references private.market_acquisitions(id),
 primary key(release_id,version_id));
create index market_odbl_release_dependencies_version on private.market_odbl_release_dependencies(version_id);
create index market_odbl_release_dependencies_acquisition on private.market_odbl_release_dependencies(acquisition_id);

create table private.market_odbl_release_withdrawals(
 release_id uuid primary key references private.market_odbl_releases(id),
 kind text not null check(kind in ('quality','rights')),
 reason text not null check(length(btrim(reason)) between 5 and 1000),
 command_id uuid not null unique,
 withdrawn_by uuid not null references auth.users(id),
 withdrawn_at timestamptz not null default clock_timestamp());
create index market_odbl_release_withdrawals_by on private.market_odbl_release_withdrawals(withdrawn_by);

create trigger market_odbl_releases_immutable before update or delete on private.market_odbl_releases for each row execute function private.market_reject_change_v1();
create trigger market_odbl_release_dependencies_immutable before update or delete on private.market_odbl_release_dependencies for each row execute function private.market_reject_change_v1();
create trigger market_odbl_release_withdrawals_immutable before update or delete on private.market_odbl_release_withdrawals for each row execute function private.market_reject_change_v1();

-- The edition of the SGS 432 derived database, fixed at the publication instant: data-base D (São Paulo
-- date), knowledge K, window from the homologated start to D, and per period the most recent acquisition
-- among the versions that serve D (per chain, the latest recorded whose evidence was available for D,
-- then readable in mode consume), ties by the greater version id.
create function private.publish_market_odbl_release_v1(p_command uuid,p_code_commit text,p_actor_user_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare prior private.market_odbl_releases;prev private.market_odbl_releases;fp text;d date;k timestamptz;lim timestamptz;nz private.market_normalizations;
 ec private.market_endpoint_contracts;src private.market_source_revisions;cand uuid[];versions uuid[];acquisitions uuid[];
 obs jsonb;changes jsonb;alter_ jsonb;payload jsonb;txt text;rid uuid:=gen_random_uuid();num integer;begin
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
 select * into strict nz from private.market_normalizations where id='bcb-sgs-432';
 select * into strict ec from private.market_endpoint_contracts where id=nz.endpoint_contract_id;
 perform pg_advisory_xact_lock_shared(hashtextextended('market-source:'||ec.source_id,0));
 src:=private.market_source_in_force_v1(ec.source_id);
 if src.source_id is null or not private.market_license_retains_v1(src.license) then raise exception 'market_odbl_source_not_publishable' using errcode='42501';end if;
 k:=clock_timestamp();d:=private.market_sao_paulo_date_v1(k);lim:=private.market_data_base_limit_v1(d);
 -- Per chain, the latest version recorded by K whose evidence was available for D.
 select array_agg(id) into cand from (select distinct on (v.acquisition_id) v.id from private.market_versions v
  where v.canonical_version='v2' and v.normalization_id=nz.id and v.recorded_at<=k and v.evidence_available_at<lim
  order by v.acquisition_id,v.recorded_at desc,v.id desc) z;
 select array_agg(distinct c.version_id),array_agg(distinct c.acquisition_id) filter (where c.acquisition_id is not null)
 into versions,acquisitions from unnest(coalesce(cand,'{}')) u(id) cross join lateral private.market_version_closure_v1(u.id) c;
 perform private.lock_market_read_authority_v1(coalesce(versions,'{}'),coalesce(acquisitions,'{}'));
 -- After the anchors: the readable chains and the manifest per period.
 create temporary table if not exists market_odbl_pick(period date,value numeric,version_id uuid,acquisition_id uuid,acquired_at timestamptz) on commit drop;
 truncate market_odbl_pick;
 insert into market_odbl_pick
 select distinct on (o.period_end) o.period_end,o.value,v.id,v.acquisition_id,a.acquired_at
 from unnest(coalesce(cand,'{}')) u(id) join private.market_versions v on v.id=u.id join private.market_acquisitions a on a.id=v.acquisition_id
 join private.market_observations o on o.version_id=v.id
 where private.market_version_readable_v1(v.id,'consume') and o.period_end>=ec.homologated_from and o.period_end<=d and o.acquired_at<lim
 order by o.period_end,a.acquired_at desc,v.id::text collate "C" desc;
 if not exists(select 1 from market_odbl_pick) then raise exception 'market_odbl_nothing_to_publish' using errcode='55000';end if;
 select coalesce(jsonb_agg(jsonb_build_object('period',to_char(p.period,'YYYY-MM-DD'),'value',private.market_trim_decimal_v1(p.value::text),
  'versionId',p.version_id::text,'acquisitionId',p.acquisition_id::text) order by p.period),'[]') into obs from market_odbl_pick p;
 select coalesce(jsonb_agg(jsonb_build_object('period',to_char(p.period,'YYYY-MM-DD'),'from',private.market_trim_decimal_v1(q.value::text),
  'to',private.market_trim_decimal_v1(p.value::text),'meeting',m.meeting::text,'referenceDate',to_char(m.reference_date,'YYYY-MM-DD'),'decision',m.decision,
  'targetPct',private.market_trim_decimal_v1(m.target_pct),'recordSha256',m.record_sha256) order by p.period),'[]') into changes
 from market_odbl_pick p join market_odbl_pick q on q.period=p.period-1
 left join private.market_version_evidence e on e.version_id=p.version_id
  and e.meeting=(select m2.meeting from private.market_copom_meetings m2 where m2.series_change_date=p.period)
 left join private.market_copom_meetings m on m.meeting=e.meeting
 where p.value<>q.value;
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
   'rulesChanged',to_jsonb((prev.payload_text::jsonb#>>'{series,contractSha256}') is distinct from nz.normalization_sha256
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
  'series',jsonb_build_object('logicalId',nz.logical_id,'normalization',nz.id,'contractSha256',nz.normalization_sha256,'endpointContract',ec.id,
   'endpointContractSha256',ec.contract_sha256,'unit',nz.unit,'scale',nz.scale,'convention',nz.convention,'calendar',nz.calendar,'parser',nz.parser,
   'qualityPolicy',jsonb_build_object('id',nz.quality_policy_id,'version',nz.quality_policy_version)),
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
 select distinct rid,p.version_id,p.acquisition_id from market_odbl_pick p;
 return jsonb_build_object('releaseNumber',num,'sha256',encode(extensions.digest(convert_to(txt,'UTF8'),'sha256'),'hex'),'replayed',false);
end $$;

create function private.withdraw_market_odbl_release_v1(p_command uuid,p_release integer,p_kind text,p_reason text,p_actor_user_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r private.market_odbl_releases;w private.market_odbl_release_withdrawals;begin
 perform private.require_platform_principal_v1(p_actor_user_id,true);
 if p_command is null or p_release is null or p_kind is null or p_kind not in ('quality','rights') or p_reason is null or length(btrim(p_reason))<5
 then raise exception 'market_odbl_invalid' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('platform-command:'||p_command::text,0));
 select * into w from private.market_odbl_release_withdrawals where command_id=p_command;
 if found then
  if w.release_id<>(select id from private.market_odbl_releases where release_number=p_release) or w.kind<>p_kind or w.withdrawn_by<>p_actor_user_id
  then raise exception 'platform_method_request_reused' using errcode='22023';end if;
  return jsonb_build_object('releaseNumber',p_release,'replayed',true);
 end if;
 select * into r from private.market_odbl_releases where release_number=p_release;
 if not found then raise exception 'market_odbl_release_unknown' using errcode='22023';end if;
 if exists(select 1 from private.market_odbl_release_withdrawals where release_id=r.id) then raise exception 'market_odbl_release_withdrawn' using errcode='22023';end if;
 insert into private.market_odbl_release_withdrawals(release_id,kind,reason,command_id,withdrawn_by) values(r.id,p_kind,btrim(p_reason),p_command,p_actor_user_id);
 return jsonb_build_object('releaseNumber',p_release,'replayed',false);
end $$;

-- 5. The one public reader. Equality on a positive edition number or the latest by index; an edition
-- that was withdrawn, or whose dependencies are no longer readable in mode consume, is reported withdrawn
-- without its payload; a missing number returns nothing and triggers no other lookup.
create function private.market_odbl_release_read_v1(p_release integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r private.market_odbl_releases;begin
 if p_release is not null and p_release<=0 then return null;end if;
 if p_release is null then select * into r from private.market_odbl_releases order by release_number desc limit 1;
 else select * into r from private.market_odbl_releases where release_number=p_release;end if;
 if not found then return null;end if;
 if exists(select 1 from private.market_odbl_release_withdrawals w where w.release_id=r.id)
 or exists(select 1 from private.market_odbl_release_dependencies x where x.release_id=r.id and not private.market_version_readable_v1(x.version_id,'consume'))
 then return jsonb_build_object('releaseNumber',r.release_number,'state','withdrawn');end if;
 return jsonb_build_object('releaseNumber',r.release_number,'state','served','publishedAt',private.market_instant_text_v1(r.published_at),
  'dataBase',to_char(r.data_base,'YYYY-MM-DD'),'sha256',r.payload_sha256,'byteSize',r.byte_size,'payload',r.payload_text);
end $$;

-- The exposed wrapper: invoker, body bound at creation (anon has no usage on schema private), its own
-- statement timeout (PostgREST hoists the settings of the function it calls).
create function public.market_odbl_release_v1(p_release integer default null) returns jsonb
language sql stable security invoker set search_path='' set statement_timeout='2s'
begin atomic
 select private.market_odbl_release_read_v1(p_release);
end;

do $$ declare t text;begin
 foreach t in array array['market_odbl_releases','market_odbl_release_dependencies','market_odbl_release_withdrawals'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('alter table private.%I force row level security',t);
  execute format('create policy %I on private.%I as restrictive for all to public using(false) with check(false)',t||'_deny',t);
  execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
  execute format('create trigger %I before truncate on private.%I for each statement execute function private.guard_platform_ledger_truncate_v1()',t||'_truncate_guard',t);
 end loop;
end $$;

do $$declare f record;begin
 for f in select p.oid::regprocedure::text signature,p.proname,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='private' and p.proname in ('market_license_retains_v1','market_source_acquirable_v1','record_market_source_revision_v1',
  'anchor_market_authority_v1','market_version_closure_v1','market_acquisition_readable_v1','market_version_readable_v1','lock_market_read_authority_v1',
  'relink_market_version_v1','market_odbl_string_v1','market_odbl_canonical_v1','publish_market_odbl_release_v1','withdraw_market_odbl_release_v1',
  'market_odbl_release_read_v1'))
 or (n.nspname='public' and p.proname='market_odbl_release_v1')
 loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
 end loop;
 grant execute on function private.market_odbl_release_read_v1(integer) to anon;
 grant execute on function public.market_odbl_release_v1(integer) to anon;
end $$;

comment on table private.market_odbl_releases is 'ODbL editions of the derived SGS 432 database (ADR 0023, M2 part 3): canonical bytes market-odbl.v1, immutable, served only while every dependency stays readable.';
comment on function public.market_odbl_release_v1(integer) is 'The one anonymous reader: an ODbL edition by number or the latest, payload only while served.';
