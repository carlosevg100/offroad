import {describe, expect, it} from "vitest";

import {offroadTaskRegistry} from "@offroad/work-plan";

import {loadMethodLibrary} from "../procedure-markdown";
import {case01PreviewSteps, compileIntegrationPreviewPlan, previewBatches, previewTargetTaskIds, previewWorkflowIdentity} from "./workflow";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

describe("integration_preview workflow of Case 01", () => {
  it("anchors every step to a TaskSpec of the registry and to a method of the library at the version the executor implements", () => {
    const registry = new Map(offroadTaskRegistry.map((task) => [task.id, task]));
    const library = loadMethodLibrary(resolve(here, "../../knowledge/procedures"), resolve(here, "../../knowledge/reviews"));
    for (const step of case01PreviewSteps) {
      expect(registry.has(step.taskId), step.taskId).toBe(true);
      const method = library.methods.find((candidate) => candidate.frontmatter.id === step.methodId);
      expect(method, step.methodId).toBeDefined();
      expect(method!.frontmatter.version).toBe(step.methodVersion);
      expect(method!.frontmatter.maturity).toBe("implemented");
    }
    expect(new Set(case01PreviewSteps.map((step) => step.taskId)).size).toBe(case01PreviewSteps.length);
  });
  it("orders the steps in dependency-closed batches and targets the analysis for a meeting and the brief for the material", () => {
    const batches = previewBatches();
    const batchOf = new Map(batches.flatMap((batch, index) => batch.map((taskId) => [taskId, index] as const)));
    for (const step of case01PreviewSteps) for (const dependency of step.dependencies) expect(batchOf.get(dependency)!).toBeLessThan(batchOf.get(step.taskId)!);
    expect(previewTargetTaskIds("prepare_material")).toEqual(["A01"]);
    expect(previewTargetTaskIds("prepare_meeting")).not.toContain("A01");
    expect(previewTargetTaskIds("prepare_meeting")).toHaveLength(8);
  });
  it("compiles a plan snapshot the activation accepts, with every task implemented and the workflow fingerprint stable", () => {
    const plan = compileIntegrationPreviewPlan({composition: "prepare_meeting", entryJob: "origination_thesis", locale: "pt-BR", registryVersion: "2026.09.01-v3"});
    expect(plan.schemaVersion).toBe("capital-project-plan.v1");
    expect(plan.job.id).toBe("origination_thesis");
    expect(plan.taskSpecs.every((task) => task.maturity === "implemented")).toBe(true);
    expect(plan.taskSpecs.map((task) => task.id)).toEqual(case01PreviewSteps.map((step) => step.taskId));
    for (const task of plan.taskSpecs) expect(plan.parallelBatches[task.batch]).toContain(task.id);
    const identity = previewWorkflowIdentity("prepare_meeting");
    expect(identity.id).toBe("case01.prepare_meeting");
    expect(identity.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(previewWorkflowIdentity("prepare_meeting").fingerprint).toBe(identity.fingerprint);
    expect(previewWorkflowIdentity("prepare_material").fingerprint).not.toBe(identity.fingerprint);
  });
  it("compiles one plan per turn: the same composition on a later turn is a different plan", () => {
    const base = {composition: "change_premise" as const, entryJob: "origination_thesis", locale: "pt-BR" as const, registryVersion: "2026.09.01-v3"};
    const first = compileIntegrationPreviewPlan({...base, turn: {messageId: "10000000-0000-4000-8000-000000000001"}});
    const second = compileIntegrationPreviewPlan({...base, turn: {messageId: "10000000-0000-4000-8000-000000000002"}});
    expect(first.turn).toEqual({messageId: "10000000-0000-4000-8000-000000000001"});
    expect(JSON.stringify(first)).not.toBe(JSON.stringify(second));
    expect(compileIntegrationPreviewPlan(base).turn).toBeUndefined();
  });
});
