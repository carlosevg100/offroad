import {resolve} from "node:path";
import {fileURLToPath} from "node:url";

import {describe, expect, it} from "vitest";

import {loadMethodLibrary} from "./procedure-markdown";
import {compileWorkflowSlice, refinanceLiabilityManagementWorkflow, workflowRecipeFingerprint, workflowRecipeSchema} from "./workflow-recipe";

const here = resolve(fileURLToPath(new URL(".", import.meta.url)));

describe("canonical workflow recipes", () => {
  it("expands from each outcome to the minimum dependency-closed graph", () => {
    const diagnostic = compileWorkflowSlice(refinanceLiabilityManagementWorkflow, "diagnostic");
    const alternatives = compileWorkflowSlice(refinanceLiabilityManagementWorkflow, "alternatives");
    const material = compileWorkflowSlice(refinanceLiabilityManagementWorkflow, "material");

    expect(diagnostic.steps.map((step) => step.taskId)).toEqual(["C05", "D07", "C09", "C10", "C07"]);
    expect(alternatives.steps.map((step) => step.taskId)).toEqual(["C05", "D07", "C09", "C10", "C07", "S07", "C08", "S10"]);
    expect(material.steps.map((step) => step.taskId)).toEqual(refinanceLiabilityManagementWorkflow.steps.map((step) => step.taskId));
    expect(material.steps.slice(0, alternatives.steps.length)).toEqual(alternatives.steps);
    expect(material.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(workflowRecipeFingerprint(refinanceLiabilityManagementWorkflow)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("keeps every workflow method aligned to the human-reviewable procedure source", () => {
    const library = loadMethodLibrary(resolve(here, "../knowledge/procedures"), resolve(here, "../knowledge/reviews"));
    const methods = new Map(library.methods.map((method) => [method.procedure.id, method]));
    for (const step of refinanceLiabilityManagementWorkflow.steps) {
      const method = methods.get(step.methodId);
      expect(method, step.methodId).toBeDefined();
      expect(step.methodVersion).toBe(method!.procedure.version);
      expect(method!.procedure.implementation?.resultContract).toBeTruthy();
    }
  });

  it("fails closed for an unsupported requested outcome", () => {
    expect(() => compileWorkflowSlice(refinanceLiabilityManagementWorkflow, "investor_matching")).toThrow(/does not support outcome/);
  });

  it("fails closed for duplicate tasks, dependencies and outcome targets", () => {
    const duplicateTask = structuredClone(refinanceLiabilityManagementWorkflow);
    duplicateTask.steps.push(structuredClone(duplicateTask.steps[0]!));
    expect(workflowRecipeSchema.safeParse(duplicateTask).success).toBe(false);

    const duplicateDependency = structuredClone(refinanceLiabilityManagementWorkflow);
    duplicateDependency.steps[2]!.dependencies.push("C05");
    expect(workflowRecipeSchema.safeParse(duplicateDependency).success).toBe(false);

    const duplicateTarget = structuredClone(refinanceLiabilityManagementWorkflow);
    duplicateTarget.supportedOutcomes.diagnostic!.push("C09");
    expect(workflowRecipeSchema.safeParse(duplicateTarget).success).toBe(false);
  });

  it("fails closed for unknown, self, forward and cyclic dependencies", () => {
    const unknown = structuredClone(refinanceLiabilityManagementWorkflow);
    unknown.steps[2]!.dependencies = ["Z99"];
    expect(workflowRecipeSchema.safeParse(unknown).success).toBe(false);

    const self = structuredClone(refinanceLiabilityManagementWorkflow);
    self.steps[0]!.dependencies = ["C05"];
    expect(workflowRecipeSchema.safeParse(self).success).toBe(false);

    const forward = structuredClone(refinanceLiabilityManagementWorkflow);
    forward.steps[0]!.dependencies = ["D07"];
    expect(workflowRecipeSchema.safeParse(forward).success).toBe(false);

    const cyclic = structuredClone(refinanceLiabilityManagementWorkflow);
    cyclic.steps[0]!.dependencies = ["A02"];
    expect(workflowRecipeSchema.safeParse(cyclic).success).toBe(false);
  });

  it("fails closed for unknown targets and orphan tasks", () => {
    const unknownTarget = structuredClone(refinanceLiabilityManagementWorkflow);
    unknownTarget.supportedOutcomes.diagnostic = ["Z99"];
    expect(workflowRecipeSchema.safeParse(unknownTarget).success).toBe(false);

    const orphan = structuredClone(refinanceLiabilityManagementWorkflow);
    for (const outcome of Object.keys(orphan.supportedOutcomes)) orphan.supportedOutcomes[outcome] = ["C05"];
    expect(workflowRecipeSchema.safeParse(orphan).success).toBe(false);
  });
});
