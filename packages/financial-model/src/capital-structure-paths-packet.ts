import {createHash} from "node:crypto";
import Decimal from "decimal.js";
import {z} from "zod";
import {financialCoreVersion} from "@offroad/financial-core";
import {adoptedCapitalPathsInputSchema, calculateAdoptedCapitalStructurePaths} from "./adopted-capital-structure-paths";
import {adoptedCapitalPathsOutputSchema, capitalPathGateIdSchema} from "./capital-structure-paths-results";

export const capitalPathsPacketVersion = "2026.10.27-v1";
const Exact = Decimal.clone({precision: 60});
const text = z.string().trim().min(1).max(2000), key = z.string().trim().min(1).max(160), date = z.iso.date();
const hash = z.string().regex(/^[a-f0-9]{64}$/), decimal = z.string().regex(/^-?\d{1,24}(?:\.\d{1,20})?$/);
export const capitalPathsPacketExclusions = ["investor_demand", "lender_appetite", "legal_opinion_on_indenture", "contact_with_counterparties", "issuance_or_signature"] as const;
/** Policy headroom, in turns of EBITDA, below which the stressed case becomes a negotiation point. */
const tightHeadroom = new Exact("0.2");

export const capitalPathsFactCodes = ["status_quo_below_minimum_cash", "status_quo_peak_service_exceeds_available_cash", "indenture_basket_partly_occupied", "no_path_inside_every_gate"] as const;
export const capitalPathsReadingCodes = ["recommended_path_inside_every_gate", "cheapest_path_misses_a_gate", "paths_with_the_project_miss_gates", "stress_policy_headroom_tight",
  "shorter_amortization_fails_after_horizon", "alternative_depends_on_consent", "alternative_misses_amortization_test"] as const;
export const capitalPathsRecommendationCodes = ["follow_recommended_path_under_condition", "review_project_before_committing", "ask_for_the_longer_amortization",
  "negotiate_covenant_headroom_in_new_terms", "keep_dated_alternative"] as const;
export const capitalPathsChangeCodes = ["issue_demand_below_minimum_amount", "sensitivity_breaks_recommendation"] as const;

/** Capital structure paths for a decision, on one adopted basis. */
export const capitalPathsPacketInputSchema = z.strictObject({
  schemaVersion: z.literal("capital-structure-paths-packet-input.v1"),
  question: text,
  analysis: adoptedCapitalPathsInputSchema,
});
export type CapitalPathsPacketInput = z.infer<typeof capitalPathsPacketInputSchema>;

