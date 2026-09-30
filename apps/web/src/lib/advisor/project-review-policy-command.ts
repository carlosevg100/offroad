import type {ProjectReviewPolicyContext} from "./project-review-policy-context";

type Locale = "pt-BR" | "en-US";
type ProjectChange = {selfApproval: ProjectReviewPolicyContext["selfApproval"]["project"]} | {assignmentRequired: ProjectReviewPolicyContext["assignmentRequired"]["project"]};
type OrganizationChange = {selfApprovalAllowed: boolean} | {assignmentRequired: boolean};

/** Each event preserves the other axis and uses the CAS token for its actual scope. */
export function projectReviewPolicyCommand(context: ProjectReviewPolicyContext, locale: Locale, change: ProjectChange) {
  return {locale, projectId: context.projectId, expectedPolicyFingerprint: context.policyFingerprint,
    selfApproval: context.selfApproval.project, assignmentRequired: context.assignmentRequired.project, ...change};
}
export function organizationReviewPolicyCommand(context: ProjectReviewPolicyContext, locale: Locale, change: OrganizationChange) {
  return {locale, projectId: context.projectId, expectedPolicyFingerprint: context.organizationPolicyFingerprint,
    selfApprovalAllowed: context.selfApproval.organization, assignmentRequired: context.assignmentRequired.organization, ...change};
}
