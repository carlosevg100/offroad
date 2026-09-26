import {WorkVaultPanel} from "@/components/advisor/work-vault-panel";
import {WorkParticipationPanel} from "@/components/advisor/work-participation-panel";
import {WorkContextPanel} from "@/components/advisor/work-context-panel";
import {WorkUpdates} from "@/components/advisor/work-updates";
import {advisorProjectCopy} from "@/lib/advisor/advisor-project-copy";
import {continuationNote} from "@/lib/advisor/work-continuation";
import {loadWorkUpdates} from "@/lib/advisor/work-updates-reader";
import {StandaloneWork} from "@/components/advisor/standalone-work";
import {ReceivablesCurrentResult} from "@/components/advisor/receivables-current-result";
import {InstitutionalModelResultWork} from "@/components/advisor/institutional-model-result-work";
import {loadInstitutionalModelResult} from "@/lib/advisor/institutional-model-results";
import {institutionalCalculationRuns, jobKindRunning, summarizeWorkActivity} from "@/lib/advisor/work-activity";
import {loadWorkActivity} from "@/lib/advisor/work-activity-reader";
import {workbenchAnalysisGap} from "@/lib/deal-state/analysis-gap";
import {loadProviderWorkHistory} from "@/lib/advisor/provider-work-history";
import {ProviderWorkHistory} from "@/components/advisor/provider-work-history";
import {ReceivablesSupportPeriods} from "@/components/intake/receivables-support-periods";
import {loadReceivablesTemporalReport} from "@/lib/receivables/temporal-report";
import {ReceivablesProjectSupportPeriods} from "@/components/intake/receivables-project-support-periods";
import {loadReceivablesScope} from "@/lib/receivables/scope";
import {loadReceivablesReleasedResult} from "@/lib/receivables/released-result";
import {ReceivablesScopeCard, type ReceivablesScopeCopy} from "@/components/advisor/receivables-scope-card";
import {compiledSpecializationProfileSchema} from "@offroad/agent-contracts";
import {decisionArtifactContractSchema} from "@offroad/case-understanding";
import {originationConversationArtifactSchema} from "@offroad/domain-contracts";
import {executionBriefChangeSchema, executionBriefNarrativeSchema, executionBriefProgressSchema, localizedOffroadTaskLabel, visibleExecutionBriefSchema} from "@offroad/work-plan";
import type {Metadata} from "next";
import {getTranslations} from "next-intl/server";
import {notFound, redirect} from "next/navigation";

import {AdvisorProject} from "@/components/advisor/advisor-project";
import type {AdvisorWorkSection} from "@/components/advisor/advisor-work-surface";
import {workSectionHref} from "@/components/advisor/advisor-work-links";
import {DocumentWorkProduct} from "@/components/advisor/document-work-product";
import {loadDocumentWorkProduct} from "@/lib/advisor/document-work-product-reader";
import {documentWorkProductLabels} from "@/lib/advisor/document-work-product-labels";
import type {AdvisorChangeProposal} from "@/components/advisor/advisor-change-proposal";
import {OriginationConversationWork} from "@/components/advisor/origination-conversation-work";
import {PrivateCaseWork} from "@/components/advisor/private-case-work";
import {PrivateDiagnosticWork} from "@/components/advisor/private-diagnostic-work";
import {PrivateMarketWork} from "@/components/advisor/private-market-work";
import {ProviderCaseFitForm} from "@/components/advisor/provider-case-fit-form";
import {ProviderCaseFitWork} from "@/components/advisor/provider-case-fit-work";
import {currentProviderCaseFit} from "@/lib/advisor/provider-case-fit-reader";
import {ProviderResearchWork} from "@/components/advisor/provider-research-work";
import {currentProviderResearch} from "@/lib/advisor/provider-research-reader";
import {PrivateMaterialsWork} from "@/components/advisor/private-materials-work";
import {PrivateStructureWork} from "@/components/advisor/private-structure-work";
import {AdvisorDecisionWork} from "@/components/integration-preview/advisor-decision-work";
import {requireWorkspace} from "@/lib/auth/workspace";
import {loadGovernedMaterialPackage} from "@/lib/deal-state/materials";
import {loadDealStateWorkbench} from "@/lib/deal-state/workbench";
import {loadIntakeChecklist} from "@/lib/intake/checklist";
import {loadPreliminaryUnderstanding} from "@/lib/intake/preliminary-understanding";
import {advisorActivities} from "@/lib/advisor/activity";
import {projectExecutionBriefApproval} from "@/lib/advisor/execution-brief-approval";
import {loadProjectReviewContext, reviewMemberLabels} from "@/lib/advisor/project-review-context";
import {loadProjectWorkRequests} from "@/lib/advisor/project-work-requests";
import {ProjectReviewRoles} from "@/components/advisor/project-review-roles";
import {PresentationTemplateSettings} from "@/components/advisor/presentation-template-settings";
import {loadPresentationTemplateContext} from "@/lib/advisor/presentation-template";
import type {ExecutionBriefApproval} from "@/components/advisor/execution-brief-card";
import {openEvidenceRequirements} from "@/lib/advisor/evidence-inventory";
import {canShowAdvisorInformationRequests, currentActivityCycle, customerEventType} from "@/components/advisor/advisor-project-state";

