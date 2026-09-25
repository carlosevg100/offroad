-- Stage 18, increment 2 (migration A of work_dependencies_and_continuity): the typed projection of
-- what each execution used and the immutable milestones of a work. Nothing here opens a client
-- write, a worker path, an API grant or an RPC.
--
-- private.execution_dependencies holds one row per input an execution pinned: each source version
-- (with its logical source and version number), each assumption slot (set, version, revision,
-- slot, decision and fingerprint) and the method release (platform release, optional house
-- release and the procedure they belong to). Its only writers are AFTER INSERT triggers on the
-- three tables the execution request writes, in the request's own transaction, and the backfill
-- below, which derives every existing execution from the same rows. private.resource_dependencies
-- remains the canonical registry of source-to-source edges; its edges are never copied here.
--
-- public.work_milestones holds immutable milestones of a work. Two writers exist in this
-- increment: the execution commit writes execution_result in the commit transaction (a text patch
-- of commit_work_execution_result_v1), and three approval records project a decision milestone by
-- trigger in the approving transaction (an accepted execution brief dispatch, a confirmed capital
-- project artifact and an approved institutional model configuration). The waiting and
-- continuation kinds are declared now so the table does not change later; their writers arrive
-- with their commands in increments 3 and 4.
set search_path='';

-- 0. One guard for both tables: no update, delete or truncate, by any role.
create function private.reject_work_continuity_mutation_v1() returns trigger
language plpgsql set search_path='' as $$
begin raise exception 'work_continuity_history_immutable' using errcode='23514'; end $$;

