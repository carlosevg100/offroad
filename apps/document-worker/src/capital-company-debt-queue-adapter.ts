/** Prospective native company-debt worker commands. Selected only by the explicit native runtime after joint deployment. SQL owns authority; bodies stay ephemeral or in
 * bounded physical Storage. A missing published source is a gap, never a grant. */
import {createHash, randomUUID} from "node:crypto";
import {z} from "zod";
import type {SupabaseClient} from "@supabase/supabase-js";
import {legacyGatewayFingerprint, prepareGatewayInput, retentionMatrixVersion, type GatewayAcceptedInvocation} from "@offroad/model-gateway";
import {researchSourceSchema, type ResearchSource} from "@offroad/public-research";
import {openCapitalPublicCaptureAdapter} from "./capital-public-capture-adapter";
import {capitalCompanyDebtRecipeReceiptSchema, capitalCompanyDebtFinalOutputFingerprint, type CapitalCompanyDebtProcessingPorts, type CapitalCompanyDebtRetainedOutput} from "./capital-company-debt-processing";
import {prepareCapitalCompanyDebtRecipe, capitalCompanyDebtExecutionPins,capitalCompanyDebtDispatchPins, type CapitalCompanyDebtComponent} from "./capital-company-debt-recipe";
import {capitalCompanyDebtCommitReceiptSchema,capitalCompanyDebtTaskProjectionReceiptSchema,capitalCompanyDebtRetentionScopeSchema,capitalCompanyDebtQualityResultsSchema,capitalCompanyDebtQualityFailureReceiptSchema,CapitalCompanyDebtQualityFailure} from "./capital-company-debt-protocol";
export {capitalCompanyDebtCommitReceiptSchema} from "./capital-company-debt-protocol";
export type {CapitalCompanyDebtCommitReceipt} from "./capital-company-debt-protocol";
import type {CapitalProjectAnalysisJob} from "./queue";
import {createCapitalCompanyDebtPhysicalStore} from "./capital-company-debt-physical-store";
import type {loadCapitalCompanyDebtRevisionInput} from "./capital-company-debt-revision-input";
import {retryCapitalCaptureRpc} from "./capital-capture-rpc-retry";

const hash = z.string().regex(/^[a-f0-9]{64}$/), uuid = z.uuid(), time = z.iso.datetime({offset:true});
const scopeSchema=capitalCompanyDebtRetentionScopeSchema;
const baseSchema=z.strictObject({schemaVersion:z.literal("capital-debt-base-context.v1"),recipeId:uuid,jobId:uuid,organizationId:uuid,workId:uuid,planId:uuid,
 planFingerprint:hash,asOfDate:z.iso.date(),locale:z.enum(["pt-BR","en-US"]),contextFingerprint:hash,canonicalContext:z.string().min(1),expiresAt:time});
