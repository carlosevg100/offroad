import {describe, expect, it} from "vitest";

import {calculateReceivablesPoolBorrowingBase} from "./pool-borrowing-base";

/** The clean diversified pool: 6m adjusted base, 80% advance, 1.25x overcollateralization, 3m senior over 750k subordinated. */
const clean = {
  adjustedEligibleBalance: "6000000", totalOutstanding: "6000000", requestedFacility: "3000000.00", advanceRate: "0.80",
  requiredOvercollateralization: "1.25", requiredSubordinationRate: "0.15", actualSeniorAmount: "3000000.00",
  actualMezzanineAmount: "0", actualSubordinatedAmount: "750000.00", reserveRate: "0.03",
};

describe("receivables pool borrowing base kernel", () => {
  it("takes the lesser of the advance-rate and overcollateralization limits and compares it with the request", () => {
    const result = calculateReceivablesPoolBorrowingBase(clean);
    expect(result).toMatchObject({
      eligibleShare: "1",
      maximumByAdvanceRate: "4800000",
      maximumByOvercollateralization: "4800000",
      supportedFacility: "4800000",
      bindingConstraint: "both",
      requestCoveredBySupportedFacility: true,
      overcollateralizationAtRequest: "2",
      totalCapital: "3750000",
      subordinateCapital: "750000",
      actualSubordinationRate: "0.2",
      requiredSubordinationRate: "0.15",
      reserveTarget: "90000",
    });
    expect(result.trace).toMatchObject({id: "receivables.pool_borrowing_base", result: "4800000", operands: {advanceRate: "0.8", requiredOvercollateralization: "1.25"}});
  });

  it("reproduces the overlapping-concentration gold: 4.5m of adjusted base supports 3.6m", () => {
    const result = calculateReceivablesPoolBorrowingBase({...clean, adjustedEligibleBalance: "4500000"});
    expect(result).toMatchObject({maximumByAdvanceRate: "3600000", maximumByOvercollateralization: "3600000", supportedFacility: "3600000", eligibleShare: "0.75", requestCoveredBySupportedFacility: true});
  });

  it("names the binding constraint and keeps a non-terminating division unrounded", () => {
    const result = calculateReceivablesPoolBorrowingBase({...clean, adjustedEligibleBalance: "5000000", advanceRate: "0.70", requiredOvercollateralization: "1.2", requestedFacility: "4000000"});
    expect(result.maximumByAdvanceRate).toBe("3500000");
    expect(result.maximumByOvercollateralization.startsWith("4166666.66666666666666666666666666666666")).toBe(true);
    expect(result).toMatchObject({supportedFacility: "3500000", bindingConstraint: "advance_rate", requestCoveredBySupportedFacility: false, overcollateralizationAtRequest: "1.25"});
    const byOc = calculateReceivablesPoolBorrowingBase({...clean, advanceRate: "0.90", requiredOvercollateralization: "1.5"});
    expect(byOc).toMatchObject({maximumByAdvanceRate: "5400000", maximumByOvercollateralization: "4000000", supportedFacility: "4000000", bindingConstraint: "overcollateralization"});
  });

  it("treats a zero base, zero request or zero capital stack as zero shares instead of dividing by zero", () => {
    const result = calculateReceivablesPoolBorrowingBase({...clean, adjustedEligibleBalance: "0", totalOutstanding: "0", requestedFacility: "0", actualSeniorAmount: "0", actualSubordinatedAmount: "0"});
    expect(result).toMatchObject({eligibleShare: "0", supportedFacility: "0", overcollateralizationAtRequest: "0", actualSubordinationRate: "0", reserveTarget: "0", requestCoveredBySupportedFacility: true});
  });

  it("refuses an overcollateralization below one, a rate above one and negative amounts", () => {
    expect(() => calculateReceivablesPoolBorrowingBase({...clean, requiredOvercollateralization: "0.99"})).toThrow(RangeError);
    expect(() => calculateReceivablesPoolBorrowingBase({...clean, advanceRate: "1.01"})).toThrow(RangeError);
    expect(() => calculateReceivablesPoolBorrowingBase({...clean, actualMezzanineAmount: "-1"})).toThrow(RangeError);
  });
});
