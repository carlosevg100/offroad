-- The company-led route after the case is confirmed (migration deal_state_route). A case walks
-- every documented decision with the real commands, one decision at a time: the understanding
-- is confirmed, its analysis is held, approved by the person and completed by the worker; then
-- the structure, the production plan and the material package, each with its own analysis. At
-- every step: exactly one job and one execution brief proposal per decision, the replay of the
-- same decision while it is held or queued, the refusal of a different decision while one is held
-- or queued, and the session still confirmed. A held job that can no longer be approved (an edit
-- requested on its brief once no conversation turn runs, a newer brief in the project) neither
-- replays nor blocks, and one settlement pass cancels it; a held job whose brief is being prepared,
-- whose dispatch is current or whose session has a turn in progress stays held. Synthetic data only;
-- everything is rolled back.
begin;
\ir support/execution_approval.sql

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
)
select id, 'authenticated', 'authenticated', email, '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb, now(), now(), false, false
from (values
  ('d5100000-0000-4000-8000-000000000001'::uuid, 'route-owner@example.invalid'),
  ('d5100000-0000-4000-8000-000000000002'::uuid, 'route-outsider@example.invalid'),
  ('d5100000-0000-4000-8000-000000000003'::uuid, 'route-worker@example.invalid')
) as fixture(id, email);
insert into public.organizations (id, organization_type, name, created_by) values
  ('d5200000-0000-4000-8000-000000000001', 'company', 'Route Tenant A', 'd5100000-0000-4000-8000-000000000001'),
  ('d5200000-0000-4000-8000-000000000002', 'company', 'Route Tenant B', 'd5100000-0000-4000-8000-000000000002');
insert into public.organization_memberships (organization_id, user_id, role, status, joined_at) values
  ('d5200000-0000-4000-8000-000000000001', 'd5100000-0000-4000-8000-000000000001', 'owner', 'active', now()),
  ('d5200000-0000-4000-8000-000000000002', 'd5100000-0000-4000-8000-000000000002', 'owner', 'active', now());
insert into public.document_intake_sessions (id, organization_id, started_by, journey, locale) values
  ('d5300000-0000-4000-8000-000000000001', 'd5200000-0000-4000-8000-000000000001', 'd5100000-0000-4000-8000-000000000001', 'company', 'pt-BR');
insert into private.worker_tokens (label, token_sha256, execution_account_user_id)
values ('deal-state-route-worker', extensions.digest(repeat('r', 64), 'sha256'), 'd5100000-0000-4000-8000-000000000003');

-- The intake analysis has finished: the session is review_ready, the preliminary understanding is
-- confirmed, the facts the confirmation needs were accepted and the worker's diagnostic snapshot
-- has no blocker. These are outputs only the workers and the review forms publish.
insert into public.processing_runs (id, organization_id, intake_session_id, run_no, trigger, status, pipeline_version, created_by)
values ('d5400000-0000-4000-8000-000000000001', 'd5200000-0000-4000-8000-000000000001', 'd5300000-0000-4000-8000-000000000001',
  1, 'upload', 'succeeded', 'deal-state-route-intake-v1', 'd5100000-0000-4000-8000-000000000001');
update public.document_intake_sessions
set status = 'review_ready',
    current_run_id = 'd5400000-0000-4000-8000-000000000001',
    result_summary = result_summary || jsonb_build_object(
      'case_state', jsonb_build_object('readiness', jsonb_build_object('state', 'ready', 'blockers', '[]'::jsonb)),
      'case_manifest', jsonb_build_object('input_fingerprint', repeat('a', 64)))
where id = 'd5300000-0000-4000-8000-000000000001';
insert into public.preliminary_understandings (
  organization_id, intake_session_id, processing_run_id, object_version, status,
  input_fingerprint, object_fingerprint, payload, decided_by, decided_at
) values (
  'd5200000-0000-4000-8000-000000000001', 'd5300000-0000-4000-8000-000000000001', 'd5400000-0000-4000-8000-000000000001',
  1, 'confirmed', repeat('b', 64), repeat('c', 64),
  jsonb_build_object('schemaVersion', '2026.08.31-v1', 'caseId', 'd5300000-0000-4000-8000-000000000001'),
  'd5100000-0000-4000-8000-000000000001', now()
);
insert into public.intake_field_candidates (
  organization_id, intake_session_id, processing_run_id, extractor_key, field_path, field_group, label,
  raw_value, normalized_value, value_type, currency, information_class, evidence_rank, source_anchor,
  confidence, extraction_method, review_state, reviewed_by, reviewed_at, created_by
)
select 'd5200000-0000-4000-8000-000000000001', 'd5300000-0000-4000-8000-000000000001', 'd5400000-0000-4000-8000-000000000001',
  'deal-state-route:' || field_path, field_path, field_group, label, raw_value, normalized_value, value_type, currency,
  'company_document', 3, '{}'::jsonb, 1, 'user_entry', 'accepted',
  'd5100000-0000-4000-8000-000000000001', now(), 'd5100000-0000-4000-8000-000000000001'
