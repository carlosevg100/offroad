import {describe, expect, it} from "vitest";

import {
  buildIntroductionOutcome,
  buildLenderFeedbackProjection,
  buildProductOutcomeMetrics,
  marketFeedbackEventSchema,
  projectProductMilestones,
  type MarketFeedbackEvent,
  type ProductMilestoneEvent,
  type QualifiedIntroductionReference,
} from "./index";

const uuid = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;
const hash = (character: string) => character.repeat(64);
const introduction: QualifiedIntroductionReference = {
  id: uuid("1"),
  caseFingerprint: hash("a"),
  fundId: uuid("2"),
  mandateFingerprint: hash("b"),
  materialFingerprint: hash("c"),
  introducedAt: "2026-08-29T10:00:00Z",
};

function event(overrides: Partial<MarketFeedbackEvent> & Pick<MarketFeedbackEvent, "id" | "eventType" | "occurredAt">): MarketFeedbackEvent {
  return marketFeedbackEventSchema.parse({
    introductionId: introduction.id,
    caseFingerprint: introduction.caseFingerprint,
    source: "lender",
    verification: "confirmed",
    ...overrides,
  });
}

describe("market feedback contract", () => {
  it("requires an explicit reason for a decline and item count for a diligence request", () => {
    expect(() => event({id: uuid("3"), eventType: "case_declined", occurredAt: "2026-08-29T11:00:00Z"})).toThrow("reason code");
    expect(() => event({id: uuid("4"), eventType: "diligence_requested", occurredAt: "2026-08-29T11:00:00Z"})).toThrow("number of requested items");
  });

  it("turns append-only signals into a lender outcome without pretending Offroad performed underwriting", () => {
    const outcome = buildIntroductionOutcome(introduction, [
      event({id: uuid("3"), eventType: "introduction_accepted", occurredAt: "2026-08-29T11:00:00Z"}),
      event({id: uuid("4"), eventType: "diligence_requested", occurredAt: "2026-08-29T12:00:00Z", requestedInformationCount: 3}),
      event({id: uuid("5"), eventType: "proposal_issued", occurredAt: "2026-08-30T12:00:00Z", amount: "45000000.00", currency: "BRL"}),
      event({id: uuid("6"), eventType: "funded", occurredAt: "2026-09-10T12:00:00Z", amount: "40000000.00", currency: "BRL"}),
    ]);
    expect(outcome).toMatchObject({status: "funded", accepted: true, advancedToLenderReview: true, additionalInformationRequests: 3, proposalIssued: true, funded: true});
    expect(outcome.fundedAmount).toEqual({amount: "40000000.00", currency: "BRL"});
  });

  it("requires a positive signal after decline to supersede the decline explicitly", () => {
    const decline = event({id: uuid("3"), eventType: "case_declined", occurredAt: "2026-08-29T11:00:00Z", reasonCode: "ticket_outside_mandate"});
    const accepted = event({id: uuid("4"), eventType: "introduction_accepted", occurredAt: "2026-08-29T11:00:00Z"});
    expect(() => buildIntroductionOutcome(introduction, [decline, accepted])).toThrow("must explicitly supersede");
    expect(buildIntroductionOutcome(introduction, [{...accepted, supersedesEventId: decline.id}, decline]).status).toBe("accepted");
  });
});

describe("lender graph and product metrics", () => {
  const accepted = buildIntroductionOutcome(introduction, [
    event({id: uuid("3"), eventType: "introduction_accepted", occurredAt: "2026-08-29T11:00:00Z"}),
    event({id: uuid("4"), eventType: "process_advanced", occurredAt: "2026-08-30T11:00:00Z"}),
    event({id: uuid("5"), eventType: "proposal_issued", occurredAt: "2026-09-01T11:00:00Z"}),
    event({id: uuid("6"), eventType: "funded", occurredAt: "2026-09-10T11:00:00Z", amount: "100.00", currency: "BRL"}),
  ]);
  const declinedIntroduction = {...introduction, id: uuid("7"), caseFingerprint: hash("d")};
  const declined = buildIntroductionOutcome(declinedIntroduction, [marketFeedbackEventSchema.parse({
    id: uuid("8"), introductionId: declinedIntroduction.id, caseFingerprint: declinedIntroduction.caseFingerprint,
    eventType: "case_declined", occurredAt: "2026-08-30T10:00:00Z", source: "lender", verification: "confirmed",
    reasonCode: "sector_outside_mandate",
  })]);

  it("keeps observed behaviour separate by fund and mandate fingerprint", () => {
    expect(buildLenderFeedbackProjection([accepted, declined])).toMatchObject([{
      fundId: introduction.fundId,
      introductions: 2,
      accepted: 1,
      declined: 1,
      proposals: 1,
      funded: 1,
      declineReasons: {sector_outside_mandate: 1},
    }]);
  });

  it("derives the exact commercial metrics from milestones and observed lender signals", () => {
    const milestones: ProductMilestoneEvent[] = [
      {id: uuid("10"), caseFingerprint: hash("a"), milestone: "case_started", occurredAt: "2026-08-29T08:00:00Z"},
      {id: uuid("11"), caseFingerprint: hash("a"), milestone: "diagnosis_ready", occurredAt: "2026-08-29T10:00:00Z"},
      {id: uuid("12"), caseFingerprint: hash("a"), milestone: "structure_recommended", occurredAt: "2026-08-29T12:00:00Z"},
      {id: uuid("13"), caseFingerprint: hash("a"), milestone: "materials_ready", occurredAt: "2026-08-30T08:00:00Z"},
    ];
    const metrics = buildProductOutcomeMetrics({milestones, outcomes: [accepted, declined]});
    expect(metrics.timeToDiagnosis).toMatchObject({observations: 1, averageMs: 2 * 60 * 60 * 1000});
    expect(metrics.matchingPrecision).toEqual({numerator: 1, denominator: 2, value: 0.5});
    expect(metrics.introductionAcceptanceRate).toEqual({numerator: 1, denominator: 2, value: 0.5});
    expect(metrics.proposalRatePerIntroduction).toEqual({numerator: 1, denominator: 2, value: 0.5});
    expect(metrics.fundedByMandate).toEqual([{mandateFingerprint: hash("b"), fundedCount: 1, fundedAmountByCurrency: {BRL: "100.00"}}]);
  });

  it("projects milestones from the canonical processing event log instead of creating parallel state", () => {
    expect(projectProductMilestones({
      processingRunId: uuid("20"),
      caseFingerprint: hash("a"),
      runStartedAt: "2026-08-29T08:00:00Z",
      stages: [
        {stage: "case:gaps", status: "succeeded", at: "2026-08-29T10:00:00Z"},
        {stage: "case:structure", status: "succeeded", at: "2026-08-29T12:00:00Z"},
        {stage: "case:language_conduct", status: "started", at: "2026-08-29T13:00:00Z"},
        {stage: "case:language_conduct", status: "succeeded", at: "2026-08-30T08:00:00Z"},
        {stage: "case:matching", status: "failed", at: "2026-08-30T09:00:00Z"},
      ],
    }).map((event) => event.milestone)).toEqual([
      "case_started",
      "diagnosis_ready",
      "structure_recommended",
      "materials_ready",
    ]);
  });
});
