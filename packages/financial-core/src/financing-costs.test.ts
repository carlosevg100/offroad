import {describe, expect, it} from "vitest";
import {buildFinancingCashFlows, buildLiquidityCalendar, financingCostCategories, type FinancingCostsInput, type FinancingCharge} from "./index";

// Synthetic operands; no market terms, tax rates or production defaults.
const fixture = (): FinancingCostsInput => ({
  drawConvention: "gross_cash_before_withholding",
  debt: {openingDate: "2026-12-31", endDate: "2027-02-28", currency: "BRL",
    convention: "draw_at_period_start_pay_at_period_end",
    instruments: [{instrumentId: "debt", openingPrincipal: "0", currency: "BRL", indexer: "none",
      indexationTreatment: "not_applicable", couponTreatment: "cash_paid", couponBase: "opening_principal",
      drawdownAccount: "available", paymentAccount: "available", periods: [
        {period: "jan", startDate: "2027-01-01", endDate: "2027-01-31", indexationRate: "0", couponRate: "0.1", drawdown: "100", scheduledPrincipal: "0", prepayment: "0", repayAll: false},
        {period: "feb", startDate: "2027-02-01", endDate: "2027-02-28", indexationRate: "0", couponRate: "0.1", drawdown: "0", scheduledPrincipal: "0", prepayment: "0", repayAll: true},
      ]}],
  }, assessments: financingCostCategories.map(category => ({instrumentId: "debt", category, status: "not_applicable", reason: "Explicit synthetic test assumption"})), charges: [],
});
function add(input: FinancingCostsInput, overrides: Partial<FinancingCharge> = {}) {
  const charge: FinancingCharge = {id: "fee", economicId: "economic-fee", instrumentId: "debt", category: "origination_fee", period: "jan", date: "2027-01-01", amount: "5", treatment: "withheld_from_gross_draw", account: "available", ...overrides};
  input.charges = [...input.charges, charge];
  input.assessments.find(a => a.category === charge.category)!.status = "specified";
  return input;
}
function cash(input: FinancingCostsInput) {
  const result = buildFinancingCashFlows(input);
  if (!result.events) throw new Error("missing financing");
  return buildLiquidityCalendar({openingDate: input.debt.openingDate, endDate: input.debt.endDate, currency: "BRL", convention: "end_of_day_netting", coverage: {status: "partial", reason: "Synthetic financing only"}, openingAvailable: "0", openingRestricted: "50", events: result.events});
}

