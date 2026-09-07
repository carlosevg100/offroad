import {canonicalizeIntentClassifierOutput, type IntentClassifierOutput} from "@offroad/agent-contracts";
import {describe, expect, it} from "vitest";

import {intentGoldTurns} from "./intent-gold";
import {
  expectedIntentRouterManifest,
  fingerprintIntentMessage,
  intentRoutingFingerprint,
  normalizedMaterialSlots,
  scoreIntentGoldTurn,
  summarizeIntentRouterGate,
  type IntentRouterGateObservation,
} from "./intent-router-gate";

const decisionText = {none: null, capital: "decidir estrutura de capital", credit: "decidir risco de crédito e headroom", material: "decidir deck e material", market: "decidir mercado, fundos e spread", external: "decidir enviar e introduzir", workflow: "decidir status e pendências do projeto", document: "decidir cláusula e fórmula do documento"} as const;
const audienceText = {self: "solicitante", internal_senior: "VP", company_management: "CFO", board_or_committee: "conselho", capital_provider: "investidores", market: "mercado", unspecified: "desconhecido"} as const;
const slotSurface = (slot: typeof intentGoldTurns[number]["expected"]["semantic"]["materialSlots"][number]): string => {
  if (slot.slot === "amount") return `${Number(slot.value) / 1_000_000} milhões`;
  if (slot.slot === "currency") return slot.value;
  if (slot.slot === "percentage") return `${slot.value}%`;
  if (slot.slot === "tenor_months") return `${slot.value} meses`;
  return slot.value;
};

