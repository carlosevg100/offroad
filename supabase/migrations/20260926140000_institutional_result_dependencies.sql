-- Stage 18, increment 5A: the institutional model results join the common dependency graph.
--
-- An institutional model result (private.institutional_model_results) is produced by the
-- deterministic agent_operation_brief job, not by public.work_executions, so the projection of
-- increment 2 never saw it. Until now two paths recalculated it outside the graph, each by posting a
-- synthetic message and redoing the whole calculation: the approve-and-calculate command, whenever a
-- configuration was approved, and private.propagate_project_canonical_revision_v1, which has no
-- caller. This migration gives the results the same path as 3A and 3B:
--
--   Edges. private.institutional_result_dependencies records, in the transaction that creates each
--   result, what it pinned: the approved configuration revision and the source versions its
--   configuration was reviewed against (the provenance source bindings and lineage). It has the
--   contract of private.execution_dependencies (immutable, closed to clients, one mapping view read
--   by the trigger and by the backfill) and is backfilled for every existing result. The receivables
--   evidence scope and the accepted execution brief are components of the canonical revision but the
--   calculation does not read them, so no edge exists for them.
--
--   Events and impact. A newer approved configuration of a work emits the new aggregate kind
--   institutional_configuration with propagate_dependencies; a newer version of a source already
--   emits source_version (3A). The dependency effect records facts in
--   private.institutional_result_invalidations with the rules of 3A (the newest version relied on
--   against the head, derivation closure included; graph_incomplete when a head is unknown or behind
--   the pin) and merges the affected results into the work's one open dependency-update request.
--
--   Recomputation. The 3B planner plans the institutional lineages of the open request with the
--   rules of 3B: the newest live result represents its lineage; up to date is reused; otherwise one
--   candidate in public.institutional_recompute_candidates keyed by dependencyRecomputeKey, never
--   twice. A candidate enqueues the existing zero-budget agent_operation_brief job for the root's
--   requester, with no message, for a new queued result that names its candidate (lineage from the
--   root). Completion supersedes the previous result through the existing invariant. A recompute is
--   held while the head configuration was not approved over the current documents.
--
--   Retirement. private.propagate_project_canonical_revision_v1 is revoked and refuses by name. The
--   approve-and-calculate command no longer posts a message when the graph can recompute a live
--   result of the work: it applies its own event in its transaction and the graph queues the
--   recomputation in the approving person's name under the command's request id. It stays the
--   person's message-backed request for a first calculation, when the graph cannot produce the
--   update, and whenever the graph step fails.
--
--   Freshness. private.work_stale_dependents_v1 counts the live dependents of a work with facts in an
--   update request that is neither adopted nor declined; the worker reads it for the case analysis
--   operating-control snapshot through a closed RPC.
--
-- public.dependency_invalidation_events keeps its rows, readers and writers; nothing here writes it.
set search_path='';
-- The event contract locks private.domain_events, which every audited mutation appends to: fail fast
-- instead of queueing behind a long transaction, as 3A did. The constraint swap is the last statement
-- of this file, so that lock is held only until the commit.
set local lock_timeout = '5s';

-- The three functions restated in full below are pinned to the bodies they replace (md5 of
-- pg_proc.prosrc, as 20260925232939_rfc_uuid_domain_event_identifiers.sql pins its own): a parallel
-- change stops this migration instead of being overwritten. Staging holds the retired propagation with
-- the same code as production and without its two comment lines (e7d1df25...): both are the published
-- function, and the stub below replaces either.
do $$begin
 if (select md5(prosrc) from pg_proc where oid='private.domain_event_effect_v1(text)'::regprocedure)<>'6929d7a89e023478462791cd746eb107'
 then raise exception 'domain_event_effect_contract_changed';end if;
 if (select md5(prosrc) from pg_proc where oid='private.guard_institutional_result_body()'::regprocedure)<>'b145182fba0466c4f73400f1b2b655da'
 then raise exception 'institutional_result_guard_contract_changed';end if;
 if (select md5(prosrc) from pg_proc where oid='private.propagate_project_canonical_revision_v1(uuid,uuid,text)'::regprocedure)
  not in ('4312e8cf41d1f9942dc8ca98dad3111f','e7d1df257ddbf6460c2f14adf3eb66ab')
 then raise exception 'project_revision_propagation_contract_changed';end if;
end $$;

-- 1. The effect of the new kind: a newer approved configuration of a work propagates dependencies.
-- The constraints of private.domain_events that admit the kind are swapped at the end of this file.
create or replace function private.domain_event_effect_v1(p_kind text) returns text
language sql immutable set search_path='' as $$
 select case when p_kind in ('source_version','method_release','adoption_decision','assumption_version','institutional_configuration') then 'propagate_dependencies' else 'revalidate_authority' end;
$$;

-- 2. A result comes from a person's message (the calculation request) or from a recompute candidate.
-- The identity of a message-originated result stays its message, now through a generated column, so
-- a recomputed result needs no message at all.
alter table private.institutional_model_results add column recompute_candidate_id uuid;
alter table private.institutional_model_results add column origin_message_id uuid generated always as (case when recompute_candidate_id is null then id end) stored;
alter table private.institutional_model_results add constraint institutional_results_origin_message_fk
 foreign key(organization_id,origin_message_id) references public.agent_messages(organization_id,id);
alter table private.institutional_model_results drop constraint institutional_model_results_organization_id_id_fkey;
-- A recomputed result always declares the canonical revision it was produced from.
alter table private.institutional_model_results add constraint institutional_results_recompute_revision
 check(recompute_candidate_id is null or canonical_revision_id is not null);
create unique index institutional_results_recompute_candidate_key on private.institutional_model_results(organization_id,recompute_candidate_id) where recompute_candidate_id is not null;
create index institutional_results_origin_message_idx on private.institutional_model_results(organization_id,origin_message_id) where origin_message_id is not null;

-- The body guard is unchanged except that it ignores the generated origin column, which follows
-- columns the guard already keeps immutable.
create or replace function private.guard_institutional_result_body() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'institutional_result_history_immutable'; end if;
  if old.status = 'queued' then
    if (to_jsonb(new) - array['status', 'artifact', 'blockers', 'produced_at', 'updated_at', 'origin_message_id'])
       is distinct from (to_jsonb(old) - array['status', 'artifact', 'blockers', 'produced_at', 'updated_at', 'origin_message_id'])
       or new.status not in ('completed', 'blocked') or new.produced_at is null then
      raise exception 'institutional_result_immutable';
    end if;
    return new;
  end if;
  if old.status = 'completed' and old.superseded_by is null and new.superseded_by is not null
     and (to_jsonb(new) - array['superseded_by', 'updated_at', 'origin_message_id']) is not distinct from (to_jsonb(old) - array['superseded_by', 'updated_at', 'origin_message_id']) then
    return new;
  end if;
  raise exception 'institutional_result_immutable';
end $$;

