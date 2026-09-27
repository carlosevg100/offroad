# Artifact content authority - corrective wave 17–19

Status: merged and deployed; corrective wave closure is recorded separately in COMPLETION.md.

## Staging reproduction before migration - 27 September 2026

Project: `gjkkjtbfnssdsbmlhmwk`. Expanded `artifact_content_authority.sql` with its shared synthetic fixture and submitted one transaction through the database connector.

1. The real public writer created a source-backed root and 65 derived revisions. Depth 64 was readable; the assertion at depth 65 failed with `P0001: incomplete ancestry must fail closed`. No migration was applied before this reproduction.
2. Repeated with only that frontier assertion omitted so the direct-read proof could execute. After removing read rights on the root source, the RPC withheld its manifest. An authenticated owner could still select the manifest directly. Assertion failed with `P0001: direct content read bypassed the reader: select manifest from public.artifact_revisions`.
3. Both transactions rolled back. Independent query found zero fixture foreign users and zero artifacts with the `authority-` subject prefix.

## Correction

The client table grants are removed; existing public read RPCs remain the authorized path. A bounded dependency traversal with an unresolved frontier withholds content and reports unknown freshness. The regression tests cover the permitted boundary, restriction at that boundary, unresolved ancestry beyond it, direct access and external release.

## Post-migration verification

Independent static review approved A1/A2. Staging migration `20260927131021`; production `20260927131506`. Journal SQL matches the committed file, and the installed reader body is identical in both environments.

Staging passed `artifact_content_authority.sql`, `artifact_revision_protocol.sql`, `rls_non_interference.sql`, and `artifact_producers.sql`; every fixture transaction rolled back. Zero artifact revisions remained in staging. Security advisors returned no findings in both environments. Production read-only verification confirms SELECT is denied for authenticated, anon and service_role on all three tables. No production fixtures were created.

Local `pnpm check` passed under Node 24.19.0. The first run exposed em dashes in this evidence document (removed); sandboxed eval subprocesses could not open their local IPC socket, and passed with the normal local execution permissions. An overly broad test edit initially inserted SELECT into the privileged immutability test; it was corrected before the full protocol passed.

PR 828 merged as e3dcd43b. Quality 36322311475 passed before merge; main Quality 36323414311 passed. Vercel production deployment 6692973083 succeeded on that commit. Worker rollout 36323936807 succeeded with task definition offroad-document-worker:481 at nonzero desired capacity. The automated boot-log probe reported unavailable_aws_read; that is not counted as a boot-log proof.
