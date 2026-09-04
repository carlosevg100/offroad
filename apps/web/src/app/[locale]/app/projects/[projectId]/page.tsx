import {compiledSpecializationProfileSchema} from "@offroad/agent-contracts";
import {originationConversationArtifactSchema, originationMeetingBriefArtifactSchema} from "@offroad/domain-contracts";
import {localizedOffroadTaskLabel} from "@offroad/work-plan";
import {AlertCircle, ArrowLeft, Check, Circle, Clock3, ExternalLink, Globe2, Lightbulb, SearchCheck} from "lucide-react";
import type {Metadata} from "next";
import Link from "next/link";
import {getTranslations} from "next-intl/server";
import {notFound} from "next/navigation";

import {DealStateRefresh} from "@/components/deal-state/deal-state-refresh";
import {AdvisorProject, type AdvisorProjectCopy} from "@/components/advisor/advisor-project";
import type {AdvisorChangeProposal} from "@/components/advisor/advisor-change-proposal";
import {OriginationConversationWork} from "@/components/advisor/origination-conversation-work";
import {PrivateCaseWork} from "@/components/advisor/private-case-work";
import {PrivateDiagnosticWork} from "@/components/advisor/private-diagnostic-work";
import {PrivateMarketWork} from "@/components/advisor/private-market-work";
import {PrivateMaterialsWork} from "@/components/advisor/private-materials-work";
import {PrivateStructureWork} from "@/components/advisor/private-structure-work";
import {requireWorkspace} from "@/lib/auth/workspace";
import {loadGovernedMaterialPackage} from "@/lib/deal-state/materials";
import {loadDealStateWorkbench} from "@/lib/deal-state/workbench";
import {loadIntakeChecklist} from "@/lib/intake/checklist";
import {loadPreliminaryUnderstanding} from "@/lib/intake/preliminary-understanding";
import {advisorActivities} from "@/lib/advisor/activity";

