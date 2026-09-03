-- The senior origination readout is materially larger than the other public analyses. Production
-- evidence showed the former USD 0.75 reservation could leave no room for a valid fallback after
-- a long first attempt. Normalize newly queued origination jobs to the worker-wide USD 1.00 cap.
-- The trigger keeps both legacy entry points and the conversational activation path consistent
-- without silently changing budgets for any other executor.

create or replace function private.normalize_origination_runtime_budget_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'capital_project_analysis'
    and new.payload ->> 'analysis_scope' = 'origination_thesis' then
    new.payload := jsonb_set(
      new.payload,
      '{model_budget,max_cost_usd}',
      to_jsonb(1.00::numeric),
      true
    );
  end if;
  return new;
end;
$$;

drop trigger if exists processing_jobs_origination_budget_v1 on public.processing_jobs;
create trigger processing_jobs_origination_budget_v1
before insert on public.processing_jobs
for each row execute function private.normalize_origination_runtime_budget_v1();

revoke all on function private.normalize_origination_runtime_budget_v1() from public, anon, authenticated;

