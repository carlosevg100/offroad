# Public website: coherent ACME analysis

## Superseding request

Before PR608 was released, the founder rejected the shallow advisor answers and the unrelated journey example. Publication was held and PR608 returned to draft. This revision supersedes the advisor/journey descriptions in `PUBLIC_WEBSITE_OFFER_DEMOS_2026_09_12.md`; the other offer visuals remain in scope.

The founder requested a single ACME case, more substantive reasoning, useful financial comparisons and removal of repeated fictitious-data labels. A compact demonstration-case identification remains in the context. No real client outcome, current funding offer or source-document ingestion is implied.

## Changes

- Advisor previews now open a native modal with the complete analysis. The receivables example treats the company as a single seller with multiple customers, not as a multi-originator fund. The three paths are sale to an existing FIDC, relationship-bank discounting and a receivables-secured revolver.
- The numeric receivables example distinguishes face value from eligible collateral and gross advance. At the declared 80% advance assumption, a fully eligible 30 million pool supports 24 million before costs; with 20% excluded, the amount is 19.2 million. Eligibility exclusions, recourse, collateral encumbrance and comparison on the same invoice pool are explicit.
- The board example and all five journey stages use a shared ACME fixture. Initial document requests explain their purpose. Historical indicators open their source or calculation definition. Scenario selection changes the cash chart, annual balances and explanation. Annual source/use bridges and the covenant sensitivity can be inspected.
- Preparation compares the same three alternatives and separates board, model, lender and indicative-terms materials. Capital outreach distinguishes relationship banks, expansion lenders and corporate-credit investors, with the relevant criteria and authorization boundary.
- ACME also replaces the old public workbench name and financial baseline, so its visible earnings and net debt no longer conflict across examples. The underlying historical supermarket fixture and private product demonstration remain unchanged.
- Native modal focus return, visible control states, finite motion, reduced motion and mobile stacking are implemented. Browser interaction and actual-device appearance still require the unanswered browser-QA authorization.

## Financial reconciliation

The founder's examples guide the narrative, not an obligation to reproduce inconsistent arithmetic. The latest ACME basis is revenue 1510, EBITDA 150 and net debt 420, giving 9.9% margin and 2.80x leverage. At a3.25x maximum, EBITDA headroom is 20.76923077, displayed as 20.8, rather than 68. Debt capacity and EBITDA headroom are different quantities. The historical bridge is reported EBITDA 148.5 plus approved adjustment 1.5.

All amounts below are BRL millions and explicit demonstration assumptions. Operating cash is after existing-debt interest, taxes and working-capital movement. New interest is incremental and net of refinancing effects. Fees, annual payment schedules and drawdowns are assumptions, not market quotes.

| Alternative | 2025 | 2026 | 2027 | 2028 |
| --- | ---: | ---: | ---: | ---: |
| No action |85 |52 |-223 |-133 |
| Plant only |85 |106.2 |-62.8 |-14.8 |
| Integrated plan |85 |145.9 |77.9 |114.9 |
| Defer plant |85 |112 |85 |-20 |

The operating minimum is 60. The integrated plan is the only illustrated path above that minimum at every annual closing. Its funding is 285, consisting of 60 in 2026 and 225 in 2027, with the 2026 dividend suspended. Sizing includes operating cash, fees and additional interest; it is not simply capex plus maturities. Annual sufficiency does not prove intra-year liquidity or execution feasibility. Negative chart balances identify an unfunded need, not spendable cash.

The integrated 2027 leverage is 2.43x. An isolated 15% EBITDA reduction, holding net debt constant, gives 2.86x against the 3.25x limit. The UI explicitly distinguishes that sensitivity from a full cash-flow downside. Unfunded alternatives do not receive a misleading covenant ratio.

`packages/testing-fixtures/src/website-advisor.ts` owns the inputs. `website-advisor-example.ts` orchestrates existing financial-core calculations and formats outputs. No financial-core implementation or live matching algorithm changed. Golden tests verify the independently reconciled series, headroom, leverage and shared ACME baseline.

## Reference checks and claim limits

[Santander's discounting description](https://www.santander.com.br/blog/desconto-de-duplicatas) confirms recourse and the need for an approved limit and accepted titles. [Itaú's revolving facility page](https://www.itau.com.br/empresas/emprestimos-financiamentos/conta-garantida) describes a revolving product and collateral requirements. These support mechanisms, not prices or provider availability for ACME.

[CPC48, section 3.2](https://conteudo.cvm.gov.br/export/sites/cvm/menu/regulados/normascontabeis/cpc/CPC_48_Rev_13.pdf) supports the distinction between a legal transfer and accounting derecognition. The website does not state that partial/non-recourse terms automatically remove risk or assets from the balance sheet. No universal concentration limit, deal timetable or current pricing band is claimed.

## Verification and release

The revised website and financial-case tests passed 27 checks. The repository check passed lint, typecheck,107 web test files / 675 tests and 43 build tasks. The read-only HTTP probe passed 42 localized pages, five assets, sitemap/robots, 404 and the unauthenticated app boundary. A final check is repeated after the source-definition copy refinement.

Browser screenshots, modal clicks, responsive rendering, screen-reader operation and actual-iPhone appearance have not been executed. Source and HTTP checks are not visual acceptance. Required exact-head Quality/Security/Vercel results and production verification remain release gates. The prior website candidate was not promoted while this revision was being made.

No auth, database, provider, telemetry, dependency, certification or hosting configuration changes. Existing site/project only. Rollback remains PR607 main `90ad9e287631d4c331a00210a7d17b7838c42148`, production `dpl_9USssynKKMVWj6ZyFG9oTCVsMerG`.
