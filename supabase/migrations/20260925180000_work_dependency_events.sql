-- Stage 18, increment 3A (migration B of work_dependencies_and_continuity): change events,
-- invalidation facts and dependency-update requests. Nothing is recomputed here and no result or
-- decision is rewritten; scheduling candidate executions is increment 3B.
--
-- Events. A new version of a logical source that already had one, a newly published platform
-- release of a procedure and a newly published house release emit a domain event in the transaction
-- of the change, through private.append_domain_event_v1, next to the assumption_version and
-- adoption_decision events that already exist. These four kinds carry the effect
-- propagate_dependencies; every other kind keeps revalidate_authority. The consumer
-- (private.complete_event_outbox_v1) keeps its authority sweep exactly as it was and applies the
-- dependency effect only after it, in a subtransaction: a failure there never undoes the sweep and
-- never acknowledges the event, so the outbox retries it and, after five attempts, blocks it under
-- the existing alarm.
--
-- Facts. private.execution_invalidations holds one immutable row per (organization, execution,
-- logical key, event): dependency kind, pinned version, current head and reason class. Impact is
-- read from the current heads through private.execution_dependencies and the closure of
-- private.resource_dependencies, with slot granularity for assumptions, as computeDependencyImpact
-- (packages/work-plan/src/continuation.ts) defines it. A projection that misses a pinned input is
-- rebuilt with private.backfill_execution_dependencies_v1() before anything is judged.
--
-- Requests. public.work_continuation_requests holds at most one open dependency-update request per
-- work. A new event merges into it (union of affected executions, contributing events in canonical
-- order), in the dependency-update-request.v1 form of mergeDependencyUpdate and with the same
-- fingerprint. Opening a request writes its continuation_proposed milestone, once.
set search_path='';
-- The constraints below lock private.domain_events, which every audited mutation appends to: fail
-- fast instead of queueing behind a long transaction, as the stage 4 reconciliation did.
set local lock_timeout = '5s';

-- 1. The event contract: two new aggregate kinds and the dependency effect.
alter table private.domain_events drop constraint domain_events_aggregate_kind_check;
alter table private.domain_events add constraint domain_events_aggregate_kind_check check(aggregate_kind in ('membership','resource_grant','workspace_capability',
 'commercial_account_link','access_policy','observation','metric_definition','adoption_decision','assumption_version','source_version','method_release'));
alter table private.domain_events drop constraint domain_events_effect_check;
alter table private.domain_events add constraint domain_events_effect_check check(effect in ('revalidate_authority','propagate_dependencies'));
-- The new kinds always propagate; authority kinds never do. Adoption and assumption events recorded
-- before this migration keep revalidate_authority, so both effects stay valid for them.
alter table private.domain_events add constraint domain_events_effect_kind check(case
 when aggregate_kind in ('source_version','method_release') then effect='propagate_dependencies'
 when aggregate_kind in ('adoption_decision','assumption_version') then true
 else effect='revalidate_authority' end);

-- Every event revalidates authority; these kinds must also propagate dependencies.
create function private.domain_event_effect_v1(p_kind text) returns text
language sql immutable set search_path='' as $$
 select case when p_kind in ('source_version','method_release','adoption_decision','assumption_version') then 'propagate_dependencies' else 'revalidate_authority' end;
$$;

-- The procedure of a method release as a stable aggregate id: platform and house releases of one
-- procedure form one ordered event stream per organization.
create function private.method_procedure_aggregate_v1(p_method_id text) returns uuid
language sql immutable set search_path='' as $$ select md5('offroad:procedure:'||p_method_id)::uuid; $$;

-- append_domain_event_v1 records the effect of the kind, and a logical source orders its events by
-- its own version number (aggregate version = version_no) instead of the per-aggregate counter.
do $patch$
declare body text;needle text;
begin
 body:=pg_get_functiondef('private.append_domain_event_v1(uuid,uuid,text,uuid,text,jsonb,uuid,bigint,uuid)'::regprocedure);
 needle:=E' select coalesce(max(aggregate_version),0)+1 into revision from private.domain_events\n where organization_id=p_organization_id and aggregate_kind=p_kind and aggregate_id=p_aggregate_id;\n';
 if (length(body)-length(replace(body,needle,'')))/length(needle)<>1 then raise exception 'domain_event_version_contract_changed'; end if;
 body:=replace(body,needle,needle
  ||E' if p_kind=''source_version'' then\n'
  ||E'  if coalesce((p_state->>''versionNo'')::bigint,0)<revision then raise exception ''domain_event_version_regression'' using errcode=''22023''; end if;\n'
  ||E'  revision:=(p_state->>''versionNo'')::bigint;\n'
  ||E' end if;\n');
 needle:=E'human_intervention_id,retrieval_audit_event_id)\n values(';
 if (length(body)-length(replace(body,needle,'')))/length(needle)<>1 then raise exception 'domain_event_effect_contract_changed'; end if;
 body:=replace(body,needle,E'human_intervention_id,retrieval_audit_event_id,effect)\n values(');
 needle:=E'p_human_intervention_id,p_retrieval_event_id);\n';
 if (length(body)-length(replace(body,needle,'')))/length(needle)<>1 then raise exception 'domain_event_effect_contract_changed'; end if;
 body:=replace(body,needle,E'p_human_intervention_id,p_retrieval_event_id,private.domain_event_effect_v1(p_kind));\n');
 execute body;
