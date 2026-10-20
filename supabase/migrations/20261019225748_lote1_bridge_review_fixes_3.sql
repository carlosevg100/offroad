-- Third round of the independent review of the lote 1 bridge (fichas C02 and C04).
-- 1. The latest message supersedes every other open card with other premises before an identical
--    card is skipped, so a retracted premise never stays confirmable.
-- 2. The cited reply of the comparison says no offer fits only when every case was calculated and
--    every offer was read in full.
set local lock_timeout='5s';

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
  source := (job_row.payload ->> 'message_id')::uuid;
  -- The comparison and the capacity confirm each card into its own context, named by the message that
  -- raised it and its fingerprint, so a premise a later card leaves out never survives and two cards
  -- never share a basis.
  ctx := case p_premises ->> 'methodId' when 'analyze-investment-project' then 'investimento'
    when 'compare-financing-proposals' then 'propostas:' || left(md5(source::text || ':' || (p_premises ->> 'fingerprint')), 16)
    when 'assess-debt-capacity' then 'capacidade:' || left(md5(source::text || ':' || (p_premises ->> 'fingerprint')), 16) end;
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
  -- The latest message decides: every other open card of the method with other premises is superseded,
  -- and premises already on an open or confirmed card of this work are not proposed again.
  update public.work_premise_proposals set status = 'superseded'
    where organization_id = job_row.organization_id and capital_project_id = session_row.capital_project_id
      and method_id = p_premises ->> 'methodId' and status = 'proposed' and source_message_id <> source
      and fingerprint <> p_premises ->> 'fingerprint';
  if exists (select 1 from public.work_premise_proposals x where x.organization_id = job_row.organization_id
    and x.capital_project_id = session_row.capital_project_id and x.method_id = p_premises ->> 'methodId'
    and x.fingerprint = p_premises ->> 'fingerprint' and x.status in ('proposed', 'confirmed') and x.source_message_id <> source) then
    return result;
  end if;
  insert into public.work_premise_proposals (organization_id, capital_project_id, intake_session_id, source_message_id, assistant_message_id,
    method_id, method_version, purpose, context_key, facts, hypotheses, summary, fingerprint)
  values (job_row.organization_id, session_row.capital_project_id, session_row.id, source, p_assistant_message_id,
    p_premises ->> 'methodId', p_premises ->> 'methodVersion', 'prepare-capital-structure-decision', ctx,
    p_premises -> 'facts', p_premises -> 'hypotheses', p_premises -> 'summary', p_premises ->> 'fingerprint')
  on conflict (organization_id, source_message_id, method_id) do nothing;
  return result;
end $$;

create or replace function private.record_execution_result_reply_v1(p_org uuid,p_execution uuid,p_job uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare rev_id uuid;msg_id uuid;pr public.work_premise_proposals;am public.agent_messages;r private.execution_result_receipts;
 packet jsonb;creator uuid;labels text;gaps text;n integer;calculated integer;incomplete integer;reviewed boolean;txt text;question text;pt boolean;
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
  -- Offers without a complete reading are counted apart (the packet names them by identity only), and
  -- only cases with a compared offer count as calculated: a gap is not a refusal, so no offer is said
  -- not to fit unless every case was calculated and every offer read in full.
  select count(distinct i.id) into incomplete
  from jsonb_array_elements(coalesce(packet#>'{comparison,cases}','[]')) c(v), jsonb_array_elements_text(coalesce(c.v->'incompleteProposalIds','[]')) i(id);
  select count(*) into calculated from jsonb_array_elements(coalesce(packet#>'{comparison,cases}','[]')) c(v) where jsonb_array_length(coalesce(c.v->'proposals','[]'))>0;
  txt:=case when pt then
    case when r.outcome='succeeded' then 'Comparação concluída' else 'Comparação concluída com lacunas' end||' para "'||question||'". '
    ||case when calculated=n then n||case when n=1 then ' caso calculado' else ' casos calculados' end
      else calculated||' de '||n||' casos calculados' end||' sobre as premissas confirmadas. '
    ||coalesce('Cabem em todos os casos adotados: '||labels||'. ',case when incomplete=0 and calculated=n then 'Nenhuma proposta cabe em todos os casos adotados. '
      else 'Nenhuma proposta com leitura completa cabe em todos os casos adotados. ' end)
    ||case when incomplete=0 then '' when incomplete=1 then '1 proposta ficou sem leitura completa por lacuna. ' else incomplete||' propostas ficaram sem leitura completa por lacuna. ' end
    ||'Custo efetivo pela vida, caixa com a dívida vigente, covenant na definição de cada credor, garantia e o que elimina antes da preferência estão no resultado registrado, cada número com a origem.'
   else
    case when r.outcome='succeeded' then 'Comparison completed' else 'Comparison completed with gaps' end||' for "'||question||'". '
    ||case when calculated=n then n||case when n=1 then ' case calculated' else ' cases calculated' end
      else calculated||' of '||n||' cases calculated' end||' on the confirmed premises. '
    ||coalesce('Viable in every adopted case: '||labels||'. ',case when incomplete=0 and calculated=n then 'No offer is viable in every adopted case. '
      else 'No offer with a complete reading is viable in every adopted case. ' end)
    ||case when incomplete=0 then '' when incomplete=1 then '1 offer has no complete reading because of gaps. ' else incomplete||' offers have no complete reading because of gaps. ' end
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
