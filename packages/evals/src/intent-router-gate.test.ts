import {INTENT_CLASSIFIER_SYSTEM, SEMANTIC_OBJECT_EXTRACTOR_SYSTEM, canonicalizeIntentClassifierOutput, intentClassifierOutputSchema, semanticObjectCompilationSchema, semanticObjectExtractorOutputSchema, type IntentClassifierOutput} from "@offroad/agent-contracts";
import {fingerprintJson} from "@offroad/case-understanding";
import type {GatewayCallLog} from "@offroad/model-gateway";
import {describe, expect, it} from "vitest";
import {z} from "zod";

import {intentGoldTurns} from "./intent-gold";
import {
  expectedIntentRouterManifest,
  fingerprintIntentMessage,
  intentRoutingFingerprint,
  scoreIntentGoldTurn,
  summarizeIntentRouterGate,
  type IntentRouterGateObservation,
} from "./intent-router-gate";
import {intentGoldClassifierInput, intentGoldMessage, intentGoldObjectInput} from "./intent-router-gate-input";
import {evidenceFingerprint, fingerprintIntentRouterEvidenceRecord, verifyIntentRouterCallEvidence, verifyIntentRouterEvidenceRecord} from "./intent-router-call-evidence";
import {assertTrustedPaidGateEnvironment} from "./intent-router-gate-trust";

const outputFor = (turn = intentGoldTurns[0]!, overrides: Partial<IntentClassifierOutput> = {}): IntentClassifierOutput => ({
  routingCore: {
    action: {value: [turn.expected.semantic.canonicalAction], state: "inferred", confidence: 0.99},
    object: {value: turn.expected.semantic.objects.map((object) => ({
      id: object.id,
      ordinal: object.ordinal,
      kind: object.kind,
      slots: object.slots.flatMap((slot) => slot.allowedValues.slice(0, slot.cardinality).map((value) => ({key: slot.key, value}))),
    })), state: "explicit"},
    decisionType: {value: turn.expected.semantic.decision.category, state: turn.expected.semantic.decision.present ? "explicit" : "not_applicable"},
    audienceType: {value: turn.expected.semantic.audienceCategory, state: turn.expected.semantic.audienceCategory === "unspecified" ? "unknown" : "explicit"},
    depth: {value: turn.expected.depth, state: "inferred", confidence: 0.99},
    continuity: {value: turn.expected.continuity, state: "inferred", confidence: 0.99},
    workResponsibility: {value: turn.expected.workResponsibility, state: "inferred", confidence: 0.99},
  },
  inferableContext: {
    jurisdiction: {value: ["BR"], state: "inferred", confidence: 0.9}, asOfDate: {value: null, state: "unknown"},
    currency: {value: null, state: "unknown"}, deadline: {value: null, state: "unknown"}, sponsorInstruction: {value: null, state: "unknown"},
    constraints: {value: [], state: "unknown"}, urgency: {value: null, state: "unknown"}, availableInputs: {value: [], state: "unknown"},
  },
  primaryWorks: turn.expected.primaryWorks.map((work) => ({work, confidence: 0.99})), composition: turn.expected.composition,
  firstQuestion: turn.expected.firstQuestionTheme ? `Pode confirmar ${turn.expected.firstQuestionSignals.map((signals) => signals[0]).join(" e ")}?` : null,
  abstain: turn.expected.abstain, abstainReason: turn.expected.abstain ? "request is ambiguous" : null, ...overrides,
});

function messageFor(turn: typeof intentGoldTurns[number], repeat: number): string {
  if (repeat === 1) return turn.message;
  const paraphrase = turn.stabilityParaphrases?.[repeat - 2];
  if (!paraphrase) throw new Error(`missing paraphrase ${turn.id}:${repeat}`);
  return paraphrase;
}