-- 3. The typed projection of what each result pinned.
create table private.institutional_result_dependencies (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 work_id uuid not null,
 result_id uuid not null,
 dependency_kind text not null check(dependency_kind in ('source_version','institutional_configuration')),
 logical_key text not null check(length(logical_key)>0),
 source_version_id uuid, source_id uuid, source_version_no integer check(source_version_no>0), content_hash text check(content_hash ~ '^[a-f0-9]{64}$'),
 configuration_id uuid, configuration_revision integer check(configuration_revision>0), configuration_fingerprint text check(configuration_fingerprint ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(organization_id,id),
 constraint institutional_result_dependencies_source_key unique(organization_id,result_id,source_version_id),
 constraint institutional_result_dependencies_configuration_key unique(organization_id,result_id,configuration_id),
 foreign key(organization_id,work_id) references public.capital_projects(organization_id,id),
 foreign key(organization_id,result_id) references private.institutional_model_results(organization_id,id),
 foreign key(organization_id,source_version_id) references public.source_versions(organization_id,id),
 foreign key(organization_id,source_id) references public.sources(organization_id,id),
 foreign key(organization_id,configuration_id) references private.institutional_model_configurations(organization_id,id),
 -- Each kind carries exactly its own typed columns and a logical key derived from them: the logical
 -- source for a source version, the work (its configuration series) for the configuration.
 constraint institutional_result_dependencies_kind_shape check(
  (dependency_kind='source_version' and logical_key=source_id::text and num_nonnulls(source_version_id,source_id,source_version_no)=3
   and num_nonnulls(configuration_id,configuration_revision,configuration_fingerprint)=0)
  or (dependency_kind='institutional_configuration' and logical_key=work_id::text and num_nonnulls(configuration_id,configuration_revision,configuration_fingerprint)=3
   and num_nonnulls(source_version_id,source_id,source_version_no,content_hash)=0))
);
create index institutional_result_dependencies_logical_idx on private.institutional_result_dependencies(organization_id,dependency_kind,logical_key);
create index institutional_result_dependencies_result_idx on private.institutional_result_dependencies(organization_id,result_id,dependency_kind,logical_key);
create index institutional_result_dependencies_work_idx on private.institutional_result_dependencies(organization_id,work_id);
create index institutional_result_dependencies_version_idx on private.institutional_result_dependencies(organization_id,source_version_id) where source_version_id is not null;
create index institutional_result_dependencies_source_idx on private.institutional_result_dependencies(organization_id,source_id) where source_id is not null;
create index institutional_result_dependencies_configuration_idx on private.institutional_result_dependencies(organization_id,configuration_id) where configuration_id is not null;
alter table private.institutional_result_dependencies enable row level security;
alter table private.institutional_result_dependencies force row level security;
revoke all on private.institutional_result_dependencies from public,anon,authenticated,service_role;
create policy institutional_result_dependencies_deny_clients on private.institutional_result_dependencies as restrictive for all to anon,authenticated using(false) with check(false);
create trigger institutional_result_dependencies_immutable before update or delete on private.institutional_result_dependencies for each row execute function private.reject_work_continuity_mutation_v1();
create trigger institutional_result_dependencies_truncate_guard before truncate on private.institutional_result_dependencies for each statement execute function private.reject_work_continuity_mutation_v1();
create trigger institutional_result_dependencies_updated before update on private.institutional_result_dependencies for each row execute function private.set_updated_at();

-- The documents a configuration was reviewed against: those its provenance source bindings and
-- lineage name (the provenance of the initial configuration of its chain), and them as immutable
-- versions of logical sources.
create function private.institutional_configuration_documents_v1(p_org uuid,p_configuration uuid) returns setof text
language sql stable security definer set search_path='' as $$
 with provenance as (select private.institutional_configuration_provenance(p_org,p_configuration) as p)
 select distinct x.document from provenance cross join lateral (
  select b.value->>'sourceDocument' as document from jsonb_array_elements(case when jsonb_typeof(provenance.p->'sourceBindings')='array' then provenance.p->'sourceBindings' else '[]'::jsonb end) b
  union all
  select l.value->>'sourceDocument' from jsonb_array_elements(case when jsonb_typeof(provenance.p->'lineage')='array' then provenance.p->'lineage' else '[]'::jsonb end) l) x
 where x.document is not null;
$$;
create function private.institutional_configuration_source_versions_v1(p_org uuid,p_configuration uuid)
returns table(source_version_id uuid,source_id uuid,version_no integer,content_hash text)
language sql stable security definer set search_path='' as $$
 select v.id,v.source_id,v.version_no,v.declared_sha256
 from private.institutional_configuration_documents_v1(p_org,p_configuration) d(document)
 join public.source_versions v on v.organization_id=p_org and v.id::text=d.document;
$$;

-- The single mapping from results to projection rows. The trigger and the backfill both read it, so
-- a live write and a backfilled write can never differ.
create view private.institutional_result_dependency_sources_v1 with (security_invoker=true) as
select r.organization_id,r.capital_project_id as work_id,r.id as result_id,'institutional_configuration'::text as dependency_kind,r.capital_project_id::text as logical_key,
 null::uuid as source_version_id,null::uuid as source_id,null::integer as source_version_no,null::text as content_hash,
 c.id as configuration_id,c.revision as configuration_revision,c.configuration_fingerprint
from private.institutional_model_results r
join private.institutional_model_configurations c on c.organization_id=r.organization_id and c.id=r.configuration_id
union all
select r.organization_id,r.capital_project_id,r.id,'source_version',s.source_id::text,
 s.source_version_id,s.source_id,s.version_no,s.content_hash,
 null,null,null
from private.institutional_model_results r
cross join lateral private.institutional_configuration_source_versions_v1(r.organization_id,r.configuration_id) s;

create function private.project_institutional_result_dependencies_v1() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into private.institutional_result_dependencies(organization_id,work_id,result_id,dependency_kind,logical_key,
  source_version_id,source_id,source_version_no,content_hash,configuration_id,configuration_revision,configuration_fingerprint)
 select s.organization_id,s.work_id,s.result_id,s.dependency_kind,s.logical_key,
  s.source_version_id,s.source_id,s.source_version_no,s.content_hash,s.configuration_id,s.configuration_revision,s.configuration_fingerprint
 from private.institutional_result_dependency_sources_v1 s
 where s.organization_id=new.organization_id and s.result_id=new.id
 order by s.dependency_kind,s.logical_key,s.source_version_id;
 -- The configuration edge always exists, and every document the provenance names is a version:
 -- anything less would be an incomplete graph presented as complete.
 if not exists(select 1 from private.institutional_result_dependencies d where d.organization_id=new.organization_id and d.result_id=new.id and d.dependency_kind='institutional_configuration')
 or (select count(*) from private.institutional_result_dependencies d where d.organization_id=new.organization_id and d.result_id=new.id and d.dependency_kind='source_version')
  <>(select count(*) from private.institutional_configuration_documents_v1(new.organization_id,new.configuration_id)) then
  raise exception 'institutional_result_dependency_projection_incomplete' using errcode='23514';
 end if;
 return null;
end $$;
create trigger institutional_results_dependencies after insert on private.institutional_model_results for each row execute function private.project_institutional_result_dependencies_v1();

-- Idempotent: rows already projected are skipped, so it may run again to rebuild a graph.
create function private.backfill_institutional_result_dependencies_v1() returns bigint
language plpgsql security definer set search_path='' as $$
declare written bigint;
begin
 insert into private.institutional_result_dependencies(organization_id,work_id,result_id,dependency_kind,logical_key,
  source_version_id,source_id,source_version_no,content_hash,configuration_id,configuration_revision,configuration_fingerprint)
 select s.organization_id,s.work_id,s.result_id,s.dependency_kind,s.logical_key,
  s.source_version_id,s.source_id,s.source_version_no,s.content_hash,s.configuration_id,s.configuration_revision,s.configuration_fingerprint
 from private.institutional_result_dependency_sources_v1 s
 order by s.organization_id,s.result_id,s.dependency_kind,s.logical_key,s.source_version_id
 on conflict do nothing;
 get diagnostics written=row_count;
 return written;
end $$;

-- A result without its projection makes the recorded graph incomplete: rebuild before judging.
create function private.rebuild_incomplete_institutional_dependencies_v1(p_org uuid) returns bigint
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from private.institutional_model_results r where r.organization_id=p_org and not exists(
  select 1 from private.institutional_result_dependencies d where d.organization_id=r.organization_id and d.result_id=r.id and d.dependency_kind='institutional_configuration')) then
  return private.backfill_institutional_result_dependencies_v1();
 end if;
 return 0;
end $$;

-- 4. Heads, liveness and lineage.
-- The configuration of a work: its newest approved revision, the rule every institutional reader uses,
-- with the manifest it was approved over.
create function private.institutional_configuration_head_v1(p_org uuid,p_work uuid)
returns table(configuration_id uuid,revision integer,configuration_fingerprint text,source_manifest_fingerprint text)
language sql stable security definer set search_path='' as $$
 select c.id,c.revision,c.configuration_fingerprint,private.institutional_configuration_provenance(c.organization_id,c.id)->>'sourceManifestFingerprint'
 from private.institutional_model_configurations c
 where c.organization_id=p_org and c.capital_project_id=p_work and c.status='approved'
 order by c.revision desc limit 1;
$$;

-- A result still carries the work's output while it is completed and not superseded, or queued with a
-- live job: the rule of 3A for executions, with supersession, which results already record.
create function private.institutional_result_is_live_v1(p_org uuid,p_result uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.institutional_model_results r where r.organization_id=p_org and r.id=p_result
  and ((r.status='completed' and r.superseded_by is null)
   or (r.status='queued' and exists(select 1 from public.processing_jobs j where j.organization_id=r.organization_id and j.intake_session_id=r.intake_session_id
    and j.kind='agent_operation_brief' and j.payload->>'message_id'=r.id::text and j.status in ('queued','awaiting_approval','leased')))));
$$;

-- 5. Invalidation facts: one immutable row per organization, result, logical key and event.
create table private.institutional_result_invalidations (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 work_id uuid not null,
 result_id uuid not null,
 event_id uuid not null,
 dependency_kind text check(dependency_kind in ('source_version','institutional_configuration')),
 logical_key text not null check(length(logical_key)>0),
 reason_class text not null check(reason_class in ('data_change','graph_incomplete')),
 gap text check(gap in ('no_recorded_edges','head_unknown','head_behind_pin')),
 pinned jsonb check(jsonb_typeof(pinned)='object'),
 head jsonb check(jsonb_typeof(head)='object'),
 via_source_version_ids uuid[] not null default '{}',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(organization_id,id),
 constraint institutional_result_invalidations_event_key unique nulls not distinct(organization_id,result_id,dependency_kind,logical_key,event_id),
 foreign key(organization_id,work_id) references public.capital_projects(organization_id,id),
 foreign key(organization_id,result_id) references private.institutional_model_results(organization_id,id),
 foreign key(organization_id,event_id) references private.domain_events(organization_id,id),
 -- The reasons and gaps of 3A: a data change moves a source or the configuration, an incomplete
 -- graph names its gap; without a recorded edge there is no key; an unknown head has no head.
 constraint institutional_result_invalidations_shape check(
  (gap is null)=(reason_class<>'graph_incomplete')
  and (dependency_kind is null)=coalesce(gap='no_recorded_edges',false)
  and (dependency_kind is not null or (logical_key='*' and pinned is null and head is null))
  and (dependency_kind is null or pinned is not null)
  and (head is null)=coalesce(gap in ('no_recorded_edges','head_unknown'),false)
  and (dependency_kind='source_version' or cardinality(via_source_version_ids)=0)
  and (dependency_kind is distinct from 'source_version' or (logical_key=pinned->>'sourceId'
   and pinned ?& array['sourceId','versionNo','versionId'] and (head is null or head ?& array['sourceId','versionNo','versionId'])))
  and (dependency_kind is distinct from 'institutional_configuration' or (logical_key=work_id::text
   and pinned ?& array['configurationId','revision','fingerprint'] and (head is null or head ?& array['configurationId','revision','fingerprint']))))
);
create index institutional_result_invalidations_event_idx on private.institutional_result_invalidations(organization_id,event_id);
create index institutional_result_invalidations_work_idx on private.institutional_result_invalidations(organization_id,work_id,result_id);
create index institutional_result_invalidations_result_idx on private.institutional_result_invalidations(organization_id,result_id);
alter table private.institutional_result_invalidations enable row level security;
alter table private.institutional_result_invalidations force row level security;
revoke all on private.institutional_result_invalidations from public,anon,authenticated,service_role;
create policy institutional_result_invalidations_deny_clients on private.institutional_result_invalidations as restrictive for all to anon,authenticated using(false) with check(false);
create trigger institutional_result_invalidations_immutable before update or delete on private.institutional_result_invalidations for each row execute function private.reject_work_continuity_mutation_v1();
create trigger institutional_result_invalidations_truncate_guard before truncate on private.institutional_result_invalidations for each statement execute function private.reject_work_continuity_mutation_v1();
create trigger institutional_result_invalidations_updated before update on private.institutional_result_invalidations for each row execute function private.set_updated_at();

