import {describe,it,expect} from "vitest";
import type {DocumentWorkProductInput} from "@offroad/domain-contracts";
import {buildDocumentWorkSelectionContext,hydrateDocumentWorkSelection,documentWorkSelectionSchema} from "./document-work-selection";
import {validateDocumentWorkProductNarrative} from "./document-work-product";
const input:DocumentWorkProductInput={job:"comparison",locale:"en-US",approvedRequest:{text:"Compare the documents",fingerprint:"a".repeat(64)},passages:[{id:"source-with-a-long-stable-identity",documentId:"company-document",documentName:"Synthetic terms",version:"1",hash:"b".repeat(64),anchor:"table row",text:"Collateral | None | Guarantee | Not provided"}],coverage:{documentsConsidered:1,omittedPassages:0,limitations:[]}};
const selection=()=>({sections:[{key:"terms",title:"Documented terms",quoteIds:["q1"]},{key:"differences",title:"Differences",quoteIds:[]},{key:"clarifications",title:"Clarifications",quoteIds:[]}],hypotheses:[],gaps:[]});
describe("compact documentary evidence selection",()=>{
  it.each(["Collateral | None | Guarantee | Not provided","No parent guarantee exists for this financing.","A operação não possui garantia."])("reconstructs the complete record, including negation: %s",text=>{
    const source={...input,passages:[{...input.passages[0]!,text}]};
    const narrative=hydrateDocumentWorkSelection(source,selection());
    expect(narrative.sections[0]!.observations).toEqual([{text,citations:[{passageId:source.passages[0]!.id,quote:text}]}]);
    expect(validateDocumentWorkProductNarrative(source,narrative)).toEqual(narrative);
  });
  it("refuses model-authored quotations and missing or repeated selection IDs",()=>{
    const extra=selection();Object.assign(extra.sections[0]!,{observations:[{text:"A guarantee exists"}]});
    expect(documentWorkSelectionSchema.safeParse(extra).success).toBe(false);
    for(const quoteIds of [["q999"],["q1","q1"]]){
      const value=selection();value.sections[0]!.quoteIds=quoteIds;
      expect(()=>hydrateDocumentWorkSelection(input,value)).toThrow();
    }
  });
  it("retains full long-source context and offers only complete bounded quotes",()=>{
    const text=Array.from({length:45},(_,i)=>`Clause ${i}: no guarantee has been provided, and absence is not confirmed.`).join("\n");
    const source={...input,passages:[{...input.passages[0]!,text}]};
    const packet=buildDocumentWorkSelectionContext(source);
    expect(packet.sources[0]!.text).toBe(text);
    expect(packet.quotes).toHaveLength(45);
    for(const quote of packet.quotes) expect(source.passages[0]!.text.slice(quote.start,quote.end)).toBe(quote.quote);
    const value=selection();value.sections[0]!.quoteIds=[packet.quotes[40]!.id];
    expect(validateDocumentWorkProductNarrative(source,hydrateDocumentWorkSelection(source,value)).sections[0]!.observations[0]!.text).toContain("Clause 40:");
  });
  it("keeps sources without an eligible quote available for identifying gaps",()=>{
    const source={...input,passages:[{...input.passages[0]!,text:"Unknown"}]};
    expect(buildDocumentWorkSelectionContext(source).sources[0]).toMatchObject({text:"Unknown",availableQuotes:[]});
    expect(()=>hydrateDocumentWorkSelection(source,selection())).toThrow("invalid_citation");
  });
  it("rejects an invented hypothesis source and preserves original identities",()=>{
    const value={...selection(),hypotheses:[{text:"If a guarantee exists, its wording needs review.",question:"Can you provide the wording?",basisSourceIds:["p1"]}]};
    expect(hydrateDocumentWorkSelection(input,value).hypotheses[0]!.basisPassageIds).toEqual([input.passages[0]!.id]);
    value.hypotheses[0]!.basisSourceIds=["p999"];
    expect(()=>hydrateDocumentWorkSelection(input,value)).toThrow("invalid_citation");
  });
  it("does not silently trim a corpus that exceeds the quote catalog budget",()=>{
    const passages=Array.from({length:6},(_,i)=>({...input.passages[0]!,id:`source-${i}`,text:Array.from({length:100},(_,n)=>`Record ${n} has no contractual guarantee confirmed.`).join("\n")}));
    expect(()=>buildDocumentWorkSelectionContext({...input,passages})).toThrow("quote_budget_exceeded");
  });
});
