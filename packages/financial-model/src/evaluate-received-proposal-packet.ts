import Decimal from "decimal.js";
import {z} from "zod";
import {financialCoreVersion} from "@offroad/financial-core";
import {adoptedReceivedProposalInputSchema, calculateAdoptedReceivedProposal} from "./adopted-evaluate-received-proposal";
import {adoptedReceivedProposalOutputSchema, receivedProposalBucketReasons, receivedProposalNetConventions, receivedProposalFingerprint, verifiedReceivedProposalFingerprint} from "./evaluate-received-proposal-results";

export const receivedProposalPacketVersion = "2026.10.27-v1";
const Exact = Decimal.clone({precision: 60});
const text = z.string().trim().min(1).max(2000), key = z.string().trim().min(1).max(160), date = z.iso.date();
const hash = z.string().regex(/^[a-f0-9]{64}$/), decimal = z.string().regex(/^-?\d{1,24}(?:\.\d{1,20})?$/);
export const receivedProposalPacketExclusions = ["proposal_acceptance", "counterparty_contact", "credit_approval", "legal_opinion", "reciprocity_pricing"] as const;
/** A tight headroom, in turns of EBITDA, below which the tree makes the covenant a negotiation point. */
const tightHeadroom = new Exact("0.3");

export const receivedProposalFactCodes = ["proposal_indicative", "collateral_exceeds_assignable_portfolio", "assignment_prohibited_receivables_excluded", "indenture_consent_required",
  "peak_year_service_exceeds_available_cash", "cash_below_minimum_with_proposal", "board_policy_breached_in_a_case", "lender_tests_more_often_than_indenture",
  "restricted_account_requested", "coverage_at_top_of_reference"] as const;
export const receivedProposalReadingCodes = ["term_longer_than_seasonal_use", "term_shorter_than_capex_use", "all_in_cost_well_above_nominal", "nominal_spread_below_range",
  "nominal_spread_at_or_below_median", "nominal_spread_above_median_within_range", "nominal_spread_above_range", "improvement_partly_paid_in_collateral", "real_improvement_against_last_operation",
  "covenant_headroom_tight", "diligence_may_reopen_structure", "covenant_tests_missing", "net_cost_conditioned_on_taxable_profit"] as const;
export const receivedProposalRecommendationCodes = ["address_indenture_consent_before_signing", "ask_longer_grace_and_tenor", "ask_lower_coverage_and_no_restricted_account",
  "separate_uses_by_term", "keep_price_discussion_secondary"] as const;
export const receivedProposalChangeCodes = ["debtor_consent_for_restricted_receivables", "indenture_clause_wording", "other_free_asset_for_collateral", "seasonal_need_above_adopted",
  "committed_terms_after_diligence"] as const;
/** Asked before any reading when the term itself is not confirmed. */
export const receivedProposalOpenQuestionCodes = ["indexer_confirmation"] as const;
export const receivedProposalQuestionCodes = ["lender_covenant_definition", "reciprocity_expected_by_lender", "restricted_debtor_consent", "indenture_clause_wording", "other_free_asset"] as const;

/** One received proposal, evaluated for the company that would take it. */
export const receivedProposalPacketInputSchema = z.strictObject({
  schemaVersion: z.literal("received-proposal-packet-input.v1"),
  question: text,
  analysis: adoptedReceivedProposalInputSchema,
});
export type ReceivedProposalPacketInput = z.infer<typeof receivedProposalPacketInputSchema>;

