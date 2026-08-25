import {describe, expect, it} from "vitest";

import {m0GovernanceGoldCases} from "./m0-governance";

describe("M0 governance gold cases", () => {
  it("keeps documentary entity detection as a suggestion until a human decision", () => {
    const scenario = m0GovernanceGoldCases.find(({caseId}) => caseId === "multi_entity_document_suggestion");
    expect(scenario?.expected).toMatchObject({
      workerAction: "suggest_only",
      initialScopeExpansion: false,
      confirmedScopeExpansion: true,
    });
  });

  it("separates documentary support from Offroad verification", () => {
    const scenario = m0GovernanceGoldCases.find(({caseId}) => caseId === "advisor_authority_documented");
    expect(scenario?.expected).toMatchObject({
      workerMaySetStatus: "documented",
      workerMaySetVerified: false,
      scopesMayExpand: false,
    });
  });

  it("treats revocation as terminal and removes every active scope", () => {
    const scenario = m0GovernanceGoldCases.find(({caseId}) => caseId === "advisor_authority_revoked");
    expect(scenario?.expected).toMatchObject({
      finalStatus: "revoked",
      activeScopes: [],
      terminal: true,
      requestGenerationPermitted: false,
    });
  });
});