-- 1. The typed dependency projection of each execution.
create table private.execution_dependencies (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 execution_id uuid not null,
 dependency_kind text not null check(dependency_kind in ('source_version','assumption_slot','method_release')),
 logical_key text not null check(length(logical_key)>0),
 source_binding_id uuid, source_version_id uuid, source_id uuid, source_version_no integer check(source_version_no>0),
 rights_version_id uuid, resource_id uuid, content_hash text check(content_hash ~ '^[a-f0-9]{64}$'),
 basis_binding_id uuid, assumption_set_id uuid, assumption_version_id uuid, assumption_revision integer check(assumption_revision>0),
 slot_key text check(slot_key ~ '^[a-f0-9]{64}$'), decision_id uuid, content_fingerprint text check(content_fingerprint ~ '^[a-f0-9]{64}$'),
 manifest_id uuid, platform_release_id text, house_release_id uuid, method_id text, method_version text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,id),
 constraint execution_dependencies_source_binding_key unique(organization_id,source_binding_id),
 constraint execution_dependencies_basis_binding_key unique(organization_id,basis_binding_id),
 constraint execution_dependencies_manifest_key unique(organization_id,manifest_id),
 foreign key(organization_id,execution_id) references public.work_executions(organization_id,id),
 foreign key(organization_id,source_binding_id) references private.execution_source_bindings(organization_id,id),
 foreign key(organization_id,source_version_id) references public.source_versions(organization_id,id),
 foreign key(organization_id,source_id) references public.sources(organization_id,id),
 foreign key(organization_id,source_version_id,rights_version_id) references private.source_rights_versions(organization_id,source_version_id,id),
 foreign key(organization_id,resource_id) references private.access_resources(organization_id,id),
 foreign key(organization_id,basis_binding_id) references private.execution_basis_bindings(organization_id,id),
 foreign key(organization_id,assumption_set_id,assumption_version_id) references public.assumption_versions(organization_id,set_id,id),
 foreign key(organization_id,assumption_version_id,slot_key) references private.assumption_version_items(organization_id,version_id,slot_key),
 foreign key(organization_id,assumption_version_id,decision_id) references private.assumption_version_items(organization_id,version_id,decision_id),
 foreign key(organization_id,manifest_id) references private.execution_manifests(organization_id,id),
 foreign key(platform_release_id) references private.platform_method_releases(id),
 foreign key(organization_id,house_release_id) references public.method_releases(organization_id,id),
 -- Each kind carries exactly its own typed columns and a logical key derived from them.
 constraint execution_dependencies_kind_shape check(
  (dependency_kind='source_version' and logical_key=source_id::text
   and num_nonnulls(source_binding_id,source_version_id,source_id,source_version_no,rights_version_id,resource_id,content_hash)=7
   and num_nonnulls(basis_binding_id,assumption_set_id,assumption_version_id,assumption_revision,slot_key,decision_id,content_fingerprint,
    manifest_id,platform_release_id,house_release_id,method_id,method_version)=0)
  or (dependency_kind='assumption_slot' and logical_key=assumption_set_id::text||':'||slot_key
   and num_nonnulls(basis_binding_id,assumption_set_id,assumption_version_id,assumption_revision,slot_key,decision_id,content_fingerprint)=7
   and num_nonnulls(source_binding_id,source_version_id,source_id,source_version_no,rights_version_id,resource_id,content_hash,
    manifest_id,platform_release_id,house_release_id,method_id,method_version)=0)
  or (dependency_kind='method_release' and logical_key=method_id
   and num_nonnulls(manifest_id,platform_release_id,method_id,method_version)=4
   and num_nonnulls(source_binding_id,source_version_id,source_id,source_version_no,rights_version_id,resource_id,content_hash,
    basis_binding_id,assumption_set_id,assumption_version_id,assumption_revision,slot_key,decision_id,content_fingerprint)=0))
);
-- The impact query reads by logical key; the reuse and rebuild paths read by execution.
create index execution_dependencies_logical_idx on private.execution_dependencies(organization_id,dependency_kind,logical_key);
create index execution_dependencies_execution_idx on private.execution_dependencies(organization_id,execution_id,dependency_kind,logical_key);
create index execution_dependencies_rights_idx on private.execution_dependencies(organization_id,source_version_id,rights_version_id) where source_version_id is not null;
create index execution_dependencies_source_idx on private.execution_dependencies(organization_id,source_id) where source_id is not null;
create index execution_dependencies_resource_idx on private.execution_dependencies(organization_id,resource_id) where resource_id is not null;
create index execution_dependencies_set_idx on private.execution_dependencies(organization_id,assumption_set_id,assumption_version_id) where assumption_set_id is not null;
create index execution_dependencies_slot_idx on private.execution_dependencies(organization_id,assumption_version_id,slot_key) where assumption_version_id is not null;
create index execution_dependencies_decision_idx on private.execution_dependencies(organization_id,assumption_version_id,decision_id) where assumption_version_id is not null;
create index execution_dependencies_platform_idx on private.execution_dependencies(platform_release_id) where platform_release_id is not null;
create index execution_dependencies_house_idx on private.execution_dependencies(organization_id,house_release_id) where house_release_id is not null;
alter table private.execution_dependencies enable row level security;
alter table private.execution_dependencies force row level security;
revoke all on private.execution_dependencies from public,anon,authenticated,service_role;
create policy execution_dependencies_deny_clients on private.execution_dependencies as restrictive for all to anon,authenticated using(false) with check(false);
create trigger execution_dependencies_immutable before update or delete on private.execution_dependencies for each row execute function private.reject_work_continuity_mutation_v1();
create trigger execution_dependencies_truncate_guard before truncate on private.execution_dependencies for each statement execute function private.reject_work_continuity_mutation_v1();
create trigger execution_dependencies_updated before update on private.execution_dependencies for each row execute function private.set_updated_at();

-- The single mapping from the rows the request writes to projection rows. The trigger and the
-- backfill both read it, so a live write and a backfilled write can never differ.
create view private.execution_dependency_sources_v1 with (security_invoker=true) as
select 'execution_source_bindings'::text as origin_table,b.id as origin_row_id,b.organization_id,b.execution_id,
 'source_version'::text as dependency_kind,v.source_id::text as logical_key,
 b.id as source_binding_id,b.source_version_id,v.source_id,v.version_no as source_version_no,b.rights_version_id,b.resource_id,b.content_hash,
 null::uuid as basis_binding_id,null::uuid as assumption_set_id,null::uuid as assumption_version_id,null::integer as assumption_revision,
 null::text as slot_key,null::uuid as decision_id,null::text as content_fingerprint,
 null::uuid as manifest_id,null::text as platform_release_id,null::uuid as house_release_id,null::text as method_id,null::text as method_version
from private.execution_source_bindings b
join public.source_versions v on v.organization_id=b.organization_id and v.id=b.source_version_id
union all
select 'execution_basis_bindings',b.id,b.organization_id,b.execution_id,
 'assumption_slot',i.set_id::text||':'||i.slot_key,
 null,null,null,null,null,null,null,
 b.id,i.set_id,b.assumption_version_id,v.revision,i.slot_key,b.decision_id,b.content_fingerprint,
 null,null,null,null,null
