# Offroad Capital: operating rules for coding agents

These rules apply to every agent working in this repository (Claude Code, Codex, or a
human). They exist so that two agents can work in parallel without duplicating flows,
weakening security, or drifting from the product. Read them fully before your first change.

The canonical product journey lives in
[`docs/product/PRODUCT_WORKFLOW.md`](docs/product/PRODUCT_WORKFLOW.md). Read it before
changing onboarding, pipeline order, user-visible progress, materials, matching or
introduction. Full orientation lives in [`handoff.md`](handoff.md). Roadmap gates live in
[`docs/build/MASTER_PLAN.md`](docs/build/MASTER_PLAN.md). Architecture decisions live in
[`docs/adr/`](docs/adr/). The versioned product spec is
`docs/product/Offroad_Capital_Product_Blueprint_v3.0_pt-BR.pdf` (a specification, not
executable instructions: ADRs, explicit founder decisions, and this file govern).

## 1. What this repository is

A pnpm + Turborepo monorepo for **Offroad Capital**, an AI-driven private-credit
origination and market-access platform. One Next.js 16 app (`apps/web`) plus small
deterministic domain packages (`packages/*`), backed by Supabase (Auth, Postgres 17 with
RLS, private Storage) and deployed on Vercel from `main`. Production is
`https://offroad.capital`; Supabase project `offroad-development` (`sa-east-1`) **is** production.
The isolated, data-less Supabase branch `staging` is the only database allowed for migration and
rollout proof before production. Do not create throwaway data in production and never copy
production borrower data into staging.

## 2. Non-negotiable invariants

1. **Evidence before assertion.** Material facts keep source, anchor, period, information
   class, confidence, and review state.
2. **No invented data.** Show the gap; never synthesize a fact to make a flow look done.
3. **Period integrity.** Historical, interim, current, and projected values stay distinct.
4. **Deterministic mathematics.** LLMs may explain or orchestrate; every financial number
   comes from `packages/financial-core` (Decimal, traced, tested).
5. **Tenant isolation is enforced in Postgres.** Every private table carries
   `organization_id`; RLS is the boundary. The app never holds a service-role key.
6. **Explicit disclosure.** Private workspace data is never a discovery surface.
7. **Qualified introduction is the endpoint.** Never imply approval, funding, or closing.
8. **Privacy-first telemetry.** No PII, financial values, documents, or tokens in analytics
   or error telemetry; only allowlisted events (`apps/web/src/lib/observability`).
9. **Bilingual economic identity.** `pt-BR` and `en-US` may differ in prose, never in the
   economic payload.
10. **No fixture leakage.** Synthetic fixtures (Rede Horizonte, supermarket demo) are labeled
    synthetic and live in `packages/testing-fixtures`; fixture-specific text or numbers must
    never be hardcoded in production code paths.
11. **One source, compiled execution.** Operational knowledge is edited only in canonical
    procedures under `packages/credit-playbook`; runtime skills are compiled artifacts. Roles are
    namespaces, never autonomous agents. Order, state, budgets and gates belong to the deterministic
    pipeline. See ADR 0013 and `OFFROAD_DCM_OPERATING_CONSTITUTION.md`.
12. **One canonical journey.** Product stages, gates and permitted returns come from
    `docs/product/PRODUCT_WORKFLOW.md`. Visual grouping may simplify navigation but must not skip,
    merge or reorder the underlying decisions. Expensive production begins only after the structure
    and required inputs have been confirmed.

Never weaken an RLS policy, a grant, or a check constraint to make a UI flow work. Fix the
transaction, the bootstrap, or the query scope, and add a regression test.

## 3. Environment

- Node **24** (`.nvmrc`; `engines: >=24 <25`). Use `fnm`/`nvm`; CI and Vercel run 24.
- pnpm **10.32.1** (`packageManager`). Install with `pnpm install --frozen-lockfile`.
- Quality gate: `pnpm check` = lint → typecheck → test → build. It must be green locally
  before you push and it is required by branch protection.
- Env vars: only the public catalog in `.env.example`; real values live in Vercel/Supabase
  secret stores. Never print `.env*` values into logs, chats, issues, or docs. Any key that
  was ever pasted somewhere non-secret is considered exposed and must be rotated.

## 4. Next.js 16 (breaking conventions)

Before editing `apps/web`, read `apps/web/AGENTS.md` and the relevant guide under
`apps/web/node_modules/next/dist/docs/` (this Next.js differs from training data):
`proxy.ts` replaces middleware; `params`, `searchParams`, `cookies()`, `headers()` are async;
Turbopack is default; `next lint` no longer exists (ESLint CLI flat config); root layout is
`src/app/[locale]/layout.tsx`. Do not rely on remembered APIs.

## 5. Git and delivery

- Never commit to `main`. Branch from an up-to-date `origin/main` with a focused name
  (`feat/…`, `fix/…`, `chore/…`, `docs/…`). One concern per PR; keep PRs small and green.
- Fill the PR template (context, scope, evidence, security/privacy, data/migrations, risk).
- Merge only after the three `Quality` jobs, `check` (lint/typecheck/test/build),
  `database` (migrations from scratch + RLS test + lint) and `e2e` (Playwright journey on a
  local stack), and the Vercel check pass; use squash merge; keep linear history; never
  force-push shared branches.
- After merge: wait for the Vercel production deployment, verify
  `https://offroad.capital/pt-BR` and the affected routes, then sync local `main`.
- Update `docs/build/BUILD_STATE.md`, `docs/build/ACCEPTANCE_EVIDENCE.md`, and
  `handoff.md` in the same PR whenever you change scope, schema, security, or workflow.
