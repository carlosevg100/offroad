-- Stage 19, increment 4 (migration B, artifact_producers): the producers write through the common
-- command of migration A (20260926183957_artifact_revision_protocol.sql).
--
-- 1. The execution result. private.commit_work_execution_result_v1 registers, in the commit
--    transaction and right after the result receipt and its milestone, one revision of kind
--    execution_result through private.create_artifact_revision_v1: origin worker, audience internal,
--    no bytes. Its blocks are private.execution_result_blocks_v1 over the committed
--    capital-procedure-packet.v2, the SQL mirror of capitalProcedurePacketBlocks in
--    packages/domain-contracts/src/artifact-protocol.ts (the same keys, kinds, content and claims, in
--    the same order, proved on one shared fixture). The manifest names the release the execution ran,
--    the execution with the receipt's result fingerprint and input fingerprint, the input snapshot,
--    the sources the execution pinned with the rights version pinned in private.execution_dependencies
--    (merged with the packet's contract sources as the contract's adapter merges them), the gate
--    receipt the MD test is evaluated over (a trace), and the job. The revision id is a version 5 UUID
--    of the execution, so the producer is idempotent; a replayed commit returns before it, as it does
--    before the milestone. A result that is not a capital-procedure-packet.v2 (a partial marker, another
--    method, an unknown version) records no revision, and no failure of the artifact ever fails the
--    commit: the producer runs in its own subtransaction and reports instead of raising.
-- 2. Stored bytes. The core accepts bytes.storage only for an object the governed upload stored for
--    this work: a stored grant of private.capital_project_material_upload_grants with the same path,
--    sha256, byte length and format, and the object present in the case-artifacts bucket. The worker
--    writes each preview material (xlsx and pptx) through public.worker_create_artifact_revision_v1
--    with those bytes.
-- 3. A backfill of committed results that have no revision (zero receipts in both environments when
--    this was written), idempotent.
--
-- Two functions change by text patch, each with a unique needle and a named exception:
-- private.commit_work_execution_result_v1 (needle: the milestone statement) and
-- private.create_artifact_revision_v1 (needle: the manifest validation statement).
set search_path='';
set local lock_timeout='5s';

