import {describe, expect, it} from "vitest";
import {fingerprintJson} from "@offroad/case-understanding";
import {documentWorkFailureDiagnostics} from "./document-work-product-diagnostics";
const narrative = {sections:[{key:"risks",title:"Risks",observations:[{text:"Parent guarantee exists.",citations:[{passageId:"synthetic-source",quote:"No parent guarantee exists."}]}]}],hypotheses:[],gaps:[]};
describe("synthetic executor diagnostics",()=>{
  it("preserves rejected structured narrative and known guard separately from any product",()=>{
    const result=documentWorkFailureDiagnostics(new Error("document_work_product_non_extractive_observation"),narrative,4);
    expect(result).toEqual({code:"document_work_product_non_extractive_observation",rejectedOutput:{classification:"synthetic_rejected_narrative_not_product",content:narrative,contentFingerprint:fingerprintJson(narrative),providerCallIndex:4}});
    expect(result).not.toHaveProperty("product");
  });
  it("does not serialize arbitrary provider errors or unknown output fields",()=>{
    const result=documentWorkFailureDiagnostics(new Error("request failed secret-token"),{...narrative,providerHeaders:{authorization:"secret-token"}},null);
    expect(result).toEqual({code:"executor_or_provider_rejected",rejectedOutput:null});
    expect(JSON.stringify(result)).not.toContain("secret-token");
  });
  it("captures each allowlisted guard and handles absent provider output",()=>{
    for(const code of ["document_work_product_wrong_sections","document_work_product_unbound_number","document_work_product_invalid_citation","document_work_product_empty_without_gap"])expect(documentWorkFailureDiagnostics(new Error(code),undefined,null)).toEqual({code,rejectedOutput:null});
  });
});