import {OriginationDecision} from "./origination-decision";
import {CompanyDebtProject} from "./company-debt-project";
import {CapitalPlanningProject} from "./capital-planning-project";

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
  const specialized = ["company_debt_view", "origination_thesis", "capital_planning"].includes(project.entry_job);
  if (view !== "work" || !specialized || project.entry_job === "origination_thesis") {
    return <ConversationalCapitalProject locale={locale} project={project} />;
  }
  if (project.entry_job === "company_debt_view") {
    return <CompanyDebtProject locale={locale} projectId={projectId} />;
  }
  if (project.entry_job === "capital_planning") {
    return <CapitalPlanningProject locale={locale} projectId={projectId} />;
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
    .select("id, status, representation_status")
    .eq("organization_id", organization.id)
    .eq("capital_project_id", project.id)
    .order("created_at", {ascending: true})
    .limit(1)
    .maybeSingle();
  if (!session) notFound();

  const [{data: conversation}, {data: documents}, {data: plan}, {data: artifacts}, {data: artifactDecisions}] = await Promise.all([
    supabase.from("agent_conversations").select("id, state").eq("organization_id", organization.id).eq("intake_session_id", session.id).maybeSingle(),
    supabase.from("source_documents").select("id, original_name, byte_size, processing_status").eq("organization_id", organization.id).eq("intake_session_id", session.id).order("created_at"),
    supabase.from("capital_project_plans").select("id").eq("organization_id", organization.id).eq("capital_project_id", project.id).eq("status", "active").maybeSingle(),
    supabase.from("capital_project_artifacts").select("id, artifact_type, artifact_version, status, artifact_fingerprint, content, created_at").eq("organization_id", organization.id).eq("capital_project_id", project.id).order("created_at", {ascending: false}),
    supabase.from("capital_project_artifact_decisions").select("artifact_id, decision, decided_at").eq("organization_id", organization.id).eq("capital_project_id", project.id).order("decided_at", {ascending: false}),
  ]);
  const privateCase = ["structure_from_documents", "review_existing_operation"].includes(project.entry_job);
  const preliminary = privateCase
    ? await loadPreliminaryUnderstanding(supabase, organization.id, session.id)
    : null;
  const checklist = preliminary?.current?.row.status === "confirmed"
    ? await loadIntakeChecklist({
        supabase,
        organizationId: organization.id,
        sessionId: session.id,
        locale: locale === "en-US" ? "en" : "pt",
      })
    : null;
  const privateWorkbench = preliminary?.current?.row.status === "confirmed"
    ? await loadDealStateWorkbench(supabase, organization.id, session.id)
    : null;
  const governedMaterials = privateWorkbench?.productionPlan?.row.status === "approved"
    ? await loadGovernedMaterialPackage(supabase, organization.id, session.id)
    : null;
  const [{data: introductionPlans}, {data: introductionTargets}, {data: introductionRecipients}] = privateWorkbench?.matchScreen
    ? await Promise.all([
        supabase.from("qualified_introduction_plans")
          .select("id, organization_id, intake_session_id, case_fingerprint, material_fingerprint, match_screen_fingerprint, wave_limit, identity_policy, status, technical_review_fingerprint, technical_reviewed_by, technical_reviewed_at, authorization_snapshot, authorized_by, authorized_at, revoked_by, revoked_at, created_by, created_at, updated_at")
          .eq("organization_id", organization.id).eq("intake_session_id", session.id).order("created_at", {ascending: false}).limit(1),
        supabase.from("qualified_introduction_targets")
          .select("id, organization_id, intake_session_id, plan_id, match_screen_fingerprint, provider_id, provider_source, provider_kind, provider_name, fund_directory_id, provider_organization_id, provider_fund_id, mandate_fingerprint, rationale, position, contact_status, resolved_contact_source, resolved_contact_id, resolved_contact_name, resolved_contact_job_title, resolved_contact_email, resolved_at, resolution_note, mandate_revalidated_at, mandate_revalidated_by, mandate_revalidation_note, created_by, created_at, updated_at")
          .eq("organization_id", organization.id).eq("intake_session_id", session.id).order("position"),
        supabase.from("qualified_introduction_recipients")
          .select("id, organization_id, intake_session_id, plan_id, target_id, provider_source, provider_id, fund_directory_id, provider_organization_id, provider_fund_id, recipient_name, contact_source, contact_uuid, contact_id, contact_name, contact_email, contact_job_title, mandate_fingerprint, rationale, material_manifest, position, is_anchor, created_at")
          .eq("organization_id", organization.id).eq("intake_session_id", session.id).order("position"),
      ])
    : [{data: []}, {data: []}, {data: []}];
  const introductionPlan = introductionPlans?.[0] ?? null;
  const planTargets = introductionPlan ? (introductionTargets ?? []).filter((target) => target.plan_id === introductionPlan.id) : [];
  const planRecipients = introductionPlan ? (introductionRecipients ?? []).filter((recipient) => recipient.plan_id === introductionPlan.id) : [];
  const [{data: qualifiedIntroductions}, {data: feedbackEvents}] = introductionPlan?.status === "authorized"
    ? await Promise.all([
        supabase.from("qualified_introductions")
          .select("id, organization_id, intake_session_id, plan_id, recipient_id, provider_source, provider_id, fund_directory_id, provider_organization_id, provider_fund_id, contact_source, contact_uuid, contact_id, contact_name, contact_email, contact_job_title, case_fingerprint, material_fingerprint, mandate_fingerprint, rationale, material_manifest, authorization_snapshot, delivery_channel, delivery_reference, introduced_at, introduced_by")
          .eq("organization_id", organization.id).eq("intake_session_id", session.id).eq("plan_id", introductionPlan.id).order("introduced_at"),
        supabase.from("qualified_introduction_feedback_events")
          .select("id, organization_id, intake_session_id, qualified_introduction_id, case_fingerprint, event_type, source_kind, verification_state, reason_code, note, requested_information_count, amount, currency, supersedes_event_id, occurred_at, recorded_by, created_at, updated_at")
          .eq("organization_id", organization.id).eq("intake_session_id", session.id).order("occurred_at"),
      ])
    : [{data: []}, {data: []}];
  const [{data: messages}, {data: proposals}, {data: tasks}, {data: runs}] = await Promise.all([
    conversation
      ? supabase.from("agent_messages").select("id, role, content, status, error_code, proposal_id, metadata, created_at").eq("organization_id", organization.id).eq("conversation_id", conversation.id).order("created_at")
      : Promise.resolve({data: []}),
    supabase.from("agent_change_proposals")
      .select("id, status, title, rationale, impact_summary, proposal")
      .eq("organization_id", organization.id)
      .eq("intake_session_id", session.id)
      .order("proposed_at"),
    plan
      ? supabase.from("capital_project_plan_tasks").select("id, task_id, label, ordinal").eq("organization_id", organization.id).eq("plan_id", plan.id).order("ordinal")
      : Promise.resolve({data: []}),
    plan
      ? supabase.from("capital_project_task_runs").select("plan_task_id, attempt_no, status").eq("organization_id", organization.id).eq("plan_id", plan.id).order("attempt_no", {ascending: false})
      : Promise.resolve({data: []}),
  ]);
  const latestRunByTask = new Map<string, {status: string}>();
  for (const run of runs ?? []) if (!latestRunByTask.has(run.plan_task_id)) latestRunByTask.set(run.plan_task_id, run);

  const {data: agentPlan} = await supabase.from("capital_project_agent_plans")
    .select("id, revision, goal, status, snapshot")
    .eq("organization_id", organization.id)
    .eq("capital_project_id", project.id)
    .eq("status", "active")
    .maybeSingle();
  const [
    {data: agentWorkItems},
    {data: agentEventsDescending},
    {data: informationRequests},
    {data: requirementCoverage},
    {data: decisionRecords},
  ] = agentPlan
    ? await Promise.all([
        supabase.from("capital_project_agent_work_items")
          .select("id, title, status, created_at")
          .eq("organization_id", organization.id)
          .eq("agent_plan_id", agentPlan.id)
          .neq("status", "superseded")
          .order("created_at"),
        supabase.from("capital_project_agent_events")
          .select("id, event_type, summary_pt, summary_en, detail, created_at")
          .eq("organization_id", organization.id)
          .eq("capital_project_id", project.id)
          .eq("agent_plan_id", agentPlan.id)
          .order("created_at", {ascending: false})
          .limit(40),
        supabase.from("capital_project_information_requests")
          .select("id, question, why_it_matters, decision_impact, priority, information_gain, materiality, created_at")
          .eq("organization_id", organization.id)
          .eq("capital_project_id", project.id)
          .eq("status", "open")
          .neq("priority", "later")
          .order("information_gain", {ascending: false})
          .order("created_at")
          .limit(3),
        supabase.from("capital_project_requirement_coverage")
          .select("id, requirement_key, status, materiality")
          .eq("organization_id", organization.id)
          .eq("capital_project_id", project.id),
        supabase.from("capital_project_decisions")
          .select("id, question, recommendation, status, created_at")
          .eq("organization_id", organization.id)
          .eq("capital_project_id", project.id)
          .neq("status", "superseded")
          .order("created_at", {ascending: false})
          .limit(5),
      ])
    : [{data: []}, {data: []}, {data: []}, {data: []}, {data: []}];

  const copy: AdvisorProjectCopy = {
    advisor: t("advisor"), context: t("context"), conversation: t("conversation"), documents: t("documents"), noDocuments: t("noDocuments"), plan: t("plan"), activity: t("activity"), evidence: t("evidence"), decisions: t("decisions"), verified: t("verified"), notExamined: t("notExamined"), openIssues: t("openIssues"), artifacts: t("artifacts"), contextQuestion: t("contextQuestion"), awaitingAnswer: t("awaitingAnswer"), noArtifacts: t("noArtifacts"), openWork: t("openWork"), placeholder: t("placeholder"), attach: t("attach"), send: t("send"), close: t("close"), private: t("private"), public: t("public"), working: t("working"), ready: t("ready"), needsAttention: t("needsAttention"), messageFailed: t("messageFailed"),
    errors: {invalid: t("errors.invalid"), denied: t("errors.denied"), duplicate: t("errors.duplicate"), not_found: t("errors.notFound"), save: t("errors.save"), processing: t("errors.processing"), upload: t("errors.upload")},
    proposal: {
      preview: t("proposal.preview"), impact: t("proposal.impact"), accept: t("proposal.accept"), reject: t("proposal.reject"), applying: t("proposal.applying"), rejecting: t("proposal.rejecting"), applied: t("proposal.applied"), rejected: t("proposal.rejected"), stale: t("proposal.stale"), monthValue: t("proposal.monthValue"),
      errors: {invalid: t("proposal.errors.invalid"), stale: t("proposal.errors.stale"), save: t("proposal.errors.save"), processing: t("proposal.errors.processing")},
      fields: {
        objective: t("proposal.fields.objective"), requestedAmount: t("proposal.fields.requestedAmount"), currency: t("proposal.fields.currency"), urgency: t("proposal.fields.urgency"), requestedTermMonths: t("proposal.fields.requestedTermMonths"), requestedGraceMonths: t("proposal.fields.requestedGraceMonths"), consequenceIfNotExecuted: t("proposal.fields.consequenceIfNotExecuted"), sector: t("proposal.fields.sector"), geography: t("proposal.fields.geography"), instruments: t("proposal.fields.instruments"), collateralKinds: t("proposal.fields.collateralKinds"), expectedRate: t("proposal.fields.expectedRate"),
      },
    },
  };
  const artifactIds = new Set((artifacts ?? []).map((artifact) => artifact.id));
  const originationArtifact = project.entry_job === "origination_thesis"
    ? (artifacts ?? []).find((artifact) => artifact.artifact_type === "meeting_brief" && artifact.status !== "superseded")
    : undefined;
  const parsedOrigination = originationArtifact
    ? originationConversationArtifactSchema.safeParse(originationArtifact.content)
    : null;
  const originationDecision = originationArtifact
    ? artifactDecisions?.find((item) => item.artifact_id === originationArtifact.id)
    : null;
  const advisorMessages = messages?.length
    ? messages.map((message) => {
        const artifactId = specializedCompletionArtifactId(message.metadata);
        return {
          id: message.id,
          role: message.role,
          content: message.content,
          status: message.status,
          errorCode: message.error_code,
          createdAt: message.created_at,
          artifactHref: project.entry_job !== "origination_thesis" && artifactId && artifactIds.has(artifactId)
            ? `/${locale}/app/projects/${project.id}?view=work`
            : undefined,
          proposalId: message.proposal_id,
        };
      })
    : [{id: `project-${project.id}`, role: "assistant", content: t("existingProject"), status: "completed", createdAt: new Date().toISOString()}];
  const fallbackContext = pendingAdvisorContext(messages ?? []);
  const pendingRequests = informationRequests?.length
    ? informationRequests.map((request) => ({
        id: request.id,
        question: request.question,
        whyItMatters: request.why_it_matters,
        decisionImpact: request.decision_impact,
      }))
    : fallbackContext ? [{id: `context-${project.id}`, ...fallbackContext}] : [];
  const compiledActivities = advisorActivities(project.entry_job, (tasks ?? []).map((task) => ({
    id: task.id,
    taskId: task.task_id,
    label: localizedOffroadTaskLabel(task.task_id, task.label, locale === "en-US" ? "en-US" : "pt-BR"),
    status: (latestRunByTask.get(task.id)?.status ?? "waiting") as "waiting" | "queued" | "running" | "succeeded" | "failed" | "blocked" | "cancelled",
  })), {
    context: t("activities.context"),
    research: t("activities.research"),
    market: t("activities.market"),
    readout: t("activities.readout"),
  });
  const visibleActivities = project.entry_job === "origination_thesis"
    ? compiledActivities
    : agentWorkItems?.length
    ? agentWorkItems.map((item) => ({
        id: item.id,
        label: item.title,
        status: advisorWorkStatus(item.status),
      }))
    : compiledActivities;
  const activityEvents = [...(agentEventsDescending ?? [])]
    .reverse()
    .filter((event) => project.entry_job !== "origination_thesis" || !eventTaskSpecId(event.detail))
    .map((event) => ({
      id: event.id,
      type: event.event_type,
      summary: locale === "en-US" ? event.summary_en : event.summary_pt,
      createdAt: event.created_at,
    }));
  const outcomeEvents = [...(agentEventsDescending ?? [])]
    .reverse()
    .map((event) => ({
      id: event.id,
      type: event.event_type,
      summary: locale === "en-US" ? event.summary_en : event.summary_pt,
      createdAt: event.created_at,
    }));
  const snapshot = agentPlan?.snapshot && typeof agentPlan.snapshot === "object" && !Array.isArray(agentPlan.snapshot)
    ? agentPlan.snapshot as Record<string, unknown>
    : null;
  const specialization = compiledSpecializationProfileSchema.safeParse(snapshot?.specializationProfile);
  const assessedByKey = new Map((requirementCoverage ?? []).map((item) => [item.requirement_key, item]));
  const expectedRequirements = specialization.success ? specialization.data.requirements : [];
  const expectedKeys = new Set(expectedRequirements.map((item) => item.key));
  const verifiedExpected = expectedRequirements.filter((requirement) => {
    const assessment = assessedByKey.get(requirement.key);
    return assessment && ["verified", "not_applicable"].includes(assessment.status);
  }).length;
  const verifiedOutsideProfile = (requirementCoverage ?? []).filter((item) =>
    !expectedKeys.has(item.requirement_key) && ["verified", "not_applicable"].includes(item.status)).length;
  const notExaminedCoverage = expectedRequirements.filter((requirement) => !assessedByKey.has(requirement.key)).length;
  const openExpected = expectedRequirements.filter((requirement) => {
    const assessment = assessedByKey.get(requirement.key);
    return ["blocking", "high"].includes(requirement.materiality)
      && (!assessment || ["missing", "partial", "conflicting", "unavailable"].includes(assessment.status));
  }).length;
  const openOutsideProfile = (requirementCoverage ?? []).filter((item) =>
    !expectedKeys.has(item.requirement_key)
    && ["missing", "partial", "conflicting", "unavailable"].includes(item.status)
    && ["blocking", "high"].includes(item.materiality)).length;
  const verifiedCoverage = verifiedExpected + verifiedOutsideProfile;
  const openCoverage = openExpected + openOutsideProfile;
  const totalCoverage = expectedRequirements.length
    + (requirementCoverage ?? []).filter((item) => !expectedKeys.has(item.requirement_key)).length;

  return <AdvisorProject
    accessBasis={project.access_basis}
    artifacts={(artifacts ?? []).filter((artifact) => customerArtifactLabel(artifact.artifact_type, locale) !== null).map((artifact) => ({
      id: artifact.id,
      label: `${customerArtifactLabel(artifact.artifact_type, locale)!} · v${artifact.artifact_version}`,
      status: artifact.status,
    }))}
    copy={copy}
    documents={(documents ?? []).map((document) => ({id: document.id, name: document.original_name, size: document.byte_size, status: document.processing_status}))}
    locale={locale === "en-US" ? "en-US" : "pt-BR"}
    messages={advisorMessages}
    activityEvents={activityEvents}
    outcomeEvents={outcomeEvents}
    coverage={{verified: verifiedCoverage, total: totalCoverage, openIssues: openCoverage, notExamined: notExaminedCoverage}}
    decisionRecords={(decisionRecords ?? []).map((decision) => ({
      id: decision.id,
      question: decision.question,
      recommendation: decision.recommendation,
      status: decision.status,
    }))}
    pendingRequests={pendingRequests}
    proposals={(proposals ?? []).map((proposal): AdvisorChangeProposal => ({id: proposal.id, status: proposal.status, title: proposal.title, rationale: proposal.rationale, impactSummary: proposal.impact_summary, proposal: proposal.proposal}))}
    projectId={project.id}
    projectName={project.project_name}
    sessionId={session.id}
    sessionStatus={session.status}
    tasks={visibleActivities}
    workHref={["company_debt_view", "capital_planning"].includes(project.entry_job) ? `/${locale}/app/projects/${project.id}?view=work` : undefined}
    workProduct={<>{parsedOrigination?.success && originationArtifact ? <OriginationConversationWork
      artifact={parsedOrigination.data}
      artifactId={originationArtifact.id}
      decision={originationDecision}
      fingerprint={originationArtifact.artifact_fingerprint}
      locale={locale === "en-US" ? "en-US" : "pt-BR"}
      projectId={project.id}
      status={originationArtifact.status}
    /> : null}{preliminary ? <div className="advisor-private-stack"><PrivateCaseWork
      checklist={checklist}
      locale={locale === "en-US" ? "en-US" : "pt-BR"}
      preliminary={preliminary}
      projectId={project.id}
      sessionId={session.id}
      shouldStart={session.status === "collecting"}
    />{privateWorkbench ? <PrivateDiagnosticWork
      isProcessing={privateWorkbench.isProcessing}
      locale={locale === "en-US" ? "en-US" : "pt-BR"}
      projectId={project.id}
      sessionId={session.id}
      understanding={privateWorkbench.understanding}
    /> : null}{privateWorkbench ? <PrivateStructureWork
      isProcessing={privateWorkbench.isProcessing}
      locale={locale === "en-US" ? "en-US" : "pt-BR"}
      projectId={project.id}
      sessionId={session.id}
      structure={privateWorkbench.structure}
      structureDecision={privateWorkbench.structureDecision}
    /> : null}{privateWorkbench ? <PrivateMaterialsWork
      governed={governedMaterials}
      isProcessing={privateWorkbench.isProcessing}
      locale={locale === "en-US" ? "en-US" : "pt-BR"}
      packageReview={privateWorkbench.packageReview}
      productionPlan={privateWorkbench.productionPlan}
      projectId={project.id}
      sessionId={session.id}
      structureConfirmed={privateWorkbench.structureDecision?.status === "confirmed" || privateWorkbench.structureDecision?.status === "approved"}
    /> : null}{privateWorkbench ? <PrivateMarketWork
      feedbackEvents={feedbackEvents ?? []}
      introductionPlan={introductionPlan}
      introductionRecipients={planRecipients}
      introductionTargets={planTargets}
      introductions={qualifiedIntroductions ?? []}
      isProcessing={privateWorkbench.isProcessing}
      locale={locale === "en-US" ? "en-US" : "pt-BR"}
      matchScreen={privateWorkbench.matchScreen}
      packageApproved={privateWorkbench.packageReview?.status === "approved"}
      projectId={project.id}
      representationStatus={session.representation_status}
      sessionId={session.id}
    /> : null}</div> : null}</>}
  />;
}

