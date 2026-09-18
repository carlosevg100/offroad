import {describe, expect, it} from "vitest";
import {workContributionInput, contributionPromotionResult} from "./work-contributions";
const id = "a4110000-0000-4000-9000-000000000001";
describe("work contribution command boundary", () => {
  it("rejects missing provenance identities and oversized content before transport", () => {
    const valid = {locale: "pt-BR", workId: id, contributionId: id, revisionId: id, expectedRevisionId: null, baseRevisionId: null, content: "Own contribution", sourceVersionIds: []};
    expect(workContributionInput.safeParse(valid).success).toBe(true);
    expect(workContributionInput.safeParse({...valid, revisionId: undefined}).success).toBe(false);
    expect(workContributionInput.safeParse({...valid, content: "x".repeat(16001)}).success).toBe(false);
    expect(workContributionInput.safeParse({...valid, sourceVersionIds: ["unversioned source"]}).success).toBe(false);
  });
  it("requires all three authorized versions for a conflict and never treats it as sharing", () => {
    const version = {revisionId: id, content: "Preserved text"};
    expect(contributionPromotionResult.parse({status: "conflict", base: version, current: version, candidate: version}).status).toBe("conflict");
    expect(contributionPromotionResult.safeParse({status: "conflict", base: version, candidate: version}).success).toBe(false);
    expect(contributionPromotionResult.safeParse({status: "shared", revisionId: id}).success).toBe(false);
  });
});
