import {describe, expect, it} from "vitest";

import {
  receivablesEvidenceCollectionDefinitions,
  receivablesEligibilityFactIds,
} from "./index";

describe("receivables evidence catalogue", () => {
  it("covers every route fact exactly once", () => {
    const ids = receivablesEvidenceCollectionDefinitions.map((definition) => definition.factId);
    expect(ids).toHaveLength(receivablesEligibilityFactIds.length);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...receivablesEligibilityFactIds].sort());
  });

  it("defines an auditable decision standard and never permits attestation-only completion", () => {
    for (const definition of receivablesEvidenceCollectionDefinitions) {
      expect(definition.acceptedEvidence.length).toBeGreaterThan(0);
      expect(definition.clientInstruction.length).toBeGreaterThan(20);
      expect(definition.decisionStandard.length).toBeGreaterThan(20);
      expect(definition.attestationAloneCanDecide).toBe(false);
    }
  });
});