const outputFor = (turn = intentGoldTurns[0]!, overrides: Partial<IntentClassifierOutput> = {}): IntentClassifierOutput => ({
  routingCore: {
    action: {value: [turn.expected.semantic.canonicalAction], state: "inferred", confidence: 0.99},
    object: {value: turn.expected.semantic.objectKinds.map((kind) => ({kind, reference: [
      ...turn.expected.semantic.materialReferences.filter((entry) => entry.kind === kind).map((entry) => entry.reference),
      ...turn.expected.semantic.materialSlots.filter((entry) => entry.kind === kind).map(slotSurface),
    ].join(" ") || null})), state: "explicit"},
    desiredOutcome: {value: turn.expected.semantic.desiredOutcomeSignals.map((signals) => signals[0]).join(" "), state: "explicit", affirmation: "affirmed"},
    decision: {value: decisionText[turn.expected.semantic.decision.category], state: turn.expected.semantic.decision.present ? "explicit" : "not_applicable", affirmation: turn.expected.semantic.decision.present ? "affirmed" : "not_applicable"},
    audience: {value: [audienceText[turn.expected.semantic.audienceCategory]], state: "explicit", affirmation: turn.expected.semantic.audienceCategory === "unspecified" ? "uncertain" : "affirmed"},
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
      routingCore: {...outputFor(turn).routingCore, object: {value: [{kind: "market"}], state: "explicit"}},
    });
    expect(scoreIntentGoldTurn(turn, wrongObject, wrongObject).objectKindsExact).toBe(false);
    const wrongOutcome = outputFor(turn, {
      routingCore: {...outputFor(turn).routingCore, desiredOutcome: {value: "texto genérico", state: "explicit", affirmation: "affirmed"}},
    });
    expect(scoreIntentGoldTurn(turn, wrongOutcome, wrongOutcome).desiredOutcome).toBe(false);
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

    const noDecision = outputFor(turn, {routingCore: {...outputFor(turn).routingCore, decision: {value: null, state: "unknown", affirmation: "not_applicable"}}});
    const decisionChecks = scoreIntentGoldTurn(turn, actual, noDecision);
    expect(decisionChecks.decisionPresence).toBe(false);
    expect(decisionChecks.decisionCategory).toBe(false);
  });

  it("rejects structured negation and contradiction instead of matching positive keywords", () => {
    const turn = intentGoldTurns.find(({id}) => id === "gc01-t01")!;
    const base = outputFor(turn);
    const contradicted = [
      outputFor(turn, {routingCore: {...base.routingCore, desiredOutcome: {value: "não preparar reunião", state: "explicit", affirmation: "negated"}}}),
      outputFor(turn, {routingCore: {...base.routingCore, decision: {value: "não existe decisão de capital", state: "explicit", affirmation: "negated"}}}),
      outputFor(turn, {routingCore: {...base.routingCore, audience: {value: ["não é para VP"], state: "explicit", affirmation: "negated"}}}),
    ];
    expect(scoreIntentGoldTurn(turn, contradicted[0]!, contradicted[0]!).desiredOutcome).toBe(false);
    expect(scoreIntentGoldTurn(turn, contradicted[1]!, contradicted[1]!).decisionPresence).toBe(false);
    expect(scoreIntentGoldTurn(turn, contradicted[1]!, contradicted[1]!).decisionCategory).toBe(false);
    expect(scoreIntentGoldTurn(turn, contradicted[2]!, contradicted[2]!).audienceCategory).toBe(false);
    for (const output of contradicted) expect(intentRoutingFingerprint(output)).not.toBe(intentRoutingFingerprint(base));
  });

  it("binds each material reference to its object and requires numeric assumptions", () => {
    const capitalTurn = intentGoldTurns.find(({id}) => id === "hx04")!;
    const swapped = outputFor(capitalTurn);
    swapped.routingCore.object.value = swapped.routingCore.object.value.map((object) => object.kind === "alternative"
      ? {...object, reference: "R$ 80 milhões"}
      : {...object, reference: "capex"});
    expect(scoreIntentGoldTurn(capitalTurn, swapped, swapped).materialReferences).toBe(false);

    const modelTurn = intentGoldTurns.find(({id}) => id === "gc05-t03")!;
    expect(modelTurn.expected.semantic.materialSlots).toEqual(expect.arrayContaining([
      {kind: "scenario", slot: "indexer", value: "CDI"},
      {kind: "scenario", slot: "percentage", value: "12"},
      {kind: "scenario", slot: "tenor_months", value: "84"},
    ]));
    const missingRate = outputFor(modelTurn);
    missingRate.routingCore.object.value = missingRate.routingCore.object.value.map((object) => ({...object, reference: "CDI sete anos"}));
    expect(scoreIntentGoldTurn(modelTurn, missingRate, missingRate).materialReferences).toBe(false);

    const structureTurn = intentGoldTurns.find(({id}) => id === "gc03-t01")!;
    const missingTicket = outputFor(structureTurn);
    missingTicket.routingCore.object.value = missingTicket.routingCore.object.value.map((object) => object.kind === "operation"
      ? {...object, reference: "recebíveis"}
      : object);
    expect(scoreIntentGoldTurn(structureTurn, missingTicket, missingTicket).materialReferences).toBe(false);
    expect(normalizedMaterialSlots("captação BRL50m, CDI em 12%, prazo de 7 anos")).toEqual(expect.arrayContaining([
      {slot: "amount", value: "50000000"}, {slot: "currency", value: "BRL"},
      {slot: "indexer", value: "CDI"}, {slot: "percentage", value: "12"}, {slot: "tenor_months", value: "84"},
    ]));
    expect(normalizedMaterialSlots("captação de R$ 50 milhões, CDI de 12%, prazo de sete anos"))
      .toEqual(normalizedMaterialSlots("captação BRL50m, CDI em 12%, prazo de 7 anos"));
  });

  it("changes the stability fingerprint for every semantic or plan-driving axis", () => {
    const turn = intentGoldTurns[0]!; const base = outputFor(turn); const baseFingerprint = intentRoutingFingerprint(base);
    const mutations: IntentClassifierOutput[] = [
      {...base, routingCore: {...base.routingCore, action: {...base.routingCore.action, value: ["review"]}}},
      {...base, routingCore: {...base.routingCore, object: {...base.routingCore.object, value: [{kind: "market", reference: "Camil"}]}}},
      {...base, routingCore: {...base.routingCore, desiredOutcome: {...base.routingCore.desiredOutcome, value: "outro resultado"}}},
      {...base, routingCore: {...base.routingCore, decision: {...base.routingCore.decision, value: "decidir risco de crédito"}}},
      {...base, routingCore: {...base.routingCore, audience: {...base.routingCore.audience, value: ["conselho"]}}},
      {...base, routingCore: {...base.routingCore, depth: {...base.routingCore.depth, value: "institutional"}}},
    ];
    for (const changed of mutations) expect(intentRoutingFingerprint(changed)).not.toBe(baseFingerprint);
    const modelTurn = intentGoldTurns.find(({id}) => id === "gc05-t03")!;
    const cdi = outputFor(modelTurn);
    const cdiPlusSpread = outputFor(modelTurn);
    cdiPlusSpread.routingCore.object.value = cdiPlusSpread.routingCore.object.value.map((object) => ({...object, reference: "CDI + 15% sete anos"}));
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
      ? observation(stability, 3, {...outputFor(stability), routingCore: {...outputFor(stability).routingCore, audience: {value: ["conselho"], state: "explicit", affirmation: "affirmed"}}})
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
      rawActual: {...entry.rawActual!, routingCore: {...entry.rawActual!.routingCore, action: {value: ["review"], state: "explicit" as const}}},
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
