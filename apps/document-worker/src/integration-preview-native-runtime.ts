import {randomUUID}from"node:crypto";
import type {SupabaseClient}from"@supabase/supabase-js";
import{z}from"zod";
import{preview}from"@offroad/credit-playbook";
import{legacyGatewayFingerprint,type ModelGatewayConfig}from"@offroad/model-gateway";
import{fingerprintJson}from"@offroad/case-understanding";
import{retryCapitalCaptureRpc}from"./capital-capture-rpc-retry";
import{integrationPreviewContextSchema}from"./integration-preview";
import{createCapitalPreviewProcessing}from"./integration-preview-processing";
import{createPreviewProcessingPorts}from"./integration-preview-queue-adapter";
import{createPreviewBodyStorage,type PreviewBodyAuthority}from"./integration-preview-body-storage";
import{readCapitalPreviewBodyBytes}from"./capital-body-read-client";
import{capitalBodyRetentionReceiptSchema}from"./integration-preview-protocol";
import{runFinitePreviewNative,type PreviewNativePipelinePorts}from"./integration-preview-native-pipeline";
import type{ProviderConnections}from"./provider-processing";

const uuid=z.uuid(),hash=z.string().regex(/^[a-f0-9]{64}$/);
const executionSchema=z.strictObject({model:z.string().min(1),modelCalls:z.number().int().nonnegative(),costUsd:z.number().nonnegative(),unknownCostCalls:z.number().int().nonnegative(),latencyMs:z.number().int().nonnegative()});
const usageSchema=executionSchema.omit({model:true});
const commitSchema=z.strictObject({schemaVersion:z.literal("capital-preview-task-commit.v1"),runId:uuid,taskId:z.string(),taskRunId:uuid,role:z.enum(["task_output","decision_contract"]),capitalArtifactId:uuid,artifactFingerprint:hash,artifactVersion:z.number().int().positive(),retainedPayloadId:uuid,semanticFingerprint:hash,replayed:z.boolean()});
const refSchema=z.strictObject({taskId:z.string(),role:z.enum(["task_output","decision_contract"]),capitalArtifactId:uuid,artifactFingerprint:hash,taskRunId:uuid,status:z.enum(["running","succeeded"]),semanticFingerprint:hash,scope:capitalBodyRetentionReceiptSchema});
const recoverySchema=z.discriminatedUnion("state",[z.strictObject({state:z.literal("absent")}),z.strictObject({state:z.literal("partial"),runId:uuid,refs:z.array(refSchema).min(1),usage:usageSchema}),z.strictObject({state:z.literal("completed"),runId:uuid,refs:z.array(refSchema).min(1),consumedBasisFingerprint:hash,usage:usageSchema})]);
/** Source publication ids are explicit operator configuration. Runtime never
 * publishes them, declares rights or treats shipped evidence as a license. */
