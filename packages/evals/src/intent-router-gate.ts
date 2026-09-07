import {createHash} from "node:crypto";

import {
  intentClassifierOutputSchema,
  type IntentClassifierOutput,
  type PrimaryWork,
  type WorkResponsibility,
} from "@offroad/agent-contracts";
import {z} from "zod";

import {intentGoldTurnSchema, type IntentGoldTurn} from "./intent-gold";

export const intentRouterGateChecksSchema = z.object({
  completed: z.boolean(),
  composition: z.boolean(),
  abstain: z.boolean(),
  depth: z.boolean(),
  continuity: z.boolean(),
  primaryFirst: z.boolean(),
  primaryWorksIncludeExpected: z.boolean(),
  responsibilitiesIncludeExpected: z.boolean(),
  questionPresence: z.boolean(),
  questionTheme: z.boolean(),
});
export type IntentRouterGateChecks = z.infer<typeof intentRouterGateChecksSchema>;

export const intentRouterGateObservationSchema = z.object({
  turnId: z.string(),
  repeat: z.number().int().positive(),
  expected: intentGoldTurnSchema.shape.expected,
  actual: intentClassifierOutputSchema.nullable(),
  error: z.string().nullable(),
  checks: intentRouterGateChecksSchema,
  routingFingerprint: z.string().nullable(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  costUsd: z.number().nonnegative(),
  latencyMs: z.number().nonnegative(),
});
export type IntentRouterGateObservation = z.infer<typeof intentRouterGateObservationSchema>;

const sameSet = <T extends string>(actual: readonly T[], expected: readonly T[]): boolean => {
  const left = [...new Set(actual)].sort();
  const right = [...new Set(expected)].sort();
  return left.length === right.length && left.every((value, index) => value === right[index]);
};

const includesAll = <T extends string>(actual: readonly T[], expected: readonly T[]): boolean => {
  const values = new Set(actual);
  return expected.every((value) => values.has(value));
};

/** Only plan-driving values enter the stability hash; prose, confidence and explanations may vary. */
export function intentRoutingFingerprint(output: IntentClassifierOutput): string {
  const payload = {
    abstain: output.abstain,
    composition: output.composition,
    depth: output.routingCore.depth.value,
    continuity: output.routingCore.continuity.value,
    primaryWorks: output.primaryWorks.map(({work}) => work),
    workResponsibility: [...new Set(output.routingCore.workResponsibility.value)].sort(),
    asksQuestion: output.firstQuestion !== null,
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function scoreIntentGoldTurn(gold: IntentGoldTurn, output: IntentClassifierOutput | null): IntentRouterGateChecks {
  if (!output) {
    return {
      completed: false,
      composition: false,
      abstain: false,
      depth: false,
      continuity: false,
      primaryFirst: false,
      primaryWorksIncludeExpected: false,
      responsibilitiesIncludeExpected: false,
      questionPresence: false,
      questionTheme: false,
    };
  }
  const actualWorks = output.primaryWorks.map(({work}) => work);
  const actualResponsibilities = output.routingCore.workResponsibility.value;
  const normalizedQuestion = normalizeText(output.firstQuestion ?? "");
  const questionTheme = gold.expected.firstQuestionTheme === null
    ? output.firstQuestion === null
    : gold.expected.firstQuestionSignals.every((alternatives) => alternatives.some((signal) => normalizedQuestion.includes(normalizeText(signal))));
  return {
    completed: true,
    composition: output.composition === gold.expected.composition,
    abstain: output.abstain === gold.expected.abstain,
    depth: output.routingCore.depth.value === gold.expected.depth,
    continuity: output.routingCore.continuity.value === gold.expected.continuity,
    primaryFirst: actualWorks[0] === gold.expected.primaryWorks[0],
    primaryWorksIncludeExpected: includesAll<PrimaryWork>(actualWorks, gold.expected.primaryWorks),
    responsibilitiesIncludeExpected: includesAll<WorkResponsibility>(actualResponsibilities, gold.expected.workResponsibility),
    questionPresence: (output.firstQuestion !== null) === (gold.expected.firstQuestionTheme !== null),
    questionTheme,
  };
}

export type IntentRouterGateMetric = {
  name: keyof IntentRouterGateChecks;
  passed: number;
  total: number;
  rate: number;
  requiredRate: number;
  gatePassed: boolean;
};

export type IntentRouterGateSummary = {
  schemaVersion: "intent-router-gate.v1";
  passed: boolean;
  observations: number;
  uniqueTurns: number;
  metrics: IntentRouterGateMetric[];
  stableTurns: number;
  repeatedTurns: number;
  stabilityRate: number;
  requiredStabilityRate: number;
  unstableTurnIds: string[];
  totalCostUsd: number;
  totalLatencyMs: number;
};

/**
 * Promotion thresholds are deliberately strict on fields that select a workflow. Supporting
 * works/responsibilities and whether to ask are allowed one miss in a sixteen-turn set, but a
 * composition, abstention, depth, continuity or first work miss blocks promotion.
 */
export const intentRouterGateThresholds: Record<keyof IntentRouterGateChecks, number> = {
  completed: 1,
  composition: 1,
  abstain: 1,
  depth: 1,
  continuity: 1,
  primaryFirst: 1,
  primaryWorksIncludeExpected: 0.93,
  responsibilitiesIncludeExpected: 0.93,
  questionPresence: 0.93,
  questionTheme: 0.93,
};

function normalizeText(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

export function summarizeIntentRouterGate(observations: IntentRouterGateObservation[]): IntentRouterGateSummary {
  // Accuracy uses the first run of every turn; repeats exist only to measure invariance.
  const firstRuns = observations.filter((observation) => observation.repeat === 1);
  const checkNames = Object.keys(intentRouterGateThresholds) as Array<keyof IntentRouterGateChecks>;
  const metrics = checkNames.map((name): IntentRouterGateMetric => {
    const passed = firstRuns.filter((observation) => observation.checks[name]).length;
    const total = firstRuns.length;
    const rate = total === 0 ? 0 : passed / total;
    const requiredRate = intentRouterGateThresholds[name];
    return {name, passed, total, rate, requiredRate, gatePassed: rate >= requiredRate};
  });

  const byTurn = new Map<string, IntentRouterGateObservation[]>();
  for (const observation of observations) {
    const values = byTurn.get(observation.turnId) ?? [];
    values.push(observation);
    byTurn.set(observation.turnId, values);
  }
  const repeated = [...byTurn.entries()].filter(([, values]) => values.length > 1);
  const unstableTurnIds = repeated
    .filter(([, values]) => {
      const fingerprints = values.map((value) => value.routingFingerprint);
      return fingerprints.some((value) => value === null)
        || new Set(fingerprints).size !== 1
        || values.some((value) => !value.checks.questionTheme);
    })
    .map(([turnId]) => turnId)
    .sort();
  const stableTurns = repeated.length - unstableTurnIds.length;
  const stabilityRate = repeated.length === 0 ? 0 : stableTurns / repeated.length;
  const requiredStabilityRate = 1;

  return {
    schemaVersion: "intent-router-gate.v1",
    passed: metrics.every((metric) => metric.gatePassed) && stabilityRate >= requiredStabilityRate,
    observations: observations.length,
    uniqueTurns: firstRuns.length,
    metrics,
    stableTurns,
    repeatedTurns: repeated.length,
    stabilityRate,
    requiredStabilityRate,
    unstableTurnIds,
    totalCostUsd: observations.reduce((sum, observation) => sum + observation.costUsd, 0),
    totalLatencyMs: observations.reduce((sum, observation) => sum + observation.latencyMs, 0),
  };
}

/** Useful in tests and review output when an exact result should not depend on ordering. */
export function exactIntentSets(output: IntentClassifierOutput, gold: IntentGoldTurn): {works: boolean; responsibilities: boolean} {
  return {
    works: sameSet(output.primaryWorks.map(({work}) => work), gold.expected.primaryWorks),
    responsibilities: sameSet(output.routingCore.workResponsibility.value, gold.expected.workResponsibility),
  };
}
