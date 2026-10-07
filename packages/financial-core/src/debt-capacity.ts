import Decimal from "decimal.js";
import {z} from "zod";

const Exact = Decimal.clone({precision: 80, rounding: Decimal.ROUND_HALF_UP});
export const debtCapacityVersion = "2026.10.07-v1";
const amount = z.string().regex(/^-?\d{1,24}(?:\.\d{1,20})?$/);
const nonnegative = amount.refine(v => new Exact(v).gte(0));
const fraction = nonnegative.refine(v => new Exact(v).lte(1));
const id = z.string().trim().min(1).max(160);
const date = z.string().regex(/^[1-9]\d{3}-\d{2}-\d{2}$/).refine(v => {
  const d = new Date(`${v}T00:00:00Z`); return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
});
const affineSchema = z.object({fixed: amount, perUnitNewDebt: amount}).strict();
type Affine = {a: Decimal; b: Decimal};
const from = (v: z.infer<typeof affineSchema>): Affine => ({a: new Exact(v.fixed), b: new Exact(v.perUnitNewDebt)});
const constant = (a: Decimal.Value): Affine => ({a: new Exact(a), b: new Exact(0)});
const add = (x: Affine, y: Affine): Affine => ({a: x.a.plus(y.a), b: x.b.plus(y.b)});
const sub = (x: Affine, y: Affine): Affine => ({a: x.a.minus(y.a), b: x.b.minus(y.b)});
const scale = (x: Affine, n: Decimal.Value): Affine => ({a: x.a.times(n), b: x.b.times(n)});
const at = (x: Affine, n: Decimal) => x.a.plus(x.b.times(n));
const fmt = (n: Decimal) => n.toDecimalPlaces(20).toFixed();
const next = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);

const ruleSchema = z.object({id, sourceAnchor: id,
  kind: z.enum(["minimum_available_cash", "maximum_net_debt_to_ebitda", "minimum_interest_coverage", "minimum_debt_service_coverage"]),
  threshold: nonnegative, measurement: z.literal("all_period_ends")}).strict();
const unitFinancingPeriodSchema = z.object({
  drawAtStart: fraction, drawAtEnd: fraction, principalPaidAtEnd: fraction,
  /** Fully priced/adopted period factor; an annual midpoint approximation is labeled as such. */
  interestFactorOnOpeningAndStartDraw: nonnegative,
  interestFactorOnEndDraw: nonnegative,
  interestFactorCreditOnEndAmortization: nonnegative,
  factorConvention: z.enum(["dated_contract_split_at_cash_flows", "adopted_annual_average_balance_approximation"]),
  paysAccruedInterest: z.boolean(), unpaidInterestBase: z.enum(["principal_only", "principal_plus_accrued"]),
  withheldCostPerUnitDraw: fraction, sourceAnchor: id,
}).strict();
const periodSchema = z.object({id, startDate: date, endDate: date, sourceAnchor: id,
  ebitda: affineSchema, covenantEbitdaAdjustment: affineSchema,
  nonCashEbitdaBridge: affineSchema, cashLeasePayments: affineSchema,
  changeInWorkingCapital: affineSchema, maintenanceCapex: affineSchema, growthCapex: affineSchema,
  taxableBaseBeforeNewDebtInterest: affineSchema,
  cashTaxRate: fraction, lossTaxTreatment: z.enum(["no_cash_benefit", "immediate_cash_benefit"]),
  newDebtTaxDeduction: z.enum(["paid_interest", "accrued_interest"]),
  cfadsGrowthCapexTreatment: z.enum(["include_growth_capex", "exclude_growth_capex"]),
  cfadsDefinitionAnchor: id, existingCashInterest: nonnegative, existingCashPrincipalPaid: nonnegative,
  otherExistingFinancingCashAvailable: affineSchema, capitalCashAvailable: affineSchema,
  existingDebtForRatio: nonnegative, newFinancing: unitFinancingPeriodSchema,
}).strict();
export const debtCapacityInputSchema = z.object({
  currency: z.string().regex(/^[A-Z]{3}$/), moneyUnit: id, openingDate: date, endDate: date,
  maximumAmount: nonnegative.refine(v => new Exact(v).gt(0)), monetaryQuantum: nonnegative.refine(v => new Exact(v).gt(0)),
  horizon: z.object({mode: z.enum(["full_settlement", "calibration_window"]),
    newDebtFinalPaymentDate: date, existingDebtFinalPaymentDates: z.array(date).max(100), sourceAnchor: id}).strict(),
  scenarios: z.array(z.object({id, sourceAnchor: id, openingAvailableCash: amount,
    cashNetting: z.enum(["signed_available", "nonnegative_available"]),
    includeNewAccruedInterestInDebt: z.boolean(),
    rules: z.array(ruleSchema).min(1).max(12), periods: z.array(periodSchema).min(1).max(240),
  }).strict()).min(1).max(8),
  definition: z.literal("maximum_monetary_quantum_amount_under_all_adopted_scenario_period_constraints"),
}).strict();
export type DebtCapacityInput = z.infer<typeof debtCapacityInputSchema>;
type Scenario = DebtCapacityInput["scenarios"][number];
type UnitRow = {principal: Decimal; accrued: Decimal; interestAccrued: Decimal; interestPaid: Decimal; principalPaid: Decimal; netCash: Decimal};