from (values
  ('company.legal_name', 'company', 'Razão social', 'Rota Sintética S.A.', to_jsonb('Rota Sintética S.A.'::text), 'text', null),
  ('transaction.purpose', 'transaction', 'Finalidade', 'Capital de giro sintético', to_jsonb('Capital de giro sintético'::text), 'text', null),
  ('transaction.requested_amount', 'transaction', 'Valor solicitado', '100000000', to_jsonb(100000000), 'number', 'BRL')
) as fact(field_path, field_group, label, raw_value, normalized_value, value_type, currency);
select private.append_deal_state_object(
  'd5200000-0000-4000-8000-000000000001', 'd5300000-0000-4000-8000-000000000001', 'understanding_snapshot',
  'pending_confirmation', repeat('a', 64), '{"readiness":{"state":"ready","blockers":[]}}'::jsonb, '[]'::jsonb, null, 'worker');

create temporary table route_proof (label text primary key, value text) on commit drop;
grant select, insert, update on route_proof to authenticated;

-- The single case analysis of a decision, as the database holds it, with the checks every step
-- repeats: one job and one proposal for the decision, at most one live analysis in the session,
-- and the case still confirmed on its intake run.
create function pg_temp.assert_route(p_step text, p_trigger text, p_status text)
returns uuid language plpgsql as $$
declare
  session_row public.document_intake_sessions;
  job public.processing_jobs;
  jobs integer;
  proposals integer;
  live integer;
begin
  select count(*) into jobs from public.processing_jobs j
  where j.intake_session_id = 'd5300000-0000-4000-8000-000000000001' and j.kind = 'case_analysis'
    and j.payload ->> 'incremental_trigger' = p_trigger;
  if jobs <> 1 then
    raise exception '%: the decision % has % case analysis jobs, not one', p_step, p_trigger, jobs;
  end if;
  select j.* into strict job from public.processing_jobs j
  where j.intake_session_id = 'd5300000-0000-4000-8000-000000000001' and j.kind = 'case_analysis'
    and j.payload ->> 'incremental_trigger' = p_trigger;
  select count(*) into proposals from public.processing_jobs proposal
  where proposal.intake_session_id = job.intake_session_id and proposal.kind = 'execution_brief_proposal'
    and proposal.payload ->> 'approval_target_job_id' = job.id::text;
  select count(*) into live from public.processing_jobs j
  where j.intake_session_id = job.intake_session_id and j.kind = 'case_analysis'
    and j.status in ('awaiting_approval', 'queued', 'leased');
  select * into strict session_row from public.document_intake_sessions where id = job.intake_session_id;
  if job.status <> p_status or proposals <> 1 or live > 1
    or (p_status in ('awaiting_approval', 'queued', 'leased') and live <> 1) then
    raise exception '%: job % is %, proposals %, live analyses %', p_step, job.id, job.status, proposals, live;
  end if;
  if session_row.status <> 'confirmed' or session_row.opportunity_id is null
    or session_row.current_run_id <> 'd5400000-0000-4000-8000-000000000001' then
    raise exception '%: the case left the confirmed state: % on run %', p_step, session_row.status, session_row.current_run_id;
  end if;
  raise notice 'deal_state_route: % | % job % % | jobs 1 | proposals 1 | live % | session %',
    p_step, p_trigger, job.id, job.status, live, session_row.status;
  return job.id;
end;
$$;

-- The execution brief the proposal worker prepares for a held job, bound by the production binder
-- (which settles the proposal job). The approval itself is the person's real command below.
create function pg_temp.prepare_route_brief(p_trigger text)
returns void language plpgsql as $$
declare
  job_id uuid := pg_temp.assert_route('brief ' || p_trigger, p_trigger, 'awaiting_approval');
  brief public.capital_project_execution_briefs;
begin
  if job_id::text is distinct from (select value from route_proof where label = p_trigger || ':job') then
    raise exception 'the held job of % is not the one the person queued', p_trigger;
  end if;
  perform pg_temp.fixture_approve_execution(job_id, false, false);
  select b.* into strict brief from public.capital_project_execution_briefs b
  join public.capital_project_execution_brief_dispatches d on d.execution_brief_id = b.id
  where d.processing_job_id = job_id;
  insert into route_proof values
    (p_trigger || ':brief', brief.id::text),
    (p_trigger || ':fingerprint', brief.brief_fingerprint),
    (p_trigger || ':project', brief.capital_project_id::text);
end;
$$;

-- The person, with the session owner's token: approves the brief of the held job with the
-- production command, then sees the job queued and the case still confirmed.
create function pg_temp.approve_route_brief(p_trigger text)
returns void language plpgsql as $$
declare
  result jsonb;
begin
  result := public.approve_advisor_execution_brief_v1(
    (select value::uuid from route_proof where label = p_trigger || ':project'),
    (select value::uuid from route_proof where label = p_trigger || ':brief'),
    (select value from route_proof where label = p_trigger || ':fingerprint'),
    gen_random_uuid());
  if result ->> 'status' <> 'queued' or (result ->> 'replayed')::boolean
    or result ->> 'processing_job_id' <> (select value from route_proof where label = p_trigger || ':job') then
    raise exception 'the approval of % did not queue its job: %', p_trigger, result;
  end if;
