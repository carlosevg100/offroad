/**
 * The governed execution rail for an Offroad case.
 *
 * Domain packages own the work. This package owns the order, contracts, budgets and evidence
 * that the work actually ran. No stage can silently disappear and no later stage can run after
 * an invalid or over-budget predecessor.
 */
export const caseRunnerVersion = "2026.08.29-v5";

export * from "./runner";
export * from "./subgraph";
