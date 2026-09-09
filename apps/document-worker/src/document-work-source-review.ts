import {z} from "zod";
import {documentWorkSourceReviewInstructions} from "@offroad/credit-playbook";
import type {DocumentWorkProductInput, DocumentWorkProductNarrative} from "@offroad/domain-contracts";
import {providerDataPolicyVersion, type ModelGateway} from "@offroad/model-gateway";

export const sourceReviewSchema = z.object({
  reviewedFieldIds: z.array(z.string().min(1).max(160)).max(43),
  issues: z.array(z.object({
    fieldId: z.string().min(1).max(160),
    code: z.enum(["inverse_comparison", "unsupported_premise", "unknown_as_absent", "other_unsupported"]),
    sourceIds: z.array(z.string().min(1).max(160)).max(80),
  }).strict()).max(172),
}).strict();
export type DocumentWorkSourceReview = z.infer<typeof sourceReviewSchema>;
export function documentWorkAuthoredFields(narrative: DocumentWorkProductNarrative): {id:string;text:string}[] {
  return [
    ...narrative.sections.map((section,index)=>({id:`sections.${index}.title`,text:section.title})),
    ...narrative.hypotheses.flatMap((item,index)=>[{id:`hypotheses.${index}.text`,text:item.text},{id:`hypotheses.${index}.question`,text:item.question}]),
    ...narrative.gaps.flatMap((item,index)=>[{id:`gaps.${index}.text`,text:item.text},{id:`gaps.${index}.question`,text:item.question}]),
  ];
}
const failed = () => new Error("document_work_product_source_review_failed");
type Dependencies = {gateway: Pick<ModelGateway,"complete">};
/** Independent model review; structural coverage is deterministic, semantic judgment is not certification. */
export async function reviewDocumentWorkSourceFidelity(input: DocumentWorkProductInput, narrative: DocumentWorkProductNarrative, {gateway}: Dependencies): Promise<DocumentWorkSourceReview> {
  const fields = documentWorkAuthoredFields(narrative);
  const response = await gateway.complete({
    task:"preliminary_understanding", system:documentWorkSourceReviewInstructions,
    input:[{type:"text",text:JSON.stringify({passages:input.passages,coverage:input.coverage,approvedRequest:input.approvedRequest,locale:input.locale,narrative,authoredFields:fields})}],
    schema:sourceReviewSchema, schemaName:"document_work_source_review_v1",
    dataHandling:{classification:"restricted",purpose:"case_analysis",requiredPolicyVersion:providerDataPolicyVersion},
    maxOutputTokens:4000,
  });
  return validateDocumentWorkSourceReview(input, narrative, response.output);
}
/** Checks coverage and reference identities; it cannot establish semantic correctness. */
export function validateDocumentWorkSourceReview(input: DocumentWorkProductInput, narrative: DocumentWorkProductNarrative, raw: unknown): DocumentWorkSourceReview {
  const fields = documentWorkAuthoredFields(narrative);
  const parsed = sourceReviewSchema.safeParse(raw);
  if (!parsed.success) throw failed();
  const review = parsed.data;
  const expected = new Set(fields.map(field=>field.id));
  const covered = new Set(review.reviewedFieldIds);
  const sources = new Set(input.passages.map(source=>source.id));
  if (covered.size !== expected.size || review.reviewedFieldIds.length !== expected.size
    || review.reviewedFieldIds.some(id=>!expected.has(id))
    || review.issues.some(issue=>!expected.has(issue.fieldId) || issue.sourceIds.some(id=>!sources.has(id))
      || new Set(issue.sourceIds).size !== issue.sourceIds.length)) throw failed();
  return review;
}
export async function verifyDocumentWorkSourceFidelity(input: DocumentWorkProductInput, narrative: DocumentWorkProductNarrative, dependencies: Dependencies): Promise<DocumentWorkSourceReview> {
  const review = await reviewDocumentWorkSourceFidelity(input,narrative,dependencies);
  if (review.issues.length) throw failed();
  return review;
}