const amountAt = z.strictObject({periodId: date, amount: decimal});
const readingsSchema = z.strictObject({
  horizon: z.strictObject({firstPeriodEnd: date, lastPeriodEnd: date, candidatePaths: z.number().int().min(1), companionPaths: z.number().int().min(0), minimumCash: decimal}),
  /** The company if nothing is done: when cash first falls below the minimum and the year service concentrates. */
  withoutAction: z.strictObject({pathId: key, firstBelowMinimum: date.nullable(), lowest: amountAt,
    peakYear: z.strictObject({year: z.number().int(), service: decimal, principal: decimal, interestPaid: decimal, availableForService: decimal, gap: decimal})}),
  recommendation: z.strictObject({pathId: key, label: text, minimumCash: amountAt, horizonFinancingCost: decimal, netDebtAtHorizon: decimal,
    leverage: z.array(z.strictObject({periodId: date, ratio: decimal})).min(1).max(12), stressWorst: z.strictObject({periodId: date, ratio: decimal}),
    indentureLimit: decimal, policyLimit: decimal.nullable(), prepaidInstrumentIds: z.array(key).max(8),
    ebitdaByYear: z.array(z.strictObject({year: z.number().int(), ebitda: decimal})).min(1).max(12),
    /** issueTarget is the amount the plan proposes to issue; issueFloorInsideGates is the smallest amount that keeps the path inside every gate. */
    longInstrument: z.strictObject({id: key, issueTarget: decimal, issueFloorInsideGates: decimal.nullable(), drawPeriodId: date.nullable(), termYears: decimal.nullable(), firstAmortizationYear: z.number().int().nullable(),
      lastAmortizationYear: z.number().int().nullable(), equivalentSpread: decimal.nullable(), maximumSpread: decimal, equivalentSpreadAtCondition: decimal.nullable(),
      insideGatesAtCondition: z.boolean().nullable()}).nullable(),
    soundingBy: date, routeDecisionBy: date, mustPrecede: z.strictObject({instrumentId: key, date}).nullable(), daysToMaturity: z.number().int().nullable()}).nullable(),
  /** The dated fallback and the conditions it still carries. */
  alternative: z.strictObject({pathId: key, label: text, longInstrumentId: key, issueTarget: decimal, conditions: z.array(capitalPathGateIdSchema).max(8), decisionBy: date}).nullable(),
  paths: z.array(z.strictObject({id: key, label: text, role: z.enum(["status_quo", "candidate", "companion"]), rank: z.number().int().min(1), eligible: z.boolean(),
    failedGates: z.array(capitalPathGateIdSchema).max(8), minimumCash: amountAt, shortfallVsPolicyMinimum: decimal, horizonFinancingCost: decimal, netDebtAtHorizon: decimal,
    worstLeverage: decimal, stressWorstLeverage: decimal, consentRequired: z.boolean()})).min(1).max(12),
  amortization: z.array(z.strictObject({pathId: key, instrumentId: key, profileId: key, passes: z.boolean(), firstShortfallYear: z.number().int().nullable(),
    firstYear: z.strictObject({year: z.number().int(), scheduledAmortization: decimal, availableAfterInterest: decimal})})).max(48),
  wouldChange: z.strictObject({demand: z.strictObject({instrumentId: key, issueTarget: decimal, issueFloorInsideGates: decimal}).nullable(),
    /** Each sensitivity with the EBITDA by year it leaves on the recommended path, so its level is read from here and not from another method. */
    sensitivities: z.array(z.strictObject({id: key, label: text, recommendationHolds: z.boolean(), recommendedPathId: key.nullable(), failedGatesOnRecommended: z.array(capitalPathGateIdSchema).max(8),
      ebitdaByYear: z.array(z.strictObject({year: z.number().int(), ebitda: decimal})).max(12)})).max(6)}),
  /** Fact, reading and recommendation kept apart, with what would change the conclusion. There is no verdict field. */
  assessment: z.strictObject({facts: z.array(z.enum(capitalPathsFactCodes)).max(4), readings: z.array(z.enum(capitalPathsReadingCodes)).max(7),
    recommendations: z.array(z.enum(capitalPathsRecommendationCodes)).max(5), wouldChange: z.array(z.enum(capitalPathsChangeCodes)).max(2)}),
  /** The packet speaks of paths; it neither sounds investors, nor talks to banks, nor issues or signs. */
  process: z.strictObject({contactsInvestors: z.literal(false), contactsLenders: z.literal(false), issuesOrSigns: z.literal(false)}),
});

