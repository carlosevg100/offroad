import {createHash} from "node:crypto";

import {
  compositionPolicy,
  intentClassifierOutputSchema,
  type IntentClassifierOutput,
  type NamedComposition,
} from "@offroad/agent-contracts";
import {z} from "zod";

import {
  audienceCategorySchema,
  decisionCategorySchema,
  intentGoldTurns,
  intentGoldTurnSchema,
  intentGoldSuiteSchema,
  type IntentGoldSuite,
  type IntentGoldTurn,
} from "./intent-gold";

export const intentRouterGateChecksSchema = z.object({
  completed: z.boolean(), composition: z.boolean(), abstain: z.boolean(), depth: z.boolean(), continuity: z.boolean(),
  primaryWorksExact: z.boolean(), responsibilitiesExact: z.boolean(), canonicalAction: z.boolean(), objectKindsExact: z.boolean(),
  materialReferences: z.boolean(), desiredOutcome: z.boolean(), decisionPresence: z.boolean(), decisionCategory: z.boolean(),
  audienceCategory: z.boolean(), questionPresence: z.boolean(), questionTheme: z.boolean(),
});
export type IntentRouterGateChecks = z.infer<typeof intentRouterGateChecksSchema>;

export const intentRouterGateObservationSchema = z.object({
  turnId: z.string(), suite: intentGoldSuiteSchema, repeat: z.number().int().min(1).max(3),
  messageFingerprint: z.string().regex(/^[a-f0-9]{64}$/), expected: intentGoldTurnSchema.shape.expected,
  rawActual: intentClassifierOutputSchema.optional(), actual: intentClassifierOutputSchema.nullable(), error: z.string().nullable(),
  checks: intentRouterGateChecksSchema, routingFingerprint: z.string().nullable(), provider: z.string().nullable(), model: z.string().nullable(),
  costUsd: z.number().nonnegative(), latencyMs: z.number().nonnegative(),
});
export type IntentRouterGateObservation = z.infer<typeof intentRouterGateObservationSchema>;

const normalizeText = (value: string): string => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
const exactSet = <T extends string>(actual: readonly T[], expected: readonly T[]): boolean => {
  const left = [...new Set(actual)].sort(); const right = [...new Set(expected)].sort();
  return left.length === right.length && left.every((value, index) => value === right[index]);
};
export const fingerprintIntentMessage = (message: string): string => createHash("sha256").update(message, "utf8").digest("hex");

function classifyDecision(output: IntentClassifierOutput): z.infer<typeof decisionCategorySchema> {
  const decision = output.routingCore.decision.value?.trim();
  if (!decision) return "none";
  const text = normalizeText(`${decision} ${output.routingCore.desiredOutcome.value}`);
  if (/\b(enviar|compartilhar|introduzir|send|share|introduce|outreach)\b/.test(text)) return "external";
  if (/\b(deck|pitch|memo|material|arquivo|file|paginas?|pages?)\b/.test(text)) return "material";
  if (/\b(status|pendencias?|versoes?|workflow|projeto|project)\b/.test(text)) return "workflow";
  if (/\b(clausula|contrato|covenant|formula|documento|clause|contract|document)\b/.test(text)) return "document";
  if (/\b(credito|credit|headroom|alavancagem|leverage|risco|risk)\b/.test(text)) return "credit";
  if (/\b(mercado|market|fundos?|investidores?|lenders?|spread|pricing|shortlist|mandato)\b/.test(text)) return "market";
  if (/\b(capital|divida|debt|refinanc|financ|emissao|debenture|estrutura|alternativas?)\b/.test(text)) return "capital";
  return "none";
}

function classifyAudience(output: IntentClassifierOutput): z.infer<typeof audienceCategorySchema> {
  const text = normalizeText(output.routingCore.audience.value.join(" "));
  if (!text || /\b(unknown|desconhecid|unspecified)\b/.test(text)) return "unspecified";
  if (/\b(conselh\w*|board|comite\w*|committee)\b/.test(text)) return "board_or_committee";
  if (/\b(cfo|tesour|companhia|cliente|management|company)\b/.test(text)) return "company_management";
  if (/\b(fundos?|investidores?|financiadores?|lenders?|capital provider)\b/.test(text)) return "capital_provider";
  if (/\b(vp|md|pm|diretor|director|senior)\b/.test(text)) return "internal_senior";
  if (/\b(mercado|market)\b/.test(text)) return "market";
  if (/\b(usuario|solicitante|requester|self|eu|mim)\b/.test(text)) return "self";
  return "unspecified";
}

