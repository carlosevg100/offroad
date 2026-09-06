import {createHash} from "node:crypto";

import {z} from "zod";

import type {CompiledTaskGraph} from "./capital-jobs";
import {offroadTaskEffectSchema, type OffroadTaskEffect} from "./task-registry";

export const taskCapabilityAvailabilitySchema = z.enum(["live", "shadow", "mocked", "specified", "absent"]);
export type TaskCapabilityAvailability = z.infer<typeof taskCapabilityAvailabilitySchema>;

export const taskCapabilityExposureSchema = z.enum(["universal", "allowlisted", "internal", "none"]);
export type TaskCapabilityExposure = z.infer<typeof taskCapabilityExposureSchema>;

export const taskExecutionUseSchema = z.enum([
  "internal_validation", "customer_work", "external_material", "external_action",
]);
export type TaskExecutionUse = z.infer<typeof taskExecutionUseSchema>;

export const taskExecutionAuthoritySchema = z.enum(["analysis_only", "project_write", "external_action"]);
export type TaskExecutionAuthority = z.infer<typeof taskExecutionAuthoritySchema>;

export const taskEvidenceRegimeSchema = z.enum(["public_only", "project_private", "mixed_governed"]);
export type TaskEvidenceRegime = z.infer<typeof taskEvidenceRegimeSchema>;

export const taskDataClassSchema = z.enum(["public", "project_confidential", "restricted_personal"]);
export type TaskDataClass = z.infer<typeof taskDataClassSchema>;

export const taskSourceClassSchema = z.enum([
  "project_context", "provided_documents", "public_company", "public_market", "house_method", "capital_network",
]);
export type TaskSourceClass = z.infer<typeof taskSourceClassSchema>;

export const taskExecutionResourceContractSchema = z.object({
  providerId: z.string().min(1).nullable(),
  toolIds: z.array(z.string().min(1)),
  sourceClasses: z.array(taskSourceClassSchema),
  dataClasses: z.array(taskDataClassSchema).min(1),
}).strict();
export type TaskExecutionResourceContract = z.infer<typeof taskExecutionResourceContractSchema>;

/**
 * A TaskSpec is an architectural description. This separate binding is the proof that a narrow,
 * versioned executor may perform it in a particular operating scope. Keeping the two separate
 * prevents an eighty-node catalogue from becoming eighty imaginary production capabilities.
 */
export const taskExecutionCapabilitySchema = z.object({
  taskId: z.string().regex(/^[A-Z][0-9]{2}$/),
  executorKey: z.string().min(1),
  executorVersion: z.string().min(1),
  procedure: z.object({id: z.string().min(1), version: z.string().min(1)}).strict(),
  availability: taskCapabilityAvailabilitySchema,
  exposure: taskCapabilityExposureSchema,
  allowedUses: z.array(taskExecutionUseSchema),
  allowedEvidenceRegimes: z.array(taskEvidenceRegimeSchema),
  allowedDataClasses: z.array(taskDataClassSchema),
  allowedSourceClasses: z.array(taskSourceClassSchema),
  allowedProviderIds: z.array(z.string().min(1)),
  allowedToolIds: z.array(z.string().min(1)),
  providerRequired: z.boolean(),
  maximumEffect: offroadTaskEffectSchema,
  allowlistedTenantIds: z.array(z.string().min(1)),
  allowlistedProjectIds: z.array(z.string().min(1)),
}).strict();
export type TaskExecutionCapability = z.infer<typeof taskExecutionCapabilitySchema>;

export const objectiveExecutionContextSchema = z.object({
  use: taskExecutionUseSchema,
  authority: taskExecutionAuthoritySchema,
  evidenceRegime: taskEvidenceRegimeSchema,
  tenantId: z.string().min(1).nullable(),
  projectId: z.string().min(1).nullable(),
  internalActor: z.boolean(),
  externalAuthorizationRef: z.string().min(1).nullable(),
  resourcesByTaskId: z.record(z.string(), taskExecutionResourceContractSchema),
  disabledTaskIds: z.array(z.string().min(1)),
  disabledExecutorKeys: z.array(z.string().min(1)),
  disabledProviderIds: z.array(z.string().min(1)),
  disabledToolIds: z.array(z.string().min(1)),
}).strict();
export type ObjectiveExecutionContext = z.infer<typeof objectiveExecutionContextSchema>;