-- Impact of one change on the live results of an organization, from the current heads, with the
-- rules of 3A: a source (with the derived versions that descend from its versions) or the
-- configuration of one work. A result without any recorded edge is graph_incomplete for every change.
create function private.institutional_dependency_impact_v1(p_org uuid,p_source uuid,p_work uuid)
returns table(result_id uuid,work_id uuid,dependency_kind text,logical_key text,reason_class text,gap text,pinned jsonb,head jsonb,via uuid[])
language sql stable security definer set search_path='' as $$
 with recursive
 live as (
  select r.id,r.capital_project_id as work_id from private.institutional_model_results r
  where r.organization_id=p_org and private.institutional_result_is_live_v1(p_org,r.id)),
 key_versions as (select v.id,v.version_no from public.source_versions v where v.organization_id=p_org and v.source_id=p_source),
 descent(version_id,ancestor_id) as (
  select rd.derived_version_id,rd.source_version_id from private.resource_dependencies rd join key_versions k on k.id=rd.source_version_id where rd.organization_id=p_org
  union
  select rd.derived_version_id,d.ancestor_id from private.resource_dependencies rd join descent d on d.version_id=rd.source_version_id where rd.organization_id=p_org),
 reached as (
  select d.result_id,d.source_version_id as pin_id,d.source_version_id as version_id from private.institutional_result_dependencies d join key_versions k on k.id=d.source_version_id
  where d.organization_id=p_org and d.dependency_kind='source_version'
  union
  select d.result_id,d.source_version_id,x.ancestor_id from private.institutional_result_dependencies d join descent x on x.version_id=d.source_version_id
  where d.organization_id=p_org and d.dependency_kind='source_version'),
 relied as (
  select distinct on (r.result_id) r.result_id,r.version_id,k.version_no from reached r join key_versions k on k.id=r.version_id
  order by r.result_id,k.version_no desc),
 configuration_pins as (
  select d.result_id,d.configuration_id,d.configuration_revision,d.configuration_fingerprint from private.institutional_result_dependencies d
  where d.organization_id=p_org and d.dependency_kind='institutional_configuration' and d.work_id=p_work),
 configuration_head as (select h.configuration_id,h.revision,h.configuration_fingerprint from private.institutional_configuration_head_v1(p_org,p_work) h)
 select l.id,l.work_id,'source_version',p_source::text,
  case when h.version_id is null or h.version_no<r.version_no then 'graph_incomplete' else 'data_change' end,
  case when h.version_id is null then 'head_unknown' when h.version_no<r.version_no then 'head_behind_pin' end,
  jsonb_build_object('sourceId',p_source,'versionNo',r.version_no,'versionId',r.version_id),
  case when h.version_id is not null then jsonb_build_object('sourceId',p_source,'versionNo',h.version_no,'versionId',h.version_id) end,
  case when exists(select 1 from private.institutional_result_dependencies d where d.organization_id=p_org and d.result_id=r.result_id
    and d.dependency_kind='source_version' and d.source_version_id=r.version_id) then '{}'::uuid[]
   else (select array_agg(distinct x.pin_id order by x.pin_id) from reached x where x.result_id=r.result_id and x.version_id=r.version_id) end
 from relied r join live l on l.id=r.result_id left join private.source_head_v1(p_org,p_source) h on true
 where h.version_id is null or h.version_no<>r.version_no
 union all
 select l.id,l.work_id,'institutional_configuration',p_work::text,
  case when h.configuration_id is null or h.revision<p.configuration_revision then 'graph_incomplete' else 'data_change' end,
  case when h.configuration_id is null then 'head_unknown' when h.revision<p.configuration_revision then 'head_behind_pin' end,
  jsonb_build_object('configurationId',p.configuration_id,'revision',p.configuration_revision,'fingerprint',p.configuration_fingerprint),
  case when h.configuration_id is not null then jsonb_build_object('configurationId',h.configuration_id,'revision',h.revision,'fingerprint',h.configuration_fingerprint) end,
  '{}'::uuid[]
 from configuration_pins p join live l on l.id=p.result_id left join configuration_head h on true
 where h.configuration_id is null or h.configuration_id<>p.configuration_id
 union all
 select l.id,l.work_id,null,'*','graph_incomplete','no_recorded_edges',null::jsonb,null::jsonb,'{}'::uuid[]
 from live l where not exists(select 1 from private.institutional_result_dependencies d where d.organization_id=p_org and d.result_id=l.id);
$$;

-- 6. The producer: a newer approved configuration of a work, in the approving transaction. The first
-- approval of a work emits nothing: no result can depend on a configuration before one exists.
create function private.capture_institutional_configuration_event_v1() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.status<>'approved' or (tg_op='UPDATE' and old.status='approved') then return null; end if;
 if not exists(select 1 from private.institutional_model_configurations c where c.organization_id=new.organization_id
  and c.capital_project_id=new.capital_project_id and c.status='approved' and c.id<>new.id) then return null; end if;
 perform private.append_domain_event_v1(new.id,new.organization_id,'institutional_configuration',new.capital_project_id,'changed',
  jsonb_build_object('source',tg_table_name,'record_id',new.id,'workId',new.capital_project_id,'revision',new.revision));
 return null;
end $$;
create trigger institutional_configurations_dependency_event after insert or update of status on private.institutional_model_configurations
 for each row execute function private.capture_institutional_configuration_event_v1();

-- 7. Candidates and holds of institutional recomputation.
create table public.institutional_recompute_candidates (
 id uuid primary key default gen_random_uuid(),
 -- Order of the recomputations of a lineage; the newest live result represents it.
 sequence bigint generated always as identity,
 organization_id uuid not null references public.organizations(id),
 work_id uuid not null,
 request_id uuid not null,
 idempotency_key text not null check(idempotency_key ~ '^[a-f0-9]{64}$'),
 base_result_id uuid not null,
 new_input_fingerprint text not null check(new_input_fingerprint ~ '^[a-f0-9]{64}$'),
 head_inputs jsonb not null check(jsonb_typeof(head_inputs)='object' and head_inputs->>'schemaVersion'='continuation-input-identity.v1' and jsonb_typeof(head_inputs->'inputs')='array'),
 result_ids uuid[] not null check(cardinality(result_ids)>0),
 requested_by uuid not null references auth.users(id),
 state text not null check(state in ('scheduled','settled','declined','failed')),
 reason text check(reason ~ '^[a-z][a-z0-9_:.-]{1,159}$'),
 result_id uuid,
 revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(organization_id,id),
 unique(organization_id,work_id,id),
 constraint institutional_recompute_candidates_sequence_key unique(sequence),
 constraint institutional_recompute_candidates_key unique(organization_id,work_id,idempotency_key),
 constraint institutional_recompute_candidates_result_key unique(organization_id,result_id),
 foreign key(organization_id,work_id) references public.capital_projects(organization_id,id),
 foreign key(organization_id,work_id,request_id) references public.work_continuation_requests(organization_id,work_id,id),
 foreign key(organization_id,base_result_id) references private.institutional_model_results(organization_id,id),
 foreign key(organization_id,result_id) references private.institutional_model_results(organization_id,id),
 -- The key of 3B: work, root result of the lineage and the fingerprint of the head identity.
 constraint institutional_recompute_candidates_identity check(new_input_fingerprint=private.continuation_fingerprint_v1(head_inputs)
  and idempotency_key=private.dependency_recompute_key_v1(work_id,base_result_id,new_input_fingerprint)),
 constraint institutional_recompute_candidates_outcome check((state in ('declined','failed'))=(reason is not null) and (state<>'settled' or result_id is not null))
);
create index institutional_recompute_candidates_work_idx on public.institutional_recompute_candidates(organization_id,work_id,state);
create index institutional_recompute_candidates_request_idx on public.institutional_recompute_candidates(organization_id,work_id,request_id);
create index institutional_recompute_candidates_base_idx on public.institutional_recompute_candidates(organization_id,base_result_id,sequence);
create index institutional_recompute_candidates_requester_idx on public.institutional_recompute_candidates(requested_by);
alter table private.institutional_model_results add constraint institutional_results_recompute_candidate_fk
 foreign key(organization_id,recompute_candidate_id) references public.institutional_recompute_candidates(organization_id,id);
alter table public.institutional_recompute_candidates enable row level security;
alter table public.institutional_recompute_candidates force row level security;
revoke all on public.institutional_recompute_candidates from public,anon,authenticated,service_role;
revoke all on sequence public.institutional_recompute_candidates_sequence_seq from public,anon,authenticated,service_role;
grant select on public.institutional_recompute_candidates to authenticated;
-- The same read authority as public.work_milestones: the person must be able to read the work.
create policy institutional_recompute_candidates_select_authorized on public.institutional_recompute_candidates for select to authenticated using((select private.can_access_capital_project(organization_id,work_id)));
create policy institutional_recompute_candidates_deny_insert on public.institutional_recompute_candidates for insert to authenticated with check(false);
create policy institutional_recompute_candidates_deny_update on public.institutional_recompute_candidates for update to authenticated using(false) with check(false);
create policy institutional_recompute_candidates_deny_delete on public.institutional_recompute_candidates for delete to authenticated using(false);

-- Identity never changes, every write bumps the revision, the result is attached once to a scheduled
-- candidate, and the state only moves forward from scheduled. Nothing is deleted or truncated.
create function private.guard_institutional_recompute_candidate_v1() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'work_continuity_history_immutable' using errcode='23514'; end if;
 if (new.id,new.sequence,new.organization_id,new.work_id,new.request_id,new.idempotency_key,new.base_result_id,new.new_input_fingerprint,new.head_inputs,
   new.result_ids,new.requested_by,new.created_at)
  is distinct from (old.id,old.sequence,old.organization_id,old.work_id,old.request_id,old.idempotency_key,old.base_result_id,old.new_input_fingerprint,old.head_inputs,
   old.result_ids,old.requested_by,old.created_at)
 or new.revision<>old.revision+1
 or (new.result_id is distinct from old.result_id and (old.result_id is not null or old.state<>'scheduled' or new.state<>'scheduled'))
 or (new.state<>old.state and not (old.state='scheduled' and new.state in ('settled','declined','failed')))
 or (new.state=old.state and new.reason is distinct from old.reason) then
  raise exception 'institutional_recompute_candidate_transition_invalid' using errcode='23514';
 end if;
 return new;
end $$;
create trigger institutional_recompute_candidates_guard before update or delete on public.institutional_recompute_candidates for each row execute function private.guard_institutional_recompute_candidate_v1();
create trigger institutional_recompute_candidates_truncate_guard before truncate on public.institutional_recompute_candidates for each statement execute function private.reject_work_continuity_mutation_v1();
create trigger institutional_recompute_candidates_updated before update on public.institutional_recompute_candidates for each row execute function private.set_updated_at();
create trigger institutional_recompute_candidates_audit after insert or update or delete on public.institutional_recompute_candidates for each row execute function private.capture_identity_audit_v1();

