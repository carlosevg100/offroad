"use server";

import {revalidatePath} from "next/cache";
import {z} from "zod";
import {requireWorkspace} from "@/lib/auth/workspace";
import {advisorActionError} from "@/lib/advisor/advisor-action-error";

export type WorkContextState = {ok: boolean; error?: "invalid" | "denied" | "stale" | "save"};
const identity = z.object({locale: z.enum(["pt-BR", "en-US"]), workId: z.uuid()});
const context = identity.extend({
  revision: z.coerce.number().int().positive(), purpose: z.string().trim().min(1).max(8000),
  audience: z.string().trim().max(500), deadline: z.union([z.literal(""), z.iso.datetime({offset: true})]),
  commitment: z.enum(["exploring", "preparing", "deciding"]),
  stage: z.enum(["understand", "investigate", "analyze", "decide", "prepare", "monitor"]),
});
function failure(error: {code?: string; message: string}): WorkContextState {
  const code = advisorActionError(error);
  return {ok: false, error: code === "denied" || code === "stale" || code === "invalid" ? code : "save"};
}
export async function saveWorkContext(_previous: WorkContextState, form: FormData): Promise<WorkContextState> {
  const parsed = context.safeParse(Object.fromEntries(form));
  if (!parsed.success) return {ok: false, error: "invalid"};
  const input = parsed.data;
  const {supabase} = await requireWorkspace(input.locale);
  const {error} = await supabase.rpc("update_work_context_v1", {
    p_work_id: input.workId, p_expected_revision: input.revision,
    p_context: {purpose: input.purpose, audience: input.audience || null, deadline: input.deadline || null,
      commitment: input.commitment, stage: input.stage},
  });
  if (error) return failure(error);
  revalidatePath(`/${input.locale}/app/projects/${input.workId}`);
  return {ok: true};
}
export async function attachWorkDossier(_previous: WorkContextState, form: FormData): Promise<WorkContextState> {
  const parsed = identity.extend({dossierId: z.uuid()}).safeParse(Object.fromEntries(form));
  if (!parsed.success) return {ok: false, error: "invalid"};
  const {locale, workId, dossierId} = parsed.data;
  const {supabase} = await requireWorkspace(locale);
  const {error} = await supabase.rpc("link_work_dossier_v1", {p_work_id: workId, p_dossier_id: dossierId});
  if (error) return failure(error);
  revalidatePath(`/${locale}/app/projects/${workId}`);
  return {ok: true};
}
