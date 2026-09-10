import {describe, expect, it} from "vitest";

import {aggregateIndexedDebtSchedules, buildIndexedDebtSchedule} from "./indexed-debt";

describe("indexed debt schedule", () => {
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
