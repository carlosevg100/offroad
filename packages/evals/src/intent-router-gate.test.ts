import type {IntentClassifierOutput} from "@offroad/agent-contracts";
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

const decisionText = {none: null, capital: "decidir estrutura de capital", credit: "decidir risco de crédito e headroom", material: "decidir deck e material", market: "decidir mercado, fundos e spread", external: "decidir enviar e introduzir", workflow: "decidir status e pendências do projeto", document: "decidir cláusula e fórmula do documento"} as const;
const audienceText = {self: "solicitante", internal_senior: "VP", company_management: "CFO", board_or_committee: "conselho", capital_provider: "investidores", market: "mercado", unspecified: "desconhecido"} as const;

const outputFor = (turn = intentGoldTurns[0]!, overrides: Partial<IntentClassifierOutput> = {}): IntentClassifierOutput => ({
  routingCore: {
    action: {value: [turn.expected.semantic.canonicalAction], state: "inferred", confidence: 0.99},
    object: {value: turn.expected.semantic.objectKinds.map((kind, index) => ({kind, ...(index === 0 && turn.expected.semantic.materialReferences.length > 0 ? {reference: turn.expected.semantic.materialReferences.join(" ")} : {})})), state: "explicit"},
    desiredOutcome: {value: turn.expected.semantic.desiredOutcomeSignals.map((signals) => signals[0]).join(" "), state: "explicit"},
    decision: {value: decisionText[turn.expected.semantic.decision.category], state: turn.expected.semantic.decision.present ? "explicit" : "unknown"},
    audience: {value: [audienceText[turn.expected.semantic.audienceCategory]], state: "explicit"},
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
  actual: output, error: output ? null : "provider failure", checks: scoreIntentGoldTurn(turn, output),
  routingFingerprint: output ? intentRoutingFingerprint(output) : null, provider: output ? "anthropic" : null,
  model: output ? "governed-test-model" : null, costUsd: output ? 0.01 : 0, latencyMs: output ? 100 : 0,
});

const completeObservations = (): IntentRouterGateObservation[] => intentGoldTurns.flatMap((turn) => {
  const repeats = turn.stabilityParaphrases ? [1, 2, 3] : [1];
  return repeats.map((repeat) => observation(turn, repeat, outputFor(turn)));
});

describe("intent router promotion gate", () => {
  it("scores the explicit semantic answer key rather than only checking field presence", () => {
    const turn = intentGoldTurns[0]!;
    expect(Object.values(scoreIntentGoldTurn(turn, outputFor(turn)))).toEqual(expect.arrayContaining([true]));
    expect(Object.values(scoreIntentGoldTurn(turn, outputFor(turn))).every(Boolean)).toBe(true);
    expect(scoreIntentGoldTurn(turn, outputFor(turn, {
      routingCore: {...outputFor(turn).routingCore, object: {value: [{kind: "market"}], state: "explicit"}},
    })).objectKindsExact).toBe(false);
    expect(scoreIntentGoldTurn(turn, outputFor(turn, {
      routingCore: {...outputFor(turn).routingCore, desiredOutcome: {value: "texto genérico", state: "explicit"}},
    })).desiredOutcome).toBe(false);
    expect(scoreIntentGoldTurn(turn, null).completed).toBe(false);
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
  });

  it("requires the exact immutable 40-turn and 52-observation manifest", () => {
    expect(expectedIntentRouterManifest()).toHaveLength(52);
    expect(new Set(expectedIntentRouterManifest().filter(({repeat}) => repeat === 1).map(({turnId}) => turnId)).size).toBe(40);
    const valid = completeObservations();
    expect(summarizeIntentRouterGate(valid).manifestPassed).toBe(true);
    expect(summarizeIntentRouterGate(valid.slice(1)).manifestPassed).toBe(false);
    expect(summarizeIntentRouterGate([...valid, valid[0]!]).duplicateManifestEntries).toContain(`${valid[0]!.turnId}:1`);
    const forged = valid.map((entry, index) => index === 0 ? {...entry, messageFingerprint: fingerprintIntentMessage("same bytes")} : entry);
    expect(summarizeIntentRouterGate(forged).messageFingerprintMismatches).toContain(`${valid[0]!.turnId}:1`);
  });

  it("rejects replayed bytes and a semantic change across authored paraphrases", () => {
    const valid = completeObservations(); const stability = intentGoldTurns.find((turn) => turn.stabilityParaphrases)!;
    const repeatedBytes = valid.map((entry) => entry.turnId === stability.id && entry.repeat === 2 ? {...entry, messageFingerprint: fingerprintIntentMessage(stability.message)} : entry);
    expect(summarizeIntentRouterGate(repeatedBytes).unstableTurnIds).toContain(stability.id);
    const changedMeaning = valid.map((entry) => entry.turnId === stability.id && entry.repeat === 3
      ? observation(stability, 3, {...outputFor(stability), routingCore: {...outputFor(stability).routingCore, audience: {value: ["conselho"], state: "explicit"}}})
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
});
