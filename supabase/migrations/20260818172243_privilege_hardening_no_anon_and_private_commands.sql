-- Privilege hardening: `anon` holds nothing in the Data API, and the pipeline commands move
-- to `private` behind thin invoker wrappers.
--
-- Found by running the security advisor right after 20260818171246 (F1-1). Two defects, the
-- first pre-existing and invisible to CI:
--
--   1. This project still carries the Supabase bootstrap `alter default privileges in schema
--      public grant all on tables/sequences/functions to anon, authenticated`. Migration
--      20260815022143 revoked the privileges table by table but never touched the *defaults*,
--      so every object created afterwards silently inherited `anon=arwdDxtm,
--      authenticated=arwdDxtm`: document_intake_sessions, intake_field_candidates and
--      intake_issues (20260817202038), the four F1 tables, and every `public` function
--      (15 of them were executable by `anon`). On processing_jobs it also defeated the
--      column-level grant that keeps `payload` — the short-lived signed URLs — out of reach
--      of organization members.
--      No data was exposed: there is no policy for `anon` on any table, and no policy lets a
--      tenant write runs or jobs, so RLS refused every read and every forged job. But
--      "minimal grants to `authenticated` only" (AGENTS.md §2.5/§6) was simply not true in
--      the project. A fresh local stack does not have those default privileges, which is why
--      the migrations and the RLS test looked right — the CI stack and the project had
--      drifted. Both invariants are now asserted in supabase/tests/rls_non_interference.sql.
--
--   2. The F1 commands were created as `security definer` in `public`. AGENTS.md §6 requires
--      definer functions to live in `private`, revoked from `public` and granted narrowly,
--      which also gives a second, independent barrier: reaching an implementation needs a
--      grant on the wrapper *and* a grant on the private function, and `anon` has no `usage`
--      on the `private` schema at all. `public` keeps a `security invoker` wrapper with the
--      same name and signature, so callers and tests are unchanged.
--
-- The worker's authorization model does not change: same signatures, same two credentials
-- (hashed worker token to claim a job, per-job capability token for everything after), same
-- absence of a service-role key.

-- ---------------------------------------------------------------------------------------------
-- 1. Stop the leak at the source: no default privileges for the Data API roles
-- ---------------------------------------------------------------------------------------------

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

-- Objects created by `supabase_admin` (extensions and platform internals) carry their own
-- default ACL. Adjust it when this role is allowed to; never fail the migration for it.
do $$
begin
  execute 'alter default privileges for role supabase_admin in schema public revoke all on tables from anon, authenticated';
  execute 'alter default privileges for role supabase_admin in schema public revoke all on sequences from anon, authenticated';
  execute 'alter default privileges for role supabase_admin in schema public revoke all on functions from anon, authenticated';
exception
  when others then
    raise notice 'default privileges for role supabase_admin left unchanged: %', sqlerrm;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 2. `anon` keeps only `usage` on the schema (PostgREST needs it); no object privileges
-- ---------------------------------------------------------------------------------------------

revoke all privileges on all tables in schema public from anon;
revoke all privileges on all sequences in schema public from anon;
revoke all privileges on all functions in schema public from anon;

-- ---------------------------------------------------------------------------------------------
-- 3. Restate the minimal grants for the tables that inherited the defaults, so the project
--    matches exactly what a migration run from scratch produces.
-- ---------------------------------------------------------------------------------------------

revoke all privileges on table
  public.document_intake_sessions,
  public.intake_field_candidates,
  public.intake_issues,
  public.processing_runs,
  public.processing_jobs,
  public.document_profiles,
  public.document_layers
from anon, authenticated;

-- 20260817202038_document_first_intake
grant select, insert, update on public.document_intake_sessions to authenticated;
grant select, insert, update, delete on public.intake_field_candidates to authenticated;
grant select, insert, update, delete on public.intake_issues to authenticated;