end $patch$;

-- 2. Producers, in the transaction of the change.
-- A new version of a logical source that already had one. Aggregate: the logical source.
create function private.capture_source_version_event_v1() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.source_versions v where v.organization_id=new.organization_id and v.source_id=new.source_id and v.id<>new.id) then
  perform private.append_domain_event_v1(new.id,new.organization_id,'source_version',new.source_id,'created',
   jsonb_build_object('source',tg_table_name,'record_id',new.id,'versionNo',new.version_no));
 end if;
 return new;
end $$;
create trigger source_versions_dependency_event after insert on public.source_versions for each row execute function private.capture_source_version_event_v1();

-- A published method release. A platform release is shared, so every organization with an
-- execution of the procedure receives its own event; a house release belongs to one organization
-- and is announced when it moves from candidate to published. Retirement is a revocation matter
-- (stage 17) and emits nothing here.
create function private.capture_method_release_event_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare org uuid;method text;
begin
 if tg_table_name='platform_method_releases' then
  for org in select distinct m.organization_id from private.execution_manifests m
   join private.platform_method_releases r on r.id=m.platform_release_id
   where r.method_id=new.method_id order by m.organization_id loop
   perform private.append_domain_event_v1(md5('platform_method_release:'||new.id||':'||org::text)::uuid,org,'method_release',
    private.method_procedure_aggregate_v1(new.method_id),'created',jsonb_build_object('source',tg_table_name,'record_id',new.id,'methodId',new.method_id));
  end loop;
 elsif tg_table_name='method_releases' then
  if new.status<>'published' or old.status='published' then return new; end if;
  select b.method_id into method from private.platform_method_releases b where b.id=new.base_release_id;
  if method is null then raise exception 'method_release_procedure_missing' using errcode='23514'; end if;
  perform private.append_domain_event_v1(new.id,new.organization_id,'method_release',private.method_procedure_aggregate_v1(method),'changed',
   jsonb_build_object('source',tg_table_name,'record_id',new.id,'methodId',method));
 else
  raise exception 'dependency_event_source_unknown' using errcode='23514';
 end if;
 return new;
end $$;
create trigger platform_method_releases_dependency_event after insert on private.platform_method_releases for each row execute function private.capture_method_release_event_v1();
create trigger method_releases_dependency_event after update of status on public.method_releases for each row execute function private.capture_method_release_event_v1();

-- 3. Heads: the newest version of each logical key, read at processing time.
-- A logical source: its newest version, verified or not.
create function private.source_head_v1(p_org uuid,p_source uuid) returns table(version_id uuid,version_no integer)
language sql stable security definer set search_path='' as $$
 select v.id,v.version_no from public.source_versions v where v.organization_id=p_org and v.source_id=p_source order by v.version_no desc limit 1;
$$;

-- An assumption slot: the set's head revision and the slot's decision in it, null when the head
-- revision no longer holds the slot (a data change, not an incomplete graph).
create function private.assumption_slot_head_v1(p_org uuid,p_set uuid,p_slot text) returns table(version_id uuid,revision integer,decision_id uuid)
language sql stable security definer set search_path='' as $$
 select v.id,v.revision,(select i.decision_id from private.assumption_version_items i where i.organization_id=v.organization_id and i.version_id=v.id and i.slot_key=p_slot)
 from public.assumption_versions v where v.organization_id=p_org and v.set_id=p_set order by v.revision desc limit 1;
$$;

-- A published platform release: the latest publication event of its candidate says published; a
-- release imported without a candidate was published by its import.
create function private.platform_method_release_published_v1(p_release text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.platform_method_releases b where b.id=p_release and coalesce((
  select e.action='published' from private.platform_method_candidates x join private.platform_method_publication_events e on e.candidate_id=x.id
  where x.release_id=b.id order by e.sequence desc limit 1),true));
$$;

