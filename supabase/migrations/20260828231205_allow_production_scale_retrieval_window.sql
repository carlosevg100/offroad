-- The full row-level evidence of an operational tape is consumed by the deterministic
-- receivables engine. Governed semantic retrieval receives only a bounded schema digest, but
-- ordinary large documents can still require non-trivial generated-vector and GIN work on a
-- shared production instance. Keep a finite background-only circuit breaker with production
-- headroom while chunk count, content size and hashes remain validated by the command.

alter function private.worker_record_retrieval_chunks(uuid, text, jsonb)
  set statement_timeout = '120s';

comment on function private.worker_record_retrieval_chunks(uuid, text, jsonb) is
  'Validates and atomically replaces at most 2,000 governed chunks; batch-audited and bounded to 120 seconds for production-scale documents.';
