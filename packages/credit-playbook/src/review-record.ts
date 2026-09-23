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

/**
 * An independent review of an execution profile adapter, on record next to the method reviews.
 * The database binds a registered profile to this file by path and sha256 (review_evidence in
 * private.execution_method_profiles), so the record never moves and its bytes never change after
 * the registration. It reviews an adapter, not a method: the method library validates it and
 * leaves it out of the method review index.
 */
export const adapterReviewSchema = z.object({
  schemaVersion: z.literal("adapter-review.v1"),
  subject: z.object({
    adapter: z.string().min(1),
    platformReleaseId: z.string().min(1),
    artifactHash: z.string().regex(/^[a-f0-9]{64}$/),
    profileFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict(),
  subjectCommit: z.string().regex(/^[a-f0-9]{7,40}$/),
  reviewer: z.string().min(3).max(200),
  occurredAt: z.string().datetime(),
  result: z.enum(["approved", "conditional", "rejected"]),
  evidence: z.object({
    adapterBlob: z.string().min(1),
    adapterFileSha256: z.string().regex(/^[a-f0-9]{64}$/),
    serializationHelperCommit: z.string().regex(/^[a-f0-9]{7,40}$/),
    serializationHelperBlob: z.string().min(1),
    manifestHash: z.string().regex(/^[a-f0-9]{64}$/),
    manifestFileHash: z.string().regex(/^[a-f0-9]{64}$/),
    canonicalProfileTextSha256: z.string().regex(/^[a-f0-9]{64}$/),
    canonicalProfileTextBytes: z.number().int().positive(),
    reviewedWorktreeHead: z.string().regex(/^[a-f0-9]{7,40}$/),
    originMainHead: z.string().regex(/^[a-f0-9]{7,40}$/),
    checksPerformed: z.array(z.string().min(1).max(600)).min(1),
  }).strict(),
  findings: z.array(z.object({
    severity: z.enum(["importante", "menor"]),
    file: z.string().min(1).max(300),
    line: z.number().int().positive(),
    text: z.string().min(1).max(2000),
  }).strict()),
  verdictText: z.string().min(1).max(4000),
}).strict();
export type AdapterReview = z.infer<typeof adapterReviewSchema>;
