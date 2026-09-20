import {describe, expect, it} from "vitest";
import Decimal from "decimal.js";
import {buildDatedDebtCashFlows, buildLiquidityCalendar, type DatedDebtInput} from "./index";

// Synthetic arithmetic operands, not company facts or a professional method fixture.
const fixture = (): DatedDebtInput => ({
  openingDate: "2026-12-31", endDate: "2027-02-28", currency: "BRL",
  convention: "draw_at_period_start_pay_at_period_end",
  instruments: [{
    instrumentId: "test-debt", currency: "BRL", openingPrincipal: "100",
    indexer: "none", indexationTreatment: "not_applicable", couponTreatment: "capitalized_principal",
    couponBase: "opening_principal", drawdownAccount: "available", paymentAccount: "available",
    periods: [
      {period: "p1", startDate: "2027-01-01", endDate: "2027-01-31", indexationRate: "0", couponRate: "0.1", drawdown: "0", scheduledPrincipal: "0", prepayment: "0", repayAll: false},
      {period: "p2", startDate: "2027-02-01", endDate: "2027-02-28", indexationRate: "0", couponRate: "0.1", drawdown: "0", scheduledPrincipal: "0", prepayment: "0", repayAll: true},
    ],
  }],
});
const liquidity = (input: DatedDebtInput, openingAvailable = "130") => buildLiquidityCalendar({
  openingDate: input.openingDate, endDate: input.endDate, currency: input.currency,
  convention: "end_of_day_netting", coverage: {status: "partial", reason: "Debt-only test"},
  openingAvailable, openingRestricted: "500", events: buildDatedDebtCashFlows(input).events,
});