-- A procedure. Without a house pin: its newest published platform release (created_at, then id,
-- newest first). With a house pin: the organization's newest published house release of the
-- procedure (published_at, then id) with the platform release it is composed on; none published is
-- an unknown head. The profile is the one the execution request would pick for that release
-- (compiled deterministic adapter, released universal capability, available reference); when
-- several qualify, the newest registration in private.execution_profile_registrations, then id.
create function private.method_release_head_v1(p_org uuid,p_method text,p_house boolean)
returns table(platform_release_id text,house_release_id uuid,profile_id uuid,max_cost_microusd bigint,max_model_calls bigint)
language sql stable security definer set search_path='' as $$
 with platform_head as (
  select b.id as platform_release_id,null::uuid as house_release_id from private.platform_method_releases b
  where not p_house and b.method_id=p_method and private.platform_method_release_published_v1(b.id)
  order by b.created_at desc,b.id desc limit 1),
 house_head as (
  select h.base_release_id as platform_release_id,h.id as house_release_id from public.method_releases h
  join private.platform_method_releases b on b.id=h.base_release_id
  where p_house and h.organization_id=p_org and h.status='published' and b.method_id=p_method
  order by h.published_at desc,h.id desc limit 1),
 chosen as (select * from platform_head union all select * from house_head)
 select c.platform_release_id,c.house_release_id,p.id,(p.payload#>>'{limits,maxCostMicrousd}')::bigint,(p.payload#>>'{limits,maxModelCalls}')::bigint
 from chosen c left join lateral (
  select x.id,x.payload from private.execution_method_profiles x
  join private.platform_method_releases r on r.id=x.platform_release_id
  join private.platform_capability_releases k on k.capability_key=r.capability_key and k.method_id=r.method_id and k.method_version=r.version
  left join private.execution_profile_registrations g on g.profile_id=x.id
  where x.platform_release_id=c.platform_release_id and x.payload->>'adapter'='compiled-single-deterministic.v1'
   and k.released and k.exposure='universal' and private.platform_method_reference_available_v1(r.id)
  order by g.sequence desc nulls last,x.id limit 1) p on true;
$$;

-- 4. Impact of one change on the executions of an organization, from the current heads. Only the
-- logical keys the event touches are judged: a source (with the derived versions that descend from
-- its versions), the slots of an assumption set (or one slot), or a procedure. Executions that ended
-- without a result (failed, poison or cancelled job and no result receipt) have no output to update
-- and are left out. An execution with no recorded edge at all is graph_incomplete for every change.
create function private.dependency_event_impact_v1(p_org uuid,p_source uuid,p_set uuid,p_slot text,p_method text)
returns table(execution_id uuid,work_id uuid,dependency_kind text,logical_key text,reason_class text,gap text,pinned jsonb,head jsonb,via uuid[])
language sql stable security definer set search_path='' as $$
 with recursive
 live as (
  select e.id,e.work_id from public.work_executions e
  where e.organization_id=p_org
   and (exists(select 1 from private.execution_result_receipts r where r.organization_id=e.organization_id and r.execution_id=e.id)
    or exists(select 1 from public.processing_jobs j where j.organization_id=e.organization_id and j.execution_id=e.id and j.status in ('queued','awaiting_approval','leased')))),
 key_versions as (select v.id,v.version_no from public.source_versions v where v.organization_id=p_org and v.source_id=p_source),
 -- Derived versions whose ancestry reaches a version of the source, with that ancestor.
 descent(version_id,ancestor_id) as (
  select r.derived_version_id,r.source_version_id from private.resource_dependencies r join key_versions k on k.id=r.source_version_id where r.organization_id=p_org
  union
  select r.derived_version_id,d.ancestor_id from private.resource_dependencies r join descent d on d.version_id=r.source_version_id where r.organization_id=p_org),
 -- Each pinned source version and the version of the source it carries: itself or an ancestor.
 reached as (
  select d.execution_id,d.source_version_id as pin_id,d.source_version_id as version_id from private.execution_dependencies d join key_versions k on k.id=d.source_version_id
  where d.organization_id=p_org and d.dependency_kind='source_version'
  union
  select d.execution_id,d.source_version_id,x.ancestor_id from private.execution_dependencies d join descent x on x.version_id=d.source_version_id
  where d.organization_id=p_org and d.dependency_kind='source_version'),
 -- The newest version of the source each execution relied on, directly or through a derivation.
 relied as (
  select distinct on (r.execution_id) r.execution_id,r.version_id,k.version_no from reached r join key_versions k on k.id=r.version_id
  order by r.execution_id,k.version_no desc),
 -- Per slot, the pin of the highest revision the execution relied on.
 slot_pins as (
  select distinct on (d.execution_id,d.slot_key) d.execution_id,d.slot_key,d.assumption_revision,d.assumption_version_id,d.decision_id,d.content_fingerprint
  from private.execution_dependencies d
  where d.organization_id=p_org and d.dependency_kind='assumption_slot' and d.assumption_set_id=p_set and (p_slot is null or d.slot_key=p_slot)
  order by d.execution_id,d.slot_key,d.assumption_revision desc,d.id),
 method_pins as (
  select d.execution_id,d.platform_release_id,d.house_release_id from private.execution_dependencies d
  where d.organization_id=p_org and d.dependency_kind='method_release' and d.logical_key=p_method),
 platform_head as (select h.platform_release_id,h.house_release_id from private.method_release_head_v1(p_org,p_method,false) h),
 house_head as (select h.platform_release_id,h.house_release_id from private.method_release_head_v1(p_org,p_method,true) h),
 method_judged as (
  select p.execution_id,p.platform_release_id,p.house_release_id,
   case when p.house_release_id is null then ph.platform_release_id else hh.platform_release_id end as head_platform,
   case when p.house_release_id is null then null else hh.house_release_id end as head_house
  from method_pins p left join platform_head ph on true left join house_head hh on true)
 select l.id,l.work_id,'source_version',p_source::text,
  case when h.version_id is null or h.version_no<r.version_no then 'graph_incomplete' else 'data_change' end,
  case when h.version_id is null then 'head_unknown' when h.version_no<r.version_no then 'head_behind_pin' end,
  jsonb_build_object('sourceId',p_source,'versionNo',r.version_no,'versionId',r.version_id),
  case when h.version_id is not null then jsonb_build_object('sourceId',p_source,'versionNo',h.version_no,'versionId',h.version_id) end,
  -- The directly pinned derived versions that carry the moved ancestor; empty when the pin itself moved.
  case when exists(select 1 from private.execution_dependencies d where d.organization_id=p_org and d.execution_id=r.execution_id
    and d.dependency_kind='source_version' and d.source_version_id=r.version_id) then '{}'::uuid[]
   else (select array_agg(distinct x.pin_id order by x.pin_id) from reached x where x.execution_id=r.execution_id and x.version_id=r.version_id) end
 from relied r join live l on l.id=r.execution_id left join private.source_head_v1(p_org,p_source) h on true
 where h.version_id is null or h.version_no<>r.version_no
 union all
 select l.id,l.work_id,'assumption_slot',p_set::text||':'||p.slot_key,
  case when h.version_id is null or h.revision<p.assumption_revision then 'graph_incomplete' else 'data_change' end,
  case when h.version_id is null then 'head_unknown' when h.revision<p.assumption_revision then 'head_behind_pin' end,
  jsonb_build_object('revision',p.assumption_revision,'versionId',p.assumption_version_id,'decisionId',p.decision_id,'contentFingerprint',p.content_fingerprint),
  case when h.version_id is not null then jsonb_build_object('revision',h.revision,'versionId',h.version_id,'decisionId',h.decision_id) end,
  '{}'::uuid[]
 from slot_pins p join live l on l.id=p.execution_id left join lateral private.assumption_slot_head_v1(p_org,p_set,p.slot_key) h on true
 where h.version_id is null or h.revision<p.assumption_revision or h.decision_id is distinct from p.decision_id
 union all
 select l.id,l.work_id,'method_release',p_method,
  case when m.head_platform is null then 'graph_incomplete' else 'method_update' end,
  case when m.head_platform is null then 'head_unknown' end,
  jsonb_build_object('platformReleaseId',m.platform_release_id,'houseReleaseId',m.house_release_id),
  case when m.head_platform is not null then jsonb_build_object('platformReleaseId',m.head_platform,'houseReleaseId',m.head_house) end,
  '{}'::uuid[]
 from method_judged m join live l on l.id=m.execution_id
 where m.head_platform is null or m.head_platform<>m.platform_release_id or m.head_house is distinct from m.house_release_id
 union all
 select l.id,l.work_id,null,'*','graph_incomplete','no_recorded_edges',null::jsonb,null::jsonb,'{}'::uuid[]
 from live l where not exists(select 1 from private.execution_dependencies d where d.organization_id=p_org and d.execution_id=l.id);
$$;

-- A pinned input without its projection row makes the recorded graph incomplete: rebuild it from
-- the pinned rows (the same mapping the request triggers use) before judging.
create function private.rebuild_incomplete_execution_dependencies_v1(p_org uuid) returns bigint
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from private.execution_dependency_sources_v1 s where s.organization_id=p_org and not exists(
  select 1 from private.execution_dependencies d where d.organization_id=s.organization_id and d.execution_id=s.execution_id
   and d.dependency_kind=s.dependency_kind and d.logical_key=s.logical_key and d.source_binding_id is not distinct from s.source_binding_id
   and d.basis_binding_id is not distinct from s.basis_binding_id and d.manifest_id is not distinct from s.manifest_id)) then
  return private.backfill_execution_dependencies_v1();
 end if;
 return 0;
