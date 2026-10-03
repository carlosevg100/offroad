/** Actual SDK transport for the two closed zero-model consumers. Main selects it
 * after SQL and the native_recipe server read branch have both deployed. */
import {createHash} from "node:crypto";
import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";
import {retryCapitalCaptureRpc} from "./capital-capture-rpc-retry";
import {openCapitalPublicCaptureAdapter,type CapitalPublicDeliveryRequest} from "./capital-public-capture-adapter";
import {nativeProviderRecipeSchema,nativeProviderReceiptSchema,nativeProviderRecoverySchema,type NativeProviderReceipt,type NativeProviderPorts,type NativeProviderRecipe} from "./capital-native-provider-consumer";
import type {CapitalProjectAnalysisJob} from "./queue";
const uuid=z.uuid(),hash=z.string().regex(/^[a-f0-9]{64}$/),time=z.iso.datetime({offset:true});
const scopeSchema=z.strictObject({schemaVersion:z.literal("capital-retained-body.v1"),retentionState:z.enum(["allocated","retained"]),allocationId:uuid,
 retainedPayloadId:uuid.nullable(),bodyBasisId:uuid.nullable(),bucket:z.literal("capital-input-capture"),path:z.string(),payloadFingerprint:hash,byteLength:z.number().int().positive().max(1048576),
 storageObjectId:uuid.nullable(),storageVersion:z.string().min(1).nullable(),retainedAt:time,uploadExpiresAt:time,expiresAt:time,purgeAt:time,replayed:z.boolean()});
const preparedBodySchema=scopeSchema.extend({canonicalBody:z.string().optional()});
const preparationSchema=z.strictObject({schemaVersion:z.literal("capital-native-recipe-preparation.v1"),recipeId:uuid,family:z.enum(["provider_research","provider_case_fit"]),jobId:uuid,
 organizationId:uuid,workId:uuid,planId:uuid,briefId:uuid,contextFingerprint:hash,contextByteLength:z.number().int().positive(),catalogFingerprint:hash.nullable(),expiresAt:time,body:preparedBodySchema});
