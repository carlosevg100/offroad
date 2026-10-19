-- The comparison result shows covenant headroom in EBITDA as well as in points, as the packet now
-- states it (ficha C02 step 5). Key for key financingComparisonPacketBlocks; values copied, never recomputed.
set local lock_timeout='5s';

create or replace function private.execution_result_comparison_blocks_v1(p_packet jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare c jsonb:=p_packet->'comparison';fp jsonb;
begin
 if jsonb_typeof(p_packet) is distinct from 'object' or p_packet->>'schemaVersion' is distinct from 'financing-comparison-packet.v1' or jsonb_typeof(c) is distinct from 'object'
 or jsonb_typeof(c->'cases') is distinct from 'array' or jsonb_typeof(p_packet->'cases') is distinct from 'array' then raise exception 'execution_result_unmappable' using errcode='22023'; end if;
 select coalesce(jsonb_object_agg(x.v->>'id',x.v#>'{result,fingerprint}'),'{}'::jsonb) into fp from jsonb_array_elements(p_packet->'cases') x(v);
 return jsonb_build_array(
  jsonb_build_object('blockKey','framing','kind','section','claims','[]'::jsonb,
   'content',jsonb_build_object('status',p_packet->'status','question',p_packet->'question','currency',p_packet->'currency','baseCaseId',c->'baseCaseId',
    'caseCount',jsonb_array_length(p_packet->'cases'),'nominalSpreadMisleads',coalesce(c->'nominalSpreadMisleads','null'::jsonb))),
  jsonb_build_object('blockKey','cases','kind','table',
   'content',jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object('id',x.v->'id','role',x.v->'role','label',x.v->'label','changes',x.v->'changes') order by x.n)
    from jsonb_array_elements(p_packet->'cases') with ordinality x(v,n)),'[]'::jsonb)),
   'claims',coalesce((select jsonb_agg(jsonb_build_object('claimId',x.v->'id','kind','judgment','value',x.v->'label','unit',null,'period',null,
    'supportIds',jsonb_build_array(x.v#>'{result,fingerprint}')) order by x.n) from jsonb_array_elements(p_packet->'cases') with ordinality x(v,n)),'[]'::jsonb)),
  jsonb_build_object('blockKey','proposals','kind','table',
   'content',jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object('caseId',k.v->'caseId','proposalId',q.v->'proposalId','label',q.v->'label',
     'equivalentSpread',coalesce(q.v->'equivalentSpread','null'::jsonb),'weightedAverageLifeYears',q.v->'weightedAverageLifeYears','minimumCash',q.v#>'{minimumCash,amount}',
     'minimumCashPeriod',q.v#>'{minimumCash,periodId}','worstRatio',q.v#>'{covenant,worstRatio}','worstPeriod',q.v#>'{covenant,worstPeriod}','headroom',q.v#>'{covenant,headroom}','ebitdaHeadroom',q.v#>'{covenant,ebitdaHeadroom}',
     'covenantComplies',q.v#>'{covenant,allComply}','covenantTestsPerYear',q.v->'covenantTestsPerYear','collateralConsumed',q.v->'collateralConsumed',
     'freeReceivablesAfter',q.v->'freeReceivablesAfter','horizonFinancingCost',q.v->'horizonFinancingCost','netDebtAtHorizon',q.v->'netDebtAtHorizon',
     'eliminatoryFacts',q.v->'eliminatoryFacts','conditioningFacts',q.v->'conditioningFacts') order by k.n,q.m)
    from jsonb_array_elements(c->'cases') with ordinality k(v,n), jsonb_array_elements(k.v->'proposals') with ordinality q(v,m)),'[]'::jsonb)),
   'claims',coalesce((select jsonb_agg(z.claim order by z.n,z.m,z.o) from (
     select k.n,q.m,1 as o,jsonb_build_object('claimId','spread:'||(k.v->>'caseId')||':'||(q.v->>'proposalId'),'kind','calculation','value',q.v->'equivalentSpread','unit','ratio','period',null,
      'supportIds',jsonb_build_array(coalesce(fp->(k.v->>'caseId'),p_packet->'fingerprint'))) as claim
     from jsonb_array_elements(c->'cases') with ordinality k(v,n), jsonb_array_elements(k.v->'proposals') with ordinality q(v,m) where jsonb_typeof(q.v->'equivalentSpread')='string'
     union all
     select k.n,q.m,2,jsonb_build_object('claimId','minimum-cash:'||(k.v->>'caseId')||':'||(q.v->>'proposalId'),'kind','calculation','value',q.v#>'{minimumCash,amount}','unit',p_packet->'currency',
      'period',q.v#>'{minimumCash,periodId}','supportIds',jsonb_build_array(coalesce(fp->(k.v->>'caseId'),p_packet->'fingerprint')))
     from jsonb_array_elements(c->'cases') with ordinality k(v,n), jsonb_array_elements(k.v->'proposals') with ordinality q(v,m)) z),'[]'::jsonb)),
  jsonb_build_object('blockKey','debt-service','kind','table','claims','[]'::jsonb,
   'content',jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object('caseId',k.v->'caseId','proposalId',q.v->'proposalId','year',to_jsonb(d.key),'amount',d.value) order by k.n,q.m,d.key collate "C")
    from jsonb_array_elements(c->'cases') with ordinality k(v,n), jsonb_array_elements(k.v->'proposals') with ordinality q(v,m), jsonb_each(q.v->'debtServiceByYear') d),'[]'::jsonb))),
  jsonb_build_object('blockKey','conclusion','kind','section','claims','[]'::jsonb,
   'content',jsonb_build_object('viableInEveryCaseProposalIds',coalesce(c->'viableInEveryCaseProposalIds','[]'::jsonb),'conclusionChangingCaseIds',coalesce(c->'conclusionChangingCaseIds','[]'::jsonb),
    'cases',coalesce((select jsonb_agg(jsonb_build_object('caseId',k.v->'caseId','viableProposalIds',k.v->'viableProposalIds','incompleteProposalIds',k.v->'incompleteProposalIds',
     'lowestEquivalentCostProposalId',coalesce(k.v->'lowestEquivalentCostProposalId','null'::jsonb),'highestMinimumCashProposalId',coalesce(k.v->'highestMinimumCashProposalId','null'::jsonb)) order by k.n)
     from jsonb_array_elements(c->'cases') with ordinality k(v,n)),'[]'::jsonb))),
  jsonb_build_object('blockKey','information-gaps','kind','table','claims','[]'::jsonb,
   'content',jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object('caseId',g.v->'caseId','operand',g.v->'operand','reason',g.v->'reason') order by g.n)
    from jsonb_array_elements(p_packet->'gaps') with ordinality g(v,n)),'[]'::jsonb))),
  jsonb_build_object('blockKey','exclusions','kind','section','claims','[]'::jsonb,'content',jsonb_build_object('items',coalesce(p_packet->'exclusions','[]'::jsonb))));
end $$;
revoke all on function private.execution_result_comparison_blocks_v1(jsonb) from public,anon,authenticated,service_role;