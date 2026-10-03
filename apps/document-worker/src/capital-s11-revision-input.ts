/** Human-return input port. Physical predecessor history remains original;
 * no model/search API, metadata CPA body, or current-context substitute exists. */
import {createHash} from "node:crypto";
import {z} from "zod";
import {legacyGatewayFingerprint} from "@offroad/model-gateway";
import {capitalPublicLicensedPayloadSchema} from "@offroad/domain-contracts";
import {researchSourceSchema} from "@offroad/public-research";
import {capitalS11ArtifactSchema} from "./capital-s11-final";
import {capitalS11RetentionScopeSchema,capitalS11TaskProjectionReceiptSchema} from "./capital-s11-protocol";
import {capitalS11RecoverySourceScopeSchema} from "./capital-s11-recovery";
const uuid=z.uuid(),hash=z.string().regex(/^[a-f0-9]{64}$/),time=z.iso.datetime({offset:true});
const predecessorSchema=z.strictObject({taskId:z.enum(["M01","M02","C11","S10"]),projection:capitalS11TaskProjectionReceiptSchema,retention:capitalS11RetentionScopeSchema});
export const capitalS11RevisionInputSchema=z.strictObject({schemaVersion:z.literal("capital-s11-revision-inputs.v1"),jobId:uuid,organizationId:uuid,workId:uuid,priorRecipeId:uuid,predecessorRecipeId:uuid,priorRevisionId:uuid,reviewId:uuid,decisionId:uuid,
 prior:capitalS11RetentionScopeSchema,predecessors:z.array(predecessorSchema).length(4),researchStatus:z.enum(["succeeded","partial","abstained"]),
 jurisdiction:z.enum(["BR","US"]),jurisdictionNeedsConfirmation:z.boolean(),strategyFingerprint:hash,
 sources:z.array(z.strictObject({deliveryId:uuid,retainedPayloadId:uuid})).min(1).max(500),expiresAt:time});
type Grant=z.infer<typeof capitalS11RevisionInputSchema>;
export type CapitalS11RevisionInputPorts={
 load():Promise<unknown>;
 bodyScope(input:{retainedPayloadId:string;taskRunId?:string}):Promise<unknown>;
 readBody(input:{scope:z.infer<typeof capitalS11RetentionScopeSchema>;taskRunId?:string}):Promise<{bytes:Uint8Array;objectId:string;version:string}>;
 sourceScope(retainedPayloadId:string):Promise<unknown>;
 readSource(scope:z.infer<typeof capitalS11RecoverySourceScopeSchema>):Promise<{bytes:Uint8Array;objectId:string;version:string}>;
};
export class CapitalS11RevisionInputGap extends Error {readonly code="capital_s11_revision_inputs_required";constructor(){super("capital_s11_revision_inputs_required");}}
const same=(a:unknown,b:unknown)=>legacyGatewayFingerprint(a)===legacyGatewayFingerprint(b);
const identity=(scope:Record<string,unknown>)=>{const{replayed:_replay,...fixed}=scope;return fixed;};
export async function loadCapitalS11RevisionInput(job:{jobId:string;organizationId:string;workId:string;reviewId:string;decisionId:string;priorRevisionId:string},ports:CapitalS11RevisionInputPorts,now:()=>number=Date.now){
 const grant=capitalS11RevisionInputSchema.parse(await ports.load());
 if(grant.jobId!==job.jobId||grant.organizationId!==job.organizationId||grant.workId!==job.workId||grant.reviewId!==job.reviewId||grant.decisionId!==job.decisionId||grant.priorRevisionId!==job.priorRevisionId||Date.parse(grant.expiresAt)<=now())throw new CapitalS11RevisionInputGap();
 const current=async()=>{const next=capitalS11RevisionInputSchema.parse(await ports.load());if(!same(next,grant)||Date.parse(next.expiresAt)<=now())throw new CapitalS11RevisionInputGap();};
 const live=(scope:{allocationId:string;path:string;retainedAt:string;purgeAt:string;expiresAt:string})=>{if(scope.path!==`${job.organizationId}/${scope.allocationId}/payload.json`||Date.parse(scope.retainedAt)>=Date.parse(scope.purgeAt)||Date.parse(scope.purgeAt)>=Date.parse(scope.expiresAt)||Date.parse(scope.purgeAt)<=now())throw new CapitalS11RevisionInputGap();};
 const decode=(scope:{storageObjectId:string|null;storageVersion:string|null;payloadFingerprint:string;byteLength:number},read:{bytes:Uint8Array;objectId:string;version:string})=>{if(!scope.storageObjectId||!scope.storageVersion||read.objectId!==scope.storageObjectId||read.version!==scope.storageVersion||read.bytes.length!==scope.byteLength||createHash("sha256").update(read.bytes).digest("hex")!==scope.payloadFingerprint)throw new CapitalS11RevisionInputGap();return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(read.bytes))as unknown;};
 const body=async(expected:Grant["prior"],taskRunId?:string)=>{live(expected);if(expected.retentionState!=="retained"||!expected.retainedPayloadId)throw new CapitalS11RevisionInputGap();await current();const input={retainedPayloadId:expected.retainedPayloadId,...(taskRunId?{taskRunId}:{})};const before=capitalS11RetentionScopeSchema.parse(await ports.bodyScope(input));if(!same(identity(before),identity(expected)))throw new CapitalS11RevisionInputGap();const value=decode(before,await ports.readBody({scope:before,...(taskRunId?{taskRunId}:{})}));const after=capitalS11RetentionScopeSchema.parse(await ports.bodyScope(input));if(!same(identity(before),identity(after)))throw new CapitalS11RevisionInputGap();await current();return value;};
 const priorBody=capitalS11ArtifactSchema.parse(await body(grant.prior));
 const ids=["M01","M02","C11","S10"]as const;
 if(grant.predecessors.map(v=>v.taskId).join(",")!==ids.join(","))throw new CapitalS11RevisionInputGap();
 const types={M01:"company_scope",M02:"capital_intent",C11:"structuring_thesis",S10:"alternative_comparison"}as const;
 const predecessors=[];
 for(const ref of grant.predecessors){if(ref.projection.recipeId!==grant.predecessorRecipeId||ref.projection.taskId!==ref.taskId||ref.projection.retainedPayloadId!==ref.retention.retainedPayloadId)throw new CapitalS11RevisionInputGap();const value=z.strictObject({schemaVersion:z.literal("capital-planning-task.v1"),taskId:z.literal(ref.taskId),artifactType:z.literal(types[ref.taskId]),content:z.record(z.string(),z.unknown())}).parse(await body(ref.retention,ref.projection.taskRunId));predecessors.push({projection:ref.projection,body:value});}
 const sources=[];
 for(const ref of grant.sources){await current();const before=capitalS11RecoverySourceScopeSchema.parse(await ports.sourceScope(ref.retainedPayloadId));live(before);if(before.retainedPayloadId!==ref.retainedPayloadId||before.deliveryId!==ref.deliveryId)throw new CapitalS11RevisionInputGap();const payload=capitalPublicLicensedPayloadSchema.parse(decode(before,await ports.readSource(before)));const source=researchSourceSchema.strict().parse({...payload,publishedAt:payload.publishedAt??null});const after=capitalS11RecoverySourceScopeSchema.parse(await ports.sourceScope(ref.retainedPayloadId));if(!same(before,after))throw new CapitalS11RevisionInputGap();await current();sources.push(source);}
 return{grant,priorBody,predecessors,sources};
}
