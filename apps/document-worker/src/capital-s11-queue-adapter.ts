/** Prospective native S11 worker commands. Selected only by the explicit native runtime after joint deployment. SQL owns authority; bodies stay ephemeral or in
 * bounded physical Storage. A missing published source is a gap, never a grant. */
import {createHash, randomUUID} from "node:crypto";
import {z} from "zod";
import type {SupabaseClient} from "@supabase/supabase-js";
import {legacyGatewayFingerprint, prepareGatewayInput, retentionMatrixVersion, type GatewayAcceptedInvocation} from "@offroad/model-gateway";
import {researchSourceSchema, type ResearchSource} from "@offroad/public-research";
import {openCapitalPublicCaptureAdapter} from "./capital-public-capture-adapter";
import {capitalS11RecipeReceiptSchema, capitalS11FinalOutputFingerprint, type CapitalS11ProcessingPorts, type CapitalS11RetainedOutput} from "./capital-s11-processing";
import {prepareCapitalS11Recipe, capitalS11ExecutionPins,capitalS11DispatchPins, type CapitalS11Component} from "./capital-s11-recipe";
import {capitalS11CommitReceiptSchema,capitalS11TaskProjectionReceiptSchema,capitalS11RetentionScopeSchema,capitalS11QualityResultsSchema,capitalS11QualityFailureReceiptSchema,CapitalS11QualityFailure} from "./capital-s11-protocol";
export {capitalS11CommitReceiptSchema} from "./capital-s11-protocol";
export type {CapitalS11CommitReceipt} from "./capital-s11-protocol";
import type {CapitalProjectAnalysisJob} from "./queue";
import {createCapitalS11PhysicalStore} from "./capital-s11-physical-store";
import type {loadCapitalS11RevisionInput} from "./capital-s11-revision-input";
import {retryCapitalCaptureRpc} from "./capital-capture-rpc-retry";

const hash = z.string().regex(/^[a-f0-9]{64}$/), uuid = z.uuid(), time = z.iso.datetime({offset:true});
const scopeSchema=capitalS11RetentionScopeSchema;
const baseSchema=z.strictObject({schemaVersion:z.literal("capital-s11-base-context.v1"),recipeId:uuid,jobId:uuid,organizationId:uuid,workId:uuid,planId:uuid,
 planFingerprint:hash,asOfDate:z.iso.date(),locale:z.enum(["pt-BR","en-US"]),contextFingerprint:hash,canonicalContext:z.string().min(1),expiresAt:time});
