import {describe, expect, it} from "vitest";
import {buildLiquidityCalendar, type LiquidityCalendarInput} from "./liquidity-calendar";
import {buildIndexedDebtSchedule} from "./indexed-debt";
const fixture = (): LiquidityCalendarInput => ({
  openingDate: "2026-12-31", endDate: "2027-12-31", currency: "BRL", convention: "end_of_day_netting",
  coverage: {status: "complete", reason: "Synthetic complete declared cash schedule"}, openingAvailable: "10", openingRestricted: "100",
  events: [
    {id: "maturity", date: "2027-01-10", account: "available", direction: "outflow", amount: "40", missingReason: null},
    {id: "receipt", date: "2027-02-10", account: "available", direction: "inflow", amount: "80", missingReason: null},
  ],
});
describe("dated liquidity identity", () => {
  it("exposes an early deficit despite a positive ending balance and does not spend restricted cash", () => {
    const result = buildLiquidityCalendar(fixture());
    // Independent cash identity: 10 - 40 = -30; -30 + 80 = 50. Restricted 100 is never added.
    expect(result.rows.map(row => row.available.closing)).toEqual(["-30", "50", "50"]);
    expect(result.closingRestricted).toBe("100");
    expect(result.firstKnownShortfallDate).toBe("2027-01-10");
    expect(result.maximumKnownShortfall).toBe("30");
    expect(result.rows[0]!.eventIds).toEqual(["maturity"]);
  });
  it("nets same-day flows explicitly without claiming intraday coverage", () => {
    const input = fixture(); input.events = input.events.map(e => ({...e, date: "2027-01-10"}));
    expect(buildLiquidityCalendar(input).firstKnownShortfallDate).toBeNull();
    expect(buildLiquidityCalendar(input).rows[0]!.available).toEqual({opening: "10", inflows: "80", outflows: "40", closing: "50"});
    expect(buildLiquidityCalendar({...input, events: [...input.events].reverse()})).toEqual(buildLiquidityCalendar(input));
  });
  it("propagates unknown cash from its date and keeps the other account distinct", () => {
    const input = fixture(); input.events = [{...input.events[0]!, amount: null, missingReason: "Unquoted fee"}, input.events[1]!];
    const result = buildLiquidityCalendar(input);
    expect(result.status).toBe("partial"); expect(result.rows.every(r => r.available.closing === null)).toBe(true);
    expect(result.closingRestricted).toBe("100"); expect(result.closingAvailable).toBeNull();
    expect(result.gaps[0]).toMatchObject({eventId: "maturity", reason: "Unquoted fee"});
  });
  it("keeps unknown opening balances and incomplete coverage explicitly partial", () => {
    expect(buildLiquidityCalendar({...fixture(), openingAvailable: null}).closingAvailable).toBeNull();
    const result = buildLiquidityCalendar({...fixture(), coverage: {status: "partial", reason: "Tax schedule absent"}});
    expect(result.status).toBe("partial"); expect(result.closingAvailable).toBe("50");
    expect(result.gaps).toContainEqual({eventId: null, account: null, reason: "Tax schedule absent"});
  });
  it("preserves a negative opening balance and an explicit zero without rounding away a small deficit", () => {
    const result = buildLiquidityCalendar({...fixture(), openingAvailable: "-0.00000001", events: []});
    expect(result.firstKnownShortfallDate).toBe("2026-12-31"); expect(result.maximumKnownShortfall).toBe("0.00000001");
    expect(buildLiquidityCalendar({...fixture(), openingAvailable: "0", events: []}).closingAvailable).toBe("0");
  });
  it("settles prior and final capitalized coupons through the existing debt kernel once", () => {
    const debt = buildIndexedDebtSchedule({instrumentId: "synthetic", openingPrincipal: "100", indexer: "none", indexationTreatment: "not_applicable", couponTreatment: "capitalized_principal", couponBase: "opening_principal", periods: [{period: "2026", indexationRate: "0", couponRate: "0.1"}, {period: "2027", indexationRate: "0", couponRate: "0.1", repayAll: true}]});
    expect(debt.rows[1]!.cashDebtService).toBe("121");
    const result = buildLiquidityCalendar({...fixture(), openingAvailable: "130", events: [{...fixture().events[0]!, amount: debt.rows[1]!.cashDebtService}]});
    expect(result.closingAvailable).toBe("9"); expect(result.maximumKnownShortfall).toBe("0");
  });
  it.each(["NaN", "Infinity", "-1", "0.000000001", "1e9"])("rejects unsupported flow amount %s", amount => {
    expect(() => buildLiquidityCalendar({...fixture(), events: [{...fixture().events[0]!, amount}]})).toThrow(/liquidity_(invalid|negative)_amount/);
  });
  it("rejects impossible dates, out-of-horizon flows, duplicate events and unexplained absence", () => {
    for (const date of ["2027-02-30", "2026-12-31", "2028-01-01"]) expect(() => buildLiquidityCalendar({...fixture(), events: [{...fixture().events[0]!, date}]})).toThrow(/liquidity_(invalid_date|event_outside_horizon)/);
    expect(() => buildLiquidityCalendar({...fixture(), events: [fixture().events[0]!, fixture().events[0]!]})).toThrow("liquidity_duplicate_event");
    expect(() => buildLiquidityCalendar({...fixture(), events: [{...fixture().events[0]!, amount: null}]})).toThrow("liquidity_missing_reason_required");
  });
});
