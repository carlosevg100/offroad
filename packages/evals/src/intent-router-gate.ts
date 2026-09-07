import {createHash} from "node:crypto";

import {
  applySemanticObjectCompilation,
  canonicalizeIntentClassifierOutput,
  compileSemanticObjects,
  compositionPolicy,
  intentClassifierOutputSchema,
  semanticObjectCompilationSchema,
  semanticObjectExtractorOutputSchema,
  type SemanticObjectCompilation,
  type IntentClassifierOutput,
  type NamedComposition,
} from "@offroad/agent-contracts";
import {fingerprintJson} from "@offroad/case-understanding";
import {z} from "zod";

import {
  intentGoldTurns,
  intentGoldTurnSchema,
  intentGoldSuiteSchema,
  type IntentGoldSuite,
  type IntentGoldTurn,
} from "./intent-gold";
import {intentGoldClassifierInput, intentGoldMessage, intentGoldObjectInput} from "./intent-router-gate-input";

export const intentRouterGateChecksSchema = z.object({
  completed: z.boolean(), composition: z.boolean(), abstain: z.boolean(), depth: z.boolean(), continuity: z.boolean(),
  primaryWorksExact: z.boolean(), responsibilitiesExact: z.boolean(), canonicalAction: z.boolean(), objectKindsExact: z.boolean(),
  materialReferences: z.boolean(), decisionPresence: z.boolean(), decisionCategory: z.boolean(),
  audienceCategory: z.boolean(), questionPresence: z.boolean(), questionTheme: z.boolean(),
});
export type IntentRouterGateChecks = z.infer<typeof intentRouterGateChecksSchema>;

export const intentRouterGateObservationSchema = z.object({
  turnId: z.string(), suite: intentGoldSuiteSchema, repeat: z.number().int().min(1).max(3),
  messageFingerprint: z.string().regex(/^[a-f0-9]{64}$/), expected: intentGoldTurnSchema.shape.expected,
  rawActual: intentClassifierOutputSchema.nullable(), actual: intentClassifierOutputSchema.nullable(), error: z.string().nullable(),
  rawObjectActual: semanticObjectExtractorOutputSchema.nullable(), objectCompilation: semanticObjectCompilationSchema.nullable(),
  rawActualFingerprint: z.string().regex(/^[a-f0-9]{64}$/).nullable(), rawObjectActualFingerprint: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  classifierInputFingerprint: z.string().regex(/^[a-f0-9]{64}$/), objectInputFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  actualFingerprint: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  checks: intentRouterGateChecksSchema, routingFingerprint: z.string().nullable(), provider: z.string().nullable(), model: z.string().nullable(),
  routeAttemptCount: z.number().int().nonnegative(), routeCostUsd: z.number().nonnegative(), routeLatencyMs: z.number().nonnegative(),
  objectProvider: z.string().nullable(), objectModel: z.string().nullable(), objectAttemptCount: z.number().int().nonnegative(),
  objectCostUsd: z.number().nonnegative(), objectLatencyMs: z.number().nonnegative(),
  costUsd: z.number().nonnegative(), latencyMs: z.number().nonnegative(),
});
export type IntentRouterGateObservation = z.infer<typeof intentRouterGateObservationSchema>;

const normalizeText = (value: string): string => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
const exactSet = <T extends string>(actual: readonly T[], expected: readonly T[]): boolean => {
  const left = [...new Set(actual)].sort(); const right = [...new Set(expected)].sort();
  return left.length === right.length && left.every((value, index) => value === right[index]);
};
const exactOrdered = <T>(actual: readonly T[], expected: readonly T[]): boolean =>
  actual.length === expected.length && actual.every((value, index) => value === expected[index]);
const assertsMeaning = (state: IntentClassifierOutput["routingCore"]["action"]["state"]): boolean =>
  state === "explicit" || state === "inferred";
const supportsPlanField = (
  state: IntentClassifierOutput["routingCore"]["action"]["state"],
  abstains: boolean,
): boolean => assertsMeaning(state) || (abstains && state === "unknown");
const hasGovernedClassifierConfidence = (output: IntentClassifierOutput): boolean => {
  const fields = [
    ...Object.values(output.routingCore),
    ...Object.values(output.inferableContext),
  ];
  return fields.every((field) => (field.state !== "inferred" && field.state !== "ambiguous") || field.confidence != null);
};
export const fingerprintIntentMessage = (message: string): string => createHash("sha256").update(message, "utf8").digest("hex");