describe("dated debt cash projection", () => {
  it("refuses a changed global arithmetic context without silently restoring it", () => {
    const precision = Decimal.precision; const rounding = Decimal.rounding;
    try {
      Decimal.set({precision: 20});
      expect(() => buildDatedDebtCashFlows(fixture())).toThrow("dated_debt_arithmetic_context_changed");
      expect(Decimal.precision).toBe(20);
    } finally {Decimal.set({precision, rounding});}
  });
  it("pays compounded PIK exactly once and retains residual principal and component lineage", () => {
    const result = buildDatedDebtCashFlows(fixture());
    // Independent oracle: 100 * 1.1 * 1.1 = 121, settled only on February 28.
    expect(result.instruments[0]!.rows.map(row => row.closingPrincipal)).toEqual(["110", "0"]);
    expect(result.events.filter(event => event.amount !== "0")).toEqual([expect.objectContaining({
      instrumentId: "test-debt", period: "p2", component: "scheduledPrincipal", date: "2027-02-28", amount: "121", direction: "outflow",
    })]);
    expect(liquidity(fixture()).closingAvailable).toBe("9");
    expect(result.events.some(event => (event.component as string) === "cashDebtService")).toBe(false);
    expect(result.coverage).toBe("debt_components_only");
  });
  it("places a new draw at the explicit period start and payment at its end", () => {
    const input = fixture(); const debt = input.instruments[0]!;
    debt.openingPrincipal = "0"; debt.periods[0]!.drawdown = "100";
    const result = buildDatedDebtCashFlows(input);
    expect(result.events.filter(event => event.amount !== "0").map(event => [event.date, event.direction, event.amount])).toEqual([
      ["2027-01-01", "inflow", "100"], ["2027-02-28", "outflow", "121"],
    ]);
    expect(liquidity(input, "0").firstKnownShortfallDate).toBe("2027-02-28");
    expect(liquidity(input, "0").closingAvailable).toBe("-21");
  });
  it("does not invent a new draw for existing debt or spend restricted balances", () => {
    expect(liquidity(fixture(), "0").closingAvailable).toBe("-121");
    expect(liquidity(fixture(), "0").closingRestricted).toBe("500");
    expect(buildDatedDebtCashFlows(fixture()).events.filter(event => event.component === "drawdown").every(event => event.amount === "0")).toBe(true);
  });
  it("preserves the explicitly selected account without releasing restricted cash", () => {
    const input = fixture(); input.instruments[0]!.paymentAccount = "restricted";
    expect(liquidity(input).closingAvailable).toBe("130");
    expect(liquidity(input).closingRestricted).toBe("379");
  });
  it("keeps unamortized debt at the end of a partial contractual life", () => {
    const input = fixture(); input.instruments[0]!.periods[1]!.repayAll = false;
    const result = buildDatedDebtCashFlows(input);
    expect(result.instruments[0]!.closingPrincipal).toBe("121");
    expect(result.events.every(event => event.amount === "0")).toBe(true);
    expect(liquidity(input).closingAvailable).toBe("130");
  });
  it("treats negative paid coupons and indexation as inflows, not positive outflows", () => {
    const input = fixture(); const debt = input.instruments[0]!;
    debt.indexer = "other"; debt.indexationTreatment = "cash_paid"; debt.couponTreatment = "cash_paid";
    for (const period of debt.periods) {period.indexationRate = "-0.02"; period.couponRate = "-0.1";}
    const result = buildDatedDebtCashFlows(input);
    expect(result.events.filter(event => ["indexationPaid", "couponPaid"].includes(event.component)).map(event => [event.direction, event.amount])).toEqual([
      ["inflow", "10"], ["inflow", "2"], ["inflow", "10"], ["inflow", "2"],
    ]);
    // 130 + 2*(10+2) - 100 = 54; no absolute-value sign reversal.
    expect(liquidity(input).closingAvailable).toBe("54");
  });
  it("keeps capitalized indexation out of cash until principal settlement", () => {
    const input = fixture(); const debt = input.instruments[0]!;
    debt.indexer = "IPCA"; debt.indexationTreatment = "capitalized_principal"; debt.couponBase = "indexed_principal";
    for (const period of debt.periods) {period.indexationRate = "0.02"; period.couponRate = "0";}
    expect(liquidity(input).closingAvailable).toBe("25.96"); // 130 - 100*1.02*1.02.
    expect(buildDatedDebtCashFlows(input).events.filter(event => event.component === "indexationPaid").every(event => event.amount === "0")).toBe(true);
  });
  it("rejects missing, overlapping, out-of-order and impossible period dates", () => {
    for (const startDate of ["2027-01-31", "2027-02-02", "2027-02-30"]) {
      const input = fixture(); input.instruments[0]!.periods[1]!.startDate = startDate;
      expect(() => buildDatedDebtCashFlows(input)).toThrow(/dated_debt_(period_coverage|invalid_date)/);
    }
    const input = fixture(); input.instruments[0]!.periods = [...input.instruments[0]!.periods].reverse();
    expect(() => buildDatedDebtCashFlows(input)).toThrow("dated_debt_period_coverage");
  });
  it("rejects missing end coverage, mixed currency and duplicate instruments", () => {
    const input = fixture(); input.endDate = "2027-03-01";
    expect(() => buildDatedDebtCashFlows(input)).toThrow("dated_debt_period_coverage");
    const currency = fixture(); currency.instruments[0]!.currency = "USD";
    expect(() => buildDatedDebtCashFlows(currency)).toThrow("dated_debt_currency_mismatch");
    const duplicate = fixture(); duplicate.instruments = [duplicate.instruments[0]!, structuredClone(duplicate.instruments[0]!)];
    expect(() => buildDatedDebtCashFlows(duplicate)).toThrow("dated_debt_duplicate_instrument");
  });
  it("refuses unknown operands instead of substituting zero or accepting an injected schedule", () => {
    for (const invalid of [undefined, null, "NaN", "Infinity", "1e4", "-1", "0.000000001"]) {
      const input = fixture(); input.instruments[0]!.periods[0]!.drawdown = invalid as string;
      expect(() => buildDatedDebtCashFlows(input)).toThrow("dated_debt_invalid_amount");
    }
    const input = {...fixture(), schedule: {totalCashDebtService: "1"}};
    expect(liquidity(input).closingAvailable).toBe("9");
  });
  it("refuses absent effective rates and nonzero rates declared not applicable", () => {
    for (const invalid of [undefined, null, "-1", "Infinity", "NaN"]) {
      const input = fixture(); input.instruments[0]!.periods[0]!.couponRate = invalid as string;
      expect(() => buildDatedDebtCashFlows(input)).toThrow("dated_debt_invalid_effective_rate");
    }
    const input = fixture(); input.instruments[0]!.periods[0]!.indexationRate = "0.1";
    expect(() => buildDatedDebtCashFlows(input)).toThrow("dated_debt_unused_indexation_rate");
  });
  it("rejects ambiguous timing, overpayment and conflicting final repayment", () => {
    const timing = fixture(); timing.convention = "annual_rate" as DatedDebtInput["convention"];
    expect(() => buildDatedDebtCashFlows(timing)).toThrow("dated_debt_convention_required");
    const overpayment = fixture(); overpayment.instruments[0]!.periods[0]!.scheduledPrincipal = "101";
    expect(() => buildDatedDebtCashFlows(overpayment)).toThrow("principal payment exceeds outstanding balance");
    const conflicting = fixture(); conflicting.instruments[0]!.periods[1]!.prepayment = "1";
    expect(() => buildDatedDebtCashFlows(conflicting)).toThrow("repayAll cannot be combined");
  });
  it("preserves component rounding and produces a reproducible, detached operand snapshot", () => {
    const input = fixture(); input.instruments[0]!.couponTreatment = "cash_paid";
    for (const period of input.instruments[0]!.periods) period.couponRate = "0.00000000006";
    const result = buildDatedDebtCashFlows(input);
    expect(result.events.filter(event => event.component === "couponPaid").map(event => event.amount)).toEqual(["0.00000001", "0.00000001"]);
    expect(buildDatedDebtCashFlows(structuredClone(input))).toEqual(result);
    const snapshot = JSON.stringify(result);
    input.instruments[0]!.periods[0]!.couponRate = "0.9";
    expect(JSON.stringify(result)).toBe(snapshot);
  });
  it("does not collide when instrument identifiers contain delimiters", () => {
    const input = fixture(); const other = structuredClone(input.instruments[0]!);
    other.instrumentId = 'test-debt:p1,"couponPaid"'; input.instruments = [...input.instruments, other];
    const result = buildDatedDebtCashFlows(input);
    expect(new Set(result.events.map(event => event.id)).size).toBe(20);
    expect(liquidity(input, "300").closingAvailable).toBe("58");
  });
});
