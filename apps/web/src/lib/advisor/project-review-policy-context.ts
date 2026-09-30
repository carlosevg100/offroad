import type {SupabaseClient} from "@supabase/supabase-js";
import {projectReviewRoleSchema} from "@offroad/work-plan";
import {z} from "zod";
import type {Database} from "@/types/database";
import type {ProjectReviewMember} from "@/lib/advisor/project-review-context";

const fingerprint = z.string().regex(/^[a-f0-9]{64}$/);
const roles = z.array(projectReviewRoleSchema).max(3).refine(values => new Set(values).size === values.length);
const assignment = z.strictObject({effective: z.boolean(), project: z.enum(["inherit", "required", "not_required"]), organization: z.boolean()});
const selfApproval = z.strictObject({effective: z.boolean(), project: z.enum(["inherit", "allowed", "forbidden"]), organization: z.boolean()});
const member = z.strictObject({user_id: z.uuid(), full_name: z.string().nullable(), email: z.string().nullable(), membership_role: z.string().min(1), roles});

export const projectReviewPolicyContextSchema = z.strictObject({
  schemaVersion: z.literal("project-review-context.v2"), project_id: z.uuid(), organization_id: z.uuid(), policy_fingerprint: fingerprint, organization_policy_fingerprint: fingerprint,
  assignment_required: assignment, self_approval: selfApproval, regime: z.enum(["assigned", "individual", "open"]),
  can_manage: z.boolean(), caller: z.strictObject({user_id: z.uuid(), roles}), members: z.array(member).max(500), members_truncated: z.boolean(),
}).superRefine((value, ctx) => {
  const required = value.assignment_required.project === "inherit" ? value.assignment_required.organization : value.assignment_required.project === "required";
  const allowed = value.self_approval.project === "inherit" ? value.self_approval.organization : value.self_approval.project === "allowed";
  const regime = required ? "assigned" : allowed ? "individual" : "open";
  if (value.assignment_required.effective !== required || value.self_approval.effective !== allowed || value.regime !== regime) {
    ctx.addIssue({code: "custom", message: "review_policy_inconsistent"});
  }
  if (new Set(value.members.map(m => m.user_id)).size !== value.members.length) ctx.addIssue({code: "custom", message: "review_members_duplicate"});
});

export const projectReviewPolicyWriteSchema = z.strictObject({
  schemaVersion: z.literal("project-review-policy-write.v2"), project_id: z.uuid(), organization_id: z.uuid(), policy_fingerprint: fingerprint, organization_policy_fingerprint: fingerprint,
  assignment_required: assignment, self_approval: selfApproval,
}).superRefine((value, ctx) => {
  const required = value.assignment_required.project === "inherit" ? value.assignment_required.organization : value.assignment_required.project === "required";
  const allowed = value.self_approval.project === "inherit" ? value.self_approval.organization : value.self_approval.project === "allowed";
  if (value.assignment_required.effective !== required || value.self_approval.effective !== allowed) ctx.addIssue({code: "custom", message: "review_policy_inconsistent"});
});
export const organizationReviewPolicyWriteSchema = z.strictObject({
  schemaVersion: z.literal("organization-review-policy-write.v2"), organization_id: z.uuid(), policy_fingerprint: fingerprint, self_approval_allowed: z.boolean(), assignment_required: z.boolean(),
});

export type ProjectReviewPolicyContext = {
  projectId: string; organizationId: string; policyFingerprint: string; organizationPolicyFingerprint: string;
  assignmentRequired: z.infer<typeof assignment>; selfApproval: z.infer<typeof selfApproval>;
  regime: "assigned" | "individual" | "open"; canManage: boolean;
  caller: {userId: string; roles: z.infer<typeof roles>}; members: ProjectReviewMember[]; membersTruncated: boolean;
};

/** A context failure does not fall back to legacy flags or authorize an approval. */
export function parseProjectReviewPolicyContext(raw: unknown, projectId: string, organizationId: string): ProjectReviewPolicyContext | null {
  const parsed = projectReviewPolicyContextSchema.safeParse(raw);
  if (!parsed.success || parsed.data.project_id !== projectId || parsed.data.organization_id !== organizationId) return null;
  const value = parsed.data;
  return {projectId: value.project_id, organizationId: value.organization_id, policyFingerprint: value.policy_fingerprint, organizationPolicyFingerprint: value.organization_policy_fingerprint, assignmentRequired: value.assignment_required,
    selfApproval: value.self_approval, regime: value.regime, canManage: value.can_manage,
    caller: {userId: value.caller.user_id, roles: value.caller.roles},
    members: value.members.map(m => ({userId: m.user_id, fullName: m.full_name, email: m.email, membershipRole: m.membership_role, roles: m.roles})),
    membersTruncated: value.members_truncated};
}

export async function loadProjectReviewPolicyContext(client: SupabaseClient<Database>, projectId: string, organizationId: string): Promise<ProjectReviewPolicyContext | null> {
  const {data, error} = await client.rpc("read_capital_project_review_context_v2", {p_project_id: projectId});
  return error ? null : parseProjectReviewPolicyContext(data, projectId, organizationId);
}
