-- The runtime contract contains public schema/capability names only. Keep the
-- public API invoker-only; its static predecessor is safe for authenticated reads.
grant execute on function private.worker_runtime_schema_contract_before_support_sheets() to authenticated;
alter function public.worker_runtime_schema_contract_v1() security invoker;
