# Website revision after founder mobile rejection

## Scope

Publication candidate on branch `feat/studio-product-led-revision`, based on `084de68`. On 12 September 2026 the founder explicitly requested publication after the preview handoff had disclosed that browser and actual-iPhone visual validation remained pending. This authorizes publication of this revision; it is not visual acceptance evidence.

The current product vision was reread completely. The three audiences remain companies and financial teams, advisors and specialist teams, and allocators/lenders. The investor example asks for the rationale of downside assumptions before execution. It does not automatically run a scenario.

## Implemented

* Approved PT-BR and English hero wording preserved, compact mobile layout, visible city treatment, original circle/wordmark, no emoji arrows or pause/play control.
* Product-led homepage with three audience contexts and three work stages each. Conversations are paired with a presentation outline, credit memo or reconciled financial table. Mobile switches between conversation and material rather than stacking both.
* Two-monitor photograph retained separately from the hero. Generic rate comparison and rejected caption removed.
* New wording for public-page titles and introductions. The three audience pages and growth, pitch and investment cases use the tailored examples.
* Existing routes, localized metadata, security boundaries and explicit email-contact behavior preserved.

## Evidence and limitations

* Web lint and typecheck passed.
* Web unit/render tests: 106 files, 660 tests passed, including 12 website tests.
* Fictional financial baseline: reported EBITDA 30.4, approved adjustments 0.8, adjusted EBITDA 31.2, net debt 56.4 and leverage 1.81x. Inputs come from the existing synthetic fixture; calculations use financial-core; locale-specific formatting is tested.
* Web production compilation passed, including TypeScript and generation of 78 static pages. This is a local build, not a deployment.
* Before publication, the repository-wide `pnpm check` passed lint, typechecking, tests and all 43 build tasks. Exact-head remote CI and deployment remain separate gates.
* Browser and actual-device visual validation are pending. User authorization for browser QA was requested asynchronously. No visual approval is inferred from unit tests or CSS changes.
* No remote push, PR, deployment, database change, app behavior change or authenticated workflow change.

The final bullet describes the preview checkpoint. The subsequent publication was explicitly authorized by the founder; this document does not pre-claim its result.

## Next gate

Run the repository-wide check, exact-head CI and production deployment verification for the founder-authorized publication. Actual iPhone visual and interaction checks remain a disclosed limitation. Preserve the previous production revision for rollback; do not change app, database or authentication behavior.