end $$;

-- 5. Invalidation facts: one immutable row per organization, execution, logical key and event.
create table private.execution_invalidations (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 work_id uuid not null,
 execution_id uuid not null,
 event_id uuid not null,
 dependency_kind text check(dependency_kind in ('source_version','assumption_slot','method_release')),
 logical_key text not null check(length(logical_key)>0),
 reason_class text not null check(reason_class in ('data_change','method_update','graph_incomplete')),
 gap text check(gap in ('no_recorded_edges','head_unknown','head_behind_pin')),
 pinned jsonb check(jsonb_typeof(pinned)='object'),
 head jsonb check(jsonb_typeof(head)='object'),
 via_source_version_ids uuid[] not null default '{}',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(organization_id,id),
 constraint execution_invalidations_event_key unique nulls not distinct(organization_id,execution_id,dependency_kind,logical_key,event_id),
 foreign key(organization_id,work_id) references public.capital_projects(organization_id,id),
 foreign key(organization_id,execution_id) references public.work_executions(organization_id,id),
 foreign key(organization_id,event_id) references private.domain_events(organization_id,id),
 -- Reasons and gaps follow computeDependencyImpact: a data change moves a source or a slot, a method
 -- update moves a procedure, and an incomplete graph names its gap. Without a recorded edge there is
 -- no key; an unknown head has no head.
 constraint execution_invalidations_shape check(
  (gap is null)=(reason_class<>'graph_incomplete')
  and (dependency_kind is null)=coalesce(gap='no_recorded_edges',false)
  and (dependency_kind is not null or (logical_key='*' and pinned is null and head is null))
  and (dependency_kind is null or pinned is not null)
  and (head is null)=coalesce(gap in ('no_recorded_edges','head_unknown'),false)
  and (reason_class<>'method_update' or dependency_kind='method_release')
  and (reason_class<>'data_change' or dependency_kind in ('source_version','assumption_slot'))
  and (dependency_kind='source_version' or cardinality(via_source_version_ids)=0)
  and (dependency_kind is distinct from 'source_version' or (logical_key=pinned->>'sourceId'
   and pinned ?& array['sourceId','versionNo','versionId'] and (head is null or head ?& array['sourceId','versionNo','versionId'])))
  and (dependency_kind is distinct from 'assumption_slot' or (pinned ?& array['revision','versionId','decisionId','contentFingerprint']
   and (head is null or head ?& array['revision','versionId','decisionId'])))
  and (dependency_kind is distinct from 'method_release' or (pinned ?& array['platformReleaseId','houseReleaseId']
   and (head is null or head ?& array['platformReleaseId','houseReleaseId']))))
);
create index execution_invalidations_event_idx on private.execution_invalidations(organization_id,event_id);
create index execution_invalidations_work_idx on private.execution_invalidations(organization_id,work_id,execution_id);
alter table private.execution_invalidations enable row level security;
alter table private.execution_invalidations force row level security;
revoke all on private.execution_invalidations from public,anon,authenticated,service_role;
create policy execution_invalidations_deny_clients on private.execution_invalidations as restrictive for all to anon,authenticated using(false) with check(false);
create trigger execution_invalidations_immutable before update or delete on private.execution_invalidations for each row execute function private.reject_work_continuity_mutation_v1();
create trigger execution_invalidations_truncate_guard before truncate on private.execution_invalidations for each statement execute function private.reject_work_continuity_mutation_v1();
create trigger execution_invalidations_updated before update on private.execution_invalidations for each row execute function private.set_updated_at();

