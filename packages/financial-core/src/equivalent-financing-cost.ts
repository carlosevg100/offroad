import Decimal from "decimal.js";
import {z} from "zod";

const Exact = Decimal.clone({precision: 60, rounding: Decimal.ROUND_HALF_UP});
export const equivalentFinancingCostVersion = "2026.10.07-v1";
const amount = z.string().regex(/^-?\d{1,24}(?:\.\d{1,20})?$/);
const nonNegative = amount.refine(v => new Exact(v).gte(0));
const annualRate = amount.refine(v => new Exact(v).gt(-1));
const id = z.string().trim().min(1).max(160);
const isoDate = z.string().regex(/^[1-9]\d{3}-\d{2}-\d{2}$/).refine(v => {
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
});

/** The caller splits at every cash-flow and curve date. No interpolation, holiday calendar
 * or DU/252 count is inferred. The adopted fraction and its source travel with each interval. */
export const datedFinancingIntervalSchema = z.object({
  id, startDate: isoDate, endDate: isoDate,
  yearFraction: amount.refine(v => new Exact(v).gt(0) && new Exact(v).lte(2)),
  annualIndex: annualRate,
  yearFractionConvention: z.enum(["business_days_252", "actual_365_fixed", "adopted_year_fraction"]),
  businessDays: z.number().int().positive().max(504).optional(),
  sourceAnchor: id,
}).strict();

export const equivalentFinancingCostInputSchema = z.object({
  baseDate: isoDate, currency: z.string().regex(/^[A-Z]{3}$/), moneyUnit: id,
  intervals: z.array(datedFinancingIntervalSchema).min(1).max(480),
  /** Borrower perspective: positive net advance at baseDate, later negative payments. */
  netFlows: z.array(z.object({id, date: isoDate, amount, sourceAnchor: id}).strict()).min(2).max(2000),
  costInventory: z.array(z.object({
    category: z.enum(["origination_fee", "recurring_fee", "tax", "other"]),
    status: z.enum(["specified", "zero", "not_applicable", "unknown"]),
    reason: id,
  }).strict()).length(4),
  convention: z.literal("multiplicative_index_and_spread_on_net_borrower_flows"),
  lowerSpread: annualRate, upperSpread: annualRate,
}).strict();
export type EquivalentFinancingCostInput = z.infer<typeof equivalentFinancingCostInputSchema>;

function validateIntervals(baseDate: string, intervals: z.infer<typeof datedFinancingIntervalSchema>[]) {
  const ids = new Set<string>(); let last = baseDate;
  for (const interval of intervals) {
    if (ids.has(interval.id)) throw new Error("financing_duplicate_interval");
    if (interval.startDate !== last || interval.endDate <= interval.startDate) throw new Error("financing_curve_coverage");
    let fraction: Decimal | null = null;
    if (interval.yearFractionConvention === "business_days_252") {
      if (interval.businessDays === undefined) throw new Error("financing_business_day_count_required");
      fraction = new Exact(interval.businessDays).div(252);
    } else if (interval.yearFractionConvention === "actual_365_fixed") {
      if (interval.businessDays !== undefined) throw new Error("financing_unused_business_day_count");
      const days = (Date.parse(`${interval.endDate}T00:00:00Z`) - Date.parse(`${interval.startDate}T00:00:00Z`)) / 86400000;
      fraction = new Exact(days).div(365);
    } else if (interval.businessDays !== undefined) throw new Error("financing_unused_business_day_count");
    if (fraction && fraction.minus(interval.yearFraction).abs().gt("0.00000000000000000001")) throw new Error("financing_year_fraction_mismatch");
    ids.add(interval.id); last = interval.endDate;
  }
}
const formatted = (v: Decimal) => v.toDecimalPlaces(20).toFixed();

/** An economic equivalent spread, not automatically a statutory CET.
 * One net advance then repayment is a declared domain: monotonic NPV has at most one root.
 * A non-conventional stream needs a different root analysis; it is never silently accepted.
 * Missing cost assessments return a gap rather than making tax/fees zero. */
