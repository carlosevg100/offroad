import {
  intentRouterGoldResultSchema,
  intentRouterGoldRoutes,
  intentRouterGoldSnapshotSchema,
  type IntentRouterGoldResult,
  type IntentRouterGoldSnapshot,
  type IntentRouterGoldTask,
} from "@offroad/agent-contracts";
import {fingerprintJson} from "@offroad/case-understanding";
import {defaultTaskPolicies, type GatewayCallLog, type TaskKind, type TaskPolicy} from "@offroad/model-gateway";

import {assertCanonicalIntentGold, intentGoldTurns, stabilityIntentTurnIds} from "./intent-gold";
import {fingerprintIntentRouterEvidenceRecord, verifyIntentRouterCallEvidence} from "./intent-router-call-evidence";
import {
  expectedIntentRouterManifest,
  fingerprintIntentMessage,
  intentRouterGateObservationSchema,
  intentRoutingFingerprint,
  scoreIntentGoldTurn,
  summarizeIntentRouterGate,
  type IntentRouterGateObservation,
} from "./intent-router-gate";
import {intentGoldClassifierInput, intentGoldMessage, intentGoldObjectInput} from "./intent-router-gate-input";
import type {paidGateProvenance} from "./intent-router-gate-trust";

/**
 * The intent router gold gate through the governed evaluation transport, on the script's side. The
 * script assembles the family snapshot offline from the canonical gold turns (the same inputs the
 * production contracts build, and nothing of the answer key), requests the evaluation, and turns
 * the run the worker committed into the gate record it always wrote: the observations scored against
 * the gold, the gate summary recomputed from the raw outputs, and the call ledger verified
 * independently of the runner that produced it.
 */
export const intentRouterGoldScriptId = "run-intent-router-gold";
/** How long a request may wait for the worker to claim it, beyond the work the budget allows. */
const queueAllowanceMs = 30 * 60_000;
const tasks: readonly IntentRouterGoldTask[] = ["route_intent", "extract_semantic_objects"];
const schemaNames: Record<IntentRouterGoldTask, string> = {route_intent: "shadow_routing_output", extract_semantic_objects: "semantic_object_extractor_output"};

/** The gold corpus the gate runs, versioned by the fingerprint of its immutable observation manifest. */
export function intentRouterGoldAudience(): IntentRouterGoldSnapshot["audience"] {
  return {caseId: "intent-router-gold", caseVersion: `manifest-${fingerprintJson(expectedIntentRouterManifest()).slice(0, 16)}`};
}

/**
 * The snapshot of one gate run: the preflight turn and every observation of the manifest, in the
 * order the script always ran them, each with the classifier and extractor inputs the canonical
 * builders produce, and the model settings of the two tasks.
 */
export function buildIntentRouterGoldSnapshot(policies: Record<TaskKind, TaskPolicy> = defaultTaskPolicies): IntentRouterGoldSnapshot {
  assertCanonicalIntentGold();
  const settings = (policy: TaskPolicy) => ({primary: policy.primary, fallback: policy.fallback ?? null, maxOutputTokens: policy.maxOutputTokens});
  const stability = new Set(stabilityIntentTurnIds);
  const preflightTurn = intentGoldTurns[0]!;
  const observations = intentGoldTurns.flatMap((turn) => Array.from({length: stability.has(turn.id) ? 3 : 1}, (_, index) => {
    const repeat = index + 1;
    const message = intentGoldMessage(turn, repeat);
    return {caseId: turn.caseId, turnId: turn.id, repeat, classifierInput: intentGoldClassifierInput(turn, message), objectInput: intentGoldObjectInput(turn, message)};
  }));
  return intentRouterGoldSnapshotSchema.parse({
    schemaVersion: "intent-router-gold-snapshot.v1",
    audience: intentRouterGoldAudience(),
    model: {route_intent: settings(policies.route_intent), extract_semantic_objects: settings(policies.extract_semantic_objects)},
    preflight: {caseId: preflightTurn.caseId, turnId: preflightTurn.id,
      classifierInput: intentGoldClassifierInput(preflightTurn, preflightTurn.message), objectInput: intentGoldObjectInput(preflightTurn, preflightTurn.message)},
    observations,
  });
}

/**
 * The evaluation budget of one run. Calls keep the ceiling the script's own gateway always had: each
 * observation pass may send, repair once on the same model and fall back once, and each route's
 * preflight may send and repair for each task. Every call may take its task's whole timeout.
 */
export function intentRouterGoldBudget(snapshot: IntentRouterGoldSnapshot, maxCostUsd: number, policies: Record<TaskKind, TaskPolicy> = defaultTaskPolicies) {
  const maxModelCalls = snapshot.observations.length * 2 * 3 + intentRouterGoldRoutes(snapshot).length * 4;
  const maxDurationMs = maxModelCalls * Math.max(policies.route_intent.timeoutMs, policies.extract_semantic_objects.timeoutMs);
  return {maxCostMicrousd: Math.round(maxCostUsd * 1_000_000), maxModelCalls, maxDurationMs, expiresInMs: maxDurationMs + queueAllowanceMs};
}

