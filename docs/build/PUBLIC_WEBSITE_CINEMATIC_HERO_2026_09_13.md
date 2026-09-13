# Cinematic public website revision

## Scope and authority

The founder requested an OffDeal-inspired visual direction and explicitly approved browser inspection and desktop/mobile testing. This revision starts from published main 7c8d4f673f8ccfd81e69eeaf7f81f009a9c7bb74 on feat/public-cinematic-hero. The existing GitHub and Vercel project remain the only publication path. The original user-owned checkout and unrelated PR603 are outside scope.

## Experience

- The PT opening is "Plataforma dedicada a quem capta, estrutura e financia." EN is "A platform for those who raise, structure and provide capital."
- Two desktop headline lines use white and champagne. The advisor support remains a single desktop line. The circle-and-wordmark asset, finance-professional signature, demo/use-case actions and three-audience positioning are preserved.
- A floating glass navigation, team-amplification pill, four direct benefits and private-credit investor entry are visible in the opening. Mobile uses a two-by-two benefit grid, natural headline wrapping and adjacent CTAs.
- The background is a 16-second, 1920 x 1080, 24 fps silent MP4, 641,230 bytes. It is a smooth closed camera path rendered from the existing Offroad office/city image, not newly filmed city footage. No OffDeal image, video, logo or performance claim is reused. The reference informed hierarchy, glass, motion and the four-benefit structure.
- Playback starts only after checking reduced-motion, data-saving and document visibility. A real icon button pauses/resumes. Pausing preserves the video frame. The original photo remains a fallback.
- A dark, full-width finance/AI product section now follows the offer, before the audience section. The existing dual-monitor product image is larger, with expandable specialist methods and selective frontier-model explanation.
- The initial advisor example is ACME's board/capital-plan discussion. Receivables and bank-proposal analysis remain selectable examples, not the product identity. The demonstration lender is ACME Credit. Financial inputs and calculations are unchanged.
- A chart accessibility title previously emitted multiple text children and caused a hydration error when the board example was initially visible. It is now a single string and has a regression test.

## Contact, claims and privacy

The investor link targets a localized mandate-introduction section on the existing investor page. It reuses the current contact form with investor context preselected and mandate-specific prompts. It prepares a message in the visitor's email application. It does not store a lead, claim server receipt, subscribe a visitor, introduce an email provider or submit confidential documents. The visitor must explicitly send the email. A server-received registration workflow is not part of this release.

Homepage copy now addresses the professional directly. Repetitive score caveats move into the rationale disclosure, while "Connection example" and the ACME name preserve example context. No real funding outcome, lender appetite, approval probability, live ML model or customer metric is asserted. The existing deterministic example and explicit criterion exception remain intact.

Security copy foregrounds existing organization-scoped access, private document storage, limited web telemetry and development checks. Evidence remains the access/storage implementation, apps/web/src/instrumentation-client.ts, apps/web/src/lib/observability/privacy.ts and .github/workflows/security.yml, as documented in PUBLIC_WEBSITE_RELEASE_2026_09_11.md. The home does not repeat SOC 2 absence. A single expandable status on the security page says SOC 2 Type II is an objective and no report has been issued. No certification in progress, report, universal assurance, SSO, mandatory MFA, zero retention or blanket no-training promise is added.

No private app, authentication, data policy, database migration, matching logic, telemetry configuration, production environment or provider changed.

## Validation and release gates

Focused website/case tests passed: 31. Full pnpm check passed: lint, typecheck, repository tests and 43 build tasks. The web suite passed 107 files / 679 tests. The read-only HTTP probe passed all 42 localized pages, five image/logo assets, the new MP4 delivery, sitemap, robots, 404 and existing unauthenticated app boundary.

Browser QA is authorized and executed in the in-app browser. PT/EN desktop layouts at 1440 x 900 and 1280 x 720 preserve two headline lines and one advisor-support line. The PT 390 x 844 opening shows the four benefits and adjacent CTAs without horizontal overflow. Pause preserves the displayed frame and time; resume works. Mobile menu, investor anchor and preselected context, method disclosure, board modal, scenario switching, mobile modal width and focus return were verified. The dark product scene was visually inspected. Responsive viewport testing is not a physical iPhone/Safari test. No external contact form is submitted during QA.

Full repository lint, types, tests and production build, exact-head remote Quality check/database/e2e jobs, security and Vercel preview remain mandatory before squash merge. Verify the exact production revision and official aliases after merge, then sync a clean local main. Do not claim production from a local screenshot or preview alone.

The known unrelated verified-mandate confirmation-ordering database flake must be identified from its exact failure before at most one unchanged-head failed-job rerun. Do not alter SQL or relax a gate for this website release.

Rollback: revert this isolated website change through a reviewed PR and redeploy the existing Vercel project. No data rollback is required. Keep the prior deployment available for containment and preserve unrelated subsequent releases.