import {loadInstitutionalConfigurationReviews} from "@/lib/advisor/institutional-configuration-reviews";
import {InstitutionalSetupReviewWork} from "@/components/advisor/institutional-setup-review";
import {parseInstitutionalSetupReviews} from "@/lib/advisor/institutional-setup-reviews";
import {InstitutionalSetupForm} from "@/components/advisor/institutional-setup-form";
import {loadInstitutionalSetupContext} from "@/lib/advisor/institutional-setup-reader";
import {InstitutionalConfigurationReviewWork} from "@/components/advisor/institutional-configuration-review";

import {CompanyDebtProject} from "./company-debt-project";
import {CapitalPlanningProject} from "./capital-planning-project";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {title: "Projeto", robots: {index: false, follow: false}};

type Props = {params: Promise<{locale: string; projectId: string}>; searchParams: Promise<{view?: string}>};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export default async function CapitalProjectPage({params, searchParams}: Props) {
  const {locale, projectId} = await params;
  const {view} = await searchParams;
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
  // A specialized view must not report analysis in progress while its exact plan awaits
  // consent. Keep the actionable approval in the canonical project conversation.
  const {data: approvalSession} = await supabase.from("document_intake_sessions")
    .select("id").eq("organization_id", organization.id).eq("capital_project_id", project.id).maybeSingle();
  if (!approvalSession) return <StandaloneWork locale={locale} project={project} />;
  if (approvalSession) {
    const {data: heldWork} = await supabase.from("processing_jobs")
      .select("id").eq("organization_id", organization.id).eq("intake_session_id", approvalSession.id)
      .eq("status", "awaiting_approval").limit(1);
    if (heldWork?.length) redirect(`/${locale}/app/projects/${project.id}`);
  }
  if (project.entry_job === "company_debt_view") {
    const {data: currentPlan} = await supabase.from("capital_project_plans")
      .select("snapshot").eq("organization_id", organization.id)
      .eq("capital_project_id", project.id).eq("status", "active").maybeSingle();
    if (record(record(currentPlan?.snapshot)?.job)?.firstWorkProduct === "provider_research") {
      return <ConversationalCapitalProject locale={locale} project={project} />;
    }
    return <CompanyDebtProject locale={locale} projectId={projectId} />;
  }
  // The only specialized view left is capital planning: origination theses answer in the
  // conversation (#364), and the dedicated view that inferred work from a missing brief is retired.
  if (project.entry_job === "capital_planning") {
    return <CapitalPlanningProject locale={locale} projectId={projectId} />;
  }
  notFound();
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
  const scopeTranslations = await getTranslations({locale, namespace: "ReceivablesScope"});
  const {supabase, organization, userId} = await requireWorkspace(locale);
  const {data: session} = await supabase.from("document_intake_sessions")
    .select("id, status, representation_status")
    .eq("organization_id", organization.id)
    .eq("capital_project_id", project.id)
    .order("created_at", {ascending: true})
    .limit(1)
    .maybeSingle();
  if (!session) return <StandaloneWork locale={locale} project={project} />;
  // Review roles decide what this person may prepare, return or approve; the registry entry and
  // the approval card only explain the decision the database will enforce again.
  const [reviewContext, workRequests] = await Promise.all([
    loadProjectReviewContext(supabase, project.id),
    loadProjectWorkRequests(supabase, organization.id, project.id),
  ]);
  const memberLabels = reviewMemberLabels(reviewContext);
  const describeApproval = (raw: unknown, expected: {id: string; fingerprint: string; version: number}): ExecutionBriefApproval => {
    const approval = projectExecutionBriefApproval(raw, expected);
    return {
      status: approval.status, fingerprint: approval.fingerprint, version: approval.version,
      ...(approval.reason ? {reason: approval.reason} : {}),
      ...(approval.reviewMode ? {reviewMode: approval.reviewMode} : {}),
      ...(approval.callerCanApprove !== undefined ? {callerCanApprove: approval.callerCanApprove} : {}),
      ...(approval.record ? {record: {
        ...approval.record,
        preparedByLabel: approval.record.preparedBy ? memberLabels[approval.record.preparedBy] ?? null : null,
        reviewedByLabel: approval.record.reviewedBy ? memberLabels[approval.record.reviewedBy] ?? null : null,
      }} : {}),
    };
  };

  // Read what is in progress before what it produces: a completion between the two reads may
  // cause one extra refresh, but can never leave a missing result without its refresh.
  const activity = await loadWorkActivity(supabase, {organizationId: organization.id, workId: project.id, sessionId: session.id});

  const [{data: conversation}, {data: documents}, {data: plan}, {data: artifacts}, {data: artifactDecisions}, {data: executionBriefRow}] = await Promise.all([
    supabase.from("agent_conversations").select("id, state").eq("organization_id", organization.id).eq("intake_session_id", session.id).maybeSingle(),
    supabase.from("source_documents").select("id, original_name, byte_size, processing_status, document_version").eq("organization_id", organization.id).eq("intake_session_id", session.id).order("created_at"),
    supabase.from("capital_project_plans").select("id, compiler_version, plan_fingerprint").eq("organization_id", organization.id).eq("capital_project_id", project.id).eq("status", "active").maybeSingle(),
    supabase.from("capital_project_artifacts").select("id, artifact_type, artifact_version, schema_version, plan_id, task_run_id, status, artifact_fingerprint, content, created_at").eq("organization_id", organization.id).eq("capital_project_id", project.id).order("created_at", {ascending: false}),
    supabase.from("capital_project_artifact_decisions").select("artifact_id, decision, decided_at").eq("organization_id", organization.id).eq("capital_project_id", project.id).order("decided_at", {ascending: false}),
    supabase.from("capital_project_execution_briefs")
      .select("id, brief_version, visible_snapshot, change_summary, created_at")
      .eq("organization_id", organization.id)
      .eq("capital_project_id", project.id)
      .order("brief_version", {ascending: false})
      .limit(1)
      .maybeSingle(),
  ]);
  const parsedExecutionBrief = executionBriefRow
    ? visibleExecutionBriefSchema.safeParse(executionBriefRow.visible_snapshot)
    : null;
  const parsedExecutionBriefChanges = executionBriefRow
    ? executionBriefChangeSchema.array().max(20).safeParse(executionBriefRow.change_summary)
    : null;
  const [{data: executionBriefProgressRaw}, {data: executionBriefNarrativeRaw}, {data: executionBriefApprovalRaw}, {data: documentaryPlanJob}] = executionBriefRow
    ? await Promise.all([
        supabase.rpc("read_capital_project_execution_brief_progress_v1", {p_execution_brief_id: executionBriefRow.id}),
        supabase.rpc("read_capital_project_execution_brief_narrative_v1", {p_execution_brief_id: executionBriefRow.id}),
        supabase.rpc("read_advisor_execution_brief_approval_v1", {p_project_id: project.id, p_execution_brief_id: executionBriefRow.id}),
        supabase.rpc("read_documentary_plan_job_v1", {p_project_id: project.id, p_execution_brief_id: executionBriefRow.id}),
      ])
    : [{data: null}, {data: null}, {data: null}, {data: null}];
  const parsedExecutionBriefProgress = executionBriefProgressSchema.safeParse(executionBriefProgressRaw);
  const parsedExecutionBriefNarrative = executionBriefNarrativeSchema.safeParse(executionBriefNarrativeRaw);
  const executionBriefProgress = parsedExecutionBrief?.success
    && parsedExecutionBriefProgress.success
    && parsedExecutionBriefProgress.data.briefId === executionBriefRow?.id
    && parsedExecutionBriefProgress.data.version === executionBriefRow.brief_version
    && parsedExecutionBriefProgress.data.workstreams.every((workstream, index) =>
      workstream.position === index && workstream.label === parsedExecutionBrief.data.workstreams[index]?.label)
    ? parsedExecutionBriefProgress.data
    : null;
  const executionBriefNarrative = parsedExecutionBrief?.success
    && parsedExecutionBriefNarrative.success
    && parsedExecutionBriefNarrative.data.briefId === executionBriefRow?.id
    && parsedExecutionBriefNarrative.data.version === executionBriefRow.brief_version
    && parsedExecutionBriefNarrative.data.events.every((event) =>
      event.label === parsedExecutionBrief.data.workstreams[event.position]?.label)
    ? parsedExecutionBriefNarrative.data
    : null;
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
    ? await loadDealStateWorkbench(supabase, organization.id, session.id, activity)
    : null;
  const governedMaterials = privateWorkbench?.productionPlan?.row.status === "approved"
    ? await loadGovernedMaterialPackage(supabase, organization.id, session.id)
    : null;
  // A decision whose result is missing while no analysis runs is a gap with its next step.
  const analysisGap = privateWorkbench ? workbenchAnalysisGap(privateWorkbench, governedMaterials !== null) : null;
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
      ? supabase.from("agent_messages").select("id, role, content, status, error_code, proposal_id, metadata, created_at, human_author_id").eq("organization_id", organization.id).eq("conversation_id", conversation.id).order("created_at")
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
      ? supabase.from("capital_project_task_runs").select("id, plan_task_id, attempt_no, status").eq("organization_id", organization.id).eq("plan_id", plan.id).order("attempt_no", {ascending: false})
      : Promise.resolve({data: []}),
  ]);
  const latestRunByTask = new Map<string, {status: string}>();
  for (const run of runs ?? []) if (!latestRunByTask.has(run.plan_task_id)) latestRunByTask.set(run.plan_task_id, run);

  const providerCaseFit = currentProviderCaseFit(artifacts ?? [], runs ?? [], plan
    ? {organizationId: organization.id, projectId: project.id, planId: plan.id, planFingerprint: plan.plan_fingerprint} : null);
  const providerResearch = currentProviderResearch(artifacts ?? [], runs ?? [], plan
    ? {projectId: project.id, planId: plan.id, planFingerprint: plan.plan_fingerprint} : null);

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
  ] = await Promise.all([
        agentPlan
          ? supabase.from("capital_project_agent_work_items")
          .select("id, title, status, created_at")
          .eq("organization_id", organization.id)
          .eq("agent_plan_id", agentPlan.id)
          .neq("status", "superseded")
          .order("created_at")
          : Promise.resolve({data: []}),
        supabase.from("capital_project_agent_events")
          .select("id, event_type, summary_pt, summary_en, detail, created_at")
          .eq("organization_id", organization.id)
          .eq("capital_project_id", project.id)
          .order("created_at", {ascending: false})
          .limit(40),
        supabase.from("capital_project_information_requests")
          .select("id, question, why_it_matters, decision_impact, acceptable_evidence, answer_kind, choices, priority, information_gain, materiality, created_at, updated_at")
          .eq("organization_id", organization.id)
          .eq("capital_project_id", project.id)
          .eq("status", "open")
          .neq("priority", "later")
          .order("information_gain", {ascending: false})
          .order("created_at"),
        supabase.from("capital_project_requirement_coverage")
          .select("id, requirement_key, label, status, materiality, missing_reason")
          .eq("organization_id", organization.id)
          .eq("capital_project_id", project.id),
        supabase.from("capital_project_decisions")
          .select("id, question, recommendation, status, created_at")
          .eq("organization_id", organization.id)
          .eq("capital_project_id", project.id)
          .neq("status", "superseded")
          .order("created_at", {ascending: false})
          .limit(5),
      ]);

  const copy = await advisorProjectCopy(locale);
  const artifactIds = new Set((artifacts ?? []).map((artifact) => artifact.id));
  const previewArtifacts = (artifacts ?? []).filter((artifact) => artifact.artifact_type.startsWith("preview_") && artifact.status !== "superseded").map((artifact) => ({
    id: artifact.id, type: artifact.artifact_type, version: artifact.artifact_version, status: artifact.status, createdAt: artifact.created_at, content: artifact.content,
  }));
  const decisionArtifactRow = (artifacts ?? []).find((artifact) => artifact.artifact_type === "preview_decision_contract" && artifact.status !== "superseded");
  const decisionArtifactContent = decisionArtifactRow?.content && typeof decisionArtifactRow.content === "object" && !Array.isArray(decisionArtifactRow.content)
    ? decisionArtifactRow.content as Record<string, unknown>
    : null;
  const parsedDecisionArtifact = decisionArtifactContractSchema.safeParse(decisionArtifactContent?.contract);
  const originationArtifact = project.entry_job === "origination_thesis"
    ? (artifacts ?? []).find((artifact) => artifact.artifact_type === "meeting_brief" && artifact.status !== "superseded")
    : undefined;
  const parsedOrigination = originationArtifact
    ? originationConversationArtifactSchema.safeParse(originationArtifact.content)
    : null;
  const originationDecision = originationArtifact
    ? artifactDecisions?.find((item) => item.artifact_id === originationArtifact.id)
    : null;
  const displayedApproval = parsedExecutionBrief?.success && executionBriefRow
    ? describeApproval(executionBriefApprovalRaw, {id: executionBriefRow.id, fingerprint: parsedExecutionBrief.data.fingerprint, version: executionBriefRow.brief_version})
    : null;
  const briefJob = documentaryPlanJob;
  const plannedDocumentaryWork = (displayedApproval?.status === "awaiting" || displayedApproval?.status === "approved")
    && (briefJob === "comparison" || briefJob === "meeting" || briefJob === "review") ? {job:briefJob} as const : undefined;
  // The plan is said to be in preparation only while its job runs.
  const emptyConversationCopy = displayedApproval?.status === "awaiting"
    ? "awaitingPlanFallback"
    : artifacts?.length ? "existingProject"
      : displayedApproval?.status === "approved" ? "approvedPlanFallback"
        : jobKindRunning(activity, ["execution_brief_proposal"]) ? "preparingPlanFallback" : "startFallback";
  const advisorMessages = messages?.length
    ? messages.map((message) => {
        const artifactId = specializedCompletionArtifactId(message.metadata);
        return {
          id: message.id,
          role: message.role,
          humanAuthorId: message.human_author_id,
          content: message.content,
          status: message.status,
          errorCode: message.error_code,
          createdAt: message.created_at,
          artifactHref: artifactId && artifactIds.has(artifactId)
            ? artifactId === providerCaseFit?.row.id ? workSectionHref("provider-case-fit")
              : artifactId === providerResearch?.row.id ? workSectionHref("provider-research")
              : project.entry_job === "origination_thesis" && parsedOrigination?.success && artifactId === originationArtifact?.id
              ? workSectionHref("meeting-brief") : project.entry_job !== "origination_thesis" ? `/${locale}/app/projects/${project.id}?view=work` : undefined
            : undefined,
          proposalId: message.proposal_id,
          continuation: continuationNote(message.metadata),
        };
      })
    : [{id: `project-${project.id}`, role: "assistant", content: t(emptyConversationCopy), status: "completed", createdAt: new Date().toISOString()}];
  const receivablesScope = await loadReceivablesScope(supabase, session.id);
  const receivablesTemporalReport = await loadReceivablesTemporalReport(supabase, organization.id, session.id, receivablesScope);
  // The database decides whether this organization may read its own released analysis; without the
  // grant it answers "not granted" and the compact card below is unchanged.
  const receivablesReleased = await loadReceivablesReleasedResult(supabase, session.id);
  const scopeCopy = Object.fromEntries(["title", "body", "primary", "support", "date", "declaration", "confirm", "pending", "saved", "current", "stale", "unavailable", "refresh", "noSupport", "invalid", "denied", "processing", "save", "unnamedSource", "sheet", "headerRow", "version", "supportSheets", "supportSheetsHelp"].map((key) => [key, scopeTranslations(key as keyof ReceivablesScopeCopy)])) as ReceivablesScopeCopy;
  const showInformationRequests = canShowAdvisorInformationRequests(preliminary?.current?.row.status ?? null);
  const visibleInformationRequests = showInformationRequests
    ? informationRequests ?? []
    : [];
  const pendingRequests = visibleInformationRequests.length
    ? visibleInformationRequests.map((request) => ({
        id: request.id,
        question: request.question,
        whyItMatters: request.why_it_matters,
        decisionImpact: request.decision_impact,
        acceptableEvidence: request.acceptable_evidence,
        answerKind: request.answer_kind as "text" | "number" | "date" | "choice" | "document" | "confirmation",
        choices: request.choices,
        updatedAt: request.updated_at,
      }))
    : [];
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
  // A preview plan lists its own steps, each bound to a method; the grouped activities of the
  // released journeys would hide them.
  const previewPlan = typeof plan?.compiler_version === "string" && plan.compiler_version.startsWith("integration-preview");
  const previewTasks = (tasks ?? []).map((task) => ({
    id: task.id,
    label: task.label,
    status: (latestRunByTask.get(task.id)?.status ?? "waiting") as "waiting" | "queued" | "running" | "succeeded" | "failed" | "blocked" | "cancelled",
  }));
  const documentaryActivities = plannedDocumentaryWork && executionBriefProgress
    ? executionBriefProgress.workstreams.map(stream=>({id:`documentary-${stream.position}`,label:stream.label,
      status:advisorWorkStatus(stream.status === "completed" ? "succeeded" : stream.status === "needs_attention" ? "failed" : stream.status)})) : null;
  const visibleActivities = documentaryActivities ?? (previewPlan
    ? previewTasks
    : project.entry_job === "origination_thesis"
    ? compiledActivities
    : agentWorkItems?.length
    ? agentWorkItems.map((item) => ({
        id: item.id,
        label: item.title,
        status: advisorWorkStatus(item.status),
      }))
    : compiledActivities);
  const activityEvents = currentActivityCycle([...(agentEventsDescending ?? [])].map((event) => ({
    id: event.id,
    type: event.event_type,
    createdAt: event.created_at,
    detail: event.detail,
    summary: locale === "en-US" ? event.summary_en : event.summary_pt,
  })))
    .filter((event) => !eventTaskSpecId(event.detail)
      || (!parsedExecutionBrief?.success && project.entry_job !== "origination_thesis"))
    .map((event) => ({
      id: event.id,
      type: customerEventType(event.type, event.detail),
      summary: event.summary,
      createdAt: event.createdAt,
    }));
  const outcomeEvents = [...(agentEventsDescending ?? [])]
    .reverse()
    .map((event) => ({
      id: event.id,
      type: customerEventType(event.event_type, event.detail),
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
  // What is still open is more useful than how much is open. Each requirement already carries
  // the reason it matters and its materiality, so the screen can say why a gap changes the work
  // instead of showing a count and leaving the person to guess.
  const openRequirements = openEvidenceRequirements(expectedRequirements, requirementCoverage ?? []);
  const verifiedCoverage = verifiedExpected + verifiedOutsideProfile;
  const openCoverage = openExpected + openOutsideProfile;
  const totalCoverage = expectedRequirements.length
    + (requirementCoverage ?? []).filter((item) => !expectedKeys.has(item.requirement_key)).length;

  const workSections: AdvisorWorkSection[] = [];
  const institutionalResult = await loadInstitutionalModelResult(supabase, project.id);
  if (institutionalResult) {
    const resultCopy = await getTranslations({locale, namespace: "InstitutionalModelResult"});
    workSections.push({id: "institutional-model-result", title: resultCopy("title"), content: <InstitutionalModelResultWork projectId={project.id} result={institutionalResult}
      calculating={institutionalCalculationRuns(activity, institutionalResult.id)} />});
  }
  const providerHistory = plan ? await loadProviderWorkHistory(supabase, artifacts ?? [], {organizationId: organization.id, projectId: project.id, currentPlanId: plan.id}) : [];

  if (providerCaseFit) {
    const fitCopy = await getTranslations({locale, namespace: "ProviderCaseFitWork"});
    workSections.push({id: "provider-case-fit", artifactId: providerCaseFit.row.id, title: fitCopy("title"), version: providerCaseFit.row.artifact_version, content: <ProviderCaseFitWork fit={providerCaseFit.fit} />});
  }
  const institutionalReviews = await loadInstitutionalConfigurationReviews(supabase, project.id);
  if (institutionalReviews.length) {
    const reviewCopy = await getTranslations({locale, namespace: "InstitutionalConfigurationReview"});
    workSections.push({id: "institutional-premises", title: reviewCopy("title"), version: institutionalReviews[0].revision,
      status: reviewCopy(`status.${institutionalReviews[0].status}`), content: <InstitutionalConfigurationReviewWork projectId={project.id} reviews={institutionalReviews} />});
  }
  if (providerResearch) {
    const researchCopy = await getTranslations({locale, namespace: "ProviderResearchWork"});
    workSections.push({id: "provider-research", artifactId: providerResearch.row.id,
      title: researchCopy("title"), version: providerResearch.row.artifact_version, status: researchCopy("status"),
      content: <ProviderResearchWork research={providerResearch.research} />});
  }
  const documentResult = await loadDocumentWorkProduct(supabase, organization.id, project.id);
  if (documentResult) {
    const labels = await documentWorkProductLabels(documentResult.product.locale);
    workSections.push({id: "document-review", title: labels[`${documentResult.product.job}Title`], version: documentResult.binding.version,
      status: documentResult.product.status === "insufficient_evidence" ? labels.insufficientEvidence : labels.preliminary,
      content: <DocumentWorkProduct product={documentResult.product} labels={labels}
        downloadBase={`/${locale}/app/projects/${project.id}/work-products/${documentResult.product.fingerprint}`} />});
  }
  if (parsedOrigination?.success && originationArtifact) workSections.push({id: "meeting-brief", artifactId: originationArtifact.id,
    title: customerArtifactLabel("meeting_brief", locale)!, version: originationArtifact.artifact_version,
    content: <OriginationConversationWork artifact={parsedOrigination.data} artifactId={originationArtifact.id} decision={originationDecision}
      fingerprint={originationArtifact.artifact_fingerprint} locale={locale === "en-US" ? "en-US" : "pt-BR"} projectId={project.id} status={originationArtifact.status} />});
  if (parsedDecisionArtifact.success || previewArtifacts.length) workSections.push({id: "decision-work", title: t("openWork"),
    content: <AdvisorDecisionWork contract={parsedDecisionArtifact.success ? parsedDecisionArtifact.data : null} artifacts={previewArtifacts}
      locale={locale === "en-US" ? "en-US" : "pt-BR"} materialHref={`/${locale}/app/projects/${project.id}/preview/material`} />});

  if (providerHistory.length) {
    const historyCopy = await getTranslations({locale, namespace: "ProviderWorkHistory"});
    workSections.push({id: "provider-history", title: historyCopy("title"), content: <ProviderWorkHistory entries={providerHistory} />});
  }
  if (plan && ["company_debt_view", "capital_planning", "origination_thesis", "structure_from_documents", "review_existing_operation", "prepare_materials_and_process"].includes(project.entry_job)) {
    const fitCopy = await getTranslations({locale, namespace: "ProviderCaseFitForm"});
    workSections.push({id: "provider-case-criteria", title: fitCopy("title"), content: <ProviderCaseFitForm projectId={project.id} projectName={project.project_name} expectedPlanFingerprint={plan.plan_fingerprint}
      initialObjective={workRequests.find((request) => request.capability === "provider_research" && request.status === "dispatched")?.objective} />});
  }

  const institutionalSetup = await loadInstitutionalSetupContext(supabase, project.id);
  if (institutionalSetup) {
    const setupCopy = await getTranslations({locale, namespace: "InstitutionalSetup"});
    workSections.push({id: "institutional-setup", title: setupCopy("title"), content: <InstitutionalSetupForm context={institutionalSetup} />});
    const initialReviews = parseInstitutionalSetupReviews(institutionalSetup);
    if (initialReviews.length) {
      const initialReviewCopy = await getTranslations({locale, namespace: "InstitutionalSetupReview"});
      workSections.push({id: "institutional-setup-review", title: initialReviewCopy("title"), version: initialReviews[0].revision, content: <InstitutionalSetupReviewWork projectId={project.id} reviews={initialReviews} reviewPermissions={reviewContext ? {canApprove: reviewContext.caller.canApprove} : undefined} />});
    }
  }
  if (reviewContext) {
    const rolesCopy = await getTranslations({locale, namespace: "ProjectReviewRoles"});
    workSections.push({id: "project-review", title: rolesCopy("title"), status: rolesCopy(`modeLabel.${reviewContext.mode}`), content: <ProjectReviewRoles context={reviewContext} locale={locale === "en-US" ? "en-US" : "pt-BR"} projectId={project.id} />});
  }
  const templateContext = await loadPresentationTemplateContext(supabase, project.id);
  if (templateContext) {
    const templateCopy = await getTranslations({locale, namespace: "PresentationTemplate"});
    workSections.push({id: "presentation-template", title: templateCopy("title"),
      status: templateContext.effective ? templateContext.effective.definition.templateKey : templateCopy("currentHouse"),
      content: <PresentationTemplateSettings context={templateContext} locale={locale === "en-US" ? "en-US" : "pt-BR"} projectId={project.id} />});
  }

  const vaultCopy = await getTranslations({locale, namespace: "Vault"});
  const contributionCopy = await getTranslations({locale, namespace: "WorkContributions"});
  workSections.push({id: "contributions", title: contributionCopy("title"), content: <WorkParticipationPanel locale={locale} workId={project.id} />});

  workSections.push({id: "vault", title: vaultCopy("title"), content: <WorkVaultPanel locale={locale} workId={project.id} />});

  // The updates of the work: first when one awaits a decision, otherwise at the end.
  const [updates, updatesCopy] = await Promise.all([loadWorkUpdates(supabase, project.id, locale === "en-US" ? "en-US" : "pt-BR"), getTranslations({locale, namespace: "App.workUpdates"})]);
  const updatesSection: AdvisorWorkSection = {id: "updates", title: updatesCopy("title"),
    status: updates?.awaitingDecision ? updatesCopy("awaiting", {count: updates.awaitingDecision}) : undefined,
    content: <WorkUpdates locale={locale === "en-US" ? "en-US" : "pt-BR"} model={updates} />};
  if (updates?.awaitingDecision) workSections.unshift(updatesSection); else workSections.push(updatesSection);

  return <AdvisorProject
    currentUserId={userId}
    contextPanel={<WorkContextPanel locale={locale} workId={project.id} />}
    workEntry={{
      context: {
        accessBasis: project.access_basis,
        documentaryPlanningEnabled: process.env.DOCUMENTARY_WORK_PLANNING_ENABLED === "true",
        readyDocumentCount: (documents ?? []).filter((document) => document.processing_status === "ready").length,
        executionBriefAvailable: Boolean(executionBriefRow),
        institutionalSetupAvailable: Boolean(institutionalSetup),
        providerCaseFitAvailable: workSections.some((section) => section.id === "provider-case-criteria"),
        callerActions: reviewContext
          ? {prepare: reviewContext.caller.canPrepare, return: reviewContext.caller.canReturn, approve: reviewContext.caller.canApprove}
          : {prepare: false, return: false, approve: false},
      },
      requests: workRequests,
    }}
    accessBasis={project.access_basis}
    artifacts={(artifacts ?? []).filter((artifact) => artifact.status !== "superseded" && customerArtifactLabel(artifact.artifact_type, locale) !== null).map((artifact) => ({
      id: artifact.id,
      label: `${customerArtifactLabel(artifact.artifact_type, locale)!} · v${artifact.artifact_version}`,
      status: artifact.status,
    }))}
    copy={copy}
    documents={(documents ?? []).map((document) => ({id: document.id, name: document.original_name, size: document.byte_size, status: document.processing_status, version: document.document_version}))}
    executionBrief={parsedExecutionBrief?.success ? {
      approval: describeApproval(executionBriefApprovalRaw, {id: executionBriefRow!.id, fingerprint: parsedExecutionBrief.data.fingerprint, version: executionBriefRow!.brief_version}),
      brief: parsedExecutionBrief.data,
      briefId: executionBriefRow!.id,
      changes: parsedExecutionBriefChanges?.success ? parsedExecutionBriefChanges.data : [],
      createdAt: executionBriefRow!.created_at,
      narrative: executionBriefNarrative,
      progress: executionBriefProgress,
      version: executionBriefRow!.brief_version,
    } : null}
    locale={locale === "en-US" ? "en-US" : "pt-BR"}
    messages={advisorMessages}
    activity={summarizeWorkActivity(activity)}
    activityEvents={activityEvents}
    outcomeEvents={outcomeEvents}
    coverage={{verified: verifiedCoverage, total: totalCoverage, openIssues: openCoverage, notExamined: notExaminedCoverage}}
    openRequirements={openRequirements}
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
    workSections={workSections}
    workHref={["company_debt_view", "capital_planning"].includes(project.entry_job) ? `/${locale}/app/projects/${project.id}?view=work` : undefined}
    workProduct={<>{receivablesScope.sourceManifest || receivablesScope.scope ? <ReceivablesScopeCard key={`${receivablesScope.state}:${receivablesScope.sourceManifest?.fingerprint ?? "none"}:${receivablesScope.scope?.id ?? "none"}:${receivablesScope.scope?.fingerprint ?? "none"}`} context={receivablesScope} copy={scopeCopy} locale={locale === "en-US" ? "en-US" : "pt-BR"} projectId={project.id} sessionId={session.id} /> : null}{receivablesTemporalReport || receivablesReleased.state === "current" || receivablesReleased.state === "superseded" ? <ReceivablesCurrentResult report={receivablesTemporalReport} locale={locale === "en-US" ? "en-US" : "pt-BR"} released={receivablesReleased} /> : null}{receivablesTemporalReport ? <ReceivablesProjectSupportPeriods understanding={receivablesTemporalReport} locale={locale} current={true} /> : receivablesScope.scope ? <ReceivablesSupportPeriods locale={locale} /> : null}{preliminary ? <div className="advisor-private-stack"><PrivateCaseWork
      checklist={checklist}
      documentaryWork={documentResult?.binding.executionScope === "documentary_only" ? {job:documentResult.product.job,gaps:documentResult.product.gaps} : plannedDocumentaryWork}
      locale={locale === "en-US" ? "en-US" : "pt-BR"}
      preliminary={preliminary}
      projectId={project.id}
      sessionId={session.id}
      canRetry={session.status === "failed"}
      shouldStart={session.status === "collecting"}
    />{privateWorkbench ? <PrivateDiagnosticWork
      isProcessing={privateWorkbench.isProcessing}
      locale={locale === "en-US" ? "en-US" : "pt-BR"}
      projectId={project.id}
      sessionId={session.id}
      understanding={privateWorkbench.understanding}
    /> : null}{privateWorkbench ? <PrivateStructureWork
      gap={analysisGap}
      isProcessing={privateWorkbench.isProcessing}
      locale={locale === "en-US" ? "en-US" : "pt-BR"}
      projectId={project.id}
      sessionId={session.id}
      structure={privateWorkbench.structure}
      structureDecision={privateWorkbench.structureDecision}
    /> : null}{privateWorkbench ? <PrivateMaterialsWork
      gap={analysisGap}
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
  if (["queued", "running", "succeeded", "failed", "blocked"].includes(status)) {
    return status as "queued" | "running" | "succeeded" | "failed" | "blocked";
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
    preview_debt_ledger: ["Prévia: dívida por instrumento", "Preview: debt by instrument"],
    preview_financial_statements: ["Prévia: conciliação", "Preview: reconciliation"],
    preview_covenants: ["Prévia: covenants", "Preview: covenants"],
    preview_maturity_wall: ["Prévia: vencimentos", "Preview: maturities"],
    preview_interest_schedule: ["Prévia: juros e correção", "Preview: interest and indexation"],
    preview_exit_costs: ["Prévia: custo de saída", "Preview: exit cost"],
    preview_scenarios: ["Prévia: cenários", "Preview: scenarios"],
    preview_alternatives: ["Prévia: alternativas", "Preview: alternatives"],
    preview_meeting_brief: ["Prévia: plano da devolutiva", "Preview: readout plan"],
    preview_material: ["Prévia: síntese e material", "Preview: synthesis and material"],
    meeting_brief: ["Leitura para a reunião", "Meeting readout"],
    company_debt_diagnostic: ["Análise da companhia", "Company analysis"],
    capital_planning_map: ["Alternativas de financiamento", "Financing alternatives"],
    material_package: ["Materiais preparados", "Prepared materials"],
  };
  const label = labels[type];
  return label ? label[locale === "en-US" ? 1 : 0] : null;
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