function objectInstancesMatch(gold: IntentGoldTurn, output: IntentClassifierOutput, allowUnknownState = false): boolean {
  if (!assertsMeaning(output.routingCore.object.state)
    && !(allowUnknownState && output.routingCore.object.state === "unknown")) return false;
  const expected = gold.expected.semantic.objects;
  const actual = output.routingCore.object.value;
  if (actual.length !== expected.length) return false;
  return expected.every((expectedObject) => {
    const actualObject = actual.find(({id, ordinal}) => id === expectedObject.id && ordinal === expectedObject.ordinal);
    if (!actualObject || actualObject.kind !== expectedObject.kind) return false;
    const actualKeys = actualObject.slots.map(({key}) => key);
    const expectedKeys = expectedObject.slots.map(({key}) => key);
    if (!expectedObject.allowAdditional && !exactSet(actualKeys, expectedKeys)) return false;
    return expectedObject.slots.every((expectedSlot) => {
      const values = actualObject.slots.filter(({key}) => key === expectedSlot.key).map(({value}) => normalizeText(value));
      const allowed = expectedSlot.allowedValues.map(normalizeText);
      return values.length === expectedSlot.cardinality && values.every((value) => allowed.includes(value));
    });
  });
}

function emptyChecks(): IntentRouterGateChecks {
  return Object.fromEntries(Object.keys(intentRouterGateChecksSchema.shape).map((key) => [key, false])) as IntentRouterGateChecks;
}

