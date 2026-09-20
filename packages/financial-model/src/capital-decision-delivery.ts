import {createHash} from "node:crypto";
import {z} from "zod";
import {financialCoreVersion} from "@offroad/financial-core";
import {capitalDecisionReviewInputSchema, prepareCapitalDecisionReview} from "./capital-decision-review";

const key = z.string().min(1); const decimal = z.string().regex(/^-?\d+(?:\.\d+)?$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const rowSchema = z.strictObject({periodId: key, startDate: z.iso.date(), endDate: z.iso.date(),
  openingAvailable: decimal, openingRestricted: decimal, cashBeforeFinancing: decimal,
  netFinancingAvailable: decimal, netFinancingRestricted: decimal, netCapitalAvailable: decimal, netCapitalRestricted: decimal,
  closingAvailable: decimal, closingRestricted: decimal, availableShortfallAtPeriodEnd: decimal,
  restrictedShortfallAtPeriodEnd: decimal, closingDebt: decimal, capitalMovementIds: z.array(key), financingEventIds: z.array(key),
  instrumentStocks: z.array(z.strictObject({instrumentId: key, closingPrincipal: decimal})),
});
const summarySchema = z.strictObject({closingAvailable: decimal, closingRestricted: decimal,
  minimumAvailableAtMeasuredDates: decimal, maximumAvailableShortfallAtMeasuredDates: decimal,
  minimumRestrictedAtMeasuredDates: decimal, maximumRestrictedShortfallAtMeasuredDates: decimal,
  closingDebt: decimal, nominalFinancingCostInHorizon: decimal,
  lifetimeCostCompared: z.literal(false), intraperiodLiquidityVerified: z.literal(false)});
const projectionSchema = z.strictObject({entityId: z.uuid(), perimeter: key, currency: z.string().regex(/^[A-Z]{3}$/),
  openingDate: z.iso.date(), endDate: z.iso.date(), scenario: key, basisFingerprint: hash, calculationFingerprint: hash,
  rows: z.array(rowSchema).nullable(), summary: summarySchema.nullable(),
  contributionIds: z.array(z.uuid()), hypothesisIds: z.array(z.uuid()),
});
export const capitalDecisionDeliveryInputSchema = z.strictObject({review: capitalDecisionReviewInputSchema,
  /** A domain packet is not an external publication. Audience access is revalidated by execution. */
  material: z.strictObject({requested: z.boolean(), audience: z.literal("authorized_work_participants")}),
});
export const capitalDecisionDeliveryOutputSchema = z.strictObject({
  schemaVersion: z.literal("capital-decision-delivery.v1"), procedureId: z.literal("prepare-capital-structure-decision"),
  workId: z.uuid(), purpose: key, question: key, objectives: z.array(key), asOf: z.iso.date(),
  status: z.enum(["framed", "partial", "prepared_for_human_review"]),
  alternatives: z.array(z.strictObject({id: key, label: key, kind: z.enum(["maintain", "change", "defer", "no_financing"]),
    rationale: key, conditions: z.array(key), disconfirmers: z.array(key), projection: projectionSchema})),
  sensitivities: z.array(z.strictObject({id: key, label: key, baseAlternativeId: key, rationale: key, projection: projectionSchema,
    changedContributions: z.array(z.strictObject({fieldPath: key, beforeDecisionId: z.uuid().nullable(), afterDecisionId: z.uuid().nullable()}))})),
  alternativeConditions: capitalDecisionReviewInputSchema.shape.alternativeConditions,
  marketReferences: capitalDecisionReviewInputSchema.shape.marketReferences,
  marketAssessments: z.array(z.strictObject({alternativeId: key, referenceId: key,
    status: z.enum(["unusable_for_comparison", "context_only", "terms_for_review"]), reasons: z.array(key), requiresLiveRightsCheck: z.literal(true)})),
  reviewItems: capitalDecisionReviewInputSchema.shape.reviewItems,
  ratios: z.array(z.strictObject({id: key, alternativeId: key, ratioId: key, definitionKind: z.enum(["managerial", "contractual"]),
    measurementDate: z.iso.date(), fingerprint: hash, numerator: decimal.nullable(), denominator: decimal.nullable(),
    limit: decimal.nullable(), comparator: z.enum(["lt", "lte", "gt", "gte"]).nullable(),
    displayedRatio: decimal.nullable(), displayedMargin: decimal.nullable(), satisfiesDefinedBoundary: z.boolean().nullable(),
    pendingReviews: z.array(key), contributionIds: z.array(z.uuid())})),
  recommendation: z.strictObject({alternativeId: key, rationale: key, basisDecisionIds: z.array(z.uuid()), conditions: z.array(key),
    wouldChangeIf: z.array(key), status: z.literal("proposed_judgment")}).nullable(),
  maintenanceExclusion: z.strictObject({reason: key, basisDecisionIds: z.array(z.uuid())}).nullable(),
  informationGaps: z.array(z.strictObject({subjectId: key.nullable(), code: key, reason: key})),
  unresolved: z.array(key), pendingReviewDomains: z.array(key),
  conditionalReviews: z.array(z.strictObject({id: key, domain: key, rationale: key, evidenceIds: z.array(key)})),
  nextRequirements: z.array(key),
  material: z.strictObject({requested: z.boolean(), audience: z.literal("authorized_work_participants"),
    state: z.enum(["not_requested", "prepared_for_review"]), published: z.literal(false)}),
  provenance: z.strictObject({inputFingerprint: hash, reviewFingerprint: hash, financialCoreVersion: key,
    contributionIds: z.array(z.uuid()), observationIds: z.array(z.uuid()), definitionVersionIds: z.array(z.uuid()),
    requiresPinnedInputAndManifest: z.literal(true)}),
  humanDecision: z.null(), confirmsFundingAvailability: z.literal(false), certifiesContractualCompliance: z.literal(false),
  grantsExecution: z.literal(false), grantsPublication: z.literal(false), fingerprint: hash,
});

/** A typed decision packet. Recomputes the domain, does not narrate invented amounts, grant
 * access or persist an approval. The execution contract must retain input bytes and its
 * pinned manifest: the packet's fingerprints are references, not a self-contained archive. */
export function prepareCapitalDecisionDelivery(raw: unknown) {
  const input = capitalDecisionDeliveryInputSchema.parse(raw);
  const review = prepareCapitalDecisionReview(input.review); const c = review.composition;
  const project = (p: typeof c.alternatives[number]["projection"]) => ({entityId: p.entityId, perimeter: p.perimeter,
    currency: p.currency, openingDate: p.openingDate, endDate: p.endDate, scenario: p.scenario,
    basisFingerprint: p.basisFingerprint, calculationFingerprint: p.fingerprint,
    rows: p.cash?.rows ?? null, summary: p.cash?.summary ?? null,
    contributionIds: p.contributions.map(e => e.decisionId), hypothesisIds: p.contributions.filter(e => e.kind === "hypothesis").map(e => e.decisionId)});
  const payload = {schemaVersion: "capital-decision-delivery.v1", procedureId: "prepare-capital-structure-decision",
    workId: c.workId, purpose: c.purpose, question: c.question, objectives: c.objectives, asOf: review.asOf,
    status: review.sufficiency.status,
    alternatives: c.alternatives.map(a => ({id: a.id, label: a.label, kind: a.kind, rationale: a.rationale,
      conditions: a.conditions, disconfirmers: a.disconfirmers, projection: project(a.projection)})),
    sensitivities: c.sensitivities.map(s => ({id: s.id, label: s.label, baseAlternativeId: s.baseAlternativeId, rationale: s.rationale,
      projection: project(s.projection), changedContributions: s.changedContributions.map(v => ({fieldPath: v.fieldPath,
        beforeDecisionId: v.beforeDecisionId, afterDecisionId: v.afterDecisionId}))})),
    alternativeConditions: input.review.alternativeConditions, marketReferences: input.review.marketReferences,
    marketAssessments: review.conditions.flatMap(a => a.references.map(r => ({alternativeId: a.alternative.id,
      referenceId: r.reference.id, status: r.status, reasons: r.reasons, requiresLiveRightsCheck: true}))),
    reviewItems: input.review.reviewItems,
    ratios: review.ratios.map(r => ({id: r.id, alternativeId: r.alternativeId, ratioId: r.result.ratioId,
      definitionKind: r.result.definitionKind, measurementDate: r.result.measurementDate, fingerprint: r.result.fingerprint,
      numerator: r.result.calculation?.operands.numerator ?? null, denominator: r.result.calculation?.operands.denominator ?? null,
      limit: r.result.calculation?.operands.limit ?? null, comparator: r.result.calculation?.operands.comparator ?? null,
      displayedRatio: r.result.calculation?.ratio ?? null, displayedMargin: r.result.calculation?.margin ?? null,
      satisfiesDefinedBoundary: r.result.calculation?.satisfiesDefinedBoundary ?? null, pendingReviews: [...r.result.pendingReviews],
      contributionIds: r.result.derivedDependencies})),
    recommendation: c.recommendation, maintenanceExclusion: c.maintenanceExclusion,
    informationGaps: [...c.gaps, ...review.ratios.flatMap(r => r.result.gaps.map(g => ({subjectId: r.id, code: g.operand, reason: g.reason})))],
    unresolved: review.sufficiency.unresolved, pendingReviewDomains: review.sufficiency.pendingDomains,
    conditionalReviews: review.sufficiency.conditions.map(r => ({id: r.id, domain: r.domain, rationale: r.rationale, evidenceIds: r.evidenceIds})),
    nextRequirements: c.status === "framed" ? c.framing.numericalComparisonRequires : review.sufficiency.pendingDomains,
    material: {...input.material, state: input.material.requested ? "prepared_for_review" : "not_requested", published: false},
    provenance: {inputFingerprint: createHash("sha256").update(JSON.stringify(input)).digest("hex"), reviewFingerprint: review.fingerprint,
      financialCoreVersion, contributionIds: review.contributions.map(e => e.decisionId),
      observationIds: [...new Set(review.contributions.flatMap(e => e.observationId ? [e.observationId] : []))],
      definitionVersionIds: [...new Set(review.contributions.map(e => e.dimensions.definitionVersionId))], requiresPinnedInputAndManifest: true},
    humanDecision: null, confirmsFundingAvailability: false, certifiesContractualCompliance: false,
    grantsExecution: false, grantsPublication: false};
  return capitalDecisionDeliveryOutputSchema.parse({...payload, fingerprint: createHash("sha256").update(JSON.stringify(payload)).digest("hex")});
}
