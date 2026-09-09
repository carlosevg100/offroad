# Dependency security patch, 9 September 2026

Scope: five distinct GitHub advisories represented by eleven open Dependabot alerts on main, created at 01:07 UTC. Base: `4e61637`. No application behavior, feature flags, database, grants, or production configuration changed.

| Package | Before | Patched | Advisory |
|---|---|---|---|
| Next.js, root and web | 16.3.1 | 16.3.3 | [AVIF optimizer RCE](https://github.com/advisories/GHSA-2xp9-vwfh-vxw4), [Windows server RCE](https://github.com/advisories/GHSA-p293-qw3h-jr36) |
| sharp, override | 0.35.3 | 0.35.4 | [libheif vulnerabilities](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c) |
| js-yaml, override | 4.3.1 | 4.3.2 | [merge CPU exhaustion](https://github.com/advisories/GHSA-2883-xcg3-v3hh) |
| Vitest and mocker | 4.1.10 | 4.1.11 | [redirect mock arbitrary file read](https://github.com/advisories/GHSA-82fw-gwwq-j7x9) |

Patch versions verified against GitHub's advisory API. Next is an actual web runtime dependency; sharp is its optional image-processing dependency. The current js-yaml lockfile consumer is ESLint. Vitest and mocker are test tooling. Development labels on duplicate root/lockfile alerts do not prove lack of runtime exposure. This patch does not claim successful exploitation or platform-specific exploitability.

`pnpm audit --json` after installation reports zero vulnerabilities at every severity (868 dependencies). Node 24.19.0 and pnpm 10.32.1 used. Full `pnpm check` passed: 43/43 tasks for lint, typecheck, test and build; worker 400 tests, web 413 tests. Initial sandbox build stalled during optimized compilation; rerun with network/process access completed successfully using normal TLS, with no build configuration changes. CI, preview and production verification pending. Existing Dependabot PRs 561/563 (Next) and 562 (Vitest) overlap and were inspected without merging.

Controls: dependency and image scanning under the enterprise security program. No data flow, information class, or access boundary changes. Existing application regression tests are the compatibility check; no exploit payloads or synthetic production data introduced. Rollback restores previous manifests and lockfile but also reintroduces the advisories, so it requires explicit incident assessment rather than being considered a secure steady state.
