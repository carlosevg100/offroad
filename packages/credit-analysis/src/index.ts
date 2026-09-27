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
 * `desk-v3` (stage 19, third polish): a negative working-capital need is published as working capital
 * released (`released` among the finding's values), never as a negative multiple of the ask; the
 * rating's score rounds half-up on the exact decimal; the reading of a rate, a covenant or a
 * coverage refuses text that is not a figure and reads a single dot that cannot group thousands as
 * the decimal point.
 */
export const creditAnalysisVersion = "2026.09.27-desk-v3";

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