export const taskReadinessReasonSchema = z.object({
  code: z.enum([
    "task_killed", "task_procedure_unbound", "executor_unbound", "capability_not_live",
    "capability_exposure_denied", "execution_use_not_allowed", "executor_killed",
    "procedure_binding_mismatch", "effect_exceeds_capability", "authority_insufficient",
    "exact_external_authority_missing", "evidence_regime_not_allowed", "task_resource_contract_missing",
    "provider_route_missing", "provider_not_homologated", "provider_killed", "tool_not_homologated",
    "tool_killed", "source_class_not_allowed", "data_class_not_allowed", "dependency_not_executable",
  ]),
  detail: z.string().min(1).nullable(),
}).strict();
export type TaskReadinessReason = z.infer<typeof taskReadinessReasonSchema>;

export const taskExecutionReadinessSchema = z.object({
  taskId: z.string().min(1),
  executable: z.boolean(),
  executorKey: z.string().min(1).nullable(),
  reasons: z.array(taskReadinessReasonSchema),
}).strict();
export type TaskExecutionReadiness = z.infer<typeof taskExecutionReadinessSchema>;

export const objectivePlanReadinessSchema = z.object({
  schemaVersion: z.literal("objective-plan-readiness.v1"),
  status: z.enum(["ready", "partial", "blocked"]),
  terminalReachable: z.boolean(),
  executableTaskIds: z.array(z.string().min(1)),
  blockedTaskIds: z.array(z.string().min(1)),
  tasks: z.array(taskExecutionReadinessSchema),
  readinessFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type ObjectivePlanReadiness = z.infer<typeof objectivePlanReadinessSchema>;

const effectRank: Record<OffroadTaskEffect, number> = {none: 0, propose_state: 1, commit: 2, external: 3};
const authorityRank: Record<TaskExecutionAuthority, number> = {analysis_only: 1, project_write: 2, external_action: 3};

/**
 * Evaluates the plan before substantive work begins. It is deliberately fail-closed: TaskSpec,
 * prompt quality or model availability cannot substitute for a live, exact capability binding.
 * Provider fallback is not implicit; a fallback is a new resource contract and must pass this
 * function again under the same authority and evidence regime.
 */
export function evaluateObjectivePlanReadiness(input: {
  graph: CompiledTaskGraph;
  capabilities: readonly TaskExecutionCapability[];
  context: ObjectiveExecutionContext;
}): ObjectivePlanReadiness {
  const context = objectiveExecutionContextSchema.parse(input.context);
  const capabilities = z.array(taskExecutionCapabilitySchema).parse(input.capabilities);
  const capabilityByTask = new Map<string, TaskExecutionCapability>();
  for (const capability of capabilities) {
    if (capabilityByTask.has(capability.taskId)) throw new Error(`duplicate execution capability for ${capability.taskId}`);
    capabilityByTask.set(capability.taskId, capability);
  }

  const direct = new Map<string, TaskExecutionReadiness>();
  for (const task of input.graph.tasks) {
    const capability = capabilityByTask.get(task.id) ?? null;
    const reasons: TaskReadinessReason[] = [];
    if (context.disabledTaskIds.includes(task.id)) reasons.push(reason("task_killed"));
    if (!task.procedure) reasons.push(reason("task_procedure_unbound"));
    if (!capability) reasons.push(reason("executor_unbound"));
    if (capability) {
      if (capability.availability !== "live") reasons.push(reason("capability_not_live", capability.availability));
      if (!exposureAllows(capability, context)) reasons.push(reason("capability_exposure_denied", capability.exposure));
      if (!capability.allowedUses.includes(context.use)) reasons.push(reason("execution_use_not_allowed", context.use));
      if (context.disabledExecutorKeys.includes(capability.executorKey)) reasons.push(reason("executor_killed", capability.executorKey));
      if (task.procedure && (task.procedure.id !== capability.procedure.id || task.procedure.version !== capability.procedure.version)) {
        reasons.push(reason("procedure_binding_mismatch", `${task.procedure.id}@${task.procedure.version}`));
      }
      if (effectRank[task.effect] > effectRank[capability.maximumEffect]) reasons.push(reason("effect_exceeds_capability", task.effect));
      if (effectRank[task.effect] > authorityRank[context.authority]) reasons.push(reason("authority_insufficient", context.authority));
      if (task.effect === "external" && context.externalAuthorizationRef === null) reasons.push(reason("exact_external_authority_missing"));
      if (!capability.allowedEvidenceRegimes.includes(context.evidenceRegime)) {
        reasons.push(reason("evidence_regime_not_allowed", context.evidenceRegime));
      }
      const resources = context.resourcesByTaskId[task.id];
      if (!resources) {
        reasons.push(reason("task_resource_contract_missing"));
      } else {
        evaluateResources(resources, capability, context, reasons);
      }
    }
    direct.set(task.id, taskExecutionReadinessSchema.parse({
      taskId: task.id,
      executable: reasons.length === 0,
      executorKey: capability?.executorKey ?? null,
      reasons: stableReasons(reasons),
    }));
  }

  for (const batch of input.graph.parallelBatches) {
    for (const taskId of batch) {
      const current = direct.get(taskId);
      const task = input.graph.tasks.find((candidate) => candidate.id === taskId);
      if (!current || !task || !current.executable) continue;
      const blockedDependencies = task.dependencies.filter((dependency) => {
        const dependencyState = direct.get(dependency);
        return dependencyState !== undefined && !dependencyState.executable;
      });
      if (blockedDependencies.length > 0) {
        direct.set(taskId, taskExecutionReadinessSchema.parse({
          ...current,
          executable: false,
          reasons: [reason("dependency_not_executable", blockedDependencies.sort().join(","))],
        }));
      }
    }
  }

  const tasks = input.graph.tasks.map((task) => direct.get(task.id)).filter((task): task is TaskExecutionReadiness => task !== undefined);
  const executableTaskIds = tasks.filter((task) => task.executable).map((task) => task.taskId);
  const blockedTaskIds = tasks.filter((task) => !task.executable).map((task) => task.taskId);
  const terminalReachable = input.graph.targetTaskIds.every((taskId) => direct.get(taskId)?.executable === true);
  const status = blockedTaskIds.length === 0 ? "ready" : executableTaskIds.length === 0 ? "blocked" : "partial";
  const payload = {
    schemaVersion: "objective-plan-readiness.v1" as const,
    status,
    terminalReachable,
    executableTaskIds,
    blockedTaskIds,
    tasks,
  };
  return objectivePlanReadinessSchema.parse({...payload, readinessFingerprint: fingerprint(payload)});
}

function evaluateResources(
  resources: TaskExecutionResourceContract,
  capability: TaskExecutionCapability,
  context: ObjectiveExecutionContext,
  reasons: TaskReadinessReason[],
): void {
  if (capability.providerRequired && resources.providerId === null) reasons.push(reason("provider_route_missing"));
  if (resources.providerId !== null) {
    if (!capability.allowedProviderIds.includes(resources.providerId)) reasons.push(reason("provider_not_homologated", resources.providerId));
    if (context.disabledProviderIds.includes(resources.providerId)) reasons.push(reason("provider_killed", resources.providerId));
  }
  for (const toolId of resources.toolIds) {
    if (!capability.allowedToolIds.includes(toolId)) reasons.push(reason("tool_not_homologated", toolId));
    if (context.disabledToolIds.includes(toolId)) reasons.push(reason("tool_killed", toolId));
  }
  for (const sourceClass of resources.sourceClasses) {
    if (!capability.allowedSourceClasses.includes(sourceClass)) reasons.push(reason("source_class_not_allowed", sourceClass));
  }
  for (const dataClass of resources.dataClasses) {
    if (!capability.allowedDataClasses.includes(dataClass)) reasons.push(reason("data_class_not_allowed", dataClass));
  }
}

function exposureAllows(capability: TaskExecutionCapability, context: ObjectiveExecutionContext): boolean {
  if (capability.exposure === "universal") return true;
  if (capability.exposure === "internal") return context.internalActor;
  if (capability.exposure === "none") return false;
  return (context.tenantId !== null && capability.allowlistedTenantIds.includes(context.tenantId))
    || (context.projectId !== null && capability.allowlistedProjectIds.includes(context.projectId));
}

function reason(code: TaskReadinessReason["code"], detail: string | null = null): TaskReadinessReason {
  return {code, detail};
}

function stableReasons(reasons: TaskReadinessReason[]): TaskReadinessReason[] {
  return [...new Map(reasons
    .sort((left, right) => `${left.code}:${left.detail ?? ""}`.localeCompare(`${right.code}:${right.detail ?? ""}`))
    .map((entry) => [`${entry.code}:${entry.detail ?? ""}`, entry])).values()];
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
