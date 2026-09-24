import {describe, expect, it, vi} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import {createEvaluationQueue, EvaluationTransportError, type EvaluationQueueClaim} from "./evaluation-queue";

const claim: EvaluationQueueClaim = {claimed: true, jobId: "30000000-0000-4000-8000-000000000001", leaseId: "30000000-0000-4000-8000-000000000002",
 executionId: "30000000-0000-4000-8000-000000000003", capability: "x".repeat(64), attempt: 1, contractText: "{}", contractFingerprint: "a".repeat(64),
 snapshotText: "{}", elapsedDurationMs: 0, leaseExpiresAt: "2026-09-24T02:00:00.123456+00:00", budgetExpired: false};
const route = {provider: "anthropic", model: "claude-opus-5", accountRef: "synthetic-account", projectRef: "synthetic-project", credentialBinding: "synthetic-binding",
 endpoint: "https://api.anthropic.com/v1/messages", region: "global", toolVersion: "synthetic-gateway"};
function transport(data: unknown, error: unknown = null) {
 const abortSignal = vi.fn(async (signal: AbortSignal) => { expect(signal).toBeInstanceOf(AbortSignal); return {data, error}; });
 const rpc = vi.fn(() => ({abortSignal}));
 return {queue: createEvaluationQueue({rpc} as unknown as SupabaseClient, "synthetic-worker-token"), rpc};
}
const lease = {p_job_id: claim.jobId, p_capability_token: claim.capability, p_lease_id: claim.leaseId};

describe("evaluation queue transport", () => {
 it("claims with the worker token and treats an empty queue as idle", async () => {
  const t = transport({claimed: false});
  expect(await t.queue.claim()).toBeNull();
  expect(t.rpc).toHaveBeenCalledWith("worker_claim_evaluation_v1", {p_worker_token: "synthetic-worker-token"});
  expect(await transport(claim).queue.claim()).toEqual(claim);
 });
 it("rejects malformed and extended claims and renewals", async () => {
  for (const data of [{claimed: true}, {...claim, capability: "short"}, {...claim, contractFingerprint: "A".repeat(64)}, {...claim, authorityOverride: true}]) {
   await expect(transport(data).queue.claim()).rejects.toThrow();
  }
  const renewal = {allowed: true, jobId: claim.jobId, leaseId: claim.leaseId, executionId: claim.executionId, organizationId: claim.jobId, processingRunId: claim.executionId,
   contractFingerprint: claim.contractFingerprint, leaseExpiresAt: claim.leaseExpiresAt, elapsedDurationMs: 10, remainingDurationMs: 100};
  const t = transport(renewal);
  expect(await t.queue.renew(claim)).toEqual(renewal);
  expect(t.rpc).toHaveBeenCalledWith("worker_renew_evaluation_v1", lease);
  await expect(transport({...renewal, workId: claim.jobId}).queue.renew(claim)).rejects.toThrow();
 });
 it("reserves one declared route with its own operation id and reads every answer the database gives", async () => {
  const operation = {operationId: "30000000-0000-4000-8000-000000000004", route, resources: ["inference", "prompt_cache", "schema_cache"], reservedMicrousd: 1234, reservedCalls: 1};
  const reserved = {allowed: true, operationId: operation.operationId, decisionId: "30000000-0000-4000-8000-000000000005", state: "reserved", replayed: false, mayExecute: true};
  const t = transport(reserved);
  expect(await t.queue.reserve(claim, operation)).toEqual(reserved);
  expect(t.rpc).toHaveBeenCalledWith("worker_reserve_evaluation_operation_v1", {...lease, p_operation_id: operation.operationId, p_route: route,
   p_resources: operation.resources, p_reserved_microusd: 1234, p_reserved_calls: 1});
  for (const answer of [
   {allowed: false, decisionId: reserved.decisionId, reasons: ["processing_resource_ineligible:inference"], mayExecute: false},
   {allowed: false, state: "partial_budget_exhausted", mayExecute: false},
   {allowed: true, operationId: operation.operationId, decisionId: reserved.decisionId, state: "settled", replayed: true, mayExecute: false},
  ]) expect(await transport(answer).queue.reserve(claim, operation)).toEqual(answer);
  for (const answer of [{...reserved, replayed: true}, {...reserved, mayExecute: false, replayed: false}, {allowed: false, decisionId: reserved.decisionId, reasons: ["Private detail"], mayExecute: false}]) {
   await expect(transport(answer).queue.reserve(claim, operation)).rejects.toThrow();
  }
 });
 it("settles with the spend or as uncertain, never both", async () => {
  const t = transport({settled: true, state: "settled", replayed: false});
  await t.queue.settle(claim, "30000000-0000-4000-8000-000000000004", {outcome: "settled", spentMicrousd: 900, spentCalls: 1});
  expect(t.rpc).toHaveBeenCalledWith("worker_settle_evaluation_operation_v1", {...lease, p_operation_id: "30000000-0000-4000-8000-000000000004",
   p_outcome: "settled", p_spent_microusd: 900, p_spent_calls: 1});
  const u = transport({settled: true, state: "uncertain", replayed: false});
  await u.queue.settle(claim, "30000000-0000-4000-8000-000000000004", {outcome: "uncertain"});
  expect(u.rpc).toHaveBeenCalledWith("worker_settle_evaluation_operation_v1", {...lease, p_operation_id: "30000000-0000-4000-8000-000000000004",
   p_outcome: "uncertain", p_spent_microusd: null, p_spent_calls: null});
  await expect(transport({settled: true, state: "uncertain", replayed: true}).queue.settle(claim, "30000000-0000-4000-8000-000000000004",
   {outcome: "settled", spentMicrousd: 1, spentCalls: 1})).rejects.toThrow("evaluation_settlement_mismatch");
 });
 it("commits the exact bytes with the claim's contract fingerprint and refuses another terminal answer", async () => {
  const t = transport({committed: true, replayed: false, outcome: "partial", reason: "transport_denied"});
  await t.queue.commit(claim, "b".repeat(64), '{"reason":"transport_denied","status":"partial"}', "partial", "transport_denied");
  expect(t.rpc).toHaveBeenCalledWith("worker_commit_evaluation_v1", {...lease, p_contract_hash: claim.contractFingerprint, p_input_hash: "b".repeat(64),
   p_result_text: '{"reason":"transport_denied","status":"partial"}', p_outcome: "partial", p_reason: "transport_denied"});
  await expect(transport({committed: true, replayed: false, outcome: "partial", reason: "operation_uncertain"}).queue.commit(claim, "b".repeat(64), "{}", "partial", "transport_denied"))
   .rejects.toThrow("evaluation_commit_mismatch");
 });
 it("surfaces only the database refusals it acts on and never remote text", async () => {
  await expect(transport(null, {message: "evaluation_partial_result_required"}).queue.commit(claim, "b".repeat(64), "{}", "succeeded", "evaluated"))
   .rejects.toMatchObject({name: "EvaluationTransportError", code: "evaluation_partial_result_required"});
  const failure = await transport(null, {message: "private borrower detail"}).queue.claim().catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(EvaluationTransportError);
  expect((failure as Error).message).toBe("evaluation_transport_failed");
 });
});
