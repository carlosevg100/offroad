-- Conversation bridge of lote 3 (fichas C24, C26, C35 and C54), as for lotes 1 and 2: premise cards for
-- the operating projection, the projection challenge, the receivables funding and the quarter close, each
-- confirmed into its own context; the four results as execution_result revisions; and the cited reply. The
-- quarter close reads its prior results through 20261026220400_lote3_quarter_update_priors. A proposal
-- never adopts, calculates or grants.
set local lock_timeout='5s';

alter table public.work_premise_proposals drop constraint work_premise_proposals_method_id_check;
alter table public.work_premise_proposals add constraint work_premise_proposals_method_id_check
  check (method_id in ('analyze-investment-project', 'compare-financing-proposals', 'assess-debt-capacity',
    'build-company-debt-table', 'measure-covenant-headroom', 'project-weekly-cash',
    'build-operating-projection', 'challenge-financial-projection', 'monetize-receivables-for-working-capital',
    'update-after-quarter-close'));
alter table public.work_premise_proposals drop constraint work_premise_proposals_context_key_check;
alter table public.work_premise_proposals add constraint work_premise_proposals_context_key_check
  check ((method_id = 'analyze-investment-project' and context_key = 'investimento')
    or (method_id = 'compare-financing-proposals' and context_key ~ '^propostas:[0-9a-f]{16}$')
    or (method_id = 'assess-debt-capacity' and context_key ~ '^capacidade:[0-9a-f]{16}$')
    or (method_id = 'build-company-debt-table' and context_key ~ '^divida:[0-9a-f]{16}$')
    or (method_id = 'measure-covenant-headroom' and context_key ~ '^covenant:[0-9a-f]{16}$')
    or (method_id = 'project-weekly-cash' and context_key ~ '^caixa:[0-9a-f]{16}$')
    or (method_id = 'build-operating-projection' and context_key ~ '^projecao:[0-9a-f]{16}$')
    or (method_id = 'challenge-financial-projection' and context_key ~ '^critica:[0-9a-f]{16}$')
    or (method_id = 'monetize-receivables-for-working-capital' and context_key ~ '^recebiveis:[0-9a-f]{16}$')
    or (method_id = 'update-after-quarter-close' and context_key ~ '^trimestre:[0-9a-f]{16}$'));

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
    when 'assess-debt-capacity' then 'capacidade:' || left(md5(source::text || ':' || (p_premises ->> 'fingerprint')), 16)
    when 'build-company-debt-table' then 'divida:' || left(md5(source::text || ':' || (p_premises ->> 'fingerprint')), 16)
    when 'measure-covenant-headroom' then 'covenant:' || left(md5(source::text || ':' || (p_premises ->> 'fingerprint')), 16)
    when 'project-weekly-cash' then 'caixa:' || left(md5(source::text || ':' || (p_premises ->> 'fingerprint')), 16)
    when 'build-operating-projection' then 'projecao:' || left(md5(source::text || ':' || (p_premises ->> 'fingerprint')), 16)
    when 'challenge-financial-projection' then 'critica:' || left(md5(source::text || ':' || (p_premises ->> 'fingerprint')), 16)
    when 'monetize-receivables-for-working-capital' then 'recebiveis:' || left(md5(source::text || ':' || (p_premises ->> 'fingerprint')), 16)
    when 'update-after-quarter-close' then 'trimestre:' || left(md5(source::text || ':' || (p_premises ->> 'fingerprint')), 16) end;
  prefix := case p_premises ->> 'methodId' when 'analyze-investment-project' then 'investment' when 'compare-financing-proposals' then 'comparison' when 'assess-debt-capacity' then 'debt_capacity'
    when 'build-company-debt-table' then 'debt_table' when 'measure-covenant-headroom' then 'covenant' when 'project-weekly-cash' then 'weekly_cash'
    when 'build-operating-projection' then 'operating_projection' when 'challenge-financial-projection' then 'projection_challenge'
    when 'monetize-receivables-for-working-capital' then 'receivables_funding' when 'update-after-quarter-close' then 'quarter_update' end;
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

