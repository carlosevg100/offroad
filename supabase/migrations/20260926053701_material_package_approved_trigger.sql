-- The approval of the material package queues the case analysis that screens financiers.
--
-- Both package approval actions record the package_review as approved and then call
-- enqueue_deal_state_analysis with the trigger material_package_approved. No migration ever
-- accepted that trigger, so the call raised deal_state_analysis_trigger_invalid: the approval was
-- saved, the person saw the processing error, and the analysis that builds the governed match
-- screen was never queued. The worker screens mandates whenever the package review is approved and
-- the workflow allows matching; this migration only lets the trigger reach it.
--
-- One text patch of the current body of private.enqueue_incremental_deal_state_analysis. The
-- trigger is accepted, it maps to the latest package_review, and that version must be approved,
-- the same rule as production_plan_approved. Each old text must be present exactly once, or the
-- migration stops with material_package_trigger_contract_changed before changing anything. The
-- signature, grants, security mode, search_path, replay by fingerprint, the refusal while an
-- analysis runs, the budget and the run and job shape are kept byte for byte. No table is touched.
-- Text from 20260829211621_enqueue_material_production_from_approved_plan.sql, lines 46 to 48,
-- 54 and 55, and 93 to 95, which 20260925153755_production_budget_ceilings left unchanged.
do $material_package_trigger$
declare
  body text;
  old_accepted constant text := $old$    'structure_confirmed',
    'production_plan_approved'
  ) then$old$;
  new_accepted constant text := $new$    'structure_confirmed',
    'production_plan_approved',
    'material_package_approved'
  ) then$new$;
  old_object constant text := $old$    when 'production_plan_approved' then 'production_plan'
    else 'structure_decision'$old$;
  new_object constant text := $new$    when 'production_plan_approved' then 'production_plan'
    when 'material_package_approved' then 'package_review'
    else 'structure_decision'$new$;
  old_status constant text := $old$      p_trigger_source = 'production_plan_approved'
      and trigger_object.status <> 'approved'
    ) then$old$;
  new_status constant text := $new$      p_trigger_source = 'production_plan_approved'
      and trigger_object.status <> 'approved'
    )
    or (
      p_trigger_source = 'material_package_approved'
      and trigger_object.status <> 'approved'
    ) then$new$;
begin
  select pg_get_functiondef('private.enqueue_incremental_deal_state_analysis(uuid,uuid,text)'::regprocedure) into body;
  if (length(body) - length(replace(body, old_accepted, ''))) / length(old_accepted) <> 1
    or (length(body) - length(replace(body, old_object, ''))) / length(old_object) <> 1
    or (length(body) - length(replace(body, old_status, ''))) / length(old_status) <> 1
    or position('material_package_approved' in body) > 0 then
    raise exception 'material_package_trigger_contract_changed';
  end if;
  execute replace(replace(replace(body, old_accepted, new_accepted), old_object, new_object), old_status, new_status);
end $material_package_trigger$;
