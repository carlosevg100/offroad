import {describe, expect, it} from "vitest";

import {
  aggregateDebtViews,
  applyRateShock,
  buildDebtBalanceBridge,
  calculateCashConversion,
  calculateCfads,
  calculateConcentration,
  calculateCurrencyExposure,
  calculateLiquidityCoverage,
  calculateSeasonality,
  calculateWorkingCapital,
  checkIdentity,
  maturityBuckets,
  propagateDefaults,
  reconcileInterestExpense,
  weightedAverageLife,
} from "./financial-truth";

describe("financial truth arithmetic", () => {
  it("builds the full EBITDA to CFADS bridge without defaulting missing economics", () => {
    const bridge = calculateCfads({
      adjustedEbitda: "30000000", cashTaxes: "2500000", maintenanceCapex: "4000000",
      workingCapitalInvestment: "3500000", fixedCharges: "1000000", approvedCashAdjustments: "500000",
    });
    expect(bridge.value).toBe("19500000");
    expect(calculateCashConversion(bridge.value, "30000000")).toBe("0.65");
    expect(bridge.lines.map((line) => line.id)).toEqual([
      "adjusted_ebitda", "cash_taxes", "maintenance_capex", "working_capital_investment", "fixed_charges", "approved_cash_adjustments",
    ]);
  });

  it("uses operating working capital and tests identities deterministically", () => {
    expect(calculateWorkingCapital({receivables: "38", inventory: "27", payables: "22"})).toBe("43");
    expect(checkIdentity({id: "balance", left: "100", right: "99.5", absoluteTolerance: "0.1"}).status).toBe("fail");
  });

  it("keeps distinct debt views and maturity buckets", () => {
    const rows = [
      {id: "a", principal: "100", accruedInterest: "5", covenantIncluded: true, capacityObligation: true, currency: "BRL", lender: "A", maturity: "2027-06-30"},
      {id: "b", principal: "50", quasiDebt: "20", commitment: "10", covenantIncluded: false, capacityObligation: true, currency: "USD", lender: "B", maturity: "2030-06-30"},
    ];
    expect(aggregateDebtViews({rows, cash: "40", restrictedCash: "15"})).toEqual({
      grossFinancialDebt: "155", unrestrictedCash: "25", netFinancialDebt: "130",
      covenantDebt: "105", adjustedCapacityObligations: "185", commitmentsAndQuasiDebt: "30",
    });
    expect(maturityBuckets(rows, "2026-08-25")).toEqual({
      within12Months: "105", months13To24: "0", months25To36: "0",
      beyond36Months: "50", undated: "0",
    });
  });

  it("reconciles debt movement, interest and weighted life without using final balance as a proxy", () => {
    expect(buildDebtBalanceBridge({
      openingBalance: "100", drawdowns: "40", pik: "3", indexation: "2", amortizations: "25", prepayments: "5",
    })).toMatchObject({value: "115"});
    expect(reconcileInterestExpense([
      {id: "a", calculated: "12", accounting: "13"}, {id: "b", calculated: "4", accounting: "3.5"},
    ])).toMatchObject({calculatedTotal: "16", accountingTotal: "16.5", difference: "0.5"});
    expect(Number(weightedAverageLife([
      {date: "2027-08-25", principal: "50"}, {date: "2029-08-25", principal: "50"},
    ], "2026-08-25"))).toBeCloseTo(2, 2);
  });

  it("models liquidity periods, governed rate shocks and contractual default propagation", () => {
    expect(calculateLiquidityCoverage([
      {period: "2027", openingCash: "10", cfads: "30", principal: "20", interest: "5"},
      {period: "2028", openingCash: "0", cfads: "18", principal: "25", interest: "3"},
    ])).toEqual([
      {period: "2027", openingCash: "10", sources: "40", debtService: "25", coverage: "1.6", closingCash: "15", deficit: "0"},
      {period: "2028", openingCash: "15", sources: "33", debtService: "28", coverage: "1.17857143", closingCash: "5", deficit: "0"},
    ]);
    expect(applyRateShock({averageBalance: "100", baseRate: "0.12", shock: "0.03", hedgeOffset: "1"})).toEqual({baseInterest: "12", stressedInterest: "14", delta: "2"});
    expect(propagateDefaults(["A"], [
      {from: "A", to: "B", type: "cross_default", thresholdSatisfied: true, cureExpired: true},
      {from: "B", to: "C", type: "cross_acceleration", thresholdSatisfied: true, cureExpired: true},
      {from: "A", to: "D", type: "cross_default", thresholdSatisfied: false, cureExpired: true},
    ])).toEqual({defaulted: ["A", "B", "C"], accelerated: ["C"]});
  });

  it("calculates concentration, seasonality and currency exposure from explicit inputs", () => {
    expect(calculateConcentration(["0.2", "0.15", "0.1", "0.08", "0.07", "0.05"])).toEqual({top1: "0.2", top5: "0.6", top10: "0.65"});
    expect(calculateSeasonality(["80", "100", "120"])).toMatchObject({average: "100", peak: "120", trough: "80", amplitude: "0.4"});
    expect(calculateCurrencyExposure({currency: "USD", revenue: "30", cost: "10", debtService: "15", hedge: "2"})).toEqual({currency: "USD", exposure: "7"});
  });
});
