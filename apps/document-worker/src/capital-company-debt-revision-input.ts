/** Human-return input port. Physical predecessor history remains original;
 * no model/search API, metadata CPA body, or current-context substitute exists. */
import {createHash} from "node:crypto";
import {z} from "zod";
import {legacyGatewayFingerprint} from "@offroad/model-gateway";
import {capitalPublicLicensedPayloadSchema} from "@offroad/domain-contracts";
import {researchSourceSchema} from "@offroad/public-research";
import {capitalCompanyDebtArtifactSchema} from "./capital-company-debt-final";
import {capitalCompanyDebtRetentionScopeSchema,capitalCompanyDebtTaskProjectionReceiptSchema} from "./capital-company-debt-protocol";
import {capitalCompanyDebtRecoverySourceScopeSchema} from "./capital-company-debt-recovery";
const uuid=z.uuid(),time=z.iso.datetime({offset:true});
const predecessorSchema=z.strictObject({taskId:z.enum(["M06","C09","C10"]),projection:capitalCompanyDebtTaskProjectionReceiptSchema,retention:capitalCompanyDebtRetentionScopeSchema});
export const capitalCompanyDebtRevisionInputSchema=z.strictObject({schemaVersion:z.literal("capital-debt-revision-inputs.v1"),jobId:uuid,organizationId:uuid,workId:uuid,priorRecipeId:uuid,predecessorRecipeId:uuid,priorRevisionId:uuid,reviewId:uuid,decisionId:uuid,
 prior:capitalCompanyDebtRetentionScopeSchema,predecessors:z.array(predecessorSchema).length(3),researchStatus:z.enum(["succeeded","partial"]),
 sources:z.array(z.strictObject({deliveryId:uuid,retainedPayloadId:uuid})).min(1).max(500),expiresAt:time});
