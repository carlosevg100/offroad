import {describe, expect, it} from "vitest";
import {buildCapitalPeriodCash, financingCostCategories, type CapitalPeriodCashInput, type FinancingCostsInput} from "./index";
const workingCapital = () => ({receivables: "0", inventory: "0", otherOperatingAssets: "0", payables: "0", otherOperatingLiabilities: "0"});
function fixture(): CapitalPeriodCashInput & {financing: {status: "provided"; input: FinancingCostsInput}} {
  return {capitalMovements: [], capitalMovementInventory: {status: "declared_complete", reason: "Synthetic absence of other capital movements"}, openingAvailable: "130", openingRestricted: "500", operatingCashAccount: "available",
    operating: {currency: "BRL", openingDate: "2026-12-31", endDate: "2027-02-28", convention: "accrual_ebitda_to_cash_before_financing", openingWorkingCapital: workingCapital(),
      periods: ["2027-01-31", "2027-02-28"].map((endDate, n) => ({id: endDate, startDate: n ? "2027-02-01" : "2027-01-01", endDate,
        revenue: {mode: "amount", amount: n ? "50" : "20"}, variableOperatingExpense: "0", fixedOperatingExpense: "0", nonCashEbitdaAdjustment: "0",
        closingWorkingCapital: workingCapital(), cashTaxesPaid: "0", cashTaxRefunds: "0", maintenanceCapexPaid: "0", growthCapexPaid: "0"}))},
    financing: {status: "provided", input: {drawConvention: "gross_cash_before_withholding", assessments: financingCostCategories.map(category => ({instrumentId: "existing", category, status: category === "origination_fee" ? "specified" : "zero", reason: "Synthetic explicit inventory"})),
      charges: [{id: "fee", economicId: "fee", instrumentId: "existing", category: "origination_fee", period: "2027-01-31", date: "2027-01-01", amount: "5", treatment: "withheld_from_gross_draw", account: "available"}],
      debt: {openingDate: "2026-12-31", endDate: "2027-02-28", currency: "BRL", convention: "draw_at_period_start_pay_at_period_end", instruments: [{instrumentId: "existing", currency: "BRL", openingPrincipal: "100", indexer: "none", indexationTreatment: "not_applicable", couponTreatment: "capitalized_principal", couponBase: "opening_principal", drawdownAccount: "available", paymentAccount: "available",
        periods: ["2027-01-31", "2027-02-28"].map((endDate, n) => ({period: endDate, startDate: n ? "2027-02-01" : "2027-01-01", endDate, indexationRate: "0", couponRate: "0.1", drawdown: n ? "0" : "100", scheduledPrincipal: "0", prepayment: "0", repayAll: Boolean(n)}))}]}}}};
}
describe("capital period cash", () => {
  it("recomputes operations and financing once and reconciles both periods", () => {
    const r = buildCapitalPeriodCash(fixture()); expect(r.rows!.map(p => p.closingAvailable)).toEqual(["245", "53"]);
    expect(r.rows!.map(p => p.closingDebt)).toEqual(["220", "0"]); expect(r.summary).toMatchObject({closingRestricted: "500", closingAvailable: "53", nominalFinancingCostInHorizon: "47"});
    expect(r.rows![0]!.financingEventIds).toContain('["financing_charge","fee"]');
  });
  it("keeps residual debt visible when repayment extends beyond the horizon", () => {
    const i = fixture(); i.financing.input.debt.instruments[0]!.periods[1]!.repayAll = false;
    const r = buildCapitalPeriodCash(i); expect(r.summary).toMatchObject({closingAvailable: "295", closingDebt: "242", lifetimeCostCompared: false});
  });
  it("never uses restricted balances to hide a shortage of available cash", () => {
    const i = fixture(); i.openingAvailable = "0"; const r = buildCapitalPeriodCash(i);
    expect(r.summary).toMatchObject({closingAvailable: "-77", closingRestricted: "500", maximumAvailableShortfallAtMeasuredDates: "77"});
  });
  it("keeps financing paid from restricted cash in that account only", () => {
    const i = fixture(); i.financing.input.debt.instruments[0]!.paymentAccount = "restricted";
    const r = buildCapitalPeriodCash(i); expect(r.summary).toMatchObject({closingAvailable: "295", closingRestricted: "258"});
  });
  it("includes an opening shortfall and does not claim daily liquidity", () => {
    const i = fixture(); i.openingAvailable = "-200"; const r = buildCapitalPeriodCash(i);
    expect(r.summary!.maximumAvailableShortfallAtMeasuredDates).toBe("277");
    expect(r.summary!.intraperiodLiquidityVerified).toBe(false); expect(r.measurement).toBe("opening_and_period_end_balances");
  });
  it("refuses to fabricate period-end debt by interpolating a later balance", () => {
    const i = fixture(); i.financing.input.debt.instruments[0]!.periods = [{...i.financing.input.debt.instruments[0]!.periods[0]!, endDate: "2027-02-28", repayAll: true}];
    expect(() => buildCapitalPeriodCash(i)).toThrow(/stock_date_missing/);
  });
  it("rejects financing in a different currency or horizon", () => {
    const i = fixture(); i.financing.input.debt.currency = "USD"; expect(() => buildCapitalPeriodCash(i)).toThrow(/context_mismatch/);
    const j = fixture(); j.financing.input.debt.endDate = "2027-03-31"; expect(() => buildCapitalPeriodCash(j)).toThrow(/context_mismatch/);
  });
  it("does not convert unknown costs or opening cash to zero", () => {
    const i = fixture(); i.financing.input.assessments[2]!.status = "unknown";
    expect(buildCapitalPeriodCash(i)).toMatchObject({status: "missing_inputs", rows: null, summary: null, gaps: ["financing_costs_unknown"]});
    const j = fixture(); j.openingAvailable = null; expect(buildCapitalPeriodCash(j)).toMatchObject({status: "missing_inputs", summary: null, gaps: ["opening_available_unknown"]});
  });
  it("requires explicit absence of all debt and financing for an operating-only case", () => {
    const i: CapitalPeriodCashInput = {...fixture(), financing: {status: "no_debt_or_financing", reason: "Synthetic company has no debt or new financing"}};
    expect(buildCapitalPeriodCash(i).summary).toMatchObject({closingAvailable: "200", closingDebt: "0", nominalFinancingCostInHorizon: "0"});
    i.financing = {status: "no_debt_or_financing", reason: ""}; expect(() => buildCapitalPeriodCash(i)).toThrow(/reason_required/);
  });
  it("preserves exact fractional operational cash without forcing financial-event precision", () => {
    const i = fixture(); i.operating.periods[0]!.revenue = {mode: "drivers", quantity: "0.00000001", netUnitPrice: "0.00000001"};
    expect(buildCapitalPeriodCash(i).summary!.closingAvailable).toBe("33.0000000000000001");
  });
  it("reproduces from operands and keeps a detached trace", () => {
    const i = fixture(); const r = buildCapitalPeriodCash(i); expect(buildCapitalPeriodCash(i)).toEqual(r);
    i.openingAvailable = "1"; i.operating.periods[0]!.fixedOperatingExpense = "99";
    expect(r.operands.openingAvailable).toBe("130"); expect(r.operands.operating.periods[0]!.fixedOperatingExpense).toBe("0");
  });
  it("keeps equity and distributions separate from revenue and debt", () => {
    const i = fixture(); i.capitalMovements = [
      {id: "equity", economicId: "equity", date: "2027-01-15", amount: "80", account: "available", kind: "equity_contribution", reason: "Synthetic proposed equity raise"},
      {id: "distribution", economicId: "distribution", date: "2027-02-15", amount: "10", account: "available", kind: "distribution", reason: "Synthetic planned distribution"},
    ];
    const r = buildCapitalPeriodCash(i); expect(r.summary).toMatchObject({closingAvailable: "123", closingDebt: "0"});
    expect(r.operating.totalCashBeforeFinancing).toBe("70"); expect(r.rows![0]!.netCapitalAvailable).toBe("80");
  });
  it("keeps asset disposals and acquisitions in their declared account", () => {
    const i = fixture(); i.capitalMovements = [
      {id: "sale", economicId: "sale", date: "2027-01-15", amount: "40", account: "restricted", kind: "asset_sale", reason: "Synthetic restricted proceeds"},
      {id: "acquisition", economicId: "acquisition", date: "2027-02-15", amount: "60", account: "available", kind: "acquisition", reason: "Synthetic cash acquisition, excluded from capex"},
    ];
    expect(buildCapitalPeriodCash(i).summary).toMatchObject({closingAvailable: "-7", closingRestricted: "540"});
  });
  it("rejects duplicate economics across charges and capital movements and dates outside the horizon", () => {
    const i = fixture(); i.capitalMovements = [{id: "capital", economicId: "fee", date: "2027-01-15", amount: "5", account: "available", kind: "distribution", reason: "Synthetic duplicate charge"}];
    expect(() => buildCapitalPeriodCash(i)).toThrow(/duplicate_movement/);
    i.capitalMovements[0]!.economicId = "different"; i.capitalMovements[0]!.date = "2027-02-30";
    expect(() => buildCapitalPeriodCash(i)).toThrow(/movement_date/);
  });
  it("keeps an unknown capital movement inventory from becoming an empty known ledger", () => {
    const i = fixture(); i.capitalMovementInventory.status = "unknown";
    expect(buildCapitalPeriodCash(i)).toMatchObject({status: "missing_inputs", rows: null, gaps: ["capital_movements_unknown"]});
  });

});
