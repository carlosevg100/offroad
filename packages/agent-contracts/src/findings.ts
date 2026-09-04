import {z} from "zod";

import {dcmEvidenceRefSchema} from "./work-system";

/**
 * A finding is more than a line in a run log. It says what was identified, why it appeared now,
 * why it matters, what proves it, how sure the system is, what it affects, what would make it
 * wrong and what to test next. It also says whether a person asked for it or the system found
 * it on its own, which is the difference between an answer and unprompted intelligence.
 */
export const findingOriginSchema = z.enum(["requested", "discovered"]);
export const findingMaterialitySchema = z.enum(["blocking", "high", "medium", "low"]);
export const findingReviewStatusSchema = z.enum(["pending", "accepted", "rejected", "superseded"]);

export const findingsLedgerEntrySchema = z.object({
  schemaVersion: z.literal("findings-ledger.v1"),
  id: z.string().uuid(),
  runId: z.string().uuid(),
  projectId: z.string().uuid(),
  origin: findingOriginSchema,
  /** Which monitor or task produced it. A discovered finding always names its monitor. */
  producedBy: z.string().max(80),
  what: z.string().min(1).max(600),
  whyNow: z.string().min(1).max(600),
  whyMaterial: z.string().min(1).max(600),
  materiality: findingMaterialitySchema,
  evidence: z.array(dcmEvidenceRefSchema).max(50),
  /** Calculation trace ids. A finding that rests on a number without a trace is a claim, not a finding. */
  calculationTraceIds: z.array(z.string().max(120)).max(50),
  confidence: z.number().min(0).max(1),
  affectedDecisionIds: z.array(z.string().uuid()).max(50),
  affectedArtifactIds: z.array(z.string().uuid()).max(50),
  counterHypothesis: z.string().max(600),
  nextTest: z.string().max(600),
  reviewStatus: findingReviewStatusSchema,
  reviewedBy: z.string().uuid().nullable(),
  createdAt: z.string().datetime({offset: true}),
}).superRefine((finding, ctx) => {
  if (finding.origin === "discovered" && finding.reviewStatus === "accepted" && finding.reviewedBy === null) {
    ctx.addIssue({code: z.ZodIssueCode.custom, message: "a discovered finding is accepted only by a person"});
  }
  if (finding.materiality !== "low" && finding.evidence.length === 0 && finding.calculationTraceIds.length === 0) {
    ctx.addIssue({code: z.ZodIssueCode.custom, message: "a material finding carries evidence or a calculation"});
  }
});
export type FindingsLedgerEntry = z.infer<typeof findingsLedgerEntrySchema>;

/**
 * Every difference between two executions explains itself: which source, fact, assumption,
 * model version or pack changed, and which outputs moved because of it. A diff that cannot be
 * traced to a cause is the same defect as a failure without one.
 */
export const changeKindSchema = z.enum(["source", "fact", "assumption", "calculation", "model_version", "pack_version", "policy"]);

export const changeExplanationSchema = z.object({
  schemaVersion: z.literal("change-explanation.v1"),
  fromRunId: z.string().uuid(),
  toRunId: z.string().uuid(),
  changes: z.array(z.object({
    kind: changeKindSchema,
    reference: z.string().min(1).max(200),
    before: z.string().max(200).nullable(),
    after: z.string().max(200).nullable(),
    affectedOutputs: z.array(z.string().max(200)).min(1).max(200),
  })).max(500),
  /** Outputs that moved without a change above. Must be empty for the explanation to hold. */
  unexplainedOutputs: z.array(z.string().max(200)).max(200),
});
export type ChangeExplanation = z.infer<typeof changeExplanationSchema>;

export function changeExplanationHolds(explanation: ChangeExplanation): boolean {
  return explanation.unexplainedOutputs.length === 0;
}

/**
 * The survival test measures what was found and also what was missed and what was raised
 * without cause. A system that finds three things and misses two material ones is not ahead.
 */
export const benchmarkScorecardSchema = z.object({
  schemaVersion: z.literal("benchmark-scorecard.v1"),
  caseId: z.string().min(1).max(80),
  caseVersion: z.string().min(1).max(20),
  baselineModel: z.string().min(1).max(80),
  alphaFindings: z.number().int().min(0),
  materialOmissions: z.number().int().min(0),
  falseAlerts: z.number().int().min(0),
  numericErrors: z.number().int().min(0),
  unanchoredMaterialClaims: z.number().int().min(0),
  latencySeconds: z.number().min(0),
  costUsd: z.number().min(0),
  reviewedBy: z.array(z.string().uuid()).min(1),
});
export type BenchmarkScorecard = z.infer<typeof benchmarkScorecardSchema>;

/** The bar a case has to clear before anyone calls it homologated. */
export function scorecardPasses(card: BenchmarkScorecard): boolean {
  return card.numericErrors === 0
    && card.unanchoredMaterialClaims === 0
    && card.materialOmissions === 0
    && card.alphaFindings >= 2;
}
