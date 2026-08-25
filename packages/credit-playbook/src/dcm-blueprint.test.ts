import {describe, expect, it} from "vitest";

import {dcmStageId, offroadAdvisoryBoundary, offroadDcmBlueprint} from "./dcm-blueprint";

describe("Offroad DCM blueprint", () => {
  it("defines the complete twelve-stage journey in a stable order", () => {
    expect(offroadDcmBlueprint).toHaveLength(12);
    expect(offroadDcmBlueprint.map((stage) => stage.id)).toEqual(dcmStageId);
    expect(offroadDcmBlueprint.map((stage) => stage.order)).toEqual(Array.from({length: 12}, (_, index) => index + 1));
  });

  it("reserves underwriting and credit approval to capital providers at every stage", () => {
    for (const stage of offroadDcmBlueprint) {
      const reserved = stage.investorReservedActivities.map((activity) => activity.en).join(" ").toLowerCase();
      expect(reserved).toContain("underwriting");
      expect(reserved).toContain("credit approval");
      expect(stage.prohibitedClaims).toContain("Offroad approved the credit");
      expect(stage.prohibitedClaims).toContain("funding is guaranteed");
    }
  });

  it("ends at an authorized qualified introduction, not funding or closing", () => {
    const last = offroadDcmBlueprint.at(-1)!;
    expect(last.id).toBe("client_authorization_qualified_introduction");
    expect(last.outputs.map((entry) => entry.en).join(" ").toLowerCase()).toContain("qualified introduction");
    expect(last.investorReservedActivities.map((entry) => entry.en).join(" ").toLowerCase()).toContain("funding");
  });

  it("states the advisory boundary in plain terms", () => {
    expect(offroadAdvisoryBoundary.does.map((entry) => entry.en).join(" ").toLowerCase()).toContain("indicative structuring");
    expect(offroadAdvisoryBoundary.doesNot.map((entry) => entry.en).join(" ").toLowerCase()).toContain("binding credit opinion");
  });
});