-- Key for key the TypeScript mappings of packages/domain-contracts/src/lote3-result-blocks.ts; values
-- are copied from the packet, never recomputed. A JSON null reads as absent, as `??` does.
create function private.execution_result_operating_projection_blocks_v1(p_packet jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare r jsonb; p jsonb; base jsonb;
begin
 if jsonb_typeof(p_packet) is distinct from 'object' or p_packet->>'schemaVersion' is distinct from 'operating-projection-packet.v1'
 then raise exception 'execution_result_unmappable' using errcode='22023'; end if;
 r:=case when jsonb_typeof(p_packet->'readings')='object' then p_packet->'readings' end;
 p:=case when jsonb_typeof(r->'projected')='object' then r->'projected' end;
 base:=coalesce(nullif(p->'base','null'::jsonb),'[]'::jsonb);
 -- A claim id is at most 160 characters, as the contract mapping refuses.
 if exists(select 1 from jsonb_array_elements(base) x(v) where length(x.v->>'periodId')>140)
 then raise exception 'execution_result_unmappable' using errcode='22023'; end if;
 return jsonb_build_array(
  jsonb_build_object('blockKey','framing','kind','section','claims','[]'::jsonb,'content',jsonb_build_object('status',p_packet->'status','question',p_packet->'question',
   'currency',p_packet->'currency','purpose',coalesce(r->'purpose','null'::jsonb),'calibration',coalesce(r->'calibration','null'::jsonb),
   'questions',coalesce(nullif(r->'questions','null'::jsonb),'[]'::jsonb),'openQuestions',coalesce(nullif(r->'openQuestions','null'::jsonb),'[]'::jsonb))),
  jsonb_build_object('blockKey','base','kind','table','content',jsonb_build_object('rows',base),
   'claims',coalesce((select jsonb_agg(jsonb_build_object('claimId','ebitda:'||(x.v->>'periodId'),'kind','calculation','value',x.v->'ebitda','unit',p_packet->'currency',
    'period',x.v->'periodId','supportIds',jsonb_build_array(p_packet->'fingerprint')) order by x.n) from jsonb_array_elements(base) with ordinality x(v,n)),'[]'::jsonb)),
  jsonb_build_object('blockKey','comparisons','kind','table','claims','[]'::jsonb,'content',jsonb_build_object('rows',coalesce(nullif(p->'comparisons','null'::jsonb),'[]'::jsonb))),
  jsonb_build_object('blockKey','sensitivities','kind','table','claims','[]'::jsonb,'content',jsonb_build_object('rows',coalesce(nullif(p->'sensitivities','null'::jsonb),'[]'::jsonb))),
  jsonb_build_object('blockKey','scenarios','kind','table','claims','[]'::jsonb,'content',jsonb_build_object('rows',coalesce((select jsonb_agg(x.v||jsonb_build_object('label',
    coalesce((select y.v->'label' from jsonb_array_elements(case when jsonb_typeof(p_packet#>'{result,projection,projection,scenarios}')='array'
     then p_packet#>'{result,projection,projection,scenarios}' else '[]'::jsonb end) with ordinality y(v,n) where y.v->>'id'=x.v->>'id' order by y.n desc limit 1),'null'::jsonb)) order by x.n)
    from jsonb_array_elements(coalesce(nullif(p->'scenarios','null'::jsonb),'[]'::jsonb)) with ordinality x(v,n)),'[]'::jsonb),
   'largestCashReduction',coalesce(p->'largestCashReduction','null'::jsonb))),
  jsonb_build_object('blockKey','ledger','kind','table','claims','[]'::jsonb,'content',jsonb_build_object('rows',coalesce(nullif(r->'ledger','null'::jsonb),'[]'::jsonb))),
  jsonb_build_object('blockKey','information-gaps','kind','table','claims','[]'::jsonb,'content',jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object('operand',g.v->'operand','reason',g.v->'reason') order by g.n)
   from jsonb_array_elements(coalesce(p_packet->'gaps','[]'::jsonb)) with ordinality g(v,n)),'[]'::jsonb))),
  jsonb_build_object('blockKey','exclusions','kind','section','claims','[]'::jsonb,'content',jsonb_build_object('items',coalesce(p_packet->'exclusions','[]'::jsonb))));
end $$;
revoke all on function private.execution_result_operating_projection_blocks_v1(jsonb) from public,anon,authenticated,service_role;

create function private.execution_result_projection_challenge_blocks_v1(p_packet jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare r jsonb; a jsonb; target jsonb; sup jsonb;
begin
 if jsonb_typeof(p_packet) is distinct from 'object' or p_packet->>'schemaVersion' is distinct from 'projection-challenge-packet.v1'
 then raise exception 'execution_result_unmappable' using errcode='22023'; end if;
 r:=case when jsonb_typeof(p_packet->'readings')='object' then p_packet->'readings' end;
 a:=coalesce(nullif(r->'assumptions','null'::jsonb),'[]'::jsonb);
 target:=coalesce(r#>'{gap,targetPeriodId}','null'::jsonb);
 sup:=jsonb_build_array(p_packet->'fingerprint');
 if exists(select 1 from jsonb_array_elements(a) x(v) where length(x.v->>'assumptionId')>140) or length(target#>>'{}')>140
 then raise exception 'execution_result_unmappable' using errcode='22023'; end if;
 return jsonb_build_array(
  jsonb_build_object('blockKey','framing','kind','section','content',jsonb_build_object('status',p_packet->'status','question',p_packet->'question','currency',p_packet->'currency',
   'gap',coalesce(r->'gap','null'::jsonb),'largestAssumptionId',coalesce(r->'largestAssumptionId','null'::jsonb),'recommendation',coalesce(r->'recommendation','null'::jsonb),
   'openQuestions',coalesce(nullif(r->'openQuestions','null'::jsonb),'[]'::jsonb)),
   'claims',case when r is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('claimId','ebitda-gap:'||(r#>>'{gap,targetPeriodId}'),'kind','calculation',
    'value',r#>'{gap,ebitda}','unit',p_packet->'currency','period',r#>'{gap,targetPeriodId}','supportIds',sup)) end),
  jsonb_build_object('blockKey','assumptions','kind','table','content',jsonb_build_object('rows',a),
   'claims',coalesce((select jsonb_agg(jsonb_build_object('claimId','effect:'||(x.v->>'assumptionId'),'kind','calculation','value',x.v#>'{effect,ebitda}','unit',p_packet->'currency',
    'period',target,'supportIds',sup) order by x.n) from jsonb_array_elements(a) with ordinality x(v,n)),'[]'::jsonb)),
  jsonb_build_object('blockKey','margin','kind','section','claims','[]'::jsonb,'content',jsonb_build_object('interaction',coalesce(r->'interaction','null'::jsonb),
   'unitMargin',coalesce(r->'unitMargin','null'::jsonb))),
  jsonb_build_object('blockKey','rulers','kind','section','claims','[]'::jsonb,'content',jsonb_build_object('capacity',coalesce(r->'capacity','null'::jsonb),
   'receivables',coalesce(r->'receivables','null'::jsonb),'premiumMix',coalesce(r->'premiumMix','null'::jsonb))),
  jsonb_build_object('blockKey','information-gaps','kind','table','claims','[]'::jsonb,'content',jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object('operand',g.v->'operand','reason',g.v->'reason') order by g.n)
   from jsonb_array_elements(coalesce(p_packet->'gaps','[]'::jsonb)) with ordinality g(v,n)),'[]'::jsonb))),
  jsonb_build_object('blockKey','exclusions','kind','section','claims','[]'::jsonb,'content',jsonb_build_object('items',coalesce(p_packet->'exclusions','[]'::jsonb))));
end $$;
revoke all on function private.execution_result_projection_challenge_blocks_v1(jsonb) from public,anon,authenticated,service_role;

create function private.execution_result_receivables_funding_blocks_v1(p_packet jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare r jsonb; f jsonb; o jsonb; fo jsonb; day jsonb; sup jsonb;
begin
 if jsonb_typeof(p_packet) is distinct from 'object' or p_packet->>'schemaVersion' is distinct from 'receivables-funding-packet.v1' or jsonb_typeof(p_packet->'result') is distinct from 'object'
 then raise exception 'execution_result_unmappable' using errcode='22023'; end if;
 r:=case when jsonb_typeof(p_packet->'readings')='object' then p_packet->'readings' end;
 f:=case when jsonb_typeof(p_packet#>'{result,funding}')='object' then p_packet#>'{result,funding}' end;
 o:=coalesce(nullif(r->'options','null'::jsonb),'[]'::jsonb);
 fo:=coalesce(nullif(f->'options','null'::jsonb),'[]'::jsonb);
 day:=coalesce(f->'referenceDate','null'::jsonb);
 sup:=jsonb_build_array(p_packet->'fingerprint');
 if exists(select 1 from jsonb_array_elements(o) x(v) where length(x.v->>'id')>140)
 then raise exception 'execution_result_unmappable' using errcode='22023'; end if;
 return jsonb_build_array(
  jsonb_build_object('blockKey','framing','kind','section','content',jsonb_build_object('status',p_packet->'status','question',p_packet->'question','currency',p_packet->'currency',
   'referenceDate',day,'need',coalesce(f->'need','null'::jsonb),'gross',coalesce(r->'gross','null'::jsonb),'assignable',coalesce(r->'assignable','null'::jsonb),
   'assignableShare',coalesce(r->'assignableShare','null'::jsonb),'planCoversPeak',coalesce(r->'planCoversPeak','null'::jsonb),'bankLineReserve',coalesce(r->'bankLineReserve','null'::jsonb),
   'startBy',coalesce(r->'startBy','null'::jsonb),'slackDays',coalesce(r->'slackDays','null'::jsonb),
   'conditionsPrecedent',coalesce(nullif(r->'conditionsPrecedent','null'::jsonb),'[]'::jsonb),'dedicatedVehicle',coalesce(r->'dedicatedVehicle','null'::jsonb),
   'process',coalesce(r->'process','null'::jsonb)),
   'claims',case when r is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('claimId','assignable','kind','calculation','value',r->'assignable',
    'unit',p_packet->'currency','period',day,'supportIds',sup)) end),
  jsonb_build_object('blockKey','portfolio','kind','table','claims','[]'::jsonb,'content',jsonb_build_object('rows',coalesce(nullif(f#>'{portfolio,items}','null'::jsonb),'[]'::jsonb))),
  -- Each option row carries the label its option has in the result; the last option of the same id wins, as a map does.
  jsonb_build_object('blockKey','options','kind','table','content',jsonb_build_object('rows',coalesce((select jsonb_agg(x.v||jsonb_build_object('label',
    coalesce((select y.v->'label' from jsonb_array_elements(fo) with ordinality y(v,n) where y.v->>'id'=x.v->>'id' order by y.n desc limit 1),'null'::jsonb)) order by x.n)
    from jsonb_array_elements(o) with ordinality x(v,n)),'[]'::jsonb)),
   'claims',coalesce((select jsonb_agg(jsonb_build_object('claimId','cost:'||(x.v->>'id'),'kind','calculation','value',x.v->'cost','unit',p_packet->'currency',
    'period',day,'supportIds',sup) order by x.n) from jsonb_array_elements(o) with ordinality x(v,n)),'[]'::jsonb)),
  jsonb_build_object('blockKey','plan','kind','table','claims','[]'::jsonb,'content',jsonb_build_object('rows',coalesce(nullif(r->'plan','null'::jsonb),'[]'::jsonb))),
  jsonb_build_object('blockKey','releases','kind','table','claims','[]'::jsonb,'content',jsonb_build_object('rows',coalesce(nullif(r->'releases','null'::jsonb),'[]'::jsonb))),
  jsonb_build_object('blockKey','questions','kind','table','claims','[]'::jsonb,'content',jsonb_build_object('rows',coalesce(nullif(r->'questions','null'::jsonb),'[]'::jsonb))),
  jsonb_build_object('blockKey','information-gaps','kind','table','claims','[]'::jsonb,'content',jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object('operand',g.v->'operand','reason',g.v->'reason') order by g.n)
   from jsonb_array_elements(coalesce(p_packet->'gaps','[]'::jsonb)) with ordinality g(v,n)),'[]'::jsonb))),
  jsonb_build_object('blockKey','exclusions','kind','section','claims','[]'::jsonb,'content',jsonb_build_object('items',coalesce(p_packet->'exclusions','[]'::jsonb))));
end $$;
revoke all on function private.execution_result_receivables_funding_blocks_v1(jsonb) from public,anon,authenticated,service_role;

create function private.execution_result_quarter_update_blocks_v1(p_packet jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare r jsonb; u jsonb; tw jsonb;
begin
 if jsonb_typeof(p_packet) is distinct from 'object' or p_packet->>'schemaVersion' is distinct from 'quarter-update-packet.v1' or jsonb_typeof(p_packet->'result') is distinct from 'object'
 then raise exception 'execution_result_unmappable' using errcode='22023'; end if;
 r:=case when jsonb_typeof(p_packet->'readings')='object' then p_packet->'readings' end;
 u:=case when jsonb_typeof(p_packet#>'{result,update}')='object' then p_packet#>'{result,update}' end;
 tw:=case when jsonb_typeof(r#>'{tightestWeek,updated}')='object' then r#>'{tightestWeek,updated}' end;
 return jsonb_build_array(
  jsonb_build_object('blockKey','framing','kind','section','content',jsonb_build_object('status',p_packet->'status','question',p_packet->'question','currency',p_packet->'currency',
   'quarterStart',coalesce(u->'quarterStart','null'::jsonb),'quarterEnd',coalesce(u->'quarterEnd','null'::jsonb),'tightestWeek',coalesce(r->'tightestWeek','null'::jsonb),
   'shortfallToMinimum',coalesce(r->'shortfallToMinimum','null'::jsonb),'closingAtHorizon',coalesce(r->'closingAtHorizon','null'::jsonb),'topUp',coalesce(r->'topUp','null'::jsonb),
   'projectedEbitda',coalesce(r->'projectedEbitda','null'::jsonb),'decisionsChanged',coalesce(nullif(r->'decisionsChanged','null'::jsonb),'[]'::jsonb),
   'materiality',coalesce(r->'materiality','null'::jsonb),'priorVersionsKept',coalesce(r->'priorVersionsKept','null'::jsonb),'sentToThirdParties',coalesce(r->'sentToThirdParties','null'::jsonb)),
   'claims',case when tw is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('claimId','tightest-week','kind','calculation','value',tw->'closing',
    'unit',p_packet->'currency','period',tw->'weekStart','supportIds',jsonb_build_array(p_packet->'fingerprint'))) end),
  jsonb_build_object('blockKey','lines','kind','table','claims','[]'::jsonb,'content',jsonb_build_object('rows',coalesce(nullif(u->'lines','null'::jsonb),'[]'::jsonb))),
  jsonb_build_object('blockKey','bridges','kind','table','claims','[]'::jsonb,'content',jsonb_build_object('rows',coalesce(nullif(r->'bridges','null'::jsonb),'[]'::jsonb))),
  jsonb_build_object('blockKey','persisting','kind','table','claims','[]'::jsonb,'content',jsonb_build_object('rows',coalesce(nullif(r->'persisting','null'::jsonb),'[]'::jsonb),
   'oneOff',coalesce(nullif(r->'oneOff','null'::jsonb),'[]'::jsonb),'balanceShiftsCarriedOnce',coalesce(nullif(r->'balanceShiftsCarriedOnce','null'::jsonb),'[]'::jsonb))),
  jsonb_build_object('blockKey','action','kind','section','claims','[]'::jsonb,'content',jsonb_build_object('steps',coalesce(nullif(u#>'{action,steps}','null'::jsonb),'[]'::jsonb),
   'withinApproved',coalesce(r#>'{action,withinApproved}','null'::jsonb),'covers',coalesce(r#>'{action,covers}','null'::jsonb),'minimumAfter',coalesce(r#>'{action,minimumAfter}','null'::jsonb))),
  jsonb_build_object('blockKey','covenant','kind','section','claims','[]'::jsonb,'content',jsonb_build_object('covenant',coalesce(r->'covenant','null'::jsonb))),
  jsonb_build_object('blockKey','dependents','kind','table','claims','[]'::jsonb,'content',jsonb_build_object('rows',coalesce(nullif(u->'dependents','null'::jsonb),'[]'::jsonb),
   'ownedElsewhere',coalesce(nullif(r->'ownedElsewhere','null'::jsonb),'[]'::jsonb))),
  jsonb_build_object('blockKey','open-questions','kind','table','claims','[]'::jsonb,'content',jsonb_build_object('rows',coalesce(nullif(r->'openQuestions','null'::jsonb),'[]'::jsonb))),
  jsonb_build_object('blockKey','information-gaps','kind','table','claims','[]'::jsonb,'content',jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object('operand',g.v->'operand','reason',g.v->'reason') order by g.n)
   from jsonb_array_elements(coalesce(p_packet->'gaps','[]'::jsonb)) with ordinality g(v,n)),'[]'::jsonb))),
  jsonb_build_object('blockKey','exclusions','kind','section','claims','[]'::jsonb,'content',jsonb_build_object('items',coalesce(p_packet->'exclusions','[]'::jsonb))));
end $$;
revoke all on function private.execution_result_quarter_update_blocks_v1(jsonb) from public,anon,authenticated,service_role;

-- The projector dispatches each lote 2 and lote 3 packet to its mapping and traces it by its own fingerprint.
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
 if jsonb_typeof(packet)<>'object' or packet->>'schemaVersion' is null or packet->>'schemaVersion' not in ('capital-procedure-packet.v2','investment-decision-packet.v1','financing-comparison-packet.v1','debt-capacity-packet.v1',
  'debt-table-packet.v1','covenant-headroom-packet.v1','weekly-cash-packet.v1',
  'operating-projection-packet.v1','projection-challenge-packet.v1','receivables-funding-packet.v1','quarter-update-packet.v1') then
  return jsonb_build_object('recorded',false,'reason','execution_result_unmappable');
 end if;
 begin
  select * into j from public.processing_jobs x where x.organization_id=p_org and x.id=p_job and x.execution_id=p_execution;
  if j.id is null or p_rights_subject is null then raise exception 'execution_artifact_origin_missing' using errcode='42501'; end if;
  closure:=private.execution_result_source_closure_v1(p_org,p_execution);
  if closure is null or not private.execution_closure_read_allowed_v1(p_org,closure,p_rights_subject) then raise exception 'execution_artifact_closure_denied' using errcode='42501';end if;
  blocks:=case packet->>'schemaVersion' when 'investment-decision-packet.v1' then private.execution_result_investment_blocks_v1(packet)
   when 'financing-comparison-packet.v1' then private.execution_result_comparison_blocks_v1(packet)
   when 'debt-capacity-packet.v1' then private.execution_result_capacity_blocks_v1(packet)
   when 'debt-table-packet.v1' then private.execution_result_debt_table_blocks_v1(packet)
   when 'covenant-headroom-packet.v1' then private.execution_result_covenant_headroom_blocks_v1(packet)
   when 'weekly-cash-packet.v1' then private.execution_result_weekly_cash_blocks_v1(packet)
   when 'operating-projection-packet.v1' then private.execution_result_operating_projection_blocks_v1(packet)
   when 'projection-challenge-packet.v1' then private.execution_result_projection_challenge_blocks_v1(packet)
   when 'receivables-funding-packet.v1' then private.execution_result_receivables_funding_blocks_v1(packet)
   when 'quarter-update-packet.v1' then private.execution_result_quarter_update_blocks_v1(packet) else private.execution_result_blocks_v1(packet) end;
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
    -- Comparison results: the packet, then each case result.
    union all select 'financing-comparison-packet:'||(packet->>'fingerprint'),1 where packet->>'schemaVersion'='financing-comparison-packet.v1'
    union all select 'financial-core:'||(packet->>'financialCoreVersion'),2 where packet->>'schemaVersion'='financing-comparison-packet.v1' and packet ? 'financialCoreVersion'
    union all select 'comparison-case:'||(x.v->>'id')||':'||(x.v#>>'{result,fingerprint}'),2+x.n
     from jsonb_array_elements(case when packet->>'schemaVersion'='financing-comparison-packet.v1' then packet->'cases' else '[]'::jsonb end) with ordinality x(v,n)
    -- Capacity results: the packet and its core version.
    union all select 'debt-capacity-packet:'||(packet->>'fingerprint'),1 where packet->>'schemaVersion'='debt-capacity-packet.v1'
    union all select 'financial-core:'||(packet->>'financialCoreVersion'),2 where packet->>'schemaVersion'='debt-capacity-packet.v1' and packet ? 'financialCoreVersion'
    -- Lote 2 results: the packet and its core version.
    union all select replace(packet->>'schemaVersion','.v1',':')||(packet->>'fingerprint'),1 where packet->>'schemaVersion' in ('debt-table-packet.v1','covenant-headroom-packet.v1','weekly-cash-packet.v1')
    union all select 'financial-core:'||(packet->>'financialCoreVersion'),2 where packet->>'schemaVersion' in ('debt-table-packet.v1','covenant-headroom-packet.v1','weekly-cash-packet.v1') and packet ? 'financialCoreVersion'
    -- Lote 3 results: the packet and its core version.
    union all select replace(packet->>'schemaVersion','.v1',':')||(packet->>'fingerprint'),1 where packet->>'schemaVersion' in ('operating-projection-packet.v1','projection-challenge-packet.v1','receivables-funding-packet.v1','quarter-update-packet.v1')
    union all select 'financial-core:'||(packet->>'financialCoreVersion'),2 where packet->>'schemaVersion' in ('operating-projection-packet.v1','projection-challenge-packet.v1','receivables-funding-packet.v1','quarter-update-packet.v1') and packet ? 'financialCoreVersion'
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

create or replace function private.record_execution_result_reply_v1(p_org uuid,p_execution uuid,p_job uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare rev_id uuid;msg_id uuid;pr public.work_premise_proposals;am public.agent_messages;r private.execution_result_receipts;
 packet jsonb;creator uuid;labels text;gaps text;n integer;calculated integer;incomplete integer;reviewed boolean;txt text;question text;pt boolean;rd jsonb;day text;k integer;
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
 if packet->>'schemaVersion' is null or packet->>'schemaVersion' not in ('investment-decision-packet.v1','financing-comparison-packet.v1','debt-capacity-packet.v1',
  'debt-table-packet.v1','covenant-headroom-packet.v1','weekly-cash-packet.v1',
  'operating-projection-packet.v1','projection-challenge-packet.v1','receivables-funding-packet.v1','quarter-update-packet.v1') then
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
 elsif packet->>'schemaVersion'='debt-table-packet.v1' then
  -- Counts and states only: the amounts and their scale stay in the recorded result.
  rd:=packet->'readings'; n:=coalesce(jsonb_array_length(packet#>'{result,table,rows}'),0);
  day:=case when pt then to_char((packet->>'referenceDate')::date,'DD/MM/YYYY') else packet->>'referenceDate' end;
  txt:=case when pt then
    case when packet->>'status'='prepared_for_human_review' then 'Tabela de dívida montada' else 'Tabela de dívida montada com lacunas' end||' para "'||question||'", em '||day||'. '
    ||case when jsonb_typeof(rd) is distinct from 'object' then 'Faltam premissas para montar a tabela; o que falta está no resultado registrado. '
     else n||case when n=1 then ' operação' else ' operações' end||', '
      ||case rd->>'reconciled' when 'true' then 'principal conciliado com o saldo contábil' when 'false' then 'principal com diferença para o saldo contábil' else 'sem saldo contábil informado para conciliar' end
      ||', '||(rd->>'viewCount')||case when (rd->>'viewCount')::int=1 then ' definição de dívida' else ' definições de dívida com a ponte' end||'. '
      ||case when (rd->>'completenessRequest')::boolean then 'A completude ainda não está provada: falta o registro externo das operações com instituições financeiras. ' else 'Completude provada. ' end end
    ||'Cronograma, garantias, cross-default, o que fica fora do saldo e a alavancagem em cada definição estão no resultado registrado, cada número com a origem.'
   else
    case when packet->>'status'='prepared_for_human_review' then 'Debt table built' else 'Debt table built with gaps' end||' for "'||question||'", as of '||day||'. '
    ||case when jsonb_typeof(rd) is distinct from 'object' then 'Premises are missing to build the table; what is missing is in the recorded result. '
     else n||case when n=1 then ' instrument' else ' instruments' end||', '
      ||case rd->>'reconciled' when 'true' then 'principal reconciled to the accounting balance' when 'false' then 'principal differs from the accounting balance' else 'no accounting balance reported to reconcile' end
      ||', '||(rd->>'viewCount')||case when (rd->>'viewCount')::int=1 then ' debt definition' else ' debt definitions with the bridge' end||'. '
      ||case when (rd->>'completenessRequest')::boolean then 'Completeness is not yet proven: the external register of operations with financial institutions is missing. ' else 'Completeness proven. ' end end
    ||'Schedule, security, cross-default, what stays outside the balance and leverage under each definition are in the recorded result, each number with its origin.'
   end;
 elsif packet->>'schemaVersion'='covenant-headroom-packet.v1' then
  rd:=packet->'readings';
  select l.v->>'label' into labels from jsonb_array_elements(coalesce(packet#>'{result,headroom,limits}','[]'::jsonb)) l(v) where l.v->>'id'=rd#>>'{headline,tightestLimitId}' limit 1;
  day:=case when jsonb_typeof(rd)<>'object' then null when pt then to_char((rd#>>'{headline,date}')::date,'DD/MM/YYYY') else rd#>>'{headline,date}' end;
  n:=coalesce(jsonb_array_length(rd->'openQuestions'),0);
  txt:=case when pt then
    case when packet->>'status'='prepared_for_human_review' then 'Folga de covenant medida' else 'Folga de covenant medida com lacunas' end||' para "'||question||'". '
    ||case when jsonb_typeof(rd) is distinct from 'object' then 'Faltam premissas para medir; o que falta está no resultado registrado. '
     else 'Na apuração de '||day||', o limite mais apertado é '||coalesce(labels,'o de menor folga')||'. '
      ||case when (rd->>'policyBindsFirst')::boolean then 'A política do conselho aperta antes do contrato. ' else '' end
      ||case when (rd->>'anyBreach')::boolean then 'Ao menos uma medição rompe um limite; a consequência pela escritura vem antes de qualquer ação. ' else 'Nenhuma medição rompe um limite. ' end
      ||case when n=0 then '' else 'Fica em aberto a definição de EBITDA de '||n||case when n=1 then ' limite. ' else ' limites. ' end end end
    ||'A folga em EBITDA e em dívida, o teste reverso, o caso adverso e o efeito sazonal estão no resultado registrado, cada número com a origem.'
   else
    case when packet->>'status'='prepared_for_human_review' then 'Covenant headroom measured' else 'Covenant headroom measured with gaps' end||' for "'||question||'". '
    ||case when jsonb_typeof(rd) is distinct from 'object' then 'Premises are missing to measure; what is missing is in the recorded result. '
     else 'At the '||day||' test, the tightest limit is '||coalesce(labels,'the one with the least headroom')||'. '
      ||case when (rd->>'policyBindsFirst')::boolean then 'The board policy binds before the contract. ' else '' end
      ||case when (rd->>'anyBreach')::boolean then 'At least one measurement breaches a limit; the consequence under the indenture comes before any action. ' else 'No measurement breaches a limit. ' end
      ||case when n=0 then '' else 'The EBITDA definition of '||n||case when n=1 then ' limit stays open. ' else ' limits stays open. ' end end end
    ||'Headroom in EBITDA and in debt, the reverse test, the adverse case and the seasonal effect are in the recorded result, each number with its origin.'
   end;
 elsif packet->>'schemaVersion'='weekly-cash-packet.v1' then
  rd:=packet->'readings';
  select a.v->>'label' into labels from jsonb_array_elements(coalesce(packet#>'{result,weekly,actions}','[]'::jsonb)) a(v) where a.v->>'id'=rd#>>'{cheapestCoveringAction,id}' limit 1;
  day:=case when jsonb_typeof(rd)<>'object' then null when pt then to_char((rd#>>'{tightestWeek,weekStart}')::date,'DD/MM/YYYY') else rd#>>'{tightestWeek,weekStart}' end;
  n:=coalesce(jsonb_array_length(rd->'weeksBelowMinimum'),0);
  txt:=case when pt then
    case when packet->>'status'='prepared_for_human_review' then 'Caixa semanal projetado' else 'Caixa semanal projetado com lacunas' end||' para "'||question||'". '
    ||case when jsonb_typeof(rd) is distinct from 'object' then 'Faltam premissas para projetar; o que falta está no resultado registrado. '
     else 'A semana mais apertada começa em '||day||'. '
      ||case when n=0 then 'Nenhuma semana fica abaixo do mínimo. ' else n||case when n=1 then ' semana fica' else ' semanas ficam' end||' abaixo do mínimo'
        ||case when (rd->>'closingHidesTheWeek')::boolean then ', e o fechamento do período esconde isso. ' else '. ' end end
      ||case when n=0 then '' when labels is not null then 'A ação mais barata que cobre sozinha é '||labels||'. ' else 'Nenhuma ação adotada cobre sozinha. ' end end
    ||'O que vence em cada semana, o custo de cada ação pelo tempo de uso e o efeito na apuração estão no resultado registrado, cada número com a origem.'
   else
    case when packet->>'status'='prepared_for_human_review' then 'Weekly cash projected' else 'Weekly cash projected with gaps' end||' for "'||question||'". '
    ||case when jsonb_typeof(rd) is distinct from 'object' then 'Premises are missing to project; what is missing is in the recorded result. '
     else 'The tightest week starts on '||day||'. '
      ||case when n=0 then 'No week falls below the minimum. ' else n||case when n=1 then ' week falls' else ' weeks fall' end||' below the minimum'
        ||case when (rd->>'closingHidesTheWeek')::boolean then ', and the period closing hides it. ' else '. ' end end
      ||case when n=0 then '' when labels is not null then 'The cheapest action that covers on its own is '||labels||'. ' else 'No adopted action covers on its own. ' end end
    ||'What falls due each week, the cost of each action for the time it is in use and the effect on the covenant test are in the recorded result, each number with its origin.'
   end;
 elsif packet->>'schemaVersion'='operating-projection-packet.v1' then
  -- Whether the last actual year was rebuilt, the years projected and what only the company can answer.
  rd:=packet->'readings'; n:=coalesce(jsonb_array_length(rd#>'{projected,base}'),0);
  k:=coalesce(jsonb_array_length(rd->'openQuestions'),0);
  select string_agg(case q.v when 'volume' then case when pt then 'quanto o volume vai crescer' else 'how much volume will grow' end
    when 'pass_through' then case when pt then 'em quanto tempo o custo do insumo chega ao preço' else 'how long the input cost takes to reach the price' end
    else case when pt then 'se os clientes pedem mais prazo' else 'whether customers ask for longer terms' end end,'; ' order by q.n)
   into labels from jsonb_array_elements_text(coalesce(rd->'questions','[]'::jsonb)) with ordinality q(v,n);
  txt:=case when pt then
    case when packet->>'status'='prepared_for_human_review' then 'Projeção por driver montada' else 'Projeção por driver montada com lacunas' end||' para "'||question||'". '
    ||case when jsonb_typeof(rd) is distinct from 'object' then 'Faltam premissas para projetar; o que falta está no resultado registrado. '
     when (rd#>>'{calibration,reproduces}')::boolean is not true then 'O último ano não foi reproduzido pelos drivers; nada foi projetado até a diferença ser explicada. '
     else 'O último ano foi reproduzido pelos drivers'||case when (rd#>>'{calibration,documented}')::boolean then '' else ', mas nem todo número desse ano veio de documento' end||'. '
      ||n||case when n=1 then ' ano projetado' else ' anos projetados' end||' até o caixa disponível para a dívida, com o orçamento da companhia ao lado, sem sobrescrever. '
      ||coalesce('O que só vocês sabem e muda a projeção: '||labels||'. ','')
      ||case when k=0 then '' when k=1 then 'A causa da diferença para 1 versão da companhia não foi explicada. ' else 'A causa da diferença para '||k||' versões da companhia não foi explicada. ' end end
    ||'Sensibilidades em reais, cenários e o que é dado e o que é hipótese estão no resultado registrado, cada número com a origem.'
   else
    case when packet->>'status'='prepared_for_human_review' then 'Driver-based projection built' else 'Driver-based projection built with gaps' end||' for "'||question||'". '
    ||case when jsonb_typeof(rd) is distinct from 'object' then 'Premises are missing to project; what is missing is in the recorded result. '
     when (rd#>>'{calibration,reproduces}')::boolean is not true then 'The last year was not rebuilt from the drivers; nothing was projected until the difference is explained. '
     else 'The last year was rebuilt from the drivers'||case when (rd#>>'{calibration,documented}')::boolean then '' else ', though not every figure of that year came from a document' end||'. '
      ||n||case when n=1 then ' year projected' else ' years projected' end||' to cash available for debt, with the company''s budget beside it, never overwritten. '
      ||coalesce('What only you know and changes the projection: '||labels||'. ','')
      ||case when k=0 then '' when k=1 then 'The cause of the difference to 1 company version was not explained. ' else 'The cause of the difference to '||k||' company versions was not explained. ' end end
    ||'Sensitivities in currency, scenarios and what is data and what is assumption are in the recorded result, each number with its origin.'
   end;
 elsif packet->>'schemaVersion'='projection-challenge-packet.v1' then
  -- The assumption with the largest effect, the recommendation and the physical limit, by state only.
  rd:=packet->'readings'; k:=coalesce(jsonb_array_length(rd->'openQuestions'),0);
  select a.v->>'label' into labels from jsonb_array_elements(coalesce(rd->'assumptions','[]'::jsonb)) a(v) where a.v->>'assumptionId'=rd->>'largestAssumptionId' limit 1;
  txt:=case when pt then
    case when packet->>'status'='prepared_for_human_review' then 'Leitura do plano concluída' else 'Leitura do plano concluída com lacunas' end||' para "'||question||'". '
    ||case when jsonb_typeof(rd) is distinct from 'object' then 'Faltam premissas para ler o plano contra a referência; o que falta está no resultado registrado. '
     else coalesce('A premissa de maior efeito é '||labels||'. ','')
      ||case rd#>>'{recommendation,kind}' when 'present_plan_as_upside_case' then 'Eu levaria como base o que vocês conseguem documentar e apresentaria o plano como cenário de alta, com as condições para ele acontecer. '
       when 'present_plan_with_its_evidence' then 'O plano se sustenta se for apresentado com a evidência de cada premissa. ' else 'O plano fica dentro da referência por drivers. ' end
      ||case when rd#>>'{recommendation,capacityCondition}' is not null then 'O volume do plano passa a capacidade instalada sem investimento no plano. ' else '' end
      ||case when k=0 then '' when k=1 then 'Fica 1 pergunta em aberto. ' else 'Ficam '||k||' perguntas em aberto. ' end end
    ||'O efeito isolado de cada premissa no EBITDA e no caixa, a régua e a evidência que sustentaria cada uma estão no resultado registrado. Nenhum cenário foi rodado.'
   else
    case when packet->>'status'='prepared_for_human_review' then 'Plan reading completed' else 'Plan reading completed with gaps' end||' for "'||question||'". '
    ||case when jsonb_typeof(rd) is distinct from 'object' then 'Premises are missing to read the plan against the reference; what is missing is in the recorded result. '
     else coalesce('The assumption with the largest effect is '||labels||'. ','')
      ||case rd#>>'{recommendation,kind}' when 'present_plan_as_upside_case' then 'I would keep as the base what you can document and present the plan as the upside case, with the conditions for it to happen. '
       when 'present_plan_with_its_evidence' then 'The plan holds if presented with the evidence for each assumption. ' else 'The plan stays within the driver-based reference. ' end
      ||case when rd#>>'{recommendation,capacityCondition}' is not null then 'The plan''s volume exceeds installed capacity with no investment in the plan. ' else '' end
      ||case when k=0 then '' when k=1 then '1 question stays open. ' else k||' questions stay open. ' end end
    ||'Each assumption''s isolated effect on EBITDA and cash, its yardstick and the evidence that would sustain it are in the recorded result. No scenario was run.'
   end;
 elsif packet->>'schemaVersion'='receivables-funding-packet.v1' then
  -- How many options were costed, whether the plan covers the peak, the reserve and the questions; no amount.
  rd:=packet->'readings'; n:=coalesce(jsonb_array_length(rd->'options'),0); k:=coalesce(jsonb_array_length(rd->'questions'),0);
  select o.v->>'label' into labels from jsonb_array_elements(coalesce(packet#>'{result,funding,options}','[]'::jsonb)) o(v) where o.v->>'id'=rd->>'bankLineReserve' limit 1;
  txt:=case when pt then
    case when packet->>'status'='prepared_for_human_review' then 'Leitura da carteira concluída' else 'Leitura da carteira concluída com lacunas' end||' para "'||question||'". '
    ||case when jsonb_typeof(rd) is distinct from 'object' then 'Faltam premissas para ler a carteira; o que falta está no resultado registrado. '
     else n||case when n=1 then ' porta custeada' else ' portas custeadas' end||' no mesmo valor e prazo, com as taxas convertidas antes de comparar. '
      ||case when (rd->>'planCoversPeak')::boolean then 'O plano a partir da porta mais barata cobre o pico da necessidade' else 'O plano pelas portas disponíveis não cobre o pico da necessidade' end
      ||coalesce(', com '||labels||' como reserva até a primeira compra. ','. ')
      ||case when k=0 then '' when k=1 then 'Fica 1 pergunta que pode mudar o plano. ' else 'Ficam '||k||' perguntas que podem mudar o plano. ' end end
    ||'O que da carteira pode ser cedido e por que o resto não, o custo de cada porta com IOF, o efeito em balanço, covenant e garantias e a data para começar estão no resultado registrado, cada número com a origem. Nenhum comprador foi contatado.'
   else
    case when packet->>'status'='prepared_for_human_review' then 'Portfolio reading completed' else 'Portfolio reading completed with gaps' end||' for "'||question||'". '
    ||case when jsonb_typeof(rd) is distinct from 'object' then 'Premises are missing to read the portfolio; what is missing is in the recorded result. '
     else n||case when n=1 then ' option costed' else ' options costed' end||' for the same amount and term, with rates converted before comparing. '
      ||case when (rd->>'planCoversPeak')::boolean then 'The plan starting from the cheapest option covers the peak need' else 'The plan through the available options does not cover the peak need' end
      ||coalesce(', with '||labels||' as the reserve until the first purchase. ','. ')
      ||case when k=0 then '' when k=1 then '1 question can change the plan. ' else k||' questions can change the plan. ' end end
    ||'What of the portfolio can be sold and why the rest cannot, each option''s cost with IOF, the effect on the balance sheet, covenant and liens, and the start date are in the recorded result, each number with its origin. No buyer was contacted.'
   end;
 elsif packet->>'schemaVersion'='quarter-update-packet.v1' then
  -- The decisions the close changes, whether the need exceeds the facility, what was updated and what went stale.
  rd:=packet->'readings';
  select string_agg(case d.v when 'short_term_financing' then case when pt then 'o financiamento de curto prazo' else 'short-term financing' end
    when 'covenant_headroom' then case when pt then 'a folga do covenant' else 'covenant headroom' end
    else case when pt then 'o material enviado a terceiros' else 'material sent to third parties' end end,'; ' order by d.n)
   into labels from jsonb_array_elements_text(coalesce(rd->'decisionsChanged','[]'::jsonb)) with ordinality d(v,n);
  n:=coalesce(jsonb_array_length(rd->'updated'),0); k:=coalesce(jsonb_array_length(rd->'stale'),0); calculated:=coalesce(jsonb_array_length(rd->'openQuestions'),0);
  txt:=case when pt then
    case when packet->>'status'='prepared_for_human_review' then 'Fechamento do trimestre atualizado' else 'Fechamento do trimestre atualizado com lacunas' end||' para "'||question||'". '
    ||case when jsonb_typeof(rd) is distinct from 'object' then 'Faltam premissas para atualizar; o que falta está no resultado registrado. '
     else coalesce('Muda com o fechamento: '||labels||'. ','Nenhuma decisão muda com o fechamento. ')
      ||case when (rd#>>'{topUp,needExceedsLimit}')::boolean then 'A necessidade da semana mais apertada passa o limite da linha que completa o caixa. ' else '' end
      ||case when (rd#>>'{action,withinApproved}')::boolean then 'A ação proposta fica dentro do que já foi aprovado. ' else '' end
      ||n||case when n=1 then ' análise atualizada' else ' análises atualizadas' end
      ||case when k=0 then '' when k=1 then ', 1 material desatualizado' else ', '||k||' materiais desatualizados' end||'; as versões anteriores ficam preservadas. '
      ||case when calculated=0 then '' when calculated=1 then 'Fica 1 pergunta que muda o diagnóstico. ' else 'Ficam '||calculated||' perguntas que mudam o diagnóstico. ' end end
    ||'A ponte do EBITDA e do caixa por causa, o que é pontual e o que continua, o caixa semanal, o covenant em cada definição e a ação estão no resultado registrado, cada número com a origem. Nada foi enviado a terceiros.'
   else
    case when packet->>'status'='prepared_for_human_review' then 'Quarter close carried forward' else 'Quarter close carried forward with gaps' end||' for "'||question||'". '
    ||case when jsonb_typeof(rd) is distinct from 'object' then 'Premises are missing to update; what is missing is in the recorded result. '
     else coalesce('The close changes: '||labels||'. ','No decision changes with the close. ')
      ||case when (rd#>>'{topUp,needExceedsLimit}')::boolean then 'The need in the tightest week exceeds the limit of the facility that tops up cash. ' else '' end
      ||case when (rd#>>'{action,withinApproved}')::boolean then 'The proposed action stays within what was already approved. ' else '' end
      ||n||case when n=1 then ' analysis updated' else ' analyses updated' end
      ||case when k=0 then '' when k=1 then ', 1 material stale' else ', '||k||' materials stale' end||'; prior versions are kept. '
      ||case when calculated=0 then '' when calculated=1 then '1 question changes the diagnosis. ' else calculated||' questions change the diagnosis. ' end end
    ||'The EBITDA and cash bridges by cause, what is one-off and what persists, weekly cash, the covenant under each definition and the action are in the recorded result, each number with its origin. Nothing was sent to third parties.'
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