const routesOf = (snapshot: IntentRouterGoldSnapshot, task: IntentRouterGoldTask) => {
  const {primary, fallback} = snapshot.model[task];
  return [primary, ...(fallback ? [fallback] : [])].filter((route, index, routes) => routes.findIndex((candidate) =>
    candidate.provider === route.provider && candidate.model === route.model && candidate.effort === route.effort) === index);
};

/**
 * The committed result, read strictly and bound to the snapshot this process sent: one preflight
 * row for each configured route of each task, in order; after a passed preflight, one observation
 * for each observation of the snapshot, in order, on exactly the inputs sent; and every call of the
 * ledger labelled with this snapshot's preflight or one of its observations, on one of its routes.
 * Anything else is not the run of these inputs, and nothing of it is written.
 */
export function readIntentRouterGovernedResult(value: unknown, snapshot: IntentRouterGoldSnapshot): IntentRouterGoldResult {
  const result = intentRouterGoldResultSchema.parse(value);
  const mismatch = (what: string) => new Error(`intent_router_result_mismatch: ${what}`);
  const rows = tasks.flatMap((task) => routesOf(snapshot, task).map((route) => ({task, schemaName: schemaNames[task], provider: route.provider, configuredModel: route.model})));
  if (result.providerPreflight.length !== rows.length || rows.some((row, index) => {
    const actual = result.providerPreflight[index]!;
    return actual.task !== row.task || actual.schemaName !== row.schemaName || actual.provider !== row.provider || actual.configuredModel !== row.configuredModel;
  })) throw mismatch("preflight");
  const passed = result.providerPreflight.every((row) => row.passed);
  if (result.outcome === "preflight_failed" ? passed : !passed) throw mismatch("preflight outcome");
  if (result.outcome === "observed") {
    if (result.observations.length !== snapshot.observations.length) throw mismatch("observations");
    snapshot.observations.forEach((sent, index) => {
      const observation = result.observations[index]!;
      if (observation.caseId !== sent.caseId || observation.turnId !== sent.turnId || observation.repeat !== sent.repeat
        || observation.classifierInputFingerprint !== fingerprintJson(sent.classifierInput)
        || observation.objectInputFingerprint !== fingerprintJson(sent.objectInput)) throw mismatch(`observation ${sent.turnId}:${sent.repeat}`);
    });
  }
  const routes = new Set(intentRouterGoldRoutes(snapshot).map((route) => `${route.provider}:${route.model}:${route.effort}`));
  const observations = new Set(snapshot.observations.map((sent) => `${sent.caseId}:${sent.turnId}:${sent.repeat}`));
  for (const call of result.calls) {
    const label = call.metadata ?? {};
    if (!routes.has(`${call.provider}:${call.configuredModel ?? call.model}:${call.effort}`)) throw mismatch(`call ${call.invocationId} route`);
    if (label.surface === "intent_router_provider_preflight") {
      if (label.caseId !== snapshot.preflight.caseId || label.turnId !== snapshot.preflight.turnId) throw mismatch(`call ${call.invocationId} preflight`);
    } else if (label.surface === "intent_router_gold" || label.surface === "intent_object_gold") {
      const task = label.surface === "intent_router_gold" ? "route_intent" : "extract_semantic_objects";
      if (result.outcome !== "observed" || call.task !== task || !observations.has(`${label.caseId}:${label.turnId}:${label.repeat}`)) {
        throw mismatch(`call ${call.invocationId} observation`);
      }
    } else throw mismatch(`call ${call.invocationId} surface`);
  }
  return result;
}

type Observed = Extract<IntentRouterGoldResult, {outcome: "observed"}>;
type PreflightFailed = Extract<IntentRouterGoldResult, {outcome: "preflight_failed"}>;
/** The call ledger in the gateway's own type; the result schema names every field of it. */
const ledger = (result: IntentRouterGoldResult) => result.calls as unknown as GatewayCallLog[];

/**
 * The gate's observations, as the script always recorded them: each governed observation with the
 * turn's suite, message fingerprint and answer key, scored against the gold, with its routing
 * fingerprint, read by the gate's own observation schema.
 */
