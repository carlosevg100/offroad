import {createHash} from "node:crypto";
import {z} from "zod";
import {adoptedWeeklyCashOutputSchema} from "./ficha-calculation-results";

// The common adopted-result fields, taken from an existing adopted result so the shapes never drift.
const {schemaVersion: _s, analysisId: _a, perimeter: _p, weekly: _w, exclusions: _e, ...common} = adoptedWeeklyCashOutputSchema.shape;
const text = z.string().min(1).max(2000), key = z.string().min(1).max(160), date = z.iso.date();
const decimal = z.string().regex(/^-?\d{1,24}(?:\.\d{1,20})?$/);
const limitId = z.enum(["indenture", "proposal", "board-policy"]);
const collateral = {required: decimal, shortfallToAssignable: decimal.nullable(), assignableLeftAfter: decimal.nullable(), consentRequired: z.boolean(), excessOverBasket: decimal.nullable()};
export const receivedProposalNetConventions = ["full_deductibility_simplified", "not_all_periods_taxable", "life_beyond_fiscal_calendar", "no_deduction_presumido", "regime_unknown"] as const;
export const receivedProposalBucketReasons = ["assigned_to_other_creditor", "assignment_prohibited_without_debtor_consent", "past_due"] as const;

/** The dated schedule the cost and the calendar come from, as built from the adopted terms. */
const scheduleSchema = z.strictObject({baseDate: date, currency: z.string().regex(/^[A-Z]{3}$/), moneyUnit: key, grossAdvance: decimal, upfrontWithheldCosts: decimal, annualSpread: decimal,
  unpaidInterestBase: z.literal("principal_plus_accrued"),
  periods: z.array(z.strictObject({id: key, startDate: date, endDate: date, yearFraction: decimal, annualIndex: decimal, yearFractionConvention: z.literal("business_days_252"),
    businessDays: z.number().int().min(1).max(504), sourceAnchor: key, scheduledPrincipal: decimal, paysAccruedInterest: z.boolean()})).min(1).max(480)});

