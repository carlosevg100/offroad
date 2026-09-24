import {
  executionCanonicalText,
  intentClassifierOutputSchema,
  intentRouterGoldResultSchema,
  intentRouterGoldSnapshotSchema,
  runIntentRouterGold,
  type IntentRouterGoldCallLog,
  type IntentRouterGoldGateway,
  type IntentRouterGoldRequest,
  type IntentRouterGoldResult,
} from "@offroad/agent-contracts";
import {fingerprintJson} from "@offroad/case-understanding";
import {defaultTaskPolicies} from "@offroad/model-gateway";
import {describe, expect, it} from "vitest";
import type {z} from "zod";

import {intentGoldTurns} from "./intent-gold";
import {verifyIntentRouterEvidenceRecord} from "./intent-router-call-evidence";
import {expectedIntentRouterManifest} from "./intent-router-gate";
import {intentGoldClassifierInput, intentGoldMessage, intentGoldObjectInput} from "./intent-router-gate-input";
import {
  buildIntentRouterGoldSnapshot,
  intentRouterGoldBudget,
  intentRouterGoldPreflightRecord,
  intentRouterGoldRecord,
  readIntentRouterGovernedResult,
} from "./intent-router-gold-transport";

const provenance = {trust: "github_actions_main_environment" as const, repository: "carlosevg100/offroad", ref: "refs/heads/main", gitSha: "a".repeat(40),
  workflowRef: "carlosevg100/offroad/.github/workflows/intent-router-gold.yml@refs/heads/main", eventName: "workflow_dispatch", runId: "1", runAttempt: "1",
  cryptographicAttestation: false as const};

/** A schema-valid router answer; the gate scores it, the transport only carries it. */
const routed = intentClassifierOutputSchema.parse({
  routingCore: {
    action: {value: ["understand"], state: "unknown"}, object: {value: [], state: "unknown"},
    decisionType: {value: "none", state: "not_applicable"}, audienceType: {value: "unspecified", state: "unknown"},
    depth: {value: "point", state: "unknown"}, continuity: {value: "new", state: "unknown"}, workResponsibility: {value: [], state: "unknown"},
  },
  inferableContext: {
    jurisdiction: {value: [], state: "unknown"}, asOfDate: {value: null, state: "unknown"}, currency: {value: null, state: "unknown"},
    deadline: {value: null, state: "unknown"}, sponsorInstruction: {value: null, state: "unknown"}, constraints: {value: [], state: "unknown"},
    urgency: {value: null, state: "unknown"}, availableInputs: {value: [], state: "unknown"},
  },
  primaryWorks: [], composition: null, firstQuestion: null, abstain: true, abstainReason: "synthetic abstention",
});
const noObjects = {objects: [], activeContextReferences: [], unresolvedReferences: [], excludedQuantitativeSpans: [], excludedSemanticHeadSpans: []};

/** The committed result of a synthetic run of the canonical snapshot, as JSON, from a port that answers every call. */
async function committed(failProvider?: "openai"): Promise<IntentRouterGoldResult> {
  const calls: IntentRouterGoldCallLog[] = [];
  const spent = {costUsd: 0, calls: 0, unknownCostCalls: 0, budgetExposureUsd: 0};
  const gateway: IntentRouterGoldGateway = {
    async complete<TSchema extends z.ZodType>(request: IntentRouterGoldRequest<TSchema>) {
      const route = request.model ?? defaultTaskPolicies[request.task].primary;
      spent.calls += 1;
      calls.push({invocationId: `invocation-${calls.length + 1}`, task: request.task, provider: route.provider, configuredModel: route.model, model: route.model,
        effort: route.effort, outcome: "ok", promptFingerprint: "a".repeat(64), inputFingerprint: "b".repeat(64), outputFingerprint: "c".repeat(64),
        usage: {inputTokens: 10, outputTokens: 2, cachedInputTokens: 0}, costUsd: 0, costStatus: "measured", latencyMs: 1, stopReason: "end",
        usedFallback: false, retryOrdinal: 0, isSameModelRepair: false, usedProviderFallback: false, fromCassette: false,
        schemaName: request.task === "route_intent" ? "shadow_routing_output" : "semantic_object_extractor_output", metadata: {...request.metadata}});
      if (route.provider === failProvider) throw new Error("synthetic outage");
      return {output: (request.task === "route_intent" ? routed : noObjects) as z.infer<TSchema>, provider: route.provider, model: route.model};
    },
    spent: () => ({...spent}),
    calls: () => calls,
  };
  const snapshot = intentRouterGoldSnapshotSchema.parse(JSON.parse(executionCanonicalText(buildIntentRouterGoldSnapshot())));
  return intentRouterGoldResultSchema.parse(JSON.parse(JSON.stringify(await runIntentRouterGold(snapshot, gateway))));
}

