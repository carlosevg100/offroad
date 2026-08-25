/**
 * @offroad/evals — evaluation harness for the intelligence layer (P1 plan §14).
 *
 * Gold cases live in `packages/testing-fixtures/gold/<case>`; any extractor is
 * evaluated through an `ExtractionSnapshot`; metrics follow §14.2 and the
 * Markdown report is the artifact CI and reviewers read.
 */
export const evalsVersion = "2026.08.18-v1";

export * from "./gold";
export * from "./snapshot";
export * from "./metrics";
export * from "./report";
export * from "./compare";
export * from "./gold-rede-horizonte";
export * from "./rede-horizonte-anchor";
export * from "./accreditation";