const acceptedSchema=z.strictObject({acceptedInvocationId:uuid,inputReceiptId:uuid,invocationId:uuid,outputFingerprint:hash});
type Scope=z.infer<typeof scopeSchema>;
const sha=(bytes:Uint8Array|string)=>createHash("sha256").update(bytes).digest("hex");
const same=(a:unknown,b:unknown)=>legacyGatewayFingerprint(a)===legacyGatewayFingerprint(b);
export class CapitalS11SourceGap extends Error {readonly code="capital_s11_published_source_required";constructor(){super("capital_s11_published_source_required");}}
export type CapitalS11DeliveredSource={deliveryId:string;source:ResearchSource;retainedPayloadId:string};
export function createCapitalS11QueueAdapter(client:SupabaseClient,job:CapitalProjectAnalysisJob,readBytes:(authority:{jobId:string;capabilityToken:string},scope:Scope)=>Promise<{bytes:Uint8Array;objectId:string;version:string}>,now:()=>number=Date.now,revision?:{load:()=>Promise<Awaited<ReturnType<typeof loadCapitalS11RevisionInput>>>}){
 const authority=Object.freeze({jobId:uuid.parse(job.job_id),capabilityToken:z.string().min(1).parse(job.capability_token)});
 const args={p_job_id:authority.jobId,p_capability_token:authority.capabilityToken};
 const rpc=async(name:string,input:Record<string,unknown>={})=>{const fixedArgs={...args,...input};const result=await retryCapitalCaptureRpc(()=>client.rpc(name,fixedArgs));if(result.error){if(result.error.message==="capital_s11_budget_denied")throw new Error("capital_s11_budget_denied");throw new Error("capital_s11_database_denied");}return result.data as unknown;};
 const {retain,read}=createCapitalS11PhysicalStore(client,job,readBytes,now);
 let base:z.infer<typeof baseSchema>|undefined,contextScope:Scope|undefined,preparation:Parameters<typeof prepareCapitalS11Recipe>[0]|undefined,receipt:z.infer<typeof capitalS11RecipeReceiptSchema>|undefined;
 let revisionInput:Awaited<ReturnType<typeof loadCapitalS11RevisionInput>>|undefined;
 let acceptedId:string|undefined,parsed:CapitalS11RetainedOutput|undefined;
 const needBase=()=>{if(!base||!contextScope?.retainedPayloadId)throw new Error("capital_s11_context_required");return{base,contextScope};};
 const needRecipe=()=>{if(!receipt||!preparation)throw new Error("capital_s11_recipe_required");return{receipt,preparation};};
 const adapter={
  async begin(){if(base)throw new Error("capital_s11_context_already_captured");
   if(job.payload.revision_of_artifact_id){if(!revision)throw new Error("capital_s11_revision_physical_input_required");revisionInput=await revision.load();}
   else if(revision)throw new Error("capital_s11_revision_job_required");
   const physicalArgs=revisionInput?{p_prior_body:revisionInput.priorBody,p_predecessor_bodies:revisionInput.predecessors.map(p=>({taskRunId:p.projection.taskRunId,body:p.body}))}:{};
   base=baseSchema.parse(await rpc(revisionInput?"worker_prepare_capital_s11_revision_recipe_v1":"worker_prepare_capital_s11_recipe_v1",physicalArgs));
   if(base.jobId!==job.job_id||base.organizationId!==job.organization_id||base.workId!==job.payload.capital_project_id||base.planId!==job.payload.capital_project_plan_id||sha(base.canonicalContext)!==base.contextFingerprint||Date.parse(base.expiresAt)<=now())throw new Error("capital_s11_context_denied");
   contextScope=await retain(await rpc(revisionInput?"worker_prepare_capital_s11_revision_context_v1":"worker_prepare_capital_s11_context_v1",{p_recipe_id:base.recipeId,p_request_id:randomUUID(),...physicalArgs}));
   const physical=await read(contextScope);if(sha(physical.bytes)!==base.contextFingerprint)throw new Error("capital_s11_context_changed");
   return{context:JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(physical.bytes)) as unknown,asOfDate:base.asOfDate,recipeId:base.recipeId,...(revisionInput?{revisionInput}: {})};},
  async captureSources(sources:readonly ResearchSource[]):Promise<CapitalS11DeliveredSource[]>{needBase();if(sources.length===0)throw new CapitalS11SourceGap();const capture=await openCapitalPublicCaptureAdapter(client,authority,now),delivered:CapitalS11DeliveredSource[]=[];
   for(const raw of sources){const source=researchSourceSchema.strict().parse(structuredClone(raw));const{contentAcquisition:_,publishedAt,...payload}=source;
    const result=await capture.deliver({deliveryKey:`s11:${source.topic}:${source.contentHash}`,requestId:randomUUID(),payload:{...payload,...(publishedAt===null?{}:{publishedAt})}});
    if(result.state!=="retained")throw new CapitalS11SourceGap();
    // Model input uses only the physically retained published payload. Acquisition
    // metadata absent from the licensed payload cannot silently enter the recipe.
    const reconstructed=researchSourceSchema.strict().parse({...result.payload,publishedAt:result.payload.publishedAt??null});
    delivered.push({deliveryId:result.deliveryId,source:reconstructed,retainedPayloadId:result.retention.retainedPayloadId});}
   return delivered;},
  async seal(input:{components:readonly CapitalS11Component[];budget:{maxCostUsd:number;maxCalls:number;researchReserveUsd:number}}){const state=needBase();preparation={basis:{jobId:state.base.jobId,organizationId:state.base.organizationId,workId:state.base.workId,planId:state.base.planId,
    planFingerprint:state.base.planFingerprint,locale:state.base.locale,asOfDate:state.base.asOfDate},components:input.components};
   const reconstruction=prepareCapitalS11Recipe(preparation);const prepared=prepareGatewayInput({...reconstruction.prepared.request,requireInputAttestation:true,outputMode:"structured",timeoutMs:240000,
    dataHandling:{classification:"confidential",purpose:"case_analysis",requiredPolicyVersion:retentionMatrixVersion}});
   const actual={...reconstruction,prepared};const routes=[{provider:"anthropic" as const,model:"claude-sonnet-5",effort:"medium" as const},{provider:"openai" as const,model:"gpt-5.6-terra",effort:"medium" as const}];
   const pins=routes.map(route=>capitalS11ExecutionPins(actual,route));
   routes.forEach(route=>capitalS11DispatchPins(actual,route));
   receipt=capitalS11RecipeReceiptSchema.parse(await rpc("worker_finalize_capital_s11_recipe_v1",{p_recipe_id:state.base.recipeId,p_context_retained_payload_id:state.contextScope.retainedPayloadId,
    p_components:reconstruction.recipe.components,p_reconstruction_fingerprint:prepared.inputFingerprint,p_prompt_fingerprint:pins[0]!.promptFingerprint,
    p_primary_request_fingerprint:pins[0]!.requestFingerprint,p_fallback_request_fingerprint:pins[1]!.requestFingerprint,
    p_operator_budget_micro_usd:Math.floor(Math.min(3,input.budget.maxCostUsd)*1000000),p_operator_max_dispatches:Math.min(2,input.budget.maxCalls),p_research_status:(input.components.find(value=>value.slot==="research")?.body as {status:string}).status,
    p_jurisdiction:(input.components.find(value=>value.slot==="research")?.body as {jurisdiction:string}).jurisdiction,
    p_jurisdiction_needs_confirmation:(input.components.find(value=>value.slot==="research")?.body as {jurisdictionNeedsConfirmation:boolean}).jurisdictionNeedsConfirmation,
    p_strategy_fingerprint:(input.components.find(value=>value.slot==="research")?.body as {strategyFingerprint:string}).strategyFingerprint}));
   if(receipt.jobId!==job.job_id||receipt.recipeId!==state.base.recipeId||!same(receipt.components,reconstruction.recipe.components)||receipt.reconstructionFingerprint!==prepared.inputFingerprint)throw new Error("capital_s11_recipe_mismatch");return receipt;},
  async retainTaskProjection(input:{taskId:string;taskRunId:string;body:unknown;semanticFingerprint:string}){
   const state=needBase(),prelude=["M01","M02","M03"].includes(input.taskId);
   if(!prelude&&(!acceptedId||!parsed?.scope.retainedPayloadId))throw new Error("capital_s11_parsed_required");
   const parent=prelude?state.contextScope.retainedPayloadId:parsed!.scope.retainedPayloadId;
   const prepared=await rpc("worker_prepare_capital_s11_task_projection_v1",{p_recipe_id:state.base.recipeId,p_request_id:randomUUID(),p_task_run_id:uuid.parse(input.taskRunId),
    p_accepted_invocation_id:prelude?null:acceptedId,p_body:input.body,p_output_fingerprint:hash.parse(input.semanticFingerprint),p_parent_retained_payload_id:parent});
   const scope=await retain(prepared);
   const result=capitalS11TaskProjectionReceiptSchema.parse(await rpc("worker_commit_capital_s11_task_projection_v1",{
     p_recipe_id:state.base.recipeId,p_task_run_id:input.taskRunId,p_retained_payload_id:scope.retainedPayloadId}));
   if(result.recipeId!==state.base.recipeId||result.taskId!==input.taskId||result.taskRunId!==input.taskRunId||result.retainedPayloadId!==scope.retainedPayloadId)throw new Error("capital_s11_task_projection_mismatch");return result;
  },
  async commitFinal(input:{body:unknown;quality:readonly{id:string;passed:boolean}[];deriveTasks:()=>Promise<void>}){const state=needRecipe();if(!acceptedId||!parsed?.scope.retainedPayloadId)throw new Error("capital_s11_parsed_required");
   const qualityResults=capitalS11QualityResultsSchema.parse(input.quality.map(({id,passed})=>({id,passed})));
   const finalFingerprint=capitalS11FinalOutputFingerprint(parsed.binding.outputFingerprint,state.receipt.recipeFingerprint,input.body);
   const finalScope=await retain(await rpc("worker_prepare_capital_s11_output_v1",{p_recipe_id:state.receipt.recipeId,p_request_id:randomUUID(),p_kind:"final",p_accepted_invocation_id:acceptedId,
    p_body:input.body,p_output_fingerprint:finalFingerprint,p_parent_retained_payload_id:parsed.scope.retainedPayloadId}));
   if(qualityResults.some(value=>!value.passed)){
    const failed=capitalS11QualityFailureReceiptSchema.parse(await rpc("worker_record_capital_s11_quality_failure_v1",{p_recipe_id:state.receipt.recipeId,p_accepted_invocation_id:acceptedId,p_parsed_retained_payload_id:parsed.scope.retainedPayloadId,
     p_final_retained_payload_id:finalScope.retainedPayloadId,p_final_fingerprint:finalFingerprint,p_quality_results:qualityResults}));
    if(failed.recipeId!==state.receipt.recipeId||failed.taskRunId!==state.receipt.producerTaskRunId||!same(failed.qualityFailure,{schemaVersion:"capital-s11-quality-failure.v1",acceptedInvocationId:acceptedId,parsedRetainedPayloadId:parsed.scope.retainedPayloadId,finalRetainedPayloadId:finalScope.retainedPayloadId,finalFingerprint,qualityResults}))throw new Error("capital_s11_quality_failure_mismatch");
    throw new CapitalS11QualityFailure();
   }
   // Four graders and finite parsed/final bytes are fixed before M04 succeeds.
   // A failed grader terminalizes the running producer; no derived task is published.
   await input.deriveTasks();
   const result=capitalS11CommitReceiptSchema.parse(await rpc("worker_commit_capital_s11_result_v1",{p_recipe_id:state.receipt.recipeId,p_accepted_invocation_id:acceptedId,p_parsed_retained_payload_id:parsed.scope.retainedPayloadId,
    p_final_retained_payload_id:finalScope.retainedPayloadId,p_final_fingerprint:finalFingerprint,p_quality_results:qualityResults}));
   if(result.recipeId!==state.receipt.recipeId||result.producerTaskRunId!==state.receipt.producerTaskRunId||result.taskRunId===state.receipt.producerTaskRunId||result.finalFingerprint!==finalFingerprint)throw new Error("capital_s11_result_mismatch");return {...result,finalRetainedPayloadId:uuid.parse(finalScope.retainedPayloadId)};},
 };
 const ports:CapitalS11ProcessingPorts={
  async loadRecipe(taskRunId){const state=needRecipe();if(state.receipt.producerTaskRunId!==taskRunId)throw new Error("capital_s11_task_mismatch");return state;},
  async revalidateRecipe(expected){const state=needRecipe();if(!same(state.receipt,expected))throw new Error("capital_s11_recipe_changed");return rpc("worker_revalidate_capital_s11_recipe_v1",{p_recipe_id:expected.recipeId});},
  async recoverAccepted(){return null;}, // Native same-job body recovery is attached only after a server grant, never guessed.
  authorize:input=>rpc("worker_authorize_capital_s11_processing_v1",{p_recipe_id:input.recipeId,p_attempt:input.attempt,p_route:input.route,p_resources:input.resources,p_purpose:input.purpose}),
  dispatch:id=>rpc("worker_record_capital_s11_input_v1",{p_attempt_receipt_id:id}),
  outcome:(id,outcome)=>rpc("worker_record_capital_s11_attempt_outcome_v1",{p_attempt_receipt_id:id,p_outcome:outcome}),
  async retainAccepted(input){const accepted=acceptedSchema.parse(await rpc("worker_record_capital_s11_accepted_v1",{p_input_receipt_id:input.accepted.inputAttestationReceiptId,p_accepted:input.accepted}));
   if(accepted.inputReceiptId!==input.accepted.inputAttestationReceiptId||accepted.invocationId!==input.accepted.invocationId||accepted.outputFingerprint!==input.accepted.outputFingerprint)throw new Error("capital_s11_accepted_mismatch");
   acceptedId=accepted.acceptedInvocationId;const scope=await retain(await rpc("worker_prepare_capital_s11_output_v1",{p_recipe_id:input.recipe.recipeId,p_request_id:randomUUID(),p_kind:"parsed",
    p_accepted_invocation_id:acceptedId,p_body:input.output,p_output_fingerprint:accepted.outputFingerprint,p_parent_retained_payload_id:null}));
   parsed={binding:{recipeId:input.recipe.recipeId,invocationId:accepted.invocationId,inputReceiptId:accepted.inputReceiptId,outputFingerprint:accepted.outputFingerprint},scope};return parsed;},
  recordExecutionFailure:input=>rpc("worker_record_capital_s11_execution_failure_v1",{p_recipe_id:input.recipeId,p_reason:input.reason,p_outcome_ids:null}),
  readAccepted:output=>read(scopeSchema.parse(output.scope)),
 };
 return Object.freeze({...adapter,ports});
}
export type CapitalS11QueueAdapter=ReturnType<typeof createCapitalS11QueueAdapter>;