-- 6. Continuation requests.
-- Canonical JSON and fingerprint of continuation.ts (stableJson and fingerprintOf): object keys in
-- code point order, arrays in their order, no whitespace, SHA-256 of the UTF-8 text.
create function private.continuation_stable_json_v1(p_value jsonb) returns text
language plpgsql immutable set search_path='' as $$
declare result text;
begin
 if jsonb_typeof(p_value)='object' then
  select '{'||coalesce(string_agg(to_jsonb(e.key)::text||':'||private.continuation_stable_json_v1(e.value),',' order by e.key collate "C"),'')||'}' into result from jsonb_each(p_value) e;
 elsif jsonb_typeof(p_value)='array' then
  select '['||coalesce(string_agg(private.continuation_stable_json_v1(e.value),',' order by e.ordinality),'')||']' into result from jsonb_array_elements(p_value) with ordinality e;
 else
  result:=p_value::text;
 end if;
 return result;
end $$;
create function private.continuation_fingerprint_v1(p_value jsonb) returns text
language sql immutable set search_path='' as $$
 select encode(extensions.digest(convert_to(private.continuation_stable_json_v1(p_value),'UTF8'),'sha256'),'hex');
$$;

-- The status machine: forward only, a terminal state never changes, and an update is adopted only
-- once it is ready. Increments 3B and 4 own the commands that move it.
create function private.work_continuation_transition_allowed_v1(p_from text,p_to text) returns boolean
language sql immutable set search_path='' as $$
 select case p_from
  when 'open' then p_to in ('awaiting_authorization','scheduled','ready','declined','superseded')
  when 'awaiting_authorization' then p_to in ('scheduled','declined','superseded')
  when 'scheduled' then p_to in ('ready','declined','superseded')
  when 'ready' then p_to in ('adopted','declined','superseded')
  else false end;
$$;

