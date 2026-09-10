import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
import {executeCaseEngine,type CaseEngineInput} from "./engine";
import {institutionalModelRuntimeContextSchema,renderApprovedInstitutionalFinancialWorkbook} from "@offroad/financial-model";
import {taskCacheFromReport} from "@offroad/case-runner";
import type {ReconciledFact} from "@offroad/reconciliation";
function fixture():CaseEngineInput{
 const sql=readFileSync(new URL("../../../supabase/tests/support/institutional_setup_fixture.sql",import.meta.url),"utf8");
 const data=(name:string)=>JSON.parse(sql.match(new RegExp(`set_config\\('test.setup_${name}', '([^\\n]+)', true\\);`))![1]!.replaceAll("''","'"));
 const candidate=data("candidate");const facts=data("facts") as ReconciledFact[];
 return {runId:"institutional-test",caseId:"institutional-case",archetypeId:"other",locale:"en",referenceDate:"2026-12-31",candidates:facts.map(f=>f.accepted),documents:[],roomDocuments:[],dealBrief:{},resolvedMandates:[],externalReleaseApproved:false,materialsPreparationApproved:true,plannedMaterialKinds:["financial_model"],institutionalModelContext:institutionalModelRuntimeContextSchema.parse({projectId:"30000000-0000-4000-8000-000000000881",sourceManifestFingerprint:"a".repeat(64),currentSources:data("sources").map((s:Record<string,unknown>)=>({...s,hashVerified:true})),candidates:[],approvedConfigurations:[{id:"60000000-0000-4000-8000-000000000881",revision:1,fingerprint:candidate.configurationFingerprint,configuration:candidate.configuration,reviewedBy:"10000000-0000-4000-8000-000000000881",reviewedAt:"2026-09-10T04:01:00Z",sourceBindings:candidate.sourceBindings}],reviewedSources:candidate.sourceBindings,pendingSetup:null})};
}
describe("institutional operating model material integration",()=>{
 it("calculates and publishes internal statements without inventing an approved loan structure",async()=>{const result=await executeCaseEngine(fixture());const artifact=result.state.financialModel;expect(artifact?.modelKind).toBe("institutional");expect(result.state.materials.find(m=>m.kind==="financial_model")?.blocks.some(b=>b.type==="table")).toBe(true);expect(await renderApprovedInstitutionalFinancialWorkbook(artifact,"en")).not.toBeNull();expect(result.state.structureDecision.status).not.toBe("confirmed");});
 it("does not reuse approved workbook cache after source binding changes or fall back to indicative credit",async()=>{const input=fixture();const first=await executeCaseEngine(input);input.institutionalModelContext!.currentSources[0]!.hash="b".repeat(64);const stale=await executeCaseEngine({...input,taskCache:taskCacheFromReport(first.report)});expect(stale.state.financialModel).toBeNull();expect(stale.state.materialsBlockedBy).toContain("institutional_approved_source_stale");});
 it("requires model approval and explicit material approval",async()=>{const input=fixture();input.institutionalModelContext!.approvedConfigurations=[];const pending=await executeCaseEngine(input);expect(pending.state.financialModel).toBeNull();expect(pending.state.materialsBlockedBy).toContain("institutional_configuration_review_required");const unapproved=await executeCaseEngine({...fixture(),materialsPreparationApproved:false});expect(unapproved.state.financialModel).toBeNull();});
});
