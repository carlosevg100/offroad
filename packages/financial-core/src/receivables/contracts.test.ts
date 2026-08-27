import {describe, expect, it} from "vitest";

import {
  agingBucketForDaysPastDue,
  assertHardEligibilityProvenance,
  type BuyerFitResult,
} from "./contracts";

describe("receivables canonical contracts", () => {
  it.each([
    [-1, "not_due"],
    [0, "not_due"],
    [1, "past_due_1_15"],
    [15, "past_due_1_15"],
    [16, "past_due_16_30"],
    [30, "past_due_16_30"],
    [31, "past_due_31_60"],
    [60, "past_due_31_60"],
    [61, "past_due_61_90"],
    [90, "past_due_61_90"],
    [91, "past_due_91_180"],
    [180, "past_due_91_180"],
    [181, "past_due_over_180"],
  ] as const)("classifies %i days as %s", (days, expected) => {
    expect(agingBucketForDaysPastDue(days)).toBe(expected);
  });

  it("rejects fractional days past due", () => {
    expect(() => agingBucketForDaysPastDue(1.5)).toThrow(RangeError);
  });

  it("blocks estimated evidence from hard eligibility decisions", () => {
    const result: BuyerFitResult = {
      buyerId: "buyer-1",
      status: "policy_fit_confirmed",
      evaluatedAt: "2026-08-27",
      criterionResults: [{
        criterionId: "max-concentration",
        status: "pass",
        reason: "Observed concentration is below an unconfirmed market estimate.",
        provenance: {
          kind: "estimated",
          method: "market conversation",
          sources: ["conversation-1"],
          asOf: "2026-08-27",
          owner: "market-desk",
          confidence: "medium",
          validUntil: "2026-09-27",
        },
      }],
    };
    expect(() => assertHardEligibilityProvenance(result)).toThrow(/estimated provenance/);
  });

  it("accepts cited evidence for a hard eligibility decision", () => {
    const result: BuyerFitResult = {
      buyerId: "buyer-1",
      status: "technically_eligible",
      evaluatedAt: "2026-08-27",
      criterionResults: [{
        criterionId: "eligible-asset",
        status: "pass",
        reason: "The asset satisfies the cited eligibility clause.",
        provenance: {
          kind: "cited",
          title: "Fund regulation",
          locator: {clause: "4.2"},
          retrievedAt: "2026-08-27",
          sourceStatus: "official",
        },
      }],
    };
    expect(() => assertHardEligibilityProvenance(result)).not.toThrow();
  });
});

