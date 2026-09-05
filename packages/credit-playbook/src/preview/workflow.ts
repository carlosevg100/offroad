/**
 * The workflow of Case 01 in integration_preview: which TaskSpecs run, in which order, bound to
 * which method and executor. The composition of the turn decides what the run targets; the plan is
 * always the whole workflow so dependencies resolve and unchanged nodes replay by fingerprint.
 *
 * Every step points to a TaskSpec of the registry (the anchor the control plane knows), to a
 * method of the library (the procedure the executor implements) and to an artifact type. The
 * maturity is `implemented` for all of them: this is exactly what the preview mode exists to run.
 */
import {createHash} from "node:crypto";
import {z} from "zod";

export const previewCompositionSchema = z.enum(["prepare_meeting", "prepare_material", "change_premise", "deepen"]);
export type PreviewComposition = z.infer<typeof previewCompositionSchema>;

export const previewWorkflowVersion = "2026.09.05-v1";
export const previewCompilerVersion = `integration-preview-${previewWorkflowVersion}`;

export type PreviewWorkflowStep = {
  /** TaskSpec of the registry the step is anchored to. */
  taskId: string;
  /** Method of the library the step executes. */
  methodId: string;
  /** Version of the method the executor implements. */
  methodVersion: string;
  /** Key the worker uses to pick the executor. */
  executorKey: string;
  /** Artifact type recorded for the step's output. */
  artifactType: string;
  label: {pt: string; en: string};
  dependencies: readonly string[];
  executionClass: "deterministic" | "compilation";
  /** Stage the step belongs to in the conversation. */
  stage: "research" | "analysis" | "alternatives" | "material";
};

export const case01PreviewSteps: readonly PreviewWorkflowStep[] = [
  {taskId: "C05", methodId: "build-debt-ledger", methodVersion: "2026.09.05-v15", executorKey: "integration-preview.build-debt-ledger", artifactType: "preview_debt_ledger", label: {pt: "Mapear a dívida instrumento a instrumento", en: "Map the debt instrument by instrument"}, dependencies: [], executionClass: "deterministic", stage: "research"},
  {taskId: "D07", methodId: "reconcile-financial-statements", methodVersion: "2026.09.05-v9", executorKey: "integration-preview.reconcile-financial-statements", artifactType: "preview_financial_statements", label: {pt: "Conciliar demonstrações, notas e release", en: "Reconcile statements, notes and release"}, dependencies: [], executionClass: "deterministic", stage: "research"},
  {taskId: "C09", methodId: "reconcile-covenant-definitions", methodVersion: "2026.09.05-v14", executorKey: "integration-preview.reconcile-covenant-definitions", artifactType: "preview_covenants", label: {pt: "Ler os covenants pelas escrituras", en: "Read the covenants from the indentures"}, dependencies: ["C05", "D07"], executionClass: "deterministic", stage: "analysis"},
  {taskId: "C10", methodId: "diagnose-maturity-wall", methodVersion: "2026.09.05-v8", executorKey: "integration-preview.diagnose-maturity-wall", artifactType: "preview_maturity_wall", label: {pt: "Diagnosticar vencimentos e cobertura", en: "Diagnose maturities and coverage"}, dependencies: ["C05"], executionClass: "deterministic", stage: "analysis"},
  {taskId: "C07", methodId: "build-interest-and-indexation-schedule", methodVersion: "2026.09.05-v7", executorKey: "integration-preview.build-interest-and-indexation-schedule", artifactType: "preview_interest_schedule", label: {pt: "Projetar juros e correção por série", en: "Project interest and indexation by series"}, dependencies: ["C05"], executionClass: "deterministic", stage: "analysis"},
  {taskId: "S07", methodId: "estimate-exit-cost-by-series", methodVersion: "2026.09.05-v8", executorKey: "integration-preview.estimate-exit-cost-by-series", artifactType: "preview_exit_costs", label: {pt: "Estimar o custo de saída por série", en: "Estimate the exit cost by series"}, dependencies: ["C05", "C07"], executionClass: "deterministic", stage: "analysis"},
  {taskId: "C08", methodId: "declare-scenarios", methodVersion: "2026.09.05-v6", executorKey: "integration-preview.declare-scenarios", artifactType: "preview_scenarios", label: {pt: "Declarar cenários e estresses", en: "Declare scenarios and stresses"}, dependencies: ["C05", "C10"], executionClass: "deterministic", stage: "analysis"},
  {taskId: "S10", methodId: "compare-refinancing-before-after", methodVersion: "2026.09.05-v7", executorKey: "integration-preview.compare-refinancing-before-after", artifactType: "preview_alternatives", label: {pt: "Comparar as alternativas antes e depois", en: "Compare the alternatives before and after"}, dependencies: ["C05", "C09", "C10", "S07", "C08"], executionClass: "deterministic", stage: "alternatives"},
  {taskId: "A01", methodId: "plan-meeting-brief", methodVersion: "2026.09.05-v7", executorKey: "integration-preview.plan-meeting-brief", artifactType: "preview_meeting_brief", label: {pt: "Planejar a devolutiva e o material", en: "Plan the readout and the material"}, dependencies: ["C05", "D07", "C09", "C10", "C07", "S07", "C08", "S10"], executionClass: "compilation", stage: "material"},
] as const;

