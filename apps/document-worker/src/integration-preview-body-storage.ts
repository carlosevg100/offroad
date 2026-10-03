import {createHash} from "node:crypto";
import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";
import {capitalBodyRetentionReceiptSchema} from "./integration-preview-protocol";
import type {CapitalBodyRetentionReceipt} from "./capital-body-retention";
import {retryCapitalCaptureRpc} from "./capital-capture-rpc-retry";

const uuid=z.uuid(),hash=z.string().regex(/^[a-f0-9]{64}$/);
const preparedSchema=capitalBodyRetentionReceiptSchema.extend({canonicalBody:z.string().min(1)}).strict();
const authoritySchema=z.strictObject({jobId:uuid,capabilityToken:z.string().min(1)});
export type PreviewBodyAuthority=z.infer<typeof authoritySchema>;
export type PreviewBodyKind="context"|"source"|"actual_input"|"model_input"|"accepted_parsed"|"task_output"|"decision_contract";
export interface PreviewPhysicalReader {
 read(authority:PreviewBodyAuthority,scope:CapitalBodyRetentionReceipt):Promise<{bytes:Uint8Array;objectId:string;version:string}>;
}
const digest=(bytes:Uint8Array)=>createHash("sha256").update(bytes).digest("hex");
const deny=():never=>{throw new Error("capital_preview_physical_body_denied");};
/** SQL owns the canonical bytes and upload scope. The reader must use the closed
 * preview_body broker branch; public_source or a direct Storage download cannot
 * substitute for this authority. No credentials or body enter metadata. */
export function createPreviewBodyStorage(client:SupabaseClient,reader:PreviewPhysicalReader,now:()=>number=Date.now){
 const rpc=async(name:string,args:Record<string,unknown>)=>{const result=await retryCapitalCaptureRpc(()=>client.rpc(name,args));if(result.error)deny();return result.data;};
 const args=(value:PreviewBodyAuthority)=>{const a=authoritySchema.parse(value);return{p_job_id:a.jobId,p_capability_token:a.capabilityToken};};
 const live=(scope:CapitalBodyRetentionReceipt)=>{if(scope.path!==`${scope.path.split("/")[0]}/${scope.allocationId}/payload.json`||!uuid.safeParse(scope.path.split("/")[0]).success
  ||Date.parse(scope.retainedAt)>=Date.parse(scope.purgeAt)||Date.parse(scope.purgeAt)>=Date.parse(scope.expiresAt)||Date.parse(scope.purgeAt)<=now())deny();};
 const same=(a:CapitalBodyRetentionReceipt,b:CapitalBodyRetentionReceipt)=>{const {replayed:_a,...x}=a,{replayed:_b,...y}=b;return JSON.stringify(x)===JSON.stringify(y);};
 const scope=async(authority:PreviewBodyAuthority,allocationId:string)=>capitalBodyRetentionReceiptSchema.parse(await rpc("worker_read_capital_preview_allocation_v1",{...args(authority),p_allocation_id:uuid.parse(allocationId)}));
 const verified=async(authority:PreviewBodyAuthority,value:CapitalBodyRetentionReceipt)=>{live(value);const read=await reader.read(authority,value);live(value);
  if(read.bytes.byteLength!==value.byteLength||digest(read.bytes)!==value.payloadFingerprint||!uuid.safeParse(read.objectId).success||!read.version
   ||(value.storageObjectId!==null&&read.objectId!==value.storageObjectId)||(value.storageVersion!==null&&read.version!==value.storageVersion))deny();return read;};
 const read=async(authority:PreviewBodyAuthority,expected:CapitalBodyRetentionReceipt)=>{const before=await scope(authority,expected.allocationId);if(!same(before,expected)||before.retentionState!=="retained")deny();
  const bytes=await verified(authority,before);const after=await scope(authority,before.allocationId);if(!same(before,after))deny();return{...bytes,scope:after};};
 return Object.freeze({read,
  async retain(authority:PreviewBodyAuthority,input:{runId:string;requestId:string;kind:PreviewBodyKind;body:unknown;recipeId?:string;fileName?:string;taskId?:string;taskRunId?:string;acceptedInvocationId?:string;semanticFingerprint?:string}){
   const prepared=preparedSchema.parse(await rpc("worker_prepare_capital_preview_body_v1",{...args(authority),p_run_id:uuid.parse(input.runId),p_request_id:uuid.parse(input.requestId),p_kind:input.kind,p_body:input.body,
    p_recipe_id:input.recipeId===undefined?null:uuid.parse(input.recipeId),p_file_name:input.fileName??null,p_task_id:input.taskId??null,p_task_run_id:input.taskRunId===undefined?null:uuid.parse(input.taskRunId),
    p_accepted_invocation_id:input.acceptedInvocationId===undefined?null:uuid.parse(input.acceptedInvocationId),p_semantic_fingerprint:input.semanticFingerprint===undefined?null:hash.parse(input.semanticFingerprint)}));
   const {canonicalBody:_canonicalBody,...allocation}=prepared;live(allocation);const bytes=Buffer.from(prepared.canonicalBody,"utf8");if(bytes.length!==allocation.byteLength||digest(bytes)!==allocation.payloadFingerprint)deny();
   if(allocation.retentionState==="retained"){await read(authority,allocation);return allocation;}
   if(Date.parse(allocation.uploadExpiresAt)<=now())deny();
   const upload=await client.storage.from(allocation.bucket).upload(allocation.path,bytes,{upsert:false,contentType:"application/json",cacheControl:"0",headers:{"x-offroad-workspace":allocation.path.split("/")[0]!,"x-offroad-job-id":authority.jobId,"x-offroad-capability":authority.capabilityToken}});
   if(upload.error&&Number((upload.error as {statusCode?:unknown}).statusCode)!==409)deny();
   const actual=await verified(authority,allocation);
   const committed=capitalBodyRetentionReceiptSchema.parse(await rpc("worker_commit_capital_preview_body_v1",{...args(authority),p_allocation_id:allocation.allocationId,p_storage_object_id:actual.objectId,p_storage_version:actual.version,p_verified_sha256:digest(actual.bytes),p_verified_size:actual.bytes.length}));
   if(committed.allocationId!==allocation.allocationId||committed.payloadFingerprint!==allocation.payloadFingerprint||committed.byteLength!==allocation.byteLength||committed.retentionState!=="retained")deny();
   await read(authority,committed);return committed;
  }
 });
}
