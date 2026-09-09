# Documentary release evidence

- `REVIEW-DOCUMENTARY-RELEASE-643567b.md`: unchanged copy of the independent code review. It records 119 local tests and conditional findings; it did not execute SQL or provider gates.
- `EXECUTOR-34302835300-SEMANTIC-REVIEW.json`: compact offline semantic report with original evidence and full-review SHA-256 hashes. Original automated score: 6/6; offline authored-reference score: 4/6. No provider rerun and no universal semantic certification.

The candidate prompt changed after this evidence. These records do not approve the changed prompt or production activation. Original files remain unchanged outside the repository.

## Authenticated journey failure and corrective candidate

Authenticated journey `34302837186` finished FAIL: one signup test passed, the comparison test failed in both attempts, and two later tests did not run. The worker reported `scanner_disabled` / `scanner_unavailable` because the workflow disabled scanning; no model calls occurred and no Word result was produced. This is an environment setup failure before preliminary analysis, not evidence of a completed product journey.

The candidate protected workflow now provisions real Ubuntu ClamAV, requires a successful definition update, binds its daemon to loopback and checks PING/version plus clean and EICAR INSTREAM controls before starting the documentary worker. Syntax checks passed; actual Linux scanner readiness and the full journey still require the protected workflow. No runtime scanner guard was relaxed, and no receipt was seeded. Planning remains disabled in production.

