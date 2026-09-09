import type {InformationGap, ReconciledFact, ReconciliationException, TracedCalculation} from "@offroad/reconciliation";

export type BriefEvidenceInput = {
  facts: readonly ReconciledFact[];
  calculations: readonly TracedCalculation[];
  gaps?: readonly InformationGap[] | undefined;
  exceptions?: readonly ReconciliationException[] | undefined;
};

export type BriefEvidence = {
  id: string;
  kind: "fact" | "calculation" | "gap" | "review";
  description: string;
  /** Only factual values and deterministic calculations may support financial magnitudes. */
  numericValue: string | null;
  verified: boolean;
};

/** One citation vocabulary for author, numerical audit and independent semantic review. */
export function buildBriefEvidenceCatalog(input: BriefEvidenceInput): Map<string, BriefEvidence> {
  const catalog = new Map<string, BriefEvidence>();
  const ambiguous = new Set<string>();
  const add = (entry: BriefEvidence) => {
    if (ambiguous.has(entry.id)) return;
    const existing = catalog.get(entry.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(entry)) {
      catalog.delete(entry.id);
      ambiguous.add(entry.id);
    } else catalog.set(entry.id, entry);
  };
  for (const fact of input.facts) {
    const entry = {
      kind: "fact" as const,
      description: `${fact.value} | ${fact.accepted.informationClass} | period: ${fact.key.periodEnd ?? "not specified"} | entity: ${fact.key.entityName ?? "not specified"} | source: ${fact.accepted.sourceDocument}${fact.disputed ? ` | DISPUTADO: competing values ${fact.conflicts.map(item => item.candidate.normalizedValue).join(", ")} remain unresolved` : ""}`,
      numericValue: fact.valueType === "number" ? fact.value : null,
      verified: fact.accepted.anchorVerified,
    };
    add({id: fact.key.fieldPath, ...entry});
    if (fact.key.periodEnd) add({id: `${fact.key.fieldPath}|${fact.key.periodEnd}`, ...entry});
  }
  for (const calculation of input.calculations) {
    add({id: calculation.id, kind: "calculation", description: `${calculation.value} | deterministic calculation | dependency references (not additional citation ids): ${calculation.inputs.join(", ")} | warnings: ${calculation.warnings.join("; ") || "none"}`, numericValue: calculation.value, verified: true});
  }
  for (const gap of input.gaps ?? []) {
    add({id: `gap:${gap.id}`, kind: "gap", numericValue: null, verified: true,
      description: `CURRENT ANALYSIS REQUIREMENT NOT SATISFIED. Reference: ${gap.reference}. ${gap.title}. Reason for requesting information: ${gap.description}. Scope: current analyzed and classified inputs only. This does not prove that a document does not exist, that a fact is false, or that every page was read. No financial value or threshold is established by this requirement.`});
  }
  if (input.exceptions !== undefined) {
    add({id: "review:reconciliation", kind: "review", numericValue: null, verified: true,
      description: `Current reconciliation run reported ${input.exceptions.length} open exceptions. ${input.exceptions.map(item => `${item.ruleId}: ${item.title}; ${item.description}`).join(" | ")} Scope: checks executed on adopted inputs only. Zero reported exceptions does not prove that all documents agree or that the data room is complete. This review establishes no new financial value.`});
  }
  return catalog;
}