const observation = (turn: typeof intentGoldTurns[number], repeat: number, output: IntentClassifierOutput | null): IntentRouterGateObservation => ({
  turnId: turn.id, suite: turn.suite, repeat, messageFingerprint: fingerprintIntentMessage(messageFor(turn, repeat)), expected: turn.expected,
  classifierInputFingerprint: fingerprintJson(intentGoldClassifierInput(turn, intentGoldMessage(turn, repeat))),
  objectInputFingerprint: fingerprintJson(intentGoldObjectInput(turn, intentGoldMessage(turn, repeat))),
  rawActual: output, actual: output, error: output ? null : "provider failure", checks: scoreIntentGoldTurn(turn, output, output),
  rawActualFingerprint: output ? fingerprintJson(output) : null,
  actualFingerprint: output ? fingerprintJson(output) : null,
  routingFingerprint: output ? intentRoutingFingerprint(output) : null, provider: output ? "anthropic" : null,
  model: output ? "governed-test-model" : null,
  rawObjectActual: output ? {objects: [], activeContextReferences: [], unresolvedReferences: [], excludedQuantitativeSpans: [], excludedSemanticHeadSpans: []} : null,
  rawObjectActualFingerprint: output ? fingerprintJson({objects: [], activeContextReferences: [], unresolvedReferences: [], excludedQuantitativeSpans: [], excludedSemanticHeadSpans: []}) : null,
  objectCompilation: output ? compilationFor(outputFor(turn), turn.expected.abstain) : null,
  objectProvider: output ? "anthropic" : null, objectModel: output ? "governed-object-model" : null,
  routeAttemptCount: output ? 1 : 0, routeCostUsd: output ? 0.01 : 0, routeLatencyMs: output ? 20 : 0,
  objectAttemptCount: output ? 1 : 0, objectCostUsd: output ? 0.005 : 0, objectLatencyMs: output ? 80 : 0,
  costUsd: output ? 0.015 : 0, latencyMs: output ? 100 : 0,
});

function compilationFor(output: IntentClassifierOutput, abstain = false) {
  const objects = output.routingCore.object.value.map((object) => ({
    ...object,
    slots: object.slots.some(({key}) => key === "entity" || key === "subject")
      ? object.slots
      : [{key: "subject" as const, value: `synthetic ${object.kind}`}],
    source: {type: "text" as const, spans: [{source: "latest_user_message" as const, messageIndex: null, start: 0, end: 1, text: "x"}]},
  }));
  const body = {
    schemaVersion: "semantic-object-compilation.v1" as const,
    status: abstain ? "incomplete" as const : "complete" as const,
    objects,
    usableObjects: abstain ? [] : objects,
    coverage: {
      sourceSpansChecked: objects.length, quantitativeMentions: 0, quantitativeMentionsCovered: 0,
      semanticHeadMentions: objects.length, semanticHeadMentionsCovered: objects.length,
      activeContextReferencesChecked: 0,
      issues: abstain ? [{code: "unresolved_reference" as const, severity: "error" as const, detail: "synthetic unresolved reference"}] : [],
    },
  };
  return semanticObjectCompilationSchema.parse({...body, fingerprint: fingerprintJson(body)});
}

const completeObservations = (): IntentRouterGateObservation[] => intentGoldTurns.flatMap((turn) => {
  const repeats = turn.stabilityParaphrases ? [1, 2, 3] : [1];
  return repeats.map((repeat) => observation(turn, repeat, outputFor(turn)));
});

const canonicalizedObservation = (turn: typeof intentGoldTurns[number], repeat: number): IntentRouterGateObservation => {
  const raw = outputFor(turn);
  const actual = canonicalizeIntentClassifierOutput(raw, {
    locale: turn.locale,
    latestUserMessage: messageFor(turn, repeat),
    recentConversation: turn.priorTurns.map((content) => ({role: "user", content})),
    entryJob: null,
    documentCount: turn.documentCount,
    professionalContext: null,
  });
  return {
    ...observation(turn, repeat, actual),
    rawActual: raw,
    rawActualFingerprint: fingerprintJson(raw),
    checks: scoreIntentGoldTurn(turn, actual, raw),
    routingFingerprint: intentRoutingFingerprint(actual),
  };
};

