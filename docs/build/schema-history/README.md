# Wave 1 applied schema reconciliation

The later fourteen-version correction is documented in [JOURNAL-PARITY.md](JOURNAL-PARITY.md).
It includes eleven byte-preserving filename renames and three explicitly authorized journal-only
repairs in both environments. The statements below about no repair concern the original sixteen
recovered files, not that later correction.

This directory preserves the staging-only distribution SQL recovered on 14 September 2026.
Files under `staging-only-distribution/` are historical evidence and are deliberately outside
`supabase/migrations/`: replaying them would introduce distribution and cross-organization
exchange into production before the approved architecture permits it. No deployment or database
tool may automatically apply this archive.

`recovered-wave1-manifest.json` records all sixteen recovered files, their SHA-256 hashes, and
the version independently recorded by each environment. Seven production-applied migrations
are restored to `supabase/migrations/` with their production stamps. Their source matches
the production journal after trimming final whitespace. The nine archived files similarly match
the staging journal and use staging stamps. No migration was reapplied and no stamp was repaired.

The seven restored files reconcile already installed schema only. They do not include the
unmerged application surfaces, workbook-import implementation, or method promotions from the
original feature branches. Those application changes remain subject to the architecture plan.
The historical comment in `project_debt_structure_capability` does not grant new publication
authority: the executable SQL only expands the existing work-request constraint and recorder.

The four relevant tables have identical columns, constraints, grants, and policies in staging
and production. Of twenty-two inspected function definitions, nineteen are identical and three
differ only in comments. Four migration journal bodies likewise differ only in comments; their
installed executable definitions agree. The two recovered SQL regression suites run through
the existing `supabase/tests/*.sql` CI loop.

Owner: Offroad engineering, in the current implementation task. The archive remains frozen
until the approved cross-organization exchange increment explicitly replaces it; there is no
automatic promotion date. Final wave acceptance requires the CI, deployment, and completion
evidence recorded by the wave owner, not merely the presence of these files.
