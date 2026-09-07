import {
  candidateExecutorRegistrationSchema,
  compileUniversalDispatchCandidate,
  computeUniversalDispatchCandidateFingerprint,
  type UniversalDispatchCandidate,
} from "@offroad/dcm-specialization";
import {
  createContextCandidate,
  createContextResolutionIntent,
  issueSystemContextControl,
  resolveAuthorizedContext,
  type ContextCandidate,
  type ContextPermission,
} from "@offroad/governed-retrieval";
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
const controlKey = "test-only-control-key-never-used-outside-ci";
const resolutionKey = "test-only-resolution-key-never-used-outside-ci";
const contextResolutionTrust = [{
  issuerId: "ci-context-resolver", keyId: "resolution-key", algorithm: "hmac-sha256" as const, secret: resolutionKey,
  validFrom: "2026-01-01T00:00:00.000Z", validUntil: "2027-01-01T00:00:00.000Z", revokedAt: null,
}];
const systemControlTrust = [{
  issuerId: "ci-control-plane", keyId: "control-key", algorithm: "hmac-sha256" as const, secret: controlKey,
  validFrom: "2026-01-01T00:00:00.000Z", validUntil: "2027-01-01T00:00:00.000Z", revokedAt: null,
}];
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
    contextResolution: contextResolution(value),
    keyId: "ci-key",
    secret: authorizationKey,
    issuedAt: "2026-09-07T12:00:00.000Z",
    expiresAt: "2026-09-07T12:30:00.000Z",
    contextResolutionTrust,
  });
}

function contextResolution(value: UniversalDispatchCandidate, overrides: {
  executionContextHash?: string;
  continuity?: "new" | "resume";
  candidates?: ContextCandidate[];
  permissions?: ContextPermission[];
} = {}) {
  const candidates = overrides.candidates ?? [];
  const systemControl = issueSystemContextControl({
    schemaVersion: "system-context-control.v2",
    source: "system",
    organizationId: "ci-tenant",
    projectId: "ci-project",
    conversationId: "ci-conversation",
    authority: "analysis_only",
    evidenceRegime: "project_private",
    authorityGrants: ["read"],
    permissions: overrides.permissions ?? [],
    authorizedContextSnapshots: candidates.map(({id, fingerprint}) => ({itemId: id, snapshotFingerprint: fingerprint})),
    authorizedDocumentIds: [],
    authorizedCompanyIds: [],
    executionContextHash: overrides.executionContextHash ?? value.executionContextHash,
    revision: 1,
    issuedAt: "2026-09-07T11:00:00.000Z",
    expiresAt: "2026-09-07T13:00:00.000Z",
    issuer: {issuerId: "ci-control-plane", keyId: "control-key", algorithm: "hmac-sha256"},
  }, controlKey);
  const resolutionIntent = createContextResolutionIntent({
    schemaVersion: "context-resolution-intent.v1",
    primaryWorks: ["analyze"],
    objectKinds: ["asset_or_pool"],
    objectRefs: [],
    productKeys: ["receivables-underwriting"],
    jurisdictions: {values: ["BR"], state: "explicit"},
    asOfDate: {value: "2026-06-30", state: "explicit"},
    continuity: overrides.continuity ?? "new",
  });
  return resolveAuthorizedContext({
    systemControl,
    systemControlTrust,
    intent: resolutionIntent,
    candidates,
    now: now(),
    resolutionIssuer: {issuerId: "ci-context-resolver", keyId: "resolution-key", algorithm: "hmac-sha256", secret: resolutionKey},
  });
}

