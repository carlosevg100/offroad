-- Corrections from the independent review of the lote 1 bridge (fichas C02 and C04).
-- 1. The comparison and the capacity confirm each proposal into its own working context, so premises
--    a later proposal leaves out (the amount asked, a limit, an alternative) never survive, and one
--    confirmation never exceeds the 256 premises of a basis by accumulation.
-- 2. The capacity blocks name the binding scenario only when the review lists it.
-- 3. The cited reply tells a gap from a refusal, for the comparison and for the capacity.
set local lock_timeout='5s';

alter table public.work_premise_proposals drop constraint work_premise_proposals_context_key_check;
alter table public.work_premise_proposals add constraint work_premise_proposals_context_key_check
  check ((method_id = 'analyze-investment-project' and context_key = 'investimento')
    or (method_id = 'compare-financing-proposals' and context_key ~ '^propostas(:[0-9a-f]{16})?$')
    or (method_id = 'assess-debt-capacity' and context_key ~ '^capacidade(:[0-9a-f]{16})?$'));

create or replace function private.worker_record_agent_response_with_premises_v1(p_job_id uuid, p_capability_token text, p_assistant_message_id uuid, p_response jsonb, p_premises jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare job_row public.processing_jobs; session_row public.document_intake_sessions; result jsonb; source uuid; h jsonb; ctx text; prefix text;
begin
  result := private.worker_record_agent_response_and_activate_v7(p_job_id, p_capability_token, null, p_assistant_message_id, p_response);
  job_row := private.job_for_capability(p_job_id, p_capability_token);
  if job_row.kind <> 'agent_operation_brief' then raise exception 'agent_operation_brief_capability_required' using errcode = '42501'; end if;
  if p_premises is null or jsonb_typeof(p_premises) <> 'object' or octet_length(p_premises::text) > 1048576
    or p_premises - array['methodId', 'methodVersion', 'facts', 'hypotheses', 'summary', 'fingerprint'] <> '{}'::jsonb
    or not (p_premises ?& array['methodId', 'methodVersion', 'facts', 'hypotheses', 'summary', 'fingerprint'])
    or jsonb_typeof(p_premises -> 'hypotheses') <> 'array' then raise exception 'invalid_premise_proposal' using errcode = '22023'; end if;
  -- The comparison and the capacity confirm each proposal into its own context, named by its fingerprint,
  -- so a premise a later proposal leaves out never survives from an earlier confirmation.
  ctx := case p_premises ->> 'methodId' when 'analyze-investment-project' then 'investimento'
    when 'compare-financing-proposals' then 'propostas:' || left(p_premises ->> 'fingerprint', 16)
    when 'assess-debt-capacity' then 'capacidade:' || left(p_premises ->> 'fingerprint', 16) end;
  prefix := case p_premises ->> 'methodId' when 'analyze-investment-project' then 'investment' when 'compare-financing-proposals' then 'comparison' when 'assess-debt-capacity' then 'debt_capacity' end;
  if ctx is null then raise exception 'invalid_premise_proposal' using errcode = '22023'; end if;
  for h in select value from jsonb_array_elements(p_premises -> 'hypotheses') loop
    if jsonb_typeof(h) <> 'object' or h - array['fieldPath', 'dimensions', 'value', 'reason'] <> '{}'::jsonb
      or not (h ?& array['fieldPath', 'dimensions', 'value', 'reason']) or jsonb_typeof(h -> 'fieldPath') <> 'string'
      or (h ->> 'fieldPath') !~ ('^' || prefix || '\.[0-9a-f-]{36}\.[A-Za-z0-9_.-]{1,200}$')
      or jsonb_typeof(h -> 'dimensions') <> 'object' or jsonb_typeof(h -> 'value') <> 'object' or jsonb_typeof(h -> 'reason') <> 'string'
    then raise exception 'invalid_premise_hypothesis' using errcode = '22023'; end if;
  end loop;
  select * into session_row from public.document_intake_sessions where organization_id = job_row.organization_id and id = job_row.intake_session_id;
  source := (job_row.payload ->> 'message_id')::uuid;
  update public.work_premise_proposals set status = 'superseded'
    where organization_id = job_row.organization_id and capital_project_id = session_row.capital_project_id
      and method_id = p_premises ->> 'methodId' and status = 'proposed' and source_message_id <> source;
  insert into public.work_premise_proposals (organization_id, capital_project_id, intake_session_id, source_message_id, assistant_message_id,
    method_id, method_version, purpose, context_key, facts, hypotheses, summary, fingerprint)
  values (job_row.organization_id, session_row.capital_project_id, session_row.id, source, p_assistant_message_id,
    p_premises ->> 'methodId', p_premises ->> 'methodVersion', 'prepare-capital-structure-decision', ctx,
    p_premises -> 'facts', p_premises -> 'hypotheses', p_premises -> 'summary', p_premises ->> 'fingerprint')
  on conflict (organization_id, source_message_id, method_id) do nothing;
  return result;
end $$;

create or replace function private.execution_result_capacity_blocks_v1(p_packet jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare cmp jsonb:=p_packet->'comparison';
begin
 if jsonb_typeof(p_packet) is distinct from 'object' or p_packet->>'schemaVersion' is distinct from 'debt-capacity-packet.v1' or jsonb_typeof(cmp) is distinct from 'object'
 or jsonb_typeof(p_packet->'cases') is distinct from 'array' then raise exception 'execution_result_unmappable' using errcode='22023'; end if;
 return jsonb_build_array(
  jsonb_build_object('blockKey','framing','kind','section','claims','[]'::jsonb,
   'content',jsonb_build_object('status',p_packet->'status','question',p_packet->'question','currency',p_packet->'currency','informedCaseId',cmp->'informedCaseId',
    'largestCapacityCaseId',coalesce(cmp->'largestCapacityCaseId','null'::jsonb),'requestedFitsIn',coalesce(cmp->'requestedFitsIn','[]'::jsonb))),
  jsonb_build_object('blockKey','cases','kind','table',
   'content',jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object('id',x.v->'caseId','role',x.v->'role','label',x.v->'label','changes',x.v->'changes') order by x.n)
    from jsonb_array_elements(p_packet->'cases') with ordinality x(v,n)),'[]'::jsonb)),
   'claims',coalesce((select jsonb_agg(jsonb_build_object('claimId',x.v->'caseId','kind','judgment','value',x.v->'label','unit',null,'period',null,
    'supportIds',jsonb_build_array(p_packet->'fingerprint')) order by x.n) from jsonb_array_elements(p_packet->'cases') with ordinality x(v,n)),'[]'::jsonb)),
  jsonb_build_object('blockKey','capacity','kind','table',
   'content',jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object('caseId',x.v->'caseId','capacity',coalesce(x.v->'capacity','null'::jsonb),
     'capacityStatus',coalesce(x.v->'capacityStatus','null'::jsonb),'resultStatus',x.v->'resultStatus',
     'bindingLimitId',coalesce(x.v#>'{binding,limitId}','null'::jsonb),'bindingDate',coalesce(x.v#>'{binding,date}','null'::jsonb),
     'bindingScenario',case when jsonb_typeof(x.v->'binding') is distinct from 'object' then 'null'::jsonb
      else coalesce((select case s.n when 1 then '"base"'::jsonb when 2 then '"adverse"'::jsonb end
        from jsonb_array_elements(case when jsonb_typeof(x.v->'review')='object' then x.v#>'{review,scenarios}' else '[]'::jsonb end) with ordinality s(v,n)
        where s.v->>'scenarioId'=x.v#>>'{binding,scenarioId}' order by s.n limit 1),'null'::jsonb) end,
     'boundedBySearchDomain',coalesce(x.v->'boundedBySearchDomain','null'::jsonb),'calibrationOnly',coalesce(x.v->'calibrationOnly','null'::jsonb)) order by x.n)
    from jsonb_array_elements(p_packet->'cases') with ordinality x(v,n)),'[]'::jsonb)),
   'claims',coalesce((select jsonb_agg(jsonb_build_object('claimId','capacity:'||(x.v->>'caseId'),'kind','calculation','value',x.v->'capacity','unit',p_packet->'currency','period',null,
    'supportIds',jsonb_build_array(p_packet->'fingerprint')) order by x.n)
    from jsonb_array_elements(p_packet->'cases') with ordinality x(v,n) where jsonb_typeof(x.v->'capacity')='string'),'[]'::jsonb)),
  jsonb_build_object('blockKey','limits','kind','table','claims','[]'::jsonb,
   'content',jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object('caseId',x.v->'caseId','limitId',l.v->'id','label',l.v->'label',
     'capacity',coalesce(l.v->'capacity','null'::jsonb),'status',coalesce(l.v->'status','null'::jsonb)) order by x.n,l.m)
    from jsonb_array_elements(p_packet->'cases') with ordinality x(v,n), jsonb_array_elements(x.v->'limits') with ordinality l(v,m)),'[]'::jsonb))),
  jsonb_build_object('blockKey','review','kind','table','claims','[]'::jsonb,
   'content',jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object('caseId',x.v->'caseId','scenario',case when s.m=1 then 'base' else 'adverse' end,
     'amount',x.v#>'{review,amount}','fits',x.v#>'{review,fits}','failingLimitIds',x.v#>'{review,failingLimitIds}',
     'peakLeverage',s.v#>'{peakLeverage,value}','peakLeverageDate',s.v#>'{peakLeverage,date}','minimumCash',s.v#>'{minimumCash,value}','minimumCashDate',s.v#>'{minimumCash,date}',
     'minimumInterestCoverage',coalesce(s.v#>'{minimumInterestCoverage,value}','null'::jsonb),'minimumInterestCoverageDate',coalesce(s.v#>'{minimumInterestCoverage,date}','null'::jsonb)) order by x.n,s.m)
    from jsonb_array_elements(p_packet->'cases') with ordinality x(v,n), jsonb_array_elements(case when jsonb_typeof(x.v->'review')='object' then x.v#>'{review,scenarios}' else '[]'::jsonb end) with ordinality s(v,m)),'[]'::jsonb))),
  jsonb_build_object('blockKey','plan','kind','table','claims','[]'::jsonb,
   'content',jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object('caseId',x.v->'caseId','date',p.v->'date','scheduledExistingPrincipal',p.v->'scheduledExistingPrincipal',
     'cashAfterInterest',p.v->'cashAfterInterest','paysWithoutRefinancing',p.v->'paysWithoutRefinancing') order by x.n,p.m)
    from jsonb_array_elements(p_packet->'cases') with ordinality x(v,n), jsonb_array_elements(case when x.v->>'role'='informed' and jsonb_typeof(x.v->'plan')='array' then x.v->'plan' else '[]'::jsonb end) with ordinality p(v,m)),'[]'::jsonb))),
  jsonb_build_object('blockKey','information-gaps','kind','table','claims','[]'::jsonb,
   'content',jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object('caseId',x.v->'caseId','operand',g.v->'operand','reason',g.v->'reason') order by x.n,g.m)
    from jsonb_array_elements(p_packet->'cases') with ordinality x(v,n), jsonb_array_elements(coalesce(x.v->'gaps','[]'::jsonb)) with ordinality g(v,m)),'[]'::jsonb))),
  jsonb_build_object('blockKey','exclusions','kind','section','claims','[]'::jsonb,'content',jsonb_build_object('items',coalesce(p_packet->'exclusions','[]'::jsonb))));
