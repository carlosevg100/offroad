-- Gold cases run inside the product, in the founder's workspace, against a frozen source pack.
-- The binding lives in the private schema (an operator decision, never a tenant write) and is
-- keyed by project, so the rest of the workspace keeps live research. The claim command carries
-- the pack id to the worker, which then reads that pack and nothing else for the job.

create table if not exists private.gold_case_bindings (
  organization_id uuid not null,
  capital_project_id uuid not null,
  source_pack_id text not null check (source_pack_id ~ '^[a-z0-9][a-z0-9_-]{1,79}$'),
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now(),
  primary key (organization_id, capital_project_id),
  foreign key (organization_id, capital_project_id) references public.capital_projects (organization_id, id) on delete cascade
);

comment on table private.gold_case_bindings is
  'Projects whose public research is frozen to a source pack shipped with the worker image. Written by operators through migrations or the management connection, never through the Data API.';

revoke all on table private.gold_case_bindings from public, anon, authenticated;

create or replace function private.worker_claim_job(
  p_worker_token text,
  p_lease_seconds integer default 600
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  worker_id uuid := private.worker_identity(p_worker_token);
  lease_seconds integer := least(greatest(coalesce(p_lease_seconds, 600), 60), 3600);
  capability_token text := encode(extensions.gen_random_bytes(32), 'hex');
  job_row public.processing_jobs;
begin
  -- reclaim expired leases as well as fresh jobs, oldest first
  select * into job_row
  from public.processing_jobs
  where (status = 'queued' and available_at <= now())
     or (status = 'leased' and lease_expires_at < now())
  order by available_at
  for update skip locked
  limit 1;

  if not found then
    return jsonb_build_object('claimed', false);
  end if;

  if job_row.attempts + 1 > job_row.max_attempts then
    update public.processing_jobs
    set status = 'poison',
        capability_sha256 = null,
        leased_by = null,
        lease_expires_at = null,
        last_error = coalesce(job_row.last_error, '{}'::jsonb) || jsonb_build_object('reason', 'max_attempts_exceeded')
    where id = job_row.id;

    update public.processing_runs
    set status = 'failed',
        error = jsonb_build_object('reason', 'job_poison', 'job_id', job_row.id),
        completed_at = now()
    where organization_id = job_row.organization_id and id = job_row.processing_run_id;

    return jsonb_build_object('claimed', false, 'poisoned_job_id', job_row.id);
  end if;

  update public.processing_jobs
  set status = 'leased',
      attempts = job_row.attempts + 1,
      leased_by = worker_id,
      lease_expires_at = now() + make_interval(secs => lease_seconds),
      capability_sha256 = extensions.digest(capability_token, 'sha256')
  where id = job_row.id
  returning * into job_row;

  update public.processing_runs
  set status = case when status = 'queued' then 'running' else status end,
      started_at = coalesce(started_at, now())
  where organization_id = job_row.organization_id and id = job_row.processing_run_id;

  return jsonb_build_object(
    'claimed', true,
    'job_id', job_row.id,
    'capability_token', capability_token,
    'lease_expires_at', job_row.lease_expires_at,
    'attempt', job_row.attempts,
    'kind', job_row.kind,
    'organization_id', job_row.organization_id,
    'intake_session_id', job_row.intake_session_id,
    'processing_run_id', job_row.processing_run_id,
    'payload', job_row.payload,
    -- A project bound to a frozen source pack tells the worker to read that pack and nothing else.
    'source_pack_id', (
      select binding.source_pack_id
      from private.gold_case_bindings binding
      join public.document_intake_sessions session
        on session.organization_id = binding.organization_id and session.capital_project_id = binding.capital_project_id
      where session.organization_id = job_row.organization_id and session.id = job_row.intake_session_id
    )
  );
end;
$$;
