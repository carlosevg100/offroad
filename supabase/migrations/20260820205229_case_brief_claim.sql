-- ---------------------------------------------------------------------------------------------
-- One brief per case at a time.
--
-- `resolveCaseState` writes its snapshot only after the case is built, so two requests that
-- arrive before the first one finishes both miss the cache and both pay for a brief. A refresh
-- while the page is still loading costs a second brief, and nothing stops a third.
--
-- Only the brief is expensive: reconciliation, readiness, capacity and the term sheet are pure
-- arithmetic over facts already in the database. So the claim guards the model call alone, and a
-- request that loses the race still renders everything else, saying plainly that the written case
-- is being prepared rather than showing an empty section with no reason.
--
-- The claim is a timestamp with a lease rather than a lock, because the process holding it runs
-- in a serverless function that can vanish. A stale claim is reclaimable, which is the same
-- discipline the job queue already uses.
-- ---------------------------------------------------------------------------------------------

create or replace function public.claim_case_brief(
  p_organization_id uuid,
  p_session_id uuid,
  p_lease_seconds integer default 180
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  claimed_at timestamptz;
begin
  -- `for update` on the caller's own row: two concurrent requests serialise here, and the loser
  -- reads the winner's claim rather than a value from before it was written.
  select (result_summary ->> 'brief_claimed_at')::timestamptz into claimed_at
  from public.document_intake_sessions
  where organization_id = p_organization_id and id = p_session_id
  for update;

  if not found then
    return false;
  end if;

  if claimed_at is not null and claimed_at > now() - make_interval(secs => p_lease_seconds) then
    return false;
  end if;

  update public.document_intake_sessions
  set result_summary = jsonb_set(
        coalesce(result_summary, '{}'::jsonb),
        '{brief_claimed_at}',
        to_jsonb(now()),
        true
      )
  where organization_id = p_organization_id and id = p_session_id;

  return true;
end;
$$;

comment on function public.claim_case_brief(uuid, uuid, integer) is
  'Wins the right to spend on one case brief. Returns false when another request holds a fresh claim, so the caller renders the rest of the case and says the written part is being prepared.';

revoke all on function public.claim_case_brief(uuid, uuid, integer) from public;
grant execute on function public.claim_case_brief(uuid, uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- And the money the web side spends has to land in the same ledger as the worker's.
--
-- `processing_runs.usage` already accumulates per run and per organization, but the brief is
-- written outside any run, so its cost was the one spend in the system nobody could query. It now
-- accumulates on the session, which is the object it belongs to.
-- ---------------------------------------------------------------------------------------------

create or replace function public.record_case_model_spend(
  p_organization_id uuid,
  p_session_id uuid,
  p_cost_usd numeric,
  p_calls integer default 1
)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.document_intake_sessions
  set result_summary = jsonb_set(
        jsonb_set(
          coalesce(result_summary, '{}'::jsonb),
          '{model_spend_usd}',
          to_jsonb(coalesce((result_summary ->> 'model_spend_usd')::numeric, 0) + coalesce(p_cost_usd, 0)),
          true
        ),
        '{model_calls}',
        to_jsonb(coalesce((result_summary ->> 'model_calls')::integer, 0) + coalesce(p_calls, 0)),
        true
      )
  where organization_id = p_organization_id and id = p_session_id;
$$;

comment on function public.record_case_model_spend(uuid, uuid, numeric, integer) is
  'Accumulates what the case brief cost onto the session. The worker already writes its spend to processing_runs.usage; this closes the one path whose cost nothing could query.';

revoke all on function public.record_case_model_spend(uuid, uuid, numeric, integer) from public;
grant execute on function public.record_case_model_spend(uuid, uuid, numeric, integer) to authenticated;