end;
$$;

-- A call of the person for a decision: the response names the job, its real status and whether
-- the call replayed an existing job.
create function pg_temp.enqueue_route(p_trigger text, p_status text, p_deduplicated boolean)
returns jsonb language plpgsql as $$
declare
  result jsonb := public.enqueue_deal_state_analysis(
    'd5200000-0000-4000-8000-000000000001', 'd5300000-0000-4000-8000-000000000001', p_trigger);
begin
  if result ->> 'trigger' <> p_trigger or result ->> 'job_status' <> p_status
    or (result ->> 'deduplicated')::boolean <> p_deduplicated then
    raise exception 'enqueue % answered %', p_trigger, result;
  end if;
  if p_deduplicated and result ->> 'job_id' is distinct from (select value from route_proof where label = p_trigger || ':job') then
    raise exception 'the replay of % named another job: %', p_trigger, result;
  end if;
  return result;
end;
$$;

-- A different decision while an analysis of the case is held or queued: the person asks for changes
-- to the structure, the documented return. The call is refused with the named error, and the
-- decision recorded in the same attempt is rolled back with it.
create function pg_temp.probe_other_decision(p_expected text)
returns void language plpgsql as $$
declare
  option_row public.deal_state_objects;
  refused text;
  result jsonb;
begin
  select * into strict option_row from public.deal_state_objects
  where intake_session_id = 'd5300000-0000-4000-8000-000000000001' and object_type = 'structure_option'
  order by object_version desc limit 1;
  begin
    perform public.record_deal_state_object(
      'd5200000-0000-4000-8000-000000000001', 'd5300000-0000-4000-8000-000000000001',
      'structure_decision', 'changes_requested', option_row.input_fingerprint,
      jsonb_build_object('schemaVersion', '2026.08.29-v2', 'confirmation', jsonb_build_object(
        'decision', 'request_changes', 'proposalFingerprint', repeat('9', 64),
        'requestedChanges', jsonb_build_array('Alongar o prazo'))),
      jsonb_build_array(jsonb_build_object('objectType', 'structure_option', 'objectFingerprint', option_row.object_fingerprint)));
    result := public.enqueue_deal_state_analysis(
      'd5200000-0000-4000-8000-000000000001', 'd5300000-0000-4000-8000-000000000001', 'structure_changes_requested');
    refused := null;
  exception when object_not_in_prerequisite_state then refused := sqlerrm;
  end;
  if p_expected is null then
    -- Beside a dead hold: not refused; the decision's own analysis is queued and held. The caller
    -- rolls the probe back to its savepoint.
    if refused is not null or result ->> 'job_status' <> 'awaiting_approval' or (result ->> 'deduplicated')::boolean then
      raise exception 'a different decision was refused beside a dead hold: %', coalesce(refused, result::text);
    end if;
    raise notice 'deal_state_route: different decision structure_changes_requested queued, not refused (% %)',
      result ->> 'job_status', result ->> 'deduplicated';
    return;
  end if;
  if refused is distinct from p_expected then
    raise exception 'a different decision was not refused with %: %', p_expected, coalesce(refused, 'queued');
  end if;
  raise notice 'deal_state_route: different decision structure_changes_requested refused with %', refused;
end;
$$;

-- Whether the held job of a decision can still be approved, as the queue and the settlement read it.
create function pg_temp.assert_hold(p_step text, p_trigger text, p_live boolean)
returns void language plpgsql as $$
declare job public.processing_jobs;
begin
  select * into strict job from public.processing_jobs
  where id = (select value::uuid from route_proof where label = p_trigger || ':job');
  if job.status <> 'awaiting_approval' or private.execution_hold_is_live_v1(job.id) <> p_live then
    raise exception '%: the held job % is % with live %, expected live %', p_step, job.id, job.status,
      private.execution_hold_is_live_v1(job.id), p_live;
  end if;
  raise notice 'deal_state_route: % | % job % awaiting_approval | live %', p_step, p_trigger, job.id, p_live;
end;
$$;

-- Beside the dead held job of a decision, the same decision queued a new held job with its own
-- proposal, instead of replaying the dead one.
create function pg_temp.assert_new_held(p_step text, p_trigger text)
returns void language plpgsql as $$
declare
  dead_id uuid := (select value::uuid from route_proof where label = p_trigger || ':job');
  fresh public.processing_jobs;
begin
  select * into strict fresh from public.processing_jobs
  where intake_session_id = 'd5300000-0000-4000-8000-000000000001' and kind = 'case_analysis'
    and payload ->> 'incremental_trigger' = p_trigger and id <> dead_id;
  if fresh.status <> 'awaiting_approval' or not private.execution_hold_is_live_v1(fresh.id)
    or private.execution_hold_is_live_v1(dead_id)
    or (select count(*) from public.processing_jobs proposal where proposal.kind = 'execution_brief_proposal'
        and proposal.status = 'queued' and proposal.payload ->> 'approval_target_job_id' = fresh.id::text) <> 1 then
    raise exception '%: the same decision did not queue one new held job with its proposal: %', p_step, to_jsonb(fresh);
  end if;
  raise notice 'deal_state_route: % | % new job % awaiting_approval with 1 queued proposal | dead job % not replayed',
    p_step, p_trigger, fresh.id, dead_id;
