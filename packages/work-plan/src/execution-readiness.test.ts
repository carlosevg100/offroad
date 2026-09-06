import {describe, expect, it} from "vitest";

import {compileTaskGraph, type CompiledTaskGraph} from "./capital-jobs";
import {
  evaluateObjectivePlanReadiness,
  type ObjectiveExecutionContext,
  type TaskExecutionCapability,
} from "./execution-readiness";
import {compileObjectivePlan} from "./objective-plan";
import {offroadTaskRegistry, type OffroadTaskSpec} from "./task-registry";

const procedure = (taskId: string) => ({id: `method-${taskId.toLowerCase()}`, version: "2026.09.06-v1"});

function boundGraph(targetTaskIds: readonly string[]): CompiledTaskGraph {
  const graph = compileTaskGraph(targetTaskIds);
  return {...graph, tasks: graph.tasks.map((task) => ({...task, procedure: procedure(task.id)}))};
}

function capability(task: OffroadTaskSpec, overrides: Partial<TaskExecutionCapability> = {}): TaskExecutionCapability {
  return {
    taskId: task.id,
    executorKey: `offroad.${task.id.toLowerCase()}`,
    executorVersion: "2026.09.06-v1",
    procedure: task.procedure ?? procedure(task.id),
    availability: "live",
    exposure: "universal",
    allowedUses: ["internal_validation"],
    allowedEvidenceRegimes: ["mixed_governed"],
    allowedDataClasses: ["public", "project_confidential"],
    allowedSourceClasses: ["project_context", "provided_documents", "public_company", "public_market", "house_method"],
    allowedProviderIds: ["anthropic.approved"],
    allowedToolIds: ["offroad.search", "offroad.calculate"],
    providerRequired: false,
    maximumEffect: task.effect,
    allowlistedTenantIds: [],
    allowlistedProjectIds: [],
    ...overrides,
  };
}

function context(graph: CompiledTaskGraph, overrides: Partial<ObjectiveExecutionContext> = {}): ObjectiveExecutionContext {
  return {
    use: "internal_validation",
    authority: "project_write",
    evidenceRegime: "mixed_governed",
    tenantId: "tenant-1",
    projectId: "project-1",
    internalActor: true,
    externalAuthorizationRef: null,
    resourcesByTaskId: Object.fromEntries(graph.tasks.map((task) => [task.id, {
      providerId: null,
      toolIds: [],
      sourceClasses: ["project_context"],
      dataClasses: ["project_confidential"],
    }])),
    disabledTaskIds: [],
    disabledExecutorKeys: [],
    disabledProviderIds: [],
    disabledToolIds: [],
    ...overrides,
  };
}

function codes(result: ReturnType<typeof evaluateObjectivePlanReadiness>, taskId: string): string[] {
  return result.tasks.find((task) => task.taskId === taskId)?.reasons.map((reason) => reason.code) ?? [];
}

