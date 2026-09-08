import {z} from "zod";

const text = z.string().trim().min(1).max(2000);
const fingerprint = z.string().regex(/^[a-f0-9]{64}$/);
export const documentWorkRequestBindingSchema = z.object({
  projectId: z.uuid(), jobId: z.uuid(), briefId: z.uuid(), planId: z.uuid(), version: z.number().int().positive(),
  objective: z.string().min(3).max(2000), proposedDeliverable: z.string().min(3).max(2000),
  inputFingerprint: fingerprint, requestFingerprint: fingerprint,
}).strict();
export type DocumentWorkRequestBinding = z.infer<typeof documentWorkRequestBindingSchema>;
export const documentWorkProductJobSchema = z.enum(["comparison", "meeting", "review"]);
export const documentWorkProductSectionKeys = {
  comparison: ["terms", "differences", "clarifications"],
  meeting: ["company_context", "discussion_points", "meeting_questions"],
  review: ["transaction", "protections", "risks"],
} as const;
export const documentWorkProductInputSchema = z.object({
  job: documentWorkProductJobSchema,
  locale: z.enum(["pt-BR", "en-US"]),
  // The caller verifies current approval and tenant access before invoking the executor.
  approvedRequest: z.object({text: z.string().trim().min(1).max(8000), fingerprint}).strict(),
  passages: z.array(z.object({
    id: z.string().min(1).max(160), documentId: z.string().min(1).max(160),
    documentName: z.string().trim().min(1).max(500), version: z.string().min(1).max(160), hash: fingerprint,
    anchor: z.string().min(1).max(500), text: z.string().trim().min(1).max(12000),
  }).strict()).min(1).max(80),
  coverage: z.object({documentsConsidered: z.number().int().positive(), omittedPassages: z.number().int().nonnegative(), limitations: z.array(text).max(30)}).strict(),
}).strict().superRefine((input, ctx) => {
  if (new Set(input.passages.map(p => p.id)).size !== input.passages.length) ctx.addIssue({code: "custom", message: "duplicate passage ids"});
  if (input.passages.reduce((n,p) => n + p.text.length,0) > 120000) ctx.addIssue({code: "custom", message: "passage budget exceeded"});
});
export const documentWorkProductNarrativeSchema = z.object({
  sections: z.array(z.object({
    key: z.enum(["terms", "differences", "clarifications", "company_context", "discussion_points", "meeting_questions", "transaction", "protections", "risks"]),
    title: text,
    observations: z.array(z.object({text, citations: z.array(z.object({passageId: z.string().min(1).max(160), quote: z.string().trim().min(12).max(2000)}).strict()).min(1).max(8)}).strict()).max(12),
  }).strict()).length(3),
  hypotheses: z.array(z.object({text, basisPassageIds: z.array(z.string().min(1).max(160)).min(1).max(8), question: text}).strict()).max(8),
  gaps: z.array(z.object({text, question: text}).strict()).max(12),
}).strict();
export const documentWorkProductSchema = documentWorkProductNarrativeSchema.extend({
  schemaVersion: z.literal("document-work-product.v1"), job: documentWorkProductJobSchema,
  locale: z.enum(["pt-BR", "en-US"]), requestFingerprint: fingerprint, inputFingerprint: fingerprint,
  sources: documentWorkProductInputSchema.shape.passages,
  coverage: documentWorkProductInputSchema.shape.coverage,
  calculationStatus: z.literal("not_performed"), assessmentStatus: z.literal("preliminary_document_review"), fingerprint,
  status: z.enum(["preliminary", "insufficient_evidence"]),
}).strict();
export type DocumentWorkProductInput = z.infer<typeof documentWorkProductInputSchema>;
export type DocumentWorkProduct = z.infer<typeof documentWorkProductSchema>;
export type DocumentWorkProductNarrative = z.infer<typeof documentWorkProductNarrativeSchema>;
