import {describe, expect, it} from "vitest";
import {parseMaterialPackageReviewContext} from "./material-package-review-context";
import {materialReviewFixture} from "./material-package-review.test-support";

describe("native material human review context", () => {
  it("accepts the actual server artifact DTO including its current head", () => {
    const f = materialReviewFixture();
    const serverBasis = {...f.basis, review: {...f.basis.review, isHead: true, artifact: {...f.basis.review.artifact, headRevisionId: f.expected.revisionId}}};
    expect(parseMaterialPackageReviewContext(serverBasis, f.expected)).not.toBeNull();
  });
  it.each([null, "aa310000-0000-4000-8000-000000000099"])("rejects a missing or different authoritative head (%s)", headRevisionId => {
    const f = materialReviewFixture();
    expect(parseMaterialPackageReviewContext({...f.basis, review: {...f.basis.review, artifact: {...f.basis.review.artifact, headRevisionId}}}, f.expected)).toBeNull();
  });
  it("rejects an unknown artifact field rather than relaxing the server contract", () => {
    const f = materialReviewFixture();
    expect(parseMaterialPackageReviewContext({...f.basis, review: {...f.basis.review, artifact: {...f.basis.review.artifact, authorityOverride: true}}}, f.expected)).toBeNull();
  });
  it("accepts the exact physical package and human preparer", () => {
    const f = materialReviewFixture();
    expect(parseMaterialPackageReviewContext(f.basis, f.expected)).not.toBeNull();
  });
  it.each(["workId", "revisionId", "recipeId", "bundleFingerprint", "materialObjectId"] as const)("rejects a different %s", key => {
    const f = materialReviewFixture();
    expect(parseMaterialPackageReviewContext({...f.basis, [key]: key === "bundleFingerprint" ? "c".repeat(64) : f.u(99)}, f.expected)).toBeNull();
  });
  it("rejects a technical worker substituted for the human preparer", () => {
    const f = materialReviewFixture();
    expect(parseMaterialPackageReviewContext({...f.basis, preparedBy: f.u(99)}, f.expected)).toBeNull();
  });
  it.each([{withheld: true}, {freshness: "stale"}, {release: "released"}])("rejects withheld, stale or external release (%j)", patch => {
    const f = materialReviewFixture();
    expect(parseMaterialPackageReviewContext({...f.basis, review: {...f.basis.review, ...patch}}, f.expected)).toBeNull();
  });
  it("never promotes a nonexistent active approval from permanent metadata", () => {
    const f = materialReviewFixture();
    expect(parseMaterialPackageReviewContext({...f.basis, activeApprovalReviewIds: [f.u(99)]}, f.expected)).toBeNull();
  });
});
