/** Actual SDK commands for S11 recovery. No model SDK or dispatch command. */
import {createHash,randomUUID} from "node:crypto";
import {z} from "zod";
import type {SupabaseClient} from "@supabase/supabase-js";
import {companyDebtDiagnosticSchema} from "@offroad/domain-contracts";
import {legacyGatewayFingerprint} from "@offroad/model-gateway";
import {readCapitalDebtBodyBytes,readCapitalDebtRecoveryBytes,readCapitalDebtRecoverySourceBytes,readCapitalDebtRecoveredTaskBytes} from "./capital-body-read-client";
import {createCapitalCompanyDebtPhysicalStore} from "./capital-company-debt-physical-store";
import {recoverCapitalCompanyDebt,capitalCompanyDebtRecoveryGrantSchema,capitalCompanyDebtRecoverySourceScopeSchema,type CapitalCompanyDebtRecoveryPorts,CapitalCompanyDebtRecoveryGap} from "./capital-company-debt-recovery";
import {capitalCompanyDebtRetentionScopeSchema,capitalCompanyDebtTaskProjectionReceiptSchema,type CapitalCompanyDebtTaskProjectionReceipt} from "./capital-company-debt-protocol";
import {companyDebtContextSchema} from "./company-debt-view";
import {capitalCompanyDebtTaskStartInput} from "./capital-company-debt-native-consumer";
import {capitalCompanyDebtPreludeProduct,capitalCompanyDebtDerivedProduct,capitalCompanyDebtPreludeIds,capitalCompanyDebtDerivedIds} from "./capital-company-debt-task-products";
import {retryCapitalCaptureRpc} from "./capital-capture-rpc-retry";
import type {CapitalProjectAnalysisJob} from "./queue";
const uuid=z.uuid(),scopeSchema=capitalCompanyDebtRetentionScopeSchema;
const projectionStateSchema=z.strictObject({schemaVersion:z.literal("capital-debt-recovered-projection-state.v1"),recipeId:uuid,taskId:z.string().regex(/^[A-Z][0-9]{2}$/),state:z.enum(["absent","present"]),projection:capitalCompanyDebtTaskProjectionReceiptSchema.nullable(),body:scopeSchema.nullable()});
const same=(a:unknown,b:unknown)=>legacyGatewayFingerprint(a)===legacyGatewayFingerprint(b),sha=(bytes:Uint8Array)=>createHash("sha256").update(bytes).digest("hex");
export function createCapitalCompanyDebtRecoveryQueueAdapter(client:SupabaseClient,job:CapitalProjectAnalysisJob,now:()=>number=Date.now){
 const authority=Object.freeze({jobId:uuid.parse(job.job_id),capabilityToken:z.string().min(1).parse(job.capability_token)});
 const rpc=async(name:string,input:Record<string,unknown>={})=>{const args={p_job_id:authority.jobId,p_capability_token:authority.capabilityToken,...input};const result=await retryCapitalCaptureRpc(()=>client.rpc(name,args));if(result.error)throw new CapitalCompanyDebtRecoveryGap();return result.data as unknown;};
 const physical=createCapitalCompanyDebtPhysicalStore(client,job,(auth,scope)=>readCapitalDebtBodyBytes(client,auth,{recipeId:needRecipe()},scope),now);
 let recipeId:string|undefined;
 const needRecipe=()=>{if(!recipeId)throw new CapitalCompanyDebtRecoveryGap();return recipeId;};
 const ports:CapitalCompanyDebtRecoveryPorts={
  discover:()=>rpc("worker_find_capital_debt_recovery_v1"),
  async grant(id){const grant=capitalCompanyDebtRecoveryGrantSchema.parse(await rpc("worker_recover_capital_debt_result_v1",{p_recipe_id:id}));if(grant.recipeId!==id||(recipeId&&recipeId!==id))throw new CapitalCompanyDebtRecoveryGap();recipeId=id;return grant;},
  async readBody(expected){const id=needRecipe(),input={p_recipe_id:id,p_retained_payload_id:expected.retainedPayloadId};
   const before=scopeSchema.parse(await rpc("worker_read_capital_debt_recovery_body_v1",input));
   const read=await readCapitalDebtRecoveryBytes(client,authority,{recipeId:id,retainedPayloadId:uuid.parse(expected.retainedPayloadId)},before);
   const after=scopeSchema.parse(await rpc("worker_read_capital_debt_recovery_body_v1",input));
   if(!same(before,after)||read.objectId!==after.storageObjectId||read.version!==after.storageVersion)throw new CapitalCompanyDebtRecoveryGap();return{bytes:read.bytes,scope:after};},
  async readSource(reference){const id=needRecipe(),input={p_recipe_id:id,p_retained_payload_id:reference.retainedPayloadId};
   const before=capitalCompanyDebtRecoverySourceScopeSchema.parse(await rpc("worker_read_capital_debt_recovery_source_v1",input));
   const read=await readCapitalDebtRecoverySourceBytes(client,authority,{recipeId:id,retainedPayloadId:reference.retainedPayloadId},before);
   const after=capitalCompanyDebtRecoverySourceScopeSchema.parse(await rpc("worker_read_capital_debt_recovery_source_v1",input));
   if(!same(before,after)||read.objectId!==after.storageObjectId||read.version!==after.storageVersion)throw new CapitalCompanyDebtRecoveryGap();return{bytes:read.bytes,scope:after};},
  retainFinal:async input=>physical.retain(await rpc("worker_prepare_capital_debt_recovered_output_v1",{p_recipe_id:input.recipeId,p_request_id:randomUUID(),p_kind:"final",p_accepted_invocation_id:input.acceptedInvocationId,p_body:input.body,p_output_fingerprint:input.finalFingerprint,p_parent_retained_payload_id:input.parentRetainedPayloadId})),
  async deriveTasks(input){if(companyDebtContextSchema.parse(input.originalContext).revision)return;
   const context=companyDebtContextSchema.parse(input.originalContext),parsed=companyDebtDiagnosticSchema.parse(input.parsed),name=context.session.company_profile.name,website=context.session.company_profile.website;
   if(typeof name!=="string"||!name.trim()||!input.grant.accepted||!input.grant.parsed?.retainedPayloadId)throw new CapitalCompanyDebtRecoveryGap();
   const projections=new Map<string,CapitalCompanyDebtTaskProjectionReceipt>();
   for(const task of context.tasks){if(task.id==="C11")continue;
    const company={name:name.trim(),website:typeof website==='string'&&website.trim()?website.trim():null};
    const prelude=capitalCompanyDebtPreludeIds.includes(task.id as typeof capitalCompanyDebtPreludeIds[number]);
    const artifact=prelude?capitalCompanyDebtPreludeProduct(task.id as typeof capitalCompanyDebtPreludeIds[number],{context,company,maxDispatches:input.grant.recipe.operationalBudget.maxDispatches}):capitalCompanyDebtDerivedProduct(task.id as typeof capitalCompanyDebtDerivedIds[number],{company,diagnostic:parsed,research:{status:input.grant.reconstructionMetadata.researchStatus,researchRunId:input.grant.recipeId,sources:input.sources}});
    const body={schemaVersion:'company-debt-task.v1',taskId:task.id,artifactType:artifact.type,content:artifact.content},bodyFingerprint=legacyGatewayFingerprint(body);
    const lookup=()=>rpc("worker_load_capital_debt_recovered_projection_state_v1",{p_recipe_id:input.grant.recipeId,p_task_id:task.id});
    const state=projectionStateSchema.parse(await lookup());if(state.recipeId!==input.grant.recipeId||state.taskId!==task.id)throw new CapitalCompanyDebtRecoveryGap();
    if(state.state==="present"){
     if(!state.projection||!state.body?.retainedPayloadId||state.projection.taskId!==task.id||state.projection.recipeId!==input.grant.recipeId||state.projection.retainedPayloadId!==state.body.retainedPayloadId)throw new CapitalCompanyDebtRecoveryGap();
     const bytes=await readCapitalDebtRecoveredTaskBytes(client,authority,{recipeId:input.grant.recipeId,taskRunId:state.projection.taskRunId},state.body);
     const after=projectionStateSchema.parse(await lookup());
     if(!same(state,after)||bytes.bytes.length!==state.body.byteLength||sha(bytes.bytes)!==state.body.payloadFingerprint||bytes.objectId!==state.body.storageObjectId||bytes.version!==state.body.storageVersion||legacyGatewayFingerprint(JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes.bytes)))!==bodyFingerprint)throw new CapitalCompanyDebtRecoveryGap();
     projections.set(task.id,state.projection);continue;
    }
    if(state.body!==null||state.projection!==null)throw new CapitalCompanyDebtRecoveryGap();
    // Execution plan and its five predecessors existed before the accepted
    // invocation. Absence cannot manufacture them under a recovery principal.
    if(prelude)throw new CapitalCompanyDebtRecoveryGap();
    const start=capitalCompanyDebtTaskStartInput(context,input.grant.recipeId,task.id,projections);
    const taskRunId=uuid.parse(await rpc('worker_start_capital_project_task',{p_task_id:start.taskId,p_executor_key:start.executorKey,p_executor_version:start.executorVersion,p_input_fingerprint:start.inputFingerprint,p_context_manifest:start.contextManifest}));
    const allocation=await rpc("worker_prepare_capital_debt_recovered_task_projection_v1",{p_recipe_id:input.grant.recipeId,p_request_id:randomUUID(),p_task_run_id:taskRunId,p_accepted_invocation_id:input.grant.accepted.acceptedInvocationId,p_body:body,p_output_fingerprint:bodyFingerprint,p_parent_retained_payload_id:input.grant.parsed.retainedPayloadId});
    const retained=await physical.retain(allocation),projection=capitalCompanyDebtTaskProjectionReceiptSchema.parse(await rpc("worker_commit_capital_debt_recovered_task_projection_v1",{p_recipe_id:input.grant.recipeId,p_task_run_id:taskRunId,p_retained_payload_id:retained.retainedPayloadId}));
    if(projection.recipeId!==input.grant.recipeId||projection.taskId!==task.id||projection.taskRunId!==taskRunId||projection.retainedPayloadId!==retained.retainedPayloadId)throw new CapitalCompanyDebtRecoveryGap();projections.set(task.id,projection);
   }
  },
  commit:input=>rpc("worker_commit_capital_debt_recovered_result_v1",{p_recipe_id:input.recipeId,p_accepted_invocation_id:input.acceptedInvocationId,p_parsed_retained_payload_id:input.parsedRetainedPayloadId,p_final_retained_payload_id:input.finalRetainedPayloadId,p_final_fingerprint:input.finalFingerprint,p_quality_results:input.qualityResults}),
  qualityFailure:input=>rpc("worker_record_capital_debt_quality_failure_v1",{p_recipe_id:input.recipeId,p_accepted_invocation_id:input.acceptedInvocationId,p_parsed_retained_payload_id:input.parsedRetainedPayloadId,p_final_retained_payload_id:input.finalRetainedPayloadId,p_final_fingerprint:input.finalFingerprint,p_quality_results:input.qualityResults}),
 };
 return Object.freeze({recover:()=>recoverCapitalCompanyDebt({jobId:job.job_id,organizationId:job.organization_id,workId:job.payload.capital_project_id},ports,now)});
}
