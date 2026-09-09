import {describe,it,expect,vi} from "vitest";
import {documentWorkProductInputSchema,documentWorkProductSectionKeys,type DocumentWorkProductInput} from "@offroad/domain-contracts";
import type {ModelGateway} from "@offroad/model-gateway";
import {runDocumentWorkProduct,validateDocumentWorkProductNarrative} from "./document-work-product";

const input: DocumentWorkProductInput = {job:"comparison",locale:"en-US",approvedRequest:{text:"Compare the supplied proposals",fingerprint:"a".repeat(64)},passages:[{id:"p1",documentId:"d1",documentName:"Proposal Alpha.pdf",version:"v1",hash:"b".repeat(64),anchor:"page 1",text:"Proposal Alpha has a maturity of 36 months and requires a parent guarantee."}],coverage:{documentsConsidered:1,omittedPassages:0,limitations:["Only one proposal supplied."]}};
const narrative = (job: DocumentWorkProductInput["job"] = "comparison") => ({sections:documentWorkProductSectionKeys[job].map((key,index)=>({key,title:String(key),observations:index===0?[{text:input.passages[0]!.text,citations:[{passageId:"p1",quote:input.passages[0]!.text}]}]:[]})),hypotheses:[],gaps:[{text:"Another proposal is needed for comparison.",question:"Can you provide the other proposal?"}]});
const sourceReviewResponse = (request: {schemaName:string;input:Array<{text:string}>}) => request.schemaName === "document_work_source_review_v1"
  ? {output:{reviewedFieldIds:JSON.parse(request.input[0]!.text).authoredFields.map((field:{id:string})=>field.id),issues:[]}} : undefined;
