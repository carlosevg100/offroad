import {companyDebtDiagnosticArtifactSchema} from "@offroad/domain-contracts";
import {AlertCircle, ArrowLeft, Check, Circle, Clock3, ExternalLink, FileSearch2, Gauge, Globe2, HelpCircle, Lightbulb, ShieldAlert} from "lucide-react";
import Link from "next/link";
import {getTranslations} from "next-intl/server";
import {notFound} from "next/navigation";

import {DealStateRefresh} from "@/components/deal-state/deal-state-refresh";
import {requireWorkspace} from "@/lib/auth/workspace";

import {OriginationDecision} from "./origination-decision";

type Props = {locale: string; projectId: string};

export async function CompanyDebtProject({locale, projectId}: Props) {
  const t = await getTranslations({locale, namespace: "App.companyDebt"});
  const {supabase, organization} = await requireWorkspace(locale);
  const {data: project} = await supabase.from("capital_projects")
    .select("id, project_name, entry_job, status")
    .eq("organization_id", organization.id)
    .eq("id", projectId)
    .maybeSingle();
  if (!project || project.entry_job !== "company_debt_view") notFound();

  const [{data: session}, {data: plan}, {data: artifacts}, {data: decisions}] = await Promise.all([
    supabase.from("document_intake_sessions")
      .select("id, company_profile, status")
      .eq("organization_id", organization.id)
      .eq("capital_project_id", project.id)
      .maybeSingle(),
    supabase.from("capital_project_plans")
      .select("id, task_count")
      .eq("organization_id", organization.id)
      .eq("capital_project_id", project.id)
      .eq("status", "active")
      .maybeSingle(),
    supabase.from("capital_project_artifacts")
      .select("id, artifact_type, status, artifact_fingerprint, content, created_at")
      .eq("organization_id", organization.id)
      .eq("capital_project_id", project.id)
      .order("created_at", {ascending: false}),
    supabase.from("capital_project_artifact_decisions")
      .select("artifact_id, decision, decided_at")
      .eq("organization_id", organization.id)
      .eq("capital_project_id", project.id)
      .order("decided_at", {ascending: false}),
  ]);
  if (!session || !plan) notFound();

  const [{data: tasks}, {data: runs}] = await Promise.all([
    supabase.from("capital_project_plan_tasks")
      .select("id, task_id, ordinal")
      .eq("organization_id", organization.id)
      .eq("plan_id", plan.id)
      .order("ordinal"),
    supabase.from("capital_project_task_runs")
      .select("id, plan_task_id, attempt_no, status")
      .eq("organization_id", organization.id)
      .eq("plan_id", plan.id)
      .order("attempt_no", {ascending: false}),
  ]);
  const latestRunByTask = new Map<string, NonNullable<typeof runs>[number]>();
  for (const run of runs ?? []) if (!latestRunByTask.has(run.plan_task_id)) latestRunByTask.set(run.plan_task_id, run);

  const diagnosticArtifact = artifacts?.find((artifact) => artifact.artifact_type === "company_debt_diagnostic" && artifact.status !== "superseded");
  const parsed = diagnosticArtifact ? companyDebtDiagnosticArtifactSchema.safeParse(diagnosticArtifact.content) : null;
  const decision = diagnosticArtifact ? decisions?.find((item) => item.artifact_id === diagnosticArtifact.id) : null;
  const active = session.status === "processing" || (runs ?? []).some((run) => run.status === "running") || (!diagnosticArtifact && session.status !== "failed");
  const companyProfile = session.company_profile && typeof session.company_profile === "object" && !Array.isArray(session.company_profile) ? session.company_profile : {};
  const companyName = typeof companyProfile.name === "string" ? companyProfile.name : t("project.unknownCompany");
  const completedTasks = (tasks ?? []).filter((task) => latestRunByTask.get(task.id)?.status === "succeeded").length;

  return (
    <main className="app-canvas origination-project company-debt-project">
      <DealStateRefresh active={active} />
      <Link className="text-link origination-back" href={`/${locale}/app`}><ArrowLeft aria-hidden="true" size={14} />{t("back")}</Link>
      <header className="origination-project__header">
        <div><p className="section-kicker">{t("project.kicker")}</p><h1>{project.project_name}</h1><p>{t("project.subtitle", {company: companyName})}</p></div>
        <div className="origination-project__access"><Globe2 aria-hidden="true" size={15} /><span><strong>{t("project.publicOnly")}</strong>{t("project.publicOnlyBody")}</span></div>
      </header>

      <div className="origination-project__layout">
        <section className="origination-project__work">
          {!diagnosticArtifact ? (
            <div className="origination-working">
              <FileSearch2 aria-hidden="true" size={23} /><p className="section-kicker">{t("project.workingKicker")}</p>
              <h2>{session.status === "failed" ? t("project.failedTitle") : t("project.workingTitle")}</h2>
              <p>{session.status === "failed" ? t("project.failedBody") : t("project.workingBody")}</p>
              <div><span style={{width: `${Math.round((completedTasks / Math.max(tasks?.length ?? 1, 1)) * 100)}%`}} /></div>
              <small>{t("project.taskProgress", {complete: completedTasks, total: tasks?.length ?? plan.task_count})}</small>
            </div>
          ) : parsed?.success ? (
            <article className="origination-brief company-debt-diagnostic">
              <header><div><p className="section-kicker">{t("diagnostic.kicker")}</p><h2>{t("diagnostic.title")}</h2><p>{t("diagnostic.asOf", {date: parsed.data.asOfDate})}</p></div><span className={`origination-status origination-status--${diagnosticArtifact.status}`}><Check aria-hidden="true" size={12} />{t(`artifactStatus.${diagnosticArtifact.status}`)}</span></header>

              <section className="origination-brief__executive"><span>{t("diagnostic.executiveRead")}</span><p>{parsed.data.executiveRead}</p></section>
              <section className="origination-brief__snapshot"><span>{t("diagnostic.companySnapshot")}</span><p>{parsed.data.companySnapshot}</p></section>

              <section className="origination-brief__section company-debt-coverage">
                <header><Gauge aria-hidden="true" size={16} /><div><span>{t("diagnostic.coverage")}</span><p>{t("diagnostic.coverageBody")}</p></div></header>
                <div className="company-debt-two-column"><section><strong>{t(`dataQuality.${parsed.data.evidenceCoverage.publicDataQuality}`)}</strong><ul>{parsed.data.evidenceCoverage.whatCanBeAssessed.map((item) => <li key={item}>{item}</li>)}</ul></section><section><strong>{t("diagnostic.criticalMissing")}</strong><ul>{parsed.data.evidenceCoverage.criticalMissingInputs.map((item) => <li key={item}>{item}</li>)}</ul></section></div>
              </section>

              <section className="origination-brief__section">
                <header><Lightbulb aria-hidden="true" size={16} /><div><span>{t("diagnostic.businessRisk")}</span><p>{t("diagnostic.businessRiskBody")}</p></div></header>
                <p className="company-debt-business-model">{parsed.data.businessRiskProfile.businessModel}</p>
                <div className="company-debt-two-column"><section><strong>{t("diagnostic.cashDrivers")}</strong><ul>{parsed.data.businessRiskProfile.cashFlowDrivers.map((item) => <li key={item}>{item}</li>)}</ul></section><section><strong>{t("diagnostic.sensitivities")}</strong><ul>{parsed.data.businessRiskProfile.sensitivities.map((item) => <li key={item}>{item}</li>)}</ul></section></div>
                <SourceLinks label={t("diagnostic.sources")} urls={parsed.data.businessRiskProfile.sourceUrls} />
              </section>

              <SignalSection items={parsed.data.financialSignals} label={t("diagnostic.financialSignals")} t={t} />
              <SignalSection items={parsed.data.debtAndLiquiditySignals} label={t("diagnostic.debtSignals")} t={t} />
              <SignalSection items={parsed.data.workingCapitalSignals} label={t("diagnostic.workingCapitalSignals")} t={t} />

              <section className="origination-brief__section">
                <header><ShieldAlert aria-hidden="true" size={16} /><div><span>{t("diagnostic.risks")}</span><p>{t("diagnostic.risksBody")}</p></div></header>
                <div className="origination-brief__cards">{parsed.data.risks.map((risk, index) => <article key={`${risk.risk}-${index}`}><small>{t(`confidence.${risk.confidence}`)}</small><strong>{risk.risk}</strong><p>{risk.evidence}</p><p><em>{t("diagnostic.debtRelevance")}</em>{risk.debtRelevance}</p><ul>{risk.mitigantsToTest.map((item) => <li key={item}>{item}</li>)}</ul><SourceLinks label={t("diagnostic.sources")} urls={risk.sourceUrls} /></article>)}</div>
              </section>

              <section className="company-debt-capacity">
                <Gauge aria-hidden="true" size={18} /><div><span>{t("diagnostic.capacity")}</span><strong>{t(`capacityStatus.${parsed.data.capacityAssessment.status}`)}</strong><p>{parsed.data.capacityAssessment.conclusion}</p><small>{t("diagnostic.capacityBoundary")}</small></div>
              </section>

              <section className="origination-brief__section">
                <header><Lightbulb aria-hidden="true" size={16} /><div><span>{t("diagnostic.hypotheses")}</span><p>{t("diagnostic.hypothesesBody")}</p></div></header>
                <div className="origination-angles">{parsed.data.diagnosticHypotheses.map((hypothesis, index) => <article key={`${hypothesis.title}-${index}`}><span>{t("diagnostic.hypothesis")}</span><h3>{hypothesis.title}</h3><p>{hypothesis.thesis}</p><div><section><strong>{t("diagnostic.support")}</strong><ul>{hypothesis.support.map((item) => <li key={item}>{item}</li>)}</ul></section><section><strong>{t("diagnostic.disconfirmers")}</strong><ul>{hypothesis.disconfirmers.map((item) => <li key={item}>{item}</li>)}</ul></section></div><SourceLinks label={t("diagnostic.sources")} urls={hypothesis.sourceUrls} /></article>)}</div>
              </section>

              <section className="origination-brief__section company-debt-requests">
                <header><FileSearch2 aria-hidden="true" size={16} /><div><span>{t("diagnostic.requests")}</span><p>{t("diagnostic.requestsBody")}</p></div></header>
                <ol className="origination-questions">{parsed.data.informationRequests.map((request, index) => <li key={`${request.request}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{request.request}</strong><p><em>{t("diagnostic.why")}</em>{request.whyItMatters}</p><p><em>{t("diagnostic.changes")}</em>{request.decisionImpact}</p><p><em>{t("diagnostic.acceptableEvidence")}</em>{request.acceptableEvidence.join(" · ")}</p></div></li>)}</ol>
              </section>

              <section className="origination-brief__section">
                <header><HelpCircle aria-hidden="true" size={16} /><div><span>{t("diagnostic.questions")}</span><p>{t("diagnostic.questionsBody")}</p></div></header>
                <ol className="origination-questions">{parsed.data.questions.map((question, index) => <li key={`${question.question}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{question.question}</strong><p><em>{t("diagnostic.why")}</em>{question.whyItMatters}</p><p><em>{t("diagnostic.changes")}</em>{question.answerChanges}</p></div></li>)}</ol>
              </section>

              <div className="origination-brief__closing"><section><span>{t("diagnostic.bindingUnknowns")}</span><ul>{parsed.data.capacityAssessment.bindingUnknowns.map((item) => <li key={item}>{item}</li>)}</ul></section><section><span>{t("diagnostic.unknowns")}</span><ul>{parsed.data.unknowns.map((item) => <li key={item}>{item}</li>)}</ul></section></div>
              <section className="origination-sources"><span>{t("diagnostic.sourceList")}</span><ul>{parsed.data.sources.map((source) => <li key={`${source.topic}-${source.url}`}><small>{t(`sourceTopics.${source.topic}`)}</small><a href={source.url} rel="noreferrer" target="_blank">{source.title}<ExternalLink aria-hidden="true" size={11} /></a></li>)}</ul></section>
              <p className="origination-brief__boundary"><AlertCircle aria-hidden="true" size={14} />{parsed.data.scopeBoundary}</p>

              {diagnosticArtifact.status === "pending_confirmation" ? <OriginationDecision artifactId={diagnosticArtifact.id} copy={{confirm: t("decision.confirm"), confirmed: t("decision.confirmed"), errorInvalid: t("decision.errors.invalid"), errorSave: t("decision.errors.save"), errorStale: t("decision.errors.stale"), note: t("decision.note"), notePlaceholder: t("decision.notePlaceholder"), requestChanges: t("decision.requestChanges"), requested: t("decision.requested"), title: t("decision.title")}} fingerprint={diagnosticArtifact.artifact_fingerprint} locale={locale} projectId={project.id} /> : decision ? <p className="origination-decision__record"><Check aria-hidden="true" size={14} />{decision.decision === "confirm" ? t("decision.confirmed") : t("decision.requested")}</p> : null}
            </article>
          ) : <div className="origination-working"><AlertCircle aria-hidden="true" size={23} /><h2>{t("project.invalidArtifactTitle")}</h2><p>{t("project.invalidArtifactBody")}</p></div>}
        </section>

        <aside className="origination-task-panel"><header><span>{t("tasks.kicker")}</span><strong>{t("tasks.title")}</strong><small>{t("project.taskProgress", {complete: completedTasks, total: tasks?.length ?? plan.task_count})}</small></header><ol>{(tasks ?? []).map((task) => { const status = latestRunByTask.get(task.id)?.status ?? "waiting"; return <li className={`is-${status}`} key={task.id}>{status === "succeeded" ? <Check aria-hidden="true" size={12} /> : status === "running" ? <Clock3 aria-hidden="true" className="spin-slow" size={12} /> : status === "failed" ? <AlertCircle aria-hidden="true" size={12} /> : <Circle aria-hidden="true" size={12} />}<span><strong>{t(`taskLabels.${task.task_id}`)}</strong><small>{t(`taskStatus.${status}`)}</small></span></li>; })}</ol><footer>{t("tasks.footer")}</footer></aside>
      </div>
    </main>
  );
}

type Signal = {label: string; observation: string; implication: string; sourceUrls: string[]; confidence: "high" | "medium" | "low"; claimClass: "fact" | "reference" | "hypothesis"};

function SignalSection({items, label, t}: {items: Signal[]; label: string; t: Awaited<ReturnType<typeof getTranslations>>}) {
  if (items.length === 0) return null;
  return <section className="origination-brief__section"><header><FileSearch2 aria-hidden="true" size={16} /><div><span>{label}</span></div></header><div className="origination-brief__cards">{items.map((signal, index) => <article key={`${signal.label}-${index}`}><small>{t(`claimClass.${signal.claimClass}`)} · {t(`confidence.${signal.confidence}`)}</small><strong>{signal.label}</strong><p>{signal.observation}</p><p><em>{t("diagnostic.implication")}</em>{signal.implication}</p><SourceLinks label={t("diagnostic.sources")} urls={signal.sourceUrls} /></article>)}</div></section>;
}

function SourceLinks({label, urls}: {label: string; urls: string[]}) {
  if (urls.length === 0) return null;
  return <div className="origination-source-links"><span>{label}</span>{urls.map((url) => <a href={url} key={url} rel="noreferrer" target="_blank">{new URL(url).hostname}<ExternalLink aria-hidden="true" size={10} /></a>)}</div>;
}
