-- After an investment calculation commits, the conversation that proposed its premises receives
-- one assistant reply citing the registered result revision. The reply is written by the database
-- from the committed packet: it names the outcome, the scenario count and the scenarios that change
-- the sign of value, and points to the revision for every number. No model writes it. It never
-- fails the commit and is idempotent per execution.
set local lock_timeout='5s';

create function private.record_execution_result_reply_v1(p_org uuid,p_execution uuid,p_job uuid) returns jsonb
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
 if packet->>'schemaVersion' is distinct from 'investment-decision-packet.v1' then
  return jsonb_build_object('recorded',false,'reason','unsupported_result'); end if;
 select j.authorization_subject_id into creator from public.processing_jobs j where j.organization_id=p_org and j.id=p_job;
 n:=jsonb_array_length(packet->'cases');
 select string_agg(c.v->>'label','; ' order by k.n) into labels
 from jsonb_array_elements_text(coalesce(packet#>'{comparison,conclusionChangingCaseIds}','[]')) with ordinality k(id,n)
 join jsonb_array_elements(packet->'cases') c(v) on c.v->>'id'=k.id;
 question:=left(packet->>'question',300); pt:=am.locale='pt-BR';
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

-- The commit calls it after the artifact producer; the needle must occur exactly once.
do $patch$
declare body text;needle text:='perform private.record_execution_result_artifact_v1(j.organization_id,j.execution_id,j.id);';
begin
 select pg_get_functiondef(p.oid) into body from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='private' and p.proname='commit_work_execution_result_v1';
 if body is null or (length(body)-length(replace(body,needle,'')))/length(needle)<>1 then raise exception 'execution_reply_commit_anchor_missing';end if;
 execute replace(body,needle,needle||E'\n -- The conversation that proposed the premises receives the cited reply; it never fails the commit.\n perform private.record_execution_result_reply_v1(j.organization_id,j.execution_id,j.id);');
end $patch$;
