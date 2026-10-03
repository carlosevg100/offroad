/** Actual SDK commands for S11 recovery. No model SDK or dispatch command. */
import {createHash,randomUUID} from "node:crypto";
import {z} from "zod";
import type {SupabaseClient} from "@supabase/supabase-js";
import {capitalPlanningMapSchema} from "@offroad/domain-contracts";
import {legacyGatewayFingerprint} from "@offroad/model-gateway";
import {readCapitalCaptureBytes,readCapitalS11RecoveryBytes,readCapitalS11RecoverySourceBytes,readCapitalS11RecoveredTaskBytes} from "./capital-body-read-client";
import {createCapitalS11PhysicalStore} from "./capital-s11-physical-store";
import {recoverCapitalS11,capitalS11RecoveryGrantSchema,capitalS11RecoverySourceScopeSchema,type CapitalS11RecoveryPorts,CapitalS11RecoveryGap} from "./capital-s11-recovery";
import {capitalS11RetentionScopeSchema,capitalS11TaskProjectionReceiptSchema,type CapitalS11TaskProjectionReceipt} from "./capital-s11-protocol";
import {capitalPlanningContextSchema} from "./capital-planning";
import {capitalS11NativeTaskArtifact,capitalS11TaskStartInput} from "./capital-s11-native-consumer";
import {retryCapitalCaptureRpc} from "./capital-capture-rpc-retry";
import type {CapitalProjectAnalysisJob} from "./queue";
const uuid=z.uuid(),scopeSchema=capitalS11RetentionScopeSchema;
const projectionStateSchema=z.strictObject({schemaVersion:z.literal("capital-s11-recovered-projection-state.v1"),recipeId:uuid,taskId:z.string().regex(/^[A-Z][0-9]{2}$/),state:z.enum(["absent","present"]),projection:capitalS11TaskProjectionReceiptSchema.nullable(),body:scopeSchema.nullable()});
const same=(a:unknown,b:unknown)=>legacyGatewayFingerprint(a)===legacyGatewayFingerprint(b),sha=(bytes:Uint8Array)=>createHash("sha256").update(bytes).digest("hex");
export function createCapitalS11RecoveryQueueAdapter(client:SupabaseClient,job:CapitalProjectAnalysisJob,now:()=>number=Date.now){
 const authority=Object.freeze({jobId:uuid.parse(job.job_id),capabilityToken:z.string().min(1).parse(job.capability_token)});
 const rpc=async(name:string,input:Record<string,unknown>={})=>{const args={p_job_id:authority.jobId,p_capability_token:authority.capabilityToken,...input};const result=await retryCapitalCaptureRpc(()=>client.rpc(name,args));if(result.error)throw new CapitalS11RecoveryGap();return result.data as unknown;};
 const physical=createCapitalS11PhysicalStore(client,job,(auth,scope)=>readCapitalCaptureBytes(client,auth,scope,"s11_body"),now);
 let recipeId:string|undefined;
 const needRecipe=()=>{if(!recipeId)throw new CapitalS11RecoveryGap();return recipeId;};
 const ports:CapitalS11RecoveryPorts={
  discover:()=>rpc("worker_find_capital_s11_recovery_v1"),
  async grant(id){const grant=capitalS11RecoveryGrantSchema.parse(await rpc("worker_recover_capital_s11_result_v1",{p_recipe_id:id}));if(grant.recipeId!==id||(recipeId&&recipeId!==id))throw new CapitalS11RecoveryGap();recipeId=id;return grant;},
  async readBody(expected){const id=needRecipe(),input={p_recipe_id:id,p_retained_payload_id:expected.retainedPayloadId};
   const before=scopeSchema.parse(await rpc("worker_read_capital_s11_recovery_body_v1",input));
   const read=await readCapitalS11RecoveryBytes(client,authority,{recipeId:id,retainedPayloadId:uuid.parse(expected.retainedPayloadId)},before);
   const after=scopeSchema.parse(await rpc("worker_read_capital_s11_recovery_body_v1",input));
   if(!same(before,after)||read.objectId!==after.storageObjectId||read.version!==after.storageVersion)throw new CapitalS11RecoveryGap();return{bytes:read.bytes,scope:after};},
  async readSource(reference){const id=needRecipe(),input={p_recipe_id:id,p_retained_payload_id:reference.retainedPayloadId};
   const before=capitalS11RecoverySourceScopeSchema.parse(await rpc("worker_read_capital_s11_recovery_source_v1",input));
   const read=await readCapitalS11RecoverySourceBytes(client,authority,{recipeId:id,retainedPayloadId:reference.retainedPayloadId},before);
   const after=capitalS11RecoverySourceScopeSchema.parse(await rpc("worker_read_capital_s11_recovery_source_v1",input));
   if(!same(before,after)||read.objectId!==after.storageObjectId||read.version!==after.storageVersion)throw new CapitalS11RecoveryGap();return{bytes:read.bytes,scope:after};},
  retainFinal:async input=>physical.retain(await rpc("worker_prepare_capital_s11_recovered_output_v1",{p_recipe_id:input.recipeId,p_request_id:randomUUID(),p_kind:"final",p_accepted_invocation_id:input.acceptedInvocationId,p_body:input.body,p_output_fingerprint:input.finalFingerprint,p_parent_retained_payload_id:input.parentRetainedPayloadId})),
  async deriveTasks(input){
   const context=capitalPlanningContextSchema.parse(input.originalContext),parsed=capitalPlanningMapSchema.parse(input.parsed),name=context.session.company_profile.name,website=context.session.company_profile.website;
   if(typeof name!=="string"||!name.trim()||!input.grant.accepted||!input.grant.parsed?.retainedPayloadId)throw new CapitalS11RecoveryGap();
   const projections=new Map<string,CapitalS11TaskProjectionReceipt>();
   for(const task of context.tasks){if(task.id==="S11"||(context.revision&&task.id!=="M04"))continue;
    const artifact=capitalS11NativeTaskArtifact(task.id,{context,planningMap:parsed,companyName:name.trim(),website:typeof website==="string"&&website.trim()?website.trim():null,research:{recipeId:input.grant.recipeId,status:input.grant.reconstructionMetadata.researchStatus,sources:input.sources,costExposureUsd:0,failures:[]}},input.grant.recipe.operationalBudget);
    const body={schemaVersion:"capital-planning-task.v1",taskId:task.id,artifactType:artifact.type,content:artifact.content},bodyFingerprint=legacyGatewayFingerprint(body);
    const lookup=()=>rpc("worker_load_capital_s11_recovered_projection_state_v1",{p_recipe_id:input.grant.recipeId,p_task_id:task.id});
    const state=projectionStateSchema.parse(await lookup());if(state.recipeId!==input.grant.recipeId||state.taskId!==task.id)throw new CapitalS11RecoveryGap();
    if(state.state==="present"){
     if(!state.projection||!state.body?.retainedPayloadId||state.projection.taskId!==task.id||state.projection.recipeId!==input.grant.recipeId||state.projection.retainedPayloadId!==state.body.retainedPayloadId)throw new CapitalS11RecoveryGap();
     const bytes=await readCapitalS11RecoveredTaskBytes(client,authority,{recipeId:input.grant.recipeId,taskRunId:state.projection.taskRunId},state.body);
     const after=projectionStateSchema.parse(await lookup());
     if(!same(state,after)||bytes.bytes.length!==state.body.byteLength||sha(bytes.bytes)!==state.body.payloadFingerprint||bytes.objectId!==state.body.storageObjectId||bytes.version!==state.body.storageVersion||legacyGatewayFingerprint(JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes.bytes)))!==bodyFingerprint)throw new CapitalS11RecoveryGap();
     projections.set(task.id,state.projection);continue;
    }
    if(state.body!==null||state.projection!==null)throw new CapitalS11RecoveryGap();
    let taskRunId=input.grant.taskRunId;
    if(task.id!=="M04"){const start=capitalS11TaskStartInput(context,input.grant.recipeId,task.id,projections);taskRunId=uuid.parse(await rpc("worker_start_capital_project_task",{p_task_id:start.taskId,p_executor_key:start.executorKey,p_executor_version:start.executorVersion,p_input_fingerprint:start.inputFingerprint,p_context_manifest:start.contextManifest}));}
    const prelude=["M01","M02","M03"].includes(task.id);
    const allocation=await rpc("worker_prepare_capital_s11_recovered_task_projection_v1",{p_recipe_id:input.grant.recipeId,p_request_id:randomUUID(),p_task_run_id:taskRunId,p_accepted_invocation_id:prelude?null:input.grant.accepted.acceptedInvocationId,p_body:body,p_output_fingerprint:bodyFingerprint,p_parent_retained_payload_id:prelude?input.grant.context.retainedPayloadId:input.grant.parsed.retainedPayloadId});
    const retained=await physical.retain(allocation),projection=capitalS11TaskProjectionReceiptSchema.parse(await rpc("worker_commit_capital_s11_recovered_task_projection_v1",{p_recipe_id:input.grant.recipeId,p_task_run_id:taskRunId,p_retained_payload_id:retained.retainedPayloadId}));
    if(projection.recipeId!==input.grant.recipeId||projection.taskId!==task.id||projection.taskRunId!==taskRunId||projection.retainedPayloadId!==retained.retainedPayloadId)throw new CapitalS11RecoveryGap();projections.set(task.id,projection);
   }
  },
  commit:input=>rpc("worker_commit_capital_s11_recovered_result_v1",{p_recipe_id:input.recipeId,p_accepted_invocation_id:input.acceptedInvocationId,p_parsed_retained_payload_id:input.parsedRetainedPayloadId,p_final_retained_payload_id:input.finalRetainedPayloadId,p_final_fingerprint:input.finalFingerprint,p_quality_results:input.qualityResults}),
  qualityFailure:input=>rpc("worker_record_capital_s11_quality_failure_v1",{p_recipe_id:input.recipeId,p_accepted_invocation_id:input.acceptedInvocationId,p_parsed_retained_payload_id:input.parsedRetainedPayloadId,p_final_retained_payload_id:input.finalRetainedPayloadId,p_final_fingerprint:input.finalFingerprint,p_quality_results:input.qualityResults}),
 };
 return Object.freeze({recover:()=>recoverCapitalS11({jobId:job.job_id,organizationId:job.organization_id,workId:job.payload.capital_project_id},ports,now)});
}
