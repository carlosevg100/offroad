import {describe, expect, it} from "vitest";

import {collapseStages, groupByFolder, runProgress, type DocumentProfileView, type PipelineJob, type PipelineRun, type PipelineStage} from "./pipeline";

const profile = (overrides: Partial<DocumentProfileView>): DocumentProfileView => ({
  id: "p", sourceDocumentId: "d", documentKind: "other", title: null, entityName: null,
  periodStart: null, periodEnd: null, fiscalYear: null, currency: null,
  informationClass: "management", evidenceRank: 4, confidence: 0.9,
  suggestedFolder: null, suggestedName: null, reviewState: "proposed", quality: {}, summary: {},
  ...overrides,
});

describe("organised index", () => {
  it("orders folders the way a credit analyst reads them and never hides a document", () => {
    const groups = groupByFolder([
      profile({id: "1", suggestedFolder: "contracts"}),
      profile({id: "2", suggestedFolder: "financial"}),
      profile({id: "3", suggestedFolder: null}),
      profile({id: "4", suggestedFolder: "nonsense-from-a-future-version"}),
    ]);

    expect(groups.map((group) => group.folder)).toEqual(["financial", "contracts", "other"]);
    // both the unclassified and the unknown folder stay visible, in `other`
    expect(groups.at(-1)?.documents.map((document) => document.id)).toEqual(["3", "4"]);
  });

  it("leaves out folders with nothing in them", () => {
    expect(groupByFolder([]).length).toBe(0);
  });
});

describe("stage timeline", () => {
  const stage = (name: string, status: PipelineStage["status"], at: string): PipelineStage => ({stage: name, status, at});

  it("keeps one line per stage, with the latest state, in pipeline order", () => {
    const collapsed = collapseStages([
      stage("parse", "started", "2026-08-19T10:00:02Z"),
      stage("download", "succeeded", "2026-08-19T10:00:00Z"),
      stage("parse", "failed", "2026-08-19T10:00:03Z"),
      stage("parse", "succeeded", "2026-08-19T10:00:09Z"),
      stage("gate", "succeeded", "2026-08-19T10:00:01Z"),
    ]);

    expect(collapsed.map((entry) => entry.stage)).toEqual(["download", "gate", "parse"]);
    // a retried stage shows its latest state, and does not jump to the end of the list
    expect(collapsed.at(-1)).toMatchObject({stage: "parse", status: "succeeded"});
  });

  it("still shows a stage the UI does not know about yet", () => {
    const collapsed = collapseStages([stage("gate", "succeeded", "1"), stage("future_stage", "started", "2")]);
    expect(collapsed.map((entry) => entry.stage)).toEqual(["gate", "future_stage"]);
  });
});

describe("progress", () => {
  const run = (status: PipelineRun["status"]): PipelineRun => ({
    id: "r", runNo: 1, trigger: "upload", status, pipelineVersion: "f1", stages: [], usage: {},
    error: null, startedAt: null, completedAt: null, createdAt: "2026-08-19T10:00:00Z",
  });
  const job = (status: PipelineJob["status"]): PipelineJob => ({
    id: "j", sourceDocumentId: "d", status, attempts: 1, maxAttempts: 3, updatedAt: "2026-08-19T10:00:00Z",
  });

  it("never reports complete while a job is still open", () => {
    expect(runProgress(run("running"), [job("succeeded"), job("queued")])).toBeLessThan(1);
    expect(runProgress(run("running"), [job("succeeded"), job("succeeded")])).toBeLessThanOrEqual(0.99);
    expect(runProgress(run("succeeded"), [])).toBe(1);
    expect(runProgress(null, [])).toBe(0);
  });

  it("counts a failed job as finished, so a partial run stops moving", () => {
    expect(runProgress(run("running"), [job("failed"), job("succeeded")])).toBeGreaterThan(0.5);
  });
});
