# CodeQL triage: 7 September 2026

Repository baseline: `b6da2876d86cf63a6a17bd4bc855b6c4a1e41698`.
Read-only GitHub API inspection found 16 open alerts, all labelled `high` by CodeQL,
with latest instances on this baseline. Alert severity is scanner classification,
not proof of production exploitability. Individual alert records and their source/sink
messages were inspected; restricted scanner traces remain in GitHub, not this public report.

## Disposition

| Alert IDs | Assessment | Disposition in this change |
| --- | --- | --- |
| 16, 17 | Document text handling has overlapping regex work on long whitespace. | Replaced with linear token/line scans; regression coverage preserves list names, text and citations. |
| 19, 20, 21, 22 | Two field-path expressions use wildcard separators unintentionally. | Literal separators restored. Debt regression proves unrelated malformed paths previously added spurious missing-input exceptions. |
| 14 | Covenant formatting can remove significant integer zeroes as well as incur overlapping regex work. | Decimal-aware formatting preserves magnitude, sign and precision, and rejects nonfinite thresholds. |
| 15, 18 | Additional production text/anchor expressions require remediation and caller-bound analysis. | Open; separate focused change required. No risk acceptance. |
| 24 | Candidate false positive: private grouping helper receives four fixed ontology prefixes; caller does not supply a regex prefix. | Independent review required before disposition. |
| 26, 27 | Candidate false positives: presence checks select the verification operation, whose result still determines success. Installed Auth SDK sends verification to the server and returns errors; presence alone does not establish a session. | No authentication changes. Negative integration tests and independent review required before disposition. |
| 23 | Candidate false positive in a test: `includes` is exact membership on a domain array, not a URL substring authorization check. | Independent review required before disposition. |
| 28 | Test-only expression intentionally combines contained markers with an HTML suffix. | Independent review of intended assertion before disposition. |
| 29 | Local development generator uses a predictable temporary output path. | Open development-tool hardening; no production exposure established. |
| 36 | Synthetic E2E account credentials incorporate non-cryptographic randomness. | Open test-harness hardening; no production credential generation established. |

No alerts were dismissed or remotely changed. Seven alert instances are addressed by five
source edits, subject to a new CodeQL analysis. The remaining nine are not declared closed.
This report does not authorize release, certify security, or establish the state of production.

## Verification

- Node 24.19.0; pnpm 10.32.1; frozen lockfile installation, unchanged dependencies.
- Targeted packages: 232 tests passed (83 document-intelligence, 57 governed-retrieval,
  36 reconciliation, 56 case-materials). Regressions cover document enumeration, long whitespace, citation identity and
  malformed field-path separation. The debt-path regression failed against the baseline
  and passes with the fix.
- Full local `pnpm check`: passed lint, typecheck, 2,472 tests and production build;
  43/43 targets passed per stage. This is local build evidence, not a production deployment.
- Production, hosted databases, remote policy and authentication behavior were not changed.
- CI, CodeQL rescan, database/E2E and deployment evidence remain release prerequisites.

Execution task: SEC-02 (partial triage/remediation). Canonical control objectives:
TRUST-APP-02, TRUST-DOC-02, TRUST-SDLC-01. Detailed activities APP-04, APP-10, DOC-06
and APP-11 refer to the security program activity catalogue, not separate execution-board tasks.
Data remains in the existing document/reconciliation
flow; no new storage, provider, telemetry, permission or external effect is introduced.
Rollback: revert this focused source/test change; no migration or data conversion is involved.

The authentication assessment used the installed SDK and the official
[verifyOtp reference](https://supabase.com/docs/reference/javascript/auth-verifyotp).
