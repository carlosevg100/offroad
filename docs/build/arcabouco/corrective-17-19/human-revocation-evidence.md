# Human revocation serialization

Status: independent static review approved; runtime proof and remote application pending.

The common execution authority function locks the persisted human subject before policy, release, authorization revision and job. Suspension and logical deletion now participate in the same transaction ordering as the result commit. The exhausted-job cleanup remains able to close revoked work.

`test-execution-concurrency.py` uses distinct human and worker accounts. In the disposable local CI database only, it installs the complete historical authority function, demonstrates a result committing while human suspension remains uncommitted, and restores the installed function in `finally`. The corrected cases observe a real database lock wait: suspension/deletion first denies the result; commit first preserves the earlier result and denies later replay; rollback of suspension/deletion permits the result.

The staging test is explicitly functional and rollback-only. It does not claim to reproduce intersession concurrency: committing synthetic executions in staging would leave immutable records with no legitimate cleanup path. No guard is disabled to manufacture this proof.
