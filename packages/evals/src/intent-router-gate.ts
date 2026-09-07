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
  rawActual: intentClassifierOutputSchema.nullable(), actual: intentClassifierOutputSchema.nullable(), error: z.string().nullable(),
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

const semanticTagPatterns = {
  company: /\b(camil|aurora|cogna|delta|companhia|empresa|company)\b/,
  leverage: /\b(alavancagem|leverage|4[,.]7x|4[,.]7 vezes)\b/,
  covenant: /\b(covenant|headroom|clausula|clause)\b/,
  refinancing: /\b(refinanc|alongamento|liability management)\b/,
  receivables: /\b(recebiveis|receivables|tape|aging)\b/,
  instrument: /\b(debenture|ccb|fidc|bond|loan|instrumento|instrument)\b/,
  model: /\b(modelo|model|projecao|projection|premissa|assumption)\b/,
  material: /\b(material|deck|pitch|memo|one-pager|apresentacao|presentation)\b/,
  meeting: /\b(reuniao|meeting|conversa|conversation)\b/,
  decision: /\b(decisao|decision|conselho|board|comite|committee)\b/,
  capital: /\b(capital|divida|debt|financiamento|financing|emissao|issuance)\b/,
  market: /\b(mercado|market|investidores|investors|fundos|funds|financiadores|lenders)\b/,
  document: /\b(documento|document|contrato|contract|escritura|indenture|waterfall)\b/,
  performance: /\b(receita|revenue|ebitda|caixa|cash|liquidez|liquidity|desempenho|performance)\b/,
  indexer: /\b(cdi|ipca|selic|sofr|indexador|indexer)\b/,
} as const;

function semanticTags(value: string): string[] {
  const text = normalizeText(value);
  const lexical = Object.entries(semanticTagPatterns).filter(([, pattern]) => pattern.test(text)).map(([tag]) => tag);
  const normalizedNumbers = text
    .replace(/\b(sete|seven)\b/g, "7")
    .replace(/\b(doze|twelve)\b/g, "12")
    .match(/\b\d+(?:[,.]\d+)?(?:%|\s*bps|x|\s*(?:anos?|years?|meses?|months?|milhoes?|million))?\b/g)
    ?.map((token) => `number:${token.replace(",", ".").replace(/\s+/g, " ")}`) ?? [];
  return [...new Set([...lexical, ...normalizedNumbers])].sort();
}

type NormalizedMaterialSlot = {slot: "amount" | "currency" | "percentage" | "indexer" | "tenor_months"; value: string};

/** Canonical finance slots make equivalent surface forms comparable without losing economics. */
export function normalizedMaterialSlots(value: string): NormalizedMaterialSlot[] {
  const text = normalizeText(value)
    .replace(/\b(sete|seven)\b/g, "7")
    .replace(/\b(doze|twelve)\b/g, "12");
  const slots: NormalizedMaterialSlot[] = [];
  if (/(?:r\$|\bbrl(?=\d|\b)|\breais?\b)/.test(text)) slots.push({slot: "currency", value: "BRL"});
  for (const match of text.matchAll(/(?:r\$|\bbrl\b)?\s*(\d+(?:[.,]\d+)?)\s*(milhoes?|milhao|mi|mm|m|million)\b/g)) {
    const numeric = Number(match[1]!.replace(",", "."));
    if (Number.isFinite(numeric)) slots.push({slot: "amount", value: String(numeric * 1_000_000)});
  }
  for (const match of text.matchAll(/\b(\d+(?:[.,]\d+)?)\s*%/g)) {
    slots.push({slot: "percentage", value: String(Number(match[1]!.replace(",", ".")))});
  }
  for (const indexer of ["cdi", "ipca", "selic", "sofr"] as const) {
    if (new RegExp(`\\b${indexer}\\b`).test(text)) slots.push({slot: "indexer", value: indexer.toUpperCase()});
  }
  for (const match of text.matchAll(/\b(\d+)\s*(anos?|years?|meses?|months?)\b/g)) {
    const count = Number(match[1]);
    slots.push({slot: "tenor_months", value: String(/^(ano|anos|year|years)$/.test(match[2]!) ? count * 12 : count)});
  }
  return [...new Map(slots.map((slot) => [`${slot.slot}:${slot.value}`, slot])).values()]
    .sort((left, right) => `${left.slot}:${left.value}`.localeCompare(`${right.slot}:${right.value}`));
}

