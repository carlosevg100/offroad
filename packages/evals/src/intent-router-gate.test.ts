import {describe, expect, it} from "vitest";

import type {IntentClassifierOutput} from "@offroad/agent-contracts";

import {intentGoldTurns} from "./intent-gold";
import {
  intentRoutingFingerprint,
  scoreIntentGoldTurn,
  summarizeIntentRouterGate,
  type IntentRouterGateObservation,
} from "./intent-router-gate";

const outputFor = (turn = intentGoldTurns[0]!, overrides: Partial<IntentClassifierOutput> = {}): IntentClassifierOutput => ({
  routingCore: {
    action: {value: ["prepare"], state: "explicit"},
    object: {value: [{kind: "company", reference: "Camil"}], state: "explicit"},
    desiredOutcome: {value: "prepare work", state: "explicit"},
    decision: {value: null, state: "unknown"},
    audience: {value: ["VP"], state: "explicit"},
    depth: {value: turn.expected.depth, state: "inferred", confidence: 0.9},
    continuity: {value: turn.expected.continuity, state: "inferred", confidence: 0.9},
    workResponsibility: {value: turn.expected.workResponsibility, state: "inferred", confidence: 0.9},
  },
  inferableContext: {
    jurisdiction: {value: ["BR"], state: "inferred", confidence: 0.9},
    asOfDate: {value: null, state: "unknown"},
    currency: {value: null, state: "unknown"},
    deadline: {value: null, state: "unknown"},
    sponsorInstruction: {value: null, state: "unknown"},
    constraints: {value: [], state: "unknown"},
    urgency: {value: null, state: "unknown"},
    availableInputs: {value: [], state: "unknown"},
  },
  primaryWorks: turn.expected.primaryWorks.map((work) => ({work, confidence: 0.95})),
  composition: turn.expected.composition,
  firstQuestion: turn.expected.firstQuestionTheme
    ? `Pode confirmar ${turn.expected.firstQuestionSignals.map((signals) => signals[0]).join(" e ")}?`
    : null,
  abstain: turn.expected.abstain,
  abstainReason: turn.expected.abstain ? "request is ambiguous" : null,
  ...overrides,
});

const observation = (turnId: string, repeat: number, output: IntentClassifierOutput | null): IntentRouterGateObservation => {
  const gold = intentGoldTurns.find((turn) => turn.id === turnId)!;
  return {
    turnId,
    repeat,
    expected: gold.expected,
    actual: output,
    error: output ? null : "provider failure",
    checks: scoreIntentGoldTurn(gold, output),
    routingFingerprint: output ? intentRoutingFingerprint(output) : null,
    provider: output ? "anthropic" : null,
    model: output ? "claude-sonnet-5" : null,
    costUsd: output ? 0.01 : 0,
    latencyMs: output ? 100 : 0,
  };
};

describe("intent router promotion gate", () => {
  it("scores every workflow-selecting field against the gold turn", () => {
    const gold = intentGoldTurns[0]!;
    expect(scoreIntentGoldTurn(gold, outputFor(gold))).toEqual({
      completed: true,
      composition: true,
      abstain: true,
      depth: true,
      continuity: true,
      primaryFirst: true,
      primaryWorksIncludeExpected: true,
      responsibilitiesIncludeExpected: true,
      questionPresence: true,
      questionTheme: true,
    });
    expect(scoreIntentGoldTurn(gold, outputFor(gold, {composition: "prepare_material"})).composition).toBe(false);
    expect(scoreIntentGoldTurn(gold, null).completed).toBe(false);
  });

  it("ignores prose and confidence in the invariance fingerprint", () => {
    const gold = intentGoldTurns[0]!;
    const first = outputFor(gold);
    const second = outputFor(gold, {
      firstQuestion: "Outra redação da mesma pergunta",
      primaryWorks: first.primaryWorks.map((item) => ({...item, confidence: 0.61})),
    });
    expect(intentRoutingFingerprint(second)).toBe(intentRoutingFingerprint(first));
  });

  it("blocks promotion when the same prompt selects two different workflows", () => {
    const gold = intentGoldTurns[0]!;
    const first = outputFor(gold);
    const changed = outputFor(gold, {composition: "prepare_material"});
    const observations = intentGoldTurns.map((turn) => observation(turn.id, 1, outputFor(turn)));
    observations.push(observation(gold.id, 2, first), observation(gold.id, 3, changed));
    const summary = summarizeIntentRouterGate(observations);
    expect(summary.passed).toBe(false);
    expect(summary.unstableTurnIds).toEqual([gold.id]);
  });

  it("blocks invariance when a repeated first question leaves the gold theme", () => {
    const gold = intentGoldTurns[0]!;
    const observations = intentGoldTurns.map((turn) => observation(turn.id, 1, outputFor(turn)));
    observations.push(
      observation(gold.id, 2, outputFor(gold)),
      observation(gold.id, 3, outputFor(gold, {firstQuestion: "Qual é o seu telefone?"})),
    );
    expect(summarizeIntentRouterGate(observations).unstableTurnIds).toEqual([gold.id]);
  });

  it("passes only with complete gold accuracy and invariant repeated turns", () => {
    const observations = intentGoldTurns.map((turn) => observation(turn.id, 1, outputFor(turn)));
    for (const turn of intentGoldTurns.slice(0, 3)) {
      observations.push(observation(turn.id, 2, outputFor(turn)), observation(turn.id, 3, outputFor(turn)));
    }
    const summary = summarizeIntentRouterGate(observations);
    expect(summary.passed).toBe(true);
    expect(summary.uniqueTurns).toBe(intentGoldTurns.length);
    expect(summary.stabilityRate).toBe(1);
  });
});
