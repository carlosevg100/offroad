/** Physical recovery ports only: this module cannot authorize or dispatch a model. */
import {createHash} from "node:crypto";
import {z} from "zod";
import {capitalPlanningMapSchema,capitalPublicLicensedPayloadSchema} from "@offroad/domain-contracts";
import {researchSourceSchema,type ResearchSource} from "@offroad/public-research";
import {legacyGatewayFingerprint,prepareGatewayInput,retentionMatrixVersion} from "@offroad/model-gateway";
import {capitalS11RecipeReceiptSchema,capitalS11FinalOutputFingerprint} from "./capital-s11-processing";
import {prepareCapitalS11Recipe,capitalS11ExecutionPins} from "./capital-s11-recipe";
import {reconstructCapitalS11Components} from "./capital-s11-native-consumer";
import {transformCapitalS11FinalProduct} from "./capital-s11-final";
import {capitalS11RetentionScopeSchema,capitalS11CommitReceiptSchema,capitalS11QualityFailureSchema,capitalS11QualityFailureReceiptSchema,CapitalS11QualityFailure,type CapitalS11RetentionScope} from "./capital-s11-protocol";
const uuid=z.uuid(),hash=z.string().regex(/^[a-f0-9]{64}$/),time=z.iso.datetime({offset:true});
const metadata=z.strictObject({schemaVersion:z.literal("capital-s11-reconstruction-metadata.v1"),originalAttempt:z.number().int().positive(),researchStatus:z.enum(["succeeded","partial","abstained"]),jurisdiction:z.enum(["BR","US"]),jurisdictionNeedsConfirmation:z.boolean(),strategyFingerprint:hash,dependencies:z.array(z.strictObject({id:uuid,artifactFingerprint:hash})).length(2)});
const accepted=z.strictObject({acceptedInvocationId:uuid,inputReceiptId:uuid,invocationId:uuid,outputFingerprint:hash,provider:z.enum(["anthropic","openai"]),reportedModel:z.enum(["claude-sonnet-5","gpt-5.6-terra"])});
export const capitalS11RecoveryGrantSchema=z.strictObject({schemaVersion:z.literal("capital-s11-recovery-grant.v1"),mode:z.literal("recovery"),state:z.enum(["committed","commit","transform","quality_failed","unresolved"]),recipeId:uuid,originalJobId:uuid,authorizedJobId:uuid,organizationId:uuid,workId:uuid,taskRunId:uuid,recipe:capitalS11RecipeReceiptSchema,
 reconstructionMetadata:metadata,requestPins:z.strictObject({schemaVersion:z.literal("capital-s11-reconstruction-pins.v1"),promptFingerprint:hash,primaryRequestFingerprint:hash,fallbackRequestFingerprint:hash}),qualityFailure:capitalS11QualityFailureSchema.nullable(),accepted:accepted.nullable(),context:capitalS11RetentionScopeSchema,sources:z.array(z.strictObject({deliveryId:uuid,retainedPayloadId:uuid})).min(1).max(500),parsed:capitalS11RetentionScopeSchema.nullable(),final:capitalS11RetentionScopeSchema.nullable(),revisionId:uuid.nullable(),capitalArtifactId:uuid.nullable(),expiresAt:time,dispatchAllowed:z.literal(false)});
