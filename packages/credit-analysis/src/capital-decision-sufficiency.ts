export type CapitalDecisionReviewItem = {
  id: string;
  domain: "source" | "assumption" | "contract" | "market" | "implementation" | "recommendation";
  status: "pending" | "supported" | "conditional" | "not_applicable";
  rationale: string;
  evidenceIds: string[];
};

/** Classifies review sufficiency only. This does not grant human approval or rank options. */
export function assessCapitalDecisionSufficiency(input: {
  hasAlternatives: boolean; numericalGaps: readonly string[]; materialGaps: readonly string[];
  reviewItems: readonly CapitalDecisionReviewItem[];
}) {
  const domains = ["source", "assumption", "contract", "market", "implementation", "recommendation"] as const;
  const ids = new Set<string>();
  for (const item of input.reviewItems) {
    if (!item.id.trim() || ids.has(item.id) || !domains.includes(item.domain) || !["pending", "supported", "conditional", "not_applicable"].includes(item.status)
      || !item.rationale.trim() || !Array.isArray(item.evidenceIds) || new Set(item.evidenceIds).size !== item.evidenceIds.length
      || (item.status === "supported" && !item.evidenceIds.length)) throw new Error("capital_decision_review_invalid");
    ids.add(item.id);
  }
  const pendingDomains = domains.filter(domain => !input.reviewItems.some(i => i.domain === domain)
    || input.reviewItems.some(i => i.domain === domain && i.status === "pending"));
  const unresolved = [...input.numericalGaps, ...input.materialGaps];
  return {version: "capital-decision-sufficiency.v1",
    status: !input.hasAlternatives ? "framed" as const : unresolved.length || pendingDomains.length ? "partial" as const : "prepared_for_human_review" as const,
    pendingDomains, unresolved, conditions: input.reviewItems.filter(i => i.status === "conditional").map(i => structuredClone(i)),
    reviewItems: input.reviewItems.map(i => structuredClone(i)), humanDecision: null,
    grantsApproval: false as const, grantsExecution: false as const};
}