end;
$$;

-- One settlement pass cancelled the dead held job of a decision and its run; the case is confirmed.
create function pg_temp.assert_settled(p_step text, p_trigger text)
returns void language plpgsql as $$
declare
  job public.processing_jobs;
  run_status text;
  session_row public.document_intake_sessions;
begin
  select * into strict job from public.processing_jobs
  where id = (select value::uuid from route_proof where label = p_trigger || ':job');
  select status into strict run_status from public.processing_runs where id = job.processing_run_id;
  select * into strict session_row from public.document_intake_sessions where id = job.intake_session_id;
  if job.status <> 'cancelled' or job.last_error ->> 'reason' <> 'execution_approval_superseded'
    or run_status <> 'cancelled'
    or session_row.status <> 'confirmed' or session_row.current_run_id <> 'd5400000-0000-4000-8000-000000000001' then
    raise exception '%: job % %, reason %, run %, session %', p_step, job.id, job.status,
      job.last_error ->> 'reason', run_status, session_row.status;
  end if;
  raise notice 'deal_state_route: % | % job % cancelled (%) | run cancelled | session confirmed',
    p_step, p_trigger, job.id, job.last_error ->> 'reason';
end;
$$;

-- The worker, with its own account and token: leases the approved job, records its result through
-- the worker command and completes the job through the completion path.
create function pg_temp.work_route_job(p_trigger text, p_object_type text, p_input_fingerprint text, p_payload jsonb)
returns void language plpgsql as $$
declare
  claim jsonb := public.worker_claim_job_v4(repeat('r', 64), 600);
  job_id uuid := (select value::uuid from route_proof where label = p_trigger || ':job');
  completed jsonb;
begin
  if not coalesce((claim ->> 'claimed')::boolean, false) or (claim ->> 'job_id')::uuid <> job_id
    or claim ->> 'kind' <> 'case_analysis' then
    raise exception 'the worker did not lease the approved analysis of %: %', p_trigger, claim;
  end if;
  perform public.worker_record_deal_state_object(job_id, claim ->> 'capability_token', p_object_type,
    'pending_confirmation', p_input_fingerprint, p_payload,
    (select value::jsonb from route_proof where label = p_trigger || ':dependencies'));
  completed := public.worker_complete_job(job_id, claim ->> 'capability_token', '{}'::jsonb);
  if (completed ->> 'pending_jobs')::integer <> 0 or (completed ->> 'failed_jobs')::integer <> 0 then
    raise exception 'the completion of % left work in its run: %', p_trigger, completed;
  end if;
end;
$$;

-- The object a worker result depends on, read by the fixture owner for the worker's call.
create function pg_temp.remember_dependency(p_trigger text, p_object_type text)
returns void language sql as $$
  insert into route_proof
  select p_trigger || ':dependencies', jsonb_build_array(jsonb_build_object(
    'objectType', p_object_type, 'objectFingerprint', state_object.object_fingerprint))::text
  from public.deal_state_objects state_object
  where state_object.intake_session_id = 'd5300000-0000-4000-8000-000000000001' and state_object.object_type = p_object_type
  order by state_object.object_version desc limit 1;
$$;

create function pg_temp.as_owner() returns void language sql as $$
  select set_config('request.jwt.claims',
    '{"sub":"d5100000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}', true);
$$;
create function pg_temp.as_worker() returns void language sql as $$
  select set_config('request.jwt.claims',
    '{"sub":"d5100000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}', true);
$$;

-- 1. Understanding confirmed. The person confirms the diagnostic with the production command,
-- which countersigns the worker's snapshot and confirms the case (review_ready to confirmed);
-- then the analysis of that decision is queued and held for the approval of its execution brief.
set local role authenticated;
select pg_temp.as_owner();
do $$
declare result jsonb;
begin
  result := public.confirm_document_intake(
    'd5200000-0000-4000-8000-000000000001', 'd5300000-0000-4000-8000-000000000001', 'pt-BR');
  if (result ->> 'already_confirmed')::boolean or result ->> 'opportunity_id' is null then
    raise exception 'the diagnostic was not confirmed: %', result;
  end if;
  result := pg_temp.enqueue_route('understanding_confirmed', 'awaiting_approval', false);
  insert into route_proof values ('understanding_confirmed:job', result ->> 'job_id');
end;
$$;
reset role;
select pg_temp.assert_route('1 understanding confirmed, analysis held', 'understanding_confirmed', 'awaiting_approval');

-- The same decision while its job is held replays it: no second job, no second proposal. (The
-- understanding is the first decision of the route; no other decision exists yet to be refused.)
set local role authenticated;
select pg_temp.as_owner();
select pg_temp.enqueue_route('understanding_confirmed', 'awaiting_approval', true);
reset role;
select pg_temp.assert_route('1 replay while held', 'understanding_confirmed', 'awaiting_approval');
select pg_temp.assert_hold('1 brief being prepared', 'understanding_confirmed', true);
select private.settle_stale_execution_jobs_v1();
select pg_temp.assert_route('1 settlement leaves the hold', 'understanding_confirmed', 'awaiting_approval');

