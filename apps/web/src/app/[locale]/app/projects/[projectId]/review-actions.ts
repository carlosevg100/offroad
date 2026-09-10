"use server";

import {projectReviewRoleSchema} from "@offroad/work-plan";
import {revalidatePath} from "next/cache";
import {z} from "zod";

import {requireWorkspace} from "@/lib/auth/workspace";

export type ReviewSettingsResult = {ok: true} | {ok: false; error: "invalid" | "denied" | "not_found" | "save"};

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