export const receivedProposalPacketOutputSchema = z.strictObject({
  schemaVersion: z.literal("received-proposal-packet.v1"), executorVersion: z.literal(receivedProposalPacketVersion), financialCoreVersion: key,
  question: text, basisFingerprint: hash, scope: adoptedReceivedProposalInputSchema.shape.scope, entityId: z.uuid(), currency: z.string().regex(/^[A-Z]{3}$/),
  result: adoptedReceivedProposalOutputSchema,
  /** What the answer must say, in the order the tree weighs it. */
  readings: z.strictObject({
    firmness: z.strictObject({firmness: z.enum(["indicative", "committed"]), validUntil: date, bankSawIndenture: z.boolean(), diligenceMayReopenStructure: z.boolean()}),
    liquidity: z.strictObject({peakYear: z.number().int(), existingService: decimal, proposalService: decimal, totalService: decimal, availableForService: decimal,
      peakQuarter: date, minimumCashWith: z.strictObject({periodEnd: date, amount: decimal}), firstBelowPolicyWith: date.nullable(), firstBelowPolicyWithout: date.nullable()}),
    fit: z.strictObject({seasonalShare: decimal, weightedAverageLifeYears: decimal, finalPaymentDate: date,
      uses: z.array(z.strictObject({id: key, amount: decimal, reading: z.enum(["longer_than_use", "shorter_than_use", "within_use"])})).min(1).max(8)}),
    covenant: z.strictObject({rows: z.array(z.strictObject({date, scenario: key, ratioWith: decimal.nullable(),
      headroom: z.array(z.strictObject({limitId: z.enum(["indenture", "proposal", "board-policy"]), testedOnDate: z.boolean(), headroomWith: decimal.nullable(), breachedWith: z.boolean()})).max(3)})).max(12),
      testsPerYear: z.strictObject({indenture: z.number().int(), lender: z.number().int()}),
      anyBreachWith: z.boolean().nullable(), missingTests: z.array(z.strictObject({date, scenario: key})).max(64),
      untestedLimits: z.array(z.enum(["indenture", "proposal", "board-policy"])).max(3)}),
    collateral: z.strictObject({required: decimal, nominallyFree: decimal, assignable: decimal, shortfallToAssignable: decimal.nullable(), assignableLeftAfter: decimal.nullable(),
      seasonalPeak: decimal.nullable(), excluded: z.array(z.strictObject({id: key, amount: decimal, holder: text.nullable(), reasons: z.array(z.enum(receivedProposalBucketReasons)).min(1).max(3)})).max(12),
      coverage: decimal, restrictedAccount: z.boolean()}),
    negativePledge: z.strictObject({basis: z.enum(["aggregate", "per_operation"]), limit: decimal, occupied: decimal, remaining: decimal, consentRequired: z.boolean(), excess: decimal.nullable(),
      consentBy: date, needDate: date, slackDays: z.number().int()}),
    /** Price is two readings: the nominal spread against the market and the cost over the life; never one for the other. */
    price: z.strictObject({nominalSpread: decimal, equivalentSpread: decimal, equivalentSpreadNet: decimal.nullable(),
      /** The net figure is the spread reduced by the tax rate, assuming full deduction when paid; stated only under lucro real with every period taxable. */
      netConvention: z.enum(receivedProposalNetConventions), upfrontShare: decimal, creditTaxRate: decimal,
      weightedAverageLifeYears: decimal, marketPosition: z.enum(["below_range", "at_or_below_median", "above_median_within_range", "above_range"]).nullable(),
      history: z.strictObject({observedBps: decimal, expectedBps: decimal, residualBps: decimal.nullable()}).nullable()}),
    /** What to ask the lender, each with what it buys. */
    asks: z.array(z.strictObject({id: key, label: text, peakYearServiceDelta: decimal, equivalentSpreadDeltaBps: decimal, collateralDelta: decimal, consentStillRequired: z.boolean(), netConvention: z.enum(receivedProposalNetConventions),
      restrictedAccount: z.boolean()})).max(4),
    alternatives: z.array(z.strictObject({id: key, usesCovered: z.array(key).min(1).max(8), allInSpreadDifferenceBps: decimal.nullable(), consentRequired: z.boolean()})).max(4),
    /** Fact, reading and recommendation kept apart, with what would change the conclusion. There is no verdict field. */
    assessment: z.strictObject({facts: z.array(z.enum(receivedProposalFactCodes)).max(10), readings: z.array(z.enum(receivedProposalReadingCodes)).max(13),
      recommendations: z.array(z.enum(receivedProposalRecommendationCodes)).max(5), wouldChange: z.array(z.enum(receivedProposalChangeCodes)).max(5)}),
    questions: z.array(z.enum(receivedProposalQuestionCodes)).max(5),
    /** The packet speaks of terms; it neither accepts the proposal nor writes to the lender. */
    process: z.strictObject({acceptsProposal: z.literal(false), contactsLender: z.literal(false), counterproposalSent: z.literal(false)}),
  }).nullable(),
  gaps: z.array(z.strictObject({operand: text, reason: text})).max(1024),
  openQuestions: z.array(z.enum(receivedProposalOpenQuestionCodes)).max(1),
  status: z.enum(["framed", "partial", "prepared_for_human_review"]),
  exclusions: z.array(z.enum(receivedProposalPacketExclusions)).length(5)
    .refine((v) => v.join("|") === receivedProposalPacketExclusions.join("|"), "Exact exclusion ledger required"),
  grantsExecution: z.literal(false), grantsPublication: z.literal(false), fingerprint: hash,
}).superRefine(verifiedReceivedProposalFingerprint);
export type ReceivedProposalPacket = z.infer<typeof receivedProposalPacketOutputSchema>;

