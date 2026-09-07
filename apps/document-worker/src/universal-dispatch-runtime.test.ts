import {
  candidateExecutorRegistrationSchema,
  compileUniversalDispatchCandidate,
  computeUniversalDispatchCandidateFingerprint,
  type UniversalDispatchCandidate,
} from "@offroad/dcm-specialization";
import {
  diversifiedReceivablesCase,
  receivablesPoolUnderwritingSchema,
} from "@offroad/receivables-analysis";
import {
  evaluateObjectivePlanReadiness,
  offroadTaskRegistry,
  type CompiledTaskGraph,
  type ObjectiveExecutionContext,
  type TaskExecutionCapability,
} from "@offroad/work-plan";
import {describe, expect, it, vi} from "vitest";

import {
  bundledInternalDispatchExecutorRegistry,
  createInternalUniversalDispatchRuntime,
  issueInternalFixtureAuthorization,
  type InternalBundledExecutor,
} from "./universal-dispatch-runtime";

const sha = (character: string) => character.repeat(64);
const now = () => new Date("2026-09-07T12:00:00.000Z");
const authorizationKey = "test-only-hmac-key-never-used-outside-ci";
const executor = bundledInternalDispatchExecutorRegistry[0]!;
const source = offroadTaskRegistry.find((task) => task.id === "R01")!;
const graph: CompiledTaskGraph = {
  targetTaskIds: ["R01"],
  tasks: [{...source, dependencies: [], procedure: executor.procedure}],
  parallelBatches: [["R01"]],
  executionClassCounts: {deterministic: 1, extraction: 0, research: 0, judgment: 0, compilation: 0, action: 0},
};
const capability: TaskExecutionCapability = {
  taskId: "R01",
  executorKey: executor.executorKey,
  executorVersion: executor.executorVersion,
  procedure: executor.procedure,
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
  tenantId: "ci-tenant",
  projectId: "ci-project",
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

function candidate(capabilityOverride: TaskExecutionCapability = capability): UniversalDispatchCandidate {
  const readiness = evaluateObjectivePlanReadiness({graph, capabilities: [capabilityOverride], context});
  return compileUniversalDispatchCandidate({
    objectiveStructuralIdentity: sha("1"),
    graph,
    readiness,
    executionContext: context,
    methodBinding: {
      schemaVersion: "objective-method-binding.v1",
      specializationFingerprint: sha("2"),
      methodRegistryHash: sha("3"),
      selectedPackIds: ["analysis.receivables-underwriting", "core.institutional-dcm"],
      baseTargetTaskIds: ["R01"],
      specialistTaskIds: [],
      effectiveTargetTaskIds: ["R01"],
      bindings: [{
        taskId: "R01", procedure: executor.procedure, maturity: "implemented",
        requiredPackIds: ["analysis.receivables-underwriting"], bindingPriority: 100,
        executor: {module: "@offroad/receivables-analysis", exportName: "underwriteReceivablesPool"},
        resultContract: executor.resultContract, sourcePath: "receivables/underwrite-receivables-pool.md",
        sourceHash: sha("4"),
      }],
      unboundTaskIds: [], conflicts: [], status: "bound", fingerprint: sha("5"),
    },
    workflowSelection: {
      schemaVersion: "workflow-recipe-selection.v1", status: "selected", reason: "selected",
      recipeId: "receivables-underwriting", recipeVersion: "2026.09.07-v1",
      recipeFingerprint: sha("6"), sliceFingerprint: sha("7"), outcome: "diagnostic",
      taskIds: ["R01"], parallelBatches: [["R01"]],
      activatedEconomicPacks: ["objective.capex-expansion"], fingerprint: sha("8"),
    },
    capabilities: [capabilityOverride],
    executors: [candidateExecutorRegistrationSchema.parse({
      taskId: executor.taskId,
      executorKey: executor.executorKey,
      executorVersion: executor.executorVersion,
      procedure: executor.procedure,
      resultContract: executor.resultContract,
    })],
  });
}

function authorization(value: UniversalDispatchCandidate) {
  return issueInternalFixtureAuthorization({
    candidate: value,
    keyId: "ci-key",
    secret: authorizationKey,
    issuedAt: "2026-09-07T11:00:00.000Z",
    expiresAt: "2026-09-07T13:00:00.000Z",
  });
}

function runtime(registry: readonly InternalBundledExecutor[] = bundledInternalDispatchExecutorRegistry) {
  return createInternalUniversalDispatchRuntime({
    registry,
    authorizationKeys: {"ci-key": authorizationKey},
    now,
  });
}

const input = {currency: "BRL", case: diversifiedReceivablesCase("runtime-r01")};

describe("internal universal dispatch runtime", () => {
  it("executes the deterministic R01 fixture and emits exact task and graph receipts", async () => {
    const value = candidate();
    expect(value).toMatchObject({status: "candidate", tasks: [{taskId: "R01"}], reasons: []});
    const result = await runtime().execute({
      candidate: value, authorization: authorization(value), inputsByTaskId: {R01: input}, timeoutMs: 1_000,
    });
    expect(result.replayed).toBe(false);
    expect(result.receipt).toMatchObject({
      mode: "internal_validation_fixture", status: "succeeded", externalEffectAllowed: false,
      candidateFingerprint: value.fingerprint,
      taskReceipts: [{taskId: "R01", status: "succeeded", externalEffectAllowed: false, error: null}],
    });
    expect(result.receipt.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(receivablesPoolUnderwritingSchema.parse(result.outputsByTaskId.R01)).toMatchObject({
      schema_version: "method.underwrite-receivables-pool.v1",
      decision_boundary: {externalDirectionAllowed: false},
    });
  });

  it("refuses a blocked candidate before consulting authorization or invoking an executor", async () => {
    const blocked = candidate({...capability, availability: "shadow"});
    await expect(runtime().execute({candidate: blocked, authorization: {}, inputsByTaskId: {R01: input}, timeoutMs: 1_000}))
      .rejects.toMatchObject({code: "dispatch_candidate_blocked"});
  });

  it("refuses an adulterated candidate fingerprint", async () => {
    const value = candidate();
    const adulterated = {...value, fingerprint: sha("a")};
    await expect(runtime().execute({
      candidate: adulterated, authorization: authorization(value), inputsByTaskId: {R01: input}, timeoutMs: 1_000,
    })).rejects.toMatchObject({code: "dispatch_candidate_fingerprint_mismatch"});
  });

  it("refuses an executor version adulterated under a newly fingerprinted candidate", async () => {
    const value = candidate();
    const adulterated = {
      ...value,
      tasks: [{...value.tasks[0]!, executorVersion: "2099.01.01-v1"}],
    };
    adulterated.fingerprint = computeUniversalDispatchCandidateFingerprint(adulterated);
    await expect(runtime().execute({
      candidate: adulterated, authorization: authorization(adulterated), inputsByTaskId: {R01: input}, timeoutMs: 1_000,
    })).rejects.toMatchObject({code: "dispatch_executor_identity_mismatch:R01"});
  });

  it("fails closed for duplicate and absent executors before invoking any task", async () => {
    const value = candidate();
    const invoke = vi.fn(executor.execute);
    const observed = {...executor, execute: invoke};
    await expect(runtime([observed, observed]).execute({
      candidate: value, authorization: authorization(value), inputsByTaskId: {R01: input}, timeoutMs: 1_000,
    })).rejects.toMatchObject({code: "dispatch_executor_duplicate:R01"});
    await expect(runtime([]).execute({
      candidate: value, authorization: authorization(value), inputsByTaskId: {R01: input}, timeoutMs: 1_000,
    })).rejects.toMatchObject({code: "dispatch_executor_absent:R01"});
    expect(invoke).not.toHaveBeenCalled();
  });

  it("rejects invalid input before execution", async () => {
    const value = candidate();
    const invoke = vi.fn(executor.execute);
    await expect(runtime([{...executor, execute: invoke}]).execute({
      candidate: value,
      authorization: authorization(value),
      inputsByTaskId: {R01: {...input, currency: "EUR"}},
      timeoutMs: 1_000,
    })).rejects.toMatchObject({code: "dispatch_input_invalid:R01"});
    expect(invoke).not.toHaveBeenCalled();
  });

  it("refuses an executor adapter that declares any effect", async () => {
    const value = candidate();
    const invoke = vi.fn(executor.execute);
    const effectful = {...executor, maximumEffect: "propose_state" as const, execute: invoke};
    await expect(createInternalUniversalDispatchRuntime({
      registry: [effectful] as unknown as readonly InternalBundledExecutor[],
      authorizationKeys: {"ci-key": authorizationKey},
      now,
    }).execute({
      candidate: value, authorization: authorization(value), inputsByTaskId: {R01: input}, timeoutMs: 1_000,
    })).rejects.toMatchObject({code: "dispatch_executor_effect_denied:R01"});
    expect(invoke).not.toHaveBeenCalled();
  });

  it("records timeout and cancellation explicitly without exposing an output", async () => {
    const value = candidate();
    const invoke = vi.fn((_input: unknown, {signal}: {signal: AbortSignal}) => new Promise((resolve) => {
      const timer = setTimeout(() => resolve(executor.execute(input, {signal})), 100);
      signal.addEventListener("abort", () => clearTimeout(timer), {once: true});
    }));
    const delayed: InternalBundledExecutor = {
      ...executor,
      execute: invoke,
    };
    const timedOut = await runtime([delayed]).execute({
      candidate: value, authorization: authorization(value), inputsByTaskId: {R01: input}, timeoutMs: 5,
    });
    expect(timedOut.receipt).toMatchObject({
      status: "failed", taskReceipts: [{status: "failed", error: {code: "timeout"}}],
    });
    expect(timedOut.outputsByTaskId).toEqual({});

    const controller = new AbortController();
    controller.abort();
    invoke.mockClear();
    const cancelled = await runtime([delayed]).execute({
      candidate: value, authorization: authorization(value), inputsByTaskId: {R01: input},
      timeoutMs: 1_000, signal: controller.signal,
    });
    expect(cancelled.receipt.taskReceipts[0]?.error?.code).toBe("cancelled");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("replays the exact receipt for the same candidate, task and parsed input fingerprint", async () => {
    const value = candidate();
    const invoke = vi.fn(executor.execute);
    const dispatcher = runtime([{...executor, execute: invoke}]);
    const first = await dispatcher.execute({
      candidate: value, authorization: authorization(value), inputsByTaskId: {R01: input}, timeoutMs: 1_000,
    });
    const replay = await dispatcher.execute({
      candidate: value, authorization: authorization(value), inputsByTaskId: {R01: structuredClone(input)}, timeoutMs: 1_000,
    });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(replay.replayed).toBe(true);
    expect(replay.receipt).toEqual(first.receipt);
    expect(replay.outputsByTaskId).toEqual(first.outputsByTaskId);
  });

  it("records invalid output and executor failure as explicit failed receipts", async () => {
    const value = candidate();
    const invalidOutput = await runtime([{...executor, execute: () => ({not: "the result contract"})}]).execute({
      candidate: value, authorization: authorization(value), inputsByTaskId: {R01: input}, timeoutMs: 1_000,
    });
    expect(invalidOutput.receipt.taskReceipts[0]?.error?.code).toBe("output_invalid");
    expect(invalidOutput.outputsByTaskId).toEqual({});

    const failed = await runtime([{...executor, execute: () => { throw new Error("sensitive provider detail"); }}]).execute({
      candidate: value, authorization: authorization(value), inputsByTaskId: {R01: input}, timeoutMs: 1_000,
    });
    expect(failed.receipt.taskReceipts[0]?.error).toEqual({code: "execution_failed", detail: "Error"});
    expect(JSON.stringify(failed.receipt)).not.toContain("sensitive provider detail");
  });

  it("rejects a modified signed authorization before execution", async () => {
    const value = candidate();
    const signed = authorization(value);
    const invoke = vi.fn(executor.execute);
    await expect(runtime([{...executor, execute: invoke}]).execute({
      candidate: value,
      authorization: {...signed, expiresAt: "2026-09-08T13:00:00.000Z"},
      inputsByTaskId: {R01: input},
      timeoutMs: 1_000,
    })).rejects.toMatchObject({code: "dispatch_authorization_signature_invalid"});
    expect(invoke).not.toHaveBeenCalled();
  });
});