-- The person approves; the job is queued and the case stays confirmed (the approval used to move it
-- to processing). The worker leases it, records the structure alternatives and completes it; the
-- case is still confirmed (the completion used to move it to review_ready).
select pg_temp.prepare_route_brief('understanding_confirmed');
set local role authenticated;
select pg_temp.as_owner();
select pg_temp.approve_route_brief('understanding_confirmed');
select pg_temp.enqueue_route('understanding_confirmed', 'queued', true);
reset role;
select pg_temp.assert_route('1 approved, analysis queued', 'understanding_confirmed', 'queued');
select pg_temp.remember_dependency('understanding_confirmed', 'understanding_snapshot');
set local role authenticated;
select pg_temp.as_worker();
select pg_temp.work_route_job('understanding_confirmed', 'structure_option', repeat('1', 64),
  jsonb_build_object('compiled', jsonb_build_object('proposalFingerprint', repeat('9', 64))));
reset role;
select pg_temp.assert_route('1 completed by the worker', 'understanding_confirmed', 'succeeded');

-- 2. Structure confirmed, with the decision the structure form records.
set local role authenticated;
select pg_temp.as_owner();
do $$
declare
  option_row public.deal_state_objects;
  result jsonb;
begin
  select * into strict option_row from public.deal_state_objects
  where intake_session_id = 'd5300000-0000-4000-8000-000000000001' and object_type = 'structure_option'
    and status = 'pending_confirmation';
  perform public.record_deal_state_object(
    'd5200000-0000-4000-8000-000000000001', 'd5300000-0000-4000-8000-000000000001',
    'structure_decision', 'confirmed', option_row.input_fingerprint,
    jsonb_build_object('schemaVersion', '2026.08.29-v2', 'confirmation', jsonb_build_object(
      'decision', 'confirm', 'proposalFingerprint', repeat('9', 64), 'actorId', 'd5100000-0000-4000-8000-000000000001')),
    jsonb_build_array(jsonb_build_object('objectType', 'structure_option', 'objectFingerprint', option_row.object_fingerprint)));
  result := pg_temp.enqueue_route('structure_confirmed', 'awaiting_approval', false);
  insert into route_proof values ('structure_confirmed:job', result ->> 'job_id');
  perform pg_temp.enqueue_route('structure_confirmed', 'awaiting_approval', true);
  perform pg_temp.probe_other_decision('deal_state_analysis_awaiting_approval');
  -- The finished analysis of the understanding is replayed, never repeated.
  perform pg_temp.enqueue_route('understanding_confirmed', 'succeeded', true);
end;
$$;
reset role;
select pg_temp.assert_route('2 structure confirmed, analysis held', 'structure_confirmed', 'awaiting_approval');
select pg_temp.assert_hold('2 brief being prepared', 'structure_confirmed', true);
select private.settle_stale_execution_jobs_v1();
select pg_temp.assert_route('2 settlement leaves the hold', 'structure_confirmed', 'awaiting_approval');
select pg_temp.prepare_route_brief('structure_confirmed');
-- The brief is bound and its dispatch current: the hold is live, the settlement leaves it and the
-- other decision is still refused.
select pg_temp.assert_hold('2 dispatch current', 'structure_confirmed', true);
select private.settle_stale_execution_jobs_v1();
select pg_temp.assert_route('2 settlement leaves the approvable hold', 'structure_confirmed', 'awaiting_approval');
set local role authenticated;
select pg_temp.as_owner();
select pg_temp.probe_other_decision('deal_state_analysis_awaiting_approval');
reset role;

-- Dead hold 1, rolled back afterwards: a conversation turn asks to edit the brief. While its user
-- message is in progress the turn may still bind a new brief, so the hold stays live; once the turn
-- ends without one, nothing can approve the held job any more.
savepoint dead_after_edit;
insert into public.agent_conversations (organization_id, intake_session_id, state, created_by)
select 'd5200000-0000-4000-8000-000000000001', 'd5300000-0000-4000-8000-000000000001', 'idle', 'd5100000-0000-4000-8000-000000000001'
where not exists (select 1 from public.agent_conversations where intake_session_id = 'd5300000-0000-4000-8000-000000000001');
insert into public.agent_messages (id, organization_id, conversation_id, intake_session_id, role, status, content, locale, metadata, created_by)
select 'd5600000-0000-4000-8000-000000000001', 'd5200000-0000-4000-8000-000000000001', conversation.id,
  'd5300000-0000-4000-8000-000000000001', 'user', 'queued', 'Ajustar o plano da análise da estrutura', 'pt-BR', '{}',
  'd5100000-0000-4000-8000-000000000001'
