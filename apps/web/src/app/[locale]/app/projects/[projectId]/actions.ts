"use server";

import {revalidatePath} from "next/cache";
import {z} from "zod";

import {routing, type AppLocale} from "@/i18n/routing";
import {requireWorkspace} from "@/lib/auth/workspace";

export type OriginationDecisionState = {
  ok: boolean;
  decision?: "confirm" | "request_changes";
  code?: "invalid" | "stale" | "save";
};

function value(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

export async function decideOriginationArtifact(
  _previous: OriginationDecisionState,
  formData: FormData,
): Promise<OriginationDecisionState> {
  void _previous;
  const rawLocale = value(formData, "locale");
  const locale: AppLocale = routing.locales.includes(rawLocale as AppLocale)
    ? rawLocale as AppLocale
    : routing.defaultLocale;
  const parsed = z.object({
    projectId: z.uuid(),
    artifactId: z.uuid(),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    decision: z.enum(["confirm", "request_changes"]),
    note: z.string().trim().max(5_000),
  }).safeParse({
    projectId: value(formData, "project_id"),
    artifactId: value(formData, "artifact_id"),
    fingerprint: value(formData, "artifact_fingerprint"),
    decision: value(formData, "decision"),
    note: value(formData, "note"),
  });
  if (!parsed.success || (parsed.data.decision === "request_changes" && parsed.data.note.length < 2)) {
    return {ok: false, code: "invalid"};
  }

  const {supabase, organization} = await requireWorkspace(locale);
  const [{data: artifact}, {data: project}] = await Promise.all([
    supabase.from("capital_project_artifacts")
      .select("id, artifact_fingerprint, status")
      .eq("organization_id", organization.id)
      .eq("capital_project_id", parsed.data.projectId)
      .eq("id", parsed.data.artifactId)
      .maybeSingle(),
    supabase.from("capital_projects")
      .select("entry_job")
      .eq("organization_id", organization.id)
      .eq("id", parsed.data.projectId)
      .maybeSingle(),
  ]);
  if (!artifact || artifact.status !== "pending_confirmation" || artifact.artifact_fingerprint !== parsed.data.fingerprint) {
    return {ok: false, code: "stale"};
  }

  const revision = project?.entry_job === "company_debt_view"
    ? "request_company_debt_view_revision_v1" as const
    : project?.entry_job === "origination_thesis"
      ? "request_origination_thesis_revision_v1" as const
      : project?.entry_job === "capital_planning"
        ? "request_capital_planning_revision_v1" as const
      : null;
  if (!revision) return {ok: false, code: "stale"};

  const {error} = parsed.data.decision === "request_changes"
    ? await supabase.rpc(revision, {
        p_artifact_id: parsed.data.artifactId,
        p_artifact_fingerprint: parsed.data.fingerprint,
        p_note: parsed.data.note,
      })
    : await supabase.rpc("decide_capital_project_artifact", {
        p_artifact_id: parsed.data.artifactId,
        p_artifact_fingerprint: parsed.data.fingerprint,
        p_decision: "confirm",
        p_note: undefined,
      });
  if (error) return {ok: false, code: error.code === "55000" || error.code === "P0002" ? "stale" : "save"};

  revalidatePath(`/${locale}/app/projects/${parsed.data.projectId}`);
  revalidatePath(`/${locale}/app`, "layout");
  return {ok: true, decision: parsed.data.decision};
}