export const capitalPathsPacketOutputSchema = z.strictObject({
  schemaVersion: z.literal("capital-structure-paths-packet.v1"), executorVersion: z.literal(capitalPathsPacketVersion), financialCoreVersion: key,
  question: text, basisFingerprint: hash, scope: adoptedCapitalPathsInputSchema.shape.scope, entityId: z.uuid(), currency: z.string().regex(/^[A-Z]{3}$/),
  result: adoptedCapitalPathsOutputSchema,
  readings: readingsSchema.nullable(),
  gaps: z.array(z.strictObject({operand: text, reason: text})).max(1024),
  status: z.enum(["framed", "partial", "prepared_for_human_review"]),
  exclusions: z.array(z.enum(capitalPathsPacketExclusions)).length(5)
    .refine((v) => v.join("|") === capitalPathsPacketExclusions.join("|"), "Exact exclusion ledger required"),
  grantsExecution: z.literal(false), grantsPublication: z.literal(false), fingerprint: hash,
}).superRefine((p, ctx) => {
  // The recommendation is the kernel's first path inside every gate; a packet that names another, or a path
  // that misses a gate, is refused whatever produced it.
  const e = p.result.evaluation, r = p.readings;
  if (!e || !r) return;
  const first = e.ranking.find((x) => x.role !== "companion" && x.eligible)?.pathId ?? null;
  if ((r.recommendation?.pathId ?? null) !== first || (e.recommendation?.pathId ?? null) !== first) ctx.addIssue({code: "custom", message: "capital_paths_recommendation_not_from_gates"});
  const named = e.paths.find((x) => x.id === r.recommendation?.pathId);
  if (named && (!named.eligible || named.gates.some((g) => g.status !== "pass"))) ctx.addIssue({code: "custom", message: "capital_paths_recommended_path_misses_a_gate"});
});
export type CapitalPathsPacket = z.infer<typeof capitalPathsPacketOutputSchema>;

/** Capital structure paths for a decision, read for the person who decides: what happens without action, the
 * paths ordered by declared gates and then cost, the recommended path with its condition and its dated
 * fallback, the amortization after the horizon, and what would change the recommendation. Deterministic;
 * contacts no one and issues nothing. */
