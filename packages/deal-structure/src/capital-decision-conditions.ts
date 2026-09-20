import type {StructureAlternativeDraft} from "./alternatives";

/** The same evidence-bearing structure fields used by deal design, without importing its
 * sizing defaults, price estimates, ranking or opportunity/intake requirements. */
export type CapitalAlternativeConditions = Pick<StructureAlternativeDraft, "id" | "rationale" | "pros" | "cons" | "assumptions" | "security" | "covenants" | "conditionsPrecedent">;
export function reviewCapitalAlternativeConditions(input: CapitalAlternativeConditions, selectedBasisIds: readonly string[]) {
  const references = [...input.security, ...input.covenants, ...input.conditionsPrecedent];
  if (!input.id.trim() || !input.rationale.trim() || references.some(r => !r.description.trim()
    || new Set(r.basisIds).size !== r.basisIds.length || r.basisIds.some(id => !selectedBasisIds.includes(id)))) throw new Error("capital_alternative_condition_basis_mismatch");
  const ungrounded = references.filter(r => !r.basisIds.length).map(r => r.description);
  return {version: "capital-alternative-conditions.v1", alternative: structuredClone(input),
    status: ungrounded.length ? "basis_required" as const : "prepared_for_review" as const,
    ungrounded, certifiesLegalEligibility: false as const, confirmsImplementation: false as const};
}