describe("uploaded document work products",()=>{
  it("rejects a semantically unsupported result before producing a product, without regeneration",async()=>{
    const complete=vi.fn().mockImplementation(async request=>{
      const review=sourceReviewResponse(request);
      return review ? {output:{...review.output,issues:[{fieldId:"gaps.0.text",code:"unsupported_premise",sourceIds:["p1"]}]}} : {output:narrative()};
    });
    await expect(runDocumentWorkProduct(input,{gateway:{complete} as unknown as Pick<ModelGateway,"complete">})).rejects.toThrow("document_work_product_source_review_failed");
    expect(complete).toHaveBeenCalledTimes(2);
  });
  it.each(["comparison","meeting","review"] as const)("executes %s with restricted policy and preserves source coverage",async job=>{
    const complete=vi.fn().mockImplementation(async request=>sourceReviewResponse(request) ?? {output:narrative(job)});
    const result=await runDocumentWorkProduct({...input,job},{gateway:{complete} as unknown as Pick<ModelGateway,"complete">});
    expect(result.job).toBe(job);
    expect(result.coverage).toEqual(input.coverage);
    expect(result.sources).toEqual(input.passages);
    expect(result.calculationStatus).toBe("not_performed");
    expect(complete.mock.calls[0]![0]).toMatchObject({task:"preliminary_understanding",dataHandling:{classification:"restricted",purpose:"case_analysis"}});
    expect(result.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(complete).toHaveBeenCalledTimes(2);
  });
  it("rejects invented sources and non-contiguous quotes",()=>{
    const out=narrative();out.sections[0]!.observations[0]!.citations[0]!.passageId="other";
    expect(()=>validateDocumentWorkProductNarrative(input,out)).toThrow("invalid_citation");
    out.sections[0]!.observations[0]!.citations=[{passageId:"p1",quote:"Proposal Alpha guarantees 36 months"}];
    expect(()=>validateDocumentWorkProductNarrative(input,out)).toThrow("invalid_citation");
  });
  it("rejects new calculated numbers even when a citation exists",()=>{
    const out=narrative();out.sections[0]!.observations[0]!.text="The annual expense is 12.";
    expect(()=>validateDocumentWorkProductNarrative(input,out)).toThrow("unbound_number");
  });
  it("rejects mismatched job sections",()=>expect(()=>validateDocumentWorkProductNarrative(input,narrative("meeting"))).toThrow("wrong_sections"));
  it("rejects reversed guarantee meaning even with the original numbers",()=>{
    const out=narrative();out.sections[0]!.observations[0]!.text="Proposal Alpha has a maturity of 36 months and does not require a parent guarantee.";
    expect(()=>validateDocumentWorkProductNarrative(input,out)).toThrow("non_extractive_observation");
  });
  it.each([
    ["The financing is unsecured and has no guarantees.", "secured and has no guarantees."],
    ["No parent guarantee exists for this financing.", "parent guarantee exists for this financing."],
    ["The lender requires consent unless waived in writing.", "The lender requires consent"],
    ["Collateral | None | Guarantee | Not provided", "Guarantee | Not provided"],
  ])("rejects truncated meaning from %s", (source, quote) => {
    const out = narrative();
    out.sections[0]!.observations[0] = {text: quote, citations: [{passageId: "p1", quote}]};
    expect(() => validateDocumentWorkProductNarrative({...input, passages: [{...input.passages[0]!, text: source}]}, out)).toThrow("invalid_citation");
  });
  it("requires observation to equal its complete quote instead of a substring", () => {
    const out = narrative();
    out.sections[0]!.observations[0]!.text = "requires a parent guarantee.";
    expect(() => validateDocumentWorkProductNarrative(input, out)).toThrow("non_extractive_observation");
  });
  it.each([
    ["The financing is unsecured. No parent guarantee exists.", "No parent guarantee exists."],
    ["Company overview\nCollateral | None | Guarantee | Not provided\nAdditional terms", "Collateral | None | Guarantee | Not provided"],
    ["A operação não possui garantia. O prazo depende de confirmação.", "A operação não possui garantia."],
    ["  Collateral | None | Guarantee | Not provided  ", "Collateral | None | Guarantee | Not provided"],
  ])("preserves complete sentence or record %s", (source, quote) => {
    const out = narrative();
    out.sections[0]!.observations[0] = {text: quote, citations: [{passageId: "p1", quote}]};
    expect(() => validateDocumentWorkProductNarrative({...input, passages: [{...input.passages[0]!, text: source}]}, out)).not.toThrow();
  });
  it("rejects an empty answer without a specific evidence gap",async()=>{
    const out=narrative();out.sections.forEach(section=>section.observations=[]);out.gaps=[];
    const complete=vi.fn().mockImplementation(async request=>sourceReviewResponse(request) ?? {output:out});
    await expect(runDocumentWorkProduct(input,{gateway:{complete} as unknown as Pick<ModelGateway,"complete">})).rejects.toThrow("empty_without_gap");
  });
  it("rejects duplicate source ids and excessive aggregate input",()=>{
    expect(documentWorkProductInputSchema.safeParse({...input,passages:[...input.passages,...input.passages]}).success).toBe(false);
    expect(documentWorkProductInputSchema.safeParse({...input,passages:Array.from({length:11},(_,i)=>({...input.passages[0]!,id:String(i),text:"a".repeat(12000)}))}).success).toBe(false);
  });
  it("preserves honest gaps without inventing an observation",async()=>{
    const out=narrative();out.sections.forEach(section=>section.observations=[]);
    const complete=vi.fn().mockImplementation(async request=>sourceReviewResponse(request) ?? {output:out});
    const result=await runDocumentWorkProduct(input,{gateway:{complete} as unknown as Pick<ModelGateway,"complete">});
    expect(result.sections.every(section=>section.observations.length===0)).toBe(true);
    expect(result.gaps).toHaveLength(1);
    expect(result.status).toBe("insufficient_evidence");
  });
  it("corrects one rejected numeric hypothesis with the same sources and policy",async()=>{
    const invalid={...narrative(),hypotheses:[{text:"The 24-month term may require refinancing.",question:"Can you confirm the terms?",basisPassageIds:["p1"]}]};
    const complete=vi.fn().mockResolvedValueOnce({output:invalid}).mockResolvedValueOnce({output:narrative()}).mockImplementation(async request=>sourceReviewResponse(request));
    const product=await runDocumentWorkProduct(input,{gateway:{complete} as unknown as Pick<ModelGateway,"complete">});
    expect(complete).toHaveBeenCalledTimes(3);
    const first=complete.mock.calls[0]![0], second=complete.mock.calls[1]![0];
    const originalInput=JSON.parse(first.input[0].text), correctionInput=JSON.parse(second.input[0].text);
    expect(correctionInput).toEqual({...originalInput,validationFeedback:{code:"document_work_product_unbound_number"}});
    for (const field of ["task","schema","schemaName","dataHandling","maxOutputTokens"]) expect(second[field]).toEqual(first[field]);
    expect(second.system).toContain(first.system);
    expect(second.system).toContain("use no digits");
    expect(second.input[0].text).not.toContain("24-month");
    expect(product.hypotheses).toEqual([]);
    expect(product.sources).toEqual(input.passages);
  });
  it.each(["unbound_number","invalid_citation","wrong_sections","non_extractive_observation","empty_without_gap"])("stops after one unsuccessful correction of %s",async code=>{
    const out=narrative();
    if(code==="unbound_number") out.sections[0]!.title="Terms 2";
    if(code==="invalid_citation") out.sections[0]!.observations[0]!.citations[0]!.passageId="invented";
    if(code==="wrong_sections") out.sections=narrative("meeting").sections;
    if(code==="non_extractive_observation") out.sections[0]!.observations[0]!.text="The terms are favorable.";
    if(code==="empty_without_gap") {out.sections.forEach(section=>section.observations=[]);out.gaps=[];}
    const complete=vi.fn().mockImplementation(async request=>sourceReviewResponse(request) ?? {output:out});
    await expect(runDocumentWorkProduct(input,{gateway:{complete} as unknown as Pick<ModelGateway,"complete">})).rejects.toThrow(`document_work_product_${code}`);
    expect(complete).toHaveBeenCalledTimes(2);
  });
  it("does not retry schema errors or a provider failure that mimics a validation code",async()=>{
    const malformed=vi.fn().mockResolvedValue({output:{sections:[]}});
    await expect(runDocumentWorkProduct(input,{gateway:{complete:malformed} as unknown as Pick<ModelGateway,"complete">})).rejects.toThrow();
    expect(malformed).toHaveBeenCalledTimes(1);
    const providerError=new Error("document_work_product_unbound_number");
    const failed=vi.fn().mockRejectedValue(providerError);
    await expect(runDocumentWorkProduct(input,{gateway:{complete:failed} as unknown as Pick<ModelGateway,"complete">})).rejects.toBe(providerError);
    expect(failed).toHaveBeenCalledTimes(1);
  });
  it("propagates the existing gateway budget rejection without resetting it",async()=>{
    const out=narrative();out.sections[0]!.title="Terms 2";
    const budgetError=new Error("budget_exceeded");
    const complete=vi.fn().mockResolvedValueOnce({output:out}).mockRejectedValueOnce(budgetError);
    await expect(runDocumentWorkProduct(input,{gateway:{complete} as unknown as Pick<ModelGateway,"complete">})).rejects.toBe(budgetError);
    expect(complete).toHaveBeenCalledTimes(2);
  });
});
