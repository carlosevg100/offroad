# Public website: work demonstrations

## Request and baseline

The founder asked for a stronger human-amplification thesis, credible desk-level questions, the analyst's complete delivery sequence and a concrete creditor profile with a score, rationale and an explicit mismatch. The founder clarified that the references are Forward and OffDeal, not an ML model. Public-site publication remains authorized through the existing project.

Candidate: `feat/offer-work-demonstrations`, from published main `90ad9e287631d4c331a00210a7d17b7838c42148` (PR607). The parent workspace's current product vision and the existing audience boundaries remain authoritative.

## Implemented

- The bridge immediately after the hero now states that the team is amplified, not replaced. Supporting copy preserves human judgment, relationships and decisions. The former icon/line equation is removed.
- Three spacious composite cards pair concise copy with explorable examples. PT titles are native Portuguese; the English role names remain small labels. Headings use black and gray. Layered neutral surfaces and paper depth replace the white document layout. Amber identifies a criterion that requires adjustment.
- Advisor: three selectable founder-supplied questions concern a BRL 30 million receivables portfolio, capital alternatives for a board meeting and a CCB proposal at CDI plus 3.2%. Responses identify the investigation and next step without inventing comparables or a funding recommendation.
- Analyst: human direction, 14 received documents, the Offroad execution stages and four sequential deliverables: formula-based model, board presentation, memorandum and debt schedule. Each piece has a source badge and opens a specific preview. The former EBITDA bridge is a minor model detail. The sequence ends with human review and decision.
- Connection: the explicitly fictional Fundo Horizonte I profile specifies ticket, tenor and collateral. An illustrative 80/100 score is accompanied by weights, fit rationale and a visible concentration exception: 18% against a 15% limit. A high score never overrides that exception or represents approval probability.
- All examples render visibly on the server. Finite entrance animations start on entry; the delivery sequence can be replayed. Reduced-motion preferences disable motion. Native buttons, details, explicit selected/expanded state and focus return support exploration without hover dependence.
- Main section headings below the offer also use their existing two-line black/gray hierarchy. The approved hero, photographs, navigation, audience depth and solution routes are retained.

## Reference use

[Forward](https://www.useforward.co/) informed the association between a fund profile, mandate criteria and the reasons for fit. [OffDeal](https://offdeal.io/) informed the visible relationship between a professional, platform execution and staged outputs. The founder's two screenshots were the visual reference. Public pages and publicly served styling were inspected without browser playback.

No competitor identity, buyer metrics, customer outcomes or assets were copied. OffDeal's M&A advisory positioning does not change Offroad's role as a platform for the three sides of debt capital work. No inference about an operational ML matching model is made.

## Boundaries

The new authored demonstration data lives in `packages/testing-fixtures/src/website-offer.ts`. Locale formatting is in `website-example.ts`. The small financial-model preview continues to use the existing fixture and financial-core calculations. The matching score is an explicitly authored fictional illustration, not a production matching evaluation, live lender appetite or a verified mandate.

No private application, authentication, authorization, database, financial-engine implementation, matching algorithm, provider, dependency, telemetry or hosting configuration changed. No certification, funding guarantee or customer performance claim was added. Existing current-versus-future institutional disclosures remain in place. Demo contact still prepares an email for the visitor to send.

## Verification

- 22 focused website tests passed, including both locale trees, the three advisor states, all four delivery previews, human-control copy, the creditor exception, illustrative score weights, section order and dual-tone headings.
- The web suite passed 106 files and 670 tests. Repository lint, typecheck, tests and all 43 production-build tasks passed.
- Read-only HTTP/content verification passed 42 localized public pages, five assets, sitemap, robots, unknown-route 404, login and the unauthenticated app redirect. Both home pages contain the four deliverables, human direction/review, fictional-profile disclosure and the conditional score status.
- Source-level accessibility review covered native controls, focus return, minimum control sizes, non-color state, visible server content and reduced motion. This is not browser interaction, responsive screenshot, screen-reader or actual-iPhone evidence.

Browser QA was requested asynchronously and is still unapproved. No browser visual acceptance is claimed. Exact-head Quality, Security and Vercel results and the immutable production receipt remain separate release gates.

## Release and rollback

Publish the exact checked source through the existing GitHub and official Vercel project. Do not initialize another hosting project. Verify production status, aliases, source-tree identity and affected HTTP routes before reporting publication complete.

Rollback baseline: main `90ad9e287631d4c331a00210a7d17b7838c42148`, production `dpl_9USssynKKMVWj6ZyFG9oTCVsMerG`. Containment is a reviewed public-site-only revert or promotion of that verified release. No database rollback is involved. The unrelated PR603 confirmation-ordering issue is outside this change.
