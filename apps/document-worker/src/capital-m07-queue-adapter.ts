import {retryCapitalCaptureRpc} from "./capital-capture-rpc-retry";
/** Native M07 worker commands. SQL owns authority; bodies stay ephemeral or in
 * bounded physical Storage. A missing published source is a gap, never a grant. */
import {createHash, randomUUID} from "node:crypto";
import {z} from "zod";
import type {SupabaseClient} from "@supabase/supabase-js";
import {legacyGatewayFingerprint, prepareGatewayInput, retentionMatrixVersion, type GatewayAcceptedInvocation} from "@offroad/model-gateway";
import {researchSourceSchema, type ResearchSource} from "@offroad/public-research";
import {recoverCapitalM07Existing,type CapitalM07RecoveryTransform} from "./capital-m07-recovery";
import {readCapitalCaptureBytes} from "./capital-body-read-client";
import {openCapitalPublicCaptureAdapter} from "./capital-public-capture-adapter";
import {capitalM07RecipeReceiptSchema, capitalM07FinalOutputFingerprint, type CapitalM07ProcessingPorts, type CapitalM07RetainedOutput} from "./capital-m07-processing";
import {prepareCapitalPublicTaskRecipe, reconstructCapitalPublicTaskRequest, type CapitalPublicRecipeComponent} from "./capital-public-task-recipe";
import {capitalM07CommitReceiptSchema,capitalM07RetentionScopeSchema,capitalM07QualityResultsSchema,capitalM07QualityFailureReceiptSchema,CapitalM07QualityFailure} from "./capital-m07-protocol";
export {capitalM07CommitReceiptSchema} from "./capital-m07-protocol";
export type {CapitalM07CommitReceipt} from "./capital-m07-protocol";
import type {CapitalProjectAnalysisJob} from "./queue";

const hash = z.string().regex(/^[a-f0-9]{64}$/), uuid = z.uuid(), time = z.iso.datetime({offset:true});
const scopeSchema=capitalM07RetentionScopeSchema;
const baseSchema=z.strictObject({schemaVersion:z.literal("capital-m07-base-context.v1"),recipeId:uuid,jobId:uuid,organizationId:uuid,workId:uuid,planId:uuid,
 planFingerprint:hash,asOfDate:z.iso.date(),locale:z.enum(["pt-BR","en-US"]),contextFingerprint:hash,canonicalContext:z.string().min(1),expiresAt:time});
