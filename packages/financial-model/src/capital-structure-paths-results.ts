import {z} from "zod";
import {adoptedWeeklyCashOutputSchema} from "./ficha-calculation-results";

// The common adopted-result fields, taken from an existing adopted result so the shapes never drift.
const {schemaVersion: _s, analysisId: _a, perimeter: _p, weekly: _w, exclusions: _e, ...common} = adoptedWeeklyCashOutputSchema.shape;
const text = z.string().min(1).max(2000), key = z.string().min(1).max(160), date = z.iso.date();
const decimal = z.string().regex(/^-?\d{1,24}(?:\.\d{1,20})?$/);
const gateIds = ["minimum_cash_base", "cash_nonnegative_stress", "indenture_base", "indenture_stress", "policy_base", "policy_stress", "basket_without_consent", "amortization_after_horizon"] as const;
export const capitalPathGateIdSchema = z.enum(gateIds);
const gate = z.strictObject({id: capitalPathGateIdSchema, status: z.enum(["pass", "fail", "not_tested"])});
const amountAt = z.strictObject({periodId: date, amount: decimal});
const covenantRow = z.strictObject({periodId: date, netDebt: decimal, trailingEbitda: decimal, ratio: decimal, headroom: decimal, complies: z.boolean()});
const covenant = z.strictObject({base: z.array(covenantRow).min(1).max(12), stress: z.array(covenantRow).min(1).max(12)});
const costCalculated = z.strictObject({status: z.literal("calculated"), nominalSpread: decimal, couponBase: z.enum(["opening_principal", "average_principal"]),
  couponTreatment: z.enum(["cash_paid", "accrued_until_paid"]), equivalentSpread: decimal, upfrontCharges: decimal, weightedAverageLifeYears: decimal, termYears: decimal, finalPaymentDate: date,
  /** The flows the cost is solved on: the same indexed-debt kernel as the cash calculation. */
  flows: z.array(z.strictObject({periodEnd: date, interestPaid: decimal, principal: decimal, charges: decimal, debtService: decimal})).min(1).max(120)});
const costNotApplicable = z.strictObject({status: z.literal("not_applicable"), reason: text});
const cost = z.discriminatedUnion("status", [costCalculated, costNotApplicable]);
/** A record that carries one cost, calculated or not, beside its own fields. */
const withCost = <T extends z.ZodRawShape>(shape: T) => z.discriminatedUnion("status", [z.strictObject({...shape, ...costCalculated.shape}), z.strictObject({...shape, ...costNotApplicable.shape})]);

const longTerms = z.strictObject({instrumentId: key, amount: decimal, drawPeriodId: date.nullable(), firstAmortizationYear: z.number().int().nullable(),
  lastAmortizationYear: z.number().int().nullable()});

const kernelExclusions = ["intraperiod_liquidity", "investor_demand", "lender_appetite", "legal_opinion_on_indenture", "contact_with_counterparties"] as const;

const ebitdaYears = z.array(z.strictObject({year: z.number().int(), periods: z.number().int().min(1), ebitda: decimal})).min(1).max(12);
const pathSchema = z.strictObject({
  id: key, label: text, role: z.enum(["status_quo", "candidate", "companion"]), projectVariantId: key, instrumentIds: z.array(key).min(1).max(16),
  prepayments: z.array(z.strictObject({instrumentId: key, periodId: date, amount: decimal, premium: decimal})).max(8),
  closingAvailableByPeriod: z.array(z.strictObject({periodId: date, ebitda: decimal, cashTax: decimal, cashBeforeFinancing: decimal, availableForService: decimal, draws: decimal,
    interestAccrued: decimal, interestPaid: decimal, scheduledPrincipal: decimal, prepayment: decimal, charges: decimal, closingAvailable: decimal, closingDebt: decimal})).min(1).max(40),
  stressClosingAvailableByPeriod: z.array(z.strictObject({periodId: date, ebitda: decimal, cashTax: decimal, closingAvailable: decimal, closingDebt: decimal})).min(1).max(40),
  minimumCash: amountAt, stressMinimumCash: amountAt, belowPolicyMinimum: z.array(date).max(40), shortfallVsPolicyMinimum: decimal,
  debtServiceByYear: z.array(z.strictObject({year: z.number().int(), periods: z.number().int().min(1), interestPaid: decimal, scheduledPrincipal: decimal, prepayment: decimal, principal: decimal,
    service: decimal, serviceExcludingPrepayment: decimal, availableForService: decimal, shortfallBeforePrepayment: decimal, charges: decimal})).min(1).max(12),
  ebitdaByYear: ebitdaYears,
  taxesInHorizon: decimal, horizonFinancingCost: decimal, accruedInterestInHorizon: decimal, netDebtAtHorizon: decimal, stressNetDebtAtHorizon: decimal,
  closingDebtAtHorizon: decimal, closingCashAtHorizon: decimal,
  indenture: covenant, policy: covenant.nullable(),
  basket: z.strictObject({holderId: key, basis: z.enum(["aggregate", "per_operation"]), limit: decimal, occupiedAtOpening: decimal, peak: decimal, peakPeriodId: date.nullable(), excess: decimal,
    consentRequired: z.boolean(), rows: z.array(z.strictObject({periodId: date, applies: z.boolean(), used: decimal, instrumentIds: z.array(key).max(16)})).min(1).max(40)}).nullable(),
  afterHorizon: z.strictObject({residuals: z.array(z.strictObject({instrumentId: key, residual: decimal, kind: z.enum(["none", "seasonal_release", "not_tested", "scheduled"]),
    settlementDate: date.nullable(), justification: text.nullable()})).max(16),
    untested: z.array(key).max(16), unitInstrumentId: key.nullable()}),
  amortizationTests: z.array(z.strictObject({instrumentId: key, profileId: key, label: text, residual: decimal, passes: z.boolean(), firstShortfallYear: z.number().int().nullable(),
    years: z.array(z.strictObject({year: z.number().int(), scheduledAmortization: decimal, availableAfterInterest: decimal, interest: decimal, closingAvailable: decimal, shortfall: decimal,
      covered: z.boolean()})).min(1).max(15)})).max(4),
  gates: z.array(gate).length(8), eligible: z.boolean(),
});

