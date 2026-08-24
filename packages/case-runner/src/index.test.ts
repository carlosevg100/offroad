import {describe, expect, it} from "vitest";
import {z} from "zod";
import {CaseStageBlocked, caseStageIds, runCase, type CaseStageId, type StageContext, type StageDefinition} from "./index";

const inputSchema = z.object({company: z.string(), amount: z.string()});
const outputSchema = z.object({stage: z.string(), received: z.number()});

function definitions(options: {
  failAt?: CaseStageId;
  blockAt?: CaseStageId;
  invalidAt?: CaseStageId;
  usageAt?: CaseStageId;
} = {}): Record<CaseStageId, StageDefinition> {
  return Object.fromEntries(caseStageIds.map((stage) => [stage, {
    outputSchema,
    execute: ({outputs}: StageContext) => {
      if (stage === options.failAt) throw new Error("client financial statement and private details");
      if (stage === options.blockAt) throw new CaseStageBlocked("material_evidence_missing");
      if (stage === options.invalidAt) return {output: {private: "wrong contract"}};
      return {
        output: {stage, received: Object.keys(outputs).length},
        usage: stage === options.usageAt ? {costUsd: 2, modelCalls: 3} : undefined,
      };
    },
  }])) as unknown as Record<CaseStageId, StageDefinition>;
}

const base = {
  runId: "run-1",
  caseId: "case-1",
  input: {company: "Empresa Teste", amount: "1000000"},
  inputSchema,
  policy: {maxCostUsd: 10, maxModelCalls: 10},
  versions: {runner: "v1", playbook: "v2"},
  now: (() => {
    let tick = 0;
    const start = Date.parse("2026-08-24T12:00:00.000Z");
    return () => new Date(start + tick++ * 1_000);
  })(),
  monotonicNow: (() => {
    let tick = 0;
    return () => tick++ * 10;
  })(),
};

describe("integrated case runner", () => {
  it("executes every governed layer in order and fingerprints each output", async () => {
    const report = await runCase({...base, stages: definitions()});
    expect(report.status).toBe("succeeded");
    expect(report.stages.map((stage) => stage.stage)).toEqual(caseStageIds);
    expect(report.stages.every((stage) => stage.status === "succeeded")).toBe(true);
    expect(report.stages[8]?.output).toEqual({stage: "outcome", received: 8});
    expect(report.stages.every((stage) => stage.outputFingerprint?.length === 64)).toBe(true);
    expect(report.reportFingerprint).toHaveLength(64);
  });

  it("classifies a layer failure and never persists the private exception message", async () => {
    const report = await runCase({...base, stages: definitions({failAt: "reconciliation"})});
    expect(report.status).toBe("failed");
    expect(report.stages[1]).toMatchObject({stage: "reconciliation", status: "failed", failureKind: "reconciliation", code: "stage_execution_failed"});
    expect(report.stages.slice(2).every((stage) => stage.status === "skipped")).toBe(true);
    expect(JSON.stringify(report)).not.toContain("private details");
  });

  it("distinguishes a deliberate evidence hold from a technical failure", async () => {
    const report = await runCase({...base, stages: definitions({blockAt: "materials"})});
    expect(report.status).toBe("blocked");
    expect(report.stages[6]).toMatchObject({failureKind: "material", code: "material_evidence_missing", status: "blocked"});
    expect(report.stages[7]?.status).toBe("skipped");
  });

  it("turns invalid output into a contract failure at the exact layer", async () => {
    const report = await runCase({...base, stages: definitions({invalidAt: "metrics"})});
    expect(report.stages[2]).toMatchObject({failureKind: "contract", code: "invalid_stage_output", status: "failed"});
  });

  it("enforces per-layer and total model budgets as hard gates", async () => {
    const stageReport = await runCase({
      ...base,
      stages: definitions({usageAt: "claims"}),
      policy: {maxCostUsd: 10, maxModelCalls: 10, stages: {claims: {costUsd: 1}}},
    });
    expect(stageReport.stages[5]).toMatchObject({failureKind: "budget", code: "stage_cost_budget_exceeded", status: "failed"});

    const totalReport = await runCase({
      ...base,
      stages: definitions({usageAt: "claims"}),
      policy: {maxCostUsd: 1, maxModelCalls: 10},
    });
    expect(totalReport.stages[5]).toMatchObject({failureKind: "budget", code: "case_cost_budget_exceeded", status: "failed"});
  });
});
