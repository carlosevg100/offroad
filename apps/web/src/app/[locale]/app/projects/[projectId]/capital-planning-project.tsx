import {capitalPlanningMapArtifactSchema} from "@offroad/domain-contracts";
import {AlertCircle, ArrowLeft, Check, Circle, Clock3, ExternalLink, FileSearch2, GitCompareArrows, Globe2, Lightbulb, ListChecks, Route} from "lucide-react";
import Link from "next/link";
import {getTranslations} from "next-intl/server";
import {notFound} from "next/navigation";

import {DealStateRefresh} from "@/components/deal-state/deal-state-refresh";
import {requireWorkspace} from "@/lib/auth/workspace";

import {OriginationDecision} from "./origination-decision";

type Props = {locale: string; projectId: string};

export async function CapitalPlanningProject({locale, projectId}: Props) {
  const t = await getTranslations({locale, namespace: "App.capitalPlanning"});
  const {supabase, organization} = await requireWorkspace(locale);
  const {data: project} = await supabase.from("capital_projects")
    .select("id, project_name, entry_job, status")
    .eq("organization_id", organization.id).eq("id", projectId).maybeSingle();
  if (!project || project.entry_job !== "capital_planning") notFound();

  const [{data: session}, {data: plan}, {data: artifacts}, {data: decisions}] = await Promise.all([
    supabase.from("document_intake_sessions").select("id, company_profile, status")
      .eq("organization_id", organization.id).eq("capital_project_id", project.id).maybeSingle(),
    supabase.from("capital_project_plans").select("id, task_count")
      .eq("organization_id", organization.id).eq("capital_project_id", project.id).eq("status", "active").maybeSingle(),
    supabase.from("capital_project_artifacts")
      .select("id, artifact_type, status, artifact_fingerprint, content, created_at")
      .eq("organization_id", organization.id).eq("capital_project_id", project.id).order("created_at", {ascending: false}),
    supabase.from("capital_project_artifact_decisions").select("artifact_id, decision, decided_at")
      .eq("organization_id", organization.id).eq("capital_project_id", project.id).order("decided_at", {ascending: false}),
  ]);
  if (!session || !plan) notFound();

  const [{data: tasks}, {data: runs}] = await Promise.all([
    supabase.from("capital_project_plan_tasks").select("id, task_id, label, ordinal")
      .eq("organization_id", organization.id).eq("plan_id", plan.id).order("ordinal"),
    supabase.from("capital_project_task_runs").select("id, plan_task_id, attempt_no, status")
      .eq("organization_id", organization.id).eq("plan_id", plan.id).order("attempt_no", {ascending: false}),
  ]);
  const latestRunByTask = new Map<string, NonNullable<typeof runs>[number]>();
  for (const run of runs ?? []) if (!latestRunByTask.has(run.plan_task_id)) latestRunByTask.set(run.plan_task_id, run);

  const artifact = artifacts?.find((item) => item.artifact_type === "alternative_map" && item.status !== "superseded");
  const parsed = artifact ? capitalPlanningMapArtifactSchema.safeParse(artifact.content) : null;
  const decision = artifact ? decisions?.find((item) => item.artifact_id === artifact.id) : null;
  const active = session.status === "processing" || (runs ?? []).some((run) => run.status === "running") || (!artifact && session.status !== "failed");
  const profile = session.company_profile && typeof session.company_profile === "object" && !Array.isArray(session.company_profile) ? session.company_profile : {};
  const companyName = typeof profile.name === "string" ? profile.name : t("project.unknownCompany");
  const completedTasks = (tasks ?? []).filter((task) => latestRunByTask.get(task.id)?.status === "succeeded").length;

  return (
    <main className="app-canvas origination-project capital-planning-project">
      <DealStateRefresh active={active} />
      <Link className="text-link origination-back" href={`/${locale}/app`}><ArrowLeft aria-hidden="true" size={14} />{t("back")}</Link>
      <header className="origination-project__header">
        <div><p className="section-kicker">{t("project.kicker")}</p><h1>{project.project_name}</h1><p>{t("project.subtitle", {company: companyName})}</p></div>
        <div className="origination-project__access"><Globe2 aria-hidden="true" size={15} /><span><strong>{t("project.publicOnly")}</strong>{t("project.publicOnlyBody")}</span></div>
      </header>

      <div className="origination-project__layout">
        <section className="origination-project__work">
          {!artifact ? (
            <div className="origination-working">
              <Route aria-hidden="true" size={23} /><p className="section-kicker">{t("project.workingKicker")}</p>
              <h2>{session.status === "failed" ? t("project.failedTitle") : t("project.workingTitle")}</h2>
              <p>{session.status === "failed" ? t("project.failedBody") : t("project.workingBody")}</p>
              <div><span style={{width: `${Math.round((completedTasks / Math.max(tasks?.length ?? 1, 1)) * 100)}%`}} /></div>
              <small>{t("project.taskProgress", {complete: completedTasks, total: tasks?.length ?? plan.task_count})}</small>
            </div>
          ) : parsed?.success ? (
            <article className="origination-brief capital-planning-map">
              <header><div><p className="section-kicker">{t("map.kicker")}</p><h2>{t("map.title")}</h2><p>{t("map.asOf", {date: parsed.data.asOfDate})}</p></div><span className={`origination-status origination-status--${artifact.status}`}><Check aria-hidden="true" size={12} />{t(`artifactStatus.${artifact.status}`)}</span></header>

              <section className="origination-brief__executive"><span>{t("map.executiveRead")}</span><p>{parsed.data.executiveRead}</p></section>
              <section className="origination-brief__section">
                <header><Route aria-hidden="true" size={16} /><div><span>{t("map.understoodNeed")}</span><p>{t("map.understoodNeedBody")}</p></div></header>
                <div className="capital-planning-need"><p>{parsed.data.understoodNeed.objective}</p><div><section><strong>{t("map.constraints")}</strong><List items={parsed.data.understoodNeed.constraints} empty={t("map.noneDeclared")} /></section><section><strong>{t("map.assumptions")}</strong><List items={parsed.data.understoodNeed.assumptionsToConfirm} /></section></div></div>
              </section>

              <section className="origination-brief__section">
                <header><FileSearch2 aria-hidden="true" size={16} /><div><span>{t("map.evidence")}</span><p>{t("map.evidenceBody")}</p></div></header>
                <div className="company-debt-two-column"><section><strong>{t("map.supported")}</strong><List items={parsed.data.evidenceCoverage.supported} empty={t("map.noneSupported")} /></section><section><strong>{t("map.notSupported")}</strong><List items={parsed.data.evidenceCoverage.notYetSupported} /></section></div>
              </section>

              <section className="origination-brief__section">
                <header><Lightbulb aria-hidden="true" size={16} /><div><span>{t("map.alternatives")}</span><p>{t("map.alternativesBody")}</p></div></header>
                <div className="capital-planning-alternatives">{parsed.data.alternatives.map((alternative) => <article key={alternative.id}>
                  <header><div><small>{t(`families.${alternative.family}`)}</small><h3>{alternative.title}</h3></div><span>{t(`alternativeStatus.${alternative.status}`)}</span></header>
                  <p>{alternative.fitRationale}</p>
                  <div className="capital-planning-alternative-grid">
                    <section><strong>{t("map.advantages")}</strong><List items={alternative.advantages} /></section>
                    <section><strong>{t("map.tradeoffs")}</strong><List items={alternative.tradeoffs} /></section>
                    <section><strong>{t("map.prerequisites")}</strong><List items={alternative.prerequisites} /></section>
                    <section><strong>{t("map.disconfirmers")}</strong><List items={alternative.disconfirmers} /></section>
                  </div>
                  <SourceLinks label={t("map.sources")} urls={alternative.sourceUrls} />
                </article>)}</div>
              </section>

              <section className="origination-brief__section">
                <header><GitCompareArrows aria-hidden="true" size={16} /><div><span>{t("map.comparison")}</span><p>{t("map.comparisonBody")}</p></div></header>
                <div className="capital-planning-comparison">{parsed.data.comparison.map((dimension) => <section key={dimension.dimension}><strong>{dimension.dimension}</strong><div>{dimension.observations.map((observation) => <p key={`${dimension.dimension}-${observation.alternativeId}`}><span>{parsed.data.alternatives.find((item) => item.id === observation.alternativeId)?.title ?? observation.alternativeId}</span>{observation.assessment}</p>)}</div></section>)}</div>
              </section>

              <section className={`capital-planning-recommendation is-${parsed.data.directionalRecommendation.status}`}>
                <ListChecks aria-hidden="true" size={18} /><div><span>{t("map.recommendation")}</span><strong>{parsed.data.directionalRecommendation.alternativeId ? parsed.data.alternatives.find((item) => item.id === parsed.data.directionalRecommendation.alternativeId)?.title : t("map.notReady")}</strong><p>{parsed.data.directionalRecommendation.rationale}</p><List items={parsed.data.directionalRecommendation.conditionsBeforeConfirmation} /></div>
              </section>

              <section className="origination-brief__section">
                <header><FileSearch2 aria-hidden="true" size={16} /><div><span>{t("map.requests")}</span><p>{t("map.requestsBody")}</p></div></header>
                <ol className="origination-questions">{parsed.data.informationRequests.map((request, index) => <li key={`${request.request}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{request.request}</strong><p><em>{t("map.why")}</em>{request.whyItMatters}</p><p><em>{t("map.changes")}</em>{request.decisionImpact}</p><p><em>{t("map.acceptableEvidence")}</em>{request.acceptableEvidence.join(" · ")}</p></div></li>)}</ol>
              </section>
              <section className="origination-brief__section">
                <header><Circle aria-hidden="true" size={16} /><div><span>{t("map.questions")}</span><p>{t("map.questionsBody")}</p></div></header>
                <ol className="origination-questions">{parsed.data.questions.map((question, index) => <li key={`${question.question}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{question.question}</strong><p><em>{t("map.why")}</em>{question.whyItMatters}</p><p><em>{t("map.changes")}</em>{question.answerChanges}</p></div></li>)}</ol>
              </section>
              <div className="origination-brief__closing"><section><span>{t("map.unknowns")}</span><List items={parsed.data.unknowns} /></section><section><span>{t("map.nextGate")}</span><p>{t("map.nextGateBody")}</p></section></div>
              <section className="origination-sources"><span>{t("map.sourceList")}</span><ul>{parsed.data.sources.map((source) => <li key={`${source.topic}-${source.url}`}><small>{t(`sourceTopics.${source.topic}`)}</small><a href={source.url} rel="noreferrer" target="_blank">{source.title}<ExternalLink aria-hidden="true" size={11} /></a></li>)}</ul></section>
              <p className="origination-brief__boundary"><AlertCircle aria-hidden="true" size={14} />{parsed.data.scopeBoundary}</p>

              {artifact.status === "pending_confirmation" ? <OriginationDecision artifactId={artifact.id} copy={{confirm: t("decision.confirm"), confirmed: t("decision.confirmed"), errorInvalid: t("decision.errors.invalid"), errorSave: t("decision.errors.save"), errorStale: t("decision.errors.stale"), note: t("decision.note"), notePlaceholder: t("decision.notePlaceholder"), requestChanges: t("decision.requestChanges"), requested: t("decision.requested"), title: t("decision.title")}} fingerprint={artifact.artifact_fingerprint} locale={locale} projectId={project.id} /> : decision ? <p className="origination-decision__record"><Check aria-hidden="true" size={14} />{decision.decision === "confirm" ? t("decision.confirmed") : t("decision.requested")}</p> : null}
            </article>
          ) : <div className="origination-working"><AlertCircle aria-hidden="true" size={23} /><h2>{t("project.invalidArtifactTitle")}</h2><p>{t("project.invalidArtifactBody")}</p></div>}
        </section>

        <aside className="origination-task-panel capital-planning-task-panel"><header><span>{t("tasks.kicker")}</span><strong>{t("tasks.title")}</strong><small>{t("project.taskProgress", {complete: completedTasks, total: tasks?.length ?? plan.task_count})}</small></header><ol>{(tasks ?? []).map((task) => { const status = latestRunByTask.get(task.id)?.status ?? "waiting"; return <li className={`is-${status}`} key={task.id}>{status === "succeeded" ? <Check aria-hidden="true" size={12} /> : status === "running" ? <Clock3 aria-hidden="true" className="spin-slow" size={12} /> : status === "failed" ? <AlertCircle aria-hidden="true" size={12} /> : <Circle aria-hidden="true" size={12} />}<span><strong>{t.has(`taskLabels.${task.task_id}`) ? t(`taskLabels.${task.task_id}`) : task.label}</strong><small>{t(`taskStatus.${status}`)}</small></span></li>; })}</ol><footer>{t("tasks.footer")}</footer></aside>
      </div>
    </main>
  );
}

function List({items, empty}: {items: string[]; empty?: string}) {
  if (items.length === 0) return empty ? <p>{empty}</p> : null;
  return <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>;
}

function SourceLinks({label, urls}: {label: string; urls: string[]}) {
  if (urls.length === 0) return null;
  return <div className="origination-source-links"><span>{label}</span>{urls.map((url) => <a href={url} key={url} rel="noreferrer" target="_blank">{new URL(url).hostname}<ExternalLink aria-hidden="true" size={10} /></a>)}</div>;
}
