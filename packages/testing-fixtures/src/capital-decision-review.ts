import {capitalDecisionCompositionFixture} from "./capital-decision-composition";
import {adoptedDefinedRatioFixture} from "./adopted-defined-ratio";

/** Synthetic review preparation. None of these statements is a human approval. */
export function capitalDecisionReviewFixture() {
  const f = capitalDecisionCompositionFixture();
  type ReviewItem = {id: string; domain: "source" | "assumption" | "contract" | "market" | "implementation" | "recommendation";
    status: "pending" | "supported" | "conditional" | "not_applicable"; rationale: string; evidenceIds: string[]};
  type Reference = {id: string; sourceVersionId: string; observationIds: string[]; observedOn: string; validUntil: string;
    instrument: "ccb"; currency: string; indexer: string; subjectEntityId: string | null;
    kind: "market_context" | "indicative_terms" | "contracted_terms"; rightsState: "eligible" | "unknown" | "revoked"; qualifier: string};
  const alternativeConditions = f.input.alternatives.map(a => ({id: a.id, rationale: "Synthetic comparative rationale",
    pros: ["Explicit financial comparison"], cons: ["Contract and implementation review required"], assumptions: ["Synthetic adopted forecast"],
    security: [] as {description: string; basisIds: string[]}[], covenants: [] as {description: string; basisIds: string[]}[],
    conditionsPrecedent: [] as {description: string; basisIds: string[]; owner: string | null}[],
    instrument: null as "ccb" | null, indexer: null as string | null, marketReferenceIds: [] as string[]}));
  const reviewItems: ReviewItem[] = (["source", "assumption", "contract", "market", "implementation", "recommendation"] as const)
    .map(domain => ({id: `review-${domain}`, domain, status: "pending", rationale: "Synthetic review remains pending", evidenceIds: []}));
  return {...f, input: {composition: f.input, asOf: "2027-01-01",
    ratios: [] as {id: string; alternativeId: string; input: ReturnType<typeof adoptedDefinedRatioFixture>["input"]}[],
    alternativeConditions, marketReferences: [] as Reference[], reviewItems}};
}
