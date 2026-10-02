import {randomUUID} from "node:crypto";
import {describe,expect,it} from "vitest";
import {legacyGatewayFingerprint} from "@offroad/model-gateway";
import {assembleCapitalS11Components,assembleCapitalS11RevisionComponents,reconstructCapitalS11Components} from "./capital-s11-native-consumer";
import {capitalS11RecipeReceiptSchema} from "./capital-s11-processing";
import {prepareCapitalS11Recipe} from "./capital-s11-recipe";
import {capitalPlanningContextSchema,planningPreludeTaskArtifact,planningTaskArtifact} from "./capital-planning";

function fixture(){
 const work=randomUUID(),org=randomUUID(),jobId=randomUUID(),recipeId=randomUUID();
 const context=capitalPlanningContextSchema.parse({project:{id:work,organization_id:org,project_name:"Synthetic planning",entry_job:"capital_planning",access_basis:"public_information",current_phase:"understand"},
 session:{id:randomUUID(),locale:"pt-BR",company_profile:{name:"Synthetic company"},privacy_status:"public_information",representation_status:"not_claimed"},
 brief:{id:randomUUID(),kind:"capital_planning",version:3,content:{capitalIntent:"Compare capital alternatives",knownConstraints:"No lender outreach"},content_fingerprint:"a".repeat(64)},
 plan:{id:randomUUID(),version:4,fingerprint:"b".repeat(64),compiler_version:"fixture",registry_version:"fixture"},tasks:[{id:"M04",ordinal:3,batch:1,dependencies:["M01","M02"],execution_class:"llm",effect:"propose_state"}],revision:null});
 const source={topic:"identity" as const,provider:"official" as const,retrievedAt:"2026-10-02T00:00:00Z",contentHash:"c".repeat(64),title:"Synthetic published source",url:"https://example.invalid/s11",snippet:"Licensed content",publishedAt:null};
 const delivered=[{deliveryId:randomUUID(),retainedPayloadId:randomUUID(),source}];
 const prelude={schemaVersion:"capital-s11-task-projection-receipt.v1" as const,recipeId,taskId:"M01",taskRunId:randomUUID(),capitalArtifactId:randomUUID(),artifactFingerprint:"d".repeat(64),artifactVersion:2,retainedPayloadId:randomUUID(),replayed:false};
 return {jobId,recipeId,context,company:{name:"Synthetic company",website:null},research:{status:"succeeded" as const,sources:[source],costExposureUsd:0,jurisdiction:"BR" as const,jurisdictionNeedsConfirmation:false,strategyFingerprint:"e".repeat(64)},delivered,prelude:[prelude,{...prelude,taskId:"M02",capitalArtifactId:randomUUID(),taskRunId:randomUUID()}]};
}
describe("S11 native consumer pure contracts, no SQL authority claim",()=>{
 it("assembles real context versions, M01/M02 projections and distinct delivery identities",()=>{
  const f=fixture(),components=assembleCapitalS11Components(f);
  expect(components.find(c=>c.slot==="brief")).toMatchObject({id:f.context.brief.id,version:3});
  expect(components.find(c=>c.slot==="institution")).toMatchObject({id:f.context.plan.id,version:4,body:null});
  expect(components.find(c=>c.slot==="dependency")).toMatchObject({id:f.prelude[0]!.capitalArtifactId,version:2,body:{artifactFingerprint:f.prelude[0]!.artifactFingerprint}});
  expect(components.find(c=>c.slot==="research")?.body).toMatchObject({sourceIds:[f.delivered[0]!.deliveryId]});
  const prepared=prepareCapitalS11Recipe({basis:{jobId:f.jobId,organizationId:f.context.project.organization_id,workId:f.context.project.id,planId:f.context.plan.id,planFingerprint:f.context.plan.fingerprint,locale:"pt-BR",asOfDate:"2026-10-02"},components});
  expect(prepared.recipe.state).toBe("unresolved");expect(JSON.stringify(prepared.recipe)).not.toContain("Licensed content");
 });
 it.each(["recipe","task"])("rejects mismatched actual prelude identity: %s",mode=>{
  const f=fixture();if(mode==="recipe")f.prelude[0]!.recipeId=randomUUID();else f.prelude[0]!.taskId="M03";
  expect(()=>assembleCapitalS11Components(f)).toThrow("capital_s11_prelude_identity_denied");
 });
 it("pins source content changes without replacing licensed delivery identity",()=>{
  const f=fixture(),before=assembleCapitalS11Components(f);f.delivered[0]!.source.snippet="Changed content";const after=assembleCapitalS11Components(f);
  expect(before.find(c=>c.slot==="source")?.id).toBe(after.find(c=>c.slot==="source")?.id);
  expect(before.find(c=>c.slot==="source")?.bodyFingerprint).not.toBe(after.find(c=>c.slot==="source")?.bodyFingerprint);
 });
 it("renders prelude before any model output and shares the existing artifact builder",()=>{
  const f=fixture(),input={context:f.context,companyName:f.company.name,website:null};
  for(const id of ["M01","M02","M03"] as const){
   const prelude=planningPreludeTaskArtifact(id,input);
   const old=planningTaskArtifact(id,{...input,planningMap:undefined as never,research:undefined as never});
   expect(old).toEqual(prelude);expect(legacyGatewayFingerprint(old)).toBe(legacyGatewayFingerprint(prelude));
  }
 });
 it("reconstructs the original components with the same assembler and rejects changed context/dependencies",()=>{
  const f=fixture(),components=assembleCapitalS11Components(f),basis={jobId:f.jobId,organizationId:f.context.project.organization_id,workId:f.context.project.id,planId:f.context.plan.id,planFingerprint:f.context.plan.fingerprint,locale:"pt-BR" as const,asOfDate:"2026-10-02"};
  const pure=prepareCapitalS11Recipe({basis,components});
  const recipe=capitalS11RecipeReceiptSchema.parse({...basis,schemaVersion:"capital-s11-recipe-receipt.v1",state:"ready",recipeId:f.recipeId,producerTaskRunId:randomUUID(),producerTaskId:"M04",finalTaskId:"S11",rendererVersion:"capital-public-task-renderer.s11.v1",recipeFingerprint:"f".repeat(64),reconstructionFingerprint:pure.prepared.inputFingerprint,contextRetainedPayloadId:randomUUID(),components:pure.recipe.components,expiresAt:"2026-10-03T00:00:00Z",operationalBudget:{schemaVersion:"capital-s11-operational-budget.v1",researchReservationVersion:"public-research-reservation.s11.v1",researchReservationMicroUsd:300000,maxExposureMicroUsd:650000,maxDispatches:2}});
  const metadata={researchStatus:f.research.status,jurisdiction:f.research.jurisdiction,jurisdictionNeedsConfirmation:false,strategyFingerprint:f.research.strategyFingerprint,dependencies:f.prelude.map(p=>({id:p.capitalArtifactId,artifactFingerprint:p.artifactFingerprint}))};
  const recovered=reconstructCapitalS11Components({recipe,originalContext:f.context,sources:f.delivered,metadata});
  expect(recovered.components).toEqual(components);expect(prepareCapitalS11Recipe({basis,components:recovered.components}).prepared.inputFingerprint).toBe(pure.prepared.inputFingerprint);
  const changed=structuredClone(f.context);changed.brief.content.capitalIntent="Changed intent";
  expect(()=>reconstructCapitalS11Components({recipe,originalContext:changed,sources:f.delivered,metadata})).toThrow("capital_s11_recovery_components_changed");
  metadata.dependencies[0]!.artifactFingerprint="0".repeat(64);
  expect(()=>reconstructCapitalS11Components({recipe,originalContext:f.context,sources:f.delivered,metadata})).toThrow("capital_s11_recovery_dependencies_changed");
 });
 it("pins a revision to four original predecessors without cloning them into its new recipe",()=>{
  const f=fixture(),newRecipe=randomUUID();
  const original=[...f.prelude,...["C11","S10"].map(taskId=>({...f.prelude[0]!,taskId,capitalArtifactId:randomUUID(),taskRunId:randomUUID(),retainedPayloadId:randomUUID()}))];
  const context=capitalPlanningContextSchema.parse({...f.context,revision:{of_artifact_id:randomUUID(),decision_id:randomUUID(),correction_note:"Refine the comparison",prior_content:{synthetic:true}},tasks:[...f.context.tasks,{id:"S11",ordinal:34,batch:12,dependencies:["S10","C11"],execution_class:"llm",effect:"propose_state"}],dependency_artifacts:original.slice(2).map(p=>({task_id:p.taskId,id:p.capitalArtifactId,artifact_fingerprint:p.artifactFingerprint,content:{synthetic:true},evidence_refs:[]}))});
  const input={...f,recipeId:newRecipe,context,predecessorRecipeId:f.recipeId,predecessors:original};
  const components=assembleCapitalS11RevisionComponents(input);
  expect(components.filter(c=>c.slot==="dependency").map(c=>c.id)).toEqual(original.map(p=>p.capitalArtifactId));
  expect(components.find(c=>c.slot==="revision")?.body).toEqual({correctionNote:"Refine the comparison",priorContent:{synthetic:true}});
  expect(original.every(p=>p.recipeId===f.recipeId)).toBe(true);
  expect(()=>assembleCapitalS11RevisionComponents({...input,predecessorRecipeId:newRecipe})).toThrow("capital_s11_revision_predecessor_identity_denied");
  const changed=structuredClone(context);changed.dependency_artifacts[0]!.artifact_fingerprint="0".repeat(64);
  expect(()=>assembleCapitalS11RevisionComponents({...input,context:changed})).toThrow("capital_s11_revision_predecessor_identity_denied");
  const basis={jobId:f.jobId,organizationId:context.project.organization_id,workId:context.project.id,planId:context.plan.id,planFingerprint:context.plan.fingerprint,locale:"pt-BR" as const,asOfDate:"2026-10-02"},pure=prepareCapitalS11Recipe({basis,components});
  const recipe=capitalS11RecipeReceiptSchema.parse({...basis,schemaVersion:"capital-s11-recipe-receipt.v1",state:"ready",recipeId:newRecipe,producerTaskRunId:randomUUID(),producerTaskId:"M04",finalTaskId:"S11",rendererVersion:"capital-public-task-renderer.s11.v1",recipeFingerprint:"f".repeat(64),reconstructionFingerprint:pure.prepared.inputFingerprint,contextRetainedPayloadId:randomUUID(),components:pure.recipe.components,expiresAt:"2026-10-03T00:00:00Z",operationalBudget:{schemaVersion:"capital-s11-operational-budget.v1",researchReservationVersion:"public-research-reservation.s11.v1",researchReservationMicroUsd:0,maxExposureMicroUsd:800000,maxDispatches:1}});
  const metadata={researchStatus:f.research.status,jurisdiction:f.research.jurisdiction,jurisdictionNeedsConfirmation:false,strategyFingerprint:f.research.strategyFingerprint,dependencies:original.map(p=>({id:p.capitalArtifactId,artifactFingerprint:p.artifactFingerprint}))};
  expect(reconstructCapitalS11Components({recipe,originalContext:context,sources:f.delivered,metadata}).components).toEqual(components);
 });

});