type Grant=z.infer<typeof capitalCompanyDebtRevisionInputSchema>;
export type CapitalCompanyDebtRevisionInputPorts={
 load():Promise<unknown>;
 bodyScope(input:{retainedPayloadId:string;taskRunId?:string}):Promise<unknown>;
 readBody(input:{scope:z.infer<typeof capitalCompanyDebtRetentionScopeSchema>;taskRunId?:string}):Promise<{bytes:Uint8Array;objectId:string;version:string}>;
 sourceScope(retainedPayloadId:string):Promise<unknown>;
 readSource(scope:z.infer<typeof capitalCompanyDebtRecoverySourceScopeSchema>):Promise<{bytes:Uint8Array;objectId:string;version:string}>;
};
export class CapitalCompanyDebtRevisionInputGap extends Error {readonly code="capital_debt_revision_inputs_required";constructor(){super("capital_debt_revision_inputs_required");}}
const same=(a:unknown,b:unknown)=>legacyGatewayFingerprint(a)===legacyGatewayFingerprint(b);
const identity=(scope:Record<string,unknown>)=>{const{replayed:_replay,...fixed}=scope;return fixed;};
export async function loadCapitalCompanyDebtRevisionInput(job:{jobId:string;organizationId:string;workId:string;reviewId:string;decisionId:string;priorRevisionId:string},ports:CapitalCompanyDebtRevisionInputPorts,now:()=>number=Date.now){
 const grant=capitalCompanyDebtRevisionInputSchema.parse(await ports.load());
 if(grant.jobId!==job.jobId||grant.organizationId!==job.organizationId||grant.workId!==job.workId||grant.reviewId!==job.reviewId||grant.decisionId!==job.decisionId||grant.priorRevisionId!==job.priorRevisionId||Date.parse(grant.expiresAt)<=now())throw new CapitalCompanyDebtRevisionInputGap();
 const current=async()=>{const next=capitalCompanyDebtRevisionInputSchema.parse(await ports.load());if(!same(next,grant)||Date.parse(next.expiresAt)<=now())throw new CapitalCompanyDebtRevisionInputGap();};
 const live=(scope:{allocationId:string;path:string;retainedAt:string;purgeAt:string;expiresAt:string})=>{if(scope.path!==`${job.organizationId}/${scope.allocationId}/payload.json`||Date.parse(scope.retainedAt)>=Date.parse(scope.purgeAt)||Date.parse(scope.purgeAt)>=Date.parse(scope.expiresAt)||Date.parse(scope.purgeAt)<=now())throw new CapitalCompanyDebtRevisionInputGap();};
 const decode=(scope:{storageObjectId:string|null;storageVersion:string|null;payloadFingerprint:string;byteLength:number},read:{bytes:Uint8Array;objectId:string;version:string})=>{if(!scope.storageObjectId||!scope.storageVersion||read.objectId!==scope.storageObjectId||read.version!==scope.storageVersion||read.bytes.length!==scope.byteLength||createHash("sha256").update(read.bytes).digest("hex")!==scope.payloadFingerprint)throw new CapitalCompanyDebtRevisionInputGap();return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(read.bytes))as unknown;};
 const body=async(expected:Grant["prior"],taskRunId?:string)=>{live(expected);if(expected.retentionState!=="retained"||!expected.retainedPayloadId)throw new CapitalCompanyDebtRevisionInputGap();await current();const input={retainedPayloadId:expected.retainedPayloadId,...(taskRunId?{taskRunId}:{})};const before=capitalCompanyDebtRetentionScopeSchema.parse(await ports.bodyScope(input));if(!same(identity(before),identity(expected)))throw new CapitalCompanyDebtRevisionInputGap();const value=decode(before,await ports.readBody({scope:before,...(taskRunId?{taskRunId}:{})}));const after=capitalCompanyDebtRetentionScopeSchema.parse(await ports.bodyScope(input));if(!same(identity(before),identity(after)))throw new CapitalCompanyDebtRevisionInputGap();await current();return value;};
 const priorBody=capitalCompanyDebtArtifactSchema.parse(await body(grant.prior));
 const ids=["M06","C09","C10"]as const;
 if(grant.predecessors.map(v=>v.taskId).join(",")!==ids.join(","))throw new CapitalCompanyDebtRevisionInputGap();
 const types={M06:"company_debt_execution_plan",C09:"risk_mitigation_diagnostic",C10:"capacity_assessment"}as const;
 const predecessors=[];
 for(const ref of grant.predecessors){if(ref.projection.recipeId!==grant.predecessorRecipeId||ref.projection.taskId!==ref.taskId||ref.projection.retainedPayloadId!==ref.retention.retainedPayloadId)throw new CapitalCompanyDebtRevisionInputGap();const value=z.strictObject({schemaVersion:z.literal("company-debt-task.v1"),taskId:z.literal(ref.taskId),artifactType:z.literal(types[ref.taskId]),content:z.record(z.string(),z.unknown())}).parse(await body(ref.retention,ref.projection.taskRunId));predecessors.push({projection:ref.projection,body:value});}
 const sources=[];
 for(const ref of grant.sources){await current();const before=capitalCompanyDebtRecoverySourceScopeSchema.parse(await ports.sourceScope(ref.retainedPayloadId));live(before);if(before.retainedPayloadId!==ref.retainedPayloadId||before.deliveryId!==ref.deliveryId)throw new CapitalCompanyDebtRevisionInputGap();const payload=capitalPublicLicensedPayloadSchema.parse(decode(before,await ports.readSource(before)));const source=researchSourceSchema.strict().parse({...payload,publishedAt:payload.publishedAt??null});const after=capitalCompanyDebtRecoverySourceScopeSchema.parse(await ports.sourceScope(ref.retainedPayloadId));if(!same(before,after))throw new CapitalCompanyDebtRevisionInputGap();await current();sources.push(source);}
 return{grant,priorBody,predecessors,sources};
}
