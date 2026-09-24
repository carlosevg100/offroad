import {createHash} from "node:crypto";

import {fingerprintJson} from "@offroad/case-understanding";
import {describe, expect, it} from "vitest";
import type {z} from "zod";

import {INTENT_CLASSIFIER_SYSTEM, intentClassifierOutputSchema, type IntentClassifierOutput} from "./intent-classifier";
import {
  IntentRouterProviderPreflightError,
  intentRouterGoldResultSchema,
  intentRouterGoldRoutes,
  intentRouterGoldSnapshotContentHashes,
  intentRouterGoldSnapshotSchema,
  preflightIntentRouterProviders,
  runIntentRouterGold,
  type IntentRouterGoldCallLog,
  type IntentRouterGoldGateway,
  type IntentRouterGoldRequest,
  type IntentRouterGoldSnapshot,
} from "./intent-router-gold";
import {SEMANTIC_OBJECT_EXTRACTOR_SYSTEM, semanticObjectExtractorOutputSchema, validateSemanticObjectOutput, type SemanticObjectExtractorOutput} from "./semantic-object-extractor";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const sonnet = {provider: "anthropic" as const, model: "claude-sonnet-5", effort: "low" as const};
const terra = {provider: "openai" as const, model: "gpt-5.6-terra", effort: "low" as const};

/** Synthetic turns, authored for this test: two phrasings of one request and one other request. */
const messages = {
  first: "Preciso preparar uma reunião com a Camil sobre refinanciamento.",
  paraphrase: "Quero me preparar para a reunião com a Camil sobre refinanciamento.",
  other: "Organize a reunião com a Camil sobre refinanciamento amanhã.",
};
const inputs = (message: string) => ({
  classifierInput: {locale: "pt-BR" as const, latestUserMessage: message, recentConversation: [], entryJob: null, documentCount: 0},
  objectInput: {locale: "pt-BR" as const, latestUserMessage: message, recentConversation: [], activeWorkContext: null},
});
const snapshot = (): IntentRouterGoldSnapshot => intentRouterGoldSnapshotSchema.parse({
  schemaVersion: "intent-router-gold-snapshot.v1",
  audience: {caseId: "intent-router-gold", caseVersion: `manifest-${"a".repeat(16)}`},
  model: {
    route_intent: {primary: sonnet, fallback: terra, maxOutputTokens: 4000},
    extract_semantic_objects: {primary: sonnet, fallback: terra, maxOutputTokens: 3000},
  },
  preflight: {caseId: "gc01", turnId: "gc01-t01", ...inputs(messages.first)},
  observations: [
    {caseId: "gc01", turnId: "gc01-t01", repeat: 1, ...inputs(messages.first)},
    {caseId: "gc01", turnId: "gc01-t01", repeat: 2, ...inputs(messages.paraphrase)},
    {caseId: "gc05", turnId: "gc05-t01", repeat: 1, ...inputs(messages.other)},
  ],
});

const routed: IntentClassifierOutput = intentClassifierOutputSchema.parse({
  routingCore: {
    action: {value: ["prepare_meeting"], state: "inferred", confidence: 0.9},
    object: {value: [{id: "object-1", ordinal: 1, kind: "company", slots: [{key: "entity", value: "Camil"}]}], state: "explicit"},
    decisionType: {value: "none", state: "not_applicable"},
    audienceType: {value: "self", state: "explicit"},
    depth: {value: "preliminary", state: "inferred", confidence: 0.9},
    continuity: {value: "new", state: "inferred", confidence: 0.9},
    workResponsibility: {value: ["producer"], state: "inferred", confidence: 0.9},
  },
  inferableContext: {
    jurisdiction: {value: ["BR"], state: "inferred", confidence: 0.9}, asOfDate: {value: null, state: "unknown"},
    currency: {value: null, state: "unknown"}, deadline: {value: null, state: "unknown"}, sponsorInstruction: {value: null, state: "unknown"},
    constraints: {value: [], state: "unknown"}, urgency: {value: null, state: "unknown"}, availableInputs: {value: [], state: "unknown"},
  },
  primaryWorks: [{work: "understand", confidence: 0.9}],
  composition: "prepare_meeting",
  firstQuestion: null,
  abstain: false,
  abstainReason: null,
});

