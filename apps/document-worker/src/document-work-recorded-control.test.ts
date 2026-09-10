import {describe,expect,it} from "vitest";
import {documentWorkSourceReviewCases} from "@offroad/testing-fixtures/document-work-source-review";
import {documentWorkAuthoredFields,documentWorkReviewFields,sourceReviewSchema,validateDocumentWorkSourceReview} from "./document-work-source-review";

// Exact missed-English assertion and Portuguese findings from actual synthetic run34436558806.
// This test proves contract coverage, not that a fresh model will classify all assertions correctly.
const sample=documentWorkSourceReviewCases.find(c=>c.id==="source-review-unknown-as-absent")!;
const fields=documentWorkAuthoredFields(sample.narrative);
const issues=[
 {fieldId:"hypotheses.1.text",code:"unknown_as_absent" as const,sourceIds:["insurance"],exactExcerpt:"O projeto não possui seguro.",premiseRole:"asserted_fact" as const,rationale:"Source only states no insurance information was provided, not that insurance is absent."},
 {fieldId:"hypotheses.1.question",code:"unknown_as_absent" as const,sourceIds:["insurance"],exactExcerpt:"Como será compensada a ausência de seguro?",premiseRole:"implication" as const,rationale:"Presupposes confirmed absence of insurance, which the source does not establish."},
];
const recorded={reviewedFieldIds:fields.map(f=>f.id),issues};
describe("recorded mixed-language reviewer omission",()=>{
 it("rejects the old enumerate-every-ID response instead of treating it as current acceptance",()=>{
  expect(sample.narrative.hypotheses[0]?.text).toBe("The agreement has no leverage covenant, which may reduce protection.");
  expect(sourceReviewSchema.safeParse(recorded).success).toBe(false);
  expect(()=>validateDocumentWorkSourceReview(sample.input,sample.narrative,recorded)).toThrow("source_review_failed");
 });
 it("does not allow an unsupported English verdict to be omitted from issues after reporting Portuguese findings",()=>{
  const fieldAssessments=fields.map(field=>({fieldId:field.id,verdict:field.id==="hypotheses.0.text"||issues.some(i=>i.fieldId===field.id)?"unsupported" as const:"no_factual_assertion" as const,exactExcerpt:field.text.slice(0,160),sourceIds:[]}));
  expect(()=>validateDocumentWorkSourceReview(sample.input,sample.narrative,{...recorded,fieldAssessments})).toThrow("source_review_failed");
  const corrected={...recorded,fieldAssessments,issues:[...issues,{fieldId:"hypotheses.0.text",code:"unknown_as_absent" as const,sourceIds:["alpha","beta"],exactExcerpt:"The agreement has no leverage covenant",premiseRole:"asserted_fact" as const,rationale:"Not supplied does not establish contractual absence."}]};
  expect(validateDocumentWorkSourceReview(sample.input,sample.narrative,corrected).issues).toHaveLength(3);
  expect(documentWorkReviewFields(sample.input,sample.narrative).find(f=>f.id==="hypotheses.0.text")).toMatchObject({pairedText:sample.narrative.hypotheses[0]!.text,pairedQuestion:sample.narrative.hypotheses[0]!.question});
 });
});
