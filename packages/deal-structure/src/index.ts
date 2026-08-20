/**
 * @offroad/deal-structure — how much the company can carry, which wall it hits first, and the
 * shape of the paper that follows.
 *
 * Deterministic. Capacity is arithmetic over reconciled facts against three independent limits
 * — cash flow, collateral, market — and the answer is the lowest of them, with the binding one
 * named, because naming it turns a rejection into a structure conversation. The term sheet is
 * indicative by construction and carries no price: the desk does not know what an investor
 * will charge, and inventing a rate is the fastest way to lose a company's trust.
 */
export const dealStructureVersion = "2026.08.20-v1";

export * from "./capacity";
export * from "./termsheet";
export * from "./market";
