-- Stage 8: coexisting observations and immutable metric definitions.
-- Decimal asserted values are in normalized base units; value_scale records source scale.
-- No adoption column exists. Legacy review flags are provenance, not authority.
set search_path='';
create table public.metric_definitions (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 dossier_id uuid, dossier_reference uuid not null, metric_key text not null check(length(btrim(metric_key)) between 1 and 300),
 kind text not null check(kind in ('reported','managerial','contractual')),
 created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,id), foreign key(organization_id,dossier_id) references public.dossiers(organization_id,id) on delete set null (dossier_id)
);
create table public.definition_versions (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 metric_definition_id uuid not null, version_no integer not null check(version_no>0),
 definition text not null check(length(btrim(definition)) between 1 and 20000),
 contract_source_version_id uuid, contract_rights_version_id uuid, contract_anchor jsonb,
 created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,id), unique(organization_id,metric_definition_id,version_no),
 foreign key(organization_id,metric_definition_id) references public.metric_definitions(organization_id,id),
 foreign key(organization_id,contract_source_version_id,contract_rights_version_id) references private.source_rights_versions(organization_id,source_version_id,id),
 check(num_nonnulls(contract_source_version_id,contract_rights_version_id,contract_anchor) in (0,3)),
 check(contract_anchor is null or (jsonb_typeof(contract_anchor)='object' and contract_anchor<>'{}'::jsonb))
);
create table public.observations (
 id uuid primary key default gen_random_uuid(), sequence bigint generated always as identity unique, organization_id uuid not null references public.organizations(id),
 dossier_id uuid, dossier_reference uuid not null, entity_id uuid references public.entities(id), field_path text not null check(length(btrim(field_path)) between 1 and 300),
 perimeter text, period_start date, period_end date, currency text check(currency ~ '^[A-Z]{3}$'), unit text,
 value_scale numeric check(value_scale>0 and value_scale::text not in ('NaN','Infinity','-Infinity')), scenario text, definition_version_id uuid,
 value_type text not null check(value_type in ('text','number','date','boolean','list')),
 asserted_value jsonb not null, source_version_id uuid, source_rights_version_id uuid, source_anchor jsonb not null check(jsonb_typeof(source_anchor)='object'),
 verification_state text not null check(verification_state in ('asserted','anchor_verified','legacy_unverified')),
 incomplete_reasons text[] not null, supersedes_id uuid,
 legacy_table text check(legacy_table in ('intake_field_candidates','evidence_facts','financial_line_items')), legacy_record_id uuid,
 legacy_provenance jsonb not null default '{}'::jsonb check(jsonb_typeof(legacy_provenance)='object'),
 request_id uuid not null, request_fingerprint text not null check(request_fingerprint ~ '^[a-f0-9]{64}$'),
 created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,id), unique(organization_id,dossier_id,request_id),
 foreign key(organization_id,dossier_id) references public.dossiers(organization_id,id) on delete set null (dossier_id),
 foreign key(organization_id,source_version_id) references public.source_versions(organization_id,id),
 foreign key(organization_id,source_version_id,source_rights_version_id) references private.source_rights_versions(organization_id,source_version_id,id),
 foreign key(organization_id,definition_version_id) references public.definition_versions(organization_id,id),
 foreign key(organization_id,supersedes_id) references public.observations(organization_id,id),
 check(period_start is null or period_end is null or period_start<=period_end),
 check(num_nonnulls(legacy_table,legacy_record_id) in (0,2)),
 check(legacy_table is not null or (source_version_id is not null and source_rights_version_id is not null and source_anchor<>'{}'::jsonb)),
 check(source_rights_version_id is null or source_version_id is not null)
);
create index metric_definitions_dossier_idx on public.metric_definitions(organization_id,dossier_id);
create index metric_definitions_actor_idx on public.metric_definitions(created_by);
create index definition_versions_contract_idx on public.definition_versions(organization_id,contract_source_version_id,contract_rights_version_id);
create index definition_versions_actor_idx on public.definition_versions(created_by);
create index observations_dossier_idx on public.observations(organization_id,dossier_id,field_path,period_end);
create index observations_entity_idx on public.observations(entity_id);
create index observations_source_idx on public.observations(organization_id,source_version_id,source_rights_version_id);
create index observations_definition_idx on public.observations(organization_id,definition_version_id);
create index observations_supersedes_idx on public.observations(organization_id,supersedes_id);
create index observations_actor_idx on public.observations(created_by);
create index observations_legacy_idx on public.observations(organization_id,legacy_table,legacy_record_id,sequence);

-- A later widening of a source license cannot erase the restriction pinned on a derivative.
create function private.observation_source_read_v1(p_org uuid,p_source uuid,p_rights uuid)
returns boolean language sql volatile security definer set search_path='' as $$
 select private.source_use_allowed_v1(p_org,p_source,auth.uid(),'read','analysis') and exists(
 select 1 from private.source_rights_versions r where r.organization_id=p_org and r.source_version_id=p_source and r.id=p_rights
 and 'read'=any(r.operations) and 'analysis'=any(r.purposes) and r.valid_from<=clock_timestamp()
 and (r.expires_at is null or r.expires_at>clock_timestamp()) and (r.store_until is null or r.store_until>clock_timestamp()));
$$;
create function private.can_read_definition_version_v1(p_org uuid,p_version uuid)
returns boolean language sql volatile security definer set search_path='' as $$
 select exists(select 1 from public.definition_versions v join public.metric_definitions m on m.organization_id=v.organization_id and m.id=v.metric_definition_id
 where v.organization_id=p_org and v.id=p_version and private.can_read_dossier_v1(m.dossier_id)
 and (v.contract_source_version_id is null or private.observation_source_read_v1(p_org,v.contract_source_version_id,v.contract_rights_version_id)));
$$;
create function private.can_read_observation_v1(p_org uuid,p_id uuid)
returns boolean language sql volatile security definer set search_path='' as $$
 select exists(select 1 from public.observations o where o.organization_id=p_org and o.id=p_id
 and private.can_read_dossier_v1(o.dossier_id)
 and (o.entity_id is null or private.can_read_entity_v1(o.entity_id))
 and (o.source_version_id is null or private.observation_source_read_v1(p_org,o.source_version_id,o.source_rights_version_id))
 and (o.definition_version_id is null or private.can_read_definition_version_v1(p_org,o.definition_version_id)));
