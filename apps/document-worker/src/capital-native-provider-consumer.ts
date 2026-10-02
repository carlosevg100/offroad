/** Closed, zero-model consumers. Physical capture/commit authority belongs to SQL.
 * The main worker selects this consumer only after the native server gates deploy. */
import {createHash} from "node:crypto";
import {z} from "zod";
import {fingerprintJson} from "@offroad/case-understanding";
import {publicCapitalCatalogSourceSnapshot} from "@offroad/public-research/capital-catalog";
import {buildProviderResearch} from "./provider-research";
import {buildProviderCaseFitWork} from "./provider-case-fit";
import type {CapitalProjectAnalysisJob} from "./queue";
const hash=z.string().regex(/^[a-f0-9]{64}$/),uuid=z.uuid();
export const nativeProviderFamilySchema=z.enum(["provider_research","provider_case_fit"]);
export const nativeProviderReceiptSchema=z.strictObject({schemaVersion:z.literal("capital-native-result-receipt.v1"),recipeId:uuid,
 family:nativeProviderFamilySchema,taskId:z.enum(["M01","K01","K02"]),artifactType:z.string().min(1).max(100),artifactId:uuid,revisionId:uuid,
 retainedPayloadId:uuid,bodyFingerprint:hash,inputFingerprint:hash,artifactFingerprint:hash,contextFingerprint:hash,
 executorVersion:z.enum(["2026.09.10-v1","2026.09.10-v2"]),modelCalls:z.literal(0),grantsApproval:z.literal(false),grantsExternalEffect:z.literal(false)});
export type NativeProviderReceipt=z.infer<typeof nativeProviderReceiptSchema>;
export const nativeProviderRecipeSchema=z.strictObject({schemaVersion:z.literal("capital-native-recipe-receipt.v1"),recipeId:uuid,family:nativeProviderFamilySchema,
 jobId:uuid,organizationId:uuid,workId:uuid,planId:uuid,briefId:uuid,contextFingerprint:hash,retainedPayloadId:uuid,
 contextByteLength:z.number().int().positive().max(1048576),catalogRetainedPayloadId:uuid.nullable(),catalogFingerprint:hash.nullable(),expiresAt:z.iso.datetime({offset:true}),closed:z.literal(true)});
export type NativeProviderRecipe=z.infer<typeof nativeProviderRecipeSchema>;
export const nativeProviderRecoverySchema=z.strictObject({schemaVersion:z.literal("capital-native-provider-recovery.v1"),family:nativeProviderFamilySchema,
 recipe:nativeProviderRecipeSchema.nullable(),results:z.array(nativeProviderReceiptSchema).max(3)});
