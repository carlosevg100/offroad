import {describe,expect,it} from "vitest";
import {buildInitialInstitutionalConfigurationCandidate} from "@offroad/financial-model";
import {institutionalInputFixture} from "../../../../../packages/financial-model/src/institutional-input.fixture";
import {compileInstitutionalSetupForm,premiseKeys,type SetupDraft,type SetupFact} from "./institutional-setup-form";

function fixture(){
 const f=institutionalInputFixture();
 const actor="10000000-0000-4000-8000-000000000001",stamp="2026-09-10T00:00:00Z";
 const debtSource={...f.sources[0],sourceDocument:"separate-debt-agreement",hash:"b".repeat(64)};
 const sources=[...f.sources,debtSource].map(s=>({...s,hashVerified:true,originalName:s.sourceDocument}));
 const bindings={...f.configuration.openingBalanceSheet.bindings,baseRevenue:f.configuration.revenueSegments[0].baseRevenue,taxLossCarryforward:f.configuration.taxes.openingTaxLossCarryforward,disallowedInterestCarryforward:f.configuration.taxes.openingDisallowedInterestCarryforward};
 const facts:SetupFact[]=Object.entries(bindings).map(([key,b])=>({id:key,field_path:b.fieldPath,normalized_value:f.facts.find(v=>v.key.fieldPath===b.fieldPath)!.value,value_type:"number",source_document_id:b.sourceDocument,period_start:b.periodStart??null,period_end:b.periodEnd,entity_name:b.entityName,entity_scope:b.entityScope,source_anchor:{page:1},anchor_verified:true,review_state:"accepted",currency:"BRL",unit:"currency",value_scale:1,extraction_document_version:b.sourceVersion,extraction_source_sha256:b.sourceHash}));
 const draft:SetupDraft={currency:"BRL",asOfDate:f.sources[0].asOfDate,baseYear:"2026",periods:["2027"],selections:Object.fromEntries(facts.map(v=>[v.id,v.id])),premises:Object.fromEntries(premiseKeys.map(key=>[key,{label:{pt:key,en:key},rationale:"Explicit independent scenario",values:{"2027":key==="costRatio"?"50":"0"}}])),noDebtRationale:"",noCapexRationale:"Explicitly no new investments",capex:[],debt:f.configuration.debtInstruments.map(d=>({...d,periods:d.periods.filter(p=>p.period==="2027")})),debtRateLineage:f.configuration.debtRateLineage.filter(l=>l.period==="2027").map(l=>({...l,indexationSourceId:debtSource.sourceDocument,couponSourceId:debtSource.sourceDocument}))};
 const configuration=compileInstitutionalSetupForm({draft,facts,sources,actorId:actor,submittedAt:stamp,submissionId:actor});
 return {configuration,facts:f.facts,currentSources:sources,reviewedSources:[...f.sources,debtSource].map(s=>({...s,metadataEvidence:{locator:"Explicit reviewed section",rationale:"Currency and scale reviewed"},reviewedBy:actor,reviewedAt:stamp})),actorId:actor,submittedAt:stamp,submissionId:actor};
}
describe("guided setup crosses the real institutional adapter",()=>{
 it("accepts a separately reviewed debt document with its exact date and version",()=>{
  const result=buildInitialInstitutionalConfigurationCandidate(fixture());
  expect(result.status).toBe("review_required");
 });
 it.each(["display name","different date","omitted debt review"])("blocks %s without inventing rate provenance",kind=>{
  const f=fixture();
  if(kind==="display name")f.configuration.debtRateLineage[0].couponSourceId="Friendly debt agreement name";
  if(kind==="different date")f.configuration.debtRateLineage[0].couponAsOfDate="2026-12-30";
  if(kind==="omitted debt review")f.reviewedSources=f.reviewedSources.slice(0,1);
  const result=buildInitialInstitutionalConfigurationCandidate(f);
  expect(result.status).toBe("missing_inputs");
  if(result.status!=="missing_inputs")throw new Error("Expected bounded missing inputs");
  expect(result.prepared.missingInputs).toEqual(expect.arrayContaining([expect.objectContaining({code:"source_unbound",targetPath:expect.stringContaining("debtRateLineage")})]));
 });
});
