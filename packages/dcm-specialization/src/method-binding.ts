import {createHash} from "node:crypto";

import {dcmDepthPacks, type MethodDocument} from "@offroad/credit-playbook";
import {compileTaskGraph, offroadTaskRegistry, type CompiledTaskGraph, type OffroadTaskSpec} from "@offroad/work-plan";
import {z} from "zod";

import type {ObjectiveSpecialization} from "./index";

const knownDepthPackIds: ReadonlySet<string> = new Set(dcmDepthPacks.map((pack) => pack.id));
const knownTaskIds: ReadonlySet<string> = new Set(offroadTaskRegistry.map((task) => task.id));
const specialistTaskIdsByPack: Readonly<Record<string, readonly string[]>> = {
  "analysis.receivables-underwriting": ["R01"],
};

export const methodBindingCandidateSchema = z.object({
  procedure: z.object({
    id: z.string().min(1),
    version: z.string().min(1),
    maturity: z.enum(["draft", "candidate", "implemented", "ai_reviewed", "tested", "ready_for_founder", "production"]),
  }).strict(),
  taskIds: z.array(z.string().regex(/^[A-Z][0-9]{2}$/)).min(1),
  requiredPackIds: z.array(z.string().regex(/^[a-z0-9_.-]{3,120}$/)).min(1),
  bindingPriority: z.number().int().min(0).max(1_000),
  executor: z.object({module: z.string().min(1), exportName: z.string().min(1)}).strict(),
  resultContract: z.string().min(1),
  sourcePath: z.string().min(1),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type MethodBindingCandidate = z.infer<typeof methodBindingCandidateSchema>;

const taskProcedureBindingSchema = z.object({
  taskId: z.string().regex(/^[A-Z][0-9]{2}$/),
  procedure: z.object({id: z.string().min(1), version: z.string().min(1)}).strict(),
  maturity: z.enum(["draft", "candidate", "implemented", "ai_reviewed", "tested", "ready_for_founder", "production"]),
  requiredPackIds: z.array(z.string().regex(/^[a-z0-9_.-]{3,120}$/)).min(1),
  bindingPriority: z.number().int().min(0).max(1_000),
  executor: z.object({module: z.string().min(1), exportName: z.string().min(1)}).strict(),
  resultContract: z.string().min(1),
  sourcePath: z.string().min(1),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type TaskProcedureBinding = z.infer<typeof taskProcedureBindingSchema>;

const taskProcedureConflictSchema = z.object({
  taskId: z.string().regex(/^[A-Z][0-9]{2}$/),
  priority: z.number().int().min(0).max(1_000),
  candidates: z.array(z.object({
    procedureId: z.string().min(1),
    procedureVersion: z.string().min(1),
    sourcePath: z.string().min(1),
  }).strict()).min(2),
}).strict();

export const objectiveMethodBindingSchema = z.object({
  schemaVersion: z.literal("objective-method-binding.v1"),
  specializationFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  methodRegistryHash: z.string().regex(/^[a-f0-9]{64}$/),
  selectedPackIds: z.array(z.string().regex(/^[a-z0-9_.-]{3,120}$/)).min(1),
  baseTargetTaskIds: z.array(z.string().regex(/^[A-Z][0-9]{2}$/)),
  specialistTaskIds: z.array(z.string().regex(/^[A-Z][0-9]{2}$/)),
  effectiveTargetTaskIds: z.array(z.string().regex(/^[A-Z][0-9]{2}$/)),
  bindings: z.array(taskProcedureBindingSchema),
  unboundTaskIds: z.array(z.string().regex(/^[A-Z][0-9]{2}$/)),
  conflicts: z.array(taskProcedureConflictSchema),
  status: z.enum(["bound", "partial", "blocked", "conflicted"]),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
}).superRefine((value, context) => {
  for (const [field, items] of [
    ["selectedPackIds", value.selectedPackIds],
    ["baseTargetTaskIds", value.baseTargetTaskIds],
    ["specialistTaskIds", value.specialistTaskIds],
    ["effectiveTargetTaskIds", value.effectiveTargetTaskIds],
    ["unboundTaskIds", value.unboundTaskIds],
  ] as const) {
    if (new Set(items).size !== items.length) {
      context.addIssue({code: "custom", path: [field], message: `${field} must be unique`});
    }
  }
  const expectedEffective = [...new Set([...value.baseTargetTaskIds, ...value.specialistTaskIds])].sort();
  if (JSON.stringify(expectedEffective) !== JSON.stringify([...value.effectiveTargetTaskIds].sort())) {
    context.addIssue({code: "custom", path: ["effectiveTargetTaskIds"], message: "effective targets must equal base plus specialist targets"});
  }
  const taskIds = value.bindings.map((binding) => binding.taskId);
  if (new Set(taskIds).size !== taskIds.length) {
    context.addIssue({code: "custom", path: ["bindings"], message: "a task may have only one selected method"});
  }
  const partition = [...taskIds, ...value.unboundTaskIds].sort();
  if (new Set(partition).size !== partition.length) {
    context.addIssue({code: "custom", path: ["unboundTaskIds"], message: "bound and unbound tasks must be disjoint"});
  }
  const conflicted = new Set(value.conflicts.map((conflict) => conflict.taskId));
  if ([...conflicted].some((taskId) => !value.unboundTaskIds.includes(taskId))) {
    context.addIssue({code: "custom", path: ["conflicts"], message: "a conflicted task must remain unbound"});
  }
  if (value.status === "conflicted" && value.conflicts.length === 0) {
    context.addIssue({code: "custom", path: ["status"], message: "conflicted status requires a conflict"});
  }
  if (value.status !== "conflicted" && value.conflicts.length > 0) {
    context.addIssue({code: "custom", path: ["status"], message: "conflicts require conflicted status"});
  }
});
export type ObjectiveMethodBinding = z.infer<typeof objectiveMethodBindingSchema>;

export type BoundObjectiveMethods = {
  binding: ObjectiveMethodBinding;
  graph: CompiledTaskGraph;
};

/**
 * Binds only methods whose complete pack precondition is present in the objective specialization.
 * The method library remains the source of procedure/executor versions. No persona, prompt or
 * model response can add a binding. Equal-priority candidates fail closed and stay visible.
 */
export function bindObjectiveMethods(input: {
  graph: CompiledTaskGraph;
  specialization: ObjectiveSpecialization;
  methods: readonly MethodBindingCandidate[];
  methodRegistryHash: string;
}): BoundObjectiveMethods {
  const methodRegistryHash = z.string().regex(/^[a-f0-9]{64}$/).parse(input.methodRegistryHash);
  const methods = z.array(methodBindingCandidateSchema).parse(input.methods);
  const selectedPackIds = new Set(input.specialization.selectedPackIds);
  const specialistTaskIds = [...new Set([...selectedPackIds]
    .flatMap((packId) => specialistTaskIdsByPack[packId] ?? []))].sort();
  const baseTargetTaskIds = [...new Set(input.graph.targetTaskIds)].sort();
  const effectiveTargetTaskIds = [...new Set([...baseTargetTaskIds, ...specialistTaskIds])].sort();
  const workingGraph = compileTaskGraph(effectiveTargetTaskIds);
  const eligible = methods
    .filter((method) => method.requiredPackIds.every((packId) => selectedPackIds.has(packId)));

  auditMethodPackAndTaskReferences(methods);

  const bindings: TaskProcedureBinding[] = [];
  const conflicts: z.infer<typeof taskProcedureConflictSchema>[] = [];
  for (const task of workingGraph.tasks) {
    const candidates = eligible
      .filter((method) => method.taskIds.includes(task.id))
      .sort((left, right) =>
        right.bindingPriority - left.bindingPriority
        || left.procedure.id.localeCompare(right.procedure.id)
        || left.procedure.version.localeCompare(right.procedure.version),
      );
    if (candidates.length === 0) continue;
    const highestPriority = candidates[0]!.bindingPriority;
    const winners = candidates.filter((method) => method.bindingPriority === highestPriority);
    if (winners.length > 1) {
      conflicts.push({
        taskId: task.id,
        priority: highestPriority,
        candidates: winners.map((method) => ({
          procedureId: method.procedure.id,
          procedureVersion: method.procedure.version,
          sourcePath: method.sourcePath,
        })),
      });
      continue;
    }
    bindings.push(bindingFromMethod(task, winners[0]!));
  }

  bindings.sort((left, right) => left.taskId.localeCompare(right.taskId));
  conflicts.sort((left, right) => left.taskId.localeCompare(right.taskId));
  const boundTaskIds = new Set(bindings.map((binding) => binding.taskId));
  const unboundTaskIds = workingGraph.tasks.map((task) => task.id).filter((taskId) => !boundTaskIds.has(taskId)).sort();
  const status = conflicts.length > 0
    ? "conflicted"
    : bindings.length === 0
      ? "blocked"
      : unboundTaskIds.length > 0
        ? "partial"
        : "bound";
  const payload = {
    schemaVersion: "objective-method-binding.v1" as const,
    specializationFingerprint: input.specialization.fingerprint,
    methodRegistryHash,
    selectedPackIds: [...selectedPackIds].sort(),
    baseTargetTaskIds,
    specialistTaskIds,
    effectiveTargetTaskIds,
    bindings,
    unboundTaskIds,
    conflicts,
    status,
  };
  const binding = objectiveMethodBindingSchema.parse({...payload, fingerprint: fingerprint(payload)});
  const bindingByTask = new Map(bindings.map((candidate) => [candidate.taskId, candidate]));
  return {
    binding,
    graph: {
      ...workingGraph,
      tasks: workingGraph.tasks.map((task) => {
        const candidate = bindingByTask.get(task.id);
        return candidate ? {...task, procedure: candidate.procedure} : withoutProcedure(task);
      }),
    },
  };
}

function auditMethodPackAndTaskReferences(methods: readonly MethodBindingCandidate[]): void {
  for (const method of methods) {
    for (const packId of method.requiredPackIds) {
      if (!knownDepthPackIds.has(packId)) throw new Error(`${method.procedure.id} references unknown depth pack ${packId}`);
    }
    for (const taskId of method.taskIds) {
      if (!knownTaskIds.has(taskId)) throw new Error(`${method.procedure.id} references unknown task ${taskId}`);
    }
  }
}

function bindingFromMethod(task: OffroadTaskSpec, method: MethodBindingCandidate): TaskProcedureBinding {
  return taskProcedureBindingSchema.parse({
    taskId: task.id,
    procedure: {id: method.procedure.id, version: method.procedure.version},
    maturity: method.procedure.maturity,
    requiredPackIds: [...method.requiredPackIds].sort(),
    bindingPriority: method.bindingPriority,
    executor: method.executor,
    resultContract: method.resultContract,
    sourcePath: method.sourcePath,
    sourceHash: method.sourceHash,
  });
}

/** Build-time adapter used to prove that a bundled runtime manifest equals its Markdown source. */
export function methodBindingCandidateFromDocument(method: MethodDocument): MethodBindingCandidate | null {
  const implementation = method.procedure.implementation;
  if (!implementation || method.frontmatter.required_depth_pack_ids.length === 0 || method.frontmatter.task_specs.length === 0) return null;
  return methodBindingCandidateSchema.parse({
    procedure: {id: method.procedure.id, version: method.procedure.version, maturity: method.procedure.maturity},
    taskIds: [...method.frontmatter.task_specs].sort(),
    requiredPackIds: [...method.frontmatter.required_depth_pack_ids].sort(),
    bindingPriority: method.frontmatter.binding_priority,
    executor: implementation.executor,
    resultContract: implementation.resultContract,
    sourcePath: method.sourcePath,
    sourceHash: method.sourceHash,
  });
}

function withoutProcedure(task: OffroadTaskSpec): OffroadTaskSpec {
  const {procedure: _procedure, ...unbound} = task;
  return unbound;
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