type Grant=z.infer<typeof capitalS11RecoveryGrantSchema>;
export const capitalS11RecoverySourceScopeSchema=z.strictObject({schemaVersion:z.literal("capital-public-storage-scope.v1"),state:z.literal("complete"),allocationId:uuid,retainedPayloadId:uuid,deliveryId:uuid,bucket:z.literal("capital-input-capture"),path:z.string(),payloadFingerprint:hash,byteLength:z.number().int().positive().max(1048576),storageObjectId:uuid,storageVersion:z.string().min(1),retainedAt:time,uploadExpiresAt:time,expiresAt:time,purgeAt:time});
export type CapitalS11RecoveryPorts={
 discover():Promise<unknown>;grant(recipeId:string):Promise<unknown>;
 readBody(scope:CapitalS11RetentionScope):Promise<{bytes:Uint8Array;scope:unknown}>;
 readSource(reference:{deliveryId:string;retainedPayloadId:string}):Promise<{bytes:Uint8Array;scope:unknown}>;
 retainFinal(input:{recipeId:string;acceptedInvocationId:string;parentRetainedPayloadId:string;body:unknown;finalFingerprint:string}):Promise<unknown>;
 deriveTasks(input:{grant:Grant;originalContext:unknown;parsed:unknown;sources:ResearchSource[]}):Promise<void>;
 commit(input:{recipeId:string;acceptedInvocationId:string;parsedRetainedPayloadId:string;finalRetainedPayloadId:string;finalFingerprint:string;qualityResults:{id:string;passed:boolean}[]}):Promise<unknown>;
 qualityFailure(input:{recipeId:string;acceptedInvocationId:string;parsedRetainedPayloadId:string;finalRetainedPayloadId:string;finalFingerprint:string;qualityResults:{id:string;passed:boolean}[]}):Promise<unknown>;
};
export class CapitalS11RecoveryGap extends Error{readonly code="capital_s11_retained_recovery_required";constructor(reason:"capital_s11_retained_recovery_required"|"capital_s11_recovery_identity_changed"|"capital_s11_recovery_grant_changed"|"capital_s11_recovery_scope_lifetime_invalid"|"capital_s11_recovery_body_not_retained"|"capital_s11_recovery_body_identity_changed"|"capital_s11_recovery_source_identity_changed"|"capital_s11_recovery_source_shape_invalid"|"capital_s11_recovery_request_pins_changed"|"capital_s11_recovery_parsed_identity_changed"|"capital_s11_recovery_final_product_changed"|"capital_s11_recovery_commit_identity_changed"="capital_s11_retained_recovery_required"){super(reason);}}
const same=(a:unknown,b:unknown)=>legacyGatewayFingerprint(a)===legacyGatewayFingerprint(b);
const sha=(bytes:Uint8Array)=>createHash("sha256").update(bytes).digest("hex");
export async function recoverCapitalS11(job:{jobId:string;organizationId:string;workId:string},ports:CapitalS11RecoveryPorts,now:()=>number=Date.now){
 const discovery=z.strictObject({schemaVersion:z.literal("capital-s11-recovery-discovery.v1"),state:z.enum(["none","recovery","unresolved"]),recipeId:uuid.nullable()}).parse(await ports.discover());
 if(discovery.state==="none"){if(discovery.recipeId!==null)throw new CapitalS11RecoveryGap();return null;}
 if(discovery.state!=="recovery"||!discovery.recipeId)throw new CapitalS11RecoveryGap();
 const grant=capitalS11RecoveryGrantSchema.parse(await ports.grant(discovery.recipeId));
 if(grant.recipeId!==discovery.recipeId||grant.authorizedJobId!==job.jobId||grant.organizationId!==job.organizationId||grant.workId!==job.workId||grant.originalJobId!==grant.recipe.jobId||grant.taskRunId!==grant.recipe.producerTaskRunId||grant.recipe.recipeId!==grant.recipeId||grant.recipe.organizationId!==job.organizationId||grant.recipe.workId!==job.workId||Date.parse(grant.expiresAt)<=now()||grant.state==="unresolved"||!grant.accepted||!grant.parsed?.retainedPayloadId)throw new CapitalS11RecoveryGap("capital_s11_recovery_identity_changed");
 const immutable=(g:Grant)=>{const{state:_state,final:_final,revisionId:_revision,capitalArtifactId:_artifact,qualityFailure:_quality,...fixed}=g;return fixed;};
 const current=async()=>{const next=capitalS11RecoveryGrantSchema.parse(await ports.grant(grant.recipeId));if(!same(immutable(next),immutable(grant))||next.state==="unresolved"||Date.parse(next.expiresAt)<=now())throw new CapitalS11RecoveryGap("capital_s11_recovery_grant_changed");return next;};
 const live=(scope:{path:string;allocationId:string;retainedAt:string;purgeAt:string;expiresAt:string})=>{if(scope.path!==`${job.organizationId}/${scope.allocationId}/payload.json`||Date.parse(scope.retainedAt)>=Date.parse(scope.purgeAt)||Date.parse(scope.purgeAt)>=Date.parse(scope.expiresAt)||Date.parse(scope.purgeAt)<=now())throw new CapitalS11RecoveryGap("capital_s11_recovery_scope_lifetime_invalid");};
 const scopeIdentity=(s:CapitalS11RetentionScope)=>{const{replayed:_replayed,...identity}=s;return identity;};
 const body=async(expected:CapitalS11RetentionScope)=>{live(expected);if(expected.retentionState!=="retained"||!expected.retainedPayloadId)throw new CapitalS11RecoveryGap("capital_s11_recovery_body_not_retained");await current();const read=await ports.readBody(expected),scope=capitalS11RetentionScopeSchema.parse(read.scope);if(!same(scopeIdentity(scope),scopeIdentity(expected))||read.bytes.length!==scope.byteLength||sha(read.bytes)!==scope.payloadFingerprint)throw new CapitalS11RecoveryGap("capital_s11_recovery_body_identity_changed");await current();return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(read.bytes)) as unknown;};
 const originalContext=await body(grant.context),sources:{deliveryId:string;source:ResearchSource}[]=[];
 for(const reference of grant.sources){await current();const read=await ports.readSource(reference),scope=capitalS11RecoverySourceScopeSchema.parse(read.scope);live(scope);
  if(scope.deliveryId!==reference.deliveryId||scope.retainedPayloadId!==reference.retainedPayloadId||read.bytes.length!==scope.byteLength||sha(read.bytes)!==scope.payloadFingerprint)throw new CapitalS11RecoveryGap("capital_s11_recovery_source_identity_changed");
  const payload=capitalPublicLicensedPayloadSchema.parse(JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(read.bytes)) as unknown),source=researchSourceSchema.strict().safeParse({...payload,publishedAt:payload.publishedAt??null});
  if(!source.success)throw new CapitalS11RecoveryGap("capital_s11_recovery_source_shape_invalid");sources.push({deliveryId:reference.deliveryId,source:source.data});await current();
 }
 const reconstructed=reconstructCapitalS11Components({recipe:grant.recipe,originalContext,sources,metadata:grant.reconstructionMetadata}),reconstruction=prepareCapitalS11Recipe({basis:{jobId:grant.originalJobId,organizationId:job.organizationId,workId:job.workId,planId:grant.recipe.planId,planFingerprint:grant.recipe.planFingerprint,locale:grant.recipe.locale,asOfDate:grant.recipe.asOfDate},components:reconstructed.components});
 const prepared=prepareGatewayInput({...reconstruction.prepared.request,requireInputAttestation:true,outputMode:"structured",timeoutMs:240000,dataHandling:{classification:"confidential",purpose:"case_analysis",requiredPolicyVersion:retentionMatrixVersion}});
 const primary=capitalS11ExecutionPins({...reconstruction,prepared},{provider:"anthropic",model:"claude-sonnet-5",effort:"medium"}),fallback=capitalS11ExecutionPins({...reconstruction,prepared},{provider:"openai",model:"gpt-5.6-terra",effort:"medium"});
 if(prepared.inputFingerprint!==grant.recipe.reconstructionFingerprint||primary.promptFingerprint!==grant.requestPins.promptFingerprint||primary.requestFingerprint!==grant.requestPins.primaryRequestFingerprint||fallback.requestFingerprint!==grant.requestPins.fallbackRequestFingerprint)throw new CapitalS11RecoveryGap("capital_s11_recovery_request_pins_changed");
 const parsed=capitalPlanningMapSchema.parse(await body(grant.parsed));if(legacyGatewayFingerprint(parsed)!==grant.accepted.outputFingerprint)throw new CapitalS11RecoveryGap("capital_s11_recovery_parsed_identity_changed");
 if(grant.state==="quality_failed"){
  const failure=grant.qualityFailure;if(!failure||!grant.final?.retainedPayloadId||failure.acceptedInvocationId!==grant.accepted.acceptedInvocationId||failure.parsedRetainedPayloadId!==grant.parsed.retainedPayloadId||failure.finalRetainedPayloadId!==grant.final.retainedPayloadId)throw new CapitalS11RecoveryGap();
  const final=await body(grant.final);if(capitalS11FinalOutputFingerprint(grant.accepted.outputFingerprint,grant.recipe.recipeFingerprint,final)!==failure.finalFingerprint)throw new CapitalS11RecoveryGap();
  const receipt=capitalS11QualityFailureReceiptSchema.parse(await ports.qualityFailure({recipeId:grant.recipeId,...failure}));if(!receipt.replayed||!same(receipt.qualityFailure,failure)||receipt.recipeId!==grant.recipeId||receipt.taskRunId!==grant.taskRunId)throw new CapitalS11RecoveryGap();throw new CapitalS11QualityFailure();
 }
 if(grant.qualityFailure)throw new CapitalS11RecoveryGap();
 const context=reconstructed.context,name=context.session.company_profile.name,website=context.session.company_profile.website;
 const transformed=transformCapitalS11FinalProduct({parsed,company:{name:String(name).trim(),website:typeof website==="string"&&website.trim()?website.trim():null},locale:grant.recipe.locale,asOfDate:grant.recipe.asOfDate,sources:sources.map(s=>s.source),researchStatus:grant.reconstructionMetadata.researchStatus,accepted:grant.accepted});
 const finalFingerprint=capitalS11FinalOutputFingerprint(grant.accepted.outputFingerprint,grant.recipe.recipeFingerprint,transformed.finalProduct);
 let finalScope=grant.final;
 if(finalScope){if(!same(await body(finalScope),transformed.finalProduct))throw new CapitalS11RecoveryGap("capital_s11_recovery_final_product_changed");}
 else{await current();finalScope=capitalS11RetentionScopeSchema.parse(await ports.retainFinal({recipeId:grant.recipeId,acceptedInvocationId:grant.accepted.acceptedInvocationId,parentRetainedPayloadId:grant.parsed.retainedPayloadId,body:transformed.finalProduct,finalFingerprint}));if(!same(await body(finalScope),transformed.finalProduct))throw new CapitalS11RecoveryGap("capital_s11_recovery_final_product_changed");}
 if(!finalScope.retainedPayloadId)throw new CapitalS11RecoveryGap();
 const input={recipeId:grant.recipeId,acceptedInvocationId:grant.accepted.acceptedInvocationId,parsedRetainedPayloadId:grant.parsed.retainedPayloadId,finalRetainedPayloadId:finalScope.retainedPayloadId,finalFingerprint,qualityResults:transformed.qualityResults};
 if(transformed.qualityResults.some(v=>!v.passed)){const receipt=capitalS11QualityFailureReceiptSchema.parse(await ports.qualityFailure(input));if(receipt.recipeId!==grant.recipeId||receipt.taskRunId!==grant.taskRunId)throw new CapitalS11RecoveryGap();throw new CapitalS11QualityFailure();}
 if(grant.state!=="committed")await ports.deriveTasks({grant,originalContext,parsed,sources:sources.map(s=>s.source)});
 await current();const receipt=capitalS11CommitReceiptSchema.parse(await ports.commit(input));
 if(receipt.recipeId!==grant.recipeId||receipt.producerTaskRunId!==grant.taskRunId||receipt.taskRunId===grant.taskRunId||receipt.finalFingerprint!==finalFingerprint||(grant.state==="committed"&&(!receipt.replayed||receipt.capitalArtifactId!==grant.capitalArtifactId||receipt.revisionId!==grant.revisionId)))throw new CapitalS11RecoveryGap("capital_s11_recovery_commit_identity_changed");
 return{...receipt,finalRetainedPayloadId:finalScope.retainedPayloadId};
}
