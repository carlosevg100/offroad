-- A packet without comparison, metrics or cases is refused: the guard compares types null-safely.
create or replace function private.execution_result_investment_blocks_v1(p_packet jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare c jsonb:=p_packet->'comparison';fp jsonb;
begin
 if jsonb_typeof(p_packet) is distinct from 'object' or p_packet->>'schemaVersion' is distinct from 'investment-decision-packet.v1'
 or jsonb_typeof(c) is distinct from 'object' or jsonb_typeof(c->'metrics') is distinct from 'array'
 or jsonb_typeof(p_packet->'cases') is distinct from 'array' then raise exception 'execution_result_unmappable' using errcode='22023'; end if;
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
