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

/**
 * The rung each Case 01 method reached, projected from the Markdown library that owns it and pinned
 * by `workflow.test.ts`. The preview declares it on every artifact it writes: a method in production
 * is not labelled `implemented`, and one whose model-assisted step has no recorded evidence is not
 * labelled production. Seven methods carry the founder approval of 10 September 2026; the three that
 * declare model calls stop at `ready_for_founder`.
 */
export const case01MethodMaturity: Readonly<Record<string, "implemented" | "ready_for_founder" | "production">> = {
  "build-debt-ledger": "production",
  "reconcile-financial-statements": "production",
  "reconcile-covenant-definitions": "production",
  "diagnose-maturity-wall": "production",
  "build-interest-and-indexation-schedule": "production",
  "estimate-exit-cost-by-series": "production",
  "compare-refinancing-before-after": "production",
  "declare-scenarios": "ready_for_founder",
  "plan-meeting-brief": "ready_for_founder",
  "write-meeting-synthesis": "ready_for_founder",
};

/** What the preview may say about a step's method, by the rung that method actually reached. */
export function case01PreviewDisclaimer(methodId: string): string {
  const maturity = case01MethodMaturity[methodId] ?? "implemented";
  if (maturity === "production") return "Validação interna sobre a evidência congelada do caso. O método está em produção, com revisão independente e execuções gravadas; o resultado é um cálculo sob as premissas declaradas, nunca liberação, parecer ou aprovação.";
  if (maturity === "ready_for_founder") return "Validação interna sobre a evidência congelada do caso. O método tem revisão independente e execuções gravadas da sua parte determinística; a etapa assistida por modelo não tem evidência gravada. Nada aqui é liberação, parecer ou aprovação.";
  return "Validação interna. Método em estágio implemented, sem revisão independente aprovada; nada aqui é liberação, parecer ou aprovação.";
}

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
