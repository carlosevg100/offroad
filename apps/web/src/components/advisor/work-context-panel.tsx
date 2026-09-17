import {getTranslations} from "next-intl/server";
import {requireWorkspace} from "@/lib/auth/workspace";
import {WorkContextEditor} from "./work-context-editor";

export async function WorkContextPanel({locale, workId}: {locale: string; workId: string}) {
  const {supabase, organization} = await requireWorkspace(locale);
  const t = await getTranslations({locale, namespace: "WorkContext"});
  const [context, links, dossiers] = await Promise.all([
    supabase.from("work_contexts").select("purpose, audience, deadline, commitment, stage, revision")
      .eq("organization_id", organization.id).eq("work_id", workId).maybeSingle(),
    supabase.from("work_dossiers").select("dossier_id").eq("organization_id", organization.id).eq("work_id", workId),
    supabase.from("dossiers").select("id, resource_id, profile").eq("organization_id", organization.id).order("updated_at", {ascending: false}).limit(100),
  ]);
  if ([context, links, dossiers].some(result => result.error)) throw new Error("work_context_unavailable");
  if (!context.data) return null;
  const linked = new Set((links.data ?? []).map(d => d.dossier_id));
  // The picker is bounded, but every readable existing link must remain visible.
  const missing = [...linked].filter(id => !dossiers.data?.some(d => d.id === id));
  const linkedDossiers = missing.length ? await supabase.from("dossiers").select("id, resource_id, profile")
    .eq("organization_id", organization.id).in("id", missing) : {data: [], error: null};
  if (linkedDossiers.error) throw new Error("work_context_unavailable");
  const visible = [...(dossiers.data ?? []), ...(linkedDossiers.data ?? [])];
  const resourceIds = [...new Set(visible.map(d => d.resource_id))];
  const [projects, sessions] = resourceIds.length ? await Promise.all([
    supabase.from("capital_projects").select("id, project_name").eq("organization_id", organization.id).in("id", resourceIds),
    supabase.from("document_intake_sessions").select("id, project_name").eq("organization_id", organization.id).in("id", resourceIds),
  ]) : [{data: [], error: null}, {data: [], error: null}];
  if (projects.error || sessions.error) throw new Error("work_context_unavailable");
  const names = new Map([...(projects.data ?? []), ...(sessions.data ?? [])].map(row => [row.id, row.project_name]));
  return <WorkContextEditor locale={locale} workId={workId} value={context.data} dossiers={visible.map(d => {
    const profile = d.profile && typeof d.profile === "object" && !Array.isArray(d.profile) ? d.profile : {};
    return {id: d.id, linked: linked.has(d.id), name: typeof profile.name === "string" ? profile.name : names.get(d.resource_id) || `${t("unnamed")} · ${d.id.slice(0, 8)}`};
  })} />;
}