from public.agent_conversations conversation
where conversation.intake_session_id = 'd5300000-0000-4000-8000-000000000001'
order by conversation.created_at limit 1;
insert into public.capital_project_execution_brief_events (organization_id, capital_project_id, execution_brief_id, event_type, actor_type, actor_user_id, event_payload)
values ('d5200000-0000-4000-8000-000000000001',
  (select value::uuid from route_proof where label = 'structure_confirmed:project'),
  (select value::uuid from route_proof where label = 'structure_confirmed:brief'),
  'edit_requested', 'user', 'd5100000-0000-4000-8000-000000000001', '{"source":"deal_state_route"}');
select pg_temp.assert_hold('2 edit requested, turn in progress', 'structure_confirmed', true);
select private.settle_stale_execution_jobs_v1();
select pg_temp.assert_route('2 settlement leaves the hold while the turn runs', 'structure_confirmed', 'awaiting_approval');
set local role authenticated;
select pg_temp.as_owner();
select pg_temp.probe_other_decision('deal_state_analysis_awaiting_approval');
reset role;
update public.agent_messages set status = 'completed' where id = 'd5600000-0000-4000-8000-000000000001';
select pg_temp.assert_hold('2 edit requested, no turn in progress', 'structure_confirmed', false);
savepoint dead_after_edit_same;
set local role authenticated;
select pg_temp.as_owner();
select pg_temp.enqueue_route('structure_confirmed', 'awaiting_approval', false);
reset role;
select pg_temp.assert_new_held('2 same decision beside the dead hold', 'structure_confirmed');
rollback to savepoint dead_after_edit_same;
savepoint dead_after_edit_other;
set local role authenticated;
select pg_temp.as_owner();
select pg_temp.probe_other_decision(null);
reset role;
rollback to savepoint dead_after_edit_other;
select private.settle_stale_execution_jobs_v1();
select pg_temp.assert_settled('2 one settlement pass after the edit', 'structure_confirmed');
rollback to savepoint dead_after_edit;

-- Dead hold 2, rolled back afterwards: a conversation turn activates a capital_project_analysis in
-- the same project. Its job is held with a newer brief, bound and current, the only kind of held job
-- production has today. The case analysis's brief is no longer the newest: its hold is dead, while
-- the capital_project_analysis hold is live and the settlement leaves it untouched.
savepoint dead_after_newer_brief;
insert into public.processing_runs (id, organization_id, intake_session_id, run_no, trigger, status, pipeline_version, created_by)
values ('d5400000-0000-4000-8000-000000000002', 'd5200000-0000-4000-8000-000000000001', 'd5300000-0000-4000-8000-000000000001',
  (select max(run_no) + 1 from public.processing_runs where intake_session_id = 'd5300000-0000-4000-8000-000000000001'),
  'manual', 'queued', 'deal-state-route-activation-v1', 'd5100000-0000-4000-8000-000000000001');
insert into public.processing_jobs (id, organization_id, processing_run_id, intake_session_id, kind, payload, max_attempts)
values ('d5500000-0000-4000-8000-000000000001', 'd5200000-0000-4000-8000-000000000001', 'd5400000-0000-4000-8000-000000000002',
  'd5300000-0000-4000-8000-000000000001', 'capital_project_analysis',
  jsonb_build_object('locale', 'pt-BR',
    'capital_project_id', (select value from route_proof where label = 'structure_confirmed:project'),
    'capital_project_plan_id', (select id::text from public.capital_project_plans
      where capital_project_id = (select value::uuid from route_proof where label = 'structure_confirmed:project') and status = 'active')),
  2);
select pg_temp.fixture_approve_execution('d5500000-0000-4000-8000-000000000001', false, false);
do $$
begin
  if (select status from public.processing_jobs where id = 'd5500000-0000-4000-8000-000000000001') <> 'awaiting_approval'
    or not private.execution_dispatch_is_current('d5500000-0000-4000-8000-000000000001', false)
    or not private.execution_hold_is_live_v1('d5500000-0000-4000-8000-000000000001') then
    raise exception 'the capital_project_analysis is not held with a current dispatch';
  end if;
end;
$$;
select pg_temp.assert_hold('2 newer brief in the project', 'structure_confirmed', false);
savepoint dead_after_newer_same;
set local role authenticated;
select pg_temp.as_owner();
select pg_temp.enqueue_route('structure_confirmed', 'awaiting_approval', false);
reset role;
select pg_temp.assert_new_held('2 same decision beside the superseded hold', 'structure_confirmed');
rollback to savepoint dead_after_newer_same;
savepoint dead_after_newer_other;
set local role authenticated;
select pg_temp.as_owner();
select pg_temp.probe_other_decision(null);
reset role;
rollback to savepoint dead_after_newer_other;
select private.settle_stale_execution_jobs_v1();
select pg_temp.assert_settled('2 one settlement pass after the newer brief', 'structure_confirmed');
do $$
declare job public.processing_jobs;
begin
  select * into strict job from public.processing_jobs where id = 'd5500000-0000-4000-8000-000000000001';
  if job.status <> 'awaiting_approval' or job.last_error is not null
    or not private.execution_dispatch_is_current(job.id, false) then
    raise exception 'the settlement touched the approvable capital_project_analysis: %', to_jsonb(job);
  end if;
  raise notice 'deal_state_route: 2 held capital_project_analysis % with a current dispatch untouched by the settlement', job.id;
