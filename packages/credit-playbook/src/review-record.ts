import {z} from "zod";

/**
 * An independent review performed by a model, on record. Independent means separate from the
 * implementation: the reviewer goes back to the sources, recalculates the numbers, tests the
 * definitions and the exceptions, runs the adversarial mutations, checks consistency across runs
 * and, for outputs, the advantage over the generalist baseline. It carries reviewer, run,
 * evidence, fingerprint and result. It is never a human approval, and the schema says so.
 */
export const reviewSubjectKindSchema = z.enum(["answer_key", "method", "parameter", "executor", "output"]);
export const reviewEvidenceResultSchema = z.enum(["confirmed", "corrected", "unverifiable", "limitation"]);

export const aiIndependentReviewSchema = z.object({
  schemaVersion: z.literal("ai-independent-review.v1"),
  reviewId: z.string().regex(/^[a-z0-9][a-z0-9_.-]{2,120}$/),
  kind: z.literal("ai_independent_review"),
  humanApproval: z.literal(false),
  reviewer: z.object({
    provider: z.string().min(1),
    model: z.string().min(1),
    effort: z.string().min(1),
    tool: z.string().min(1),
  }).strict(),
  subject: z.object({
    kind: reviewSubjectKindSchema,
    id: z.string().min(1),
    version: z.string().min(1),
    /** sha256 of the exact bytes reviewed (subject plus the information base it was reviewed against). */
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict(),
  run: z.object({
    id: z.string().min(1),
    startedAt: z.string().datetime(),
    finishedAt: z.string().datetime(),
    commit: z.string().regex(/^[a-f0-9]{7,40}$/).optional(),
    costUsd: z.number().nonnegative().optional(),
  }).strict(),
  checks: z.object({
    sourcesRevisited: z.boolean(),
    numbersRecalculated: z.boolean(),
    definitionsTested: z.boolean(),
    exceptionsTested: z.boolean(),
    adversarialTested: z.boolean(),
    consistencyTested: z.boolean(),
    /** Null when the subject is not an output measured against a baseline. */
    baselineAdvantage: z.boolean().nullable(),
  }).strict(),
  evidence: z.array(z.object({
    claim: z.string().min(1).max(600),
    source: z.string().min(1).max(300),
    anchor: z.string().max(200).optional(),
    result: reviewEvidenceResultSchema,
    note: z.string().max(800).optional(),
  }).strict()).min(1),
  result: z.enum(["pass", "conditional", "fail"]),
  /** What stays conditioned when the result is conditional: legal questions without source, judgments that need an external specialist. */
  conditions: z.array(z.string().min(1).max(600)).default([]),
  notes: z.string().max(4000).default(""),
}).strict();
export type AiIndependentReview = z.infer<typeof aiIndependentReviewSchema>;

/** The verdict a rung can rely on. A failed review, or one that never revisited the sources, does not count. */
export function reviewCountsForPromotion(review: AiIndependentReview): boolean {
  return review.result !== "fail" && review.checks.sourcesRevisited && review.checks.numbersRecalculated;
}