end $$;

create or replace function private.record_execution_result_reply_v1(p_org uuid,p_execution uuid,p_job uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare rev_id uuid;msg_id uuid;pr public.work_premise_proposals;am public.agent_messages;r private.execution_result_receipts;
 packet jsonb;creator uuid;labels text;gaps text;n integer;calculated integer;reviewed boolean;txt text;question text;pt boolean;
begin
 rev_id:=extensions.uuid_generate_v5(extensions.uuid_ns_url(),'offroad:artifact-revision:execution_result:'||p_execution::text);
 msg_id:=extensions.uuid_generate_v5(extensions.uuid_ns_url(),'offroad:execution-result-reply:'||p_execution::text);
 -- Cite only a revision that exists.
 if not exists(select 1 from public.artifact_revisions a where a.organization_id=p_org and a.id=rev_id) then
  return jsonb_build_object('recorded',false,'reason','revision_missing'); end if;
 select x.* into pr from private.execution_dependencies d join public.work_premise_proposals x
  on x.organization_id=d.organization_id and x.confirmed_version_id=d.assumption_version_id
 where d.organization_id=p_org and d.execution_id=p_execution and d.dependency_kind='assumption_slot'
 order by x.confirmed_at desc nulls last,x.id limit 1;
 if pr.id is null then return jsonb_build_object('recorded',false,'reason','no_conversation'); end if;
 select m.* into am from public.agent_messages m where m.organization_id=p_org and m.id=pr.assistant_message_id;
 select x.* into r from private.execution_result_receipts x where x.organization_id=p_org and x.execution_id=p_execution;
 if am.id is null or r.execution_id is null then return jsonb_build_object('recorded',false,'reason','no_conversation'); end if;
 packet:=r.canonical_result::jsonb;
 if packet->>'schemaVersion' is null or packet->>'schemaVersion' not in ('investment-decision-packet.v1','financing-comparison-packet.v1','debt-capacity-packet.v1') then
  return jsonb_build_object('recorded',false,'reason','unsupported_result'); end if;
 select j.authorization_subject_id into creator from public.processing_jobs j where j.organization_id=p_org and j.id=p_job;
 n:=jsonb_array_length(packet->'cases');
 question:=left(packet->>'question',300); pt:=am.locale='pt-BR';
 if packet->>'schemaVersion'='financing-comparison-packet.v1' then
  -- The offers viable in every adopted case, by the labels the base case carries.
  select string_agg(p.v->>'label','; ' order by p.m) into labels
  from jsonb_array_elements(packet#>'{comparison,cases,0,proposals}') with ordinality p(v,m)
  where p.v->>'proposalId' in (select jsonb_array_elements_text(coalesce(packet#>'{comparison,viableInEveryCaseProposalIds}','[]')));
  -- Offers without a complete reading in some case are named apart: a gap is not a refusal.
  select string_agg(distinct p.v->>'label','; ') into gaps
  from jsonb_array_elements(packet#>'{comparison,cases}') c(v), jsonb_array_elements(c.v->'proposals') p(v)
  where p.v->>'proposalId' in (select jsonb_array_elements_text(coalesce(c.v->'incompleteProposalIds','[]')));
  txt:=case when pt then
    case when r.outcome='succeeded' then 'Comparação concluída' else 'Comparação concluída com lacunas' end||' para "'||question||'". '
    ||n||case when n=1 then ' caso calculado' else ' casos calculados' end||' sobre as premissas confirmadas. '
    ||coalesce('Cabem em todos os casos adotados: '||labels||'. ',case when gaps is null then 'Nenhuma proposta cabe em todos os casos adotados. '
      else 'Nenhuma proposta com leitura completa cabe em todos os casos adotados. ' end)
    ||coalesce('Sem leitura completa por lacuna: '||gaps||'. ','')
    ||'Custo efetivo pela vida, caixa com a dívida vigente, covenant na definição de cada credor, garantia e o que elimina antes da preferência estão no resultado registrado, cada número com a origem.'
   else
    case when r.outcome='succeeded' then 'Comparison completed' else 'Comparison completed with gaps' end||' for "'||question||'". '
    ||n||case when n=1 then ' case calculated' else ' cases calculated' end||' on the confirmed premises. '
    ||coalesce('Viable in every adopted case: '||labels||'. ',case when gaps is null then 'No offer is viable in every adopted case. '
      else 'No offer with a complete reading is viable in every adopted case. ' end)
    ||coalesce('Without a complete reading because of gaps: '||gaps||'. ','')
    ||'Lifetime cost, cash with the existing debt, each lender''s covenant definition, collateral and what eliminates before preference are in the recorded result, each number with its origin.'
   end;
 elsif packet->>'schemaVersion'='debt-capacity-packet.v1' then
  -- The schedules in which the amount asked fits; those without a reading of it are named apart,
  -- and only schedules with a measured capacity count as calculated.
  select string_agg(c.v->>'label','; ' order by c.n) filter (where c.v->>'caseId' in (select jsonb_array_elements_text(coalesce(packet#>'{comparison,requestedFitsIn}','[]')))),
   string_agg(c.v->>'label','; ' order by c.n) filter (where jsonb_typeof(c.v->'review') is distinct from 'object'),
   count(*) filter (where jsonb_typeof(c.v->'capacity')='string')
   into labels,gaps,calculated from jsonb_array_elements(packet->'cases') with ordinality c(v,n);
  reviewed:=exists(select 1 from jsonb_array_elements(packet->'cases') c(v) where jsonb_typeof(c.v->'review')='object');
  txt:=case when pt then
    case when r.outcome='succeeded' then 'Capacidade medida' else 'Capacidade medida com lacunas' end||' para "'||question||'". '
    ||case when calculated=n then n||case when n=1 then ' cronograma calculado' else ' cronogramas calculados' end
      else calculated||' de '||n||' cronogramas calculados' end||' no caso da companhia e no adverso, sobre as premissas confirmadas. '
    ||case when not reviewed then ''
      else coalesce('O valor pedido cabe em: '||labels||'. ','O valor pedido não cabe em nenhum cronograma com leitura. ')
        ||coalesce('Sem leitura do valor pedido por lacuna: '||gaps||'. ','') end
    ||'O maior valor sob cada limite, o limite que prende e quando, e o plano vigente contra o caixa estão no resultado registrado, cada número com a origem.'
   else
    case when r.outcome='succeeded' then 'Capacity measured' else 'Capacity measured with gaps' end||' for "'||question||'". '
    ||case when calculated=n then n||case when n=1 then ' schedule calculated' else ' schedules calculated' end
      else calculated||' of '||n||' schedules calculated' end||' in the company''s case and the adverse case, on the confirmed premises. '
    ||case when not reviewed then ''
      else coalesce('The amount asked fits in: '||labels||'. ','The amount asked fits in no schedule with a reading. ')
        ||coalesce('No reading of the amount asked because of gaps: '||gaps||'. ','') end
    ||'The largest amount under each limit, the binding limit and when, and the plan in place against cash are in the recorded result, each number with its origin.'
   end;
 else
 select string_agg(c.v->>'label','; ' order by k.n) into labels
 from jsonb_array_elements_text(coalesce(packet#>'{comparison,conclusionChangingCaseIds}','[]')) with ordinality k(id,n)
 join jsonb_array_elements(packet->'cases') c(v) on c.v->>'id'=k.id;
 txt:=case when pt then
   case when r.outcome='succeeded' then 'Cálculo concluído' else 'Cálculo concluído com lacunas' end||' para "'||question||'". '
   ||n||case when n=1 then ' cenário calculado' else ' cenários calculados' end||' sobre as premissas confirmadas. '
   ||coalesce('Mudam o sinal do valor em relação ao caso base: '||labels||'. ','Nenhum cenário muda o sinal do valor em relação ao caso base. ')
   ||'Valor, retorno, payback, giro de partida e caixa da companhia com e sem o projeto estão no resultado registrado, cada número com a origem.'
  else
   case when r.outcome='succeeded' then 'Calculation completed' else 'Calculation completed with gaps' end||' for "'||question||'". '
   ||n||case when n=1 then ' scenario calculated' else ' scenarios calculated' end||' on the confirmed premises. '
   ||coalesce('Scenarios that change the sign of value relative to the base: '||labels||'. ','No scenario changes the sign of value relative to the base. ')
   ||'Value, return, payback, startup working capital and company cash with and without the project are in the recorded result, each number with its origin.'
  end;
 end if;
 insert into public.agent_messages(id,organization_id,conversation_id,intake_session_id,role,status,content,locale,reply_to_message_id,metadata,created_by,work_id,channel_id)
 values(msg_id,p_org,am.conversation_id,am.intake_session_id,'assistant','completed',txt,am.locale,pr.source_message_id,
  jsonb_build_object('kind','execution_result_reply','citations',jsonb_build_array(jsonb_build_object('kind','execution_result','executionId',p_execution,'revisionId',rev_id))),
  coalesce(creator,am.created_by),am.work_id,am.channel_id)
 on conflict do nothing;
 return jsonb_build_object('recorded',true,'messageId',msg_id);
exception when others then
 raise warning 'execution_result_reply_not_recorded: % (%)',case when sqlerrm ~ '^[a-z][a-z0-9_]{0,80}$' then sqlerrm else 'unclassified' end,sqlstate;
 return jsonb_build_object('recorded',false,'reason','reply_failed','sqlstate',sqlstate);
end $$;