export function createPreviewNativeRuntime(config:{client:SupabaseClient;authority:PreviewBodyAuthority;publishedBasis?:{organizationId:string;basisId:string};
 connections:ProviderConnections;adapters:ModelGatewayConfig["adapters"];budget:{maxCostUsd:number;maxCalls:number};
 corpusManifest:unknown;extraction:(file:string)=>Promise<Uint8Array>;
 startTask:PreviewNativePipelinePorts["startTask"];now?:()=>number}){
 const{client,authority}=config,args={p_job_id:uuid.parse(authority.jobId),p_capability_token:z.string().min(1).parse(authority.capabilityToken)};
 const rpc=async(name:string,input:Record<string,unknown>)=>{const result=await retryCapitalCaptureRpc(()=>client.rpc(name,{...args,...input}));if(result.error)throw Error("capital_preview_native_command_denied");return result.data;};
 const reader={read:(job:PreviewBodyAuthority,scope:z.infer<typeof capitalBodyRetentionReceiptSchema>)=>readCapitalPreviewBodyBytes(client,job,{allocationId:scope.allocationId},scope)};
 const storage=createPreviewBodyStorage(client,reader,config.now);let runId:string|undefined;const restoredTasks=new Map<string,{ref:z.infer<typeof refSchema>;body:Record<string,unknown>}>();
 const ports:PreviewNativePipelinePorts={
  async begin(){if(!config.publishedBasis)throw Error("capital_preview_published_sources_required");const base=await rpc("worker_prepare_capital_preview_run_v1",{p_publisher_org:uuid.parse(config.publishedBasis.organizationId),p_basis_id:uuid.parse(config.publishedBasis.basisId)});
   const transient=z.object({runId:uuid,canonicalContext:z.string().nullable(),contextScope:capitalBodyRetentionReceiptSchema.nullable().optional()}).parse(base);runId=transient.runId;
   const canonicalContext=transient.canonicalContext??(transient.contextScope?new TextDecoder("utf-8",{fatal:true}).decode((await storage.read(authority,transient.contextScope)).bytes):null);
   if(canonicalContext===null)throw Error("capital_preview_context_unavailable");
   const {contextScope:_scope,...baseFields}=base as Record<string,unknown>;
   return{base:{...baseFields,canonicalContext},context:integrationPreviewContextSchema.parse(JSON.parse(canonicalContext))};},
  extraction:config.extraction,startTask:config.startTask,
  retain:input=>storage.retain(authority,{...input,requestId:randomUUID()}),
  async commit(input){const receipt=commitSchema.parse(await rpc("worker_commit_capital_preview_task_v1",{p_run_id:input.runId,p_task_run_id:input.taskRunId,p_retained_payload_id:input.retainedPayloadId,p_role:input.role}));
   if(receipt.runId!==input.runId||receipt.taskRunId!==input.taskRunId||receipt.taskId!==input.taskId||receipt.retainedPayloadId!==input.retainedPayloadId||receipt.role!==input.role)throw Error("capital_preview_commit_mismatch");return{capitalArtifactId:receipt.capitalArtifactId,artifactFingerprint:receipt.artifactFingerprint};},
  async finishTask(input){z.strictObject({finished:z.literal(true)}).parse(await rpc("worker_finish_capital_preview_task_v1",{p_run_id:input.runId,p_task_run_id:input.taskRunId}));},
  async paid(input){
   if(runId!==input.runId)throw Error("capital_preview_run_mismatch");
   const processingPorts=createPreviewProcessingPorts({client,authority,runId:input.runId,preparation:input.preparation,consumedBasisFingerprint:input.boundaryBasisFingerprint,reader,...(config.now?{now:config.now}:{})});
   const result=await createCapitalPreviewProcessing({jobId:authority.jobId,ports:processingPorts,connections:config.connections,adapters:config.adapters,budget:config.budget,...(config.now?{now:config.now}:{})}).run(input.preparation.boundary);
   const execution=executionSchema.parse(await rpc("worker_capital_preview_boundary_usage_v1",{p_recipe_id:result.retained.binding.recipeId}));
   if(legacyGatewayFingerprint(result.output)!==result.retained.binding.outputFingerprint)throw Error("capital_preview_accepted_mismatch");return{output:result.output,execution};
  },
  async recover(base){restoredTasks.clear();
   const load=async()=>recoverySchema.parse(await rpc("worker_recover_capital_preview_run_v1",{p_run_id:base.runId}));
   const grant=await load();if(grant.state==='absent')return null;
   if(grant.runId!==base.runId)throw Error("capital_preview_recovery_mismatch");
   for(const ref of grant.refs){const physical=await storage.read(authority,ref.scope),body=z.object({schemaVersion:z.literal('capital-preview-json-body.v1'),runId:uuid,taskId:z.string(),role:z.enum(['task_output','decision_contract'])}).passthrough().parse(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(physical.bytes)));
    if(body.runId!==grant.runId||body.taskId!==ref.taskId||body.role!==ref.role||fingerprintJson(body)!==ref.semanticFingerprint)throw Error('capital_preview_recovery_mismatch');if(ref.role==='task_output')restoredTasks.set(ref.taskId,{ref,body});}
   const after=await load();if(fingerprintJson(grant)!==fingerprintJson(after))throw Error('capital_preview_recovery_changed');
   if(grant.state==='partial')return null;
   const finalTaskId=preview.previewStepsForComposition(base.composition).at(-1)?.taskId,last=grant.refs.find(ref=>ref.role==='task_output'&&ref.taskId===finalTaskId);if(!last)throw Error('capital_preview_recovery_incomplete');
   return{capitalArtifactId:last.capitalArtifactId,artifactFingerprint:last.artifactFingerprint,modelCalls:grant.usage.modelCalls,costUsd:grant.usage.costUsd,unknownCostCalls:grant.usage.unknownCostCalls};
  },
  async restoreTask(input){const value=restoredTasks.get(input.taskId);if(!value)return null;
   if(value.body.runId!==input.runId||value.body.inputFingerprint!==input.inputFingerprint)throw Error("capital_preview_partial_input_changed");
   const content=z.object({output:z.unknown()}).parse(value.body.content);
   let execution:z.infer<typeof executionSchema>|undefined;
   if(input.taskId==="A02"){const recipe=z.uuid().parse((await rpc("worker_lookup_capital_preview_boundary_v1",{p_run_id:input.runId,p_boundary:"synthesis"}) as {recipeId:unknown}).recipeId);execution=executionSchema.parse(await rpc("worker_capital_preview_boundary_usage_v1",{p_recipe_id:recipe}));}
   return{output:content.output as preview.PreviewStepOutput,taskRunId:value.ref.taskRunId,capitalArtifactId:value.ref.capitalArtifactId,artifactFingerprint:value.ref.artifactFingerprint,status:value.ref.status,...(execution?{execution}:{})};
  },
  async finalize(input){const receipt=z.strictObject({completed:z.literal(true),runId:uuid}).parse(await rpc('worker_finalize_capital_preview_run_v1',{p_run_id:input.runId,p_consumed_basis:input.consumedBasis}));if(receipt.runId!==input.runId)throw Error('capital_preview_finalize_mismatch');},
 };
 return Object.freeze({run:()=>runFinitePreviewNative(ports,config.corpusManifest,config.now)});
}
