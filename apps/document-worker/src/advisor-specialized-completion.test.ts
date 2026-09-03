import {describe, expect, it, vi} from "vitest";

import {
  advisorSpecializedCompletion,
  completeAdvisorSpecializedWork,
} from "./advisor-specialized-completion";
import type {CapitalProjectAnalysisJob, QueueClient} from "./queue";

const baseJob: CapitalProjectAnalysisJob = {
  claimed: true,
  job_id: "10000000-0000-4000-8000-000000000001",
  capability_token: "c".repeat(64),
  lease_expires_at: "2026-09-01T18:00:00.000Z",
  attempt: 1,
  organization_id: "20000000-0000-4000-8000-000000000001",
  intake_session_id: "30000000-0000-4000-8000-000000000001",
  processing_run_id: "40000000-0000-4000-8000-000000000001",
  kind: "capital_project_analysis",
  payload: {
    analysis_scope: "origination_thesis",
    locale: "pt-BR",
    capital_project_id: "50000000-0000-4000-8000-000000000001",
    capital_project_plan_id: "60000000-0000-4000-8000-000000000001",
    capital_project_brief_id: "70000000-0000-4000-8000-000000000001",
    capital_task_ids: ["M07"],
    capital_artifact_required: true,
    trigger_event: {
      type: "advisor_semantic_route",
      sourceMessageId: "80000000-0000-4000-8000-000000000001",
      assistantMessageId: "90000000-0000-4000-8000-000000000001",
    },
    model_budget: {max_cost_usd: 0.75, max_calls: 2},
  },
};

const artifact = {
  id: "a0000000-0000-4000-8000-000000000001",
  artifactFingerprint: "a".repeat(64),
};

describe("advisor specialized completion", () => {
  it("creates stable, locale-aware completion content only for a semantic chat activation", () => {
    const first = advisorSpecializedCompletion(baseJob, artifact);
    const replay = advisorSpecializedCompletion(baseJob, artifact);

    expect(first).toEqual(replay);
    expect(first?.completionMessageId).toMatch(/^[0-9a-f-]{36}$/);
    expect(first?.content).toContain("visão integrada da companhia");
    expect(first?.content).toContain("Alguma delas faz mais sentido");
    expect(first?.content).not.toContain("sua instituição pode liderar");
    expect(advisorSpecializedCompletion({
      ...baseJob,
      payload: {...baseJob.payload, trigger_event: {type: "project_started"}},
    }, artifact)).toBeNull();
  });

  it("uses the atomic conversation-and-job completion RPC for chat-activated work", async () => {
    const completeAdvisorSpecializedJob = vi.fn(async () => {});
    const complete = vi.fn(async () => {});
    const queue = {completeAdvisorSpecializedJob, complete} as unknown as QueueClient;
    const result = {capital_project_id: baseJob.payload.capital_project_id};

    await completeAdvisorSpecializedWork({queue, job: baseJob, artifact, result});

    expect(complete).not.toHaveBeenCalled();
    expect(completeAdvisorSpecializedJob).toHaveBeenCalledWith(baseJob, expect.objectContaining({
      artifactId: artifact.id,
      artifactFingerprint: artifact.artifactFingerprint,
      content: expect.stringContaining("desenvolver todas para comparação"),
      result,
    }));
  });

  it("keeps direct and revision runs on the generic completion rail", async () => {
    const completeAdvisorSpecializedJob = vi.fn(async () => {});
    const complete = vi.fn(async () => {});
    const queue = {completeAdvisorSpecializedJob, complete} as unknown as QueueClient;
    const directJob = {
      ...baseJob,
      payload: {...baseJob.payload, trigger_event: {type: "project_started"}},
    };

    await completeAdvisorSpecializedWork({queue, job: directJob, artifact, result: {ok: true}});

    expect(completeAdvisorSpecializedJob).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledWith(directJob, {ok: true});
  });
});
