/**
 * @offroad/credit-ontology — what the intelligence layer looks for.
 *
 * Pure data + small pure functions, no I/O: document taxonomy, field catalog,
 * canonical chart of accounts, period/entity model, evidence ranks, materiality
 * and auto-accept policy, reconciliation rule catalog and financial definitions.
 * Changes are made by PR with evals (P1 plan, part 6); nothing here is read
 * from prompts at runtime — prompts are rendered *from* this package.
 */
export const ontologyVersion = "2026.08.18-v1";

export * from "./evidence";
export * from "./documents";
export * from "./periods";
export * from "./fields";
export * from "./chart-of-accounts";
export * from "./materiality";
export * from "./reconciliation-rules";
export * from "./definitions";
