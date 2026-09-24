import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";
import type {GovernedEvaluationOutcome, GovernedEvaluationReason} from "@offroad/agent-contracts";
import {executionTransportTimeoutMs} from "./execution-queue";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const timestamp = z.iso.datetime({offset: true});
const count = z.number().int().nonnegative().safe();

/** worker_claim_evaluation_v1: the lease, the capability and the exact contract and snapshot bytes. */
export const evaluationQueueClaimSchema = z.object({claimed: z.literal(true), jobId: z.uuid(), leaseId: z.uuid(), capability: z.string().min(32).max(128),
 attempt: z.number().int().positive(), executionId: z.uuid(), contractText: z.string().max(1_048_576), contractFingerprint: hash,
 snapshotText: z.string().max(8_388_608), elapsedDurationMs: count, leaseExpiresAt: timestamp, budgetExpired: z.boolean()}).strict();
export type EvaluationQueueClaim = z.infer<typeof evaluationQueueClaimSchema>;

export const evaluationRenewalSchema = z.object({allowed: z.literal(true), jobId: z.uuid(), leaseId: z.uuid(), executionId: z.uuid(), organizationId: z.uuid(),
 processingRunId: z.uuid(), contractFingerprint: hash, leaseExpiresAt: timestamp, elapsedDurationMs: count, remainingDurationMs: count}).strict();
export type EvaluationRenewal = z.infer<typeof evaluationRenewalSchema>;

const decisionReason = z.string().regex(/^[a-z_:]+$/).max(200);
/** Only a fresh reservation of this operation may send; every other answer means the attempt stays unsent. */
export const evaluationReservationSchema = z.union([
 z.object({allowed: z.literal(true), operationId: z.uuid(), decisionId: z.uuid(), state: z.literal("reserved"), replayed: z.literal(false), mayExecute: z.literal(true)}).strict(),
 z.object({allowed: z.literal(true), operationId: z.uuid(), decisionId: z.uuid(), state: z.enum(["reserved", "settled", "uncertain"]), replayed: z.literal(true), mayExecute: z.literal(false)}).strict(),
 z.object({allowed: z.literal(false), decisionId: z.uuid(), reasons: z.array(decisionReason).max(11), mayExecute: z.literal(false)}).strict(),
 z.object({allowed: z.literal(false), state: z.literal("partial_budget_exhausted"), mayExecute: z.literal(false)}).strict(),
]);
export type EvaluationReservation = z.infer<typeof evaluationReservationSchema>;
const settlementReceiptSchema = z.object({settled: z.literal(true), state: z.enum(["settled", "uncertain"]), replayed: z.boolean()}).strict();
const commitReceiptSchema = z.object({committed: z.literal(true), replayed: z.boolean(), outcome: z.enum(["succeeded", "partial"]),
 reason: z.enum(["evaluated", "budget_exhausted", "operation_uncertain", "transport_denied", "evaluation_failed"])}).strict();

/** The route metadata a reservation names; only this reaches the audit store, never content. */
export type EvaluationRoute = {provider: string; model: string; accountRef: string; projectRef: string; credentialBinding: string;
 endpoint: string; region: string; toolVersion: string};
export type EvaluationOperation = {operationId: string; route: EvaluationRoute; resources: readonly string[]; reservedMicrousd: number; reservedCalls: number};
export type EvaluationSettlement = {outcome: "settled"; spentMicrousd: number; spentCalls: number} | {outcome: "uncertain"};

export type EvaluationQueue = {
 claim(): Promise<EvaluationQueueClaim | null>;
 renew(c: EvaluationQueueClaim): Promise<EvaluationRenewal>;
 reserve(c: EvaluationQueueClaim, operation: EvaluationOperation): Promise<EvaluationReservation>;
 settle(c: EvaluationQueueClaim, operationId: string, settlement: EvaluationSettlement): Promise<{state: "settled" | "uncertain"; replayed: boolean}>;
 commit(c: EvaluationQueueClaim, inputHash: string, resultText: string, outcome: GovernedEvaluationOutcome, reason: GovernedEvaluationReason): Promise<{replayed: boolean}>;
};

