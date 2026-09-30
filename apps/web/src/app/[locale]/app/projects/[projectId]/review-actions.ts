"use server";

import {projectReviewRoleSchema} from "@offroad/work-plan";
import {revalidatePath} from "next/cache";
import {z} from "zod";

import {projectReviewPolicyWriteSchema, organizationReviewPolicyWriteSchema} from "@/lib/advisor/project-review-policy-context";

import {requireWorkspace} from "@/lib/auth/workspace";

export type ReviewSettingsResult = {ok: true} | {ok: false; error: "invalid" | "denied" | "not_found" | "save" | "policy_changed"};

const localeSchema = z.enum(["pt-BR", "en-US"]);
const assignmentSchema = z.object({
  locale: localeSchema,
  projectId: z.uuid(),
  userId: z.uuid(),
  role: projectReviewRoleSchema,
  assigned: z.boolean(),
}).strict();
const projectPolicySchema = z.object({
  locale: localeSchema,
  projectId: z.uuid(),
  selfApproval: z.enum(["inherit", "allowed", "forbidden"]),
}).strict();
const organizationPolicySchema = z.object({
  locale: localeSchema,
  projectId: z.uuid(),
  selfApprovalAllowed: z.boolean(),
}).strict();

function settingsError(error: {code?: string; message?: string} | null): ReviewSettingsResult {
  if (error?.code === "40001" && error.message === "policy_changed") return {ok: false, error: "policy_changed"};
  if (error?.code === "P0002") return {ok: false, error: "not_found"};
  if (error?.code === "42501") return {ok: false, error: "denied"};
  if (error?.code === "22023") return {ok: false, error: "invalid"};
  return {ok: false, error: "save"};
}

/** The database decides who may manage roles (organization owners and admins); the action only
 * derives the workspace from the session and never trusts an organization id from the form. */
export async function setProjectReviewAssignment(input: unknown): Promise<ReviewSettingsResult> {
  const parsed = assignmentSchema.safeParse(input);
  if (!parsed.success) return {ok: false, error: "invalid"};
  const {supabase} = await requireWorkspace(parsed.data.locale);
  const {error} = await supabase.rpc("set_capital_project_review_assignment_v1", {
    p_project_id: parsed.data.projectId,
    p_user_id: parsed.data.userId,
    p_review_role: parsed.data.role,
    p_assigned: parsed.data.assigned,
  });
  if (error) return settingsError(error);
  revalidatePath(`/${parsed.data.locale}/app/projects/${parsed.data.projectId}`);
  return {ok: true};
}

export async function setProjectReviewPolicy(input: unknown): Promise<ReviewSettingsResult> {
  const parsed = projectPolicySchema.safeParse(input);
  if (!parsed.success) return {ok: false, error: "invalid"};
  const {supabase} = await requireWorkspace(parsed.data.locale);
  const {error} = await supabase.rpc("set_capital_project_review_policy_v1", {
    p_project_id: parsed.data.projectId,
    p_self_approval: parsed.data.selfApproval,
  });
  if (error) return settingsError(error);
  revalidatePath(`/${parsed.data.locale}/app/projects/${parsed.data.projectId}`);
  return {ok: true};
}

export async function setOrganizationReviewPolicy(input: unknown): Promise<ReviewSettingsResult> {
  const parsed = organizationPolicySchema.safeParse(input);
  if (!parsed.success) return {ok: false, error: "invalid"};
  const {supabase, organization} = await requireWorkspace(parsed.data.locale);
  const {error} = await supabase.rpc("set_organization_review_policy_v1", {
    p_organization_id: organization.id,
    p_self_approval_allowed: parsed.data.selfApprovalAllowed,
  });
  if (error) return settingsError(error);
  revalidatePath(`/${parsed.data.locale}/app/projects/${parsed.data.projectId}`);
  return {ok: true};
}


const policyFingerprintSchema = z.string().regex(/^[a-f0-9]{64}$/);
const projectPolicyV2Schema = z.strictObject({expectedPolicyFingerprint: policyFingerprintSchema, locale: localeSchema, projectId: z.uuid(), selfApproval: z.enum(["inherit", "allowed", "forbidden"]), assignmentRequired: z.enum(["inherit", "required", "not_required"])});
const organizationPolicyV2Schema = z.strictObject({expectedPolicyFingerprint: policyFingerprintSchema, locale: localeSchema, projectId: z.uuid(), selfApprovalAllowed: z.boolean(), assignmentRequired: z.boolean()});

export async function setProjectReviewPolicyV2(input: unknown): Promise<ReviewSettingsResult> {
  const parsed = projectPolicyV2Schema.safeParse(input);
  if (!parsed.success) return {ok: false, error: "invalid"};
  const c = parsed.data;
  const {supabase, organization} = await requireWorkspace(c.locale);
  const {data, error} = await supabase.rpc("set_capital_project_review_policy_v2", {p_project_id: c.projectId, p_self_approval: c.selfApproval, p_assignment_required: c.assignmentRequired, p_expected_policy_fingerprint: c.expectedPolicyFingerprint});
  if (error) return settingsError(error);
  const result = projectReviewPolicyWriteSchema.safeParse(data);
  if (!result.success || result.data.project_id !== c.projectId || result.data.organization_id !== organization.id
    || result.data.self_approval.project !== c.selfApproval || result.data.assignment_required.project !== c.assignmentRequired) return {ok: false, error: "save"};
  revalidatePath(`/${c.locale}/app/projects/${c.projectId}`);
  return {ok: true};
}

export async function setOrganizationReviewPolicyV2(input: unknown): Promise<ReviewSettingsResult> {
  const parsed = organizationPolicyV2Schema.safeParse(input);
  if (!parsed.success) return {ok: false, error: "invalid"};
  const c = parsed.data;
  const {supabase, organization} = await requireWorkspace(c.locale);
  const {data: project, error: projectError} = await supabase.from("capital_projects").select("id").eq("id", c.projectId).eq("organization_id", organization.id).maybeSingle();
  if (projectError || !project) return {ok: false, error: "denied"};
  const {data, error} = await supabase.rpc("set_organization_review_policy_v2", {p_organization_id: organization.id, p_self_approval_allowed: c.selfApprovalAllowed, p_assignment_required: c.assignmentRequired, p_expected_policy_fingerprint: c.expectedPolicyFingerprint});
  if (error) return settingsError(error);
  const result = organizationReviewPolicyWriteSchema.safeParse(data);
  if (!result.success || result.data.organization_id !== organization.id || result.data.self_approval_allowed !== c.selfApprovalAllowed
    || result.data.assignment_required !== c.assignmentRequired) return {ok: false, error: "save"};
  revalidatePath(`/${c.locale}/app/projects/${c.projectId}`);
  return {ok: true};
}
