import {describe, expect, it} from "vitest";

import {
  activeDistributionResponses,
  aggregateDistributionFeedback,
  distributionResponseSchema,
  nextStepsForResponse,
  recipientFollowUps,
  type DistributionResponse,
} from "./distribution-response";

const uuid = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;
const shareA = uuid("a1");
const shareB = uuid("b1");
const revisionOne = uuid("f1");
const revisionTwo = uuid("f2");

function response(overrides: Partial<DistributionResponse> & {id: string; shareId: string}): DistributionResponse {
  return distributionResponseSchema.parse({
    packRevisionId: revisionTwo,
    recipientOrganizationId: uuid("c1"),
    responseState: "interested",
    requestedConditions: [],
    termObjections: [],
    occurredAt: "2026-09-11T12:00:00.000Z",
    ...overrides,
  });
}

describe("distribution response contract", () => {
  it("refuses an answer that would carry content while claiming silence", () => {
    expect(() => response({
      id: uuid("1"),
      shareId: shareA,
      responseState: "no_response_yet",
      note: "we are looking at it",
    })).toThrow();
  });

  it("refuses a decline that states neither a reason nor an objection", () => {
    expect(() => response({id: uuid("2"), shareId: shareA, responseState: "declined"})).toThrow();
  });

  it("refuses an inverted pricing range and a ticket without its currency", () => {
    expect(() => response({
      id: uuid("3"), shareId: shareA, pricingBasis: "cdi_plus", pricingMin: "4.0000", pricingMax: "3.0000",
    })).toThrow();
    expect(() => response({id: uuid("4"), shareId: shareA, ticketAmount: "1000.00"})).toThrow();
  });

  it("keeps only the answers that were not corrected", () => {
    const first = response({id: uuid("5"), shareId: shareA, responseState: "needs_information", note: "send the pool detail"});
    const correction = response({
      id: uuid("6"), shareId: shareA, responseState: "interested",
      occurredAt: "2026-09-11T15:00:00.000Z", supersedesResponseId: first.id,
    });
    expect(activeDistributionResponses([first, correction]).map((entry) => entry.id)).toEqual([correction.id]);
  });
});

describe("recipient follow-up", () => {
  const shares = [
    {shareId: shareA, recipientOrganizationId: uuid("c1"), packRevisionId: revisionTwo},
    {shareId: shareB, recipientOrganizationId: uuid("c2"), packRevisionId: revisionTwo},
  ];

  it("treats a recipient without an answer as awaiting one and never as a decline", () => {
    const [first, second] = recipientFollowUps({shares, responses: [], currentPackRevisionId: revisionTwo});
    expect(first?.responseState).toBe("no_response_yet");
    expect(second?.responseState).toBe("no_response_yet");
    expect(first?.availableNextSteps).toEqual(["keep_on_hold", "schedule_conversation"]);
  });

  it("marks an answer given on a previous pack revision", () => {
    const older = response({id: uuid("7"), shareId: shareA, packRevisionId: revisionOne, responseState: "interested"});
    const [first] = recipientFollowUps({shares, responses: [older], currentPackRevisionId: revisionTwo});
    expect(first).toMatchObject({packRevisionId: revisionOne, refersToCurrentRevision: false});
  });

  it("offers work, never an outcome, for every answer", () => {
    for (const state of ["interested", "needs_information", "declined", "no_response_yet"] as const) {
      const steps = nextStepsForResponse(state);
      expect(steps.length).toBeGreaterThan(0);
      expect(steps.some((step) => /approv|fund|closing/i.test(step))).toBe(false);
    }
  });
});

describe("aggregated market feedback for the next revision", () => {
  const shares = [
    {shareId: shareA, recipientOrganizationId: uuid("c1"), packRevisionId: revisionTwo},
    {shareId: shareB, recipientOrganizationId: uuid("c2"), packRevisionId: revisionTwo},
  ];

  it("reports which terms were objected, which conditions were requested and the observed ranges", () => {
    const summary = aggregateDistributionFeedback({
      shares,
      responses: [
        response({
          id: uuid("8"), shareId: shareA, responseState: "needs_information",
          note: "pool detail by debtor", ticketAmount: "25000000.00", ticketCurrency: "BRL",
          tenorMonths: 24, pricingBasis: "cdi_plus", pricingMin: "3.5000", pricingMax: "4.7500",
          requestedConditions: [{code: "pool_detail_by_debtor"}],
          termObjections: [{code: "tenor_too_long", note: "above the mandate"}],
        }),
        response({
          id: uuid("9"), shareId: shareB, responseState: "declined", note: "outside the mandate",
          termObjections: [{code: "tenor_too_long"}, {code: "sector_outside_mandate"}],
        }),
      ],
    });

    expect(summary).toMatchObject({
      respondedCount: 2,
      awaitingCount: 0,
      needsInformationCount: 1,
      declinedCount: 1,
      interestedCount: 0,
      tenorMonths: {min: 24, max: 24, count: 1},
    });
    expect(summary.objectedTerms[0]).toMatchObject({code: "tenor_too_long", count: 2});
    expect(summary.objectedTerms[1]).toMatchObject({code: "sector_outside_mandate", count: 1});
    expect(summary.requestedConditions).toEqual([
      {code: "pool_detail_by_debtor", count: 1, shareIds: [shareA]},
    ]);
    expect(summary.ticketRanges).toEqual([{currency: "BRL", min: "25000000.00", max: "25000000.00", count: 1}]);
    expect(summary.pricingRanges).toEqual([{basis: "cdi_plus", min: "3.5000", max: "4.7500", count: 1}]);
    expect(summary.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it("counts a recipient that has not answered as awaiting and keeps the fingerprint stable", () => {
    const answered = response({id: uuid("10"), shareId: shareA, responseState: "interested"});
    const first = aggregateDistributionFeedback({shares, responses: [answered]});
    const again = aggregateDistributionFeedback({shares, responses: [answered]});
    expect(first.awaitingCount).toBe(1);
    expect(first.fingerprint).toBe(again.fingerprint);
  });

  it("uses the corrected answer and not the one it replaced", () => {
    const first = response({
      id: uuid("11"), shareId: shareA, responseState: "declined", note: "not now",
      termObjections: [{code: "timing"}],
    });
    const correction = response({
      id: uuid("12"), shareId: shareA, responseState: "interested",
      occurredAt: "2026-09-12T09:00:00.000Z", supersedesResponseId: first.id,
    });
    const summary = aggregateDistributionFeedback({shares, responses: [first, correction]});
    expect(summary.declinedCount).toBe(0);
    expect(summary.interestedCount).toBe(1);
    expect(summary.objectedTerms).toEqual([]);
  });
});