describe("financing cost cash flows", () => {
  it("subtracts withheld charges once from gross proceeds without lowering contractual principal", () => {
    const input = add(fixture()); const result = buildFinancingCashFlows(input);
    expect(result.totals).toMatchObject({grossDraws: "100", proceedsAfterWithholding: "95", nominalCharges: "5", accruedInterestAndIndexation: "20", nominalFinancingCostInHorizon: "25", closingPrincipal: "0"});
    expect(result.debt![0]!.rows[0]).toMatchObject({drawdown: "100", closingPrincipal: "100", withheldCharges: "5"});
    expect(cash(input).closingAvailable).toBe("-25");
    expect(cash(input).rows[0]!.available.closing).toBe("95");
  });
  it("adds financed costs to principal and accrual without inventing cash proceeds", () => {
    const input = add(fixture(), {treatment: "capitalized_at_period_start", account: null});
    const result = buildFinancingCashFlows(input);
    // Independent oracle: receive 100, owe 105, pay 10.5 + 10.5 interest and 105 principal.
    expect(result.totals).toMatchObject({grossDraws: "100", proceedsAfterWithholding: "100", capitalizedCharges: "5", accruedInterestAndIndexation: "21", nominalFinancingCostInHorizon: "26"});
    expect(result.debt![0]!.rows[0]).toMatchObject({drawdown: "100", capitalizedCharges: "5", nonCashDebtIncrease: "5", openingPrincipal: "0", closingPrincipal: "105", interestAndIndexationAccrued: "10.5", nominalChargesInPeriod: "5"});
    expect(result.debt![0]!.rows[0]).not.toHaveProperty("financeExpense");
    expect(cash(input).rows[0]!.available.closing).toBe("100");
    expect(cash(input).closingAvailable).toBe("-26");
    expect(result.events!.filter(e => e.direction === "inflow" && e.amount !== "0").map(e => e.amount)).toEqual(["100"]);
  });
  it("accepts explicitly scheduled repayment including financed charges", () => {
    const input = add(fixture(), {treatment: "capitalized_at_period_start", account: null});
    const period = input.debt.instruments[0]!.periods[1]!; period.repayAll = false; period.scheduledPrincipal = "105";
    expect(buildFinancingCashFlows(input).totals!.closingPrincipal).toBe("0");
    expect(cash(input).closingAvailable).toBe("-26");
  });
  it("settles a separate charge on its actual date and chosen cash account", () => {
    const input = add(fixture(), {treatment: "cash_paid", date: "2027-01-15", account: "restricted"});
    expect(cash(input).closingAvailable).toBe("-20");
    expect(cash(input).closingRestricted).toBe("45");
    expect(buildFinancingCashFlows(input).events).toContainEqual(expect.objectContaining({date: "2027-01-15", account: "restricted", amount: "5", direction: "outflow"}));
  });
  it("keeps unknown assessments distinct from zero and not applicable", () => {
    const input = fixture(); input.assessments[0]!.status = "zero";
    expect(buildFinancingCashFlows(input).assessments[0]!.status).toBe("zero");
    input.assessments[2]!.status = "unknown";
    expect(buildFinancingCashFlows(input)).toMatchObject({status: "missing_inputs", debt: null, events: null, totals: null, gaps: [expect.objectContaining({category: "tax", status: "unknown"})]});
  });
  it("requires assessment of every category and rejects a fee under a zero declaration", () => {
    const missing = fixture(); missing.assessments = missing.assessments.slice(1);
    expect(() => buildFinancingCashFlows(missing)).toThrow("financing_cost_inventory_required");
    const duplicate = fixture(); duplicate.assessments = [...duplicate.assessments.slice(0, 3), duplicate.assessments[0]!];
    expect(() => buildFinancingCashFlows(duplicate)).toThrow("financing_invalid_assessment");
    const zero = add(fixture()); zero.assessments[0]!.status = "zero";
    expect(() => buildFinancingCashFlows(zero)).toThrow("financing_charge_assessment_mismatch");
    const unspecified = fixture(); unspecified.assessments[0]!.status = "specified";
    expect(() => buildFinancingCashFlows(unspecified)).toThrow("financing_charge_assessment_mismatch");
  });
  it("rejects duplicated economic charges even with distinct IDs and treatments", () => {
    const input = add(fixture()); add(input, {id: "second", treatment: "cash_paid"});
    expect(() => buildFinancingCashFlows(input)).toThrow("financing_duplicate_charge");
  });
  it("refuses net proceeds presented as gross or withholdings exceeding the draw", () => {
    const input = add(fixture()); input.drawConvention = "net_proceeds" as FinancingCostsInput["drawConvention"];
    expect(() => buildFinancingCashFlows(input)).toThrow("financing_gross_draw_convention_required");
    const over = add(fixture(), {amount: "60"}); add(over, {id: "second", economicId: "second", amount: "50"});
    expect(() => buildFinancingCashFlows(over)).toThrow("financing_withholding_exceeds_gross_draw");
  });
  it("refuses a wrong period, nonexistent date or inferred capitalization timing", () => {
    for (const overrides of [{period: "missing"}, {date: "2027-02-01"}, {date: "2027-01-32"}, {treatment: "capitalized_at_period_start" as const, date: "2027-01-15", account: null}, {account: "restricted" as const}]) {
      expect(() => buildFinancingCashFlows(add(fixture(), overrides))).toThrow(/financing_/);
    }
  });
  it("refuses negative, implicit zero, scientific or overprecision charges", () => {
    for (const amount of ["-1", "0", "1e2", "NaN", "1.000000001"]) expect(() => buildFinancingCashFlows(add(fixture(), {amount}))).toThrow("financing_positive_charge_required");
  });
  it("retains outstanding financed charges at a partial horizon instead of inventing settlement", () => {
    const input = add(fixture(), {treatment: "capitalized_at_period_start", account: null});
    input.debt.instruments[0]!.periods[1]!.repayAll = false;
    expect(buildFinancingCashFlows(input).totals!.closingPrincipal).toBe("105");
    expect(cash(input).closingAvailable).toBe("79");
    expect(buildFinancingCashFlows(input).annualEffectiveCost).toBeNull();
  });
  it("combines financing costs with PIK and negative paid interest without reversing signs", () => {
    const input = add(fixture(), {treatment: "capitalized_at_period_start", account: null});
    input.debt.instruments[0]!.couponTreatment = "capitalized_principal";
    expect(cash(input).closingAvailable).toBe("-27.05"); // 105 * 1.1 * 1.1 = 127.05
    input.debt.instruments[0]!.couponTreatment = "cash_paid";
    for (const p of input.debt.instruments[0]!.periods) p.couponRate = "-0.1";
    expect(cash(input).closingAvailable).toBe("16"); // 100 + 21 - 105
    expect(buildFinancingCashFlows(input).totals!.nominalFinancingCostInHorizon).toBe("-16");
  });
  it("preserves all original operands and reproduces without mutating caller data", () => {
    const input = add(fixture()); const before = structuredClone(input);
    const first = buildFinancingCashFlows(input);
    expect(input).toEqual(before); expect(buildFinancingCashFlows(input)).toEqual(first);
    input.charges[0]!.amount = "6";
    expect(first.operands.charges[0]!.amount).toBe("5");
    expect(first.charges[0]!.amount).toBe("5");
  });
  it("does not let another instrument absorb a charge or its withholding limit", () => {
    const input = add(fixture()); const second = structuredClone(input.debt.instruments[0]!);
    second.instrumentId = "other"; second.periods[0]!.drawdown = "1000";
    input.debt.instruments = [...input.debt.instruments, second];
    input.assessments = [...input.assessments, ...financingCostCategories.map(category => ({instrumentId: "other", category, status: "zero" as const, reason: "Explicit synthetic assumption"}))];
    input.charges[0]!.amount = "101";
    expect(() => buildFinancingCashFlows(input)).toThrow("financing_withholding_exceeds_gross_draw");
    input.charges[0]!.amount = "5";
    const result = buildFinancingCashFlows(input);
    expect(result.debt!.find(i => i.instrumentId === "other")!.rows.every(r => r.chargeIds.length === 0)).toBe(true);
    expect(result.totals!.proceedsAfterWithholding).toBe("1095");
  });
  it("keeps recurring installments distinct and reconciles their sum with cash", () => {
    const input = add(fixture(), {category: "recurring_fee", treatment: "cash_paid", date: "2027-01-31", amount: "2"});
    add(input, {category: "recurring_fee", id: "feb-fee", economicId: "feb-fee", period: "feb", date: "2027-02-28", amount: "3", treatment: "cash_paid"});
    expect(buildFinancingCashFlows(input).totals!.cashPaidCharges).toBe("5");
    expect(cash(input).closingAvailable).toBe("-25");
  });
  it("validates debt operands and charge dates even when another category is unknown", () => {
    const input = add(fixture(), {treatment: "cash_paid", date: "2027-01-32"}); input.assessments[2]!.status = "unknown";
    expect(() => buildFinancingCashFlows(input)).toThrow("financing_charge_outside_period");
    input.charges[0]!.date = "2027-01-01"; input.debt.instruments[0]!.periods[0]!.drawdown = "-100";
    expect(() => buildFinancingCashFlows(input)).toThrow("financing_invalid_gross_draw");
  });
});
