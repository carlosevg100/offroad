import {describe, expect, it} from "vitest";

import {m0CloseoutGoldCases} from "./m0-closeout";

describe("M0 closeout gold declarations", () => {
  it("requires a focused next batch even when the company starts with one file", () => {
    expect(m0CloseoutGoldCases.find(({caseId}) => caseId === "single_document_start")?.expected).toMatchObject({
      documentAccepted: true,
      minimumComplete: false,
      maximumActiveRequests: 4,
      noGenericRoomRequest: true,
    });
  });

  it("does not equate document volume with information coverage", () => {
    expect(m0CloseoutGoldCases.find(({caseId}) => caseId === "disorganized_room_no_false_coverage")?.expected).toMatchObject({
      receivedVolumeDoesNotSatisfyRequirements: true,
      onlyClassifiedEvidenceCounts: true,
    });
  });

  it("pins client isolation and non-inheritance of introduction authority", () => {
    expect(m0CloseoutGoldCases.find(({caseId}) => caseId === "advisor_multiple_clients_isolated")?.expected).toMatchObject({
      caseScopedAuthority: true,
      crossCaseEventRejected: true,
      qualifiedIntroductionInherited: false,
    });
  });

  it("keeps suspected liquidity as a review gate, never a silent reroute", () => {
    expect(m0CloseoutGoldCases.find(({caseId}) => caseId === "capex_with_disguised_liquidity")?.expected).toMatchObject({
      outcome: "review_required",
      automaticReroute: false,
    });
  });
});
