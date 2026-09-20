import {createHash} from "node:crypto";
import {z} from "zod";
import {assessCapitalDecisionSufficiency} from "@offroad/credit-analysis";
import {reviewCapitalAlternativeConditions} from "@offroad/deal-structure";
import {instrument, instrumentSchema} from "@offroad/instrument-catalogue";
import {reviewDecisionMarketReference} from "@offroad/market-reference";
import {capitalDecisionCompositionInputSchema, composeCapitalStructureDecision} from "./capital-decision-composition";
import {adoptedDefinedRatioInputSchema, calculateAdoptedDefinedRatio} from "./adopted-defined-ratio";

const key = z.string().trim().min(1).max(160); const text = z.string().trim().min(1).max(2000);
const refs = z.array(z.uuid()).max(256);
const condition = z.strictObject({description: text, basisIds: refs});
export const capitalDecisionReviewInputSchema = z.strictObject({
  composition: capitalDecisionCompositionInputSchema,
  asOf: z.iso.date(),
  ratios: z.array(z.strictObject({id: key, alternativeId: key, input: adoptedDefinedRatioInputSchema})).max(128),
  alternativeConditions: z.array(z.strictObject({id: key, rationale: text, pros: z.array(text).max(30), cons: z.array(text).max(30),
    assumptions: z.array(text).max(50), security: z.array(condition).max(64), covenants: z.array(condition).max(64),
    conditionsPrecedent: z.array(condition.extend({owner: text.nullable()})).max(64),
    instrument: instrumentSchema.nullable(), indexer: key.nullable(), marketReferenceIds: z.array(key).max(64)})).max(20),
  marketReferences: z.array(z.strictObject({id: key, sourceVersionId: z.uuid(), observationIds: refs,
    observedOn: z.iso.date(), validUntil: z.iso.date(), instrument: instrumentSchema, currency: z.string().regex(/^[A-Z]{3}$/), indexer: key,
    subjectEntityId: z.uuid().nullable(), kind: z.enum(["market_context", "indicative_terms", "contracted_terms"]),
    rightsState: z.enum(["eligible", "unknown", "revoked"]), qualifier: text})).max(128),
  reviewItems: z.array(z.strictObject({id: key, domain: z.enum(["source", "assumption", "contract", "market", "implementation", "recommendation"]),
    status: z.enum(["pending", "supported", "conditional", "not_applicable"]), rationale: text, evidenceIds: z.array(key).max(256)})).max(128),
}).superRefine((i, c) => {
  for (const rows of [i.ratios, i.alternativeConditions, i.marketReferences, i.reviewItems]) if (new Set(rows.map(r => r.id)).size !== rows.length) c.addIssue({code: "custom", message: "Duplicate review identity"});
});

/** Combines calculation and evidence-bearing review without manufacturing an approval.
 * The instrument catalogue supplies identity only; old scores, sizes and time defaults are
 * deliberately not used. Rights metadata never authorizes access or model transmission. */
export function prepareCapitalDecisionReview(raw: unknown) {
  const input = capitalDecisionReviewInputSchema.parse(raw);
  const composition = composeCapitalStructureDecision(input.composition);
  const alternatives = new Map(composition.alternatives.map(a => [a.id, a]));
  const used = new Map(composition.contributions.map(e => [e.decisionId, e]));
  const materialGaps: string[] = [];
  const ratios = input.ratios.map(row => {
    const alternative = alternatives.get(row.alternativeId); if (!alternative) throw new Error("capital_review_unknown_alternative");
    const r = calculateAdoptedDefinedRatio(row.input); const a = alternative.projection;
    if (r.scope.workId !== composition.workId || r.scope.purpose !== composition.purpose || r.scope.versionId !== a.scope.versionId
      || r.basisFingerprint !== a.basisFingerprint || r.entityId !== a.entityId || r.perimeter !== a.perimeter || r.currency !== a.currency
      || r.scenario !== a.scenario || r.measurementDate < a.openingDate || r.measurementDate > a.endDate) throw new Error("capital_review_ratio_context_mismatch");
    r.contributions.forEach(e => used.set(e.decisionId, e));
    if (r.status !== "defined_boundary_calculated") materialGaps.push(`ratio:${row.id}:incomplete`);
    if (r.calculation?.satisfiesDefinedBoundary === false) materialGaps.push(`ratio:${row.id}:outside_defined_boundary`);
    return {id: row.id, alternativeId: row.alternativeId, result: r};
  });
  const market = new Map(input.marketReferences.map(r => [r.id, r])); const referencedMarket = new Set<string>();
  const conditions = input.alternativeConditions.map(a => {
    const alternative = alternatives.get(a.id); if (!alternative) throw new Error("capital_review_unknown_alternative");
    const review = reviewCapitalAlternativeConditions(a, [...used.keys()]);
    if (review.status === "basis_required") materialGaps.push(`conditions:${a.id}:basis_required`);
    if ((a.instrument === null) !== (a.indexer === null)) throw new Error("capital_review_instrument_context_required");
    const observations = alternative.projection.contributions.flatMap(e => e.observationId ? [e.observationId] : []);
    const references = a.marketReferenceIds.map(id => {
      const r = market.get(id); if (!r || !a.instrument || !a.indexer) throw new Error("capital_review_market_reference_missing");
      referencedMarket.add(id);
      const result = reviewDecisionMarketReference(r, {asOf: input.asOf, entityId: alternative.projection.entityId,
        instrument: a.instrument, currency: alternative.projection.currency, indexer: a.indexer, selectedObservationIds: observations});
      if (result.status === "unusable_for_comparison") materialGaps.push(`market:${a.id}:${id}:unusable`);
      return result;
    });
    if (a.instrument && !references.some(r => r.status === "terms_for_review")) materialGaps.push(`market:${a.id}:terms_unconfirmed`);
    const profile = a.instrument ? instrument(a.instrument) : null;
    return {...review, instrumentIdentity: profile ? {id: profile.id, labels: profile.labels, issuerRole: profile.issuerRole} : null, references};
  });
  for (const a of alternatives.values()) if (!conditions.some(c => c.alternative.id === a.id)) materialGaps.push(`conditions:${a.id}:missing`);
  if (input.marketReferences.some(r => !referencedMarket.has(r.id))) throw new Error("capital_review_unused_market_reference");
  const evidence = new Set([...used.keys(), ...ratios.map(r => r.id), ...input.marketReferences.map(r => r.id), composition.fingerprint]);
  for (const item of input.reviewItems) if (item.evidenceIds.some(id => !evidence.has(id))) throw new Error("capital_review_evidence_missing");
  const sufficiency = assessCapitalDecisionSufficiency({hasAlternatives: alternatives.size > 0,
    numericalGaps: composition.gaps.map(g => `${g.subjectId ?? "decision"}:${g.code}`), materialGaps, reviewItems: input.reviewItems});
  const payload = {schemaVersion: "capital-decision-review.v1" as const, composition, ratios, conditions, sufficiency,
    contributions: [...used.values()], requestedDecision: composition.question,
    certifiesContractualCompliance: false as const, confirmsFundingAvailability: false as const,
    grantsApproval: false as const, grantsExecution: false as const};
  return {...payload, fingerprint: createHash("sha256").update(JSON.stringify(payload)).digest("hex")};
}
