-- Stage 19, increment 2 (migration A, artifact_revision_protocol): one artifact protocol for answers
-- and files, the SQL side of the domain contract in packages/domain-contracts/src/artifact-protocol.ts
-- (increment 1). An artifact (public.artifacts) is the identity of one output of a work: kind and
-- subject. Its revisions (public.artifact_revisions) are immutable and numbered; each carries a
-- manifest validated in SQL with the contract's shape and rule names, the manifest fingerprint
-- computed in SQL as sha256 of jsonb::text, the sha256 and length of its bytes when it has bytes, its
-- audience and its origin. A revision is composed of immutable blocks (public.artifact_blocks) with
-- the material claims they carry, and it is anchored to the canonical dependency graph by
-- private.artifact_dependency_links: source versions with the rights version the producer pinned
-- (the same pair as the four pin tables), executions, institutional results, method releases,
-- assumption slots and the revisions it derives from. Revision-level links are a projection of the
-- manifest, never of block text; inherited restriction is evaluated at read time by
-- private.source_use_allowed_v1 and never copied.
--
-- One writer: private.create_artifact_revision_v1, reached by a person through
-- public.create_artifact_revision_v1 (origin person) and by the worker through
-- public.worker_create_artifact_revision_v1 (origin worker, through the job capability, the
-- provenance filled with the job). Clients read the three public tables through the read access of
-- the work and never insert, update or delete. The legacy stores keep being written and read: each
-- new row of capital_project_artifacts, case_artifact_manifests and deal_state_objects
-- (material_artifact), and each institutional result that completes, projects its revision in the
-- same transaction by an AFTER trigger, exactly as the contract's legacyProjection labels it (the
-- row's own fingerprint verbatim, its evidence as key and value pairs, no method, execution, input
-- snapshot, source or bytes the row does not carry); the backfill below projects every existing
-- row the same way, as origin legacy.
--
-- Readers: public.read_artifact_revision_v1 (the exact revision) and public.read_artifact_head_v1
-- (the current one) return the artifact, the revision, its blocks, its links (ids and kinds),
-- release in {internal, released, blocked} from the approval facts that exist today over the exact
-- version, and freshness in {current, stale, unknown} from the facts and candidates of stage 18 and
-- from newer source versions. A source the reader cannot use, on the revision or on a revision it
-- derives from, withholds the content and reports the restriction; an external audience is served
-- only when released.
set search_path='';
set local lock_timeout='5s';

-- 0. Guards: revisions, blocks and links never change; an artifact changes only its head pointer.
create function private.reject_artifact_history_mutation_v1() returns trigger
language plpgsql set search_path='' as $$
begin raise exception 'artifact_revision_immutable' using errcode='23514'; end $$;

create function private.guard_artifact_identity_v1() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' or (to_jsonb(new)-array['head_revision_id','updated_at']) is distinct from (to_jsonb(old)-array['head_revision_id','updated_at']) then
  raise exception 'artifact_identity_immutable' using errcode='23514';
 end if;
 return new;
end $$;

-- 1. Tables.
create table public.artifacts (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 work_id uuid not null,
 kind text not null check(kind in ('answer','material','workbook','model_result','work_product','execution_result','presentation','document')),
 subject text not null check(subject ~ '^[^[:space:]]+$' and length(subject)<=300),
 legacy_origin jsonb check(legacy_origin is null or (jsonb_typeof(legacy_origin)='object' and legacy_origin ?& array['table','id']
  and legacy_origin-array['table','id']='{}'::jsonb
  and legacy_origin->>'table' in ('capital_project_artifacts','case_artifact_manifests','institutional_model_results','deal_state_objects'))),
 head_revision_id uuid,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(organization_id,id),
 constraint artifacts_identity_key unique(organization_id,work_id,kind,subject),
 foreign key(organization_id,work_id) references public.capital_projects(organization_id,id)
);