function emptyChecks(): IntentRouterGateChecks {
  return Object.fromEntries(Object.keys(intentRouterGateChecksSchema.shape).map((key) => [key, false])) as IntentRouterGateChecks;
}

export function scoreIntentGoldTurn(gold: IntentGoldTurn, output: IntentClassifierOutput | null): IntentRouterGateChecks {
  if (!output) return emptyChecks();
  const expected = gold.expected;
  const refs = normalizeText(output.routingCore.object.value.map((object) => object.reference ?? "").join(" "));
  const outcome = normalizeText(output.routingCore.desiredOutcome.value);
  const question = normalizeText(output.firstQuestion ?? "");
  const questionTheme = expected.firstQuestionTheme === null
    ? output.firstQuestion === null
    : expected.firstQuestionSignals.every((alternatives) => alternatives.some((signal) => question.includes(normalizeText(signal))));
  const decisionPresent = Boolean(output.routingCore.decision.value?.trim());
  return {
    completed: true,
    composition: output.composition === expected.composition,
    abstain: output.abstain === expected.abstain,
    depth: output.routingCore.depth.value === expected.depth,
    continuity: output.routingCore.continuity.value === expected.continuity,
    primaryWorksExact: exactSet(output.primaryWorks.map(({work}) => work), expected.primaryWorks)
      && output.primaryWorks[0]?.work === expected.primaryWorks[0],
    responsibilitiesExact: exactSet(output.routingCore.workResponsibility.value, expected.workResponsibility),
    canonicalAction: output.routingCore.action.value.length === 1
      && output.routingCore.action.value[0] === expected.semantic.canonicalAction,
    objectKindsExact: exactSet(output.routingCore.object.value.map(({kind}) => kind), expected.semantic.objectKinds),
    materialReferences: expected.semantic.materialReferences.every((reference) => refs.includes(normalizeText(reference))),
    desiredOutcome: expected.semantic.desiredOutcomeSignals.every((alternatives) => alternatives.some((signal) => outcome.includes(normalizeText(signal)))),
    decisionPresence: decisionPresent === expected.semantic.decision.present,
    decisionCategory: classifyDecision(output) === expected.semantic.decision.category,
    audienceCategory: classifyAudience(output) === expected.semantic.audienceCategory,
    questionPresence: (output.firstQuestion !== null) === (expected.firstQuestionTheme !== null),
    questionTheme,
  };
}

