import "server-only";
import {createHash} from "node:crypto";
import {z} from "zod";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {Database} from "@/types/database";
const uuid=z.uuid(),hash=z.string().regex(/^[a-f0-9]{64}$/);
const projection=z.strictObject({schemaVersion:z.literal("capital-native-provider-result-reference.v1"),recipeId:uuid,family:z.enum(["provider_research","provider_case_fit"]),taskId:z.enum(["M01","K01","K02"]),retainedPayloadId:uuid,contextFingerprint:hash,inputFingerprint:hash,bodyFingerprint:hash,revisionId:uuid,byteLength:z.number().int().positive().max(1048576),executorVersion:z.enum(["2026.09.10-v1","2026.09.10-v2"]),modelCalls:z.literal(0),grantsApproval:z.literal(false),grantsExternalEffect:z.literal(false)});
export async function readCapitalNativeProviderResult(supabase:SupabaseClient<Database>,input:{organizationId:string;workId:string;family:"provider_research"|"provider_case_fit";projection:unknown}):Promise<{ok:true;content:Record<string,unknown>}|{ok:false}>{
 const parsed=projection.safeParse(input.projection);if(!parsed.success||!uuid.safeParse(input.organizationId).success||!uuid.safeParse(input.workId).success)return{ok:false};const p=parsed.data;
 if(p.family!==input.family||p.taskId!=="K02")return{ok:false};
 try{
  const r=await supabase.functions.invoke("capital-body-read",{method:"POST",body:{kind:"native_provider_human",revisionId:p.revisionId},headers:{"x-offroad-workspace":input.organizationId},timeout:10000});
  if(r.error||!(r.data instanceof Blob)||!r.response||r.data.size!==p.byteLength)return{ok:false};const h=r.response.headers;
  if(h.get("content-type")!=="application/octet-stream"||!h.get("cache-control")?.split(",").some(v=>v.trim()==="no-store"))return{ok:false};
  for(const[key,value]of Object.entries({"x-offroad-organization-id":input.organizationId,"x-offroad-work-id":input.workId,"x-offroad-revision-id":p.revisionId,"x-offroad-recipe-id":p.recipeId,"x-offroad-task-id":"K02","x-offroad-artifact-type":p.family,"x-offroad-retained-payload-id":p.retainedPayloadId,"x-offroad-payload-sha256":p.bodyFingerprint,"x-offroad-byte-length":String(p.byteLength)}))if(h.get(key)!==value)return{ok:false};
  if(!uuid.safeParse(h.get("x-offroad-allocation-id")).success||!uuid.safeParse(h.get("x-offroad-object-id")).success||!/^[a-zA-Z0-9._-]{1,200}$/.test(h.get("x-offroad-storage-version")??""))return{ok:false};
  const bytes=new Uint8Array(await r.data.arrayBuffer());if(bytes.length!==p.byteLength||createHash("sha256").update(bytes).digest("hex")!==p.bodyFingerprint)return{ok:false};
  const content:unknown=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));if(!content||typeof content!=="object"||Array.isArray(content))return{ok:false};const body=content as Record<string,unknown>;
  if(body.projectId!==input.workId||body.shortlistAuthorized!==false||body.externalEffectAllowed!==false||!(p.family==="provider_research"?["provider-research.v1","provider-research.v2"]:["provider-case-fit.v1"]).includes(String(body.schemaVersion)))return{ok:false};
  return{ok:true,content:body};
 }catch{return{ok:false};}
}
/** Native references are resolved only to physical revisions. A withheld native
 * result remains native, so the existing reader cannot fall back to legacy JSON. */
export async function resolveNativeProviderResultRows<T extends{artifact_type:string;schema_version:string;content:unknown}>(supabase:SupabaseClient<Database>,rows:readonly T[],scope:{organizationId:string;workId:string}):Promise<T[]>{
 return Promise.all(rows.map(async row=>{
  if(!["provider_research","provider_case_fit"].includes(row.artifact_type)||row.schema_version!=="capital-native-provider-result-reference.v1")return row;
  const result=await readCapitalNativeProviderResult(supabase,{...scope,family:row.artifact_type as "provider_research"|"provider_case_fit",projection:row.content});
  return result.ok?{...row,content:result.content,schema_version:String(result.content.schemaVersion)}:{...row,content:null};
 }));
}
