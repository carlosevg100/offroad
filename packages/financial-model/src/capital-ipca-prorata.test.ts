import {capitalContractPreparationFixture} from "@offroad/testing-fixtures/capital-structure-decision";
import {describe, expect, it} from "vitest";
import {prepareCapitalContractEvidence} from "./capital-contract-preparation";

// Synthetic reproduction supplied by the independent stage 15 reviewer.
function indexedInput() {
  const input = capitalContractPreparationFixture();
  const anchor = input.interest.unitAnchor;
  const series = input.interest.series[0]!;
  return {...input, interest: {...input.interest,
    periods: [{id: "month", start: "2026-01-01", end: "2026-02-15", businessDays: 30, anchor}],
    curves: [{id: "ipca", kind: "IPCA", annualRateByPeriod: {month: "0"}, dailyRateByPeriod: null,
      monthlyRateByMonth: null as Record<string, string> | null,
      indexNumberByMonth: {"2025-12": "100", "2026-01": "101"} as Record<string, string> | null,
      source: {title: "Synthetic independent NI curve", asOf: "2026-01-01", anchor}}],
    series: [{...series, indexer: "IPCA", curveId: "ipca", remuneration: {type: "spread_over_index", spreadPerYear: "0"},
      couponDates: [], amortization: [], indexationTreatment: "capitalized_principal",
      indexation: {anniversaryDay: 1, lagMonths: 1,
        anniversaryDates: [{date: "2026-02-01", businessDaysFromPeriodStart: 20}],
        proRataByPeriod: {month: {dup: 10, dut: 20}}, anchor}}],
  }};
}

describe("capital IPCA index-number pro rata", () => {
  it("computes positive pro rata from index numbers with the independent principal oracle", () => {
    const input = indexedInput();
    const before = JSON.stringify(input);
    const result = prepareCapitalContractEvidence(input).interest!;
    const row = result.schedule_by_series[0]!.rows![0]!;
    // 100 * 1.01 at anniversary; partial factor sqrt(1.01) - 1 rounded to 0.00498756.
    expect(row.closing_principal).toBe("101.50374356");
    expect(row.indexation_capitalized).toBe("1.50374356");
    expect(row.coupon_accrued).toBe("0");
    expect(result.schema_version).toBe("method.build-interest-and-indexation-schedule.v8");
    expect(JSON.stringify(input)).toBe(before);
    expect(prepareCapitalContractEvidence(input).interest).toEqual(result);
  });

  it.each(["capitalized_principal", "cash_paid"])("matches equivalent monthly variations under %s", treatment => {
    const input = indexedInput();
    input.interest.series[0]!.indexationTreatment = treatment;
    const monthly = structuredClone(input);
    monthly.interest.curves[0]!.indexNumberByMonth = null;
    monthly.interest.curves[0]!.monthlyRateByMonth = {"2026-01": "0.01"};
    const ni = prepareCapitalContractEvidence(input).interest!.schedule_by_series[0]!;
    const rates = prepareCapitalContractEvidence(monthly).interest!.schedule_by_series[0]!;
    expect(ni.rows).toEqual(rates.rows);
    expect(ni.totals).toEqual(rates.totals);
    if (treatment === "cash_paid") {
      expect(ni.rows![0]!.closing_principal).toBe("100");
      // Cash-paid correction does not increase the 100 principal: 1 + 100 * 0.00498756.
      expect(ni.rows![0]!.indexation_paid).toBe("1.498756");
    }
  });

  it("keeps an incomplete index-number pair as missing evidence without inventing a rate", () => {
    const input = indexedInput();
    input.interest.curves[0]!.indexNumberByMonth = {"2026-01": "101"};
    const result = prepareCapitalContractEvidence(input).interest!;
    expect(result.schedule_by_series).toHaveLength(0);
    expect(result.uncovered_series[0]!.reason).toContain("lacks the monthly variation");
  });

  it.each([
    ["2026-02-10", "2025-12", "100.498756"],
    ["2026-02-15", "2026-01", "101.98039"],
    ["2026-02-16", "2026-01", "101.98039"],
  ])("uses the same contractual month for coverage trace and accrual ending %s", (end, month, closing) => {
    const input = indexedInput();
    input.interest.periods[0]!.end = end!;
    input.interest.series[0]!.indexation.anniversaryDay = 15;
    input.interest.series[0]!.indexation.anniversaryDates = [];
    input.interest.curves[0]!.indexNumberByMonth = null;
    input.interest.curves[0]!.monthlyRateByMonth = {"2025-12": "0.01", "2026-01": "0.04"};
    const result = prepareCapitalContractEvidence(input).interest!;
    expect(result.schedule_by_series[0]!.rows![0]!.closing_principal).toBe(closing);
    const trace = result.trace.calculations.find(c => c.id === "financial.ipca_pro_rata:debt:month");
    expect(trace!.operands.month).toBe(month);
    const onlyRequired = structuredClone(input);
    onlyRequired.interest.curves[0]!.monthlyRateByMonth = {[month!]: input.interest.curves[0]!.monthlyRateByMonth![month!]!};
    expect(prepareCapitalContractEvidence(onlyRequired).interest!.schedule_by_series[0]!.rows).toEqual(result.schedule_by_series[0]!.rows);
    delete input.interest.curves[0]!.monthlyRateByMonth![month!];
    const missing = prepareCapitalContractEvidence(input).interest!;
    expect(missing.schedule_by_series).toHaveLength(0);
    expect(missing.uncovered_series[0]!.reason).toContain(month);
  });
});