const acceptedSchema=z.strictObject({acceptedInvocationId:uuid,inputReceiptId:uuid,invocationId:uuid,outputFingerprint:hash});
type Scope=z.infer<typeof scopeSchema>;
const sha=(bytes:Uint8Array|string)=>createHash("sha256").update(bytes).digest("hex");
const same=(a:unknown,b:unknown)=>legacyGatewayFingerprint(a)===legacyGatewayFingerprint(b);
export class CapitalM07SourceGap extends Error {readonly code="capital_m07_published_source_required";constructor(){super("capital_m07_published_source_required");}}
export type CapitalM07DeliveredSource={deliveryId:string;source:ResearchSource;retainedPayloadId:string};
export function createCapitalM07QueueAdapter(client:SupabaseClient,job:CapitalProjectAnalysisJob,now:()=>number=Date.now){
 const authority=Object.freeze({jobId:uuid.parse(job.job_id),capabilityToken:z.string().min(1).parse(job.capability_token)});
 const args={p_job_id:authority.jobId,p_capability_token:authority.capabilityToken};
 const rpc=async(name:string,input:Record<string,unknown>={})=>{const result=await retryCapitalCaptureRpc(() => client.rpc(name,{...args,...input}));if(result.error){if(result.error.message==="capital_m07_budget_denied")throw new Error("capital_m07_budget_denied");throw new Error("capital_m07_database_denied");}return result.data as unknown;};
 const live=(scope:Scope)=>{if(scope.path!==`${job.organization_id}/${scope.allocationId}/payload.json`||Date.parse(scope.retainedAt)>=Date.parse(scope.purgeAt)||Date.parse(scope.purgeAt)>=Date.parse(scope.expiresAt)||Date.parse(scope.purgeAt)<=now())throw new Error("capital_m07_retention_denied");};
 const readScope=async(allocationId:string)=>{const scope=scopeSchema.parse(await rpc("worker_read_capital_m07_allocation_v1",{p_allocation_id:allocationId}));live(scope);if(scope.allocationId!==allocationId)throw new Error("capital_m07_scope_denied");return scope;};
 const read=async(expected:Scope)=>{live(expected);const before=await readScope(expected.allocationId);const omit=(s:Scope)=>{const{replayed:_,...v}=s;return v;};if(!same(omit(before),omit(expected)))throw new Error("capital_m07_scope_changed");
  const physical=await readCapitalCaptureBytes(client,authority,before,"m07_body");const after=await readScope(before.allocationId);if(!same(omit(before),omit(after))||physical.bytes.length!==after.byteLength||sha(physical.bytes)!==after.payloadFingerprint)throw new Error("capital_m07_body_changed");return{bytes:physical.bytes,scope:after};};
 const retain=async(prepared:unknown)=>{const value=scopeSchema.extend({canonicalBody:z.string().min(1)}).parse(prepared),{canonicalBody,...rawScope}=value;const scope=scopeSchema.parse(rawScope);live(scope);
  const bytes=Buffer.from(canonicalBody);if(bytes.length!==scope.byteLength||sha(bytes)!==scope.payloadFingerprint)throw new Error("capital_m07_canonical_body_changed");
  if(scope.retentionState==="retained"){await read(scope);return scope;}
  if(Date.parse(scope.uploadExpiresAt)<=now())throw new Error("capital_m07_upload_expired");
  const upload=await client.storage.from(scope.bucket).upload(scope.path,bytes,{contentType:"application/json",cacheControl:"0",upsert:false,
   headers:{"x-offroad-workspace":job.organization_id,"x-offroad-job-id":job.job_id,"x-offroad-capability":job.capability_token}});
  if(upload.error&&Number((upload.error as {statusCode?:unknown}).statusCode)!==409)throw new Error("capital_m07_storage_denied");
  const physical=await readCapitalCaptureBytes(client,authority,scope,"m07_body");
  if(sha(physical.bytes)!==scope.payloadFingerprint||physical.bytes.length!==scope.byteLength)throw new Error("capital_m07_storage_mismatch");
  const retained=scopeSchema.parse(await rpc("worker_commit_capital_m07_body_v1",{p_allocation_id:scope.allocationId,p_storage_object_id:physical.objectId,
   p_storage_version:physical.version,p_verified_sha256:sha(physical.bytes),p_verified_size:physical.bytes.length}));live(retained);
  if(retained.allocationId!==scope.allocationId||retained.retentionState!=="retained"||retained.payloadFingerprint!==scope.payloadFingerprint)throw new Error("capital_m07_commit_mismatch");await read(retained);return retained;};
 let base:z.infer<typeof baseSchema>|undefined,contextScope:Scope|undefined,preparation:Parameters<typeof prepareCapitalPublicTaskRecipe>[0]|undefined,receipt:z.infer<typeof capitalM07RecipeReceiptSchema>|undefined;
 let acceptedId:string|undefined,parsed:CapitalM07RetainedOutput|undefined;
 const needBase=()=>{if(!base||!contextScope?.retainedPayloadId)throw new Error("capital_m07_context_required");return{base,contextScope};};
 const needRecipe=()=>{if(!receipt||!preparation)throw new Error("capital_m07_recipe_required");return{receipt,preparation};};
 const adapter={
  recoverExisting:(transform:CapitalM07RecoveryTransform)=>recoverCapitalM07Existing(client,job,transform,now),
  async begin(){if(base)throw new Error("capital_m07_context_already_captured");base=baseSchema.parse(await rpc("worker_prepare_capital_m07_recipe_v1"));
   if(base.jobId!==job.job_id||base.organizationId!==job.organization_id||base.workId!==job.payload.capital_project_id||base.planId!==job.payload.capital_project_plan_id||sha(base.canonicalContext)!==base.contextFingerprint||Date.parse(base.expiresAt)<=now())throw new Error("capital_m07_context_denied");
   contextScope=await retain(await rpc("worker_prepare_capital_m07_context_v1",{p_recipe_id:base.recipeId,p_request_id:randomUUID()}));
   const physical=await read(contextScope);if(sha(physical.bytes)!==base.contextFingerprint)throw new Error("capital_m07_context_changed");
   return{context:JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(physical.bytes)) as unknown,asOfDate:base.asOfDate,recipeId:base.recipeId};},
  async captureSources(sources:readonly ResearchSource[]):Promise<CapitalM07DeliveredSource[]>{needBase();if(sources.length===0)throw new CapitalM07SourceGap();const capture=await openCapitalPublicCaptureAdapter(client,authority,now),delivered:CapitalM07DeliveredSource[]=[];
   for(const raw of sources){const source=researchSourceSchema.strict().parse(structuredClone(raw));const{contentAcquisition:_,publishedAt,...payload}=source;
    const result=await capture.deliver({deliveryKey:`m07:${source.topic}:${source.contentHash}`,requestId:randomUUID(),payload:{...payload,...(publishedAt===null?{}:{publishedAt})}});
    if(result.state!=="retained")throw new CapitalM07SourceGap();
    // Model input uses only the physically retained published payload. Acquisition
    // metadata absent from the licensed payload cannot silently enter the recipe.
    const reconstructed=researchSourceSchema.strict().parse({...result.payload,publishedAt:result.payload.publishedAt??null});
    delivered.push({deliveryId:result.deliveryId,source:reconstructed,retainedPayloadId:result.retention.retainedPayloadId});}
   return delivered;},
  async seal(input:{system:string;components:readonly CapitalPublicRecipeComponent[];budget:{maxCostUsd:number;maxCalls:number;researchReserveUsd:number}}){const state=needBase();preparation={basis:{jobId:state.base.jobId,organizationId:state.base.organizationId,workId:state.base.workId,planId:state.base.planId,
    planFingerprint:state.base.planFingerprint,locale:state.base.locale,asOfDate:state.base.asOfDate},components:input.components,system:input.system};
   const reconstruction=prepareCapitalPublicTaskRecipe(preparation);const prepared=prepareGatewayInput({...reconstruction.prepared.request,requireInputAttestation:true,outputMode:"structured",timeoutMs:360000,
    dataHandling:{classification:"confidential",purpose:"case_analysis",requiredPolicyVersion:retentionMatrixVersion}});
   const actual={...reconstruction,prepared};const routes=[{provider:"openai" as const,model:"gpt-5.6-sol",effort:"high" as const},{provider:"openai" as const,model:"gpt-5.6-terra",effort:"high" as const}];
   const pins=routes.map(route=>reconstructCapitalPublicTaskRequest(actual,route,{maxOutputTokens:24000,timeoutMs:360000}));
   receipt=capitalM07RecipeReceiptSchema.parse(await rpc("worker_finalize_capital_m07_recipe_v1",{p_recipe_id:state.base.recipeId,p_context_retained_payload_id:state.contextScope.retainedPayloadId,
    p_components:reconstruction.recipe.components,p_reconstruction_fingerprint:prepared.inputFingerprint,p_prompt_fingerprint:pins[0]!.promptFingerprint,
    p_primary_request_fingerprint:pins[0]!.requestFingerprintV1,p_fallback_request_fingerprint:pins[1]!.requestFingerprintV1,
    p_operator_budget_micro_usd:Math.floor(Math.min(3,input.budget.maxCostUsd)*1000000),p_operator_max_dispatches:Math.min(2,input.budget.maxCalls),p_research_status:(input.components.find(value=>value.slot==="research")?.body as {status:string}).status}));
   if(receipt.jobId!==job.job_id||receipt.recipeId!==state.base.recipeId||!same(receipt.components,reconstruction.recipe.components)||receipt.reconstructionFingerprint!==prepared.inputFingerprint)throw new Error("capital_m07_recipe_mismatch");return receipt;},
  async commitFinal(input:{body:unknown;quality:readonly{id:string;passed:boolean}[]}){const state=needRecipe();if(!acceptedId||!parsed?.scope.retainedPayloadId)throw new Error("capital_m07_parsed_required");
   const qualityResults=capitalM07QualityResultsSchema.parse(input.quality.map(({id,passed})=>({id,passed})));
   const finalFingerprint=capitalM07FinalOutputFingerprint(parsed.binding.outputFingerprint,state.receipt.recipeFingerprint,input.body);
   const finalScope=await retain(await rpc("worker_prepare_capital_m07_output_v1",{p_recipe_id:state.receipt.recipeId,p_request_id:randomUUID(),p_kind:"final",p_accepted_invocation_id:acceptedId,
    p_body:input.body,p_output_fingerprint:finalFingerprint,p_parent_retained_payload_id:parsed.scope.retainedPayloadId}));
   if(qualityResults.some(value=>!value.passed)){
    const failed=capitalM07QualityFailureReceiptSchema.parse(await rpc("worker_record_capital_m07_quality_failure_v1",{p_recipe_id:state.receipt.recipeId,p_accepted_invocation_id:acceptedId,p_parsed_retained_payload_id:parsed.scope.retainedPayloadId,
     p_final_retained_payload_id:finalScope.retainedPayloadId,p_final_fingerprint:finalFingerprint,p_quality_results:qualityResults}));
    if(failed.recipeId!==state.receipt.recipeId||failed.taskRunId!==state.receipt.taskRunId||!same(failed.qualityFailure,{schemaVersion:"capital-m07-quality-failure.v1",acceptedInvocationId:acceptedId,parsedRetainedPayloadId:parsed.scope.retainedPayloadId,finalRetainedPayloadId:finalScope.retainedPayloadId,finalFingerprint,qualityResults}))throw new Error("capital_m07_quality_failure_mismatch");
    throw new CapitalM07QualityFailure();
   }
   const result=capitalM07CommitReceiptSchema.parse(await rpc("worker_commit_capital_m07_result_v1",{p_recipe_id:state.receipt.recipeId,p_accepted_invocation_id:acceptedId,p_parsed_retained_payload_id:parsed.scope.retainedPayloadId,
    p_final_retained_payload_id:finalScope.retainedPayloadId,p_final_fingerprint:finalFingerprint,p_quality_results:qualityResults}));
   if(result.recipeId!==state.receipt.recipeId||result.taskRunId!==state.receipt.taskRunId||result.finalFingerprint!==finalFingerprint)throw new Error("capital_m07_result_mismatch");return {...result,finalRetainedPayloadId:uuid.parse(finalScope.retainedPayloadId)};},
 };
 const ports:CapitalM07ProcessingPorts={
  async loadRecipe(taskRunId){const state=needRecipe();if(state.receipt.taskRunId!==taskRunId)throw new Error("capital_m07_task_mismatch");return state;},
  async revalidateRecipe(expected){const state=needRecipe();if(!same(state.receipt,expected))throw new Error("capital_m07_recipe_changed");return rpc("worker_revalidate_capital_m07_recipe_v1",{p_recipe_id:expected.recipeId});},
  async recoverAccepted(){return null;}, // Native same-job body recovery is attached only after a server grant, never guessed.
  authorize:input=>rpc("worker_authorize_capital_m07_processing_v1",{p_recipe_id:input.recipeId,p_attempt:input.attempt,p_route:input.route,p_resources:input.resources,p_purpose:input.purpose}),
  dispatch:id=>rpc("worker_record_capital_m07_input_v1",{p_attempt_receipt_id:id}),
  outcome:(id,outcome)=>rpc("worker_record_capital_m07_attempt_outcome_v1",{p_attempt_receipt_id:id,p_outcome:outcome}),
  async retainAccepted(input){const accepted=acceptedSchema.parse(await rpc("worker_record_capital_m07_accepted_v1",{p_input_receipt_id:input.accepted.inputAttestationReceiptId,p_accepted:input.accepted}));
   if(accepted.inputReceiptId!==input.accepted.inputAttestationReceiptId||accepted.invocationId!==input.accepted.invocationId||accepted.outputFingerprint!==input.accepted.outputFingerprint)throw new Error("capital_m07_accepted_mismatch");
   acceptedId=accepted.acceptedInvocationId;const scope=await retain(await rpc("worker_prepare_capital_m07_output_v1",{p_recipe_id:input.recipe.recipeId,p_request_id:randomUUID(),p_kind:"parsed",
    p_accepted_invocation_id:acceptedId,p_body:input.output,p_output_fingerprint:accepted.outputFingerprint,p_parent_retained_payload_id:null}));
   parsed={binding:{recipeId:input.recipe.recipeId,invocationId:accepted.invocationId,inputReceiptId:accepted.inputReceiptId,outputFingerprint:accepted.outputFingerprint},scope};return parsed;},
  recordExecutionFailure:input=>rpc("worker_record_capital_m07_execution_failure_v1",{p_recipe_id:input.recipeId,p_reason:input.reason,p_outcome_ids:null}),
  readAccepted:output=>read(scopeSchema.parse(output.scope)),
 };
 return Object.freeze({...adapter,ports});
}
export type CapitalM07QueueAdapter=ReturnType<typeof createCapitalM07QueueAdapter>;
