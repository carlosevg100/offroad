# Recovered SQL: independent pre-execution review

Reviewed in full on 14 September 2026. This is a static and read-only catalog review,
not a claim that either SQL suite passed execution.

## Staging execution boundary

Both `supabase/tests/project_canonical_revisions.sql` and
`supabase/tests/institutional_revision_proposals.sql` have one outer `BEGIN` and
`ROLLBACK`, with no `COMMIT`. Mutations use reserved synthetic UUIDs and `.invalid`
email addresses. They create only transaction-local fixtures and temporary helpers.
JWT changes use `set_config(..., true)` and role switches use `SET LOCAL ROLE`.
Queue records produced by proposal approval remain uncommitted and therefore
invisible to another worker connection. No external model request or HTTP call
appears in these tests. They must run only in the authorized data-less staging
environment or the isolated CI stack, never against production.

Execute each complete file on one connection with stop-on-error. A failure aborts
the transaction; close that connection or explicitly roll it back. Do not execute
the fixture setup separately or continue another test on an aborted connection.
The tests now set a five-second lock timeout and a sixty-second statement timeout.
UUID collision fails on insertion; it must not be repaired by deleting existing rows.
After execution, independently verify that the reserved fixture IDs do not remain.

The proposal suite originally counted every row in `institutional_revision_proposals`.
That assertion now filters its synthetic organization and project. No applied migration
was changed. All seven restored migration files retain their manifest hashes.

## Coverage and compatibility

The canonical revision suite checks approved-input identity and lineage, idempotency,
immutable revisions and result bodies, terminal timestamps, supersession without
overwrite, history reads, idempotent propagation, preparer authorization, cross-tenant
denial, and denial of direct table access. The proposal suite checks preparer
authorization, stale configuration/artifact rejection, duplicate-file idempotency,
no mutation before approval, self-approval denial, structure fingerprint checks,
approved value provenance, recompute/revision binding, proposal immutability,
cross-tenant denial, and authorized history reads.

Main plus the seven restored migrations contains the referenced revision/proposal RPCs,
review-role gates, columns, and constraints. On both live environments, 22 related
function definitions were inspected: nineteen match exactly and three differ only by
whole-line comments. Four table catalogs match in columns, constraints, grants, RLS,
and policies. The latest mandate-confirmation migration is independent of these tests.
This metadata agreement does not replace replay or runtime tests. Stage 1B must adapt
synthetic access grants if its new boundary changes the fixtures' role-only setup.

## Verifiers

Run `python3 scripts/ci/verify-recovered-schema.py` for local immutable-file checks.
Run `python3 scripts/ci/test_verify_recovered_schema.py` for five negative/positive
regression tests. Both commands are included in the database CI job.

For fresh remote proof, execute the three SELECT queries in
`read-only-verification-queries.json` independently on production and staging via
the authenticated Supabase tool. Save JSON arrays as
`recovered-sixteen-{journal,functions,tables}-{production,staging}.json` in an evidence
directory. Add `recovered-sixteen-evidence-meta.json` with `captured_at` in UTC ISO 8601
and the `production` and `staging` project refs from the manifest. Then run
`python3 scripts/ci/verify-recovered-schema.py --evidence-dir /absolute/evidence/path`.
The checker rejects stale evidence, changed stamps or SQL, catalog drift, modified
files, and archived migration names entering replay. These checks concern the selected
recovery scope and do not certify the entire database.

## Remaining completion gates

- Governance prerequisite and remote triage authorized by the wave owner.
- Clean replay of main plus this candidate, with both recovered SQL suites and all
  existing database tests passing in CI; database lint and required security checks.
- Authorized complete rollback-only staging runs, success markers, and fixture absence proof.
- Required full repository quality, E2E, and Vercel checks on the actual submitted head.
- Fresh read-only production/staging journal and catalog reconciliation after all concurrent work.
- Main merge, production web and worker deployment proof, and the fixed-format Etapa 0 report.

No DDL or journal repair is required to restore the seven already-applied files.
The nine archived files are not deployment input. Treatment of their remaining staging
objects belongs to the wave owner's explicit triage decision.
