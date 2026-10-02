import {retryCapitalCaptureRpc} from "./capital-capture-rpc-retry";
/** Read/transform/commit recovery from a server grant. No model SDK, factory,
 * authorization/dispatch RPC or reconstruction from missing historical bytes. */
import {createHash,randomUUID} from "node:crypto";
import {z} from "zod";
import type {SupabaseClient} from "@supabase/supabase-js";
import {originationSeniorReadoutSchema,capitalPublicLicensedPayloadSchema} from "@offroad/domain-contracts";
import {researchSourceSchema,type ResearchSource} from "@offroad/public-research";
import {legacyGatewayFingerprint,prepareGatewayInput,retentionMatrixVersion} from "@offroad/model-gateway";
import {capitalM07RecipeReceiptSchema,capitalM07FinalOutputFingerprint} from "./capital-m07-processing";
import {reconstructCapitalM07Preparation} from "./origination-thesis";
import {reconstructCapitalPublicTaskRequest} from "./capital-public-task-recipe";
import {capitalM07CommitReceiptSchema,capitalM07RetentionScopeSchema,capitalM07QualityResultsSchema,capitalM07QualityFailureSchema,capitalM07QualityFailureReceiptSchema,CapitalM07QualityFailure,type CapitalM07CommitReceipt,type CapitalM07RetentionScope} from "./capital-m07-protocol";
import {readCapitalCaptureBytes,readCapitalM07RecoveryBytes,readCapitalM07RecoverySourceBytes} from "./capital-body-read-client";
import type {CapitalProjectAnalysisJob} from "./queue";
const uuid=z.uuid(),hash=z.string().regex(/^[a-f0-9]{64}$/),time=z.iso.datetime({offset:true});
const discoverySchema=z.strictObject({schemaVersion:z.literal("capital-m07-recovery-discovery.v1"),state:z.enum(["none","recovery","unresolved"]),recipeId:uuid.nullable()});
const metadataSchema=z.strictObject({schemaVersion:z.literal("capital-m07-reconstruction-metadata.v1"),originalAttempt:z.number().int().positive(),researchStatus:z.enum(["succeeded","partial","abstained"]),dependencies:z.array(z.strictObject({id:uuid,artifactFingerprint:hash})).min(1).max(1000)});
const pinsSchema=z.strictObject({schemaVersion:z.literal("capital-m07-reconstruction-pins.v1"),promptFingerprint:hash,primaryRequestFingerprint:hash,fallbackRequestFingerprint:hash});
const acceptedSchema=z.strictObject({acceptedInvocationId:uuid,inputReceiptId:uuid,invocationId:uuid,outputFingerprint:hash,provider:z.literal("openai"),reportedModel:z.enum(["gpt-5.6-sol","gpt-5.6-terra"])});
export const capitalM07RecoveryGrantSchema=z.strictObject({schemaVersion:z.literal("capital-m07-recovery-grant.v1"),mode:z.literal("recovery"),state:z.enum(["committed","commit","transform","quality_failed","unresolved"]),
 recipeId:uuid,originalJobId:uuid,authorizedJobId:uuid,organizationId:uuid,workId:uuid,taskRunId:uuid,recipe:capitalM07RecipeReceiptSchema,reconstructionMetadata:metadataSchema,requestPins:pinsSchema,
 qualityFailure:capitalM07QualityFailureSchema.nullable(),accepted:acceptedSchema.nullable(),context:capitalM07RetentionScopeSchema,sources:z.array(z.strictObject({deliveryId:uuid,retainedPayloadId:uuid})).min(1).max(500),
 parsed:capitalM07RetentionScopeSchema.nullable(),final:capitalM07RetentionScopeSchema.nullable(),revisionId:uuid.nullable(),capitalArtifactId:uuid.nullable(),expiresAt:time,dispatchAllowed:z.literal(false)});
