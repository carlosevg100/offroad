# Stage 1B: explicit resource access

Status: database boundary applied to staging and production; CI and application rollout pending. No completion claim.

## Boundary and compatibility

`private.access_resources` maps projects, intake sessions, opportunities, companies and groups to stable resource scopes. `resource_access_grants` combines explicit revocable grants with active organization membership; organization owner/admin roles administer their resources. The creator is provenance after the one-time active-membership backfill. Revocation advances `authorization_revisions`; queued and leased jobs keep their human subject and revision. Capability checks and commit locks reject a stale execution. An explicit review authorization permits only its approved brief/configuration execution while retaining reviewer read-only access.

Private RLS and privileged RPCs use the same resource boundary. Published projection audiences remain explicit. General organization membership does not expose source documents, retrieval chunks, messages, artifact versions or other project content. Implicit `related_project_memory` is returned empty until source/dependency contracts exist; current-project memory and the public research cache remain available.

Customers use `/[locale]/app/access` to invite people, change roles/status and grant/revoke project permissions. Existing verified users accept invitations on `/[locale]/workspaces`. Multiple organizations require URL context; same-origin navigation preserves it, and each tab remains independent. The proxy discards spoofed headers. Database membership validation remains authoritative. Only this context slice was moved forward from stage 2 with founder approval; commercial accounts and later administration surfaces remain in their planned waves.

Downloads use authenticated Storage and a final resource check before returning bytes. Server-side document jobs obtain canonical paths from their capability; caller-supplied legacy URLs are ignored and never fetched. Public worker claim v1/v2 become idle adapters; v3 is required to resume processing. Schema capabilities stop a new image against an old database. Old application/worker images are not a valid rollback of this boundary.

## Storage transition

Previously minted bearer URLs must lose their objects. `private.storage_path_rotations` enumerates every existing object in the four private buckets; unresolved scope or missing responsible authority aborts migration. The worker moves each through authenticated Storage, records SHA-256 and byte length before the move, reads and verifies after it, and changes database references only after proof. Interrupted operations resume against their recorded digest. No production fixtures or content are logged. Minting new signed URLs is rejected at Storage RLS, including for otherwise authorized users.

## Verification and rollout

1. Preserve the staging before-reproduction; run all SQL suites with the candidate inside rollback transactions, plus local checks and browser E2E in CI.
2. Apply the migration to staging, confirm its actual journal stamp and catalogue, regenerate public types and run security advisors. Reproduce the HTTP denial and rotation with isolated synthetic staging data, then remove that data.
3. Refresh both catalogue receipts and the reviewed object disposition inventory through the existing checkers. Apply the verified migration to production without synthetic data; confirm journal stamps and installed definitions. Production journal parity is a mandatory merge gate.
4. Merge only with required CI/preview checks green. Deploy web and worker at the merged commit. Confirm completed rotation count, digest/size receipts, no remaining old objects and actual production health. Record the completion only after those results.

Containment: pause queue consumption if authority, storage integrity or migration checks fail. Preserve new grants/RLS and repair forward; never restore broad membership or bearer signing. If a migration fails before commit, its transaction rolls back. If file movement is interrupted, keep the rotation receipt and resume; do not invent a successful completion or move database references independently.

## Evidence

- `supabase/tests/legacy_resource_access.sql`: unassigned same-organization membership denied; creator/admin backfill and explicit grants.
- `supabase/tests/legacy_access_revocation.sql`: current human authority required after revocation across worker paths.
- `supabase/tests/explicit_legacy_workspace_context.sql`: multiple memberships, explicit selection and denied foreign/revoked contexts.
- `supabase/tests/workspace_member_administration.sql`: invitation ownership, verified acceptance, role authority and suspended membership.
- `supabase/tests/project_review_roles.sql`: reviewer execution bound to the approved work and invalidated on grant revocation.
- `supabase/tests/rls_non_interference.sql`: complete historical regression with explicit access fixtures; canonical storage payloads and no implicit cross-project memory.
- Worker unit suites: authenticated storage before/after authority checks; storage rotation integrity, restart and fail-closed behavior.
- `apps/web/e2e/resource-access.spec.ts`: actual customer grant/revoke flow, download denial and independent organization tabs, local synthetic stack only.

Controls affected: tenant/resource authorization, least privilege, revocation, private document storage, bounded worker execution and security audit. Providers and retention agreements are unchanged. Sensitive content remains in private database/Storage and authenticated process memory; operational receipts contain IDs, counts and integrity metadata only. This is implementation verification by Codex, not an independent security certification.
