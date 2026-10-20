-- Market reference foundation, second review round (ADR 0023). Closes what an authorized writer
-- could still do: licence arrays with a NULL or incomplete element; a seal inserted directly without
-- validation; an observation or input slipping in while a version is being sealed; a canonical text
-- that depended on the session's DateStyle; an acquisition from a disabled source or outside its
-- contract; and a purge that could be recorded without removing the content, re-approved afterwards,
-- or used as a dependency.
set search_path='';

-- 1. Every element of every licence array must pass, each predicate IS TRUE.
create or replace function private.market_license_valid_v1(p jsonb) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(case p->>'kind'
  when 'open' then
   p - array['kind','license','attribution','evidenceIds','retainAdoptedValues','storeDays'] = '{}'::jsonb
   and p->>'license'='ODbL-1.0'
   and jsonb_typeof(p->'attribution')='string' and length(btrim(p->>'attribution')) between 3 and 300
   and jsonb_typeof(p->'evidenceIds')='array' and jsonb_array_length(p->'evidenceIds') between 1 and 16
   and (select bool_and((jsonb_typeof(e)='string' and e#>>'{}' ~ '^[a-z0-9][a-z0-9._-]{0,79}$') is true) and count(distinct e)=count(*) from jsonb_array_elements(p->'evidenceIds') e)
   and jsonb_typeof(p->'retainAdoptedValues')='boolean'
   and (not p ? 'storeDays' or jsonb_typeof(p->'storeDays')='null'
    or (jsonb_typeof(p->'storeDays')='number' and (p->>'storeDays') ~ '^[1-9][0-9]{0,4}$'))
  when 'contracted' then
   p - array['kind','provider','contractReference','entitlements','policies'] = '{}'::jsonb
   and jsonb_typeof(p->'provider')='string' and p->>'provider' ~ '^[a-z0-9][a-z0-9._-]{0,79}$'
   and jsonb_typeof(p->'contractReference')='string' and length(btrim(p->>'contractReference')) between 3 and 500
   and jsonb_typeof(p->'entitlements')='array' and jsonb_array_length(p->'entitlements') between 1 and 32
   and (select bool_and((
     jsonb_typeof(e)='object'
     and e - array['product','audience','operations','outputs','validFrom','validUntil','retainAdoptedValues','storeDays'] = '{}'::jsonb
     and e ?& array['product','audience','operations','outputs','validFrom','validUntil','retainAdoptedValues','storeDays']
     and jsonb_typeof(e->'product')='string' and e->>'product' ~ '^[a-z0-9][a-z0-9._-]{0,79}$'
     and jsonb_typeof(e->'audience')='string' and e->>'audience' in ('offroad_internal','all_tenants','listed_tenants')
     and jsonb_typeof(e->'operations')='array' and jsonb_array_length(e->'operations') between 1 and 5
     and (select bool_and((jsonb_typeof(o)='string' and o#>>'{}' in ('read','process','derive','export','display')) is true) and count(distinct o)=count(*) from jsonb_array_elements(e->'operations') o)
     and jsonb_typeof(e->'outputs')='array' and jsonb_array_length(e->'outputs')<=4
     and (select coalesce(bool_and((jsonb_typeof(o)='string' and o#>>'{}' in ('screen','result','material','download')) is true),true) and count(distinct o)=count(*) from jsonb_array_elements(e->'outputs') o)
     and jsonb_typeof(e->'validFrom')='string' and (e->>'validFrom') ~ '^\d{4}-\d{2}-\d{2}$' and pg_input_is_valid(e->>'validFrom','date')
     and (jsonb_typeof(e->'validUntil')='null' or (jsonb_typeof(e->'validUntil')='string' and (e->>'validUntil') ~ '^\d{4}-\d{2}-\d{2}$'
      and pg_input_is_valid(e->>'validUntil','date') and (e->>'validUntil')>=(e->>'validFrom')))
     and jsonb_typeof(e->'retainAdoptedValues')='boolean'
     and (jsonb_typeof(e->'storeDays')='null' or (jsonb_typeof(e->'storeDays')='number' and (e->>'storeDays') ~ '^[1-9][0-9]{0,4}$'))) is true)
    from jsonb_array_elements(p->'entitlements') e)
   and jsonb_typeof(p->'policies')='array' and jsonb_array_length(p->'policies') between 1 and 32
   and (select bool_and((
     jsonb_typeof(x)='object'
     and x - array['instrument','version','evidenceId','sha256','effectiveFrom','effectiveUntil'] = '{}'::jsonb
     and x ?& array['instrument','version','evidenceId','sha256','effectiveFrom','effectiveUntil']
     and jsonb_typeof(x->'instrument')='string' and length(btrim(x->>'instrument')) between 1 and 200
     and jsonb_typeof(x->'version')='string' and length(btrim(x->>'version')) between 1 and 40
     and jsonb_typeof(x->'evidenceId')='string' and x->>'evidenceId' ~ '^[a-z0-9][a-z0-9._-]{0,79}$'
     and jsonb_typeof(x->'sha256')='string' and x->>'sha256' ~ '^[a-f0-9]{64}$'
     and jsonb_typeof(x->'effectiveFrom')='string' and (x->>'effectiveFrom') ~ '^\d{4}-\d{2}-\d{2}$' and pg_input_is_valid(x->>'effectiveFrom','date')
     and (jsonb_typeof(x->'effectiveUntil')='null' or (jsonb_typeof(x->'effectiveUntil')='string' and (x->>'effectiveUntil') ~ '^\d{4}-\d{2}-\d{2}$'
      and pg_input_is_valid(x->>'effectiveUntil','date') and (x->>'effectiveUntil')>=(x->>'effectiveFrom')))) is true)
    from jsonb_array_elements(p->'policies') x)
  else false end,false);
$$;

-- 2. The canonical text no longer depends on DateStyle: every date and instant has a fixed format.
create or replace function private.market_version_canonical_v1(p_version uuid) returns text
language sql stable security definer set search_path='' as $$
 select concat_ws(E'\n',
  'parser:'||v.parser_version,
  'methodology:'||coalesce(v.methodology::text,'null'),
  'inputs:'||coalesce((select string_agg(coalesce('a:'||i.acquisition_id::text,'v:'||i.dependency_version_id::text),',' order by coalesce('a:'||i.acquisition_id::text,'v:'||i.dependency_version_id::text))
   from private.market_version_inputs i where i.version_id=v.id),''),
  coalesce((select string_agg(concat_ws('|',coalesce(to_char(o.period_start,'YYYY-MM-DD'),''),to_char(o.period_end,'YYYY-MM-DD'),
    to_char(o.available_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),to_char(o.acquired_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    trim_scale(o.value)::text,o.unit,o.scale),E'\n' order by o.period_end,coalesce(o.period_start,'0001-01-01'::date))
   from private.market_observations o where o.version_id=v.id),''))
 from private.market_versions v where v.id=p_version;
$$;

-- 3. One lock protocol for a version: every writer of its content, its seal and its purge takes the
-- version row first, so a seal and a late insert cannot interleave.
create or replace function private.guard_market_version_open_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare v private.market_versions;lo private.market_logical_objects;a private.market_acquisitions;begin
 select * into v from private.market_versions where id=new.version_id for update;
 if not found then raise exception 'market_version_unknown' using errcode='23503';end if;
 if private.market_version_sealed_v1(new.version_id) then raise exception 'market_version_sealed' using errcode='23514';end if;
 if tg_table_name='market_version_inputs' then
  select * into lo from private.market_logical_objects where logical_id=v.logical_id;
  if lo.category in ('observed','consensus','document_fact') then
   if new.acquisition_id is null then raise exception 'market_direct_version_needs_acquisition' using errcode='22023';end if;
   select * into a from private.market_acquisitions where id=new.acquisition_id;
   if a.source_id<>lo.source_id then raise exception 'market_input_other_source' using errcode='22023';end if;
  else
   -- A derived object reads sealed, quality-approved versions with content only, never itself.
   if new.dependency_version_id is null or new.dependency_version_id=new.version_id
   or not private.market_version_quality_approved_v1(new.dependency_version_id)
   or not exists(select 1 from private.market_observations x where x.version_id=new.dependency_version_id)
   then raise exception 'market_derived_version_needs_approved_dependency' using errcode='22023';end if;
  end if;
 end if;
 return new;
end $$;

-- 4. The seal is validated on insert, however it is inserted.
create function private.guard_market_version_seal_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare v private.market_versions;lo private.market_logical_objects;n_obs integer;n_in integer;begin
 select * into v from private.market_versions where id=new.version_id for update;
 if not found then raise exception 'market_version_unknown' using errcode='23503';end if;
 if exists(select 1 from private.market_version_seals where version_id=new.version_id) then raise exception 'market_version_sealed' using errcode='23514';end if;
 select * into lo from private.market_logical_objects where logical_id=v.logical_id;
 select count(*) into n_obs from private.market_observations where version_id=new.version_id;
 select count(*) into n_in from private.market_version_inputs where version_id=new.version_id;
 if n_obs=0 or n_in=0 or new.observation_count<>n_obs or new.input_count<>n_in then raise exception 'market_version_seal_counts' using errcode='22023';end if;
 if encode(extensions.digest(convert_to(private.market_version_canonical_v1(new.version_id),'UTF8'),'sha256'),'hex')<>v.sha256 then
  raise exception 'market_version_fingerprint_mismatch' using errcode='22023';end if;
 if lo.category in ('observed','consensus','document_fact') then
  if exists(select 1 from private.market_version_inputs i join private.market_acquisitions a on a.id=i.acquisition_id
   join private.market_source_revisions s on s.source_id=a.source_id and s.revision=a.source_revision
   where i.version_id=new.version_id and s.license<>v.license) then raise exception 'market_version_license_mismatch' using errcode='22023';end if;
  if exists(select 1 from private.market_observations o where o.version_id=new.version_id and not exists(
   select 1 from private.market_version_inputs i join private.market_acquisitions a on a.id=i.acquisition_id where i.version_id=new.version_id and a.acquired_at=o.acquired_at))
  then raise exception 'market_observation_acquisition_mismatch' using errcode='22023';end if;
 else
  if exists(select 1 from private.market_version_inputs i join private.market_versions d on d.id=i.dependency_version_id
   where i.version_id=new.version_id and (d.license<>v.license or not private.market_version_quality_approved_v1(d.id)
    or not exists(select 1 from private.market_observations x where x.version_id=d.id)))
  then raise exception 'market_version_dependency_invalid' using errcode='22023';end if;
  -- Each dependency bounds the derived dates from below; every dependency has content (checked above).
  if exists(select 1 from private.market_observations o, private.market_version_inputs i
   where o.version_id=new.version_id and i.version_id=new.version_id and (
    o.available_at<(select max(x.available_at) from private.market_observations x where x.version_id=i.dependency_version_id)
    or o.acquired_at<(select max(x.acquired_at) from private.market_observations x where x.version_id=i.dependency_version_id)))
  then raise exception 'market_derived_dates_before_dependencies' using errcode='22023';end if;
 end if;
 return new;
end $$;
create trigger market_version_seals_validate before insert on private.market_version_seals for each row execute function private.guard_market_version_seal_v1();

create or replace function private.seal_market_version_v1(p_version uuid) returns void
language plpgsql security definer set search_path='' as $$
declare n_obs integer;n_in integer;begin
 perform 1 from private.market_versions where id=p_version for update;
 if not found then raise exception 'market_version_unknown' using errcode='23503';end if;
 select count(*) into n_obs from private.market_observations where version_id=p_version;
 select count(*) into n_in from private.market_version_inputs where version_id=p_version;
 insert into private.market_version_seals(version_id,observation_count,input_count) values(p_version,n_obs,n_in);
end $$;

-- 5. An acquisition is recorded only under a revision that was in force, enabled and, when contracted,
-- within an entitlement on the acquisition date, and that was recorded before the acquisition.
create or replace function private.guard_market_acquisition_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare s private.market_source_revisions;begin
 if new.publisher_organization_id is distinct from private.market_publisher_organization_v1() then raise exception 'market_acquisition_not_publisher' using errcode='42501';end if;
 if new.acquired_at>clock_timestamp()+interval '5 minutes' then raise exception 'market_acquisition_in_future' using errcode='22023';end if;
 if split_part(new.object_path,'/',1)<>new.source_id then raise exception 'market_acquisition_path_mismatch' using errcode='22023';end if;
 select * into s from private.market_source_revisions where source_id=new.source_id and revision=new.source_revision;
 if not found or s.recorded_at>new.acquired_at or not s.enabled
 or not private.market_contract_in_force_v1(s.license,(new.acquired_at at time zone 'America/Sao_Paulo')::date)
 or exists(select 1 from private.market_source_revisions later where later.source_id=new.source_id and later.revision>new.source_revision and later.recorded_at<=new.acquired_at)
 then raise exception 'market_source_not_acquirable' using errcode='42501';end if;
 return new;
end $$;

-- 6. Purge is terminal and complete. A purged version takes no later event; a purge event commits only
-- when the version has no observation left; content and purge serialize on the version row.
create or replace function private.guard_market_event_v1() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.subject_kind='version' then
  if new.subject_id !~ '^[0-9a-f-]{36}$' or not exists(select 1 from private.market_versions where id=new.subject_id::uuid) then raise exception 'market_event_subject_unknown' using errcode='23503';end if;
  perform 1 from private.market_versions where id=new.subject_id::uuid for update;
  if exists(select 1 from private.market_events e where e.subject_kind='version' and e.subject_id=new.subject_id and e.event='purged') then
   raise exception 'market_version_purged' using errcode='23514';end if;
  if new.event='approved' and not private.market_version_sealed_v1(new.subject_id::uuid) then raise exception 'market_version_not_sealed' using errcode='22023';end if;
 elsif new.subject_kind='acquisition' then
  if new.subject_id !~ '^[0-9a-f-]{36}$' or not exists(select 1 from private.market_acquisitions where id=new.subject_id::uuid) then raise exception 'market_event_subject_unknown' using errcode='23503';end if;
 elsif not exists(select 1 from private.market_source_revisions where source_id=new.subject_id) then raise exception 'market_event_subject_unknown' using errcode='23503';
 end if;
 new.transaction_id:=txid_current();
 return new;
end $$;

create function private.check_market_purge_complete_v1() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.subject_kind='version' and new.event='purged' and exists(select 1 from private.market_observations where version_id=new.subject_id::uuid) then
  raise exception 'market_purge_incomplete' using errcode='23514';end if;
 return null;
end $$;
create constraint trigger market_events_purge_complete after insert on private.market_events deferrable initially deferred
 for each row execute function private.check_market_purge_complete_v1();

create or replace function private.guard_market_content_v1() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then
  perform 1 from private.market_versions where id=old.version_id for update;
  if exists(select 1 from private.market_events e where e.subject_kind='version' and e.subject_id=old.version_id::text
   and e.event='purged' and e.transaction_id=txid_current()) then return old;end if;
 end if;
 raise exception 'market_content_immutable' using errcode='23514';
end $$;

-- 7. The publisher keeps the name of its registration command, so a replay compares with the receipt.
alter table private.market_publisher add column registered_name text not null check(length(btrim(registered_name)) between 3 and 200);

create or replace function private.register_market_publisher_v1(p_command uuid,p_name text,p_actor uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
declare existing private.market_publisher;org uuid;begin
 perform private.require_platform_principal_v1(p_actor,true);
 if p_command is null or p_name is null or length(btrim(p_name)) not between 3 and 200 then raise exception 'market_publisher_invalid' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('platform-command:'||p_command::text,0));
 perform pg_advisory_xact_lock(hashtextextended('market-publisher',0));
 select * into existing from private.market_publisher;
 if found then
  if existing.command_id=p_command and existing.registered_by=p_actor and existing.registered_name=btrim(p_name) then return existing.organization_id;end if;
  raise exception 'market_publisher_exists' using errcode='23505';
 end if;
 insert into public.organizations(organization_type,name,legal_name,country_code,created_by,pipeline_enabled,model_monthly_ceiling_usd)
 values('offroad',btrim(p_name),btrim(p_name),'BR',p_actor,false,0) returning id into org;
 insert into private.market_publisher(organization_id,registered_by,command_id,registered_name) values(org,p_actor,p_command,btrim(p_name));
 return org;
end $$;

revoke all on function private.market_license_valid_v1(jsonb),private.market_version_canonical_v1(uuid),private.guard_market_version_open_v1(),
 private.guard_market_version_seal_v1(),private.seal_market_version_v1(uuid),private.guard_market_acquisition_v1(),private.guard_market_event_v1(),
 private.check_market_purge_complete_v1(),private.guard_market_content_v1(),private.register_market_publisher_v1(uuid,text,uuid)
 from public,anon,authenticated,service_role;