-- A live result of an open request that cannot be recomputed yet, and the signal that releases it.
create table private.institutional_recompute_holds (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 work_id uuid not null,
 request_id uuid not null,
 result_id uuid not null,
 hold_kind text not null check(hold_kind in ('configuration_behind_source','derived_source_not_rederived','graph_incomplete')),
 signal text not null check(signal ~ '^[a-z_]+:[0-9A-Za-z_.:-]{1,200}$'),
 subject jsonb not null check(jsonb_typeof(subject)='object'),
 released_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(organization_id,id),
 foreign key(organization_id,work_id,request_id) references public.work_continuation_requests(organization_id,work_id,id),
 foreign key(organization_id,result_id) references private.institutional_model_results(organization_id,id)
);
create unique index institutional_recompute_holds_open_idx on private.institutional_recompute_holds(organization_id,request_id,result_id,hold_kind,signal) where released_at is null;
create index institutional_recompute_holds_signal_idx on private.institutional_recompute_holds(organization_id,signal) where released_at is null;
create index institutional_recompute_holds_request_idx on private.institutional_recompute_holds(organization_id,work_id,request_id);
create index institutional_recompute_holds_result_idx on private.institutional_recompute_holds(organization_id,result_id);
alter table private.institutional_recompute_holds enable row level security;
alter table private.institutional_recompute_holds force row level security;
revoke all on private.institutional_recompute_holds from public,anon,authenticated,service_role;
create policy institutional_recompute_holds_deny_clients on private.institutional_recompute_holds as restrictive for all to anon,authenticated using(false) with check(false);
create function private.guard_institutional_recompute_hold_v1() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'work_continuity_history_immutable' using errcode='23514'; end if;
 if (new.id,new.organization_id,new.work_id,new.request_id,new.result_id,new.hold_kind,new.signal,new.subject,new.created_at)
  is distinct from (old.id,old.organization_id,old.work_id,old.request_id,old.result_id,old.hold_kind,old.signal,old.subject,old.created_at)
 or old.released_at is not null or new.released_at is null then
  raise exception 'institutional_recompute_hold_transition_invalid' using errcode='23514';
 end if;
 return new;
end $$;
create trigger institutional_recompute_holds_guard before update or delete on private.institutional_recompute_holds for each row execute function private.guard_institutional_recompute_hold_v1();
create trigger institutional_recompute_holds_truncate_guard before truncate on private.institutional_recompute_holds for each statement execute function private.reject_work_continuity_mutation_v1();
create trigger institutional_recompute_holds_updated before update on private.institutional_recompute_holds for each row execute function private.set_updated_at();

-- 8. Lineage and assessment, as 3B judges executions.
-- A recomputed result names its candidate, and the candidate names the root: a recomputation of a
-- recomputation names the root, never the intermediate.
create function private.institutional_lineage_root_v1(p_org uuid,p_result uuid) returns uuid
language sql stable security definer set search_path='' as $$
 select coalesce((select c.base_result_id from private.institutional_model_results r
  join public.institutional_recompute_candidates c on c.organization_id=r.organization_id and c.id=r.recompute_candidate_id
  where r.organization_id=p_org and r.id=p_result),p_result);
$$;
-- The newest live result of a lineage (the latest recomputation, the root last) represents it.
create function private.institutional_lineage_representative_v1(p_org uuid,p_root uuid) returns uuid
language sql stable security definer set search_path='' as $$
 select x.id from (
  select r.id,c.sequence as rank from public.institutional_recompute_candidates c
  join private.institutional_model_results r on r.organization_id=c.organization_id and r.recompute_candidate_id=c.id
  where c.organization_id=p_org and c.base_result_id=p_root
  union all select p_root,0) x
 where private.institutional_result_is_live_v1(p_org,x.id)
 order by x.rank desc limit 1;
$$;

-- Whether a person may have a calculation of the work run in their name: the authority of the
-- approve-and-calculate review authorization (read access, and approver role or work access), for a
-- live account.
create function private.institutional_recompute_requester_authorized_v1(p_org uuid,p_work uuid,p_subject uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select p_subject is not null
  and exists(select 1 from auth.users u where u.id=p_subject and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp()))
  and private.resource_access_as_subject_v1(p_org,p_work,p_subject,'read')
  and ('approver'=any(private.capital_project_review_roles(p_org,p_work,p_subject)) or private.resource_access_as_subject_v1(p_org,p_work,p_subject,'work'));
$$;

