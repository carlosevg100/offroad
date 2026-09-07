-- Keep grant parity between the security-invoker public worker wrapper and its capability-bound
-- private implementation. The capability token remains the authorization boundary.

grant execute on function private.worker_load_latest_objective_workflow_selection_v1(uuid, text)
  to authenticated;
