import {describe, expect, it} from "vitest";
import type {CaseRunReport, CaseStageRecord} from "@offroad/case-runner";
import {caseStageIds} from "@offroad/case-runner";
import {compareCaseExecutions, decidePromotion, type CohortEvidence} from "./index";

function report(overrides: Partial<CaseRunReport> = {}, mutate?: (stages: CaseStageRecord[]) => void): CaseRunReport {
  const stages: CaseStageRecord[] = caseStageIds.map((stage) => ({
    stage,
    status: "succeeded",
    output: {stage},
    outputFingerprint: "a".repeat(64),
    usage: {costUsd: 0.1, modelCalls: 1},
    durationMs: 10,
  }));
  mutate?.(stages);
  return {
    schemaVersion: "2026.08.26-v3",
    runId: "run-1",
    caseId: "case-1",
    status: "succeeded",
    startedAt: "2026-08-24T12:00:00.000Z",
    completedAt: "2026-08-24T12:01:00.000Z",
    inputFingerprint: "1".repeat(64),
    stages,
    taskRuns: [],
    usage: {costUsd: 1, modelCalls: 9},
    versions: {runner: "v1"},
    reportFingerprint: "2".repeat(64),
    ...overrides,
  };
}

function cohort(kind: "wave_1" | "wave_2", offset: number): CohortEvidence {
  return {
    cohortId: `${offset === 0 ? "10000000" : "20000000"}-0000-4000-8000-000000000001`,
    kind,
    realCaseIds: Array.from({length: 10}, (_, index) =>
      `${offset === 0 ? "10000000" : "20000000"}-0000-4000-8000-${String(index + 1).padStart(12, "0")}`),
    completedComparisons: 10,
    criticalRegressions: 0,
    unresolvedWarnings: 0,
    accepted: true,
  };
}

describe("controlled execution comparison", () => {
  it("passes a byte-stable replay of the same frozen input and versions", () => {
    const baseline = report();
    const result = compareCaseExecutions({mode: "replay", baseline, candidate: report()});
    expect(result).toMatchObject({comparable: true, passed: true, criticalCount: 0});
  });

  it("makes replay output drift critical but keeps shadow phrasing drift visible as a warning", () => {
    const baseline = report();
    const candidate = report({}, (stages) => { stages[6]!.outputFingerprint = "b".repeat(64); });
    expect(compareCaseExecutions({mode: "replay", baseline, candidate})).toMatchObject({passed: false, criticalCount: 1});
    expect(compareCaseExecutions({mode: "shadow", baseline, candidate})).toMatchObject({passed: true, warningCount: 1});
  });

  it("fails closed when the frozen input changes or a stage regresses", () => {
    const baseline = report();
    const candidate = report({inputFingerprint: "3".repeat(64), status: "failed"}, (stages) => {
      stages[2] = {...stages[2]!, status: "failed", failureKind: "contract", code: "invalid_stage_output", output: undefined, outputFingerprint: undefined};
      for (let index = 3; index < stages.length; index += 1) stages[index] = {...stages[index]!, status: "skipped", output: undefined, outputFingerprint: undefined};
    });
    const result = compareCaseExecutions({mode: "shadow", baseline, candidate});
    expect(result.comparable).toBe(false);
    expect(result.passed).toBe(false);
    expect(result.differences.some((entry) => entry.code === "frozen_input_changed")).toBe(true);
    expect(result.criticalCount).toBeGreaterThan(0);
  });
});

describe("rollout promotion", () => {
  it("allows canary only after ten distinct real cases in wave one", () => {
    expect(decidePromotion({from: "shadow", to: "canary", wave1: cohort("wave_1", 0)}).allowed).toBe(true);
    expect(decidePromotion({from: "shadow", to: "canary", wave1: {...cohort("wave_1", 0), realCaseIds: []}}).reasons)
      .toContain("wave_1_requires_exactly_ten_real_cases");
  });

  it("requires a disjoint second wave and explicit approval before active", () => {
    const wave1 = cohort("wave_1", 0);
    const wave2 = cohort("wave_2", 1);
    expect(decidePromotion({from: "canary", to: "active", wave1, wave2, externalReleaseApproved: true}).allowed).toBe(true);
    expect(decidePromotion({from: "canary", to: "active", wave1, wave2}).reasons)
      .toContain("external_release_approval_required");
    expect(decidePromotion({from: "canary", to: "active", wave1, wave2: {...wave2, realCaseIds: wave1.realCaseIds}, externalReleaseApproved: true}).reasons)
      .toContain("cohort_cases_must_not_overlap");
  });

  it("always permits an emergency pause and rejects skipped promotion states", () => {
    expect(decidePromotion({from: "active", to: "paused"}).allowed).toBe(true);
    expect(decidePromotion({from: "off", to: "active", externalReleaseApproved: true}).allowed).toBe(false);
  });
});