type Scope=z.infer<typeof scopeSchema>;
const sha=(bytes:Uint8Array)=>createHash("sha256").update(bytes).digest("hex");
const same=(left:unknown,right:unknown)=>JSON.stringify(left)===JSON.stringify(right);
function deny():never{throw Error("capital_native_provider_adapter_denied");}
export function createNativeProviderPorts(input:{client:SupabaseClient;job:CapitalProjectAnalysisJob;cataloguePublication?:()=>Promise<CapitalPublicDeliveryRequest>;now?:()=>number}):NativeProviderPorts{
 const {client,job}=input,now=input.now??Date.now;
 const args={p_job_id:uuid.parse(job.job_id),p_capability_token:z.string().min(32).parse(job.capability_token)};
 const authority={jobId:job.job_id,capabilityToken:job.capability_token};
 const headers={"x-offroad-workspace":uuid.parse(job.organization_id),"x-offroad-job-id":job.job_id,"x-offroad-capability":job.capability_token};
 const rpc=async(name:string,extra:Record<string,unknown>={})=>{const parameters=structuredClone({...args,...extra});const r=await retryCapitalCaptureRpc(()=>client.rpc(name,structuredClone(parameters)));if(r.error)deny();return r.data as unknown;};
 const live=(s:Scope)=>{if(s.path!==`${job.organization_id}/${s.allocationId}/payload.json`||Math.min(Date.parse(s.expiresAt),Date.parse(s.purgeAt))<=now()||Date.parse(s.retainedAt)>=Date.parse(s.purgeAt)||Date.parse(s.purgeAt)>=Date.parse(s.expiresAt))deny();};
 const allocationScopeSchema=scopeSchema.extend({recipeId:uuid,taskId:z.enum(["M01","K01","K02"]).nullable(),artifactType:z.string().nullable()});
 const retain=async(value:unknown,recipeId:string,taskId:"M01"|"K01"|"K02"|null=null,artifactType:string|null=null)=>{
  const prepared=preparedBodySchema.parse(value);live(prepared);
  const parameters={p_recipe_id:recipeId,p_allocation_id:prepared.allocationId,p_task_id:taskId,p_artifact_type:artifactType};
  const readScope=async()=>{const scope=allocationScopeSchema.parse(await rpc("worker_read_capital_native_allocation_v1",parameters));live(scope);
   if(scope.recipeId!==recipeId||scope.taskId!==taskId||scope.artifactType!==artifactType||scope.allocationId!==prepared.allocationId||scope.payloadFingerprint!==prepared.payloadFingerprint||scope.byteLength!==prepared.byteLength
    ||scope.path!==prepared.path||scope.bodyBasisId!==prepared.bodyBasisId||scope.retainedAt!==prepared.retainedAt||Date.parse(scope.expiresAt)>Date.parse(prepared.expiresAt)||Date.parse(scope.purgeAt)>Date.parse(prepared.purgeAt))deny();return scope;};
  const physical=async()=>{
   const before=await readScope();if(!before.storageObjectId||!before.storageVersion)deny();
   const result=await client.functions.invoke("capital-body-read",{method:"POST",body:{kind:"native_provider_allocation",recipeId,allocationId:before.allocationId,...(taskId?{taskId,artifactType}: {})},headers,timeout:10000});
   if(result.error||!(result.data instanceof Blob)||!result.response||result.data.size!==before.byteLength||result.response.headers.get("content-type")!=="application/octet-stream"
    ||!result.response.headers.get("cache-control")?.split(",").some(v=>v.trim()==="no-store"))deny();
   const h=result.response.headers;
   for(const [key,v]of Object.entries({"x-offroad-recipe-id":recipeId,"x-offroad-allocation-id":before.allocationId,"x-offroad-object-id":before.storageObjectId,
    "x-offroad-storage-version":before.storageVersion,"x-offroad-payload-sha256":before.payloadFingerprint,"x-offroad-byte-length":String(before.byteLength)}))if(h.get(key)!==v)deny();
   if(taskId&&(h.get("x-offroad-task-id")!==taskId||h.get("x-offroad-artifact-type")!==artifactType))deny();
   const bytes=new Uint8Array(await result.data.arrayBuffer());if(bytes.length!==before.byteLength||sha(bytes)!==before.payloadFingerprint)deny();
   const after=await readScope();if(!same(before,after))deny();return {scope:after,bytes,objectId:before.storageObjectId,version:before.storageVersion};
  };
  if(prepared.retentionState==="retained"){
   if(prepared.canonicalBody!==undefined||!prepared.retainedPayloadId)deny();const actual=await physical();
   if(actual.scope.retainedPayloadId!==prepared.retainedPayloadId)deny();const {recipeId:_r,taskId:_t,artifactType:_a,...scope}=actual.scope;return scopeSchema.parse(scope);
  }
  if(!prepared.canonicalBody||prepared.retainedPayloadId||Date.parse(prepared.uploadExpiresAt)<=now())deny();
  const bytes=Buffer.from(prepared.canonicalBody,"utf8");if(bytes.length!==prepared.byteLength||sha(bytes)!==prepared.payloadFingerprint)deny();
  const uploaded=await client.storage.from(prepared.bucket).upload(prepared.path,bytes,{contentType:"application/json",cacheControl:"0",upsert:false,headers});
  if(uploaded.error&&Number((uploaded.error as {statusCode?:unknown}).statusCode)!==409)deny();live(prepared);
  const actual=await physical();live(prepared);
  const retained=scopeSchema.parse(await rpc("worker_commit_capital_body_v1",{p_allocation_id:prepared.allocationId,p_storage_object_id:actual.objectId,
   p_storage_version:actual.version,p_verified_sha256:sha(actual.bytes),p_verified_size:actual.bytes.length}));live(retained);
  if(!retained.retainedPayloadId||retained.allocationId!==prepared.allocationId||retained.bodyBasisId!==prepared.bodyBasisId||retained.path!==prepared.path||retained.payloadFingerprint!==prepared.payloadFingerprint
   ||retained.byteLength!==prepared.byteLength||retained.storageObjectId!==actual.objectId||retained.storageVersion!==actual.version||retained.retainedAt!==prepared.retainedAt
   ||Date.parse(retained.expiresAt)>Date.parse(prepared.expiresAt)||Date.parse(retained.purgeAt)>Date.parse(prepared.purgeAt))deny();
  const fresh=await physical();if(fresh.scope.retainedPayloadId!==retained.retainedPayloadId)deny();const {recipeId:_r,taskId:_t,artifactType:_a,...scope}=fresh.scope;return scopeSchema.parse(scope);
 };
 const read=async(recipe:NativeProviderRecipe,scope:"context"|"catalog")=>{
  const retainedId=scope==="context"?recipe.retainedPayloadId:recipe.catalogRetainedPayloadId;if(!retainedId)deny();
  const parameters={p_recipe_id:recipe.recipeId,p_retained_payload_id:retainedId,p_scope:scope};
  const readSchema=scopeSchema.extend({recipeId:uuid,scope:z.enum(["context","catalog"])});
  const before=readSchema.parse(await rpc("worker_read_capital_native_recipe_v1",parameters));live(before);
  if(before.recipeId!==recipe.recipeId||before.retainedPayloadId!==retainedId||before.scope!==scope||before.retentionState!=="retained"||!before.storageObjectId||!before.storageVersion)deny();
  const result=await client.functions.invoke("capital-body-read",{method:"POST",body:{kind:"native_provider_recipe",recipeId:recipe.recipeId,retainedPayloadId:retainedId,scope},headers,timeout:10000});
  if(result.error||!(result.data instanceof Blob)||!result.response||result.data.size!==before.byteLength||result.response.headers.get("content-type")!=="application/octet-stream"
   ||!result.response.headers.get("cache-control")?.split(",").some(v=>v.trim()==="no-store"))deny();
  const h=result.response.headers;
  for(const [key,value]of Object.entries({"x-offroad-recipe-id":recipe.recipeId,"x-offroad-retained-payload-id":retainedId,"x-offroad-allocation-id":before.allocationId,
   "x-offroad-object-id":before.storageObjectId,"x-offroad-storage-version":before.storageVersion,"x-offroad-payload-sha256":before.payloadFingerprint,"x-offroad-byte-length":String(before.byteLength)}))if(h.get(key)!==value)deny();
  const bytes=new Uint8Array(await result.data.arrayBuffer());if(bytes.length!==before.byteLength||sha(bytes)!==before.payloadFingerprint)deny();
  const after=readSchema.parse(await rpc("worker_read_capital_native_recipe_v1",parameters));live(after);if(!same(before,after))deny();return bytes;
 };
 const readResult=async(receipt:NativeProviderReceipt)=>{
  const parameters={p_recipe_id:receipt.recipeId,p_task_id:receipt.taskId,p_artifact_type:receipt.artifactType,p_retained_payload_id:receipt.retainedPayloadId};
  const schema=scopeSchema.extend({recipeId:uuid,taskId:z.enum(["M01","K01","K02"]),artifactType:z.string()});
  const before=schema.parse(await rpc("worker_read_capital_native_result_v1",parameters));live(before);
  if(before.recipeId!==receipt.recipeId||before.taskId!==receipt.taskId||before.artifactType!==receipt.artifactType||before.retainedPayloadId!==receipt.retainedPayloadId||before.payloadFingerprint!==receipt.bodyFingerprint
   ||before.retentionState!=="retained"||!before.storageObjectId||!before.storageVersion)deny();
  const result=await client.functions.invoke("capital-body-read",{method:"POST",body:{kind:"native_provider_result",recipeId:receipt.recipeId,taskId:receipt.taskId,artifactType:receipt.artifactType,retainedPayloadId:receipt.retainedPayloadId},headers,timeout:10000});
  if(result.error||!(result.data instanceof Blob)||!result.response||result.data.size!==before.byteLength||result.response.headers.get("content-type")!=="application/octet-stream"
   ||!result.response.headers.get("cache-control")?.split(",").some(v=>v.trim()==="no-store"))deny();
  for(const [key,v]of Object.entries({"x-offroad-recipe-id":receipt.recipeId,"x-offroad-task-id":receipt.taskId,"x-offroad-artifact-type":receipt.artifactType,
   "x-offroad-retained-payload-id":receipt.retainedPayloadId,"x-offroad-allocation-id":before.allocationId,"x-offroad-object-id":before.storageObjectId,
   "x-offroad-storage-version":before.storageVersion,"x-offroad-payload-sha256":before.payloadFingerprint,"x-offroad-byte-length":String(before.byteLength)}))if(result.response.headers.get(key)!==v)deny();
  const bytes=new Uint8Array(await result.data.arrayBuffer());if(bytes.length!==before.byteLength||sha(bytes)!==receipt.bodyFingerprint)deny();
  const after=schema.parse(await rpc("worker_read_capital_native_result_v1",parameters));live(after);if(!same(before,after))deny();
 };
 return {
  recover:async()=>{const recovery=nativeProviderRecoverySchema.parse(await rpc("worker_recover_capital_native_provider_v1"));
   for(const result of recovery.results)await readResult(result);return recovery;},
  capture:async()=>{
   const prepared=preparationSchema.parse(await rpc("worker_prepare_capital_native_recipe_v1"));
   if(prepared.jobId!==job.job_id||prepared.organizationId!==job.organization_id||prepared.workId!==job.payload.capital_project_id||prepared.planId!==job.payload.capital_project_plan_id
    ||prepared.briefId!==job.payload.capital_project_brief_id||prepared.family!==job.payload.analysis_scope||prepared.body.payloadFingerprint!==prepared.contextFingerprint||prepared.body.byteLength!==prepared.contextByteLength)deny();
   const context=await retain(prepared.body,prepared.recipeId);let catalogRetainedId:string|null=null,catalogPayload:unknown=null;
   if(prepared.catalogFingerprint){
    if(!input.cataloguePublication)throw Error("capital_native_catalog_publication_required");
    const publication=structuredClone(await input.cataloguePublication());
    const capture=await openCapitalPublicCaptureAdapter(client,authority,now);
    const catalogue=await capture.deliver(publication);if(catalogue.state!=="retained")throw Error("capital_native_catalog_license_unresolved");
    catalogRetainedId=catalogue.retention.retainedPayloadId;catalogPayload=catalogue.payload;
   }
   return nativeProviderRecipeSchema.parse(await rpc("worker_finalize_capital_native_recipe_v1",{p_recipe_id:prepared.recipeId,p_context_retained_payload_id:context.retainedPayloadId,
    p_catalog_retained_payload_id:catalogRetainedId,p_catalog_payload:catalogPayload}));
  },
  readContext:recipe=>read(recipe,"context"),readCatalog:recipe=>read(recipe,"catalog"),
  commit:async input=>{
   if(input.dependencies.length>1||input.executorVersion!==(input.recipe.catalogFingerprint?"2026.09.10-v2":"2026.09.10-v1"))deny();
   const preparation=z.strictObject({schemaVersion:z.literal("capital-native-result-preparation.v1"),recipeId:uuid,sealId:uuid,taskRunId:uuid,taskId:z.enum(["M01","K01","K02"]),artifactType:z.string(),inputFingerprint:hash,body:preparedBodySchema})
    .parse(await rpc("worker_prepare_capital_native_result_v1",{p_recipe_id:input.recipe.recipeId,p_task_id:input.taskId,p_artifact_type:input.artifactType,p_content:structuredClone(input.content),p_predecessor_revision_id:input.dependencies[0]?.revisionId??null}));
   if(preparation.recipeId!==input.recipe.recipeId||preparation.taskId!==input.taskId||preparation.artifactType!==input.artifactType)deny();
   const body=await retain(preparation.body,input.recipe.recipeId,input.taskId,input.artifactType);
   const receipt=nativeProviderReceiptSchema.parse(await rpc("worker_commit_capital_native_result_v1",{p_recipe_id:input.recipe.recipeId,p_seal_id:preparation.sealId,p_retained_payload_id:body.retainedPayloadId}));
   if(receipt.retainedPayloadId!==body.retainedPayloadId||receipt.bodyFingerprint!==body.payloadFingerprint||receipt.inputFingerprint!==preparation.inputFingerprint)deny();return receipt;
  },
 };
}
