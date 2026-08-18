# Rede Horizonte — synthetic acceptance data room

**Everything here is synthetic.** Rede Horizonte Alimentos S.A., its people, auditors, numbers
and documents were generated for product validation; they are not customer data and must not be
presented as such.

These eight files are the document-first intake acceptance package. The application recognizes
them by exact filename **and** SHA-256 (`packages/testing-fixtures/src/document-intake.ts`);
`document-intake.test.ts` recomputes the hashes from these files so any drift breaks the build.
The Playwright suite (`apps/web/e2e`) uploads them against a local Supabase stack in CI.

If you regenerate the package (generators live outside the repository under
`.codex-build/rede-horizonte-realistic/`), update `redeHorizonteFileHashes` and this folder
together. The answer key (`02_GABARITO_OFFROAD`) is intentionally **not** versioned here.
