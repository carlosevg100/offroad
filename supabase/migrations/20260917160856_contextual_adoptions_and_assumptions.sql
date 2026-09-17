-- Draft stage 9. Publish event consumers before applying this producer.
set search_path='';
create table public.assumption_sets (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 work_id uuid, work_reference uuid not null, purpose text not null check(length(btrim(purpose)) between 3 and 300),
 context_key text not null check(length(btrim(context_key)) between 1 and 160),
 created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,id), unique(organization_id,work_reference,purpose,context_key),
 foreign key(organization_id,work_id) references private.access_resources(organization_id,id) on delete set null (work_id)
);
create table public.adoption_decisions (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), set_id uuid not null,
 kind text not null check(kind in ('observation','hypothesis')), field_path text not null check(length(btrim(field_path)) between 1 and 300),
 slot_key text not null check(slot_key ~ '^[a-f0-9]{64}$'), dimensions jsonb not null check(jsonb_typeof(dimensions)='object'),
 value_type text not null check(value_type in ('number','text','date','boolean','list')), asserted_value jsonb not null,
 reference_observation_id uuid, definition_version_id uuid not null, entity_id uuid not null references public.entities(id),
 reason text not null check(length(btrim(reason)) between 5 and 2000),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,id), unique(organization_id,set_id,id),
 foreign key(organization_id,set_id) references public.assumption_sets(organization_id,id),
 foreign key(organization_id,reference_observation_id) references public.observations(organization_id,id),
 foreign key(organization_id,definition_version_id) references public.definition_versions(organization_id,id),
 check(kind<>'observation' or reference_observation_id is not null)
);
create table public.assumption_versions (
 id uuid primary key, organization_id uuid not null references public.organizations(id), set_id uuid not null,
 revision integer not null check(revision>0), previous_version_id uuid,
 classification text not null check(classification in ('working_basis','legacy_execution')),
 canonical_snapshot text not null check(octet_length(canonical_snapshot)<=1048576),
 content_fingerprint text not null check(content_fingerprint ~ '^[a-f0-9]{64}$'),
 request_fingerprint text not null check(request_fingerprint ~ '^[a-f0-9]{64}$'),
 created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,id), unique(organization_id,set_id,id), unique(organization_id,set_id,revision),
 foreign key(organization_id,set_id) references public.assumption_sets(organization_id,id),
 foreign key(organization_id,set_id,previous_version_id) references public.assumption_versions(organization_id,set_id,id),
 check(content_fingerprint=encode(extensions.digest(canonical_snapshot,'sha256'),'hex')),
 check((revision=1)=(previous_version_id is null))
);
create table private.assumption_version_items (
 organization_id uuid not null, set_id uuid not null, version_id uuid not null, slot_key text not null, decision_id uuid not null,
 primary key(organization_id,version_id,slot_key), unique(organization_id,version_id,decision_id),
 foreign key(organization_id,set_id,version_id) references public.assumption_versions(organization_id,set_id,id),
 foreign key(organization_id,set_id,decision_id) references public.adoption_decisions(organization_id,set_id,id)
);
create index assumption_sets_work_idx on public.assumption_sets(organization_id,work_id);
create index assumption_sets_actor_idx on public.assumption_sets(created_by);
create index adoption_decisions_source_idx on public.adoption_decisions(organization_id,reference_observation_id);
create index adoption_decisions_definition_idx on public.adoption_decisions(organization_id,definition_version_id);
create index adoption_decisions_entity_idx on public.adoption_decisions(entity_id);
create index adoption_decisions_actor_idx on public.adoption_decisions(created_by);
create index assumption_versions_previous_idx on public.assumption_versions(organization_id,set_id,previous_version_id);
create index assumption_versions_actor_idx on public.assumption_versions(created_by);
create index assumption_items_decision_idx on private.assumption_version_items(organization_id,set_id,decision_id);

create function private.can_read_adoption_v1(p_org uuid,p_id uuid) returns boolean language sql volatile security definer set search_path='' as $$
 select exists(select 1 from public.adoption_decisions a join public.assumption_sets s on s.organization_id=a.organization_id and s.id=a.set_id
 where a.organization_id=p_org and a.id=p_id and private.can_access_resource_v1(p_org,s.work_id,'read')
 and private.can_read_entity_v1(a.entity_id) and private.can_read_definition_version_v1(p_org,a.definition_version_id)
 and (a.reference_observation_id is null or private.can_read_observation_v1(p_org,a.reference_observation_id)));
