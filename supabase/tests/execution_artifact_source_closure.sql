-- Synthetic rollback-only regression for sources hidden behind immutable execution inputs.
begin;
\ir support/execution_adopted_result_setup.sql
select public.adopt_observation_for_work_v1(current_setting('test.adoption.payload')::jsonb);
select pg_temp.commit_adopted('a4171000-0000-4000-9000-000000000002');
select private.execution_result_source_closure_v1('a11b0000-0000-4000-9000-000000000001','a4171000-0000-4000-9000-000000000002');
DO $$DECLARE projected jsonb; BEGIN
 projected:=private.project_execution_result_artifact_v1('a11b0000-0000-4000-9000-000000000001','a4171000-0000-4000-9000-000000000002',(select id from public.processing_jobs where execution_id='a4171000-0000-4000-9000-000000000002'),auth.uid());
 if projected->>'recorded' is distinct from 'true' then raise exception 'closure_projection_failed: %',projected;end if;END $$;

create function pg_temp.fail_new_projection() returns trigger language plpgsql as $$begin raise exception 'synthetic_projection_failure';end $$;
create trigger synthetic_projection_failure before insert on public.artifact_revisions for each row execute function pg_temp.fail_new_projection();
select set_config('test.closure.legacyRequest',pg_temp.commit_adopted('a4171000-0000-4000-9000-000000000012')::text,true);
drop trigger synthetic_projection_failure on public.artifact_revisions;
CREATE OR REPLACE FUNCTION pg_temp.project_legacy_execution_artifact(p_org uuid, p_execution uuid, p_job uuid, p_rights_subject uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r private.execution_result_receipts;e public.work_executions;j public.processing_jobs;packet jsonb;blocks jsonb;summary jsonb;
 method jsonb;sources jsonb;traces jsonb;links jsonb;snapshot text;gates text;manifest jsonb;rev_id uuid;result jsonb;code text;
begin
 rev_id:=extensions.uuid_generate_v5(extensions.uuid_ns_url(),'offroad:artifact-revision:execution_result:'||p_execution::text);
 select * into r from private.execution_result_receipts x where x.organization_id=p_org and x.execution_id=p_execution;
 select * into e from public.work_executions x where x.organization_id=p_org and x.id=p_execution;
 if r.execution_id is null or e.id is null then return jsonb_build_object('recorded',false,'reason','execution_result_receipt_missing'); end if;
 begin
  packet:=r.canonical_result::jsonb;
 exception when others then
  return jsonb_build_object('recorded',false,'reason','execution_result_unmappable');
 end;
 if jsonb_typeof(packet)<>'object' or packet->>'schemaVersion' is distinct from 'capital-procedure-packet.v2' then
  return jsonb_build_object('recorded',false,'reason','execution_result_unmappable');
 end if;
 begin
  select * into j from public.processing_jobs x where x.organization_id=p_org and x.id=p_job and x.execution_id=p_execution;
  if j.id is null or p_rights_subject is null then raise exception 'execution_artifact_origin_missing' using errcode='42501'; end if;
  blocks:=private.execution_result_blocks_v1(packet);
  -- The claims summary exactly as the core recomputes it from the blocks.
  select coalesce(jsonb_agg(jsonb_build_object('blockKey',b.value->>'blockKey','claimIds',(select jsonb_agg(c->'claimId') from jsonb_array_elements(b.value->'claims') c)) order by b.ordinality),'[]'::jsonb)
   into summary from jsonb_array_elements(blocks) with ordinality b where jsonb_array_length(b.value->'claims')>0;
  select jsonb_build_object('procedureId',x.method_id,'platformReleaseId',x.platform_release_id,'houseReleaseId',x.house_release_id,'version',x.method_version) into method
   from private.execution_dependencies x where x.organization_id=p_org and x.execution_id=p_execution and x.dependency_kind='method_release' order by x.created_at,x.id limit 1;
  -- Sources as the adapter merges them: the packet's contract sources first, in its order, then the
  -- other pinned sources by version id; every pinned source keeps the rights version pinned for it.
  with pins as (
   select distinct on (x.source_version_id) x.source_version_id as sv,x.rights_version_id as rv from private.execution_dependencies x
   where x.organization_id=p_org and x.execution_id=p_execution and x.dependency_kind='source_version' order by x.source_version_id,x.created_at,x.id),
  own as (select (c.value#>>'{}')::uuid as sv,c.ordinality as n from jsonb_array_elements(coalesce(packet->'contractSourceVersionIds','[]'::jsonb)) with ordinality c),
  merged as (
   select o.sv,min(o.n) as n from own o group by o.sv
   union all
   select p.sv,1000000+row_number() over (order by p.sv) from pins p where not exists(select 1 from own o where o.sv=p.sv))
  select coalesce(jsonb_agg(jsonb_build_object('sourceVersionId',m.sv,'rightsVersionId',p.rv) order by m.n),'[]'::jsonb) into sources
  from merged m left join pins p on p.sv=m.sv;
  select g.gates_fingerprint into gates from private.execution_gate_receipts g where g.organization_id=p_org and g.execution_id=p_execution;
  select s.payload_fingerprint into snapshot from private.execution_input_snapshots s where s.organization_id=p_org and s.execution_id=p_execution;
  select coalesce(jsonb_agg(to_jsonb(t.trace) order by t.n),'[]'::jsonb) into traces from (
   select v.trace,min(v.n) as n from (
    select 'capital-procedure-packet:'||(packet->>'fingerprint') as trace,1::bigint as n
    union all select 'capital-decision-delivery:'||(packet#>>'{decision,fingerprint}'),2
    union all select 'financial-core:'||(packet#>>'{decision,provenance,financialCoreVersion}'),3
    union all select 'ratio:'||(x.v->>'id')||':'||(x.v->>'fingerprint'),3+x.n from jsonb_array_elements(packet#>'{decision,ratios}') with ordinality x(v,n)
    union all select 'execution-gates:'||gates,1000000 where gates is not null) v
   group by v.trace) t;
  -- The adopted premises the execution pinned anchor the revision too.
  select coalesce(jsonb_agg(jsonb_build_object('kind','assumption_slot','assumptionVersionId',x.assumption_version_id,'slotKey',x.slot_key) order by x.assumption_version_id,x.slot_key),'[]'::jsonb)
   into links from (select distinct y.assumption_version_id,y.slot_key from private.execution_dependencies y
    where y.organization_id=p_org and y.execution_id=p_execution and y.dependency_kind='assumption_slot') x;
  manifest:=jsonb_build_object('schemaVersion','artifact-manifest.2026.09.26-v1','kind','execution_result','audience','internal','format','json','bytes',null,
   'method',method,'execution',jsonb_build_object('executionId',p_execution,'resultFingerprint',r.result_fingerprint,'inputFingerprint',r.input_fingerprint),
   'inputSnapshot',case when snapshot is not null then jsonb_build_object('fingerprint',snapshot) end,'institutionalResult',null,
   'sources',sources,'claims',summary,'traces',traces,'template',null,
   'provenance',jsonb_build_object('producer','work-execution-commit','jobId',j.id,'taskRunId',null,'messageId',null,'capability','pinned-execution-consumer.v1'),
   'legacy',null);
  -- The commit keeps its own lock order: the revision is new per execution, so only its artifact row is locked.
  result:=private.create_artifact_revision_v1(p_org,e.work_id,'execution_result','execution:'||p_execution::text,'internal','worker',manifest,blocks,links,
   null,null,null,null,p_rights_subject,rev_id,false);
  if result->>'revision_id' is distinct from rev_id::text then raise exception 'execution_artifact_identity_mismatch' using errcode='23505'; end if;
  return jsonb_build_object('recorded',true,'replayed',(result->>'replayed')::boolean,'revisionId',result->'revision_id');
 exception when others then
  code:=case when sqlerrm ~ '^[a-z][a-z0-9_]{0,80}$' then sqlerrm else 'unclassified' end;
  raise warning 'execution_result_artifact_not_recorded: % (%)',code,sqlstate;
  return jsonb_build_object('recorded',false,'reason','execution_result_artifact_failed','code',code,'sqlstate',sqlstate);
 end;
end $function$;


select pg_temp.project_legacy_execution_artifact('a11b0000-0000-4000-9000-000000000001','a4171000-0000-4000-9000-000000000012',(current_setting('test.closure.legacyRequest')::jsonb->>'jobId')::uuid,auth.uid());
select set_config('test.closure.legacyManifest',(select manifest::text from public.artifact_revisions where id=pg_temp.revision_of('a4171000-0000-4000-9000-000000000012')),true);

create function pg_temp.expect_true(ok boolean,label text) returns void language plpgsql as $$begin
 if ok is distinct from true then raise exception 'FAIL: %',label;end if;raise notice 'PASS: %',label;end $$;
select pg_temp.expect_true(jsonb_array_length(manifest->'sources')=1,'adoption-only source is emitted in the new manifest') from public.artifact_revisions where id=pg_temp.revision_of('a4171000-0000-4000-9000-000000000002');
select pg_temp.expect_true((private.read_artifact_revision_v1(pg_temp.revision_of('a4171000-0000-4000-9000-000000000002'))->'restriction')='null','authorized source permits read');
select public.review_artifact_revision_v1(r.id,r.manifest_fingerprint,'comment',null,'Synthetic protected note',false,gen_random_uuid(),null)
 from public.artifact_revisions r where id=pg_temp.revision_of('a4171000-0000-4000-9000-000000000002');
create function pg_temp.derive_execution(p_parent uuid,p_subject text,p_direct boolean default false) returns jsonb language plpgsql as $$
declare m jsonb;blocks jsonb;links jsonb;
begin
 select manifest into m from public.artifact_revisions where id=p_parent;
 m:=jsonb_set(jsonb_set(m,'{kind}','"work_product"'),'{sources}','[]');
 m:=jsonb_set(m,'{traces}',m->'traces'||jsonb_build_array('synthetic-derivation:'||p_subject));
 if not p_direct then m:=jsonb_set(m,'{execution}','null');end if;
 links:=case when p_direct then '[]'::jsonb else jsonb_build_array(jsonb_build_object('kind','artifact_revision','derivedFromRevisionId',p_parent)) end;
 blocks:=current_setting('test.producers.blocks')::jsonb;
 return private.create_artifact_revision_v1('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000002','work_product',p_subject,'internal','person',m,blocks,links,null,null,null,auth.uid(),auth.uid());
end $$;
select set_config('test.closure.derived',(pg_temp.derive_execution(pg_temp.revision_of('a4171000-0000-4000-9000-000000000002'),'synthetic-closure-derived')->>'revision_id'),true);
select pg_temp.expect_true(jsonb_array_length(current_setting('test.closure.legacyManifest')::jsonb->'sources')=0,'historical omission reproduced by exact old constructor');
-- A stricter current derive right blocks new output but permits reading the fixed historical result.
select private.set_source_rights_v1('a11b0000-0000-4000-9000-000000000004',1,array['read','process','store','export'],array['analysis','retrieval'],null,null,gen_random_uuid(),repeat('c',64));
select pg_temp.expect_true(private.read_work_execution_v1('a4171000-0000-4000-9000-000000000002')#>>'{result,canonicalResult}' is not null,'historical read does not require rerun derive');
select pg_temp.expect_true(private.project_execution_result_artifact_v1('a11b0000-0000-4000-9000-000000000001','a4171000-0000-4000-9000-000000000012',(current_setting('test.closure.legacyRequest')::jsonb->>'jobId')::uuid,auth.uid())->>'replayed'='true','identical historical replay needs no new derivation');
select pg_temp.expect_true((select manifest=current_setting('test.closure.legacyManifest')::jsonb from public.artifact_revisions where id=pg_temp.revision_of('a4171000-0000-4000-9000-000000000012')),'historical manifest unchanged');
select pg_temp.refused($q$select pg_temp.derive_execution(pg_temp.revision_of('a4171000-0000-4000-9000-000000000002'),'synthetic-denied-derived')$q$,'artifact_source_use_refused','derive revoked through artifact ancestor');
select pg_temp.refused($q$select pg_temp.derive_execution(pg_temp.revision_of('a4171000-0000-4000-9000-000000000002'),'synthetic-denied-direct',true)$q$,'artifact_source_use_refused','derive revoked through direct execution');
-- Remove only read. Other operations cannot conceal this revocation.
select private.set_source_rights_v1('a11b0000-0000-4000-9000-000000000004',2,array['process','store','derive','export'],array['analysis','retrieval'],null,null,gen_random_uuid(),repeat('d',64));
select pg_temp.expect_true(private.read_artifact_revision_v1(pg_temp.revision_of('a4171000-0000-4000-9000-000000000002'))#>>'{restriction,kind}'='source_rights','read revoked on source behind adoption');
select pg_temp.expect_true(private.read_artifact_revision_v1(current_setting('test.closure.derived')::uuid)->'blocks'='[]','derived artifact inherits hidden source revocation');
select pg_temp.expect_true(private.read_artifact_revision_v1(pg_temp.revision_of('a4171000-0000-4000-9000-000000000012'))#>>'{restriction,kind}'='source_rights','historical omitted source is still protected');
select pg_temp.expect_true(private.read_artifact_revision_reviews_v1(pg_temp.revision_of('a4171000-0000-4000-9000-000000000002'))->>'withheld'='true','review notes withheld after revocation');
select pg_temp.expect_true(private.read_work_execution_v1('a4171000-0000-4000-9000-000000000002')#>>'{result,withheld}'='inputs_not_current','raw result withheld after revocation');
select pg_temp.expect_true(private.execution_artifact_projection_v1('a11b0000-0000-4000-9000-000000000001','a4171000-0000-4000-9000-000000000002',auth.uid())->>'state'='restricted','projection cannot bypass source revocation');
select pg_temp.refused($q$select public.review_artifact_revision_v1(r.id,r.manifest_fingerprint,'comment',null,'Must be denied',false,gen_random_uuid(),null) from public.artifact_revisions r where id=pg_temp.revision_of('a4171000-0000-4000-9000-000000000002')$q$,'review_source_access_required','review command denied after read revocation');
select pg_temp.expect_true(private.execution_result_source_closure_v1('a11b0000-0000-4000-9000-000000000001',gen_random_uuid()) is null,'missing execution never closes');
select 'execution_artifact_source_closure: PASS' result;
rollback;
