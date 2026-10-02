import {createHash} from "node:crypto";
import {describe,expect,it,vi} from "vitest";
import {consumeNativeProviderWork,type NativeProviderPorts,type NativeProviderRecipe,type NativeProviderReceipt} from "./capital-native-provider-consumer";
import type {CapitalProjectAnalysisJob} from "./queue";
import {buildProviderResearch} from "./provider-research";
import {buildProviderCaseFitWork} from "./provider-case-fit";
const id=(n:number)=>`10000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const job=(family:"provider_research"|"provider_case_fit"):CapitalProjectAnalysisJob=>({claimed:true,job_id:id(1),capability_token:"x".repeat(64),lease_expires_at:"2026-10-02T12:00:00Z",attempt:1,organization_id:id(2),intake_session_id:id(3),processing_run_id:id(4),kind:"capital_project_analysis",payload:{analysis_scope:family,locale:"pt-BR",capital_project_id:id(5),capital_project_plan_id:id(6),capital_project_brief_id:id(7),capital_task_ids:["M01","K01","K02"],capital_artifact_required:true,trigger_event:{},model_budget:{max_calls:0,max_cost_usd:0}}});
function context(family:"provider_research"|"provider_case_fit"){
 const common={schemaVersion:family==="provider_research"?"provider-research-context.v1":"provider-case-fit-context.v1",organizationId:id(2),projectId:id(5),planId:id(6),planFingerprint:"a".repeat(64),approvalStatus:"approved",objective:"Pesquisar registros disponíveis",locale:"pt-BR",asOf:"2026-09-09T00:00:00Z",tasks:[{id:"M01",dependencies:[]},{id:"K01",dependencies:["M01"]},{id:"K02",dependencies:["K01"]}],providers:[],priorArtifacts:[]};
 return family==="provider_research"?common:{...common,caseCriteria:{schemaVersion:"provider-case-criteria.v1",asOf:common.asOf,currency:"BRL",source:{kind:"user_confirmed",referenceId:id(8)}}};
}
function harness(family:"provider_research"|"provider_case_fit",value:unknown=context(family)){
 const bytes=Buffer.from(JSON.stringify(value)),fingerprint=createHash("sha256").update(bytes).digest("hex");
 const recipe:NativeProviderRecipe={schemaVersion:"capital-native-recipe-receipt.v1",recipeId:id(9),family,jobId:id(1),organizationId:id(2),workId:id(5),planId:id(6),briefId:id(7),contextFingerprint:fingerprint,retainedPayloadId:id(10),contextByteLength:bytes.length,catalogRetainedPayloadId:null,catalogFingerprint:null,expiresAt:"2026-10-03T00:00:00Z",closed:true};
 const results:NativeProviderReceipt[]=[],bodies:Record<string,unknown>[]=[];
 const ports:NativeProviderPorts={recover:vi.fn(async()=>({schemaVersion:"capital-native-provider-recovery.v1",family,recipe:results.length?recipe:null,results:[...results]})),capture:vi.fn(async()=>recipe),readContext:vi.fn(async()=>bytes),readCatalog:vi.fn(async()=>{throw Error("no catalogue");}),commit:vi.fn(async input=>{
  bodies.push(input.content);const receipt:NativeProviderReceipt={schemaVersion:"capital-native-result-receipt.v1",recipeId:recipe.recipeId,family,taskId:input.taskId,artifactType:input.artifactType,artifactId:id(11+results.length),revisionId:id(21+results.length),retainedPayloadId:id(31+results.length),bodyFingerprint:"b".repeat(64),inputFingerprint:"c".repeat(64),artifactFingerprint:"d".repeat(64),contextFingerprint:fingerprint,executorVersion:input.executorVersion,modelCalls:0,grantsApproval:false,grantsExternalEffect:false};results.push(receipt);return receipt;})};
 return {ports,recipe,results,bodies,bytes};
}
const now=()=>Date.parse("2026-10-02T00:00:00Z");
describe("native zero-model providers",()=>{
 for(const family of ["provider_research","provider_case_fit"] as const){
  it(`${family}: retains the professional engine result and zero effects`,async()=>{
   const h=harness(family);expect(await consumeNativeProviderWork(job(family),h.ports,now)).toMatchObject({status:"succeeded",replayed:false,modelCalls:0});
   const expected=family==="provider_research"?buildProviderResearch(context(family),job(family)).artifact:buildProviderCaseFitWork(context(family),job(family)).artifact;
   expect(h.bodies[2]).toEqual(expected);expect(h.results.map(r=>r.taskId)).toEqual(["M01","K01","K02"]);
   expect(h.bodies[2]).toMatchObject({shortlistAuthorized:false,externalEffectAllowed:false});
  });
  it(`${family}: full replay returns before context/catalog/capture and cannot recompute`,async()=>{
   const h=harness(family);await consumeNativeProviderWork(job(family),h.ports,now);
   h.ports.capture=vi.fn(async()=>{throw Error("must not capture");});h.ports.readContext=vi.fn(async()=>{throw Error("must not rebuild");});
   expect(await consumeNativeProviderWork(job(family),h.ports,now)).toMatchObject({replayed:true,artifact:h.results[2]});expect(h.ports.readContext).not.toHaveBeenCalled();expect(h.ports.capture).not.toHaveBeenCalled();
  });
 }
 it("partial replay reads the original body and never overwrites an existing contribution",async()=>{
  const h=harness("provider_research");const real=h.ports.commit;let stopped=false;
  h.ports.commit=async input=>{if(input.taskId==="K01"&&!stopped){stopped=true;throw Error("interrupted");}return real(input);};
  await expect(consumeNativeProviderWork(job("provider_research"),h.ports,now)).rejects.toThrow("interrupted");const original=h.results[0];
  await consumeNativeProviderWork(job("provider_research"),h.ports,now);expect(h.results).toHaveLength(3);expect(h.results[0]).toBe(original);expect(h.bodies).toHaveLength(3);
 });
 it("foreign recipe, expired receipt, modified bytes and legacy output deny before writes",async()=>{
  for(const mutate of [(h:ReturnType<typeof harness>)=>{h.recipe.organizationId=id(90);},(h:ReturnType<typeof harness>)=>{h.recipe.expiresAt="2026-10-01T00:00:00Z";},(h:ReturnType<typeof harness>)=>{h.ports.readContext=async()=>Buffer.from("{}");}]){
   const h=harness("provider_research");mutate(h);await expect(consumeNativeProviderWork(job("provider_research"),h.ports,now)).rejects.toThrow();expect(h.ports.commit).not.toHaveBeenCalled();
  }
  const h=harness("provider_research",{...context("provider_research"),priorArtifacts:[{content:{}}]});await expect(consumeNativeProviderWork(job("provider_research"),h.ports,now)).rejects.toThrow("legacy_prior_denied");expect(h.ports.commit).not.toHaveBeenCalled();
 });
 it("model budget and unknown scope never reach even recovery",async()=>{
  const h=harness("provider_research");const j=job("provider_research");j.payload.model_budget.max_calls=1;
  await expect(consumeNativeProviderWork(j,h.ports,now)).rejects.toThrow("job_denied");expect(h.ports.recover).not.toHaveBeenCalled();
 });
 it("malicious recovery graph and approval-bearing receipt deny",async()=>{
  for(const altered of ["graph","approval"]){const h=harness("provider_research");await consumeNativeProviderWork(job("provider_research"),h.ports,now);
   h.ports.recover=async()=>({schemaVersion:"capital-native-provider-recovery.v1",family:"provider_research",recipe:h.recipe,results:altered==="graph"?[h.results[2]]:[{...h.results[0],grantsApproval:true}]});
   await expect(consumeNativeProviderWork(job("provider_research"),h.ports,now)).rejects.toThrow();
  }
 });
});
