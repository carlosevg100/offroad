# Combined native SQL proof

Frozen inputs: consumers `d1d89e1`, assessment `2592359`. `COMBINED-SOURCES.json` pins all eighteen draft byte hashes. No shared files, Git refs, migration journals or remote databases are changed by this cut.

Run on a **dedicated freshly started disposable Supabase CI stack** after the canonical migrations, including M07, brief and material. Do not run on the parent/sibling stack or after either candidate installer has already run. The harness deliberately refuses an already-installed candidate.

```sh
OFFROAD_COMBINED_NATIVE_EVAL=isolated-loopback-ci \
python3 /private/tmp/offroad-combined-native18-ci-cut/scripts/ci/test-combined-native-consumers-assessment.py \
  --consumers-root /private/tmp/offroad-consumers-cut-snapshot \
  --assessment-root /private/tmp/offroad-assessment-cut-snapshot
```

`DATABASE_URL` must already point to that disposable loopback database. Do not print its credentials. Paths may be changed to equivalent checked-out CI roots; the eighteen hashes must remain exact. The two existing installers run in their own atomic transactions, in order **eleven original consumers, then one prospective correction, then six assessment**. Failure stops the run immediately. The harness never resets a database, installs mocks, executes model calls or supplies fake authority receipts.

After installation it checks the current work-update → debt → S11 receipt-authority wrapper chain, denies direct API execution of the three receipt helpers, and checks that the M07 result writer retains its native commit/clock guards plus atomic assessment index. It then executes the existing S11 task-projection and debt-ledger hostile command suites, followed by all four existing assessment rollback suites (review, rejection/revision, public-research denial, work-update adoption).

This proof is limited to combined SQL installation, catalogue/ACL composition and the selected real rollback suites. SDK HTTP, positive S11/debt producer lifecycle, CI full gates and staging/production catalogue/deployment checks remain their existing gates. Those are not inferred from this harness.

Evidence at preparation: Python syntax PASS; loopback/explicit-opt-in guard self-test PASS; hashes18 PASS. SQL/installation/runtime suites **UNEXECUTED**: neither port55437 nor54322 responded and Docker/socket were absent. No substitute Postgres/Auth/Storage stubs were created.

Temporary workflow: `.github/workflows/combined-native-sql-proof.yml`. Root publishes only this harness cut on a temporary audit branch and dispatches that workflow; it is explicitly **not merged** and cannot satisfy release branch-protection checks. It checks out the exact baseline/core/assessment SHAs recorded in `COMBINED-SOURCES.json` into separate folders and applies no candidate SQL from the audit Git tree. Node uses the canonical baseline `.nvmrc`; Supabase CLI/actions/stack exclusions mirror the existing database CI. No dependency installation or model/HTTP fixture is needed for this SQL-only proof.

Publish these six manifest paths only (never `source-self-test/` or `__pycache__/`). Invocation after publication: dispatch `combined-native-sql-proof.yml` on the temporary audit branch. Retire the temporary workflow/branch after this proof passes and the canonical migration promotions are installed. This audit proof does not replace those promotions or their existing release gates.

The preceding combined17 run 37098484645 remains historical evidence for the old inputs only. This core12+assessment6 candidate is unexecuted until a new real CI proof. The original eleven and all six assessment SQL byte hashes are unchanged; the sole new SQL input is artifact_native_inherited_restriction, preserving already denied reader DTOs.