from private.execution_basis_bindings b
join private.assumption_version_items i on i.organization_id=b.organization_id and i.version_id=b.assumption_version_id and i.decision_id=b.decision_id
join public.assumption_versions v on v.organization_id=i.organization_id and v.set_id=i.set_id and v.id=i.version_id
union all
select 'execution_manifests',m.id,m.organization_id,m.execution_id,
 'method_release',r.method_id,
 null,null,null,null,null,null,null,
 null,null,null,null,null,null,null,
 m.id,m.platform_release_id,m.house_release_id,r.method_id,r.version
from private.execution_manifests m
join private.platform_method_releases r on r.id=m.platform_release_id;

create function private.project_execution_dependency_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare written integer;
begin
 insert into private.execution_dependencies(organization_id,execution_id,dependency_kind,logical_key,
  source_binding_id,source_version_id,source_id,source_version_no,rights_version_id,resource_id,content_hash,
  basis_binding_id,assumption_set_id,assumption_version_id,assumption_revision,slot_key,decision_id,content_fingerprint,
  manifest_id,platform_release_id,house_release_id,method_id,method_version)
 select s.organization_id,s.execution_id,s.dependency_kind,s.logical_key,
  s.source_binding_id,s.source_version_id,s.source_id,s.source_version_no,s.rights_version_id,s.resource_id,s.content_hash,
  s.basis_binding_id,s.assumption_set_id,s.assumption_version_id,s.assumption_revision,s.slot_key,s.decision_id,s.content_fingerprint,
  s.manifest_id,s.platform_release_id,s.house_release_id,s.method_id,s.method_version
 from private.execution_dependency_sources_v1 s
 where s.origin_table=tg_table_name and s.organization_id=new.organization_id and s.origin_row_id=new.id;
 get diagnostics written=row_count;
 -- A pinned input without its projection would be an incomplete graph presented as complete.
 if written<>1 then raise exception 'execution_dependency_projection_incomplete' using errcode='23514'; end if;
 return null;
end $$;
create trigger execution_source_bindings_dependency after insert on private.execution_source_bindings for each row execute function private.project_execution_dependency_v1();
create trigger execution_basis_bindings_dependency after insert on private.execution_basis_bindings for each row execute function private.project_execution_dependency_v1();
create trigger execution_manifests_dependency after insert on private.execution_manifests for each row execute function private.project_execution_dependency_v1();

-- Idempotent: rows already projected are skipped, so it may run again to rebuild a graph.
create function private.backfill_execution_dependencies_v1() returns bigint
language plpgsql security definer set search_path='' as $$
declare written bigint;
begin
 insert into private.execution_dependencies(organization_id,execution_id,dependency_kind,logical_key,
  source_binding_id,source_version_id,source_id,source_version_no,rights_version_id,resource_id,content_hash,
  basis_binding_id,assumption_set_id,assumption_version_id,assumption_revision,slot_key,decision_id,content_fingerprint,
  manifest_id,platform_release_id,house_release_id,method_id,method_version)
 select s.organization_id,s.execution_id,s.dependency_kind,s.logical_key,
  s.source_binding_id,s.source_version_id,s.source_id,s.source_version_no,s.rights_version_id,s.resource_id,s.content_hash,
  s.basis_binding_id,s.assumption_set_id,s.assumption_version_id,s.assumption_revision,s.slot_key,s.decision_id,s.content_fingerprint,
  s.manifest_id,s.platform_release_id,s.house_release_id,s.method_id,s.method_version
 from private.execution_dependency_sources_v1 s
 order by s.organization_id,s.execution_id,s.dependency_kind,s.logical_key,s.origin_row_id
 on conflict do nothing;
 get diagnostics written=row_count;
 return written;
end $$;

