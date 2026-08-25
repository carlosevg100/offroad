import {describe, expect, it} from "vitest";

import {
  calculateExcessFundingCarry,
  calculateIncrementalWorkingCapital,
  calculateProFormaPosition,
  calculateTransactionNeed,
  reconcileSourcesAndUses,
  testDisbursementCoverage,
} from "./operation";

describe("operation arithmetic", () => {
  it("sizes a transaction from complete uses and self funding", () => {
    expect(calculateTransactionNeed({capex: "100", incrementalWorkingCapital: "20", transactionCosts: "3", executionBuffer: "7", selfFunding: "30"}).calculatedNeed).toBe("100");
  });

  it("requires sources and uses to tie within the governed tolerance", () => {
    expect(reconcileSourcesAndUses({sources: [{id: "debt", amount: "100"}], uses: [{id: "capex", amount: "99.99"}], tolerance: "0"}).status).toBe("fail");
    expect(reconcileSourcesAndUses({sources: [{id: "debt", amount: "100"}], uses: [{id: "capex", amount: "99.99"}], tolerance: "0.01"}).status).toBe("pass");
  });

  it("recalculates debt, cash, net debt and leverage after the transaction", () => {
    expect(calculateProFormaPosition({grossDebt: "60", unrestrictedCash: "10", newDebt: "100", refinancedDebt: "20", feesPaidFromCash: "2", cashContribution: "8", adjustedEbitda: "35"})).toEqual({grossDebt: "140", unrestrictedCash: "0", netDebt: "140", leverage: "4"});
  });

  it("uses peak working capital rather than summing periods", () => {
    const result = calculateIncrementalWorkingCapital([
      {period: "2027", incrementalRevenue: "365", incrementalCogs: "219", dsoDays: "30", dioDays: "20", dpoDays: "25", taxesAndOtherOperating: "2", daysInPeriod: "365"},
      {period: "2028", incrementalRevenue: "730", incrementalCogs: "438", dsoDays: "30", dioDays: "20", dpoDays: "25", taxesAndOtherOperating: "4", daysInPeriod: "365"},
    ]);
    expect(result.peakRequirement).toBe("58");
  });

  it("quantifies excess funding carry", () => {
    expect(calculateExcessFundingCarry({requested: "130", calculatedNeed: "100", authorizedBuffer: "10", annualDebtCost: "0.16", annualCashYield: "0.10"})).toEqual({excess: "20", annualCarry: "1.2"});
  });

  it("detects an uncovered month in the draw schedule", () => {
    expect(testDisbursementCoverage([
      {period: "M1", openingLiquidity: "10", scheduledSources: "20", scheduledUses: "25"},
      {period: "M2", openingLiquidity: "0", scheduledSources: "0", scheduledUses: "10"},
    ]).status).toBe("fail");
  });
});