export function scoreIntentGoldTurn(
  gold: IntentGoldTurn,
  output: IntentClassifierOutput | null,
  rawOutput: IntentClassifierOutput | null = output,
  objectCompilation?: SemanticObjectCompilation | null,
): IntentRouterGateChecks {
  if (!output || !rawOutput) return emptyChecks();
  const expected = gold.expected;
  const semanticOutput = output;
  const question = normalizeText(output.firstQuestion ?? "");
  const questionTheme = expected.firstQuestionTheme === null
    ? output.firstQuestion === null
    : expected.firstQuestionSignals.every((alternatives) => alternatives.some((signal) => question.includes(normalizeText(signal))));
  const objectsExact = objectInstancesMatch(gold, semanticOutput, expected.abstain);
  const decisionStateValid = expected.semantic.decision.present
    ? assertsMeaning(semanticOutput.routingCore.decisionType.state)
    : semanticOutput.routingCore.decisionType.state === "not_applicable";
  const decisionPresent = semanticOutput.routingCore.decisionType.value !== "none" && decisionStateValid;
  const audienceStateValid = expected.semantic.audienceCategory === "unspecified"
    ? semanticOutput.routingCore.audienceType.state === "unknown" || semanticOutput.routingCore.audienceType.state === "not_applicable"
    : assertsMeaning(semanticOutput.routingCore.audienceType.state);
  return {
    // Classifier completeness and semantic-object coverage are independent measurements. An
    // abstention must never be rewarded merely because extraction failed.
    completed: hasGovernedClassifierConfidence(rawOutput),
    composition: output.composition === expected.composition,
    abstain: output.abstain === expected.abstain,
    depth: output.routingCore.depth.value === expected.depth && supportsPlanField(output.routingCore.depth.state, expected.abstain),
    continuity: output.routingCore.continuity.value === expected.continuity && supportsPlanField(output.routingCore.continuity.state, expected.abstain),
    primaryWorksExact: exactOrdered(output.primaryWorks.map(({work}) => work), expected.primaryWorks),
    responsibilitiesExact: exactOrdered(output.routingCore.workResponsibility.value, expected.workResponsibility)
      && supportsPlanField(output.routingCore.workResponsibility.state, expected.abstain),
    canonicalAction: semanticOutput.routingCore.action.value.length === 1
      && semanticOutput.routingCore.action.value[0] === expected.semantic.canonicalAction
      && (assertsMeaning(semanticOutput.routingCore.action.state) || (expected.abstain && semanticOutput.routingCore.action.state === "unknown")),
    objectKindsExact: objectsExact,
    materialReferences: objectsExact,
    decisionPresence: decisionPresent === expected.semantic.decision.present,
    decisionCategory: semanticOutput.routingCore.decisionType.value === expected.semantic.decision.category && decisionStateValid,
    audienceCategory: semanticOutput.routingCore.audienceType.value === expected.semantic.audienceCategory && audienceStateValid,
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
    action: {value: output.routingCore.action.value, state: output.routingCore.action.state},
    objects: {state: output.routingCore.object.state, value: output.routingCore.object.value.map((object) => ({id: object.id, ordinal: object.ordinal, kind: object.kind, slots: [...object.slots].sort((a, b) => `${a.key}:${a.value}`.localeCompare(`${b.key}:${b.value}`))})).sort((a, b) => a.ordinal - b.ordinal)},
    decisionType: {value: output.routingCore.decisionType.value, state: output.routingCore.decisionType.state},
    audienceType: {value: output.routingCore.audienceType.value, state: output.routingCore.audienceType.state},
    depth: {value: output.routingCore.depth.value, state: output.routingCore.depth.state},
    continuity: {value: output.routingCore.continuity.value, state: output.routingCore.continuity.state},
    primaryWorks: output.primaryWorks.map(({work}) => work),
    responsibilities: {value: output.routingCore.workResponsibility.value, state: output.routingCore.workResponsibility.state},
    inferableContext: Object.fromEntries(Object.entries(output.inferableContext).map(([name, field]) => [name, {
      state: field.state,
      value: Array.isArray(field.value) ? [...field.value].sort() : field.value,
    }])),
    asksQuestion: output.firstQuestion !== null,
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export type IntentRouterGateMetric = {name: keyof IntentRouterGateChecks; passed: number; total: number; rate: number; requiredRate: 1; gatePassed: boolean};
export type IntentRouterSuiteGate = {suite: IntentGoldSuite; passed: boolean; observations: number; failedTurnIds: string[]};
export type IntentRouterGateSummary = {
  schemaVersion: "intent-router-gate.v3"; passed: boolean; observations: number; uniqueTurns: number; manifestPassed: boolean; integrityPassed: boolean;
  missingManifestEntries: string[]; extraManifestEntries: string[]; duplicateManifestEntries: string[]; messageFingerprintMismatches: string[];
  expectedMismatches: string[]; invalidObservationEntries: string[]; recordedCheckMismatches: string[]; routingFingerprintMismatches: string[];
  metrics: IntentRouterGateMetric[]; suiteGates: IntentRouterSuiteGate[]; stableTurns: number; repeatedTurns: number;
  stabilityRate: number; requiredStabilityRate: 1; unstableTurnIds: string[]; totalCostUsd: number; totalLatencyMs: number;
  fingerprintInvariantTurns: number; fingerprintInvarianceRate: number; fingerprintVariantTurnIds: string[];
  qualifiedStableTurns: number; qualifiedStabilityRate: number; qualifiedUnstableTurnIds: string[];
  inputFingerprintMismatches: string[]; chainRecompositionMismatches: string[]; actualFingerprintMismatches: string[];
  rawMetrics: IntentRouterGateMetric[]; policyOverrideObservations: number;
  objectCoverage: {complete: number; incomplete: number; rejected: number; routedComplete: number; routedTotal: number; abstentionComplete: number; abstentionIncomplete: number; abstentionRejected: number; abstentionTotal: number};
};

export function expectedIntentRouterManifest(turns: readonly IntentGoldTurn[] = intentGoldTurns): Array<{turnId: string; suite: IntentGoldSuite; repeat: 1 | 2 | 3; messageFingerprint: string}> {
  return turns.flatMap((turn) => {
    const messages = turn.stabilityParaphrases ? [turn.message, ...turn.stabilityParaphrases] : [turn.message];
    return messages.map((message, index) => ({turnId: turn.id, suite: turn.suite, repeat: (index + 1) as 1 | 2 | 3, messageFingerprint: fingerprintIntentMessage(message)}));
  });
}

const manifestKey = (entry: {turnId: string; suite: IntentGoldSuite; repeat: number; messageFingerprint: string}): string =>
  `${entry.turnId}:${entry.suite}:${entry.repeat}:${entry.messageFingerprint}`;

export function summarizeIntentRouterGate(observations: IntentRouterGateObservation[], turns: readonly IntentGoldTurn[] = intentGoldTurns): IntentRouterGateSummary {
  const expectedManifest = expectedIntentRouterManifest(turns);
  const expectedByKey = new Map(expectedManifest.map((entry) => [manifestKey(entry), entry]));
  const actualByKey = new Map<string, IntentRouterGateObservation[]>();
  for (const observation of observations) {
    const key = manifestKey(observation);
    actualByKey.set(key, [...(actualByKey.get(key) ?? []), observation]);
  }
  const missingManifestEntries = [...expectedByKey.keys()].filter((key) => !actualByKey.has(key));
  const extraManifestEntries = [...actualByKey.keys()].filter((key) => !expectedByKey.has(key));
  const duplicateManifestEntries = [...actualByKey.entries()].filter(([, values]) => values.length !== 1).map(([key]) => key);
  const expectedByTurnRepeat = new Map(expectedManifest.map((entry) => [`${entry.turnId}:${entry.repeat}`, entry]));
  const messageFingerprintMismatches = observations.filter((observation) => {
    const expected = expectedByTurnRepeat.get(`${observation.turnId}:${observation.repeat}`);
    return Boolean(expected && (expected.messageFingerprint !== observation.messageFingerprint || expected.suite !== observation.suite));
  }).map((observation) => `${observation.turnId}:${observation.repeat}`);
  const turnById = new Map(turns.map((turn) => [turn.id, turn]));
  const evaluated = observations.map((observation) => {
    const turn = turnById.get(observation.turnId);
    let message: string | null = null;
    let classifierInputFingerprint: string | null = null;
    let objectInputFingerprint: string | null = null;
    let recomposedCompilation: SemanticObjectCompilation | null = null;
    let recomposedActual: IntentClassifierOutput | null = null;
    let chainError: string | null = null;
    if (turn && observation.rawActual && observation.rawObjectActual) {
      try {
        message = intentGoldMessage(turn, observation.repeat);
        const classifierInput = intentGoldClassifierInput(turn, message);
        const objectInput = intentGoldObjectInput(turn, message);
        classifierInputFingerprint = fingerprintJson(classifierInput);
        objectInputFingerprint = fingerprintJson(objectInput);
        recomposedCompilation = compileSemanticObjects(objectInput, observation.rawObjectActual);
        recomposedActual = canonicalizeIntentClassifierOutput(
          applySemanticObjectCompilation(observation.rawActual, recomposedCompilation),
          classifierInput,
        );
      } catch (cause) {
        chainError = cause instanceof Error ? cause.message : String(cause);
      }
    }
    const checks = turn ? scoreIntentGoldTurn(turn, recomposedActual, observation.rawActual, recomposedCompilation) : emptyChecks();
    const rawChecks = turn ? scoreIntentGoldTurn(turn, observation.rawActual, observation.rawActual) : emptyChecks();
    const routingFingerprint = recomposedActual ? intentRoutingFingerprint(recomposedActual) : null;
    return {observation, turn, message, classifierInputFingerprint, objectInputFingerprint, recomposedCompilation, recomposedActual, chainError, checks, rawChecks, routingFingerprint};
  });
  const expectedMismatches = evaluated.filter(({observation, turn}) => !turn || JSON.stringify(observation.expected) !== JSON.stringify(turn.expected))
    .map(({observation}) => `${observation.turnId}:${observation.repeat}`);
  const inputFingerprintMismatches = evaluated.filter(({observation, classifierInputFingerprint, objectInputFingerprint}) =>
    observation.classifierInputFingerprint !== classifierInputFingerprint || observation.objectInputFingerprint !== objectInputFingerprint)
    .map(({observation}) => `${observation.turnId}:${observation.repeat}`);
  const chainRecompositionMismatches = evaluated.filter(({observation, recomposedCompilation, recomposedActual, chainError}) =>
    chainError !== null || !recomposedCompilation || !recomposedActual
      || fingerprintJson(observation.objectCompilation) !== fingerprintJson(recomposedCompilation)
      || fingerprintJson(observation.actual) !== fingerprintJson(recomposedActual))
    .map(({observation}) => `${observation.turnId}:${observation.repeat}`);
  const actualFingerprintMismatches = evaluated.filter(({observation, recomposedActual}) =>
    !recomposedActual || observation.actualFingerprint !== fingerprintJson(recomposedActual))
    .map(({observation}) => `${observation.turnId}:${observation.repeat}`);
  const invalidObservationEntries = evaluated.filter(({observation, recomposedCompilation, recomposedActual}) => !observation.rawActual || !observation.actual
    || !observation.rawObjectActual || !observation.objectCompilation
    || !recomposedCompilation || !recomposedActual
    || observation.rawActualFingerprint !== fingerprintJson(observation.rawActual)
    || observation.rawObjectActualFingerprint !== fingerprintJson(observation.rawObjectActual)
    || observation.error !== null || !observation.provider || !observation.model
    || !observation.objectProvider || !observation.objectModel || observation.routeAttemptCount < 1 || observation.objectAttemptCount < 1)
    .map(({observation}) => `${observation.turnId}:${observation.repeat}`);
  const recordedCheckMismatches = evaluated.filter(({observation, checks}) =>
    Object.keys(intentRouterGateChecksSchema.shape).some((name) => observation.checks[name as keyof IntentRouterGateChecks] !== checks[name as keyof IntentRouterGateChecks]))
    .map(({observation}) => `${observation.turnId}:${observation.repeat}`);
  const routingFingerprintMismatches = evaluated.filter(({observation, routingFingerprint}) =>
    routingFingerprint === null || observation.routingFingerprint !== routingFingerprint).map(({observation}) => `${observation.turnId}:${observation.repeat}`);
  const manifestPassed = observations.length === 52 && turns.length === 40 && expectedManifest.length === 52
    && missingManifestEntries.length === 0 && extraManifestEntries.length === 0
    && duplicateManifestEntries.length === 0 && messageFingerprintMismatches.length === 0
    && expectedMismatches.length === 0;
  const integrityPassed = invalidObservationEntries.length === 0
    && inputFingerprintMismatches.length === 0 && chainRecompositionMismatches.length === 0
    && actualFingerprintMismatches.length === 0 && recordedCheckMismatches.length === 0
    && routingFingerprintMismatches.length === 0;

  const firstRuns = evaluated.filter(({observation}) => observation.repeat === 1);
  const checkNames = Object.keys(intentRouterGateChecksSchema.shape) as Array<keyof IntentRouterGateChecks>;
  const metrics = checkNames.map((name): IntentRouterGateMetric => {
    const passed = firstRuns.filter(({checks}) => checks[name]).length;
    const total = firstRuns.length; const rate = total === 0 ? 0 : passed / total;
    return {name, passed, total, rate, requiredRate: 1, gatePassed: total === 40 && passed === total};
  });
  const rawMetrics = checkNames.map((name): IntentRouterGateMetric => {
    const passed = firstRuns.filter(({rawChecks}) => rawChecks[name]).length;
    const total = firstRuns.length; const rate = total === 0 ? 0 : passed / total;
    return {name, passed, total, rate, requiredRate: 1, gatePassed: total === 40 && passed === total};
  });
  const suiteGates = intentGoldSuiteSchema.options.map((suite): IntentRouterSuiteGate => {
    const values = firstRuns.filter(({observation}) => observation.suite === suite);
    const failedTurnIds = values.filter(({checks}) => Object.values(checks).some((passed) => !passed)).map(({observation}) => observation.turnId);
    const expectedCount = turns.filter((turn) => turn.suite === suite).length;
    return {suite, passed: values.length === expectedCount && failedTurnIds.length === 0, observations: values.length, failedTurnIds};
  });
  const stabilityIds = turns.filter((turn) => turn.stabilityParaphrases).map((turn) => turn.id);
  const fingerprintVariantTurnIds = stabilityIds.filter((turnId) => {
    const values = evaluated.filter(({observation}) => observation.turnId === turnId).sort((a, b) => a.observation.repeat - b.observation.repeat);
    return values.length !== 3 || new Set(values.map(({observation}) => observation.messageFingerprint).filter(Boolean)).size !== 3
      || values.some(({routingFingerprint}) => routingFingerprint === null)
      || new Set(values.map(({routingFingerprint}) => routingFingerprint)).size !== 1;
  });
  const qualifiedUnstableTurnIds = stabilityIds.filter((turnId) => {
    const values = evaluated.filter(({observation}) => observation.turnId === turnId);
    return fingerprintVariantTurnIds.includes(turnId)
      || values.length !== 3
      || values.some(({checks}) => Object.values(checks).some((passed) => !passed));
  });
  const fingerprintInvariantTurns = stabilityIds.length - fingerprintVariantTurnIds.length;
  const fingerprintInvarianceRate = stabilityIds.length === 0 ? 0 : fingerprintInvariantTurns / stabilityIds.length;
  const qualifiedStableTurns = stabilityIds.length - qualifiedUnstableTurnIds.length;
  const qualifiedStabilityRate = stabilityIds.length === 0 ? 0 : qualifiedStableTurns / stabilityIds.length;
  // Compatibility aliases retain the historical field names while making their qualified
  // semantics explicit in the new report fields above.
  const stableTurns = qualifiedStableTurns;
  const stabilityRate = qualifiedStabilityRate;
  const unstableTurnIds = qualifiedUnstableTurnIds;
  return {
    schemaVersion: "intent-router-gate.v3",
    passed: manifestPassed && integrityPassed && metrics.every(({gatePassed}) => gatePassed) && suiteGates.every(({passed}) => passed) && stabilityRate === 1,
    observations: observations.length, uniqueTurns: firstRuns.length, manifestPassed, integrityPassed,
    missingManifestEntries, extraManifestEntries, duplicateManifestEntries, messageFingerprintMismatches,
    expectedMismatches, invalidObservationEntries, recordedCheckMismatches, routingFingerprintMismatches,
    inputFingerprintMismatches, chainRecompositionMismatches, actualFingerprintMismatches,
    metrics, suiteGates, stableTurns, repeatedTurns: stabilityIds.length, stabilityRate, requiredStabilityRate: 1,
    unstableTurnIds, totalCostUsd: observations.reduce((sum, observation) => sum + observation.costUsd, 0),
    totalLatencyMs: observations.reduce((sum, observation) => sum + observation.latencyMs, 0),
    fingerprintInvariantTurns, fingerprintInvarianceRate, fingerprintVariantTurnIds,
    qualifiedStableTurns, qualifiedStabilityRate, qualifiedUnstableTurnIds,
    rawMetrics,
    policyOverrideObservations: evaluated.filter(({observation, recomposedActual}) => observation.rawActual && recomposedActual
      && fingerprintJson(observation.rawActual) !== fingerprintJson(recomposedActual)).length,
    objectCoverage: {
      complete: evaluated.filter(({recomposedCompilation}) => recomposedCompilation?.status === "complete").length,
      incomplete: evaluated.filter(({recomposedCompilation}) => recomposedCompilation?.status === "incomplete").length,
      rejected: evaluated.filter(({recomposedCompilation}) => recomposedCompilation?.status === "rejected").length,
      routedComplete: evaluated.filter(({turn, recomposedCompilation}) => !turn?.expected.abstain && recomposedCompilation?.status === "complete").length,
      routedTotal: evaluated.filter(({turn}) => !turn?.expected.abstain).length,
      abstentionComplete: evaluated.filter(({turn, recomposedCompilation}) => turn?.expected.abstain && recomposedCompilation?.status === "complete").length,
      abstentionIncomplete: evaluated.filter(({turn, recomposedCompilation}) => turn?.expected.abstain && recomposedCompilation?.status === "incomplete").length,
      abstentionRejected: evaluated.filter(({turn, recomposedCompilation}) => turn?.expected.abstain && recomposedCompilation?.status === "rejected").length,
      abstentionTotal: evaluated.filter(({turn}) => turn?.expected.abstain).length,
    },
  };
}
