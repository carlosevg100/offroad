/** Worker SDK transport for finite 3S bodies. Uploads use the live capability;
 * reads go through the authenticated server boundary, never direct Storage GET. */
import {createHash} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {z} from 'zod';
import {capitalMaterialBodyScopeSchema,type MaterialBodyScope} from './capital-material-production-native';
import type {CapitalMaterialPhysicalTransport} from './capital-material-production-adapter';
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
function stable(s:MaterialBodyScope){return {...s,storageObjectId:null,storageVersion:null};}
export function createCapitalMaterialStorageTransport(input:{client:SupabaseClient;jobId:string;capability:string;organizationId:string;workId:string;now?:()=>number}):CapitalMaterialPhysicalTransport{
 const {client}=input;const now=input.now??Date.now;
 for(const value of [input.jobId,input.organizationId,input.workId])z.uuid().parse(value);z.string().min(1).parse(input.capability);
 const headers={'x-offroad-workspace':input.organizationId,'x-offroad-job-id':input.jobId,'x-offroad-capability':input.capability};
 const live=(s:MaterialBodyScope)=>{if(s.organizationId!==input.organizationId||s.workId!==input.workId||s.path!==`${input.organizationId}/${s.allocationId}/payload.json`||Math.min(Date.parse(s.expiresAt),Date.parse(s.purgeAt))<=now())throw new Error('capital_material_storage_scope_denied');};
 const rpc=async(name:string,args:Record<string,unknown>)=>{const r=await client.rpc(name,{p_job_id:input.jobId,p_capability_token:input.capability,...args});if(r.error)throw new Error('capital_material_storage_authority_denied');return r.data as unknown;};
 const readScope=async(id:string)=>{const s=capitalMaterialBodyScopeSchema.parse(await rpc('worker_read_material_production_allocation_v1',{p_allocation_id:id}));live(s);if(s.allocationId!==id)throw new Error('capital_material_storage_scope_changed');return s;};
 const physical=async(s:MaterialBodyScope)=>{
  const r=await client.functions.invoke('capital-body-read',{method:'POST',body:{kind:'material_body',allocationId:s.allocationId},headers,timeout:10000});
  if(r.error||!(r.data instanceof Blob)||!r.response||r.response.headers.get('content-type')!=='application/octet-stream'||!r.response.headers.get('cache-control')?.split(',').some(v=>v.trim()==='no-store')||r.data.size!==s.byteLength)throw new Error('capital_material_physical_read_denied');
  const h=r.response.headers;
  if(h.get('x-offroad-allocation-id')!==s.allocationId||h.get('x-offroad-recipe-id')!==s.recipeId||h.get('x-offroad-work-id')!==s.workId||h.get('x-offroad-payload-sha256')!==s.payloadFingerprint)throw new Error('capital_material_physical_scope_changed');
  const objectId=z.uuid().parse(h.get('x-offroad-object-id')),version=z.string().min(1).parse(h.get('x-offroad-storage-version'));
  if(objectId!==s.storageObjectId||version!==s.storageVersion)throw new Error('capital_material_physical_version_changed');
  const bytes=new Uint8Array(await r.data.arrayBuffer());live(s);
  if(bytes.byteLength!==s.byteLength||hash(bytes)!==s.payloadFingerprint)throw new Error('capital_material_physical_bytes_changed');
  return {bytes,objectId,version};
 };
 const read=async(expected:MaterialBodyScope)=>{live(expected);const before=await readScope(expected.allocationId);if(!same(before,expected))throw new Error('capital_material_storage_scope_changed');const result=await physical(before);const after=await readScope(before.allocationId);if(!same(before,after))throw new Error('capital_material_storage_scope_changed');return {scope:after,bytes:result.bytes};};
 return {read,retain:async(expected,bytes)=>{
  live(expected);if(bytes.byteLength!==expected.byteLength||hash(bytes)!==expected.payloadFingerprint)throw new Error('capital_material_canonical_bytes_changed');
  if(expected.retainedPayloadId){await read(expected);return expected;}
  const upload=await client.storage.from(expected.bucket).upload(expected.path,bytes,{contentType:'application/json',cacheControl:'0',upsert:false,headers});
  if(upload.error&&Number((upload.error as {statusCode?:unknown}).statusCode)!==409)throw new Error('capital_material_upload_denied');
  const scope=await readScope(expected.allocationId);if(!same(stable(scope),stable(expected)))throw new Error('capital_material_upload_scope_changed');
  const result=await physical(scope);const after=await readScope(scope.allocationId);if(!same(scope,after))throw new Error('capital_material_upload_scope_changed');
  const receipt=capitalMaterialBodyScopeSchema.parse(await rpc('worker_commit_material_production_body_v1',{p_allocation_id:scope.allocationId,p_storage_object_id:result.objectId,p_storage_version:result.version,p_verified_sha256:hash(result.bytes),p_verified_size:result.bytes.byteLength}));live(receipt);
  if(!same({...receipt,retainedPayloadId:null},scope)||!receipt.retainedPayloadId)throw new Error('capital_material_physical_commit_changed');await read(receipt);return receipt;
 }};
}
