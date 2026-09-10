# Selective receivables document adapter handoff: 10 September 2026

Base: main `576d042`, isolated branch `feat/receivables-endgame-integration`. No blind merge of old PRs. The canonical state/evidence update describes the exact scope and limits.

## Included

- Worker deterministic document adapter and canonical spreadsheet contract.
- Narrow case-analysis integration after confirmed evidence selection, using the existing draft persistence RPC.
- Idempotent refresh that retains subsequent user-premise revisions.
- Exact duplicate evidence-question suppression; period/conflict/history requirements retained.
- Strict calendar and non-rounding, non-guessing monetary parsing; fields included in patch identity.
- Deterministic lifecycle fixture and staging rollback persistence test using its actual output.

## Validation

- Focused worker suite: 34 passed in five files.
- Worker typecheck: passed before the final whole-repository check.
- Staging adapter persistence SQL: passed, run by the integration coordinator.
- Whole-repository `pnpm check`: passed (lint, typecheck, tests and all 43 build tasks). The isolated dependency tree was copied locally; all 207 workspace links resolve inside this checkout. Next needed network/local-compiler permission and a clean generated cache after a sandboxed attempt.
- No paid calls, production writes, new migrations or remote push.

## Remaining boundary

The deterministic lifecycle uses synthetic detector evidence and does not exercise a browser, live model, queue lease progression or published R01 artifact. The SQL separately proves the same adapter payload and a subsequent governed-premise draft persist/reload correctly. A live authenticated full journey remains unproved; do not promote these checks as universal receivables completion. The older progress/template UI was not imported. Shared batch changes must be integrated selectively and checked together.
