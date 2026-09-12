# Public website replacement

## Scope and authority

Founder approved implementing the Studio direction and replacing the existing public site on offroad.capital. The implementation branch is isolated from ongoing application work and starts from main da3157b74ea93b49212774d0337931567ec695b7. No unrelated pull request, worker, financial capability, database migration, authorization policy or release flag is part of this change.

## Experience

Twenty-one public pages in each of PT-BR and EN: home, solutions index and three solutions, audiences index and three audience pages, use-case index and six illustrative cases, About, Security, demonstration request, website privacy and terms. Language switching preserves page identity. All copy lives in the two existing message catalogs. The approved hero has no kicker, uses the genuine circle-and-wordmark asset, left-aligned copy in a vertically centered composition, a dark city image, two CTAs and the finance-professional signature. Motion can be paused and respects reduced-motion preferences.

User-supplied approved concept assets were reused. The English dual-monitor illustration was localized with the built-in image tool, preserving the original composition. All financial examples in images and cases are explicitly illustrative. The offer comparison is a qualitative interactive explanation, not a live model or recommendation. No customer result, funding endorsement, investor logo or productivity metric was fabricated.

## Contact limitation

The repository's configured business address is hello@offroad.capital. Production environment names were inspected without displaying values; no form delivery provider is configured. The founder was asked to confirm the contact destination. Until an approved receiver exists, the form explicitly prepares an email in the visitor's email application and never claims server receipt. The visitor must send the message. A direct mail link remains available. No lead database, email provider, additional subprocessor, financial upload or new secret was added. Mailbox ownership/deliverability and a server-received lead workflow are not proven by this release.

## Security and privacy review

Public claims are narrow descriptions of existing controls: organization-scoped database policies and server authorization, private document storage, limited web telemetry and development scanning. Evidence includes the existing Supabase migrations and application access/storage code, apps/web/src/instrumentation-client.ts, apps/web/src/lib/observability/privacy.ts, and .github/workflows/security.yml. These are architectural/process descriptions, not universal production assurance. SOC 2 Type II is explicitly a program objective and there is no current report. No SSO, mandatory MFA, zero retention, no-training-all-providers, location guarantee or certification is claimed.

No access-control change. Existing app and auth routes retain precedence; unknown catch-all paths fail closed. Search indexing is enabled only for the public allowlist, with exact-path robots rules and per-page metadata. Application metadata retains noindex. Public form values are not placed in site URLs, persisted by the form or sent to application servers. Existing telemetry configuration is unchanged.

## Validation and operations

The first coherent local preview was opened before expanding the site. Static source review covers responsive layout, semantic landmarks, heading hierarchy, accessible labels, keyboard focus, native field validation, current-language routes, reduced motion and the motion pause control. Browser visual QA was not performed because the active Sites skill prohibits unsolicited browser testing. Existing repository CI browser gates remain required.

The focused website suite covers 42 unique localized routes, unknown/private route rejection, public-only sitemap and robots, server rendering of every catalog/detail page in both languages, metadata equivalents, exact approved hero copy, dash-free new communication, explicit SOC 2 limits and honest contact wording. The read-only verification script checks all 42 HTTP pages, five assets, sitemap, robots and a 404 boundary. Full pnpm check and exact-head remote quality/security/deployment checks are required before promotion. Final receipts are recorded in the release ledgers, not inferred from this design description.

Rollback: revert the single website merge commit through a reviewed PR and redeploy the existing Vercel project. No data rollback or migration is needed. A prior Vercel deployment remains a containment option if a public-site outage requires immediate recovery. Preserve unrelated subsequent application releases.
