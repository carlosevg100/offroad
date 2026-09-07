import {createModelGateway, type AdapterResponse, type GatewayCallLog, type ModelGateway, type ProviderAdapter} from "@offroad/model-gateway";
import {describe, expect, it} from "vitest";

import {governedShadowAccessBasis, shadowIntentEnvelope, shadowRoutingOutputSchema, stampIntentEnvelope, type ShadowRoutingContext} from "./intent-shadow";

const field = <T,>(value: T, state: "explicit" | "inferred" | "ambiguous" | "unknown" = "explicit") => ({
  value, state, confidence: state === "explicit" ? 1 : 0.7,
});

function validOutput() {
  return shadowRoutingOutputSchema.parse({
    routingCore: {
      action: field(["understand"]), object: field([{id: "object-1", ordinal: 1, kind: "company", slots: [{key: "entity", value: "Camil"}]}]),
      decisionType: field("none"), audienceType: field("internal_senior"),
      depth: field("preliminary", "inferred"), continuity: field("new"), workResponsibility: field(["producer"]),
    },
    inferableContext: {
      jurisdiction: field(["BR"], "inferred"), asOfDate: field(null, "unknown"), currency: field("BRL", "inferred"),
      deadline: field(null, "unknown"), sponsorInstruction: field(null, "unknown"), constraints: field([]),
      urgency: field(null, "unknown"), availableInputs: field([]),
    },
    primaryWorks: [{work: "understand", confidence: 0.8}], composition: "understand_company_sector_asset",
    firstQuestion: null, abstain: false, abstainReason: null,
  });
}

function validObjectExtraction() {
  const text = "Camil";
  const start = context.message.indexOf(text);
  return {
    objects: [{
      candidateId: "candidate-1",
      kind: "company" as const,
      head: {key: "entity" as const, span: {source: "latest_user_message" as const, messageIndex: null, start, end: start + text.length, text}},
      modifiers: [],
    }],
    activeContextReferences: [],
    unresolvedReferences: [],
    excludedQuantitativeSpans: [],
  };
}

const context: ShadowRoutingContext = {
  locale: "pt-BR", message: "Analise a Camil.", recentMessages: [],
  organizationId: "20000000-0000-4000-8000-000000000001",
  projectId: "30000000-0000-4000-8000-000000000001",
  entryJob: "origination_thesis", accessBasis: "public_information", authorityGrants: ["read"], documentIds: [], professionalContext: null,
};

const activeContext = {
  schemaVersion: "active-work-context.v2" as const,
  contextId: "work:camil",
  organizationId: context.organizationId,
  projectId: context.projectId!,
  revision: 1,
  state: "active" as const,
  objective: {id: "objective:camil:1", revision: 1, fingerprint: "a".repeat(64), label: "Analisar Camil"},
  sourceManifest: {
    id: "manifest:camil:1", fingerprint: "b".repeat(64), documentIds: [],
    evidenceObjectIds: [context.projectId!, "objective:camil:1"],
  },
  objects: [{
    id: "ctx-company", ordinal: 1, kind: "company" as const,
    slots: [{key: "entity" as const, value: "Camil"}], label: "Camil",
    governance: {state: "system_resolved" as const, sourceIds: [context.projectId!]},
  }],
};

const activeBinding = {
  objectiveId: activeContext.objective.id,
  objectiveRevision: activeContext.objective.revision,
  objectiveFingerprint: activeContext.objective.fingerprint,
  sourceManifestId: activeContext.sourceManifest.id,
  sourceManifestFingerprint: activeContext.sourceManifest.fingerprint,
};