$$;
create function private.can_read_assumption_version_v1(p_org uuid,p_id uuid) returns boolean language sql volatile security definer set search_path='' as $$
 select exists(select 1 from public.assumption_versions v join public.assumption_sets s on s.organization_id=v.organization_id and s.id=v.set_id
 where v.organization_id=p_org and v.id=p_id and private.can_access_resource_v1(p_org,s.work_id,'read')
 and (v.classification<>'legacy_execution' or private.can_access_resource_v1(p_org,((v.canonical_snapshot::jsonb)->>'legacyResourceId')::uuid,'read'))
 and not exists(select 1 from private.assumption_version_items i where i.organization_id=p_org and i.version_id=v.id and not private.can_read_adoption_v1(p_org,i.decision_id)));
$$;
revoke all on function private.can_read_adoption_v1(uuid,uuid),private.can_read_assumption_version_v1(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.can_read_adoption_v1(uuid,uuid),private.can_read_assumption_version_v1(uuid,uuid) to authenticated;

create function private.reject_assumption_mutation_v1() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='assumption_sets' and tg_op='UPDATE' and to_jsonb(old)->>'work_id' is not null and to_jsonb(new)->>'work_id' is null
 and to_jsonb(old)-array['work_id','updated_at']=to_jsonb(new)-array['work_id','updated_at']
 and not exists(select 1 from private.access_resources where organization_id=old.organization_id and id=(to_jsonb(old)->>'work_id')::uuid) then return new; end if;
 raise exception 'adoption_history_immutable' using errcode='55000';
end $$;
revoke all on function private.reject_assumption_mutation_v1() from public,anon,authenticated,service_role;
alter table private.domain_events drop constraint domain_events_aggregate_kind_check;
alter table private.domain_events add constraint domain_events_aggregate_kind_check check(aggregate_kind in ('membership','resource_grant','workspace_capability','commercial_account_link','access_policy','observation','metric_definition','adoption_decision','assumption_version'));
create function private.capture_adoption_event_v1() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform private.append_domain_event_v1(new.id,new.organization_id,case when tg_table_name='adoption_decisions' then 'adoption_decision' else 'assumption_version' end,new.id,'created',jsonb_build_object('source',tg_table_name,'record_id',new.id));
 return new;
end $$;
revoke all on function private.capture_adoption_event_v1() from public,anon,authenticated,service_role;
do $$ declare t text; begin
 foreach t in array array['assumption_sets','adoption_decisions','assumption_versions'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('alter table public.%I force row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy %I on public.%I for insert to authenticated with check(false)',t||'_deny_insert',t);
  execute format('create policy %I on public.%I for update to authenticated using(false) with check(false)',t||'_deny_update',t);
  execute format('create policy %I on public.%I for delete to authenticated using(false)',t||'_deny_delete',t);
  execute format('create trigger %I before update or delete on public.%I for each row execute function private.reject_assumption_mutation_v1()',t||'_immutable',t);
  execute format('create trigger %I before update on public.%I for each row execute function private.set_updated_at()',t||'_updated',t);
  if t<>'assumption_sets' then execute format('create trigger %I after insert on public.%I for each row execute function private.capture_adoption_event_v1()',t||'_event',t); end if;
 end loop;
end $$;
create trigger assumption_sets_audit after insert on public.assumption_sets for each row execute function private.capture_audit_event();
alter table private.assumption_version_items enable row level security;
alter table private.assumption_version_items force row level security;
revoke all on private.assumption_version_items from public,anon,authenticated,service_role;
create policy assumption_version_items_deny on private.assumption_version_items for all to authenticated using(false) with check(false);
create trigger assumption_version_items_immutable before update or delete on private.assumption_version_items for each row execute function private.reject_assumption_mutation_v1();
create policy assumption_sets_select on public.assumption_sets for select to authenticated using(private.can_access_resource_v1(organization_id,work_id,'read') and exists(select 1 from public.assumption_versions v where v.organization_id=assumption_sets.organization_id and v.set_id=assumption_sets.id));
create policy adoption_decisions_select on public.adoption_decisions for select to authenticated using(private.can_read_adoption_v1(organization_id,id));
create policy assumption_versions_select on public.assumption_versions for select to authenticated using(private.can_read_assumption_version_v1(organization_id,id));

create function private.observation_dimensions_json_v1(p_row public.observations) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('entityId',p_row.entity_id,'perimeter',p_row.perimeter,'periodStart',p_row.period_start,'periodEnd',p_row.period_end,'currency',p_row.currency,'unit',p_row.unit,'scale',p_row.value_scale::text,'scenario',p_row.scenario,'definitionVersionId',p_row.definition_version_id);
$$;
create function private.adoption_entry_json_v1(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('decisionId',a.id,'slotKey',a.slot_key,'kind',a.kind,'fieldPath',a.field_path,'dimensions',a.dimensions,
 'value',jsonb_build_object('type',a.value_type,'value',a.asserted_value),'observationId',a.reference_observation_id,
 'referenceValue',case when o.id is null then null else jsonb_build_object('type',o.value_type,'value',o.asserted_value) end,
 'referenceDimensions',case when o.id is null then null else private.observation_dimensions_json_v1(o) end,
 'definitionKind',m.kind,'actorId',a.created_by,'reason',a.reason)
 from public.adoption_decisions a join public.definition_versions v on v.organization_id=a.organization_id and v.id=a.definition_version_id
 join public.metric_definitions m on m.organization_id=v.organization_id and m.id=v.metric_definition_id
 left join public.observations o on o.organization_id=a.organization_id and o.id=a.reference_observation_id where a.id=p_id;
$$;
revoke all on function private.observation_dimensions_json_v1(public.observations),private.adoption_entry_json_v1(uuid) from public,anon,authenticated,service_role;

create function private.require_adoption_dependency_v1(p_org uuid,p_source uuid,p_rights uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.require_observation_source_v1(p_org,p_source);
 if not exists(select 1 from private.source_rights_versions r where r.organization_id=p_org and r.source_version_id=p_source and r.id=p_rights
 and r.operations @> array['read','derive','store'] and 'analysis'=any(r.purposes) and r.valid_from<=clock_timestamp()
 and (r.expires_at is null or r.expires_at>clock_timestamp()) and (r.store_until is null or r.store_until>clock_timestamp()))
 then raise exception 'adoption_dependency_use_denied' using errcode='42501'; end if;
end $$;
revoke all on function private.require_adoption_dependency_v1(uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function private.write_contextual_adoption_v1(p_payload jsonb,p_kind text) returns uuid language plpgsql security definer set search_path='' as $$
declare r private.access_resources; s public.assumption_sets; prior public.assumption_versions; existing public.assumption_versions;
 o public.observations; def public.definition_versions; metric public.metric_definitions; dims jsonb; val jsonb; value_kind text; field text;
 request uuid; expected uuid; ref uuid; digest text; slot text; decision uuid; entries jsonb; canonical text; allowed text[];
begin
 allowed:=array['requestId','workId','purpose','contextKey','expectedVersionId','reason']||case when p_kind='observation' then array['observationId'] else array['fieldPath','dimensions','value','referenceObservationId'] end;
 if p_kind not in ('observation','hypothesis') or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>131072
 or p_payload-allowed<>'{}'::jsonb or not(p_payload ?& allowed)
 or exists(select 1 from unnest(array['requestId','workId','purpose','contextKey','reason']) k where jsonb_typeof(p_payload->k)<>'string')
 or jsonb_typeof(p_payload->'expectedVersionId') not in ('string','null')
 or length(btrim(p_payload->>'purpose')) not between 3 and 300 or length(btrim(p_payload->>'contextKey')) not between 1 and 160
 or length(btrim(p_payload->>'reason')) not between 5 and 2000 then raise exception 'invalid_adoption' using errcode='22023'; end if;
 request:=(p_payload->>'requestId')::uuid; expected:=(p_payload->>'expectedVersionId')::uuid;
 select * into r from private.access_resources where id=(p_payload->>'workId')::uuid and resource_kind in ('capital_project','opportunity');
 if r.id is null then raise exception 'resource_access_denied' using errcode='42501'; end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('resource-policy:'||r.organization_id::text,0));
 perform private.require_resource_access_v1(r.id,'work');
 digest:=encode(extensions.digest(jsonb_build_object('payload',p_payload,'kind',p_kind,'actor',auth.uid())::text,'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended('adoption-context:'||jsonb_build_array(r.organization_id,r.id,btrim(p_payload->>'purpose'),btrim(p_payload->>'contextKey'))::text,0));
 select * into existing from public.assumption_versions where id=request;
 if found then
  if existing.organization_id is distinct from r.organization_id or existing.request_fingerprint<>digest then raise exception 'adoption_retry_conflict' using errcode='40001'; end if;
  if not private.can_read_assumption_version_v1(r.organization_id,request) then raise exception 'adoption_access_denied' using errcode='42501'; end if;
  return request;
 end if;
 select * into s from public.assumption_sets where organization_id=r.organization_id and work_reference=r.id and purpose=btrim(p_payload->>'purpose') and context_key=btrim(p_payload->>'contextKey') for update;
 if s.id is not null then select * into prior from public.assumption_versions where organization_id=r.organization_id and set_id=s.id order by revision desc limit 1; end if;
 if prior.id is distinct from expected then raise exception 'adoption_revision_conflict' using errcode='40001'; end if;
 if prior.id is not null and (prior.classification<>'working_basis' or not private.can_read_assumption_version_v1(r.organization_id,prior.id)) then raise exception 'adoption_access_denied' using errcode='42501'; end if;
 ref:=(p_payload->>case when p_kind='observation' then 'observationId' else 'referenceObservationId' end)::uuid;
 if p_kind='observation' and ref is null then raise exception 'invalid_adoption' using errcode='22023'; end if;
 if ref is not null then
  if not private.can_read_observation_v1(r.organization_id,ref) then raise exception 'observation_access_denied' using errcode='42501'; end if;
  select * into o from public.observations where organization_id=r.organization_id and id=ref;
  if o.source_version_id is not null then perform private.require_adoption_dependency_v1(r.organization_id,o.source_version_id,o.source_rights_version_id); end if;
 end if;
 if p_kind='observation' then
  if cardinality(o.incomplete_reasons)>0 then raise exception 'observation_interpretation_incomplete' using errcode='23514'; end if;
  dims:=private.observation_dimensions_json_v1(o);val:=o.asserted_value;value_kind:=o.value_type;field:=o.field_path;
 else
  dims:=p_payload->'dimensions';val:=p_payload->'value'->'value';value_kind:=p_payload->'value'->>'type';field:=p_payload->>'fieldPath';
  if jsonb_typeof(p_payload->'fieldPath')<>'string' or length(btrim(field)) not between 1 and 300
  or jsonb_typeof(p_payload->'value')<>'object' or (p_payload->'value')-array['type','value']<>'{}'::jsonb
  or (ref is not null and field<>o.field_path) then raise exception 'invalid_assumption' using errcode='22023'; end if;
 end if;
 if dims is null or jsonb_typeof(dims)<>'object' or dims-array['entityId','perimeter','periodStart','periodEnd','currency','unit','scale','scenario','definitionVersionId']<>'{}'::jsonb
 or not(dims ?& array['entityId','perimeter','periodStart','periodEnd','currency','unit','scale','scenario','definitionVersionId'])
 or exists(select 1 from jsonb_each(dims) item where jsonb_typeof(item.value) not in ('string','null'))
 or exists(select 1 from unnest(array['entityId','perimeter','periodEnd','unit','scale','scenario','definitionVersionId']) k where dims->>k is null)
 or length(btrim(dims->>'perimeter')) not between 1 and 300 or length(btrim(dims->>'unit')) not between 1 and 80 or length(btrim(dims->>'scenario')) not between 1 and 160
 or dims->>'scale' !~ '^(?:[1-9][0-9]*(?:\.[0-9]+)?|0\.[0-9]*[1-9][0-9]*)$'
 or not private.valid_observation_value_v1('date',dims->'periodEnd')
 or (dims->>'periodStart' is not null and (not private.valid_observation_value_v1('date',dims->'periodStart') or dims->>'periodStart'>dims->>'periodEnd'))
 or (dims->>'currency' is not null and dims->>'currency' !~ '^[A-Z]{3}$')
 or not coalesce(private.valid_observation_value_v1(value_kind,val),false)
 or (value_kind='number' and (jsonb_typeof(val)<>'string' or (dims->>'currency' is null and dims->>'unit' not in ('ratio','percent','percentage','count','days','months','years'))))
 then raise exception 'invalid_adoption_interpretation' using errcode='22023'; end if;
 if not private.can_read_entity_v1((dims->>'entityId')::uuid) or not private.can_read_definition_version_v1(r.organization_id,(dims->>'definitionVersionId')::uuid) then raise exception 'adoption_interpretation_denied' using errcode='42501'; end if;
 select * into def from public.definition_versions where organization_id=r.organization_id and id=(dims->>'definitionVersionId')::uuid;
 select * into metric from public.metric_definitions where organization_id=r.organization_id and id=def.metric_definition_id;
 if metric.kind='contractual' then
  perform private.require_adoption_dependency_v1(r.organization_id,def.contract_source_version_id,def.contract_rights_version_id);
  if ref is not null and o.definition_version_id is distinct from def.id then raise exception 'contract_definition_mismatch' using errcode='23514'; end if;
 end if;
 if s.id is null then
  insert into public.assumption_sets(organization_id,work_id,work_reference,purpose,context_key,created_by)
  values(r.organization_id,r.id,r.id,btrim(p_payload->>'purpose'),btrim(p_payload->>'contextKey'),auth.uid()) returning * into s;
 end if;
 slot:=encode(extensions.digest(jsonb_build_array(field,dims)::text,'sha256'),'hex');
 insert into public.adoption_decisions(organization_id,set_id,kind,field_path,slot_key,dimensions,value_type,asserted_value,reference_observation_id,definition_version_id,entity_id,reason,created_by)
 values(r.organization_id,s.id,p_kind,field,slot,dims,value_kind,val,ref,def.id,(dims->>'entityId')::uuid,btrim(p_payload->>'reason'),auth.uid()) returning id into decision;
 select coalesce(jsonb_agg(private.adoption_entry_json_v1(x.id) order by x.slot),'[]'::jsonb) into entries from (
 select i.decision_id as id,i.slot_key as slot from private.assumption_version_items i where i.organization_id=r.organization_id and i.version_id=prior.id and i.slot_key<>slot
 union all select decision,slot) x;
 if jsonb_array_length(entries)>256 then raise exception 'adoption_basis_limit' using errcode='54000'; end if;
 canonical:=jsonb_build_object('schemaVersion','contextual-adoption.v1','versionId',request,'setId',s.id,'workId',r.id,'purpose',s.purpose,'contextKey',s.context_key,
 'revision',coalesce(prior.revision,0)+1,'previousVersionId',prior.id,'classification','working_basis','entries',entries)::text;
 insert into public.assumption_versions(id,organization_id,set_id,revision,previous_version_id,classification,canonical_snapshot,content_fingerprint,request_fingerprint,created_by)
 values(request,r.organization_id,s.id,coalesce(prior.revision,0)+1,prior.id,'working_basis',canonical,encode(extensions.digest(canonical,'sha256'),'hex'),digest,auth.uid());
 insert into private.assumption_version_items(organization_id,set_id,version_id,slot_key,decision_id)
 select r.organization_id,s.id,request,i.slot_key,i.decision_id from private.assumption_version_items i where i.organization_id=r.organization_id and i.version_id=prior.id and i.slot_key<>slot;
 insert into private.assumption_version_items values(r.organization_id,s.id,request,slot,decision);
 return request;
end $$;
revoke all on function private.write_contextual_adoption_v1(jsonb,text) from public,anon,authenticated,service_role;
create function private.adopt_observation_for_work_v1(p_payload jsonb) returns uuid language sql volatile security definer set search_path='' as $$ select private.write_contextual_adoption_v1(p_payload,'observation'); $$;
create function private.propose_assumption_revision_v1(p_payload jsonb) returns uuid language sql volatile security definer set search_path='' as $$ select private.write_contextual_adoption_v1(p_payload,'hypothesis'); $$;
create function private.read_adoption_basis_v1(p_version_id uuid) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v public.assumption_versions; begin
 select * into v from public.assumption_versions where id=p_version_id;
 if v.id is null then raise exception 'adoption_access_denied' using errcode='42501'; end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('resource-policy:'||v.organization_id::text,0));
 if not private.can_read_assumption_version_v1(v.organization_id,v.id) then raise exception 'adoption_access_denied' using errcode='42501'; end if;
 return jsonb_build_object('canonical',v.canonical_snapshot,'fingerprint',v.content_fingerprint);
end $$;
create function private.compare_adoption_bases_v1(p_left_version_id uuid,p_right_version_id uuid) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare l jsonb; r jsonb; ls jsonb; rs jsonb; begin
 l:=private.read_adoption_basis_v1(p_left_version_id);r:=private.read_adoption_basis_v1(p_right_version_id);
 ls:=(l->>'canonical')::jsonb;rs:=(r->>'canonical')::jsonb;
 if ls->>'workId' is distinct from rs->>'workId' or ls->>'purpose' is distinct from rs->>'purpose' then raise exception 'adoption_comparison_scope_mismatch' using errcode='23514'; end if;
 return jsonb_build_object('left',l,'right',r);
end $$;
revoke all on function private.adopt_observation_for_work_v1(jsonb),private.propose_assumption_revision_v1(jsonb),private.read_adoption_basis_v1(uuid),private.compare_adoption_bases_v1(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.adopt_observation_for_work_v1(jsonb),private.propose_assumption_revision_v1(jsonb),private.read_adoption_basis_v1(uuid),private.compare_adoption_bases_v1(uuid,uuid) to authenticated;
create function public.adopt_observation_for_work_v1(p_payload jsonb) returns uuid language sql volatile security invoker set search_path='' as $$ select private.adopt_observation_for_work_v1(p_payload); $$;
create function public.propose_assumption_revision_v1(p_payload jsonb) returns uuid language sql volatile security invoker set search_path='' as $$ select private.propose_assumption_revision_v1(p_payload); $$;
create function public.read_adoption_basis_v1(p_version_id uuid) returns jsonb language sql volatile security invoker set search_path='' as $$ select private.read_adoption_basis_v1(p_version_id); $$;
create function public.compare_adoption_bases_v1(p_left_version_id uuid,p_right_version_id uuid) returns jsonb language sql volatile security invoker set search_path='' as $$ select private.compare_adoption_bases_v1(p_left_version_id,p_right_version_id); $$;
revoke all on function public.adopt_observation_for_work_v1(jsonb),public.propose_assumption_revision_v1(jsonb),public.read_adoption_basis_v1(uuid),public.compare_adoption_bases_v1(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.adopt_observation_for_work_v1(jsonb),public.propose_assumption_revision_v1(jsonb),public.read_adoption_basis_v1(uuid),public.compare_adoption_bases_v1(uuid,uuid) to authenticated;

create function private.list_work_observations_v1(p_work_id uuid,p_before_sequence text default null) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare org uuid; rows jsonb;
begin
 select organization_id into org from private.access_resources where id=p_work_id and resource_kind in ('capital_project','opportunity');
 if org is null then raise exception 'resource_access_denied' using errcode='42501'; end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('resource-policy:'||org::text,0));
 perform private.require_resource_access_v1(p_work_id,'read');
 if p_before_sequence is not null and p_before_sequence !~ '^[0-9]{1,19}$' then raise exception 'invalid_observation_cursor' using errcode='22023'; end if;
 select coalesce(jsonb_agg(x.item order by x.sequence desc),'[]'::jsonb) into rows from (
 select o.sequence,jsonb_build_object('id',o.id,'sequence',o.sequence::text,'dossierId',o.dossier_id,'fieldPath',o.field_path,
 'dimensions',private.observation_dimensions_json_v1(o),'value',jsonb_build_object('type',o.value_type,'value',o.asserted_value),
 'incompleteReasons',o.incomplete_reasons,'verificationState',o.verification_state,'sourceVersionId',o.source_version_id,'sourceName',sv.original_name) as item
 from public.observations o join public.dossiers d on d.organization_id=o.organization_id and d.id=o.dossier_id
 join private.access_resources r on r.organization_id=d.organization_id and r.id=d.resource_id
 left join public.source_versions sv on sv.organization_id=o.organization_id and sv.id=o.source_version_id
 where o.organization_id=org and (r.id=p_work_id or r.parent_resource_id=p_work_id)
 and (p_before_sequence is null or o.sequence<p_before_sequence::numeric)
 and private.can_read_observation_v1(org,o.id)
 order by o.sequence desc limit 26) x;
 return rows;
end $$;
revoke all on function private.list_work_observations_v1(uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.list_work_observations_v1(uuid,text) to authenticated;
create function public.list_work_observations_v1(p_work_id uuid,p_before_sequence text default null) returns jsonb language sql volatile security invoker set search_path='' as $$ select private.list_work_observations_v1(p_work_id,p_before_sequence); $$;
revoke all on function public.list_work_observations_v1(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.list_work_observations_v1(uuid,text) to authenticated;
