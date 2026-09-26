-- The approval of the material package queues the case analysis that screens financiers
-- (migration material_package_approved_trigger). Synthetic data only; everything is rolled back.
begin;
\ir support/execution_approval.sql

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
) values
  (
    'b7100000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
    'package-owner@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb, now(), now(), false, false
  ),
  (
    'b7100000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
    'package-outsider@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb, now(), now(), false, false
  );
insert into public.organizations (id, organization_type, name, created_by) values
  ('b7200000-0000-4000-8000-000000000001', 'company', 'Package Tenant A', 'b7100000-0000-4000-8000-000000000001'),
  ('b7200000-0000-4000-8000-000000000002', 'company', 'Package Tenant B', 'b7100000-0000-4000-8000-000000000002');
insert into public.organization_memberships (organization_id, user_id, role, status, joined_at) values
  ('b7200000-0000-4000-8000-000000000001', 'b7100000-0000-4000-8000-000000000001', 'owner', 'active', now()),
  ('b7200000-0000-4000-8000-000000000002', 'b7100000-0000-4000-8000-000000000002', 'owner', 'active', now());
insert into public.document_intake_sessions (id, organization_id, started_by, journey, locale) values
  ('b7300000-0000-4000-8000-000000000001', 'b7200000-0000-4000-8000-000000000001', 'b7100000-0000-4000-8000-000000000001', 'company', 'pt-BR');

-- A confirmed case: the session names its opportunity, and the governed chain reaches an approved
-- production plan and the material artifact compiled from it.
do $$
declare
  org constant uuid := 'b7200000-0000-4000-8000-000000000001';
  session_id constant uuid := 'b7300000-0000-4000-8000-000000000001';
  owner_id constant uuid := 'b7100000-0000-4000-8000-000000000001';
  company uuid;
  request uuid;
  opportunity uuid;
  fingerprint text;
begin
  insert into public.companies (organization_id, legal_name, jurisdiction_code, created_by)
  values (org, 'Synthetic package company', 'BR', owner_id) returning id into company;
  insert into public.capital_requests (organization_id, company_id, purpose, requested_amount, currency, created_by)
  values (org, company, 'Synthetic package request', 100, 'BRL', owner_id) returning id into request;
  insert into public.opportunities (
    organization_id, company_id, capital_request_id, title, purpose, requested_amount, currency, lead_user_id, created_by,
    capital_project_id
  ) values (
    org, company, request, 'Synthetic package case', 'Synthetic package request', 100, 'BRL', owner_id, owner_id,
    (select capital_project_id from public.document_intake_sessions where id = session_id)
  ) returning id into opportunity;
  update public.document_intake_sessions set status = 'confirmed', opportunity_id = opportunity where id = session_id;

  perform private.append_deal_state_object(org, session_id, 'understanding_snapshot', 'confirmed', repeat('1', 64),
    '{"readiness":{"state":"ready","blockers":[]}}'::jsonb, '[]'::jsonb, owner_id, 'user');
  select object_fingerprint into fingerprint from public.deal_state_objects
  where intake_session_id = session_id and object_type = 'understanding_snapshot';
  perform private.append_deal_state_object(org, session_id, 'structure_option', 'pending_confirmation', repeat('2', 64),
    jsonb_build_object('compiled', jsonb_build_object('proposalFingerprint', repeat('9', 64))),
    jsonb_build_array(jsonb_build_object('objectType', 'understanding_snapshot', 'objectFingerprint', fingerprint)), null, 'worker');
  select object_fingerprint into fingerprint from public.deal_state_objects
  where intake_session_id = session_id and object_type = 'structure_option';
  perform private.append_deal_state_object(org, session_id, 'structure_decision', 'confirmed', repeat('3', 64),
    jsonb_build_object('confirmation', jsonb_build_object('decision', 'confirm', 'proposalFingerprint', repeat('9', 64))),
    jsonb_build_array(jsonb_build_object('objectType', 'structure_option', 'objectFingerprint', fingerprint)), owner_id, 'user');
  select object_fingerprint into fingerprint from public.deal_state_objects
  where intake_session_id = session_id and object_type = 'structure_decision';
  perform private.append_deal_state_object(org, session_id, 'production_plan', 'approved', repeat('4', 64),
    '{"artifacts":["teaser","financial_model","indicative_term_sheet","data_room_index"]}'::jsonb,
    jsonb_build_array(jsonb_build_object('objectType', 'structure_decision', 'objectFingerprint', fingerprint)), owner_id, 'user');
  select object_fingerprint into fingerprint from public.deal_state_objects
  where intake_session_id = session_id and object_type = 'production_plan';
  perform private.append_deal_state_object(org, session_id, 'material_artifact', 'pending_confirmation', repeat('5', 64),
    '{"materials":[],"financialModel":null,"materialTruth":{},"dataRoom":{}}'::jsonb,
    jsonb_build_array(jsonb_build_object('objectType', 'production_plan', 'objectFingerprint', fingerprint)), null, 'worker');
