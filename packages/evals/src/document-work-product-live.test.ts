import {documentWorkSourceReviewCases, originalDocumentWorkSourceReviewCases} from "@offroad/testing-fixtures/document-work-source-review";
import {scoreDocumentWorkSourceReviewControl} from "./document-work-product-live";
import {describe, expect, it} from "vitest";
import {assertDocumentWorkLiveEnvironment, compareDocumentWorkRepeats, scoreDocumentWorkLive, type LiveProduct} from "./document-work-product-live";
const sample = {job:"comparison",expected:["36 months","60 months"],passages:[{id:"a",text:"Term is 36 months."},{id:"b",text:"Term is 60 months."}]};
const output:LiveProduct = {job:"comparison",status:"preliminary",fingerprint:"a",inputFingerprint:"input",sections:[{key:"terms",observations:sample.passages.map(p=>({text:p.text,citations:[{passageId:p.id,quote:p.text}]}))}],hypotheses:[],gaps:[{text:"Pricing missing",question:"Supply pricing?"}]};
describe("document work executor live scoring",()=>{
 it("accepts supported meaningful work and prose differences while preserving expected facts",()=>{expect(scoreDocumentWorkLive(output,sample).passed).toBe(true);expect(compareDocumentWorkRepeats(output,{...output,fingerprint:"b"},sample)).toEqual({passed:true,sameInput:true,sameFullOutput:false,expectedFactCoverageStable:true});});
 it("rejects empty, unsupported, missing facts and changed inputs",()=>{expect(scoreDocumentWorkLive({...output,sections:[]},sample).passed).toBe(false);expect(scoreDocumentWorkLive({...output,sections:[{key:"terms",observations:[{text:"Approved",citations:[{passageId:"a",quote:"Term is 36 months."}]}]}]},sample).passed).toBe(false);expect(compareDocumentWorkRepeats(output,{...output,inputFingerprint:"changed"},sample).passed).toBe(false);});
 it("allows only exact main workflow before credentials are used",()=>{const env={GITHUB_ACTIONS:"true",GITHUB_RUN_ATTEMPT:"1",GITHUB_REPOSITORY:"carlosevg100/offroad",GITHUB_REF:"refs/heads/main",GITHUB_EVENT_NAME:"workflow_dispatch",GITHUB_WORKFLOW_REF:"carlosevg100/offroad/.github/workflows/document-work-product-live.yml@refs/heads/main",GITHUB_SHA:"a".repeat(40)};expect(()=>assertDocumentWorkLiveEnvironment(env)).not.toThrow();for(const field of Object.keys(env))expect(()=>assertDocumentWorkLiveEnvironment({...env,[field]:"untrusted"})).toThrow();});
});


describe("single authorized documentary evaluation attempt",()=>{
 it.each([undefined,"", "0", "2", "10", "01"])("rejects missing, malformed or repeated run attempt %j",attempt=>{
  expect(()=>assertDocumentWorkLiveEnvironment({GITHUB_ACTIONS:"true",GITHUB_RUN_ATTEMPT:attempt,GITHUB_REPOSITORY:"carlosevg100/offroad",GITHUB_REF:"refs/heads/main",GITHUB_EVENT_NAME:"workflow_dispatch",GITHUB_WORKFLOW_REF:"carlosevg100/offroad/.github/workflows/document-work-product-live.yml@refs/heads/main",GITHUB_SHA:"a".repeat(40)})).toThrow("document_work_live_requires_protected_main_workflow");
 });
});

describe("enriched source-review control scoring",()=>{
  it("requires every negative and preserves explicitly clean fields",()=>{
    const sample={expectedIssueFieldId:"original",expectedIssueFieldIds:["original","new"],expectedCleanFieldIds:["conditional"]};
    expect(scoreDocumentWorkSourceReviewControl(sample,{issues:[{fieldId:"original"}]})).toBe(false);
    expect(scoreDocumentWorkSourceReviewControl(sample,{issues:[{fieldId:"original"},{fieldId:"new"}]})).toBe(true);
    expect(scoreDocumentWorkSourceReviewControl(sample,{issues:[{fieldId:"original"},{fieldId:"new"},{fieldId:"conditional"}]})).toBe(false);
  });
  it("keeps all-positive controls free of any issue",()=>{
    const sample={expectedIssueFieldId:null,expectedIssueFieldIds:[],expectedCleanFieldIds:["conditional"]};
    expect(scoreDocumentWorkSourceReviewControl(sample,{issues:[]})).toBe(true);
    expect(scoreDocumentWorkSourceReviewControl(sample,{issues:[{fieldId:"other"}]})).toBe(false);
  });
});

describe("mixed-locale authored source-review controls",()=>{
  it("retains original controls, adds issuer identity and validates every narrative",async()=>{
    const {validateDocumentWorkProductNarrative}=await import(new URL("../../../apps/document-worker/src/document-work-product.ts",import.meta.url).href);
    const {documentWorkAuthoredFields}=await import(new URL("../../../apps/document-worker/src/document-work-source-review.ts",import.meta.url).href);
    expect(documentWorkSourceReviewCases).toHaveLength(8);
    for(const [index,sample] of documentWorkSourceReviewCases.entries()){
      const original=originalDocumentWorkSourceReviewCases[index];
      if (original) {
      expect(sample.input.passages.slice(0,original.input.passages.length)).toEqual(original.input.passages);
      expect(sample.narrative.sections).toEqual(original.narrative.sections);
      expect(sample.narrative.hypotheses[0]).toEqual(original.narrative.hypotheses[0]);
      expect(sample.expectedIssueFieldId).toBe(original.expectedIssueFieldId);
      }
      expect(()=>validateDocumentWorkProductNarrative(sample.input,sample.narrative)).not.toThrow();
      const fieldIds=new Set(documentWorkAuthoredFields(sample.narrative).map((f:{id:string})=>f.id));
      expect([...sample.expectedIssueFieldIds,...sample.expectedCleanFieldIds].every(id=>fieldIds.has(id))).toBe(true);
    }
  });
});
