-- Stage 20: recover the artifact projection of an immutable committed result.
-- No calculation, job, operation, budget or human approval is created by recovery.
set search_path='';
set local lock_timeout='5s';

-- One literal constructor shared by commit and recovery. The rights subject is
-- separate from the original job provenance. Exact replay goes through the core.
CREATE OR REPLACE FUNCTION private.project_execution_result_artifact_v1(p_org uuid, p_execution uuid, p_job uuid, p_rights_subject uuid)
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

revoke all on function private.project_execution_result_artifact_v1(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;

create or replace function private.record_execution_result_artifact_v1(p_org uuid,p_execution uuid,p_job uuid) returns jsonb
language sql volatile security definer set search_path='' as $$
 select private.project_execution_result_artifact_v1(p_org,p_execution,p_job,
  (select j.authorization_subject_id from public.processing_jobs j where j.organization_id=p_org and j.id=p_job and j.execution_id=p_execution));
$$;
revoke all on function private.record_execution_result_artifact_v1(uuid,uuid,uuid) from public,anon,authenticated,service_role;

-- The reader invokes this only after execution_read_access_v1. Missing is not a
-- synonym for a failed read; available is not an approval or an external release.
create function private.execution_artifact_projection_v1(p_org uuid,p_execution uuid,p_subject uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare r private.execution_result_receipts;e public.work_executions;a public.artifact_revisions;packet jsonb;rev uuid;
begin
 select * into e from public.work_executions where organization_id=p_org and id=p_execution;
 select * into r from private.execution_result_receipts where organization_id=p_org and execution_id=p_execution;
 if e.id is null or r.id is null then return jsonb_build_object('state','not_committed'); end if;
 if not private.execution_inputs_current_v1(p_org,p_execution,p_subject) then return jsonb_build_object('state','restricted'); end if;
 begin packet:=r.canonical_result::jsonb;
 exception when data_exception then return jsonb_build_object('state','unsupported'); end;
 if jsonb_typeof(packet) is distinct from 'object' or packet->>'schemaVersion' is distinct from 'capital-procedure-packet.v2'
 then return jsonb_build_object('state','unsupported'); end if;
 rev:=extensions.uuid_generate_v5(extensions.uuid_ns_url(),'offroad:artifact-revision:execution_result:'||p_execution::text);
 select * into a from public.artifact_revisions where id=rev;
 if not found then return jsonb_build_object('state','missing'); end if;
 if a.organization_id is distinct from p_org or a.manifest#>>'{execution,executionId}' is distinct from p_execution::text
  or a.manifest#>>'{execution,resultFingerprint}' is distinct from r.result_fingerprint
  or a.manifest#>>'{execution,inputFingerprint}' is distinct from r.input_fingerprint
  or not exists(select 1 from public.artifacts x where x.organization_id=p_org and x.id=a.artifact_id and x.work_id=e.work_id
   and x.kind='execution_result' and x.subject='execution:'||p_execution::text)
 then return jsonb_build_object('state','restricted'); end if;
 if not private.artifact_review_sources_allowed_v1(p_org,a.id,p_subject) then return jsonb_build_object('state','restricted'); end if;
 return jsonb_build_object('state','available','revisionId',a.id);
end $$;
revoke all on function private.execution_artifact_projection_v1(uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function private.recover_execution_result_artifact_v1(p_execution_id uuid,p_expected_result_fingerprint text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare e public.work_executions;r private.execution_result_receipts;j public.processing_jobs;result jsonb;actor uuid:=auth.uid();org uuid;
begin
 select * into e from public.work_executions where id=p_execution_id;
 if e.id is null then raise exception 'execution_access_denied' using errcode='42501'; end if;
 -- Human account -> work -> shared policy. No original principal, lease or job lock.
 org:=private.lock_review_work_v1(e.work_id);
 if org is distinct from e.organization_id or not exists(select 1 from private.principals p
  where p.organization_id=org and p.user_id=actor and p.kind='human' and p.revoked_at is null)
  or not private.execution_inputs_current_v1(org,e.id,actor)
 then raise exception 'execution_recovery_access_denied' using errcode='42501'; end if;
 select * into r from private.execution_result_receipts where organization_id=org and execution_id=e.id;
 if r.id is null then raise exception 'execution_result_receipt_missing' using errcode='55000'; end if;
 if p_expected_result_fingerprint is null or p_expected_result_fingerprint !~ '^[a-f0-9]{64}$'
  or r.result_fingerprint is distinct from p_expected_result_fingerprint
 then raise exception 'execution_result_fingerprint_mismatch' using errcode='23505'; end if;
 select * into j from public.processing_jobs where organization_id=org and execution_id=e.id and kind='work_execution';
 if j.id is null then raise exception 'execution_artifact_origin_missing' using errcode='55000'; end if;
 result:=private.project_execution_result_artifact_v1(org,e.id,j.id,actor);
 -- Recheck time-sensitive rights after possible artifact-row waits. Any refusal
 -- rolls back the projection too. Audit contains only bounded codes and identities.
 if not private.can_access_resource_v1(org,e.work_id,'work') or not private.execution_inputs_current_v1(org,e.id,actor)
 then raise exception 'execution_recovery_access_denied' using errcode='42501'; end if;
 if result->>'recorded'='true' and result->>'replayed'='false' then
  insert into public.audit_events(organization_id,actor_user_id,action,resource_type,resource_id,metadata)
  values(org,actor,'execution_artifact_recovered','work_execution',e.id,
   jsonb_build_object('revisionId',result->'revisionId','jobId',j.id));
 end if;
 return result;
end $$;
revoke all on function private.recover_execution_result_artifact_v1(uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.recover_execution_result_artifact_v1(uuid,text) to authenticated;
create function public.recover_execution_result_artifact_v1(p_execution_id uuid,p_expected_result_fingerprint text) returns jsonb
language sql volatile security invoker set search_path='' as $$
 select private.recover_execution_result_artifact_v1(p_execution_id,p_expected_result_fingerprint);
$$;
revoke all on function public.recover_execution_result_artifact_v1(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.recover_execution_result_artifact_v1(uuid,text) to authenticated;

create or replace function private.read_work_execution_v2(p_execution_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare r jsonb;x private.execution_gate_receipts;e public.work_executions;begin
 r:=private.read_work_execution_v1(p_execution_id);
 select * into strict e from public.work_executions where id=p_execution_id;
 select g.* into x from private.execution_gate_receipts g where g.organization_id=e.organization_id and g.execution_id=e.id;
 return r||jsonb_build_object('schemaVersion','work-execution-read.v2','gates',case when x.execution_id is null then null
  else jsonb_build_object('gatesVersion',x.gates_version,'blocked',x.blocked,'fingerprint',x.gates_fingerprint,'canonical',x.canonical_gates::jsonb,'createdAt',x.created_at) end,
  'artifactProjection',private.execution_artifact_projection_v1(e.organization_id,e.id,auth.uid()));
end $$;

comment on function private.project_execution_result_artifact_v1(uuid,uuid,uuid,uuid) is 'Private producer over an immutable result receipt and pinned dependencies. Explicit rights subject; original job provenance; exact content replay through the common artifact writer. Caller establishes current authority. Never recalculates.';
comment on function public.recover_execution_result_artifact_v1(uuid,text) is 'Recover a committed result artifact under current human work/source authority and expected result fingerprint, without replaying calculation or budget. Preserves original provenance; records the recovery actor only in audit.';
comment on function private.record_execution_result_artifact_v1(uuid,uuid,uuid) is 'Commit wrapper over the shared artifact constructor, authorized by the original job subject. No new locks in the commit authority path. Unsupported or failed projections leave the committed result intact.';
