import {describe, expect, it} from "vitest";
import {parseProjectReviewContext, reviewMemberLabel, reviewMemberLabels} from "./project-review-context";

const projectId = "30000000-0000-4000-8000-000000000001";
const raw = {
  project_id: projectId,
  organization_id: "20000000-0000-4000-8000-000000000001",
  mode: "assigned",
  self_approval: {effective: true, project: "allowed", organization: false},
  can_manage: false,
  caller: {user_id: "10000000-0000-4000-8000-000000000002", roles: ["preparer"], can_prepare: true, can_return: false, can_approve: false},
  members: [{user_id: "10000000-0000-4000-8000-000000000002", full_name: null, email: "bruno@example.invalid", membership_role: "analyst", roles: ["preparer"]}],
};

describe("project review context projection", () => {
  it("maps the database projection without inventing permissions", () => {
    const context = parseProjectReviewContext(raw, projectId);
    expect(context).toMatchObject({mode: "assigned", canManage: false, selfApproval: {effective: true, project: "allowed"}, caller: {canPrepare: true, canApprove: false, roles: ["preparer"]}});
    expect(reviewMemberLabels(context)).toEqual({"10000000-0000-4000-8000-000000000002": "bruno@example.invalid"});
    expect(reviewMemberLabel({userId: "10000000-0000-4000-8000-000000000009", fullName: null, email: null})).toBe("10000000");
  });
  it.each([null, {}, {...raw, project_id: "30000000-0000-4000-8000-000000000002"}, {...raw, extra: true}, {...raw, caller: {...raw.caller, roles: ["owner"]}}])("fails closed for another project or an unknown shape", (value) => {
    expect(parseProjectReviewContext(value, projectId)).toBeNull();
    expect(reviewMemberLabels(null)).toEqual({});
  });
});
