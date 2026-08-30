"use server";

import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {z} from "zod";

import {routing, type AppLocale} from "@/i18n/routing";
import {requireWorkspace} from "@/lib/auth/workspace";
import {createClient} from "@/lib/supabase/server";

export type WorkspaceProjectActionState = {
  ok: boolean;
  code?: "duplicate" | "invalid" | "not_found" | "denied" | "save";
};

const initialProjectActionState: WorkspaceProjectActionState = {ok: false};

function localeFrom(formData: FormData): AppLocale {
  const rawLocale = String(formData.get("locale") ?? "");
  return routing.locales.includes(rawLocale as AppLocale) ? rawLocale as AppLocale : routing.defaultLocale;
}

function projectActionCode(error: {code?: string; message?: string} | null) {
  if (!error) return "save" as const;
  if (error.message?.includes("project_name_already_in_use")) return "duplicate" as const;
  if (error.code === "22023") return "invalid" as const;
  if (error.code === "P0002") return "not_found" as const;
  if (error.code === "42501") return "denied" as const;
  return "save" as const;
}

export async function signOut(formData: FormData) {
  const locale = localeFrom(formData);
  const supabase = await createClient();
  if (supabase) await supabase.auth.signOut();
  redirect(`/${locale}`);
}

export async function renameWorkspaceProject(
  _previousState: WorkspaceProjectActionState = initialProjectActionState,
  formData: FormData,
): Promise<WorkspaceProjectActionState> {
  void _previousState;
  const locale = localeFrom(formData);
  const parsed = z.object({
    sessionId: z.string().uuid(),
    projectName: z.string().trim().min(2).max(80),
  }).safeParse({
    sessionId: String(formData.get("session_id") ?? ""),
    projectName: String(formData.get("project_name") ?? ""),
  });
  if (!parsed.success) return {ok: false, code: "invalid"};

  const {supabase} = await requireWorkspace(locale);
  const {error} = await supabase.rpc("manage_workspace_project", {
    p_action: "rename",
    p_project_name: parsed.data.projectName,
    p_session_id: parsed.data.sessionId,
  });
  if (error) return {ok: false, code: projectActionCode(error)};

  revalidatePath(`/${locale}/app`, "layout");
  return {ok: true};
}

export async function archiveWorkspaceProject(
  _previousState: WorkspaceProjectActionState = initialProjectActionState,
  formData: FormData,
): Promise<WorkspaceProjectActionState> {
  void _previousState;
  const locale = localeFrom(formData);
  const parsed = z.string().uuid().safeParse(String(formData.get("session_id") ?? ""));
  if (!parsed.success) return {ok: false, code: "invalid"};

  const {supabase} = await requireWorkspace(locale);
  const {error} = await supabase.rpc("manage_workspace_project", {
    p_action: "archive",
    p_project_name: undefined,
    p_session_id: parsed.data,
  });
  if (error) return {ok: false, code: projectActionCode(error)};

  revalidatePath(`/${locale}/app`, "layout");
  return {ok: true};
}
