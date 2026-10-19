import Decimal from "decimal.js";
import {describe, expect, it} from "vitest";

import {aggregateIndexedDebtSchedules, buildIndexedDebtSchedule} from "./indexed-debt";

describe("indexed debt schedule", () => {
  it.each([
    ["opening_principal", "10", "115"],
    ["indexed_principal", "10.5", "115.5"],
    ["average_principal", "5.25", "110.25"],
  ] as const)("settles the final capitalized coupon under the %s convention", (couponBase, coupon, settlement) => {
    const schedule = buildIndexedDebtSchedule({
      instrumentId: "terminal-pik", openingPrincipal: "100", indexer: "IPCA",
      indexationTreatment: "capitalized_principal", couponTreatment: "capitalized_principal", couponBase,
      periods: [{period: "2027", indexationRate: "0.05", couponRate: "0.1", repayAll: true}],
    });
    expect(schedule.rows[0]).toMatchObject({
      indexationCapitalized: "5", couponCapitalized: coupon, couponPaid: "0",
      scheduledPrincipal: settlement, cashDebtService: settlement, closingPrincipal: "0",
    });
    expect(schedule.totalCashDebtService).toBe(settlement);
  });

  it("settles prior and current capitalized coupons once at final maturity", () => {
    const schedule = buildIndexedDebtSchedule({
      instrumentId: "two-period-pik", openingPrincipal: "100", indexer: "none",
      indexationTreatment: "not_applicable", couponTreatment: "capitalized_principal", couponBase: "opening_principal",
      periods: [
        {period: "2027", indexationRate: "0", couponRate: "0.1"},
        {period: "2028", indexationRate: "0", couponRate: "0.1", repayAll: true},
      ],
    });
    expect(schedule.rows[0]).toMatchObject({cashDebtService: "0", closingPrincipal: "110"});
    expect(schedule.rows[1]).toMatchObject({openingPrincipal: "110", couponCapitalized: "11", scheduledPrincipal: "121", cashDebtService: "121", closingPrincipal: "0"});
    expect(schedule.totalCashDebtService).toBe("121");
    expect(schedule.totalFinanceExpense).toBe("21");
  });

  it.each(["NaN", "Infinity", "-Infinity"])("rejects non-finite principal operands (%s)", value => {
    const input = {
      instrumentId: "invalid-principal", openingPrincipal: "100", indexer: "none" as const,
      indexationTreatment: "not_applicable" as const, couponTreatment: "cash_paid" as const, couponBase: "opening_principal" as const,
      periods: [{period: "2027", indexationRate: "0", couponRate: "0.1"}],
    };
    expect(() => buildIndexedDebtSchedule({...input, openingPrincipal: value})).toThrow("finite");
    for (const key of ["drawdown", "scheduledPrincipal", "prepayment"] as const) {
      expect(() => buildIndexedDebtSchedule({...input, periods: [{...input.periods[0]!, [key]: value}]})).toThrow("finite");
    }
  });

  it("capitalizes IPCA into principal while paying the coupon in cash", () => {
    const schedule = buildIndexedDebtSchedule({
      instrumentId: "debenture-ipca",
      openingPrincipal: "100",
      indexer: "IPCA",
      indexationTreatment: "capitalized_principal",
      couponTreatment: "cash_paid",
      couponBase: "indexed_principal",
      periods: [{period: "2027", indexationRate: "0.05", couponRate: "0.10"}],
    });
    expect(schedule.rows[0]).toMatchObject({
      indexationAccrued: "5",
      indexationPaid: "0",
      indexationCapitalized: "5",
      couponAccrued: "10.5",
      couponPaid: "10.5",
      cashDebtService: "10.5",
      financeExpense: "15.5",
      closingPrincipal: "105",
    });
  });

  it("keeps cash-paid indexation out of principal and debt growth", () => {
    const schedule = buildIndexedDebtSchedule({
      instrumentId: "inflation-cash-pay",
      openingPrincipal: "100",
      indexer: "IPCA",
      indexationTreatment: "cash_paid",
      couponTreatment: "cash_paid",
      couponBase: "indexed_principal",
      periods: [{period: "2027", indexationRate: "0.05", couponRate: "0.10"}],
    });
    expect(schedule.rows[0]).toMatchObject({
      indexationPaid: "5",
      indexationCapitalized: "0",
      couponPaid: "10",
      cashDebtService: "15",
      closingPrincipal: "100",
    });
  });

  it("tracks PIK and inflation as distinct non-cash components", () => {
    const schedule = buildIndexedDebtSchedule({
      instrumentId: "hybrid",
      openingPrincipal: "100",
      indexer: "IPCA",
      indexationTreatment: "capitalized_principal",
      couponTreatment: "capitalized_principal",
      couponBase: "indexed_principal",
      periods: [{period: "2027", indexationRate: "0.05", couponRate: "0.10", scheduledPrincipal: "20"}],
    });
    expect(schedule.rows[0]).toMatchObject({
      indexationCapitalized: "5",
      couponCapitalized: "10.5",
      scheduledPrincipal: "20",
      cashDebtService: "20",
      nonCashDebtIncrease: "15.5",
      closingPrincipal: "95.5",
    });
  });

  it("repays the full inflation-updated principal at a bullet maturity", () => {
    const schedule = buildIndexedDebtSchedule({
      instrumentId: "ipca-bullet",
      openingPrincipal: "100",
      indexer: "IPCA",
      indexationTreatment: "capitalized_principal",
      couponTreatment: "cash_paid",
      couponBase: "indexed_principal",
      periods: [
        {period: "2027", indexationRate: "0.05", couponRate: "0.10"},
        {period: "2028", indexationRate: "0.04", couponRate: "0.10", repayAll: true},
      ],
    });
    expect(schedule.rows[1]).toMatchObject({
      openingPrincipal: "105",
      indexationCapitalized: "4.2",
      scheduledPrincipal: "109.2",
      cashDebtService: "120.12",
      closingPrincipal: "0",
    });
  });

  it("rejects an ambiguous full repayment combined with another principal instruction", () => {
    expect(() => buildIndexedDebtSchedule({
      instrumentId: "ambiguous-bullet",
      openingPrincipal: "100",
      indexer: "IPCA",
      indexationTreatment: "capitalized_principal",
      couponTreatment: "cash_paid",
      couponBase: "indexed_principal",
      periods: [{period: "2027", indexationRate: "0.05", couponRate: "0.10", scheduledPrincipal: "100", repayAll: true}],
    })).toThrow("repayAll cannot be combined");
  });

  it("rejects ambiguous non-zero indexation", () => {
    expect(() => buildIndexedDebtSchedule({
      instrumentId: "ambiguous",
      openingPrincipal: "100",
      indexer: "IPCA",
      indexationTreatment: "not_applicable",
      couponTreatment: "cash_paid",
      couponBase: "opening_principal",
      periods: [{period: "2027", indexationRate: "0.05", couponRate: "0.10"}],
    })).toThrow("explicit treatment");
  });

  it("supports deflation when the governed contract has no zero floor", () => {
    const schedule = buildIndexedDebtSchedule({
      instrumentId: "ipca-no-floor",
      openingPrincipal: "100",
      indexer: "IPCA",
      indexationTreatment: "capitalized_principal",
      couponTreatment: "cash_paid",
      couponBase: "indexed_principal",
      periods: [{period: "2027", indexationRate: "-0.02", couponRate: "0.10"}],
    });
    expect(schedule.rows[0]).toMatchObject({indexationCapitalized: "-2", couponPaid: "9.8", closingPrincipal: "98"});
  });

  it("rejects a repayment schedule that exceeds the outstanding balance", () => {
    expect(() => buildIndexedDebtSchedule({
      instrumentId: "over-amortizing",
      openingPrincipal: "100",
      indexer: "none",
      indexationTreatment: "not_applicable",
      couponTreatment: "cash_paid",
      couponBase: "opening_principal",
      periods: [{period: "2027", indexationRate: "0", couponRate: "0.10", scheduledPrincipal: "101"}],
    })).toThrow("exceeds outstanding balance");
  });

  it("aggregates cash and non-cash debt effects without netting them", () => {
    const first = buildIndexedDebtSchedule({
      instrumentId: "a", openingPrincipal: "100", indexer: "IPCA",
      indexationTreatment: "capitalized_principal", couponTreatment: "cash_paid", couponBase: "indexed_principal",
      periods: [{period: "2027", indexationRate: "0.05", couponRate: "0.10"}],
    });
    const second = buildIndexedDebtSchedule({
      instrumentId: "b", openingPrincipal: "50", indexer: "none",
      indexationTreatment: "not_applicable", couponTreatment: "cash_paid", couponBase: "opening_principal",
      periods: [{period: "2027", indexationRate: "0", couponRate: "0.10", scheduledPrincipal: "10"}],
    });
    expect(aggregateIndexedDebtSchedules([first, second])[0]).toMatchObject({
      cashDebtService: "25.5",
      indexationCapitalized: "5",
      closingPrincipal: "145",
    });
  });
});

