import {
  evaluateObjectivePlanReadiness,
  offroadTaskRegistry,
  type CompiledTaskGraph,
  type ObjectiveExecutionContext,
  type TaskExecutionCapability,
} from "@offroad/work-plan";
import {describe, expect, it} from "vitest";

import {
  compileUniversalDispatchCandidate,
  type CandidateExecutorRegistration,
} from "./dispatch-candidate";
import type {ObjectiveMethodBinding} from "./method-binding";
import type {WorkflowRecipeSelection} from "./workflow-selection";

const sha = (character: string) => character.repeat(64);
const procedure = {id: "underwrite-receivables-pool", version: "2026.09.06-v1"};
const executorKey = "@offroad/receivables-analysis#underwriteReceivablesPool";
const source = offroadTaskRegistry.find((task) => task.id === "R01")!;
const graph: CompiledTaskGraph = {
  targetTaskIds: ["R01"],
  tasks: [{...source, dependencies: [], procedure}],
  parallelBatches: [["R01"]],
  executionClassCounts: {deterministic: 1, extraction: 0, research: 0, judgment: 0, compilation: 0, action: 0},
};

const capability: TaskExecutionCapability = {
  taskId: "R01",
  executorKey,
  executorVersion: procedure.version,
  procedure,
  availability: "live",
  exposure: "internal",
  allowedUses: ["internal_validation"],
  allowedEvidenceRegimes: ["project_private"],
  allowedDataClasses: ["project_confidential"],
  allowedSourceClasses: ["project_context", "provided_documents", "house_method"],
  allowedProviderIds: [],
  allowedToolIds: [],
  providerRequired: false,
  maximumEffect: source.effect,
  allowlistedTenantIds: [],
  allowlistedProjectIds: [],
};

const context: ObjectiveExecutionContext = {
  use: "internal_validation",
  authority: "analysis_only",
  evidenceRegime: "project_private",
  tenantId: "tenant-1",
  projectId: "project-1",
  internalActor: true,
  externalAuthorizationRef: null,
  resourcesByTaskId: {R01: {
    providerId: null,
    toolIds: [],
    sourceClasses: ["project_context", "provided_documents", "house_method"],
    dataClasses: ["project_confidential"],
  }},
  disabledTaskIds: [],
  disabledExecutorKeys: [],
  disabledProviderIds: [],
  disabledToolIds: [],
};

const methodBinding: ObjectiveMethodBinding = {
  schemaVersion: "objective-method-binding.v1",
  specializationFingerprint: sha("a"),
  methodRegistryHash: sha("b"),
  selectedPackIds: ["analysis.receivables-underwriting", "core.institutional-dcm"],
  baseTargetTaskIds: ["R01"],
  specialistTaskIds: [],
  effectiveTargetTaskIds: ["R01"],
  bindings: [{
    taskId: "R01",
    procedure,
    maturity: "implemented",
    requiredPackIds: ["analysis.receivables-underwriting"],
    bindingPriority: 100,
    executor: {module: "@offroad/receivables-analysis", exportName: "underwriteReceivablesPool"},
    resultContract: "method.underwrite-receivables-pool.v1",
    sourcePath: "receivables/underwrite-receivables-pool.md",
    sourceHash: sha("c"),
  }],
  unboundTaskIds: [],
  conflicts: [],
  status: "bound",
  fingerprint: sha("d"),
};

const selection: WorkflowRecipeSelection = {
  schemaVersion: "workflow-recipe-selection.v1",
  status: "selected",
  reason: "selected",
  recipeId: "receivables-underwriting",
  recipeVersion: "2026.09.07-v1",
  recipeFingerprint: sha("e"),
  sliceFingerprint: sha("f"),
  outcome: "diagnostic",
  taskIds: ["R01"],
  parallelBatches: [["R01"]],
  activatedEconomicPacks: ["objective.capex-expansion"],
  fingerprint: sha("1"),
};