export function prepareCapitalPathsPacket(raw: unknown): CapitalPathsPacket {
  const input = capitalPathsPacketInputSchema.parse(raw);
  const result = adoptedCapitalPathsOutputSchema.parse(calculateAdoptedCapitalStructurePaths(input.analysis));
  const e = result.evaluation;
  const readings = e ? (() => {
    const pathOf = (id: string) => e.paths.find((p) => p.id === id)!;
    const statusQuo = e.paths.find((p) => p.role === "status_quo")!;
    const peak = statusQuo.debtServiceByYear.reduce((m, y) => (new Exact(y.service).gt(m.service) ? y : m));
    const worst = (rows: {periodId: string; ratio: string}[]) => rows.reduce((m, r) => (new Exact(r.ratio).gt(m.ratio) ? r : m));
    const rec = e.recommendation, recPath = rec ? pathOf(rec.pathId) : null;
    const long = rec?.longInstrument ?? null;
    const cost = long ? e.instrumentCosts.find((c) => c.instrumentId === long.instrumentId) ?? null : null;
    const conditionCost = rec?.condition?.cost.status === "calculated" ? rec.condition.cost.equivalentSpread : null;
    const alt = rec?.alternative ?? null;
    const candidates = e.paths.filter((p) => p.role !== "companion");
    const cheapest = candidates.reduce((m, p) => (new Exact(p.horizonFinancingCost).lt(m.horizonFinancingCost) ? p : m));
    // Paths that carry another variant of the investment than the recommended one.
    const withProject = candidates.filter((p) => p.projectVariantId !== recPath?.projectVariantId);
    const policyStress = recPath?.policy ? worst(recPath.policy.stress) : null;
    const policyHeadroom = recPath?.policy ? recPath.policy.stress.reduce((m, r) => (new Exact(r.headroom).lt(m) ? new Exact(r.headroom) : m), new Exact(Infinity)) : null;
    const recTests = recPath && long ? recPath.amortizationTests.filter((t) => t.instrumentId === long.instrumentId) : [];
    const shorterFails = recTests.some((t) => t.profileId !== "adopted" && !t.passes);
    const facts = ([["status_quo_below_minimum_cash", statusQuo.belowPolicyMinimum.length > 0],
      ["status_quo_peak_service_exceeds_available_cash", new Exact(peak.service).gt(peak.availableForService)],
      ["indenture_basket_partly_occupied", statusQuo.basket !== null && new Exact(statusQuo.basket.occupiedAtOpening).gt(0)],
      ["no_path_inside_every_gate", rec === null]] as const).filter(([, on]) => on).map(([c]) => c);
    const readingCodes = ([["recommended_path_inside_every_gate", rec !== null], ["cheapest_path_misses_a_gate", !cheapest.eligible],
      ["paths_with_the_project_miss_gates", rec !== null && withProject.length > 0 && withProject.every((p) => !p.eligible)],
      ["stress_policy_headroom_tight", policyHeadroom !== null && policyHeadroom.lt(tightHeadroom)], ["shorter_amortization_fails_after_horizon", shorterFails],
      ["alternative_depends_on_consent", alt !== null && alt.conditions.includes("basket_without_consent")],
      ["alternative_misses_amortization_test", alt !== null && alt.conditions.includes("amortization_after_horizon")]] as const).filter(([, on]) => on).map(([c]) => c);
    const recommendations = ([["follow_recommended_path_under_condition", rec !== null && (rec.condition?.insideGates ?? true)],
      ["review_project_before_committing", readingCodes.includes("paths_with_the_project_miss_gates")], ["ask_for_the_longer_amortization", shorterFails],
      ["negotiate_covenant_headroom_in_new_terms", readingCodes.includes("stress_policy_headroom_tight")], ["keep_dated_alternative", alt !== null && (rec?.decidedBeforeMaturity ?? false)]] as const)
      .filter(([, on]) => on).map(([c]) => c);
    const wouldChange = ([["issue_demand_below_minimum_amount", rec?.demand !== null && rec?.demand !== undefined],
      ["sensitivity_breaks_recommendation", e.sensitivities.some((s) => !s.recommendationHolds)]] as const).filter(([, on]) => on).map(([c]) => c);
    return {
      horizon: {firstPeriodEnd: e.periodEnds[0]!, lastPeriodEnd: e.periodEnds.at(-1)!, candidatePaths: candidates.length, companionPaths: e.paths.length - candidates.length, minimumCash: e.minimumCash},
      withoutAction: {pathId: statusQuo.id, firstBelowMinimum: statusQuo.belowPolicyMinimum[0] ?? null, lowest: statusQuo.minimumCash,
        peakYear: {year: peak.year, service: peak.service, principal: peak.principal, interestPaid: peak.interestPaid, availableForService: peak.availableForService,
          gap: new Exact(peak.service).minus(peak.availableForService).toFixed()}},
      recommendation: rec && recPath ? {pathId: rec.pathId, label: recPath.label, minimumCash: recPath.minimumCash, horizonFinancingCost: recPath.horizonFinancingCost,
        netDebtAtHorizon: recPath.netDebtAtHorizon, ebitdaByYear: recPath.ebitdaByYear.map((y) => ({year: y.year, ebitda: y.ebitda})), leverage: recPath.indenture.base.map((x) => ({periodId: x.periodId, ratio: x.ratio})),
        stressWorst: (({periodId, ratio}) => ({periodId, ratio}))(policyStress ?? worst(recPath.indenture.stress)),
        indentureLimit: new Exact(recPath.indenture.base[0]!.ratio).plus(recPath.indenture.base[0]!.headroom).toFixed(),
        policyLimit: recPath.policy ? new Exact(recPath.policy.base[0]!.ratio).plus(recPath.policy.base[0]!.headroom).toFixed() : null,
        prepaidInstrumentIds: recPath.prepayments.map((x) => x.instrumentId),
        longInstrument: long ? {id: long.instrumentId, issueTarget: long.amount, issueFloorInsideGates: rec.demand?.issueFloorInsideGates ?? null, drawPeriodId: long.drawPeriodId, termYears: cost?.status === "calculated" ? cost.termYears : null,
          firstAmortizationYear: long.firstAmortizationYear, lastAmortizationYear: long.lastAmortizationYear, equivalentSpread: cost?.status === "calculated" ? cost.equivalentSpread : null,
          maximumSpread: rec.condition?.maximumSpread ?? "0", equivalentSpreadAtCondition: conditionCost, insideGatesAtCondition: rec.condition?.insideGates ?? null} : null,
        soundingBy: rec.soundingBy, routeDecisionBy: rec.routeDecisionBy, mustPrecede: rec.mustPrecede,
        daysToMaturity: rec.daysToMaturity} : null,
      alternative: alt ? {pathId: alt.pathId, label: pathOf(alt.pathId).label, longInstrumentId: alt.longInstrumentId, issueTarget: alt.longInstrument.amount, conditions: alt.conditions,
        decisionBy: alt.decisionBy} : null,
      paths: e.ranking.map((x) => {const p = pathOf(x.pathId); return {id: p.id, label: p.label, role: p.role, rank: x.rank, eligible: x.eligible, failedGates: x.failedGates.map((g) => g.id),
        minimumCash: p.minimumCash, shortfallVsPolicyMinimum: p.shortfallVsPolicyMinimum, horizonFinancingCost: p.horizonFinancingCost, netDebtAtHorizon: p.netDebtAtHorizon,
        worstLeverage: worst(p.indenture.base).ratio, stressWorstLeverage: worst(p.indenture.stress).ratio, consentRequired: p.basket?.consentRequired ?? false};}),
      amortization: e.paths.flatMap((p) => p.amortizationTests.map((t) => ({pathId: p.id, instrumentId: t.instrumentId, profileId: t.profileId, passes: t.passes,
        firstShortfallYear: t.firstShortfallYear, firstYear: {year: t.years[0]!.year, scheduledAmortization: t.years[0]!.scheduledAmortization, availableAfterInterest: t.years[0]!.availableAfterInterest}}))),
      wouldChange: {demand: rec?.demand ? {instrumentId: rec.demand.instrumentId, issueTarget: rec.demand.issueTarget, issueFloorInsideGates: rec.demand.issueFloorInsideGates} : null,
        sensitivities: e.sensitivities.map((s) => ({id: s.id, label: s.label, recommendationHolds: s.recommendationHolds, recommendedPathId: s.recommendedPathId,
          failedGatesOnRecommended: s.onRecommended ? s.onRecommended.gates.filter((g) => g.status !== "pass").map((g) => g.id) : [],
          ebitdaByYear: s.onRecommended ? s.onRecommended.ebitdaByYear.map((y) => ({year: y.year, ebitda: y.ebitda})) : []}))},
      assessment: {facts: [...facts], readings: [...readingCodes], recommendations: [...recommendations], wouldChange: [...wouldChange]},
      process: {contactsInvestors: false as const, contactsLenders: false as const, issuesOrSigns: false as const},
    };
  })() : null;
  const prefix = `capital_paths.${input.analysis.analysisId}.`;
  const gaps = [...result.gaps,
    ...(e && !e.recommendation ? [{operand: prefix + "paths", reason: "Nenhum caminho adotado atende a todos os portões; não há recomendação, só a ordem e o que falta a cada caminho"}] : [])];
  const status = !e ? "framed" as const : gaps.length || !e.recommendation ? "partial" as const : "prepared_for_human_review" as const;
  const payload = {schemaVersion: "capital-structure-paths-packet.v1" as const, executorVersion: capitalPathsPacketVersion, financialCoreVersion,
    question: input.question, basisFingerprint: result.basisFingerprint, scope: result.scope, entityId: result.entityId, currency: result.currency,
    result, readings, gaps, status, exclusions: [...capitalPathsPacketExclusions],
    grantsExecution: false as const, grantsPublication: false as const};
  return capitalPathsPacketOutputSchema.parse({...payload, fingerprint: createHash("sha256").update(JSON.stringify(payload)).digest("hex")});
}