function unitSchedule(s: Scenario, full: boolean): UnitRow[] {
  let principal = new Exact(0); let accrued = new Exact(0); let drawn = new Exact(0); let amortized = new Exact(0);
  const rows = s.periods.map(p => {
    const n = p.newFinancing;
    if (n.factorConvention === "dated_contract_split_at_cash_flows"
      && (!new Exact(n.interestFactorOnEndDraw).eq(0) || !new Exact(n.interestFactorCreditOnEndAmortization).eq(0))) throw new Error("capacity_dated_period_must_split_at_cash_flow");
    const startDraw = new Exact(n.drawAtStart); const endDraw = new Exact(n.drawAtEnd); const payment = new Exact(n.principalPaidAtEnd);
    const interestBase = principal.plus(startDraw).plus(n.unpaidInterestBase === "principal_plus_accrued" ? accrued : 0);
    const interest = interestBase.times(n.interestFactorOnOpeningAndStartDraw)
      .plus(endDraw.times(n.interestFactorOnEndDraw)).minus(payment.times(n.interestFactorCreditOnEndAmortization));
    if (interest.lt(0)) throw new Error("capacity_negative_accrual_outside_domain");
    accrued = accrued.plus(interest);
    const paid = n.paysAccruedInterest ? accrued : new Exact(0);
    if (n.paysAccruedInterest) accrued = new Exact(0);
    principal = principal.plus(startDraw).plus(endDraw).minus(payment);
    drawn = drawn.plus(startDraw).plus(endDraw); amortized = amortized.plus(payment);
    if (principal.lt(0) || drawn.gt(1) || amortized.gt(1)) throw new Error("capacity_unit_profile_not_normalized");
    const netCash = startDraw.plus(endDraw).times(new Exact(1).minus(n.withheldCostPerUnitDraw)).minus(paid).minus(payment);
    return {principal, accrued, interestAccrued: interest, interestPaid: paid, principalPaid: payment, netCash};
  });
  if (!drawn.eq(1)) throw new Error("capacity_unit_draw_must_equal_one");
  if (full && (!principal.eq(0) || !accrued.eq(0))) throw new Error("capacity_final_settlement_required");
  return rows;
}
function validateInput(input: DebtCapacityInput) {
  if (new Exact(input.monetaryQuantum).gt(input.maximumAmount)) throw new Error("capacity_quantum_exceeds_domain");
  const required = [input.horizon.newDebtFinalPaymentDate, ...input.horizon.existingDebtFinalPaymentDates].sort().at(-1)!;
  if (input.horizon.mode === "full_settlement" && input.endDate < required) throw new Error("capacity_final_amortization_horizon_required");
  const scenarioIds = new Set<string>();
  for (const s of input.scenarios) {
    if (scenarioIds.has(s.id)) throw new Error("capacity_duplicate_scenario"); scenarioIds.add(s.id);
    let previous = input.openingDate; const ids = new Set<string>(); const rules = new Set<string>();
    for (const r of s.rules) {if (rules.has(r.id)) throw new Error("capacity_duplicate_rule"); rules.add(r.id);
      if (r.kind !== "minimum_available_cash" && new Exact(r.threshold).eq(0)) throw new Error("capacity_positive_ratio_threshold_required");}
    for (const p of s.periods) {
      if (ids.has(p.id)) throw new Error("capacity_duplicate_period"); ids.add(p.id);
      if (p.startDate !== next(previous) || p.endDate < p.startDate || p.endDate > input.endDate) throw new Error("capacity_period_coverage"); previous = p.endDate;
    }
    if (previous !== input.endDate) throw new Error("capacity_period_coverage");
    if (input.horizon.mode === "full_settlement" && !new Exact(s.periods.at(-1)!.existingDebtForRatio).eq(0)) throw new Error("capacity_existing_debt_not_settled_at_horizon");
  }
  return required;
}
type ProjectionRow = {period: Scenario["periods"][number]; cash: Affine; debt: Affine; ebitda: Affine;
  covenantEbitda: Affine; tax: Affine; cfads: Affine; interest: Affine; service: Affine};
