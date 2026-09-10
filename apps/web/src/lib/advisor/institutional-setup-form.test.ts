import {describe,it,expect} from "vitest";
import {compileInstitutionalSetupForm,openingKeys,premiseKeys,type SetupDraft,type SetupFact} from "./institutional-setup-form";
const source={sourceDocument:"synthetic",version:"1",hash:"a".repeat(64),hashVerified:true,originalName:"Synthetic accounts"};
function fixture(){
 const facts:SetupFact[]=[...openingKeys,"baseRevenue","taxLossCarryforward","disallowedInterestCarryforward"].map(key=>({id:key,field_path:key,normalized_value:"185400000",value_type:"number",source_document_id:"synthetic",period_start:"2026-01-01",period_end:"2026-12-31",entity_name:"Synthetic company",entity_scope:"consolidated",source_anchor:{page:1},anchor_verified:true,review_state:"accepted",currency:"BRL",unit:"currency",value_scale:1000,extraction_document_version:"1",extraction_source_sha256:source.hash}));
 const draft:SetupDraft={currency:"BRL",asOfDate:"2026-12-31",baseYear:"2026",periods:["2027"],selections:Object.fromEntries(facts.map(f=>[f.id,f.id])),premises:Object.fromEntries(premiseKeys.map(key=>[key,{label:{pt:"ignored",en:"ignored"},rationale:"Synthetic explicit premise",values:{"2027":"7,5"}}])),noDebtRationale:"Confirmed no debt",noCapexRationale:"Confirmed no capex",capex:[],debt:[],debtRateLineage:[]};
 return {draft,facts,sources:[source],actorId:"10000000-0000-4000-8000-000000000001",submissionId:"10000000-0000-4000-8000-000000000002",submittedAt:"2026-09-10T00:00:00Z"};
}
describe("guided financial setup compilation",()=>{
 it("keeps normalized history source-bound and normalizes declared percentages exactly once",()=>{const result=compileInstitutionalSetupForm(fixture());expect(result.openingBalanceSheet.bindings.unrestrictedCash.sourceHash).toBe(source.hash);expect(result.openingBalanceSheet.bindings.unrestrictedCash).not.toHaveProperty("value");expect(result.assumptionBook.assumptions.find(a=>a.id==="volumeGrowth")?.values["2027"]).toBe("0.075");expect(result.assumptionBook.assumptions.find(a=>a.id==="minimumCash")?.values["2027"]).toBe("7.5");});
 it("rejects omitted annual premises instead of inserting zero",()=>{const f=fixture();delete f.draft.premises.volumeGrowth.values["2027"];expect(()=>compileInstitutionalSetupForm(f)).toThrow("institutional_setup_incomplete");});
 it("requires explicit debt and capex absence confirmation",()=>{const f=fixture();f.draft.noDebtRationale="";expect(()=>compileInstitutionalSetupForm(f)).toThrow();});
 it("rejects replaced or unaccepted historical facts",()=>{const f=fixture();f.facts[0].extraction_source_sha256="b".repeat(64);expect(()=>compileInstitutionalSetupForm(f)).toThrow();f.facts[0].extraction_source_sha256=source.hash;f.facts[0].review_state="pending";expect(()=>compileInstitutionalSetupForm(f)).toThrow();});
});
