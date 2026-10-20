-- Market reference layer, foundation (ADR 0023, M1a and M1b first half). The Offroad publisher, the
-- source register with its licence regime, and the immutable ledger of logical objects, acquisitions,
-- normalized versions, observations and events. Nothing here collects data, grants a tenant access or
-- serves a number: the tables are closed to every API role, the publisher and each source are created
-- by founder or operator commands only, and every source starts disabled. Acquisitions are the
-- publisher's own immutable receipts (bytes, URL, hash) in a private bucket of their own, instead of
-- tenant document source versions, which stay bound to tenant uploads and their bucket.
set search_path='';

-- 1. The publisher. One Offroad organization acquires every market object; it has no tenant members.
create table private.market_publisher(
 singleton boolean primary key default true check(singleton),
 organization_id uuid not null unique references public.organizations(id),
 registered_by uuid not null references auth.users(id),
 command_id uuid not null unique,
 registered_at timestamptz not null default clock_timestamp());

create function private.register_market_publisher_v1(p_command uuid,p_name text,p_actor uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
declare existing private.market_publisher;org uuid;begin
 perform private.require_platform_principal_v1(p_actor,true);
 if p_command is null or p_name is null or length(btrim(p_name)) not between 3 and 200 then raise exception 'market_publisher_invalid' using errcode='22023';end if;
 select * into existing from private.market_publisher;
 if found then
  if existing.command_id=p_command and existing.registered_by=p_actor then return existing.organization_id;end if;
  raise exception 'market_publisher_exists' using errcode='23505';
 end if;
 insert into public.organizations(organization_type,name,legal_name,country_code,created_by,pipeline_enabled,model_monthly_ceiling_usd)
 values('offroad',btrim(p_name),btrim(p_name),'BR',p_actor,false,0) returning id into org;
 insert into private.market_publisher(organization_id,registered_by,command_id) values(org,p_actor,p_command);
 return org;
end $$;

create function private.market_publisher_organization_v1() returns uuid
language sql stable security definer set search_path='' as $$ select organization_id from private.market_publisher where singleton $$;

-- 2. Sources. A source revision fixes its licence regime, the only hosts it may be fetched from, its
-- calendar and freshness, and whether acquisition is enabled. Revisions are append-only; the latest
-- is the source in force. An open source declares the ODbL with its attribution and the captured
-- evidence; a contracted source can only be enabled while one of its entitlements is in force.
create table private.market_source_revisions(
 source_id text not null check(source_id ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
 revision integer not null check(revision>0),
 registry_id text not null check(registry_id ~ '^[a-z0-9_]+$'),
 license jsonb not null check(jsonb_typeof(license)='object' and license->>'kind' in ('open','contracted')),
 allowed_hosts text[] not null check(cardinality(allowed_hosts) between 1 and 8),
 calendar text not null check(calendar in ('br_business_days','calendar_days','monthly','irregular')),
 time_zone text not null default 'America/Sao_Paulo' check(time_zone='America/Sao_Paulo'),
 expected_publication time,
 maximum_age_hours integer not null check(maximum_age_hours between 1 and 8784),
 enabled boolean not null,
 reason text not null check(length(btrim(reason)) between 10 and 2000),
 recorded_by uuid not null references auth.users(id),
 command_id uuid not null unique,
 recorded_at timestamptz not null default clock_timestamp(),
 primary key(source_id,revision));

create function private.market_license_valid_v1(p jsonb) returns boolean
language sql immutable set search_path='' as $$
 select case p->>'kind'
  when 'open' then p->>'license'='ODbL-1.0' and length(btrim(coalesce(p->>'attribution','')))>=3
   and jsonb_typeof(p->'evidenceIds')='array' and jsonb_array_length(p->'evidenceIds')>0
   and jsonb_typeof(p->'retainAdoptedValues')='boolean' and (p->'storeDays' is null or jsonb_typeof(p->'storeDays') in ('number','null'))
  when 'contracted' then length(btrim(coalesce(p->>'provider','')))>=2 and length(btrim(coalesce(p->>'contractReference','')))>=3
   and jsonb_typeof(p->'entitlements')='array' and jsonb_array_length(p->'entitlements')>0
   and jsonb_typeof(p->'policies')='array' and jsonb_array_length(p->'policies')>0
  else false end;
$$;
create function private.market_hosts_valid_v1(p text[]) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(bool_and(h ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
  and h !~ '(^|\.)(localhost|internal|local)$' and h !~ '^[0-9.]+$'),false) from unnest(p) h;
$$;
alter table private.market_source_revisions add constraint market_source_license_valid check(private.market_license_valid_v1(license));
alter table private.market_source_revisions add constraint market_source_hosts_valid check(private.market_hosts_valid_v1(allowed_hosts));

-- A contracted licence is usable on a date only within one of its entitlements.
create function private.market_contract_in_force_v1(p jsonb,p_on date) returns boolean
language sql immutable set search_path='' as $$
 select p->>'kind'='open' or exists(select 1 from jsonb_array_elements(coalesce(p->'entitlements','[]')) e
  where (e->>'validFrom')::date<=p_on and (e->>'validUntil' is null or (e->>'validUntil')::date>=p_on));
$$;

create function private.record_market_source_revision_v1(p_command uuid,p_source_id text,p_definition jsonb,p_actor uuid) returns integer
language plpgsql security invoker set search_path='' as $$
declare prior private.market_source_revisions;next_revision integer;begin
 perform private.require_platform_principal_v1(p_actor);
 if p_command is null or p_definition is null or jsonb_typeof(p_definition)<>'object' then raise exception 'market_source_invalid' using errcode='22023';end if;
 select * into prior from private.market_source_revisions where command_id=p_command;
 if found then
  if prior.source_id<>p_source_id or prior.recorded_by<>p_actor then raise exception 'market_source_command_reused' using errcode='22023';end if;
  return prior.revision;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('market-source:'||p_source_id,0));
 -- A licensed source is never enabled outside a contract in force.
 if coalesce((p_definition->>'enabled')::boolean,false) and not private.market_contract_in_force_v1(p_definition->'license',(clock_timestamp() at time zone 'America/Sao_Paulo')::date)
 then raise exception 'market_source_contract_not_in_force' using errcode='42501';end if;
 select coalesce(max(revision),0)+1 into next_revision from private.market_source_revisions where source_id=p_source_id;
 insert into private.market_source_revisions(source_id,revision,registry_id,license,allowed_hosts,calendar,expected_publication,maximum_age_hours,enabled,reason,recorded_by,command_id)
 values(p_source_id,next_revision,p_definition->>'registryId',p_definition->'license',
  array(select jsonb_array_elements_text(p_definition->'allowedHosts')),p_definition->>'calendar',(p_definition->>'expectedPublication')::time,
  (p_definition->>'maximumAgeHours')::integer,coalesce((p_definition->>'enabled')::boolean,false),p_definition->>'reason',p_actor,p_command);
 return next_revision;
end $$;

create function private.market_source_in_force_v1(p_source_id text) returns private.market_source_revisions
language sql stable security definer set search_path='' as $$
 select * from private.market_source_revisions where source_id=p_source_id order by revision desc limit 1;
$$;

-- 3. Logical objects: what a number is, independent of when or how it was acquired.
create table private.market_logical_objects(
 logical_id text primary key check(logical_id ~ '^market:[a-z0-9._-]+:[a-z0-9._-]+:[a-f0-9]{16}$'),
 source_id text not null check(source_id ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
 family text not null check(family ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
 kind text not null check(kind in ('series','curve','precedent','company_fact')),
 category text not null check(category in ('observed','consensus','consensus_scenario','implied_curve','document_fact')),
 keys jsonb not null check(jsonb_typeof(keys)='object'),
 created_at timestamptz not null default clock_timestamp(),
 check(split_part(logical_id,':',2)=source_id and split_part(logical_id,':',3)=family));

-- 4. Acquisitions: the publisher's receipt of bytes exactly as received.
create table private.market_acquisitions(
 id uuid primary key,
 publisher_organization_id uuid not null references public.organizations(id),
 source_id text not null,
 source_revision integer not null,
 url text not null check(url ~ '^https://'),
 final_url text not null check(final_url ~ '^https://'),
 acquired_at timestamptz not null,
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 byte_size bigint not null check(byte_size>0),
 content_type text not null check(length(content_type) between 3 and 120),
 bucket_id text not null default 'market-reference' check(bucket_id='market-reference'),
 object_path text not null unique check(object_path ~ '^[a-z0-9._-]+/[0-9]{4}/[0-9]{2}/[0-9a-f-]{36}\.[a-z0-9]{2,5}$'),
 processing_job_id uuid,
 recorded_at timestamptz not null default clock_timestamp(),
 foreign key(source_id,source_revision) references private.market_source_revisions(source_id,revision),
 unique(source_id,sha256,acquired_at));

-- 5. Normalized versions: acquisitions read by one parser version, with the methodology and
-- parameters when the object is derived, the licence snapshot in force at normalization, and the
-- version it supersedes.
create table private.market_versions(
 id uuid primary key,
 logical_id text not null references private.market_logical_objects(logical_id),
 parser_version text not null check(parser_version ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
 methodology jsonb check(methodology is null or (jsonb_typeof(methodology)='object' and methodology ? 'id' and methodology ? 'version')),
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 license jsonb not null check(private.market_license_valid_v1(license)),
 supersedes uuid references private.market_versions(id),
 recorded_at timestamptz not null default clock_timestamp(),
 unique(logical_id,sha256),
 check(supersedes is distinct from id));
create table private.market_version_inputs(
 version_id uuid not null references private.market_versions(id),
 acquisition_id uuid references private.market_acquisitions(id),
 dependency_version_id uuid references private.market_versions(id),
 check(num_nonnulls(acquisition_id,dependency_version_id)=1),
 unique(version_id,acquisition_id),
 unique(version_id,dependency_version_id));

-- 6. Observations with their three dates: the economic period, when the source made it public and
-- when the publisher acquired it. Content, not receipt: it is removed only by the purge path.
create table private.market_observations(
 version_id uuid not null references private.market_versions(id),
 period_start date,
 period_end date not null,
 available_at timestamptz not null,
 acquired_at timestamptz not null,
 value numeric not null,
 unit text not null check(unit in ('percent_per_year','percent_per_month','ratio','index_points','currency','basis_points','count')),
 scale text not null check(scale ~ '^1(0{1,9})?$'),
 check(period_start is null or period_start<=period_end));
create unique index market_observations_period on private.market_observations(version_id,coalesce(period_start,'0001-01-01'::date),period_end);

-- 7. Events: quarantine, approval, supersession, revocation, purge and release are recorded, never
-- written onto the version.
create table private.market_events(
 sequence bigint generated always as identity primary key,
 subject_kind text not null check(subject_kind in ('acquisition','version','source')),
 subject_id text not null check(length(subject_id) between 1 and 200),
 event text not null check(event in ('quarantined','approved','superseded','revoked','purged','released')),
 reason text not null check(length(btrim(reason)) between 5 and 2000),
 actor_user_id uuid references auth.users(id),
 processing_job_id uuid,
 command_id uuid,
 recorded_at timestamptz not null default clock_timestamp(),
 check(num_nonnulls(actor_user_id,processing_job_id)=1));

-- The state of a version is read from its events: approved and not later quarantined, revoked or purged.
create function private.market_version_usable_v1(p_version uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select e.event='approved' from private.market_events e
  where e.subject_kind='version' and e.subject_id=p_version::text and e.event in ('approved','quarantined','revoked','purged')
  order by e.sequence desc limit 1),false);
$$;

-- 8. Immutability. Receipts, versions, inputs, events and registers never change. Observations are
-- content: only the purge path, inside its own transaction flag, may delete them.
create function private.guard_market_content_v1() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' and current_setting('offroad.market_purge',true)='on' then return old;end if;
 raise exception 'market_content_immutable' using errcode='42501';
end $$;
do $$ declare t text;begin
 foreach t in array array['market_publisher','market_source_revisions','market_logical_objects','market_acquisitions','market_versions','market_version_inputs','market_events'] loop
  execute format('create trigger %I before update or delete on private.%I for each row execute function private.guard_contribution_immutable_v1()',t||'_immutable',t);
 end loop;
 execute 'create trigger market_observations_content before update or delete on private.market_observations for each row execute function private.guard_market_content_v1()';
 foreach t in array array['market_publisher','market_source_revisions','market_logical_objects','market_acquisitions','market_versions','market_version_inputs','market_observations','market_events'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('alter table private.%I force row level security',t);
  execute format('create policy %I on private.%I as restrictive for all to public using(false) with check(false)',t||'_deny',t);
  execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
  execute format('create trigger %I before truncate on private.%I for each statement execute function private.guard_platform_ledger_truncate_v1()',t||'_truncate_guard',t);
 end loop;
end $$;
revoke all on sequence private.market_events_sequence_seq from public,anon,authenticated,service_role;

-- 9. The private bucket of the publisher's bytes. No policy is granted here: the acquisition job's
-- exact-path predicate arrives with the job kind, and tenants never read raw bytes.
do $$ begin
 if exists(select 1 from information_schema.columns where table_schema='storage' and table_name='buckets' and column_name='versioning_status') then
  execute $sql$insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types,versioning_status)
   values('market-reference','market-reference',false,52428800,array['application/zip','text/csv','application/json','application/xml','text/xml','application/pdf','text/plain','text/html'],'DISABLED')$sql$;
 else
  insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
   values('market-reference','market-reference',false,52428800,array['application/zip','text/csv','application/json','application/xml','text/xml','application/pdf','text/plain','text/html']);
 end if;
end $$;

-- 10. Commands are operator-only (postgres plus a live founder or operator), never exposed to the API.
revoke all on function private.register_market_publisher_v1(uuid,text,uuid),private.record_market_source_revision_v1(uuid,text,jsonb,uuid),
 private.market_publisher_organization_v1(),private.market_source_in_force_v1(text),private.market_version_usable_v1(uuid),
 private.market_license_valid_v1(jsonb),private.market_hosts_valid_v1(text[]),private.market_contract_in_force_v1(jsonb,date),private.guard_market_content_v1()
 from public,anon,authenticated,service_role;

comment on table private.market_acquisitions is 'Immutable receipt of market bytes acquired by the Offroad publisher (ADR 0023): source revision, URL, final URL, hash, size, type and the exact object path in the private market-reference bucket.';
comment on table private.market_observations is 'Normalized market observations with economic period, public availability and acquisition dates. Content subject to licence retention: removed only by the purge path.';