describe("intent router promotion gate", () => {
  it("refuses paid execution outside the trusted post-merge main workflow", () => {
    const trusted = {
      githubActions: "true", repository: "carlosevg100/offroad", ref: "refs/heads/main",
      sha: "a".repeat(40), workflowRef: "carlosevg100/offroad/.github/workflows/intent-router-gold.yml@refs/heads/main",
      eventName: "workflow_dispatch",
    };
    expect(() => assertTrustedPaidGateEnvironment(trusted)).not.toThrow();
    expect(() => assertTrustedPaidGateEnvironment({...trusted, ref: "refs/heads/feature/forge"})).toThrow("paid_gate_requires_main_ref");
    expect(() => assertTrustedPaidGateEnvironment({...trusted, workflowRef: "carlosevg100/offroad/.github/workflows/evil.yml@refs/heads/main"})).toThrow("paid_gate_requires_main_workflow");
    expect(() => assertTrustedPaidGateEnvironment({...trusted, githubActions: "false"})).toThrow("paid_gate_requires_github_actions");
  });

  it("detects any mutation of the persisted evidence record", () => {
    const unsigned = {schemaVersion: "intent-router-gate.v3", observations: 52, provenance: {gitSha: "a".repeat(40)}};
    const record = {...unsigned, evidenceFingerprint: fingerprintIntentRouterEvidenceRecord(unsigned)};
    expect(verifyIntentRouterEvidenceRecord(record)).toBe(true);
    expect(verifyIntentRouterEvidenceRecord({...record, observations: 51})).toBe(false);
  });

  it("requires bijective task, schema, prompt, input, output, provider, model, attempt and cost lineage", () => {
    const turn = intentGoldTurns[0]!;
    const run = observation(turn, 1, outputFor(turn));
    const message = intentGoldMessage(turn, 1);
    const call = (surface: "intent_router_gold" | "intent_object_gold"): GatewayCallLog => {
      const route = surface === "intent_router_gold";
      const input = [{type: "text" as const, text: JSON.stringify(route ? intentGoldClassifierInput(turn, message) : intentGoldObjectInput(turn, message))}];
      const system = route ? INTENT_CLASSIFIER_SYSTEM : SEMANTIC_OBJECT_EXTRACTOR_SYSTEM;
      const schemaName = route ? "shadow_routing_output" : "semantic_object_extractor_output";
      const schema = route ? intentClassifierOutputSchema : semanticObjectExtractorOutputSchema;
      return {
        invocationId: surface, task: route ? "route_intent" : "extract_semantic_objects", provider: "anthropic",
        model: route ? "governed-test-model" : "governed-object-model", effort: "medium", outcome: "ok",
        promptFingerprint: evidenceFingerprint({system, schemaName, schema: z.toJSONSchema(schema)}),
        inputFingerprint: evidenceFingerprint(input), outputFingerprint: route ? run.rawActualFingerprint! : run.rawObjectActualFingerprint!,
        usage: {inputTokens: 1, outputTokens: 1, cachedInputTokens: 0}, costUsd: route ? 0.01 : 0.005,
        costStatus: "measured", latencyMs: route ? 20 : 80, stopReason: "end", usedFallback: false,
        retryOrdinal: 0, isSameModelRepair: false, usedProviderFallback: false, fromCassette: false, schemaName,
        metadata: {surface, caseId: turn.caseId, turnId: turn.id, repeat: "1"},
      };
    };
    const calls = [call("intent_router_gold"), call("intent_object_gold")];
    const spent = {costUsd: 0.015, calls: 2, unknownCostCalls: 0, budgetExposureUsd: 0.015};
    expect(verifyIntentRouterCallEvidence({observations: [run], calls, providerPreflight: [], gatewaySpent: spent}).passed).toBe(true);
    const forged = calls.map((entry, index) => index === 0 ? {...entry, task: "extract_semantic_objects" as const, costUsd: 0.001} : entry);
    const verdict = verifyIntentRouterCallEvidence({observations: [run], calls: forged, providerPreflight: [], gatewaySpent: spent});
    expect(verdict.passed).toBe(false);
    expect(verdict.issues).toEqual(expect.arrayContaining([expect.stringContaining("task_mismatch"), expect.stringContaining("cost_mismatch"), "gateway_measured_cost_mismatch"]));
    const duplicate = [...calls, {...calls[0]!, invocationId: calls[1]!.invocationId}];
    expect(verifyIntentRouterCallEvidence({observations: [run], calls: duplicate, providerPreflight: [], gatewaySpent: {...spent, calls: 3, costUsd: 0.025}}).issues)
      .toEqual(expect.arrayContaining([expect.stringContaining("duplicate_invocation"), expect.stringContaining("terminal_success_count")]));

    const rejectedInvocationId = "10000000-0000-4000-8000-000000000001";
    const repairInvocationId = "10000000-0000-4000-8000-000000000002";
    const validationIssues = [{path: "composition", code: "invalid_value", message: "Invalid enum value"}];
    const issueFingerprint = evidenceFingerprint(validationIssues.map(({path, code}) => ({path, code})));
    const rejectedRoute: GatewayCallLog = {
      ...calls[0]!, invocationId: rejectedInvocationId, outcome: "invalid_output", costUsd: 0.004, latencyMs: 10,
      outputFingerprint: "a".repeat(64), validationIssues, validationIssueCodeFingerprint: issueFingerprint,
    };
    const repairedRoute: GatewayCallLog = {
      ...calls[0]!, invocationId: repairInvocationId, retryOrdinal: 1, isSameModelRepair: true,
      previousInvocationId: rejectedInvocationId, repairGuidanceFingerprint: "b".repeat(64),
      repairValidationIssueCodeFingerprint: issueFingerprint, promptFingerprint: "c".repeat(64),
      costUsd: 0.01, latencyMs: 20,
    };
    const repairedRun = {
      ...run, routeAttemptCount: 2, routeCostUsd: 0.014, routeLatencyMs: 30,
      costUsd: 0.019, latencyMs: 110,
    };
    const repairedCalls = [rejectedRoute, repairedRoute, calls[1]!];
    const repairedSpend = {costUsd: 0.019, calls: 3, unknownCostCalls: 0, budgetExposureUsd: 0.019};
    expect(verifyIntentRouterCallEvidence({observations: [repairedRun], calls: repairedCalls, providerPreflight: [], gatewaySpent: repairedSpend}).passed).toBe(true);
    const unboundRepair = {...repairedRoute, previousInvocationId: "10000000-0000-4000-8000-000000000099"};
    expect(verifyIntentRouterCallEvidence({observations: [repairedRun], calls: [rejectedRoute, unboundRepair, calls[1]!], providerPreflight: [], gatewaySpent: repairedSpend}).issues)
      .toEqual(expect.arrayContaining([expect.stringContaining("repair_predecessor_mismatch")]));
  });

  it("exercises every one of the 52 authored messages without treating an oracle-built output as provider evidence", () => {
    const observations = intentGoldTurns.flatMap((turn) => (turn.stabilityParaphrases ? [1, 2, 3] : [1])
      .map((repeat) => canonicalizedObservation(turn, repeat)));
    const failures = observations.filter(({checks}) => Object.values(checks).some((passed) => !passed))
      .map(({turnId, repeat, actual, checks}) => ({turnId, repeat, composition: actual?.composition, checks}));
    expect(observations).toHaveLength(52);
    // This helper deliberately derives its objects from the answer key instead of attributable
    // extractor spans. The hardened gate must reject that old shortcut even if most field scores
    // look green.
    const summary = summarizeIntentRouterGate(observations);
    expect(summary.passed).toBe(false);
    expect(summary.chainRecompositionMismatches).toHaveLength(52);
    expect(failures.length).toBeGreaterThan(0);
  });

  it("scores the explicit semantic answer key rather than only checking field presence", () => {
    const turn = intentGoldTurns[0]!;
    expect(Object.values(scoreIntentGoldTurn(turn, outputFor(turn), outputFor(turn)))).toEqual(expect.arrayContaining([true]));
    expect(Object.values(scoreIntentGoldTurn(turn, outputFor(turn), outputFor(turn))).every(Boolean)).toBe(true);
    const wrongObject = outputFor(turn, {
      routingCore: {...outputFor(turn).routingCore, object: {value: [{id: "object-1", ordinal: 1, kind: "market", slots: []}], state: "explicit"}},
    });
    expect(scoreIntentGoldTurn(turn, wrongObject, wrongObject).objectKindsExact).toBe(false);
    expect(scoreIntentGoldTurn(turn, null, null).completed).toBe(false);
  });

  it("scores the production output while keeping raw confidence validation independent", () => {
    const turn = intentGoldTurns.find(({id}) => id === "gc01-t01")!;
    const raw = outputFor(turn, {routingCore: {...outputFor(turn).routingCore, action: {value: ["review"], state: "inferred"}}});
    const actual = canonicalizeIntentClassifierOutput(raw, {
      locale: "pt-BR", latestUserMessage: turn.message, recentConversation: [], entryJob: null, documentCount: turn.documentCount, professionalContext: null,
    });
    expect(actual.routingCore.action.value).toEqual(["prepare_meeting"]);
    expect(scoreIntentGoldTurn(turn, actual, raw).canonicalAction).toBe(true);

    const noDecision = outputFor(turn, {routingCore: {...outputFor(turn).routingCore, decisionType: {value: "none", state: "not_applicable"}}});
    const decisionChecks = scoreIntentGoldTurn(turn, actual, noDecision);
    expect(decisionChecks.decisionPresence).toBe(true);
    expect(decisionChecks.decisionCategory).toBe(true);
  });

  it("rejects semantically populated fields that disclaim their meaning", () => {
    for (const turn of intentGoldTurns) {
      const base = outputFor(turn);
      const disclaimed = {
        ...base,
        routingCore: {
          ...base.routingCore,
          action: {...base.routingCore.action, state: "not_applicable" as const, confidence: null},
          object: {...base.routingCore.object, state: "not_applicable" as const, confidence: null},
          decisionType: {...base.routingCore.decisionType, state: "not_applicable" as const, confidence: null},
          audienceType: {...base.routingCore.audienceType, state: "not_applicable" as const, confidence: null},
          depth: {...base.routingCore.depth, state: "not_applicable" as const, confidence: null},
          continuity: {...base.routingCore.continuity, state: "not_applicable" as const, confidence: null},
          workResponsibility: {...base.routingCore.workResponsibility, state: "not_applicable" as const, confidence: null},
        },
      };
      const checks = scoreIntentGoldTurn(turn, disclaimed, disclaimed);
      expect(Object.values(checks).every(Boolean), turn.id).toBe(false);
    }
  });

  it("rejects duplicate, mismatched and non-contiguous object identities at the model boundary", () => {
    const turn = intentGoldTurns.find(({id}) => id === "gc03-t01")!;
    const base = outputFor(turn);
    const invalidValues = [
      base.routingCore.object.value.map((object, index) => index === 1 ? {...object, id: "object-1"} : object),
      base.routingCore.object.value.map((object, index) => index === 0 ? {...object, id: "object-2"} : object),
      base.routingCore.object.value.map((object, index) => index === 0 ? {...object, id: "object-3", ordinal: 3} : object),
    ];
    for (const value of invalidValues) {
      expect(() => intentClassifierOutputSchema.parse({
        ...base,
        routingCore: {...base.routingCore, object: {...base.routingCore.object, value}},
      })).toThrow();
    }
  });

  it("excludes narrative routing claims from the strict model contract", () => {
    const turn = intentGoldTurns.find(({id}) => id === "gc01-t01")!;
    const base = outputFor(turn);
    expect(() => intentClassifierOutputSchema.parse({
      ...base,
      routingCore: {
        ...base.routingCore,
        desiredOutcome: "não preparar reunião",
        decision: "não existe decisão",
        audience: "não é para VP",
      },
    })).toThrow();
  });

  it("binds each material reference to its object and requires numeric assumptions", () => {
    const capitalTurn = intentGoldTurns.find(({id}) => id === "hx04")!;
    const swapped = outputFor(capitalTurn);
    const firstSlots = swapped.routingCore.object.value[0]!.slots;
    swapped.routingCore.object.value[0]!.slots = swapped.routingCore.object.value[1]!.slots;
    swapped.routingCore.object.value[1]!.slots = firstSlots;
    expect(scoreIntentGoldTurn(capitalTurn, swapped, swapped).materialReferences).toBe(false);

    const modelTurn = intentGoldTurns.find(({id}) => id === "gc05-t03")!;
    expect(modelTurn.expected.semantic.objects.find(({kind}) => kind === "scenario")?.slots).toEqual(expect.arrayContaining([
      {key: "indexer", allowedValues: ["CDI"], cardinality: 1},
      {key: "percentage", allowedValues: ["0.12"], cardinality: 1},
      {key: "tenor_months", allowedValues: ["84"], cardinality: 1},
    ]));
    const missingRate = outputFor(modelTurn);
    missingRate.routingCore.object.value = missingRate.routingCore.object.value.map((object) => object.kind === "scenario"
      ? {...object, slots: object.slots.filter(({key}) => key !== "percentage")}
      : object);
    expect(scoreIntentGoldTurn(modelTurn, missingRate, missingRate).materialReferences).toBe(false);

    const structureTurn = intentGoldTurns.find(({id}) => id === "gc03-t01")!;
    const missingTicket = outputFor(structureTurn);
    missingTicket.routingCore.object.value = missingTicket.routingCore.object.value.map((object) => object.kind === "operation"
      ? {...object, slots: object.slots.filter(({key}) => key !== "amount" && key !== "currency")}
      : object);
    expect(scoreIntentGoldTurn(structureTurn, missingTicket, missingTicket).materialReferences).toBe(false);

    const conflictingRate = outputFor(modelTurn);
    conflictingRate.routingCore.object.value = conflictingRate.routingCore.object.value.map((object) => object.kind === "scenario"
      ? {...object, slots: [...object.slots, {key: "percentage", value: "15"}]}
      : object);
    expect(scoreIntentGoldTurn(modelTurn, conflictingRate, conflictingRate).materialReferences).toBe(false);

    const extraObject = outputFor(structureTurn);
    extraObject.routingCore.object.value.push({id: "object-4", ordinal: 4, kind: "operation", slots: [{key: "amount", value: "500000000"}, {key: "currency", value: "BRL"}]});
    expect(scoreIntentGoldTurn(structureTurn, extraObject, extraObject).objectKindsExact).toBe(false);

    const splitSlots = outputFor(modelTurn);
    const scenario = splitSlots.routingCore.object.value.find(({kind}) => kind === "scenario")!;
    scenario.slots = scenario.slots.filter(({key}) => key === "indexer");
    splitSlots.routingCore.object.value.push({id: "object-3", ordinal: 3, kind: "scenario", slots: [{key: "percentage", value: "12"}, {key: "tenor_months", value: "84"}]});
    expect(scoreIntentGoldTurn(modelTurn, splitSlots, splitSlots).materialReferences).toBe(false);
  });

  it("changes the stability fingerprint for every semantic or plan-driving axis", () => {
    const turn = intentGoldTurns[0]!; const base = outputFor(turn); const baseFingerprint = intentRoutingFingerprint(base);
    const mutations: IntentClassifierOutput[] = [
      {...base, routingCore: {...base.routingCore, action: {...base.routingCore.action, value: ["review"]}}},
      {...base, routingCore: {...base.routingCore, object: {...base.routingCore.object, value: [{id: "object-1", ordinal: 1, kind: "market", slots: [{key: "entity", value: "Camil"}]}]}}},
      {...base, routingCore: {...base.routingCore, decisionType: {...base.routingCore.decisionType, value: "credit"}}},
      {...base, routingCore: {...base.routingCore, audienceType: {...base.routingCore.audienceType, value: "board_or_committee"}}},
      {...base, routingCore: {...base.routingCore, depth: {...base.routingCore.depth, value: "institutional"}}},
      {...base, routingCore: {...base.routingCore, action: {...base.routingCore.action, state: "not_applicable"}}},
      {...base, routingCore: {...base.routingCore, object: {...base.routingCore.object, state: "unknown"}}},
      {...base, routingCore: {...base.routingCore, workResponsibility: {...base.routingCore.workResponsibility, state: "explicit"}}},
      {...base, inferableContext: {...base.inferableContext, jurisdiction: {value: ["US"], state: "inferred", confidence: 0.9}}},
    ];
    for (const changed of mutations) expect(intentRoutingFingerprint(changed)).not.toBe(baseFingerprint);
    const modelTurn = intentGoldTurns.find(({id}) => id === "gc05-t03")!;
    const cdi = outputFor(modelTurn);
    const cdiPlusSpread = outputFor(modelTurn);
    cdiPlusSpread.routingCore.object.value = cdiPlusSpread.routingCore.object.value.map((object) => object.kind === "scenario"
      ? {...object, slots: object.slots.map((slot) => slot.key === "percentage" ? {...slot, value: "15"} : slot)}
      : object);
    expect(intentRoutingFingerprint(cdiPlusSpread)).not.toBe(intentRoutingFingerprint(cdi));
  });

  it("requires the exact immutable 40-turn and 52-observation manifest", () => {
    expect(expectedIntentRouterManifest()).toHaveLength(52);
    expect(new Set(expectedIntentRouterManifest().filter(({repeat}) => repeat === 1).map(({turnId}) => turnId)).size).toBe(40);
    const valid = completeObservations();
    expect(summarizeIntentRouterGate(valid).manifestPassed).toBe(true);
    expect(summarizeIntentRouterGate(valid.slice(1)).manifestPassed).toBe(false);
    expect(summarizeIntentRouterGate([...valid, valid[0]!]).duplicateManifestEntries.some((entry) => entry.startsWith(`${valid[0]!.turnId}:`))).toBe(true);
    const forged = valid.map((entry, index) => index === 0 ? {...entry, messageFingerprint: fingerprintIntentMessage("same bytes")} : entry);
    expect(summarizeIntentRouterGate(forged).messageFingerprintMismatches).toContain(`${valid[0]!.turnId}:1`);
  });

  it("rejects replayed bytes and a semantic change across authored paraphrases", () => {
    const valid = completeObservations(); const stability = intentGoldTurns.find((turn) => turn.stabilityParaphrases)!;
    const repeatedBytes = valid.map((entry) => entry.turnId === stability.id && entry.repeat === 2 ? {...entry, messageFingerprint: fingerprintIntentMessage(stability.message)} : entry);
    expect(summarizeIntentRouterGate(repeatedBytes).unstableTurnIds).toContain(stability.id);
    const changedMeaning = valid.map((entry) => entry.turnId === stability.id && entry.repeat === 3
      ? observation(stability, 3, {...outputFor(stability), routingCore: {...outputFor(stability).routingCore, audienceType: {value: "board_or_committee", state: "explicit"}}})
      : entry);
    expect(summarizeIntentRouterGate(changedMeaning).unstableTurnIds).toContain(stability.id);
  });

  it("separates pure fingerprint invariance from qualified semantic stability", () => {
    const stability = intentGoldTurns.find((turn) => turn.stabilityParaphrases)!;
    const consistentlyWrong = outputFor(stability, {
      routingCore: {...outputFor(stability).routingCore, decisionType: {value: "none", state: "not_applicable"}},
    });
    const observations = completeObservations().map((entry) => entry.turnId === stability.id
      ? observation(stability, entry.repeat, consistentlyWrong)
      : entry);
    const summary = summarizeIntentRouterGate(observations);

    expect(summary.fingerprintVariantTurnIds).not.toContain(stability.id);
    expect(summary.fingerprintInvarianceRate).toBe(1);
    expect(summary.qualifiedUnstableTurnIds).toContain(stability.id);
    expect(summary.qualifiedStabilityRate).toBeLessThan(1);
    expect(summary.stabilityRate).toBe(summary.qualifiedStabilityRate);
  });

  it("does not pass from answer-key-shaped observations without an authentic extractor chain", () => {
    const summary = summarizeIntentRouterGate(completeObservations());
    expect(summary.passed).toBe(false);
    expect(summary.manifestPassed).toBe(true);
    expect(summary.integrityPassed).toBe(false);
    expect(summary.uniqueTurns).toBe(40);
    expect(summary.observations).toBe(52);
    expect(summary.chainRecompositionMismatches).toHaveLength(52);
  });

  it("recomputes the complete manifest and rejects conflicting single-valued material slots", () => {
    const modelTurn = intentGoldTurns.find(({id}) => id === "gc05-t03")!;
    const conflictingRate = outputFor(modelTurn);
    conflictingRate.routingCore.object.value = conflictingRate.routingCore.object.value.map((object) => object.kind === "scenario"
      ? {...object, slots: [...object.slots, {key: "percentage", value: "15"}]}
      : object);
    const observations = completeObservations().map((entry) => entry.turnId === modelTurn.id && entry.repeat === 1
      ? observation(modelTurn, 1, conflictingRate)
      : entry);
    const summary = summarizeIntentRouterGate(observations);
    expect(summary.passed).toBe(false);
    expect(summary.metrics.find(({name}) => name === "materialReferences")?.gatePassed).toBe(false);
  });

  it("recomputes evidence and rejects provider failure, forged checks and forged fingerprints", () => {
    const valid = completeObservations();
    const providerFailure = valid.map((entry, index) => index === 0 ? {
      ...entry, rawActual: null, actual: null, error: "provider failed", provider: null, model: null,
      checks: Object.fromEntries(Object.keys(entry.checks).map((key) => [key, true])) as typeof entry.checks,
      routingFingerprint: "constant",
    } : entry);
    expect(summarizeIntentRouterGate(providerFailure).passed).toBe(false);
    expect(summarizeIntentRouterGate(providerFailure).invalidObservationEntries).toContain("gc01-t01:1");

    const forgedChecks = valid.map((entry, index) => index === 1 ? {
      ...entry,
      rawActual: {...entry.rawActual!, routingCore: {...entry.rawActual!.routingCore, action: {...entry.rawActual!.routingCore.action, state: "inferred" as const, confidence: null}}},
      checks: Object.fromEntries(Object.keys(entry.checks).map((key) => [key, true])) as typeof entry.checks,
    } : entry);
    const forgedChecksSummary = summarizeIntentRouterGate(forgedChecks);
    expect(forgedChecksSummary.passed).toBe(false);
    expect(forgedChecksSummary.recordedCheckMismatches).toContain(`${valid[1]!.turnId}:${valid[1]!.repeat}`);

    const falseRecordedCheck = valid.map((entry, index) => index === 2 ? {
      ...entry, checks: {...entry.checks, completed: false},
    } : entry);
    const falseRecordedSummary = summarizeIntentRouterGate(falseRecordedCheck);
    expect(falseRecordedSummary.passed).toBe(false);
    expect(falseRecordedSummary.recordedCheckMismatches).toContain(`${valid[2]!.turnId}:${valid[2]!.repeat}`);

    const forgedFingerprints = valid.map((entry) => ({...entry, routingFingerprint: "constant"}));
    const forgedSummary = summarizeIntentRouterGate(forgedFingerprints);
    expect(forgedSummary.passed).toBe(false);
    expect(forgedSummary.routingFingerprintMismatches).toHaveLength(52);

    const forgedRawObjectFingerprint = valid.map((entry, index) => index === 3
      ? {...entry, rawObjectActualFingerprint: "0".repeat(64)}
      : entry);
    expect(summarizeIntentRouterGate(forgedRawObjectFingerprint).invalidObservationEntries)
      .toContain(`${valid[3]!.turnId}:${valid[3]!.repeat}`);
  });

  it("reports object coverage independently from the requested abstention outcome", () => {
    const valid = completeObservations();
    const routed = intentGoldTurns.find(({expected}) => !expected.abstain)!;
    const abstention = intentGoldTurns.find(({expected}) => expected.abstain)!;
    const wrongRoutedCoverage = valid.map((entry) => entry.turnId === routed.id && entry.repeat === 1
      ? {...entry, objectCompilation: compilationFor(outputFor(routed), true)}
      : entry);
    expect(summarizeIntentRouterGate(wrongRoutedCoverage).chainRecompositionMismatches).toContain(`${routed.id}:1`);

    const falseCompleteAbstention = valid.map((entry) => entry.turnId === abstention.id && entry.repeat === 1
      ? {...entry, objectCompilation: compilationFor(outputFor(abstention), false)}
      : entry);
    const abstentionSummary = summarizeIntentRouterGate(falseCompleteAbstention);
    expect(abstentionSummary.chainRecompositionMismatches).toContain(`${abstention.id}:1`);
    expect(scoreIntentGoldTurn(abstention, outputFor(abstention), outputFor(abstention), compilationFor(outputFor(abstention), false)).completed).toBe(true);
    expect(scoreIntentGoldTurn(abstention, outputFor(abstention), outputFor(abstention), compilationFor(outputFor(abstention), true)).completed).toBe(true);
  });

  it("rejects forged plan order and duplicate responsibilities across the complete manifest", () => {
    const turn = intentGoldTurns.find(({id}) => id === "hx03")!;
    const valid = completeObservations();
    const base = outputFor(turn);
    const forgedValues: IntentClassifierOutput[] = [
      {...base, primaryWorks: [base.primaryWorks[0]!, base.primaryWorks[2]!, base.primaryWorks[1]!]},
      {...base, primaryWorks: [...base.primaryWorks, base.primaryWorks[2]!]},
      {...base, routingCore: {...base.routingCore, workResponsibility: {...base.routingCore.workResponsibility, value: ["producer", "producer"]}}},
    ];
    for (const forged of forgedValues) {
      const observations = valid.map((entry) => entry.turnId === turn.id && entry.repeat === 1
        ? observation(turn, 1, forged)
        : entry);
      expect(summarizeIntentRouterGate(observations).passed).toBe(false);
    }
  });

  it("fails the gate when raw inferred fields omit confidence", () => {
    const turn = intentGoldTurns[0]!;
    const base = outputFor(turn);
    const missingConfidence = intentClassifierOutputSchema.parse({
      ...base,
      routingCore: {...base.routingCore, action: {...base.routingCore.action, confidence: null}},
    });
    expect(scoreIntentGoldTurn(turn, missingConfidence, missingConfidence).completed).toBe(false);
  });
});
