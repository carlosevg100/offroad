-- Investment decision results are recorded as execution_result revisions, like capital results.
set local lock_timeout='5s';

-- Investment results become an execution_result revision too. Key for key the TypeScript mapping
-- investmentDecisionPacketBlocks of packages/domain-contracts/src/artifact-protocol.ts; values are
-- copied from the packet, never recomputed.
create function private.execution_result_investment_blocks_v1(p_packet jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare c jsonb:=p_packet->'comparison';fp jsonb;
begin
 if jsonb_typeof(p_packet)<>'object' or p_packet->>'schemaVersion' is distinct from 'investment-decision-packet.v1' or jsonb_typeof(c)<>'object'
 or jsonb_typeof(p_packet->'cases')<>'array' then raise exception 'execution_result_unmappable' using errcode='22023'; end if;
 select coalesce(jsonb_object_agg(x.v->>'id',x.v#>'{result,fingerprint}'),'{}'::jsonb) into fp from jsonb_array_elements(p_packet->'cases') x(v);
 return jsonb_build_array(
  jsonb_build_object('blockKey','framing','kind','section','claims','[]'::jsonb,
   'content',jsonb_build_object('status',p_packet->'status','question',p_packet->'question','currency',p_packet->'currency','baseCaseId',c->'baseCaseId',
    'caseCount',jsonb_array_length(p_packet->'cases'))),
  jsonb_build_object('blockKey','cases','kind','table',
   'content',jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object('id',x.v->'id','role',x.v->'role','label',x.v->'label','changes',x.v->'changes') order by x.n)
    from jsonb_array_elements(p_packet->'cases') with ordinality x(v,n)),'[]'::jsonb)),
   'claims',coalesce((select jsonb_agg(jsonb_build_object('claimId',x.v->'id','kind','judgment','value',x.v->'label','unit',null,'period',null,
    'supportIds',jsonb_build_array(x.v#>'{result,fingerprint}')) order by x.n) from jsonb_array_elements(p_packet->'cases') with ordinality x(v,n)),'[]'::jsonb)),
  jsonb_build_object('blockKey','metrics','kind','table',
   'content',jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object('caseId',m.v->'caseId','netPresentValue',m.v->'netPresentValue',
     'deltaNetPresentValue',m.v->'deltaNetPresentValue','annualIrr',m.v->'annualIrr','irrStatus',m.v->'irrStatus','discountRate',m.v->'discountRate',
     'paybackYears',m.v->'paybackYears','startupWorkingCapital',m.v->'startupWorkingCapital',
     'peakCashNeed',coalesce(m.v#>'{peakCumulativeCashNeed,amount}','null'::jsonb),'peakCashNeedDate',coalesce(m.v#>'{peakCumulativeCashNeed,periodEndDate}','null'::jsonb),
     'companyMinimumCashWithout',coalesce(m.v#>'{companyMinimumCash,withoutProject,amount}','null'::jsonb),'companyMinimumCashWithoutDate',coalesce(m.v#>'{companyMinimumCash,withoutProject,periodEndDate}','null'::jsonb),
     'companyMinimumCashWith',coalesce(m.v#>'{companyMinimumCash,withProject,amount}','null'::jsonb),'companyMinimumCashWithDate',coalesce(m.v#>'{companyMinimumCash,withProject,periodEndDate}','null'::jsonb),
     'resultStatus',m.v->'resultStatus') order by m.n) from jsonb_array_elements(c->'metrics') with ordinality m(v,n)),'[]'::jsonb)),
   'claims',coalesce((select jsonb_agg(q.claim order by q.n,q.k) from (
     select m.n,1 as k,jsonb_build_object('claimId','npv:'||(m.v->>'caseId'),'kind','calculation','value',m.v->'netPresentValue','unit',p_packet->'currency','period',null,
      'supportIds',jsonb_build_array(coalesce(fp->(m.v->>'caseId'),p_packet->'fingerprint'))) as claim
     from jsonb_array_elements(c->'metrics') with ordinality m(v,n) where jsonb_typeof(m.v->'netPresentValue')='string'
     union all
     select m.n,2,jsonb_build_object('claimId','irr:'||(m.v->>'caseId'),'kind','calculation','value',m.v->'annualIrr','unit','ratio','period',null,
      'supportIds',jsonb_build_array(coalesce(fp->(m.v->>'caseId'),p_packet->'fingerprint')))
     from jsonb_array_elements(c->'metrics') with ordinality m(v,n) where jsonb_typeof(m.v->'annualIrr')='string'
     union all
     select m.n,3,jsonb_build_object('claimId','payback:'||(m.v->>'caseId'),'kind','calculation','value',m.v->'paybackYears','unit','years','period',null,
      'supportIds',jsonb_build_array(coalesce(fp->(m.v->>'caseId'),p_packet->'fingerprint')))
     from jsonb_array_elements(c->'metrics') with ordinality m(v,n) where jsonb_typeof(m.v->'paybackYears')='string') q),'[]'::jsonb)),
  jsonb_build_object('blockKey','conclusion','kind','section','claims','[]'::jsonb,
   'content',jsonb_build_object('conclusionChangingCaseIds',coalesce(c->'conclusionChangingCaseIds','[]'::jsonb),'timingCaseIds',coalesce(c->'timingCaseIds','[]'::jsonb))),
  jsonb_build_object('blockKey','information-gaps','kind','table','claims','[]'::jsonb,
   'content',jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object('caseId',g.v->'caseId','operand',g.v->'operand','reason',g.v->'reason') order by g.n)
    from jsonb_array_elements(p_packet->'gaps') with ordinality g(v,n)),'[]'::jsonb))),
  jsonb_build_object('blockKey','exclusions','kind','section','claims','[]'::jsonb,'content',jsonb_build_object('items',coalesce(p_packet->'exclusions','[]'::jsonb))));
