import {describe,it,expect,vi} from "vitest";
import type {DocumentWorkProductInput,DocumentWorkProductNarrative} from "@offroad/domain-contracts";
import type {ModelGateway} from "@offroad/model-gateway";
import {documentWorkAuthoredFields,reviewDocumentWorkSourceFidelity,verifyDocumentWorkSourceFidelity} from "./document-work-source-review";
const input:DocumentWorkProductInput={job:"comparison",locale:"en-US",approvedRequest:{text:"Compare proposals",fingerprint:"a".repeat(64)},passages:[{id:"alpha",documentId:"a",documentName:"Alpha",version:"1",hash:"b".repeat(64),anchor:"terms",text:"Alpha requires quarterly reporting."},{id:"beta",documentId:"b",documentName:"Beta",version:"1",hash:"c".repeat(64),anchor:"terms",text:"Beta requires monthly reporting."}],coverage:{documentsConsidered:2,omittedPassages:0,limitations:[]}};
const narrative:DocumentWorkProductNarrative={sections:["terms","differences","clarifications"].map(key=>({key:key as "terms"|"differences"|"clarifications",title:key,observations:[]})),hypotheses:[{text:"Alpha reports more frequently than Beta.",basisPassageIds:["alpha","beta"],question:"Can you confirm the reporting obligations?"}],gaps:[{text:"Covenant terms were not supplied.",question:"Can you provide them or confirm whether covenants exist?"}]};
const ids=documentWorkAuthoredFields(narrative).map(f=>f.id);
const deps=(output:unknown)=>({gateway:{complete:vi.fn().mockResolvedValue({output})} as unknown as Pick<ModelGateway,"complete">});
describe("documentary source review boundaries",()=>{
  it("sends complete sources and narrative to one stateless restricted review",async()=>{
    const d=deps({reviewedFieldIds:ids,issues:[]});
    await verifyDocumentWorkSourceFidelity(input,narrative,d);
    expect(d.gateway.complete).toHaveBeenCalledTimes(1);
    const request=vi.mocked(d.gateway.complete).mock.calls[0]![0];
    expect(request).toMatchObject({schemaName:"document_work_source_review_v1",task:"preliminary_understanding",maxOutputTokens:4000,dataHandling:{classification:"restricted",purpose:"case_analysis"}});
    expect(JSON.parse((request.input[0] as {text:string}).text)).toMatchObject({passages:input.passages,narrative,authoredFields:documentWorkAuthoredFields(narrative)});
  });
  it.each(["inverse_comparison","unsupported_premise","unknown_as_absent","other_unsupported"])("fails closed for reviewer finding %s without repair",async code=>{
    const output={reviewedFieldIds:ids,issues:[{fieldId:"hypotheses.0.text",code,sourceIds:["alpha","beta"]}]};
    expect(await reviewDocumentWorkSourceFidelity(input,narrative,deps(output))).toEqual(output);
    const d=deps(output);await expect(verifyDocumentWorkSourceFidelity(input,narrative,d)).rejects.toThrow("document_work_product_source_review_failed");expect(d.gateway.complete).toHaveBeenCalledTimes(1);
  });
  it.each([
    {reviewedFieldIds:ids.slice(1),issues:[]},
    {reviewedFieldIds:[...ids,ids[0]],issues:[]},
    {reviewedFieldIds:["invented",...ids.slice(1)],issues:[]},
    {reviewedFieldIds:ids,issues:[{fieldId:"invented",code:"other_unsupported",sourceIds:[]}]},
    {reviewedFieldIds:ids,issues:[{fieldId:ids[0],code:"other_unsupported",sourceIds:["invented"]}]},
    {reviewedFieldIds:ids,issues:[{fieldId:ids[0],code:"other_unsupported",sourceIds:["alpha","alpha"]}]},
    {reviewedFieldIds:ids,issues:[],approved:true},
  ])("rejects structurally incomplete or fabricated review %j",async output=>{
    await expect(reviewDocumentWorkSourceFidelity(input,narrative,deps(output))).rejects.toThrow("document_work_product_source_review_failed");
  });
  it("retains a legitimate exploratory question when reviewer finds no unsupported premise",async()=>{
    const conditional={...narrative,hypotheses:[{text:"If no covenant exists, other protections may matter.",basisPassageIds:["alpha"],question:"Can you confirm whether a covenant exists?"}]};
    const output={reviewedFieldIds:documentWorkAuthoredFields(conditional).map(f=>f.id),issues:[]};
    expect(await verifyDocumentWorkSourceFidelity(input,conditional,deps(output))).toEqual(output);
  });
  it("does not produce approval if the provider fails",async()=>{
    const d=deps(null);vi.mocked(d.gateway.complete).mockRejectedValue(new Error("provider_unavailable"));
    await expect(verifyDocumentWorkSourceFidelity(input,narrative,d)).rejects.toThrow("provider_unavailable");
  });
});
