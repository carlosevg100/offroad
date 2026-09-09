import {z} from "zod";
import {documentWorkSourceReviewInstructions, documentWorkProductRevisionInstructions} from "@offroad/credit-playbook";
import type {DocumentWorkProductInput, DocumentWorkProductNarrative} from "@offroad/domain-contracts";
import {buildDocumentWorkSelectionContext, documentWorkSelectionSchema, type DocumentWorkSelection} from "./document-work-selection";
import {providerDataPolicyVersion, type ModelGateway} from "@offroad/model-gateway";

export const sourceReviewSchema = z.object({
  reviewedFieldIds: z.array(z.string().min(1).max(160)).max(43),
  issues: z.array(z.object({
    fieldId: z.string().min(1).max(160),
    code: z.enum(["inverse_comparison", "unsupported_premise", "unknown_as_absent", "other_unsupported"]),
    sourceIds: z.array(z.string().min(1).max(160)).max(80),
    exactExcerpt: z.string().min(1).max(160),
    premiseRole: z.enum(["asserted_fact", "conditional_assumption", "implication", "question_presupposition", "title_assertion"]),
    rationale: z.string().trim().min(1).max(160),
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
  const fields = documentWorkAuthoredFields(narrative).map(field=>{
    const match=/^hypotheses\.(\d+)\./.exec(field.id);
    return match ? {...field,basisSourceIds:narrative.hypotheses[Number(match[1])]!.basisPassageIds.map(id=>`p${input.passages.findIndex(p=>p.id===id)+1}`)} : field;
  });
  const response = await gateway.complete({
    task:"preliminary_understanding", system:documentWorkSourceReviewInstructions,
    input:[{type:"text",text:JSON.stringify({passages:input.passages.map((passage,index)=>({id:`p${index+1}`,documentId:passage.documentId,documentName:passage.documentName,text:passage.text})),coverage:input.coverage,approvedRequest:input.approvedRequest.text,locale:input.locale,authoredFields:fields})}],
    schema:sourceReviewSchema, schemaName:"document_work_source_review_v3",
    dataHandling:{classification:"restricted",purpose:"case_analysis",requiredPolicyVersion:providerDataPolicyVersion},
    maxOutputTokens:4000,
  });
  const parsed = sourceReviewSchema.safeParse(response.output);
  if (!parsed.success) throw failed();
  const wire = parsed.data;
  const review = expandDocumentWorkSourceReview(input, wire);
  return validateDocumentWorkSourceReview(input, narrative, review);
}
/** The critic may propose a replacement, but cannot approve that replacement itself. */
export async function reviewAndProposeDocumentWorkRevision(input: DocumentWorkProductInput, narrative: DocumentWorkProductNarrative, selection: unknown, {gateway}: Dependencies): Promise<{review: DocumentWorkSourceReview; revisedSelection: DocumentWorkSelection | null}> {
  const schema=sourceReviewSchema.extend({revisedSelection:documentWorkSelectionSchema.nullable()});
  const context=buildDocumentWorkSelectionContext(input);
  const response=await gateway.complete({
    task:"preliminary_understanding",system:`${documentWorkSourceReviewInstructions}\n${documentWorkProductRevisionInstructions}`,
    input:[{type:"text",text:JSON.stringify({passages:context.sources,coverage:input.coverage,approvedRequest:input.approvedRequest.text,locale:input.locale,authoredFields:documentWorkAuthoredFields(narrative),selection:documentWorkSelectionSchema.parse(selection)})}],
    schema,schemaName:"document_work_source_review_revision_v1",
    dataHandling:{classification:"restricted",purpose:"case_analysis",requiredPolicyVersion:providerDataPolicyVersion},maxOutputTokens:4000,
  });
  const parsed=schema.safeParse(response.output);if(!parsed.success)throw failed();
  const {revisedSelection,...wire}=parsed.data;
  const review=validateDocumentWorkSourceReview(input,narrative,expandDocumentWorkSourceReview(input,wire));
  if(review.issues.length===0 && revisedSelection!==null)throw failed();
  return {review,revisedSelection};
}
/** Source aliases are local to one request; unknown aliases never become trusted citations. */
export function expandDocumentWorkSourceReview(input: DocumentWorkProductInput, wire: DocumentWorkSourceReview): DocumentWorkSourceReview {
  const sourceIds = new Map(input.passages.map((passage,index)=>[`p${index+1}`,passage.id]));
  return {...wire, issues:wire.issues.map(issue=>({...issue,sourceIds:issue.sourceIds.map(id=>{
    const sourceId=sourceIds.get(id); if(!sourceId)throw failed(); return sourceId;
  })}))};
}
/** Checks coverage and reference identities; it cannot establish semantic correctness. */
export function validateDocumentWorkSourceReview(input: DocumentWorkProductInput, narrative: DocumentWorkProductNarrative, raw: unknown): DocumentWorkSourceReview {
  const fields = documentWorkAuthoredFields(narrative);
  const parsed = sourceReviewSchema.safeParse(raw);
  if (!parsed.success) throw failed();
  const review = parsed.data;
  const fieldText = new Map(fields.map(field=>[field.id,field.text]));
  const expected = new Set(fieldText.keys());
  const covered = new Set(review.reviewedFieldIds);
  const sources = new Set(input.passages.map(source=>source.id));
  if (covered.size !== expected.size || review.reviewedFieldIds.length !== expected.size
    || review.reviewedFieldIds.some(id=>!expected.has(id))
    || review.issues.some(issue=>!expected.has(issue.fieldId) || issue.sourceIds.some(id=>!sources.has(id))
      || new Set(issue.sourceIds).size !== issue.sourceIds.length
      || !fieldText.get(issue.fieldId)?.includes(issue.exactExcerpt))) throw failed();
  return review;
}
export async function verifyDocumentWorkSourceFidelity(input: DocumentWorkProductInput, narrative: DocumentWorkProductNarrative, dependencies: Dependencies): Promise<DocumentWorkSourceReview> {
  const review = await reviewDocumentWorkSourceFidelity(input,narrative,dependencies);
  if (review.issues.length) throw failed();
  return review;
}