$$;
revoke all on function private.observation_source_read_v1(uuid,uuid,uuid),private.can_read_definition_version_v1(uuid,uuid),private.can_read_observation_v1(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.can_read_definition_version_v1(uuid,uuid),private.can_read_observation_v1(uuid,uuid) to authenticated;

-- Insert-only records. Missing dimensions are explicit; old review flags never grant adoption.
create function private.guard_observation_v1() returns trigger language plpgsql security definer set search_path='' as $$
declare d public.dossiers; e public.entities; v public.definition_versions; m public.metric_definitions; previous public.observations;
begin
 select * into d from public.dossiers where organization_id=new.organization_id and id=new.dossier_id;
 if d.id is null then raise exception 'observation_scope_denied' using errcode='23514'; end if;
 if new.entity_id is not null then
  select * into e from public.entities where id=new.entity_id;
  if e.id is null or (e.organization_id is not null and (e.organization_id<>new.organization_id or e.origin_dossier_id<>new.dossier_id))
  or not exists(select 1 from public.dossier_entity_links l where l.organization_id=new.organization_id and l.dossier_id=new.dossier_id and l.entity_id=e.id and l.withdrawn_at is null and l.valid_from<=clock_timestamp() and (l.valid_until is null or l.valid_until>clock_timestamp()))
  then raise exception 'observation_entity_scope_denied' using errcode='23514'; end if;
 end if;
 if new.definition_version_id is not null then
  select * into v from public.definition_versions where organization_id=new.organization_id and id=new.definition_version_id;
  select * into m from public.metric_definitions where organization_id=new.organization_id and id=v.metric_definition_id;
  if m.dossier_id is distinct from new.dossier_id then raise exception 'observation_definition_scope_denied' using errcode='23514'; end if;
 end if;
 if new.supersedes_id is not null then
  select * into previous from public.observations where organization_id=new.organization_id and id=new.supersedes_id;
  if previous.dossier_id is distinct from new.dossier_id or previous.field_path is distinct from new.field_path then raise exception 'observation_revision_scope_denied' using errcode='23514'; end if;
 end if;
 new.dossier_reference:=new.dossier_id;
 new.incomplete_reasons:=array_remove(array[
  case when new.asserted_value='null'::jsonb or (new.value_type='number' and (jsonb_typeof(new.asserted_value)<>'string' or new.asserted_value#>>'{}' !~ '^-?[0-9]+(\.[0-9]+)?$')) then 'value' end,
  case when new.entity_id is null then 'entity' end,case when nullif(btrim(new.perimeter),'') is null then 'perimeter' end,
  case when new.period_end is null then 'period' end,case when new.currency is null and new.value_type='number' and coalesce(new.unit,'') not in ('ratio','percent','percentage','count','days','months','years') then 'currency' end,
  case when nullif(btrim(new.unit),'') is null and new.value_type='number' then 'unit' end,
  case when new.value_scale is null and new.value_type='number' then 'scale' end,
  case when nullif(btrim(new.scenario),'') is null then 'scenario' end,case when new.definition_version_id is null then 'definition' end,
  case when new.source_version_id is null then 'source' end,case when new.source_rights_version_id is null then 'source_rights' end,
  case when new.source_anchor='{}'::jsonb then 'anchor' end],null);
 return new;
end $$;
revoke all on function private.guard_observation_v1() from public,anon,authenticated,service_role;
create trigger observations_guard before insert on public.observations for each row execute function private.guard_observation_v1();

create function private.guard_definition_version_v1() returns trigger language plpgsql security definer set search_path='' as $$
declare m public.metric_definitions;
begin
 select * into m from public.metric_definitions where organization_id=new.organization_id and id=new.metric_definition_id;
 if m.id is null or (m.kind='contractual' and (new.contract_source_version_id is null or new.contract_anchor is null or new.contract_anchor='{}'::jsonb))
 then raise exception 'contract_definition_requires_version_and_anchor' using errcode='23514'; end if;
 return new;
end $$;
revoke all on function private.guard_definition_version_v1() from public,anon,authenticated,service_role;
create trigger definition_versions_guard before insert on public.definition_versions for each row execute function private.guard_definition_version_v1();

-- Detaching a deleted dossier preserves immutable content and the historical reference;
-- no client can write either field, and an extant dossier can never be detached this way.
create function private.reject_observation_mutation_v1() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and to_jsonb(old)->>'dossier_id' is not null and to_jsonb(new)->>'dossier_id' is null
 and to_jsonb(old)-array['dossier_id','updated_at']=to_jsonb(new)-array['dossier_id','updated_at']
 and not exists(select 1 from public.dossiers where organization_id=old.organization_id and id=(to_jsonb(old)->>'dossier_id')::uuid)
 then return new; end if;
 raise exception 'observation_immutable' using errcode='55000';
end $$;
revoke all on function private.reject_observation_mutation_v1() from public,anon,authenticated,service_role;
alter table private.domain_events drop constraint domain_events_aggregate_kind_check;
alter table private.domain_events add constraint domain_events_aggregate_kind_check check(aggregate_kind in ('membership','resource_grant','workspace_capability','commercial_account_link','access_policy','observation','metric_definition'));
create function private.capture_observation_event_v1() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform private.append_domain_event_v1(new.id,new.organization_id,case when tg_table_name='observations' then 'observation' else 'metric_definition' end,new.id,'created',jsonb_build_object('source',tg_table_name,'record_id',new.id));
 return new;
end $$;
revoke all on function private.capture_observation_event_v1() from public,anon,authenticated,service_role;
do $$ declare t text; begin
 foreach t in array array['metric_definitions','definition_versions','observations'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('alter table public.%I force row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy %I on public.%I for insert to authenticated with check(false)',t||'_deny_insert',t);
  execute format('create policy %I on public.%I for update to authenticated using(false) with check(false)',t||'_deny_update',t);
  execute format('create policy %I on public.%I for delete to authenticated using(false)',t||'_deny_delete',t);
  execute format('create trigger %I before update or delete on public.%I for each row execute function private.reject_observation_mutation_v1()',t||'_immutable',t);
  execute format('create trigger %I before update on public.%I for each row execute function private.set_updated_at()',t||'_updated',t);
  execute format('create trigger %I after insert on public.%I for each row execute function private.capture_observation_event_v1()',t||'_event',t);
 end loop;
end $$;
create policy metric_definitions_select on public.metric_definitions for select to authenticated using(private.can_read_dossier_v1(dossier_id) and exists(select 1 from public.definition_versions v where v.organization_id=metric_definitions.organization_id and v.metric_definition_id=metric_definitions.id));
create policy definition_versions_select on public.definition_versions for select to authenticated using(private.can_read_definition_version_v1(organization_id,id));
create policy observations_select on public.observations for select to authenticated using(private.can_read_observation_v1(organization_id,id));

create function private.require_observation_source_v1(p_org uuid,p_source uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare rights uuid; begin
 if not private.source_use_allowed_v1(p_org,p_source,auth.uid(),'read','analysis')
 or not private.source_use_allowed_v1(p_org,p_source,auth.uid(),'derive','analysis')
 or not private.source_use_allowed_v1(p_org,p_source,auth.uid(),'store','analysis') then raise exception 'source_use_denied' using errcode='42501'; end if;
 select id into rights from private.source_rights_versions where organization_id=p_org and source_version_id=p_source order by revision desc limit 1;
 if rights is null then raise exception 'source_use_denied' using errcode='42501'; end if;
 return rights;
end $$;
revoke all on function private.require_observation_source_v1(uuid,uuid) from public,anon,authenticated,service_role;

create function private.valid_observation_value_v1(p_kind text,p_value jsonb) returns boolean language plpgsql immutable set search_path='' as $$
begin
 if p_value is null then return false; end if;
 if p_kind='number' then return jsonb_typeof(p_value) in ('number','string') and p_value#>>'{}' ~ '^-?[0-9]+(\.[0-9]+)?$';
 elsif p_kind='text' then return jsonb_typeof(p_value)='string';
 elsif p_kind='boolean' then return jsonb_typeof(p_value)='boolean';
 elsif p_kind='list' then
  if jsonb_typeof(p_value)<>'array' then return false; end if;
  return not exists(select 1 from jsonb_array_elements(p_value) a where jsonb_typeof(a)<>'string');
 elsif p_kind='date' then
  if jsonb_typeof(p_value)<>'string' or p_value#>>'{}' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return false; end if;
  perform (p_value#>>'{}')::date; return true;
 end if;
 return false;
exception when invalid_datetime_format or datetime_field_overflow then return false;
end $$;
revoke all on function private.valid_observation_value_v1(text,jsonb) from public,anon,authenticated,service_role;

create function private.record_observation_v1(p_payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare d public.dossiers; existing public.observations; source_id uuid; rights_id uuid; definition_id uuid; dimensions jsonb;
 request uuid; fingerprint text; result_id uuid; value_kind text; value jsonb;
begin
 if p_payload is null or octet_length(p_payload::text)>131072 or jsonb_typeof(p_payload)<>'object' or p_payload-array['requestId','dossierId','fieldPath','dimensions','value','sourceVersionId','anchor','supersedesId']<>'{}'::jsonb
 or not(p_payload ?& array['requestId','dossierId','fieldPath','dimensions','value','sourceVersionId','anchor','supersedesId']) then raise exception 'invalid_observation' using errcode='22023'; end if;
 d:=private.require_dossier_v1((p_payload->>'dossierId')::uuid,'edit');
 request:=(p_payload->>'requestId')::uuid;
 if request is null then raise exception 'invalid_observation' using errcode='22023'; end if;
 dimensions:=p_payload->'dimensions';
 if jsonb_typeof(dimensions)<>'object' or dimensions-array['entityId','perimeter','periodStart','periodEnd','currency','unit','scale','scenario','definitionVersionId']<>'{}'::jsonb
 or not(dimensions ?& array['entityId','perimeter','periodStart','periodEnd','currency','unit','scale','scenario','definitionVersionId'])
 or jsonb_typeof(p_payload->'anchor')<>'object' or p_payload->'anchor'='{}'::jsonb
 then raise exception 'invalid_observation' using errcode='22023'; end if;
 source_id:=(p_payload->>'sourceVersionId')::uuid;
 rights_id:=private.require_observation_source_v1(d.organization_id,source_id);
 definition_id:=(dimensions->>'definitionVersionId')::uuid;
 if definition_id is not null and not private.can_read_definition_version_v1(d.organization_id,definition_id) then raise exception 'definition_access_denied' using errcode='42501'; end if;
 if p_payload->>'supersedesId' is not null and not private.can_read_observation_v1(d.organization_id,(p_payload->>'supersedesId')::uuid) then raise exception 'observation_access_denied' using errcode='42501'; end if;
 value_kind:=p_payload->'value'->>'type'; value:=p_payload->'value'->'value';
 if jsonb_typeof(p_payload->'value')<>'object' or p_payload->'value'-array['type','value']<>'{}'::jsonb or value is null
 or not private.valid_observation_value_v1(value_kind,value) or (value_kind='number' and jsonb_typeof(value)<>'string')
 then raise exception 'invalid_observation_value' using errcode='22023'; end if;
 if value_kind='date' then perform (value#>>'{}')::date; end if;
 fingerprint:=encode(extensions.digest(jsonb_build_object('payload',p_payload,'actor',auth.uid())::text,'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended('observation:'||d.organization_id::text||':'||request::text,0));
 select * into existing from public.observations where organization_id=d.organization_id and dossier_id=d.id and request_id=request;
 if found then
  if existing.request_fingerprint<>fingerprint then raise exception 'observation_retry_conflict' using errcode='40001'; end if;
  return existing.id;
 end if;
 insert into public.observations(organization_id,dossier_id,entity_id,field_path,perimeter,period_start,period_end,currency,unit,value_scale,scenario,definition_version_id,value_type,asserted_value,source_version_id,source_rights_version_id,source_anchor,verification_state,incomplete_reasons,supersedes_id,request_id,request_fingerprint,created_by)
 values(d.organization_id,d.id,(dimensions->>'entityId')::uuid,p_payload->>'fieldPath',dimensions->>'perimeter',(dimensions->>'periodStart')::date,(dimensions->>'periodEnd')::date,dimensions->>'currency',dimensions->>'unit',(dimensions->>'scale')::numeric,dimensions->>'scenario',definition_id,value_kind,value,source_id,rights_id,p_payload->'anchor','asserted','{}',(p_payload->>'supersedesId')::uuid,request,fingerprint,auth.uid()) returning id into result_id;
 return result_id;
end $$;
create function public.record_observation_v1(p_payload jsonb) returns uuid language sql security invoker set search_path='' as $$ select private.record_observation_v1(p_payload) $$;
revoke all on function private.record_observation_v1(jsonb),public.record_observation_v1(jsonb) from public,anon,authenticated,service_role;
grant execute on function private.record_observation_v1(jsonb),public.record_observation_v1(jsonb) to authenticated;

create function private.record_definition_version_v1(p_dossier_id uuid,p_metric_key text,p_kind text,p_definition text,p_contract_source_version_id uuid,p_contract_anchor jsonb,p_definition_id uuid,p_expected_version integer,p_request_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare d public.dossiers; m public.metric_definitions; previous public.definition_versions; current_version integer; rights uuid;
begin
 d:=private.require_dossier_v1(p_dossier_id,'edit');
 if p_request_id is null or p_expected_version is null or p_expected_version<0 then raise exception 'invalid_definition_command' using errcode='22023'; end if;
 if p_contract_source_version_id is not null then rights:=private.require_observation_source_v1(d.organization_id,p_contract_source_version_id); end if;
 if p_kind='contractual' and (p_contract_source_version_id is null or p_contract_anchor is null or p_contract_anchor='{}'::jsonb) then raise exception 'contract_definition_requires_version_and_anchor' using errcode='23514'; end if;
 perform pg_advisory_xact_lock(hashtextextended('definition-request:'||p_request_id::text,0));
 select * into previous from public.definition_versions where id=p_request_id;
 if found then
  select * into m from public.metric_definitions where organization_id=previous.organization_id and id=previous.metric_definition_id;
  if previous.organization_id is distinct from d.organization_id or m.dossier_id is distinct from d.id or previous.created_by is distinct from auth.uid()
  or m.metric_key is distinct from p_metric_key or m.kind is distinct from p_kind or previous.definition is distinct from p_definition
  or previous.contract_source_version_id is distinct from p_contract_source_version_id or previous.contract_anchor is distinct from p_contract_anchor
  or (p_definition_id is not null and previous.metric_definition_id<>p_definition_id) or previous.version_no<>p_expected_version+1
  then raise exception 'definition_retry_conflict' using errcode='40001'; end if;
  return previous.id;
 end if;
 if p_definition_id is null then
  if p_expected_version<>0 then raise exception 'definition_revision_conflict' using errcode='40001'; end if;
  insert into public.metric_definitions(organization_id,dossier_id,dossier_reference,metric_key,kind,created_by) values(d.organization_id,d.id,d.id,p_metric_key,p_kind,auth.uid()) returning * into m;
 else
  select * into m from public.metric_definitions where organization_id=d.organization_id and id=p_definition_id for update;
  if not found or m.dossier_id<>d.id or m.metric_key<>p_metric_key or m.kind<>p_kind then raise exception 'definition_identity_mismatch' using errcode='23514'; end if;
 end if;
 select coalesce(max(version_no),0) into current_version from public.definition_versions where organization_id=d.organization_id and metric_definition_id=m.id;
 if current_version<>p_expected_version then raise exception 'definition_revision_conflict' using errcode='40001'; end if;
 insert into public.definition_versions(id,organization_id,metric_definition_id,version_no,definition,contract_source_version_id,contract_rights_version_id,contract_anchor,created_by)
 values(p_request_id,d.organization_id,m.id,current_version+1,p_definition,p_contract_source_version_id,rights,p_contract_anchor,auth.uid());
 return p_request_id;
end $$;
create function public.record_definition_version_v1(p_dossier_id uuid,p_metric_key text,p_kind text,p_definition text,p_contract_source_version_id uuid,p_contract_anchor jsonb,p_definition_id uuid,p_expected_version integer,p_request_id uuid)
returns uuid language sql security invoker set search_path='' as $$ select private.record_definition_version_v1(p_dossier_id,p_metric_key,p_kind,p_definition,p_contract_source_version_id,p_contract_anchor,p_definition_id,p_expected_version,p_request_id) $$;
revoke all on function private.record_definition_version_v1(uuid,text,text,text,uuid,jsonb,uuid,integer,uuid),public.record_definition_version_v1(uuid,text,text,text,uuid,jsonb,uuid,integer,uuid) from public,anon,authenticated,service_role;
grant execute on function private.record_definition_version_v1(uuid,text,text,text,uuid,jsonb,uuid,integer,uuid),public.record_definition_version_v1(uuid,text,text,text,uuid,jsonb,uuid,integer,uuid) to authenticated;

-- Exact legacy provenance, with no inferred entity, scenario, definition or official state.
create function private.import_legacy_observation_v1(p_table text,p_row jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid:=(p_row->>'organization_id')::uuid; row_id uuid:=(p_row->>'id')::uuid; resource uuid; dossier uuid;
 source_id uuid; rights uuid; d public.evidence_facts; period public.financial_periods; path text; value jsonb; kind text;
 unit_name text; currency_name text; perimeter_name text; scale_value numeric; start_date date; end_date date; anchor jsonb;
 fingerprint text; previous public.observations; result_id uuid; provenance jsonb; actor uuid;
begin
 if p_table='intake_field_candidates' then
  resource:=(p_row->>'intake_session_id')::uuid; source_id:=(p_row->>'source_document_id')::uuid;
  path:=p_row->>'field_path'; kind:=p_row->>'value_type'; value:=p_row->'normalized_value';
  unit_name:=p_row->>'unit';currency_name:=p_row->>'currency';perimeter_name:=p_row->>'entity_scope';scale_value:=case when coalesce(p_row->'verifier_flags','[]'::jsonb) ?| array['scale_unverified','scale_conflict'] then null else (p_row->>'value_scale')::numeric end;
  start_date:=(p_row->>'period_start')::date;end_date:=(p_row->>'period_end')::date;anchor:=coalesce(p_row->'source_anchor','{}'::jsonb);
  provenance:=p_row;
 elsif p_table='evidence_facts' then
  resource:=(p_row->>'opportunity_id')::uuid;source_id:=(p_row->>'source_document_id')::uuid;path:=p_row->>'fact_type';
  kind:=case when p_row->>'value_numeric' is not null then 'number' else 'text' end;
  value:=case when kind='number' then p_row->'value_numeric' else p_row->'value_text' end;
  unit_name:=p_row->>'unit';currency_name:=p_row->>'currency';start_date:=(p_row->>'period_start')::date;end_date:=(p_row->>'period_end')::date;
  anchor:=coalesce(p_row->'source_anchor','{}'::jsonb);provenance:=p_row;
 elsif p_table='financial_line_items' then
  resource:=(p_row->>'opportunity_id')::uuid;
  select * into d from public.evidence_facts where organization_id=org and id=(p_row->>'source_fact_id')::uuid;
  select * into period from public.financial_periods where organization_id=org and id=(p_row->>'financial_period_id')::uuid;
  source_id:=d.source_document_id;path:=coalesce(p_row->>'account_code','legacy_line_item');kind:='number';value:=p_row->'reported_value';
  currency_name:=period.currency;scale_value:=period.unit_scale;start_date:=period.starts_on;end_date:=period.ends_on;
  anchor:=coalesce(d.source_anchor,'{}'::jsonb);provenance:=p_row;
  -- An adjusted amount is a contribution, not a silently substituted source assertion.
  provenance:=provenance||jsonb_build_object('adjusted_value_present',p_row->>'adjusted_value' is not null);
 else raise exception 'unsupported_legacy_observation' using errcode='22023'; end if;
 select id into dossier from public.dossiers where organization_id=org and resource_id=resource;
 if dossier is null then raise exception 'legacy_observation_origin_missing' using errcode='23514'; end if;
 if source_id is not null then select id into rights from private.source_rights_versions where organization_id=org and source_version_id=source_id order by revision desc limit 1; end if;
 -- Normalize only representation (JSON numeric -> exact decimal string), never scale or perimeter.
 if kind='number' and value is not null and value<>'null'::jsonb then value:=to_jsonb(value#>>'{}'); end if;
 value:=coalesce(value,'null'::jsonb);
 actor:=coalesce((p_row->>'reviewed_by')::uuid,(p_row->>'created_by')::uuid);
 fingerprint:=encode(extensions.digest(jsonb_build_object('table',p_table,'row',p_row)::text,'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended('legacy-observation:'||org::text||':'||p_table||':'||row_id::text,0));
 select * into previous from public.observations where organization_id=org and legacy_table=p_table and legacy_record_id=row_id order by sequence desc limit 1;
 if found and previous.request_fingerprint=fingerprint then return previous.id; end if;
 insert into public.observations(organization_id,dossier_id,field_path,perimeter,period_start,period_end,currency,unit,value_scale,value_type,asserted_value,source_version_id,source_rights_version_id,source_anchor,verification_state,incomplete_reasons,supersedes_id,legacy_table,legacy_record_id,legacy_provenance,request_id,request_fingerprint,created_by)
 values(org,dossier,path,perimeter_name,start_date,end_date,currency_name,unit_name,scale_value,kind,value,source_id,rights,anchor,'legacy_unverified','{}',previous.id,p_table,row_id,provenance,gen_random_uuid(),fingerprint,actor) returning id into result_id;
 return result_id;
end $$;
revoke all on function private.import_legacy_observation_v1(text,jsonb) from public,anon,authenticated,service_role;
create function private.capture_legacy_observation_v1() returns trigger language plpgsql security definer set search_path='' as $$
begin perform private.import_legacy_observation_v1(tg_table_name,to_jsonb(new)); return new; end $$;
revoke all on function private.capture_legacy_observation_v1() from public,anon,authenticated,service_role;
create trigger intake_candidates_observation after insert or update on public.intake_field_candidates for each row execute function private.capture_legacy_observation_v1();
create trigger evidence_facts_observation after insert or update on public.evidence_facts for each row execute function private.capture_legacy_observation_v1();
create trigger financial_line_items_observation after insert or update on public.financial_line_items for each row execute function private.capture_legacy_observation_v1();

CREATE OR REPLACE FUNCTION private.worker_record_candidates(p_job_id uuid, p_capability_token text, p_candidates jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  written integer;
  replaced integer;
  actor uuid := (select auth.uid());
begin
  if p_candidates is null or jsonb_typeof(p_candidates) <> 'array' then
    raise exception 'invalid_intake_payload' using errcode = '22023';
  end if;

  delete from public.intake_field_candidates
  where organization_id = job_row.organization_id
    and intake_session_id = job_row.intake_session_id
    and source_document_id = job_row.source_document_id
    and review_state = 'proposed';
  get diagnostics replaced = row_count;

  insert into public.intake_field_candidates (
    organization_id, intake_session_id, source_document_id, processing_run_id, extractor_key,
    field_path, field_group, label, raw_value, normalized_value, value_type, unit, currency,
    period_start, period_end, information_class, evidence_rank, source_anchor, confidence,
    extraction_method, is_primary, anchor_verified, anchor_precision, entity_name, entity_scope,
    value_scale, verifier_flags, created_by
  )
  select
    job_row.organization_id, job_row.intake_session_id, job_row.source_document_id,
    job_row.processing_run_id, c.extractor_key, c.field_path, c.field_group, c.label,
    c.raw_value, coalesce(c.normalized_value, 'null'::jsonb), c.value_type, c.unit, c.currency,
    nullif(c.period_start, '')::date, nullif(c.period_end, '')::date,
    c.information_class, c.evidence_rank, coalesce(c.source_anchor, '{}'::jsonb),
    c.confidence,
    case
      when nullif(c.extraction_method, '') is null or c.extraction_method = 'model_extraction'
        then 'llm_anchored'
      else c.extraction_method
    end,
    false, coalesce(c.anchor_verified, false), c.anchor_precision,
    c.entity_name, c.entity_scope, c.value_scale, coalesce(c.verifier_flags, '[]'::jsonb), actor
  from jsonb_to_recordset(p_candidates) as c(
    extractor_key text, field_path text, field_group text, label text, raw_value text,
    normalized_value jsonb, value_type text, unit text, currency text, period_start text,
    period_end text, information_class text, evidence_rank smallint, source_anchor jsonb,
    confidence numeric, extraction_method text, is_primary boolean, anchor_verified boolean,
    anchor_precision text, entity_name text, entity_scope text, value_scale numeric,
    verifier_flags jsonb
  )
  on conflict (organization_id, intake_session_id, extractor_key) do update
  set normalized_value = excluded.normalized_value,
      raw_value = excluded.raw_value,
      confidence = excluded.confidence,
      anchor_verified = excluded.anchor_verified,
      anchor_precision = excluded.anchor_precision,
      verifier_flags = excluded.verifier_flags,
      processing_run_id = excluded.processing_run_id
  where public.intake_field_candidates.review_state = 'proposed';
  get diagnostics written = row_count;

  return jsonb_build_object('written', written, 'replaced', replaced);
end;
$function$;

CREATE OR REPLACE FUNCTION private.complete_intake_processing(p_organization_id uuid, p_session_id uuid, p_candidates jsonb, p_issues jsonb, p_summary jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid := (select auth.uid());
  session_row public.document_intake_sessions;
  candidate_count integer := 0;
  issue_count integer := 0;
begin
  session_row := private.intake_session_for_update(p_organization_id, p_session_id);
  if session_row.status = 'confirmed' then
    raise exception 'intake_session_already_confirmed' using errcode = '55000';
  end if;
  if jsonb_typeof(coalesce(p_candidates, '[]'::jsonb)) <> 'array' or jsonb_typeof(coalesce(p_issues, '[]'::jsonb)) <> 'array' then
    raise exception 'invalid_intake_payload' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_summary, '{}'::jsonb)) <> 'object' then
    raise exception 'invalid_intake_summary' using errcode = '22023';
  end if;

  -- Replace only the compatibility projection; immutable observations retain each generation.
  delete from public.intake_issues where organization_id = p_organization_id and intake_session_id = p_session_id;
  delete from public.intake_field_candidates where organization_id = p_organization_id and intake_session_id = p_session_id;

  insert into public.intake_field_candidates (
    organization_id, intake_session_id, source_document_id, extractor_key, field_path, field_group,
    label, raw_value, normalized_value, value_type, unit, currency, period_start, period_end,
    information_class, evidence_rank, source_anchor, confidence, extraction_method, is_primary, created_by
  )
  select
    p_organization_id, p_session_id,
    nullif(c.source_document_id, '')::uuid, c.extractor_key, c.field_path, c.field_group,
    c.label, c.raw_value, coalesce(c.normalized_value, 'null'::jsonb), c.value_type, c.unit, c.currency,
    nullif(c.period_start, '')::date, nullif(c.period_end, '')::date,
    c.information_class, c.evidence_rank, coalesce(c.source_anchor, '{}'::jsonb), c.confidence, c.extraction_method,
    false, actor_id
  from jsonb_to_recordset(coalesce(p_candidates, '[]'::jsonb)) as c(
    source_document_id text, extractor_key text, field_path text, field_group text, label text, raw_value text,
    normalized_value jsonb, value_type text, unit text, currency text, period_start text, period_end text,
    information_class text, evidence_rank smallint, source_anchor jsonb, confidence numeric, extraction_method text,
    is_primary boolean
  );
  get diagnostics candidate_count = row_count;

  insert into public.intake_issues (
    organization_id, intake_session_id, issue_type, priority, field_group, field_path, candidate_ids, title, description, resolution_hint
  )
  select
    p_organization_id, p_session_id, i.issue_type, i.priority, i.field_group, i.field_path,
    coalesce(
      (select array_agg(fc.id order by fc.extractor_key)
       from public.intake_field_candidates fc
       where fc.organization_id = p_organization_id
         and fc.intake_session_id = p_session_id
         and fc.extractor_key = any (coalesce(i.candidate_keys, array[]::text[]))),
      array[]::uuid[]
    ),
    i.title, i.description, i.resolution_hint
  from jsonb_to_recordset(coalesce(p_issues, '[]'::jsonb)) as i(
    issue_type text, priority text, field_group text, field_path text, candidate_keys text[], title text, description text, resolution_hint text
  );
  get diagnostics issue_count = row_count;

  update public.source_documents
  set processing_status = 'ready'
  where organization_id = p_organization_id and intake_session_id = p_session_id;

  update public.document_intake_sessions
  set status = 'review_ready',
      processing_completed_at = now(),
      result_summary = coalesce(p_summary, '{}'::jsonb) || jsonb_build_object('candidates', candidate_count, 'issues', issue_count)
  where organization_id = p_organization_id and id = p_session_id;

  return jsonb_build_object('candidates', candidate_count, 'issues', issue_count);
end;
$function$;

CREATE OR REPLACE FUNCTION private.review_intake_candidate(p_organization_id uuid, p_session_id uuid, p_candidate_id uuid, p_decision text, p_normalized_value jsonb DEFAULT NULL::jsonb, p_comment text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid := (select auth.uid());
  session_row public.document_intake_sessions;
  candidate_row public.intake_field_candidates;
  kind text;
begin
  session_row := private.intake_session_for_update(p_organization_id, p_session_id);
  if session_row.status <> 'review_ready' then
    raise exception 'intake_session_not_ready' using errcode = '55000';
  end if;
  if p_decision not in ('accept', 'edit', 'reject', 'not_applicable') then
    raise exception 'invalid_review_decision' using errcode = '22023';
  end if;

  select * into candidate_row
  from public.intake_field_candidates
  where organization_id = p_organization_id and intake_session_id = p_session_id and id = p_candidate_id
  for update;
  if not found then
    raise exception 'intake_candidate_not_found' using errcode = 'P0002';
  end if;
  if p_decision = 'edit' and p_normalized_value is null then
    raise exception 'edit_requires_value' using errcode = '22023';
  end if;

  if p_decision='edit' and not private.valid_observation_value_v1(candidate_row.value_type,p_normalized_value) then raise exception 'invalid_observation_value' using errcode='22023'; end if;
  if candidate_row.source_document_id is not null then perform private.require_observation_source_v1(p_organization_id,candidate_row.source_document_id); end if;

  -- The classified kind lives on the profile, not on the document row.
  select profile.document_kind into kind
  from public.document_profiles profile
  where profile.organization_id = p_organization_id
    and profile.source_document_id = candidate_row.source_document_id
  order by profile.document_version desc
  limit 1;

  insert into public.extraction_feedback (
    organization_id, intake_session_id, candidate_id,
    field_path, field_group, value_type, extractor_key, extraction_method,
    source_document_id, document_kind,
    proposed_value, confidence, evidence_rank, anchor_verified,
    decision, corrected_value, reviewer_comment, created_by
  ) values (
    p_organization_id, p_session_id, candidate_row.id,
    candidate_row.field_path, candidate_row.field_group, candidate_row.value_type,
    candidate_row.extractor_key, candidate_row.extraction_method,
    candidate_row.source_document_id, kind,
    candidate_row.normalized_value, candidate_row.confidence, candidate_row.evidence_rank,
    candidate_row.anchor_verified,
    p_decision,
    case when p_decision = 'edit' then p_normalized_value else null end,
    nullif(trim(coalesce(p_comment, '')), ''),
    actor_id
  );

  update public.intake_field_candidates
  set normalized_value = case when p_decision = 'edit' then p_normalized_value else normalized_value end,
      extraction_method = case when p_decision = 'edit' then 'user_entry' else extraction_method end,
      review_state = case p_decision when 'accept' then 'accepted' when 'edit' then 'edited' when 'reject' then 'rejected' else p_decision end,
      is_primary = false,
      reviewer_comment = nullif(trim(coalesce(p_comment, '')), ''),
      reviewed_by = actor_id,
      reviewed_at = now()
  where organization_id = p_organization_id and intake_session_id = p_session_id and id = candidate_row.id;
end;
$function$;

CREATE OR REPLACE FUNCTION private.confirm_document_intake_base(p_organization_id uuid, p_session_id uuid, p_output_locale text DEFAULT 'pt-BR'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid := (select auth.uid());
  session_row public.document_intake_sessions;
  v_legal_name text;
  v_display_name text;
  v_purpose text;
  v_amount numeric;
  v_currency text;
  v_identifier text;
  v_identifier_hash bytea;
  v_sector text;
  v_subsector text;
  v_website text;
  v_city text;
  v_state text;
  v_title text;
  v_fingerprint bytea;
  v_company_id uuid;
  v_request_id uuid;
  v_opportunity_id uuid;
  v_documents integer;
begin
  -- Changed: origination guard.
  session_row := private.intake_session_for_origination(p_organization_id, p_session_id);

  -- Idempotent: a confirmed session always resolves to the same opportunity.
  if session_row.status = 'confirmed' and session_row.opportunity_id is not null then
    select o.id, o.company_id, o.capital_request_id into v_opportunity_id, v_company_id, v_request_id
    from public.opportunities o
    where o.organization_id = p_organization_id and o.id = session_row.opportunity_id;
    select count(*) into v_documents from public.source_documents
    where organization_id = p_organization_id and intake_session_id = p_session_id;
    return jsonb_build_object(
      'opportunity_id', v_opportunity_id, 'company_id', v_company_id, 'capital_request_id', v_request_id,
      'document_count', v_documents, 'already_confirmed', true
    );
  end if;
  if session_row.status <> 'review_ready' then
    raise exception 'intake_session_not_ready' using errcode = '55000';
  end if;
  if p_output_locale not in ('pt-BR', 'en-US') then
    raise exception 'invalid_output_locale' using errcode = '22023';
  end if;

  -- Legacy origination uses only unambiguous human-reviewed inputs. No ranking or primary flag.
  with confirmed as (
    select field_path, min(normalized_value::text)::jsonb as normalized_value, min(currency) as currency, min(value_type) as value_type
    from public.intake_field_candidates
    where organization_id = p_organization_id
      and intake_session_id = p_session_id
      and review_state in ('accepted', 'edited')
      group by field_path
      having count(distinct jsonb_build_array(normalized_value,currency,unit,value_scale,entity_scope,period_start,period_end,value_type))=1
  )
  select
    trim(coalesce((select normalized_value #>> '{}' from confirmed where field_path = 'company.legal_name'), '')),
    trim(coalesce((select normalized_value #>> '{}' from confirmed where field_path = 'company.display_name'), '')),
    trim(coalesce((select normalized_value #>> '{}' from confirmed where field_path = 'transaction.purpose'), '')),
    (select case when value_type = 'number' then (normalized_value #>> '{}')::numeric end from confirmed where field_path = 'transaction.requested_amount'),
    (select currency from confirmed where field_path = 'transaction.requested_amount'),
    regexp_replace(coalesce((select normalized_value #>> '{}' from confirmed where field_path = 'company.legal_identifier'), ''), '[^0-9A-Za-z]', '', 'g'),
    nullif(trim(coalesce((select normalized_value #>> '{}' from confirmed where field_path = 'company.sector'), '')), ''),
    nullif(trim(coalesce((select normalized_value #>> '{}' from confirmed where field_path = 'company.subsector'), '')), ''),
    nullif(trim(coalesce((select normalized_value #>> '{}' from confirmed where field_path = 'company.website'), '')), ''),
    nullif(trim(coalesce((select normalized_value #>> '{}' from confirmed where field_path = 'company.city'), '')), ''),
    nullif(trim(coalesce((select normalized_value #>> '{}' from confirmed where field_path = 'company.state'), '')), '')
  into v_legal_name, v_display_name, v_purpose, v_amount, v_currency, v_identifier, v_sector, v_subsector, v_website, v_city, v_state;

  if v_legal_name = '' or v_purpose = '' or v_amount is null or v_amount <= 0 or v_currency is null then
    raise exception 'intake_case_incomplete' using errcode = '22023';
  end if;
  if char_length(v_legal_name) not between 2 and 200 or char_length(v_purpose) not between 3 and 500 then
    raise exception 'intake_case_out_of_bounds' using errcode = '22023';
  end if;
  if v_display_name = '' then
    v_display_name := v_legal_name;
  end if;
  v_title := private.bounded_opportunity_title(v_display_name, v_purpose);
  v_identifier_hash := case when v_identifier <> '' then extensions.digest(v_identifier, 'sha256') else null end;
  v_fingerprint := extensions.digest(
    concat_ws('|', p_organization_id::text, lower(v_legal_name), lower(v_purpose), v_amount::text, v_currency),
    'sha256'
  );

  -- Company: reuse the tenant's record for the same legal identifier, otherwise create it.
  if v_identifier_hash is not null then
    select id into v_company_id from public.companies
    where organization_id = p_organization_id and jurisdiction_code = 'BR' and legal_identifier_hash = v_identifier_hash;
  end if;
  if v_company_id is null then
    insert into public.companies (
      organization_id, legal_name, display_name, jurisdiction_code, legal_identifier_hash, legal_identifier_last4,
      sector, subsector, website, headquarters_city, headquarters_state, reporting_currency, created_by
    ) values (
      p_organization_id, v_legal_name, v_display_name, 'BR', v_identifier_hash,
      case when char_length(v_identifier) >= 4 then upper(right(v_identifier, 4)) end,
      v_sector, v_subsector, v_website, v_city, v_state, v_currency, actor_id
    )
    returning id into v_company_id;
  else
    update public.companies
    set legal_name = v_legal_name,
        display_name = v_display_name,
        sector = coalesce(v_sector, sector),
        subsector = coalesce(v_subsector, subsector),
        website = coalesce(v_website, website),
        headquarters_city = coalesce(v_city, headquarters_city),
        headquarters_state = coalesce(v_state, headquarters_state)
    where organization_id = p_organization_id and id = v_company_id;
  end if;

  insert into public.capital_requests (
    organization_id, company_id, purpose, requested_amount, currency, output_locale, status, created_by
  ) values (
    p_organization_id, v_company_id, v_purpose, v_amount, v_currency, p_output_locale, 'submitted', actor_id
  )
  returning id into v_request_id;

  begin
    insert into public.opportunities (
      organization_id, company_id, capital_request_id, title, purpose, requested_amount, currency, fingerprint_hash, lead_user_id, created_by
    ) values (
      p_organization_id, v_company_id, v_request_id, v_title, v_purpose, v_amount, v_currency, v_fingerprint, actor_id, actor_id
    )
    returning id into v_opportunity_id;
  exception
    when unique_violation then
      raise exception 'duplicate_opportunity' using errcode = '23505';
  end;

  -- Compatibility evidence remains proposed; human review does not publish an official financial value.
  insert into public.evidence_facts (
    organization_id, opportunity_id, source_document_id, fact_type, label, value_numeric, value_text, unit, currency,
    period_start, period_end, confidence, review_state, source_anchor, created_by, reviewed_by, reviewed_at
  )
  select
    p_organization_id, v_opportunity_id, c.source_document_id, c.field_path, c.label,
    case when c.value_type = 'number' then (c.normalized_value #>> '{}')::numeric end,
    case when c.value_type = 'number' then null
         when jsonb_typeof(c.normalized_value) = 'string' then c.normalized_value #>> '{}'
         else c.normalized_value::text end,
    c.unit, c.currency, c.period_start, c.period_end, c.confidence, 'proposed',
    c.source_anchor || jsonb_build_object(
      'raw_value', c.raw_value, 'normalized_value', c.normalized_value,
      'information_class', c.information_class, 'extraction_method', c.extraction_method
    ),
    actor_id, actor_id, coalesce(c.reviewed_at, now())
  from public.intake_field_candidates c
  where c.organization_id = p_organization_id
    and c.intake_session_id = p_session_id
    and c.review_state in ('accepted', 'edited')
    and private.valid_observation_value_v1(c.value_type,c.normalized_value);

  update public.source_documents
  set opportunity_id = v_opportunity_id
  where organization_id = p_organization_id and intake_session_id = p_session_id;
  get diagnostics v_documents = row_count;

  update public.document_intake_sessions
  set status = 'confirmed', opportunity_id = v_opportunity_id, confirmed_at = now()
  where organization_id = p_organization_id and id = p_session_id;

  return jsonb_build_object(
    'opportunity_id', v_opportunity_id, 'company_id', v_company_id, 'capital_request_id', v_request_id,
    'document_count', v_documents, 'already_confirmed', false
  );
end;
$function$;

-- Old deployed clients receive an explicit denial; confidence cannot promote a batch.
create or replace function private.accept_intake_candidates(p_organization_id uuid,p_session_id uuid,p_candidate_ids uuid[]) returns integer language plpgsql security definer set search_path='' as $$
begin raise exception 'confidence_acceptance_retired' using errcode='42501'; end $$;
revoke all on function private.accept_intake_candidates(uuid,uuid,uuid[]),public.accept_intake_candidates(uuid,uuid,uuid[]) from public,anon,authenticated,service_role;
select private.import_legacy_observation_v1('intake_field_candidates',to_jsonb(c)) from public.intake_field_candidates c;
select private.import_legacy_observation_v1('evidence_facts',to_jsonb(c)) from public.evidence_facts c;
select private.import_legacy_observation_v1('financial_line_items',to_jsonb(c)) from public.financial_line_items c;
