import {describe, expect, it} from "vitest";
import {projectReviewPolicyCommand, organizationReviewPolicyCommand} from "./project-review-policy-command";
import type {ProjectReviewPolicyContext} from "./project-review-policy-context";
const context: ProjectReviewPolicyContext = {projectId: "30000000-0000-4000-8000-000000000001", organizationId: "20000000-0000-4000-8000-000000000001", policyFingerprint: "a".repeat(64), organizationPolicyFingerprint: "b".repeat(64),
 assignmentRequired: {effective: true, project: "inherit", organization: true}, selfApproval: {effective: false, project: "forbidden", organization: true}, regime: "assigned", canManage: true,
 caller: {userId: "10000000-0000-4000-8000-000000000001", roles: ["approver"]}, members: [], membersTruncated: false};
describe("policy configuration events", () => {
 it.each([{selfApproval: "allowed"}, {assignmentRequired: "not_required"}] as const)("preserves the other project axis with its exact CAS token", change => {
  expect(projectReviewPolicyCommand(context, "pt-BR", change)).toEqual({locale: "pt-BR", projectId: context.projectId, expectedPolicyFingerprint: context.policyFingerprint, selfApproval: "forbidden", assignmentRequired: "inherit", ...change});
 });
 it.each([{selfApprovalAllowed: false}, {assignmentRequired: false}] as const)("preserves the other organization axis with its distinct CAS token", change => {
  expect(organizationReviewPolicyCommand(context, "en-US", change)).toEqual({locale: "en-US", projectId: context.projectId, expectedPolicyFingerprint: context.organizationPolicyFingerprint, selfApprovalAllowed: true, assignmentRequired: true, ...change});
 });
 it("keeps an inherited project setting unchanged when changing the organization", () => {
  organizationReviewPolicyCommand(context, "pt-BR", {assignmentRequired: false});
  expect(context.assignmentRequired.project).toBe("inherit"); expect(context.assignmentRequired.organization).toBe(true);
 });
});