-- 2. Immutable milestones of a work.
create table public.work_milestones (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 work_id uuid not null,
 kind text not null check(kind in ('execution_result','decision','awaiting_human','human_resolved','continuation_proposed','update_adopted')),
 subject_kind text not null check(subject_kind ~ '^[a-z][a-z0-9_]{2,62}$'),
 subject_id uuid not null,
 label text not null check(char_length(label) between 1 and 200 and label=btrim(label)),
 revision integer check(revision>0),
 version_fingerprint text check(version_fingerprint ~ '^[a-f0-9]{64}$'),
 outcome text check(outcome in ('succeeded','partial')),
 resolves_milestone_id uuid,
 supersedes_milestone_id uuid,
 created_by uuid references auth.users(id),
 occurred_at timestamptz not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(organization_id,id),
 unique(organization_id,work_id,id),
 constraint work_milestones_subject_key unique(organization_id,kind,subject_kind,subject_id),
 foreign key(organization_id,work_id) references public.capital_projects(organization_id,id),
 foreign key(organization_id,work_id,resolves_milestone_id) references public.work_milestones(organization_id,work_id,id),
 foreign key(organization_id,work_id,supersedes_milestone_id) references public.work_milestones(organization_id,work_id,id),
 check(resolves_milestone_id is distinct from id and supersedes_milestone_id is distinct from id),
 check((kind='execution_result')=(outcome is not null)),
 check(kind<>'execution_result' or version_fingerprint is not null),
 -- A milestone of a human act or of a person's request names that person.
 check(kind not in ('execution_result','decision','human_resolved','update_adopted') or created_by is not null)
);
create index work_milestones_work_idx on public.work_milestones(organization_id,work_id,occurred_at desc,id desc);
create index work_milestones_actor_idx on public.work_milestones(created_by) where created_by is not null;
create index work_milestones_resolves_idx on public.work_milestones(organization_id,work_id,resolves_milestone_id) where resolves_milestone_id is not null;
create index work_milestones_supersedes_idx on public.work_milestones(organization_id,work_id,supersedes_milestone_id) where supersedes_milestone_id is not null;
alter table public.work_milestones enable row level security;
alter table public.work_milestones force row level security;
revoke all on public.work_milestones from public,anon,authenticated,service_role;
grant select on public.work_milestones to authenticated;
-- The same read authority as the other tables of a work (work_contexts, work_dossiers and the
-- capital project tables): the person must be able to read the work itself.
create policy work_milestones_select_authorized on public.work_milestones for select to authenticated using((select private.can_access_capital_project(organization_id,work_id)));
create policy work_milestones_deny_insert on public.work_milestones for insert to authenticated with check(false);
create policy work_milestones_deny_update on public.work_milestones for update to authenticated using(false) with check(false);
create policy work_milestones_deny_delete on public.work_milestones for delete to authenticated using(false);
create trigger work_milestones_immutable before update or delete on public.work_milestones for each row execute function private.reject_work_continuity_mutation_v1();
create trigger work_milestones_truncate_guard before truncate on public.work_milestones for each statement execute function private.reject_work_continuity_mutation_v1();
create trigger work_milestones_updated before update on public.work_milestones for each row execute function private.set_updated_at();
create trigger work_milestones_audit after insert or update or delete on public.work_milestones for each row execute function private.capture_identity_audit_v1();

-- The label is the source's own text when it has one (the purpose of an execution, the objective
-- of an approved plan); otherwise the stable key of the subject, which the interface translates.
-- The database never writes prose of its own.
create function private.work_milestone_label_v1(p_text text,p_fallback text) returns text
language sql immutable set search_path='' as $$
 select coalesce(
  nullif(btrim(left(btrim(regexp_replace(coalesce(p_text,''),'[[:space:][:cntrl:]]+',' ','g')),200)),''),
  btrim(left(btrim(regexp_replace(coalesce(p_fallback,''),'[[:space:][:cntrl:]]+',' ','g')),200)));
$$;

