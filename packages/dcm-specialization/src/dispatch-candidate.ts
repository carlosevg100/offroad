import {createHash} from "node:crypto";

import {
  evaluateObjectivePlanReadiness,
  objectiveExecutionContextSchema,
  objectivePlanReadinessSchema,
  taskExecutionCapabilitySchema,
  type CompiledTaskGraph,
  type ObjectiveExecutionContext,
  type ObjectivePlanReadiness,
  type TaskExecutionCapability,
} from "@offroad/work-plan";
import {z} from "zod";

import {objectiveMethodBindingSchema, type ObjectiveMethodBinding} from "./method-binding";
import {workflowRecipeSelectionSchema, type WorkflowRecipeSelection} from "./workflow-selection";

export const candidateExecutorRegistrationSchema = z.object({
  taskId: z.string().regex(/^[A-Z][0-9]{2}$/),
  executorKey: z.string().min(1),
  executorVersion: z.string().min(1),
  procedure: z.object({id: z.string().min(1), version: z.string().min(1)}).strict(),
  resultContract: z.string().min(1),
}).strict();
export type CandidateExecutorRegistration = z.infer<typeof candidateExecutorRegistrationSchema>;

const dispatchReasonSchema = z.object({
  code: z.enum([
    "readiness_binding_mismatch",
    "workflow_not_selected",
    "workflow_task_absent_from_objective",
    "workflow_batch_partition_mismatch",
    "preflight_task_absent",
    "preflight_task_blocked",
    "method_binding_absent",
    "method_binding_conflicted",
    "capability_absent",
    "capability_duplicate",
    "capability_not_live",
    "capability_identity_mismatch",
    "executor_absent",
    "executor_duplicate",
    "executor_identity_mismatch",
  ]),
  taskId: z.string().regex(/^[A-Z][0-9]{2}$/).nullable(),
  detail: z.string().min(1).nullable(),
}).strict();
export type UniversalDispatchReason = z.infer<typeof dispatchReasonSchema>;

const dispatchTaskSchema = z.object({
  taskId: z.string().regex(/^[A-Z][0-9]{2}$/),
  executorKey: z.string().min(1),
  executorVersion: z.string().min(1),
  procedure: z.object({id: z.string().min(1), version: z.string().min(1)}).strict(),
  resultContract: z.string().min(1),
}).strict();

export const universalDispatchCandidateSchema = z.object({
  schemaVersion: z.literal("universal-dispatch-candidate.v1"),
  mode: z.literal("internal_shadow"),
  status: z.enum(["candidate", "blocked"]),
  objectiveStructuralIdentity: z.string().regex(/^[a-f0-9]{64}$/),
  readinessFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  specializationFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  methodBindingFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  workflowSelectionFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  capabilityManifestHash: z.string().regex(/^[a-f0-9]{64}$/),
  executionContextHash: z.string().regex(/^[a-f0-9]{64}$/),
  executorRegistryHash: z.string().regex(/^[a-f0-9]{64}$/),
  recipeId: z.string().min(1).nullable(),
  recipeVersion: z.string().min(1).nullable(),
  sliceFingerprint: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  tasks: z.array(dispatchTaskSchema),
  parallelBatches: z.array(z.array(z.string().regex(/^[A-Z][0-9]{2}$/)).min(1)),
  reasons: z.array(dispatchReasonSchema),
  willExecute: z.literal(false),
  externalEffectAllowed: z.literal(false),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
}).superRefine((value, context) => {
  const candidate = value.status === "candidate";
  if (candidate !== (value.tasks.length > 0 && value.parallelBatches.length > 0 && value.reasons.length === 0)) {
    context.addIssue({code: "custom", path: ["status"], message: "candidate status requires a complete task graph and no reasons"});
  }
  if (!candidate && (value.tasks.length > 0 || value.parallelBatches.length > 0 || value.reasons.length === 0)) {
    context.addIssue({code: "custom", path: ["tasks"], message: "blocked candidates carry no executable task slice and at least one reason"});
  }
});
export type UniversalDispatchCandidate = z.infer<typeof universalDispatchCandidateSchema>;

/**
 * Compiles an all-or-nothing dispatch candidate from the same immutable artifacts persisted by
 * objective preflight. It deliberately does not invoke an executor. A selected recipe becomes a
 * candidate only when every TaskSpec has an executable preflight decision and exact, unique
 * method, capability and bundled-executor identities. Any mismatch empties the slice.
 */
