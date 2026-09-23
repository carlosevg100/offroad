CREATE OR REPLACE FUNCTION private.worker_load_case_bundle_before_scope(p_job_id uuid, p_capability_token text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  with base as (
    select private.worker_load_case_input_before_scope(p_job_id, p_capability_token) as input
  )
  select base.input
    || jsonb_build_object(
      'session',
      (base.input -> 'session') || private.worker_load_case_project_binding(p_job_id, p_capability_token)
    )
    || jsonb_build_object('pricing_context', private.worker_load_pricing_context(p_job_id, p_capability_token))
    || jsonb_build_object('market_distribution_context', private.worker_load_market_distribution_context(p_job_id, p_capability_token))
    || jsonb_build_object('red_flag_context', private.worker_load_red_flag_context(p_job_id, p_capability_token))
    || jsonb_build_object('conduct_context', private.worker_load_conduct_context(p_job_id, p_capability_token))
    || jsonb_build_object('receivables_evidence', private.worker_load_receivables_evidence(p_job_id, p_capability_token))
    || jsonb_build_object('receivables_provider_context', private.worker_load_receivables_provider_context(p_job_id, p_capability_token))
    || jsonb_build_object('receivables_method_input_assembly', private.worker_load_receivables_method_input_assembly_v1(p_job_id, p_capability_token))
    || jsonb_build_object('receivables_method_supplement_draft', private.worker_load_receivables_method_supplement_draft_v1(p_job_id, p_capability_token))
    || jsonb_build_object('deal_workflow', private.worker_load_deal_workflow_state(p_job_id, p_capability_token))
    || jsonb_build_object('deal_state_context', private.worker_load_deal_state_context(p_job_id, p_capability_token))
    || jsonb_build_object('match_provider_context', private.worker_load_match_provider_context(p_job_id, p_capability_token))
    || jsonb_build_object('receivables_analytical_release', private.worker_load_receivables_analytical_release_v1(p_job_id, p_capability_token))
  from base;
$function$