-- 20260818171246_intelligence_runs_profiles_layers (runs and jobs are written by commands
-- only; `payload` stays out of the column list on purpose)
grant select on public.processing_runs to authenticated;
grant select (id, organization_id, processing_run_id, intake_session_id, source_document_id, kind, status, attempts, max_attempts, available_at, lease_expires_at, created_at, updated_at)
  on public.processing_jobs to authenticated;
grant select, update on public.document_profiles to authenticated;
grant select on public.document_layers to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 4. Definer implementations move to `private`; `public` exposes invoker wrappers
-- ---------------------------------------------------------------------------------------------

alter function public.begin_processing_run(uuid, uuid, text, jsonb, text, jsonb) set schema private;
alter function public.worker_claim_job(text, integer) set schema private;
alter function public.worker_heartbeat(uuid, text, integer) set schema private;
alter function public.worker_write_stage_result(uuid, text, text, text, jsonb, jsonb) set schema private;
alter function public.worker_record_document_result(uuid, text, jsonb, jsonb, jsonb) set schema private;
alter function public.worker_complete_job(uuid, text, jsonb) set schema private;
alter function public.worker_fail_job(uuid, text, jsonb, boolean, integer) set schema private;

-- Internal helper; it was never meant to be part of the API surface.
alter function public.jsonb_merge_numeric(jsonb, jsonb) set schema private;