create table public.artifact_revisions (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 artifact_id uuid not null,
 revision_no integer not null check(revision_no>0),
 previous_revision_id uuid,
 audience text not null check(audience in ('internal','advisor','external')),
 origin text not null check(origin in ('worker','person','legacy')),
 manifest jsonb not null check(jsonb_typeof(manifest)='object'),
 manifest_fingerprint text not null check(manifest_fingerprint ~ '^[a-f0-9]{64}$'),
 content_sha256 text check(content_sha256 ~ '^[a-f0-9]{64}$'),
 byte_length bigint check(byte_length>0),
 -- The contract's legacy label, verbatim: table, row, the row's own fingerprint and its evidence.
 legacy_ref jsonb check(legacy_ref is null or (jsonb_typeof(legacy_ref)='object' and legacy_ref ?& array['table','id','fingerprint','evidence']
  and legacy_ref-array['table','id','fingerprint','evidence']='{}'::jsonb
  and legacy_ref->>'table' in ('capital_project_artifacts','case_artifact_manifests','institutional_model_results','deal_state_objects')
  and legacy_ref->>'fingerprint' ~ '^[a-f0-9]{64}$' and jsonb_typeof(legacy_ref->'evidence')='array')),
 created_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 unique(organization_id,id),
 unique(organization_id,artifact_id,id),
 constraint artifact_revisions_number_key unique(organization_id,artifact_id,revision_no),
 constraint artifact_revisions_fingerprint_key unique(organization_id,manifest_fingerprint),
 foreign key(organization_id,artifact_id) references public.artifacts(organization_id,id),
 foreign key(organization_id,artifact_id,previous_revision_id) references public.artifact_revisions(organization_id,artifact_id,id),
 check((revision_no=1)=(previous_revision_id is null)),
 check(previous_revision_id is distinct from id),
 -- The fingerprint is the sha256 of the manifest's jsonb text, computed by the command and pinned here.
 check(manifest_fingerprint=encode(extensions.digest(convert_to(manifest::text,'utf8'),'sha256'),'hex')),
 check((content_sha256 is null)=(byte_length is null)),
 check(content_sha256 is not distinct from (manifest#>>'{bytes,sha256}')),
 check(legacy_ref is not distinct from nullif(manifest->'legacy','null'::jsonb)),
 check(origin<>'legacy' or legacy_ref is not null),
 check(origin<>'person' or created_by is not null)
);
alter table public.artifacts add constraint artifacts_head_revision_fk
 foreign key(organization_id,id,head_revision_id) references public.artifact_revisions(organization_id,artifact_id,id);

create table public.artifact_blocks (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 revision_id uuid not null,
 block_no integer not null check(block_no>0),
 block_key text not null check(block_key ~ '^[^[:space:]]{1,160}$'),
 kind text not null check(kind in ('section','paragraph','table','chart','number','cell_region')),
 content jsonb not null check(jsonb_typeof(content)='object'),
 claims jsonb not null default '[]'::jsonb check(jsonb_typeof(claims)='array' and jsonb_array_length(claims)<=500),
 content_fingerprint text not null check(content_fingerprint ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default now(),
 unique(organization_id,id),
 unique(organization_id,revision_id,id),
 constraint artifact_blocks_number_key unique(organization_id,revision_id,block_no),
 constraint artifact_blocks_key_key unique(organization_id,revision_id,block_key),
 foreign key(organization_id,revision_id) references public.artifact_revisions(organization_id,id),
 check(content_fingerprint=encode(extensions.digest(convert_to(content::text,'utf8'),'sha256'),'hex'))
);

create table private.artifact_dependency_links (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 revision_id uuid not null,
 block_id uuid,
 link_kind text not null check(link_kind in ('source_version','execution','institutional_result','method_release','assumption_slot','artifact_revision')),
 -- The manifest may name a source without a rights version; the link always carries the pin the
 -- command resolved (the producer's execution pin, else the rights version the work uses today).
 source_version_id uuid, source_rights_version_id uuid,
 execution_id uuid,
 institutional_result_id uuid,
 platform_release_id text, house_release_id uuid,
 assumption_set_id uuid, assumption_version_id uuid, slot_key text check(slot_key ~ '^[a-f0-9]{64}$'),
 derived_from_revision_id uuid,
 created_at timestamptz not null default now(),
 unique(organization_id,id),
 constraint artifact_dependency_links_target_key unique nulls not distinct(organization_id,revision_id,block_id,link_kind,
  source_version_id,source_rights_version_id,execution_id,institutional_result_id,platform_release_id,house_release_id,assumption_version_id,slot_key,derived_from_revision_id),
 foreign key(organization_id,revision_id) references public.artifact_revisions(organization_id,id),
 foreign key(organization_id,revision_id,block_id) references public.artifact_blocks(organization_id,revision_id,id),
 foreign key(organization_id,source_version_id) references public.source_versions(organization_id,id),
 foreign key(organization_id,source_version_id,source_rights_version_id) references private.source_rights_versions(organization_id,source_version_id,id),
 foreign key(organization_id,execution_id) references public.work_executions(organization_id,id),
 foreign key(organization_id,institutional_result_id) references private.institutional_model_results(organization_id,id),
 foreign key(platform_release_id) references private.platform_method_releases(id),
 foreign key(organization_id,house_release_id) references public.method_releases(organization_id,id),
 foreign key(organization_id,assumption_set_id,assumption_version_id) references public.assumption_versions(organization_id,set_id,id),
 foreign key(organization_id,assumption_version_id,slot_key) references private.assumption_version_items(organization_id,version_id,slot_key),
 foreign key(organization_id,derived_from_revision_id) references public.artifact_revisions(organization_id,id),
 check(derived_from_revision_id is distinct from revision_id),
 -- Exactly one target, with exactly its own columns.
 constraint artifact_dependency_links_kind_shape check(
  (link_kind='source_version' and num_nonnulls(source_version_id,source_rights_version_id)=2
   and num_nonnulls(execution_id,institutional_result_id,platform_release_id,house_release_id,assumption_set_id,assumption_version_id,slot_key,derived_from_revision_id)=0)
  or (link_kind='execution' and execution_id is not null
   and num_nonnulls(source_version_id,source_rights_version_id,institutional_result_id,platform_release_id,house_release_id,assumption_set_id,assumption_version_id,slot_key,derived_from_revision_id)=0)
  or (link_kind='institutional_result' and institutional_result_id is not null
   and num_nonnulls(source_version_id,source_rights_version_id,execution_id,platform_release_id,house_release_id,assumption_set_id,assumption_version_id,slot_key,derived_from_revision_id)=0)
  or (link_kind='method_release' and platform_release_id is not null
   and num_nonnulls(source_version_id,source_rights_version_id,execution_id,institutional_result_id,assumption_set_id,assumption_version_id,slot_key,derived_from_revision_id)=0)
  or (link_kind='assumption_slot' and num_nonnulls(assumption_set_id,assumption_version_id,slot_key)=3
   and num_nonnulls(source_version_id,source_rights_version_id,execution_id,institutional_result_id,platform_release_id,house_release_id,derived_from_revision_id)=0)
  or (link_kind='artifact_revision' and derived_from_revision_id is not null
   and num_nonnulls(source_version_id,source_rights_version_id,execution_id,institutional_result_id,platform_release_id,house_release_id,assumption_set_id,assumption_version_id,slot_key)=0))
);

create index artifacts_work_idx on public.artifacts(organization_id,work_id,kind);
create index artifacts_head_idx on public.artifacts(organization_id,head_revision_id) where head_revision_id is not null;
create index artifact_revisions_artifact_idx on public.artifact_revisions(organization_id,artifact_id,revision_no desc);
create index artifact_revisions_previous_idx on public.artifact_revisions(organization_id,artifact_id,previous_revision_id) where previous_revision_id is not null;
create index artifact_revisions_legacy_idx on public.artifact_revisions(organization_id,(legacy_ref->>'table'),(legacy_ref->>'id')) where legacy_ref is not null;
create index artifact_revisions_actor_idx on public.artifact_revisions(created_by) where created_by is not null;
create index artifact_blocks_revision_idx on public.artifact_blocks(organization_id,revision_id,block_no);
create index artifact_dependency_links_revision_idx on private.artifact_dependency_links(organization_id,revision_id,link_kind);
create index artifact_dependency_links_block_idx on private.artifact_dependency_links(organization_id,revision_id,block_id) where block_id is not null;
create index artifact_dependency_links_source_idx on private.artifact_dependency_links(organization_id,source_version_id,source_rights_version_id) where source_version_id is not null;
create index artifact_dependency_links_execution_idx on private.artifact_dependency_links(organization_id,execution_id) where execution_id is not null;
create index artifact_dependency_links_result_idx on private.artifact_dependency_links(organization_id,institutional_result_id) where institutional_result_id is not null;
create index artifact_dependency_links_platform_idx on private.artifact_dependency_links(platform_release_id) where platform_release_id is not null;
create index artifact_dependency_links_house_idx on private.artifact_dependency_links(organization_id,house_release_id) where house_release_id is not null;
create index artifact_dependency_links_set_idx on private.artifact_dependency_links(organization_id,assumption_set_id,assumption_version_id) where assumption_set_id is not null;
create index artifact_dependency_links_slot_idx on private.artifact_dependency_links(organization_id,assumption_version_id,slot_key) where assumption_version_id is not null;
create index artifact_dependency_links_derived_idx on private.artifact_dependency_links(organization_id,derived_from_revision_id) where derived_from_revision_id is not null;

-- The read authority of a work, for the policies of revisions and blocks.
create function private.artifact_readable_v1(p_org uuid,p_artifact uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.artifacts a where a.organization_id=p_org and a.id=p_artifact and private.can_access_capital_project(a.organization_id,a.work_id));
$$;
create function private.artifact_revision_readable_v1(p_org uuid,p_revision uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.artifact_revisions r join public.artifacts a on a.organization_id=r.organization_id and a.id=r.artifact_id
  where r.organization_id=p_org and r.id=p_revision and private.can_access_capital_project(a.organization_id,a.work_id));
$$;

alter table public.artifacts enable row level security;
alter table public.artifacts force row level security;
alter table public.artifact_revisions enable row level security;
alter table public.artifact_revisions force row level security;
alter table public.artifact_blocks enable row level security;
alter table public.artifact_blocks force row level security;
alter table private.artifact_dependency_links enable row level security;
alter table private.artifact_dependency_links force row level security;
revoke all on public.artifacts,public.artifact_revisions,public.artifact_blocks,private.artifact_dependency_links from public,anon,authenticated,service_role;
grant select on public.artifacts,public.artifact_revisions,public.artifact_blocks to authenticated;
create policy artifacts_select_authorized on public.artifacts for select to authenticated using((select private.can_access_capital_project(organization_id,work_id)));
create policy artifacts_deny_insert on public.artifacts for insert to authenticated with check(false);
create policy artifacts_deny_update on public.artifacts for update to authenticated using(false) with check(false);
create policy artifacts_deny_delete on public.artifacts for delete to authenticated using(false);
create policy artifact_revisions_select_authorized on public.artifact_revisions for select to authenticated using((select private.artifact_readable_v1(organization_id,artifact_id)));
create policy artifact_revisions_deny_insert on public.artifact_revisions for insert to authenticated with check(false);
create policy artifact_revisions_deny_update on public.artifact_revisions for update to authenticated using(false) with check(false);
create policy artifact_revisions_deny_delete on public.artifact_revisions for delete to authenticated using(false);
create policy artifact_blocks_select_authorized on public.artifact_blocks for select to authenticated using((select private.artifact_revision_readable_v1(organization_id,revision_id)));
create policy artifact_blocks_deny_insert on public.artifact_blocks for insert to authenticated with check(false);
create policy artifact_blocks_deny_update on public.artifact_blocks for update to authenticated using(false) with check(false);
create policy artifact_blocks_deny_delete on public.artifact_blocks for delete to authenticated using(false);
create policy artifact_dependency_links_deny_clients on private.artifact_dependency_links as restrictive for all to anon,authenticated using(false) with check(false);

create trigger artifacts_identity before update or delete on public.artifacts for each row execute function private.guard_artifact_identity_v1();
create trigger artifacts_truncate_guard before truncate on public.artifacts for each statement execute function private.reject_artifact_history_mutation_v1();
create trigger artifacts_updated before update on public.artifacts for each row execute function private.set_updated_at();
create trigger artifacts_audit after insert or update or delete on public.artifacts for each row execute function private.capture_identity_audit_v1();
create trigger artifact_revisions_immutable before update or delete on public.artifact_revisions for each row execute function private.reject_artifact_history_mutation_v1();
create trigger artifact_revisions_truncate_guard before truncate on public.artifact_revisions for each statement execute function private.reject_artifact_history_mutation_v1();
create trigger artifact_revisions_audit after insert or update or delete on public.artifact_revisions for each row execute function private.capture_identity_audit_v1();
create trigger artifact_blocks_immutable before update or delete on public.artifact_blocks for each row execute function private.reject_artifact_history_mutation_v1();
create trigger artifact_blocks_truncate_guard before truncate on public.artifact_blocks for each statement execute function private.reject_artifact_history_mutation_v1();
create trigger artifact_blocks_audit after insert or update or delete on public.artifact_blocks for each row execute function private.capture_identity_audit_v1();
create trigger artifact_dependency_links_immutable before update or delete on private.artifact_dependency_links for each row execute function private.reject_artifact_history_mutation_v1();
create trigger artifact_dependency_links_truncate_guard before truncate on private.artifact_dependency_links for each statement execute function private.reject_artifact_history_mutation_v1();

-- 2. The manifest validator: artifactManifestSchema of the contract, key for key, with the same
-- rule names. Shape failures raise artifact_manifest_<section>_invalid; the cross-field rules raise
-- bytes_without_format, execution_result_without_execution, model_result_without_institutional_result,
-- legacy_with_fabricated_links, duplicate_source, duplicate_claims_block and duplicate_trace.
create function private.jsonb_array_or_empty_v1(p jsonb) returns jsonb
language sql immutable set search_path='' as $$ select case when jsonb_typeof(p)='array' then p else '[]'::jsonb end $$;

create function private.validate_artifact_manifest_v1(p_manifest jsonb) returns void
language plpgsql immutable set search_path='' as $$
declare m jsonb:=p_manifest;b jsonb;x jsonb;
 hex text:='^[a-f0-9]{64}$';
 uid text:='^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
 keys text[]:=array['schemaVersion','kind','audience','format','bytes','method','execution','inputSnapshot','institutionalResult','sources','claims','traces','template','provenance','legacy'];
begin
 if m is null or jsonb_typeof(m)<>'object' or not (m ?& keys) or exists(select 1 from jsonb_object_keys(m) k where k<>all(keys))
  or m->>'schemaVersion' is distinct from 'artifact-manifest.2026.09.26-v1'
  or m->>'kind' not in ('answer','material','workbook','model_result','work_product','execution_result','presentation','document')
  or m->>'audience' not in ('internal','advisor','external')
  or (jsonb_typeof(m->'format')<>'null' and m->>'format' not in ('json','text','markdown','html','xlsx','pptx','docx','pdf'))
  or jsonb_typeof(m->'traces')<>'array' or jsonb_array_length(m->'traces')>2000
  or exists(select 1 from jsonb_array_elements(m->'traces') t where jsonb_typeof(t)<>'string' or length(t#>>'{}') not between 1 and 200)
  or (jsonb_typeof(m->'inputSnapshot')<>'null' and (jsonb_typeof(m->'inputSnapshot')<>'object'
   or coalesce(m#>>'{inputSnapshot,fingerprint}','') !~ hex or (m->'inputSnapshot')-array['fingerprint']<>'{}'::jsonb))
 then raise exception 'artifact_manifest_schema_invalid' using errcode='22023'; end if;
 b:=m->'bytes';
 if jsonb_typeof(b)<>'null' and (jsonb_typeof(b)<>'object'
  or coalesce(b->>'sha256','') !~ hex or jsonb_typeof(b->'byteLength')<>'number' or (b->>'byteLength') !~ '^[1-9][0-9]*$'
  or (b ? 'storage')=(b ? 'rendered') or b-array['sha256','byteLength','storage','rendered']<>'{}'::jsonb
  or (b ? 'storage' and (jsonb_typeof(b->'storage')<>'object' or length(coalesce(b#>>'{storage,bucket}','')) not between 1 and 100
   or length(coalesce(b#>>'{storage,path}','')) not between 1 and 1000 or (b->'storage')-array['bucket','path']<>'{}'::jsonb))
  or (b ? 'rendered' and (jsonb_typeof(b->'rendered')<>'object' or length(coalesce(b#>>'{rendered,renderer}','')) not between 1 and 200
   or length(coalesce(b#>>'{rendered,rendererVersion}','')) not between 1 and 200 or jsonb_typeof(b->'rendered'->'deterministicInputs')<>'object'
   or (b->'rendered')-array['renderer','rendererVersion','deterministicInputs']<>'{}'::jsonb
   or exists(select 1 from jsonb_each(b->'rendered'->'deterministicInputs') e where length(e.key) not between 1 and 100
    or jsonb_typeof(e.value) not in ('string','number','boolean','null') or (jsonb_typeof(e.value)='string' and length(e.value#>>'{}')>2000)))))
 then raise exception 'artifact_manifest_bytes_invalid' using errcode='22023'; end if;
 if jsonb_typeof(b)='object' and b ? 'rendered' and (select count(*) from jsonb_object_keys(b->'rendered'->'deterministicInputs'))=0 then
  raise exception 'deterministic_inputs_required' using errcode='22023'; end if;
 x:=m->'method';
 if jsonb_typeof(x)<>'null' and (jsonb_typeof(x)<>'object'
  or length(coalesce(x->>'procedureId','')) not between 1 and 200 or length(coalesce(x->>'platformReleaseId','')) not between 1 and 200
  or not (x ? 'houseReleaseId') or jsonb_typeof(x->'houseReleaseId') not in ('null','string') or (jsonb_typeof(x->'houseReleaseId')='string' and x->>'houseReleaseId' !~* uid)
  or length(coalesce(x->>'version','')) not between 1 and 80 or x-array['procedureId','platformReleaseId','houseReleaseId','version']<>'{}'::jsonb)
 then raise exception 'artifact_manifest_method_invalid' using errcode='22023'; end if;
 x:=m->'execution';
 if jsonb_typeof(x)<>'null' and (jsonb_typeof(x)<>'object'
  or coalesce(x->>'executionId','') !~* uid or coalesce(x->>'resultFingerprint','') !~ hex or coalesce(x->>'inputFingerprint','') !~ hex
  or x-array['executionId','resultFingerprint','inputFingerprint']<>'{}'::jsonb)
 then raise exception 'artifact_manifest_execution_invalid' using errcode='22023'; end if;
 x:=m->'institutionalResult';
 if jsonb_typeof(x)<>'null' and (jsonb_typeof(x)<>'object'
  or coalesce(x->>'id','') !~* uid or coalesce(x->>'configurationFingerprint','') !~ hex or x-array['id','configurationFingerprint']<>'{}'::jsonb)
 then raise exception 'artifact_manifest_result_invalid' using errcode='22023'; end if;
 x:=m->'sources';
 if jsonb_typeof(x)<>'array' or jsonb_array_length(x)>1000
  or exists(select 1 from jsonb_array_elements(x) s where jsonb_typeof(s)<>'object' or coalesce(s->>'sourceVersionId','') !~* uid
   or not (s ? 'rightsVersionId') or jsonb_typeof(s->'rightsVersionId') not in ('null','string') or (jsonb_typeof(s->'rightsVersionId')='string' and s->>'rightsVersionId' !~* uid)
   or s-array['sourceVersionId','rightsVersionId']<>'{}'::jsonb)
 then raise exception 'artifact_manifest_source_invalid' using errcode='22023'; end if;
 x:=m->'claims';
 if jsonb_typeof(x)<>'array' or jsonb_array_length(x)>1000
  or exists(select 1 from jsonb_array_elements(x) c where jsonb_typeof(c)<>'object' or coalesce(c->>'blockKey','') !~ '^[^[:space:]]{1,160}$'
   or jsonb_typeof(c->'claimIds')<>'array' or jsonb_array_length(c->'claimIds') not between 1 and 1000
   or exists(select 1 from jsonb_array_elements(c->'claimIds') i where jsonb_typeof(i)<>'string' or length(i#>>'{}') not between 1 and 160)
   or c-array['blockKey','claimIds']<>'{}'::jsonb)
 then raise exception 'artifact_manifest_claims_invalid' using errcode='22023'; end if;
 x:=m->'template';
 if jsonb_typeof(x)<>'null' and (jsonb_typeof(x)<>'object'
  or length(coalesce(x->>'templateVersionId','')) not between 1 and 200 or coalesce(x->>'fingerprint','') !~ hex or x-array['templateVersionId','fingerprint']<>'{}'::jsonb)
 then raise exception 'artifact_manifest_template_invalid' using errcode='22023'; end if;
 x:=m->'provenance';
 if jsonb_typeof(x)<>'object' or not (x ?& array['producer','jobId','taskRunId','messageId','capability'])
  or length(coalesce(x->>'producer','')) not between 1 and 200
  or jsonb_typeof(x->'jobId') not in ('null','string') or (jsonb_typeof(x->'jobId')='string' and x->>'jobId' !~* uid)
  or jsonb_typeof(x->'taskRunId') not in ('null','string') or (jsonb_typeof(x->'taskRunId')='string' and x->>'taskRunId' !~* uid)
  or jsonb_typeof(x->'messageId') not in ('null','string') or (jsonb_typeof(x->'messageId')='string' and x->>'messageId' !~* uid)
  or jsonb_typeof(x->'capability') not in ('null','string') or (jsonb_typeof(x->'capability')='string' and length(x->>'capability') not between 1 and 120)
  or x-array['producer','jobId','taskRunId','messageId','capability']<>'{}'::jsonb
 then raise exception 'artifact_manifest_provenance_invalid' using errcode='22023'; end if;
 x:=m->'legacy';
 if jsonb_typeof(x)<>'null' and (jsonb_typeof(x)<>'object'
  or x->>'table' not in ('capital_project_artifacts','case_artifact_manifests','institutional_model_results','deal_state_objects')
  or coalesce(x->>'id','') !~* uid or coalesce(x->>'fingerprint','') !~ hex
  or jsonb_typeof(x->'evidence')<>'array' or jsonb_array_length(x->'evidence')>200
  or exists(select 1 from jsonb_array_elements(x->'evidence') e where jsonb_typeof(e)<>'object' or coalesce(e->>'key','') !~ '^[a-z][a-z0-9_]{0,79}$'
   or jsonb_typeof(e->'value')<>'string' or length(e->>'value')>2000 or e-array['key','value']<>'{}'::jsonb)
  or x-array['table','id','fingerprint','evidence']<>'{}'::jsonb)
 then raise exception 'artifact_manifest_legacy_invalid' using errcode='22023'; end if;
 -- Cross-field rules, named as the contract names them.
 if jsonb_typeof(m->'bytes')<>'null' and jsonb_typeof(m->'format')='null' then raise exception 'bytes_without_format' using errcode='22023'; end if;
 if m->>'kind'='execution_result' and jsonb_typeof(m->'execution')='null' then raise exception 'execution_result_without_execution' using errcode='22023'; end if;
 if m->>'kind'='model_result' and jsonb_typeof(m->'institutionalResult')='null' then raise exception 'model_result_without_institutional_result' using errcode='22023'; end if;
 if jsonb_typeof(m->'legacy')<>'null' and (jsonb_typeof(m->'method')<>'null' or jsonb_typeof(m->'execution')<>'null' or jsonb_typeof(m->'inputSnapshot')<>'null') then
  raise exception 'legacy_with_fabricated_links' using errcode='22023'; end if;
 if (select count(*)<>count(distinct s->>'sourceVersionId') from jsonb_array_elements(m->'sources') s) then raise exception 'duplicate_source' using errcode='22023'; end if;
 if (select count(*)<>count(distinct c->>'blockKey') from jsonb_array_elements(m->'claims') c) then raise exception 'duplicate_claims_block' using errcode='22023'; end if;
 if (select count(*)<>count(distinct t#>>'{}') from jsonb_array_elements(m->'traces') t) then raise exception 'duplicate_trace' using errcode='22023'; end if;
end $$;

-- The claims of one block: artifactClaimSchema of the contract, every key present.
create function private.validate_artifact_claims_v1(p_claims jsonb) returns void
language plpgsql immutable set search_path='' as $$
begin
 if jsonb_typeof(p_claims)<>'array' or jsonb_array_length(p_claims)>500
  or exists(select 1 from jsonb_array_elements(p_claims) c where jsonb_typeof(c)<>'object' or not (c ?& array['claimId','kind','value','unit','period','supportIds'])
   or length(coalesce(c->>'claimId','')) not between 1 and 160 or c->>'kind' not in ('fact','calculation','judgment','public_source')
   or jsonb_typeof(c->'value') not in ('string','number','boolean','null') or (jsonb_typeof(c->'value')='string' and length(c->>'value')>2000)
   or jsonb_typeof(c->'unit') not in ('null','string') or (jsonb_typeof(c->'unit')='string' and length(c->>'unit') not between 1 and 80)
   or jsonb_typeof(c->'period') not in ('null','string') or (jsonb_typeof(c->'period')='string' and length(c->>'period') not between 1 and 80)
   or jsonb_typeof(c->'supportIds')<>'array' or jsonb_array_length(c->'supportIds')>200
   or exists(select 1 from jsonb_array_elements(c->'supportIds') s where jsonb_typeof(s)<>'string' or length(s#>>'{}') not between 1 and 160)
   or c-array['claimId','kind','value','unit','period','supportIds']<>'{}'::jsonb)
 then raise exception 'artifact_block_claims_invalid' using errcode='22023'; end if;
 if (select count(*)<>count(distinct c->>'claimId') from jsonb_array_elements(p_claims) c) then raise exception 'duplicate_claim_id' using errcode='22023'; end if;
end $$;

-- Whether a block's content carries a number a claim must back: years and calendar dates are periods.
create function private.artifact_content_carries_number_v1(p_content jsonb) returns boolean
language sql immutable set search_path='' as $$
 select exists(select 1 from jsonb_path_query(p_content,'$.**') v
  where jsonb_typeof(v)='number'
   or (jsonb_typeof(v)='string' and regexp_replace(regexp_replace(regexp_replace(v#>>'{}','\d{4}-\d{2}-\d{2}',' ','g'),'\m\d{1,2}/\d{1,2}/\d{2,4}\M',' ','g'),'\m(19|20)\d{2}\M',' ','g') ~ '\d'));
$$;

-- The rights version a source link pins when the producer named none: the pin of the producer's
-- execution for that source version, else the rights version the work uses today (the latest).
-- Null when neither exists: the write is then refused, never stored with a null pin.
create function private.artifact_source_rights_pin_v1(p_org uuid,p_version uuid,p_execution uuid) returns uuid
language sql stable security definer set search_path='' as $$
 select coalesce(
  (select d.rights_version_id from private.execution_dependencies d
   where p_execution is not null and d.organization_id=p_org and d.execution_id=p_execution and d.source_version_id=p_version and d.rights_version_id is not null
   order by d.created_at,d.id limit 1),
  (select r.id from private.source_rights_versions r where r.organization_id=p_org and r.source_version_id=p_version order by r.revision desc limit 1));
$$;

-- 3. The core. One transaction: the project row, then the work (the lock order of stage 18) when the
-- caller is a command; a projection inside a legacy writer's transaction keeps that writer's locks
-- and serializes on the artifact row alone. Revision-level links are the manifest's (sources,
-- execution, institutional result, method); p_links adds block anchors, assumption slots and the
-- revisions this one derives from. A source the subject cannot use is refused; a source without a
-- resolvable rights pin is refused; an execution whose receipt exists must carry the receipt's result
-- fingerprint; the same manifest replays. Derived revision ids are version 5 UUIDs.
create function private.create_artifact_revision_v1(
 p_org uuid,p_work uuid,p_kind text,p_subject text,p_audience text,p_origin text,p_manifest jsonb,p_blocks jsonb,p_links jsonb,
 p_content_sha256 text,p_byte_length bigint,p_legacy_ref jsonb,p_actor uuid,
 p_rights_subject uuid default null,p_revision_id uuid default null,p_lock_work boolean default true) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 hex text:='^[a-f0-9]{64}$';uid text:='^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
 blocks jsonb:=coalesce(p_blocks,'[]'::jsonb);links jsonb:=coalesce(p_links,'[]'::jsonb);all_links jsonb:='[]'::jsonb;
 a public.artifacts;existing public.artifact_revisions;head public.artifact_revisions;rev_id uuid;fingerprint text;next_no integer;
 blk jsonb;blk_no integer:=0;lnk jsonb;lnk_kind text;lnk_block uuid;sv uuid;rv uuid;set_id uuid;summary jsonb;informational boolean;substance boolean;
begin
 if p_org is null or p_work is null
  or p_kind not in ('answer','material','workbook','model_result','work_product','execution_result','presentation','document')
  or coalesce(p_subject,'') !~ '^[^[:space:]]+$' or length(p_subject)>300
  or p_audience not in ('internal','advisor','external') or p_origin not in ('worker','person','legacy')
  or jsonb_typeof(blocks)<>'array' or jsonb_array_length(blocks)>500 or jsonb_typeof(links)<>'array' or jsonb_array_length(links)>2000
  or (p_content_sha256 is null)<>(p_byte_length is null) or (p_content_sha256 is not null and (p_content_sha256 !~ hex or p_byte_length<=0))
  or (p_origin='person' and p_actor is null)
 then raise exception 'artifact_revision_invalid' using errcode='22023'; end if;
 if p_origin='legacy' and p_legacy_ref is null then raise exception 'legacy_origin_without_ref' using errcode='22023'; end if;
 if p_lock_work then
  perform 1 from public.capital_projects p where p.organization_id=p_org and p.id=p_work for no key update;
  if not found then raise exception 'artifact_work_not_found' using errcode='P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended('work-continuation:'||p_org::text||':'||p_work::text,0));
 elsif not exists(select 1 from public.capital_projects p where p.organization_id=p_org and p.id=p_work) then
  raise exception 'artifact_work_not_found' using errcode='P0002';
 end if;
 perform private.validate_artifact_manifest_v1(p_manifest);
 if p_manifest->>'kind'<>p_kind then raise exception 'kind_mismatch' using errcode='22023'; end if;
 if p_manifest->>'audience'<>p_audience then raise exception 'audience_mismatch' using errcode='22023'; end if;
 if p_content_sha256 is distinct from (p_manifest#>>'{bytes,sha256}') or p_byte_length is distinct from (p_manifest#>>'{bytes,byteLength}')::bigint then
  raise exception 'bytes_mismatch' using errcode='22023';
 end if;
 if p_legacy_ref is distinct from nullif(p_manifest->'legacy','null'::jsonb) then raise exception 'legacy_ref_mismatch' using errcode='22023'; end if;
 -- Blocks: key, kind, content and claims; keys unique inside the revision; claim ids unique across it.
 for blk in select value from jsonb_array_elements(blocks) loop
  if jsonb_typeof(blk)<>'object' or not (blk ?& array['blockKey','kind','content','claims']) or coalesce(blk->>'blockKey','') !~ '^[^[:space:]]{1,160}$'
   or blk->>'kind' not in ('section','paragraph','table','chart','number','cell_region') or jsonb_typeof(blk->'content')<>'object'
   or jsonb_typeof(blk->'claims')<>'array' or blk-array['blockKey','kind','content','claims']<>'{}'::jsonb
  then raise exception 'artifact_block_invalid' using errcode='22023'; end if;
  perform private.validate_artifact_claims_v1(blk->'claims');
 end loop;
 if (select count(distinct value->>'blockKey') from jsonb_array_elements(blocks))<>jsonb_array_length(blocks) then raise exception 'duplicate_block_key' using errcode='22023'; end if;
 if (select count(*)<>count(distinct c->>'claimId') from jsonb_array_elements(blocks) b cross join jsonb_array_elements(b.value->'claims') c) then
  raise exception 'duplicate_claim_id' using errcode='22023'; end if;
 -- The manifest's claims summary is exactly revisionClaimsSummary(blocks): blocks with claims, in
 -- block order, each with its claim ids in claim order.
 select coalesce(jsonb_agg(jsonb_build_object('blockKey',b.value->>'blockKey','claimIds',
   (select jsonb_agg(c->'claimId') from jsonb_array_elements(b.value->'claims') c)) order by b.ordinality),'[]'::jsonb) into summary
  from jsonb_array_elements(blocks) with ordinality b where jsonb_array_length(b.value->'claims')>0;
 if summary<>p_manifest->'claims' then raise exception 'claims_summary_mismatch' using errcode='22023'; end if;
 -- The execution the manifest names: once its receipt exists, the manifest carries the receipt's
 -- result fingerprint (the sha256 of the canonical text), never a fingerprint of its own.
 if jsonb_typeof(p_manifest->'execution')='object' and exists(select 1 from private.execution_result_receipts x
   where x.organization_id=p_org and x.execution_id=(p_manifest#>>'{execution,executionId}')::uuid and x.result_fingerprint<>p_manifest#>>'{execution,resultFingerprint}') then
  raise exception 'execution_result_fingerprint_mismatch' using errcode='22023';
 end if;
 -- Links of the revision from the manifest, then the anchors and derivations of p_links. A source
 -- named without a rights version pins the one the command resolves, or the write is refused.
 for lnk in select value from jsonb_array_elements(p_manifest->'sources') loop
  sv:=(lnk->>'sourceVersionId')::uuid;
  rv:=coalesce(nullif(lnk->>'rightsVersionId','')::uuid,private.artifact_source_rights_pin_v1(p_org,sv,nullif(p_manifest#>>'{execution,executionId}','')::uuid));
  if rv is null then raise exception 'artifact_source_rights_unresolved' using errcode='P0002'; end if;
  all_links:=all_links||jsonb_build_array(jsonb_build_object('kind','source_version','sourceVersionId',sv,'rightsVersionId',rv));
 end loop;
 if jsonb_typeof(p_manifest->'execution')='object' then all_links:=all_links||jsonb_build_array(jsonb_build_object('kind','execution','executionId',p_manifest#>>'{execution,executionId}')); end if;
 if jsonb_typeof(p_manifest->'institutionalResult')='object' then all_links:=all_links||jsonb_build_array(jsonb_build_object('kind','institutional_result','resultId',p_manifest#>>'{institutionalResult,id}')); end if;
 if jsonb_typeof(p_manifest->'method')='object' then all_links:=all_links||jsonb_build_array(jsonb_build_object('kind','method_release','platformReleaseId',p_manifest#>>'{method,platformReleaseId}','houseReleaseId',p_manifest#>'{method,houseReleaseId}')); end if;
 for lnk in select value from jsonb_array_elements(links) loop
  lnk_kind:=lnk->>'kind';
  if jsonb_typeof(lnk)<>'object' or lnk_kind not in ('source_version','execution','institutional_result','method_release','assumption_slot','artifact_revision')
   or (lnk ? 'blockKey' and (jsonb_typeof(lnk->'blockKey')<>'string' or not exists(select 1 from jsonb_array_elements(blocks) b where b.value->>'blockKey'=lnk->>'blockKey')))
   or (lnk_kind='source_version' and (coalesce(lnk->>'sourceVersionId','') !~* uid or jsonb_typeof(lnk->'rightsVersionId') not in ('null','string')
    or (jsonb_typeof(lnk->'rightsVersionId')='string' and lnk->>'rightsVersionId' !~* uid) or lnk-array['kind','blockKey','sourceVersionId','rightsVersionId']<>'{}'::jsonb))
   or (lnk_kind='execution' and (coalesce(lnk->>'executionId','') !~* uid or lnk-array['kind','blockKey','executionId']<>'{}'::jsonb))
   or (lnk_kind='institutional_result' and (coalesce(lnk->>'resultId','') !~* uid or lnk-array['kind','blockKey','resultId']<>'{}'::jsonb))
   or (lnk_kind='method_release' and (length(coalesce(lnk->>'platformReleaseId','')) not between 1 and 200 or jsonb_typeof(lnk->'houseReleaseId') not in ('null','string')
    or (jsonb_typeof(lnk->'houseReleaseId')='string' and lnk->>'houseReleaseId' !~* uid) or lnk-array['kind','blockKey','platformReleaseId','houseReleaseId']<>'{}'::jsonb))
   or (lnk_kind='assumption_slot' and (coalesce(lnk->>'assumptionVersionId','') !~* uid or coalesce(lnk->>'slotKey','') !~ hex
    or lnk-array['kind','blockKey','assumptionVersionId','slotKey']<>'{}'::jsonb))
   or (lnk_kind='artifact_revision' and (coalesce(lnk->>'derivedFromRevisionId','') !~* uid or lnk-array['kind','blockKey','derivedFromRevisionId']<>'{}'::jsonb))
  then raise exception 'artifact_link_invalid' using errcode='22023'; end if;
  -- An edge comes from the producer's manifest, never from the text of a block: a block anchor names
  -- a source the manifest declares and carries the same pin the revision-level link resolved.
  if (lnk_kind='source_version' and not exists(select 1 from jsonb_array_elements(p_manifest->'sources') s
     where s->>'sourceVersionId'=lnk->>'sourceVersionId' and (jsonb_typeof(s->'rightsVersionId')='null' or jsonb_typeof(lnk->'rightsVersionId')='null' or s->>'rightsVersionId'=lnk->>'rightsVersionId')))
   or (lnk_kind='execution' and p_manifest#>>'{execution,executionId}' is distinct from lnk->>'executionId')
   or (lnk_kind='institutional_result' and p_manifest#>>'{institutionalResult,id}' is distinct from lnk->>'resultId')
   or (lnk_kind='method_release' and (p_manifest#>>'{method,platformReleaseId}' is distinct from lnk->>'platformReleaseId' or p_manifest#>>'{method,houseReleaseId}' is distinct from lnk->>'houseReleaseId'))
  then raise exception 'artifact_link_not_in_manifest' using errcode='22023'; end if;
  if lnk_kind='source_version' then
   select l->>'rightsVersionId' into rv from jsonb_array_elements(all_links) l where l->>'kind'='source_version' and l->>'sourceVersionId'=lnk->>'sourceVersionId' limit 1;
   if jsonb_typeof(lnk->'rightsVersionId')='string' and lnk->>'rightsVersionId'<>rv::text then raise exception 'artifact_link_not_in_manifest' using errcode='22023'; end if;
   lnk:=lnk||jsonb_build_object('rightsVersionId',rv);
  end if;
  all_links:=all_links||jsonb_build_array(lnk);
 end loop;
 -- Every target exists in this organization, on this work where the target belongs to a work.
 for lnk in select value from jsonb_array_elements(all_links) loop
  lnk_kind:=lnk->>'kind';
  if lnk_kind='source_version' then
   sv:=(lnk->>'sourceVersionId')::uuid;rv:=nullif(lnk->>'rightsVersionId','')::uuid;
   if not exists(select 1 from public.source_versions v where v.organization_id=p_org and v.id=sv)
    or (rv is not null and not exists(select 1 from private.source_rights_versions r where r.organization_id=p_org and r.source_version_id=sv and r.id=rv)) then
    raise exception 'artifact_link_target_not_found' using errcode='P0002'; end if;
   -- A projection of a legacy store carries no subject; rights are then evaluated at read time only.
   if jsonb_typeof(p_manifest->'legacy')<>'object' and (p_rights_subject is null or not private.source_use_allowed_v1(p_org,sv,p_rights_subject,'derive','analysis')) then
    raise exception 'artifact_source_use_refused' using errcode='42501'; end if;
  elsif lnk_kind='execution' then
   if not exists(select 1 from public.work_executions e where e.organization_id=p_org and e.id=(lnk->>'executionId')::uuid) then raise exception 'artifact_link_target_not_found' using errcode='P0002'; end if;
   if not exists(select 1 from public.work_executions e where e.organization_id=p_org and e.id=(lnk->>'executionId')::uuid and e.work_id=p_work) then raise exception 'artifact_link_work_mismatch' using errcode='22023'; end if;
  elsif lnk_kind='institutional_result' then
   if not exists(select 1 from private.institutional_model_results m where m.organization_id=p_org and m.id=(lnk->>'resultId')::uuid) then raise exception 'artifact_link_target_not_found' using errcode='P0002'; end if;
   if not exists(select 1 from private.institutional_model_results m where m.organization_id=p_org and m.id=(lnk->>'resultId')::uuid and m.capital_project_id=p_work) then raise exception 'artifact_link_work_mismatch' using errcode='22023'; end if;
  elsif lnk_kind='method_release' then
   if not exists(select 1 from private.platform_method_releases r where r.id=lnk->>'platformReleaseId')
    or (jsonb_typeof(lnk->'houseReleaseId')='string' and not exists(select 1 from public.method_releases h where h.organization_id=p_org and h.id=(lnk->>'houseReleaseId')::uuid))
   then raise exception 'artifact_link_target_not_found' using errcode='P0002'; end if;
  elsif lnk_kind='assumption_slot' then
   if not exists(select 1 from private.assumption_version_items i where i.organization_id=p_org and i.version_id=(lnk->>'assumptionVersionId')::uuid and i.slot_key=lnk->>'slotKey')
   then raise exception 'artifact_link_target_not_found' using errcode='P0002'; end if;
  elsif lnk_kind='artifact_revision' then
   if not exists(select 1 from public.artifact_revisions r where r.organization_id=p_org and r.id=(lnk->>'derivedFromRevisionId')::uuid) then raise exception 'artifact_link_target_not_found' using errcode='P0002'; end if;
  end if;
 end loop;
 -- Substance, as revisionSubstance of the contract: material with a block claim, a source, an
 -- execution or an institutional result; informational only for an answer of sections and
 -- paragraphs with no claim and no number; a legacy label carries the row's own evidence.
 substance:=exists(select 1 from jsonb_array_elements(blocks) b where jsonb_array_length(b.value->'claims')>0)
  or jsonb_array_length(p_manifest->'sources')>0 or jsonb_typeof(p_manifest->'execution')='object' or jsonb_typeof(p_manifest->'institutionalResult')='object'
  or jsonb_typeof(p_manifest->'legacy')='object';
 informational:=p_kind='answer' and jsonb_array_length(blocks)>0 and not exists(select 1 from jsonb_array_elements(blocks) b
  where b.value->>'kind' not in ('section','paragraph') or jsonb_array_length(b.value->'claims')>0 or private.artifact_content_carries_number_v1(b.value->'content'));
 if not (substance or informational) then raise exception 'artifact_revision_without_substance' using errcode='23514'; end if;
 -- The artifact: found and locked, or created.
 select * into a from public.artifacts x where x.organization_id=p_org and x.work_id=p_work and x.kind=p_kind and x.subject=p_subject for update;
 if not found then
  insert into public.artifacts(organization_id,work_id,kind,subject,legacy_origin)
  values(p_org,p_work,p_kind,p_subject,case when p_legacy_ref is not null then jsonb_build_object('table',p_legacy_ref->>'table','id',p_legacy_ref->>'id') end)
  on conflict on constraint artifacts_identity_key do nothing;
  select * into strict a from public.artifacts x where x.organization_id=p_org and x.work_id=p_work and x.kind=p_kind and x.subject=p_subject for update;
 end if;
 -- Replay by manifest fingerprint.
 fingerprint:=encode(extensions.digest(convert_to(p_manifest::text,'utf8'),'sha256'),'hex');
 select * into existing from public.artifact_revisions r where r.organization_id=p_org and r.manifest_fingerprint=fingerprint;
 if found then
  if existing.artifact_id<>a.id then raise exception 'artifact_revision_manifest_conflict' using errcode='23505'; end if;
  if existing.content_sha256 is distinct from p_content_sha256 or existing.byte_length is distinct from p_byte_length then
   raise exception 'artifact_revision_replay_mismatch' using errcode='23505'; end if;
  return jsonb_build_object('artifact_id',a.id,'revision_id',existing.id,'revision_no',existing.revision_no,'manifest_fingerprint',existing.manifest_fingerprint,'replayed',true);
 end if;
 select * into head from public.artifact_revisions r where r.organization_id=p_org and r.artifact_id=a.id order by r.revision_no desc limit 1;
 next_no:=coalesce(head.revision_no,0)+1;
 rev_id:=coalesce(p_revision_id,gen_random_uuid());
 insert into public.artifact_revisions(id,organization_id,artifact_id,revision_no,previous_revision_id,audience,origin,manifest,manifest_fingerprint,content_sha256,byte_length,legacy_ref,created_by)
 values(rev_id,p_org,a.id,next_no,head.id,p_audience,p_origin,p_manifest,fingerprint,p_content_sha256,p_byte_length,p_legacy_ref,p_actor);
 for blk in select value from jsonb_array_elements(blocks) loop
  blk_no:=blk_no+1;
  insert into public.artifact_blocks(organization_id,revision_id,block_no,block_key,kind,content,claims,content_fingerprint)
  values(p_org,rev_id,blk_no,blk->>'blockKey',blk->>'kind',blk->'content',blk->'claims',
   encode(extensions.digest(convert_to((blk->'content')::text,'utf8'),'sha256'),'hex'));
 end loop;
 for lnk in select value from jsonb_array_elements(all_links) loop
  lnk_block:=null;set_id:=null;
  if lnk ? 'blockKey' then select b.id into strict lnk_block from public.artifact_blocks b where b.organization_id=p_org and b.revision_id=rev_id and b.block_key=lnk->>'blockKey'; end if;
  if lnk->>'kind'='assumption_slot' then
   select i.set_id into strict set_id from private.assumption_version_items i where i.organization_id=p_org and i.version_id=(lnk->>'assumptionVersionId')::uuid and i.slot_key=lnk->>'slotKey';
  end if;
  insert into private.artifact_dependency_links(organization_id,revision_id,block_id,link_kind,source_version_id,source_rights_version_id,execution_id,institutional_result_id,
   platform_release_id,house_release_id,assumption_set_id,assumption_version_id,slot_key,derived_from_revision_id)
  values(p_org,rev_id,lnk_block,lnk->>'kind',
   case when lnk->>'kind'='source_version' then (lnk->>'sourceVersionId')::uuid end,case when lnk->>'kind'='source_version' then nullif(lnk->>'rightsVersionId','')::uuid end,
   case when lnk->>'kind'='execution' then (lnk->>'executionId')::uuid end,
   case when lnk->>'kind'='institutional_result' then (lnk->>'resultId')::uuid end,
   case when lnk->>'kind'='method_release' then lnk->>'platformReleaseId' end,case when lnk->>'kind'='method_release' and jsonb_typeof(lnk->'houseReleaseId')='string' then (lnk->>'houseReleaseId')::uuid end,
   set_id,case when lnk->>'kind'='assumption_slot' then (lnk->>'assumptionVersionId')::uuid end,case when lnk->>'kind'='assumption_slot' then lnk->>'slotKey' end,
   case when lnk->>'kind'='artifact_revision' then (lnk->>'derivedFromRevisionId')::uuid end)
  on conflict on constraint artifact_dependency_links_target_key do nothing;
 end loop;
 update public.artifacts set head_revision_id=rev_id where organization_id=p_org and id=a.id;
 return jsonb_build_object('artifact_id',a.id,'revision_id',rev_id,'revision_no',next_no,'manifest_fingerprint',fingerprint,'replayed',false);
end $$;

-- 4. Entry points. A person: signed in, an active member, with work access on the work; origin
-- person. The worker: the job capability, the job's session on the work, the declared capability
-- artifact-revision.v1; origin worker, the provenance's job and capability filled with the job, the
-- job's authorization subject for the rights of the sources. Neither may write a legacy label.
create function private.create_artifact_revision_as_person_v1(p_work uuid,p_kind text,p_subject text,p_audience text,p_manifest jsonb,p_blocks jsonb,p_links jsonb,p_content_sha256 text,p_byte_length bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();org uuid;
begin
 select p.organization_id into org from public.capital_projects p where p.id=p_work;
 if actor is null or org is null
  or not exists(select 1 from public.organization_memberships x where x.organization_id=org and x.user_id=actor and x.status='active')
  or not private.can_access_resource_v1(org,p_work,'work')
 then raise exception 'artifact_revision_forbidden' using errcode='42501'; end if;
 if jsonb_typeof(p_manifest)<>'object' then raise exception 'artifact_manifest_schema_invalid' using errcode='22023'; end if;
 if jsonb_typeof(p_manifest->'legacy')='object' then raise exception 'artifact_manifest_legacy_reserved' using errcode='22023'; end if;
 return private.create_artifact_revision_v1(org,p_work,p_kind,p_subject,p_audience,'person',p_manifest,p_blocks,p_links,p_content_sha256,p_byte_length,null,actor,actor,null,true);
end $$;
create function public.create_artifact_revision_v1(p_work uuid,p_kind text,p_subject text,p_audience text,p_manifest jsonb,p_blocks jsonb,p_links jsonb,p_content_sha256 text,p_byte_length bigint) returns jsonb
language sql security invoker set search_path='' as $$
 select private.create_artifact_revision_as_person_v1(p_work,p_kind,p_subject,p_audience,p_manifest,p_blocks,p_links,p_content_sha256,p_byte_length);
$$;

create function private.worker_create_artifact_revision_v1(p_job_id uuid,p_capability_token text,p_capability text,p_work uuid,p_kind text,p_subject text,p_audience text,p_manifest jsonb,p_blocks jsonb,p_links jsonb,p_content_sha256 text,p_byte_length bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs;m jsonb;
begin
 if p_capability is distinct from 'artifact-revision.v1' then raise exception 'artifact_revision_capability_required' using errcode='42501'; end if;
 j:=private.job_for_capability(p_job_id,p_capability_token);
 if not exists(select 1 from public.document_intake_sessions s where s.organization_id=j.organization_id and s.id=j.intake_session_id and s.capital_project_id=p_work) then
  raise exception 'artifact_work_mismatch' using errcode='42501'; end if;
 if jsonb_typeof(p_manifest)<>'object' or jsonb_typeof(p_manifest->'provenance')<>'object' then raise exception 'artifact_manifest_schema_invalid' using errcode='22023'; end if;
 if jsonb_typeof(p_manifest->'legacy')='object' then raise exception 'artifact_manifest_legacy_reserved' using errcode='22023'; end if;
 m:=jsonb_set(p_manifest,'{provenance}',(p_manifest->'provenance')||jsonb_build_object('jobId',j.id,'capability','artifact-revision.v1'));
 return private.create_artifact_revision_v1(j.organization_id,p_work,p_kind,p_subject,p_audience,'worker',m,p_blocks,p_links,p_content_sha256,p_byte_length,null,null,j.authorization_subject_id,null,true);
end $$;
create function public.worker_create_artifact_revision_v1(p_job_id uuid,p_capability_token text,p_capability text,p_work uuid,p_kind text,p_subject text,p_audience text,p_manifest jsonb,p_blocks jsonb,p_links jsonb,p_content_sha256 text,p_byte_length bigint) returns jsonb
language sql security invoker set search_path='' as $$
 select private.worker_create_artifact_revision_v1(p_job_id,p_capability_token,p_capability,p_work,p_kind,p_subject,p_audience,p_manifest,p_blocks,p_links,p_content_sha256,p_byte_length);
$$;

-- 5. Release (releaseState of the contract) and freshness (freshness of the contract), at read time.
-- Whether the dependency event of a stage 18 fact still sits in a pending update request.
create function private.dependency_event_pending_v1(p_org uuid,p_work uuid,p_event uuid) returns boolean
language sql stable security definer set search_path='' as $$
 with recursive chain(request_id,current_id,depth) as (
  select q.id,q.id,0 from public.work_continuation_requests q where q.organization_id=p_org and q.work_id=p_work and q.kind='dependency_update'
   and q.payload->'events' @> jsonb_build_array(jsonb_build_object('eventId',p_event))
  union all
  select c.request_id,q.superseded_by_request_id,c.depth+1 from chain c
  join public.work_continuation_requests q on q.organization_id=p_org and q.id=c.current_id
  where q.superseded_by_request_id is not null and c.depth<64),
 final as (
  select distinct on (c.request_id) q.status from chain c join public.work_continuation_requests q on q.organization_id=p_org and q.id=c.current_id
  order by c.request_id,c.depth desc)
 select exists(select 1 from final f where f.status not in ('adopted','declined'));
$$;

-- The head of each linked lineage: an execution replaced by a settled recompute, or with an
-- invalidation fact still pending, is no longer the head; a missing row has no head.
create function private.artifact_execution_freshness_v1(p_org uuid,p_execution uuid) returns text
language sql stable security definer set search_path='' as $$
 select case
  when not exists(select 1 from public.work_executions e where e.organization_id=p_org and e.id=p_execution) then 'unknown'
  when exists(select 1 from public.work_recompute_candidates c where c.organization_id=p_org and c.base_execution_id=p_execution and c.state='settled' and c.execution_id is not null) then 'stale'
  when exists(select 1 from private.execution_invalidations f where f.organization_id=p_org and f.execution_id=p_execution and private.dependency_event_pending_v1(p_org,f.work_id,f.event_id)) then 'stale'
  else 'current' end;
$$;

create function private.artifact_result_freshness_v1(p_org uuid,p_result uuid) returns text
language sql stable security definer set search_path='' as $$
 select case
  when not exists(select 1 from private.institutional_model_results m where m.organization_id=p_org and m.id=p_result) then 'unknown'
  when exists(select 1 from private.institutional_model_results m where m.organization_id=p_org and m.id=p_result and m.superseded_by is not null) then 'stale'
  when exists(select 1 from public.institutional_recompute_candidates c where c.organization_id=p_org and c.base_result_id=p_result and c.state='settled' and c.result_id is not null) then 'stale'
  when exists(select 1 from private.institutional_result_invalidations f where f.organization_id=p_org and f.result_id=p_result and private.dependency_event_pending_v1(p_org,f.work_id,f.event_id)) then 'stale'
  else 'current' end;
$$;

create function private.artifact_source_freshness_v1(p_org uuid,p_version uuid) returns text
language sql stable security definer set search_path='' as $$
 select case
  when v.id is null then 'unknown'
  when exists(select 1 from public.source_versions n where n.organization_id=p_org and n.source_id=v.source_id and n.version_no>v.version_no) then 'stale'
  else 'current' end
 from (select null) x left join public.source_versions v on v.organization_id=p_org and v.id=p_version;
$$;

-- Stale when any linked execution, institutional result or source version is no longer the head;
-- unknown when any head is missing; stale wins over unknown. Method releases, assumption slots and
-- derivations do not affect freshness.
create function private.artifact_revision_freshness_v1(r public.artifact_revisions) returns text
language sql stable security definer set search_path='' as $$
 with states as (
  select case l.link_kind
   when 'execution' then private.artifact_execution_freshness_v1(r.organization_id,l.execution_id)
   when 'institutional_result' then private.artifact_result_freshness_v1(r.organization_id,l.institutional_result_id)
   when 'source_version' then private.artifact_source_freshness_v1(r.organization_id,l.source_version_id) end as state
  from private.artifact_dependency_links l where l.organization_id=r.organization_id and l.revision_id=r.id
   and l.link_kind in ('execution','institutional_result','source_version'))
 select case when exists(select 1 from states where state='stale') then 'stale'
  when exists(select 1 from states where state='unknown') then 'unknown' else 'current' end;
$$;

-- The approval facts that exist today, each tied to the exact version it approved (revisionFingerprints
-- and factCoversRevision of the contract): a confirm decision or an approved package review naming the
-- manifest fingerprint, the content sha256 or the legacy fingerprint; an established institutional
-- result the manifest names; a committed receipt of the execution and result fingerprint the manifest
-- names. External audience: released only when approved, otherwise blocked; internal and advisor:
-- internal until approved, released after.
create function private.artifact_revision_release_v1(r public.artifact_revisions) returns text
language plpgsql stable security definer set search_path='' as $$
declare fps text[]:=array_remove(array[r.manifest_fingerprint,r.content_sha256,r.legacy_ref->>'fingerprint'],null);approved boolean;
begin
 approved:=exists(select 1 from public.capital_project_artifact_decisions d where d.organization_id=r.organization_id and d.decision='confirm' and d.artifact_fingerprint=any(fps))
  or exists(select 1 from public.deal_state_objects pr cross join unnest(fps) f where pr.organization_id=r.organization_id and pr.object_type='package_review' and pr.status='approved'
   and pr.dependencies @> jsonb_build_array(jsonb_build_object('objectType','material_artifact','objectFingerprint',f)))
  or (jsonb_typeof(r.manifest->'institutionalResult')='object' and exists(select 1 from private.institutional_model_results m
   where m.organization_id=r.organization_id and m.id=(r.manifest#>>'{institutionalResult,id}')::uuid and m.status='completed' and m.superseded_by is null
    and private.institutional_result_established_v1(m.organization_id,m.id)))
  or (jsonb_typeof(r.manifest->'execution')='object' and exists(select 1 from private.execution_result_receipts x
   where x.organization_id=r.organization_id and x.execution_id=(r.manifest#>>'{execution,executionId}')::uuid and x.result_fingerprint=r.manifest#>>'{execution,resultFingerprint}'));
 return case when approved then 'released' when r.audience='external' then 'blocked' else 'internal' end;
end $$;

-- The exact reader: the work's read access or artifact_revision_not_found, never an existence leak.
-- The sources a reader must be allowed to use are the revision's and those of every revision it
-- derives from (derivedSourceRequirements of the contract); a refused source, an ancestor that cannot
-- be resolved, or an external audience not released withholds the manifest and the blocks and says
-- why. Identity, fingerprints, links, release and freshness always return.
create function private.read_artifact_revision_v1(p_revision uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();r public.artifact_revisions;a public.artifacts;rel text;fresh text;restricted uuid[];unresolved uuid[];blocks jsonb;links jsonb;withheld boolean;restriction jsonb;
begin
 select * into r from public.artifact_revisions x where x.id=p_revision;
 if actor is null or r.id is null then raise exception 'artifact_revision_not_found' using errcode='P0002'; end if;
 select * into a from public.artifacts x where x.organization_id=r.organization_id and x.id=r.artifact_id;
 if not private.can_access_capital_project(a.organization_id,a.work_id) then raise exception 'artifact_revision_not_found' using errcode='P0002'; end if;
 with recursive ancestry(revision_id,depth) as (
  select r.id,0
  union
  select l.derived_from_revision_id,c.depth+1 from ancestry c join private.artifact_dependency_links l on l.organization_id=r.organization_id and l.revision_id=c.revision_id
  where l.link_kind='artifact_revision' and c.depth<64),
 sources as (
  select l.id,l.source_version_id from ancestry c join private.artifact_dependency_links l on l.organization_id=r.organization_id and l.revision_id=c.revision_id
  where l.link_kind='source_version'),
 missing as (
  select c.revision_id from ancestry c where not exists(select 1 from public.artifact_revisions x where x.organization_id=r.organization_id and x.id=c.revision_id))
 select coalesce((select array_agg(s.id order by s.id) from sources s where not private.source_use_allowed_v1(r.organization_id,s.source_version_id,actor,'read','analysis')),'{}'::uuid[]),
  coalesce((select array_agg(m.revision_id order by m.revision_id) from missing m),'{}'::uuid[]) into restricted,unresolved;
 rel:=private.artifact_revision_release_v1(r);
 fresh:=private.artifact_revision_freshness_v1(r);
 restriction:=case when cardinality(restricted)>0 or cardinality(unresolved)>0
  then jsonb_build_object('kind','source_rights','linkIds',to_jsonb(restricted),'unresolvedRevisionIds',to_jsonb(unresolved))
  when rel='blocked' then jsonb_build_object('kind','release','release',rel) end;
 withheld:=restriction is not null;
 select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'blockNo',b.block_no,'blockKey',b.block_key,'kind',b.kind,'content',b.content,'claims',b.claims,'contentFingerprint',b.content_fingerprint) order by b.block_no),'[]'::jsonb)
  into blocks from public.artifact_blocks b where b.organization_id=r.organization_id and b.revision_id=r.id;
 select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'kind',l.link_kind,'blockId',l.block_id) order by l.link_kind,l.id),'[]'::jsonb)
  into links from private.artifact_dependency_links l where l.organization_id=r.organization_id and l.revision_id=r.id;
 return jsonb_build_object('schemaVersion','artifact-read.2026.09.26-v1',
  'artifact',jsonb_build_object('id',a.id,'workId',a.work_id,'kind',a.kind,'subject',a.subject,'headRevisionId',a.head_revision_id,'legacyOrigin',a.legacy_origin,'createdAt',a.created_at),
  'revision',jsonb_build_object('id',r.id,'revisionNo',r.revision_no,'previousRevisionId',r.previous_revision_id,'audience',r.audience,'origin',r.origin,
   'manifest',case when withheld then null else r.manifest end,'manifestFingerprint',r.manifest_fingerprint,'contentSha256',r.content_sha256,'byteLength',r.byte_length,
   'legacyRef',r.legacy_ref,'createdBy',r.created_by,'createdAt',r.created_at),
  'isHead',a.head_revision_id=r.id,
  'blocks',case when withheld then '[]'::jsonb else blocks end,
  'links',links,
  'release',rel,'freshness',fresh,
  'restriction',restriction);
end $$;
create function public.read_artifact_revision_v1(p_revision_id uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.read_artifact_revision_v1(p_revision_id); $$;

-- The current one, for the routes that resolve "the current" revision: the head pointer decides,
-- never the newest by date, and the evaluation is the exact reader's.
create function private.read_artifact_head_v1(p_work uuid,p_kind text,p_subject text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.artifacts;
begin
 select * into a from public.artifacts x where x.work_id=p_work and x.kind=p_kind and x.subject=p_subject;
 if auth.uid() is null or a.id is null or a.head_revision_id is null or not private.can_access_capital_project(a.organization_id,a.work_id) then
  raise exception 'artifact_revision_not_found' using errcode='P0002'; end if;
 return private.read_artifact_revision_v1(a.head_revision_id);
end $$;
create function public.read_artifact_head_v1(p_work_id uuid,p_kind text,p_subject text) returns jsonb
language sql security invoker set search_path='' as $$ select private.read_artifact_head_v1(p_work_id,p_kind,p_subject); $$;

-- 6. Projection of the legacy stores (legacyProjection of the contract). Every projected revision
-- has audience internal, provenance producer legacy:<table>, the row's fingerprint verbatim, its
-- evidence as key and value pairs, no bytes and no link the row does not carry; a completed
-- institutional result names itself as the institutional result. Origin: legacy under the backfill
-- flag (set local offroad.artifact_backfill = on), otherwise the kind of the row's writer.
create function private.artifact_projection_origin_v1(p_created_by_kind text,p_created_by uuid) returns text
language sql stable security definer set search_path='' as $$
 select case
  when current_setting('offroad.artifact_backfill',true)='on' then 'legacy'
  when p_created_by_kind='worker' then 'worker'
  when p_created_by_kind='user' then 'person'
  when p_created_by is not null and exists(select 1 from private.worker_tokens t where t.execution_account_user_id=p_created_by) then 'worker'
  when p_created_by is not null then 'person'
  else 'worker' end;
$$;

create function private.artifact_projection_revision_id_v1(p_table text,p_row uuid) returns uuid
language sql immutable set search_path='' as $$
 select extensions.uuid_generate_v5(extensions.uuid_ns_url(),'offroad:artifact-revision:'||p_table||':'||p_row::text);
$$;

-- One evidence pair, or none when the value is null (the contract's evidence helper).
create function private.artifact_evidence_v1(p_key text,p_value text) returns jsonb
language sql immutable set search_path='' as $$
 select case when p_value is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('key',p_key,'value',left(p_value,2000))) end;
$$;

-- Projects one legacy row; returns 1 when a revision was written and 0 when already projected.
create function private.project_legacy_artifact_revision_v1(p_table text,p_org uuid,p_row uuid) returns integer
language plpgsql security definer set search_path='' as $$
declare
 hex text:='^[a-f0-9]{64}$';
 origin text;work uuid;subject text;kind text;fmt text;fingerprint text;evidence jsonb;manifest jsonb;legacy jsonb;rev_id uuid;actor uuid;
 provenance jsonb;result jsonb;
 cpa public.capital_project_artifacts;cam public.case_artifact_manifests;imr private.institutional_model_results;dso public.deal_state_objects;active jsonb;
begin
 rev_id:=private.artifact_projection_revision_id_v1(p_table,p_row);
 if exists(select 1 from public.artifact_revisions r where r.id=rev_id) then return 0; end if;
 if p_table='capital_project_artifacts' then
  select * into cpa from public.capital_project_artifacts x where x.organization_id=p_org and x.id=p_row;
  if cpa.id is null then raise exception 'artifact_projection_source_unknown' using errcode='P0002'; end if;
  work:=cpa.capital_project_id;kind:='work_product';fmt:='json';subject:=cpa.artifact_type;fingerprint:=cpa.artifact_fingerprint;
  origin:=private.artifact_projection_origin_v1(cpa.created_by_kind,cpa.created_by);actor:=case when origin='person' then cpa.created_by end;
  provenance:=jsonb_build_object('producer','legacy:'||p_table,'jobId',cpa.processing_job_id,'taskRunId',cpa.task_run_id,'messageId',null,'capability',null);
  evidence:=private.artifact_evidence_v1('capital_project_id',cpa.capital_project_id::text)||private.artifact_evidence_v1('plan_id',cpa.plan_id::text)
   ||private.artifact_evidence_v1('artifact_type',cpa.artifact_type)||private.artifact_evidence_v1('schema_version',cpa.schema_version)
   ||private.artifact_evidence_v1('artifact_version',cpa.artifact_version::text)||private.artifact_evidence_v1('status',cpa.status)
   ||private.artifact_evidence_v1('input_fingerprint',cpa.input_fingerprint)||private.artifact_evidence_v1('created_by_kind',cpa.created_by_kind)
   ||private.artifact_evidence_v1('evidence_ref_count',jsonb_array_length(private.jsonb_array_or_empty_v1(cpa.evidence_refs))::text)
   ||private.artifact_evidence_v1('dependency_count',jsonb_array_length(private.jsonb_array_or_empty_v1(cpa.dependencies))::text);
 elsif p_table='case_artifact_manifests' then
  select * into cam from public.case_artifact_manifests x where x.organization_id=p_org and x.id=p_row;
  if cam.id is null then raise exception 'artifact_projection_source_unknown' using errcode='P0002'; end if;
  select s.capital_project_id into work from public.document_intake_sessions s where s.organization_id=p_org and s.id=cam.intake_session_id;
  if work is null then raise exception 'artifact_projection_source_unknown' using errcode='P0002'; end if;
  kind:='work_product';fmt:='json';subject:='case-snapshot:'||cam.intake_session_id::text;fingerprint:=cam.manifest_fingerprint;
  origin:=private.artifact_projection_origin_v1(null,cam.created_by);actor:=case when origin='person' then cam.created_by end;
  provenance:=jsonb_build_object('producer','legacy:'||p_table,'jobId',null,'taskRunId',null,'messageId',null,'capability',null);
  evidence:=private.artifact_evidence_v1('intake_session_id',cam.intake_session_id::text)||private.artifact_evidence_v1('processing_run_id',cam.processing_run_id::text)
   ||private.artifact_evidence_v1('schema_version',cam.schema_version)||private.artifact_evidence_v1('locale',cam.locale)
   ||private.artifact_evidence_v1('input_fingerprint',cam.input_fingerprint)||private.artifact_evidence_v1('run_id',cam.manifest->>'runId')
   ||coalesce((select jsonb_agg(jsonb_build_object('key','output','value',left(coalesce(o->>'kind','')||':'||coalesce(o->>'artifactId','')||':'||coalesce(o->>'sha256',''),2000)))
    from jsonb_array_elements(private.jsonb_array_or_empty_v1(cam.manifest->'outputs')) o where jsonb_typeof(o)='object'),'[]'::jsonb)
   ||coalesce((select jsonb_agg(jsonb_build_object('key','source_document','value',left(coalesce(s->>'documentId','')||':'||coalesce(s->>'versionId','')||':'||coalesce(s->>'sha256','unverified'),2000)))
    from jsonb_array_elements(private.jsonb_array_or_empty_v1(cam.manifest->'sources')) s where jsonb_typeof(s)='object'),'[]'::jsonb);
 elsif p_table='institutional_model_results' then
  select * into imr from private.institutional_model_results x where x.organization_id=p_org and x.id=p_row;
  if imr.id is null then raise exception 'artifact_projection_source_unknown' using errcode='P0002'; end if;
  if imr.status<>'completed' or imr.artifact is null or coalesce(imr.artifact->>'fingerprint','') !~ hex then return 0; end if;
  work:=imr.capital_project_id;kind:='model_result';fmt:='xlsx';subject:='institutional-workbook';fingerprint:=imr.artifact->>'fingerprint';
  origin:=private.artifact_projection_origin_v1('worker',null);actor:=null;
  provenance:=jsonb_build_object('producer','legacy:'||p_table,'jobId',null,'taskRunId',null,'messageId',imr.id,'capability',null);
  result:=jsonb_build_object('id',imr.id,'configurationFingerprint',imr.configuration_fingerprint);
  select x into active from jsonb_array_elements(private.jsonb_array_or_empty_v1(imr.artifact#>'{institutional,scenarios}')) x
   where jsonb_typeof(x)='object' and x->>'configurationId'=imr.artifact#>>'{institutional,activeScenarioId}' limit 1;
  evidence:=private.artifact_evidence_v1('capital_project_id',imr.capital_project_id::text)||private.artifact_evidence_v1('intake_session_id',imr.intake_session_id::text)
   ||private.artifact_evidence_v1('configuration_id',imr.configuration_id::text)||private.artifact_evidence_v1('configuration_fingerprint',imr.configuration_fingerprint)
   ||private.artifact_evidence_v1('source_manifest_fingerprint',imr.source_manifest_fingerprint)||private.artifact_evidence_v1('artifact_version',imr.artifact->>'version')
   ||private.artifact_evidence_v1('active_scenario_id',imr.artifact#>>'{institutional,activeScenarioId}')||private.artifact_evidence_v1('output_fingerprint',active->>'outputFingerprint')
   ||private.artifact_evidence_v1('source_binding_count',case when active is not null then jsonb_array_length(private.jsonb_array_or_empty_v1(active->'sourceBindings'))::text end)
   ||private.artifact_evidence_v1('workbook_sha256_pt',imr.artifact#>>'{workbooks,pt,sha256}')||private.artifact_evidence_v1('workbook_byte_size_pt',imr.artifact#>>'{workbooks,pt,byteSize}')
   ||private.artifact_evidence_v1('workbook_sha256_en',imr.artifact#>>'{workbooks,en,sha256}')||private.artifact_evidence_v1('workbook_byte_size_en',imr.artifact#>>'{workbooks,en,byteSize}');
 elsif p_table='deal_state_objects' then
  select * into dso from public.deal_state_objects x where x.organization_id=p_org and x.id=p_row;
  if dso.id is null then raise exception 'artifact_projection_source_unknown' using errcode='P0002'; end if;
  if dso.object_type<>'material_artifact' then return 0; end if;
  select s.capital_project_id into work from public.document_intake_sessions s where s.organization_id=p_org and s.id=dso.intake_session_id;
  if work is null then raise exception 'artifact_projection_source_unknown' using errcode='P0002'; end if;
  kind:='material';fmt:='json';subject:='materials:'||dso.intake_session_id::text;fingerprint:=dso.object_fingerprint;
  origin:=private.artifact_projection_origin_v1(dso.created_by_kind,dso.created_by);actor:=case when origin='person' then dso.created_by end;
  provenance:=jsonb_build_object('producer','legacy:'||p_table,'jobId',null,'taskRunId',null,'messageId',null,'capability',null);
  evidence:=private.artifact_evidence_v1('intake_session_id',dso.intake_session_id::text)||private.artifact_evidence_v1('object_version',dso.object_version::text)
   ||private.artifact_evidence_v1('status',dso.status)||private.artifact_evidence_v1('input_fingerprint',dso.input_fingerprint)
   ||coalesce((select jsonb_agg(jsonb_build_object('key','depends_on','value',left(coalesce(d->>'objectType','')||':'||coalesce(d->>'objectFingerprint',''),2000)))
    from jsonb_array_elements(private.jsonb_array_or_empty_v1(dso.dependencies)) d where jsonb_typeof(d)='object'),'[]'::jsonb)
   ||coalesce((select jsonb_agg(jsonb_build_object('key','material','value',left(coalesce(m->>'kind','')||':'||coalesce(m->>'artifactFingerprint','unpinned'),2000)))
    from jsonb_array_elements(private.jsonb_array_or_empty_v1(dso.payload->'materials')) m where jsonb_typeof(m)='object'),'[]'::jsonb)
   ||private.artifact_evidence_v1('financial_model_fingerprint',dso.payload#>>'{financialModel,fingerprint}')
   ||private.artifact_evidence_v1('workbook_sha256_pt',dso.payload#>>'{financialModel,workbooks,pt,sha256}')||private.artifact_evidence_v1('workbook_byte_size_pt',dso.payload#>>'{financialModel,workbooks,pt,byteSize}')
   ||private.artifact_evidence_v1('workbook_sha256_en',dso.payload#>>'{financialModel,workbooks,en,sha256}')||private.artifact_evidence_v1('workbook_byte_size_en',dso.payload#>>'{financialModel,workbooks,en,byteSize}');
 else
  raise exception 'artifact_projection_source_unknown' using errcode='P0002';
 end if;
 -- The contract caps the evidence at 200 pairs; a longer list keeps its first 199 and says so.
 if jsonb_array_length(evidence)>200 then
  evidence:=(select jsonb_agg(e.value order by e.ordinality) from jsonb_array_elements(evidence) with ordinality e where e.ordinality<=199)
   ||jsonb_build_array(jsonb_build_object('key','evidence_truncated','value',jsonb_array_length(evidence)::text));
 end if;
 legacy:=jsonb_build_object('table',p_table,'id',p_row,'fingerprint',fingerprint,'evidence',evidence);
 manifest:=jsonb_build_object('schemaVersion','artifact-manifest.2026.09.26-v1','kind',kind,'audience','internal','format',fmt,
  'bytes',null,'method',null,'execution',null,'inputSnapshot',null,'institutionalResult',result,
  'sources','[]'::jsonb,'claims','[]'::jsonb,'traces','[]'::jsonb,'template',null,'provenance',provenance,'legacy',legacy);
 perform private.create_artifact_revision_v1(p_org,work,kind,subject,'internal',origin,manifest,'[]'::jsonb,'[]'::jsonb,null,null,legacy,actor,null,rev_id,false);
 return 1;
end $$;

create function private.project_artifact_revision_trigger_v1() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 -- A field of one store is referenced only for that store: plpgsql resolves record fields per expression.
 if tg_table_name='deal_state_objects' then
  if new.object_type<>'material_artifact' then return null; end if;
 elsif tg_table_name='institutional_model_results' then
  if new.status<>'completed' then return null; end if;
  if tg_op='UPDATE' then
   if old.status='completed' then return null; end if;
  end if;
 end if;
 perform private.project_legacy_artifact_revision_v1(tg_table_name,new.organization_id,new.id);
 return null;
end $$;
create trigger artifact_revision_projection after insert on public.capital_project_artifacts for each row execute function private.project_artifact_revision_trigger_v1();
create trigger artifact_revision_projection after insert on public.case_artifact_manifests for each row execute function private.project_artifact_revision_trigger_v1();
create trigger artifact_revision_projection after insert or update of status on private.institutional_model_results for each row execute function private.project_artifact_revision_trigger_v1();
create trigger artifact_revision_projection after insert on public.deal_state_objects for each row execute function private.project_artifact_revision_trigger_v1();

-- 7. Backfill: every existing row of the four stores, in version order, as legacy revisions.
-- Idempotent: a row already projected adds nothing.
create function private.backfill_artifact_revisions_v1() returns jsonb
language plpgsql security definer set search_path='' as $$
declare r record;n1 integer:=0;n2 integer:=0;n3 integer:=0;n4 integer:=0;
begin
 perform set_config('offroad.artifact_backfill','on',true);
 for r in select organization_id,id from public.capital_project_artifacts order by organization_id,capital_project_id,artifact_type,artifact_version,created_at,id loop
  n1:=n1+private.project_legacy_artifact_revision_v1('capital_project_artifacts',r.organization_id,r.id);
 end loop;
 for r in select organization_id,id from public.case_artifact_manifests order by organization_id,intake_session_id,created_at,id loop
  n2:=n2+private.project_legacy_artifact_revision_v1('case_artifact_manifests',r.organization_id,r.id);
 end loop;
 for r in select organization_id,id from private.institutional_model_results where status='completed' order by organization_id,capital_project_id,created_at,id loop
  n3:=n3+private.project_legacy_artifact_revision_v1('institutional_model_results',r.organization_id,r.id);
 end loop;
 for r in select organization_id,id from public.deal_state_objects where object_type='material_artifact' order by organization_id,intake_session_id,object_version,id loop
  n4:=n4+private.project_legacy_artifact_revision_v1('deal_state_objects',r.organization_id,r.id);
 end loop;
 perform set_config('offroad.artifact_backfill','off',true);
 return jsonb_build_object('capitalProjectArtifacts',n1,'caseArtifactManifests',n2,'institutionalModelResults',n3,'dealStateMaterials',n4);
end $$;

-- 8. The worker capability, by text patch with a unique needle, as 6A did for the recompute health.
do $patch$
declare body text;needle text:='"dependency-recompute.v1","dependency-recompute-health.v1"]''::jsonb';
begin
 body:=pg_get_functiondef('public.worker_runtime_schema_contract_v1()'::regprocedure);
 if (length(body)-length(replace(body,needle,'')))/length(needle)<>1 or position('artifact-revision.v1' in body)>0 then
  raise exception 'artifact_revision_capability_contract_changed';
 end if;
 execute replace(body,needle,'"dependency-recompute.v1","dependency-recompute-health.v1","artifact-revision.v1"]''::jsonb');
end $patch$;

-- 9. Grants: the four entry points to authenticated only, behind their own checks; the policy
-- predicates to authenticated, as the project predicate they wrap; everything else to nobody.
do $$ declare f record;begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='private' and p.proname in ('reject_artifact_history_mutation_v1','guard_artifact_identity_v1','artifact_readable_v1','artifact_revision_readable_v1',
  'jsonb_array_or_empty_v1','validate_artifact_manifest_v1','validate_artifact_claims_v1','artifact_content_carries_number_v1','artifact_source_rights_pin_v1','create_artifact_revision_v1',
  'create_artifact_revision_as_person_v1','worker_create_artifact_revision_v1','dependency_event_pending_v1','artifact_execution_freshness_v1',
  'artifact_result_freshness_v1','artifact_source_freshness_v1','artifact_revision_freshness_v1','artifact_revision_release_v1','read_artifact_revision_v1',
  'read_artifact_head_v1','artifact_projection_origin_v1','artifact_projection_revision_id_v1','artifact_evidence_v1','project_legacy_artifact_revision_v1',
  'project_artifact_revision_trigger_v1','backfill_artifact_revisions_v1')
 loop execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);end loop;
end $$;
revoke all on function public.create_artifact_revision_v1(uuid,text,text,text,jsonb,jsonb,jsonb,text,bigint) from public,anon,authenticated,service_role;
revoke all on function public.worker_create_artifact_revision_v1(uuid,text,text,uuid,text,text,text,jsonb,jsonb,jsonb,text,bigint) from public,anon,authenticated,service_role;
revoke all on function public.read_artifact_revision_v1(uuid) from public,anon,authenticated,service_role;
revoke all on function public.read_artifact_head_v1(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function private.artifact_readable_v1(uuid,uuid),private.artifact_revision_readable_v1(uuid,uuid) to authenticated;
grant execute on function private.create_artifact_revision_as_person_v1(uuid,text,text,text,jsonb,jsonb,jsonb,text,bigint),
 public.create_artifact_revision_v1(uuid,text,text,text,jsonb,jsonb,jsonb,text,bigint),
 private.worker_create_artifact_revision_v1(uuid,text,text,uuid,text,text,text,jsonb,jsonb,jsonb,text,bigint),
 public.worker_create_artifact_revision_v1(uuid,text,text,uuid,text,text,text,jsonb,jsonb,jsonb,text,bigint),
 private.read_artifact_revision_v1(uuid),public.read_artifact_revision_v1(uuid),
 private.read_artifact_head_v1(uuid,text,text),public.read_artifact_head_v1(uuid,text,text) to authenticated;

-- 10. Backfill of the existing rows, as legacy revisions.
do $backfill$
declare counts jsonb;
begin
 counts:=private.backfill_artifact_revisions_v1();
 raise notice 'artifact revision backfill: % capital project artifacts, % case artifact manifests, % institutional model results, % deal state materials',
  counts->>'capitalProjectArtifacts',counts->>'caseArtifactManifests',counts->>'institutionalModelResults',counts->>'dealStateMaterials';
end $backfill$;

comment on table public.artifacts is 'One output of a work: organization, work, kind (answer, material, workbook, model_result, work_product, execution_result, presentation, document) and subject; legacy_origin names the legacy store and row that created it; head_revision_id points to the current revision and is written only by the command. Readable by whoever can read the work; no client insert, update or delete.';
comment on table public.artifact_revisions is 'Immutable, numbered revisions of an artifact: audience, origin (worker, person, legacy), the manifest validated by private.validate_artifact_manifest_v1 with the shape and rule names of packages/domain-contracts/src/artifact-protocol.ts, its fingerprint as sha256 of the jsonb text computed in SQL, the sha256 and length of the bytes when there are bytes, and legacy_ref, the legacy label of the manifest verbatim (store, row, the row''s own fingerprint, evidence pairs). Written only by private.create_artifact_revision_v1.';
comment on table public.artifact_blocks is 'Immutable blocks of a revision: order, a block_key stable across revisions, kind (section, paragraph, table, chart, number, cell_region), content, the claims {claimId, kind, value, unit, period, supportIds} it carries and the content fingerprint computed in SQL.';
comment on table private.artifact_dependency_links is 'Anchors of a revision (or one of its blocks) to the canonical graph: a source version with the rights version the producer pinned (null when it pinned none), an execution, an institutional result, a method release, an assumption slot or the revision it derives from. Revision-level links are the manifest''s; exactly one target per row; immutable; closed to every client role. Inherited restriction is evaluated at read time by source_use_allowed_v1, never copied.';
comment on function public.create_artifact_revision_v1(uuid,text,text,text,jsonb,jsonb,jsonb,text,bigint) is 'A person writes a revision: signed in, active member, work access on the work; origin person. The manifest is validated in SQL, the same manifest replays, a revision without claim, source, execution or institutional result is refused unless it is an informational answer.';
comment on function public.worker_create_artifact_revision_v1(uuid,text,text,uuid,text,text,text,jsonb,jsonb,jsonb,text,bigint) is 'The worker writes a revision through the job capability, on the work of the job''s session, under the declared capability artifact-revision.v1; origin worker, the provenance''s job and capability filled with the job.';
comment on function public.read_artifact_revision_v1(uuid) is 'The exact revision with its artifact, blocks, links (ids and kinds), release (internal, released, blocked) and freshness (current, stale, unknown). Refused as artifact_revision_not_found without the work''s read access. A source the reader cannot use (on the revision or on a revision it derives from), or an external audience not released, withholds the manifest and the blocks and reports the restriction.';
comment on function public.read_artifact_head_v1(uuid,text,text) is 'The current revision of the artifact of a work, kind and subject, through the same reader as the exact revision.';