export interface NativeProviderPorts {
 /** Must inspect committed identities before loading current brief/catalog/inputs. */
 recover():Promise<unknown>;
 /** Captures server context, retains actual bytes and closes licensed source closure. */
 capture():Promise<unknown>;
 /** Server reader binds original recipe, retained id, physical hash/length and current rights. */
 readContext(recipe:NativeProviderRecipe):Promise<Uint8Array>;
 /** Returns only the actually licensed, physically retained catalogue payload. */
 readCatalog(recipe:NativeProviderRecipe):Promise<Uint8Array>;
 commit(input:{recipe:NativeProviderRecipe;taskId:"M01"|"K01"|"K02";artifactType:string;executorVersion:"2026.09.10-v1"|"2026.09.10-v2";
  content:Record<string,unknown>;dependencies:NativeProviderReceipt[]}):Promise<unknown>;
}
const tasks=["M01","K01","K02"] as const;
const sha=(bytes:Uint8Array)=>createHash("sha256").update(bytes).digest("hex");
const freeze=<T>(value:T):T=>{if(value&&typeof value==="object"){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
function artifactType(family:z.infer<typeof nativeProviderFamilySchema>,task:typeof tasks[number]){
 return task==="K02"?family:family+(task==="M01"?"_scope":"_sources");
}
function boundRecipe(value:unknown,job:CapitalProjectAnalysisJob,now:number){
 const r=nativeProviderRecipeSchema.parse(value);
 if(r.family!==job.payload.analysis_scope||r.jobId!==job.job_id||r.organizationId!==job.organization_id||r.workId!==job.payload.capital_project_id
 ||r.planId!==job.payload.capital_project_plan_id||r.briefId!==job.payload.capital_project_brief_id||Date.parse(r.expiresAt)<=now)throw Error("native_provider_recipe_denied");
 if((r.catalogRetainedPayloadId===null)!==(r.catalogFingerprint===null))throw Error("native_provider_catalog_binding_invalid");
 return freeze(r);
}
function boundResult(value:unknown,recipe:NativeProviderRecipe,task:typeof tasks[number]){
 const r=nativeProviderReceiptSchema.parse(value);
 if(r.recipeId!==recipe.recipeId||r.family!==recipe.family||r.taskId!==task||r.artifactType!==artifactType(recipe.family,task)||r.contextFingerprint!==recipe.contextFingerprint)
 throw Error("native_provider_result_binding_invalid");return freeze(r);
}
export async function consumeNativeProviderWork(job:CapitalProjectAnalysisJob,ports:NativeProviderPorts,now:()=>number=Date.now){
 const family=nativeProviderFamilySchema.parse(job.payload.analysis_scope);
 if(job.kind!=="capital_project_analysis"||job.payload.revision_of_artifact_id||job.payload.model_budget.max_calls!==0||job.payload.model_budget.max_cost_usd!==0
 ||JSON.stringify(job.payload.capital_task_ids)!==JSON.stringify(tasks))throw Error("native_provider_job_denied");
 const recovered=nativeProviderRecoverySchema.parse(await ports.recover());
 if(recovered.family!==family||(!recovered.recipe&&recovered.results.length))throw Error("native_provider_recovery_binding_invalid");
 const recipe=boundRecipe(recovered.recipe??await ports.capture(),job,now());
 const results=new Map<typeof tasks[number],NativeProviderReceipt>();
 for(const item of recovered.results){if(results.has(item.taskId))throw Error("native_provider_duplicate_recovery");results.set(item.taskId,boundResult(item,recipe,item.taskId));}
 // A committed later task can never manufacture a missing predecessor.
 for(let i=1;i<tasks.length;i++)if(results.has(tasks[i]!)&&!results.has(tasks[i-1]!))throw Error("native_provider_recovery_graph_invalid");
 if(results.size===3)return {status:"succeeded" as const,replayed:true,artifact:results.get("K02")!,modelCalls:0 as const};
 const bytes=Uint8Array.from(await ports.readContext(recipe));
 if(bytes.length!==recipe.contextByteLength||sha(bytes)!==recipe.contextFingerprint||Date.parse(recipe.expiresAt)<=now())throw Error("native_provider_context_bytes_invalid");
 let raw:Record<string,unknown>;
 try{raw=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));}catch{throw Error("native_provider_context_bytes_invalid");}
 // Prior output is never a constituent of the native context input. Legacy copies
 // are not promoted to a native receipt by injecting them into this body.
 if(Array.isArray(raw.priorArtifacts)&&raw.priorArtifacts.length)throw Error("native_provider_legacy_prior_denied");
 if(raw.schemaVersion==="provider-research-context.v2"){
  if(!recipe.catalogRetainedPayloadId||recipe.catalogFingerprint!==(raw.publicCatalog as {sourceFingerprint?:unknown}|undefined)?.sourceFingerprint)throw Error("native_provider_catalog_binding_invalid");
  let catalogPayload:{snippet?:unknown};
  try{catalogPayload=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(await ports.readCatalog(recipe)));}catch{throw Error("native_provider_catalog_bytes_invalid");}
  if(typeof catalogPayload.snippet!=="string")throw Error("native_provider_catalog_bytes_invalid");
  let snapshot:unknown;try{snapshot=JSON.parse(catalogPayload.snippet);}catch{throw Error("native_provider_catalog_bytes_invalid");}
  if(fingerprintJson(snapshot)!==recipe.catalogFingerprint||fingerprintJson(publicCapitalCatalogSourceSnapshot)!==recipe.catalogFingerprint)
   throw Error("native_provider_catalog_executor_closure_mismatch");
 }else if(recipe.catalogRetainedPayloadId!==null||recipe.catalogFingerprint!==null)throw Error("native_provider_unexpected_catalog");
 const built=family==="provider_research"?buildProviderResearch(raw,job):buildProviderCaseFitWork(raw,job);
 const context=built.context,artifact=built.artifact;
 const executorVersion: "2026.09.10-v1"|"2026.09.10-v2"=context.schemaVersion==="provider-research-context.v2"?"2026.09.10-v2":"2026.09.10-v1";
 const publicPin=context.schemaVersion==="provider-research-context.v2"?{publicCatalog:context.publicCatalog}:{};
 for(const taskId of tasks){
  if(results.has(taskId))continue;
  const content:Record<string,unknown>=taskId==="K02"?artifact:taskId==="M01"?
   family==="provider_research"?{schemaVersion:"provider-research-scope.v1",projectId:context.projectId,planId:context.planId,objective:context.objective,asOf:context.asOf,scope:"research_only",...publicPin}:
    {schemaVersion:"provider-case-fit-scope.v1",projectId:context.projectId,planId:context.planId,objective:context.objective,
     caseCriteria:(context as ReturnType<typeof buildProviderCaseFitWork>["context"]).caseCriteria,
     caseFingerprint:(artifact as ReturnType<typeof buildProviderCaseFitWork>["artifact"]).caseFingerprint,asOf:context.asOf,scope:"research_case_fit"}:
   {schemaVersion:family==="provider_research"?"provider-research-sources.v1":"provider-case-fit-sources.v1",projectId:context.projectId,planId:context.planId,
    sourceFingerprint:artifact.sourceFingerprint,providerCount:family==="provider_research"?(artifact as ReturnType<typeof buildProviderResearch>["artifact"]).providers.length:
     (artifact as ReturnType<typeof buildProviderCaseFitWork>["artifact"]).candidates.length,asOf:context.asOf,...publicPin};
  const previous=taskId==="K01"?results.get("M01"):taskId==="K02"?results.get("K01"):undefined;
  if(Date.parse(recipe.expiresAt)<=now())throw Error("native_provider_recipe_expired");
  const receipt=boundResult(await ports.commit(freeze({recipe,taskId,artifactType:artifactType(family,taskId),executorVersion,
   content:freeze(structuredClone(content)),dependencies:previous?[previous]:[]})),recipe,taskId);
  if(receipt.executorVersion!==executorVersion)throw Error("native_provider_executor_version_mismatch");results.set(taskId,receipt);
 }
 return {status:"succeeded" as const,replayed:false,artifact:results.get("K02")!,modelCalls:0 as const};
}