describe("objective plan execution readiness", () => {
  it("treats a bounded conversation with no task runtime as ready", () => {
    const graph = compileTaskGraph([]);
    expect(evaluateObjectivePlanReadiness({graph, capabilities: [], context: context(graph)})).toMatchObject({
      status: "ready", terminalReachable: true, executableTaskIds: [], blockedTaskIds: [],
    });
  });

  it("does not confuse the TaskSpec catalogue with executable capability", () => {
    const graph = compileObjectivePlan({objectiveKind: "board_decision", hasAttachments: true}).taskGraph;
    const result = evaluateObjectivePlanReadiness({graph, capabilities: [], context: context(graph)});
    expect(result.status).toBe("blocked");
    expect(result.terminalReachable).toBe(false);
    expect(result.tasks.every((task) => task.reasons.some((reason) => reason.code === "task_procedure_unbound"))).toBe(true);
    expect(result.tasks.every((task) => task.reasons.some((reason) => reason.code === "executor_unbound"))).toBe(true);
  });

  it("requires every dependency and blocks the terminal instead of skipping missing work", () => {
    const graph = boundGraph(["M03"]);
    const m03 = graph.tasks.find((task) => task.id === "M03")!;
    const result = evaluateObjectivePlanReadiness({graph, capabilities: [capability(m03)], context: context(graph)});
    expect(result.status).toBe("blocked");
    expect(codes(result, "M03")).toEqual(["dependency_not_executable"]);
    expect(result.terminalReachable).toBe(false);
  });

  it("reports partial readiness when safe upstream work can proceed but the terminal cannot", () => {
    const graph = boundGraph(["M03"]);
    const m02 = graph.tasks.find((task) => task.id === "M02")!;
    const result = evaluateObjectivePlanReadiness({graph, capabilities: [capability(m02)], context: context(graph)});
    expect(result).toMatchObject({status: "partial", terminalReachable: false, executableTaskIds: ["M02"], blockedTaskIds: ["M03"]});
  });

  it("requires a live exact method binding and an explicit resource contract", () => {
    const graph = boundGraph(["M02"]);
    const task = graph.tasks[0]!;
    const noResources = context(graph, {resourcesByTaskId: {}});
    const shadow = capability(task, {availability: "shadow", procedure: {id: "different-method", version: "v2"}});
    const result = evaluateObjectivePlanReadiness({graph, capabilities: [shadow], context: noResources});
    expect(codes(result, "M02")).toEqual(expect.arrayContaining([
      "capability_not_live", "procedure_binding_mismatch", "task_resource_contract_missing",
    ]));
  });

  it("enforces allowlist scope and intended use independently", () => {
    const graph = boundGraph(["M02"]);
    const task = graph.tasks[0]!;
    const binding = capability(task, {
      exposure: "allowlisted",
      allowlistedTenantIds: ["other-tenant"],
      allowedUses: ["customer_work"],
    });
    const result = evaluateObjectivePlanReadiness({graph, capabilities: [binding], context: context(graph)});
    expect(codes(result, "M02")).toEqual(expect.arrayContaining(["capability_exposure_denied", "execution_use_not_allowed"]));
  });

  it("fails closed on evidence regime, data class, source and tool policy", () => {
    const graph = boundGraph(["M02"]);
    const task = graph.tasks[0]!;
    const restricted = context(graph, {resourcesByTaskId: {M02: {
      providerId: null,
      toolIds: ["internet.unapproved"],
      sourceClasses: ["capital_network"],
      dataClasses: ["restricted_personal"],
    }}});
    const result = evaluateObjectivePlanReadiness({
      graph,
      capabilities: [capability(task, {allowedEvidenceRegimes: ["public_only"]})],
      context: restricted,
    });
    expect(codes(result, "M02")).toEqual(expect.arrayContaining([
      "evidence_regime_not_allowed", "tool_not_homologated", "source_class_not_allowed", "data_class_not_allowed",
    ]));
  });

  it("requires an exact homologated provider and respects provider and tool kill switches", () => {
    const graph = boundGraph(["M02"]);
    const task = graph.tasks[0]!;
    const routed = context(graph, {
      resourcesByTaskId: {M02: {
        providerId: "openai.unapproved",
        toolIds: ["offroad.search"],
        sourceClasses: ["public_company"],
        dataClasses: ["public"],
      }},
      disabledProviderIds: ["openai.unapproved"],
      disabledToolIds: ["offroad.search"],
    });
    const result = evaluateObjectivePlanReadiness({graph, capabilities: [capability(task)], context: routed});
    expect(codes(result, "M02")).toEqual(expect.arrayContaining([
      "provider_not_homologated", "provider_killed", "tool_killed",
    ]));
  });

  it("does not silently run a model task when the provider route is missing", () => {
    const graph = boundGraph(["M02"]);
    const task = graph.tasks[0]!;
    const result = evaluateObjectivePlanReadiness({
      graph,
      capabilities: [capability(task, {providerRequired: true})],
      context: context(graph),
    });
    expect(codes(result, "M02")).toContain("provider_route_missing");
  });

  it("requires write authority for commit tasks", () => {
    const graph = boundGraph(["M06"]);
    const bindings = graph.tasks.map((task) => capability(task));
    const result = evaluateObjectivePlanReadiness({
      graph,
      capabilities: bindings,
      context: context(graph, {authority: "analysis_only"}),
    });
    expect(codes(result, "M06")).toContain("authority_insufficient");
    expect(result.terminalReachable).toBe(false);
  });

  it("requires exact external authorization even with an external-action capability", () => {
    const source = offroadTaskRegistry.find((task) => task.id === "X04")!;
    const task = {...source, dependencies: [], procedure: procedure("X04")};
    const graph: CompiledTaskGraph = {
      targetTaskIds: ["X04"], tasks: [task], parallelBatches: [["X04"]],
      executionClassCounts: {deterministic: 0, extraction: 0, research: 0, judgment: 0, compilation: 0, action: 1},
    };
    const result = evaluateObjectivePlanReadiness({
      graph,
      capabilities: [capability(task, {allowedUses: ["external_action"]})],
      context: context(graph, {use: "external_action", authority: "external_action", externalAuthorizationRef: null}),
    });
    expect(codes(result, "X04")).toContain("exact_external_authority_missing");
  });

  it("rejects duplicate bindings instead of choosing one by array order", () => {
    const graph = boundGraph(["M02"]);
    const binding = capability(graph.tasks[0]!);
    expect(() => evaluateObjectivePlanReadiness({
      graph, capabilities: [binding, binding], context: context(graph),
    })).toThrow("duplicate execution capability for M02");
  });

  it("binds the decision fingerprint to policy and kill-switch state", () => {
    const graph = boundGraph(["M02"]);
    const binding = capability(graph.tasks[0]!);
    const first = evaluateObjectivePlanReadiness({graph, capabilities: [binding], context: context(graph)});
    const second = evaluateObjectivePlanReadiness({
      graph, capabilities: [binding], context: context(graph, {disabledExecutorKeys: [binding.executorKey]}),
    });
    expect(first).toMatchObject({status: "ready", terminalReachable: true});
    expect(second).toMatchObject({status: "blocked", terminalReachable: false});
    expect(second.readinessFingerprint).not.toBe(first.readinessFingerprint);
  });
});
