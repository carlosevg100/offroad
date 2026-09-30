import {describe, expect, it, vi} from "vitest";
import {loadProjectReviewPolicyContext, parseProjectReviewPolicyContext, projectReviewPolicyWriteSchema} from "./project-review-policy-context";
const projectId = "30000000-0000-4000-8000-000000000001";
const raw = {schemaVersion: "project-review-context.v2", project_id: projectId, organization_id: "20000000-0000-4000-8000-000000000001", policy_fingerprint: "a".repeat(64), organization_policy_fingerprint: "b".repeat(64),
 assignment_required: {effective: true, project: "inherit", organization: true}, self_approval: {effective: false, project: "forbidden", organization: true}, regime: "assigned", can_manage: true,
 caller: {user_id: "10000000-0000-4000-8000-000000000001", roles: ["approver"]},
 members: [{user_id: "10000000-0000-4000-8000-000000000001", full_name: "Ana Lima", email: null, membership_role: "owner", roles: ["approver"]}], members_truncated: false};
describe("content review policy v2 context", () => {
 it("maps only scoped policy and roles, without generic approval authority", () => {
  const context = parseProjectReviewPolicyContext(raw, projectId, raw.organization_id)!;
  expect(context).toMatchObject({assignmentRequired: raw.assignment_required, selfApproval: raw.self_approval, regime: "assigned", membersTruncated: false});
  expect(context.caller).toEqual({userId: raw.caller.user_id, roles: ["approver"]});
  expect(context.caller).not.toHaveProperty("canApprove");
 });
 it.each([null, {}, {...raw, schemaVersion: "project-review-context.v1"}, {...raw, extra: true}, {...raw, project_id: "30000000-0000-4000-8000-000000000002"},
  {...raw, caller: {...raw.caller, can_approve: true}}, {...raw, caller: {...raw.caller, roles: ["owner"]}}, {...raw, caller: {...raw.caller, roles: ["approver", "approver"]}},
  {...raw, organization_id: "20000000-0000-4000-8000-000000000002"}, {...raw, policy_fingerprint: undefined}, {...raw, organization_policy_fingerprint: "x"}, {...raw, members_truncated: undefined}, {...raw, members: [...raw.members, ...raw.members]}, {...raw, regime: "open"}, {...raw, assignment_required: {...raw.assignment_required, effective: false}},
  {...raw, self_approval: {...raw.self_approval, effective: true}}])("fails closed for an invalid or inconsistent context", value => expect(parseProjectReviewPolicyContext(value, projectId, raw.organization_id)).toBeNull());
 it.each([[false, false, "open"], [false, true, "individual"], [true, false, "assigned"], [true, true, "assigned"]] as const)("supports required=%s and selfApproval=%s", (required, allowed, regime) => {
  const context = parseProjectReviewPolicyContext({...raw, assignment_required: {effective: required, project: "inherit", organization: required}, self_approval: {effective: allowed, project: "inherit", organization: allowed}, regime}, projectId, raw.organization_id);
  expect(context?.regime).toBe(regime);
 });
 it.each([["required", true], ["not_required", false]] as const)("uses the project override %s", (project, effective) => {
  expect(parseProjectReviewPolicyContext({...raw, assignment_required: {project, effective, organization: !effective}, regime: effective ? "assigned" : "open"}, projectId, raw.organization_id)?.assignmentRequired.effective).toBe(effective);
 });
 it("preserves explicit truncation without inventing absent members", () => expect(parseProjectReviewPolicyContext({...raw, members_truncated: true}, projectId, raw.organization_id)?.membersTruncated).toBe(true));
 it("rejects inconsistent effective values in a setter return", () => {
  expect(projectReviewPolicyWriteSchema.safeParse({schemaVersion: "project-review-policy-write.v2", project_id: projectId, organization_id: raw.organization_id, policy_fingerprint: raw.policy_fingerprint, organization_policy_fingerprint: raw.organization_policy_fingerprint,
   assignment_required: {...raw.assignment_required, effective: false}, self_approval: raw.self_approval}).success).toBe(false);
 });
});


describe("scoped v2 loader", () => {
 it("calls only the v2 projection and rejects a response belonging to another tenant", async () => {
  const rpc = vi.fn().mockResolvedValue({data: {...raw, organization_id: "20000000-0000-4000-8000-000000000002"}, error: null});
  expect(await loadProjectReviewPolicyContext({rpc} as never, projectId, raw.organization_id)).toBeNull();
  expect(rpc).toHaveBeenCalledWith("read_capital_project_review_context_v2", {p_project_id: projectId}); expect(rpc).toHaveBeenCalledTimes(1);
 });
 it("does not use v1 when the new reader returns access denied", async () => {
  const rpc = vi.fn().mockResolvedValue({data: null, error: {code: "42501"}});
  expect(await loadProjectReviewPolicyContext({rpc} as never, projectId, raw.organization_id)).toBeNull(); expect(rpc).toHaveBeenCalledTimes(1);
 });
 it("returns the valid scoped projection", async () => {
  const rpc = vi.fn().mockResolvedValue({data: raw, error: null}); expect(await loadProjectReviewPolicyContext({rpc} as never, projectId, raw.organization_id)).toMatchObject({projectId, organizationId: raw.organization_id});
 });
});
