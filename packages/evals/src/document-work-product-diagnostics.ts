import {z} from "zod";
import {fingerprintJson} from "@offroad/case-understanding";

const guardCodes = new Set([
  "document_work_product_wrong_sections", "document_work_product_unbound_number",
  "document_work_product_invalid_citation", "document_work_product_non_extractive_observation",
  "document_work_product_empty_without_gap", "document_work_product_source_review_failed",
]);
const text = z.string().min(1).max(2000);
// Allowlisted diagnostic shape only. Provider metadata, arbitrary error text and unknown fields never enter evidence.
const rejectedNarrative = z.object({
  sections: z.array(z.object({key: z.enum(["terms","differences","clarifications","company_context","discussion_points","meeting_questions","transaction","protections","risks"]), title: text,
    observations: z.array(z.object({text, citations: z.array(z.object({passageId:z.string().min(1).max(160),quote:text}).strict()).max(8)}).strict()).max(12),
  }).strict()).max(3),
  hypotheses: z.array(z.object({text,basisPassageIds:z.array(z.string().min(1).max(160)).max(8),question:text}).strict()).max(8),
  gaps: z.array(z.object({text,question:text}).strict()).max(12),
}).strict();

/** Eval artifact only: caller is the protected workflow executing the fixed synthetic corpus. */
export function documentWorkFailureDiagnostics(error: unknown, output: unknown, providerCallIndex: number | null) {
  const code = error instanceof Error && guardCodes.has(error.message) ? error.message : "executor_or_provider_rejected";
  const parsed = rejectedNarrative.safeParse(output);
  return {
    code,
    rejectedOutput: parsed.success ? {
      classification: "synthetic_rejected_narrative_not_product" as const,
      content: parsed.data,
      contentFingerprint: fingerprintJson(parsed.data),
      providerCallIndex,
    } : null,
  };
}