export function compileUniversalDispatchCandidate(input: {
  objectiveStructuralIdentity: string;
  graph: CompiledTaskGraph;
  readiness: ObjectivePlanReadiness;
  executionContext: ObjectiveExecutionContext;
  methodBinding: ObjectiveMethodBinding;
  workflowSelection: WorkflowRecipeSelection;
  capabilities: readonly TaskExecutionCapability[];
  executors: readonly CandidateExecutorRegistration[];
}): UniversalDispatchCandidate {
  const objectiveStructuralIdentity = z.string().regex(/^[a-f0-9]{64}$/).parse(input.objectiveStructuralIdentity);
  const readiness = objectivePlanReadinessSchema.parse(input.readiness);
  const executionContext = objectiveExecutionContextSchema.parse(input.executionContext);
  const methodBinding = objectiveMethodBindingSchema.parse(input.methodBinding);
  const selection = workflowRecipeSelectionSchema.parse(input.workflowSelection);
  const capabilities = z.array(taskExecutionCapabilitySchema).parse(input.capabilities)
    .sort((left, right) => `${left.taskId}:${left.executorKey}:${left.executorVersion}`
      .localeCompare(`${right.taskId}:${right.executorKey}:${right.executorVersion}`));
  const executors = z.array(candidateExecutorRegistrationSchema).parse(input.executors)
    .sort((left, right) => `${left.taskId}:${left.executorKey}:${left.executorVersion}`
      .localeCompare(`${right.taskId}:${right.executorKey}:${right.executorVersion}`));
  const reasons: UniversalDispatchReason[] = [];

  const duplicateCapabilityTaskIds = duplicateTaskIds(capabilities);
  if (duplicateCapabilityTaskIds.length > 0) {
    reasons.push(reason("readiness_binding_mismatch", null, `duplicate capabilities: ${duplicateCapabilityTaskIds.join(",")}`));
  } else {
    const recomputedReadiness = evaluateObjectivePlanReadiness({
      graph: input.graph,
      capabilities,
      context: executionContext,
    });
    if (recomputedReadiness.readinessFingerprint !== readiness.readinessFingerprint
      || stableJson(recomputedReadiness) !== stableJson(readiness)) {
      reasons.push(reason("readiness_binding_mismatch", null, "persisted readiness differs from exact policy recomputation"));
    }
  }

  if (selection.status !== "selected") {
    reasons.push(reason("workflow_not_selected", null, selection.reason));
  }

  const graphTaskById = new Map(input.graph.tasks.map((task) => [task.id, task]));
  const readinessByTaskId = new Map(readiness.tasks.map((task) => [task.taskId, task]));
  const bindingByTaskId = new Map(methodBinding.bindings.map((binding) => [binding.taskId, binding]));
  const capabilitiesByTaskId = groupByTask(capabilities);
  const executorsByTaskId = groupByTask(executors);
  const selectedTaskIds = selection.status === "selected" ? selection.taskIds : [];

  const batchedTaskIds = selection.parallelBatches.flat();
  if (selection.status === "selected" && (
    new Set(batchedTaskIds).size !== batchedTaskIds.length
    || stableList(batchedTaskIds).join(",") !== stableList(selectedTaskIds).join(",")
  )) reasons.push(reason("workflow_batch_partition_mismatch"));

  for (const taskId of selectedTaskIds) {
    const task = graphTaskById.get(taskId);
    if (!task) {
      reasons.push(reason("workflow_task_absent_from_objective", taskId));
      continue;
    }
    const taskReadiness = readinessByTaskId.get(taskId);
    if (!taskReadiness) reasons.push(reason("preflight_task_absent", taskId));
    else if (!taskReadiness.executable) reasons.push(reason("preflight_task_blocked", taskId, taskReadiness.reasons.map((item) => item.code).join(",") || "blocked"));

    const binding = bindingByTaskId.get(taskId);
    if (!binding) {
      reasons.push(reason(methodBinding.conflicts.some((conflict) => conflict.taskId === taskId)
        ? "method_binding_conflicted"
        : "method_binding_absent", taskId));
      continue;
    }
    if (!task.procedure || task.procedure.id !== binding.procedure.id || task.procedure.version !== binding.procedure.version) {
      reasons.push(reason("method_binding_absent", taskId, "objective graph does not carry the selected procedure"));
    }

    const taskCapabilities = capabilitiesByTaskId.get(taskId) ?? [];
    if (taskCapabilities.length === 0) reasons.push(reason("capability_absent", taskId));
    else if (taskCapabilities.length > 1) reasons.push(reason("capability_duplicate", taskId));
    else {
      if (taskCapabilities[0]!.availability !== "live") reasons.push(reason("capability_not_live", taskId, taskCapabilities[0]!.availability));
      if (!capabilityMatches(taskCapabilities[0]!, binding)
        || (taskReadiness !== undefined && taskReadiness.executorKey !== null
          && taskReadiness.executorKey !== taskCapabilities[0]!.executorKey)) {
        reasons.push(reason("capability_identity_mismatch", taskId));
      }
    }

    const taskExecutors = executorsByTaskId.get(taskId) ?? [];
    if (taskExecutors.length === 0) reasons.push(reason("executor_absent", taskId));
    else if (taskExecutors.length > 1) reasons.push(reason("executor_duplicate", taskId));
    else if (!executorMatches(taskExecutors[0]!, binding, taskCapabilities[0])) reasons.push(reason("executor_identity_mismatch", taskId));
  }

  const stableReasons = [...new Map(reasons
    .sort((left, right) => `${left.code}:${left.taskId ?? ""}:${left.detail ?? ""}`.localeCompare(`${right.code}:${right.taskId ?? ""}:${right.detail ?? ""}`))
    .map((item) => [`${item.code}:${item.taskId ?? ""}:${item.detail ?? ""}`, item])).values()];
  const candidate = selection.status === "selected" && stableReasons.length === 0;
  const tasks = candidate ? selectedTaskIds.map((taskId) => {
    const binding = bindingByTaskId.get(taskId)!;
    const capability = capabilitiesByTaskId.get(taskId)![0]!;
    return dispatchTaskSchema.parse({
      taskId,
      executorKey: capability.executorKey,
      executorVersion: capability.executorVersion,
      procedure: binding.procedure,
      resultContract: binding.resultContract,
    });
  }) : [];
  const payload = {
    schemaVersion: "universal-dispatch-candidate.v1" as const,
    mode: "internal_shadow" as const,
    status: candidate ? "candidate" as const : "blocked" as const,
    objectiveStructuralIdentity,
    readinessFingerprint: readiness.readinessFingerprint,
    specializationFingerprint: methodBinding.specializationFingerprint,
    methodBindingFingerprint: methodBinding.fingerprint,
    workflowSelectionFingerprint: selection.fingerprint,
    capabilityManifestHash: fingerprint(capabilities),
    executionContextHash: fingerprint(executionContext),
    executorRegistryHash: fingerprint(executors),
    recipeId: selection.recipeId,
    recipeVersion: selection.recipeVersion,
    sliceFingerprint: selection.sliceFingerprint,
    tasks,
    parallelBatches: candidate ? selection.parallelBatches : [],
    reasons: candidate ? [] : stableReasons,
    willExecute: false as const,
    externalEffectAllowed: false as const,
  };
  return universalDispatchCandidateSchema.parse({...payload, fingerprint: fingerprint(payload)});
}

