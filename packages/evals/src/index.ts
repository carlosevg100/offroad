/**
 * @offroad/evals — evaluation harness for the intelligence layer (P1 plan §14).
 *
 * Gold cases live in `packages/testing-fixtures/gold/<case>`; any extractor is
 * evaluated through an `ExtractionSnapshot`; metrics follow §14.2 and the
 * Markdown report is the artifact CI and reviewers read.
 */
export const evalsVersion = "2026.09.07-intent-router-gold-v1";

export * from "./gold";
export * from "./snapshot";
export * from "./metrics";
export * from "./report";
export * from "./compare";
export * from "./gold-rede-horizonte";
export * from "./rede-horizonte-anchor";
export * from "./accreditation";
export * from "./receivables-phase-three";
export * from "./gold-baseline";
export * from "./longitudinal-journeys";
export * from "./intent-gold";
export * from "./intent-router-gate";
