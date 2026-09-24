import Link from "next/link";
import {notFound} from "next/navigation";
import {getTranslations} from "next-intl/server";
import {z} from "zod";
import {requireWorkspace} from "@/lib/auth/workspace";
import {loadAdoptionWorkContext, type AdoptionWorkContext} from "@/lib/advisor/adoption-basis-reader";
import {projectWorkExecutionList, type WorkExecutionListItem} from "@/lib/execution/read";
import {WorkExecutionList} from "@/components/advisor/work-execution-list";
import {WorkExecutionRequest} from "@/components/advisor/work-execution-request";
export const dynamic = "force-dynamic";
type Loaded = {context: AdoptionWorkContext; items: WorkExecutionListItem[]; nextCursor: string | null};
export default async function ExecutionsPage({params, searchParams}: {params: Promise<{locale: string; projectId: string}>; searchParams: Promise<{context?: string; version?: string; before?: string}>}) {
  const {locale, projectId} = await params;
  if (!z.uuid().safeParse(projectId).success) notFound();
  const parsed = z.object({context: z.string().trim().min(1).max(160).default("base"), version: z.uuid().optional(), before: z.uuid().optional()}).safeParse(await searchParams);
  if (!parsed.success) notFound();
  const t = await getTranslations({locale, namespace: "App.workExecutions"});
  const {supabase, organization} = await requireWorkspace(locale);
  const {data: project} = await supabase.from("capital_projects").select("id,project_name").eq("organization_id", organization.id).eq("id", projectId).maybeSingle();
  if (!project) notFound();
  const path = `/${locale}/app/projects/${projectId}`;
  const query = `context=${encodeURIComponent(parsed.data.context)}${parsed.data.version ? `&version=${parsed.data.version}` : ""}`;
  let loaded: Loaded | null = null;
  try {
    const [context, listed] = await Promise.all([
      loadAdoptionWorkContext(supabase, organization.id, projectId, parsed.data.context, parsed.data.version ?? null, null),
      supabase.rpc("list_work_executions_v1", parsed.data.before ? {p_work_id: projectId, p_before: parsed.data.before} : {p_work_id: projectId}),
    ]);
    if (!listed.error) loaded = {context, ...projectWorkExecutionList(listed.data)};
  } catch { loaded = null; }
  return <main className="work-executions"><Link href={`${path}/basis?${query}`}>{t("back")}</Link><h1>{t("title")}</h1><p>{project.project_name}</p><p>{t("intro")}</p>
    {!loaded ? <p role="alert">{t("errors.unavailable")}</p> : <>
      <WorkExecutionRequest locale={locale} projectId={projectId} versions={loaded.context.versions} selectedVersionId={loaded.context.basis?.versionId ?? null} />
      <WorkExecutionList locale={locale} projectId={projectId} items={loaded.items} nextCursor={loaded.nextCursor} query={query} />
    </>}
  </main>;
}