const canonical = (value: unknown): string => JSON.stringify(value, (_key, inner: unknown) => (inner && typeof inner === "object" && !Array.isArray(inner) ? Object.fromEntries(Object.entries(inner as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : inner));

/** The workflow identity the activation records: id, version and the fingerprint of its steps. */
export function previewWorkflowIdentity(composition: PreviewComposition): {id: string; version: string; fingerprint: string} {
  return {
    id: `case01.${composition}`,
    version: previewWorkflowVersion,
    fingerprint: createHash("sha256").update(canonical({composition, steps: case01PreviewSteps})).digest("hex"),
  };
}

/** Which steps a composition targets; the plan always holds every step so dependencies resolve. */
export function previewTargetTaskIds(composition: PreviewComposition): string[] {
  switch (composition) {
    case "prepare_material": return ["A01"];
    case "prepare_meeting":
    case "deepen":
    case "change_premise":
      return case01PreviewSteps.filter((step) => step.stage !== "material").map((step) => step.taskId);
  }
}

/** Steps in dependency order, batched: a step's batch is one past its deepest dependency. */
export function previewBatches(): string[][] {
  const batchOf = new Map<string, number>();
  for (const step of case01PreviewSteps) {
    const depth = step.dependencies.reduce((deepest, dependency) => Math.max(deepest, (batchOf.get(dependency) ?? -1) + 1), 0);
    batchOf.set(step.taskId, depth);
  }
  const batches: string[][] = [];
  for (const step of case01PreviewSteps) {
    const batch = batchOf.get(step.taskId)!;
    (batches[batch] ??= []).push(step.taskId);
  }
  return batches;
}

/**
 * The `capital-project-plan.v1` snapshot the activation persists as the preview plan. The entry
 * job stays the project's own; the targets and the first work product come from the composition.
 */
export function compileIntegrationPreviewPlan(input: {composition: PreviewComposition; entryJob: string; locale: "pt-BR" | "en-US"; registryVersion: string; turn?: {messageId: string}}) {
  const batches = previewBatches();
  const batchOf = new Map(batches.flatMap((batch, index) => batch.map((taskId) => [taskId, index] as const)));
  return {
    schemaVersion: "capital-project-plan.v1",
    compilerVersion: previewCompilerVersion,
    // One plan per turn: a plan that already holds task runs is never reactivated, and unchanged
    // steps replay their artifacts across plans by input fingerprint instead.
    ...(input.turn ? {turn: {messageId: input.turn.messageId}} : {}),
    registryVersion: input.registryVersion,
    job: {
      id: input.entryJob,
      targetTaskIds: previewTargetTaskIds(input.composition),
      firstWorkProduct: input.composition === "prepare_material" ? "preview_meeting_brief" : "preview_alternatives",
      confirmationGate: "preliminary_understanding",
      accessPolicy: "public_or_private",
      inputPolicy: {company: "required", documents: "optional", capitalIntent: "optional", existingTransaction: "not_applicable", publicResearch: "frozen_case_evidence"},
      mode: "integration_preview",
    },
    taskSpecs: case01PreviewSteps.map((step, ordinal) => ({
      id: step.taskId,
      label: step.label[input.locale === "en-US" ? "en" : "pt"],
      graph: "case",
      dependencies: [...step.dependencies],
      executionClass: step.executionClass,
      effect: "propose_state",
      maturity: "implemented",
      ordinal,
      batch: batchOf.get(step.taskId)!,
      procedure: {id: step.methodId, version: step.methodVersion},
    })),
    parallelBatches: batches,
  };
}

export function previewStepByTask(taskId: string): PreviewWorkflowStep {
  const step = case01PreviewSteps.find((candidate) => candidate.taskId === taskId);
  if (!step) throw new Error(`no preview step is anchored to TaskSpec ${taskId}`);
  return step;
}