it("aggregates an explicitly confirmed empty debt ledger across its stated periods",()=>{
 expect(aggregateIndexedDebtSchedules([], ["2027","2028"])).toEqual([expect.objectContaining({period:"2027",closingPrincipal:"0",cashDebtService:"0"}),expect.objectContaining({period:"2028",closingPrincipal:"0",cashDebtService:"0"})]);
 expect(aggregateIndexedDebtSchedules([])).toEqual([]);
 expect(()=>aggregateIndexedDebtSchedules([], ["2027","2027"])).toThrow();
});

describe("coupon accrued until paid", () => {
  // Ficha C02, proposal "Fundo" (fictitious): R$ 70 mi, CDI 14% / 12.75% / 12% plus 3.1% a year,
  // interest accrued with interest on interest and paid every six months, 50% principal at
  // months 48 and 60. Expected service per quarter from the independent oracle modelo_c02.py.
  const cdi = [...Array(4).fill("0.14"), ...Array(4).fill("0.1275"), ...Array(13).fill("0.12")];
  const rate = (c: string) => new Decimal(c).plus(1).mul("1.031").pow("0.25").minus(1).toFixed(30);
  const expected = ["0", "5.889169187704249105", "0", "5.889169187704249105", "0", "5.471963337387745474", "0", "5.471963337387745474",
    "0", "5.220529112736238450", "0", "5.220529112736238450", "0", "5.220529112736238450", "0", "5.220529112736238450",
    "35", "3.938863502225960047", "0", "2.610264556368119225", "36.281665610510278403"];
  it("settles the compounded accrual on payment periods and keeps it out of principal", () => {
    const schedule = buildIndexedDebtSchedule({
      instrumentId: "fundo", openingPrincipal: "70", indexer: "none", indexationTreatment: "not_applicable",
      couponTreatment: "accrued_until_paid", couponBase: "opening_principal",
      periods: cdi.map((c, q) => ({period: `q${String(q).padStart(2, "0")}`, indexationRate: "0", couponRate: rate(c),
        scheduledPrincipal: q === 16 || q === 20 ? "35" : "0", paysAccruedCoupon: q % 2 === 1 || q === 20})),
    });
    schedule.rows.forEach((row, q) => expect(new Decimal(row.cashDebtService).minus(expected[q]!).abs().lt("1e-8")).toBe(true));
    expect(schedule.rows[0]!.couponPaid).toBe("0");
    expect(schedule.rows[0]!.closingPrincipal).toBe("70");
    expect(schedule.rows.at(-1)!.closingPrincipal).toBe("0");
  });
  it("refuses a payment flag on another treatment", () => {
    expect(() => buildIndexedDebtSchedule({instrumentId: "x", openingPrincipal: "1", indexer: "none", indexationTreatment: "not_applicable",
      couponTreatment: "cash_paid", couponBase: "opening_principal", periods: [{period: "q", indexationRate: "0", couponRate: "0.01", paysAccruedCoupon: true}]}))
      .toThrow("paysAccruedCoupon requires the accrued_until_paid coupon treatment");
  });
});

describe("accrued coupon at full repayment", () => {
  it("refuses repaying the whole principal while the accrued coupon stays unpaid", () => {
    expect(() => buildIndexedDebtSchedule({instrumentId: "d", openingPrincipal: "100", indexer: "none", indexationTreatment: "not_applicable",
      couponTreatment: "accrued_until_paid", couponBase: "opening_principal",
      periods: [{period: "1", indexationRate: "0", couponRate: "0.1", scheduledPrincipal: "100", paysAccruedCoupon: false}]})).toThrow("full repayment requires settling the accrued coupon");
  });
});
