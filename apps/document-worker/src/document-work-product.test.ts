import {describe,it,expect,vi} from "vitest";
import {documentWorkProductInputSchema,documentWorkProductSectionKeys,type DocumentWorkProductInput} from "@offroad/domain-contracts";
import type {ModelGateway} from "@offroad/model-gateway";
import {runDocumentWorkProduct,validateDocumentWorkProductNarrative} from "./document-work-product";

const input: DocumentWorkProductInput = {job:"comparison",locale:"en-US",approvedRequest:{text:"Compare the supplied proposals",fingerprint:"a".repeat(64)},passages:[{id:"p1",documentId:"d1",documentName:"Proposal Alpha.pdf",version:"v1",hash:"b".repeat(64),anchor:"page 1",text:"Proposal Alpha has a maturity of 36 months and requires a parent guarantee."}],coverage:{documentsConsidered:1,omittedPassages:0,limitations:["Only one proposal supplied."]}};
const narrative = (job: DocumentWorkProductInput["job"] = "comparison") => ({sections:documentWorkProductSectionKeys[job].map((key,index)=>({key,title:key,observations:index===0?[{text:input.passages[0]!.text,citations:[{passageId:"p1",quote:input.passages[0]!.text}]}]:[]})),hypotheses:[],gaps:[{text:"Another proposal is needed for comparison.",question:"Can you provide the other proposal?"}]});
describe("uploaded document work products",()=>{
  it.each(["comparison","meeting","review"] as const)("executes %s with restricted policy and preserves source coverage",async job=>{
    const complete=vi.fn().mockResolvedValue({output:narrative(job)});
    const result=await runDocumentWorkProduct({...input,job},{gateway:{complete} as unknown as Pick<ModelGateway,"complete">});
    expect(result.job).toBe(job);
    expect(result.coverage).toEqual(input.coverage);
    expect(result.sources).toEqual(input.passages);
    expect(result.calculationStatus).toBe("not_performed");
    expect(complete.mock.calls[0]![0]).toMatchObject({task:"preliminary_understanding",dataHandling:{classification:"restricted",purpose:"case_analysis"}});
    expect(result.fingerprint).toMatch(/^[a-f0-9]{64}$/);
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
    const complete=vi.fn().mockResolvedValue({output:out});
    await expect(runDocumentWorkProduct(input,{gateway:{complete} as unknown as Pick<ModelGateway,"complete">})).rejects.toThrow("empty_without_gap");
  });
  it("rejects duplicate source ids and excessive aggregate input",()=>{
    expect(documentWorkProductInputSchema.safeParse({...input,passages:[...input.passages,...input.passages]}).success).toBe(false);
    expect(documentWorkProductInputSchema.safeParse({...input,passages:Array.from({length:11},(_,i)=>({...input.passages[0]!,id:String(i),text:"a".repeat(12000)}))}).success).toBe(false);
  });
  it("preserves honest gaps without inventing an observation",async()=>{
    const out=narrative();out.sections.forEach(section=>section.observations=[]);
    const complete=vi.fn().mockResolvedValue({output:out});
    const result=await runDocumentWorkProduct(input,{gateway:{complete} as unknown as Pick<ModelGateway,"complete">});
    expect(result.sections.every(section=>section.observations.length===0)).toBe(true);
    expect(result.gaps).toHaveLength(1);
    expect(result.status).toBe("insufficient_evidence");
  });
});
