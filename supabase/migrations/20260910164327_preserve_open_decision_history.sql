-- An unanswered decision is a working placeholder, not a recommendation to supersede.
-- Reuse only unreviewed open/null rows; preserve their identity and record the prior state.
-- Existing recommendation/reviewer CHECK constraints remain unchanged.
do $migration$
declare
 definition text := pg_get_functiondef('private.worker_record_agent_assessment_v1(uuid,text,jsonb)'::regprocedure);
 needle text := $needle$    if found then
      update public.capital_project_decisions decision
      set status = 'superseded'$needle$;
 replacement text := $replacement$    if found and prior_decision.reviewed_by is not null then
      continue;
    end if;
    if found and prior_decision.status = 'open' and prior_decision.recommendation is null then
      insert into public.capital_project_agent_events (
        organization_id, capital_project_id, agent_plan_id, event_type, summary_pt, summary_en, detail
      ) values (
        job_row.organization_id, session_row.capital_project_id, active_plan.id, 'work_progress',
        'Atualizei uma análise ainda sem recomendação.',
        'I updated an assessment that did not yet have a recommendation.',
        jsonb_build_object('assessment_ref', assessment_reference, 'prior_decision', to_jsonb(prior_decision))
      );
      update public.capital_project_decisions decision set
        status = decision_item ->> 'status', question = decision_item ->> 'question',
        recommendation = nullif(trim(decision_item ->> 'recommendation'), ''),
        alternatives = decision_item -> 'alternatives', rationale_summary = decision_item ->> 'rationaleSummary',
        evidence = decision_item -> 'evidence', assumptions = decision_item -> 'assumptions',
        unresolved = decision_item -> 'unresolved', confidence = decision_item ->> 'confidence',
        proposed_by = decision_item ->> 'proposedBy',
        decision_fingerprint = decision_item ->> 'fingerprint', assessment_ref = assessment_reference
      where decision.organization_id = job_row.organization_id and decision.id = prior_decision.id;
      decision_count := decision_count + 1;
      continue;
    end if;
    if found then
      update public.capital_project_decisions decision
      set status = 'superseded'$replacement$;
 replay_needle text := $needle$    if exists (
      select 1 from public.capital_project_decisions decision$needle$;
 replay_replacement text := $replacement$    -- A reused placeholder has a new assessment_ref; the immutable event ledger
    -- still prevents a prior accepted assessment from overwriting its successor.
    if exists (
      select 1 from public.capital_project_agent_events event
      where event.organization_id = job_row.organization_id
        and event.capital_project_id = session_row.capital_project_id
        and event.event_type = 'decision_recorded'
        and event.detail ->> 'assessment_ref' = assessment_reference
    ) then
      continue;
    end if;
    if exists (
      select 1 from public.capital_project_decisions decision$replacement$;
begin
 if (length(definition)-length(replace(definition,needle,'')))/length(needle) <> 1
   or (length(definition)-length(replace(definition,replay_needle,'')))/length(replay_needle) <> 1 then
   raise exception 'open_decision_history_contract_drift';
 end if;
 execute replace(replace(definition,needle,replacement),replay_needle,replay_replacement);
end;
$migration$;
