# RT-07: internal universal dispatch runtime

Status: **internal validation only**. This slice is not connected to a production router, queue,
customer response, or external action. It does not promote R01 or any other capability.

## What this slice proves

The runtime can consume an already validated `UniversalDispatchCandidate` and execute a closed,
bundled deterministic task graph under a separate signed fixture authorization. Before invoking any
executor it validates, all-or-nothing:

- candidate status and canonical fingerprint;
- authorization signature, lifetime, task partition, candidate fingerprint, capability manifest,
  execution context and complete executor-registry fingerprint;
- exact task, executor version, procedure and result-contract identity;
- complete graph/batch partition;
- exact input schema for every task; and
- an executor adapter whose maximum external effect is `none`.

The only bundled executor in this slice is deterministic R01
(`@offroad/receivables-analysis#underwriteReceivablesPool`). Its input and result are parsed through
strict schemas. Its repository capability manifest remains `shadow`; the tests create a synthetic
live capability only to prove the runtime contract in CI.

## Execution properties

- Execution is idempotent within one runtime process by a graph fingerprint derived from the
  candidate and each task/input/executor fingerprint. Concurrent identical requests share the same
  in-flight promise. A successful result remains replayable; a failed, timed-out, cancelled or
  rejected attempt is evicted after settlement so a later request can retry the same identity.
- Each task emits a fingerprinted receipt with exact identity, input/result fingerprints, status,
  timestamps and a sanitized error. The graph emits a fingerprinted aggregate receipt.
- Timeout and cancellation use an `AbortSignal`. A signal already aborted never invokes the task.
- Authorization or identity failures throw a named refusal before any task runs. Runtime failures
  produce explicit failed receipts; later graph batches are marked skipped.
- Returned outputs are internal values only. There is no artifact publishing, database write,
  customer rendering, network call, queue integration, or other external effect in this module.

## CI evidence

`apps/document-worker/src/universal-dispatch-runtime.test.ts` covers:

1. deterministic R01 execution and exact receipts;
2. blocked candidate;
3. altered candidate fingerprint;
4. altered executor version with a recomputed candidate fingerprint;
5. duplicate and absent executor registrations;
6. invalid input before execution;
7. rejection of an executor adapter that declares any effect;
8. timeout followed by a successful retry of the same identity;
9. pre-cancel without invocation followed by a successful retry;
10. idempotent replay after success;
11. coalescence of concurrent requests into one execution;
12. invalid output and executor exception; and
13. modified signed authorization.

The existing R01 test suite also exercises the newly explicit strict result schema at the method
boundary.

## Deliberate limitations and next gate

This is a minimal internal runtime, not a live universal dispatcher:

- idempotency storage is in memory and does not survive worker restart or span replicas;
- fixture authorization uses injected HMAC keys and has no production issuer, rotation, revocation,
  audit storage, or workload-identity integration;
- receipts and outputs are not durably persisted;
- only R01 is registered, and its real capability remains blocked in shadow;
- no production route imports or invokes this runtime; and
- no customer-facing result or external effect is possible.

The next gate is a durable, tenant-scoped execution/receipt store with transactional claim semantics,
a workload-identity-backed authorization issuer and revocation path, recovery tests across process
restart/concurrent workers, and an explicit promotion review. Only after that review may a separately
approved change consider connecting a production route or changing a real capability manifest.