function projectedRows(s: Scenario, units: UnitRow[], sample: Decimal): ProjectionRow[] {
  let cash = constant(s.openingAvailableCash);
  return s.periods.map((p, i) => {
    const unit = units[i]!;
    const ebitda = from(p.ebitda);
    const interest = add(constant(p.existingCashInterest), {a: new Exact(0), b: unit.interestPaid});
    const service = add(interest, {a: new Exact(p.existingCashPrincipalPaid), b: unit.principalPaid});
    const taxable = sub(from(p.taxableBaseBeforeNewDebtInterest), {a: new Exact(0),
      b: p.newDebtTaxDeduction === "paid_interest" ? unit.interestPaid : unit.interestAccrued});
    const cashTax = p.lossTaxTreatment === "no_cash_benefit" && at(taxable, sample).lt(0) ? constant(0) : scale(taxable, p.cashTaxRate);
    const beforeGrowth = sub(sub(sub(add(ebitda, from(p.nonCashEbitdaBridge)), from(p.cashLeasePayments)), from(p.changeInWorkingCapital)), from(p.maintenanceCapex));
    const cfads = sub(p.cfadsGrowthCapexTreatment === "include_growth_capex" ? sub(beforeGrowth, from(p.growthCapex)) : beforeGrowth, cashTax);
    const cashBeforeFinance = sub(sub(beforeGrowth, from(p.growthCapex)), cashTax);
    const existingCash = sub(from(p.otherExistingFinancingCashAvailable), constant(new Exact(p.existingCashInterest).plus(p.existingCashPrincipalPaid)));
    cash = add(cash, add(cashBeforeFinance, add(existingCash,
      add(from(p.capitalCashAvailable), {a: new Exact(0), b: unit.netCash}))));
    return {period: p, cash, ebitda, covenantEbitda: add(ebitda, from(p.covenantEbitdaAdjustment)), tax: cashTax, cfads, interest, service,
      debt: {a: new Exact(p.existingDebtForRatio), b: unit.principal.plus(s.includeNewAccruedInterestInDebt ? unit.accrued : 0)}};
  });
}
type Inequality = {value: Affine; strict: boolean};
function inequalities(s: Scenario, row: ProjectionRow, sample: Decimal): Inequality[] {
  const result: Inequality[] = [];
  for (const r of s.rules) {
    if (r.kind === "minimum_available_cash") result.push({value: sub(row.cash, constant(r.threshold)), strict: false});
    else if (r.kind === "maximum_net_debt_to_ebitda") {
      const netCash = s.cashNetting === "nonnegative_available" && at(row.cash, sample).lt(0) ? constant(0) : row.cash;
      result.push({value: row.covenantEbitda, strict: true}, {value: sub(scale(row.covenantEbitda, r.threshold), sub(row.debt, netCash)), strict: false});
    } else {
      const denominator = r.kind === "minimum_interest_coverage" ? row.interest : row.service;
      if (denominator.a.eq(0) && denominator.b.eq(0)) continue; // No service: ratio is not applicable.
      result.push({value: denominator, strict: true}, {value: sub(r.kind === "minimum_interest_coverage" ? row.ebitda : row.cfads, scale(denominator, r.threshold)), strict: false});
    }
  }
  return result;
}
function prepareUnitSchedules(input: DebtCapacityInput): UnitRow[][] {
  const maximum = new Exact(input.maximumAmount);
  const units = input.scenarios.map(s => unitSchedule(s, input.horizon.mode === "full_settlement"));
  if (input.horizon.mode === "full_settlement") units.forEach((rows, index) => {
    const lastPayment = rows.map((r, i) => ({r, date: input.scenarios[index]!.periods[i]!.endDate}))
      .filter(v => !v.r.principalPaid.eq(0) || !v.r.interestPaid.eq(0)).at(-1);
    if (!lastPayment || lastPayment.date !== input.horizon.newDebtFinalPaymentDate) throw new Error("capacity_maturity_inventory_mismatch");
  });
  input.scenarios.forEach(s => s.periods.forEach(p => {
    for (const component of [p.cashLeasePayments, p.maintenanceCapex, p.growthCapex]) {
      const v = from(component);
      if (at(v, new Exact(0)).lt(0) || at(v, maximum).lt(0)) throw new Error("capacity_negative_operating_outlay");
    }
  }));
  return units;
}