create table public.work_continuation_requests (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 work_id uuid not null,
 kind text not null check(kind in ('dependency_update','user_followup')),
 status text not null default 'open' check(status in ('open','awaiting_authorization','scheduled','ready','adopted','declined','superseded')),
 revision integer not null default 1 check(revision>0),
 payload jsonb not null check(jsonb_typeof(payload)='object'),
 payload_fingerprint text not null check(payload_fingerprint ~ '^[a-f0-9]{64}$'),
 affected_executions jsonb not null default '[]' check(jsonb_typeof(affected_executions)='array'),
 superseded_by_request_id uuid,
 created_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(organization_id,id),
 unique(organization_id,work_id,id),
 foreign key(organization_id,work_id) references public.capital_projects(organization_id,id),
 foreign key(organization_id,work_id,superseded_by_request_id) references public.work_continuation_requests(organization_id,work_id,id),
 check(superseded_by_request_id is distinct from id),
 check((status='superseded')=(superseded_by_request_id is not null)),
 -- A dependency update is opened by the system; a follow-up is a person's request.
 check((kind='dependency_update')=(created_by is null)),
 check(payload_fingerprint=private.continuation_fingerprint_v1(payload)),
 -- The payload is dependency-update-request.v1 as last merged; its own status is the merge state of
 -- the contract and stays open, while the column carries the lifecycle.
 constraint work_continuation_requests_dependency_shape check(kind<>'dependency_update' or (
  payload->>'schemaVersion'='dependency-update-request.v1' and payload->>'workId'=work_id::text and payload->>'status'='open'
  and jsonb_typeof(payload->'affectedExecutionIds')='array' and jsonb_array_length(payload->'affectedExecutionIds')>0
  and jsonb_typeof(payload->'events')='array' and jsonb_array_length(payload->'events')>0
  and jsonb_typeof(payload->'aggregateVersions')='array' and jsonb_array_length(payload->'aggregateVersions')>0
  and payload-array['schemaVersion','workId','status','affectedExecutionIds','events','aggregateVersions']='{}'::jsonb
  and jsonb_array_length(affected_executions)=jsonb_array_length(payload->'affectedExecutionIds')))
);
-- One open dependency-update request per work: every new event merges into it.
create unique index work_continuation_requests_open_update_idx on public.work_continuation_requests(organization_id,work_id) where kind='dependency_update' and status='open';
create index work_continuation_requests_work_idx on public.work_continuation_requests(organization_id,work_id,created_at desc,id desc);
create index work_continuation_requests_superseded_idx on public.work_continuation_requests(organization_id,work_id,superseded_by_request_id) where superseded_by_request_id is not null;
create index work_continuation_requests_actor_idx on public.work_continuation_requests(created_by) where created_by is not null;
alter table public.work_continuation_requests enable row level security;
alter table public.work_continuation_requests force row level security;
revoke all on public.work_continuation_requests from public,anon,authenticated,service_role;
grant select on public.work_continuation_requests to authenticated;
-- The same read authority as public.work_milestones: the person must be able to read the work.
create policy work_continuation_requests_select_authorized on public.work_continuation_requests for select to authenticated using((select private.can_access_capital_project(organization_id,work_id)));
create policy work_continuation_requests_deny_insert on public.work_continuation_requests for insert to authenticated with check(false);
create policy work_continuation_requests_deny_update on public.work_continuation_requests for update to authenticated using(false) with check(false);
create policy work_continuation_requests_deny_delete on public.work_continuation_requests for delete to authenticated using(false);

-- Identity never changes, every write bumps the revision, the payload changes only by a merge while
-- open, and the status follows the machine. Nothing is deleted or truncated.
create function private.guard_work_continuation_request_v1() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'work_continuity_history_immutable' using errcode='23514'; end if;
 if (new.id,new.organization_id,new.work_id,new.kind,new.created_by,new.created_at) is distinct from (old.id,old.organization_id,old.work_id,old.kind,old.created_by,old.created_at)
 or new.revision<>old.revision+1
 or ((new.payload,new.payload_fingerprint,new.affected_executions) is distinct from (old.payload,old.payload_fingerprint,old.affected_executions)
  and not (old.status='open' and new.status='open'))
 or (new.status<>old.status and not private.work_continuation_transition_allowed_v1(old.status,new.status))
 or (new.superseded_by_request_id is distinct from old.superseded_by_request_id and new.status<>'superseded') then
  raise exception 'work_continuation_request_transition_invalid' using errcode='23514';
 end if;
 return new;
end $$;
create trigger work_continuation_requests_guard before update or delete on public.work_continuation_requests for each row execute function private.guard_work_continuation_request_v1();
create trigger work_continuation_requests_truncate_guard before truncate on public.work_continuation_requests for each statement execute function private.reject_work_continuity_mutation_v1();
create trigger work_continuation_requests_updated before update on public.work_continuation_requests for each row execute function private.set_updated_at();
create trigger work_continuation_requests_audit after insert or update or delete on public.work_continuation_requests for each row execute function private.capture_identity_audit_v1();