function classifyDecision(output: IntentClassifierOutput): z.infer<typeof decisionCategorySchema> {
  if (output.routingCore.decision.affirmation !== "affirmed") return "none";
  const decision = output.routingCore.decision.value?.trim();
  if (!decision) return "none";
  const text = normalizeText(decision);
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
  if (output.routingCore.audience.affirmation !== "affirmed") return "unspecified";
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

export function scoreIntentGoldTurn(
  gold: IntentGoldTurn,
  output: IntentClassifierOutput | null,
  rawOutput: IntentClassifierOutput | null = output,
): IntentRouterGateChecks {
  if (!output || !rawOutput) return emptyChecks();
  const expected = gold.expected;
  const outcome = normalizeText(rawOutput.routingCore.desiredOutcome.value);
  const question = normalizeText(output.firstQuestion ?? "");
  const questionTheme = expected.firstQuestionTheme === null
    ? output.firstQuestion === null
    : expected.firstQuestionSignals.every((alternatives) => alternatives.some((signal) => question.includes(normalizeText(signal))));
  const outcomeAffirmed = rawOutput.routingCore.desiredOutcome.affirmation === "affirmed";
  const decisionPresent = rawOutput.routingCore.decision.affirmation === "affirmed"
    && Boolean(rawOutput.routingCore.decision.value?.trim());
  const actualSlots = rawOutput.routingCore.object.value.flatMap((object) =>
    normalizedMaterialSlots(object.reference ?? "").map((slot) => ({kind: object.kind, ...slot})));
  return {
    completed: true,
    composition: output.composition === expected.composition,
    abstain: output.abstain === expected.abstain,
    depth: output.routingCore.depth.value === expected.depth,
    continuity: output.routingCore.continuity.value === expected.continuity,
    primaryWorksExact: exactSet(output.primaryWorks.map(({work}) => work), expected.primaryWorks)
      && output.primaryWorks[0]?.work === expected.primaryWorks[0],
    responsibilitiesExact: exactSet(output.routingCore.workResponsibility.value, expected.workResponsibility),
    canonicalAction: rawOutput.routingCore.action.value.length === 1
      && rawOutput.routingCore.action.value[0] === expected.semantic.canonicalAction,
    objectKindsExact: exactSet(rawOutput.routingCore.object.value.map(({kind}) => kind), expected.semantic.objectKinds),
    materialReferences: expected.semantic.materialReferences.every((expectedReference) => rawOutput.routingCore.object.value.some((object) =>
      object.kind === expectedReference.kind
      && normalizeText(object.reference ?? "").includes(normalizeText(expectedReference.reference))))
      && expected.semantic.materialSlots.every((expectedSlot) => actualSlots.some((actualSlot) =>
        actualSlot.kind === expectedSlot.kind && actualSlot.slot === expectedSlot.slot && actualSlot.value === expectedSlot.value)),
    desiredOutcome: outcomeAffirmed
      && expected.semantic.desiredOutcomeSignals.every((alternatives) => alternatives.some((signal) => outcome.includes(normalizeText(signal)))),
    decisionPresence: decisionPresent === expected.semantic.decision.present,
    decisionCategory: classifyDecision(rawOutput) === expected.semantic.decision.category,
    audienceCategory: classifyAudience(rawOutput) === expected.semantic.audienceCategory,
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
    objects: output.routingCore.object.value.map((object) => ({kind: object.kind, semanticTags: semanticTags(object.reference ?? ""), materialSlots: normalizedMaterialSlots(object.reference ?? "")})).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    desiredOutcome: {affirmation: output.routingCore.desiredOutcome.affirmation, semanticTags: semanticTags(output.routingCore.desiredOutcome.value)},
    decision: {affirmation: output.routingCore.decision.affirmation, present: output.routingCore.decision.affirmation === "affirmed" && Boolean(output.routingCore.decision.value?.trim()), category: classifyDecision(output)},
    audience: {affirmation: output.routingCore.audience.affirmation, category: classifyAudience(output)}, depth: output.routingCore.depth.value, continuity: output.routingCore.continuity.value,
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
  expectedMismatches: string[]; invalidObservationEntries: string[]; recordedCheckMismatches: string[]; routingFingerprintMismatches: string[];
  metrics: IntentRouterGateMetric[]; suiteGates: IntentRouterSuiteGate[]; stableTurns: number; repeatedTurns: number;
  stabilityRate: number; requiredStabilityRate: 1; unstableTurnIds: string[]; totalCostUsd: number; totalLatencyMs: number;
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
    const checks = turn ? scoreIntentGoldTurn(turn, observation.actual, observation.rawActual) : emptyChecks();
    const routingFingerprint = observation.actual ? intentRoutingFingerprint(observation.actual) : null;
    return {observation, turn, checks, routingFingerprint};
  });
  const expectedMismatches = evaluated.filter(({observation, turn}) => !turn || JSON.stringify(observation.expected) !== JSON.stringify(turn.expected))
    .map(({observation}) => `${observation.turnId}:${observation.repeat}`);
  const invalidObservationEntries = evaluated.filter(({observation}) => !observation.rawActual || !observation.actual
    || observation.error !== null || !observation.provider || !observation.model).map(({observation}) => `${observation.turnId}:${observation.repeat}`);
  const recordedCheckMismatches = evaluated.filter(({observation, checks}) =>
    Object.keys(intentRouterGateChecksSchema.shape).some((name) => observation.checks[name as keyof IntentRouterGateChecks] !== checks[name as keyof IntentRouterGateChecks]))
    .map(({observation}) => `${observation.turnId}:${observation.repeat}`);
  const routingFingerprintMismatches = evaluated.filter(({observation, routingFingerprint}) =>
    routingFingerprint === null || observation.routingFingerprint !== routingFingerprint).map(({observation}) => `${observation.turnId}:${observation.repeat}`);
  const manifestPassed = observations.length === 52 && turns.length === 40 && expectedManifest.length === 52
    && missingManifestEntries.length === 0 && extraManifestEntries.length === 0
    && duplicateManifestEntries.length === 0 && messageFingerprintMismatches.length === 0
    && expectedMismatches.length === 0 && invalidObservationEntries.length === 0
    && recordedCheckMismatches.length === 0 && routingFingerprintMismatches.length === 0;

  const firstRuns = evaluated.filter(({observation}) => observation.repeat === 1);
  const checkNames = Object.keys(intentRouterGateChecksSchema.shape) as Array<keyof IntentRouterGateChecks>;
  const metrics = checkNames.map((name): IntentRouterGateMetric => {
    const passed = firstRuns.filter(({checks}) => checks[name]).length;
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
  const unstableTurnIds = stabilityIds.filter((turnId) => {
    const values = evaluated.filter(({observation}) => observation.turnId === turnId).sort((a, b) => a.observation.repeat - b.observation.repeat);
    return values.length !== 3 || new Set(values.map(({observation}) => observation.messageFingerprint).filter(Boolean)).size !== 3
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
    expectedMismatches, invalidObservationEntries, recordedCheckMismatches, routingFingerprintMismatches,
    metrics, suiteGates, stableTurns, repeatedTurns: stabilityIds.length, stabilityRate, requiredStabilityRate: 1,
    unstableTurnIds, totalCostUsd: observations.reduce((sum, observation) => sum + observation.costUsd, 0),
    totalLatencyMs: observations.reduce((sum, observation) => sum + observation.latencyMs, 0),
  };
}
