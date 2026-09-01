import {describe, expect, it} from "vitest";

import {
  capitalProjectJob,
  capitalProjectJobs,
  capitalProjectJobSchema,
  capitalProjectPlanCompilerVersion,
  capitalProjectPlanSchemaVersion,
  capitalProjectPlanSnapshot,
  compileCapitalProjectJob,
  offroadTaskRegistryVersion,
} from "./capital-jobs";

describe("capital job compiler", () => {
  it("defines exactly the six approved jobs", () => {
    expect(capitalProjectJobs.map((job) => job.id)).toEqual(capitalProjectJobSchema.options);
    expect(capitalProjectJob("structure_from_documents")).toMatchObject({
      accessPolicy: "private_required",
      firstWorkProduct: "diagnostic_recommendation",
      requiresExistingProject: false,
      inputPolicy: {documents: "required", company: "inferable"},
    });
    expect(capitalProjectJob("prepare_materials_and_process")).toMatchObject({
      accessPolicy: "existing_project",
      firstWorkProduct: "production_plan",
      requiresExistingProject: true,
    });
  });

  it("allows public starts only where a thesis can be formed without private information", () => {
    expect(capitalProjectJob("company_debt_view").accessPolicy).toBe("public_or_private");
    expect(capitalProjectJob("origination_thesis").accessPolicy).toBe("public_or_private");
    expect(capitalProjectJob("capital_planning").accessPolicy).toBe("public_or_private");
    expect(capitalProjectJob("review_existing_operation").accessPolicy).toBe("private_required");
  });

  it.each(capitalProjectJobSchema.options)("compiles %s into a dependency-closed acyclic DAG", (jobId) => {
    const plan = compileCapitalProjectJob(jobId);
    const taskIds = new Set(plan.tasks.map((task) => task.id));
    const completed = new Set<string>();

    expect(plan.tasks.length).toBeGreaterThan(0);
    expect(plan.tasks.some((task) => task.effect === "external")).toBe(false);
    for (const batch of plan.parallelBatches) {
      expect(batch.length).toBeGreaterThan(0);
      for (const taskId of batch) {
        const task = plan.tasks.find((candidate) => candidate.id === taskId)!;
        expect(task.dependencies.every((dependency) => !taskIds.has(dependency) || completed.has(dependency))).toBe(true);
      }
      batch.forEach((taskId) => completed.add(taskId));
    }
    expect(completed).toEqual(taskIds);
  });

  it("keeps different starts materially different while converging on shared TaskSpecs", () => {
    const companyDebt = compileCapitalProjectJob("company_debt_view");
    const thesis = compileCapitalProjectJob("origination_thesis");
    const planning = compileCapitalProjectJob("capital_planning");
    const documents = compileCapitalProjectJob("structure_from_documents");
    const production = compileCapitalProjectJob("prepare_materials_and_process");

    expect(companyDebt.tasks.map((task) => task.id)).toEqual([
      "M01", "M02", "M03", "M04", "M05", "M06",
      "D01", "D02", "D03", "D04", "D05", "D06", "D07",
      "C01", "C02", "C03", "C04", "C05", "C06", "C07", "C08", "C09", "C10", "C11",
    ]);
    expect(companyDebt.tasks.find((task) => task.id === "C11")?.dependencies).toEqual(["C09", "C10"]);
    expect(companyDebt.tasks.some((task) => task.id.startsWith("S"))).toBe(false);
    expect(thesis.tasks.map((task) => task.id)).toEqual(expect.arrayContaining(["M07", "C02", "K04"]));
    expect(thesis.job.targetTaskIds).toEqual(["M07", "C02", "K04"]);
    expect(thesis.tasks.find((task) => task.id === "M07")?.dependencies).toEqual(["M06", "C02", "K04"]);
    expect(thesis.tasks.some((task) => task.id === "S11")).toBe(false);
    expect(planning.tasks.some((task) => task.id === "S11")).toBe(true);
    expect(documents.job.inputPolicy.capitalIntent).toBe("inferable");
    expect(production.tasks.map((task) => task.id)).toEqual(expect.arrayContaining(["A11", "K09"]));
    expect(production.tasks.some((task) => task.id === "X04")).toBe(false);
  });

  it("exposes real parallel batches instead of a serial 80-task loop", () => {
    const plan = compileCapitalProjectJob("prepare_materials_and_process");
    expect(plan.parallelBatches.some((batch) => batch.length > 1)).toBe(true);
    expect(plan.executionClassCounts.action).toBe(0);
  });

  it.each(capitalProjectJobSchema.options)("emits a complete immutable snapshot for %s", (jobId) => {
    const snapshot = capitalProjectPlanSnapshot(jobId);
    const taskIds = snapshot.taskSpecs.map((task) => task.id);

    expect(snapshot).toMatchObject({
      schemaVersion: capitalProjectPlanSchemaVersion,
      compilerVersion: capitalProjectPlanCompilerVersion,
      registryVersion: offroadTaskRegistryVersion,
      job: {id: jobId},
    });
    expect(taskIds).toHaveLength(new Set(taskIds).size);
    expect(snapshot.taskSpecs.map((task) => task.ordinal)).toEqual(
      snapshot.taskSpecs.map((_, index) => index),
    );
    for (const task of snapshot.taskSpecs) {
      expect(snapshot.parallelBatches[task.batch]).toContain(task.id);
    }
    expect(snapshot.parallelBatches.flat()).toEqual(expect.arrayContaining(taskIds));
  });
});