const executor: CandidateExecutorRegistration = {
  taskId: "R01",
  executorKey,
  executorVersion: procedure.version,
  procedure,
  resultContract: "method.underwrite-receivables-pool.v1",
};

function compile(overrides: Partial<Parameters<typeof compileUniversalDispatchCandidate>[0]> = {}) {
  return compileUniversalDispatchCandidate({
    objectiveStructuralIdentity: sha("2"),
    graph,
    readiness: evaluateObjectivePlanReadiness({graph, capabilities: [capability], context}),
    methodBinding,
    workflowSelection: selection,
    capabilities: [capability],
    executors: [executor],
    ...overrides,
  });
}

describe("universal dispatch candidate", () => {
  it("compiles an exact all-or-nothing candidate but never invokes it", () => {
    expect(compile()).toMatchObject({
      mode: "internal_shadow",
      status: "candidate",
      tasks: [{taskId: "R01", executorKey, procedure, resultContract: "method.underwrite-receivables-pool.v1"}],
      parallelBatches: [["R01"]],
      reasons: [],
      willExecute: false,
      externalEffectAllowed: false,
    });
  });

  it("blocks the whole slice when persisted readiness does not authorize a task", () => {
    const shadowCapability = {...capability, availability: "shadow" as const};
    const readiness = evaluateObjectivePlanReadiness({graph, capabilities: [shadowCapability], context});
    const result = compile({readiness, capabilities: [shadowCapability]});
    expect(result).toMatchObject({status: "blocked", tasks: [], parallelBatches: []});
    expect(result.reasons).toContainEqual(expect.objectContaining({code: "preflight_task_blocked", taskId: "R01"}));
    expect(result.reasons).toContainEqual(expect.objectContaining({code: "capability_not_live", taskId: "R01"}));
  });

  it("rejects a capability whose procedure or executor differs from the method binding", () => {
    const result = compile({capabilities: [{...capability, executorVersion: "wrong-version"}]});
    expect(result.status).toBe("blocked");
    expect(result.reasons).toContainEqual(expect.objectContaining({code: "capability_identity_mismatch", taskId: "R01"}));
    expect(result.tasks).toEqual([]);
  });

  it("rejects duplicate executor registrations rather than choosing by array order", () => {
    const result = compile({executors: [executor, executor]});
    expect(result.status).toBe("blocked");
    expect(result.reasons).toContainEqual(expect.objectContaining({code: "executor_duplicate", taskId: "R01"}));
  });

  it("fingerprints registries independently of their input order", () => {
    const extraCapability = {...capability, taskId: "R02"};
    const extraExecutor = {...executor, taskId: "R02"};
    const forward = compile({
      capabilities: [capability, extraCapability],
      executors: [executor, extraExecutor],
    });
    const reversed = compile({
      capabilities: [extraCapability, capability],
      executors: [extraExecutor, executor],
    });
    expect(reversed.capabilityManifestHash).toBe(forward.capabilityManifestHash);
    expect(reversed.executorRegistryHash).toBe(forward.executorRegistryHash);
    expect(reversed.fingerprint).toBe(forward.fingerprint);
  });

  it("rejects a selected recipe task absent from the objective graph", () => {
    const otherSelection = {...selection, taskIds: ["R02"], parallelBatches: [["R02"]]};
    const result = compile({workflowSelection: otherSelection});
    expect(result.status).toBe("blocked");
    expect(result.reasons).toContainEqual({code: "workflow_task_absent_from_objective", taskId: "R02", detail: null});
  });

  it("does not create a candidate for an unselected workflow", () => {
    const blocked: WorkflowRecipeSelection = {
      ...selection,
      status: "blocked",
      reason: "economic_situation_not_implemented",
      recipeId: null,
      recipeVersion: null,
      recipeFingerprint: null,
      sliceFingerprint: null,
      outcome: null,
      taskIds: [],
      parallelBatches: [],
    };
    const result = compile({workflowSelection: blocked});
    expect(result).toMatchObject({status: "blocked", tasks: [], reasons: [{code: "workflow_not_selected"}]});
  });
});