-- Same body as 20260818171246, with the helper now resolved in `private`.
create or replace function private.worker_write_stage_result(
  p_job_id uuid,
  p_capability_token text,
  p_stage text,
  p_status text,
  p_detail jsonb default '{}'::jsonb,
  p_usage jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  stage_entry jsonb;
begin
  if coalesce(trim(p_stage), '') = '' then
    raise exception 'stage_required' using errcode = '22023';
  end if;
  if p_status not in ('started', 'succeeded', 'failed', 'skipped') then
    raise exception 'stage_status_invalid' using errcode = '22023';
  end if;

  stage_entry := jsonb_build_object(
    'stage', trim(p_stage),
    'status', p_status,
    'job_id', job_row.id,
    'source_document_id', job_row.source_document_id,
    'at', to_jsonb(now()),
    'detail', coalesce(p_detail, '{}'::jsonb)
  );

  update public.processing_runs
  set stages = stages || jsonb_build_array(stage_entry),
      usage = private.jsonb_merge_numeric(usage, coalesce(p_usage, '{}'::jsonb))
  where organization_id = job_row.organization_id and id = job_row.processing_run_id;

  return jsonb_build_object('recorded', true, 'stage', trim(p_stage), 'status', p_status);
end;
$$;

-- The moved functions keep the ACL they had in `public`; restate it explicitly.
revoke all on function private.begin_processing_run(uuid, uuid, text, jsonb, text, jsonb) from public, anon;
revoke all on function private.worker_claim_job(text, integer) from public, anon;
revoke all on function private.worker_heartbeat(uuid, text, integer) from public, anon;
revoke all on function private.worker_write_stage_result(uuid, text, text, text, jsonb, jsonb) from public, anon;
revoke all on function private.worker_record_document_result(uuid, text, jsonb, jsonb, jsonb) from public, anon;
revoke all on function private.worker_complete_job(uuid, text, jsonb) from public, anon;
revoke all on function private.worker_fail_job(uuid, text, jsonb, boolean, integer) from public, anon;
revoke all on function private.jsonb_merge_numeric(jsonb, jsonb) from public, anon, authenticated;

grant execute on function private.begin_processing_run(uuid, uuid, text, jsonb, text, jsonb) to authenticated;
grant execute on function private.worker_claim_job(text, integer) to authenticated;
grant execute on function private.worker_heartbeat(uuid, text, integer) to authenticated;
grant execute on function private.worker_write_stage_result(uuid, text, text, text, jsonb, jsonb) to authenticated;
grant execute on function private.worker_record_document_result(uuid, text, jsonb, jsonb, jsonb) to authenticated;
grant execute on function private.worker_complete_job(uuid, text, jsonb) to authenticated;
grant execute on function private.worker_fail_job(uuid, text, jsonb, boolean, integer) to authenticated;

-- Wrappers: the API surface. `security invoker`, so the caller must hold the grant on the
-- private implementation as well.
create function public.begin_processing_run(
  p_organization_id uuid,
  p_session_id uuid,
  p_trigger text,
  p_documents jsonb,
  p_pipeline_version text,
  p_budget jsonb default '{}'::jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.begin_processing_run(
    p_organization_id, p_session_id, p_trigger, p_documents, p_pipeline_version, p_budget
  );
$$;

create function public.worker_claim_job(p_worker_token text, p_lease_seconds integer default 600)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_claim_job(p_worker_token, p_lease_seconds);
$$;

create function public.worker_heartbeat(p_job_id uuid, p_capability_token text, p_lease_seconds integer default 600)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_heartbeat(p_job_id, p_capability_token, p_lease_seconds);
$$;

create function public.worker_write_stage_result(
  p_job_id uuid,
  p_capability_token text,
  p_stage text,
  p_status text,
  p_detail jsonb default '{}'::jsonb,
  p_usage jsonb default '{}'::jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_write_stage_result(
    p_job_id, p_capability_token, p_stage, p_status, p_detail, p_usage
  );
$$;

create function public.worker_record_document_result(
  p_job_id uuid,
  p_capability_token text,
  p_scan_result jsonb,
  p_profile jsonb,
  p_layer jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_record_document_result(
    p_job_id, p_capability_token, p_scan_result, p_profile, p_layer
  );
$$;

create function public.worker_complete_job(p_job_id uuid, p_capability_token text, p_result jsonb default '{}'::jsonb)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_complete_job(p_job_id, p_capability_token, p_result);
$$;

create function public.worker_fail_job(
  p_job_id uuid,
  p_capability_token text,
  p_error jsonb,
  p_retryable boolean default true,
  p_retry_in_seconds integer default 60
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_fail_job(p_job_id, p_capability_token, p_error, p_retryable, p_retry_in_seconds);
$$;

revoke all on function public.begin_processing_run(uuid, uuid, text, jsonb, text, jsonb) from public, anon;
revoke all on function public.worker_claim_job(text, integer) from public, anon;
revoke all on function public.worker_heartbeat(uuid, text, integer) from public, anon;
revoke all on function public.worker_write_stage_result(uuid, text, text, text, jsonb, jsonb) from public, anon;
revoke all on function public.worker_record_document_result(uuid, text, jsonb, jsonb, jsonb) from public, anon;
revoke all on function public.worker_complete_job(uuid, text, jsonb) from public, anon;
revoke all on function public.worker_fail_job(uuid, text, jsonb, boolean, integer) from public, anon;

grant execute on function public.begin_processing_run(uuid, uuid, text, jsonb, text, jsonb) to authenticated;
grant execute on function public.worker_claim_job(text, integer) to authenticated;
grant execute on function public.worker_heartbeat(uuid, text, integer) to authenticated;
grant execute on function public.worker_write_stage_result(uuid, text, text, text, jsonb, jsonb) to authenticated;
grant execute on function public.worker_record_document_result(uuid, text, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.worker_complete_job(uuid, text, jsonb) to authenticated;
grant execute on function public.worker_fail_job(uuid, text, jsonb, boolean, integer) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 5. Restate the execute grants of the commands that predate this migration, since step 2
--    revoked `anon` in bulk (their `authenticated` grants are unchanged, listed here so the
--    intended surface of the Data API is readable in one place).
-- ---------------------------------------------------------------------------------------------

grant execute on function public.complete_onboarding(text, text, text, text, text) to authenticated;
grant execute on function public.create_opportunity_intake(uuid, text, text, text, numeric, text, integer, text) to authenticated;
grant execute on function public.initialize_professional_onboarding(text, text, text, text) to authenticated;
grant execute on function public.begin_intake_processing(uuid, uuid) to authenticated;
grant execute on function public.complete_intake_processing(uuid, uuid, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.review_intake_candidate(uuid, uuid, uuid, text, jsonb, text) to authenticated;
grant execute on function public.confirm_document_intake(uuid, uuid, text) to authenticated;
