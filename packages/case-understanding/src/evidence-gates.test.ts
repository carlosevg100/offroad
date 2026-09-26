import {describe, expect, it} from "vitest";

import {auditClaims, materialClaimWithoutSupport, materialJudgmentWithoutApproval} from "./audit";

/**
 * The two evidence gates the retired evidence-compiler package duplicated, now defined once here
 * and called by the brief audit and by the material truth of case-materials. The cases below are
 * the ones that package tested, kept with the same codes.
 */
describe("the shared evidence gates", () => {
  it("block a material claim without support and let a non-material one through", () => {
    expect(materialClaimWithoutSupport({material: true, supportIds: []})).toBe(true);
    expect(materialClaimWithoutSupport({material: true, supportIds: ["historical_financials.2025.revenue"]})).toBe(false);
    expect(materialClaimWithoutSupport({material: false, supportIds: []})).toBe(false);
  });

  it("block a material judgment until it is approved, and only a judgment", () => {
    expect(materialJudgmentWithoutApproval({material: true, kind: "judgment"})).toBe(true);
    expect(materialJudgmentWithoutApproval({material: true, kind: "judgment", approved: false})).toBe(true);
    expect(materialJudgmentWithoutApproval({material: true, kind: "judgment", approved: true})).toBe(false);
    expect(materialJudgmentWithoutApproval({material: false, kind: "judgment"})).toBe(false);
    expect(materialJudgmentWithoutApproval({material: true, kind: "fact"})).toBe(false);
  });

  it("report the same codes and coverage the orphan package reported", () => {
    const facts = [{
      key: {fieldPath: "historical_financials.2025.revenue", periodEnd: "2025-12-31"}, value: "191200000", valueType: "number" as const,
      accepted: {fieldPath: "historical_financials.2025.revenue", normalizedValue: "191200000", valueType: "number" as const, sourceDocument: "df.pdf",
        evidenceRank: 1, informationClass: "audited" as const, confidence: 0.99, anchorVerified: true, periodEnd: "2025-12-31"},
      conflicts: [], disputed: false,
    }];
    const unsupported = auditClaims({claims: [{id: "c1", text: "Revenue grew", material: true, kind: "fact", supportIds: []}], facts, calculations: []});
    expect(unsupported).toMatchObject({status: "blocked", coverage: 0, accepted: []});
    expect(unsupported.findings).toEqual([{claimId: "c1", reason: "material_claim_without_support", detail: "nenhum id de suporte"}]);

    const judgment = {id: "j1", text: "A receita sustenta a operação.", material: true, kind: "judgment" as const, supportIds: ["historical_financials.2025.revenue"]};
    const unapproved = auditClaims({claims: [judgment], facts, calculations: []});
    expect(unapproved.findings.map((finding) => finding.reason)).toEqual(["material_judgment_without_approval"]);
    expect(auditClaims({claims: [{...judgment, approved: true}], facts, calculations: []})).toMatchObject({status: "pass", coverage: 1, accepted: ["j1"]});
    // Claim registries enforce approval separately and can run the numerical pass alone.
    expect(auditClaims({claims: [judgment], facts, calculations: [], requireJudgmentApproval: false}).status).toBe("pass");
  });
});
