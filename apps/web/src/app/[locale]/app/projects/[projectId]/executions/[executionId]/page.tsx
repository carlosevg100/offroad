import Link from "next/link";
import {notFound} from "next/navigation";
import {getTranslations} from "next-intl/server";
import {z} from "zod";
import {requireWorkspace} from "@/lib/auth/workspace";
import {projectWorkExecution, type WorkExecutionView} from "@/lib/execution/read";
import {WorkExecutionDetail} from "@/components/advisor/work-execution-detail";
import {DealStateRefresh} from "@/components/deal-state/deal-state-refresh";
import {executionIsRunning} from "@/lib/advisor/work-activity";
import {loadWorkActivity} from "@/lib/advisor/work-activity-reader";
export const dynamic = "force-dynamic";
export default async function ExecutionPage({params}: {params: Promise<{locale: string; projectId: string; executionId: string}>}) {
  const {locale, projectId, executionId} = await params;
  if (!z.uuid().safeParse(projectId).success || !z.uuid().safeParse(executionId).success) notFound();
  const t = await getTranslations({locale, namespace: "App.workExecutions"});
  const {supabase, organization} = await requireWorkspace(locale);
  const {data: project} = await supabase.from("capital_projects").select("id,project_name").eq("organization_id", organization.id).eq("id", projectId).maybeSingle();
  if (!project) notFound();
  // What is in progress is read before the execution it produces: the page refreshes only while
  // this execution's job is queued or leased, and stops once the job ends.
  const activity = await loadWorkActivity(supabase, {organizationId: organization.id, workId: projectId, sessionId: null});
  // The v2 reader is the v1 read plus the gate receipt the request carried, if any.
  const read = await supabase.rpc("read_work_execution_v2", {p_execution_id: executionId});
  // An execution the reader cannot see is indistinguishable from one that does not exist.
  if (read.error?.code === "42501") notFound();
  let view: WorkExecutionView | null = null;
  if (!read.error) { try { view = projectWorkExecution(read.data); } catch { view = null; } }
  if (view && view.workId !== projectId) notFound();
  return <main className="work-executions"><DealStateRefresh active={executionIsRunning(activity, executionId)} /><Link href={`/${locale}/app/projects/${projectId}/executions`}>{t("detail.list")}</Link><h1>{t("detail.heading")}</h1><p>{project.project_name}</p>
    {!view ? <p role="alert">{t("errors.unavailable")}</p> : <WorkExecutionDetail locale={locale} projectId={projectId} view={view} />}
  </main>;
}
