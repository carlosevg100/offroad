import {canonicalizeIntentClassifierOutput, intentClassifierOutputSchema, type IntentClassifierOutput} from "@offroad/agent-contracts";
import {describe, expect, it} from "vitest";

import {intentGoldTurns} from "./intent-gold";
import {
  expectedIntentRouterManifest,
  fingerprintIntentMessage,
  intentRoutingFingerprint,
  scoreIntentGoldTurn,
  summarizeIntentRouterGate,
  type IntentRouterGateObservation,
} from "./intent-router-gate";

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
  rawActual: output, actual: output, error: output ? null : "provider failure", checks: scoreIntentGoldTurn(turn, output, output),
  routingFingerprint: output ? intentRoutingFingerprint(output) : null, provider: output ? "anthropic" : null,
  model: output ? "governed-test-model" : null, costUsd: output ? 0.01 : 0, latencyMs: output ? 100 : 0,
});

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
    checks: scoreIntentGoldTurn(turn, actual, raw),
    routingFingerprint: intentRoutingFingerprint(actual),
  };
};

describe("intent router promotion gate", () => {
  it("passes every one of the 52 real messages through raw output and production canonicalization", () => {
    const observations = intentGoldTurns.flatMap((turn) => (turn.stabilityParaphrases ? [1, 2, 3] : [1])
      .map((repeat) => canonicalizedObservation(turn, repeat)));
    const failures = observations.filter(({checks}) => Object.values(checks).some((passed) => !passed))
      .map(({turnId, repeat, actual, checks}) => ({turnId, repeat, composition: actual?.composition, checks}));
    expect(failures).toEqual([]);
    expect(summarizeIntentRouterGate(observations).passed).toBe(true);
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

  it("scores raw semantics instead of accepting fields repaired by canonical policy", () => {
    const turn = intentGoldTurns.find(({id}) => id === "gc01-t01")!;
    const raw = outputFor(turn, {routingCore: {...outputFor(turn).routingCore, action: {value: ["review"], state: "inferred"}}});
    const actual = canonicalizeIntentClassifierOutput(raw, {
      locale: "pt-BR", latestUserMessage: turn.message, recentConversation: [], entryJob: null, documentCount: turn.documentCount, professionalContext: null,
    });
    expect(actual.routingCore.action.value).toEqual(["prepare_meeting"]);
    expect(scoreIntentGoldTurn(turn, actual, raw).canonicalAction).toBe(false);

    const noDecision = outputFor(turn, {routingCore: {...outputFor(turn).routingCore, decisionType: {value: "none", state: "not_applicable"}}});
    const decisionChecks = scoreIntentGoldTurn(turn, actual, noDecision);
    expect(decisionChecks.decisionPresence).toBe(false);
    expect(decisionChecks.decisionCategory).toBe(false);
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
      {key: "percentage", allowedValues: ["12"], cardinality: 1},
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

  it("passes only when every suite and every semantic check is green", () => {
    const summary = summarizeIntentRouterGate(completeObservations());
    expect(summary.passed).toBe(true);
    expect(summary.uniqueTurns).toBe(40);
    expect(summary.observations).toBe(52);
    expect(summary.suiteGates.every(({passed}) => passed)).toBe(true);
    expect(summary.metrics.every(({gatePassed}) => gatePassed)).toBe(true);
    expect(summary.stabilityRate).toBe(1);
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
      rawActual: {...entry.rawActual!, routingCore: {...entry.rawActual!.routingCore, action: {value: ["review" as const], state: "explicit" as const}}},
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
  });
});
