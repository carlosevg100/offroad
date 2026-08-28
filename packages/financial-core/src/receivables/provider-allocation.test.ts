import {describe, expect, it} from "vitest";

import {calculateReceivablesProviderAllocation} from "./provider-allocation";

describe("receivables provider allocation envelope", () => {
  it("does not exclude a provider merely because it cannot fund the entire request", () => {
    expect(calculateReceivablesProviderAllocation({
      requestedAmount: "50000000",
      ticketMinimum: "2000000",
      ticketMaximum: "15000000",
      availableCapacity: "10000000",
      eligiblePortfolioAmount: "12000000",
      conditionalPortfolioAmount: "3000000",
    })).toMatchObject({
      maximumConfirmedAllocation: "10000000.00",
      maximumAllocationIncludingConditional: "10000000.00",
      minimumTicketMet: true,
      minimumTicketMetIncludingConditional: true,
      wholeRequestCovered: false,
    });
  });

  it("distinguishes confirmed collateral from remediable collateral", () => {
    expect(calculateReceivablesProviderAllocation({
      requestedAmount: "8000000",
      ticketMinimum: "5000000",
      ticketMaximum: "10000000",
      availableCapacity: "10000000",
      eligiblePortfolioAmount: "4000000",
      conditionalPortfolioAmount: "3000000",
    })).toMatchObject({
      maximumConfirmedAllocation: "4000000.00",
      maximumAllocationIncludingConditional: "7000000.00",
      minimumTicketMet: false,
      minimumTicketMetIncludingConditional: true,
      wholeRequestCovered: false,
    });
  });

  it("fails closed on negative or inverted inputs", () => {
    expect(() => calculateReceivablesProviderAllocation({
      requestedAmount: "100",
      ticketMinimum: "200",
      ticketMaximum: "100",
      availableCapacity: "100",
      eligiblePortfolioAmount: "100",
      conditionalPortfolioAmount: "0",
    })).toThrow("ticketMaximum");
  });
});
