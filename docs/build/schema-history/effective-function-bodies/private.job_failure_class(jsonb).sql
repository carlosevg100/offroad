CREATE OR REPLACE FUNCTION private.job_failure_class(p_error jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
    when p_error is null or p_error = '{}'::jsonb then 'unclassified'
    when p_error #>> '{cause,class}' is not null then p_error #>> '{cause,class}'
    when coalesce(p_error ->> 'code', '') ~* 'budget' then 'budget'
    when coalesce(p_error ->> 'code', '') in ('all_attempts_failed', 'timeout') then 'model_exhausted'
    when coalesce(p_error ->> 'code', '') in ('invalid_output', 'output_truncated') then 'model_invalid_output'
    when coalesce(p_error ->> 'code', '') in ('model_not_allowed', 'data_policy_violation', 'cassette_missing') then 'model_policy'
    when coalesce(p_error ->> 'code', '') ~* 'quality_gate' then 'quality_gate'
    when coalesce(p_error ->> 'reason', '') in ('infected', 'unreadable_document') then 'invalid_input'
    when coalesce(p_error ->> 'code', '') ~* 'invalid_.*input|invalid_case'
      or p_error ? 'validation' then 'invalid_input'
    when coalesce(p_error ->> 'message', p_error ->> 'reason', '') ~* 'unrecognized_keys' then 'schema_mismatch'
    when coalesce(p_error ->> 'message', p_error ->> 'reason', '') ~* 'statement timeout|canceling statement|lock timeout' then 'db_timeout'
    when coalesce(p_error ->> 'message', p_error ->> 'reason', '') ~* 'violates .*constraint|null value in column|duplicate key|foreign key' then 'db_constraint'
    when coalesce(p_error ->> 'message', p_error ->> 'reason', '') ~* '42501|permission denied|authentication_required|organization_access_denied' then 'authorization'
    when coalesce(p_error ->> 'reason', '') = 'transient_error'
      or coalesce(p_error ->> 'message', '') ~* 'timeout|ETIMEDOUT|ECONNRESET|ENOTFOUND|fetch failed|rate.?limit' then 'transient'
    when coalesce(p_error ->> 'message', p_error ->> 'reason', '') <> ''
      and coalesce(p_error ->> 'reason', '') not in ('case_analysis_failed') then 'worker_error'
    else 'unclassified'
  end
$function$