end $$;
revoke all on function private.execution_result_investment_blocks_v1(jsonb) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.project_execution_result_artifact_v1(p_org uuid, p_execution uuid, p_job uuid, p_rights_subject uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r private.execution_result_receipts;e public.work_executions;j public.processing_jobs;packet jsonb;blocks jsonb;summary jsonb;
 method jsonb;sources jsonb;traces jsonb;links jsonb;snapshot text;gates text;manifest jsonb;rev_id uuid;result jsonb;code text;closure jsonb;historical public.artifact_revisions;
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
 if jsonb_typeof(packet)<>'object' or packet->>'schemaVersion' is null or packet->>'schemaVersion' not in ('capital-procedure-packet.v2','investment-decision-packet.v1') then
  return jsonb_build_object('recorded',false,'reason','execution_result_unmappable');
 end if;
 begin
  select * into j from public.processing_jobs x where x.organization_id=p_org and x.id=p_job and x.execution_id=p_execution;
  if j.id is null or p_rights_subject is null then raise exception 'execution_artifact_origin_missing' using errcode='42501'; end if;
  closure:=private.execution_result_source_closure_v1(p_org,p_execution);
  if closure is null or not private.execution_closure_read_allowed_v1(p_org,closure,p_rights_subject) then raise exception 'execution_artifact_closure_denied' using errcode='42501';end if;
  blocks:=case packet->>'schemaVersion' when 'investment-decision-packet.v1' then private.execution_result_investment_blocks_v1(packet) else private.execution_result_blocks_v1(packet) end;
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
    select 'capital-procedure-packet:'||(packet->>'fingerprint') as trace,1::bigint as n where packet->>'schemaVersion'='capital-procedure-packet.v2'
    union all select 'capital-decision-delivery:'||(packet#>>'{decision,fingerprint}'),2 where packet->>'schemaVersion'='capital-procedure-packet.v2'
    union all select 'financial-core:'||(packet#>>'{decision,provenance,financialCoreVersion}'),3 where packet->>'schemaVersion'='capital-procedure-packet.v2'
    union all select 'ratio:'||(x.v->>'id')||':'||(x.v->>'fingerprint'),3+x.n
     from jsonb_array_elements(case when packet->>'schemaVersion'='capital-procedure-packet.v2' then packet#>'{decision,ratios}' else '[]'::jsonb end) with ordinality x(v,n)
    -- Investment results: the packet, then each case result the metrics cite.
    union all select 'investment-decision-packet:'||(packet->>'fingerprint'),1 where packet->>'schemaVersion'='investment-decision-packet.v1'
    union all select 'financial-core:'||(packet->>'financialCoreVersion'),2 where packet->>'schemaVersion'='investment-decision-packet.v1' and packet ? 'financialCoreVersion'
    union all select 'investment-case:'||(x.v->>'id')||':'||(x.v#>>'{result,fingerprint}'),2+x.n
     from jsonb_array_elements(case when packet->>'schemaVersion'='investment-decision-packet.v1' then packet->'cases' else '[]'::jsonb end) with ordinality x(v,n)
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
  -- Exact legacy constructor remains replayable only when the stored manifest is identical.
  -- The common writer still verifies every ordered block and normalized dependency edge.
  select * into historical from public.artifact_revisions where organization_id=p_org and id=rev_id;
  if historical.id is null or historical.manifest is distinct from manifest then
   if exists(select 1 from jsonb_array_elements(coalesce(packet->'contractSourceVersionIds','[]')) own
    where not exists(select 1 from jsonb_array_elements(closure->'sources') pin where pin->>'sourceVersionId'=own#>>'{}'))
    then raise exception 'execution_artifact_contract_source_unbound' using errcode='42501';end if;
   select coalesce(jsonb_agg(jsonb_build_object('sourceVersionId',pin->'sourceVersionId','rightsVersionId',pin->'rightsVersionId')
    order by pin->>'sourceVersionId',pin->>'rightsVersionId'),'[]') into sources from jsonb_array_elements(closure->'sources') pin;
   manifest:=jsonb_set(manifest,'{sources}',sources);
  end if;
  -- The commit keeps its own lock order: the revision is new per execution, so only its artifact row is locked.
  result:=private.create_artifact_revision_v1(p_org,e.work_id,'execution_result','execution:'||p_execution::text,'internal','worker',manifest,blocks,links,
   null,null,null,null,p_rights_subject,rev_id,false);
  if result->>'revision_id' is distinct from rev_id::text then raise exception 'execution_artifact_identity_mismatch' using errcode='23505'; end if;
  if not private.execution_closure_read_allowed_v1(p_org,closure,p_rights_subject) then raise exception 'execution_artifact_closure_denied' using errcode='42501';end if;
  return jsonb_build_object('recorded',true,'replayed',(result->>'replayed')::boolean,'revisionId',result->'revision_id');
 exception when others then
  code:=case when sqlerrm ~ '^[a-z][a-z0-9_]{0,80}$' then sqlerrm else 'unclassified' end;
  raise warning 'execution_result_artifact_not_recorded: % (%)',code,sqlstate;
  return jsonb_build_object('recorded',false,'reason','execution_result_artifact_failed','code',code,'sqlstate',sqlstate);
 end;
end $function$;
revoke all on function private.project_execution_result_artifact_v1(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
