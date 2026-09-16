"use server";
import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {z} from "zod";
import {requireWorkspace} from "@/lib/auth/workspace";
const input = z.discriminatedUnion("command", [
  z.object({command:z.literal("invite"), email:z.email().max(254), role:z.enum(["admin","member","analyst","relationship_manager","compliance"])}),
  z.object({command:z.literal("member"), user:z.uuid(), role:z.enum(["admin","member","analyst","relationship_manager","compliance"]), status:z.enum(["active","suspended"])}),
  z.object({command:z.literal("grant"), user:z.uuid(), resource:z.uuid(), action:z.enum(["read","work","manage"])}),
  z.object({command:z.literal("revoke"), user:z.uuid(), resource:z.uuid()}),
]);
export async function manageAccess(locale: string, form: FormData) {
  const validLocale = z.enum(["pt-BR","en-US"]).parse(locale);
  const {supabase, organization} = await requireWorkspace(validLocale);
  const parsed = input.safeParse(Object.fromEntries(form));
  const base = `/${validLocale}/app/access?workspace=${organization.id}`;
  if (!parsed.success) redirect(`${base}&result=invalid`);
  const v = parsed.data;
  const response = v.command === "invite"
    ? await supabase.rpc("invite_workspace_member_v1", {p_email:v.email,p_role:v.role})
    : v.command === "member"
      ? await supabase.rpc("set_workspace_member_v1", {p_user_id:v.user,p_role:v.role,p_status:v.status})
      : v.command === "grant"
        ? await supabase.rpc("grant_resource_access_v1", {p_resource_id:v.resource,p_subject_user_id:v.user,p_action:v.action})
        : await supabase.rpc("revoke_resource_access_v1", {p_resource_id:v.resource,p_subject_user_id:v.user});
  if (!response.error) revalidatePath(`/${validLocale}/app/access`);
  redirect(`${base}&result=${response.error ? "denied" : "saved"}`);
}