describe("shadow intent observability boundary", () => {
  it("does not infer evidence or authority from a project id or documents", () => {
    const output = validOutput();
    const unresolved = stampIntentEnvelope(output, {
      ...context,
      accessBasis: governedShadowAccessBasis("legacy_private_value"),
      authorityGrants: [],
      documentIds: ["40000000-0000-4000-8000-000000000001"],
    });
    expect(unresolved.executionContext.evidenceRegime).toEqual({value: "unresolved", state: "system"});
    expect(unresolved.executionContext.authority).toEqual({value: [], state: "system"});
  });

  it("stamps an external effect from the canonical composition policy, not from the model", () => {
    const output = validOutput();
    const introduced = stampIntentEnvelope({
      ...output,
      composition: "introduce",
      routingCore: {
        ...output.routingCore,
        action: field(["introduce"], "inferred"),
        depth: field("institutional", "inferred"),
        workResponsibility: field(["coordinator"], "inferred"),
      },
      primaryWorks: [{work: "capital_match", confidence: 0.99}],
    }, {...context, authorityGrants: []});
    expect(introduced.effect).toBe("external");
    expect(introduced.executionContext.authority.value).toEqual([]);
  });

  it("persists all 24 accepted objects without a narrower stamp-time slice", () => {
    const output = validOutput();
    const objects = Array.from({length: 24}, (_, index) => ({
      id: `object-${index + 1}`, ordinal: index + 1, kind: "claim" as const,
      slots: [{key: "subject" as const, value: `claim ${index + 1}`}],
    }));
    const stamped = stampIntentEnvelope({
      ...output,
      routingCore: {...output.routingCore, object: field(objects)},
    }, context);
    expect(stamped.routingCore.object.value).toHaveLength(24);
  });

  it("replaces the provider-controlled model identifier with the governed route", async () => {
    let completed = 0;
    const tasks: string[] = [];
    const gateway = {
      complete: async (request: {task: string}) => {
        completed += 1;
        tasks.push(request.task);
        return {
          output: request.task === "extract_semantic_objects" ? validObjectExtraction() : validOutput(),
          model: "CLIENT_SECRET_MODEL", provider: "anthropic", costUsd: 0.01, latencyMs: 10,
          attempts: [{provider: "anthropic", model: "CLIENT_SECRET_MODEL", outcome: "ok"}],
        };
      },
      spent: () => ({costUsd: completed * 0.01, calls: completed, unknownCostCalls: 0, budgetExposureUsd: completed * 0.01}),
    } as unknown as ModelGateway;
    const result = await shadowIntentEnvelope({gateway, context});
    expect(tasks.sort()).toEqual(["extract_semantic_objects", "route_intent"]);
    expect(result).toMatchObject({modelRoute: "governed_model_route", costUsd: 0.02, calls: 2});
    expect(result.semanticObjects).toMatchObject({
      modelRoute: "governed_model_route", attemptCount: 1,
      compilation: {status: "complete", objects: [{kind: "company", slots: [{key: "entity", value: "Camil"}]}]},
    });
    expect(JSON.stringify(result)).not.toContain("CLIENT_SECRET_MODEL");
  });

  it("passes governed active work context only to the object contract and fails closed on incomplete coverage", async () => {
    let completed = 0;
    let objectPayload: unknown;
    let routePayload: unknown;
    let objectValidator: ((output: ReturnType<typeof validObjectExtraction>) => {accepted: boolean}) | undefined;
    const gateway = {
      complete: async (request: {task: string; input: Array<{type: string; text: string}>; validateOutput?: typeof objectValidator}) => {
        completed += 1;
        if (request.task === "extract_semantic_objects") {
          objectPayload = JSON.parse(request.input[0]!.text);
          objectValidator = request.validateOutput;
        }
        else routePayload = JSON.parse(request.input[0]!.text);
        return {
          output: request.task === "extract_semantic_objects"
            ? {objects: [], activeContextReferences: [], unresolvedReferences: [], excludedQuantitativeSpans: []}
            : validOutput(),
          model: "CLIENT_SECRET_MODEL", provider: "anthropic", costUsd: 0.01, latencyMs: 10,
          attempts: [{provider: "anthropic", model: "CLIENT_SECRET_MODEL", outcome: "ok"}],
        };
      },
      spent: () => ({costUsd: completed * 0.01, calls: completed, unknownCostCalls: 0, budgetExposureUsd: completed * 0.01}),
    } as unknown as ModelGateway;
    const result = await shadowIntentEnvelope({
      gateway,
      context: {
        ...context,
        activeWorkContext: activeContext,
        activeWorkContextBinding: activeBinding,
      },
    });
    expect(objectPayload).toMatchObject({activeWorkContext: {contextId: "work:camil", revision: 1}});
    expect(routePayload).not.toHaveProperty("activeWorkContext");
    expect(objectValidator?.({objects: [], activeContextReferences: [], unresolvedReferences: [], excludedQuantitativeSpans: []})).toMatchObject({accepted: false});
    expect(result.semanticObjects.compilation).toMatchObject({status: "incomplete", usableObjects: []});
    expect(result.output).toMatchObject({abstain: true, composition: null});
  });

  it("repairs a schema-valid but semantically incomplete extraction before canonical routing", async () => {
    const logs: GatewayCallLog[] = [];
    let objectAttempt = 0;
    const adapter: ProviderAdapter = {
      provider: "anthropic",
      complete: async (request): Promise<AdapterResponse> => {
        const output = request.schemaName === "semantic_object_extractor_output"
          ? (++objectAttempt === 1
              ? {objects: [], activeContextReferences: [], unresolvedReferences: [], excludedQuantitativeSpans: []}
              : validObjectExtraction())
          : validOutput();
        return {output, rawText: JSON.stringify(output), usage: {inputTokens: 10, outputTokens: 10, cachedInputTokens: 0}, model: request.model, stopReason: "end"};
      },
    };
    const gateway = createModelGateway({adapters: {anthropic: adapter}, onCall: (call) => logs.push(call)});

    const result = await shadowIntentEnvelope({gateway, context});

    expect(result.output.abstain).toBe(false);
    expect(result.semanticObjects.compilation.status).toBe("complete");
    expect(result.semanticObjects.routingAttempt).toMatchObject({
      provider: "anthropic", model: "claude-sonnet-5", retryOrdinal: 1,
      isSameModelRepair: true, usedProviderFallback: false, attemptCount: 2,
    });
    expect(logs.filter(({task}) => task === "extract_semantic_objects")).toMatchObject([
      {outcome: "invalid_output", isSameModelRepair: false, usedProviderFallback: false},
      {outcome: "ok", isSameModelRepair: true, usedProviderFallback: false},
    ]);
  });

  it("falls back providers when the bounded semantic repair is still incomplete", async () => {
    const logs: GatewayCallLog[] = [];
    const anthropic: ProviderAdapter = {
      provider: "anthropic",
      complete: async (request): Promise<AdapterResponse> => {
        const output = request.schemaName === "semantic_object_extractor_output"
          ? {objects: [], activeContextReferences: [], unresolvedReferences: [], excludedQuantitativeSpans: []}
          : validOutput();
        return {output, rawText: JSON.stringify(output), usage: {inputTokens: 10, outputTokens: 10, cachedInputTokens: 0}, model: request.model, stopReason: "end"};
      },
    };
    const openai: ProviderAdapter = {
      provider: "openai",
      complete: async (request): Promise<AdapterResponse> => {
        const output = request.schemaName === "semantic_object_extractor_output" ? validObjectExtraction() : validOutput();
        return {output, rawText: JSON.stringify(output), usage: {inputTokens: 10, outputTokens: 10, cachedInputTokens: 0}, model: request.model, stopReason: "end"};
      },
    };
    const gateway = createModelGateway({adapters: {anthropic, openai}, onCall: (call) => logs.push(call)});

    const result = await shadowIntentEnvelope({gateway, context});

    expect(result.output.abstain).toBe(false);
    expect(result.semanticObjects.routingAttempt).toMatchObject({
      provider: "openai", model: "gpt-5.6-terra", retryOrdinal: 0,
      isSameModelRepair: false, usedProviderFallback: true, attemptCount: 3,
    });
    expect(logs.filter(({task}) => task === "extract_semantic_objects").map(({outcome, provider, isSameModelRepair, usedProviderFallback}) =>
      ({outcome, provider, isSameModelRepair, usedProviderFallback}))).toEqual([
      {outcome: "invalid_output", provider: "anthropic", isSameModelRepair: false, usedProviderFallback: false},
      {outcome: "invalid_output", provider: "anthropic", isSameModelRepair: true, usedProviderFallback: false},
      {outcome: "ok", provider: "openai", isSameModelRepair: false, usedProviderFallback: true},
    ]);
  });

  it("rejects a governed context whose tenant, objective or manifest binding is stale", async () => {
    const gateway = {complete: async () => { throw new Error("must fail before provider"); }, spent: () => ({costUsd: 0, calls: 0, unknownCostCalls: 0, budgetExposureUsd: 0})} as unknown as ModelGateway;
    await expect(shadowIntentEnvelope({gateway, context: {
      ...context,
      activeWorkContext: {...activeContext, organizationId: "20000000-0000-4000-8000-000000000099"},
      activeWorkContextBinding: activeBinding,
    }})).rejects.toThrow("active_work_context_scope_mismatch");
    await expect(shadowIntentEnvelope({gateway, context: {
      ...context, activeWorkContext: activeContext,
      activeWorkContextBinding: {...activeBinding, objectiveFingerprint: "c".repeat(64)},
    }})).rejects.toThrow("active_work_context_revision_mismatch");
    await expect(shadowIntentEnvelope({gateway, context: {
      ...context,
      activeWorkContext: {
        ...activeContext,
        sourceManifest: {...activeContext.sourceManifest, documentIds: ["40000000-0000-4000-8000-000000000001"]},
      },
      activeWorkContextBinding: activeBinding,
    }})).rejects.toThrow("active_work_context_document_mismatch");
  });

  it("fails closed before returning an envelope when spend telemetry is invalid", async () => {
    let completed = 0;
    const gateway = {
      complete: async (request: {task: string}) => {
        completed += 1;
        return {
          output: request.task === "extract_semantic_objects" ? validObjectExtraction() : validOutput(),
          model: "CLIENT_SECRET_MODEL", provider: "anthropic", costUsd: 0.01, latencyMs: 10,
          attempts: [{provider: "anthropic", model: "CLIENT_SECRET_MODEL", outcome: "ok"}],
        };
      },
      spent: () => completed > 0
        ? {costUsd: Number.NaN, calls: Number.POSITIVE_INFINITY, unknownCostCalls: 0, budgetExposureUsd: 20_000}
        : {costUsd: 0, calls: 0, unknownCostCalls: 0, budgetExposureUsd: 0},
    } as unknown as ModelGateway;
    await expect(shadowIntentEnvelope({gateway, context})).rejects.toThrow("invalid_model_telemetry");
  });
});
