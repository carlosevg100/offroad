import Decimal from "decimal.js";

const Exact = Decimal.clone({precision: 100, rounding: Decimal.ROUND_HALF_UP});
export const operatingCashProjectionVersion = "2026.09.20-v1";
export type OperatingWorkingCapital = {
  receivables: string; inventory: string; otherOperatingAssets: string;
  payables: string; otherOperatingLiabilities: string;
};
export type OperatingProjectionPeriod = {
  id: string; startDate: string; endDate: string;
  /** Net revenue; sales taxes/returns must already be excluded under the adopted definition. */
  revenue: {mode: "amount"; amount: string} | {mode: "drivers"; quantity: string; netUnitPrice: string};
  variableOperatingExpense: string; fixedOperatingExpense: string;
  /** Signed bridge from EBITDA: add non-cash expenses/subtract non-cash income included above.
   * Excludes working capital, financing, capex and taxes reported in their own operands. */
  nonCashEbitdaAdjustment: string;
  closingWorkingCapital: OperatingWorkingCapital;
  cashTaxesPaid: string; cashTaxRefunds: string;
  maintenanceCapexPaid: string; growthCapexPaid: string;
};
export type OperatingCashProjectionInput = {
  currency: string; openingDate: string; endDate: string;
  openingWorkingCapital: OperatingWorkingCapital;
  periods: readonly OperatingProjectionPeriod[];
  convention: "accrual_ebitda_to_cash_before_financing";
};
const keys = ["receivables", "inventory", "otherOperatingAssets", "payables", "otherOperatingLiabilities"] as const;
function number(value: string, signed = false) {
  if (typeof value !== "string" || !(signed ? /^-?\d{1,24}(?:\.\d{1,8})?$/ : /^\d{1,24}(?:\.\d{1,8})?$/).test(value)) throw new Error("operating_projection_invalid_amount");
  return new Exact(value);
}
function date(value: string) {
  if (typeof value !== "string" || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) throw new Error("operating_projection_invalid_date");
  const d = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== value) throw new Error("operating_projection_invalid_date");
  return d;
}
function next(value: string) {const d = date(value); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10);}
function balance(value: OperatingWorkingCapital) {
  if (!value || Object.keys(value).sort().join() !== [...keys].sort().join()) throw new Error("operating_projection_working_capital_required");
  keys.forEach(key => number(value[key]));
  return number(value.receivables).plus(value.inventory).plus(value.otherOperatingAssets).minus(value.payables).minus(value.otherOperatingLiabilities);
}
function exact(value: Decimal) {
  const result = value.toFixed();
  if (!/^-?\d{1,48}(?:\.\d{1,16})?$/.test(result)) throw new Error("operating_projection_result_outside_domain");
  return result;
}

/** Period budget only. Does not infer payment dates, liquidity within the period, tax rules,
 * source completeness or a contractual CFADS definition. Missing operands are rejected;
 * upstream orchestration must return a gap, never fill them with zero. */
export function buildOperatingCashProjection(input: OperatingCashProjectionInput) {
  date(input.openingDate); date(input.endDate);
  if (input.endDate <= input.openingDate || !/^[A-Z]{3}$/.test(input.currency)
    || input.convention !== "accrual_ebitda_to_cash_before_financing") throw new Error("operating_projection_context_required");
  if (!input.periods.length || input.periods.length > 240) throw new Error("operating_projection_period_limit");
  let priorEnd = input.openingDate; let opening = structuredClone(input.openingWorkingCapital);
  let previousWorkingCapital = balance(opening);
  let cumulative = new Exact(0);
  const ids = new Set<string>();
  const rows = input.periods.map(p => {
    date(p.startDate); date(p.endDate);
    if (typeof p.id !== "string" || !p.id.trim() || p.id.length > 160 || ids.has(p.id)) throw new Error("operating_projection_period_identity");
    ids.add(p.id);
    if (p.startDate !== next(priorEnd) || p.endDate < p.startDate || p.endDate > input.endDate) throw new Error("operating_projection_period_coverage");
    priorEnd = p.endDate;
    let revenue: Decimal;
    if (p.revenue?.mode === "amount" && Object.keys(p.revenue).sort().join() === "amount,mode") revenue = number(p.revenue.amount);
    else if (p.revenue?.mode === "drivers" && Object.keys(p.revenue).sort().join() === "mode,netUnitPrice,quantity") revenue = number(p.revenue.quantity).times(number(p.revenue.netUnitPrice));
    else throw new Error("operating_projection_revenue_convention");
    const ebitda = revenue.minus(number(p.variableOperatingExpense)).minus(number(p.fixedOperatingExpense));
    const closing = balance(p.closingWorkingCapital);
    const change = closing.minus(previousWorkingCapital);
    const cashBeforeFinancing = ebitda.plus(number(p.nonCashEbitdaAdjustment, true)).minus(change)
      .minus(number(p.cashTaxesPaid)).plus(number(p.cashTaxRefunds))
      .minus(number(p.maintenanceCapexPaid)).minus(number(p.growthCapexPaid));
    cumulative = cumulative.plus(cashBeforeFinancing);
    const row = {periodId: p.id, startDate: p.startDate, endDate: p.endDate,
      operands: {openingWorkingCapital: opening, ...structuredClone(p)},
      netRevenue: exact(revenue), ebitda: exact(ebitda), openingNetWorkingCapital: exact(previousWorkingCapital),
      closingNetWorkingCapital: exact(closing), changeInNetWorkingCapital: exact(change),
      cashBeforeFinancing: exact(cashBeforeFinancing), cumulativeCashBeforeFinancing: exact(cumulative)};
    opening = structuredClone(p.closingWorkingCapital); previousWorkingCapital = closing;
    return row;
  });
  if (priorEnd !== input.endDate) throw new Error("operating_projection_period_coverage");
  return {schemaVersion: "operating-cash-projection.v1" as const, engineVersion: operatingCashProjectionVersion,
    currency: input.currency, openingDate: input.openingDate, endDate: input.endDate, convention: input.convention,
    rows, totalCashBeforeFinancing: exact(cumulative), rounding: "none" as const,
    exclusions: ["intraperiod_liquidity", "financing", "contractual_cfads", "tax_rule_inference", "source_completeness"] as const};
}
