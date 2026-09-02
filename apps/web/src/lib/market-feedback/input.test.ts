import {describe, expect, it} from "vitest";

import {marketFeedbackInputSchema} from "./input";

const base = {
  projectId: "10000000-0000-4000-8000-000000000001",
  sessionId: "10000000-0000-4000-8000-000000000002",
  introductionId: "10000000-0000-4000-8000-000000000003",
  sourceKind: "lender",
  verificationState: "reported",
} as const;

describe("marketFeedbackInputSchema", () => {
  it("accepts a directly reported introduction outcome", () => {
    expect(marketFeedbackInputSchema.safeParse({...base, eventType: "introduction_accepted"}).success).toBe(true);
  });

  it("requires the evidence that makes each specialized outcome useful", () => {
    expect(marketFeedbackInputSchema.safeParse({...base, eventType: "case_declined"}).success).toBe(false);
    expect(marketFeedbackInputSchema.safeParse({...base, eventType: "diligence_requested"}).success).toBe(false);
    expect(marketFeedbackInputSchema.safeParse({...base, eventType: "proposal_issued"}).success).toBe(false);
    expect(marketFeedbackInputSchema.safeParse({...base, eventType: "funded", amount: 10}).success).toBe(false);
  });

  it("accepts complete decline, diligence, and economic signals", () => {
    expect(marketFeedbackInputSchema.safeParse({...base, eventType: "case_declined", reasonCode: "pricing"}).success).toBe(true);
    expect(marketFeedbackInputSchema.safeParse({...base, eventType: "diligence_requested", requestedInformationCount: 4}).success).toBe(true);
    expect(marketFeedbackInputSchema.safeParse({...base, eventType: "funded", amount: 45_000_000, currency: "BRL"}).success).toBe(true);
  });
});
