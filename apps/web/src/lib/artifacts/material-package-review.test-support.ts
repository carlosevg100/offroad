const u = (n: number) => `aa310000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export function materialReviewFixture() {
  const expected = {workId: u(1), revisionId: u(2), recipeId: u(3), bundleFingerprint: "b".repeat(64), materialObjectId: u(4)};
  const basis = {schemaVersion: "capital-material-package-review-basis.v1", ...expected, manifestFingerprint: "a".repeat(64),
    productionPlanId: u(5), preparedBy: u(6), audience: "internal", activeApprovalReviewIds: [],
    review: {revisionId: expected.revisionId, withheld: false,
      artifact: {id: u(7), workId: expected.workId, kind: "work_product", subject: "Material production package"},
      snapshot: {revision: {id: expected.revisionId, revisionNo: 1, manifestFingerprint: "a".repeat(64), audience: "internal", createdAt: "2026-10-02T12:00:00Z"}, blocks: []},
      policy: {assignmentRequired: false, selfApprovalAllowed: true, roles: []}, preparedBy: u(6),
      release: "internal", freshness: "current", reviews: []}};
  return {basis, expected, u};
}
