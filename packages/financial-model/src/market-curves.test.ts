import {describe, expect, it} from "vitest";

import {interpolateMarketCurve, resolveContractualRatePeriods, type GovernedMarketCurve} from "./market-curves";

const curve: GovernedMarketCurve = {
  id: "br-ipca-2026-12-31",
  kind: "IPCA",
  jurisdiction: "BR",
  currency: "BRL",
  asOfDate: "2026-12-31",
  sourceId: "governed-market-source",
  sourceTitle: "Governed inflation curve",
  nodes: [{date: "2027-01-01", value: "0.04"}, {date: "2028-01-01", value: "0.05"}],
  interpolation: "linear",
  extrapolation: "flat",
};

describe("governed market curves", () => {
  it("interpolates a dated curve without replacing it with a timeless default", () => {
    expect(Number(interpolateMarketCurve(curve, "2027-07-02"))).toBeCloseTo(0.045, 4);
  });

  it("keeps contractual observation lag and spread traceable", () => {
    const [period] = resolveContractualRatePeriods({
      curve,
      periods: [{period: "2028", accrualEndDate: "2028-04-01", spreadRate: "0.06"}],
      observationLagMonths: 3,
      floorRate: "0.0425",
    });
    expect(period).toMatchObject({observationDate: "2028-01-01", curveRate: "0.05", spreadRate: "0.06", allInRate: "0.11", curveId: curve.id});
  });

  it("applies month-end observation lag without rolling into the next month", () => {
    const [period] = resolveContractualRatePeriods({
      curve,
      periods: [{period: "2028-05", accrualEndDate: "2028-05-31", spreadRate: "0"}],
      observationLagMonths: 3,
    });
    expect(period?.observationDate).toBe("2028-02-29");
  });

  it("fails when extrapolation is forbidden", () => {
    expect(() => interpolateMarketCurve({...curve, extrapolation: "forbidden"}, "2029-01-01")).toThrow("exceeds");
  });
});
