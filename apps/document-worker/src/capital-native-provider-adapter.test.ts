/** SDK protocol mocks only. These do not count as the actual Storage HTTP gate. */
import {createHash} from "node:crypto";
import type {SupabaseClient} from "@supabase/supabase-js";
import {describe,expect,it} from "vitest";
import {createNativeProviderPorts} from "./capital-native-provider-adapter";
import {consumeNativeProviderWork,type NativeProviderReceipt} from "./capital-native-provider-consumer";
import type {CapitalProjectAnalysisJob} from "./queue";
const id=(n:number)=>`10000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const now=()=>Date.parse("2026-10-02T00:00:00Z");
const job:CapitalProjectAnalysisJob={claimed:true,job_id:id(1),capability_token:"x".repeat(64),lease_expires_at:"2026-10-02T12:00:00Z",attempt:1,organization_id:id(2),intake_session_id:id(3),processing_run_id:id(4),kind:"capital_project_analysis",payload:{analysis_scope:"provider_case_fit",locale:"pt-BR",capital_project_id:id(5),capital_project_plan_id:id(6),capital_project_brief_id:id(7),capital_task_ids:["M01","K01","K02"],capital_artifact_required:true,trigger_event:{},model_budget:{max_calls:0,max_cost_usd:0}}};
const context={schemaVersion:"provider-case-fit-context.v1",organizationId:id(2),projectId:id(5),planId:id(6),planFingerprint:"a".repeat(64),approvalStatus:"approved",objective:"Pesquisar registros disponíveis",locale:"pt-BR",asOf:"2026-09-09T00:00:00Z",tasks:[{id:"M01",dependencies:[]},{id:"K01",dependencies:["M01"]},{id:"K02",dependencies:["K01"]}],providers:[],priorArtifacts:[],caseCriteria:{schemaVersion:"provider-case-criteria.v1",asOf:"2026-09-09T00:00:00Z",currency:"BRL",source:{kind:"user_confirmed",referenceId:id(8)}}};
const digest=(s:string|Uint8Array)=>createHash("sha256").update(s).digest("hex");
function harness(tamper?:"recipeHeader"|"bytes"|"objectVersion"|"scopeAfter"|"upload409"){
 const scopes=new Map<string,Record<string,unknown>>(),objects=new Map<string,Uint8Array>(),calls:string[]=[],results:NativeProviderReceipt[]=[];let serial=20,closed=false,physicalReads=0;
 const prepare=(body:unknown)=>{const canonicalBody=JSON.stringify(body),allocationId=id(serial++);const s={schemaVersion:"capital-retained-body.v1",retentionState:"allocated",allocationId,retainedPayloadId:null,bodyBasisId:id(serial++),bucket:"capital-input-capture",path:`${id(2)}/${allocationId}/payload.json`,payloadFingerprint:digest(canonicalBody),byteLength:Buffer.byteLength(canonicalBody),storageObjectId:null,storageVersion:null,retainedAt:"2026-10-02T00:00:00Z",uploadExpiresAt:"2026-10-02T00:05:00Z",expiresAt:"2026-10-03T00:00:00Z",purgeAt:"2026-10-02T23:59:00Z",replayed:false};scopes.set(allocationId,s);return {...s,canonicalBody};};
 const initial=prepare(context),contextFp=initial.payloadFingerprint;
 const recipe=()=>({schemaVersion:"capital-native-recipe-receipt.v1",recipeId:id(9),family:"provider_case_fit",jobId:id(1),organizationId:id(2),workId:id(5),planId:id(6),briefId:id(7),contextFingerprint:contextFp,retainedPayloadId:scopes.get(initial.allocationId)!.retainedPayloadId,contextByteLength:initial.byteLength,catalogRetainedPayloadId:null,catalogFingerprint:null,expiresAt:"2026-10-03T00:00:00Z",closed:true});
 const scoped=(s:Record<string,unknown>,args:Record<string,unknown>)=>({...s,replayed:true,recipeId:id(9),taskId:args.p_task_id??null,artifactType:args.p_artifact_type??null});
 const client={rpc:async(name:string,args:Record<string,unknown>)=>{calls.push(name);let data:unknown;
  if(name==="worker_recover_capital_native_provider_v1")data={schemaVersion:"capital-native-provider-recovery.v1",family:"provider_case_fit",recipe:closed?recipe():null,results:[...results]};
  else if(name==="worker_prepare_capital_native_recipe_v1")data={schemaVersion:"capital-native-recipe-preparation.v1",recipeId:id(9),family:"provider_case_fit",jobId:id(1),organizationId:id(2),workId:id(5),planId:id(6),briefId:id(7),contextFingerprint:contextFp,contextByteLength:initial.byteLength,catalogFingerprint:null,expiresAt:"2026-10-03T00:00:00Z",body:initial};
  else if(name==="worker_read_capital_native_allocation_v1"){
   const s=scopes.get(String(args.p_allocation_id))!;data=scoped(s,args);if(tamper==="scopeAfter"&&physicalReads>0)data={...(data as object),storageVersion:"changed"};
  }else if(name==="worker_commit_capital_body_v1"){
   const s=scopes.get(String(args.p_allocation_id))!;Object.assign(s,{retentionState:"retained",retainedPayloadId:id(serial++),storageObjectId:args.p_storage_object_id,storageVersion:args.p_storage_version,replayed:false});const {taskId:_t,artifactType:_a,...body}=s;data=body;
  }else if(name==="worker_finalize_capital_native_recipe_v1"){closed=true;data=recipe();}
  else if(name==="worker_read_capital_native_recipe_v1")data={...scopes.get(initial.allocationId),replayed:true,recipeId:id(9),scope:"context"};
  else if(name==="worker_read_capital_native_result_v1"){
   const s=[...scopes.values()].find(s=>s.retainedPayloadId===args.p_retained_payload_id)!;data=scoped(s,args);
  }
  else if(name==="worker_prepare_capital_native_result_v1"){
   const p=prepare(args.p_content);Object.assign(scopes.get(p.allocationId)!,{taskId:args.p_task_id,artifactType:args.p_artifact_type});
   data={schemaVersion:"capital-native-result-preparation.v1",recipeId:id(9),sealId:p.allocationId,taskRunId:id(serial++),taskId:args.p_task_id,artifactType:args.p_artifact_type,inputFingerprint:"c".repeat(64),body:p};
  }else if(name==="worker_commit_capital_native_result_v1"){
   const s=scopes.get(String(args.p_seal_id))!;
   const r:NativeProviderReceipt={schemaVersion:"capital-native-result-receipt.v1",recipeId:id(9),family:"provider_case_fit",taskId:s.taskId as NativeProviderReceipt["taskId"],artifactType:String(s.artifactType),artifactId:id(serial++),revisionId:id(serial++),retainedPayloadId:String(s.retainedPayloadId),bodyFingerprint:String(s.payloadFingerprint),inputFingerprint:"c".repeat(64),artifactFingerprint:"d".repeat(64),contextFingerprint:contextFp,executorVersion:"2026.09.10-v1",modelCalls:0,grantsApproval:false,grantsExternalEffect:false};results.push(r);data=r;
  }else throw Error("unexpected_mock_rpc");
  return {error:null,data:structuredClone(data)};
 },storage:{from:()=>({upload:async(path:string,bytes:Uint8Array)=>{calls.push("upload");objects.set(path,Uint8Array.from(bytes));const s=[...scopes.values()].find(s=>s.path===path)!;Object.assign(s,{storageObjectId:id(serial++),storageVersion:"object-v1"});return {error:tamper==="upload409"?{statusCode:"409"}:null};}})},functions:{invoke:async(_name:string,input:{body:Record<string,string>})=>{
  calls.push("edge-read");physicalReads++;const s=input.body.allocationId?scopes.get(input.body.allocationId)!:input.body.retainedPayloadId?[...scopes.values()].find(s=>s.retainedPayloadId===input.body.retainedPayloadId)!:scopes.get(initial.allocationId)!;
  const bytes=objects.get(String(s.path))!;const h=new Headers({"content-type":"application/octet-stream","cache-control":"no-store","x-offroad-recipe-id":tamper==="recipeHeader"?id(99):id(9),"x-offroad-allocation-id":String(s.allocationId),"x-offroad-object-id":String(s.storageObjectId),"x-offroad-storage-version":tamper==="objectVersion"?"wrong-v":String(s.storageVersion),"x-offroad-payload-sha256":String(s.payloadFingerprint),"x-offroad-byte-length":String(s.byteLength)});
  if(input.body.retainedPayloadId)h.set("x-offroad-retained-payload-id",input.body.retainedPayloadId);if(input.body.taskId){h.set("x-offroad-task-id",input.body.taskId);h.set("x-offroad-artifact-type",input.body.artifactType!);}
  return {error:null,data:new Blob([tamper==="bytes"?Buffer.from("x".repeat(bytes.length)):Buffer.from(bytes)]),response:new Response(null,{headers:h})};
 }}}as unknown as SupabaseClient;
 return {client,calls,results,scopes};
}
describe("native provider SDK protocol",()=>{
 it("uploads, verifies server physical scopes, commits each body and recovers before capture",async()=>{
  const h=harness();const ports=createNativeProviderPorts({client:h.client,job,now});const first=await consumeNativeProviderWork(job,ports,now);expect(first.status).toBe("succeeded");
  expect(h.calls[0]).toBe("worker_recover_capital_native_provider_v1");expect(h.calls.filter(c=>c==="upload")).toHaveLength(4);
  const count=h.calls.length;expect((await consumeNativeProviderWork(job,ports,now)).replayed).toBe(true);expect(h.calls[count]).toBe("worker_recover_capital_native_provider_v1");expect(h.calls.slice(count).filter(v=>v==="edge-read")).toHaveLength(3);expect(h.calls.slice(count).some(v=>v.includes("prepare")||v==="upload")).toBe(false);
 });
 for(const tamper of ["recipeHeader","bytes","objectVersion","scopeAfter"]as const)it(`denies ${tamper} before recording any task result`,async()=>{
  const h=harness(tamper);await expect(consumeNativeProviderWork(job,createNativeProviderPorts({client:h.client,job,now}),now)).rejects.toThrow("adapter_denied");expect(h.results).toHaveLength(0);
 });
 it("409 retry still requires real server bytes and cannot become a synthetic proof",async()=>{
  const h=harness("upload409");expect((await consumeNativeProviderWork(job,createNativeProviderPorts({client:h.client,job,now}),now)).status).toBe("succeeded");expect(h.calls.filter(c=>c==="edge-read").length).toBeGreaterThan(8);
 });
});

describe("native provider denial diagnostics (no source or credentials)",()=>{
 for(const [tamper,reason] of [["recipeHeader","physical_header_identity"],["bytes","physical_bytes"],["objectVersion","physical_header_identity"],["scopeAfter","physical_scope_changed"]] as const)
  it(`reports fixed ${reason} for ${tamper} without relaxing the denial`,async()=>{
   const h=harness(tamper);await expect(consumeNativeProviderWork(job,createNativeProviderPorts({client:h.client,job,now}),now)).rejects.toThrow(`capital_native_provider_adapter_denied_${reason}`);expect(h.results).toHaveLength(0);
  });
 it("reports known SQLSTATE but never propagates private SQL message/details/hint",async()=>{
  const secret="private_example_never_emit";
  const client={rpc:async()=>({data:null,error:{code:"42501",message:secret,details:secret,hint:secret}})} as unknown as SupabaseClient;
  const ports=createNativeProviderPorts({client,job,now});
  await expect(ports.recover()).rejects.toThrow(/^capital_native_provider_adapter_denied_rpc_worker_recover_capital_native_provider_v1_42501$/);
 });
 it("unknown SQLSTATE is classified rather than interpolated",async()=>{
  const client={rpc:async()=>({data:null,error:{code:"private_example_never_emit",message:"private_example_never_emit"}})} as unknown as SupabaseClient;
  await expect(createNativeProviderPorts({client,job,now}).recover()).rejects.toThrow(/^capital_native_provider_adapter_denied_rpc_worker_recover_capital_native_provider_v1_unclassified$/);
 });
});