function advisorWorkStatus(status: string): "waiting" | "queued" | "running" | "succeeded" | "failed" | "blocked" | "cancelled" {
  if (status === "pending") return "waiting";
  if (status === "ready") return "queued";
  if (status === "review") return "running";
  if (status === "waiting_user") return "blocked";
  if (status === "superseded") return "cancelled";
  if (["running", "succeeded", "failed", "blocked"].includes(status)) {
    return status as "running" | "succeeded" | "failed" | "blocked";
  }
  return "waiting";
}

function eventTaskSpecId(detail: unknown): string | null {
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) return null;
  const value = (detail as Record<string, unknown>).task_spec_id;
  return typeof value === "string" && value ? value : null;
}

function customerArtifactLabel(type: string, locale: string): string | null {
  const labels: Record<string, [string, string]> = {
    meeting_brief: ["Leitura para a reunião", "Meeting readout"],
    company_debt_diagnostic: ["Análise da companhia", "Company analysis"],
    capital_planning_map: ["Alternativas de financiamento", "Financing alternatives"],
    material_package: ["Materiais preparados", "Prepared materials"],
  };
  const label = labels[type];
  return label ? label[locale === "en-US" ? 1 : 0] : null;
}

function pendingAdvisorContext(messages: Array<{role: string; metadata: unknown; created_at: string}>): {question: string; whyItMatters: string} | null {
  const latestAssistantIndex = messages.findLastIndex((message) => message.role === "assistant");
  if (latestAssistantIndex < 0 || messages.slice(latestAssistantIndex + 1).some((message) => message.role === "user")) return null;
  const latestAssistant = messages[latestAssistantIndex];
  if (!latestAssistant?.metadata || typeof latestAssistant.metadata !== "object" || Array.isArray(latestAssistant.metadata)) return null;
  const metadata = latestAssistant.metadata as Record<string, unknown>;
  if (metadata.state !== "asking" || !metadata.clarification || typeof metadata.clarification !== "object" || Array.isArray(metadata.clarification)) return null;
  const clarification = metadata.clarification as Record<string, unknown>;
  return typeof clarification.question === "string" && typeof clarification.whyItMatters === "string"
    ? {question: clarification.question, whyItMatters: clarification.whyItMatters}
    : null;
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