end;
$$;

-- The package review as the approval action records it: bound to the approved plan and to the
-- exact material artifact. Version 1 asks for changes; version 2, appended later, approves.
create function pg_temp.fixture_package_review(p_status text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  org constant uuid := 'b7200000-0000-4000-8000-000000000001';
  session_id constant uuid := 'b7300000-0000-4000-8000-000000000001';
  plan_fingerprint text;
  material_fingerprint text;
  review_id uuid;
begin
  select object_fingerprint into strict plan_fingerprint from public.deal_state_objects
  where intake_session_id = session_id and object_type = 'production_plan';
  select object_fingerprint into strict material_fingerprint from public.deal_state_objects
  where intake_session_id = session_id and object_type = 'material_artifact';
  review_id := private.append_deal_state_object(org, session_id, 'package_review', p_status, repeat('5', 64),
    jsonb_build_object('approval', jsonb_build_object(
      'scope', 'internal_material_package', 'artifactFingerprint', material_fingerprint, 'decision', p_status
    )),
    jsonb_build_array(
      jsonb_build_object('objectType', 'production_plan', 'objectFingerprint', plan_fingerprint),
      jsonb_build_object('objectType', 'material_artifact', 'objectFingerprint', material_fingerprint)
    ),
    'b7100000-0000-4000-8000-000000000001', 'user');
  return (select object_fingerprint from public.deal_state_objects where id = review_id);
end;
$$;
revoke all on function pg_temp.fixture_package_review(text) from public, anon, authenticated;
create temporary table package_trigger_proof (label text primary key, value text) on commit drop;
grant select, insert on package_trigger_proof to authenticated;

-- 1. Without a package review, and with one whose latest version is not approved, the trigger is
-- refused and nothing is queued.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"b7100000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}', true);
do $$
declare refused text;
begin
  begin
    perform public.enqueue_deal_state_analysis(
      'b7200000-0000-4000-8000-000000000001', 'b7300000-0000-4000-8000-000000000001', 'material_package_approved');
    refused := null;
  exception when object_not_in_prerequisite_state then refused := sqlerrm;
  end;
  if refused is distinct from 'current_deal_state_trigger_required' then
    raise exception 'the package trigger ran without a package review: %', coalesce(refused, 'accepted');
  end if;
end;
$$;

reset role;
select pg_temp.fixture_package_review('changes_requested');
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"b7100000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}', true);
do $$
declare refused text;
begin
  begin
    perform public.enqueue_deal_state_analysis(
      'b7200000-0000-4000-8000-000000000001', 'b7300000-0000-4000-8000-000000000001', 'material_package_approved');
    refused := null;
  exception when object_not_in_prerequisite_state then refused := sqlerrm;
  end;
  if refused is distinct from 'current_deal_state_trigger_required' then
    raise exception 'a package review that is not approved queued the analysis: %', coalesce(refused, 'accepted');
  end if;
end;
$$;

-- 2. The approved package review queues one case analysis for its exact fingerprint. Every case
-- belongs to a project, so the job waits, as every case analysis of a project does, for the person
-- to approve its execution, and an execution brief proposal is queued for that approval.
reset role;
insert into package_trigger_proof values ('package_fingerprint', pg_temp.fixture_package_review('approved'));
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"b7100000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}', true);
do $$
declare
  result jsonb;
  package_fingerprint text := (select value from package_trigger_proof where label = 'package_fingerprint');
begin
  result := public.enqueue_deal_state_analysis(
    'b7200000-0000-4000-8000-000000000001', 'b7300000-0000-4000-8000-000000000001', 'material_package_approved');
  if result ->> 'trigger' <> 'material_package_approved'
    or result ->> 'trigger_fingerprint' <> package_fingerprint
    or (result ->> 'deduplicated')::boolean then
    raise exception 'the approved package did not queue its analysis: %', result;
  end if;
  insert into package_trigger_proof values ('first', result::text);
end;
$$;

reset role;
do $$
declare
  first_result jsonb := (select value::jsonb from package_trigger_proof where label = 'first');
  package_fingerprint text := (select value from package_trigger_proof where label = 'package_fingerprint');
  job public.processing_jobs;
begin
  if (select count(*) from public.processing_jobs
      where intake_session_id = 'b7300000-0000-4000-8000-000000000001' and kind = 'case_analysis') <> 1 then
    raise exception 'the package approval did not leave exactly one case analysis job';
  end if;
  select * into strict job from public.processing_jobs where id = (first_result ->> 'job_id')::uuid;
  if job.kind <> 'case_analysis'
    or job.status <> 'awaiting_approval'
    or job.payload ->> 'incremental_trigger' <> 'material_package_approved'
    or job.payload ->> 'trigger_fingerprint' <> package_fingerprint
    or (job.payload #>> '{model_budget,max_cost_usd}')::numeric <> 3.10
    or job.processing_run_id <> (first_result ->> 'processing_run_id')::uuid
    or not exists (
      select 1 from public.processing_runs run
      where run.id = job.processing_run_id
        and run.versions #>> '{incremental_deal_state,trigger}' = 'material_package_approved'
        and run.versions #>> '{incremental_deal_state,trigger_fingerprint}' = package_fingerprint
    ) then
    raise exception 'the queued analysis is not bound to the approved package: %', to_jsonb(job);
  end if;
  if (select count(*) from public.processing_jobs proposal
      where proposal.intake_session_id = job.intake_session_id and proposal.kind = 'execution_brief_proposal'
        and proposal.payload ->> 'approval_target_job_id' = job.id::text) <> 1 then
    raise exception 'the held analysis has no execution brief proposal for the person to approve';
  end if;
  raise notice 'material_package_trigger: job % % trigger % fingerprint %',
    job.id, job.status, job.payload ->> 'incremental_trigger', job.payload ->> 'trigger_fingerprint';
end;
$$;

-- 3. The person approves the execution with the production approval command, and the job is
-- queued. The case stays confirmed (migration deal_state_route), the state this function requires,
-- and the same decision is a replay of the queued job, never a second analysis.
select pg_temp.fixture_approve_execution(
  (select (value::jsonb ->> 'job_id')::uuid from package_trigger_proof where label = 'first'));
do $$
begin
  if (select status from public.document_intake_sessions where id = 'b7300000-0000-4000-8000-000000000001') <> 'confirmed' then
    raise exception 'the approval of the package analysis reopened the confirmed case';
  end if;
end;
$$;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"b7100000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}', true);
do $$
declare
  first_result jsonb := (select value::jsonb from package_trigger_proof where label = 'first');
  package_fingerprint text := (select value from package_trigger_proof where label = 'package_fingerprint');
  replay jsonb;
begin
  replay := public.enqueue_deal_state_analysis(
    'b7200000-0000-4000-8000-000000000001', 'b7300000-0000-4000-8000-000000000001', 'material_package_approved');
  if not (replay ->> 'deduplicated')::boolean
    or replay ->> 'job_id' <> first_result ->> 'job_id'
    or replay ->> 'job_status' <> 'queued'
    or replay ->> 'trigger_fingerprint' <> package_fingerprint then
    raise exception 'the same package approval was not replayed: %', replay;
  end if;
  raise notice 'material_package_trigger: replay deduplicated % job % %',
    replay ->> 'deduplicated', replay ->> 'job_id', replay ->> 'job_status';
end;
$$;

-- 4. An unknown trigger is still refused, and a person without access to the case is refused.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"b7100000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}', true);
do $$
declare refused text;
begin
  begin
    perform public.enqueue_deal_state_analysis(
      'b7200000-0000-4000-8000-000000000001', 'b7300000-0000-4000-8000-000000000001', 'match_screen_approved');
    refused := null;
  exception when invalid_parameter_value then refused := sqlerrm;
  end;
  if refused is distinct from 'deal_state_analysis_trigger_invalid' then
    raise exception 'an unknown trigger was accepted: %', coalesce(refused, 'accepted');
  end if;
end;
$$;

select set_config('request.jwt.claims',
  '{"sub":"b7100000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}', true);
do $$
declare refused text;
begin
  begin
    perform public.enqueue_deal_state_analysis(
      'b7200000-0000-4000-8000-000000000001', 'b7300000-0000-4000-8000-000000000001', 'material_package_approved');
    refused := null;
  exception when insufficient_privilege then refused := sqlerrm;
  end;
  if refused is distinct from 'deal_state_analysis_access_denied' then
    raise exception 'a person without access queued the package analysis: %', coalesce(refused, 'accepted');
  end if;
end;
$$;

reset role;
do $$
begin
  if (select count(*) from public.processing_jobs
      where intake_session_id = 'b7300000-0000-4000-8000-000000000001' and kind = 'case_analysis') <> 1 then
    raise exception 'a refused call queued a case analysis';
  end if;
end;
$$;

select 'material_package_analysis_trigger: PASS' as result;
rollback;