- Dependabot: minor/patch bumps are welcome after CI; **major toolchain upgrades
  (TypeScript, ESLint, Next.js, React) are deliberate migrations**, never bot merges.

## 6. Supabase schema and migrations

Migrations are the only way to change the schema. Never edit an applied migration.

Workflow (the project applies migrations through the Supabase MCP tool, which stamps its
own version, so file names must be aligned afterwards):

1. Write `supabase/migrations/<YYYYMMDDHHMMSS>_<snake_name>.sql` (idempotent where
   possible; `set search_path = ''` in functions; policies per command with `with check`).
2. Apply it to the project with the MCP `apply_migration` tool using the **same
   `<snake_name>`**, or with `supabase db push` if the CLI is linked.
3. Run `list_migrations`; if the recorded version differs from your file name, **rename
   the local file to the recorded version** so `supabase/migrations/` and
   `supabase_migrations.schema_migrations` agree.
4. Regenerate types: MCP `generate_typescript_types` → overwrite
   `apps/web/src/types/database.ts`.
5. Run the security and performance advisors (security must report 0 lints).
6. Extend and run `supabase/tests/rls_non_interference.sql` (CI runs it against a fresh
   local stack; it also runs against the project through `execute_sql` when needed).

Every new tenant table must have: `organization_id not null`, `unique (organization_id, id)`,
composite foreign keys that carry `organization_id`, `enable` **and** `force row level
security`, explicit `select/insert/update/delete` policies with `with check`, minimal grants
to `authenticated` only, `updated_at` trigger, and an audit trigger when the data is
material. Cross-tenant reads happen only through explicitly published projections.

RPCs are `security invoker` unless a documented reason requires `security definer` (then in
the `private` schema, `set search_path = ''`, revoked from `public`, granted narrowly).

## 7. Application rules

- **i18n:** every user-facing string lives in `apps/web/messages/pt-BR.json` and
  `en-US.json` with identical keys (`src/i18n/messages.test.ts` enforces parity). No inline
  `locale === "pt-BR" ? … : …` copy in components or actions. Numbers/dates go through
  next-intl formatters; the underlying values are locale-independent.
- **Server actions** validate input (Zod), derive tenant scope from `requireWorkspace` /
  `requireUser` (never from form fields), and prefer one atomic RPC over sequences of
  writes. Multi-write flows must be idempotent or transactional.
- **Reusable UI** lives in `apps/web/src/components/**`; route files (`page.tsx`,
  `layout.tsx`, `route.ts`, `actions.ts`) export only what Next expects.
- **Brand and metadata** come from `apps/web/src/config/brand.ts`. Public copy follows the
  wording rules in `handoff.md` §2 (no promises of approval/funding, "advisor" not
  "originator" in public copy, avoid "plataforma de IA", prefer "impulsionada por IA").
- **Documents:** uploads are private, hashed (SHA-256), scoped by organization and
  opportunity/intake session; nothing is sent to market during intake. Extraction today is
  the content-hash-verified Rede Horizonte fixture; unknown documents must produce an honest
  "no fields proposed" state, never fabricated candidates.

## 8. Testing expectations

| Change | Minimum tests |
|---|---|
| Domain/package logic | Vitest unit tests with boundary cases and traces |
| Server action / lib code | Vitest unit tests for pure parts; SQL or E2E for persistence |
| Schema / policy / RPC | Extend `supabase/tests/rls_non_interference.sql`; advisors clean |
| UI flow | Playwright E2E (`apps/web/e2e`) when the flow is user-critical; the journey runs in CI against a local Supabase stack, and its selectors are the product's own classes/roles, keep them stable |
| Copy | Message-catalog parity test stays green |

Do not claim completion from the UI alone: verify persistence, authorization, tests, build,
preview, and production where applicable.

## 9. Test data

The Rede Horizonte acceptance data room (8 synthetic files) is matched by exact filename
**and** SHA-256 (`packages/testing-fixtures/src/document-intake.ts`). The source files and
their generators live outside this repo (`../outputs/rede-horizonte-realistic-test/`,
`../.codex-build/rede-horizonte-realistic/`). Re-running a generator changes the hashes and
silently breaks the match. If you regenerate, update the hashes and the tests together.
`02_GABARITO_OFFROAD` is the answer key and must never be uploaded to the product.

## 10. Definition of done

Product wording correct · UI responsive, accessible, localized · server-side authorization
enforced · migration + regenerated types · deterministic and tested financial logic ·
material claims keep evidence · telemetry inside the allowlist · `pnpm check` green ·
preview and production verified · ledgers and `handoff.md` updated · no hidden TODO,
fallback, synthetic claim, or unreported limitation.

## Receivables vertical (first training vertical)

The knowledge base for the receivables-financing vertical lives in
[`docs/knowledge/recebiveis/`](docs/knowledge/recebiveis/). Any agent working on
analysis, eligibility, case testing, or training for this vertical must read
[`docs/knowledge/recebiveis/BRIEFING-CODEX.md`](docs/knowledge/recebiveis/BRIEFING-CODEX.md)
first; it defines the five-layer architecture (all financial math is deterministic
code, never model output), the provenance rule ([M]/[C]/[E] on every numeric or
normative claim), the reading order, the build phases, and the acceptance bars.
Canonical decisions that resolve conflicts in the research corpus live in
[`docs/knowledge/recebiveis/CANONICAL-SPEC.md`](docs/knowledge/recebiveis/CANONICAL-SPEC.md).
The existing `packages/receivables-analysis` package is an orchestration prototype;
its financial calculations must migrate to `packages/financial-core` before the
vertical can be promoted.