end;
$$;
rollback to savepoint dead_after_newer_brief;
select pg_temp.assert_hold('2 back on the route', 'structure_confirmed', true);
set local role authenticated;
select pg_temp.as_owner();
select pg_temp.approve_route_brief('structure_confirmed');
select pg_temp.enqueue_route('structure_confirmed', 'queued', true);
select pg_temp.probe_other_decision('deal_state_analysis_already_running');
reset role;
select pg_temp.assert_route('2 approved, analysis queued', 'structure_confirmed', 'queued');
select pg_temp.remember_dependency('structure_confirmed', 'structure_decision');
set local role authenticated;
select pg_temp.as_worker();
select pg_temp.work_route_job('structure_confirmed', 'production_plan', repeat('2', 64),
  '{"artifacts":["teaser","financial_model","indicative_term_sheet","data_room_index"]}'::jsonb);
reset role;
select pg_temp.assert_route('2 completed by the worker', 'structure_confirmed', 'succeeded');

-- 3. Production plan approved, as the plan form records it: the worker's plan with the approval.
set local role authenticated;
select pg_temp.as_owner();
do $$
declare
  plan public.deal_state_objects;
  result jsonb;
begin
  select * into strict plan from public.deal_state_objects
  where intake_session_id = 'd5300000-0000-4000-8000-000000000001' and object_type = 'production_plan'
    and status = 'pending_confirmation';
  perform public.record_deal_state_object(
    'd5200000-0000-4000-8000-000000000001', 'd5300000-0000-4000-8000-000000000001',
    'production_plan', 'approved', plan.input_fingerprint,
    plan.payload || jsonb_build_object('approval', jsonb_build_object(
      'actorId', 'd5100000-0000-4000-8000-000000000001', 'approvedAt', now(), 'scope', 'internal_material_preparation')),
    plan.dependencies);
  result := pg_temp.enqueue_route('production_plan_approved', 'awaiting_approval', false);
  insert into route_proof values ('production_plan_approved:job', result ->> 'job_id');
  perform pg_temp.enqueue_route('production_plan_approved', 'awaiting_approval', true);
  perform pg_temp.probe_other_decision('deal_state_analysis_awaiting_approval');
end;
$$;
reset role;
select pg_temp.assert_route('3 production plan approved, analysis held', 'production_plan_approved', 'awaiting_approval');
select pg_temp.prepare_route_brief('production_plan_approved');
set local role authenticated;
select pg_temp.as_owner();
select pg_temp.approve_route_brief('production_plan_approved');
select pg_temp.enqueue_route('production_plan_approved', 'queued', true);
select pg_temp.probe_other_decision('deal_state_analysis_already_running');
reset role;
select pg_temp.assert_route('3 approved, analysis queued', 'production_plan_approved', 'queued');
select pg_temp.remember_dependency('production_plan_approved', 'production_plan');
set local role authenticated;
select pg_temp.as_worker();
select pg_temp.work_route_job('production_plan_approved', 'material_artifact', repeat('3', 64),
  '{"materials":[],"financialModel":null,"materialTruth":{},"dataRoom":{}}'::jsonb);
reset role;
select pg_temp.assert_route('3 completed by the worker, material artifact recorded', 'production_plan_approved', 'succeeded');

