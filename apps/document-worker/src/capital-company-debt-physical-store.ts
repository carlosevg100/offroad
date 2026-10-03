/** Single physical writer/reader for native company-debt and its recovery allocations. */
import {createHash} from "node:crypto";
import {z} from "zod";
import type {SupabaseClient} from "@supabase/supabase-js";
import {legacyGatewayFingerprint} from "@offroad/model-gateway";
import {capitalCompanyDebtRetentionScopeSchema} from "./capital-company-debt-protocol";
import {retryCapitalCaptureRpc} from "./capital-capture-rpc-retry";
import type {CapitalProjectAnalysisJob} from "./queue";
const scopeSchema=capitalCompanyDebtRetentionScopeSchema;
type Scope=z.infer<typeof scopeSchema>;
const sha=(bytes:Uint8Array|string)=>createHash("sha256").update(bytes).digest("hex");
const same=(a:unknown,b:unknown)=>legacyGatewayFingerprint(a)===legacyGatewayFingerprint(b);
export type CapitalCompanyDebtPhysicalReader=(authority:{jobId:string;capabilityToken:string},scope:Scope)=>Promise<{bytes:Uint8Array;objectId:string;version:string}>;
export function createCapitalCompanyDebtPhysicalStore(client:SupabaseClient,job:CapitalProjectAnalysisJob,readBytes:CapitalCompanyDebtPhysicalReader,now:()=>number=Date.now){
 const authority=Object.freeze({jobId:z.uuid().parse(job.job_id),capabilityToken:z.string().min(1).parse(job.capability_token)});
 const rpc=async(name:string,input:Record<string,unknown>)=>{const args={p_job_id:authority.jobId,p_capability_token:authority.capabilityToken,...input};const result=await retryCapitalCaptureRpc(()=>client.rpc(name,args));if(result.error)throw new Error("capital_debt_physical_database_denied");return result.data as unknown;};
 const live=(scope:Scope)=>{if(scope.path!==`${job.organization_id}/${scope.allocationId}/payload.json`||Date.parse(scope.retainedAt)>=Date.parse(scope.purgeAt)||Date.parse(scope.purgeAt)>=Date.parse(scope.expiresAt)||Date.parse(scope.purgeAt)<=now())throw new Error("capital_debt_retention_denied");};
 const readScope=async(allocationId:string)=>{const envelope=z.strictObject({schemaVersion:z.literal("capital-debt-worker-read-scope.v1"),recipeId:z.uuid(),retention:scopeSchema}).parse(await rpc("worker_read_capital_debt_allocation_v1",{p_allocation_id:allocationId}));const scope=envelope.retention;live(scope);if(scope.allocationId!==allocationId)throw new Error("capital_debt_scope_denied");return scope;};
 const read=async(expected:Scope)=>{live(expected);const before=await readScope(expected.allocationId);const omit=(s:Scope)=>{const{replayed:_,...v}=s;return v;};if(!same(omit(before),omit(expected)))throw new Error("capital_debt_scope_changed");
  const physical=await readBytes(authority,before);const after=await readScope(before.allocationId);if(!same(omit(before),omit(after))||physical.bytes.length!==after.byteLength||sha(physical.bytes)!==after.payloadFingerprint)throw new Error("capital_debt_body_changed");if(physical.objectId!==after.storageObjectId||physical.version!==after.storageVersion)throw new Error("capital_debt_storage_identity_changed");return{bytes:physical.bytes,scope:after};};
 const retain=async(prepared:unknown)=>{const value=scopeSchema.extend({canonicalBody:z.string().min(1)}).parse(prepared),{canonicalBody,...rawScope}=value;const scope=scopeSchema.parse(rawScope);live(scope);
  const bytes=Buffer.from(canonicalBody);if(bytes.length!==scope.byteLength||sha(bytes)!==scope.payloadFingerprint)throw new Error("capital_debt_canonical_body_changed");
  if(scope.retentionState==="retained"){await read(scope);return scope;}
  if(Date.parse(scope.uploadExpiresAt)<=now())throw new Error("capital_debt_upload_expired");
  const upload=await client.storage.from(scope.bucket).upload(scope.path,bytes,{contentType:"application/json",cacheControl:"0",upsert:false,
   headers:{"x-offroad-workspace":job.organization_id,"x-offroad-job-id":job.job_id,"x-offroad-capability":job.capability_token}});
  if(upload.error&&Number((upload.error as {statusCode?:unknown}).statusCode)!==409)throw new Error("capital_debt_storage_denied");
  const physical=await readBytes(authority,scope);
  if(sha(physical.bytes)!==scope.payloadFingerprint||physical.bytes.length!==scope.byteLength)throw new Error("capital_debt_storage_mismatch");
  const retained=scopeSchema.parse(await rpc("worker_commit_capital_debt_body_v1",{p_allocation_id:scope.allocationId,p_storage_object_id:physical.objectId,
   p_storage_version:physical.version,p_verified_sha256:sha(physical.bytes),p_verified_size:physical.bytes.length}));live(retained);
  if(retained.allocationId!==scope.allocationId||retained.retentionState!=="retained"||retained.payloadFingerprint!==scope.payloadFingerprint)throw new Error("capital_debt_commit_mismatch");await read(retained);return retained;};
 return Object.freeze({retain,read,readScope});
}
