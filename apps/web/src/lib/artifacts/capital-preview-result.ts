import "server-only";
import {createHash} from "node:crypto";
import {fingerprintJson} from "@offroad/case-understanding";
import {z} from "zod";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {Database} from "@/types/database";
import {loadCapitalProjectReviewBasis} from "./capital-project-review";
const uuid=z.uuid(),hash=z.string().regex(/^[a-f0-9]{64}$/);
const projection=z.strictObject({schemaVersion:z.literal("capital-preview-task-projection.v1"),revisionId:uuid,runId:uuid,taskId:z.string().min(1),role:z.enum(["task_output","decision_contract"]),retainedPayloadId:uuid,semanticFingerprint:hash,physicalSha256:hash,byteLength:z.number().int().min(1).max(1048576)});
const bodySchema=z.strictObject({schemaVersion:z.literal("capital-preview-json-body.v1"),runId:uuid,taskId:z.string().min(1),role:z.enum(["task_output","decision_contract"]),artifactType:z.string().startsWith("preview_"),inputFingerprint:hash,content:z.record(z.string(),z.unknown())});
export function isCapitalPreviewProjection(value:unknown):boolean{return !!value&&typeof value==="object"&&!Array.isArray(value)&&(value as Record<string,unknown>).schemaVersion==="capital-preview-task-projection.v1";}
/** Auth+current WORK/review authority is checked by the closed Edge RPC before
 * and after physical I/O. The projection contains no displayable legacy body. */
export async function readCapitalPreviewResult(supabase:SupabaseClient<Database>,input:{organizationId:string;workId:string;artifactId:string;artifactType:string;projection:unknown}):Promise<{ok:true;content:Record<string,unknown>}|{ok:false}>{
 const parsed=projection.safeParse(input.projection);if(!parsed.success||![input.organizationId,input.workId,input.artifactId].every(v=>uuid.safeParse(v).success))return{ok:false};const p=parsed.data;
 if((p.role==="decision_contract")!==(input.artifactType==="preview_decision_contract"))return{ok:false};
 try{
  const before=await loadCapitalProjectReviewBasis(supabase,input.workId,input.artifactId,p.revisionId);
  if(!before?.workAccess||["superseded","stale"].includes(before.status))return{ok:false};
  const r=await supabase.functions.invoke("capital-body-read",{method:"POST",body:{kind:"preview_result",revisionId:p.revisionId},headers:{"x-offroad-workspace":input.organizationId},timeout:10000});
  if(r.error||!(r.data instanceof Blob)||!r.response||r.data.size!==p.byteLength)return{ok:false};const h=r.response.headers;
  if(h.get("content-type")!=="application/octet-stream"||!h.get("cache-control")?.split(",").some(v=>v.trim()==="no-store"))return{ok:false};
  for(const[k,v]of Object.entries({"x-offroad-organization-id":input.organizationId,"x-offroad-work-id":input.workId,"x-offroad-artifact-id":input.artifactId,"x-offroad-revision-id":p.revisionId,"x-offroad-recipe-id":p.runId,"x-offroad-final-fingerprint":p.semanticFingerprint,"x-offroad-payload-sha256":p.physicalSha256,"x-offroad-byte-length":String(p.byteLength)}))if(h.get(k)!==v)return{ok:false};
  if(!uuid.safeParse(h.get("x-offroad-allocation-id")).success||!uuid.safeParse(h.get("x-offroad-object-id")).success||!/^[a-zA-Z0-9._-]{1,200}$/.test(h.get("x-offroad-storage-version")??""))return{ok:false};
  const bytes=new Uint8Array(await r.data.arrayBuffer());if(bytes.length!==p.byteLength||createHash("sha256").update(bytes).digest("hex")!==p.physicalSha256)return{ok:false};
  const decoded:unknown=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes)),body=bodySchema.safeParse(decoded);
  if(!body.success||body.data.runId!==p.runId||body.data.taskId!==p.taskId||body.data.role!==p.role||body.data.artifactType!==input.artifactType||fingerprintJson(body.data)!==p.semanticFingerprint)return{ok:false};
  const after=await loadCapitalProjectReviewBasis(supabase,input.workId,input.artifactId,p.revisionId);
  if(!after?.workAccess||["superseded","stale"].includes(after.status)||fingerprintJson(before)!==fingerprintJson(after))return{ok:false};
  return{ok:true,content:body.data.role==="decision_contract"?{contract:body.data.content}:body.data.content};
 }catch{return{ok:false};}
}
/** A native denial stays native and cannot fall back to content.output. Both the
 * metadata column and body marker are considered, so mismatched rows fail closed. */
export async function resolveCapitalPreviewRows<T extends{id:string;artifact_type:string;schema_version:string;content:unknown}>(supabase:SupabaseClient<Database>,rows:readonly T[],scope:{organizationId:string;workId:string}):Promise<Array<T&{nativeReadWithheld?:boolean;nativePhysical?:boolean}>>{
 return Promise.all(rows.map(async row=>{
  if(!row.artifact_type.startsWith("preview_"))return row;
  if(row.schema_version!=="capital-preview-task-projection.v1"&&!isCapitalPreviewProjection(row.content))return row;
  const r=await readCapitalPreviewResult(supabase,{...scope,artifactId:row.id,artifactType:row.artifact_type,projection:row.content});
  return {...row,content:r.ok?r.content:null,nativeReadWithheld:!r.ok,nativePhysical:true};
 }));
}
