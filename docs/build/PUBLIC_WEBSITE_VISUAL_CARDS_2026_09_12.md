# Public website visual revision

## Request and baseline

The founder rejected the document-like section layout, asked for visual cards and restrained effects, and moved the professional-empowerment message to immediately after the hero. The additional request changes the hero's silver/black photographic treatment so white copy no longer competes with silver city lights.

Candidate branch: `feat/visual-website-cards`, from published main `8fc6ec06ea5e365048fd180d14860226d2ce3f64` (PR606). The approved bilingual hero wording, official logo and audience/solution detail pages are preserved. The parent workspace's current product vision remains authoritative; a conceptual capability is not evidence of production availability.

## Implemented

* Professional empowerment now precedes the offer: “Seu julgamento financeiro. Sua capacidade de execução, ampliada.” The English copy expresses the same proposition. The former negative comparison with fewer professionals is removed.
* Three offer cards show a financial question, a reconciled fictional financial baseline and transaction/mandate criteria. Supporting depth opens on demand. Each card links to its existing solution page.
* Three audience buttons select companies, advisors or investors. The panel connects a role-specific benefit, a question and example deliverables, with access to the existing detailed page.
* The finance-authored method combines the approved dual-monitor photograph with four expandable method tiles. Market, journey and institutional trust use distinct card treatments instead of repeated document-style rows.
* Progressive scroll entrances run once and respect reduced motion. Server-rendered content is visible without JavaScript. Native controls, visible focus, selected state and labeled regions are preserved.
* The original hero photograph already contains deep blue and amber. CSS restores that color instead of desaturating it. A localized navy overlay supports white text while retaining the city; mobile uses its own exposure and overlay. No raster asset was regenerated or replaced.
* Tablet offer cards use an image/content split; mobile stacks the content. Example surfaces grow with their contents rather than clipping to a fixed height.

## Boundaries

The visual baseline is explicitly fictional and comes from the existing testing fixture and financial-core. Criteria are not named lenders, verified mandates, approvals or guarantees. No performance numbers, real customer outcomes, endorsements or certification badges were added. SOC 2 remains a future objective. Public examples are not an operating AI session.

No private app, authorization, financial calculation implementation, database, provider, dependency, telemetry, hosting project or environment configuration changed. Demo contact still prepares an email for explicit user sending. No separate hosting project is permitted.

## Verification

Focused website tests: 19 passed, including both locale key trees, revised section order, empowerment copy, all three selectable audience render states, deterministic example numbers and server-visible content. The web suite passed 106 files and 667 tests during the repository check.

The read-only HTTP/content probe passed 42 localized public pages, five image assets, sitemap, robots, unknown-route 404, login and unauthenticated app redirect. It verifies the delivered hero color rules, progressive-exploration markup and revised section order.

Source-level accessibility review includes native buttons/details/links, keyboard focus, non-color selected state, labeled content regions, no hover-only information, reduced motion and readable small text. This is not browser, screen-reader or actual-iPhone execution evidence.

The final repository `pnpm check` passed lint, typecheck, tests and all 43 build tasks. The earlier restricted build was stopped after making no progress at compilation; the complete check passed with external-font access and system TLS certificates. No source check or timeout was weakened. Exact-head remote Quality/Security/Vercel gates and the production receipt remain required before publication is reported complete. Browser QA was requested asynchronously and remains unapproved at this checkpoint. No browser screenshots, DOM interaction or actual-iPhone visual acceptance are claimed.

## Release and rollback

Publish through the existing repository and official Vercel project only, after required checks. Verify the exact production deployment, aliases and affected routes. Record the immutable production receipt separately after publication.

Previous published main for rollback: `8fc6ec06ea5e365048fd180d14860226d2ce3f64`, Vercel production `dpl_5Uiz93oCo1gZ4EiQN1hdK79UrerD`. Containment is a reviewed public-site-only revert or promotion of that verified release; no database rollback is needed.

The unrelated last-confirmation SQL ordering issue tracked by PR603 is outside this revision. Do not change database constraints or tests to make this website release pass.
