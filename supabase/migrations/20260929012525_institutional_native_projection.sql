-- Stage 20 / 3H: complete rights pairs and an atomic native institutional projection.
set search_path='';

create table private.institutional_native_bindings (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 work_id uuid not null, result_id uuid not null, snapshot_id uuid not null,
 revision_id uuid not null, ancestor_revision_id uuid not null,
 closure jsonb not null, closure_fingerprint text not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,id), unique(organization_id,result_id), unique(organization_id,revision_id),
 foreign key(organization_id,work_id) references public.capital_projects(organization_id,id),
 foreign key(organization_id,result_id) references private.institutional_model_results(organization_id,id),
 foreign key(organization_id,snapshot_id) references private.institutional_input_snapshots(organization_id,id),
 foreign key(organization_id,revision_id) references public.artifact_revisions(organization_id,id),
 foreign key(organization_id,ancestor_revision_id) references public.artifact_revisions(organization_id,id),
 check(jsonb_typeof(closure)='object' and closure->>'state'='closed'
  and closure_fingerprint=encode(extensions.digest(convert_to(closure::text,'utf8'),'sha256'),'hex'))
);
create index institutional_native_work_idx on private.institutional_native_bindings(organization_id,work_id);
create index institutional_native_snapshot_idx on private.institutional_native_bindings(organization_id,snapshot_id);
create index institutional_native_ancestor_idx on private.institutional_native_bindings(organization_id,ancestor_revision_id);
alter table private.institutional_native_bindings enable row level security;
alter table private.institutional_native_bindings force row level security;
create policy institutional_native_deny_select on private.institutional_native_bindings for select to authenticated using(false);
create policy institutional_native_deny_insert on private.institutional_native_bindings for insert to authenticated with check(false);
create policy institutional_native_deny_update on private.institutional_native_bindings for update to authenticated using(false) with check(false);
create policy institutional_native_deny_delete on private.institutional_native_bindings for delete to authenticated using(false);
revoke all on private.institutional_native_bindings from public,anon,authenticated,service_role;
create trigger institutional_native_immutable before update or delete on private.institutional_native_bindings for each row execute function private.reject_review_history_mutation_v1();
create trigger institutional_native_no_truncate before truncate on private.institutional_native_bindings for each statement execute function private.reject_review_history_mutation_v1();
create trigger institutional_native_updated before update on private.institutional_native_bindings for each row execute function private.set_updated_at();
create trigger institutional_native_audit after insert on private.institutional_native_bindings for each row execute function private.capture_audit_event();

-- This relation, not a caller-controlled producer string, identifies the new representation.
create function private.institutional_native_ancestry_v1(p_org uuid,p_revision uuid) returns setof private.institutional_native_bindings
language sql stable security definer set search_path='' as $$
 with recursive ancestors(id) as (
  select p_revision union select l.derived_from_revision_id from ancestors a
   join private.artifact_dependency_links l on l.organization_id=p_org and l.revision_id=a.id and l.link_kind='artifact_revision'
 ) select distinct b.* from ancestors a join private.institutional_native_bindings b
  on b.organization_id=p_org and (b.revision_id=a.id or b.ancestor_revision_id=a.id);
$$;
revoke all on function private.institutional_native_ancestry_v1(uuid,uuid) from public,anon,authenticated,service_role;