describe("intent router gold snapshot", () => {
  it("carries the 52 observations of the manifest, in order, and nothing of the answer key", () => {
    const snapshot = buildIntentRouterGoldSnapshot();
    const manifest = expectedIntentRouterManifest();
    expect(snapshot.observations.map(({turnId, repeat}) => `${turnId}:${repeat}`)).toEqual(manifest.map(({turnId, repeat}) => `${turnId}:${repeat}`));
    expect([snapshot.preflight.caseId, snapshot.preflight.turnId]).toEqual(["gc01", "gc01-t01"]);
    expect(snapshot.audience).toEqual({caseId: "intent-router-gold", caseVersion: `manifest-${fingerprintJson(manifest).slice(0, 16)}`});
    expect(snapshot.model).toEqual({
      route_intent: {primary: defaultTaskPolicies.route_intent.primary, fallback: defaultTaskPolicies.route_intent.fallback, maxOutputTokens: 4000},
      extract_semantic_objects: {primary: defaultTaskPolicies.extract_semantic_objects.primary, fallback: defaultTaskPolicies.extract_semantic_objects.fallback, maxOutputTokens: 3000},
    });
    const text = executionCanonicalText(snapshot);
    expect(text).not.toMatch(/"(expected|firstQuestionSignals|semantic|suite|stabilityParaphrases)":/);
  });

  it("sends each pass exactly the bytes the canonical builders produce, after the snapshot's canonical round trip", () => {
    const received = intentRouterGoldSnapshotSchema.parse(JSON.parse(executionCanonicalText(buildIntentRouterGoldSnapshot())));
    const turns = new Map(intentGoldTurns.map((turn) => [turn.id, turn]));
    for (const observation of received.observations) {
      const turn = turns.get(observation.turnId)!;
      const message = intentGoldMessage(turn, observation.repeat);
      expect(JSON.stringify(observation.classifierInput)).toBe(JSON.stringify(intentGoldClassifierInput(turn, message)));
      expect(JSON.stringify(observation.objectInput)).toBe(JSON.stringify(intentGoldObjectInput(turn, message)));
    }
    const first = intentGoldTurns[0]!;
    expect(JSON.stringify(received.preflight.classifierInput)).toBe(JSON.stringify(intentGoldClassifierInput(first, first.message)));
    expect(JSON.stringify(received.preflight.objectInput)).toBe(JSON.stringify(intentGoldObjectInput(first, first.message)));
  });

  it("budgets the calls the script's own gateway always allowed, each at its task's whole timeout", () => {
    const budget = intentRouterGoldBudget(buildIntentRouterGoldSnapshot(), 3);
    expect(budget).toEqual({maxCostMicrousd: 3_000_000, maxModelCalls: 320, maxDurationMs: 320 * 60_000, expiresInMs: 320 * 60_000 + 30 * 60_000});
  });
});