-- 1. The blocks of an execution result, capitalProcedurePacketBlocks key for key: the framing, the
-- alternatives (a judgment claim each), the ratios (a calculation claim each, when there are ratios),
-- the recommendation (one claim, when there is one), the information and contractual gaps, the next
-- requirements, and one number block per decisive number. The decisive number is selected with the
-- rule of deriveCapitalChartSeries: per alternative with calculated rows and per question, the first
-- row with the lowest value (numeric, exact; a tie goes to the earliest period), copied verbatim.
-- Nothing is computed here that the packet does not carry. Raises on a shape it cannot map.
create function private.execution_result_blocks_v1(p_packet jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare d jsonb:=p_packet->'decision';blocks jsonb;alt jsonb;alt_no integer;rws jsonb;q record;low jsonb;low_no integer;
begin
 if jsonb_typeof(p_packet)<>'object' or p_packet->>'schemaVersion' is distinct from 'capital-procedure-packet.v2' or jsonb_typeof(d)<>'object' then
  raise exception 'execution_result_unmappable' using errcode='22023'; end if;
 blocks:=jsonb_build_array(
  jsonb_build_object('blockKey','framing','kind','section','claims','[]'::jsonb,
   'content',jsonb_build_object('status',p_packet->'status','question',d->'question','asOf',d->'asOf','contributionCount',jsonb_array_length(d#>'{provenance,contributionIds}'))),
  jsonb_build_object('blockKey','alternatives','kind','table',
   'content',jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object('id',x.a->'id','label',x.a->'label','kind',x.a->'kind',
     'calculated',jsonb_typeof(x.a#>'{projection,summary}') is distinct from 'null') order by x.n) from jsonb_array_elements(d->'alternatives') with ordinality x(a,n)),'[]'::jsonb)),
   'claims',coalesce((select jsonb_agg(jsonb_build_object('claimId',x.a->'id','kind','judgment','value',x.a->'label','unit',null,'period',null,
     'supportIds',jsonb_build_array(x.a#>'{projection,basisFingerprint}',x.a#>'{projection,calculationFingerprint}')) order by x.n)
    from jsonb_array_elements(d->'alternatives') with ordinality x(a,n)),'[]'::jsonb)));
 if jsonb_array_length(d->'ratios')>0 then
  blocks:=blocks||jsonb_build_array(jsonb_build_object('blockKey','ratios','kind','table',
   'content',jsonb_build_object('rows',(select jsonb_agg(jsonb_build_object('id',x.r->'id','alternativeId',x.r->'alternativeId','ratioId',x.r->'ratioId',
     'definitionKind',x.r->'definitionKind','measurementDate',x.r->'measurementDate','displayedRatio',x.r->'displayedRatio') order by x.n)
    from jsonb_array_elements(d->'ratios') with ordinality x(r,n))),
   'claims',(select jsonb_agg(jsonb_build_object('claimId',x.r->'id','kind','calculation','value',x.r->'displayedRatio','unit','ratio',
     'period',x.r->'measurementDate','supportIds',jsonb_build_array(x.r->'fingerprint')) order by x.n) from jsonb_array_elements(d->'ratios') with ordinality x(r,n))));
 end if;
 if jsonb_typeof(d->'recommendation')='object' then
  blocks:=blocks||jsonb_build_array(jsonb_build_object('blockKey','recommendation','kind','section',
   'content',jsonb_build_object('alternativeId',d#>'{recommendation,alternativeId}'),
   'claims',jsonb_build_array(jsonb_build_object('claimId','recommendation','kind','judgment','value',d#>'{recommendation,alternativeId}','unit',null,'period',null,
    'supportIds',d#>'{recommendation,basisDecisionIds}'))));
 end if;
 blocks:=blocks||jsonb_build_array(
  jsonb_build_object('blockKey','information-gaps','kind','table','claims','[]'::jsonb,
   'content',jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object('subjectId',x.g->'subjectId','code',x.g->'code','reason',x.g->'reason') order by x.n)
    from jsonb_array_elements(d->'informationGaps') with ordinality x(g,n)),'[]'::jsonb))),
  jsonb_build_object('blockKey','contractual-gaps','kind','table','claims','[]'::jsonb,
   'content',jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object('subjectId',x.g->'subjectId','code',x.g->'code') order by x.n)
    from jsonb_array_elements(p_packet->'contractualGaps') with ordinality x(g,n)),'[]'::jsonb))),
  jsonb_build_object('blockKey','next-requirements','kind','section','claims','[]'::jsonb,'content',jsonb_build_object('items',d->'nextRequirements')));
 for alt,alt_no in select x.a,(x.n-1)::integer from jsonb_array_elements(d->'alternatives') with ordinality x(a,n) order by x.n loop
  rws:=alt#>'{projection,rows}';
  continue when jsonb_typeof(rws) is distinct from 'array' or jsonb_array_length(rws)=0;
  for q in select v.code,v.field from (values(1,'lowest_available_cash_by_period','closingAvailable'),(2,'largest_net_financing_outflow_by_period','netFinancingAvailable')) v(o,code,field) order by v.o loop
   if exists(select 1 from jsonb_array_elements(rws) r where jsonb_typeof(r.value->q.field) is distinct from 'string' or (r.value->>q.field) !~ '^-?\d+(\.\d+)?$') then
    raise exception 'artifact_adapter_decimal_invalid' using errcode='22023'; end if;
   select r.value,(r.n-1)::integer into low,low_no from jsonb_array_elements(rws) with ordinality r(value,n) order by (r.value->>q.field)::numeric,r.n limit 1;
   blocks:=blocks||jsonb_build_array(jsonb_build_object('blockKey','decisive:'||q.code||':'||alt_no,'kind','number',
    'content',jsonb_build_object('questionCode',q.code,'alternativeId',alt->'id','unit',alt#>'{projection,currency}','value',low->q.field,'periodLabel',low->'periodId',
     'path','decision.alternatives['||alt_no||'].projection.rows['||low_no||'].'||q.field),
    'claims',jsonb_build_array(jsonb_build_object('claimId',q.code||':'||(alt->>'id'),'kind','calculation','value',low->q.field,'unit',alt#>'{projection,currency}',
     'period',low->'periodId','supportIds',jsonb_build_array(alt#>'{projection,basisFingerprint}',alt#>'{projection,calculationFingerprint}')))));
  end loop;
 end loop;
 return blocks;
end $$;

-- 2. The producer. Called by the commit with the committed receipt already written; idempotent by the
-- derived revision id and, inside the core, by the manifest fingerprint. Never raises: a result that
-- is not a capital-procedure-packet.v2 is reported as unmappable, and any failure of the artifact rolls
-- back its own subtransaction, leaves a warning with the error class only (no value of the result) and
-- is reported as not recorded, so the commit that called it goes on.
create function private.record_execution_result_artifact_v1(p_org uuid,p_execution uuid,p_job uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r private.execution_result_receipts;e public.work_executions;j public.processing_jobs;packet jsonb;blocks jsonb;summary jsonb;
 method jsonb;sources jsonb;traces jsonb;links jsonb;snapshot text;gates text;manifest jsonb;rev_id uuid;result jsonb;code text;
begin
 rev_id:=extensions.uuid_generate_v5(extensions.uuid_ns_url(),'offroad:artifact-revision:execution_result:'||p_execution::text);
 if exists(select 1 from public.artifact_revisions x where x.id=rev_id) then
  return jsonb_build_object('recorded',true,'replayed',true,'revisionId',rev_id);
 end if;
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
   null,null,null,null,j.authorization_subject_id,rev_id,false);
  return jsonb_build_object('recorded',true,'replayed',(result->>'replayed')::boolean,'revisionId',result->'revision_id');
 exception when others then
  code:=case when sqlerrm ~ '^[a-z][a-z0-9_]{0,80}$' then sqlerrm else 'unclassified' end;
  raise warning 'execution_result_artifact_not_recorded: % (%)',code,sqlstate;
  return jsonb_build_object('recorded',false,'reason','execution_result_artifact_failed','code',code,'sqlstate',sqlstate);
 end;
end $$;

-- 3. The commit registers the revision after the receipt and its milestone, by text patch on the
-- milestone statement. A replayed commit returns before this point, so it adds nothing.
do $patch$
declare body text;needle text:=E' perform private.record_execution_result_milestone_v1(j.organization_id,j.execution_id);\n';
begin
 body:=pg_get_functiondef('private.commit_work_execution_result_v1(uuid,text,uuid,text,text,text,text,text)'::regprocedure);
 if (length(body)-length(replace(body,needle,'')))/length(needle)<>1 or position('record_execution_result_artifact_v1' in body)>0 then
  raise exception 'execution_result_artifact_contract_changed';
 end if;
 execute replace(body,needle,needle
  ||E' -- The result as an artifact revision (stage 19); the producer never fails the commit.\n'
  ||E' perform private.record_execution_result_artifact_v1(j.organization_id,j.execution_id,j.id);\n');
end $patch$;

-- 4. Stored bytes are a governed object of the work, by text patch on the manifest validation of the
-- core: a revision whose manifest names bytes.storage is refused unless the upload grant stored that
-- object for this work with the same sha256, byte length and format and the object is in the bucket.
do $patch$
declare body text;needle text:=E' perform private.validate_artifact_manifest_v1(p_manifest);\n';
begin
 body:=pg_get_functiondef('private.create_artifact_revision_v1(uuid,uuid,text,text,text,text,jsonb,jsonb,jsonb,text,bigint,jsonb,uuid,uuid,uuid,boolean)'::regprocedure);
 if (length(body)-length(replace(body,needle,'')))/length(needle)<>1 or position('artifact_stored_bytes_not_governed' in body)>0 then
  raise exception 'artifact_stored_bytes_contract_changed';
 end if;
 execute replace(body,needle,needle||$check$ -- Stored bytes name an object the governed upload stored for this work, with this hash, size and format.
 if jsonb_typeof(p_manifest#>'{bytes,storage}')='object' and not exists(select 1 from private.capital_project_material_upload_grants g
   where g.organization_id=p_org and g.capital_project_id=p_work and g.state='stored' and p_manifest#>>'{bytes,storage,bucket}'='case-artifacts'
    and g.object_path=p_manifest#>>'{bytes,storage,path}' and g.content_sha256=p_manifest#>>'{bytes,sha256}'
    and g.byte_length=(p_manifest#>>'{bytes,byteLength}')::bigint and g.format=p_manifest->>'format'
    and exists(select 1 from storage.objects o where o.bucket_id='case-artifacts' and o.name=g.object_path)) then
  raise exception 'artifact_stored_bytes_not_governed' using errcode='42501';
 end if;
$check$);
end $patch$;

-- 5. Backfill: every committed result without its revision, through the same producer. Idempotent.
create function private.backfill_execution_result_artifacts_v1() returns jsonb
language plpgsql security definer set search_path='' as $$
declare x record;res jsonb;recorded integer:=0;already integer:=0;unmapped integer:=0;failed integer:=0;
begin
 for x in select r.organization_id,r.execution_id,
   (select pj.id from public.processing_jobs pj where pj.organization_id=r.organization_id and pj.execution_id=r.execution_id order by pj.created_at,pj.id limit 1) as job_id
  from private.execution_result_receipts r order by r.organization_id,r.created_at,r.execution_id loop
  res:=private.record_execution_result_artifact_v1(x.organization_id,x.execution_id,x.job_id);
  if (res->>'recorded')::boolean and (res->>'replayed')::boolean then already:=already+1;
  elsif (res->>'recorded')::boolean then recorded:=recorded+1;
  elsif res->>'reason'='execution_result_unmappable' then unmapped:=unmapped+1;
  else failed:=failed+1; end if;
 end loop;
 return jsonb_build_object('recorded',recorded,'alreadyRecorded',already,'unmappable',unmapped,'failed',failed);
end $$;

-- 6. Grants: nothing here is reachable from an API role; the commit and the core call them.
do $$ declare f record;begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='private' and p.proname in ('execution_result_blocks_v1','record_execution_result_artifact_v1','backfill_execution_result_artifacts_v1')
 loop execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);end loop;
end $$;

do $backfill$
declare counts jsonb;
begin
 counts:=private.backfill_execution_result_artifacts_v1();
 raise notice 'execution result artifact backfill: % recorded, % already recorded, % unmappable, % failed',
  counts->>'recorded',counts->>'alreadyRecorded',counts->>'unmappable',counts->>'failed';
end $backfill$;

comment on function private.execution_result_blocks_v1(jsonb) is 'The blocks of an execution result from a capital-procedure-packet.v2, key for key the capitalProcedurePacketBlocks mapping of packages/domain-contracts/src/artifact-protocol.ts: framing, alternatives, ratios, recommendation, information and contractual gaps, next requirements and one number block per decisive number (selected with the chart series rule, never computed), each claim with its supportIds.';
comment on function private.record_execution_result_artifact_v1(uuid,uuid,uuid) is 'Registers the committed result of an execution as its execution_result revision (origin worker, audience internal, no bytes) through private.create_artifact_revision_v1, with the revision id a version 5 UUID of the execution. Never raises: a result that is not a capital-procedure-packet.v2 is reported as unmappable and any failure of the artifact is reported as not recorded, so the commit goes on.';
comment on function private.backfill_execution_result_artifacts_v1() is 'Registers the execution_result revision of every committed result that has none, through the same producer as the commit. Idempotent.';
