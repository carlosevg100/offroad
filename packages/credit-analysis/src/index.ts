/**
 * @offroad/credit-analysis: the deterministic desk battery.
 *
 * The judgement a head of credit applies before writing, encoded as arithmetic with the
 * thresholds stated. The narrative layer consumes this; it never computes.
 */
/**
 * The version of the desk contract: what `analyzeCreditPosition` and `projectLeverageTrajectory`
 * publish. `desk-v2` (stage 19, second polish): a ratio over a zero denominator is published as
 * absent (null), listed in `absentRatios` with the gap, and never compared; the trajectory's peak is
 * null when a year's leverage in the cut case is absent. The case engine records it with every run.
 */
export const creditAnalysisVersion = "2026.09.27-desk-v2";

export * from "./absent-ratio";
export * from "./parse";
export * from "./analyze";
export * from "./trajectory";
export * from "./from-facts";
export * from "./questions";
export * from "./rating";
export * from "./stress";
export * from "./verdict";

export * from "./capital-decision-sufficiency";