export const capitalPathsOutputSchema = z.strictObject({
  schemaVersion: z.literal("capital-structure-paths.v1"), engineVersion: key, currency: z.string().regex(/^[A-Z]{3}$/), openingDate: date, periodEnds: z.array(date).min(2).max(40),
  minimumCash: decimal, gateOrder: z.array(capitalPathGateIdSchema).length(8),
  paths: z.array(pathSchema).min(1).max(12),
  ranking: z.array(z.strictObject({pathId: key, rank: z.number().int().min(1), role: z.enum(["status_quo", "candidate", "companion"]), eligible: z.boolean(),
    failedGates: z.array(gate).max(8)})).min(1).max(12),
  recommendation: z.strictObject({pathId: key, longInstrumentId: key.nullable(), longInstrument: longTerms.nullable(),
    condition: z.strictObject({instrumentId: key, maximumSpread: decimal, gates: z.array(gate).length(8), insideGates: z.boolean(), horizonFinancingCost: decimal, minimumCash: amountAt, cost}).nullable(),
    /** The issue the plan targets and the smallest one that keeps the path inside every gate. */
    demand: z.strictObject({instrumentId: key, issueTarget: decimal, issueFloorInsideGates: decimal, quantum: decimal}).nullable(),
    soundingBy: date, routeDecisionBy: date, mustPrecede: z.strictObject({instrumentId: key, date}).nullable(), decidedBeforeMaturity: z.boolean(), daysToMaturity: z.number().int().nullable(),
    alternative: z.strictObject({pathId: key, longInstrumentId: key, longInstrument: longTerms, conditions: z.array(capitalPathGateIdSchema).max(8), decisionBy: date}).nullable()}).nullable(),
  instrumentCosts: z.array(withCost({instrumentId: key, lenderKind: z.enum(["bank", "capital_markets", "development_bank"]),
    alternatives: z.array(withCost({profileId: key, label: text})).max(3)})).max(24),
  sensitivities: z.array(z.strictObject({id: key, label: text, recommendedPathId: key.nullable(), recommendationHolds: z.boolean(),
    onRecommended: z.strictObject({gates: z.array(gate).length(8), minimumCash: amountAt, stressMinimumCash: amountAt, indenture: covenant, policy: covenant.nullable(), netDebtAtHorizon: decimal,
      ebitdaByYear: ebitdaYears}).nullable()})).max(6),
  exclusions: z.array(z.enum(kernelExclusions)).length(5).refine(v => v.join("|") === kernelExclusions.join("|"), "Exact exclusion ledger required"),
});
export type CapitalPathsOutput = z.infer<typeof capitalPathsOutputSchema>;

export const capitalPathsAdoptedExclusions = ["investor_demand", "lender_appetite", "legal_opinion_on_indenture", "contact_with_counterparties", "intraperiod_liquidity",
  "method_release"] as const;
export const adoptedCapitalPathsOutputSchema = z.strictObject({...common, schemaVersion: z.literal("adopted-capital-structure-paths.v1"),
  analysisId: z.uuid(), perimeter: text, evaluation: capitalPathsOutputSchema.nullable(),
  exclusions: z.array(z.enum(capitalPathsAdoptedExclusions)).length(6)
    .refine(v => v.join("|") === capitalPathsAdoptedExclusions.join("|"), "Exact exclusion ledger required")});
