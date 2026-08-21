/**
 * @offroad/credit-analysis: the deterministic desk battery.
 *
 * The judgement a head of credit applies before writing, encoded as arithmetic with the
 * thresholds stated. The narrative layer consumes this; it never computes.
 */
export const creditAnalysisVersion = "2026.08.21-desk-v1";

export * from "./parse";
export * from "./analyze";
