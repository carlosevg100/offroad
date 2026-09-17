import {describe, expect, it, vi} from "vitest";
import type {ModelGateway} from "@offroad/model-gateway";
import {claimedJobSchema, type QueueClient, type WorkConversationJob} from "./queue";
import {processWorkConversationJob, workTurnContextSchema} from "./work-conversation";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const job: WorkConversationJob = {claimed: true, kind: "work_conversation", job_id: id(1),
  work_id: id(2), intake_session_id: null, processing_run_id: id(3), organization_id: id(4),
  capability_token: "x".repeat(64), lease_expires_at: "2026-09-17T21:00:00Z", attempt: 1,
  payload: {message_id: id(5), locale: "pt-BR", model_budget: {max_calls: 1, max_cost_usd: 0.25}}};
const context = {workId: id(2), messageId: id(5), locale: "pt-BR", message: "Explique alternativas de capital.",
  fingerprint: "a".repeat(64), context: {purpose: "Entender opções", audience: null, deadline: null,
    commitment: "exploring", stage: "understand", revision: 1}, messages: []};
function runtime() {
  const load = vi.fn().mockResolvedValue(context), commit = vi.fn().mockResolvedValue({messageId: id(6)}), fail = vi.fn();
  const complete = vi.fn().mockResolvedValue({output: {kind: "answer", content: "Uma resposta conceitual."}});
  const log = vi.fn();
  return {load, commit, fail, complete, log, deps: {
    queue: {loadWorkTurn: load, commitWorkTurn: commit, fail} as unknown as QueueClient,
    gateway: {complete, spent: () => ({costUsd: 0.01, calls: 1})} as unknown as ModelGateway, log,
  }};
}
describe("persistent work conversation", () => {
  it("accepts an intake-free conversation and refuses an intake-free document job", () => {
    expect(claimedJobSchema.safeParse(job).success).toBe(true);
    expect(claimedJobSchema.safeParse({...job, kind: "agent_operation_brief"}).success).toBe(false);
    expect(claimedJobSchema.safeParse({...job, kind: "document_pipeline"}).success).toBe(false);
    expect(claimedJobSchema.safeParse({...job, work_id: null}).success).toBe(false);
    expect(claimedJobSchema.safeParse({...job, intake_session_id: id(8)}).success).toBe(false);
  });
  it("binds response to exact work/message/context and commits atomically through the existing queue", async () => {
    const r = runtime();
    expect(await processWorkConversationJob(job, r.deps)).toEqual({status: "succeeded"});
    expect(r.commit).toHaveBeenCalledWith(job, context.fingerprint, {kind: "answer", content: "Uma resposta conceitual."}, {costUsd: 0.01, calls: 1, budgetExposureUsd: null, unknownCostCalls: null});
    const request = r.complete.mock.calls[0]![0];
    expect(request.dataHandling.classification).toBe("restricted");
    expect(request.metadata.workId).toBe(job.work_id);
    expect(request.input[0].text).not.toContain("intake");
  });
  it("rejects crossed work identity before any provider call", async () => {
    const r = runtime(); r.load.mockResolvedValue({...context, workId: id(99)});
    expect(await processWorkConversationJob(job, r.deps)).toEqual({status: "failed"});
    expect(r.complete).not.toHaveBeenCalled(); expect(r.commit).not.toHaveBeenCalled();
  });
  it("has no role or execution-authority channel in context or response", async () => {
    expect(workTurnContextSchema.safeParse({...context, context: {...context.context, professionalRole: "CFO"}}).success).toBe(false);
    const r = runtime(); r.complete.mockResolvedValue({output: {kind: "answer", content: "Resposta", activation: {publish: true}}});
    expect(await processWorkConversationJob(job, r.deps)).toEqual({status: "failed"});
    expect(r.commit).not.toHaveBeenCalled();
  });
  it("does not publish when authority or context was revoked during the model call", async () => {
    const r = runtime(); r.commit.mockRejectedValue(new Error("job_authorization_revoked"));
    expect(await processWorkConversationJob(job, r.deps)).toEqual({status: "failed"});
    expect(r.fail).toHaveBeenCalledOnce();
  });
  it("does not log or persist provider exception content", async () => {
    const r = runtime(); r.complete.mockRejectedValue(new Error("PRIVATE_CANARY text from the provider"));
    await processWorkConversationJob(job, r.deps);
    expect(JSON.stringify(r.log.mock.calls)).not.toContain("PRIVATE_CANARY");
    expect(JSON.stringify(r.fail.mock.calls)).not.toContain("PRIVATE_CANARY");
  });
});