export const receivedProposalOutputSchema = z.strictObject({
  schemaVersion: z.literal("received-proposal.v1"), version: key, currency: z.string().regex(/^[A-Z]{3}$/), readingDate: date, needDate: date,
  proposal: z.strictObject({lender: text, firmness: z.enum(["indicative", "committed"]), validUntil: date, amount: decimal, annualSpread: decimal, drawDate: date,
    months: z.number().int().min(1).max(360), finalPaymentDate: date, bankSawIndenture: z.boolean(), prepaymentPenaltyRate: decimal, prepaymentFreeFrom: date,
    reciprocity: z.enum(["none_stated", "stated"]), covenantDefinition: z.enum(["same_as_indenture", "not_stated"]).nullable(), firstLenderTestDate: date.nullable()}),
  cost: z.strictObject({fee: decimal, creditTax: decimal, creditTaxRate: decimal, upfrontCosts: decimal, upfrontShare: decimal, weightedAverageLifeYears: decimal,
    equivalentSpread: decimal, equivalentSpreadNet: decimal.nullable(),
    netConvention: z.enum(receivedProposalNetConventions), taxRegime: z.enum(["lucro_real", "lucro_presumido", "unknown"]), nominalToEquivalentBps: decimal,
    serviceByYear: z.array(z.strictObject({year: z.number().int(), service: decimal})).max(40)}),
  calendar: z.strictObject({
    quarters: z.array(z.strictObject({periodEnd: date, existingService: decimal, proposalService: decimal, totalService: decimal, availableForService: decimal, proposalCashFlow: decimal,
      taxShield: decimal, closingCashWithout: decimal, closingCashWith: decimal, proposalPrincipal: decimal, cumulativeProposalCash: decimal})).min(1).max(40),
    years: z.array(z.strictObject({year: z.number().int(), periods: z.number().int().min(1).max(40), existingService: decimal, proposalService: decimal, totalService: decimal,
      availableForService: decimal, shortfallWithout: decimal, shortfallWith: decimal})).min(1).max(40),
    peakYear: z.number().int(), peakQuarter: z.strictObject({periodEnd: date, totalService: decimal}),
    minimumCash: z.strictObject({policy: decimal.nullable(), without: z.strictObject({periodEnd: date, amount: decimal}), with: z.strictObject({periodEnd: date, amount: decimal}),
      belowPolicyWithout: z.array(date).max(40), belowPolicyWith: z.array(date).max(40)})}),
  fit: z.strictObject({uses: z.array(z.strictObject({id: key, label: text, kind: z.enum(["seasonal_working_capital", "long_lived_capex", "refinancing", "other"]), amount: decimal, share: decimal,
    tenorMinYears: decimal, tenorMaxYears: decimal, reading: z.enum(["longer_than_use", "shorter_than_use", "within_use"])})).min(1).max(8),
    seasonalShare: decimal, amountMinusUses: decimal, weightedAverageLifeYears: decimal, finalMaturityYears: decimal}),
  collateral: z.strictObject({kind: z.enum(["receivables_assignment", "financed_asset", "other_asset", "none"]), coverage: decimal, restrictedAccount: z.boolean(), ...collateral,
    coverageReference: z.strictObject({low: decimal, high: decimal, atOrAboveTop: z.boolean()}),
    portfolio: z.strictObject({gross: decimal, assigned: decimal, nominallyFree: decimal, assignable: decimal,
      buckets: z.array(z.strictObject({id: key, label: text, amount: decimal, holder: text.nullable(), assignable: z.boolean(), reasons: z.array(z.enum(receivedProposalBucketReasons)).max(3)})).min(1).max(12)}),
    maxAmountOnAssignable: decimal.nullable(), seasonalPeak: decimal.nullable()}),
  negativePledge: z.strictObject({applies: z.boolean(), basis: z.enum(["aggregate", "per_operation"]), limit: decimal, occupied: decimal, remaining: decimal, consentRequired: z.boolean(),
    excess: decimal.nullable(), maxCoverageWithoutConsent: decimal.nullable(),
    consentWindow: z.strictObject({from: date, by: date, needDate: date, slackDays: z.number().int()})}),
  covenant: z.strictObject({
    rows: z.array(z.strictObject({date, scenario: key, ratioWithout: decimal.nullable(), ratioWith: decimal.nullable(),
      limits: z.array(z.strictObject({limitId, kind: z.enum(["contractual", "board_policy"]), maximumRatio: decimal, testedOnDate: z.boolean(), headroomWith: decimal.nullable(), breachedWith: z.boolean()})).min(1).max(3)})).max(12),
    worst: z.strictObject({measurementId: key, limitId, ebitdaHeadroom: decimal}).nullable(),
    required: z.array(z.strictObject({date, scenario: key})).max(64), missingTests: z.array(z.strictObject({date, scenario: key})).max(64),
    untestedLimits: z.array(limitId).max(3),
    /** Lender test dates before the draw: kept as contrast only, never a test of the lender. */
    lenderDatesBeforeDraw: z.array(date).max(24),
    /** True when a breach is found; null while a required test is missing; false only with every test present. */
    anyBreachWith: z.boolean().nullable(),
    testsPerYear: z.strictObject({indenture: z.number().int().min(0), lender: z.number().int().min(0)})}),
  price: z.strictObject({
    market: z.strictObject({position: z.enum(["below_range", "at_or_below_median", "above_median_within_range", "above_range"]), toMedianBps: decimal, toHighBps: decimal,
      low: decimal, median: decimal, high: decimal, sample: z.number().int().min(1), confidence: z.enum(["high", "moderate", "low"]), observedOn: date}).nullable(),
    history: z.strictObject({peer: text, peerDate: date, observedBps: decimal, expectedBps: decimal, residualBps: decimal.nullable(),
      steps: z.array(z.strictObject({id: key, family: z.enum(["pricing_date", "tenor", "guarantee", "instrument_distribution", "scale", "other"]), bps: decimal})).max(8)}).nullable()}),
  variants: z.array(z.strictObject({id: key, label: text, graceMonths: z.number().int(), installments: z.number().int(), coverage: decimal, restrictedAccount: z.boolean(),
    equivalentSpread: decimal, equivalentSpreadNet: decimal.nullable(), netConvention: z.enum(receivedProposalNetConventions), weightedAverageLifeYears: decimal, finalPaymentDate: date, upfrontCosts: decimal, peakYearService: decimal,
    collateral: z.strictObject(collateral), deltas: z.strictObject({equivalentSpreadBps: decimal, peakYearService: decimal, collateral: decimal})})).max(4),
  alternatives: z.array(z.strictObject({id: key, label: text, usesCovered: z.array(key).min(1).max(8), allInSpread: decimal.nullable(), allInSpreadDifferenceBps: decimal.nullable(),
    collateral: decimal, consentRequired: z.boolean(), monthsToMoney: z.strictObject({min: z.number().int(), max: z.number().int()})})).max(4),
  schedule: scheduleSchema,
});

/** Canonical JSON with sorted keys: the fingerprint is recomputable from the content, whatever the key order. */
export function receivedProposalStableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(receivedProposalStableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).filter((k) => record[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${receivedProposalStableJson(record[k])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
export const receivedProposalFingerprint = (payload: unknown) => createHash("sha256").update(receivedProposalStableJson(payload)).digest("hex");
/** The fingerprint must be the hash of everything else in the object; a changed value with an old fingerprint is refused. */
export const verifiedReceivedProposalFingerprint = (value: {fingerprint: string}, ctx: z.RefinementCtx) => {
  const {fingerprint, ...payload} = value;
  if (receivedProposalFingerprint(payload) !== fingerprint) ctx.addIssue({code: "custom", message: "received_proposal_fingerprint_mismatch"});
};

export const receivedProposalAdoptedExclusions = ["proposal_acceptance", "counterparty_contact", "credit_approval", "legal_opinion", "reciprocity_pricing",
  "company_projection", "method_release"] as const;
export const adoptedReceivedProposalOutputSchema = z.strictObject({...common, schemaVersion: z.literal("adopted-received-proposal.v1"),
  analysisId: z.uuid(), perimeter: text, evaluation: receivedProposalOutputSchema.nullable(),
  exclusions: z.array(z.enum(receivedProposalAdoptedExclusions)).length(7)
    .refine(v => v.join("|") === receivedProposalAdoptedExclusions.join("|"), "Exact exclusion ledger required")}).superRefine(verifiedReceivedProposalFingerprint);
