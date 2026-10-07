import Decimal from "decimal.js";
import {z} from "zod";

const Exact = Decimal.clone({precision: 80, rounding: Decimal.ROUND_HALF_UP});
const figure = z.string().regex(/^-?\d{1,24}(?:\.\d{1,20})?$/);
const unsigned = figure.refine(v => new Exact(v).gte(0));
const id = z.string().trim().min(1).max(160);
const date = z.iso.date();
const fmt = (v: Decimal) => v.toDecimalPlaces(20).toFixed();
export const relativeDebtCostVersion = "2026.10.07-v1";
export const relativeDebtCostBridgeInputSchema = z.strictObject({
  ownSpreadBps: figure, peerSpreadBps: figure,
  pricingBasis: z.enum(["same_indexer_quoted_spread", "equivalent_spread_on_same_dated_curve"]),
  ownIndexer: id, peerIndexer: id, curveVersion: id.nullable(),
  coverage: z.enum(["complete_scoped_bridge", "limited_adjustments"]),
  adjustments: z.array(z.strictObject({id, family: z.enum(["pricing_date", "tenor", "guarantee", "instrument_distribution", "scale", "other"]),
    bps: figure, evidenceAnchor: id, methodologyVersion: id, independentEffectGroup: id})).max(32),
}).superRefine((v, ctx) => {
  if (v.pricingBasis === "same_indexer_quoted_spread" && v.ownIndexer !== v.peerIndexer)
    ctx.addIssue({code: "custom", message: "Different indexers require equivalent spreads on the same dated curve"});
  if (v.pricingBasis === "equivalent_spread_on_same_dated_curve" && !v.curveVersion)
    ctx.addIssue({code: "custom", message: "Equivalent spreads require their adopted curve version"});
  if (v.pricingBasis === "same_indexer_quoted_spread" && v.curveVersion !== null)
    ctx.addIssue({code: "custom", message: "A quoted spread bridge must not claim curve normalization"});
  for (const key of ["id", "family", "independentEffectGroup"] as const) {
    if (new Set(v.adjustments.map(a => a[key])).size !== v.adjustments.length)
      ctx.addIssue({code: "custom", message: `Duplicate or overlapping adjustment ${key}`});
  }
});

/** The bridge is arithmetic over separately evidenced, adopted adjustments. It does not
 * estimate market effects, confer comparability, explain causality or assign a credit rating. */
export function calculateRelativeDebtCostBridge(raw: z.infer<typeof relativeDebtCostBridgeInputSchema>) {
  const input = relativeDebtCostBridgeInputSchema.parse(raw);
  const gross = new Exact(input.ownSpreadBps).minus(input.peerSpreadBps);
  let remaining = gross;
  const steps = input.adjustments.map(a => {
    const before = fmt(remaining); remaining = remaining.minus(a.bps);
    return {...a, beforeBps: before, afterBps: fmt(remaining), formula: "remaining difference minus evidenced adjustment"};
  });
  const dateAdjustment = input.adjustments.find(a => a.family === "pricing_date");
  return {schemaVersion: "relative-debt-cost-bridge.v1" as const, version: relativeDebtCostVersion,
    operands: input, grossBps: fmt(gross), knownAdjustmentsBps: fmt(gross.minus(remaining)),
    afterPricingDateBps: dateAdjustment ? fmt(gross.minus(dateAdjustment.bps)) : null,
    unexplainedAfterKnownAdjustmentsBps: fmt(remaining),
    residualBps: input.coverage === "complete_scoped_bridge" ? fmt(remaining) : null,
    status: input.coverage === "complete_scoped_bridge" ? "scoped_bridge" as const : "limited_bridge" as const,
    steps, causalAttribution: false as const, creditRating: null,
    trace: {id: "relative_cost.bridge", formula: "gross = own - peer; residual = gross - sum of non-overlapping adopted adjustments",
      result: fmt(remaining)}};
}

