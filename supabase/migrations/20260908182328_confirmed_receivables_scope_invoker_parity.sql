-- Exposed legacy RPC remains an invoker; capability/fence implementation stays private.
create function private.worker_load_case_input_legacy_bundle(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.require_receivables_scope_aware_reader(p_job_id,p_capability_token);
 return private.worker_load_case_bundle_before_scope(p_job_id,p_capability_token);
end;
$$;
revoke all on function private.worker_load_case_input_legacy_bundle(uuid,text) from public,anon,authenticated;
grant execute on function private.worker_load_case_input_legacy_bundle(uuid,text) to authenticated;
create or replace function public.worker_load_case_input(p_job_id uuid,p_capability_token text)
returns jsonb language sql security invoker set search_path='' as $$
 select private.worker_load_case_input_legacy_bundle(p_job_id,p_capability_token);
$$;
