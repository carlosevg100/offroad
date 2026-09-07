-- The specialist readiness gate runs inside case_analysis. Let that same capability project its
-- top three material questions into the existing interactive question rail. The rest of the
-- function remains byte-for-byte the released implementation and is guarded against drift.

do $$
declare
  function_definition text := pg_get_functiondef(
    'private.worker_sync_project_information_requests_v1(uuid,text,jsonb)'::regprocedure
  );
  old_guard text := $guard$if job_row.kind <> 'capital_project_analysis'
    or coalesce(jsonb_typeof(p_projection), 'null') <> 'object'$guard$;
  new_guard text := $guard$if job_row.kind not in ('capital_project_analysis', 'case_analysis')
    or coalesce(jsonb_typeof(p_projection), 'null') <> 'object'$guard$;
begin
  if position(old_guard in function_definition) = 0 then
    raise exception 'information request projection capability guard drifted; refusing unsafe rewrite';
  end if;
  execute replace(function_definition, old_guard, new_guard);
end;
$$;

comment on function public.worker_sync_project_information_requests_v1(uuid, text, jsonb) is
  'Capability-bound projection of prioritized workflow questions from a capital-project or full case-analysis run; preserves answered and waived context.';
