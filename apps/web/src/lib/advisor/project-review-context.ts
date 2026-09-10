import type {SupabaseClient} from "@supabase/supabase-js";
import {projectReviewRoleSchema, type ProjectReviewRole} from "@offroad/work-plan";
import {z} from "zod";

import type {Database} from "@/types/database";

const memberSchema = z.object({
  user_id: z.uuid(),
  full_name: z.string().nullable(),
  email: z.string().nullable(),
  membership_role: z.string().min(1),
  roles: z.array(projectReviewRoleSchema),
}).strict();

const contextSchema = z.object({
  project_id: z.uuid(),
  organization_id: z.uuid(),
  mode: z.enum(["open", "assigned"]),
  self_approval: z.object({
    effective: z.boolean(),
    project: z.enum(["inherit", "allowed", "forbidden"]),
    organization: z.boolean(),
  }).strict(),
  can_manage: z.boolean(),
  caller: z.object({
    user_id: z.uuid(),
    roles: z.array(projectReviewRoleSchema),
    can_prepare: z.boolean(),
    can_return: z.boolean(),
    can_approve: z.boolean(),
  }).strict(),
  members: z.array(memberSchema).max(500),
}).strict();

export type ProjectReviewMember = {
  userId: string;
  fullName: string | null;
  email: string | null;
  membershipRole: string;
  roles: ProjectReviewRole[];
};

export type ProjectReviewContext = {
  projectId: string;
  organizationId: string;
  mode: "open" | "assigned";
  selfApproval: {effective: boolean; project: "inherit" | "allowed" | "forbidden"; organization: boolean};
  canManage: boolean;
  caller: {userId: string; roles: ProjectReviewRole[]; canPrepare: boolean; canReturn: boolean; canApprove: boolean};
  members: ProjectReviewMember[];
};

/** A projection that fails to parse grants nothing: the commands remain the authority. */
export function parseProjectReviewContext(raw: unknown, projectId: string): ProjectReviewContext | null {
  const parsed = contextSchema.safeParse(raw);
  if (!parsed.success || parsed.data.project_id !== projectId) return null;
  const value = parsed.data;
  return {
    projectId: value.project_id,
    organizationId: value.organization_id,
    mode: value.mode,
    selfApproval: value.self_approval,
    canManage: value.can_manage,
    caller: {
      userId: value.caller.user_id,
      roles: value.caller.roles,
      canPrepare: value.caller.can_prepare,
      canReturn: value.caller.can_return,
      canApprove: value.caller.can_approve,
    },
    members: value.members.map((member) => ({
      userId: member.user_id,
      fullName: member.full_name,
      email: member.email,
      membershipRole: member.membership_role,
      roles: member.roles,
    })),
  };
}

export async function loadProjectReviewContext(client: SupabaseClient<Database>, projectId: string): Promise<ProjectReviewContext | null> {
  const {data, error} = await client.rpc("read_capital_project_review_context_v1", {p_project_id: projectId});
  return error ? null : parseProjectReviewContext(data, projectId);
}

export function reviewMemberLabel(member: Pick<ProjectReviewMember, "fullName" | "email" | "userId">): string {
  return member.fullName?.trim() || member.email?.trim() || member.userId.slice(0, 8);
}

export function reviewMemberLabels(context: ProjectReviewContext | null): Record<string, string> {
  return Object.fromEntries((context?.members ?? []).map((member) => [member.userId, reviewMemberLabel(member)]));
}
