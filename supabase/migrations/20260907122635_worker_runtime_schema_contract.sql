-- The dispatcher candidate command is additive. Keep the compatible schema version so the
-- previous worker remains restart-safe while the new image refuses to poll until v5 is present.

create or replace function public.worker_runtime_schema_contract_v1()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'schemaVersion', 'document-worker-runtime.2026-09-07.r01-governed-answer.v1',
    'capabilities', jsonb_build_array(
      'integration-preview-workflow-continuity.v1',
      'receivables-information-request-bindings.v1',
      'receivables-complete-draft-refresh.v1',
      'universal-dispatch-candidate-shadow.v1'
    )
  );
$$;

revoke all on function public.worker_runtime_schema_contract_v1() from public, anon;
grant execute on function public.worker_runtime_schema_contract_v1() to authenticated;
