/** Dedicated preview ports. They retain the request made by the existing prompt
 * constructor; a closed SQL receipt remains the only model authorization. */
import {readCapitalPreviewBodyBytes} from "./capital-body-read-client";
import {randomUUID} from "node:crypto";
import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";
import {legacyGatewayFingerprint} from "@offroad/model-gateway";
import {retryCapitalCaptureRpc} from "./capital-capture-rpc-retry";
import {preparePreviewNativeModelRecipe,type PreviewModelRecipeInput} from "./integration-preview-model-recipe";
import {capitalPreviewBoundaryReceiptSchema,type CapitalPreviewProcessingPorts} from "./integration-preview-processing";
import {capitalBodyRetentionReceiptSchema} from "./integration-preview-protocol";
import {createPreviewBodyStorage,type PreviewBodyAuthority,type PreviewPhysicalReader} from "./integration-preview-body-storage";

const uuid=z.uuid(),hash=z.string().regex(/^[a-f0-9]{64}$/);
const bindingSchema=z.strictObject({recipeId:uuid,boundaryId:uuid,invocationId:uuid,inputReceiptId:uuid,outputFingerprint:hash});
const retainedSchema=z.strictObject({binding:bindingSchema,scope:capitalBodyRetentionReceiptSchema});
const acceptedReceiptSchema=z.strictObject({acceptedInvocationId:uuid,inputReceiptId:uuid,invocationId:uuid,outputFingerprint:hash});
const boundaryBaseSchema=z.strictObject({schemaVersion:z.literal("capital-preview-boundary-base.v1"),recipeId:uuid,boundaryId:uuid,runId:uuid,expiresAt:z.iso.datetime({offset:true}),boundary:z.enum(["questions","synthesis"]),planTaskId:uuid});
export function createPreviewProcessingPorts(input:{client:SupabaseClient;authority:PreviewBodyAuthority;runId:string;reader?:PreviewPhysicalReader;
 preparation:PreviewModelRecipeInput;consumedBasisFingerprint:string;now?:()=>number}):CapitalPreviewProcessingPorts{
 const {client,authority}=input,runId=uuid.parse(input.runId),consumedBasisFingerprint=hash.parse(input.consumedBasisFingerprint);
 const storage=createPreviewBodyStorage(client,input.reader??{read:(job,scope)=>readCapitalPreviewBodyBytes(client,job,{allocationId:scope.allocationId},scope)},input.now);
 const args={p_job_id:uuid.parse(authority.jobId),p_capability_token:z.string().min(1).parse(authority.capabilityToken)};
 const rpc=async(name:string,value:Record<string,unknown>)=>{const result=await retryCapitalCaptureRpc(()=>client.rpc(name,{...args,...value}));if(result.error)throw Error("capital_preview_native_command_denied");return result.data;};
 let recipeId:string|undefined;
 const ports:CapitalPreviewProcessingPorts={
  async loadRecipe(boundary){
   if(boundary!==input.preparation.boundary)throw Error("capital_preview_boundary_mismatch");
   const base=boundaryBaseSchema.parse(await rpc("worker_prepare_capital_preview_boundary_v1",{p_run_id:runId,p_boundary:boundary}));
   if(base.runId!==runId||base.boundary!==boundary)throw Error("capital_preview_boundary_mismatch");recipeId=base.recipeId;
   const prepared=preparePreviewNativeModelRecipe(input.preparation);
   const body={schemaVersion:"capital-preview-model-input.v1",boundary,input:prepared.prepared.input};
   const retained=await storage.retain(authority,{runId,requestId:randomUUID(),kind:"model_input",recipeId:base.recipeId,body});
   if(!retained.retainedPayloadId)throw Error("capital_preview_input_unretained");
   const receipt=capitalPreviewBoundaryReceiptSchema.parse(await rpc("worker_seal_capital_preview_boundary_v1",{p_recipe_id:base.recipeId,p_input_retained_payload_id:retained.retainedPayloadId,p_model_input:body,
    p_pins:{reconstructionFingerprint:prepared.inputFingerprint,promptFingerprint:prepared.promptFingerprint,primaryRequestFingerprint:prepared.pins[0]!.requestFingerprint,fallbackRequestFingerprint:prepared.pins[1]!.requestFingerprint},p_consumed_basis_fingerprint:consumedBasisFingerprint}));
   if(receipt.recipeId!==base.recipeId||receipt.boundaryId!==base.recipeId||receipt.jobId!==authority.jobId||receipt.inputRetainedPayloadId!==retained.retainedPayloadId)throw Error("capital_preview_boundary_mismatch");
   return{receipt,preparation:input.preparation};
  },
  revalidateRecipe:receipt=>rpc("worker_revalidate_capital_preview_boundary_v1",{p_recipe_id:uuid.parse(receipt.recipeId)}),
  async recoverAccepted(receipt){const value=await rpc("worker_recover_capital_preview_accepted_v1",{p_recipe_id:uuid.parse(receipt.recipeId)});return value===null?null:retainedSchema.parse(value);},
  authorize:value=>rpc("worker_authorize_capital_preview_processing_v1",{p_recipe_id:uuid.parse(value.boundaryId),p_attempt:value.attempt,p_route:value.route,p_resources:value.resources,p_purpose:value.purpose}),
  dispatch:id=>rpc("worker_record_capital_preview_input_v1",{p_attempt_receipt_id:uuid.parse(id)}),
  outcome:(id,outcome)=>rpc("worker_record_capital_preview_attempt_outcome_v1",{p_attempt_receipt_id:uuid.parse(id),p_outcome:outcome}),
  async retainAccepted(value){
   if(recipeId!==value.recipe.recipeId||value.recipe.boundaryId!==recipeId||legacyGatewayFingerprint(value.output)!==value.accepted.outputFingerprint)throw Error("capital_preview_accepted_mismatch");
   const accepted=acceptedReceiptSchema.parse(await rpc("worker_record_capital_preview_accepted_v1",{p_input_receipt_id:value.accepted.inputAttestationReceiptId,p_accepted:value.accepted}));
   if(accepted.invocationId!==value.accepted.invocationId||accepted.inputReceiptId!==value.accepted.inputAttestationReceiptId||accepted.outputFingerprint!==value.accepted.outputFingerprint)throw Error("capital_preview_accepted_mismatch");
   const acceptedRecipeId=uuid.parse(recipeId);
   const scope=await storage.retain(authority,{runId,requestId:randomUUID(),kind:"accepted_parsed",recipeId:acceptedRecipeId,acceptedInvocationId:accepted.acceptedInvocationId,semanticFingerprint:accepted.outputFingerprint,body:value.output});
   return{binding:{recipeId:acceptedRecipeId,boundaryId:acceptedRecipeId,invocationId:accepted.invocationId,inputReceiptId:accepted.inputReceiptId,outputFingerprint:accepted.outputFingerprint},scope};
  },
  async readAccepted(retained){const read=await storage.read(authority,retained.scope);return{bytes:read.bytes,scope:read.scope};},
  recordExecutionFailure:value=>rpc("worker_record_capital_preview_execution_failure_v1",{p_recipe_id:uuid.parse(value.recipeId),p_reason:value.reason}),
 };
 return Object.freeze(ports);
}