/** An attributable extraction of the two heads every synthetic message names. */
function extraction(message: string): SemanticObjectExtractorOutput {
  const span = (text: string) => {
    const start = message.indexOf(text);
    return {source: "latest_user_message" as const, messageIndex: null, start, end: start + text.length, text};
  };
  return semanticObjectExtractorOutputSchema.parse({
    objects: [
      {candidateId: "candidate-1", kind: "company", head: {key: "entity", span: span("Camil")}, modifiers: []},
      {candidateId: "candidate-2", kind: "operation", head: {key: "subject", span: span("refinanciamento")}, modifiers: []},
    ],
    activeContextReferences: [], unresolvedReferences: [], excludedQuantitativeSpans: [], excludedSemanticHeadSpans: [],
  });
}
const noObjects: SemanticObjectExtractorOutput = {objects: [], activeContextReferences: [], unresolvedReferences: [], excludedQuantitativeSpans: [], excludedSemanticHeadSpans: []};

type Answer = {output: unknown; provider?: string; model?: string} | Error;
/**
 * A model port that records every request, answers from the given script, and keeps a ledger in the
 * shape the gateway reports: one measured call log per request. It yields before answering, so two
 * requests in flight at once would be visible.
 */
function port(answer: (request: IntentRouterGoldRequest<z.ZodType>, index: number) => Answer) {
  const requests: IntentRouterGoldRequest<z.ZodType>[] = [];
  const calls: IntentRouterGoldCallLog[] = [];
  const spent = {costUsd: 0, calls: 0, unknownCostCalls: 0, budgetExposureUsd: 0};
  let inFlight = 0, maxInFlight = 0;
  const gateway: IntentRouterGoldGateway = {
    async complete<TSchema extends z.ZodType>(request: IntentRouterGoldRequest<TSchema>) {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      requests.push(request as unknown as IntentRouterGoldRequest<z.ZodType>);
      await new Promise((done) => setTimeout(done, 1));
      const reply = answer(request as unknown as IntentRouterGoldRequest<z.ZodType>, requests.length - 1);
      const route = request.model ?? sonnet;
      spent.calls += 1;
      spent.costUsd += 0.002;
      spent.budgetExposureUsd += 0.002;
      calls.push({
        invocationId: `invocation-${requests.length}`, task: request.task, provider: route.provider, configuredModel: route.model, model: route.model,
        effort: route.effort, outcome: reply instanceof Error ? "error" : "ok", promptFingerprint: "a".repeat(64), inputFingerprint: "b".repeat(64),
        outputFingerprint: "c".repeat(64), usage: {inputTokens: 100, outputTokens: 20, cachedInputTokens: 0}, costUsd: 0.002, costStatus: "measured",
        latencyMs: 5, stopReason: "end", usedFallback: false, retryOrdinal: 0, isSameModelRepair: false, usedProviderFallback: false, fromCassette: false,
        schemaName: request.task === "route_intent" ? "shadow_routing_output" : "semantic_object_extractor_output", metadata: {...request.metadata},
      });
      inFlight -= 1;
      if (reply instanceof Error) throw reply;
      return {output: reply.output as z.infer<TSchema>, provider: reply.provider ?? route.provider, model: reply.model ?? route.model};
    },
    spent: () => ({...spent}),
    calls: () => calls,
  };
  return {gateway, requests, calls, maxInFlight: () => maxInFlight};
}
const answerAll = (request: IntentRouterGoldRequest<z.ZodType>): Answer => request.task === "route_intent"
  ? {output: routed}
  : {output: extraction(JSON.parse(request.input[0]!.text).latestUserMessage as string)};
let tick = 0;
const clock = () => new Date(Date.UTC(2026, 8, 24, 12, 0, 0) + (tick += 7));

describe("intent router gold snapshot", () => {
  it("reads a strict snapshot and names its routes once, primary first, and no content hash", () => {
    const s = snapshot();
    expect(intentRouterGoldRoutes(s)).toEqual([sonnet, terra]);
    expect(intentRouterGoldSnapshotContentHashes(s)).toEqual([]);
  });

  it.each<[string, (value: Record<string, any>) => void]>([
    ["an unknown top-level field", (value) => { value.extra = true; }],
    ["an unknown field in a classifier input", (value) => { value.observations[0].classifierInput.extra = 1; }],
    ["an unknown field in a conversation message", (value) => { value.observations[0].classifierInput.recentConversation = [{role: "user", content: "x", extra: 1}]; }],
    ["an unknown field in the model settings", (value) => { value.model.route_intent.primary.extra = 1; }],
    ["two passes that read different turns", (value) => { value.observations[0].objectInput.latestUserMessage = messages.other; }],
    ["the same turn and repeat observed twice", (value) => { value.observations[1] = structuredClone(value.observations[0]); }],
    ["an audience outside the gate", (value) => { value.audience.caseId = "gc01-analista-ib-camil"; }],
    ["another snapshot version", (value) => { value.schemaVersion = "intent-router-gold-snapshot.v2"; }],
  ])("refuses %s", (_label, change) => {
    const value = structuredClone(snapshot()) as Record<string, any>;
    change(value);
    expect(intentRouterGoldSnapshotSchema.safeParse(value).success).toBe(false);
  });
});