create function private.institutional_native_read_allowed_v1(p_org uuid,p_revision uuid,p_actor uuid) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare b private.institutional_native_bindings;pin jsonb;r private.source_rights_versions;deadline timestamptz;current_until timestamptz;policy_until timestamptz;started_at timestamptz:=clock_timestamp();pins jsonb:='[]';
begin
 if not exists(select 1 from private.institutional_native_ancestry_v1(p_org,p_revision)) then return true;end if;
 -- Match authority writers: fresh policy reads occur after their transaction ends.
 -- NOWAIT avoids an account/policy inversion when called inside a review command.
 perform 1 from auth.users where id=p_actor and deleted_at is null and (banned_until is null or banned_until<=clock_timestamp()) for share nowait;
 if not found then return false;end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('resource-policy:'||p_org::text,0));
 for b in select * from private.institutional_native_ancestry_v1(p_org,p_revision) loop
  if not private.evaluate_resource_policy_v1(p_org,b.work_id,p_actor,'read','analysis') then return false;end if;
  if b.closure_fingerprint is distinct from encode(extensions.digest(convert_to(b.closure::text,'utf8'),'sha256'),'hex')
   or b.closure->>'state' is distinct from 'closed' or jsonb_typeof(b.closure->'sources') is distinct from 'array' then return false;end if;
  pins:=pins||(b.closure->'sources');
  for pin in select value from jsonb_array_elements(b.closure->'sources') loop
   select rr.* into r from private.source_rights_versions rr join public.source_versions v
    on (v.organization_id,v.id)=(rr.organization_id,rr.source_version_id)
    where rr.organization_id=p_org and rr.id=(pin->>'rightsVersionId')::uuid
     and rr.source_version_id=(pin->>'sourceVersionId')::uuid and v.declared_sha256=pin->>'declaredSha256';
   if r.id is null or not (array['read','store']::text[] <@ r.operations) or not ('analysis'=any(r.purposes))
    or r.valid_from>clock_timestamp() or r.expires_at<=clock_timestamp() or r.store_until<=clock_timestamp()
    or not private.source_use_allowed_v1(p_org,r.source_version_id,p_actor,'read','analysis')
    or not private.source_use_allowed_v1(p_org,r.source_version_id,p_actor,'store','analysis') then return false;end if;
   deadline:=least(deadline,r.expires_at,r.store_until);
  end loop;
 end loop;
 with recursive dependencies(id) as (
  select distinct (value->>'sourceVersionId')::uuid from jsonb_array_elements(pins)
  union select d.source_version_id from dependencies g join private.resource_dependencies d
   on d.organization_id=p_org and d.derived_version_id=g.id
 ), all_rights as (
  select latest.expires_at,latest.store_until from dependencies g
   cross join lateral(select rr.expires_at,rr.store_until from private.source_rights_versions rr
    where rr.organization_id=p_org and rr.source_version_id=g.id order by rr.revision desc limit 1) latest
  union all select rr.expires_at,rr.store_until from dependencies g
   join private.resource_dependencies d on d.organization_id=p_org and d.derived_version_id=g.id
   join private.source_rights_versions rr on (rr.organization_id,rr.id)=(d.organization_id,d.source_rights_version_id)
 ) select min(least(expires_at,store_until)) into current_until from all_rights;
 -- No wall-clock transition affecting this principal may occur unnoticed during evaluation.
 -- Include future group memberships/denies. A transition on an unrelated resource can cause
 -- a conservative refusal for this call only; the next call evaluates the new policy state.
 with principal as (select id from private.principals where organization_id=p_org and user_id=p_actor and kind='human'),
 potential_groups as (select m.group_id from private.access_group_memberships m join principal p on p.id=m.principal_id where m.organization_id=p_org and m.revoked_at is null),
 transitions as (
  select g.valid_from,g.expires_at from private.resource_access_grants g where g.organization_id=p_org and g.revoked_at is null
   and (g.subject_user_id=p_actor or g.subject_group_id in(select group_id from potential_groups))
  union all select m.valid_from,m.expires_at from private.barrier_memberships m where m.organization_id=p_org and m.revoked_at is null
   and (m.principal_id in(select id from principal) or m.group_id in(select group_id from potential_groups))
  union all select m.valid_from,m.expires_at from private.access_group_memberships m where m.organization_id=p_org and m.revoked_at is null and m.principal_id in(select id from principal)
 ) select min(t) into policy_until from transitions cross join lateral unnest(array[valid_from,expires_at]) t where t>started_at;

 if least(deadline,current_until,policy_until)<=clock_timestamp() then return false;end if;
 return true;
