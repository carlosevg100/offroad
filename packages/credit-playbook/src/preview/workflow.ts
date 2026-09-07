/**
 * The workflow of Case 01 in integration_preview: which TaskSpecs run, in which order, bound to
 * which method and executor. The composition of the turn decides what the run targets; the plan is
 * always the whole workflow so dependencies resolve and unchanged nodes replay by fingerprint.
 *
 * Every step points to a TaskSpec of the registry (the anchor the control plane knows), to a
 * method of the library (the procedure the executor implements) and to an artifact type. The
 * maturity is `implemented` for all of them: this is exactly what the preview mode exists to run.
 */
import {z} from "zod";

import {compileWorkflowSlice, refinanceLiabilityManagementWorkflow, type WorkflowRecipeStep} from "../workflow-recipe";

export const previewCompositionSchema = z.enum(["prepare_meeting", "prepare_material", "change_premise", "deepen", "prepare_decision"]);
export type PreviewComposition = z.infer<typeof previewCompositionSchema>;

export const previewWorkflowVersion = refinanceLiabilityManagementWorkflow.version;
export const previewCompilerVersion = `integration-preview-${previewWorkflowVersion}`;

export type PreviewWorkflowStep = WorkflowRecipeStep;

/** Backward-compatible preview projection; the reusable recipe is the source of graph truth. */
export const case01PreviewSteps: readonly PreviewWorkflowStep[] = refinanceLiabilityManagementWorkflow.steps;

export type PreviewWorkflowOutcome = "meeting_plan" | "material";

export function previewOutcome(composition: PreviewComposition): PreviewWorkflowOutcome {
  return composition === "prepare_material" || composition === "prepare_decision" ? "material" : "meeting_plan";
}

export function previewStepsForComposition(composition: PreviewComposition): PreviewWorkflowStep[] {
  return compileWorkflowSlice(refinanceLiabilityManagementWorkflow, previewOutcome(composition)).steps;
}

/** The workflow identity the activation records: id, version and the fingerprint of its steps. */
export function previewWorkflowIdentity(composition: PreviewComposition): {id: string; version: string; fingerprint: string} {
  const outcome = previewOutcome(composition);
  const compiled = compileWorkflowSlice(refinanceLiabilityManagementWorkflow, outcome);
  return {
    id: `${refinanceLiabilityManagementWorkflow.id}.${outcome}`,
    version: refinanceLiabilityManagementWorkflow.version,
    fingerprint: compiled.fingerprint,
  };
}

/** The terminal task requested by each preview composition. Dependencies are compiled into its slice. */
export function previewTargetTaskIds(composition: PreviewComposition): string[] {
  return [...refinanceLiabilityManagementWorkflow.supportedOutcomes[previewOutcome(composition)]!];
}

/** Steps in dependency order, batched: a step's batch is one past its deepest dependency. */
export function previewBatches(composition: PreviewComposition): string[][] {
  return compileWorkflowSlice(refinanceLiabilityManagementWorkflow, previewOutcome(composition)).parallelBatches;
}

/**
 * The `capital-project-plan.v1` snapshot the activation persists as the preview plan. The entry
 * job stays the project's own; the target and the minimal dependency-closed slice come from the
 * composition.
 */
export function compileIntegrationPreviewPlan(input: {composition: PreviewComposition; entryJob: string; locale: "pt-BR" | "en-US"; registryVersion: string; turn?: {messageId: string}}) {
  const steps = previewStepsForComposition(input.composition);
  const batches = previewBatches(input.composition);
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
      firstWorkProduct: input.composition === "prepare_material" || input.composition === "prepare_decision" ? "preview_meeting_brief" : "preview_alternatives",
      confirmationGate: "preliminary_understanding",
      accessPolicy: "public_or_private",
      inputPolicy: {company: "required", documents: "optional", capitalIntent: "optional", existingTransaction: "not_applicable", publicResearch: "frozen_case_evidence"},
      mode: "integration_preview",
    },
    taskSpecs: steps.map((step, ordinal) => ({
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
