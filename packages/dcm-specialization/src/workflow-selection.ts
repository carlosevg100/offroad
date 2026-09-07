import {createHash} from "node:crypto";

import {
  compileWorkflowSlice,
  refinanceLiabilityManagementWorkflow,
  workflowRecipeFingerprint,
} from "@offroad/credit-playbook";
import type {ObjectiveOutputTerminal} from "@offroad/work-plan";
import {z} from "zod";

import type {ObjectiveSpecialization} from "./index";

const recipeOutcomeSchema = z.enum(["diagnostic", "scenario_analysis", "alternatives", "meeting_plan", "material"]);
export type RecipeOutcome = z.infer<typeof recipeOutcomeSchema>;

const selectionReasonSchema = z.enum([
  "selected",
  "economic_situation_not_implemented",
  "combined_economic_situations_not_implemented",
  "requested_output_not_implemented",
]);

export const workflowRecipeSelectionSchema = z.object({
  schemaVersion: z.literal("workflow-recipe-selection.v1"),
  status: z.enum(["selected", "blocked"]),
  reason: selectionReasonSchema,
  recipeId: z.string().nullable(),
  recipeVersion: z.string().nullable(),
  recipeFingerprint: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  sliceFingerprint: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  outcome: recipeOutcomeSchema.nullable(),
  taskIds: z.array(z.string().regex(/^[A-Z][0-9]{2}$/)),
  parallelBatches: z.array(z.array(z.string().regex(/^[A-Z][0-9]{2}$/)).min(1)),
  activatedEconomicPacks: z.array(z.string().min(3)),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
}).superRefine((selection, context) => {
  const selected = selection.status === "selected";
  for (const [key, value] of Object.entries({
    recipeId: selection.recipeId,
    recipeVersion: selection.recipeVersion,
    recipeFingerprint: selection.recipeFingerprint,
    sliceFingerprint: selection.sliceFingerprint,
    outcome: selection.outcome,
  })) {
    if (selected !== (value !== null)) context.addIssue({code: "custom", path: [key], message: `${key} must be present only for a selected recipe`});
  }
  if (selected !== (selection.taskIds.length > 0 && selection.parallelBatches.length > 0)) {
    context.addIssue({code: "custom", path: ["taskIds"], message: "selected recipes require a non-empty compiled graph; blocked selections require none"});
  }
  if (selected !== (selection.reason === "selected")) {
    context.addIssue({code: "custom", path: ["reason"], message: "selection status and reason disagree"});
  }
});
export type WorkflowRecipeSelection = z.infer<typeof workflowRecipeSelectionSchema>;

const economicPackPrefix = "objective.";
const refinancePackId = "objective.refinance-liability-management";

const outcomeByTerminal: Partial<Record<ObjectiveOutputTerminal, RecipeOutcome>> = {
  meeting_brief: "meeting_plan",
  board_decision_pack: "material",
  capital_alternative_map: "alternatives",
  reviewable_material: "material",
};

const stableJson = (value: unknown): string => JSON.stringify(value, (_key, nested: unknown) => (
  nested && typeof nested === "object" && !Array.isArray(nested)
    ? Object.fromEntries(Object.entries(nested as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)))
    : nested
));

function finalize(selection: Omit<WorkflowRecipeSelection, "fingerprint">): WorkflowRecipeSelection {
  return workflowRecipeSelectionSchema.parse({
    ...selection,
    fingerprint: createHash("sha256").update(stableJson(selection)).digest("hex"),
  });
}

/**
 * Selects an implemented economic workflow from governed specialization, never from persona or
 * seniority. Unsupported and combined needs stay explicit instead of falling into a generic DAG.
 */
export function selectWorkflowRecipeForObjective(input: {
  specialization: ObjectiveSpecialization;
  outputTerminal: ObjectiveOutputTerminal;
}): WorkflowRecipeSelection {
  const specialization = z.object({selectedPackIds: z.array(z.string().min(3)).min(1)}).passthrough().parse(input.specialization);
  const activatedEconomicPacks = specialization.selectedPackIds
    .filter((packId) => packId.startsWith(economicPackPrefix))
    .sort();
  const blocked = (reason: Exclude<z.infer<typeof selectionReasonSchema>, "selected">) => finalize({
    schemaVersion: "workflow-recipe-selection.v1",
    status: "blocked",
    reason,
    recipeId: null,
    recipeVersion: null,
    recipeFingerprint: null,
    sliceFingerprint: null,
    outcome: null,
    taskIds: [],
    parallelBatches: [],
    activatedEconomicPacks,
  });

  if (!activatedEconomicPacks.includes(refinancePackId)) return blocked("economic_situation_not_implemented");
  if (activatedEconomicPacks.some((packId) => packId !== refinancePackId)) return blocked("combined_economic_situations_not_implemented");
  const outcome = outcomeByTerminal[input.outputTerminal];
  if (!outcome) return blocked("requested_output_not_implemented");

  const compiled = compileWorkflowSlice(refinanceLiabilityManagementWorkflow, outcome);
  return finalize({
    schemaVersion: "workflow-recipe-selection.v1",
    status: "selected",
    reason: "selected",
    recipeId: compiled.recipeId,
    recipeVersion: compiled.recipeVersion,
    recipeFingerprint: workflowRecipeFingerprint(refinanceLiabilityManagementWorkflow),
    sliceFingerprint: compiled.fingerprint,
    outcome,
    taskIds: compiled.steps.map((step) => step.taskId),
    parallelBatches: compiled.parallelBatches,
    activatedEconomicPacks,
  });
}
