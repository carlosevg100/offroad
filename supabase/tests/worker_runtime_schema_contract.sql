begin;

-- Anonymous callers cannot use a release-control endpoint as an unauthenticated probe.
set local role anon;
do $$
declare accepted boolean := false;
begin
  begin
    perform public.worker_runtime_schema_contract_v1();
    accepted := true;
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'anonymous caller read worker runtime schema contract'; end if;
end;
$$;

-- The dedicated worker signs in as authenticated before executing this preflight.
set local role authenticated;
do $$
declare contract jsonb;
begin
  contract := public.worker_runtime_schema_contract_v1();
  if contract ->> 'schemaVersion'
      <> 'document-worker-runtime.2026-09-07.r01-governed-answer.v1' then
    raise exception 'unexpected worker runtime schema version: %', contract;
  end if;
  if not (contract -> 'capabilities' @> '["integration-preview-workflow-continuity.v1", "receivables-information-request-bindings.v1"]'::jsonb) then
    raise exception 'worker runtime capabilities are incomplete: %', contract;
  end if;
end;
$$;

rollback;