/** Whether a received proposal is good for the company that would take it, read on terms and never as a
 * verdict: its cost over its life apart from its nominal spread, its service against the year the
 * company's calendar already concentrates, its fit with each use of the money, the covenant on every
 * definition and on the board's policy, the collateral against the portfolio that can be assigned and
 * against the indenture's basket, its spread against the market and the company's last operation, what
 * each ask to the lender buys, and what would change the reading. Deterministic; contacts no one. */
export function prepareReceivedProposalPacket(raw: unknown): ReceivedProposalPacket {
  const input = receivedProposalPacketInputSchema.parse(raw);
  const result = adoptedReceivedProposalOutputSchema.parse(calculateAdoptedReceivedProposal(input.analysis));
  const e = result.evaluation;
  const readings = e ? (() => {
    const peak = e.calendar.years.find((y) => y.year === e.calendar.peakYear)!;
    const consent = e.negativePledge.consentRequired, shortfall = e.collateral.shortfallToAssignable !== null && new Exact(e.collateral.shortfallToAssignable).gt(0);
    const prohibited = e.collateral.portfolio.buckets.some((b) => b.reasons.includes("assignment_prohibited_without_debtor_consent"));
    const policyBreached = e.covenant.rows.some((r) => r.limits.some((l) => l.limitId === "board-policy" && l.testedOnDate && l.breachedWith));
    const tight = e.covenant.rows.some((r) => r.limits.some((l) => l.kind === "contractual" && l.testedOnDate && l.headroomWith !== null && new Exact(l.headroomWith).lt(tightHeadroom)));
    const diligence = consent && !e.proposal.bankSawIndenture;
    const residual = e.price.history?.residualBps ?? null, guarantee = e.price.history?.steps.some((s) => s.family === "guarantee" && new Exact(s.bps).lt(0)) ?? false;
    const peakRelief = e.variants.some((v) => new Exact(v.deltas.peakYearService).lt(0));
    const lighterCollateral = e.variants.some((v) => new Exact(v.deltas.collateral).lt(0) || (!v.restrictedAccount && e.collateral.restrictedAccount));
    const usesCoveredWithoutConsent = new Set(e.alternatives.filter((a) => !a.consentRequired).flatMap((a) => a.usesCovered));
    const seasonal = e.fit.uses.filter((u) => u.kind === "seasonal_working_capital");
    const market = e.price.market?.position ?? null;
    const facts = ([["proposal_indicative", e.proposal.firmness === "indicative"], ["collateral_exceeds_assignable_portfolio", shortfall],
      ["assignment_prohibited_receivables_excluded", prohibited], ["indenture_consent_required", consent],
      ["peak_year_service_exceeds_available_cash", new Exact(peak.shortfallWith).gt(0)], ["cash_below_minimum_with_proposal", e.calendar.minimumCash.belowPolicyWith.length > 0],
      ["board_policy_breached_in_a_case", policyBreached], ["lender_tests_more_often_than_indenture", e.covenant.testsPerYear.lender > e.covenant.testsPerYear.indenture],
      ["restricted_account_requested", e.collateral.restrictedAccount], ["coverage_at_top_of_reference", e.collateral.coverageReference.atOrAboveTop]] as const).filter(([, on]) => on).map(([c]) => c);
    const readingCodes = ([["term_longer_than_seasonal_use", seasonal.some((u) => u.reading === "longer_than_use")],
      ["term_shorter_than_capex_use", e.fit.uses.some((u) => u.kind === "long_lived_capex" && u.reading === "shorter_than_use")],
      ["all_in_cost_well_above_nominal", new Exact(e.cost.nominalToEquivalentBps).gt(100)],
      ["nominal_spread_below_range", market === "below_range"], ["nominal_spread_at_or_below_median", market === "at_or_below_median"],
      ["nominal_spread_above_median_within_range", market === "above_median_within_range"], ["nominal_spread_above_range", market === "above_range"],
      ["improvement_partly_paid_in_collateral", residual !== null && new Exact(residual).gt(0) && guarantee], ["real_improvement_against_last_operation", residual !== null && !new Exact(residual).gt(0)],
      ["covenant_headroom_tight", tight], ["diligence_may_reopen_structure", diligence], ["covenant_tests_missing", e.covenant.missingTests.length > 0],
      ["net_cost_conditioned_on_taxable_profit", e.cost.netConvention === "not_all_periods_taxable" || e.cost.netConvention === "life_beyond_fiscal_calendar"]] as const).filter(([, on]) => on).map(([c]) => c);
    const recommendations = ([["address_indenture_consent_before_signing", consent], ["ask_longer_grace_and_tenor", peakRelief],
      ["ask_lower_coverage_and_no_restricted_account", lighterCollateral], ["separate_uses_by_term", e.fit.uses.every((u) => usesCoveredWithoutConsent.has(u.id))],
      ["keep_price_discussion_secondary", market === "at_or_below_median" || market === "above_median_within_range"]] as const).filter(([, on]) => on).map(([c]) => c);
    const wouldChange = ([["debtor_consent_for_restricted_receivables", prohibited && shortfall], ["indenture_clause_wording", consent], ["other_free_asset_for_collateral", consent],
      ["seasonal_need_above_adopted", seasonal.length > 0], ["committed_terms_after_diligence", e.proposal.firmness === "indicative"]] as const).filter(([, on]) => on).map(([c]) => c);
    const questions = ([["lender_covenant_definition", e.proposal.covenantDefinition === "not_stated"], ["reciprocity_expected_by_lender", e.proposal.reciprocity === "none_stated"],
      ["restricted_debtor_consent", prohibited && shortfall], ["indenture_clause_wording", consent], ["other_free_asset", consent]] as const).filter(([, on]) => on).map(([c]) => c);
    return {
      firmness: {firmness: e.proposal.firmness, validUntil: e.proposal.validUntil, bankSawIndenture: e.proposal.bankSawIndenture, diligenceMayReopenStructure: diligence},
      liquidity: {peakYear: peak.year, existingService: peak.existingService, proposalService: peak.proposalService, totalService: peak.totalService, availableForService: peak.availableForService,
        peakQuarter: e.calendar.peakQuarter.periodEnd, minimumCashWith: e.calendar.minimumCash.with,
        firstBelowPolicyWith: e.calendar.minimumCash.belowPolicyWith[0] ?? null, firstBelowPolicyWithout: e.calendar.minimumCash.belowPolicyWithout[0] ?? null},
      fit: {seasonalShare: e.fit.seasonalShare, weightedAverageLifeYears: e.fit.weightedAverageLifeYears, finalPaymentDate: e.proposal.finalPaymentDate,
        uses: e.fit.uses.map((u) => ({id: u.id, amount: u.amount, reading: u.reading}))},
      covenant: {rows: e.covenant.rows.map((r) => ({date: r.date, scenario: r.scenario, ratioWith: r.ratioWith,
        headroom: r.limits.map((l) => ({limitId: l.limitId, testedOnDate: l.testedOnDate, headroomWith: l.headroomWith, breachedWith: l.breachedWith}))})), testsPerYear: e.covenant.testsPerYear,
        anyBreachWith: e.covenant.anyBreachWith, missingTests: e.covenant.missingTests, untestedLimits: e.covenant.untestedLimits},
      collateral: {required: e.collateral.required, nominallyFree: e.collateral.portfolio.nominallyFree, assignable: e.collateral.portfolio.assignable,
        shortfallToAssignable: e.collateral.shortfallToAssignable, assignableLeftAfter: e.collateral.assignableLeftAfter, seasonalPeak: e.collateral.seasonalPeak,
        excluded: e.collateral.portfolio.buckets.filter((b) => !b.assignable).map((b) => ({id: b.id, amount: b.amount, holder: b.holder, reasons: b.reasons})),
        coverage: e.collateral.coverage, restrictedAccount: e.collateral.restrictedAccount},
      negativePledge: {basis: e.negativePledge.basis, limit: e.negativePledge.limit, occupied: e.negativePledge.occupied, remaining: e.negativePledge.remaining, consentRequired: consent,
        excess: e.negativePledge.excess, consentBy: e.negativePledge.consentWindow.by, needDate: e.negativePledge.consentWindow.needDate, slackDays: e.negativePledge.consentWindow.slackDays},
      price: {nominalSpread: e.proposal.annualSpread, equivalentSpread: e.cost.equivalentSpread, equivalentSpreadNet: e.cost.equivalentSpreadNet, netConvention: e.cost.netConvention, upfrontShare: e.cost.upfrontShare,
        creditTaxRate: e.cost.creditTaxRate, weightedAverageLifeYears: e.cost.weightedAverageLifeYears, marketPosition: market,
        history: e.price.history ? {observedBps: e.price.history.observedBps, expectedBps: e.price.history.expectedBps, residualBps: e.price.history.residualBps} : null},
      asks: e.variants.map((v) => ({id: v.id, label: v.label, peakYearServiceDelta: v.deltas.peakYearService, equivalentSpreadDeltaBps: v.deltas.equivalentSpreadBps,
        collateralDelta: v.deltas.collateral, consentStillRequired: v.collateral.consentRequired, netConvention: v.netConvention, restrictedAccount: v.restrictedAccount})),
      alternatives: e.alternatives.map((a) => ({id: a.id, usesCovered: a.usesCovered, allInSpreadDifferenceBps: a.allInSpreadDifferenceBps, consentRequired: a.consentRequired})),
      assessment: {facts: [...facts], readings: [...readingCodes], recommendations: [...recommendations], wouldChange: [...wouldChange]}, questions: [...questions],
      process: {acceptsProposal: false as const, contactsLender: false as const, counterproposalSent: false as const},
    };
  })() : null;
  const prefix = `received_proposal.${input.analysis.analysisId}.`;
  const gaps = [...result.gaps,
    ...(e && !e.price.market ? [{operand: prefix + "market", reason: "Referência de mercado abaixo do limiar de comparabilidade ou ausente; o preço não é comparado ao mercado"}] : []),
    ...(e && !e.price.history ? [{operand: prefix + "history", reason: "Sem operação anterior comparável; a ponte contra o histórico da companhia não roda"}] : []),
    ...(e && e.cost.netConvention === "regime_unknown" ? [{operand: prefix + "tax.regime", reason: "Regime tributário não informado; custo líquido não calculado"}] : []),
    ...(e && e.cost.netConvention === "not_all_periods_taxable" ? [{operand: prefix + "calendar.taxable", reason: "Há períodos sem lucro tributável na vida da proposta; o custo líquido pela convenção de dedução plena não é afirmado"}] : []),
    ...(e && e.cost.netConvention === "life_beyond_fiscal_calendar" ? [{operand: prefix + "tax.taxableAfterCalendar", reason: `A proposta vai até ${e.proposal.finalPaymentDate}, além do calendário fiscal; sem hipótese adotada para esses períodos, o custo líquido não é afirmado`}] : []),
    ...(e?.variants ?? []).filter((v) => v.netConvention === "life_beyond_fiscal_calendar" || v.netConvention === "not_all_periods_taxable").map((v) => ({operand: `${prefix}variant.${v.id}.net`,
      reason: v.netConvention === "life_beyond_fiscal_calendar" ? `A variante vai até ${v.finalPaymentDate}, além do calendário fiscal; custo líquido não afirmado` : "Há período sem lucro tributável na vida da variante; custo líquido não afirmado"})),
    ...(e?.covenant.untestedLimits ?? []).map((l) => ({operand: `${prefix}covenant.limit.${l}`, reason: `Nenhuma apuração adotada nas datas de teste do limite ${l}; o limite não é testado`})),
    ...(e?.covenant.missingTests ?? []).map((m) => ({operand: `${prefix}covenant.${m.scenario}.${m.date}`, reason: `Apuração exigida de ${m.date} no cenário ${m.scenario} não adotada; nenhuma conclusão de cumprimento sem ela`}))];
  const openQuestions = result.gaps.some((g) => g.operand.endsWith(".proposal.indexer")) ? ["indexer_confirmation" as const] : [];
  const status = !e ? "framed" as const : gaps.length ? "partial" as const : "prepared_for_human_review" as const;
  const payload = {schemaVersion: "received-proposal-packet.v1" as const, executorVersion: receivedProposalPacketVersion, financialCoreVersion,
    question: input.question, basisFingerprint: result.basisFingerprint, scope: result.scope, entityId: result.entityId, currency: result.currency,
    result, readings, gaps, openQuestions, status, exclusions: [...receivedProposalPacketExclusions],
    grantsExecution: false as const, grantsPublication: false as const};
  return receivedProposalPacketOutputSchema.parse({...payload, fingerprint: receivedProposalFingerprint(payload)});
}
