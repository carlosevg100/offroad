import {originationMeetingBriefArtifactSchema} from "@offroad/domain-contracts";
import {AlertCircle, ArrowLeft, Check, Circle, Clock3, ExternalLink, Globe2, Lightbulb, SearchCheck} from "lucide-react";
import type {Metadata} from "next";
import Link from "next/link";
import {getTranslations} from "next-intl/server";
import {notFound} from "next/navigation";

import {DealStateRefresh} from "@/components/deal-state/deal-state-refresh";
import {AdvisorProject, type AdvisorProjectCopy} from "@/components/advisor/advisor-project";
import {requireWorkspace} from "@/lib/auth/workspace";

import {OriginationDecision} from "./origination-decision";
import {CompanyDebtProject} from "./company-debt-project";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {title: "Projeto", robots: {index: false, follow: false}};

type Props = {params: Promise<{locale: string; projectId: string}>; searchParams: Promise<{view?: string}>};

export default async function CapitalProjectPage({params, searchParams}: Props) {
  const {locale, projectId} = await params;
  const {view} = await searchParams;
  const t = await getTranslations({locale, namespace: "App.origination"});
  const {supabase, organization} = await requireWorkspace(locale);
  const {data: project} = await supabase.from("capital_projects")
    .select("id, project_name, entry_job, access_basis, current_phase, status, updated_at")
    .eq("organization_id", organization.id)
    .eq("id", projectId)
    .maybeSingle();
  if (!project) notFound();
  const specialized = ["company_debt_view", "origination_thesis"].includes(project.entry_job);
  if (view !== "work" || !specialized) {
    return <ConversationalCapitalProject locale={locale} project={project} />;
  }
  if (project.entry_job === "company_debt_view") {
    return <CompanyDebtProject locale={locale} projectId={projectId} />;
  }
  if (project.entry_job !== "origination_thesis") notFound();

  const [{data: session}, {data: plan}, {data: artifacts}, {data: decisions}] = await Promise.all([
    supabase.from("document_intake_sessions")
      .select("id, company_profile, status, updated_at")
      .eq("organization_id", organization.id)
      .eq("capital_project_id", project.id)
      .maybeSingle(),
    supabase.from("capital_project_plans")
      .select("id, plan_fingerprint, task_count")
      .eq("organization_id", organization.id)
      .eq("capital_project_id", project.id)
      .eq("status", "active")
      .maybeSingle(),
    supabase.from("capital_project_artifacts")
      .select("id, artifact_type, artifact_version, status, artifact_fingerprint, content, created_at")
      .eq("organization_id", organization.id)
      .eq("capital_project_id", project.id)
      .order("created_at", {ascending: false}),
    supabase.from("capital_project_artifact_decisions")
      .select("artifact_id, decision, note, decided_at")
      .eq("organization_id", organization.id)
      .eq("capital_project_id", project.id)
      .order("decided_at", {ascending: false}),
  ]);
  if (!session || !plan) notFound();

  const [{data: tasks}, {data: runs}] = await Promise.all([
    supabase.from("capital_project_plan_tasks")
      .select("id, task_id, label, ordinal, dependencies")
      .eq("organization_id", organization.id)
      .eq("plan_id", plan.id)
      .order("ordinal"),
    supabase.from("capital_project_task_runs")
      .select("id, plan_task_id, attempt_no, status, started_at, completed_at, error")
      .eq("organization_id", organization.id)
      .eq("plan_id", plan.id)
      .order("attempt_no", {ascending: false}),
  ]);
  const latestRunByTask = new Map<string, NonNullable<typeof runs>[number]>();
  for (const run of runs ?? []) if (!latestRunByTask.has(run.plan_task_id)) latestRunByTask.set(run.plan_task_id, run);
  const meetingArtifact = artifacts?.find((artifact) => artifact.artifact_type === "meeting_brief" && artifact.status !== "superseded");
  const parsedBrief = meetingArtifact ? originationMeetingBriefArtifactSchema.safeParse(meetingArtifact.content) : null;
  const decision = meetingArtifact ? decisions?.find((item) => item.artifact_id === meetingArtifact.id) : null;
  const active = session.status === "processing" || (runs ?? []).some((run) => run.status === "running") || (!meetingArtifact && session.status !== "failed");
  const companyProfile = session.company_profile && typeof session.company_profile === "object" && !Array.isArray(session.company_profile)
    ? session.company_profile
    : {};
  const companyName = typeof companyProfile.name === "string" ? companyProfile.name : t("project.unknownCompany");
  const completedTasks = (tasks ?? []).filter((task) => latestRunByTask.get(task.id)?.status === "succeeded").length;

  return (
    <main className="app-canvas origination-project">
      <DealStateRefresh active={active} />
      <Link className="text-link origination-back" href={`/${locale}/app`}><ArrowLeft aria-hidden="true" size={14} />{t("back")}</Link>
      <header className="origination-project__header">
        <div>
          <p className="section-kicker">{t("project.kicker")}</p>
          <h1>{project.project_name}</h1>
          <p>{t("project.subtitle", {company: companyName})}</p>
        </div>
        <div className="origination-project__access"><Globe2 aria-hidden="true" size={15} /><span><strong>{t("project.publicOnly")}</strong>{t("project.publicOnlyBody")}</span></div>
      </header>

      <div className="origination-project__layout">
        <section className="origination-project__work">
          {!meetingArtifact ? (
            <div className="origination-working">
              <SearchCheck aria-hidden="true" size={23} />
              <p className="section-kicker">{t("project.workingKicker")}</p>
              <h2>{session.status === "failed" ? t("project.failedTitle") : t("project.workingTitle")}</h2>
              <p>{session.status === "failed" ? t("project.failedBody") : t("project.workingBody")}</p>
              <div><span style={{width: `${Math.round((completedTasks / Math.max(tasks?.length ?? 1, 1)) * 100)}%`}} /></div>
              <small>{t("project.taskProgress", {complete: completedTasks, total: tasks?.length ?? plan.task_count})}</small>
            </div>
          ) : parsedBrief?.success ? (
            <article className="origination-brief">
              <header>
                <div><p className="section-kicker">{t("brief.kicker")}</p><h2>{t("brief.title")}</h2><p>{t("brief.asOf", {date: parsedBrief.data.asOfDate})}</p></div>
                <span className={`origination-status origination-status--${meetingArtifact.status}`}><Check aria-hidden="true" size={12} />{t(`artifactStatus.${meetingArtifact.status}`)}</span>
              </header>

              <section className="origination-brief__executive"><span>{t("brief.executiveRead")}</span><p>{parsedBrief.data.executiveRead}</p></section>
              <section className="origination-brief__snapshot"><span>{t("brief.companySnapshot")}</span><p>{parsedBrief.data.companySnapshot}</p></section>

              <section className="origination-brief__section">
                <header><Lightbulb aria-hidden="true" size={16} /><div><span>{t("brief.signals")}</span><p>{t("brief.signalsBody")}</p></div></header>
                <div className="origination-brief__cards">
                  {parsedBrief.data.debtLensSignals.map((signal, index) => <article key={`${signal.finding}-${index}`}><small>{t(`confidence.${signal.confidence}`)}</small><strong>{signal.finding}</strong><p>{signal.relevance}</p><SourceLinks label={t("brief.sources")} urls={signal.sourceUrls} /></article>)}
                </div>
              </section>

              <section className="origination-brief__section">
                <header><SearchCheck aria-hidden="true" size={16} /><div><span>{t("brief.angles")}</span><p>{t("brief.anglesBody")}</p></div></header>
                <div className="origination-angles">
                  {parsedBrief.data.financingAngles.map((angle, index) => <article key={`${angle.title}-${index}`}><span>{angle.route}</span><h3>{angle.title}</h3><p>{angle.rationale}</p><div><section><strong>{t("brief.prerequisites")}</strong><ul>{angle.prerequisites.map((item) => <li key={item}>{item}</li>)}</ul></section><section><strong>{t("brief.disconfirmers")}</strong><ul>{angle.disconfirmers.map((item) => <li key={item}>{item}</li>)}</ul></section></div><SourceLinks label={t("brief.sources")} urls={angle.sourceUrls} /></article>)}
                </div>
              </section>

              <section className="origination-brief__section">
                <header><Circle aria-hidden="true" size={16} /><div><span>{t("brief.questions")}</span><p>{t("brief.questionsBody")}</p></div></header>
                <ol className="origination-questions">{parsedBrief.data.meetingQuestions.map((question, index) => <li key={`${question.question}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{question.question}</strong><p><em>{t("brief.why")}</em>{question.whyItMatters}</p><p><em>{t("brief.changes")}</em>{question.answerChanges}</p></div></li>)}</ol>
              </section>

              <div className="origination-brief__closing">
                <section><span>{t("brief.opening")}</span><p>{parsedBrief.data.suggestedOpening}</p></section>
                <section><span>{t("brief.unknowns")}</span><ul>{parsedBrief.data.unknowns.map((unknown) => <li key={unknown}>{unknown}</li>)}</ul></section>
              </div>

              <section className="origination-sources"><span>{t("brief.sourceList")}</span><ul>{parsedBrief.data.sources.map((source) => <li key={`${source.topic}-${source.url}`}><small>{t(`sourceTopics.${source.topic}`)}</small><a href={source.url} rel="noreferrer" target="_blank">{source.title}<ExternalLink aria-hidden="true" size={11} /></a></li>)}</ul></section>
              <p className="origination-brief__boundary"><AlertCircle aria-hidden="true" size={14} />{parsedBrief.data.scopeBoundary}</p>

              {meetingArtifact.status === "pending_confirmation" ? <OriginationDecision artifactId={meetingArtifact.id} copy={{
                confirm: t("decision.confirm"), confirmed: t("decision.confirmed"), errorInvalid: t("decision.errors.invalid"), errorSave: t("decision.errors.save"), errorStale: t("decision.errors.stale"), note: t("decision.note"), notePlaceholder: t("decision.notePlaceholder"), requestChanges: t("decision.requestChanges"), requested: t("decision.requested"), title: t("decision.title"),
              }} fingerprint={meetingArtifact.artifact_fingerprint} locale={locale} projectId={project.id} /> : decision ? <p className="origination-decision__record"><Check aria-hidden="true" size={14} />{decision.decision === "confirm" ? t("decision.confirmed") : t("decision.requested")}</p> : null}
            </article>
          ) : (
            <div className="origination-working"><AlertCircle aria-hidden="true" size={23} /><h2>{t("project.invalidArtifactTitle")}</h2><p>{t("project.invalidArtifactBody")}</p></div>
          )}
        </section>

        <aside className="origination-task-panel">
          <header><span>{t("tasks.kicker")}</span><strong>{t("tasks.title")}</strong><small>{t("project.taskProgress", {complete: completedTasks, total: tasks?.length ?? plan.task_count})}</small></header>
          <ol>{(tasks ?? []).map((task) => {
            const run = latestRunByTask.get(task.id);
            const status = run?.status ?? "waiting";
            return <li className={`is-${status}`} key={task.id}>{status === "succeeded" ? <Check aria-hidden="true" size={12} /> : status === "running" ? <Clock3 aria-hidden="true" className="spin-slow" size={12} /> : status === "failed" ? <AlertCircle aria-hidden="true" size={12} /> : <Circle aria-hidden="true" size={12} />}<span><strong>{t(`taskLabels.${task.task_id}`)}</strong><small>{t(`taskStatus.${status}`)}</small></span></li>;
          })}</ol>
          <footer>{t("tasks.footer")}</footer>
        </aside>
      </div>
    </main>
  );
}

async function ConversationalCapitalProject({
  locale,
  project,
}: {
  locale: string;
  project: {
    access_basis: string;
    entry_job: string;
    id: string;
    project_name: string;
    status: string;
  };
}) {
  const t = await getTranslations({locale, namespace: "App.advisorProject"});
  const {supabase, organization} = await requireWorkspace(locale);
  const {data: session} = await supabase.from("document_intake_sessions")
    .select("id, status")
    .eq("organization_id", organization.id)
    .eq("capital_project_id", project.id)
    .order("created_at", {ascending: true})
    .limit(1)
    .maybeSingle();
  if (!session) notFound();

  const [{data: conversation}, {data: documents}, {data: plan}, {data: artifacts}] = await Promise.all([
    supabase.from("agent_conversations").select("id, state").eq("organization_id", organization.id).eq("intake_session_id", session.id).maybeSingle(),
    supabase.from("source_documents").select("id, original_name, byte_size, processing_status").eq("organization_id", organization.id).eq("intake_session_id", session.id).order("created_at"),
    supabase.from("capital_project_plans").select("id").eq("organization_id", organization.id).eq("capital_project_id", project.id).eq("status", "active").maybeSingle(),
    supabase.from("capital_project_artifacts").select("id, artifact_type, status").eq("organization_id", organization.id).eq("capital_project_id", project.id).order("created_at", {ascending: false}),
  ]);
  const [{data: messages}, {data: tasks}, {data: runs}] = await Promise.all([
    conversation
      ? supabase.from("agent_messages").select("id, role, content, status, metadata, created_at").eq("organization_id", organization.id).eq("conversation_id", conversation.id).order("created_at")
      : Promise.resolve({data: []}),
    plan
      ? supabase.from("capital_project_plan_tasks").select("id, task_id, label, ordinal").eq("organization_id", organization.id).eq("plan_id", plan.id).order("ordinal")
      : Promise.resolve({data: []}),
    plan
      ? supabase.from("capital_project_task_runs").select("plan_task_id, attempt_no, status").eq("organization_id", organization.id).eq("plan_id", plan.id).order("attempt_no", {ascending: false})
      : Promise.resolve({data: []}),
  ]);
  const latestRunByTask = new Map<string, {status: string}>();
  for (const run of runs ?? []) if (!latestRunByTask.has(run.plan_task_id)) latestRunByTask.set(run.plan_task_id, run);

  const copy: AdvisorProjectCopy = {
    advisor: t("advisor"), context: t("context"), conversation: t("conversation"), documents: t("documents"), noDocuments: t("noDocuments"), plan: t("plan"), artifacts: t("artifacts"), noArtifacts: t("noArtifacts"), openWork: t("openWork"), placeholder: t("placeholder"), attach: t("attach"), send: t("send"), close: t("close"), private: t("private"), public: t("public"), working: t("working"), ready: t("ready"),
    errors: {invalid: t("errors.invalid"), denied: t("errors.denied"), duplicate: t("errors.duplicate"), not_found: t("errors.notFound"), save: t("errors.save"), processing: t("errors.processing"), upload: t("errors.upload")},
  };
  const artifactIds = new Set((artifacts ?? []).map((artifact) => artifact.id));
  const advisorMessages = messages?.length
    ? messages.map((message) => {
        const artifactId = specializedCompletionArtifactId(message.metadata);
        return {
          id: message.id,
          role: message.role,
          content: message.content,
          status: message.status,
          createdAt: message.created_at,
          artifactHref: artifactId && artifactIds.has(artifactId)
            ? `/${locale}/app/projects/${project.id}?view=work`
            : undefined,
        };
      })
    : [{id: `project-${project.id}`, role: "assistant", content: t("existingProject"), status: "completed", createdAt: new Date().toISOString()}];

  return <AdvisorProject
    accessBasis={project.access_basis}
    artifacts={(artifacts ?? []).map((artifact) => ({id: artifact.id, type: artifact.artifact_type, status: artifact.status}))}
    copy={copy}
    documents={(documents ?? []).map((document) => ({id: document.id, name: document.original_name, size: document.byte_size, status: document.processing_status}))}
    locale={locale === "en-US" ? "en-US" : "pt-BR"}
    messages={advisorMessages}
    projectId={project.id}
    projectName={project.project_name}
    sessionStatus={session.status}
    tasks={(tasks ?? []).map((task) => ({id: task.id, label: task.label, status: latestRunByTask.get(task.id)?.status ?? "waiting"}))}
    workHref={["company_debt_view", "origination_thesis"].includes(project.entry_job) ? `/${locale}/app/projects/${project.id}?view=work` : undefined}
  />;
}

function specializedCompletionArtifactId(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = metadata as Record<string, unknown>;
  if (value.kind !== "advisor_specialized_completion") return null;
  const artifact = value.artifact;
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) return null;
  const id = (artifact as Record<string, unknown>).id;
  return typeof id === "string" ? id : null;
}

function SourceLinks({label, urls}: {label: string; urls: string[]}) {
  return <div className="origination-source-links"><span>{label}</span>{urls.map((url) => <a href={url} key={url} rel="noreferrer" target="_blank">{new URL(url).hostname}<ExternalLink aria-hidden="true" size={10} /></a>)}</div>;
}
