-- The trap, walked into once more while fixing it.
--
-- The previous migration granted the three public wrappers and not the private implementations
-- they delegate to. A `security invoker` wrapper runs as the caller, so the caller needs both
-- halves; granting only the public one produces a function that exists, is executable, and fails
-- with "permission denied" on the inner call. That is precisely how `worker_record_candidates`
-- was broken for weeks and why no run ever completed.
--
-- The parity assertion in rls_non_interference.sql covers every wrapper for this reason.

grant execute on function private.review_intake_candidate(uuid, uuid, uuid, text, jsonb, text) to authenticated;
grant execute on function private.accept_intake_candidates(uuid, uuid, uuid[]) to authenticated;
grant execute on function private.record_document_verification(uuid, uuid, text, text) to authenticated;