function replayCapacityChecks(input: DebtCapacityInput, units: UnitRow[][], n: Decimal) {
  return input.scenarios.flatMap((s, index) => projectedRows(s, units[index]!, n).flatMap(row =>
    s.rules.map(r => {
      const cash = at(row.cash, n); const debt = at(row.debt, n); const ebitda = at(row.ebitda, n); const covenantEbitda = at(row.covenantEbitda, n);
      let numerator: Decimal; let denominator: Decimal | null = null; let slack: Decimal; let applicable = true;
      if (r.kind === "minimum_available_cash") {numerator = cash; slack = cash.minus(r.threshold);}
      else if (r.kind === "maximum_net_debt_to_ebitda") {
        numerator = debt.minus(s.cashNetting === "nonnegative_available" ? Exact.max(cash, 0) : cash); denominator = covenantEbitda;
        slack = denominator.times(r.threshold).minus(numerator);
      } else {
        numerator = r.kind === "minimum_interest_coverage" ? ebitda : at(row.cfads, n);
        denominator = at(r.kind === "minimum_interest_coverage" ? row.interest : row.service, n);
        applicable = !denominator.eq(0); slack = numerator.minus(denominator.times(r.threshold));
      }
      const validDenominator = denominator === null || denominator.gt(0);
      return {scenarioId: s.id, periodId: row.period.id, date: row.period.endDate, ruleId: r.id, kind: r.kind,
        sourceAnchor: r.sourceAnchor, threshold: r.threshold, numerator: fmt(numerator), denominator: denominator === null ? null : fmt(denominator),
        metric: denominator === null ? fmt(numerator) : validDenominator ? fmt(numerator.div(denominator)) : null,
        slackInNumeratorUnits: fmt(slack), applicable, passed: !applicable || (validDenominator && slack.gte(0))};
    })));
}

/** All financial restrictions remain affine inside explicit tax and cash-netting regions.
 * Intersect their half-spaces, quantize conservatively, and replay each candidate. This finds
 * disconnected viable intervals and lower funding bounds that a binary search from zero loses.
 * Non-affine price/scale changes require a separate alternative, never sampled as if certified. */