const acceptedSchema=z.strictObject({acceptedInvocationId:uuid,inputReceiptId:uuid,invocationId:uuid,outputFingerprint:hash});
type Scope=z.infer<typeof scopeSchema>;
const sha=(bytes:Uint8Array|string)=>createHash("sha256").update(bytes).digest("hex");
const same=(a:unknown,b:unknown)=>legacyGatewayFingerprint(a)===legacyGatewayFingerprint(b);
export class CapitalCompanyDebtSourceGap extends Error {readonly code="capital_debt_published_source_required";constructor(){super("capital_debt_published_source_required");}}
export type CapitalCompanyDebtDeliveredSource={deliveryId:string;source:ResearchSource;retainedPayloadId:string};
export function createCapitalCompanyDebtQueueAdapter(client:SupabaseClient,job:CapitalProjectAnalysisJob,readBytes:(authority:{jobId:string;capabilityToken:string},scope:Scope)=>Promise<{bytes:Uint8Array;objectId:string;version:string}>,now:()=>number=Date.now,revision?:{load:()=>ReturnType<typeof loadCapitalCompanyDebtRevisionInput>}){
 const authority=Object.freeze({jobId:uuid.parse(job.job_id),capabilityToken:z.string().min(1).parse(job.capability_token)});
 const args={p_job_id:authority.jobId,p_capability_token:authority.capabilityToken};
 const rpc=async(name:string,input:Record<string,unknown>={})=>{const fixedArgs={...args,...input};const result=await retryCapitalCaptureRpc(()=>client.rpc(name,fixedArgs));if(result.error){if(result.error.message==="capital_debt_budget_denied")throw new Error("capital_debt_budget_denied");throw new Error("capital_debt_database_denied");}return result.data as unknown;};
 const {retain,read}=createCapitalCompanyDebtPhysicalStore(client,job,readBytes,now);
 let base:z.infer<typeof baseSchema>|undefined,contextScope:Scope|undefined,preparation:Parameters<typeof prepareCapitalCompanyDebtRecipe>[0]|undefined,receipt:z.infer<typeof capitalCompanyDebtRecipeReceiptSchema>|undefined;
 let acceptedId:string|undefined,parsed:CapitalCompanyDebtRetainedOutput|undefined;
 const needBase=()=>{if(!base||!contextScope?.retainedPayloadId)throw new Error("capital_debt_context_required");return{base,contextScope};};
 const needRecipe=()=>{if(!receipt||!preparation)throw new Error("capital_debt_recipe_required");return{receipt,preparation};};
 const adapter={
  async begin(){if(base)throw new Error("capital_debt_context_already_captured");
   const revisionInput=job.payload.revision_of_artifact_id?(revision?await revision.load():(()=>{throw new Error("capital_debt_native_revision_physical_input_required");})()):null;
   const priorArgs=revisionInput?{p_prior_body:revisionInput.priorBody,p_predecessor_bodies:revisionInput.predecessors.map(ref=>({taskRunId:ref.projection.taskRunId,body:ref.body}))}:{};
   base=baseSchema.parse(await rpc(revisionInput?"worker_prepare_capital_debt_revision_recipe_v1":"worker_prepare_capital_debt_recipe_v1",priorArgs));
   if(base.jobId!==job.job_id||base.organizationId!==job.organization_id||base.workId!==job.payload.capital_project_id||base.planId!==job.payload.capital_project_plan_id||sha(base.canonicalContext)!==base.contextFingerprint||Date.parse(base.expiresAt)<=now())throw new Error("capital_debt_context_denied");
   contextScope=await retain(await rpc(revisionInput?"worker_prepare_capital_debt_revision_context_v1":"worker_prepare_capital_debt_context_v1",{p_recipe_id:base.recipeId,p_request_id:randomUUID(),...priorArgs}));
   const physical=await read(contextScope);if(sha(physical.bytes)!==base.contextFingerprint)throw new Error("capital_debt_context_changed");
   return{context:JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(physical.bytes)) as unknown,asOfDate:base.asOfDate,recipeId:base.recipeId,revisionInput};},
  async captureSources(sources:readonly ResearchSource[]):Promise<CapitalCompanyDebtDeliveredSource[]>{needBase();if(sources.length===0)throw new CapitalCompanyDebtSourceGap();const capture=await openCapitalPublicCaptureAdapter(client,authority,now),delivered:CapitalCompanyDebtDeliveredSource[]=[];
   for(const raw of sources){const source=researchSourceSchema.strict().parse(structuredClone(raw));const{contentAcquisition:_,publishedAt,...payload}=source;
    const result=await capture.deliver({deliveryKey:`debt:${source.topic}:${source.contentHash}`,requestId:randomUUID(),payload:{...payload,...(publishedAt===null?{}:{publishedAt})}});
    if(result.state!=="retained")throw new CapitalCompanyDebtSourceGap();
    // Model input uses only the physically retained published payload. Acquisition
    // metadata absent from the licensed payload cannot silently enter the recipe.
    const reconstructed=researchSourceSchema.strict().parse({...result.payload,publishedAt:result.payload.publishedAt??null});
    delivered.push({deliveryId:result.deliveryId,source:reconstructed,retainedPayloadId:result.retention.retainedPayloadId});}
   return delivered;},
  async seal(input:{components:readonly CapitalCompanyDebtComponent[];budget:{maxCostUsd:number;maxCalls:number;researchReserveUsd:number}}){const state=needBase();preparation={basis:{jobId:state.base.jobId,organizationId:state.base.organizationId,workId:state.base.workId,planId:state.base.planId,
    planFingerprint:state.base.planFingerprint,locale:state.base.locale,asOfDate:state.base.asOfDate},components:input.components};
   const reconstruction=prepareCapitalCompanyDebtRecipe(preparation);const prepared=prepareGatewayInput({...reconstruction.prepared.request,requireInputAttestation:true,outputMode:"structured",timeoutMs:240000,
    dataHandling:{classification:"confidential",purpose:"case_analysis",requiredPolicyVersion:retentionMatrixVersion}});
   const actual={...reconstruction,prepared};const routes=[{provider:"anthropic" as const,model:"claude-sonnet-5",effort:"medium" as const},{provider:"openai" as const,model:"gpt-5.6-terra",effort:"medium" as const}];
   const pins=routes.map(route=>capitalCompanyDebtExecutionPins(actual,route));
   routes.forEach(route=>capitalCompanyDebtDispatchPins(actual,route));
   receipt=capitalCompanyDebtRecipeReceiptSchema.parse(await rpc("worker_finalize_capital_debt_recipe_v1",{p_recipe_id:state.base.recipeId,p_context_retained_payload_id:state.contextScope.retainedPayloadId,
    p_components:reconstruction.recipe.components,p_reconstruction_fingerprint:prepared.inputFingerprint,p_prompt_fingerprint:pins[0]!.promptFingerprint,
    p_primary_request_fingerprint:pins[0]!.requestFingerprint,p_fallback_request_fingerprint:pins[1]!.requestFingerprint,
    p_operator_budget_micro_usd:Math.floor(Math.min(.95,input.budget.maxCostUsd)*1000000),p_operator_max_dispatches:Math.min(2,input.budget.maxCalls),p_research_status:(input.components.find(value=>value.slot==="research")?.body as {status:string}).status,}));
   if(receipt.jobId!==job.job_id||receipt.recipeId!==state.base.recipeId||!same(receipt.components,reconstruction.recipe.components)||receipt.reconstructionFingerprint!==prepared.inputFingerprint)throw new Error("capital_debt_recipe_mismatch");return receipt;},
  async retainTaskProjection(input:{taskId:string;taskRunId:string;body:unknown;semanticFingerprint:string}){
   const state=needBase(),prelude=["M01","M02","M03","M04","M05","M06"].includes(input.taskId);
   if(!prelude&&(!acceptedId||!parsed?.scope.retainedPayloadId))throw new Error("capital_debt_parsed_required");
   const parent=prelude?state.contextScope.retainedPayloadId:parsed!.scope.retainedPayloadId;
   const prepared=await rpc("worker_prepare_capital_debt_task_projection_v1",{p_recipe_id:state.base.recipeId,p_request_id:randomUUID(),p_task_run_id:uuid.parse(input.taskRunId),
    p_accepted_invocation_id:prelude?null:acceptedId,p_body:input.body,p_output_fingerprint:hash.parse(input.semanticFingerprint),p_parent_retained_payload_id:parent});
   const scope=await retain(prepared);
   const result=capitalCompanyDebtTaskProjectionReceiptSchema.parse(await rpc("worker_commit_capital_debt_task_projection_v1",{
     p_recipe_id:state.base.recipeId,p_task_run_id:input.taskRunId,p_retained_payload_id:scope.retainedPayloadId}));
   if(result.recipeId!==state.base.recipeId||result.taskId!==input.taskId||result.taskRunId!==input.taskRunId||result.retainedPayloadId!==scope.retainedPayloadId)throw new Error("capital_debt_task_projection_mismatch");return result;
  },
  async commitFinal(input:{body:unknown;quality:readonly{id:string;passed:boolean}[];deriveTasks:()=>Promise<void>}){const state=needRecipe();if(!acceptedId||!parsed?.scope.retainedPayloadId)throw new Error("capital_debt_parsed_required");
   const qualityResults=capitalCompanyDebtQualityResultsSchema.parse(input.quality.map(({id,passed})=>({id,passed})));
   const finalFingerprint=capitalCompanyDebtFinalOutputFingerprint(parsed.binding.outputFingerprint,state.receipt.recipeFingerprint,input.body);
   const finalScope=await retain(await rpc("worker_prepare_capital_debt_output_v1",{p_recipe_id:state.receipt.recipeId,p_request_id:randomUUID(),p_kind:"final",p_accepted_invocation_id:acceptedId,
    p_body:input.body,p_output_fingerprint:finalFingerprint,p_parent_retained_payload_id:parsed.scope.retainedPayloadId}));
   if(qualityResults.some(value=>!value.passed)){
    const failed=capitalCompanyDebtQualityFailureReceiptSchema.parse(await rpc("worker_record_capital_debt_quality_failure_v1",{p_recipe_id:state.receipt.recipeId,p_accepted_invocation_id:acceptedId,p_parsed_retained_payload_id:parsed.scope.retainedPayloadId,
     p_final_retained_payload_id:finalScope.retainedPayloadId,p_final_fingerprint:finalFingerprint,p_quality_results:qualityResults}));
    if(failed.recipeId!==state.receipt.recipeId||failed.executionPlanTaskRunId!==state.receipt.executionPlanTaskRunId||!same(failed.qualityFailure,{schemaVersion:"capital-debt-quality-failure.v1",acceptedInvocationId:acceptedId,parsedRetainedPayloadId:parsed.scope.retainedPayloadId,finalRetainedPayloadId:finalScope.retainedPayloadId,finalFingerprint,qualityResults}))throw new Error("capital_debt_quality_failure_mismatch");
    throw new CapitalCompanyDebtQualityFailure();
   }
   // Seven genuine graders and finite parsed/final bytes are fixed before derived products.
   // A failed grader terminalizes the invocation origin, preserving the succeeded M06 plan; no derived task is published.
   await input.deriveTasks();
   const result=capitalCompanyDebtCommitReceiptSchema.parse(await rpc("worker_commit_capital_debt_result_v1",{p_recipe_id:state.receipt.recipeId,p_accepted_invocation_id:acceptedId,p_parsed_retained_payload_id:parsed.scope.retainedPayloadId,
    p_final_retained_payload_id:finalScope.retainedPayloadId,p_final_fingerprint:finalFingerprint,p_quality_results:qualityResults}));
   if(result.recipeId!==state.receipt.recipeId||result.executionPlanTaskRunId!==state.receipt.executionPlanTaskRunId||result.taskRunId===state.receipt.executionPlanTaskRunId||result.finalFingerprint!==finalFingerprint)throw new Error("capital_debt_result_mismatch");return {...result,finalRetainedPayloadId:uuid.parse(finalScope.retainedPayloadId)};},
 };
 const ports:CapitalCompanyDebtProcessingPorts={
  async loadRecipe(executionPlanTaskRunId){const state=needRecipe();if(state.receipt.executionPlanTaskRunId!==executionPlanTaskRunId)throw new Error("capital_debt_task_mismatch");return state;},
  async revalidateRecipe(expected){const state=needRecipe();if(!same(state.receipt,expected))throw new Error("capital_debt_recipe_changed");return rpc("worker_revalidate_capital_debt_recipe_v1",{p_recipe_id:expected.recipeId});},
  async recoverAccepted(){return null;}, // Native same-job body recovery is attached only after a server grant, never guessed.
  authorize:input=>rpc("worker_authorize_capital_debt_processing_v1",{p_recipe_id:input.recipeId,p_attempt:input.attempt,p_route:input.route,p_resources:input.resources,p_purpose:input.purpose}),
  dispatch:id=>rpc("worker_record_capital_debt_input_v1",{p_attempt_receipt_id:id}),
  outcome:(id,outcome)=>rpc("worker_record_capital_debt_attempt_outcome_v1",{p_attempt_receipt_id:id,p_outcome:outcome}),
  async retainAccepted(input){const accepted=acceptedSchema.parse(await rpc("worker_record_capital_debt_accepted_v1",{p_input_receipt_id:input.accepted.inputAttestationReceiptId,p_accepted:input.accepted}));
   if(accepted.inputReceiptId!==input.accepted.inputAttestationReceiptId||accepted.invocationId!==input.accepted.invocationId||accepted.outputFingerprint!==input.accepted.outputFingerprint)throw new Error("capital_debt_accepted_mismatch");
   acceptedId=accepted.acceptedInvocationId;const scope=await retain(await rpc("worker_prepare_capital_debt_output_v1",{p_recipe_id:input.recipe.recipeId,p_request_id:randomUUID(),p_kind:"parsed",
    p_accepted_invocation_id:acceptedId,p_body:input.output,p_output_fingerprint:accepted.outputFingerprint,p_parent_retained_payload_id:null}));
   parsed={binding:{recipeId:input.recipe.recipeId,invocationId:accepted.invocationId,inputReceiptId:accepted.inputReceiptId,outputFingerprint:accepted.outputFingerprint},scope};return parsed;},
  recordExecutionFailure:input=>rpc("worker_record_capital_debt_execution_failure_v1",{p_recipe_id:input.recipeId,p_reason:input.reason,p_outcome_ids:null}),
  readAccepted:output=>read(scopeSchema.parse(output.scope)),
 };
 return Object.freeze({...adapter,ports});
}
export type CapitalCompanyDebtQueueAdapter=ReturnType<typeof createCapitalCompanyDebtQueueAdapter>;
