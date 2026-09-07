# RT-03 output-terminal trust boundary

Status: package contract implemented for shadow validation; durable application adapter not yet wired.

## What is data and what is authority

`objectiveToPlanDecisionSchema`, `outputTerminalRequestSchema` and
`outputTerminalResolutionStructuralSchema` validate wire/storage shape and deterministic integrity.
They are not authorization checks. A caller can recompute a SHA-256 fingerprint after changing
otherwise valid data, so no executor may use a successful schema parse as permission to run tasks.

The current package reference implementation uses three opaque in-process receipts:

1. the objective compiler records a separate, parser-owned and deeply frozen snapshot of the exact
   plan it emitted, including the specialist target set and governed specialist-manifest version;
2. an internal test-only boundary records one exact frozen terminal request,
   work-product/deliverable set, audience, specialist targets, continuity mode and version-pinned
   artifact bindings;
3. the terminal resolver records the exact frozen resolution produced from both receipts.

Receipt IDs are audit locators only. Copying an ID, serializing an object, constructing matching
JSON or recalculating a fingerprint never recreates the private WeakMap receipt.

Only `assertTrustedOutputTerminalResolution` returns the branded executable resolution type.
Pending, blocked, reconstructed and merely schema-valid resolutions cannot cross that boundary.

## Specialist preservation

Specialist targets are not calculated as "every base-plan target that is not in the objective
recipe". They come from the compiler receipt and must be members of the governed specialist target
manifest. The initial manifest contains only `R01` (receivables underwriting). A real but unrelated
TaskSpec such as `A11` cannot be injected as a specialist target.

The test-only issuer is intentionally absent from the package-root API. It has no default approvals,
and receives its artifact bindings as a simulated trusted-registry snapshot when the test boundary
is created, not as fields on the terminal request. Production code cannot mint a witness until the
durable application adapter described below exists.

## Same-process serialized-copy check

Opaque in-process receipts intentionally do not survive serialization. A persisted resolution is
therefore non-executable. `revalidateSameProcessOutputTerminalResolution` has a deliberately narrow
contract: it can compare a serialized copy captured inside the current live process against a
recomputation using the original opaque plan and authorization objects. It detects addition/removal
of specialist targets and replacement of an artifact ID, version, organization, project or
authorization binding even when the stored fingerprint was recomputed. It is not a persistence or
cross-process verifier, does not mint a fresh witness, and must never be presented as one.

## Required durable adapter before promotion

The application control plane must replace the in-memory issuer before RT-03 is promoted across
processes. That adapter must:

- derive organization, project and actor from the authenticated server session, never request JSON;
- load the canonical objective plan or deterministically recompile it under a version-pinned
  compiler and specialist manifest;
- resolve every revision target atomically from the authorized artifact registry, including exact
  artifact version, organization and project scope;
- verify selection and audience receipts from authenticated interaction state;
- issue and verify a tamper-evident receipt over the complete joint payload, with key/version,
  issuance time, expiry/revocation policy and replay protection;
- persist an audit locator without treating that locator as a bearer credential;
- fail closed when any witness cannot be resolved or when a compiler/manifest version is no longer
  accepted.

Until that adapter exists, only the internal test harness can mint the in-memory witness. The
package root can validate structure and fail closed, but it cannot authorize a serialized plan or
resolution from a browser, model tool, queue payload, database row or another process.