export function intentRouterGoldObservations(result: Observed): IntentRouterGateObservation[] {
  const turns = new Map(intentGoldTurns.map((turn) => [turn.id, turn]));
  return result.observations.map((governed) => {
    const turn = turns.get(governed.turnId);
    if (!turn) throw new Error(`intent_router_result_mismatch: unknown turn ${governed.turnId}`);
    const {actual, rawActual, objectCompilation} = governed;
    return intentRouterGateObservationSchema.parse({
      turnId: turn.id,
      suite: turn.suite,
      repeat: governed.repeat,
      messageFingerprint: fingerprintIntentMessage(intentGoldMessage(turn, governed.repeat)),
      expected: turn.expected,
      rawActual,
      rawActualFingerprint: governed.rawActualFingerprint,
      rawObjectActual: governed.rawObjectActual,
      rawObjectActualFingerprint: governed.rawObjectActualFingerprint,
      classifierInputFingerprint: governed.classifierInputFingerprint,
      objectInputFingerprint: governed.objectInputFingerprint,
      objectCompilation,
      actual,
      actualFingerprint: governed.actualFingerprint,
      error: governed.error,
      checks: scoreIntentGoldTurn(turn, actual, rawActual, objectCompilation),
      routingFingerprint: actual ? intentRoutingFingerprint(actual) : null,
      provider: governed.provider,
      model: governed.model,
      routeAttemptCount: governed.routeAttemptCount,
      routeCostUsd: governed.routeCostUsd,
      routeLatencyMs: governed.routeLatencyMs,
      objectProvider: governed.objectProvider,
      objectModel: governed.objectModel,
      objectAttemptCount: governed.objectAttemptCount,
      objectCostUsd: governed.objectCostUsd,
      objectLatencyMs: governed.objectLatencyMs,
      costUsd: governed.costUsd,
      latencyMs: governed.latencyMs,
    });
  });
}

/**
 * The gate record `intent-router-gold.json` holds, assembled exactly as the script always did from
 * its run: the summary recomputed from the raw outputs, the call ledger verified independently,
 * the verdict only when both pass, and the evidence fingerprint over everything else.
 */
export function intentRouterGoldRecord(input: {result: Observed; maxCostUsd: number; provenance: ReturnType<typeof paidGateProvenance>; generatedAt: string}) {
  const {result} = input;
  const parsedObservations = intentRouterGoldObservations(result);
  const summary = summarizeIntentRouterGate(parsedObservations);
  const spent = result.gatewaySpent;
  const calls = ledger(result);
  const providerPreflight = result.providerPreflight;
  const callEvidence = verifyIntentRouterCallEvidence({observations: parsedObservations, calls, providerPreflight, gatewaySpent: spent});
  const gatePassed = summary.passed && callEvidence.passed;
  const observationCalls = calls.filter(({metadata}) => metadata?.surface === "intent_router_gold");
  const objectCalls = calls.filter(({metadata}) => metadata?.surface === "intent_object_gold");
  const preflightCalls = calls.filter(({metadata}) => metadata?.surface === "intent_router_provider_preflight");
  const attemptTelemetry = {
    observations: parsedObservations.length,
    totalProviderAttempts: spent.calls,
    observationProviderAttempts: observationCalls.filter(({costStatus}) => costStatus !== "not_called").length,
    objectProviderAttempts: objectCalls.filter(({costStatus}) => costStatus !== "not_called").length,
    preflightProviderAttempts: preflightCalls.filter(({costStatus}) => costStatus !== "not_called").length,
    sameModelRepairAttempts: calls.filter(({isSameModelRepair}) => isSameModelRepair === true).length,
    providerFallbackAttempts: calls.filter(({usedProviderFallback}) => usedProviderFallback === true).length,
    unknownCostAttempts: spent.unknownCostCalls,
  };
  const plannedObservations = expectedIntentRouterManifest().length;
  const unsignedRecord = {
    ...summary,
    passed: gatePassed,
    generatedAt: input.generatedAt,
    stabilityRepeats: 3,
    stabilityTurnIds: [...new Set(stabilityIntentTurnIds)],
    budget: {maxCostUsd: input.maxCostUsd, plannedObservations, plannedProviderOperations: plannedObservations * 2, plannedPreflightOperations: providerPreflight.length},
    provenance: input.provenance,
    gatewaySpent: spent,
    providerPreflight,
    callEvidence,
    attemptTelemetry,
    contract: {
      router: {schemaName: "shadow_routing_output", outputMode: "prompted_json", task: "route_intent"},
      semanticObjects: {schemaName: "semantic_object_extractor_output", outputMode: "prompted_json", task: "extract_semantic_objects", activeWorkContext: "null_in_current_gold_fixture"},
    },
    expectedManifest: expectedIntentRouterManifest(),
    runs: parsedObservations,
    calls,
  };
  return {...unsignedRecord, evidenceFingerprint: fingerprintIntentRouterEvidenceRecord(unsignedRecord)};
}

/** What `provider-preflight.json` holds when a configured route fails its preflight, as it always did. */
export function intentRouterGoldPreflightRecord(input: {result: PreflightFailed; generatedAt: string}) {
  return {generatedAt: input.generatedAt, passed: false, providers: input.result.providerPreflight, gatewaySpent: input.result.gatewaySpent, calls: ledger(input.result)};
}
