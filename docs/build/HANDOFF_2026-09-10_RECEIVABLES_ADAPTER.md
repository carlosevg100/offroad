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

## Followup to 4ee5c69

Fixes independent premise collection, selected-request replies, duplicate required headers and current-run result visibility. Actual-detector governed lifecycle and real XLSX fixture smoke tests passed (34 worker +4 web targeted tests); both typechecks passed. Authenticated local Playwright coverage is added but not executed here (local Docker unavailable). No accreditation, public specialist output, migration or paid-model scope changed. Full followup `pnpm check` passed (lint, types, tests, 43/43 build tasks). The browser fixture uses a separate support workbook because the current confirmed scope retains only the selected primary sheet; same-workbook supporting-sheet selection is not implemented.

## Combined workbook followup

The former same-workbook limitation is addressed by explicit v2 support-sheet selection, new versioned readers and one additive migration. Primary rows remain exact; no other title tape can enter as support. V1 confirmations/history are unchanged. The browser fixture now exercises one workbook; it is not locally executed. Full local `pnpm check` passed (lint, types, tests and 43/43 build tasks); 108 focused tests passed. The coordinator applied `20260910153117_confirmed_receivables_support_sheets_v2` and `20260910153338_support_sheet_runtime_invoker_contract` to staging; v1/v2 SQL suites passed, the support-sheet suite passed again after the correction, and security advisors reported zero lints. Generated database types were refreshed. The combined integration batch now has eight new staging migrations; this support-sheet extension accounts for two. No production migration or remote push is claimed.