-- The single mapping from committed results and approval records to milestones. line_key names
-- the series of successive versions of one subject, so a newer approval supersedes the previous one.
create view private.work_milestone_sources_v1 with (security_invoker=true) as
select 'execution_result_receipts'::text as origin_table,r.id as origin_row_id,e.organization_id,e.work_id,
 'execution_result'::text as kind,'work_execution'::text as subject_kind,e.id as subject_id,
 private.work_milestone_label_v1(m.payload->>'purpose',m.payload#>>'{method,methodId}') as label,
 null::integer as revision,r.result_fingerprint as version_fingerprint,r.outcome,p.user_id as created_by,r.created_at as occurred_at,
 null::text as line_key
from private.execution_result_receipts r
join public.work_executions e on e.organization_id=r.organization_id and e.id=r.execution_id
join private.execution_manifests m on m.organization_id=e.organization_id and m.execution_id=e.id
join private.principals p on p.organization_id=e.organization_id and p.id=e.principal_id
union all
select 'capital_project_execution_brief_dispatches',d.id,d.organization_id,d.capital_project_id,
 'decision','execution_brief',d.execution_brief_id,
 private.work_milestone_label_v1(b.objective,'execution_brief'),
 d.approved_brief_version,d.approved_brief_fingerprint,null,d.accepted_by,d.accepted_at,
 'execution_brief'
from public.capital_project_execution_brief_dispatches d
join public.capital_project_execution_briefs b on b.organization_id=d.organization_id and b.id=d.execution_brief_id
where d.accepted_at is not null
union all
select 'capital_project_artifact_decisions',x.id,x.organization_id,x.capital_project_id,
 'decision','capital_project_artifact',x.artifact_id,
 private.work_milestone_label_v1(a.artifact_type,'capital_project_artifact'),
 a.artifact_version,x.artifact_fingerprint,null,x.decided_by,x.decided_at,
 'capital_project_artifact:'||a.artifact_type
from public.capital_project_artifact_decisions x
join public.capital_project_artifacts a on a.organization_id=x.organization_id and a.id=x.artifact_id
where x.decision='confirm'
union all
select 'institutional_model_configurations',c.id,c.organization_id,c.capital_project_id,
 'decision','institutional_model_configuration',c.id,
 'institutional_model_configuration',c.revision,c.configuration_fingerprint,null,c.reviewed_by,c.reviewed_at,
 'institutional_model_configuration'
from private.institutional_model_configurations c
where c.status='approved';

-- Writes the milestone of one source row, once. Returns the new id, or null when it already exists.
create function private.write_work_milestone_v1(p_origin_table text,p_origin_row uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare s record;prior uuid;created uuid;
begin
 select * into s from private.work_milestone_sources_v1 v where v.origin_table=p_origin_table and v.origin_row_id=p_origin_row;
 if not found then raise exception 'work_milestone_source_missing' using errcode='23514'; end if;
 if s.line_key is not null then
  select m.id into prior from private.work_milestone_sources_v1 v
  join public.work_milestones m on m.organization_id=v.organization_id and m.kind=v.kind and m.subject_kind=v.subject_kind and m.subject_id=v.subject_id
  where v.organization_id=s.organization_id and v.work_id=s.work_id and v.kind=s.kind and v.line_key=s.line_key and v.revision<s.revision
  order by v.revision desc limit 1;
 end if;
 insert into public.work_milestones(organization_id,work_id,kind,subject_kind,subject_id,label,revision,version_fingerprint,outcome,supersedes_milestone_id,created_by,occurred_at)
 values(s.organization_id,s.work_id,s.kind,s.subject_kind,s.subject_id,s.label,s.revision,s.version_fingerprint,s.outcome,prior,s.created_by,s.occurred_at)
 on conflict on constraint work_milestones_subject_key do nothing
 returning id into created;
 return created;
end $$;

-- Called by the execution commit, in its transaction, right after the result receipt.
create function private.record_execution_result_milestone_v1(p_org uuid,p_execution uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare receipt uuid;
begin
 select r.id into receipt from private.execution_result_receipts r where r.organization_id=p_org and r.execution_id=p_execution;
 if receipt is null then raise exception 'work_milestone_source_missing' using errcode='23514'; end if;
 return private.write_work_milestone_v1('execution_result_receipts',receipt);
end $$;

-- Decision milestones: the approval itself, in the approving transaction. The conditions match the
-- view exactly: accepted dispatch, confirmed artifact, approved configuration.
create function private.project_decision_milestone_v1() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='capital_project_execution_brief_dispatches' then
  if new.accepted_at is null or (tg_op='UPDATE' and old.accepted_at is not null) then return null; end if;
 elsif tg_table_name='capital_project_artifact_decisions' then
  if new.decision<>'confirm' then return null; end if;
 elsif tg_table_name='institutional_model_configurations' then
  if new.status<>'approved' or (tg_op='UPDATE' and old.status='approved') then return null; end if;
 else
  raise exception 'work_milestone_source_unknown' using errcode='23514';
 end if;
 perform private.write_work_milestone_v1(tg_table_name,new.id);
 return null;
end $$;
create trigger work_milestone_decision after insert or update of accepted_at on public.capital_project_execution_brief_dispatches for each row execute function private.project_decision_milestone_v1();
create trigger work_milestone_decision after insert on public.capital_project_artifact_decisions for each row execute function private.project_decision_milestone_v1();
create trigger work_milestone_decision after insert or update of status on private.institutional_model_configurations for each row execute function private.project_decision_milestone_v1();

-- Idempotent and ordered by version inside each series, so every superseded milestone exists
-- before the one that supersedes it.
create function private.backfill_work_milestones_v1() returns bigint
language plpgsql security definer set search_path='' as $$
declare s record;written bigint:=0;
begin
 for s in select v.origin_table,v.origin_row_id from private.work_milestone_sources_v1 v
  where not exists(select 1 from public.work_milestones m where m.organization_id=v.organization_id and m.kind=v.kind and m.subject_kind=v.subject_kind and m.subject_id=v.subject_id)
  order by v.organization_id,v.work_id,v.kind,v.line_key,v.revision,v.occurred_at,v.origin_row_id
 loop
  if private.write_work_milestone_v1(s.origin_table,s.origin_row_id) is not null then written:=written+1; end if;
 end loop;
 return written;
end $$;

-- 3. The execution commit writes its milestone in the same transaction as the result receipt. A
-- replayed commit returns before this point, so it adds no second milestone.
do $patch$
declare body text;needle text;patched text;
begin
 body:=pg_get_functiondef('private.commit_work_execution_result_v1(uuid,text,uuid,text,text,text,text,text)'::regprocedure);
 needle:=E' insert into private.execution_result_receipts(organization_id,execution_id,lease_id,settlement_lease_id,contract_fingerprint,input_fingerprint,result_fingerprint,canonical_result,outcome,reason)\n'
  ||E' values(j.organization_id,j.execution_id,p_lease,o.lease_id,p_contract_hash,p_input_hash,result_hash,p_result_text,p_outcome,p_reason);\n';
 if (length(body)-length(replace(body,needle,'')))/length(needle)<>1 then
  raise exception 'execution_result_milestone_contract_changed';
 end if;
 patched:=replace(body,needle,needle||E' perform private.record_execution_result_milestone_v1(j.organization_id,j.execution_id);\n');
 execute patched;
end $patch$;

-- 4. Everything created here is closed to every API role.
revoke all on private.execution_dependency_sources_v1,private.work_milestone_sources_v1 from public,anon,authenticated,service_role;
do $$ declare f record;begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='private' and p.proname in ('reject_work_continuity_mutation_v1','project_execution_dependency_v1','backfill_execution_dependencies_v1',
  'work_milestone_label_v1','write_work_milestone_v1','record_execution_result_milestone_v1','project_decision_milestone_v1','backfill_work_milestones_v1')
 loop execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);end loop;
end $$;

-- 5. Backfill every existing execution and every existing result and approval from the same rows.
do $backfill$
declare dependencies bigint;milestones bigint;
begin
 dependencies:=private.backfill_execution_dependencies_v1();
 milestones:=private.backfill_work_milestones_v1();
 raise notice 'work continuity backfill: % execution dependencies, % work milestones',dependencies,milestones;
end $backfill$;

comment on table private.execution_dependencies is 'Typed projection of what each execution pinned: source versions (logical source, version number, rights, resource, content hash), assumption slots (set, version, revision, slot, decision, fingerprint) and the method release (platform, house, procedure). Written only by AFTER INSERT triggers on execution_source_bindings, execution_basis_bindings and execution_manifests in the request transaction, and by the idempotent backfill from the same rows. Immutable; no client, worker or RPC path. Source-to-source edges stay in private.resource_dependencies.';
comment on column private.execution_dependencies.logical_key is 'The input a newer version would replace: source_id for source_version, set_id:slot_key for assumption_slot, the procedure (method_id) for method_release. Indexed for the impact query. One row per pinned input: an execution may pin two versions of one logical source when two adopted slots came from different versions of it.';
comment on table public.work_milestones is 'Immutable milestones of a work. Writers in stage 18 increment 2: execution_result by the execution commit transaction; decision by the transaction that accepts an execution brief dispatch, confirms a capital project artifact or approves an institutional model configuration. awaiting_human, human_resolved, continuation_proposed and update_adopted are declared for the commands of increments 3 and 4 and have no writer yet. Readable by whoever can read the work; no client insert, update or delete.';
comment on column public.work_milestones.label is 'Short text a person recognises: the source''s own text (execution purpose, approved plan objective) or the stable key of the subject for the interface to translate. Used to resolve an explicit continuation base.';
comment on column public.work_milestones.revision is 'The version of the subject the milestone refers to, when there is one: brief version, artifact version, configuration revision.';
comment on column public.work_milestones.supersedes_milestone_id is 'For a decision, the approval of the previous version of the same subject series that this approval replaces.';
comment on column public.work_milestones.occurred_at is 'When the recorded act happened (result receipt, acceptance, confirmation, approval); created_at is when the milestone row was written.';
