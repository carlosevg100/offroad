import Link from "next/link";
import {notFound} from "next/navigation";
import {getTranslations} from "next-intl/server";
import {z} from "zod";
import {requireWorkspace} from "@/lib/auth/workspace";
import {projectWorkExecution, type WorkExecutionView} from "@/lib/execution/read";
import {loadExecutionRevision} from "@/lib/execution/revision";
import {WorkExecutionDetail} from "@/components/advisor/work-execution-detail";
import {DealStateRefresh} from "@/components/deal-state/deal-state-refresh";
import {jobStatusRuns} from "@/lib/advisor/work-activity";
export const dynamic = "force-dynamic";
export default async function ExecutionPage({params, searchParams}: {params: Promise<{locale: string; projectId: string; executionId: string}>; searchParams: Promise<{revision?: string | string[]}>}) {
  const {locale, projectId, executionId} = await params;
  const {revision: revisionId} = await searchParams;
  if (!z.uuid().safeParse(projectId).success || !z.uuid().safeParse(executionId).success
    || (revisionId !== undefined && !z.uuid().safeParse(revisionId).success)) notFound();
  const t = await getTranslations({locale, namespace: "App.workExecutions"});
  const {supabase, organization} = await requireWorkspace(locale);
  const {data: project} = await supabase.from("capital_projects").select("id,project_name").eq("organization_id", organization.id).eq("id", projectId).maybeSingle();
  if (!project) notFound();
  // The v2 reader is the v1 read plus the gate receipt the request carried, if any. It returns the
  // status of this execution's own job: the page refreshes only while that job is queued or leased
  // and stops once it ends (the work activity cannot name an execution's job: a person reads only a
  // job's status columns). It also keeps the rule of current inputs and writes the read receipt.
  const read = await supabase.rpc("read_work_execution_v2", {p_execution_id: executionId});
  // An execution the reader cannot see is indistinguishable from one that does not exist.
  if (read.error?.code === "42501") notFound();
  let view: WorkExecutionView | null = null;
  if (!read.error) { try { view = projectWorkExecution(read.data); } catch { view = null; } }
  if (view && view.workId !== projectId) notFound();
  // The registered revision of the result is read only after the execution's reader returned the
  // result under current inputs, through the authorized reader: its head, or the exact revision a
  // conversation answer linked to. A linked revision that is not this execution's is not found.
  if (view?.result && !view.result.withheld) {
    const registered = await loadExecutionRevision(supabase, {workId: projectId, executionId, revisionId: typeof revisionId === "string" ? revisionId : null});
    if (registered.state === "mismatch") notFound();
    try { view = projectWorkExecution(read.data, registered); } catch { view = null; }
  }
  return <main className="work-executions"><DealStateRefresh active={jobStatusRuns(view?.job?.status)} /><Link href={`/${locale}/app/projects/${projectId}/executions`}>{t("detail.list")}</Link><h1>{t("detail.heading")}</h1><p>{project.project_name}</p>
    {!view ? <p role="alert">{t("errors.unavailable")}</p> : <WorkExecutionDetail locale={locale} projectId={projectId} view={view} />}
  </main>;
}
