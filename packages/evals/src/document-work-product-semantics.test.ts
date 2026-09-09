import {describe, expect, it} from "vitest";
import {documentWorkProductLiveCases} from "@offroad/testing-fixtures/document-work-product-live";
import {scoreDocumentWorkSemantics, scoreDocumentWorkLive, type LiveProduct} from "./document-work-product-live";
const sample = documentWorkProductLiveCases[2];
const product:LiveProduct = {job:"review",status:"preliminary",fingerprint:"synthetic",inputFingerprint:"input",sections:[{key:"transaction",observations:sample.passages.map(p=>({text:p.text,citations:[{passageId:p.id,quote:p.text}]}))}],hypotheses:[],gaps:[{text:"Documents outstanding",question:"Can you provide the documents?"}]};
describe("review reference distinguishes unprovided from nonexistent",()=>{
  // Verbatim excerpts from synthetic live run34302835300; original automated result remains immutable.
  it.each([
    ["question","What alternative protections, such as negative pledges or financial covenants, are being considered to offset the absence of security and a leverage covenant?"],
    ["text","The absence of a leverage covenant and amortization schedule may leave the lender with limited early warning of deteriorating credit quality, though this depends on what other protections exist outside the supplied passages."],
    ["question","Are there additional covenants, negative pledges, or default triggers not captured in this note that would offset the lack of a leverage covenant and amortization schedule?"],
    ["text","The requirement for a quarterly compliance certificate suggests some ongoing monitoring is planned, but it is unclear what specific metrics or covenants the certificate will attest to, given no leverage covenant exists."],
    ["question","Will a leverage covenant be added to the final loan documentation?"],
  ])("rejects actual unsupported %s presupposition",(field,value)=>{
    const item={text:"A question remains.",question:"Can you clarify?",[field]:value};
    const result=scoreDocumentWorkLive({...product,hypotheses:[item]},sample);
    expect(result.supported).toBe(true);
    expect(result.expectedCoverage.every(term=>term.covered)).toBe(true);
    expect(result.semantics.passed).toBe(false);
    expect(result.passed).toBe(false);
    expect(result.semantics.failures[0]?.assertionId).toBe("review-unprovided-is-not-absent");
  });
  it.each([
    "No leverage covenant has been provided; can you confirm whether one exists?",
    "Does a leverage covenant exist, and if so can you provide it?",
    "If no leverage covenant exists, what protections would be appropriate?",
    "What would the compliance certificate cover if no leverage covenant is in place?",
    "If the absence of a leverage covenant is confirmed, how would the lender respond?",
    "The absence of a leverage covenant from the supplied documents leaves its existence unconfirmed.",
    "The absence of a leverage covenant and amortization schedule from the supplied documents leaves their existence unconfirmed.",
    "If the loan lacks a leverage covenant, what protections would be appropriate?",
    "The loan is unsecured. Can you confirm whether any guarantee exists?",
  ])("preserves legitimate documentary unknown or conditional %s",text=>{
    expect(scoreDocumentWorkSemantics({...product,hypotheses:[{text,question:"Can you provide the relevant document?"}]},sample).passed).toBe(true);
  });
  it.each([
    "No leverage covenant exists, though other protections are in the supplied documents.",
    "The absence of a leverage covenant is concerning; other protections are in the supplied documents.",
    "The loan lacks a leverage covenant.",
    "The loan lacks an amortization schedule, though other protections are in the supplied documents.",
  ])("rejects an asserted absence despite unrelated qualifiers: %s",text=>{
    expect(scoreDocumentWorkSemantics({...product,hypotheses:[{text,question:"Can you clarify?"}]},sample).passed).toBe(false);
  });
  it("also checks gaps and fails closed if the reference no longer supports the assertion",()=>{
    expect(scoreDocumentWorkSemantics({...product,gaps:[{text:"No leverage covenant exists.",question:"Can you clarify?"}]},sample).passed).toBe(false);
    expect(scoreDocumentWorkSemantics(product,{...sample,passages:[]}).failures[0]?.ruleId).toBe("reference-source-mismatch");
  });
  it("does not impose this case-specific rule on other cases",()=>{
    expect(scoreDocumentWorkSemantics({...product,hypotheses:[{text:"The absence of a leverage covenant limits options.",question:"What next?"}]},documentWorkProductLiveCases[0]).passed).toBe(true);
  });
});
