import Decimal from "decimal.js";
import {z} from "zod";

const Exact = Decimal.clone({precision: 80, rounding: Decimal.ROUND_HALF_UP});
export const investmentProjectVersion = "2026.10.07-v1";
const amount = z.string().regex(/^-?\d{1,24}(?:\.\d{1,20})?$/);
const positive = amount.refine(v => new Exact(v).gte(0));
const fraction = positive.refine(v => new Exact(v).lte(1));
const id = z.string().trim().min(1).max(160);
const date = z.string().regex(/^[1-9]\d{3}-\d{2}-\d{2}$/).refine(v => {
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
});
const fmt = (v: Decimal) => v.toDecimalPlaces(20).toFixed();
const next = (v: string) => new Date(Date.parse(`${v}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
const wcSchema = z.object({receivables: positive, inventory: positive, newPayables: positive,
  lostSupplierCredit: positive}).strict();
const wcValue = (w: z.infer<typeof wcSchema>) => new Exact(w.receivables).plus(w.inventory).plus(w.lostSupplierCredit).minus(w.newPayables);

export const startupWorkingCapitalInputSchema = z.object({
  annualIncrementalRevenue: positive, annualNewVariableCost: positive, annualDisplacedPurchases: positive,
  receivableDays: positive, inventoryDays: positive, newSupplierDays: positive, lostSupplierDays: positive,
  adoptedYearDays: z.enum(["360", "365"]), sourceAnchor: id,
}).strict();
/** Incremental requirement, not the company's whole working capital. Lost supplier credit
 * survives even when verticalization produces no extra revenue. No inferred recovery date. */
export function calculateStartupWorkingCapital(raw: z.infer<typeof startupWorkingCapitalInputSchema>) {
  const input = startupWorkingCapitalInputSchema.parse(raw);
  const receivables = new Exact(input.annualIncrementalRevenue).times(input.receivableDays).div(input.adoptedYearDays);
  const inventory = new Exact(input.annualNewVariableCost).times(input.inventoryDays).div(input.adoptedYearDays);
  const newPayables = new Exact(input.annualNewVariableCost).times(input.newSupplierDays).div(input.adoptedYearDays);
  const lostSupplierCredit = new Exact(input.annualDisplacedPurchases).times(input.lostSupplierDays).div(input.adoptedYearDays);
  return {engineVersion: investmentProjectVersion, operands: structuredClone(input),
    receivables: fmt(receivables), inventory: fmt(inventory), newPayables: fmt(newPayables),
    lostSupplierCredit: fmt(lostSupplierCredit), netRequirement: fmt(receivables.plus(inventory).plus(lostSupplierCredit).minus(newPayables))};
}

const rampInputSchema = z.object({startDate: date, endDate: date, operationStartMonth: date,
  stages: z.array(z.object({months: z.number().int().positive().max(120), load: fraction}).strict()).max(24),
  terminalLoad: fraction, sourceAnchor: id}).strict();
/** Calendar months, explicitly month-aligned. A ramp continues across December; delaying
 * startup does not magically reset the ramp or grow project benefits by an extra year. */
export function calculateProjectRampExposure(raw: z.infer<typeof rampInputSchema>) {
  const input = rampInputSchema.parse(raw);
  if (!input.startDate.endsWith("-01") || !input.operationStartMonth.endsWith("-01") || input.endDate < input.startDate
    || next(input.endDate).slice(8) !== "01") throw new Error("project_month_aligned_period_required");
  const monthIndex = (d: string) => Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7)) - 1;
  const start = monthIndex(input.startDate); const end = monthIndex(input.endDate); const operation = monthIndex(input.operationStartMonth);
  if (end - start > 119) throw new Error("project_ramp_period_limit");
  let active = 0; let equivalent = new Exact(0);
  for (let m = start; m <= end; m++) {
    if (m < operation) continue;
    active++; let age = m - operation; let load = input.terminalLoad;
    for (const stage of input.stages) {if (age < stage.months) {load = stage.load; break;} age -= stage.months;}
    equivalent = equivalent.plus(load);
  }
  return {engineVersion: investmentProjectVersion, operands: structuredClone(input), activeMonths: active,
    activeYearFraction: fmt(new Exact(active).div(12)), loadEquivalentYearFraction: fmt(equivalent.div(12)),
    measurement: "adopted_monthly_load" as const};
}

export const investmentProjectPeriodSchema = z.object({
  id, startDate: date, endDate: date, sourceAnchor: id,
  /** Period totals or explicitly annualized run rates times the supplied exposures. */
  annualNetRevenue: positive, annualAvoidedOperatingCost: positive,
  annualVariableOperatingCost: positive, annualFixedOperatingCost: positive,
  loadYearFraction: positive, activeYearFraction: positive,
  fixedCostScaling: z.enum(["active_time", "load"]),
  annualMaintenanceCapex: positive, growthCapexPaid: positive, annualDepreciation: positive,
  cashTaxRate: fraction, lossTaxTreatment: z.enum(["no_cash_benefit", "immediate_cash_benefit"]),
  closingIncrementalWorkingCapital: wcSchema,
}).strict();
export const investmentProjectInputSchema = z.object({
  currency: z.string().regex(/^[A-Z]{3}$/), moneyUnit: id, openingDate: date, endDate: date,
  openingIncrementalWorkingCapital: wcSchema,
  periods: z.array(investmentProjectPeriodSchema).min(1).max(480),
  definition: z.literal("incremental_unlevered_cash_flow"),
}).strict();
export type InvestmentProjectInput = z.infer<typeof investmentProjectInputSchema>;
export type InvestmentProjectPeriod = z.infer<typeof investmentProjectPeriodSchema>;

function tax(base: Decimal, rate: string, policy: "no_cash_benefit" | "immediate_cash_benefit") {
  return (policy === "no_cash_benefit" ? Exact.max(base, 0) : base).times(rate);
}
function validateCoverage(opening: string, end: string, periods: {id: string; startDate: string; endDate: string}[]) {
  let previous = opening; const ids = new Set<string>();
  for (const p of periods) {
    if (ids.has(p.id)) throw new Error("project_duplicate_period");
    if (p.startDate !== next(previous) || p.endDate < p.startDate || p.endDate > end) throw new Error("project_period_coverage");
    ids.add(p.id); previous = p.endDate;
  }
  if (previous !== end) throw new Error("project_period_coverage");
}
/** Unlevered investment economics precede the financing recommendation. All ramp, tax,
 * terminal working-capital release and future run rates are adopted operands, never defaults. */
export function buildInvestmentProject(raw: InvestmentProjectInput) {
  const input = investmentProjectInputSchema.parse(raw);
  validateCoverage(input.openingDate, input.endDate, input.periods);
  let priorWc = wcValue(input.openingIncrementalWorkingCapital); let cumulative = new Exact(0);
  const rows = input.periods.map(p => {
    if (new Exact(p.loadYearFraction).gt(p.activeYearFraction)) throw new Error("project_load_exceeds_active_time");
    const ebitda = new Exact(p.annualNetRevenue).plus(p.annualAvoidedOperatingCost).minus(p.annualVariableOperatingCost)
      .times(p.loadYearFraction).minus(new Exact(p.annualFixedOperatingCost).times(p.fixedCostScaling === "active_time" ? p.activeYearFraction : p.loadYearFraction));
    const depreciation = new Exact(p.annualDepreciation).times(p.activeYearFraction);
    const cashTax = tax(ebitda.minus(depreciation), p.cashTaxRate, p.lossTaxTreatment);
    const closing = wcValue(p.closingIncrementalWorkingCapital); const change = closing.minus(priorWc);
    const maintenance = new Exact(p.annualMaintenanceCapex).times(p.activeYearFraction);
    const flow = ebitda.minus(cashTax).minus(maintenance).minus(p.growthCapexPaid).minus(change);
    cumulative = cumulative.plus(flow);
    const row = {periodId: p.id, startDate: p.startDate, endDate: p.endDate, operands: structuredClone(p),
      incrementalEbitda: fmt(ebitda), incrementalDepreciation: fmt(depreciation), incrementalCashTax: fmt(cashTax),
      maintenanceCapex: fmt(maintenance), growthCapex: p.growthCapexPaid,
      openingWorkingCapital: fmt(priorWc), closingWorkingCapital: fmt(closing), changeInWorkingCapital: fmt(change),
      unleveredCashFlow: fmt(flow), cumulativeUnleveredCashFlow: fmt(cumulative)};
    priorWc = closing; return row;
  });
  return {schemaVersion: "investment-project.v1" as const, engineVersion: investmentProjectVersion,
    operands: structuredClone(input), rows, totalUnleveredCashFlow: fmt(cumulative),
    exclusions: ["financing", "tax_law_inference", "automatic_terminal_release", "source_authority"] as const};
}

export const projectValuationInputSchema = z.object({
  baseDate: date, currency: z.string().regex(/^[A-Z]{3}$/), moneyUnit: id,
  flows: z.array(z.object({id, date, amount, sourceAnchor: id,
    adoptedTimeYears: positive.optional()}).strict()).min(2).max(480),
  timing: z.enum(["actual_365_fixed", "adopted_times"]), timingSourceAnchor: id,
  discountRate: amount.refine(v => new Exact(v).gt(-1)),
  irrLower: amount.refine(v => new Exact(v).gt(-1)), irrUpper: amount.refine(v => new Exact(v).gt(-1)),
  flowPrecision: z.discriminatedUnion("mode", [z.object({mode: z.literal("unrounded")}).strict(),
    z.object({mode: z.literal("calibration_rounding"), decimals: z.number().int().min(0).max(8), reason: id}).strict()]),
}).strict();
export type ProjectValuationInput = z.infer<typeof projectValuationInputSchema>;
/** IRR is reported only for negative investment prefix then nonnegative future flows.
 * Other sign patterns retain NPV but require explicit multiple-root analysis. Payback uses
 * interpolation between measured times, not an extra fictitious year. */
export function valueInvestmentProject(raw: ProjectValuationInput) {
  const input = projectValuationInputSchema.parse(raw);
  if (new Exact(input.irrLower).gte(input.irrUpper)) throw new Error("project_invalid_irr_bracket");
  const ids = new Set<string>(); let previousDate = input.baseDate; let previousTime: Decimal | null = null;
  const flows = input.flows.map(f => {
    if (ids.has(f.id) || f.date < previousDate || (ids.size > 0 && f.date === previousDate)) throw new Error("project_valuation_flow_identity_or_order");
    ids.add(f.id); previousDate = f.date;
    let time: Decimal;
    if (input.timing === "adopted_times") {
      if (f.adoptedTimeYears === undefined) throw new Error("project_adopted_time_required");
      time = new Exact(f.adoptedTimeYears);
    } else {
      if (f.adoptedTimeYears !== undefined) throw new Error("project_unused_adopted_time");
      time = new Exact((Date.parse(`${f.date}T00:00:00Z`) - Date.parse(`${input.baseDate}T00:00:00Z`)) / 86400000).div(365);
    }
    if (previousTime && time.lte(previousTime)) throw new Error("project_valuation_time_order");
    previousTime = time;
    let cash = new Exact(f.amount);
    if (input.flowPrecision.mode === "calibration_rounding") cash = cash.toDecimalPlaces(input.flowPrecision.decimals);
    return {id: f.id, date: f.date, time, cash, sourceAnchor: f.sourceAnchor};
  });
  const npv = (r: Decimal) => flows.reduce((s, f) => s.plus(f.cash.div(r.plus(1).pow(f.time))), new Exact(0));
  const nonzero = flows.filter(f => !f.cash.eq(0));
  const firstPositive = nonzero.findIndex(f => f.cash.gt(0));
  const conventional = firstPositive > 0 && nonzero.slice(firstPositive).every(f => f.cash.gt(0));
  let irrStatus: "calculated" | "nonconventional_stream" | "root_not_bracketed" = "nonconventional_stream";
  let irr: string | null = null; let residual: string | null = null;
  if (conventional) {
    let lo = new Exact(input.irrLower); let hi = new Exact(input.irrUpper);
    // Dividing by the discount factor of the final negative flow leaves a monotonic
    // function; one sign change gives a unique root despite staggered negative capex.
    if (npv(lo).gte(0) && npv(hi).lte(0)) {
      for (let n = 0; n < 160; n++) {const mid = lo.plus(hi).div(2); if (npv(mid).gt(0)) lo = mid; else hi = mid;}
      const root = lo.plus(hi).div(2).toDecimalPlaces(20); const pv = npv(root);
      const tolerance = flows.reduce((s, f) => s.plus(f.cash.abs()), new Exact(0)).times("0.000000000000001");
      if (pv.abs().gt(tolerance)) throw new Error("project_irr_residual_exceeds_tolerance");
      irrStatus = "calculated"; irr = fmt(root); residual = fmt(pv);
    } else irrStatus = "root_not_bracketed";
  }
  let cumulative = new Exact(0); let prevTime = new Exact(0);
  let payback: {measuredDate: string; measuredTimeYears: string; interpolatedTimeYears: string} | null = null;
  for (const f of flows) {
    const prior = cumulative; cumulative = cumulative.plus(f.cash);
    if (!payback && prior.lt(0) && cumulative.gte(0)) payback = {measuredDate: f.date,
      measuredTimeYears: fmt(f.time), interpolatedTimeYears: fmt(prevTime.plus(f.time.minus(prevTime).times(prior.neg().div(f.cash))))};
    prevTime = f.time;
  }
  return {schemaVersion: "project-valuation.v1" as const, engineVersion: investmentProjectVersion,
    operands: structuredClone(input), netPresentValue: fmt(npv(new Exact(input.discountRate))), irrStatus,
    annualIrr: irr, irrResidualPresentValue: residual, payback,
    paybackRemainsRecoveredAtEnd: payback !== null && cumulative.gte(0),
    cashFlowTrace: flows.map(f => ({id: f.id, date: f.date, timeYears: fmt(f.time), amount: fmt(f.cash), sourceAnchor: f.sourceAnchor}))};
}

export const companyCounterfactualInputSchema = z.object({
  project: investmentProjectInputSchema, openingAvailableCash: amount, openingRestrictedCash: positive,
  debtInventory: z.discriminatedUnion("status", [z.object({status: z.literal("no_debt"), reason: id}).strict(),
    z.object({status: z.literal("provided"), instruments: z.array(z.object({instrumentId: id, finalPaymentDate: date, sourceAnchor: id}).strict()).min(1).max(100)}).strict()]),
  periods: z.array(z.object({
    periodId: id, startDate: date, endDate: date, sourceAnchor: id,
    ebitda: amount, nonCashEbitdaBridge: amount, cashLeasePayments: positive,
    netWorkingCapitalChange: amount, maintenanceCapex: positive, growthCapex: positive,
    /** Includes adopted depreciation/interest/other tax bridges; distinct from cash EBITDA. */
    taxableBaseBeforeProject: amount, cashTaxRate: fraction,
    lossTaxTreatment: z.enum(["no_cash_benefit", "immediate_cash_benefit"]),
    netFinancingCashAvailable: amount, netCapitalCashAvailable: amount,
    netRestrictedCashMovement: amount, closingDebtStock: positive,
  }).strict()).min(1).max(480),
  definition: z.literal("same_baseline_and_financing_with_and_without_investment"),
}).strict();
export type CompanyCounterfactualInput = z.infer<typeof companyCounterfactualInputSchema>;
/** Recompute company taxes jointly: adding a standalone project's tax charge would miss
 * loss offsets against the baseline. Financing is held constant for this counterfactual;
 * sizing a financing alternative is a separate governed calculation. */
export function projectCompanyWithAndWithoutInvestment(raw: CompanyCounterfactualInput) {
  const input = companyCounterfactualInputSchema.parse(raw);
  const project = buildInvestmentProject(input.project);
  if (input.periods.length !== project.rows.length) throw new Error("company_counterfactual_periods_required");
  validateCoverage(input.project.openingDate, input.project.endDate,
    input.periods.map(p => ({...p, id: p.periodId})));
  const ids = new Set<string>();
  let requiredHorizon = input.project.openingDate;
  if (input.debtInventory.status === "provided") for (const d of input.debtInventory.instruments) {
    if (ids.has(d.instrumentId)) throw new Error("company_duplicate_debt_identity");
    ids.add(d.instrumentId); if (d.finalPaymentDate > requiredHorizon) requiredHorizon = d.finalPaymentDate;
  }
  if (input.project.endDate < requiredHorizon) throw new Error("company_final_amortization_horizon_required");
  if (input.debtInventory.status === "no_debt" && input.periods.some(p => !new Exact(p.closingDebtStock).eq(0))) throw new Error("company_debt_inventory_mismatch");
  if (!new Exact(input.periods.at(-1)!.closingDebtStock).eq(0)) throw new Error("company_debt_not_settled_at_horizon");
  let without = new Exact(input.openingAvailableCash); let withProject = without;
  let restricted = new Exact(input.openingRestrictedCash);
  const rows = input.periods.map((p, index) => {
    const q = project.rows[index]!;
    if (p.periodId !== q.periodId || p.startDate !== q.startDate || p.endDate !== q.endDate) throw new Error("company_counterfactual_period_mismatch");
    const baseTax = tax(new Exact(p.taxableBaseBeforeProject), p.cashTaxRate, p.lossTaxTreatment);
    const withTax = tax(new Exact(p.taxableBaseBeforeProject).plus(q.incrementalEbitda).minus(q.incrementalDepreciation), p.cashTaxRate, p.lossTaxTreatment);
    const baseCash = new Exact(p.ebitda).plus(p.nonCashEbitdaBridge).minus(p.cashLeasePayments).minus(baseTax)
      .minus(p.netWorkingCapitalChange).minus(p.maintenanceCapex).minus(p.growthCapex);
    const incrementalCash = new Exact(q.incrementalEbitda).minus(withTax.minus(baseTax)).minus(q.changeInWorkingCapital)
      .minus(q.maintenanceCapex).minus(q.growthCapex);
    const commonMovements = new Exact(p.netFinancingCashAvailable).plus(p.netCapitalCashAvailable);
    without = without.plus(baseCash).plus(commonMovements);
    withProject = withProject.plus(baseCash).plus(incrementalCash).plus(commonMovements);
    restricted = restricted.plus(p.netRestrictedCashMovement);
    if (restricted.lt(0)) throw new Error("company_restricted_cash_negative");
    return {periodId: p.periodId, startDate: p.startDate, endDate: p.endDate, operands: structuredClone(p),
      withoutProject: {ebitda: p.ebitda, cashTax: fmt(baseTax), cashBeforeFinancing: fmt(baseCash), closingAvailableCash: fmt(without)},
      withProject: {ebitda: fmt(new Exact(p.ebitda).plus(q.incrementalEbitda)), cashTax: fmt(withTax),
        cashBeforeFinancing: fmt(baseCash.plus(incrementalCash)), closingAvailableCash: fmt(withProject)},
      incrementalCompanyCash: fmt(incrementalCash), closingRestrictedCash: fmt(restricted), closingDebtStock: p.closingDebtStock};
  });
  return {schemaVersion: "company-investment-counterfactual.v1" as const, engineVersion: investmentProjectVersion,
    operands: structuredClone(input), project, rows, requiredDebtHorizon: requiredHorizon,
    projectionEndDate: input.project.endDate, measurement: "opening_and_period_end_cash" as const,
    intraperiodLiquidityVerified: false as const, financingHeldConstant: true as const};
}