describe("intent router gold result", () => {
  it("reads the committed run of exactly this snapshot and records the gate as the script always did", async () => {
    const snapshot = buildIntentRouterGoldSnapshot();
    const result = readIntentRouterGovernedResult(await committed(), snapshot);
    if (result.outcome !== "observed") throw new Error("expected observations");
    const record = intentRouterGoldRecord({result, maxCostUsd: 3, provenance, generatedAt: "2026-09-24T12:00:00.000Z"});
    expect(record.runs.map(({turnId, repeat}) => `${turnId}:${repeat}`)).toEqual(snapshot.observations.map(({turnId, repeat}) => `${turnId}:${repeat}`));
    for (const run of record.runs) expect(run.expected).toEqual(intentGoldTurns.find((turn) => turn.id === run.turnId)!.expected);
    expect(record).toMatchObject({observations: 52, uniqueTurns: 40, manifestPassed: true, stabilityRepeats: 3, provenance,
      budget: {maxCostUsd: 3, plannedObservations: 52, plannedProviderOperations: 104, plannedPreflightOperations: 4},
      attemptTelemetry: {observations: 52, totalProviderAttempts: 108, observationProviderAttempts: 52, objectProviderAttempts: 52, preflightProviderAttempts: 4}});
    expect(record.expectedManifest).toEqual(expectedIntentRouterManifest());
    expect(record.calls).toEqual(result.calls);
    // A synthetic abstention on every turn is carried faithfully and fails the gate on its merits.
    expect(record.passed).toBe(false);
    expect(record.callEvidence.linkedObservationOperations).toBe(104);
    expect(verifyIntentRouterEvidenceRecord(JSON.parse(JSON.stringify(record)) as Record<string, unknown>)).toBe(true);
  });

  it("records a failed preflight as provider-preflight.json always held it", async () => {
    const snapshot = buildIntentRouterGoldSnapshot();
    const result = readIntentRouterGovernedResult(await committed("openai"), snapshot);
    if (result.outcome !== "preflight_failed") throw new Error("expected a failed preflight");
    expect(intentRouterGoldPreflightRecord({result, generatedAt: "2026-09-24T12:00:00.000Z"})).toEqual({
      generatedAt: "2026-09-24T12:00:00.000Z", passed: false, providers: result.providerPreflight, gatewaySpent: result.gatewaySpent, calls: result.calls});
    expect(result.providerPreflight.map(({provider, passed}) => [provider, passed])).toEqual([["anthropic", true], ["openai", false], ["anthropic", true], ["openai", false]]);
  });

  type Mutable = Record<string, any>;
  it.each<[string, (result: Mutable) => void]>([
    ["observations out of order", (result) => { result.observations.reverse(); }],
    ["a missing observation", (result) => { result.observations.pop(); }],
    ["an observation of another turn", (result) => { result.observations[0].turnId = "gc02-t01"; }],
    ["an observation on other inputs", (result) => { result.observations[0].classifierInputFingerprint = "d".repeat(64); }],
    ["preflight rows out of order", (result) => { result.providerPreflight.reverse(); }],
    ["a missing preflight row", (result) => { result.providerPreflight.pop(); }],
    ["a failed preflight row under observations", (result) => { result.providerPreflight[0].passed = false; }],
    ["a call labelled with a turn the snapshot did not send", (result) => { result.calls.at(-1).metadata.turnId = "gc02-t09"; }],
    ["a call on a route the snapshot did not declare", (result) => { result.calls.at(-1).configuredModel = "claude-opus-5"; }],
    ["a call without a known surface", (result) => { result.calls.at(-1).metadata.surface = "elsewhere"; }],
    ["a call of the router labelled as the extractor's", (result) => { result.calls[4].metadata.surface = "intent_object_gold"; }],
    ["a result field the schema does not name", (result) => { result.extra = true; }],
  ])("refuses %s", async (_label, change) => {
    const result = structuredClone(await committed()) as Mutable;
    change(result);
    expect(() => readIntentRouterGovernedResult(result, buildIntentRouterGoldSnapshot())).toThrow();
  });

  it("refuses a failed-preflight outcome whose rows all passed", async () => {
    const result = structuredClone(await committed("openai")) as Mutable;
    for (const row of result.providerPreflight) row.passed = true;
    expect(() => readIntentRouterGovernedResult(result, buildIntentRouterGoldSnapshot())).toThrow("preflight outcome");
  });
});
