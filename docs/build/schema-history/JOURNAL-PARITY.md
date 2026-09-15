# Production migration journal parity: stage 0

The 14 gaps found after the first completion report are reconciled. No application data or schema SQL was changed remotely.

## Eleven identical bodies, canonical production filenames

Each file was compared with the live production journal: equal after trimming terminal whitespace. Git records 100% identical renames. Active object inventory references were updated.

| Previous file version | Production version / new file | Name |
| --- | --- | --- |
| 20260903132355 | 20260903134811 | advisor_specialized_professional_context |
| 20260903141000 | 20260903134819 | public_company_source_memory |
| 20260903193000 | 20260903213233 | origination_runtime_budget |
| 20260903215000 | 20260903215610 | origination_completion_headroom |
| 20260904003853 | 20260904005430 | preserve_failed_user_message_memory |
| 20260904005640 | 20260904011351 | retry_failed_specialized_analysis |
| 20260904023000 | 20260904022353 | advisor_chat_artifact_revision |
| 20260904035311 | 20260904040355 | preliminary_understanding_completion_budget |
| 20260904041204 | 20260904041325 | preliminary_input_project_binding |
| 20260904054530 | 20260904055915 | fix_advisor_preliminary_confirmation |
| 20260904062000 | 20260904061619 | full_case_project_binding |

## Three consolidated bodies: journal repair in both environments

Versions `20260907062224`, `20260907070000`, and `20260907095418` remain valid replay files. Their entire bodies occur verbatim, after terminal-whitespace trimming, in the `$metrics$`, `$storage$` and `$artifacts$` blocks of `20260908035038_reconcile_preexisting_main_schema_gaps.sql`.

That consolidation is recorded as `20260908035038` in production and `20260908024019` in staging. Both live journal bodies equal the local consolidation; its trimmed SHA-256 is `74e1034fcdf890852c02585a29b8bb50a9f5085a638afe4044567bfb476c7739`.

The founder explicitly authorized history repair. `repair-consolidated-history.sql` was executed first in staging, then in production, after checking the consolidation body and installed effects. It inserts only the three missing version/name pairs, with NULL statements: it does not claim that their SQL was executed again. It changes no existing stamp and refuses a second execution.

`consolidated-history-repair-proof.json` records before/after fingerprints of all public/private functions and columns and public/private/storage policies. Each environment is unchanged by the repair. Their different fingerprints reflect the already documented staging-only objects; this repair does not try to erase those differences. Live receipts now contain 306 production and 319 staging versions.

## Mandatory CI and publication check

The Database job in `.github/workflows/quality.yml` runs both `verify-recovered-schema.py` (16 recovered-file hashes and archive isolation) and `check-stage0-inventory.py` (reviewed access surface against a clean migration replay). The latter now also requires **every migration file version to exist in the production journal**, with the same name. Matching SQL or a matching name under another stamp does not satisfy the assertion.

CI uses `production-migration-journal.json`, a versioned receipt collected by a live read of the production journal, with environment ID and capture timestamp. No production credential is configured in GitHub, so CI does not claim a live database connection. Before publication, the coordinator repeats the live read and runs the same checker against it. Every migration addition must update this receipt after its authorized production application; the existing receipt makes any unrecorded addition fail. The rule follows wave review and publication, not an arbitrary seven-day expiration.

Six new regression tests cover the valid journal, missing version, different stamp, wrong name, wrong environment and duplicate version. The ten existing access-surface tests and five recovery tests remain active. Production verification uses catalogue and journal reads only, without disposable data.