export function solveEquivalentFinancingSpread(raw: EquivalentFinancingCostInput) {
  const input = equivalentFinancingCostInputSchema.parse(raw);
  validateIntervals(input.baseDate, input.intervals);
  const categories = new Set(input.costInventory.map(c => c.category));
  if (categories.size !== 4) throw new Error("financing_cost_inventory_required");
  if (new Exact(input.lowerSpread).gte(input.upperSpread)) throw new Error("financing_invalid_root_bracket");
  const ids = new Set<string>(); const amounts = new Map<string, Decimal>();
  const boundaries = new Set([input.baseDate, ...input.intervals.map(i => i.endDate)]);
  for (const flow of input.netFlows) {
    if (ids.has(flow.id)) throw new Error("financing_duplicate_flow");
    if (!boundaries.has(flow.date)) throw new Error("financing_cash_flow_requires_curve_boundary");
    ids.add(flow.id); amounts.set(flow.date, (amounts.get(flow.date) ?? new Exact(0)).plus(flow.amount));
  }
  if (!(amounts.get(input.baseDate)?.gt(0))) throw new Error("financing_positive_net_advance_required");
  const later = [...amounts].filter(([d, v]) => d !== input.baseDate && !v.eq(0));
  if (!later.length || later.some(([, v]) => v.gt(0))) throw new Error("financing_nonconventional_stream");
  const common = {schemaVersion: "equivalent-financing-cost.v1" as const,
    engineVersion: equivalentFinancingCostVersion, operands: structuredClone(input),
    definition: "annual multiplicative spread over the dated index curve on net borrower cash flows" as const,
    regulatoryCet: false as const};
  const gaps = input.costInventory.filter(c => c.status === "unknown");
  if (gaps.length) return {...common, status: "missing_inputs" as const, gaps,
    annualSpread: null, residualPresentValue: null, trace: null};
  let cumulativeIndex = new Exact(1); let cumulativeTime = new Exact(0);
  const discountRows = input.intervals.map(i => {
    cumulativeIndex = cumulativeIndex.times(new Exact(i.annualIndex).plus(1).pow(i.yearFraction));
    cumulativeTime = cumulativeTime.plus(i.yearFraction);
    return {date: i.endDate, indexDiscount: cumulativeIndex, cumulativeYearFraction: cumulativeTime,
      netAmount: amounts.get(i.endDate) ?? new Exact(0)};
  });
  const npv = (spread: Decimal) => discountRows.reduce((v, r) =>
    v.plus(r.netAmount.div(r.indexDiscount.times(spread.plus(1).pow(r.cumulativeYearFraction)))), amounts.get(input.baseDate)!);
  let lower = new Exact(input.lowerSpread); let upper = new Exact(input.upperSpread);
  const lowerNpv = npv(lower); const upperNpv = npv(upper);
  if (lowerNpv.gt(0) || upperNpv.lt(0)) return {...common, status: "root_not_bracketed" as const,
    gaps: [], annualSpread: null, residualPresentValue: null,
    trace: {lowerSpread: input.lowerSpread, upperSpread: input.upperSpread,
      lowerPresentValue: formatted(lowerNpv), upperPresentValue: formatted(upperNpv)}};
  // Fixed iteration count makes receipts deterministic. The sign is not rounded.
  for (let iteration = 0; iteration < 128; iteration++) {
    const mid = lower.plus(upper).div(2);
    if (npv(mid).gte(0)) upper = mid; else lower = mid;
  }
  const result = lower.plus(upper).div(2).toDecimalPlaces(20);
  const residual = npv(result);
  const tolerance = amounts.get(input.baseDate)!.times("0.000000000000001");
  if (residual.abs().gt(tolerance)) throw new Error("financing_root_residual_exceeds_tolerance");
  return {...common, status: "calculated" as const, gaps: [], annualSpread: formatted(result),
    residualPresentValue: formatted(residual), trace: {
      lowerSpread: input.lowerSpread, upperSpread: input.upperSpread, iterations: 128,
      lowerPresentValue: formatted(lowerNpv), upperPresentValue: formatted(upperNpv),
      residualTolerance: formatted(tolerance),
      discountedFlows: discountRows.map(r => ({date: r.date, netAmount: formatted(r.netAmount),
        cumulativeYearFraction: formatted(r.cumulativeYearFraction),
        discountFactor: formatted(r.indexDiscount.times(result.plus(1).pow(r.cumulativeYearFraction)))})),
    }};
}