export function findMaximumDebtCapacity(raw: DebtCapacityInput) {
  const input = debtCapacityInputSchema.parse(raw); const requiredHorizon = validateInput(input);
  const maximum = new Exact(input.maximumAmount); const quantum = new Exact(input.monetaryQuantum);
  const units = prepareUnitSchedules(input);
  const points: Decimal[] = [new Exact(0), maximum];
  const addRoot = (v: Affine, lo: Decimal, hi: Decimal, target: Decimal[]) => {
    if (v.b.eq(0)) return; const root = v.a.neg().div(v.b);
    if (root.gt(lo) && root.lt(hi)) target.push(root);
  };
  input.scenarios.forEach((s, index) => s.periods.forEach((p, i) => {
    if (p.lossTaxTreatment !== "no_cash_benefit") return;
    const unit = units[index]![i]!;
    addRoot(sub(from(p.taxableBaseBeforeNewDebtInterest), {a: new Exact(0), b: p.newDebtTaxDeduction === "paid_interest" ? unit.interestPaid : unit.interestAccrued}), new Exact(0), maximum, points);
  }));
  const sorted = (values: Decimal[]) => [...new Map(values.map(v => [v.toFixed(), v])).values()].sort((a, b) => a.cmp(b));
  let boundaries = sorted(points);
  const nettingPoints = [...boundaries];
  for (let i = 0; i + 1 < boundaries.length; i++) {
    const lo = boundaries[i]!; const hi = boundaries[i + 1]!; const mid = lo.plus(hi).div(2);
    input.scenarios.forEach((s, index) => {
      if (s.cashNetting === "nonnegative_available") projectedRows(s, units[index]!, mid).forEach(r => addRoot(r.cash, lo, hi, nettingPoints));
    });
  }
  boundaries = sorted(nettingPoints);
  if (boundaries.length > 4096) throw new Error("capacity_piecewise_complexity_limit");
  const replay = (n: Decimal) => replayCapacityChecks(input, units, n);
  const feasible = (n: Decimal) => replay(n).every(c => c.passed);
  let best: Decimal | null = feasible(new Exact(0)) ? new Exact(0) : null;
  const regions: {lower: string; upper: string; candidate: string | null}[] = [];
  for (let i = 0; i + 1 < boundaries.length; i++) {
    const lo = boundaries[i]!; const hi = boundaries[i + 1]!; const mid = lo.plus(hi).div(2);
    let lower = lo; let upper = hi; let impossible = false;
    input.scenarios.forEach((s, index) => projectedRows(s, units[index]!, mid).forEach(row => inequalities(s, row, mid).forEach(c => {
      const v = c.value;
      if (v.b.eq(0)) {if (c.strict ? v.a.lte(0) : v.a.lt(0)) impossible = true; return;}
      const bound = v.a.neg().div(v.b);
      if (v.b.gt(0)) lower = Exact.max(lower, bound); else upper = Exact.min(upper, bound);
    })));
    if (impossible || upper.lt(lower)) continue;
    let candidate = upper.div(quantum).floor().times(quantum);
    // Replay the lattice point itself; a strict denominator boundary is never admitted.
    if (candidate.gte(lower) && !feasible(candidate)) candidate = candidate.minus(quantum);
    if (candidate.gte(lower) && candidate.gte(0) && feasible(candidate)) {
      const following = candidate.plus(quantum);
      if (following.lte(hi) && following.lte(maximum) && feasible(following)) candidate = following;
      if (best === null || candidate.gt(best)) best = candidate;
      regions.push({lower: fmt(lower), upper: fmt(upper), candidate: fmt(candidate)});
    } else regions.push({lower: fmt(lower), upper: fmt(upper), candidate: null});
  }
  const finalChecks = best === null ? null : replay(best);
  const nextAmount = best === null ? null : best.plus(quantum);
  const followingChecks = nextAmount === null || nextAmount.gt(maximum) ? null : replay(nextAmount);
  return {schemaVersion: "debt-capacity.v1" as const, engineVersion: debtCapacityVersion, operands: structuredClone(input),
    status: best === null ? "no_feasible_amount" as const : input.horizon.mode === "calibration_window" ? "calibration_only" as const : "calculated" as const,
    maximumFeasibleAmount: best === null ? null : fmt(best), monetaryQuantum: input.monetaryQuantum,
    requiredDebtHorizon: requiredHorizon, projectionEndDate: input.endDate, fullLifeVerified: input.horizon.mode === "full_settlement",
    boundedBySearchDomain: nextAmount !== null && nextAmount.gt(maximum), finalChecks, followingAmount: nextAmount === null ? null : fmt(nextAmount), followingChecks,
    financialRowsAtMaximum: best === null ? null : projectFinancialRows(input, units, best),
    viableRegions: regions, unitSchedules: units.map((rows, index) => ({scenarioId: input.scenarios[index]!.id,
      rows: rows.map((r, i) => ({periodId: input.scenarios[index]!.periods[i]!.id,
        closingPrincipalPerUnit: fmt(r.principal), closingAccruedInterestPerUnit: fmt(r.accrued),
        interestAccruedPerUnit: fmt(r.interestAccrued), interestPaidPerUnit: fmt(r.interestPaid), netCashPerUnit: fmt(r.netCash)}))})),
    intraperiodLiquidityVerified: false as const, externalCreditApproval: false as const};
}

function projectFinancialRows(input: DebtCapacityInput, units: UnitRow[][], n: Decimal) {
  return input.scenarios.map((s, i) => ({scenarioId: s.id,
    rows: projectedRows(s, units[i]!, n).map(r => ({periodId: r.period.id, date: r.period.endDate,
      ebitda: fmt(at(r.ebitda, n)), covenantEbitda: fmt(at(r.covenantEbitda, n)),
      cashTax: fmt(at(r.tax, n)), cfads: fmt(at(r.cfads, n)), cashInterest: fmt(at(r.interest, n)),
      cashDebtService: fmt(at(r.service, n)), closingAvailableCash: fmt(at(r.cash, n)), closingDebt: fmt(at(r.debt, n))}))}));
}
/** Fixed amount/profile review uses the same projection and checks as the search. */
export function projectDebtCapacityAmount(raw: DebtCapacityInput, requestedAmount: string) {
  const input = debtCapacityInputSchema.parse(raw); const requiredHorizon = validateInput(input);
  const n = new Exact(nonnegative.parse(requestedAmount));
  if (n.gt(input.maximumAmount)) throw new Error("capacity_amount_outside_search_domain");
  const units = prepareUnitSchedules(input);
  const checks = replayCapacityChecks(input, units, n);
  return {schemaVersion: "debt-capacity-profile.v1" as const, engineVersion: debtCapacityVersion,
    operands: structuredClone(input), amount: requestedAmount, checks,
    constraintsPassed: checks.every(c => c.passed), financialRows: projectFinancialRows(input, units, n),
    requiredDebtHorizon: requiredHorizon, fullLifeVerified: input.horizon.mode === "full_settlement",
    intraperiodLiquidityVerified: false as const, externalCreditApproval: false as const};
}
