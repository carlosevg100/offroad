-- The institutional origination readout has a large governed schema and substantial hidden
-- reasoning. Production evidence showed that a valid fallback can follow a truncated primary
-- attempt, so the run needs enough headroom for both without weakening schema or quality gates.

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
      to_jsonb(1.50::numeric),
      true
    );

    update public.processing_runs
    set budget = jsonb_set(
      budget,
      '{maxCostUsd}',
      to_jsonb(1.50::numeric),
      true
    )
    where id = new.processing_run_id;
  end if;
  return new;
end;
$$;

revoke all on function private.normalize_origination_runtime_budget_v1() from public, anon, authenticated;
