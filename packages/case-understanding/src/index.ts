/**
 * @offroad/case-understanding — how ready a case is, and whether what is written about it can
 * be traced.
 *
 * Both deterministic. Readiness is arithmetic over documents, exceptions, facts and gaps, shown
 * as five components with their own sentences rather than one number nobody can defend. The
 * auditor re-reads every material claim, finds the figures actually written in it, and refuses
 * any that does not appear in the facts or calculations it cites — which is what stops a
 * citation from being decoration.
 */
export const caseUnderstandingVersion = "2026.08.24-v2";

export * from "./readiness";
export * from "./audit";
export * from "./brief";
export * from "./desk-evidence";
export * from "./outcome";
export * from "./manifest";
