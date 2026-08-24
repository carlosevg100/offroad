/**
 * Retrieval that fails closed.
 *
 * Case material is scoped by organization and opportunity/session, house playbook material by
 * an approved version, mandate notes by a prior structured hard-filter pass, and precedents by
 * explicit authorization plus anonymization and governance. The package retrieves evidence; it
 * never turns similarity into a fact or a credit decision.
 */
export * from "./schema";
export * from "./chunks";
export * from "./retrieve";