-- One result against the current heads, as execution_recompute_assessment_v1 judges an execution:
-- the newest version of each source it relied on (directly or through the derivation closure) and
-- its configuration; the identity of those inputs pinned and at the heads; the status; and, for an
-- affected result, the recompute key and what holds it:
--  derived_source_not_rederived  a source it relied on only through a derived version moved and the
--                                head of the derived source does not descend from the new version;
--                                released by a newer version of the derived source (source_version).
--  configuration_behind_source   the recomputation calculates the head configuration over the
--                                documents of the work as they are now: it waits while that
--                                configuration was not approved over them, or still names an older
--                                version of a source that moved; released by a newer approved
--                                configuration of the work (institutional_configuration).
create function private.institutional_recompute_assessment_v1(p_org uuid,p_result uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r private.institutional_model_results;v_root uuid;v_requester uuid;pinned_entries jsonb:='[]'::jsonb;head_entries jsonb:='[]'::jsonb;gaps jsonb:='[]'::jsonb;holds jsonb:='[]'::jsonb;
 moved boolean:=false;moved_sources uuid[]:='{}'::uuid[];src record;carrier record;cfg record;head_cfg record;input_key text;head_version uuid;head_no integer;
 v_identity jsonb;v_fingerprint text;v_key text;v_manifest text;
begin
 select * into strict r from private.institutional_model_results where organization_id=p_org and id=p_result;
 v_root:=private.institutional_lineage_root_v1(p_org,r.id);
 select x.requested_by into v_requester from private.institutional_model_results x where x.organization_id=p_org and x.id=v_root;
 if not exists(select 1 from private.institutional_result_dependencies d where d.organization_id=p_org and d.result_id=r.id) then
  gaps:=gaps||jsonb_build_array(jsonb_build_object('code','no_recorded_edges'));
 end if;

 for src in
  with recursive pins as (
   select distinct d.source_version_id as pin from private.institutional_result_dependencies d
   where d.organization_id=p_org and d.result_id=r.id and d.dependency_kind='source_version'),
  carried(pin,version_id) as (
   select pins.pin,pins.pin from pins
   union
   select c.pin,rd.source_version_id from carried c join private.resource_dependencies rd on rd.organization_id=p_org and rd.derived_version_id=c.version_id),
  reached as (select c.pin,c.version_id,v.source_id,v.version_no from carried c join public.source_versions v on v.organization_id=p_org and v.id=c.version_id),
  newest as (select distinct on (x.source_id) x.source_id,x.version_id,x.version_no from reached x order by x.source_id,x.version_no desc)
  select n.source_id,n.version_id,n.version_no,exists(select 1 from pins p where p.pin=n.version_id) as direct,
   coalesce((select array_agg(distinct x.pin order by x.pin) from reached x where x.version_id=n.version_id),'{}'::uuid[]) as carriers
  from newest n order by n.source_id
 loop
  input_key:=private.continuation_logical_key_v1('source_version',src.source_id::text);
  pinned_entries:=pinned_entries||jsonb_build_array(jsonb_build_array(input_key,jsonb_build_object('versionNo',src.version_no,'versionId',src.version_id)));
  head_version:=null;head_no:=null;
  select x.version_id,x.version_no into head_version,head_no from private.source_head_v1(p_org,src.source_id) x;
  if head_version is null then
   gaps:=gaps||jsonb_build_array(jsonb_build_object('code','head_unknown','key',input_key));
   continue;
  end if;
  if head_no<src.version_no then
   gaps:=gaps||jsonb_build_array(jsonb_build_object('code','head_behind_pin','key',input_key));
   continue;
  end if;
  head_entries:=head_entries||jsonb_build_array(jsonb_build_array(input_key,jsonb_build_object('versionNo',head_no,'versionId',head_version)));
  if head_no=src.version_no then continue; end if;
  moved:=true;
  if src.direct then
   moved_sources:=moved_sources||src.source_id;
  else
   for carrier in select x.id as pin,x.source_id,(select hv.version_id from private.source_head_v1(p_org,x.source_id) hv) as head
    from public.source_versions x where x.organization_id=p_org and x.id=any(src.carriers) order by x.id loop
    if not private.source_version_descends_from_v1(p_org,carrier.head,head_version) then
     holds:=holds||jsonb_build_array(jsonb_build_object('kind','derived_source_not_rederived','signal','source_version:'||carrier.source_id::text,
      'subject',jsonb_build_object('sourceId',carrier.source_id,'pinnedVersionId',carrier.pin,'headVersionId',carrier.head,'ancestorSourceId',src.source_id,'ancestorVersionId',head_version)));
    end if;
   end loop;
  end if;
 end loop;

 select h.configuration_id,h.revision,h.configuration_fingerprint,h.source_manifest_fingerprint into head_cfg
 from private.institutional_configuration_head_v1(p_org,r.capital_project_id) h;
 for cfg in select d.configuration_id,d.configuration_revision from private.institutional_result_dependencies d
  where d.organization_id=p_org and d.result_id=r.id and d.dependency_kind='institutional_configuration' order by d.id
 loop
  input_key:=private.continuation_logical_key_v1('institutional_configuration',r.capital_project_id::text);
  pinned_entries:=pinned_entries||jsonb_build_array(jsonb_build_array(input_key,jsonb_build_object('configurationId',cfg.configuration_id,'revision',cfg.configuration_revision)));
  if head_cfg.configuration_id is null then
   gaps:=gaps||jsonb_build_array(jsonb_build_object('code','head_unknown','key',input_key));
   continue;
  end if;
  if head_cfg.revision<cfg.configuration_revision then
   gaps:=gaps||jsonb_build_array(jsonb_build_object('code','head_behind_pin','key',input_key));
   continue;
  end if;
  head_entries:=head_entries||jsonb_build_array(jsonb_build_array(input_key,jsonb_build_object('configurationId',head_cfg.configuration_id,'revision',head_cfg.revision)));
  if head_cfg.configuration_id<>cfg.configuration_id then moved:=true; end if;
 end loop;

 if moved and jsonb_array_length(gaps)=0 then
  begin
   v_manifest:=private.institutional_source_context(p_org,r.intake_session_id)->>'sourceManifestFingerprint';
  exception when others then
   v_manifest:=null;
  end;
  if v_manifest is null or head_cfg.source_manifest_fingerprint is distinct from v_manifest
  or exists(select 1 from private.institutional_configuration_source_versions_v1(p_org,head_cfg.configuration_id) s
   where s.source_id=any(moved_sources) and s.version_no<(select h.version_no from private.source_head_v1(p_org,s.source_id) h)) then
   holds:=holds||jsonb_build_array(jsonb_build_object('kind','configuration_behind_source','signal','institutional_configuration:'||r.capital_project_id::text,
    'subject',jsonb_build_object('configurationId',head_cfg.configuration_id,'revision',head_cfg.revision,
     'configurationManifestFingerprint',head_cfg.source_manifest_fingerprint,'currentManifestFingerprint',v_manifest)));
  end if;
 end if;

 if jsonb_array_length(gaps)=0 then
  v_identity:=private.continuation_input_identity_v1(head_entries);
  v_fingerprint:=private.continuation_fingerprint_v1(v_identity);
  if moved then v_key:=private.dependency_recompute_key_v1(r.capital_project_id,v_root,v_fingerprint); end if;
 end if;
 return jsonb_build_object('resultId',r.id,'workId',r.capital_project_id,'rootResultId',v_root,'requestedBy',v_requester,
  'status',case when jsonb_array_length(gaps)>0 then 'graph_incomplete' when moved then 'affected' else 'unaffected' end,
  'gaps',gaps,'pinnedInputs',private.continuation_input_identity_v1(pinned_entries),'currentInputs',v_identity,'currentFingerprint',v_fingerprint,'key',v_key,
  'holds',case when moved and jsonb_array_length(gaps)=0 then holds else '[]'::jsonb end);
end $$;

-- The approve-and-calculate request this transaction is handling, when it names this work: its
-- request id and its approving person. The command records the request as the review authorization
-- of the approving person over the approved configuration (where it always recorded it) and names it
-- in the transaction-local setting offroad.institutional_approval_request around its own dependency
-- step (as offroad.release_decision_id names a release decision). Only a request for the work's head
-- configuration that has neither a result nor a message yet is returned: once the graph queues its
-- result, or the command posts its message, it is spent.
create function private.institutional_approval_request_v1(p_org uuid,p_work uuid) returns table(request_id uuid,approver uuid)
language sql stable security definer set search_path='' as $$
 select a.id,a.subject_user_id from private.review_execution_authorizations a
 join private.institutional_configuration_head_v1(p_org,p_work) h on h.configuration_id=a.configuration_id
 where a.id=nullif(current_setting('offroad.institutional_approval_request',true),'')::uuid
  and a.organization_id=p_org and a.resource_id=p_work
  and not exists(select 1 from private.institutional_model_results r where r.organization_id=p_org and r.id=a.id)
  and not exists(select 1 from public.agent_messages m where m.organization_id=p_org and m.id=a.id);
$$;

-- 9. The existing deterministic job, without a message. The candidate's queued result, the review
-- authorization of the calculation for the candidate's requester over the head configuration, and a
-- zero-budget run and agent_operation_brief job whose payload names the candidate. The job binds its
-- authority to the requester (bind_job_authority_v1, below), so the authority sweep cancels it the
-- moment that authority lapses. The candidate of the approval being handled takes the approval's
-- request id as its result, and the authorization the command already recorded under that id.
-- Returns the new result.
create function private.enqueue_institutional_recompute_v1(p_org uuid,p_candidate uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare c public.institutional_recompute_candidates;v_root private.institutional_model_results;v_head record;v_canonical private.project_canonical_revisions;
 v_approval uuid;v_result uuid;v_run uuid:=gen_random_uuid();v_run_no integer;v_locale text;v_manifest text;
begin
 select * into strict c from public.institutional_recompute_candidates where organization_id=p_org and id=p_candidate for update;
 if c.state<>'scheduled' or c.result_id is not null then raise exception 'institutional_recompute_candidate_not_schedulable' using errcode='23514'; end if;
 select * into strict v_root from private.institutional_model_results where organization_id=p_org and id=c.base_result_id;
 select h.configuration_id,h.configuration_fingerprint into strict v_head from private.institutional_configuration_head_v1(p_org,c.work_id) h;
 v_manifest:=private.institutional_source_context(p_org,v_root.intake_session_id)->>'sourceManifestFingerprint';
 v_canonical:=private.record_project_canonical_revision_v1(p_org,c.work_id);
 v_locale:=coalesce((select m.locale from public.agent_messages m where m.organization_id=p_org and m.id=v_root.origin_message_id and m.locale in ('pt-BR','en-US')),'pt-BR');
 select x.request_id into v_approval from private.institutional_approval_request_v1(p_org,c.work_id) x where x.approver=c.requested_by;
 v_result:=coalesce(v_approval,gen_random_uuid());
 if v_approval is null then
  insert into private.review_execution_authorizations(id,organization_id,resource_id,subject_user_id,configuration_id)
  values(v_result,p_org,c.work_id,c.requested_by,v_head.configuration_id);
 end if;
 -- The moment of the request itself, so readers that order results by creation see the recomputation
 -- after the result it updates even when both were written in one transaction.
 insert into private.institutional_model_results(id,organization_id,capital_project_id,intake_session_id,configuration_id,configuration_fingerprint,
  source_manifest_fingerprint,requested_by,canonical_revision_id,recompute_candidate_id,created_at)
 values(v_result,p_org,c.work_id,v_root.intake_session_id,v_head.configuration_id,v_head.configuration_fingerprint,v_manifest,c.requested_by,v_canonical.id,c.id,clock_timestamp());
 update public.institutional_recompute_candidates set result_id=v_result,revision=revision+1 where organization_id=p_org and id=c.id;
 perform 1 from public.document_intake_sessions s where s.organization_id=p_org and s.id=v_root.intake_session_id for update;
 select coalesce(max(x.run_no),0)+1 into v_run_no from public.processing_runs x where x.organization_id=p_org and x.intake_session_id=v_root.intake_session_id;
 insert into public.processing_runs(id,organization_id,intake_session_id,run_no,trigger,status,pipeline_version,budget,versions,created_by)
 values(v_run,p_org,v_root.intake_session_id,v_run_no,'reprocess','queued','institutional-dependency-recompute-v1',
  jsonb_build_object('maxCalls',0,'maxCostUsd',0),jsonb_build_object('institutionalRecomputeCandidateId',c.id),c.requested_by);
 insert into public.processing_jobs(organization_id,processing_run_id,intake_session_id,kind,payload,max_attempts)
 values(p_org,v_run,v_root.intake_session_id,'agent_operation_brief',
  jsonb_build_object('message_id',v_result,'locale',v_locale,'surface','dependency_recompute','institutional_recompute_candidate_id',c.id),2);
 return v_result;
end $$;

-- The subject of a recompute job: the candidate's requester, when the job names the candidate's own
-- queued result and run and the review authorization of that result is current for them.
create function private.institutional_recompute_job_subject_v1(p_org uuid,p_candidate uuid,p_result uuid,p_session uuid,p_run uuid,p_root uuid) returns uuid
language sql stable security definer set search_path='' as $$
 select c.requested_by from public.institutional_recompute_candidates c
 join private.institutional_model_results r on r.organization_id=c.organization_id and r.id=c.result_id and r.recompute_candidate_id=c.id
  and r.status='queued' and r.intake_session_id=p_session
 join public.processing_runs pr on pr.organization_id=c.organization_id and pr.id=p_run and pr.intake_session_id=p_session and pr.created_by=c.requested_by
  and pr.pipeline_version='institutional-dependency-recompute-v1'
 where c.organization_id=p_org and c.id=p_candidate and c.state='scheduled' and c.result_id=p_result
  and private.review_execution_authority_current_v1(p_result,p_root,c.requested_by);
$$;

-- 10. Planning, as plan_dependency_recompute_v1 plans executions, lineage by lineage, for the open
-- request of a work. Called by plan_dependency_recompute_v1 (below) with the work lock held.
create function private.plan_institutional_recompute_v1(p_org uuid,p_work uuid,p_request uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.work_continuation_requests;lineages jsonb;touched uuid[];produced text[];current_holds jsonb:='[]'::jsonb;hold_list jsonb;covered uuid[];covering uuid;
 c record;g record;created uuid;v_requester uuid;v_authorized boolean;superseded integer:=0;scheduled integer:=0;declined integer:=0;failed integer:=0;held integer:=0;released integer:=0;
begin
 select * into r from public.work_continuation_requests x where x.organization_id=p_org and x.id=p_request and x.work_id=p_work and x.kind='dependency_update' and x.status='open';
 if r.id is null then return jsonb_build_object('planned',false); end if;
 perform private.rebuild_incomplete_institutional_dependencies_v1(p_org);

 -- Every institutional lineage of the work with a live result, judged by its representative.
 select coalesce(jsonb_agg(jsonb_build_object('root',x.root,'representative',x.representative,'results',to_jsonb(x.results),
   'assessment',private.institutional_recompute_assessment_v1(p_org,x.representative)) order by x.root),'[]'::jsonb) into lineages
 from (select l.root,private.institutional_lineage_representative_v1(p_org,l.root) as representative,array_agg(l.id order by l.id) as results
  from (select ir.id,private.institutional_lineage_root_v1(p_org,ir.id) as root from private.institutional_model_results ir
   where ir.organization_id=p_org and ir.capital_project_id=p_work and private.institutional_result_is_live_v1(p_org,ir.id)) l
  group by l.root) x;
 produced:=array(select x.value#>>'{assessment,key}' from jsonb_array_elements(lineages) x where x.value#>>'{assessment,status}'='affected');

 -- Scheduled candidates the current heads no longer produce are superseded, except one whose result
 -- is the up-to-date representative of its lineage. A superseded candidate's job may still run: its
 -- result can only end blocked, since the writer requires the current approval and documents.
 for c in select x.id from public.institutional_recompute_candidates x where x.organization_id=p_org and x.work_id=p_work
  and x.state='scheduled' and not (x.idempotency_key=any(produced))
  and not exists(select 1 from jsonb_array_elements(lineages) l where l.value->>'representative'=x.result_id::text and l.value#>>'{assessment,status}'='unaffected')
  order by x.sequence for update loop
  update public.institutional_recompute_candidates set state='declined',reason='superseded',revision=revision+1 where organization_id=p_org and id=c.id;
  superseded:=superseded+1;
 end loop;

 -- The open request plans the lineages of its live affected results: reused when the representative
 -- pins the current heads, held while something named holds it, otherwise one candidate per key. A
 -- key already recorded, in any state and for any request, is not recorded again.
 touched:=array(select distinct private.institutional_lineage_root_v1(p_org,a.id::uuid) from jsonb_array_elements_text(r.payload->'affectedExecutionIds') a(id)
  where exists(select 1 from private.institutional_model_results ir where ir.organization_id=p_org and ir.id=a.id::uuid and ir.capital_project_id=p_work)
   and private.institutional_result_is_live_v1(p_org,a.id::uuid));
 for g in select (x.value->>'root')::uuid as root,(x.value->>'representative')::uuid as representative,x.value->'assessment' as a,x.value->'results' as results
  from jsonb_array_elements(lineages) x where (x.value->>'root')::uuid=any(touched) order by x.value->>'root' loop
  hold_list:=case g.a->>'status'
   when 'affected' then g.a->'holds'
   when 'graph_incomplete' then (select coalesce(jsonb_agg(jsonb_build_object('kind','graph_incomplete',
     'signal',case when gap.value->>'code'='no_recorded_edges' then 'institutional_result_dependencies:'||g.representative::text
      when gap.value->>'key' like '["source\_version",%' then 'source_version:'||((gap.value->>'key')::jsonb->>1)
      else 'institutional_configuration:'||((gap.value->>'key')::jsonb->>1) end,
     'subject',gap.value) order by gap.ordinality),'[]'::jsonb) from jsonb_array_elements(g.a->'gaps') with ordinality gap)
   else '[]'::jsonb end;
  current_holds:=current_holds||(select coalesce(jsonb_agg(h.value||jsonb_build_object('resultId',g.representative) order by h.ordinality),'[]'::jsonb)
   from jsonb_array_elements(hold_list) with ordinality h);
  if g.a->>'status'<>'affected' or jsonb_array_length(hold_list)>0 then continue; end if;
  if exists(select 1 from public.institutional_recompute_candidates x where x.organization_id=p_org and x.work_id=p_work and x.idempotency_key=g.a->>'key') then continue; end if;
  covered:=array(select distinct z.id::uuid from (select a.id from jsonb_array_elements_text(r.payload->'affectedExecutionIds') a(id)
    where a.id in (select jsonb_array_elements_text(g.results)) union select g.representative::text) z order by 1);
  -- The root's requester, as in 3B; the approval handled in this transaction takes the first lineage
  -- it reaches, in its approving person's name (its request id names the result: enqueue, above).
  v_requester:=coalesce((select x.approver from private.institutional_approval_request_v1(p_org,p_work) x),(g.a->>'requestedBy')::uuid);
  v_authorized:=private.institutional_recompute_requester_authorized_v1(p_org,p_work,v_requester);
  created:=gen_random_uuid();
  insert into public.institutional_recompute_candidates(id,organization_id,work_id,request_id,idempotency_key,base_result_id,new_input_fingerprint,head_inputs,
   result_ids,requested_by,state,reason)
  values(created,p_org,p_work,r.id,g.a->>'key',g.root,g.a->>'currentFingerprint',g.a->'currentInputs',covered,v_requester,
   case when v_authorized then 'scheduled' else 'declined' end,case when v_authorized then null else 'requester_not_authorized' end);
  if not v_authorized then declined:=declined+1; continue; end if;
  begin
   perform private.enqueue_institutional_recompute_v1(p_org,created);
   scheduled:=scheduled+1;
  exception
   when insufficient_privilege then
    update public.institutional_recompute_candidates set state='declined',
     reason=left('requester_not_authorized:'||regexp_replace(lower(sqlerrm),'[^a-z0-9_:.-]+','_','g'),160),revision=revision+1
    where organization_id=p_org and id=created;
    declined:=declined+1;
   when others then
    if sqlerrm not in ('institutional_source_scope_refinement_required','project_canonical_revision_inputs_missing','project_canonical_revision_approval_missing') then raise; end if;
    update public.institutional_recompute_candidates set state='failed',reason=sqlerrm,revision=revision+1 where organization_id=p_org and id=created;
    failed:=failed+1;
  end;
 end loop;

 -- Holds of the open request: new ones recorded with their signal, the ones no longer found released.
 insert into private.institutional_recompute_holds(organization_id,work_id,request_id,result_id,hold_kind,signal,subject)
 select distinct on (x.result_id,x.kind,x.signal) p_org,p_work,r.id,x.result_id,x.kind,x.signal,x.subject
 from (select (h.value->>'resultId')::uuid as result_id,h.value->>'kind' as kind,h.value->>'signal' as signal,h.value->'subject' as subject
  from jsonb_array_elements(current_holds) h) x
 where not exists(select 1 from private.institutional_recompute_holds o where o.organization_id=p_org and o.request_id=r.id
  and o.result_id=x.result_id and o.hold_kind=x.kind and o.signal=x.signal and o.released_at is null)
 order by x.result_id,x.kind,x.signal,x.subject::text;
 get diagnostics held=row_count;
 update private.institutional_recompute_holds o set released_at=clock_timestamp()
 where o.organization_id=p_org and o.request_id=r.id and o.released_at is null and not exists(select 1 from jsonb_array_elements(current_holds) h
  where (h.value->>'resultId')::uuid=o.result_id and h.value->>'kind'=o.hold_kind and h.value->>'signal'=o.signal);
 get diagnostics released=row_count;

 -- The newest other request whose candidate covers the current key of a lineage this request
 -- touches, or produced its up-to-date representative: the request plan_dependency_recompute_v1
 -- supersedes this one toward when it plans nothing of its own and holds nothing.
 select x.request_id into covering from public.institutional_recompute_candidates x join jsonb_array_elements(lineages) l on (l.value->>'root')::uuid=any(touched)
  and ((l.value#>>'{assessment,status}'='affected' and x.idempotency_key=l.value#>>'{assessment,key}')
   or (l.value#>>'{assessment,status}'='unaffected' and x.result_id=(l.value->>'representative')::uuid))
 where x.organization_id=p_org and x.work_id=p_work and x.request_id<>r.id
 order by x.created_at desc,x.id desc limit 1;
 return jsonb_build_object('planned',true,'requestId',r.id,'scheduled',scheduled,'declined',declined,'failed',failed,'superseded',superseded,
  'held',held,'released',released,'coveringRequestId',covering);
end $$;

-- 11. Settlement: the terminal status of a recompute job settles its candidate from the result the
-- job recorded (completed settles it; blocked, or no result, fails it), then the request takes its
-- status. It runs in the transaction of the job change, under the work lock, never in the result
-- writer's transaction, which holds the work's project row.
create function private.settle_institutional_recompute_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare c public.institutional_recompute_candidates;v_candidate uuid;v_status text;
begin
 v_candidate:=nullif(new.payload->>'institutional_recompute_candidate_id','')::uuid;
 select * into c from public.institutional_recompute_candidates where organization_id=new.organization_id and id=v_candidate;
 if c.id is null then return null; end if;
 perform pg_advisory_xact_lock(hashtextextended('work-continuation:'||c.organization_id::text||':'||c.work_id::text,0));
 select * into strict c from public.institutional_recompute_candidates where organization_id=c.organization_id and id=c.id for update;
 if c.state<>'scheduled' or c.result_id is distinct from nullif(new.payload->>'message_id','')::uuid then return null; end if;
 select r.status into v_status from private.institutional_model_results r where r.organization_id=c.organization_id and r.id=c.result_id;
 if v_status='completed' then
  update public.institutional_recompute_candidates set state='settled',revision=revision+1 where organization_id=c.organization_id and id=c.id;
 else
  update public.institutional_recompute_candidates set state='failed',revision=revision+1,
   reason=case when v_status='blocked' then 'institutional_result_blocked' when new.status='succeeded' then 'institutional_result_output_missing' else 'job_'||new.status end
  where organization_id=c.organization_id and id=c.id;
 end if;
 perform private.advance_dependency_update_request_v1(c.organization_id,c.request_id);
 return null;
end $$;
create trigger processing_jobs_institutional_recompute_settlement after update of status on public.processing_jobs for each row
 when (new.kind='agent_operation_brief' and new.payload ? 'institutional_recompute_candidate_id' and new.status in ('succeeded','failed','poison','cancelled')
  and old.status is distinct from new.status)
 execute function private.settle_institutional_recompute_v1();

-- 12. Whether the graph can recompute the work's institutional output for an approval: the approving
-- person may have the calculation run in their name, and a live lineage of the work is affected, not
-- held, with a key not yet recorded. Otherwise the approve-and-calculate command posts its request.
create function private.institutional_update_through_graph_v1(p_org uuid,p_work uuid,p_approver uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.institutional_recompute_requester_authorized_v1(p_org,p_work,p_approver) and exists(select 1 from (
   select distinct private.institutional_lineage_root_v1(p_org,r.id) as root from private.institutional_model_results r
   where r.organization_id=p_org and r.capital_project_id=p_work and private.institutional_result_is_live_v1(p_org,r.id)) l
  cross join lateral (select private.institutional_recompute_assessment_v1(p_org,private.institutional_lineage_representative_v1(p_org,l.root)) as a) x
  where x.a->>'status'='affected' and jsonb_array_length(x.a->'holds')=0
   and not exists(select 1 from public.institutional_recompute_candidates c where c.organization_id=p_org and c.work_id=p_work and c.idempotency_key=x.a->>'key'));
$$;

-- The graph step of the approve-and-calculate command, in the approving transaction. The approval's
-- event id is the approved configuration's id. The effect is applied as the outbox applies it
-- (apply_outbox_dependency_effect_v1: a failure rolls back only the effect, and the outbox applies the
-- event later), with the command's request named for the planner, which queues the recomputation of
-- the first affected lineage in the approving person's name under the request id. True only when that
-- result is queued; on false the command falls through to the calculation it always posted, whose
-- message and result take the same request id. The outbox delivery of an applied event finds it
-- recorded in the work's request and writes nothing.
create function private.institutional_approval_through_graph_v1(p_org uuid,p_work uuid,p_configuration uuid,p_request uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare applied boolean;
begin
 if not private.institutional_update_through_graph_v1(p_org,p_work,auth.uid()) then return false; end if;
 perform set_config('offroad.institutional_approval_request',p_request::text,true);
 applied:=private.apply_outbox_dependency_effect_v1(p_org,p_configuration);
 perform set_config('offroad.institutional_approval_request','',true);
 return applied and exists(select 1 from private.institutional_model_results r where r.organization_id=p_org and r.id=p_request
  and r.capital_project_id=p_work and r.recompute_candidate_id is not null and r.status='queued' and r.requested_by=auth.uid());
end $$;

-- The request detail of an institutional dependent: its kind and the root of its lineage.
create function private.institutional_dependent_detail_v1(p_org uuid,p_dependent uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce((select jsonb_build_object('dependentKind','institutional_result','rootExecutionId',private.institutional_lineage_root_v1(p_org,r.id)::text)
  from private.institutional_model_results r where r.organization_id=p_org and r.id=p_dependent),'{}'::jsonb);
$$;

-- 13. Freshness from the recorded facts: the live dependents of a work (executions with a result or a
-- live job, institutional results current or queued) with a fact whose update request, followed
-- through its supersession, is neither adopted nor declined.
create function private.work_stale_dependents_v1(p_org uuid,p_work uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 with recursive chain(request_id,current_id,depth) as (
  select q.id,q.id,0 from public.work_continuation_requests q where q.organization_id=p_org and q.work_id=p_work and q.kind='dependency_update'
  union all
  select c.request_id,q.superseded_by_request_id,c.depth+1 from chain c
  join public.work_continuation_requests q on q.organization_id=p_org and q.id=c.current_id
  where q.superseded_by_request_id is not null and c.depth<64),
 final as (
  select distinct on (c.request_id) c.request_id,q.status from chain c join public.work_continuation_requests q on q.organization_id=p_org and q.id=c.current_id
  order by c.request_id,c.depth desc),
 pending as (
  select r.payload from public.work_continuation_requests r join final f on f.request_id=r.id where f.status not in ('adopted','declined')),
 facts as (
  select 'work_execution'::text as kind,f.execution_id as dependent_id,f.event_id from private.execution_invalidations f where f.organization_id=p_org and f.work_id=p_work
  union all
  select 'institutional_result',f.result_id,f.event_id from private.institutional_result_invalidations f where f.organization_id=p_org and f.work_id=p_work),
 stale as (
  select distinct x.kind,x.dependent_id from facts x
  where exists(select 1 from pending p where p.payload->'events' @> jsonb_build_array(jsonb_build_object('eventId',x.event_id)))
   and case when x.kind='work_execution' then private.execution_is_live_v1(p_org,x.dependent_id) else private.institutional_result_is_live_v1(p_org,x.dependent_id) end)
 select jsonb_build_object('staleDependents',count(*),'staleExecutions',count(*) filter(where kind='work_execution'),
  'staleInstitutionalResults',count(*) filter(where kind='institutional_result')) from stale;
$$;

-- The worker reads it for the case analysis it holds, through the capability of that job.
create function private.worker_load_work_freshness_v1(p_job_id uuid,p_capability_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token);v_work uuid;
begin
 if j.kind<>'case_analysis' then raise exception 'work_freshness_capability_required' using errcode='42501'; end if;
 select s.capital_project_id into v_work from public.document_intake_sessions s where s.organization_id=j.organization_id and s.id=j.intake_session_id;
 if v_work is null then
  return jsonb_build_object('schemaVersion','work-freshness.v1','workId',null,'staleDependents',0,'staleExecutions',0,'staleInstitutionalResults',0);
 end if;
 return jsonb_build_object('schemaVersion','work-freshness.v1','workId',v_work)||private.work_stale_dependents_v1(j.organization_id,v_work);
end $$;
create function public.worker_load_work_freshness_v1(p_job_id uuid,p_capability_token text) returns jsonb
language sql security invoker set search_path='' as $$ select private.worker_load_work_freshness_v1(p_job_id,p_capability_token); $$;

-- 14. The dependency effect judges institutional results too, and merges every dependent of a work
-- into its one request in a single merge per event.
do $patch$
declare body text;needle text;
begin
 body:=pg_get_functiondef('private.apply_dependency_event_v1(uuid,uuid)'::regprocedure);
 needle:='declare e private.domain_events;src uuid;';
 if (length(body)-length(replace(body,needle,'')))/length(needle)<>1 then raise exception 'institutional_dependency_effect_contract_changed'; end if;
 body:=replace(body,needle,'declare e private.domain_events;institutional_work uuid;institutional_facts bigint:=0;src uuid;');
 needle:=E' elsif e.aggregate_kind=''method_release'' then method:=e.protected_state->>''methodId'';\n end if;\n';
 if (length(body)-length(replace(body,needle,'')))/length(needle)<>1 then raise exception 'institutional_dependency_effect_contract_changed'; end if;
 body:=replace(body,needle,E' elsif e.aggregate_kind=''method_release'' then method:=e.protected_state->>''methodId'';\n'
  ||E' elsif e.aggregate_kind=''institutional_configuration'' then institutional_work:=e.aggregate_id;\n end if;\n');
 needle:='if src is null and target_set is null and method is null then';
 if (length(body)-length(replace(body,needle,'')))/length(needle)<>1 then raise exception 'institutional_dependency_effect_contract_changed'; end if;
 body:=replace(body,needle,'if src is null and target_set is null and method is null and institutional_work is null then');
 needle:=E' select count(*) into facts from written;\n for w in select f.work_id,array_agg(distinct f.execution_id) as executions from private.execution_invalidations f\n'
  ||E'  where f.organization_id=p_org and f.event_id=e.id group by f.work_id order by f.work_id loop\n';
 if (length(body)-length(replace(body,needle,'')))/length(needle)<>1 then raise exception 'institutional_dependency_effect_contract_changed'; end if;
 body:=replace(body,needle,E' select count(*) into facts from written;\n'
  ||E' perform private.rebuild_incomplete_institutional_dependencies_v1(p_org);\n'
  ||E' with written as (\n'
  ||E'  insert into private.institutional_result_invalidations(organization_id,work_id,result_id,event_id,dependency_kind,logical_key,reason_class,gap,pinned,head,via_source_version_ids)\n'
  ||E'  select p_org,i.work_id,i.result_id,e.id,i.dependency_kind,i.logical_key,i.reason_class,i.gap,i.pinned,i.head,i.via\n'
  ||E'  from private.institutional_dependency_impact_v1(p_org,src,institutional_work) i\n'
  ||E'  order by i.result_id,i.dependency_kind,i.logical_key\n'
  ||E'  on conflict on constraint institutional_result_invalidations_event_key do nothing returning 1)\n'
  ||E' select count(*) into institutional_facts from written;\n'
  ||E' for w in select x.work_id,array_agg(distinct x.dependent_id) as executions from (\n'
  ||E'  select f.work_id,f.execution_id as dependent_id from private.execution_invalidations f where f.organization_id=p_org and f.event_id=e.id\n'
  ||E'  union all\n'
  ||E'  select f.work_id,f.result_id from private.institutional_result_invalidations f where f.organization_id=p_org and f.event_id=e.id) x\n'
  ||E'  group by x.work_id order by x.work_id loop\n');
 needle:='''facts'',facts,';
 if (length(body)-length(replace(body,needle,'')))/length(needle)<>1 then raise exception 'institutional_dependency_effect_contract_changed'; end if;
 body:=replace(body,needle,'''facts'',facts,''institutionalFacts'',institutional_facts,');
 execute body;
end $patch$;

-- The work's request accepts its institutional results as dependents, with their kind and root.
do $patch$
declare body text;needle text;
begin
 body:=pg_get_functiondef('private.merge_dependency_update_request_v1(uuid,uuid,uuid,uuid[])'::regprocedure);
 needle:='w.id=x and w.work_id=p_work)) then';
 if (length(body)-length(replace(body,needle,'')))/length(needle)<>1 then raise exception 'institutional_dependency_request_contract_changed'; end if;
 body:=replace(body,needle,'w.id=x and w.work_id=p_work) and not exists(select 1 from private.institutional_model_results ir where ir.organization_id=p_org and ir.id=x and ir.capital_project_id=p_work)) then');
 needle:=E'm.subject_id=q.id::uuid))\n  order by q.id collate "C") into details';
 if (length(body)-length(replace(body,needle,'')))/length(needle)<>1 then raise exception 'institutional_dependency_request_contract_changed'; end if;
 body:=replace(body,needle,E'm.subject_id=q.id::uuid))||private.institutional_dependent_detail_v1(p_org,q.id::uuid)\n  order by q.id collate "C") into details');
 execute body;
end $patch$;

-- The planner of 3B plans the institutional lineages of the open request first, and a request that
-- plans nothing of its own counts institutional candidates and holds as its own.
do $patch$
declare body text;needle text;
begin
 body:=pg_get_functiondef('private.plan_dependency_recompute_v1(uuid,uuid)'::regprocedure);
 needle:='declare r public.work_continuation_requests;lineages jsonb;';
 if (length(body)-length(replace(body,needle,'')))/length(needle)<>1 then raise exception 'institutional_recompute_planner_contract_changed'; end if;
 body:=replace(body,needle,'declare r public.work_continuation_requests;institutional jsonb;lineages jsonb;');
 needle:=E' perform private.rebuild_incomplete_execution_dependencies_v1(p_org);\n';
 if (length(body)-length(replace(body,needle,'')))/length(needle)<>1 then raise exception 'institutional_recompute_planner_contract_changed'; end if;
 body:=replace(body,needle,needle||E' institutional:=private.plan_institutional_recompute_v1(p_org,p_work,r.id);\n');
 needle:=E' and not exists(select 1 from private.dependency_recompute_holds h where h.organization_id=p_org and h.request_id=r.id and h.released_at is null) then\n';
 if (length(body)-length(replace(body,needle,'')))/length(needle)<>1 then raise exception 'institutional_recompute_planner_contract_changed'; end if;
 body:=replace(body,needle,E' and not exists(select 1 from private.dependency_recompute_holds h where h.organization_id=p_org and h.request_id=r.id and h.released_at is null)\n'
  ||E' and not exists(select 1 from public.institutional_recompute_candidates x where x.organization_id=p_org and x.work_id=p_work and x.request_id=r.id)\n'
  ||E' and not exists(select 1 from private.institutional_recompute_holds h where h.organization_id=p_org and h.request_id=r.id and h.released_at is null) then\n');
 needle:=E'  order by x.created_at desc,x.id desc limit 1;\n  if covering is not null then\n';
 if (length(body)-length(replace(body,needle,'')))/length(needle)<>1 then raise exception 'institutional_recompute_planner_contract_changed'; end if;
 body:=replace(body,needle,E'  order by x.created_at desc,x.id desc limit 1;\n'
  ||E'  if covering is null then covering:=(institutional->>''coveringRequestId'')::uuid;\n'
  ||E'  elsif institutional->>''coveringRequestId'' is not null then\n'
  ||E'   select newest.id into covering from public.work_continuation_requests newest where newest.organization_id=p_org and newest.id in (covering,(institutional->>''coveringRequestId'')::uuid)\n'
  ||E'   order by newest.created_at desc,newest.id desc limit 1;\n'
  ||E'  end if;\n'
  ||E'  if covering is not null then\n');
 needle:='''held'',held,''released'',released);';
 if (length(body)-length(replace(body,needle,'')))/length(needle)<>1 then raise exception 'institutional_recompute_planner_contract_changed'; end if;
 body:=replace(body,needle,'''held'',held,''released'',released,''institutional'',institutional);');
 execute body;
end $patch$;

-- A request takes its status from its execution and institutional candidates, and an open request
-- with an institutional hold stays open.
do $patch$
declare body text;needle text;
begin
 body:=pg_get_functiondef('private.advance_dependency_update_request_v1(uuid,uuid,uuid)'::regprocedure);
 needle:=' into n from public.work_recompute_candidates where organization_id=p_org and work_id=r.work_id and request_id=r.id;';
 if (length(body)-length(replace(body,needle,'')))/length(needle)<>1 then raise exception 'institutional_request_status_contract_changed'; end if;
 body:=replace(body,needle,E' into n from (select state,reason from public.work_recompute_candidates where organization_id=p_org and work_id=r.work_id and request_id=r.id\n'
  ||E'  union all select state,reason from public.institutional_recompute_candidates where organization_id=p_org and work_id=r.work_id and request_id=r.id) candidates;');
 needle:=' and h.request_id=r.id and h.released_at is null) then return r.status; end if;';
 if (length(body)-length(replace(body,needle,'')))/length(needle)<>1 then raise exception 'institutional_request_status_contract_changed'; end if;
 body:=replace(body,needle,E' and h.request_id=r.id and h.released_at is null)\n'
  ||E' or r.status=''open'' and exists(select 1 from private.institutional_recompute_holds i where i.organization_id=p_org and i.request_id=r.id and i.released_at is null) then return r.status; end if;');
 execute body;
end $patch$;

-- A recompute job binds its authority to the candidate's requester, through the review authorization
-- of its result, as the approve-and-calculate job binds it to the approver.
do $patch$
declare body text;needle text;
begin
 body:=pg_get_functiondef('private.bind_job_authority_v1()'::regprocedure);
 needle:=E' elsif new.kind=''agent_operation_brief'' and private.review_execution_authority_current_v1(nullif(new.payload->>''message_id'','''')::uuid,root_id,subject_id) then\n';
 if (length(body)-length(replace(body,needle,'')))/length(needle)<>1 then raise exception 'institutional_recompute_job_authority_contract_changed'; end if;
 body:=replace(body,needle,
  E' elsif new.kind=''agent_operation_brief'' and new.payload ? ''institutional_recompute_candidate_id'' then\n'
  ||E'  subject_id:=private.institutional_recompute_job_subject_v1(new.organization_id,(new.payload->>''institutional_recompute_candidate_id'')::uuid,nullif(new.payload->>''message_id'','''')::uuid,new.intake_session_id,new.processing_run_id,root_id);\n'
  ||E'  if subject_id is null then raise exception ''job_authorization_denied'' using errcode=''42501'';end if;\n'
  ||E'  new.review_execution_authorization_id:=(new.payload->>''message_id'')::uuid;\n'
  ||needle);
 execute body;
end $patch$;

-- 15. The approve-and-calculate command. It records the canonical revision and its request id as the
-- review authorization of the approving person, exactly where it always did; then, when the graph can
-- recompute a live result of the work, its graph step queues that recomputation in the approving
-- person's name with the request id as the result's id, and the command returns without a message.
-- Otherwise, and whenever the graph step fails or queues nothing under the request id, it falls
-- through to the calculation it always posted (message and result under the same request id). Either
-- way the replay check at the top of the command finds the request id: a repeated request replays,
-- and a request id reused for another candidate is refused.
do $patch$
declare body text;needle text;
begin
 body:=pg_get_functiondef('private.review_institutional_configuration_and_calculate_v1(uuid,uuid,text,text,text,uuid,text)'::regprocedure);
 needle:=E' canonical:=private.record_project_canonical_revision_v1(c.organization_id,p_project_id);\n'
  ||E' insert into private.review_execution_authorizations(id,organization_id,resource_id,subject_user_id,configuration_id) values(p_request_id,c.organization_id,p_project_id,auth.uid(),c.id);\n';
 if (length(body)-length(replace(body,needle,'')))/length(needle)<>1 then raise exception 'institutional_calculation_path_contract_changed'; end if;
 body:=replace(body,needle,needle
  ||E' if private.institutional_approval_through_graph_v1(c.organization_id,p_project_id,c.id,p_request_id) then\n'
  ||E'  return jsonb_build_object(''requestId'',p_request_id,''status'',''dependency_update'',''replayed'',false,''revisionId'',canonical.id);\n'
  ||E' end if;\n');
 execute body;
end $patch$;

-- 16. Retirement. The canonical revision propagation had no caller and recalculated everything
-- through a synthetic message whenever any approved component moved, including components the
-- calculation never reads. The approval event and the graph replace it; the command refuses by name.
create or replace function private.propagate_project_canonical_revision_v1(p_project_id uuid,p_request_id uuid,p_locale text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin raise exception 'project_revision_propagation_retired' using errcode='42501'; end $$;
revoke all on function private.propagate_project_canonical_revision_v1(uuid,uuid,text),public.propagate_project_canonical_revision_v1(uuid,uuid,text)
 from public,anon,authenticated,service_role;

-- 17. Grants: the worker RPC to authenticated only, behind the job capability; everything else
-- created here closed to every API role. The patched functions keep their grants.
revoke all on private.institutional_result_dependency_sources_v1 from public,anon,authenticated,service_role;
do $$ declare f record;begin
 for f in select p.oid::regprocedure as signature,p.proname,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='private' and p.proname in ('domain_event_effect_v1','guard_institutional_result_body','institutional_configuration_documents_v1','institutional_configuration_source_versions_v1',
   'project_institutional_result_dependencies_v1','backfill_institutional_result_dependencies_v1','rebuild_incomplete_institutional_dependencies_v1',
   'institutional_configuration_head_v1','institutional_result_is_live_v1','institutional_dependency_impact_v1','capture_institutional_configuration_event_v1',
   'guard_institutional_recompute_candidate_v1','guard_institutional_recompute_hold_v1','institutional_lineage_root_v1','institutional_lineage_representative_v1',
   'institutional_recompute_requester_authorized_v1','institutional_recompute_assessment_v1','enqueue_institutional_recompute_v1','institutional_recompute_job_subject_v1',
   'plan_institutional_recompute_v1','settle_institutional_recompute_v1','institutional_update_through_graph_v1','institutional_dependent_detail_v1',
   'institutional_approval_request_v1','institutional_approval_through_graph_v1','work_stale_dependents_v1','worker_load_work_freshness_v1'))
 or (n.nspname='public' and p.proname='worker_load_work_freshness_v1')
 loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
  if f.proname='worker_load_work_freshness_v1' then execute format('grant execute on function %s to authenticated',f.signature); end if;
 end loop;
end $$;

-- 18. Backfill every existing result from the same mapping.
do $backfill$
declare dependencies bigint;
begin
 dependencies:=private.backfill_institutional_result_dependencies_v1();
 raise notice 'institutional result backfill: % dependencies',dependencies;
end $backfill$;

comment on table private.institutional_result_dependencies is 'Typed projection of what each institutional model result pinned: its approved configuration revision (logical key: the work, the configuration series) and the source versions its configuration was reviewed against (logical key: the logical source). Written only by the AFTER INSERT trigger on private.institutional_model_results and by the idempotent backfill, both from private.institutional_result_dependency_sources_v1. Immutable; closed to every API role. The receivables evidence scope and the accepted execution brief are not read by the calculation and have no edge.';
comment on table private.institutional_result_invalidations is 'Immutable invalidation facts of institutional results: one row per organization, result, logical key and event, with the pinned version, the head read at processing time and the reason class (data_change, graph_incomplete with its gap), under the rules of private.execution_invalidations. Written only by the dependency effect, applied by the outbox consumer or by the approve-and-calculate command for its own event. Closed to every API role.';
comment on table public.institutional_recompute_candidates is 'Recompute candidates of institutional model results: one per organization, work and dependencyRecomputeKey over the root result of a lineage and the head identity. scheduled enqueues the zero-budget agent_operation_brief job for the root requester (for the approving person, under the approval request id, when an approve-and-calculate command caused it), with no message, for the queued result named by result_id; settled when that result completes; declined (requester without authority, or superseded by newer heads) or failed (blocked result, failed job). Written only by the planner and the settlement trigger. Readable by whoever can read the work; no client insert, update or delete; the state only moves forward.';
comment on table private.institutional_recompute_holds is 'Live institutional results of an open dependency-update request that cannot be recomputed yet, with the signal that releases them: institutional_configuration (a configuration approved over the current documents), source_version (a newer version of a derived source), or the key of an incomplete graph. Released once. Closed to every API role.';
comment on column private.institutional_model_results.recompute_candidate_id is 'The candidate that produced this result; null when a person requested it through a message. The candidate names the root of the lineage.';
comment on column private.institutional_model_results.origin_message_id is 'The message of a person-requested result (equal to id), null for a recomputed result. Carries the foreign key to public.agent_messages.';

-- 19. The event contract admits the new kind, with the dependency effect. Last in this file: the
-- swap takes the exclusive lock on private.domain_events, which every audited mutation appends to,
-- so it is held only from here to the commit, under the lock_timeout set at the top.
alter table private.domain_events drop constraint domain_events_aggregate_kind_check;
alter table private.domain_events add constraint domain_events_aggregate_kind_check check(aggregate_kind in ('membership','resource_grant','workspace_capability',
 'commercial_account_link','access_policy','observation','metric_definition','adoption_decision','assumption_version','source_version','method_release',
 'institutional_configuration'));
alter table private.domain_events drop constraint domain_events_effect_kind;
alter table private.domain_events add constraint domain_events_effect_kind check(case
 when aggregate_kind in ('source_version','method_release','institutional_configuration') then effect='propagate_dependencies'
 when aggregate_kind in ('adoption_decision','assumption_version') then true
 else effect='revalidate_authority' end);
