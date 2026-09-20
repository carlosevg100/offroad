import Decimal from "decimal.js";
import {describe, expect, it} from "vitest";
import {buildOperatingCashProjection, type OperatingCashProjectionInput, type OperatingWorkingCapital} from "./index";
const wc = (receivables = "30", inventory = "20", payables = "10"): OperatingWorkingCapital => ({receivables, inventory, payables, otherOperatingAssets: "0", otherOperatingLiabilities: "0"});
const input = (): OperatingCashProjectionInput => ({currency: "BRL", openingDate: "2026-12-31", endDate: "2027-01-31",
  convention: "accrual_ebitda_to_cash_before_financing", openingWorkingCapital: wc(),
  periods: [{id: "january", startDate: "2027-01-01", endDate: "2027-01-31", revenue: {mode: "drivers", quantity: "10", netUnitPrice: "20"},
    variableOperatingExpense: "90", fixedOperatingExpense: "40", nonCashEbitdaAdjustment: "5", closingWorkingCapital: wc("45", "25", "15"),
    cashTaxesPaid: "8", cashTaxRefunds: "0", maintenanceCapexPaid: "12", growthCapexPaid: "20"}]});
describe("operating cash projection", () => {
  it("reconciles EBITDA to cash independently of financing and keeps every operand", () => {
    const i = input(); const r = buildOperatingCashProjection(i);
    // 200 - 90 - 40 = 70; NWC increases from40 to55; cash70+5-15-8-12-20=20.
    expect(r.rows[0]).toMatchObject({netRevenue: "200", ebitda: "70", openingNetWorkingCapital: "40", closingNetWorkingCapital: "55", changeInNetWorkingCapital: "15", cashBeforeFinancing: "20"});
    expect(r.totalCashBeforeFinancing).toBe("20"); expect(r.rows[0]!.operands).toEqual({openingWorkingCapital: i.openingWorkingCapital, ...i.periods[0]});
    expect(r.exclusions).toContain("contractual_cfads"); expect(r.exclusions).toContain("intraperiod_liquidity");
  });
  it("carries working capital stocks across periods and releases cash without counting revenue twice", () => {
    const i = input(); i.endDate = "2027-02-28"; i.periods = [...i.periods, {...i.periods[0]!, id: "february", startDate: "2027-02-01", endDate: i.endDate, closingWorkingCapital: wc()}];
    const r = buildOperatingCashProjection(i); expect(r.rows[1]).toMatchObject({openingNetWorkingCapital: "55", closingNetWorkingCapital: "40", changeInNetWorkingCapital: "-15", cashBeforeFinancing: "50", cumulativeCashBeforeFinancing: "70"});
  });
  it("preserves negative EBITDA and cash instead of manufacturing debt capacity", () => {
    const i = input(); i.periods[0]!.revenue = {mode: "amount", amount: "30"};
    const r = buildOperatingCashProjection(i); expect(r.rows[0]!.ebitda).toBe("-100"); expect(r.totalCashBeforeFinancing).toBe("-150");
  });
  it("subtracts noncash income and records tax refunds separately", () => {
    const i = input(); i.periods[0]!.nonCashEbitdaAdjustment = "-10"; i.periods[0]!.cashTaxRefunds = "3";
    expect(buildOperatingCashProjection(i).totalCashBeforeFinancing).toBe("8");
  });
  it("allows negative net working capital but rejects negative gross assets and liabilities", () => {
    const i = input(); i.openingWorkingCapital = wc("0", "0", "100");
    expect(buildOperatingCashProjection(i).rows[0]!.changeInNetWorkingCapital).toBe("155");
    i.openingWorkingCapital.receivables = "-1"; expect(() => buildOperatingCashProjection(i)).toThrow(/invalid_amount/);
  });
  it("rejects omitted amounts instead of zero filling an incomplete forecast", () => {
    const i = input(); delete (i.periods[0] as Partial<typeof i.periods[0]>)!.cashTaxesPaid;
    expect(() => buildOperatingCashProjection(i)).toThrow(/invalid_amount/);
  });
  it("rejects mixed revenue conventions and omitted working capital components", () => {
    const i = input(); Object.assign(i.periods[0]!.revenue, {amount: "200"});
    expect(() => buildOperatingCashProjection(i)).toThrow(/revenue_convention/);
    const j = input(); delete (j.openingWorkingCapital as Partial<OperatingWorkingCapital>).payables;
    expect(() => buildOperatingCashProjection(j)).toThrow(/working_capital_required/);
  });
  it("rejects gaps overlaps invalid dates and incomplete horizons", () => {
    for (const [key, value] of [["startDate", "2027-01-02"], ["startDate", "2026-12-31"], ["endDate", "2027-02-30"], ["endDate", "2027-01-30"]] as const) {
      const i = input(); i.periods[0]![key] = value; expect(() => buildOperatingCashProjection(i)).toThrow(/date|coverage/);
    }
  });
  it("accepts actual leap-day periods without assuming thirty-day months", () => {
    const i = input(); i.openingDate = "2028-01-31"; i.endDate = "2028-02-29";
    i.periods[0]!.startDate = "2028-02-01"; i.periods[0]!.endDate = i.endDate;
    expect(buildOperatingCashProjection(i).totalCashBeforeFinancing).toBe("20");
  });
  it("rejects duplicate identities and an absent projection", () => {
    const i = input(); i.endDate = "2027-02-28"; i.periods = [...i.periods, {...i.periods[0]!, startDate: "2027-02-01", endDate: i.endDate}];
    expect(() => buildOperatingCashProjection(i)).toThrow(/identity/);
    i.periods = []; expect(() => buildOperatingCashProjection(i)).toThrow(/period_limit/);
  });
  it("does not round fractional drivers or depend on global Decimal configuration", () => {
    const i = input(); i.periods[0]!.revenue = {mode: "drivers", quantity: "0.00000001", netUnitPrice: "0.00000001"};
    const before = buildOperatingCashProjection(i); const precision = Decimal.precision; const rounding = Decimal.rounding;
    try {Decimal.set({precision: 3, rounding: Decimal.ROUND_DOWN}); expect(buildOperatingCashProjection(i)).toEqual(before);}
    finally {Decimal.set({precision, rounding});}
    expect(before.rows[0]!.netRevenue).toBe("0.0000000000000001"); expect(before.rounding).toBe("none");
  });
  it("reproduces results without retaining mutable references to input operands", () => {
    const i = input(); const r = buildOperatingCashProjection(i); expect(buildOperatingCashProjection(i)).toEqual(r);
    i.openingWorkingCapital.receivables = "900"; i.periods[0]!.closingWorkingCapital.payables = "800";
    expect(r.rows[0]!.operands.openingWorkingCapital.receivables).toBe("30"); expect(r.rows[0]!.operands.closingWorkingCapital.payables).toBe("15");
  });
});