-- 4. Material package approved, as the package form records it (the trigger of #797): the analysis
-- that screens financiers is held, approved and queued.
set local role authenticated;
select pg_temp.as_owner();
do $$
declare
  plan public.deal_state_objects;
  artifact public.deal_state_objects;
  result jsonb;
begin
  select * into strict plan from public.deal_state_objects
  where intake_session_id = 'd5300000-0000-4000-8000-000000000001' and object_type = 'production_plan' and status = 'approved';
  select * into strict artifact from public.deal_state_objects
  where intake_session_id = 'd5300000-0000-4000-8000-000000000001' and object_type = 'material_artifact';
  perform public.record_deal_state_object(
    'd5200000-0000-4000-8000-000000000001', 'd5300000-0000-4000-8000-000000000001',
    'package_review', 'approved', artifact.input_fingerprint,
    jsonb_build_object('schemaVersion', '2026.08.29-v1', 'approval', jsonb_build_object(
      'actorId', 'd5100000-0000-4000-8000-000000000001', 'approvedAt', now(),
      'scope', 'internal_material_package', 'artifactFingerprint', artifact.object_fingerprint)),
    jsonb_build_array(
      jsonb_build_object('objectType', 'production_plan', 'objectFingerprint', plan.object_fingerprint),
      jsonb_build_object('objectType', 'material_artifact', 'objectFingerprint', artifact.object_fingerprint)));
  result := pg_temp.enqueue_route('material_package_approved', 'awaiting_approval', false);
  insert into route_proof values ('material_package_approved:job', result ->> 'job_id');
  perform pg_temp.enqueue_route('material_package_approved', 'awaiting_approval', true);
  perform pg_temp.probe_other_decision('deal_state_analysis_awaiting_approval');
end;
$$;
reset role;
select pg_temp.assert_route('4 material package approved, analysis held', 'material_package_approved', 'awaiting_approval');
select pg_temp.prepare_route_brief('material_package_approved');
set local role authenticated;
select pg_temp.as_owner();
select pg_temp.approve_route_brief('material_package_approved');
select pg_temp.enqueue_route('material_package_approved', 'queued', true);
select pg_temp.probe_other_decision('deal_state_analysis_already_running');
reset role;
select pg_temp.assert_route('4 approved, analysis queued', 'material_package_approved', 'queued');

-- The whole route: one analysis per decision, each with one proposal and one approved brief; the
-- earlier decisions replay their finished analyses; the case is confirmed on its intake run.
set local role authenticated;
select pg_temp.as_owner();
select pg_temp.enqueue_route('understanding_confirmed', 'succeeded', true);
select pg_temp.enqueue_route('structure_confirmed', 'succeeded', true);
select pg_temp.enqueue_route('production_plan_approved', 'succeeded', true);
reset role;
do $$
declare
  jobs integer;
  proposals integer;
  briefs integer;
begin
  select count(*) into jobs from public.processing_jobs
  where intake_session_id = 'd5300000-0000-4000-8000-000000000001' and kind = 'case_analysis';
  select count(*) into proposals from public.processing_jobs
  where intake_session_id = 'd5300000-0000-4000-8000-000000000001' and kind = 'execution_brief_proposal';
  select count(*) into briefs from public.capital_project_execution_brief_dispatches
  where processing_job_id in (select id from public.processing_jobs
    where intake_session_id = 'd5300000-0000-4000-8000-000000000001' and kind = 'case_analysis')
    and accepted_at is not null;
  if jobs <> 4 or proposals <> 4 or briefs <> 4
    or (select count(distinct object_type) from public.deal_state_objects
        where intake_session_id = 'd5300000-0000-4000-8000-000000000001'
          and object_type in ('structure_option', 'production_plan', 'material_artifact', 'package_review')) <> 4 then
    raise exception 'the route left % analyses, % proposals and % approved briefs', jobs, proposals, briefs;
  end if;
  raise notice 'deal_state_route: whole route | case analyses % | proposals % | approved briefs % | session %',
    jobs, proposals, briefs,
    (select status from public.document_intake_sessions where id = 'd5300000-0000-4000-8000-000000000001');
end;
$$;

-- An archived case never starts its queued analysis: the worker leases nothing, the job is settled
-- as superseded and the case stays confirmed.
update public.document_intake_sessions
set archived_at = now(), archived_by = 'd5100000-0000-4000-8000-000000000001'
where id = 'd5300000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.as_worker();
do $$
declare claim jsonb := public.worker_claim_job_v4(repeat('r', 64), 600);
begin
  if coalesce((claim ->> 'claimed')::boolean, false) then
    raise exception 'the worker leased an analysis of an archived case: %', claim;
  end if;
end;
$$;
reset role;
do $$
begin
  if (select status from public.processing_jobs
      where id = (select value::uuid from route_proof where label = 'material_package_approved:job')) <> 'cancelled'
    or (select status from public.document_intake_sessions where id = 'd5300000-0000-4000-8000-000000000001') <> 'confirmed'
    or exists (select 1 from public.processing_jobs
      where intake_session_id = 'd5300000-0000-4000-8000-000000000001' and status in ('queued', 'leased')) then
    raise exception 'the archived case kept a live analysis or left the confirmed state';
  end if;
  raise notice 'deal_state_route: archived case | queued analysis cancelled | session confirmed';
end;
$$;

-- Access is checked before any replay: once the owner's membership is revoked, and for a person
-- outside the tenant, every call is refused and nothing is queued.
update public.organization_memberships set status = 'revoked'
where organization_id = 'd5200000-0000-4000-8000-000000000001' and user_id = 'd5100000-0000-4000-8000-000000000001';
set local role authenticated;
do $$
declare
  person text;
  refused text;
begin
  foreach person in array array['d5100000-0000-4000-8000-000000000001', 'd5100000-0000-4000-8000-000000000002'] loop
    perform set_config('request.jwt.claims',
      jsonb_build_object('sub', person, 'role', 'authenticated', 'aal', 'aal1')::text, true);
    begin
      perform public.enqueue_deal_state_analysis(
        'd5200000-0000-4000-8000-000000000001', 'd5300000-0000-4000-8000-000000000001', 'material_package_approved');
      refused := null;
    exception when insufficient_privilege then refused := sqlerrm;
    end;
    if refused is distinct from 'deal_state_analysis_access_denied' then
      raise exception 'a person without access reached the analysis: %', coalesce(refused, 'accepted');
    end if;
  end loop;
end;
$$;
reset role;
do $$
begin
  if (select count(*) from public.processing_jobs
      where intake_session_id = 'd5300000-0000-4000-8000-000000000001' and kind = 'case_analysis') <> 4 then
    raise exception 'a refused call queued a case analysis';
  end if;
end;
$$;

select 'deal_state_route: PASS' as result;
rollback;
