import Decimal from "decimal.js";

export const periodFinancingTaxesVersion = "2026.10.19-v1";

export type PeriodFinancingTaxesPeriod = {
  period: string;
  ebitda: string;
  depreciationAndAmortization: string;
  /** Lease payments deducted from the tax base in the period. */
  leasePayments: string;
  /** Interest accrued in the period (paid or not), from the debt schedule. */
  financeExpense: string;
  /** Upfront fees, taxes on credit, prepayment premiums and other financing charges deducted in the period. */
  financingCharges: string;
};

export type PeriodFinancingTaxesInput = {
  /** Adopted effective rate on the period taxable base (e.g. IRPJ + CSLL). */
  rate: string;
  /** `no_cash_benefit`: a negative base pays zero and carries no credit. The kernel infers no tax law. */
  lossTreatment: "no_cash_benefit";
  periods: readonly PeriodFinancingTaxesPeriod[];
};

const D = Decimal.clone({precision: 50, rounding: Decimal.ROUND_HALF_UP});
const num = (value: string, label: string) => {
  if (typeof value !== "string" || !/^-?\d{1,24}(?:\.\d{1,30})?$/.test(value)) throw new Error(`period_taxes_invalid_${label}`);
  return new D(value);
};

/**
 * Cash taxes per period when financing changes the deductible base: each financing alternative
 * changes accrued interest and charges, so the taxes it pays are computed, never adopted per
 * alternative. Pure arithmetic on adopted operands; the rate and loss treatment are adopted.
 */
export function calculatePeriodFinancingTaxes(input: PeriodFinancingTaxesInput) {
  const rate = num(input.rate, "rate");
  if (rate.isNegative() || rate.gte(1)) throw new Error("period_taxes_invalid_rate");
  if (input.lossTreatment !== "no_cash_benefit") throw new Error("period_taxes_loss_treatment_required");
  if (!input.periods.length || input.periods.length > 2000) throw new Error("period_taxes_period_limit");
  const seen = new Set<string>();
  const rows = input.periods.map((p) => {
    if (!p.period.trim() || seen.has(p.period)) throw new Error("period_taxes_duplicate_period");
    seen.add(p.period);
    const base = num(p.ebitda, "ebitda").minus(num(p.depreciationAndAmortization, "depreciation"))
      .minus(num(p.leasePayments, "lease")).minus(num(p.financeExpense, "finance_expense")).minus(num(p.financingCharges, "charges"));
    const tax = D.max(base, 0).mul(rate);
    return {period: p.period, taxableBase: base.toFixed(), cashTax: tax.toFixed()};
  });
  return {schemaVersion: "period-financing-taxes.v1" as const, engineVersion: periodFinancingTaxesVersion,
    rate: rate.toFixed(), lossTreatment: input.lossTreatment, rows,
    totalCashTax: rows.reduce((t, r) => t.plus(r.cashTax), new D(0)).toFixed()};
}
