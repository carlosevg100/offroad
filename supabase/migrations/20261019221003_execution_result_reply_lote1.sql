-- The cited conversation reply covers the comparison of offers (ficha C02) and the capacity analysis
-- (ficha C04) as well as the investment analysis. The database writes it from the committed packet,
-- names the outcome and what the user asked, and points to the revision for every number. No model
-- writes it; it never fails the commit and is idempotent per execution.
set local lock_timeout='5s';

create or replace function private.record_execution_result_reply_v1(p_org uuid,p_execution uuid,p_job uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare rev_id uuid;msg_id uuid;pr public.work_premise_proposals;am public.agent_messages;r private.execution_result_receipts;
 packet jsonb;creator uuid;labels text;n integer;txt text;question text;pt boolean;
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
  txt:=case when pt then
    case when r.outcome='succeeded' then 'Comparação concluída' else 'Comparação concluída com lacunas' end||' para "'||question||'". '
    ||n||case when n=1 then ' caso calculado' else ' casos calculados' end||' sobre as premissas confirmadas. '
    ||coalesce('Cabem em todos os casos adotados: '||labels||'. ','Nenhuma proposta cabe em todos os casos adotados. ')
    ||'Custo efetivo pela vida, caixa com a dívida vigente, covenant na definição de cada credor, garantia e o que elimina antes da preferência estão no resultado registrado, cada número com a origem.'
   else
    case when r.outcome='succeeded' then 'Comparison completed' else 'Comparison completed with gaps' end||' for "'||question||'". '
    ||n||case when n=1 then ' case calculated' else ' cases calculated' end||' on the confirmed premises. '
    ||coalesce('Viable in every adopted case: '||labels||'. ','No offer is viable in every adopted case. ')
    ||'Lifetime cost, cash with the existing debt, each lender''s covenant definition, collateral and what eliminates before preference are in the recorded result, each number with its origin.'
   end;
 elsif packet->>'schemaVersion'='debt-capacity-packet.v1' then
  -- The schedules in which the amount asked fits, by their labels.
  select string_agg(c.v->>'label','; ' order by c.n) into labels
  from jsonb_array_elements(packet->'cases') with ordinality c(v,n)
  where c.v->>'caseId' in (select jsonb_array_elements_text(coalesce(packet#>'{comparison,requestedFitsIn}','[]')));
  txt:=case when pt then
    case when r.outcome='succeeded' then 'Capacidade medida' else 'Capacidade medida com lacunas' end||' para "'||question||'". '
    ||n||case when n=1 then ' cronograma calculado' else ' cronogramas calculados' end||' no caso da companhia e no adverso, sobre as premissas confirmadas. '
    ||case when not exists(select 1 from jsonb_array_elements(packet->'cases') c(v) where jsonb_typeof(c.v->'review')='object') then ''
      else coalesce('O valor pedido cabe em: '||labels||'. ','O valor pedido não cabe em nenhum cronograma calculado. ') end
    ||'O maior valor sob cada limite, o limite que prende e quando, e o plano vigente contra o caixa estão no resultado registrado, cada número com a origem.'
   else
    case when r.outcome='succeeded' then 'Capacity measured' else 'Capacity measured with gaps' end||' for "'||question||'". '
    ||n||case when n=1 then ' schedule calculated' else ' schedules calculated' end||' in the company''s case and the adverse case, on the confirmed premises. '
    ||case when not exists(select 1 from jsonb_array_elements(packet->'cases') c(v) where jsonb_typeof(c.v->'review')='object') then ''
      else coalesce('The amount asked fits in: '||labels||'. ','The amount asked fits in no calculated schedule. ') end
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
revoke all on function private.record_execution_result_reply_v1(uuid,uuid,uuid) from public,anon,authenticated,service_role;