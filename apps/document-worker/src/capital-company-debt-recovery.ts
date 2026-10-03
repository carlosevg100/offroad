/** Physical recovery ports only: this module cannot authorize or dispatch a model. */
import {createHash} from "node:crypto";
import {z} from "zod";
import {companyDebtDiagnosticSchema,capitalPublicLicensedPayloadSchema} from "@offroad/domain-contracts";
import {researchSourceSchema,type ResearchSource} from "@offroad/public-research";
import {legacyGatewayFingerprint,prepareGatewayInput,retentionMatrixVersion} from "@offroad/model-gateway";
import {capitalCompanyDebtRecipeReceiptSchema,capitalCompanyDebtFinalOutputFingerprint} from "./capital-company-debt-processing";
import {prepareCapitalCompanyDebtRecipe,capitalCompanyDebtExecutionPins} from "./capital-company-debt-recipe";
import {reconstructCapitalCompanyDebtComponents} from "./capital-company-debt-native-consumer";
import {validateCompanyDebtDiagnostic} from "./company-debt-view";
import {transformCapitalCompanyDebtFinalProduct} from "./capital-company-debt-final";
import {capitalCompanyDebtRetentionScopeSchema,capitalCompanyDebtCommitReceiptSchema,capitalCompanyDebtQualityFailureSchema,capitalCompanyDebtQualityFailureReceiptSchema,CapitalCompanyDebtQualityFailure,type CapitalCompanyDebtRetentionScope} from "./capital-company-debt-protocol";
const uuid=z.uuid(),hash=z.string().regex(/^[a-f0-9]{64}$/),time=z.iso.datetime({offset:true});
const metadata=z.strictObject({schemaVersion:z.literal("capital-debt-reconstruction-metadata.v1"),originalAttempt:z.number().int().positive(),researchStatus:z.enum(["succeeded","partial"]),dependencies:z.array(z.strictObject({id:uuid,artifactFingerprint:hash})).length(1)});
const accepted=z.strictObject({acceptedInvocationId:uuid,inputReceiptId:uuid,invocationId:uuid,outputFingerprint:hash,provider:z.enum(["anthropic","openai"]),reportedModel:z.enum(["claude-sonnet-5","gpt-5.6-terra"])});
export const capitalCompanyDebtRecoveryGrantSchema=z.strictObject({schemaVersion:z.literal("capital-debt-recovery-grant.v1"),mode:z.literal("recovery"),state:z.enum(["committed","commit","transform","quality_failed","unresolved"]),recipeId:uuid,originalJobId:uuid,authorizedJobId:uuid,organizationId:uuid,workId:uuid,executionPlanTaskRunId:uuid,recipe:capitalCompanyDebtRecipeReceiptSchema,
 reconstructionMetadata:metadata,requestPins:z.strictObject({schemaVersion:z.literal("capital-debt-reconstruction-pins.v1"),promptFingerprint:hash,primaryRequestFingerprint:hash,fallbackRequestFingerprint:hash}),qualityFailure:capitalCompanyDebtQualityFailureSchema.nullable(),accepted:accepted.nullable(),context:capitalCompanyDebtRetentionScopeSchema,sources:z.array(z.strictObject({deliveryId:uuid,retainedPayloadId:uuid})).min(1).max(500),parsed:capitalCompanyDebtRetentionScopeSchema.nullable(),final:capitalCompanyDebtRetentionScopeSchema.nullable(),revisionId:uuid.nullable(),capitalArtifactId:uuid.nullable(),expiresAt:time,dispatchAllowed:z.literal(false)});
