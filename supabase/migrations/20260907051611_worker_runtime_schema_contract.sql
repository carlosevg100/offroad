-- A worker image must prove that the database exposes the exact schema capabilities it was
-- built against before it may claim a job. The endpoint reveals only a version and capability
-- names, requires an authenticated session, and is intentionally independent of tenant scope.

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
      'receivables-information-request-bindings.v1'
    )
  );
$$;

revoke all on function public.worker_runtime_schema_contract_v1() from public, anon;
grant execute on function public.worker_runtime_schema_contract_v1() to authenticated;

comment on function public.worker_runtime_schema_contract_v1() is
  'Authenticated boot contract: a document-worker image must match schemaVersion before claiming jobs.';