export const debtCostActionInputSchema = z.strictObject({
  actionId: id, currency: z.string().regex(/^[A-Z]{3}$/),
  convention: z.enum(["marginal_spread_budget_estimate", "effective_rate_difference"]),
  currentSpreadBps: figure, proposedSpreadBps: figure,
  exposure: z.array(z.strictObject({id, startDate: date, endDate: date, affectedPrincipal: unsigned,
    yearFraction: unsigned, timeBasis: z.enum(["actual_365_fixed", "adopted_month_fraction"]),
    annualIndex: figure.nullable(), evidenceAnchor: id})).min(1).max(480),
  costs: z.array(z.strictObject({id, date, amount: unsigned, evidenceAnchor: id})).max(256),
  costCoverage: z.enum(["complete_for_stated_horizon", "incomplete"]),
}).superRefine((v, ctx) => {
  if (new Set(v.exposure.map(p => p.id)).size !== v.exposure.length || new Set(v.costs.map(c => c.id)).size !== v.costs.length)
    ctx.addIssue({code: "custom", message: "Duplicate exposure or cost"});
  v.exposure.forEach((p, n) => {
    if (p.endDate <= p.startDate || (n > 0 && p.startDate !== v.exposure[n - 1]!.endDate))
      ctx.addIssue({code: "custom", message: "Exposure must cover ordered contiguous intervals"});
    if (p.timeBasis === "actual_365_fixed") {
      const expected = new Exact(Date.parse(p.endDate) - Date.parse(p.startDate)).div(86400000).div(365);
      if (expected.minus(p.yearFraction).abs().gt("0.000000000000000001"))
        ctx.addIssue({code: "custom", message: "Year fraction does not match the civil calendar"});
    } else {
      const a = new Date(p.startDate), b = new Date(p.endDate);
      if (a.getUTCDate() !== b.getUTCDate()) ctx.addIssue({code: "custom", message: "Month fraction requires aligned day of month"});
      const months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + b.getUTCMonth() - a.getUTCMonth();
      if (new Exact(months).div(12).minus(p.yearFraction).abs().gt("0.000000000000000001"))
        ctx.addIssue({code: "custom", message: "Year fraction does not match the adopted month interval"});
    }
    if (v.convention === "effective_rate_difference" ? p.annualIndex === null || new Exact(p.annualIndex).lte(-1) : p.annualIndex !== null)
      ctx.addIssue({code: "custom", message: "Index must be explicitly adopted for effective-rate comparison and absent for a marginal spread estimate"});
  });
  if (new Exact(v.currentSpreadBps).lte(-10000) || new Exact(v.proposedSpreadBps).lte(-10000))
    ctx.addIssue({code: "custom", message: "Spread factor must remain positive"});
  if (v.costs.some(c => c.date < v.exposure[0]!.startDate || c.date > v.exposure.at(-1)!.endDate))
    ctx.addIssue({code: "custom", message: "Cost is outside the stated benefit horizon"});
});

/** Nominal savings under an explicit exposure and accrual convention; never a debt NPV
 * or a promised repricing. No assumed tax, zero-cost waiver, whole-debt exposure or rollover. */
export function calculateDebtCostAction(raw: z.infer<typeof debtCostActionInputSchema>) {
  const input = debtCostActionInputSchema.parse(raw);
  const spreadDelta = new Exact(input.currentSpreadBps).minus(input.proposedSpreadBps).div(10000);
  let savings = new Exact(0);
  const rows = input.exposure.map(p => {
    const factor = input.convention === "effective_rate_difference" ? new Exact(p.annualIndex!).plus(1) : new Exact(1);
    const rateDelta = spreadDelta.times(factor);
    const accruedDifference = input.convention === "effective_rate_difference"
      ? factor.times(new Exact(input.currentSpreadBps).div(10000).plus(1)).pow(p.yearFraction)
        .minus(factor.times(new Exact(input.proposedSpreadBps).div(10000).plus(1)).pow(p.yearFraction))
      : rateDelta.times(p.yearFraction);
    const amount = new Exact(p.affectedPrincipal).times(accruedDifference);
    savings = savings.plus(amount);
    return {...p, annualRateDifference: fmt(rateDelta), accruedFactorDifference: fmt(accruedDifference), nominalSavings: fmt(amount)};
  });
  const knownCosts = input.costs.reduce((sum, c) => sum.plus(c.amount), new Exact(0));
  return {schemaVersion: "debt-cost-action.v1" as const, version: relativeDebtCostVersion, operands: input, rows,
    nominalSavings: fmt(savings), knownCosts: fmt(knownCosts),
    netNominalBenefit: input.costCoverage === "complete_for_stated_horizon" ? fmt(savings.minus(knownCosts)) : null,
    status: input.costCoverage === "complete_for_stated_horizon" ? "stated_horizon_estimate" as const : "missing_costs" as const,
    isDebtNpv: false as const, guaranteesRepricing: false as const,
    trace: {id: "relative_cost.action", formula: input.convention === "effective_rate_difference"
      ? "sum(principal * [(indexFactor * currentSpreadFactor)^t - (indexFactor * proposedSpreadFactor)^t]) minus known dated costs"
      : "sum(affected principal * marginal spread difference * stated exposure year fraction) minus known dated costs",
      result: input.costCoverage === "complete_for_stated_horizon" ? fmt(savings.minus(knownCosts)) : "cost coverage incomplete"}};
}