type Grant=z.infer<typeof capitalCompanyDebtRecoveryGrantSchema>;
export const capitalCompanyDebtRecoverySourceScopeSchema=z.strictObject({schemaVersion:z.literal("capital-public-storage-scope.v1"),state:z.literal("complete"),allocationId:uuid,retainedPayloadId:uuid,deliveryId:uuid,bucket:z.literal("capital-input-capture"),path:z.string(),payloadFingerprint:hash,byteLength:z.number().int().positive().max(1048576),storageObjectId:uuid,storageVersion:z.string().min(1),retainedAt:time,uploadExpiresAt:time,expiresAt:time,purgeAt:time});
export type CapitalCompanyDebtRecoveryPorts={
 discover():Promise<unknown>;grant(recipeId:string):Promise<unknown>;
 readBody(scope:CapitalCompanyDebtRetentionScope):Promise<{bytes:Uint8Array;scope:unknown}>;
 readSource(reference:{deliveryId:string;retainedPayloadId:string}):Promise<{bytes:Uint8Array;scope:unknown}>;
 retainFinal(input:{recipeId:string;acceptedInvocationId:string;parentRetainedPayloadId:string;body:unknown;finalFingerprint:string}):Promise<unknown>;
 deriveTasks(input:{grant:Grant;originalContext:unknown;parsed:unknown;sources:ResearchSource[]}):Promise<void>;
 commit(input:{recipeId:string;acceptedInvocationId:string;parsedRetainedPayloadId:string;finalRetainedPayloadId:string;finalFingerprint:string;qualityResults:{id:string;passed:boolean}[]}):Promise<unknown>;
 qualityFailure(input:{recipeId:string;acceptedInvocationId:string;parsedRetainedPayloadId:string;finalRetainedPayloadId:string;finalFingerprint:string;qualityResults:{id:string;passed:boolean}[]}):Promise<unknown>;
};
export class CapitalCompanyDebtRecoveryGap extends Error{readonly code="capital_debt_retained_recovery_required";constructor(reason:"capital_debt_retained_recovery_required"|"capital_debt_recovery_identity_changed"|"capital_debt_recovery_grant_changed"|"capital_debt_recovery_scope_lifetime_invalid"|"capital_debt_recovery_body_not_retained"|"capital_debt_recovery_body_identity_changed"|"capital_debt_recovery_source_identity_changed"|"capital_debt_recovery_source_shape_invalid"|"capital_debt_recovery_request_pins_changed"|"capital_debt_recovery_parsed_identity_changed"|"capital_debt_recovery_final_product_changed"|"capital_debt_recovery_commit_identity_changed"|"capital_debt_recovery_rpc_cancelled"|"capital_debt_recovery_rpc_denied"|"capital_debt_recovery_rpc_retry_exhausted"|"capital_debt_recovery_rpc_failed"="capital_debt_retained_recovery_required"){super(reason);}}
const same=(a:unknown,b:unknown)=>legacyGatewayFingerprint(a)===legacyGatewayFingerprint(b);
const sha=(bytes:Uint8Array)=>createHash("sha256").update(bytes).digest("hex");
export async function recoverCapitalCompanyDebt(job:{jobId:string;organizationId:string;workId:string},ports:CapitalCompanyDebtRecoveryPorts,now:()=>number=Date.now){
 const discovery=z.strictObject({schemaVersion:z.literal("capital-debt-recovery-discovery.v1"),state:z.enum(["none","recovery","unresolved"]),recipeId:uuid.nullable()}).parse(await ports.discover());
 if(discovery.state==="none"){if(discovery.recipeId!==null)throw new CapitalCompanyDebtRecoveryGap();return null;}
 if(discovery.state!=="recovery"||!discovery.recipeId)throw new CapitalCompanyDebtRecoveryGap();
 const grant=capitalCompanyDebtRecoveryGrantSchema.parse(await ports.grant(discovery.recipeId));
 if(grant.recipeId!==discovery.recipeId||grant.authorizedJobId!==job.jobId||grant.organizationId!==job.organizationId||grant.workId!==job.workId||grant.originalJobId!==grant.recipe.jobId||grant.executionPlanTaskRunId!==grant.recipe.executionPlanTaskRunId||grant.recipe.recipeId!==grant.recipeId||grant.recipe.organizationId!==job.organizationId||grant.recipe.workId!==job.workId||Date.parse(grant.expiresAt)<=now()||grant.state==="unresolved"||!grant.accepted||!grant.parsed?.retainedPayloadId)throw new CapitalCompanyDebtRecoveryGap("capital_debt_recovery_identity_changed");
 const immutable=(g:Grant)=>{const{state:_state,final:_final,revisionId:_revision,capitalArtifactId:_artifact,qualityFailure:_quality,...fixed}=g;return fixed;};
 const current=async()=>{const next=capitalCompanyDebtRecoveryGrantSchema.parse(await ports.grant(grant.recipeId));if(!same(immutable(next),immutable(grant))||next.state==="unresolved"||Date.parse(next.expiresAt)<=now())throw new CapitalCompanyDebtRecoveryGap("capital_debt_recovery_grant_changed");return next;};
 const live=(scope:{path:string;allocationId:string;retainedAt:string;purgeAt:string;expiresAt:string})=>{if(scope.path!==`${job.organizationId}/${scope.allocationId}/payload.json`||Date.parse(scope.retainedAt)>=Date.parse(scope.purgeAt)||Date.parse(scope.purgeAt)>=Date.parse(scope.expiresAt)||Date.parse(scope.purgeAt)<=now())throw new CapitalCompanyDebtRecoveryGap("capital_debt_recovery_scope_lifetime_invalid");};
 const scopeIdentity=(s:CapitalCompanyDebtRetentionScope)=>{const{replayed:_replayed,...identity}=s;return identity;};
 const body=async(expected:CapitalCompanyDebtRetentionScope)=>{live(expected);if(expected.retentionState!=="retained"||!expected.retainedPayloadId)throw new CapitalCompanyDebtRecoveryGap("capital_debt_recovery_body_not_retained");await current();const read=await ports.readBody(expected),scope=capitalCompanyDebtRetentionScopeSchema.parse(read.scope);if(!same(scopeIdentity(scope),scopeIdentity(expected))||read.bytes.length!==scope.byteLength||sha(read.bytes)!==scope.payloadFingerprint)throw new CapitalCompanyDebtRecoveryGap("capital_debt_recovery_body_identity_changed");await current();return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(read.bytes)) as unknown;};
 const originalContext=await body(grant.context),sources:{deliveryId:string;source:ResearchSource}[]=[];
 for(const reference of grant.sources){await current();const read=await ports.readSource(reference),scope=capitalCompanyDebtRecoverySourceScopeSchema.parse(read.scope);live(scope);
  if(scope.deliveryId!==reference.deliveryId||scope.retainedPayloadId!==reference.retainedPayloadId||read.bytes.length!==scope.byteLength||sha(read.bytes)!==scope.payloadFingerprint)throw new CapitalCompanyDebtRecoveryGap("capital_debt_recovery_source_identity_changed");
  const payload=capitalPublicLicensedPayloadSchema.parse(JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(read.bytes)) as unknown),source=researchSourceSchema.strict().safeParse({...payload,publishedAt:payload.publishedAt??null});
  if(!source.success)throw new CapitalCompanyDebtRecoveryGap("capital_debt_recovery_source_shape_invalid");sources.push({deliveryId:reference.deliveryId,source:source.data});await current();
 }
 const reconstructed=reconstructCapitalCompanyDebtComponents({recipe:grant.recipe,originalContext,sources,metadata:grant.reconstructionMetadata}),reconstruction=prepareCapitalCompanyDebtRecipe({basis:{jobId:grant.originalJobId,organizationId:job.organizationId,workId:job.workId,planId:grant.recipe.planId,planFingerprint:grant.recipe.planFingerprint,locale:grant.recipe.locale,asOfDate:grant.recipe.asOfDate},components:reconstructed.components});
 const prepared=prepareGatewayInput({...reconstruction.prepared.request,requireInputAttestation:true,outputMode:"structured",timeoutMs:240000,dataHandling:{classification:"confidential",purpose:"case_analysis",requiredPolicyVersion:retentionMatrixVersion}});
 const primary=capitalCompanyDebtExecutionPins({...reconstruction,prepared},{provider:"anthropic",model:"claude-sonnet-5",effort:"medium"}),fallback=capitalCompanyDebtExecutionPins({...reconstruction,prepared},{provider:"openai",model:"gpt-5.6-terra",effort:"medium"});
 if(prepared.inputFingerprint!==grant.recipe.reconstructionFingerprint||primary.promptFingerprint!==grant.requestPins.promptFingerprint||primary.requestFingerprint!==grant.requestPins.primaryRequestFingerprint||fallback.requestFingerprint!==grant.requestPins.fallbackRequestFingerprint)throw new CapitalCompanyDebtRecoveryGap("capital_debt_recovery_request_pins_changed");
 const parsed=companyDebtDiagnosticSchema.parse(await body(grant.parsed));if(legacyGatewayFingerprint(parsed)!==grant.accepted.outputFingerprint)throw new CapitalCompanyDebtRecoveryGap("capital_debt_recovery_parsed_identity_changed");
 if(grant.state==="quality_failed"){
  const failure=grant.qualityFailure;if(!failure||!grant.final?.retainedPayloadId||failure.acceptedInvocationId!==grant.accepted.acceptedInvocationId||failure.parsedRetainedPayloadId!==grant.parsed.retainedPayloadId||failure.finalRetainedPayloadId!==grant.final.retainedPayloadId)throw new CapitalCompanyDebtRecoveryGap();
  const final=await body(grant.final);if(capitalCompanyDebtFinalOutputFingerprint(grant.accepted.outputFingerprint,grant.recipe.recipeFingerprint,final)!==failure.finalFingerprint)throw new CapitalCompanyDebtRecoveryGap();
  const receipt=capitalCompanyDebtQualityFailureReceiptSchema.parse(await ports.qualityFailure({recipeId:grant.recipeId,...failure}));if(!receipt.replayed||!same(receipt.qualityFailure,failure)||receipt.recipeId!==grant.recipeId||receipt.executionPlanTaskRunId!==grant.executionPlanTaskRunId)throw new CapitalCompanyDebtRecoveryGap();throw new CapitalCompanyDebtQualityFailure();
 }
 if(grant.qualityFailure)throw new CapitalCompanyDebtRecoveryGap();
 const context=reconstructed.context,name=context.session.company_profile.name,website=context.session.company_profile.website;
 const finalProduct=transformCapitalCompanyDebtFinalProduct({parsed,company:{name:String(name).trim(),website:typeof website==="string"&&website.trim()?website.trim():null},locale:grant.recipe.locale,asOfDate:grant.recipe.asOfDate,sources:sources.map(s=>s.source),researchStatus:grant.reconstructionMetadata.researchStatus,accepted:grant.accepted});
 const qualityResults=validateCompanyDebtDiagnostic(parsed,new Set(sources.map(v=>v.source.url)),sources.map(v=>v.source)).map(({id,passed})=>({id,passed}));
 const finalFingerprint=capitalCompanyDebtFinalOutputFingerprint(grant.accepted.outputFingerprint,grant.recipe.recipeFingerprint,finalProduct);
 let finalScope=grant.final;
 if(finalScope){if(!same(await body(finalScope),finalProduct))throw new CapitalCompanyDebtRecoveryGap("capital_debt_recovery_final_product_changed");}
 else{await current();finalScope=capitalCompanyDebtRetentionScopeSchema.parse(await ports.retainFinal({recipeId:grant.recipeId,acceptedInvocationId:grant.accepted.acceptedInvocationId,parentRetainedPayloadId:grant.parsed.retainedPayloadId,body:finalProduct,finalFingerprint}));if(!same(await body(finalScope),finalProduct))throw new CapitalCompanyDebtRecoveryGap("capital_debt_recovery_final_product_changed");}
 if(!finalScope.retainedPayloadId)throw new CapitalCompanyDebtRecoveryGap();
 const input={recipeId:grant.recipeId,acceptedInvocationId:grant.accepted.acceptedInvocationId,parsedRetainedPayloadId:grant.parsed.retainedPayloadId,finalRetainedPayloadId:finalScope.retainedPayloadId,finalFingerprint,qualityResults:qualityResults};
 if(qualityResults.some(v=>!v.passed)){const receipt=capitalCompanyDebtQualityFailureReceiptSchema.parse(await ports.qualityFailure(input));if(receipt.recipeId!==grant.recipeId||receipt.executionPlanTaskRunId!==grant.executionPlanTaskRunId)throw new CapitalCompanyDebtRecoveryGap();throw new CapitalCompanyDebtQualityFailure();}
 if(grant.state!=="committed")await ports.deriveTasks({grant,originalContext,parsed,sources:sources.map(s=>s.source)});
 await current();const receipt=capitalCompanyDebtCommitReceiptSchema.parse(await ports.commit(input));
 if(receipt.recipeId!==grant.recipeId||receipt.executionPlanTaskRunId!==grant.executionPlanTaskRunId||receipt.taskRunId===grant.executionPlanTaskRunId||receipt.finalFingerprint!==finalFingerprint||(grant.state==="committed"&&(!receipt.replayed||receipt.capitalArtifactId!==grant.capitalArtifactId||receipt.revisionId!==grant.revisionId)))throw new CapitalCompanyDebtRecoveryGap("capital_debt_recovery_commit_identity_changed");
 return{...receipt,finalRetainedPayloadId:finalScope.retainedPayloadId};
}
