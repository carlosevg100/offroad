import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";
import {releasedMethodArtifacts} from "./released-methods.generated";

const hash=z.string().regex(/^[a-f0-9]{64}$/);
export const executionQueueClaimSchema=z.object({claimed:z.literal(true),jobId:z.uuid(),leaseId:z.uuid(),capability:z.string().min(32).max(128),attempt:z.number().int().positive(),
 executionId:z.uuid(),contractText:z.string().max(8_388_608),contractFingerprint:hash,snapshotText:z.string().max(8_388_608),elapsedDurationMs:z.number().int().nonnegative().safe(),
 leaseExpiresAt:z.iso.datetime({offset:true}),budgetExpired:z.boolean()}).strict();
export type ExecutionQueueClaim=z.infer<typeof executionQueueClaimSchema>;
export const executionRenewalSchema=z.object({allowed:z.literal(true),jobId:z.uuid(),leaseId:z.uuid(),executionId:z.uuid(),organizationId:z.uuid(),workId:z.uuid(),principalId:z.uuid(),processingRunId:z.uuid(),
 contractFingerprint:hash,leaseExpiresAt:z.iso.datetime({offset:true}),elapsedDurationMs:z.number().int().nonnegative().safe(),remainingDurationMs:z.number().int().nonnegative().safe()}).strict();
export type ExecutionRenewal=z.infer<typeof executionRenewalSchema>;
const reservationSchema=z.union([
 z.object({state:z.literal("partial_budget_exhausted"),mayExecute:z.literal(false)}).strict(),
 z.object({operationId:z.uuid(),state:z.enum(["reserved","settled","uncertain"]),replayed:z.boolean(),mayExecute:z.boolean()}).strict(),
]);
const settledResultSchema=z.union([
 z.object({available:z.literal(false)}).strict(),
 z.object({available:z.literal(true),resultText:z.string().max(8_388_608),resultHash:hash,settledByLease:z.uuid()}).strict(),
]);
export type SettledExecutionResult=z.infer<typeof settledResultSchema>;
export type ExecutionOutcome="succeeded"|"partial";
export type ExecutionReason="calculated"|"invalid_input"|"calculation_failed"|"budget_exhausted"|"operation_uncertain";
export type ExecutionQueue={claim():Promise<ExecutionQueueClaim|null>;renew(c:ExecutionQueueClaim):Promise<ExecutionRenewal>;reserve(c:ExecutionQueueClaim):Promise<z.infer<typeof reservationSchema>>;
 settledResult(c:ExecutionQueueClaim):Promise<SettledExecutionResult>;
 settle(c:ExecutionQueueClaim,resultText:string):Promise<void>;commit(c:ExecutionQueueClaim,inputHash:string,resultText:string,outcome:ExecutionOutcome,reason:ExecutionReason):Promise<void>};
/** Transport budget grows with the payload: five seconds plus two per MiB, never above thirty. */
export function executionTransportTimeoutMs(bytes:number):number{return Math.min(30_000,5_000+Math.ceil(Math.max(0,bytes)/1_048_576)*2_000);}
export function createExecutionQueue(client:SupabaseClient,workerToken:string):ExecutionQueue {
 const rpc=async(name:string,args:Record<string,unknown>,bytes=0)=>{const {data,error}=await client.rpc(name,args).abortSignal(AbortSignal.timeout(executionTransportTimeoutMs(bytes)));if(error)throw new Error("execution_transport_failed");return data;};
 const lease=(c:ExecutionQueueClaim)=>({p_job:c.jobId,p_capability:c.capability,p_lease:c.leaseId});
 return {
  async claim(){const data=await rpc("worker_claim_execution_v1",{p_worker_token:workerToken,p_manifest_hashes:releasedMethodArtifacts.filter(r=>r.methodId==="prepare-capital-structure-decision").map(r=>r.manifestHash)});
   if(z.object({claimed:z.literal(false)}).strict().safeParse(data).success)return null;return executionQueueClaimSchema.parse(data);},
  async renew(c){return executionRenewalSchema.parse(await rpc("worker_renew_execution_v1",lease(c)));},
  async reserve(c){return reservationSchema.parse(await rpc("worker_reserve_execution_v1",lease(c)));},
  async settledResult(c){return settledResultSchema.parse(await rpc("worker_settled_execution_result_v1",lease(c),8_388_608));},
  async settle(c,resultText){z.object({settled:z.literal(true),replayed:z.boolean()}).strict().parse(await rpc("worker_settle_execution_v2",{...lease(c),p_result_text:resultText},Buffer.byteLength(resultText,"utf8")));},
  async commit(c,inputHash,resultText,outcome,reason){const r=z.object({committed:z.literal(true),replayed:z.boolean(),outcome:z.enum(["succeeded","partial"])}).strict().parse(await rpc("worker_commit_execution_v1",{
   ...lease(c),p_contract_hash:c.contractFingerprint,p_input_hash:inputHash,p_result_text:resultText,p_outcome:outcome,p_reason:reason},Buffer.byteLength(resultText,"utf8")));if(r.outcome!==outcome)throw new Error("execution_commit_mismatch");},
 };
}