function runtimeContextCandidate(id: string, organizationId = "ci-tenant", overrides: Record<string, unknown> = {}) {
  return createContextCandidate({
    schemaVersion: "context-candidate.v1",
    id,
    logicalKey: "project.receivables",
    kind: "project_memory",
    organizationId,
    controlRevision: 1,
    projectId: "ci-project",
    companyId: null,
    conversationId: null,
    documentId: null,
    dataClass: "project_confidential",
    payloadLocator: {scheme: "context_snapshot", locatorId: id},
    contentHash: sha("8"),
    sourceVersion: "fixture-v1",
    snapshotVersion: 1,
    capturedAt: "2026-09-07T11:00:00.000Z",
    validFrom: "2026-09-07T11:00:00.000Z",
    validUntil: null,
    freshUntil: "2026-09-08T11:00:00.000Z",
    revokedAt: null,
    asOfDate: null,
    temporalPolicy: "timeless",
    jurisdictions: [],
    selectors: {primaryWorks: ["analyze"], objectKinds: [], objectRefs: [], productKeys: []},
    supersedesId: null,
    ...overrides,
  } as never);
}

function runtime(registry: readonly InternalBundledExecutor[] = bundledInternalDispatchExecutorRegistry) {
  const internal = createInternalUniversalDispatchRuntime({
    registry,
    authorizationKeys: {"ci-key": authorizationKey},
    contextResolutionTrust,
    now,
  });
  return {
    execute(input: Omit<Parameters<typeof internal.execute>[0], "contextResolution"> & {contextResolution?: unknown}) {
      const value = input.candidate as UniversalDispatchCandidate;
      return internal.execute({...input, contextResolution: input.contextResolution ?? contextResolution(value)});
    },
  };
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
      contextResolutionFingerprint: contextResolution(value).fingerprint,
      taskReceipts: [{taskId: "R01", status: "succeeded", externalEffectAllowed: false, error: null}],
    });
    expect(result.receipt.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(receivablesPoolUnderwritingSchema.parse(result.outputsByTaskId.R01)).toMatchObject({
      schema_version: "method.underwrite-receivables-pool.v1",
      decision_boundary: {externalDirectionAllowed: false},
    });
  });

  it("refuses a context resolution bound to a different execution context", async () => {
    const value = candidate();
    const wrongContext = contextResolution(value, {executionContextHash: sha("9")});
    await expect(runtime().execute({
      candidate: value,
      contextResolution: wrongContext,
      authorization: authorization(value),
      inputsByTaskId: {R01: input},
      timeoutMs: 1_000,
    })).rejects.toMatchObject({code: "dispatch_context_execution_identity_mismatch"});
  });

  it("binds the signed authorization and idempotency identity to the exact context resolution", async () => {
    const value = candidate();
    const changedResolution = contextResolution(value, {continuity: "resume"});
    await expect(runtime().execute({
      candidate: value,
      contextResolution: changedResolution,
      authorization: authorization(value),
      inputsByTaskId: {R01: input},
      timeoutMs: 1_000,
    })).rejects.toMatchObject({code: "dispatch_authorization_identity_mismatch"});
  });

  it("refuses blocked and needs-context resolutions before invoking the fixture executor", async () => {
    const value = candidate();
    const invoke = vi.fn(executor.execute);
    const blocked = contextResolution(value, {candidates: [runtimeContextCandidate("foreign-context", "other-tenant")]});
    const needsContext = contextResolution(value, {candidates: [runtimeContextCandidate("permission-context")]});

    await expect(runtime([{...executor, execute: invoke}]).execute({
      candidate: value, contextResolution: blocked, authorization: authorization(value), inputsByTaskId: {R01: input}, timeoutMs: 1_000,
    })).rejects.toMatchObject({code: "dispatch_context_blocked"});
    await expect(runtime([{...executor, execute: invoke}]).execute({
      candidate: value, contextResolution: needsContext, authorization: authorization(value), inputsByTaskId: {R01: input}, timeoutMs: 1_000,
    })).rejects.toMatchObject({code: "dispatch_context_needs_context"});
    expect(invoke).not.toHaveBeenCalled();
  });

  it("refuses fixture authorization that predates or outlives its signed context resolution", () => {
    const value = candidate();
    const resolution = contextResolution(value);
    expect(() => issueInternalFixtureAuthorization({
      candidate: value,
      contextResolution: resolution,
      keyId: "ci-key",
      secret: authorizationKey,
      issuedAt: "2026-09-07T11:59:59.000Z",
      expiresAt: "2026-09-07T12:30:00.000Z",
      contextResolutionTrust,
    })).toThrow("dispatch_context_resolution_invalid");
    expect(() => issueInternalFixtureAuthorization({
      candidate: value,
      contextResolution: resolution,
      keyId: "ci-key",
      secret: authorizationKey,
      issuedAt: "2026-09-07T12:00:00.000Z",
      expiresAt: "2026-09-07T13:00:00.001Z",
      contextResolutionTrust,
    })).toThrow("dispatch_authorization_exceeds_context_resolution");
  });

  it("revalidates context before executor invocation and closes the TOCTOU window", async () => {
    const value = candidate();
    const expiringCandidate = runtimeContextCandidate("expiring-context", "ci-tenant", {freshUntil: "2026-09-07T12:10:00.000Z"});
    const resolution = contextResolution(value, {candidates: [expiringCandidate], permissions: ["read_project_context"]});
    const signedAuthorization = issueInternalFixtureAuthorization({
      candidate: value,
      contextResolution: resolution,
      keyId: "ci-key",
      secret: authorizationKey,
      issuedAt: "2026-09-07T12:00:00.000Z",
      expiresAt: "2026-09-07T12:09:00.000Z",
      contextResolutionTrust,
    });
    const invoke = vi.fn(executor.execute);
    const clock = vi.fn()
      .mockReturnValueOnce(new Date("2026-09-07T12:00:00.000Z"))
      .mockReturnValueOnce(new Date("2026-09-07T12:00:00.000Z"))
      .mockReturnValue(new Date("2026-09-07T12:10:00.000Z"));
    const internal = createInternalUniversalDispatchRuntime({
      registry: [{...executor, execute: invoke}], authorizationKeys: {"ci-key": authorizationKey}, contextResolutionTrust, now: clock,
    });
    await expect(internal.execute({
      candidate: value, contextResolution: resolution, authorization: signedAuthorization, inputsByTaskId: {R01: input}, timeoutMs: 1_000,
    })).rejects.toMatchObject({code: "dispatch_context_resolution_expired_before_read"});
    expect(invoke).not.toHaveBeenCalled();
  });

  it("does not replay a completed graph after its signed context resolution expires", async () => {
    const value = candidate();
    let clock = new Date("2026-09-07T12:00:00.000Z");
    const expiringCandidate = runtimeContextCandidate("expiring-context", "ci-tenant", {freshUntil: "2026-09-07T12:10:00.000Z"});
    const resolution = contextResolution(value, {candidates: [expiringCandidate], permissions: ["read_project_context"]});
    const signedAuthorization = issueInternalFixtureAuthorization({
      candidate: value, contextResolution: resolution, keyId: "ci-key", secret: authorizationKey,
      issuedAt: "2026-09-07T12:00:00.000Z", expiresAt: "2026-09-07T12:09:00.000Z", contextResolutionTrust,
    });
    const internal = createInternalUniversalDispatchRuntime({
      registry: bundledInternalDispatchExecutorRegistry, authorizationKeys: {"ci-key": authorizationKey}, contextResolutionTrust, now: () => clock,
    });
    const request = {candidate: value, contextResolution: resolution, authorization: signedAuthorization, inputsByTaskId: {R01: input}, timeoutMs: 1_000};
    await expect(internal.execute(request)).resolves.toMatchObject({replayed: false});
    clock = new Date("2026-09-07T12:10:00.000Z");
    await expect(internal.execute(request)).rejects.toMatchObject({code: "dispatch_context_resolution_expired"});
  });

  it("discards executor output when authorization expires across the await boundary", async () => {
    const value = candidate();
    const resolution = contextResolution(value);
    let clock = new Date("2026-09-07T12:00:00.000Z");
    let expireDuringExecution = true;
    const invoke = vi.fn(async (rawInput: unknown, executionContext: {signal: AbortSignal}) => {
      const output = await executor.execute(rawInput, executionContext);
      if (expireDuringExecution) clock = new Date("2026-09-07T12:05:00.000Z");
      return output;
    });
    const signedAuthorization = issueInternalFixtureAuthorization({
      candidate: value, contextResolution: resolution, keyId: "ci-key", secret: authorizationKey,
      issuedAt: "2026-09-07T12:00:00.000Z", expiresAt: "2026-09-07T12:05:00.000Z", contextResolutionTrust,
    });
    const internal = createInternalUniversalDispatchRuntime({
      registry: [{...executor, execute: invoke}], authorizationKeys: {"ci-key": authorizationKey}, contextResolutionTrust, now: () => clock,
    });
    const request = {candidate: value, contextResolution: resolution, authorization: signedAuthorization, inputsByTaskId: {R01: input}, timeoutMs: 1_000};
    await expect(internal.execute(request)).rejects.toMatchObject({code: "dispatch_authority_expired_after_executor"});
    expect(invoke).toHaveBeenCalledTimes(1);

    // The post-await refusal evicts the graph promise; no stale output/receipt was cached.
    expireDuringExecution = false;
    const renewedAuthorization = issueInternalFixtureAuthorization({
      candidate: value, contextResolution: resolution, keyId: "ci-key", secret: authorizationKey,
      issuedAt: "2026-09-07T12:05:00.000Z", expiresAt: "2026-09-07T12:10:00.000Z", contextResolutionTrust,
    });
    await expect(internal.execute({...request, authorization: renewedAuthorization})).resolves.toMatchObject({replayed: false, receipt: {status: "succeeded"}});
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("discards post-executor output when the trusted clock rewinds", async () => {
    const value = candidate();
    const resolution = contextResolution(value);
    let clock = new Date("2026-09-07T12:01:00.000Z");
    let rewindDuringExecution = true;
    const invoke = vi.fn(async (rawInput: unknown, executionContext: {signal: AbortSignal}) => {
      const output = await executor.execute(rawInput, executionContext);
      if (rewindDuringExecution) clock = new Date("2026-09-07T12:00:30.000Z");
      return output;
    });
    const signedAuthorization = issueInternalFixtureAuthorization({
      candidate: value, contextResolution: resolution, keyId: "ci-key", secret: authorizationKey,
      issuedAt: "2026-09-07T12:00:00.000Z", expiresAt: "2026-09-07T12:30:00.000Z", contextResolutionTrust,
    });
    const internal = createInternalUniversalDispatchRuntime({
      registry: [{...executor, execute: invoke}], authorizationKeys: {"ci-key": authorizationKey}, contextResolutionTrust, now: () => clock,
    });
    const request = {candidate: value, contextResolution: resolution, authorization: signedAuthorization, inputsByTaskId: {R01: input}, timeoutMs: 1_000};
    await expect(internal.execute(request)).rejects.toMatchObject({code: "dispatch_clock_rewind"});
    expect(invoke).toHaveBeenCalledTimes(1);

    // A fresh runtime with a non-rewinding trusted clock can execute, proving no output escaped
    // the failed runtime through a receipt or reusable cache entry.
    clock = new Date("2026-09-07T12:02:00.000Z");
    rewindDuringExecution = false;
    const fresh = createInternalUniversalDispatchRuntime({
      registry: [{...executor, execute: invoke}], authorizationKeys: {"ci-key": authorizationKey}, contextResolutionTrust, now: () => clock,
    });
    await expect(fresh.execute(request)).resolves.toMatchObject({replayed: false, receipt: {status: "succeeded"}});
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("revalidates a cached replay against a future-dated resolution", async () => {
    const value = candidate();
    let clock = new Date("2026-09-07T12:00:00.000Z");
    const resolution = contextResolution(value);
    const signedAuthorization = issueInternalFixtureAuthorization({
      candidate: value, contextResolution: resolution, keyId: "ci-key", secret: authorizationKey,
      issuedAt: "2026-09-07T12:00:00.000Z", expiresAt: "2026-09-07T12:30:00.000Z", contextResolutionTrust,
    });
    const internal = createInternalUniversalDispatchRuntime({
      registry: bundledInternalDispatchExecutorRegistry, authorizationKeys: {"ci-key": authorizationKey}, contextResolutionTrust, now: () => clock,
    });
    const request = {candidate: value, contextResolution: resolution, authorization: signedAuthorization, inputsByTaskId: {R01: input}, timeoutMs: 1_000};
    await expect(internal.execute(request)).resolves.toMatchObject({replayed: false});
    clock = new Date("2026-09-07T11:59:59.000Z");
    await expect(internal.execute(request)).rejects.toMatchObject({code: "dispatch_clock_rewind"});
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
      contextResolutionTrust,
      now,
    }).execute({
      candidate: value, contextResolution: contextResolution(value), authorization: authorization(value), inputsByTaskId: {R01: input}, timeoutMs: 1_000,
    })).rejects.toMatchObject({code: "dispatch_executor_effect_denied:R01"});
    expect(invoke).not.toHaveBeenCalled();
  });

  it("records a timeout but allows the same identity to succeed on a later retry", async () => {
    const value = candidate();
    const invoke = vi.fn((_input: unknown, {signal}: {signal: AbortSignal}) => new Promise((resolve) => {
      const timer = setTimeout(() => resolve(executor.execute(input, {signal})), 100);
      signal.addEventListener("abort", () => clearTimeout(timer), {once: true});
    }));
    const delayed: InternalBundledExecutor = {
      ...executor,
      execute: invoke,
    };
    const dispatcher = runtime([delayed]);
    const timedOut = await dispatcher.execute({
      candidate: value, authorization: authorization(value), inputsByTaskId: {R01: input}, timeoutMs: 5,
    });
    expect(timedOut.receipt).toMatchObject({
      status: "failed", taskReceipts: [{status: "failed", error: {code: "timeout"}}],
    });
    expect(timedOut.outputsByTaskId).toEqual({});

    const retry = await dispatcher.execute({
      candidate: value, authorization: authorization(value), inputsByTaskId: {R01: input}, timeoutMs: 1_000,
    });
    expect(retry).toMatchObject({replayed: false, receipt: {status: "succeeded"}});
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("does not invoke a pre-cancelled task and allows the same identity to succeed on retry", async () => {
    const value = candidate();
    const invoke = vi.fn(executor.execute);
    const dispatcher = runtime([{...executor, execute: invoke}]);
    const controller = new AbortController();
    controller.abort();
    const cancelled = await dispatcher.execute({
      candidate: value, authorization: authorization(value), inputsByTaskId: {R01: input},
      timeoutMs: 1_000, signal: controller.signal,
    });
    expect(cancelled.receipt.taskReceipts[0]?.error?.code).toBe("cancelled");
    expect(invoke).not.toHaveBeenCalled();

    const retry = await dispatcher.execute({
      candidate: value, authorization: authorization(value), inputsByTaskId: {R01: input}, timeoutMs: 1_000,
    });
    expect(retry).toMatchObject({replayed: false, receipt: {status: "succeeded"}});
    expect(invoke).toHaveBeenCalledTimes(1);
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

  it("coalesces concurrent requests for the same identity into one execution", async () => {
    const value = candidate();
    const invoke = vi.fn(async (_input: unknown, {signal}: {signal: AbortSignal}) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return executor.execute(input, {signal});
    });
    const dispatcher = runtime([{...executor, execute: invoke}]);
    const request = () => dispatcher.execute({
      candidate: value, authorization: authorization(value), inputsByTaskId: {R01: input}, timeoutMs: 1_000,
    });
    const [first, coalesced] = await Promise.all([request(), request()]);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect([first.replayed, coalesced.replayed].sort()).toEqual([false, true]);
    expect(coalesced.receipt).toEqual(first.receipt);
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
