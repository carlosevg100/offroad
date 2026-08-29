import {describe, expect, it} from "vitest";
import {z} from "zod";
import {
  CaseStageBlocked,
  InMemoryTaskResultCache,
  caseStageIds,
  caseTaskSpecs,
  runCase,
  taskCacheFromReport,
  type CaseStageId,
  type StageContext,
  type StageDefinition,
} from "./index";

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
  it("executes every governed layer through the graph and fingerprints each output", async () => {
    const report = await runCase({...base, stages: definitions()});
    expect(report.status).toBe("succeeded");
    expect(report.stages.map((stage) => stage.stage)).toEqual(caseStageIds);
    expect(report.stages.every((stage) => stage.status === "succeeded")).toBe(true);
    const outcomeIndex=caseStageIds.indexOf("outcome");
    expect(report.stages[outcomeIndex]?.output).toEqual({stage: "outcome", received: outcomeIndex});
    expect(report.stages.every((stage) => stage.outputFingerprint?.length === 64)).toBe(true);
    expect(report.taskRuns).toHaveLength(caseStageIds.length);
    expect(report.taskRuns.map((task) => task.taskId)).toEqual(caseStageIds);
    expect(report.taskRuns.every((task) => task.terminationReason === "completed")).toBe(true);
    expect(report.reportFingerprint).toHaveLength(64);
  });

  it("publishes safe started and terminal events for every real stage", async () => {
    const events: unknown[] = [];
    await runCase({...base, stages: definitions(), onStage: (event) => { events.push(event); }});
    expect(events).toHaveLength(caseStageIds.length * 2);
    const typedEvents = events as Array<{stage: CaseStageId; status: string}>;
    for (const stage of caseStageIds) {
      expect(typedEvents.filter((event) => event.stage === stage).map((event) => event.status)).toEqual(["started", "succeeded"]);
    }
    for (const spec of caseTaskSpecs) {
      const startedIndex = typedEvents.findIndex((event) => event.stage === spec.id && event.status === "started");
      for (const dependency of spec.dependencies) {
        const completedIndex = typedEvents.findIndex((event) => event.stage === dependency && event.status === "succeeded");
        expect(completedIndex).toBeLessThan(startedIndex);
      }
    }
    expect(JSON.stringify(events)).not.toContain("received");
    expect(JSON.stringify(events)).not.toContain("Empresa Teste");
  });

  it("classifies a layer failure and never persists the private exception message", async () => {
    const events: unknown[] = [];
    const report = await runCase({
      ...base,
      stages: definitions({failAt: "reconciliation"}),
      onStage: (event) => { events.push(event); },
    });
    expect(report.status).toBe("failed");
    expect(report.stages[1]).toMatchObject({stage: "reconciliation", status: "failed", failureKind: "reconciliation", code: "stage_execution_failed"});
    expect(report.stages.slice(2).every((stage) => stage.status === "skipped")).toBe(true);
    expect(JSON.stringify(report)).not.toContain("private details");
    expect(JSON.stringify(events)).not.toContain("private details");
    expect(events).toHaveLength(caseStageIds.length + 2);
  });

  it("distinguishes a deliberate evidence hold from a technical failure", async () => {
    const report = await runCase({...base, stages: definitions({blockAt: "materials"})});
    expect(report.status).toBe("blocked");
    const materialsIndex=caseStageIds.indexOf("materials");
    expect(report.stages[materialsIndex]).toMatchObject({failureKind: "material", code: "material_evidence_missing", status: "blocked"});
    expect(report.stages[materialsIndex+1]?.status).toBe("skipped");
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
    const claimsIndex=caseStageIds.indexOf("claims");
    expect(stageReport.stages[claimsIndex]).toMatchObject({failureKind: "budget", code: "stage_cost_budget_exceeded", status: "failed"});

    const totalReport = await runCase({
      ...base,
      stages: definitions({usageAt: "claims"}),
      policy: {maxCostUsd: 1, maxModelCalls: 10},
    });
    expect(totalReport.stages[claimsIndex]).toMatchObject({failureKind: "budget", code: "case_cost_budget_exceeded", status: "failed"});
  });

  it("runs independent ready tasks in parallel", async () => {
    const started: CaseStageId[] = [];
    let release: (() => void) | undefined;
    const hold = new Promise<void>((resolve) => { release = resolve; });
    const parallelDefinitions = definitions();
    for (const stage of ["gaps", "structure", "claims"] as const) {
      parallelDefinitions[stage] = {
        outputSchema,
        execute: async ({outputs}) => {
          started.push(stage);
          if (started.length === 3) release?.();
          await hold;
          return {output: {stage, received: Object.keys(outputs).length}};
        },
      };
    }
    const report = await runCase({...base, stages: parallelDefinitions});
    expect(started).toEqual(["gaps", "structure", "claims"]);
    expect(report.status).toBe("succeeded");
  });

  it("reuses unchanged task results and invalidates only the affected descendants", async () => {
    const cache = new InMemoryTaskResultCache();
    const executionCounts = new Map<CaseStageId, number>();
    const cachedDefinitions = definitions();
    for (const stage of caseStageIds) {
      cachedDefinitions[stage] = {
        ...cachedDefinitions[stage],
        selectInput: stage === "extraction"
          ? (input) => ({company: (input as {company: string}).company})
          : stage === "structure"
            ? (input) => ({amount: (input as {amount: string}).amount})
            : () => null,
        execute: (context) => {
          executionCounts.set(stage, (executionCounts.get(stage) ?? 0) + 1);
          return {output: {stage, received: Object.keys(context.outputs).length}};
        },
      };
    }
    const first = await runCase({...base, runId: "cache-1", stages: cachedDefinitions, taskCache: cache});
    executionCounts.clear();
    const report = await runCase({
      ...base,
      runId: "cache-2",
      input: {...base.input, amount: "2000000"},
      stages: cachedDefinitions,
      taskCache: taskCacheFromReport(first),
    });
    expect(report.taskRuns.find((task) => task.taskId === "extraction")?.cacheHit).toBe(true);
    expect(report.taskRuns.find((task) => task.taskId === "structure")?.cacheHit).toBe(false);
    expect(executionCounts.has("extraction")).toBe(false);
    expect(executionCounts.get("structure")).toBe(1);
    expect(report.taskRuns.find((task) => task.taskId === "matching")?.cacheHit).toBe(false);
  });
});
