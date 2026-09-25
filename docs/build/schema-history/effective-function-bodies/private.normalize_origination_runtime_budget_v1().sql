CREATE OR REPLACE FUNCTION private.normalize_origination_runtime_budget_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.kind = 'capital_project_analysis'
    and new.payload ->> 'analysis_scope' = 'origination_thesis' then
    new.payload := jsonb_set(
      new.payload,
      '{model_budget,max_cost_usd}',
      to_jsonb(1.55::numeric),
      true
    );

    update public.processing_runs
    set budget = jsonb_set(
      budget,
      '{maxCostUsd}',
      to_jsonb(1.55::numeric),
      true
    )
    where id = new.processing_run_id;
  end if;
  return new;
end;
$function$