exception when lock_not_available then return false;
end $$;
revoke all on function private.institutional_native_read_allowed_v1(uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function private.institutional_native_blocks_v1(p_artifact jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_array(jsonb_build_object('blockKey','workbook','kind','section','claims','[]'::jsonb,
  'content',jsonb_build_object('workbook',jsonb_set(p_artifact,'{institutional}',(p_artifact->'institutional')-'scenarios'))))
  ||coalesce((select jsonb_agg(jsonb_build_object('blockKey','scenario:'||(s->>'configurationId'),'kind','section',
   'content',jsonb_build_object('scenario',s),'claims','[]'::jsonb) order by n)
   from jsonb_array_elements(p_artifact#>'{institutional,scenarios}') with ordinality x(s,n)),'[]');
$$;
revoke all on function private.institutional_native_blocks_v1(jsonb) from public,anon,authenticated,service_role;

create function private.project_institutional_native_result_v1(p_job uuid,p_capability text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare proof jsonb;final_proof jsonb;r private.institutional_model_results;a public.artifact_revisions;
 b private.institutional_native_bindings;receipt private.review_basis_receipts;reference jsonb;manifest jsonb;projected jsonb;
 sources jsonb;blocks jsonb;rev uuid;org uuid;work uuid;refhash text;source_count integer;
begin
 proof:=private.institutional_result_source_closure_v1(p_job,p_capability);
 if proof->>'state'='denied' then raise exception 'institutional_native_rights_denied' using errcode='42501';end if;
 if proof->>'state' is distinct from 'closed' then return jsonb_build_object('state','ineligible','reason',proof->'reason');end if;
 org:=(proof->>'organizationId')::uuid;work:=(proof->>'workId')::uuid;
 select * into strict r from private.institutional_model_results where organization_id=org and id=(proof->>'resultId')::uuid;
 select * into a from public.artifact_revisions where organization_id=org
  and id=private.artifact_projection_revision_id_v1('institutional_model_results',r.id);
 if a.id is null or a.legacy_ref->>'id' is distinct from r.id::text or a.legacy_ref->>'table' is distinct from 'institutional_model_results'
  or a.legacy_ref->>'fingerprint' is distinct from r.artifact->>'fingerprint'
  or a.manifest#>>'{institutionalResult,id}' is distinct from r.id::text
  or not exists(select 1 from public.artifacts x where x.organization_id=org and x.id=a.artifact_id and x.work_id=work and x.kind='model_result')
 then raise exception 'institutional_native_ancestor_mismatch' using errcode='23505';end if;
 rev:=extensions.uuid_generate_v5(extensions.uuid_ns_url(),'offroad:institutional-native:v1:'||r.id::text);
 select * into b from private.institutional_native_bindings where organization_id=org and result_id=r.id;
 if b.id is not null and (b.revision_id,b.ancestor_revision_id,b.closure) is distinct from (rev,a.id,proof)
 then raise exception 'institutional_native_replay_mismatch' using errcode='23505';end if;
 select coalesce(jsonb_agg(jsonb_build_object('sourceVersionId',s->'sourceVersionId','rightsVersionId',s->'rightsVersionId')
  order by s->>'sourceVersionId',s->>'rightsVersionId'),'[]') into sources from jsonb_array_elements(proof->'sources') s;
 blocks:=private.institutional_native_blocks_v1(r.artifact);
 manifest:=jsonb_build_object('schemaVersion','artifact-manifest.2026.09.26-v1','kind','model_result','audience','internal','format','json',
  'bytes',null,'method',null,'execution',null,'inputSnapshot',jsonb_build_object('fingerprint',proof->'contextFingerprint'),
  'institutionalResult',jsonb_build_object('id',r.id,'configurationFingerprint',r.configuration_fingerprint),'sources',sources,'claims','[]'::jsonb,
  'traces',jsonb_build_array('institutional-artifact-content.2026.09.28-v1','institutional-closure:'||encode(extensions.digest(convert_to(proof::text,'utf8'),'sha256'),'hex'),
   'ancestor-manifest:'||a.manifest_fingerprint),'template',null,
  'provenance',jsonb_build_object('producer','institutional-native-producer.v1','jobId',p_job,'taskRunId',null,'messageId',r.id,'capability','institutional-native-producer.v1'),'legacy',null);
 projected:=private.create_artifact_revision_v1(org,work,'model_result','institutional-native:'||r.id::text,'internal','worker',manifest,blocks,
  jsonb_build_array(jsonb_build_object('kind','artifact_revision','derivedFromRevisionId',a.id)),null,null,null,null,(proof->>'subjectId')::uuid,rev,false);
 if projected->>'revision_id' is distinct from rev::text then raise exception 'institutional_native_identity_mismatch' using errcode='23505';end if;
 if b.id is null then
  insert into private.institutional_native_bindings(organization_id,work_id,result_id,snapshot_id,revision_id,ancestor_revision_id,closure,closure_fingerprint)
   values(org,work,r.id,(proof->>'snapshotId')::uuid,rev,a.id,proof,encode(extensions.digest(convert_to(proof::text,'utf8'),'sha256'),'hex'));
 end if;
 reference:=jsonb_build_object('artifactRevisionId',a.id,'manifestFingerprint',a.manifest_fingerprint);
 refhash:=encode(extensions.digest(convert_to(reference::text,'utf8'),'sha256'),'hex');
 select count(distinct s->>'sourceVersionId') into source_count from jsonb_array_elements(proof->'sources') s;
 select * into receipt from private.review_basis_receipts where organization_id=org and work_id=work and basis_kind='artifact_revision' and reference_fingerprint=refhash;
 if receipt.id is null then
  insert into private.review_basis_receipts(organization_id,work_id,basis_kind,basis_reference,reference_fingerprint,source_count,producer)
   values(org,work,'artifact_revision',reference,refhash,source_count,'institutional-native-producer.v1') returning * into receipt;
  insert into private.review_basis_source_links(organization_id,receipt_id,source_version_id)
   select org,receipt.id,(s->>'sourceVersionId')::uuid from jsonb_array_elements(proof->'sources') s group by s->>'sourceVersionId';
 elsif receipt.basis_reference is distinct from reference or receipt.source_count<>source_count or receipt.producer<>'institutional-native-producer.v1'
 then raise exception 'institutional_native_receipt_conflict' using errcode='23505';end if;
 if exists((select (s->>'sourceVersionId')::uuid from jsonb_array_elements(proof->'sources') s except select source_version_id from private.review_basis_source_links where organization_id=org and receipt_id=receipt.id)
  union all (select source_version_id from private.review_basis_source_links where organization_id=org and receipt_id=receipt.id except select (s->>'sourceVersionId')::uuid from jsonb_array_elements(proof->'sources') s))
 then raise exception 'institutional_native_receipt_conflict' using errcode='23505';end if;
 -- All possible writes/waits precede this re-evaluation. Any failure rolls back every projection row.
 final_proof:=private.institutional_result_source_closure_v1(p_job,p_capability);
 if final_proof is distinct from proof then raise exception 'institutional_native_authority_changed' using errcode='42501';end if;
 return jsonb_build_object('state','available','revisionId',rev,'replayed',projected->'replayed');
exception when lock_not_available then raise exception 'institutional_capture_retry' using errcode='40001';
end $$;
revoke all on function private.project_institutional_native_result_v1(uuid,text) from public,anon,authenticated,service_role;

create function private.worker_record_institutional_model_result_v3(p_job_id uuid,p_capability_token text,p_result jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare result jsonb;
begin
 result:=private.worker_record_institutional_model_result_v2(p_job_id,p_capability_token,p_result);
 if result->>'status'='completed' then result:=result||jsonb_build_object('nativeProjection',private.project_institutional_native_result_v1(p_job_id,p_capability_token));end if;
 return result;
end $$;
create function public.worker_record_institutional_model_result_v3(p_job_id uuid,p_capability_token text,p_result jsonb) returns jsonb
language sql volatile security invoker set search_path='' as $$select private.worker_record_institutional_model_result_v3(p_job_id,p_capability_token,p_result);$$;
revoke all on function private.worker_record_institutional_model_result_v3(uuid,text,jsonb),public.worker_record_institutional_model_result_v3(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.worker_record_institutional_model_result_v3(uuid,text,jsonb),public.worker_record_institutional_model_result_v3(uuid,text,jsonb) to authenticated;

-- Full installed definitions with the reviewed contract extensions.
CREATE OR REPLACE FUNCTION private.validate_artifact_manifest_v1(p_manifest jsonb)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare m jsonb:=p_manifest;b jsonb;x jsonb;
 hex text:='^[a-f0-9]{64}$';
 uid text:='^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$';
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
 if (select count(*)<>count(distinct jsonb_build_array(s->>'sourceVersionId',s->>'rightsVersionId')) from jsonb_array_elements(m->'sources') s) then raise exception 'duplicate_source' using errcode='22023'; end if;
 if exists(select 1 from jsonb_array_elements(m->'sources') s group by s->>'sourceVersionId' having count(*)>1 and bool_or(s->>'rightsVersionId' is null)) then raise exception 'ambiguous_source_rights' using errcode='22023';end if;
 if (select count(*)<>count(distinct c->>'blockKey') from jsonb_array_elements(m->'claims') c) then raise exception 'duplicate_claims_block' using errcode='22023'; end if;
 if (select count(*)<>count(distinct t#>>'{}') from jsonb_array_elements(m->'traces') t) then raise exception 'duplicate_trace' using errcode='22023'; end if;
end $function$;

CREATE OR REPLACE FUNCTION private.create_artifact_revision_v1(p_org uuid, p_work uuid, p_kind text, p_subject text, p_audience text, p_origin text, p_manifest jsonb, p_blocks jsonb, p_links jsonb, p_content_sha256 text, p_byte_length bigint, p_legacy_ref jsonb, p_actor uuid, p_rights_subject uuid DEFAULT NULL::uuid, p_revision_id uuid DEFAULT NULL::uuid, p_lock_work boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 hex text:='^[a-f0-9]{64}$';uid text:='^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$';
 blocks jsonb:=coalesce(p_blocks,'[]'::jsonb);links jsonb:=coalesce(p_links,'[]'::jsonb);all_links jsonb:='[]'::jsonb;
 a public.artifacts;existing public.artifact_revisions;head public.artifact_revisions;rev_id uuid;fingerprint text;next_no integer;
 blk jsonb;blk_no integer:=0;lnk jsonb;lnk_kind text;lnk_block uuid;sv uuid;rv uuid;set_id uuid;summary jsonb;informational boolean;substance boolean;
begin
 if p_org is null or p_work is null
  or p_kind not in ('answer','material','workbook','model_result','work_product','execution_result','presentation','document')
  or coalesce(char_length(p_subject),0) not between 1 and 300
  or p_audience not in ('internal','advisor','external') or p_origin not in ('worker','person','legacy')
  or jsonb_typeof(blocks)<>'array' or jsonb_array_length(blocks)>1000 or jsonb_typeof(links)<>'array' or jsonb_array_length(links)>2000
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
 -- Stored bytes name an object the governed upload stored for this work, with this hash, size and format.
 if jsonb_typeof(p_manifest#>'{bytes,storage}')='object' and not exists(select 1 from private.capital_project_material_upload_grants g
   where g.organization_id=p_org and g.capital_project_id=p_work and g.state='stored' and p_manifest#>>'{bytes,storage,bucket}'='case-artifacts'
    and g.object_path=p_manifest#>>'{bytes,storage,path}' and g.content_sha256=p_manifest#>>'{bytes,sha256}'
    and g.byte_length=(p_manifest#>>'{bytes,byteLength}')::bigint and g.format=p_manifest->>'format'
    and exists(select 1 from storage.objects o where o.bucket_id='case-artifacts' and o.name=g.object_path)) then
  raise exception 'artifact_stored_bytes_not_governed' using errcode='42501';
 end if;
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
   if lnk->>'rightsVersionId' is null and (select count(distinct l->>'rightsVersionId') from jsonb_array_elements(all_links) l where l->>'kind'='source_version' and l->>'sourceVersionId'=lnk->>'sourceVersionId')<>1 then raise exception 'ambiguous_source_rights' using errcode='22023';end if;
   select l->>'rightsVersionId' into rv from jsonb_array_elements(all_links) l where l->>'kind'='source_version' and l->>'sourceVersionId'=lnk->>'sourceVersionId'
    and (lnk->>'rightsVersionId' is null or l->>'rightsVersionId'=lnk->>'rightsVersionId') limit 1;
   if rv is null then raise exception 'artifact_link_not_in_manifest' using errcode='22023';end if;
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
  -- A manifest is not a digest of the blocks or of extra dependency edges. Replay is
  -- valid only for the identical ordered blocks and the identical normalized edge set.
  if blocks is distinct from (select coalesce(jsonb_agg(jsonb_build_object(
    'blockKey',b.block_key,'kind',b.kind,'content',b.content,'claims',b.claims) order by b.block_no),'[]'::jsonb)
    from public.artifact_blocks b where b.organization_id=p_org and b.revision_id=existing.id)
  then raise exception 'artifact_revision_replay_mismatch' using errcode='23505'; end if;
  if exists (
   with requested as (
    select distinct jsonb_strip_nulls(jsonb_build_object(
     'kind',l->>'kind','blockKey',l->>'blockKey',
     'sourceVersionId',nullif(l->>'sourceVersionId','')::uuid,
     'rightsVersionId',nullif(l->>'rightsVersionId','')::uuid,
     'executionId',nullif(l->>'executionId','')::uuid,
     'resultId',nullif(l->>'resultId','')::uuid,
     'platformReleaseId',l->>'platformReleaseId',
     'houseReleaseId',nullif(l->>'houseReleaseId','')::uuid,
     'assumptionVersionId',nullif(l->>'assumptionVersionId','')::uuid,
     'slotKey',l->>'slotKey','derivedFromRevisionId',nullif(l->>'derivedFromRevisionId','')::uuid)) edge
    from jsonb_array_elements(all_links) l
   ), stored as (
    select jsonb_strip_nulls(jsonb_build_object(
     'kind',d.link_kind,'blockKey',b.block_key,
     'sourceVersionId',d.source_version_id,'rightsVersionId',d.source_rights_version_id,
     'executionId',d.execution_id,'resultId',d.institutional_result_id,
     'platformReleaseId',d.platform_release_id,'houseReleaseId',d.house_release_id,
     'assumptionVersionId',d.assumption_version_id,'slotKey',d.slot_key,
     'derivedFromRevisionId',d.derived_from_revision_id)) edge
    from private.artifact_dependency_links d left join public.artifact_blocks b
     on b.organization_id=d.organization_id and b.revision_id=d.revision_id and b.id=d.block_id
    where d.organization_id=p_org and d.revision_id=existing.id
   )
   (select edge from requested except select edge from stored)
   union all
   (select edge from stored except select edge from requested)
  ) then raise exception 'artifact_revision_replay_mismatch' using errcode='23505'; end if;
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
end $function$;

CREATE OR REPLACE FUNCTION private.artifact_revision_release_v1(r public.artifact_revisions)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare fps text[]:=array_remove(array[r.manifest_fingerprint,r.content_sha256,r.legacy_ref->>'fingerprint'],null);approved boolean;
begin
 -- A persisted native binding, including inherited ones, cannot inherit historical approval.
 if exists(with recursive ancestry(id) as (select r.id union select l.derived_from_revision_id from ancestry a
  join private.artifact_dependency_links l on l.organization_id=r.organization_id and l.revision_id=a.id and l.link_kind='artifact_revision')
  select 1 from ancestry a join private.institutional_native_bindings b on b.organization_id=r.organization_id and b.revision_id=a.id)
 then return case when r.audience='external' then 'blocked' else 'internal' end;end if;
 approved:=exists(select 1 from public.capital_project_artifact_decisions d where d.organization_id=r.organization_id and d.decision='confirm' and d.artifact_fingerprint=any(fps))
  or exists(select 1 from public.deal_state_objects pr cross join unnest(fps) f where pr.organization_id=r.organization_id and pr.object_type='package_review' and pr.status='approved'
   and pr.dependencies @> jsonb_build_array(jsonb_build_object('objectType','material_artifact','objectFingerprint',f)))
  or (jsonb_typeof(r.manifest->'institutionalResult')='object' and exists(select 1 from private.institutional_model_results m
   where m.organization_id=r.organization_id and m.id=(r.manifest#>>'{institutionalResult,id}')::uuid and m.status='completed' and m.superseded_by is null
    and private.institutional_result_established_v1(m.organization_id,m.id)))
  or (jsonb_typeof(r.manifest->'execution')='object' and exists(select 1 from private.execution_result_receipts x
   where x.organization_id=r.organization_id and x.execution_id=(r.manifest#>>'{execution,executionId}')::uuid and x.result_fingerprint=r.manifest#>>'{execution,resultFingerprint}'));
 return case when approved then 'released' when r.audience='external' then 'blocked' else 'internal' end;
end $function$;

CREATE OR REPLACE FUNCTION private.read_artifact_revision_v1(p_revision uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  select c.revision_id from ancestry c where not exists(select 1 from public.artifact_revisions x where x.organization_id=r.organization_id and x.id=c.revision_id)
  union
  -- A bounded traversal must deny when it cannot establish the complete source closure.
  select l.derived_from_revision_id from ancestry c
   join private.artifact_dependency_links l on l.organization_id=r.organization_id and l.revision_id=c.revision_id
   where c.depth=64 and l.link_kind='artifact_revision'
    and not exists(select 1 from ancestry visited where visited.revision_id=l.derived_from_revision_id))
 select coalesce((select array_agg(s.id order by s.id) from sources s where not private.source_use_allowed_v1(r.organization_id,s.source_version_id,actor,'read','analysis')),'{}'::uuid[]),
  coalesce((select array_agg(m.revision_id order by m.revision_id) from missing m),'{}'::uuid[]) into restricted,unresolved;
 rel:=private.artifact_revision_release_v1(r);
 fresh:=case when cardinality(unresolved)>0 then 'unknown' else private.artifact_revision_freshness_v1(r) end;
 restriction:=case when not private.institutional_native_read_allowed_v1(r.organization_id,r.id,actor) or cardinality(restricted)>0 or cardinality(unresolved)>0
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
end $function$;

CREATE OR REPLACE FUNCTION private.artifact_review_sources_allowed_v1(p_org uuid, p_revision uuid, p_actor uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
 with recursive ancestry(revision_id,depth) as (
  select p_revision,0
  union
  select l.derived_from_revision_id,c.depth+1 from ancestry c
   join private.artifact_dependency_links l on l.organization_id=p_org and l.revision_id=c.revision_id
   where l.link_kind='artifact_revision' and c.depth<64
 )
 select private.institutional_native_read_allowed_v1(p_org,p_revision,p_actor) and p_actor is not null and exists(select 1 from auth.users u where u.id=p_actor
  and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now()))
 and not exists(select 1 from ancestry c where not exists(select 1 from public.artifact_revisions r where r.organization_id=p_org and r.id=c.revision_id))
 and not exists(select 1 from ancestry c join public.artifact_revisions r on r.organization_id=p_org and r.id=c.revision_id
  join public.artifacts a on a.organization_id=r.organization_id and a.id=r.artifact_id
  where r.legacy_ref is not null and private.review_basis_receipt_authority_v1(p_org,a.work_id,'artifact_revision',
   jsonb_build_object('artifactRevisionId',r.id,'manifestFingerprint',r.manifest_fingerprint),p_actor)<>'allowed')
 and not exists(select 1 from ancestry c join private.artifact_dependency_links l on l.organization_id=p_org and l.revision_id=c.revision_id
  where (l.link_kind='source_version' and not private.source_use_allowed_v1(p_org,l.source_version_id,p_actor,'read','analysis'))
   or (c.depth=64 and l.link_kind='artifact_revision' and not exists(select 1 from ancestry visited where visited.revision_id=l.derived_from_revision_id)));
$function$;

CREATE OR REPLACE FUNCTION private.review_basis_receipt_authority_v1(p_org uuid, p_work uuid, p_kind text, p_reference jsonb, p_actor uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare receipt private.review_basis_receipts;
begin
 select * into receipt from private.review_basis_receipts where organization_id=p_org and work_id=p_work and basis_kind=p_kind
  and reference_fingerprint=encode(extensions.digest(convert_to(p_reference::text,'utf8'),'sha256'),'hex') and basis_reference=p_reference;
 if receipt.id is null or receipt.source_count<>(select count(*) from private.review_basis_source_links where organization_id=p_org and receipt_id=receipt.id)
 then return 'unresolved'; end if;
 if exists(select 1 from private.review_basis_source_links l where l.organization_id=p_org and l.receipt_id=receipt.id
  and not private.source_use_allowed_v1(p_org,l.source_version_id,p_actor,'read','analysis')) then return 'denied'; end if;
 if receipt.producer='institutional-native-producer.v1' then
  if not exists(select 1 from private.institutional_native_bindings b where b.organization_id=p_org and b.work_id=p_work
   and b.ancestor_revision_id=(p_reference->>'artifactRevisionId')::uuid) then return 'unresolved';end if;
  if not private.institutional_native_read_allowed_v1(p_org,(p_reference->>'artifactRevisionId')::uuid,p_actor) then return 'denied';end if;
 end if;
 return 'allowed';
end $function$;

CREATE OR REPLACE FUNCTION public.worker_runtime_schema_contract_v1()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select jsonb_set(c,'{capabilities}',(c->'capabilities')||'["explicit-resource-access.v1","explicit-workspace-context.v1","authenticated-document-storage.v1","review-bound-execution.v1","legacy-storage-rotation.v1","domain-event-outbox.v1","pinned-execution-consumer.v1","governed-evaluation-consumer.v1","provider-resource-retention.v2","dependency-recompute.v1","dependency-recompute-health.v1","artifact-revision.v1","institutional-input-snapshot.v1","institutional-setup-input-snapshot.v1","institutional-native-projection.v1"]'::jsonb)
 from (select private.worker_runtime_schema_contract_before_resource_access_v1() c) previous;
$function$;
