import {describe, expect, it} from "vitest";
import {calculatePeriodFinancingTaxes} from "./period-financing-taxes";

const period = (over: Partial<Record<string, string>> = {}) => ({period: "1T27", ebitda: "14", depreciationAndAmortization: "3",
  leasePayments: "0.75", financeExpense: "4.2", financingCharges: "0", ...over});

describe("period cash taxes when financing changes the deductible base", () => {
  it("taxes EBITDA less depreciation, leases, accrued interest and financing charges", () => {
    const r = calculatePeriodFinancingTaxes({rate: "0.34", lossTreatment: "no_cash_benefit", periods: [period()]});
    expect(r.rows[0]).toEqual({period: "1T27", taxableBase: "6.05", cashTax: "2.057"});
  });
  it("pays nothing on a negative base and carries no credit to the next period", () => {
    const r = calculatePeriodFinancingTaxes({rate: "0.34", lossTreatment: "no_cash_benefit",
      periods: [period({financingCharges: "7"}), period({period: "2T27"})]});
    expect(r.rows.map((x) => x.cashTax)).toEqual(["0", "2.057"]);
    expect(r.rows[0]!.taxableBase).toBe("-0.95");
    expect(r.totalCashTax).toBe("2.057");
  });
  it("a different financing changes the tax, everything else equal", () => {
    const low = calculatePeriodFinancingTaxes({rate: "0.34", lossTreatment: "no_cash_benefit", periods: [period({financeExpense: "2"})]});
    const high = calculatePeriodFinancingTaxes({rate: "0.34", lossTreatment: "no_cash_benefit", periods: [period({financeExpense: "3"})]});
    expect(Number(low.rows[0]!.cashTax) - Number(high.rows[0]!.cashTax)).toBeCloseTo(0.34, 12);
  });
  it("refuses an unadopted treatment, a rate outside [0,1) and duplicate periods", () => {
    expect(() => calculatePeriodFinancingTaxes({rate: "1", lossTreatment: "no_cash_benefit", periods: [period()]})).toThrow("period_taxes_invalid_rate");
    expect(() => calculatePeriodFinancingTaxes({rate: "0.34", lossTreatment: "carry_forward" as never, periods: [period()]})).toThrow("period_taxes_loss_treatment_required");
    expect(() => calculatePeriodFinancingTaxes({rate: "0.34", lossTreatment: "no_cash_benefit", periods: [period(), period()]})).toThrow("period_taxes_duplicate_period");
    expect(() => calculatePeriodFinancingTaxes({rate: "0.34", lossTreatment: "no_cash_benefit", periods: [period({ebitda: "1e3"})]})).toThrow("period_taxes_invalid_ebitda");
  });
});