-- Opens or merges the work's dependency-update request for one event, as mergeDependencyUpdate
-- defines it: events deduplicated by id, the union of affected executions, contributing events in
-- canonical order and the newest version seen per aggregate. Per affected execution the request
-- also names its root execution (the execution itself until increment 3B records lineage) and the
-- execution_result milestone it refers to; results and decisions are never touched.
create function private.merge_dependency_update_request_v1(p_org uuid,p_work uuid,p_event uuid,p_executions uuid[]) returns text
language plpgsql security definer set search_path='' as $$
declare e private.domain_events;r public.work_continuation_requests;events jsonb;versions jsonb;affected jsonb;details jsonb;body jsonb;created uuid;
begin
 select * into strict e from private.domain_events where organization_id=p_org and id=p_event;
 if coalesce(cardinality(p_executions),0)=0 then return 'unaffected'; end if;
 if exists(select 1 from unnest(p_executions) x where not exists(select 1 from public.work_executions w where w.organization_id=p_org and w.id=x and w.work_id=p_work)) then
  raise exception 'dependency_update_work_mismatch' using errcode='23514';
 end if;
 -- Two changes to the same work serialize here and end in one open request.
 perform pg_advisory_xact_lock(hashtextextended('work-continuation:'||p_org::text||':'||p_work::text,0));
 if exists(select 1 from public.work_continuation_requests x where x.organization_id=p_org and x.work_id=p_work and x.kind='dependency_update'
  and x.payload->'events' @> jsonb_build_array(jsonb_build_object('eventId',e.id))) then return 'duplicate'; end if;
 select * into r from public.work_continuation_requests x where x.organization_id=p_org and x.work_id=p_work and x.kind='dependency_update' and x.status='open' for update;
 select jsonb_agg(x.value order by x.value->>'aggregateKind' collate "C",x.value->>'aggregateId' collate "C",(x.value->>'aggregateVersion')::bigint,x.value->>'eventId' collate "C")
 into events from jsonb_array_elements(coalesce(r.payload->'events','[]'::jsonb)||jsonb_build_array(jsonb_build_object(
  'eventId',e.id,'aggregateKind',e.aggregate_kind,'aggregateId',e.aggregate_id,'aggregateVersion',e.aggregate_version))) x;
 select jsonb_agg(jsonb_build_object('aggregateKind',v.kind,'aggregateId',v.aggregate,'version',v.version) order by v.kind collate "C",v.aggregate collate "C") into versions
 from (select x.value->>'aggregateKind' as kind,x.value->>'aggregateId' as aggregate,max((x.value->>'aggregateVersion')::bigint) as version
  from jsonb_array_elements(events) x group by 1,2) v;
 select jsonb_agg(to_jsonb(q.id) order by q.id collate "C") into affected from (
  select a.value#>>'{}' as id from jsonb_array_elements(coalesce(r.payload->'affectedExecutionIds','[]'::jsonb)) a
  union select x::text from unnest(p_executions) x) q;
 body:=jsonb_build_object('schemaVersion','dependency-update-request.v1','workId',p_work,'status','open',
  'affectedExecutionIds',affected,'events',events,'aggregateVersions',versions);
 select jsonb_agg(jsonb_build_object('executionId',q.id,'rootExecutionId',q.id,'resultMilestoneId',(
  select m.id from public.work_milestones m where m.organization_id=p_org and m.kind='execution_result' and m.subject_kind='work_execution' and m.subject_id=q.id::uuid))
  order by q.id collate "C") into details
 from (select a.value#>>'{}' as id from jsonb_array_elements(affected) a) q;
 if r.id is null then
  insert into public.work_continuation_requests(organization_id,work_id,kind,status,payload,payload_fingerprint,affected_executions)
  values(p_org,p_work,'dependency_update','open',body,private.continuation_fingerprint_v1(body),details) returning id into created;
  insert into public.work_milestones(organization_id,work_id,kind,subject_kind,subject_id,label,occurred_at)
  select x.organization_id,x.work_id,'continuation_proposed','work_continuation_request',x.id,'dependency_update',x.created_at
  from public.work_continuation_requests x where x.organization_id=p_org and x.id=created
  on conflict on constraint work_milestones_subject_key do nothing;
  return 'opened';
 end if;
 update public.work_continuation_requests set payload=body,payload_fingerprint=private.continuation_fingerprint_v1(body),affected_executions=details,revision=revision+1
 where organization_id=p_org and id=r.id;
 return 'merged';
end $$;

-- The dependency effect of one event: rebuild an incomplete projection, record the facts of the
-- keys the event touches, then open or merge one request per affected work, in work order. The same
-- event applied again writes nothing and changes nothing.
create function private.apply_dependency_event_v1(p_org uuid,p_event uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e private.domain_events;src uuid;target_set uuid;slot text;method text;rebuilt bigint;facts bigint;w record;outcome text;opened integer:=0;merged integer:=0;
begin
 select * into e from private.domain_events where organization_id=p_org and id=p_event;
 if not found then raise exception 'dependency_event_missing' using errcode='P0002'; end if;
 if e.effect<>'propagate_dependencies' then return jsonb_build_object('applied',false); end if;
 if e.aggregate_kind='source_version' then src:=e.aggregate_id;
 elsif e.aggregate_kind='assumption_version' then select v.set_id into target_set from public.assumption_versions v where v.organization_id=p_org and v.id=e.aggregate_id;
 elsif e.aggregate_kind='adoption_decision' then select a.set_id,a.slot_key into target_set,slot from public.adoption_decisions a where a.organization_id=p_org and a.id=e.aggregate_id;
 elsif e.aggregate_kind='method_release' then method:=e.protected_state->>'methodId';
 end if;
 if src is null and target_set is null and method is null then raise exception 'dependency_event_subject_missing' using errcode='P0002'; end if;
 rebuilt:=private.rebuild_incomplete_execution_dependencies_v1(p_org);
 with written as (
  insert into private.execution_invalidations(organization_id,work_id,execution_id,event_id,dependency_kind,logical_key,reason_class,gap,pinned,head,via_source_version_ids)
  select p_org,i.work_id,i.execution_id,e.id,i.dependency_kind,i.logical_key,i.reason_class,i.gap,i.pinned,i.head,i.via
  from private.dependency_event_impact_v1(p_org,src,target_set,slot,method) i
  order by i.execution_id,i.dependency_kind,i.logical_key
  on conflict on constraint execution_invalidations_event_key do nothing returning 1)
 select count(*) into facts from written;
 for w in select f.work_id,array_agg(distinct f.execution_id) as executions from private.execution_invalidations f
  where f.organization_id=p_org and f.event_id=e.id group by f.work_id order by f.work_id loop
  outcome:=private.merge_dependency_update_request_v1(p_org,w.work_id,e.id,w.executions);
  if outcome='opened' then opened:=opened+1; elsif outcome='merged' then merged:=merged+1; end if;
 end loop;
 return jsonb_build_object('applied',true,'rebuilt',rebuilt,'facts',facts,'opened',opened,'merged',merged);
end $$;

-- Called by the outbox completion after the authority sweep. Returns false when the dependency
-- effect failed: its writes are rolled back with its subtransaction, the sweep stays applied. A
-- statement timeout that strikes inside the effect is caught too, so a slow effect can never cancel
-- the sweep that already ran in the same completion.
create function private.apply_outbox_dependency_effect_v1(p_org uuid,p_event uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from private.domain_events where organization_id=p_org and id=p_event and effect='propagate_dependencies') then return true; end if;
 begin
  perform private.apply_dependency_event_v1(p_org,p_event);
  return true;
 exception
  when query_canceled then
   raise warning 'dependency_effect_failed event=% sqlstate=%',p_event,sqlstate;
   return false;
  when others then
   raise warning 'dependency_effect_failed event=% sqlstate=%',p_event,sqlstate;
   return false;
 end;
end $$;

-- 7. The consumer. The authority sweep of complete_event_outbox_v1 is unchanged and runs first; the
-- dependency effect follows in the same completion. When it fails and the sweep is done, the lease
-- is kept unacknowledged: the outbox retries after the lease expires and blocks the row after five
-- attempts. When the sweep still has work, the row returns to pending exactly as before.
do $patch$
declare body text;needle text;
begin
 body:=pg_get_functiondef('private.complete_event_outbox_v1(text,uuid,text)'::regprocedure);
 needle:=E' update private.event_outbox set status=case when remaining then ''pending'' else ''completed'' end,\n';
 if (length(body)-length(replace(body,needle,'')))/length(needle)<>1 then raise exception 'event_outbox_dependency_contract_changed'; end if;
 body:=replace(body,needle,
  E' if not private.apply_outbox_dependency_effect_v1(item.organization_id,item.event_id) and not remaining then\n'
  ||E'  update private.event_outbox set applied_count=applied_count+applied,updated_at=clock_timestamp() where id=item.id;\n'
  ||E'  return jsonb_build_object(''completed'',false,''replayed'',false,''appliedCount'',item.applied_count+applied);\n'
  ||E' end if;\n'||needle);
 execute body;
end $patch$;

-- 8. Everything created here is closed to every API role; the patched functions keep their grants.
do $$ declare f record;begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='private' and p.proname in ('domain_event_effect_v1','method_procedure_aggregate_v1','capture_source_version_event_v1','capture_method_release_event_v1',
  'source_head_v1','assumption_slot_head_v1','platform_method_release_published_v1','method_release_head_v1','dependency_event_impact_v1',
  'rebuild_incomplete_execution_dependencies_v1','continuation_stable_json_v1','continuation_fingerprint_v1','work_continuation_transition_allowed_v1',
  'guard_work_continuation_request_v1','merge_dependency_update_request_v1','apply_dependency_event_v1','apply_outbox_dependency_effect_v1')
 loop execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);end loop;
end $$;

comment on column private.domain_events.effect is 'revalidate_authority: the consumer runs the authority sweep. propagate_dependencies: the sweep, then the dependency effect (invalidation facts and the dependency-update request). source_version and method_release events always propagate; adoption_decision and assumption_version events propagate from stage 18 increment 3A on.';
comment on table private.execution_invalidations is 'Immutable invalidation facts: one row per organization, execution, logical key and event, with the dependency kind, the pinned version, the current head read at processing time and the reason class (data_change, method_update, graph_incomplete with its gap). Written only by the dependency effect of the outbox consumer; no client, worker or RPC path. Closed to every API role.';
comment on column private.execution_invalidations.via_source_version_ids is 'For a source whose ancestor moved: the directly pinned derived versions that carry it. Empty when the pinned version itself moved. A recomputation waits until the derived source has a newer version (increment 3B).';
comment on table public.work_continuation_requests is 'Continuation requests of a work. dependency_update: opened or merged by the outbox consumer, at most one open per work, payload dependency-update-request.v1 with the fingerprint of packages/work-plan/src/continuation.ts, affected executions with their root and result milestone. user_followup: written by increment 4. Readable by whoever can read the work; no client insert, update or delete; the status only moves forward.';
comment on column public.work_continuation_requests.revision is 'Incremented by every write (merge or status change); the expected revision of the commands of increments 3B and 4.';
comment on column public.work_continuation_requests.affected_executions is 'Per affected execution, in execution id order: executionId, rootExecutionId (the execution itself until lineage exists) and resultMilestoneId (its execution_result milestone, null while it has no committed result).';
