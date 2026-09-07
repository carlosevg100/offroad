# RT-02: authorized context resolver

Status: **internal shadow only**. This slice is not connected to the production router, queue,
customer conversation, database retrieval path, or any external action. It does not claim that
Offroad has durable memory, a complete Vault, or a production context graph.

## Boundary

The resolver answers one control-plane question before work is compiled or executed:

> Which already-existing context references are authorized, current and materially relevant to
> this exact intent?

It resolves metadata and immutable payload references; it does not load payload bytes, summarize
documents, infer a person's permissions, decide a credit question, or write user-facing copy.
No context is a normal result (`empty`), not an error and not a reason to emit a canned message.

## Governed inputs

`@offroad/governed-retrieval` now defines three governed inputs:

1. `SystemContextControl`: organization, project, conversation, authority, evidence regime,
   grants, permissions, authorized context/document/company identities, execution-context hash,
   revision and validity window. It is signed by a named, keyed system issuer and freezes the exact
   candidate set as `(itemId, snapshotFingerprint)` pairs plus a set fingerprint. Its source is
   literally `system`. Memory items have no field that can add or broaden authority.
2. `ContextResolutionIntent`: primary work, object kinds and exact object references, requested
   product keys, jurisdiction, as-of date and continuity. Ambiguous or unknown jurisdiction/as-of
   remains explicit; it is never silently completed.
3. `ContextCandidate`: one immutable organization, project, company, conversation or document
   reference with tenant/project scope, data class, source and snapshot versions, content hash,
   capture/validity/freshness/revocation dates, temporal and jurisdiction policy, explicit
   relevance selectors, the system-control revision under which it was captured and optional
   supersession lineage. Payload locations are typed allowlisted locators (`context_snapshot` or
   `document_snapshot`), never arbitrary URLs or paths.

All three use canonical SHA-256 fingerprints. System control and resolution also carry HMAC-SHA256
issuer signatures in this internal slice. The resolver returns inclusion and exclusion reasons,
structured gaps, blockers, exact selected snapshot identities, control revision/issuer, its own
issuer and `validUntil = min(control expiry, selected heads' validity/freshness/future revocation)`.

## Selection and refusal policy

The resolver validates security scope before relevance. A cross-tenant, cross-project,
cross-conversation, unlisted-context, unauthorized-document or unauthorized-company candidate blocks the entire
resolution even when its selectors are irrelevant. The supplied candidates must be byte-identical
to the complete set frozen by the signed control snapshot. Invalid fingerprints, duplicate
identities, missing lineage parents, lineage cycles and cross-scope/non-monotonic lineage also block.

Within the authorized scope:

- the exact system permission and evidence regime must admit the item's kind and data class;
- the item must be valid, unrevoked and fresh at resolution time;
- jurisdiction and as-of policy must match confirmed execution context;
- company-scoped context requires a matching exact `company` object reference in the intent; a
  broad company kind is not permission to reuse another company's memory;
- at least one explicit topical selector must match primary work, object kind, a non-company exact object or
  requested product; and
- one logical context key must have exactly one authorized lineage head.

Lineage is built and validated before freshness, revocation, relevance or jurisdiction filters. An
independently updated second head is a conflict, not an arbitrary tie-break. Only the unique head is
evaluated. A stale, revoked or irrelevant head never causes an ancestor to be resurrected; an
unusable ancestor does not prevent a valid successor. Lineage cannot change organization, project,
company, conversation, document, kind, data class, locator scheme, temporal policy, jurisdictions or
selectors. A newer explicit successor is selected and the prior snapshot is recorded as
`superseded`. Stale, revoked,
wrong-jurisdiction, wrong-as-of and permission-denied context becomes a typed gap only when it was
otherwise material. Each gap distinguishes `ask_if_material`, `refresh_source` and
`obtain_system_authorization`; a missing permission is never disguised as a conversational
question. The resolver returns no prewritten copy; the question policy can later use the gap and
coverage map to decide whether asking changes the work.

## Internal runtime binding

The synthetic RT-07 runtime now requires an `AuthorizedContextResolution` before it can execute.
Only `empty` and `resolved` states pass. The execution-context hash must equal the candidate's exact
hash, the signed resolution must be current, and its fingerprint, control revision and validity
window are included in the signed fixture authorization. Authorization may neither predate the
resolution nor outlive it. The resolution fingerprint is also included in task execution
fingerprints, graph idempotency identity and receipts. A changed resolution therefore cannot replay
under an older authorization. Vigência and issuer signature are revalidated during preparation,
again before graph work, and immediately before executor invocation; an expired resolution cannot
return an in-memory replay.

This is a safe control-plane connection only. The bundled R01 fixture still receives its separately
typed input; selected payload bytes are not loaded or injected by the resolver. No production route
imports or invokes this runtime.

## Test evidence

`packages/governed-retrieval/src/context-resolution.test.ts` covers:

- no existing context;
- authorized but irrelevant context;
- cross-tenant, cross-project, cross-conversation and unauthorized-document candidates;
- authority injection through memory and altered system control;
- missing system permission;
- ambiguous/conflicting context;
- incremental supersession;
- deterministic recovery independent of candidate ordering;
- stale and revoked context;
- ambiguous, wrong-jurisdiction and wrong-as-of context;
- lineage cycles; and
- altered resolution fingerprints/signatures;
- company target absence/mismatch and selector widening;
- exact control-snapshot substitution and incomplete lineage;
- stale/revoked/irrelevant heads without ancestor resurrection;
- validity-window minimization and object-ref deduplication; and
- typed payload-locator allowlisting.

`apps/document-worker/src/universal-dispatch-runtime.test.ts` additionally proves exact context hash,
authorization, idempotency and receipt binding around the deterministic internal fixture, including
authorization-window containment, pre-executor TOCTOU closure and refusal to replay after expiry.

## Deliberate limitations and next gate

- Candidate retrieval remains an injected in-memory input; no RLS query or durable resolution store
  exists in this slice.
- Payload bytes are not loaded, decrypted, summarized or passed to an executor.
- Signatures use injected fixture HMAC keys. There is no production workload identity, managed key
  rotation, revocation service or durable audit trail.
- Candidate-set completeness is cryptographically frozen by the control, but the in-memory slice
  does not prove that a database produced that set transactionally.
- Public/organization/company memory quality and retention policy are not homologated here.
- No user-facing question, status text or answer is produced by this module.

The next gate is a tenant-scoped durable candidate and resolution store with RLS, transactional
lineage heads and workload-identity issuers. The production loader contract must perform one durable
read transaction: lock/re-read the control and selected heads, revalidate issuer, revision,
authorization, revocation, freshness and `validUntil`, persist the revalidation/retrieval receipt,
then read only the typed allowlisted locators bound to their content hashes. This shadow slice has no
payload loader and deliberately does not pretend an in-memory check is that durable proof. Only after
that gate may a separately approved change inject resolved payload into a promoted executor.
