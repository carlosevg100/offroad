# CodeQL follow-through: 9 September 2026

GitHub API inspected at main75ec631: eight high alerts OPEN; Dependabot had zero open alerts. Severity is the scanner classification. No alert was dismissed or assigned silent risk acceptance. This record is supplementary to the September7 triage.

| Alert | Evidence and current disposition |
| --- | --- |
| 15 | Confirmed quadratic anchor-suffix parsing in renumberByTable before verification. Harmless reproduction `.r0.` repeated1000/2000/4000 then newline-X took roughly5/19/76ms. Replaced with a linear scan, preserving valid row/cell grouping and leaving malformed multiline anchors intact for verification. Long100000-repeat negative case and valid suffix regressions pass. Requires fresh CodeQL analysis. |
| 29 | Development generator wrote predictable `/tmp/modelo.xlsx`. Now creates a private randomized directory and exclusive mode0600 file, reports its path; no production exposure claimed. |
| 36 | Synthetic intake E2E identifier flowed into its password from Math.random. Uses crypto.randomBytes now. No production credential policy changed. |
| 24 | Independently inspected private indexed helper receives four fixed ontology prefixes. No untrusted regex prefix reaches it. Likely false positive; no dismissal performed. |
| 23 | Array membership assertion over domainAllowlist in a unit test; no substring URL authorization function. Likely false positive; no dismissal performed. |
| 28 | Test assertion intentionally rejects contained answer-key markers OR `.html` suffix. Different anchoring is intentional; not a production authorization control. No dismissal performed. |
| 26,27 | User parameter presence selects verifyOtp or exchangeCodeForSession, but the server result must succeed for redirect. No session success from presence alone found. New actual-stack E2E cases require rejection of invalid token, code, and both together plus subsequent workspace denial. CI results still pending; Auth code unchanged. |

Independent source/alert reviewer: security_triage agent. Root reviewed the extraction fix and authored the tool/harness hardening and negative Auth integration tests. This is AI review, not founder technical sign-off or outside audit. Controls TRUST-APP-02/TRUST-DOC-02/TRUST-SDLC-01; no new provider, privilege, data flow, retention or database change. Rollback reverts source/tests; it would restore the original parser exposure and is not a security resolution. Full local gate, CI including Auth negatives, fresh scan and exact deployments remain required.
