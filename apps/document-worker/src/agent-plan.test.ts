import {describe, expect, it, vi} from "vitest";

import {ensureInitialAgentPlan} from "./agent-plan";
import type {AgentPlanJob, CapitalProjectAnalysisJob, PreliminaryAnalysisJob, QueueClient} from "./queue";

const job = {
  kind: "capital_project_analysis",
  job_id: "10000000-0000-4000-8000-000000000001",
} as CapitalProjectAnalysisJob;

describe("Deal Captain plan projection", () => {
  it("turns the compiled plan into a specialist, dependency-bound plan", async () => {
    const recordAgentPlan = vi.fn(async (_job: CapitalProjectAnalysisJob, _plan: unknown) =>
      "90000000-0000-4000-8000-000000000001");
    const queue = {
      loadAgentPlanContext: async () => ({
        project: {id: "20000000-0000-4000-8000-000000000001", project_name: "Camil"},
        objective: {meetingContext: "Preparar alternativas estratégicas de capital para a reunião."},
        plan: {id: "30000000-0000-4000-8000-000000000001"},
        tasks: [
          {id: "M01", dependencies: [], execution_class: "extraction", effect: "propose_state"},
          {id: "C02", dependencies: ["M01"], execution_class: "research", effect: "none"},
        ],
      }),
      recordAgentPlan,
    } as unknown as QueueClient;

    await expect(ensureInitialAgentPlan(job, queue, () => new Date("2026-09-03T12:00:00.000Z")))
      .resolves.toBe("90000000-0000-4000-8000-000000000001");
    const plan = recordAgentPlan.mock.calls[0]?.[1];
    expect(plan).toMatchObject({
      goal: "Preparar alternativas estratégicas de capital para a reunião.",
      workItems: [
        {taskSpecId: "M01", specialist: "context_intelligence", status: "ready"},
        {taskSpecId: "C02", specialist: "company_and_sector", status: "pending"},
      ],
    });
  });

  it("creates the same bounded work plan for a private document-led project", async () => {
    const privateJob = {
      kind: "preliminary_analysis",
      job_id: "10000000-0000-4000-8000-000000000002",
    } as PreliminaryAnalysisJob;
    const recordAgentPlan = vi.fn(async (_job: AgentPlanJob, _plan: unknown) =>
      "90000000-0000-4000-8000-000000000002");
    const queue = {
      loadAgentPlanContext: async () => ({
        project: {id: "20000000-0000-4000-8000-000000000002", project_name: "Projeto Ipê"},
        objective: {
          initial_request: "Quero financiar a expansão da companhia e enviei os documentos disponíveis.",
          company_profile: {name: "Companhia privada"},
        },
        plan: {id: "30000000-0000-4000-8000-000000000002"},
        tasks: [
          {id: "D01", dependencies: [], execution_class: "extraction", effect: "propose_state"},
          {id: "C03", dependencies: ["D01"], execution_class: "judgment", effect: "propose_state"},
        ],
      }),
      recordAgentPlan,
    } as unknown as QueueClient;

    await expect(ensureInitialAgentPlan(privateJob, queue)).resolves.toBe(
      "90000000-0000-4000-8000-000000000002",
    );
    expect(recordAgentPlan.mock.calls[0]?.[1]).toMatchObject({
      goal: "Quero financiar a expansão da companhia e enviei os documentos disponíveis.",
      specializationProfile: {
        packIds: ["core.institutional-dcm", "objective.capex-expansion"],
        minimumMaturity: "implemented",
      },
      workItems: [
        {taskSpecId: "D01", specialist: "document_intelligence", status: "ready"},
        {taskSpecId: "C03", specialist: "financial_analysis", status: "pending"},
      ],
    });
  });

  it("fails closed if persistence is unavailable", async () => {
    const queue = {
      loadAgentPlanContext: async () => ({
        project: {id: "20000000-0000-4000-8000-000000000001", project_name: "Projeto"},
        objective: {},
        plan: {id: "30000000-0000-4000-8000-000000000001"},
        tasks: [{id: "M01", dependencies: [], execution_class: "extraction", effect: "propose_state"}],
      }),
      recordAgentPlan: async () => { throw new Error("persistence unavailable"); },
    } as unknown as QueueClient;
    await expect(ensureInitialAgentPlan(job, queue)).rejects.toThrow("persistence unavailable");
  });
});
