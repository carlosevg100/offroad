-- Market reference foundation, hardening from its independent review (ADR 0023). The ledger was
-- closed to the API and unused; this migration tightens what its authorized writers may record:
-- strict licence and host validation that never accepts NULL; command replay compared by the full
-- definition's fingerprint under a lock; links that prove identity (publisher, source, supersession
-- within one object, direct inputs from the object's own source, derived inputs only from sealed
-- versions); a seal that fixes a version's observations and inputs to its declared fingerprint, with
-- licence and date coherence; events that name existing subjects and approve only sealed versions;
-- finite values and ordered dates; and a purge that needs a purge event of the same transaction
-- instead of a session flag.
set search_path='';

-- 1. Licence validation returns true or false only, field by field.
create or replace function private.market_license_valid_v1(p jsonb) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(case p->>'kind'
  when 'open' then
   p - array['kind','license','attribution','evidenceIds','retainAdoptedValues','storeDays'] = '{}'::jsonb
   and p->>'license'='ODbL-1.0'
   and jsonb_typeof(p->'attribution')='string' and length(btrim(p->>'attribution')) between 3 and 300
   and jsonb_typeof(p->'evidenceIds')='array' and jsonb_array_length(p->'evidenceIds') between 1 and 16
   and (select bool_and(jsonb_typeof(e)='string' and e#>>'{}' ~ '^[a-z0-9][a-z0-9._-]{0,79}$') and count(distinct e)=count(*) from jsonb_array_elements(p->'evidenceIds') e)
   and jsonb_typeof(p->'retainAdoptedValues')='boolean'
   and (not p ? 'storeDays' or jsonb_typeof(p->'storeDays')='null'
    or (jsonb_typeof(p->'storeDays')='number' and (p->>'storeDays') ~ '^[1-9][0-9]{0,4}$'))
  when 'contracted' then
   p - array['kind','provider','contractReference','entitlements','policies'] = '{}'::jsonb
   and jsonb_typeof(p->'provider')='string' and p->>'provider' ~ '^[a-z0-9][a-z0-9._-]{0,79}$'
   and jsonb_typeof(p->'contractReference')='string' and length(btrim(p->>'contractReference')) between 3 and 500
   and jsonb_typeof(p->'entitlements')='array' and jsonb_array_length(p->'entitlements') between 1 and 32
   and (select bool_and(
     jsonb_typeof(e)='object'
     and e - array['product','audience','operations','outputs','validFrom','validUntil','retainAdoptedValues','storeDays'] = '{}'::jsonb
     and jsonb_typeof(e->'product')='string' and e->>'product' ~ '^[a-z0-9][a-z0-9._-]{0,79}$'
     and e->>'audience' in ('offroad_internal','all_tenants','listed_tenants')
     and jsonb_typeof(e->'operations')='array' and jsonb_array_length(e->'operations') between 1 and 5
     and (select bool_and(o#>>'{}' in ('read','process','derive','export','display')) and count(distinct o)=count(*) from jsonb_array_elements(e->'operations') o)
     and jsonb_typeof(e->'outputs')='array'
     and (select coalesce(bool_and(o#>>'{}' in ('screen','result','material','download')),true) and count(distinct o)=count(*) from jsonb_array_elements(e->'outputs') o)
     and jsonb_typeof(e->'validFrom')='string' and (e->>'validFrom') ~ '^\d{4}-\d{2}-\d{2}$' and pg_input_is_valid(e->>'validFrom','date')
     and (jsonb_typeof(e->'validUntil')='null' or (jsonb_typeof(e->'validUntil')='string' and (e->>'validUntil') ~ '^\d{4}-\d{2}-\d{2}$'
      and pg_input_is_valid(e->>'validUntil','date') and (e->>'validUntil')>=(e->>'validFrom')))
     and jsonb_typeof(e->'retainAdoptedValues')='boolean'
     and (jsonb_typeof(e->'storeDays')='null' or (jsonb_typeof(e->'storeDays')='number' and (e->>'storeDays') ~ '^[1-9][0-9]{0,4}$')))
    from jsonb_array_elements(p->'entitlements') e)
   and jsonb_typeof(p->'policies')='array' and jsonb_array_length(p->'policies') between 1 and 32
   and (select bool_and(
     jsonb_typeof(x)='object'
     and x - array['instrument','version','evidenceId','sha256','effectiveFrom','effectiveUntil'] = '{}'::jsonb
     and jsonb_typeof(x->'instrument')='string' and length(btrim(x->>'instrument')) between 1 and 200
     and jsonb_typeof(x->'version')='string' and length(btrim(x->>'version')) between 1 and 40
     and jsonb_typeof(x->'evidenceId')='string' and x->>'evidenceId' ~ '^[a-z0-9][a-z0-9._-]{0,79}$'
     and jsonb_typeof(x->'sha256')='string' and x->>'sha256' ~ '^[a-f0-9]{64}$'
     and jsonb_typeof(x->'effectiveFrom')='string' and (x->>'effectiveFrom') ~ '^\d{4}-\d{2}-\d{2}$' and pg_input_is_valid(x->>'effectiveFrom','date')
     and (jsonb_typeof(x->'effectiveUntil')='null' or (jsonb_typeof(x->'effectiveUntil')='string' and (x->>'effectiveUntil') ~ '^\d{4}-\d{2}-\d{2}$'
      and pg_input_is_valid(x->>'effectiveUntil','date') and (x->>'effectiveUntil')>=(x->>'effectiveFrom'))))
    from jsonb_array_elements(p->'policies') x)
  else false end,false);
$$;

-- Hosts: no NULL, no duplicate, bounded length, a public DNS name only (no literal or embedded IPv4,
-- no IPv6, no local or reserved suffix). DNS resolution and redirects are checked by the job.
create or replace function private.market_hosts_valid_v1(p text[]) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(p is not null and cardinality(p) between 1 and 8 and array_position(p,null) is null
  and (select count(distinct h)=count(*) from unnest(p) h)
  and (select bool_and(length(h)<=253
   and h ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
   and h !~ '(^|[.-])[0-9]{1,3}([.-][0-9]{1,3}){3}([.-]|$)'
   and h !~ '(^|\.)(localhost|localdomain|internal|local|lan|home|corp|intranet|test|invalid|example|arpa)$') from unnest(p) h),false);
$$;

alter table private.market_source_revisions drop constraint market_source_license_valid;
alter table private.market_source_revisions add constraint market_source_license_valid check(private.market_license_valid_v1(license) is true);
alter table private.market_source_revisions drop constraint market_source_hosts_valid;
alter table private.market_source_revisions add constraint market_source_hosts_valid check(private.market_hosts_valid_v1(allowed_hosts) is true);
alter table private.market_versions drop constraint market_versions_license_check;
alter table private.market_versions add constraint market_versions_license_valid check(private.market_license_valid_v1(license) is true);

-- 2. Command replay is decided by the full definition's fingerprint, under a lock taken first.
alter table private.market_source_revisions add column definition_sha256 text not null check(definition_sha256 ~ '^[a-f0-9]{64}$');

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
 perform pg_advisory_xact_lock(hashtextextended('market-source:'||p_source_id,0));
 -- A licensed source is never enabled outside a contract in force.
 if (p_definition->>'enabled')::boolean and not private.market_contract_in_force_v1(p_definition->'license',(clock_timestamp() at time zone 'America/Sao_Paulo')::date)
 then raise exception 'market_source_contract_not_in_force' using errcode='42501';end if;
 select coalesce(max(revision),0)+1 into next_revision from private.market_source_revisions where source_id=p_source_id;
 insert into private.market_source_revisions(source_id,revision,registry_id,license,allowed_hosts,calendar,expected_publication,maximum_age_hours,enabled,reason,recorded_by,command_id,definition_sha256)
 values(p_source_id,next_revision,p_definition->>'registryId',p_definition->'license',
  array(select jsonb_array_elements_text(p_definition->'allowedHosts')),p_definition->>'calendar',(p_definition->>'expectedPublication')::time,
  (p_definition->>'maximumAgeHours')::integer,(p_definition->>'enabled')::boolean,p_definition->>'reason',p_actor,p_command,fp);
 return next_revision;
end $$;

create or replace function private.register_market_publisher_v1(p_command uuid,p_name text,p_actor uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
declare existing private.market_publisher;org uuid;existing_name text;begin
 perform private.require_platform_principal_v1(p_actor,true);
 if p_command is null or p_name is null or length(btrim(p_name)) not between 3 and 200 then raise exception 'market_publisher_invalid' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('platform-command:'||p_command::text,0));
 perform pg_advisory_xact_lock(hashtextextended('market-publisher',0));
 select * into existing from private.market_publisher;
 if found then
  select name into existing_name from public.organizations where id=existing.organization_id;
  if existing.command_id=p_command and existing.registered_by=p_actor and existing_name=btrim(p_name) then return existing.organization_id;end if;
  raise exception 'market_publisher_exists' using errcode='23505';
 end if;
 insert into public.organizations(organization_type,name,legal_name,country_code,created_by,pipeline_enabled,model_monthly_ceiling_usd)
 values('offroad',btrim(p_name),btrim(p_name),'BR',p_actor,false,0) returning id into org;
 insert into private.market_publisher(organization_id,registered_by,command_id) values(org,p_actor,p_command);
 return org;
end $$;

-- A source can be acquired on a date only while enabled and, when contracted, within an entitlement.
create function private.market_source_acquirable_v1(p_source_id text,p_on date) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select s.enabled and private.market_contract_in_force_v1(s.license,p_on)
  from private.market_source_revisions s where s.source_id=p_source_id order by s.revision desc limit 1),false);
$$;

-- 3. Links that prove identity.
create function private.guard_market_logical_object_v1() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from private.market_source_revisions s where s.source_id=new.source_id) then raise exception 'market_source_unknown' using errcode='23503';end if;
 return new;
end $$;
create trigger market_logical_objects_source before insert on private.market_logical_objects for each row execute function private.guard_market_logical_object_v1();

alter table private.market_acquisitions add constraint market_acquisitions_finite check(isfinite(acquired_at));
create function private.guard_market_acquisition_v1() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.publisher_organization_id is distinct from private.market_publisher_organization_v1() then raise exception 'market_acquisition_not_publisher' using errcode='42501';end if;
 if new.acquired_at>clock_timestamp()+interval '5 minutes' then raise exception 'market_acquisition_in_future' using errcode='22023';end if;
 if split_part(new.object_path,'/',1)<>new.source_id then raise exception 'market_acquisition_path_mismatch' using errcode='22023';end if;
 return new;
end $$;
create trigger market_acquisitions_publisher before insert on private.market_acquisitions for each row execute function private.guard_market_acquisition_v1();

alter table private.market_versions add constraint market_versions_logical_identity unique(logical_id,id);
alter table private.market_versions add constraint market_versions_supersedes_same_object foreign key(logical_id,supersedes) references private.market_versions(logical_id,id);

-- 4. The seal: a version's observations and inputs are fixed to its declared fingerprint, once.
create table private.market_version_seals(
 version_id uuid primary key references private.market_versions(id),
 observation_count integer not null check(observation_count>0),
 input_count integer not null check(input_count>0),
 sealed_at timestamptz not null default clock_timestamp());

-- The canonical content of a version, the text its fingerprint is taken over: the parser and the
-- methodology, the sorted inputs, then the sorted observations with each value at its minimal scale.
create function private.market_version_canonical_v1(p_version uuid) returns text
language sql stable security definer set search_path='' as $$
 select concat_ws(E'\n',
  'parser:'||v.parser_version,
  'methodology:'||coalesce(v.methodology::text,'null'),
  'inputs:'||coalesce((select string_agg(coalesce('a:'||i.acquisition_id::text,'v:'||i.dependency_version_id::text),',' order by coalesce('a:'||i.acquisition_id::text,'v:'||i.dependency_version_id::text))
   from private.market_version_inputs i where i.version_id=v.id),''),
  coalesce((select string_agg(concat_ws('|',coalesce(o.period_start::text,''),o.period_end::text,
    to_char(o.available_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),to_char(o.acquired_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    trim_scale(o.value)::text,o.unit,o.scale),E'\n' order by o.period_end,coalesce(o.period_start,'0001-01-01'::date))
   from private.market_observations o where o.version_id=v.id),''))
 from private.market_versions v where v.id=p_version;
$$;

create function private.market_version_sealed_v1(p_version uuid) returns boolean
language sql stable security definer set search_path='' as $$ select exists(select 1 from private.market_version_seals where version_id=p_version) $$;

create function private.guard_market_version_open_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare v private.market_versions;lo private.market_logical_objects;a private.market_acquisitions;begin
 if private.market_version_sealed_v1(new.version_id) then raise exception 'market_version_sealed' using errcode='23514';end if;
 if tg_table_name='market_version_inputs' then
  select * into v from private.market_versions where id=new.version_id;
  select * into lo from private.market_logical_objects where logical_id=v.logical_id;
  if lo.category in ('observed','consensus','document_fact') then
   -- A direct object reads acquisitions of its own source only.
   if new.acquisition_id is null then raise exception 'market_direct_version_needs_acquisition' using errcode='22023';end if;
   select * into a from private.market_acquisitions where id=new.acquisition_id;
   if a.source_id<>lo.source_id then raise exception 'market_input_other_source' using errcode='22023';end if;
  else
   -- A derived object reads sealed versions only, never itself; sealing forbids later inputs, so no cycle can form.
   if new.dependency_version_id is null or new.dependency_version_id=new.version_id or not private.market_version_sealed_v1(new.dependency_version_id)
   then raise exception 'market_derived_version_needs_sealed_dependency' using errcode='22023';end if;
  end if;
 end if;
 return new;
end $$;
create trigger market_version_inputs_open before insert on private.market_version_inputs for each row execute function private.guard_market_version_open_v1();
create trigger market_observations_open before insert on private.market_observations for each row execute function private.guard_market_version_open_v1();

-- Sealing checks content against the fingerprint, licence coherence with the inputs, and dates:
-- a direct observation was acquired by one of its input acquisitions; a derived observation is
-- available and acquired no earlier than the dependencies it was computed from.
create function private.seal_market_version_v1(p_version uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v private.market_versions;lo private.market_logical_objects;n_obs integer;n_in integer;begin
 select * into v from private.market_versions where id=p_version for update;
 if not found then raise exception 'market_version_unknown' using errcode='23503';end if;
 if private.market_version_sealed_v1(p_version) then raise exception 'market_version_sealed' using errcode='23514';end if;
 select * into lo from private.market_logical_objects where logical_id=v.logical_id;
 select count(*) into n_obs from private.market_observations where version_id=p_version;
 select count(*) into n_in from private.market_version_inputs where version_id=p_version;
 if n_obs=0 or n_in=0 then raise exception 'market_version_empty' using errcode='22023';end if;
 if encode(extensions.digest(convert_to(private.market_version_canonical_v1(p_version),'UTF8'),'sha256'),'hex')<>v.sha256 then
  raise exception 'market_version_fingerprint_mismatch' using errcode='22023';end if;
 if lo.category in ('observed','consensus','document_fact') then
  if exists(select 1 from private.market_version_inputs i join private.market_acquisitions a on a.id=i.acquisition_id
   join private.market_source_revisions s on s.source_id=a.source_id and s.revision=a.source_revision
   where i.version_id=p_version and s.license<>v.license) then raise exception 'market_version_license_mismatch' using errcode='22023';end if;
  if exists(select 1 from private.market_observations o where o.version_id=p_version and not exists(
   select 1 from private.market_version_inputs i join private.market_acquisitions a on a.id=i.acquisition_id where i.version_id=p_version and a.acquired_at=o.acquired_at))
  then raise exception 'market_observation_acquisition_mismatch' using errcode='22023';end if;
 else
  if exists(select 1 from private.market_version_inputs i join private.market_versions d on d.id=i.dependency_version_id
   where i.version_id=p_version and d.license<>v.license) then raise exception 'market_version_license_mismatch' using errcode='22023';end if;
  if exists(select 1 from private.market_observations o where o.version_id=p_version and (
   o.available_at<(select max(x.available_at) from private.market_version_inputs i join private.market_observations x on x.version_id=i.dependency_version_id where i.version_id=p_version)
   or o.acquired_at<(select max(x.acquired_at) from private.market_version_inputs i join private.market_observations x on x.version_id=i.dependency_version_id where i.version_id=p_version)))
  then raise exception 'market_derived_dates_before_dependencies' using errcode='22023';end if;
 end if;
 insert into private.market_version_seals(version_id,observation_count,input_count) values(p_version,n_obs,n_in);
end $$;

-- 5. Finite values and ordered dates. Projections may have an economic period in the future; the
-- public availability is never after the acquisition.
alter table private.market_observations add constraint market_observations_finite check(
 isfinite(available_at) and isfinite(acquired_at) and isfinite(period_end) and (period_start is null or isfinite(period_start))
 and value<>'NaN'::numeric and value<>'Infinity'::numeric and value<>'-Infinity'::numeric and available_at<=acquired_at);

-- 6. Events name existing subjects, approve only sealed versions, and carry their transaction.
alter table private.market_events add column transaction_id bigint not null default txid_current();
create function private.guard_market_event_v1() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.subject_kind='version' then
  if new.subject_id !~ '^[0-9a-f-]{36}$' or not exists(select 1 from private.market_versions where id=new.subject_id::uuid) then raise exception 'market_event_subject_unknown' using errcode='23503';end if;
  if new.event='approved' and not private.market_version_sealed_v1(new.subject_id::uuid) then raise exception 'market_version_not_sealed' using errcode='22023';end if;
 elsif new.subject_kind='acquisition' then
  if new.subject_id !~ '^[0-9a-f-]{36}$' or not exists(select 1 from private.market_acquisitions where id=new.subject_id::uuid) then raise exception 'market_event_subject_unknown' using errcode='23503';end if;
 elsif not exists(select 1 from private.market_source_revisions where source_id=new.subject_id) then raise exception 'market_event_subject_unknown' using errcode='23503';
 end if;
 new.transaction_id:=txid_current();
 return new;
end $$;
create trigger market_events_subject before insert on private.market_events for each row execute function private.guard_market_event_v1();

-- The quality state of a version only: sealed, approved and not later quarantined, revoked or purged.
-- It is not authorization to use: licence, contract and the tenant's delivery are checked by the resolver.
drop function private.market_version_usable_v1(uuid);
create function private.market_version_quality_approved_v1(p_version uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.market_version_sealed_v1(p_version) and coalesce((select e.event='approved' from private.market_events e
  where e.subject_kind='version' and e.subject_id=p_version::text and e.event in ('approved','quarantined','revoked','purged')
  order by e.sequence desc limit 1),false);
$$;

-- 7. Purge needs a purge event for the version in the same transaction; no session flag is trusted.
create or replace function private.guard_market_content_v1() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' and exists(select 1 from private.market_events e where e.subject_kind='version' and e.subject_id=old.version_id::text
  and e.event='purged' and e.transaction_id=txid_current()) then return old;end if;
 raise exception 'market_content_immutable' using errcode='23514';
end $$;

-- Closed surfaces.
do $$ declare t text;begin
 execute 'create trigger market_version_seals_immutable before update or delete on private.market_version_seals for each row execute function private.guard_contribution_immutable_v1()';
 execute 'alter table private.market_version_seals enable row level security';
 execute 'alter table private.market_version_seals force row level security';
 execute 'create policy market_version_seals_deny on private.market_version_seals as restrictive for all to public using(false) with check(false)';
 execute 'revoke all on private.market_version_seals from public,anon,authenticated,service_role';
 execute 'create trigger market_version_seals_truncate_guard before truncate on private.market_version_seals for each statement execute function private.guard_platform_ledger_truncate_v1()';
end $$;
revoke all on function private.market_license_valid_v1(jsonb),private.market_hosts_valid_v1(text[]),private.record_market_source_revision_v1(uuid,text,jsonb,uuid),
 private.register_market_publisher_v1(uuid,text,uuid),private.market_source_acquirable_v1(text,date),private.guard_market_logical_object_v1(),
 private.guard_market_acquisition_v1(),private.market_version_canonical_v1(uuid),private.market_version_sealed_v1(uuid),private.guard_market_version_open_v1(),
 private.seal_market_version_v1(uuid),private.guard_market_event_v1(),private.market_version_quality_approved_v1(uuid),private.guard_market_content_v1()
 from public,anon,authenticated,service_role;