const sourceScopeSchema=z.strictObject({schemaVersion:z.literal("capital-public-storage-scope.v1"),state:z.literal("complete"),allocationId:uuid,retainedPayloadId:uuid,deliveryId:uuid,
 bucket:z.literal("capital-input-capture"),path:z.string().regex(/^[a-f0-9-]{36}\/[a-f0-9-]{36}\/payload\.json$/),payloadFingerprint:hash,byteLength:z.number().int().positive().max(1048576),
 storageObjectId:uuid,storageVersion:z.string().min(1),retainedAt:time,uploadExpiresAt:time,expiresAt:time,purgeAt:time});
export type CapitalM07RecoveryTransform=(input:{parsed:unknown;originalContext:unknown;sources:ResearchSource[];asOfDate:string;accepted:z.infer<typeof acceptedSchema>;researchStatus:z.infer<typeof metadataSchema>["researchStatus"];modelInput:Record<string,unknown>})=>{finalProduct:unknown;qualityResults:{id:string;passed:boolean}[]}|Promise<{finalProduct:unknown;qualityResults:{id:string;passed:boolean}[]}>;
export class CapitalM07RecoveryGap extends Error {readonly code="capital_m07_retained_recovery_required";constructor(){super("capital_m07_retained_recovery_required");}}
const sha=(v:Uint8Array|string)=>createHash("sha256").update(v).digest("hex"),same=(a:unknown,b:unknown)=>legacyGatewayFingerprint(a)===legacyGatewayFingerprint(b);
const omitReplay=(scope:CapitalM07RetentionScope)=>{const{replayed:_,...identity}=scope;return identity;};
export async function recoverCapitalM07Existing(client:SupabaseClient,job:CapitalProjectAnalysisJob,transform:CapitalM07RecoveryTransform,now:()=>number=Date.now):Promise<{commit:CapitalM07CommitReceipt;sourceCount:number;researchStatus:z.infer<typeof metadataSchema>["researchStatus"];finalRetainedPayloadId:string}|null>{
 const authority={jobId:uuid.parse(job.job_id),capabilityToken:z.string().min(1).parse(job.capability_token)},args={p_job_id:authority.jobId,p_capability_token:authority.capabilityToken};
 const rpc=async(name:string,input:Record<string,unknown>={})=>{const result=await retryCapitalCaptureRpc(() => client.rpc(name,{...args,...input}));if(result.error)throw new Error("capital_m07_recovery_denied");return result.data as unknown;};
 const discovery=discoverySchema.parse(await rpc("worker_find_capital_m07_recovery_v1"));
 if(discovery.state==="none"){if(discovery.recipeId!==null)throw new Error("capital_m07_recovery_denied");return null;}
 if(discovery.state!=="recovery"||!discovery.recipeId)throw new CapitalM07RecoveryGap();
 const grant=capitalM07RecoveryGrantSchema.parse(await rpc("worker_recover_capital_m07_result_v1",{p_recipe_id:discovery.recipeId}));
 const live=(scope:{allocationId:string;path:string;retainedAt:string;purgeAt:string;expiresAt:string})=>{if(scope.path!==`${job.organization_id}/${scope.allocationId}/payload.json`||Date.parse(scope.retainedAt)>=Date.parse(scope.purgeAt)||Date.parse(scope.purgeAt)>=Date.parse(scope.expiresAt)||Date.parse(scope.purgeAt)<=now())throw new Error("capital_m07_recovery_denied");};
 if(grant.recipeId!==discovery.recipeId||grant.authorizedJobId!==job.job_id||grant.organizationId!==job.organization_id||grant.workId!==job.payload.capital_project_id||grant.recipe.recipeId!==grant.recipeId||grant.recipe.jobId!==grant.originalJobId||grant.recipe.workId!==grant.workId||grant.recipe.organizationId!==grant.organizationId||grant.recipe.taskRunId!==grant.taskRunId||grant.recipe.planId!==job.payload.capital_project_plan_id||Date.parse(grant.expiresAt)<=now())throw new Error("capital_m07_recovery_denied");
 if(grant.state==="unresolved"||!grant.accepted||!grant.parsed?.retainedPayloadId)throw new CapitalM07RecoveryGap();
 const accepted=grant.accepted,parsedScope=grant.parsed;
 const immutable=(value:z.infer<typeof capitalM07RecoveryGrantSchema>)=>({recipeId:value.recipeId,originalJobId:value.originalJobId,authorizedJobId:value.authorizedJobId,organizationId:value.organizationId,workId:value.workId,taskRunId:value.taskRunId,
  recipe:value.recipe,reconstructionMetadata:value.reconstructionMetadata,requestPins:value.requestPins,accepted:value.accepted,context:omitReplay(value.context),sources:value.sources,parsed:value.parsed?omitReplay(value.parsed):null,expiresAt:value.expiresAt,dispatchAllowed:value.dispatchAllowed});
 const current=async()=>{const next=capitalM07RecoveryGrantSchema.parse(await rpc("worker_recover_capital_m07_result_v1",{p_recipe_id:grant.recipeId}));if(!same(immutable(next),immutable(grant))||next.state==="unresolved"||Date.parse(next.expiresAt)<=now())throw new Error("capital_m07_recovery_denied");return next;};
 const body=async(scope:CapitalM07RetentionScope)=>{live(scope);if(scope.retentionState!=="retained"||!scope.retainedPayloadId||!scope.storageObjectId||!scope.storageVersion)throw new CapitalM07RecoveryGap();await current();
  const input={p_recipe_id:grant.recipeId,p_retained_payload_id:scope.retainedPayloadId};const before=capitalM07RetentionScopeSchema.parse(await rpc("worker_read_capital_m07_recovery_body_v1",input));live(before);if(!same(omitReplay(before),omitReplay(scope)))throw new Error("capital_m07_recovery_scope_changed");
  const physical=await readCapitalM07RecoveryBytes(client,authority,{recipeId:grant.recipeId,retainedPayloadId:scope.retainedPayloadId},before);
  const after=capitalM07RetentionScopeSchema.parse(await rpc("worker_read_capital_m07_recovery_body_v1",input));live(after);if(!same(omitReplay(before),omitReplay(after))||physical.bytes.length!==after.byteLength||sha(physical.bytes)!==after.payloadFingerprint)throw new Error("capital_m07_recovery_body_changed");await current();return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(physical.bytes)) as unknown;};
 const originalContext=await body(grant.context),parsedRaw=await body(parsedScope),parsed=originationSeniorReadoutSchema.strict().parse(parsedRaw);
 if(!same(parsedRaw,parsed)||legacyGatewayFingerprint(parsed)!==accepted.outputFingerprint)throw new Error("capital_m07_recovery_parsed_changed");
 const sources:{deliveryId:string;source:ResearchSource}[]=[];
 for(const reference of grant.sources){await current();const input={p_recipe_id:grant.recipeId,p_retained_payload_id:reference.retainedPayloadId};const before=sourceScopeSchema.parse(await rpc("worker_read_capital_m07_recovery_source_v1",input));live(before);
  if(before.deliveryId!==reference.deliveryId||before.retainedPayloadId!==reference.retainedPayloadId)throw new Error("capital_m07_recovery_source_changed");
  const physical=await readCapitalM07RecoverySourceBytes(client,authority,{recipeId:grant.recipeId,retainedPayloadId:reference.retainedPayloadId},before),after=sourceScopeSchema.parse(await rpc("worker_read_capital_m07_recovery_source_v1",input));live(after);
  if(!same(before,after)||physical.bytes.length!==after.byteLength||sha(physical.bytes)!==after.payloadFingerprint)throw new Error("capital_m07_recovery_source_changed");
  const payload=capitalPublicLicensedPayloadSchema.parse(JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(physical.bytes)) as unknown);
  const source=researchSourceSchema.strict().safeParse({...payload,publishedAt:payload.publishedAt??null});if(!source.success)throw new CapitalM07RecoveryGap();sources.push({deliveryId:reference.deliveryId,source:source.data});await current();}
 const reconstructed=reconstructCapitalM07Preparation({recipe:grant.recipe,originalContext,sources,originalAttempt:grant.reconstructionMetadata.originalAttempt,researchStatus:grant.reconstructionMetadata.researchStatus,dependencies:grant.reconstructionMetadata.dependencies});
 const prepared=prepareGatewayInput({...reconstructed.reconstruction.prepared.request,requireInputAttestation:true,outputMode:"structured",timeoutMs:360000,dataHandling:{classification:"confidential",purpose:"case_analysis",requiredPolicyVersion:retentionMatrixVersion}});
 const input={...reconstructed.reconstruction,prepared};const routes=[{provider:"openai" as const,model:"gpt-5.6-sol",effort:"high" as const},{provider:"openai" as const,model:"gpt-5.6-terra",effort:"high" as const}];
 const pins=routes.map(route=>reconstructCapitalPublicTaskRequest(input,route,{maxOutputTokens:24000,timeoutMs:360000}));
 if(pins[0]!.promptFingerprint!==grant.requestPins.promptFingerprint||pins[0]!.requestFingerprintV1!==grant.requestPins.primaryRequestFingerprint||pins[1]!.requestFingerprintV1!==grant.requestPins.fallbackRequestFingerprint)throw new Error("capital_m07_recovery_request_changed");
 const diagnose=async(finalScope:CapitalM07RetentionScope,finalFingerprint:string,quality:unknown):Promise<never>=>{
  const qualityResults=capitalM07QualityResultsSchema.parse(quality);if(!qualityResults.some(value=>!value.passed)||!finalScope.retainedPayloadId)throw new Error("capital_m07_quality_failure_invalid");await current();
  const failure=capitalM07QualityFailureReceiptSchema.parse(await rpc("worker_record_capital_m07_quality_failure_v1",{p_recipe_id:grant.recipeId,p_accepted_invocation_id:accepted.acceptedInvocationId,p_parsed_retained_payload_id:parsedScope.retainedPayloadId,
   p_final_retained_payload_id:finalScope.retainedPayloadId,p_final_fingerprint:finalFingerprint,p_quality_results:qualityResults}));
  const expected={schemaVersion:"capital-m07-quality-failure.v1",acceptedInvocationId:accepted.acceptedInvocationId,parsedRetainedPayloadId:parsedScope.retainedPayloadId,finalRetainedPayloadId:finalScope.retainedPayloadId,finalFingerprint,qualityResults};
  if(failure.recipeId!==grant.recipeId||failure.taskRunId!==grant.taskRunId||!same(failure.qualityFailure,expected)||(grant.state==="quality_failed"&&!failure.replayed))throw new Error("capital_m07_quality_failure_changed");await current();throw new CapitalM07QualityFailure();
 };
 if(grant.state==="quality_failed"){
  if(!grant.qualityFailure||!grant.final?.retainedPayloadId||grant.qualityFailure.acceptedInvocationId!==accepted.acceptedInvocationId||grant.qualityFailure.parsedRetainedPayloadId!==parsedScope.retainedPayloadId||grant.qualityFailure.finalRetainedPayloadId!==grant.final.retainedPayloadId)throw new Error("capital_m07_quality_failure_changed");
  const final=await body(grant.final),fingerprint=capitalM07FinalOutputFingerprint(accepted.outputFingerprint,grant.recipe.recipeFingerprint,final);
  if(fingerprint!==grant.qualityFailure.finalFingerprint)throw new Error("capital_m07_quality_failure_changed");return diagnose(grant.final,fingerprint,grant.qualityFailure.qualityResults);
 }
 if(grant.qualityFailure)throw new Error("capital_m07_quality_failure_changed");
 await current();const transformed=await transform({parsed,originalContext,sources:sources.map(value=>value.source),asOfDate:grant.recipe.asOfDate,accepted,researchStatus:grant.reconstructionMetadata.researchStatus,modelInput:reconstructed.modelInput});
 const qualityResults=capitalM07QualityResultsSchema.parse(transformed.qualityResults);
 const finalFingerprint=capitalM07FinalOutputFingerprint(accepted.outputFingerprint,grant.recipe.recipeFingerprint,transformed.finalProduct);
 let finalScope=grant.final;
 if(finalScope){const final=await body(finalScope);if(!same(final,transformed.finalProduct))throw new Error("capital_m07_recovery_final_changed");}
 else{
  if(grant.state!=="transform")throw new CapitalM07RecoveryGap();await current();
  const preparedOutput=capitalM07RetentionScopeSchema.extend({canonicalBody:z.string().min(1)}).parse(await rpc("worker_prepare_capital_m07_recovered_output_v1",{p_recipe_id:grant.recipeId,p_request_id:randomUUID(),p_kind:"final",p_accepted_invocation_id:accepted.acceptedInvocationId,
   p_body:transformed.finalProduct,p_output_fingerprint:finalFingerprint,p_parent_retained_payload_id:parsedScope.retainedPayloadId}));const{canonicalBody,...scopeValue}=preparedOutput;const scope=capitalM07RetentionScopeSchema.parse(scopeValue);live(scope);
  const bytes=Buffer.from(canonicalBody);if(sha(bytes)!==scope.payloadFingerprint||bytes.length!==scope.byteLength||!same(JSON.parse(canonicalBody) as unknown,transformed.finalProduct))throw new Error("capital_m07_recovery_canonical_changed");
  if(scope.retentionState!=="allocated"||Date.parse(scope.uploadExpiresAt)<=now())throw new Error("capital_m07_recovery_upload_denied");
  const upload=await client.storage.from(scope.bucket).upload(scope.path,bytes,{contentType:"application/json",cacheControl:"0",upsert:false,headers:{"x-offroad-workspace":job.organization_id,"x-offroad-job-id":job.job_id,"x-offroad-capability":job.capability_token}});
  if(upload.error&&Number((upload.error as {statusCode?:unknown}).statusCode)!==409)throw new Error("capital_m07_recovery_upload_denied");
  const physical=await readCapitalCaptureBytes(client,authority,scope,"m07_body");if(sha(physical.bytes)!==scope.payloadFingerprint||physical.bytes.length!==scope.byteLength)throw new Error("capital_m07_recovery_upload_changed");
  finalScope=capitalM07RetentionScopeSchema.parse(await rpc("worker_commit_capital_m07_body_v1",{p_allocation_id:scope.allocationId,p_storage_object_id:physical.objectId,p_storage_version:physical.version,p_verified_sha256:sha(physical.bytes),p_verified_size:physical.bytes.length}));live(finalScope);
  if(finalScope.allocationId!==scope.allocationId||finalScope.payloadFingerprint!==scope.payloadFingerprint||!finalScope.retainedPayloadId)throw new Error("capital_m07_recovery_commit_changed");await current();const final=await body(finalScope);if(!same(final,transformed.finalProduct))throw new Error("capital_m07_recovery_final_changed");}
 await current();if(!finalScope?.retainedPayloadId)throw new CapitalM07RecoveryGap();
 if(qualityResults.some(value=>!value.passed))return diagnose(finalScope,finalFingerprint,qualityResults);
 const commit=capitalM07CommitReceiptSchema.parse(await rpc("worker_commit_capital_m07_recovered_result_v1",{p_recipe_id:grant.recipeId,p_accepted_invocation_id:accepted.acceptedInvocationId,p_parsed_retained_payload_id:parsedScope.retainedPayloadId,p_final_retained_payload_id:finalScope.retainedPayloadId,
  p_final_fingerprint:finalFingerprint,p_quality_results:qualityResults}));
 if(commit.recipeId!==grant.recipeId||commit.taskRunId!==grant.taskRunId||commit.finalFingerprint!==finalFingerprint||(grant.state==="committed"&&(commit.revisionId!==grant.revisionId||commit.capitalArtifactId!==grant.capitalArtifactId||!commit.replayed)))throw new Error("capital_m07_recovery_commit_changed");await current();
 return{commit,sourceCount:sources.length,researchStatus:grant.reconstructionMetadata.researchStatus,finalRetainedPayloadId:finalScope.retainedPayloadId};
}
