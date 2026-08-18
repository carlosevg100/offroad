/**
 * @offroad/document-intelligence — pure core of the P1 pipeline.
 *
 * Contracts (document layers, profiles, extraction candidates, exceptions,
 * case brief), the deterministic anchor verifier and the value normalizer.
 * No I/O and no model calls live here: the worker, the evals CLI and the tests
 * host these functions (P1 plan §5, §7).
 */
export const documentIntelligenceVersion = "2026.08.18-core-v1";

export * from "./schemas";
export * from "./text";
export * from "./layer-index";
export * from "./verifier";