/**
 * Database refusals the consumer acts on. Anything else is reported as a transport failure, so no
 * remote diagnostic text ever travels further than this module.
 */
export const evaluationTransportCodes = [
 "evaluation_partial_result_required", "evaluation_receipt_required", "evaluation_transport_paused", "evaluation_authority_denied",
 "evaluation_lease_denied", "evaluation_operation_lease_denied", "execution_operation_denied", "evaluation_operation_invalid",
 "evaluation_operation_conflict", "evaluation_settlement_invalid", "evaluation_settlement_conflict", "evaluation_result_invalid",
 "evaluation_result_input_mismatch", "execution_result_conflict", "evaluation_attempts_exhausted", "worker_account_binding_required",
 "worker_account_required", "worker_token_invalid",
] as const;
export type EvaluationTransportCode = (typeof evaluationTransportCodes)[number] | "evaluation_transport_failed";
export class EvaluationTransportError extends Error {
 constructor(readonly code: EvaluationTransportCode) { super(code); this.name = "EvaluationTransportError"; }
}
const known = new Set<string>(evaluationTransportCodes);
/** The largest claim the database can return: a contract of 1 MiB and a snapshot of 8 MiB. */
const claimBytes = 9_437_184;

export function createEvaluationQueue(client: SupabaseClient, workerToken: string): EvaluationQueue {
 const rpc = async (name: string, args: Record<string, unknown>, bytes = 0) => {
  let response: {data: unknown; error: {message?: unknown} | null};
  try { response = await client.rpc(name, args).abortSignal(AbortSignal.timeout(executionTransportTimeoutMs(bytes))); }
  catch { throw new EvaluationTransportError("evaluation_transport_failed"); }
  if (response.error) {
   const message = typeof response.error.message === "string" ? response.error.message : "";
   throw new EvaluationTransportError(known.has(message) ? message as EvaluationTransportCode : "evaluation_transport_failed");
  }
  return response.data;
 };
 const lease = (c: EvaluationQueueClaim) => ({p_job_id: c.jobId, p_capability_token: c.capability, p_lease_id: c.leaseId});
 return {
  async claim() {
   const data = await rpc("worker_claim_evaluation_v1", {p_worker_token: workerToken}, claimBytes);
   if (z.object({claimed: z.literal(false)}).strict().safeParse(data).success) return null;
   return evaluationQueueClaimSchema.parse(data);
  },
  async renew(c) { return evaluationRenewalSchema.parse(await rpc("worker_renew_evaluation_v1", lease(c))); },
  async reserve(c, operation) {
   return evaluationReservationSchema.parse(await rpc("worker_reserve_evaluation_operation_v1", {...lease(c), p_operation_id: operation.operationId,
    p_route: operation.route, p_resources: operation.resources, p_reserved_microusd: operation.reservedMicrousd, p_reserved_calls: operation.reservedCalls}));
  },
  async settle(c, operationId, settlement) {
   const receipt = settlementReceiptSchema.parse(await rpc("worker_settle_evaluation_operation_v1", {...lease(c), p_operation_id: operationId, p_outcome: settlement.outcome,
    p_spent_microusd: settlement.outcome === "settled" ? settlement.spentMicrousd : null, p_spent_calls: settlement.outcome === "settled" ? settlement.spentCalls : null}));
   if (receipt.state !== settlement.outcome) throw new Error("evaluation_settlement_mismatch");
   return {state: receipt.state, replayed: receipt.replayed};
  },
  async commit(c, inputHash, resultText, outcome, reason) {
   const receipt = commitReceiptSchema.parse(await rpc("worker_commit_evaluation_v1", {...lease(c), p_contract_hash: c.contractFingerprint, p_input_hash: inputHash,
    p_result_text: resultText, p_outcome: outcome, p_reason: reason}, Buffer.byteLength(resultText, "utf8")));
   if (receipt.outcome !== outcome || receipt.reason !== reason) throw new Error("evaluation_commit_mismatch");
   return {replayed: receipt.replayed};
  },
 };
}