describe("intent router gold run", () => {
  it("proves every route, then runs router and extractor on every observation one attempt at a time", async () => {
    const s = snapshot();
    const p = port(answerAll);
    const result = await runIntentRouterGold(s, p.gateway, clock);
    expect(p.maxInFlight()).toBe(1);
    // Preflight: each task on each configured route, fallback disabled, then each observation, router first.
    expect(p.requests.map((request) => [request.task, request.model?.provider ?? null, request.allowFallback ?? null, request.metadata?.surface])).toEqual([
      ["route_intent", "anthropic", false, "intent_router_provider_preflight"],
      ["route_intent", "openai", false, "intent_router_provider_preflight"],
      ["extract_semantic_objects", "anthropic", false, "intent_router_provider_preflight"],
      ["extract_semantic_objects", "openai", false, "intent_router_provider_preflight"],
      ...s.observations.flatMap((observation) => [
        ["route_intent", null, null, "intent_router_gold"],
        ["extract_semantic_objects", null, null, "intent_object_gold"],
      ]),
    ]);
    const [routeRequest, objectRequest] = p.requests.slice(4, 6);
    expect(routeRequest).toMatchObject({system: INTENT_CLASSIFIER_SYSTEM, schema: intentClassifierOutputSchema, schemaName: "shadow_routing_output", outputMode: "prompted_json", thinking: "off",
      input: [{type: "text", text: JSON.stringify(s.observations[0]!.classifierInput)}], metadata: {surface: "intent_router_gold", caseId: "gc01", turnId: "gc01-t01", repeat: "1"}});
    expect(objectRequest).toMatchObject({system: SEMANTIC_OBJECT_EXTRACTOR_SYSTEM, schema: semanticObjectExtractorOutputSchema, schemaName: "semantic_object_extractor_output",
      input: [{type: "text", text: JSON.stringify(s.observations[0]!.objectInput)}], metadata: {surface: "intent_object_gold", caseId: "gc01", turnId: "gc01-t01", repeat: "1"}});
    // The extractor's deterministic acceptance gate travels with the request and reads this turn.
    expect(objectRequest!.validateOutput!(extraction(messages.first))).toEqual({accepted: true});
    expect(objectRequest!.validateOutput!(noObjects).accepted).toBe(false);
    expect(p.requests[0]!.metadata).toEqual({caseId: "gc01", turnId: "gc01-t01", surface: "intent_router_provider_preflight", provider: "anthropic", configuredModel: "claude-sonnet-5"});

    expect(intentRouterGoldResultSchema.parse(result)).toEqual(result);
    if (result.outcome !== "observed") throw new Error("expected observations");
    expect(result.providerPreflight.map(({task, provider, passed, attemptCount}) => [task, provider, passed, attemptCount])).toEqual([
      ["route_intent", "anthropic", true, 1], ["route_intent", "openai", true, 1],
      ["extract_semantic_objects", "anthropic", true, 1], ["extract_semantic_objects", "openai", true, 1],
    ]);
    expect(result.calls).toEqual(p.calls);
    expect(result.gatewaySpent).toEqual(p.gateway.spent());
    expect(result.gatewaySpent).toMatchObject({calls: 10, unknownCostCalls: 0});
    const first = result.observations[0]!;
    expect(first).toMatchObject({caseId: "gc01", turnId: "gc01-t01", repeat: 1, error: null, provider: "anthropic", model: "claude-sonnet-5",
      routeAttemptCount: 1, routeCostUsd: 0.002, routeLatencyMs: 5, objectAttemptCount: 1, objectCostUsd: 0.002, objectLatencyMs: 5});
    expect(first.classifierInputFingerprint).toBe(fingerprintJson(s.observations[0]!.classifierInput));
    expect(first.objectInputFingerprint).toBe(fingerprintJson(s.observations[0]!.objectInput));
    expect(first.rawActualFingerprint).toBe(fingerprintJson(routed));
    expect(first.rawObjectActualFingerprint).toBe(fingerprintJson(extraction(messages.first)));
    expect(first.objectCompilation?.status).toBe("complete");
    expect(first.actual?.composition).toBe("prepare_meeting");
    expect(first.actualFingerprint).toBe(fingerprintJson(first.actual));
    expect(first.costUsd).toBeCloseTo(0.004, 12);
    expect(first.latencyMs).toBeGreaterThan(0);
  });

  it("stops at the preflight when a configured route fails it and publishes only the preflight and its ledger", async () => {
    const s = snapshot();
    const p = port((request) => request.model?.provider === "openai" && request.task === "extract_semantic_objects"
      ? Object.assign(new Error("synthetic contract rejection"), {name: "ModelGatewayError", code: "all_attempts_failed"}) : answerAll(request));
    const result = await runIntentRouterGold(s, p.gateway, clock);
    expect(result.outcome).toBe("preflight_failed");
    expect(p.requests).toHaveLength(4);
    expect(result.providerPreflight.map(({provider, task, passed, error}) => [task, provider, passed, error])).toEqual([
      ["route_intent", "anthropic", true, null], ["route_intent", "openai", true, null],
      ["extract_semantic_objects", "anthropic", true, null], ["extract_semantic_objects", "openai", false, "ModelGatewayError:all_attempts_failed"],
    ]);
    expect(result).toEqual(intentRouterGoldResultSchema.parse(result));
    expect(result).not.toHaveProperty("observations");
    expect(result.calls).toHaveLength(4);
  });

  it("records a failed pass exactly as the concurrent script did, keeping the other pass's output", async () => {
    const s = snapshot();
    const p = port((request, index) => index === 5 ? new Error("synthetic extractor outage") : answerAll(request));
    const result = await runIntentRouterGold(s, p.gateway, clock);
    if (result.outcome !== "observed") throw new Error("expected observations");
    const failed = result.observations[0]!;
    // The pass failures are joined into one error and caught with their class, as the script recorded them.
    expect(failed).toMatchObject({error: "Error: Error: synthetic extractor outage", rawActual: routed, rawActualFingerprint: fingerprintJson(routed), rawObjectActual: null,
      rawObjectActualFingerprint: null, objectCompilation: null, actual: null, actualFingerprint: null, objectProvider: null, objectModel: null, objectAttemptCount: 1});
    expect(result.observations.slice(1).every((observation) => observation.error === null)).toBe(true);
  });

  it("publishes a result the script can read, and refuses one it could not bind", async () => {
    const result = await runIntentRouterGold(snapshot(), port(answerAll).gateway, clock);
    const published = JSON.parse(JSON.stringify(result)) as Record<string, any>;
    expect(intentRouterGoldResultSchema.parse(published)).toEqual(published);
    for (const change of [
      (value: Record<string, any>) => { value.schemaVersion = "intent-router-gold-result.v2"; },
      (value: Record<string, any>) => { value.extra = true; },
      (value: Record<string, any>) => { value.calls[0].prompt = "never carried"; },
      (value: Record<string, any>) => { value.calls[0].usage.extra = 1; },
      (value: Record<string, any>) => { value.observations[0].expected = {}; },
      (value: Record<string, any>) => { value.observations[0].rawActualFingerprint = "not a hash"; },
      (value: Record<string, any>) => { value.outcome = "preflight_failed"; },
    ]) {
      const altered = structuredClone(published);
      change(altered);
      expect(intentRouterGoldResultSchema.safeParse(altered).success).toBe(false);
    }
  });
});

describe("intent router provider preflight", () => {
  it("reads a gateway error by its class and code and nothing else", async () => {
    const p = port(() => Object.assign(new Error(`provider said: ${hash("secret")}`), {name: "ModelGatewayError", code: "timeout"}));
    const error = await preflightIntentRouterProviders(p.gateway, [sonnet], {
      task: "route_intent", system: INTENT_CLASSIFIER_SYSTEM, input: [{type: "text", text: "{}"}], schema: intentClassifierOutputSchema,
      schemaName: "shadow_routing_output", outputMode: "prompted_json", thinking: "off",
    }).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(IntentRouterProviderPreflightError);
    expect((error as IntentRouterProviderPreflightError).results[0]).toMatchObject({passed: false, error: "ModelGatewayError:timeout", attemptCount: 1});
  });

  it("accepts a valid attributable extraction of the synthetic turn", () => {
    expect(validateSemanticObjectOutput(inputs(messages.first).objectInput, extraction(messages.first))).toEqual({accepted: true});
  });
});
