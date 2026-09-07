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

`@offroad/governed-retrieval` now defines three fingerprinted inputs:

1. `SystemContextControl`: organization, project, conversation, authority, evidence regime,
   grants, permissions, authorized context/document/company identities, execution-context hash,
   revision and validity window. Its source is literally `system`. Memory items have no field that
   can add or broaden authority.
2. `ContextResolutionIntent`: primary work, object kinds and exact object references, requested
   product keys, jurisdiction, as-of date and continuity. Ambiguous or unknown jurisdiction/as-of
   remains explicit; it is never silently completed.
3. `ContextCandidate`: one immutable organization, project, company, conversation or document
   reference with tenant/project scope, data class, source and snapshot versions, content hash,
   capture/validity/freshness/revocation dates, temporal and jurisdiction policy, explicit
   relevance selectors and optional supersession lineage.

All three use canonical SHA-256 fingerprints. The resolver returns inclusion and exclusion reasons,
structured gaps, blockers, exact selected snapshot identities and its own fingerprint.

## Selection and refusal policy

The resolver validates security scope before relevance. A cross-tenant, cross-project,
cross-conversation, unlisted-context, unauthorized-document or unauthorized-company candidate blocks the entire
resolution even when its selectors are irrelevant. Invalid fingerprints, duplicate identities,
lineage cycles and cross-scope/non-monotonic lineage also block.

Within the authorized scope:

- the exact system permission and evidence regime must admit the item's kind and data class;
- the item must be valid, unrevoked and fresh at resolution time;
- jurisdiction and as-of policy must match confirmed execution context;
- at least one explicit intent selector must match primary work, object kind, exact object or
  requested product; and
- one logical context key must have exactly one live lineage head.

An independently updated second head is a conflict, not an arbitrary tie-break. A newer explicit
successor is selected and the prior snapshot is recorded as `superseded`. Stale, revoked,
wrong-jurisdiction, wrong-as-of and permission-denied context becomes a typed gap only when it was
otherwise material. Each gap distinguishes `ask_if_material`, `refresh_source` and
`obtain_system_authorization`; a missing permission is never disguised as a conversational
question. The resolver returns no prewritten copy; the question policy can later use the gap and
coverage map to decide whether asking changes the work.

## Internal runtime binding

The synthetic RT-07 runtime now requires an `AuthorizedContextResolution` before it can execute.
Only `empty` and `resolved` states pass. The execution-context hash must equal the candidate's exact
hash, the resolution fingerprint is included in the signed fixture authorization, task execution
fingerprints, graph idempotency identity and receipts. A changed resolution therefore cannot replay
under an older authorization.

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
- altered resolution fingerprints.

`apps/document-worker/src/universal-dispatch-runtime.test.ts` additionally proves exact context hash,
authorization, idempotency and receipt binding around the deterministic internal fixture.

## Deliberate limitations and next gate

- Candidate retrieval remains an injected in-memory input; no RLS query or durable resolution store
  exists in this slice.
- Payload bytes are not loaded, decrypted, summarized or passed to an executor.
- The control snapshot has no production issuer, workload identity, revocation service or durable
  audit trail.
- Context lineage is evaluated only over the supplied candidate set; the production store must
  guarantee complete heads transactionally.
- Public/organization/company memory quality and retention policy are not homologated here.
- No user-facing question, status text or answer is produced by this module.

The next gate is a tenant-scoped durable candidate and resolution store with RLS, transactional
lineage heads, a workload-identity issuer for system controls, revocation/freshness enforcement at
read time, and a retrieval receipt proving which immutable payload bytes were loaded. Only then may
a separately approved change consider injecting resolved payload into a promoted executor.
