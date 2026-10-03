# Core installed before all SQL contracts

Temporary audit only. Workflow on-push branch `codex/etapa20-core-canonical-start-proof` uses a fresh real Supabase stack, baseline `16fb3a0b` and frozen core `fcb09c92`. It installs all eleven prospective core drafts **before** running the exact root-only `supabase/tests/*.sql` enumeration from the existing Quality database job. No assessment six, journal stamps or mock Supabase interfaces are added.

Each checked-in test is executed unchanged, in lexical order, via its own psql connection, with cwd at the core checkout. Test-local transactions and rollback remain intact. The harness continues after every failed file and prints the complete failure list once; it does not hide or delete failing tests. Captured failures expose only filename, SQLSTATE and literal exception identifiers parsed from checked-in tests/contracts; arbitrary stderr, data, DETAIL and CONTEXT do not escape. A timeout closes that psql session and is reported as TIMEOUT, never PASS.

Publish the workflow, script, CORE-CANONICAL-SOURCES.json and FILES.json on the **separate temporary branch**. The already green seventeen-draft audit stays unchanged and its branch filter prevents an unnecessary repeat. Node24/.nvmrc, pnpm10.32.1, Supabase2.114.0, pinned actions and stack boot/cleanup mirror current Quality setup. Dependencies use the immutable core lockfile.

Syntax, self-test guards/hash11/diagnostic allowlist and workflow structural checks passed at preparation. Actual canonical-from-start installation and all174 SQL tests are UNEXECUTED until this CI runs. Once results exist, classify each legacy positive failure against the current contract before changing a fixture; never restore an old access shortcut or remove the test.

No Git refs, remote DDL or shared sources were altered by this preparation. The temporary workflow is not a release gate and is never merged; retire after proof and canonical promotion.
