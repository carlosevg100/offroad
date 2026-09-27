# Human revocation serialization

Status: independently reviewed and applied to both databases; full CI, merge and deployments remain pending.

The common execution authority function locks the persisted human subject before policy, release, authorization revision and job. Suspension and logical deletion now participate in the same transaction ordering as the result commit. The exhausted-job cleanup remains able to close revoked work.

`test-execution-concurrency.py` uses distinct human and worker accounts. In the disposable local CI database only, it installs the complete historical authority function, demonstrates a result committing while human suspension remains uncommitted, and restores the installed function in `finally`. The corrected cases observe a real database lock wait: suspension/deletion first denies the result; commit first preserves the earlier result and denies later replay; rollback of suspension/deletion permits the result.

The staging test is explicitly functional and rollback-only. It does not claim to reproduce intersession concurrency: committing synthetic executions in staging would leave immutable records with no legitimate cleanup path. No guard is disabled to manufacture this proof.

## Runtime evidence

CI run 36322527305, database job 108628987536, 27 September 2026 at 13:32:13 UTC: historical race REPRODUCED; all six corrected cases PASS with observed waits. The later R01 suite found a synthetic UUID collision with the added fixtures, corrected by giving the new scopes their own prefix. This initial overall run was not green.

Staging migration `20260927133553`; production `20260927133717`. Functional negative suite and execution_commands, execution_consumer, execution_consumer_exhaustion passed under rollback in staging. Installed authority definition matches across environments. Production security advisors returned no findings; no production fixture or client execution was created.

Local `pnpm check`: 44 tasks passed, Node 24.19.0. Final CI and deployment evidence will close this increment.


The corrected full database job passed in run 36323133942, job 108630785523. At 13:43:32 UTC the historical race was reproduced and all six human suspension/deletion ordering and rollback cases passed. The later R01 and dependency suites also passed; no fixture collision remained. A subsequent merge of main preserves the same implementation and is subject to the complete CI again.
