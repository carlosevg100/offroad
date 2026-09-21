import {capitalContractPreparationFixture as fixture} from "@offroad/testing-fixtures/capital-structure-decision";
import {describe, expect, it} from "vitest";
import {prepareCapitalContractEvidence} from "./capital-contract-preparation";

describe("contractual precision and principal integrity", () => {
  it("retains declared sixteen-place precision in rows totals aggregates and traces", () => {
    const input = fixture();
    const series = input.interest.series[0]!;
    series.openingPrincipal.value = "1";
    series.remuneration.ratePerYear = "0.1234567890123456";
    series.amortization = [];
    for (const key of ["indexFactor", "spreadFactor", "interestFactor", "dailyAccumulation", "amount"] as const) series.rounding[key].decimals = 16;
    const result = prepareCapitalContractEvidence(input).interest!;
    const schedule = result.schedule_by_series[0]!;
    expect(schedule.rows![0]!.coupon_paid).toBe("0.1234567890123456");
    expect(schedule.totals!.cash_interest).toBe("0.1234567890123456");
    expect(result.schedule_aggregate!.by_period[0]!.cash_interest).toBe("0.1234567890123456");
    expect(result.trace.calculations.find(c => c.id.startsWith("financial.coupon_payment:"))!.result).toBe("0.1234567890123456");
  });
  it("rejects amortization exceeding the available principal without silently rewriting it", () => {
    const input = fixture();
    input.interest.series[0]!.amortization[0]!.amount = "150";
    const before = JSON.stringify(input);
    expect(() => prepareCapitalContractEvidence(input)).toThrow("interest_amortization_exceeds_principal");
    expect(JSON.stringify(input)).toBe(before);
  });
  it("checks excess against the remaining principal after an earlier payment", () => {
    const input = fixture();
    input.interest.series[0]!.amortization = [
      {date: "2026-07-01", amount: "60", businessDaysFromPeriodStart: 126},
      {date: "2027-01-01", amount: "50", businessDaysFromPeriodStart: 252},
    ];
    expect(() => prepareCapitalContractEvidence(input)).toThrow("interest_amortization_exceeds_principal");
    input.interest.series[0]!.amortization[1]!.amount = "40";
    expect(prepareCapitalContractEvidence(input).interest!.schedule_by_series[0]!.rows![0]!.closing_principal).toBe("0");
  });
});