export const deferredFinancingScheduleInputSchema = z.object({
  baseDate: isoDate, currency: z.string().regex(/^[A-Z]{3}$/), moneyUnit: id,
  grossAdvance: nonNegative.refine(v => new Exact(v).gt(0)),
  upfrontWithheldCosts: nonNegative,
  annualSpread: annualRate,
  /** Explicit contract: unpaid interest either joins the base or stays outside it. */
  unpaidInterestBase: z.enum(["principal_plus_accrued", "principal_only"]),
  periods: z.array(datedFinancingIntervalSchema.extend({
    scheduledPrincipal: nonNegative,
    paysAccruedInterest: z.boolean(),
  }).strict()).min(1).max(480),
}).strict();
export type DeferredFinancingScheduleInput = z.infer<typeof deferredFinancingScheduleInputSchema>;

/** Single advance at baseDate, accrual before end-date coupon and amortization.
 * It requires full final settlement. Intraperiod payments need explicit split periods.
 * There are no inferred levies, guarantee-release dates or refinancing proceeds. */
export function buildDeferredFinancingSchedule(raw: DeferredFinancingScheduleInput) {
  const input = deferredFinancingScheduleInputSchema.parse(raw);
  validateIntervals(input.baseDate, input.periods);
  let principal = new Exact(input.grossAdvance); let accrued = new Exact(0);
  if (new Exact(input.upfrontWithheldCosts).gte(principal)) throw new Error("financing_positive_net_advance_required");
  const netFlows = [{id: "advance", date: input.baseDate,
    amount: formatted(principal.minus(input.upfrontWithheldCosts)), sourceAnchor: "adopted-net-advance"}];
  let weightedLife = new Exact(0); let time = new Exact(0); let totalInterest = new Exact(0);
  const rows = input.periods.map(p => {
    const openingPrincipal = principal; const openingAccrued = accrued;
    const interestBase = principal.plus(input.unpaidInterestBase === "principal_plus_accrued" ? accrued : 0);
    const intervalFactor = new Exact(p.annualIndex).plus(1).times(new Exact(input.annualSpread).plus(1)).pow(p.yearFraction).minus(1);
    const interestAccrued = interestBase.times(intervalFactor);
    accrued = accrued.plus(interestAccrued); totalInterest = totalInterest.plus(interestAccrued);
    const interestPaid = p.paysAccruedInterest ? accrued : new Exact(0);
    if (p.paysAccruedInterest) accrued = new Exact(0);
    const amortization = new Exact(p.scheduledPrincipal);
    if (amortization.gt(principal)) throw new Error("financing_amortization_exceeds_principal");
    principal = principal.minus(amortization); time = time.plus(p.yearFraction);
    weightedLife = weightedLife.plus(amortization.times(time));
    netFlows.push({id: p.id, date: p.endDate,
      amount: formatted(interestPaid.plus(amortization).neg()), sourceAnchor: p.sourceAnchor});
    return {periodId: p.id, startDate: p.startDate, endDate: p.endDate,
      openingPrincipal: formatted(openingPrincipal), openingAccruedInterest: formatted(openingAccrued),
      interestBase: formatted(interestBase), intervalFactor: formatted(intervalFactor),
      interestAccrued: formatted(interestAccrued), interestPaid: formatted(interestPaid),
      principalPaid: p.scheduledPrincipal, closingPrincipal: formatted(principal),
      closingAccruedInterest: formatted(accrued), cashDebtService: formatted(interestPaid.plus(amortization))};
  });
  if (!principal.eq(0) || !accrued.eq(0)) throw new Error("financing_full_settlement_horizon_required");
  return {schemaVersion: "deferred-financing-schedule.v1" as const,
    engineVersion: equivalentFinancingCostVersion, operands: structuredClone(input), rows, netFlows,
    finalPaymentDate: [...rows].reverse().find(r => !new Exact(r.principalPaid).eq(0) || !new Exact(r.interestPaid).eq(0))!.endDate,
    projectedThroughDate: input.periods.at(-1)!.endDate,
    weightedAverageLifeYears: formatted(weightedLife.div(input.grossAdvance)),
    totalInterestAccrued: formatted(totalInterest), rounding: "60-digit arithmetic; output half-up at 20 decimals" as const};
}
