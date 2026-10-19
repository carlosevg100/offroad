import {describe, expect, it} from "vitest";
import {projectLeverageCovenant} from "./projected-leverage-covenant";

const q = (period: string, ebitda: string, debt: string, cash: string) => ({period, ebitda, leasePayments: "0.75", closingDebt: debt, closingAvailableCash: cash});
const periods = [q("1T27", "14", "120", "20"), q("2T27", "14", "110", "18"), q("3T27", "14.3", "105", "19"), q("4T27", "14.3", "100", "22")];
const history = [{period: "3T26", ebitda: "13.5", leasePayments: "0.75"}, {period: "4T26", ebitda: "14", leasePayments: "0.75"}];
const base = {leaseLiability: "8", trailingPeriods: 4, history, limit: "3", comparator: "lte" as const};

describe("projected leverage covenant by contractual definition", () => {
  it("includes the lease liability in debt and keeps IFRS 16 EBITDA when the definition says so", () => {
    const r = projectLeverageCovenant(periods, {...base, leaseLiabilityInDebt: true, ebitdaExcludesLeases: false, measurementPeriods: ["2T27", "4T27"]});
    // 2T27: (110 - 18 + 8) / (13.5 + 14 + 14 + 14) = 100 / 55.5
    expect(Number(r.rows[0]!.ratio)).toBeCloseTo(100 / 55.5, 12);
    // 4T27: (100 - 22 + 8) / (14 + 14 + 14.3 + 14.3) = 86 / 56.6
    expect(Number(r.rows[1]!.ratio)).toBeCloseTo(86 / 56.6, 12);
    expect(r.worst.period).toBe("2T27");
    expect(Number(r.worst.headroom)).toBeCloseTo(3 - 100 / 55.5, 12);
    expect(r.allComply).toBe(true);
  });
  it("deducts trailing lease payments from EBITDA and leaves leases out of debt in the other definition", () => {
    const r = projectLeverageCovenant(periods, {...base, leaseLiabilityInDebt: false, ebitdaExcludesLeases: true, measurementPeriods: ["4T27"]});
    expect(Number(r.rows[0]!.ratio)).toBeCloseTo(78 / (56.6 - 3), 12);
  });
  it("flags a breach against the limit and its comparator", () => {
    const r = projectLeverageCovenant(periods, {...base, limit: "1.6", leaseLiabilityInDebt: true, ebitdaExcludesLeases: false, measurementPeriods: ["2T27", "4T27"]});
    expect(r.rows.map((x) => x.complies)).toEqual([false, true]);
    expect(r.allComply).toBe(false);
  });
  it("refuses a short window, a date outside the projection and a non-positive EBITDA", () => {
    expect(() => projectLeverageCovenant(periods, {...base, history: [], leaseLiabilityInDebt: false, ebitdaExcludesLeases: false, measurementPeriods: ["2T27"]})).toThrow("projected_covenant_window_incomplete");
    expect(() => projectLeverageCovenant(periods, {...base, leaseLiabilityInDebt: false, ebitdaExcludesLeases: false, measurementPeriods: ["1T29"]})).toThrow("projected_covenant_measurement_outside_projection");
    expect(() => projectLeverageCovenant(periods.map((p) => ({...p, ebitda: "0"})), {...base, history: history.map((h) => ({...h, ebitda: "0"})), leaseLiabilityInDebt: false, ebitdaExcludesLeases: false, measurementPeriods: ["4T27"]})).toThrow("projected_covenant_nonpositive_ebitda");
  });
});
