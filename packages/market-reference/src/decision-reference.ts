/** Metadata sufficiency for a decision reference, not a quote, price calculation or permission.
 * The caller supplies an authorized source-version snapshot and revalidates rights at use. */
export type DecisionMarketReference = {
  id: string; sourceVersionId: string; observationIds: string[];
  observedOn: string; validUntil: string; instrument: string; currency: string; indexer: string;
  subjectEntityId: string | null;
  kind: "market_context" | "indicative_terms" | "contracted_terms";
  rightsState: "eligible" | "unknown" | "revoked";
  qualifier: string;
};
export function reviewDecisionMarketReference(reference: DecisionMarketReference, target: {
  asOf: string; entityId: string; instrument: string; currency: string; indexer: string;
  selectedObservationIds: readonly string[];
}) {
  const date = (value: string) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  };
  if (!date(target.asOf) || !date(reference.observedOn) || !date(reference.validUntil)
    || reference.observedOn > reference.validUntil || !reference.id?.trim() || !reference.sourceVersionId?.trim()
    || !reference.qualifier?.trim() || !Array.isArray(reference.observationIds) || reference.observationIds.length > 256
    || new Set(reference.observationIds).size !== reference.observationIds.length
    || !["market_context", "indicative_terms", "contracted_terms"].includes(reference.kind)
    || !["eligible", "unknown", "revoked"].includes(reference.rightsState)) throw new Error("decision_market_reference_invalid");
  const reasons: string[] = [];
  if (reference.rightsState !== "eligible") reasons.push("rights_not_eligible");
  if (reference.observedOn > target.asOf) reasons.push("future_observation");
  if (reference.validUntil < target.asOf) reasons.push("expired_reference");
  for (const field of ["instrument", "currency", "indexer"] as const) if (reference[field] !== target[field]) reasons.push(`${field}_mismatch`);
  if (reference.kind !== "market_context" && reference.subjectEntityId !== target.entityId) reasons.push("entity_specific_terms_required");
  if (!reference.observationIds.length || reference.observationIds.some(id => !target.selectedObservationIds.includes(id))) reasons.push("selected_observation_missing");
  return {version: "decision-market-reference.v1", reference: structuredClone(reference),
    status: reasons.length ? "unusable_for_comparison" as const : reference.kind === "market_context" ? "context_only" as const : "terms_for_review" as const,
    reasons, grantsAccess: false as const, confirmsFundingAvailability: false as const,
    requiresLiveRightsCheck: true as const};
}
