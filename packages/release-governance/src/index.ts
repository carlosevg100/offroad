/**
 * Controls how a case-engine version moves from observation to production.
 *
 * This package never decides whether a credit is good. It decides whether two executions are
 * comparable, whether a candidate regressed against a frozen baseline, and whether the evidence
 * required for a rollout transition exists. The database owns identity and approval; this pure
 * package owns the deterministic decision contract shared by the worker, tests and release tools.
 */
export const releaseGovernanceVersion = "2026.09.06-capability-ledger-v2";

export * from "./comparison";
export * from "./promotion";
export * from "./operating-controls";
export * from "./invalidation";
export * from "./human-intervention";
export * from "./trust-controls";
export * from "./control-register";
export * from "./trust-control-catalogue";
export * from "./capability-ledger";
export * from "./current-capability-ledger";