/** The stability hash covers every plan-driving and semantic axis, plus the canonical policy. */
export function intentRoutingFingerprint(output: IntentClassifierOutput): string {
  const composition = output.composition as NamedComposition | null;
  const policy = composition ? compositionPolicy(composition) : null;
  const payload = {
    abstain: output.abstain, composition, policy,
    action: output.routingCore.action.value,
    objects: output.routingCore.object.value.map((object) => ({kind: object.kind, reference: normalizeText(object.reference ?? "")})).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    desiredOutcome: normalizeText(output.routingCore.desiredOutcome.value),
    decision: {present: Boolean(output.routingCore.decision.value?.trim()), category: classifyDecision(output)},
    audience: classifyAudience(output), depth: output.routingCore.depth.value, continuity: output.routingCore.continuity.value,
    primaryWorks: output.primaryWorks.map(({work}) => work), responsibilities: [...output.routingCore.workResponsibility.value].sort(),
    asksQuestion: output.firstQuestion !== null,
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export type IntentRouterGateMetric = {name: keyof IntentRouterGateChecks; passed: number; total: number; rate: number; requiredRate: 1; gatePassed: boolean};
export type IntentRouterSuiteGate = {suite: IntentGoldSuite; passed: boolean; observations: number; failedTurnIds: string[]};
export type IntentRouterGateSummary = {
  schemaVersion: "intent-router-gate.v2"; passed: boolean; observations: number; uniqueTurns: number; manifestPassed: boolean;
  missingManifestEntries: string[]; extraManifestEntries: string[]; duplicateManifestEntries: string[]; messageFingerprintMismatches: string[];
  metrics: IntentRouterGateMetric[]; suiteGates: IntentRouterSuiteGate[]; stableTurns: number; repeatedTurns: number;
  stabilityRate: number; requiredStabilityRate: 1; unstableTurnIds: string[]; totalCostUsd: number; totalLatencyMs: number;
};

export function expectedIntentRouterManifest(turns: readonly IntentGoldTurn[] = intentGoldTurns): Array<{turnId: string; suite: IntentGoldSuite; repeat: 1 | 2 | 3; messageFingerprint: string}> {
  return turns.flatMap((turn) => {
    const messages = turn.stabilityParaphrases ? [turn.message, ...turn.stabilityParaphrases] : [turn.message];
    return messages.map((message, index) => ({turnId: turn.id, suite: turn.suite, repeat: (index + 1) as 1 | 2 | 3, messageFingerprint: fingerprintIntentMessage(message)}));
  });
}

export function summarizeIntentRouterGate(observations: IntentRouterGateObservation[], turns: readonly IntentGoldTurn[] = intentGoldTurns): IntentRouterGateSummary {
  const expectedManifest = expectedIntentRouterManifest(turns);
  const expectedByKey = new Map(expectedManifest.map((entry) => [`${entry.turnId}:${entry.repeat}`, entry]));
  const actualByKey = new Map<string, IntentRouterGateObservation[]>();
  for (const observation of observations) {
    const key = `${observation.turnId}:${observation.repeat}`;
    actualByKey.set(key, [...(actualByKey.get(key) ?? []), observation]);
  }
  const missingManifestEntries = [...expectedByKey.keys()].filter((key) => !actualByKey.has(key));
  const extraManifestEntries = [...actualByKey.keys()].filter((key) => !expectedByKey.has(key));
  const duplicateManifestEntries = [...actualByKey.entries()].filter(([, values]) => values.length !== 1).map(([key]) => key);
  const messageFingerprintMismatches = [...expectedByKey.entries()].filter(([key, expected]) => {
    const actual = actualByKey.get(key); return actual?.length === 1 && actual[0]!.messageFingerprint !== expected.messageFingerprint;
  }).map(([key]) => key);
  const manifestPassed = observations.length === 52 && turns.length === 40 && expectedManifest.length === 52
    && missingManifestEntries.length === 0 && extraManifestEntries.length === 0
    && duplicateManifestEntries.length === 0 && messageFingerprintMismatches.length === 0;

  const firstRuns = observations.filter((observation) => observation.repeat === 1);
  const checkNames = Object.keys(intentRouterGateChecksSchema.shape) as Array<keyof IntentRouterGateChecks>;
  const metrics = checkNames.map((name): IntentRouterGateMetric => {
    const passed = firstRuns.filter((observation) => observation.checks[name]).length;
    const total = firstRuns.length; const rate = total === 0 ? 0 : passed / total;
    return {name, passed, total, rate, requiredRate: 1, gatePassed: total === 40 && passed === total};
  });
  const suiteGates = intentGoldSuiteSchema.options.map((suite): IntentRouterSuiteGate => {
    const values = firstRuns.filter((observation) => observation.suite === suite);
    const failedTurnIds = values.filter((observation) => Object.values(observation.checks).some((passed) => !passed)).map(({turnId}) => turnId);
    const expectedCount = turns.filter((turn) => turn.suite === suite).length;
    return {suite, passed: values.length === expectedCount && failedTurnIds.length === 0, observations: values.length, failedTurnIds};
  });
  const stabilityIds = turns.filter((turn) => turn.stabilityParaphrases).map((turn) => turn.id);
  const unstableTurnIds = stabilityIds.filter((turnId) => {
    const values = observations.filter((observation) => observation.turnId === turnId).sort((a, b) => a.repeat - b.repeat);
    return values.length !== 3 || new Set(values.map(({messageFingerprint}) => messageFingerprint).filter(Boolean)).size !== 3
      || values.some(({routingFingerprint}) => routingFingerprint === null)
      || new Set(values.map(({routingFingerprint}) => routingFingerprint)).size !== 1
      || values.some(({checks}) => Object.values(checks).some((passed) => !passed));
  });
  const stableTurns = stabilityIds.length - unstableTurnIds.length;
  const stabilityRate = stabilityIds.length === 0 ? 0 : stableTurns / stabilityIds.length;
  return {
    schemaVersion: "intent-router-gate.v2",
    passed: manifestPassed && metrics.every(({gatePassed}) => gatePassed) && suiteGates.every(({passed}) => passed) && stabilityRate === 1,
    observations: observations.length, uniqueTurns: firstRuns.length, manifestPassed,
    missingManifestEntries, extraManifestEntries, duplicateManifestEntries, messageFingerprintMismatches,
    metrics, suiteGates, stableTurns, repeatedTurns: stabilityIds.length, stabilityRate, requiredStabilityRate: 1,
    unstableTurnIds, totalCostUsd: observations.reduce((sum, observation) => sum + observation.costUsd, 0),
    totalLatencyMs: observations.reduce((sum, observation) => sum + observation.latencyMs, 0),
  };
}