function capabilityMatches(capability: TaskExecutionCapability, binding: ObjectiveMethodBinding["bindings"][number]): boolean {
  return capability.executorKey === `${binding.executor.module}#${binding.executor.exportName}`
    && capability.executorVersion === binding.procedure.version
    && capability.procedure.id === binding.procedure.id
    && capability.procedure.version === binding.procedure.version;
}

function executorMatches(
  executor: CandidateExecutorRegistration,
  binding: ObjectiveMethodBinding["bindings"][number],
  capability?: TaskExecutionCapability,
): boolean {
  return capability !== undefined
    && executor.executorKey === capability.executorKey
    && executor.executorVersion === capability.executorVersion
    && executor.procedure.id === binding.procedure.id
    && executor.procedure.version === binding.procedure.version
    && executor.resultContract === binding.resultContract;
}

function groupByTask<T extends {taskId: string}>(items: readonly T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) grouped.set(item.taskId, [...(grouped.get(item.taskId) ?? []), item]);
  return grouped;
}

function duplicateTaskIds<T extends {taskId: string}>(items: readonly T[]): string[] {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item.taskId, (counts.get(item.taskId) ?? 0) + 1);
  return [...counts.entries()].filter(([, count]) => count > 1).map(([taskId]) => taskId).sort();
}

function reason(code: UniversalDispatchReason["code"], taskId: string | null = null, detail: string | null = null): UniversalDispatchReason {
  return {code, taskId, detail};
}

function stableList(items: readonly string[]): string[] {
  return [...items].sort();
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
