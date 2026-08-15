import {describe, expect, it} from "vitest";

import {
  calculateAdjustedEbitda,
  calculateCapacityEnvelope,
  calculateDscr,
  calculateLeverage,
} from "./index";

describe("financial core golden case", () => {
  it("reproduces the synthetic supermarket economics", () => {
    const ebitda = calculateAdjustedEbitda("30.4", ["0.8"]);
    expect(ebitda.value).toBe("31.2");
    expect(calculateLeverage("56.4", ebitda.value).value).toBe("1.80769231");
    expect(calculateDscr("18.6", "10.69").value).toBe("1.73994387");

    expect(calculateCapacityEnvelope({
      requested: "80",
      cashFlowCapacity: "68",
      collateralCapacity: "54",
      marketCapacity: "62",
    })).toEqual({
      requested: "80",
      recommended: "54",
      bindingConstraint: "collateral",
      capacities: {cash_flow: "68", collateral: "54", market: "62"},
    });
  });

  it("fails closed when a denominator is not meaningful", () => {
    expect(() => calculateDscr("10", "0")).toThrow(RangeError);
    expect(() => calculateLeverage("10", "-1")).toThrow(RangeError);
  });
});
