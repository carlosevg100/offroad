import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  CircleGauge,
  FileText,
  FolderOpen,
  HelpCircle,
  Landmark,
  LockKeyhole,
  LoaderCircle,
  Network,
  PanelLeft,
  PencilLine,
  Plus,
  Search,
} from "lucide-react";
import {projectWorkPlan, type WorkPlanStatus} from "@offroad/work-plan";
import type {Metadata} from "next";
import {getTranslations} from "next-intl/server";
import Link from "next/link";
import {redirect} from "next/navigation";

import {BrandMark} from "@/components/brand-mark";
import {IntakeCollect} from "@/components/intake/intake-collect";
import {resolveCaseState} from "@/lib/intake/case-pipeline";
import {loadIntakeChecklist} from "@/lib/intake/checklist";
import {briefCompleteness, dealBriefOf} from "@/lib/intake/deal-brief";
import {IntakeReview} from "@/components/intake/intake-review";
import {IntakeStartChoice} from "@/components/intake/intake-start-choice";
import {PrivateProjectSetup} from "@/components/intake/private-project-setup";
import {AgentPanel, type AgentPanelCopy} from "@/components/intake/agent-panel";
import type {AppLocale} from "@/i18n/routing";
import {loadIntakeReview} from "@/lib/intake/server";
import type {IntakeErrorCode} from "@/lib/intake/types";
import {resolveBorrowerOnboardingView} from "@/lib/onboarding/state-machine";
import {createClient} from "@/lib/supabase/server";
import type {Database, Json} from "@/types/database";

import {
  acceptHighConfidenceCandidates,
  acceptPrivateWorkspaceTerms,
  completeOnboarding,
  confirmDocumentIntake,
  previousOnboardingStep,
  processDocumentIntake,
  saveIntakeAnswer,
  submitAgentMessageAction,
  decideAgentProposalAction,
  saveDealBriefAction,
  setIntakeOperation,
  removeIntakeDocument,
  resolveIntakeIssue,
  resolveOnboardingScopeSuggestion,
  revokeOnboardingAdvisorAuthorization,
  reviewIntakeCandidate,
  saveContactStep,
  saveGuidedCompanyProfile,
  saveFundStep,
  saveMandateStep,
  saveOrganizationStep,
  startDocumentIntake,
} from "./actions";

export const dynamic = "force-dynamic";
// Document processing downloads and hashes every file server-side; allow more than the default budget.
export const maxDuration = 60;
export const metadata: Metadata = {title: "Institutional Profile", robots: {index: false, follow: false}};

type Props = {params: Promise<{locale: string}>; searchParams: Promise<{error?: string; section?: string; stage?: string; setup?: string}>};
type AnswerMap = Record<string, Json | undefined>;
type Journey = "company" | "originator" | "capital_provider";
type OrganizationRow = Database["public"]["Tables"]["organizations"]["Row"];
type OnboardingBootstrap = {
  user_id: string;
  organization: Pick<OrganizationRow, "id" | "name" | "legal_name" | "website" | "country_code" | "state_code" | "city" | "sector" | "subsector" | "provider_type" | "description">;
  progress: {journey: Journey; current_step: string; answers: Json; completed_at: string | null};
  profile: {full_name: string | null; job_title: string | null} | null;
  legal_document: {
    id: string;
    title: string;
    version: string;
    document_hash: string;
    rendered_text: string;
    body_sections: Json;
    acceptance_statement: string;
    information_rights_statement: string;
  } | null;
  terms_accepted: boolean;
};
const intakeErrorCodes: readonly string[] = ["documents", "processing", "confirmation", "validation", "session", "save", "step", "duplicate", "remove"];

function jsonObject(value: unknown): AnswerMap {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AnswerMap : {};
}

function answerObject(answers: AnswerMap, key: string): AnswerMap {
  return jsonObject(answers[key]);
}

function text(answer: Json | undefined) {
  return typeof answer === "string" || typeof answer === "number" ? String(answer) : "";
}

function FormContext({locale, returnStep}: {locale: string; returnStep: string}) {
  return (
    <>
      <input name="locale" type="hidden" value={locale} />
      {returnStep ? <input name="return_step" type="hidden" value={returnStep} /> : null}
    </>
  );
}

function StepActions({locale, returnStep, back = true, backLabel, continueLabel}: {locale: string; returnStep: string; back?: boolean; backLabel: string; continueLabel: string}) {
  return (
    <div className="onboarding-actions">
      {back ? (
        returnStep ? (
          <Link className="button button--ghost" href={`/${locale}/onboarding?section=${returnStep}`}>
            <ArrowLeft aria-hidden="true" size={15} />
            <span className="sr-only">{backLabel}</span>
          </Link>
        ) : (
          <button className="button button--ghost" formAction={previousOnboardingStep} formNoValidate>
            <ArrowLeft aria-hidden="true" size={15} />
            <span className="sr-only">{backLabel}</span>
          </button>
        )
      ) : <span />}
      <button className="button" type="submit">{continueLabel}<ArrowRight aria-hidden="true" size={15} /></button>
    </div>
  );
}

function EditSectionLink({locale, target, href, label, add = false}: {locale: string; target?: string; href?: string; label: string; add?: boolean}) {
  return (
    <Link className="onboarding-edit-action" href={href ?? `/${locale}/onboarding?section=${target}`}>
      {add ? <Plus aria-hidden="true" size={13} /> : <PencilLine aria-hidden="true" size={13} />}<span>{label}</span>
    </Link>
  );
}

export default async function OnboardingPage({params, searchParams}: Props) {
  const {locale} = await params;
  const state = await searchParams;
  const [t, tIntake] = await Promise.all([
    getTranslations({locale, namespace: "Onboarding"}),
    getTranslations({locale, namespace: "Intake"}),
  ]);
  const supabase = await createClient();
  if (!supabase) redirect(`/${locale}/login?error=provider`);
  const {data: bootstrapData, error: bootstrapError} = await supabase.rpc("get_onboarding_bootstrap", {p_locale: locale});
  if (bootstrapError || !bootstrapData) {
    if (bootstrapError?.code === "P0002") {
      const {data: workspaceData} = await supabase.rpc("get_workspace_bootstrap");
      const workspace = workspaceData && typeof workspaceData === "object" && !Array.isArray(workspaceData)
        ? workspaceData as Record<string, unknown>
        : null;
      if (workspace?.workspace_ready === true) redirect(`/${locale}/app`);
    }
    redirect(bootstrapError?.code === "42501" ? `/${locale}/login` : `/${locale}/signup?error=session`);
  }
  const bootstrap = bootstrapData as unknown as OnboardingBootstrap;
  const {user_id: userId, organization, progress, profile, legal_document: activeLegalDocument} = bootstrap;
  if (progress.completed_at) redirect(`/${locale}/app`);

  const journey = progress.journey as Journey;
  const persistedStep = progress.current_step;
  const answers = (progress.answers ?? {}) as AnswerMap;
  const organizationAnswers = answerObject(answers, "organization");
  const fundingAnswers = answerObject(answers, "funding");
  const fundAnswers = answerObject(answers, "fund");
  const mandateAnswers = answerObject(answers, "mandate");
  const contactAnswers = answerObject(answers, "contact");
  const intakeSessionId = text(answers.intake_session_id);
  const storedProjectName = text(answers.project_name);
  if (
    journey !== "capital_provider"
    && bootstrap.terms_accepted
    && intakeSessionId
    && state.setup !== "terms"
    && state.setup !== "project"
  ) {
    redirect(`/${locale}/app/new?mode=documents&session=${intakeSessionId}`);
  }
  const intakeReview = journey !== "capital_provider" && intakeSessionId
    ? await loadIntakeReview({supabase, organizationId: organization.id, userId, locale: locale as AppLocale, sessionId: intakeSessionId})
    : null;
  const guidedCompanyAnswers = jsonObject(intakeReview?.session?.company_profile);
  const requestedIntakeStage = state.stage === "company" || state.stage === "operation" || state.stage === "request" || state.stage === "documents"
    ? state.stage
    : undefined;
  const isDocumentFirst = journey !== "capital_provider"
    && Boolean(intakeReview?.session && intakeReview.session.status !== "cancelled");
  // Borrowers and advisors are routed exclusively by `resolveBorrowerOnboardingView` and the
  // seven guided milestones below. These steps belong only to the separate capital-provider
  // onboarding and must never become a second borrower path.
  const providerSteps = ["organization", "fund", "mandate", "contacts", "review"];
  const providerFurthestAvailableIndex = typeof answers.contact_id === "string"
    ? 4
    : typeof answers.mandate_id === "string"
      ? 3
      : typeof answers.fund_id === "string"
        ? 2
        : typeof answers.organization === "object"
          ? 1
          : 0;
  const requestedSection = typeof state.section === "string"
    && journey === "capital_provider"
    && providerSteps.includes(state.section)
    && providerSteps.indexOf(state.section) <= providerFurthestAvailableIndex
    ? state.section
    : null;
  const currentStep = requestedSection ?? persistedStep;
  const returnStep = currentStep !== persistedStep ? persistedStep : "";
  const currentIndex = Math.max(0, providerSteps.indexOf(currentStep));
  const registrationCompletionPercent = Math.round((providerFurthestAvailableIndex / providerSteps.length) * 100);
  const journeyTitle = journey === "company" ? t("journeyCompany") : journey === "originator" ? t("journeyOriginator") : t("journeyProvider");
  const JourneyIcon = journey === "company" ? Building2 : journey === "originator" ? Network : Landmark;
  const projectTitle = storedProjectName || (journey === "company" ? t("workspace.companyProject") : journey === "originator" ? t("workspace.originatorProject") : t("workspace.providerProject"));
  const termsAcceptance = bootstrap.terms_accepted;
  const requestedSetup = state.setup === "terms" || state.setup === "project" ? state.setup : null;
  const onboardingView = resolveBorrowerOnboardingView({
    journey,
    termsAccepted: termsAcceptance,
    requestedSetup,
    session: intakeReview?.session ? {
      id: intakeReview.session.id,
      status: intakeReview.session.status,
      projectName: intakeReview.session.project_name,
    } : null,
  });
  const isPrivateTermsStep = onboardingView === "confidentiality" || onboardingView === "confidentiality_review";
  const isProjectSetupStep = onboardingView === "project_setup" || onboardingView === "project_edit";
  const isPrivateSetupStep = isPrivateTermsStep || isProjectSetupStep;
  const isFirstOnboardingStart = onboardingView === "welcome";
  const welcomeBody = journey === "originator" ? t("workspace.welcomeBodyOriginator") : t("workspace.welcomeBodyCompany");

  const {data: latestProcessingRun} = intakeSessionId
    ? await supabase
        .from("processing_runs")
        .select("id, status, stages")
        .eq("organization_id", organization.id)
        .eq("intake_session_id", intakeSessionId)
        .neq("pipeline_version", "agent-operation-brief-v1")
        .order("run_no", {ascending: false})
        .limit(1)
        .maybeSingle()
    : {data: null};
  const workPlan = latestProcessingRun
    ? projectWorkPlan({
        events: latestProcessingRun.stages,
        expectedDocumentCount: intakeReview?.documents.length ?? 0,
      })
    : null;
  const intakeSession = intakeReview?.session ?? null;
  const trustStatus = intakeSession?.privacy_status === "distribution_authorized"
    ? "authorized"
    : intakeSession?.representation_status === "verified"
      ? "verified"
      : "private";
  const intakeBrief = intakeSession ? dealBriefOf(intakeSession) : {};
  const companyProfileComplete = Boolean(intakeReview?.session?.company_profile_confirmed_at);
  const guidedMilestones = ["company", "operation", "information", "understanding", "clarifications", "package", "investors"] as const;
  const guidedMilestoneIndex = requestedIntakeStage === "company" || !companyProfileComplete
    ? 0
    : requestedIntakeStage === "operation"
      || requestedIntakeStage === "request"
      || !intakeSession?.archetype
      || briefCompleteness(intakeBrief).answered === 0
      ? 1
      : requestedIntakeStage === "documents" || intakeSession.status === "collecting"
        ? 2
        : intakeSession.status === "processing"
          ? 3
          : intakeSession.status === "review_ready"
            ? 4
            : intakeSession.status === "confirmed"
              ? 5
              : 2;
  const flowSteps = journey !== "capital_provider" ? guidedMilestones : providerSteps;
  const flowCurrentIndex = journey !== "capital_provider" ? isDocumentFirst ? guidedMilestoneIndex : -1 : currentIndex;
  const flowAvailableIndex = journey !== "capital_provider" ? isDocumentFirst ? guidedMilestoneIndex : -1 : providerFurthestAvailableIndex;
  const completionPercent = isDocumentFirst
    ? Math.round((guidedMilestoneIndex / (guidedMilestones.length - 1)) * 100)
    : workPlan?.completionPercent ?? registrationCompletionPercent;
  const isFreshGuidedIntake = Boolean(
    intakeSession
    && !companyProfileComplete
    && !intakeSession.archetype
    && briefCompleteness(intakeBrief).answered === 0
    && (intakeReview?.documents.length ?? 0) === 0,
  );
  const flowStepLabel = (step: string) => journey !== "capital_provider"
    ? tIntake(`guided.milestoneLabels.${step}`)
    : t(`workspace.nodes.${journey}.${step}`);
  const flowStepHref = (step: string) => {
    if (journey === "capital_provider") return `/${locale}/onboarding?section=${step}`;
    if (step === "company") return `/${locale}/onboarding?stage=company`;
    if (step === "operation") return `/${locale}/onboarding?stage=operation`;
    if (step === "information") return `/${locale}/onboarding?stage=documents`;
    return `/${locale}/onboarding`;
  };
  const agentAvailable = Boolean(
    intakeSessionId
    && intakeReview?.session?.archetype
    && !["confirmed", "cancelled"].includes(intakeReview.session.status),
  );
  const {data: agentConversation} = agentAvailable
    ? await supabase.from("agent_conversations")
        .select("id, state")
        .eq("organization_id", organization.id)
        .eq("intake_session_id", intakeSessionId)
        .maybeSingle()
    : {data: null};
  const [{data: agentMessages}, {data: agentProposals}] = agentConversation
    ? await Promise.all([
        supabase.from("agent_messages")
          .select("id, role, status, content, proposal_id, metadata")
          .eq("organization_id", organization.id)
          .eq("conversation_id", agentConversation.id)
          .order("created_at", {ascending: true})
          .limit(30),
        supabase.from("agent_change_proposals")
          .select("id, status, title, rationale, impact_summary, proposal")
          .eq("organization_id", organization.id)
          .eq("intake_session_id", intakeSessionId)
          .order("proposed_at", {ascending: true})
          .limit(30),
      ])
    : [{data: []}, {data: []}];

  const errorMessage = state.error === "documents"
    ? t("documentsRequired")
    : state.error === "validation"
      ? t("validationError")
      : state.error && intakeErrorCodes.includes(state.error)
        ? tIntake(`errors.${state.error as IntakeErrorCode}`)
        : state.error
          ? t("error")
          : null;
  const agentCopy = t.raw("workspace.agent") as AgentPanelCopy;
  const breadcrumbLabel = journey === "capital_provider"
    ? t(`workspace.nodes.${journey}.${currentStep}`)
    : onboardingView === "confidentiality" || onboardingView === "confidentiality_review"
      ? t("privateProject.terms.title")
      : onboardingView === "project_setup" || onboardingView === "project_edit"
        ? t("privateProject.project.name")
        : onboardingView === "welcome"
          ? t("workspace.welcomeTitle")
          : flowStepLabel(guidedMilestones[guidedMilestoneIndex]);

  return (
    <main className="workspace-onboarding">
      <aside className="workspace-sidebar">
        <div className="workspace-sidebar__brand"><BrandMark inverted locale={locale as AppLocale} /></div>

        <button aria-disabled="true" className="workspace-switcher" disabled title={t("workspace.comingSoon")} type="button">
          <span className="workspace-switcher__icon"><JourneyIcon aria-hidden="true" size={15} /></span>
          <span><small>{t("workspace.workspaceLabel")}</small><strong>{organization.name}</strong></span>
          <ChevronDown aria-hidden="true" size={14} />
        </button>

        <button aria-disabled="true" className="workspace-search" disabled title={t("workspace.comingSoon")} type="button">
          <Search aria-hidden="true" size={14} />
          <span>{t("workspace.search")}</span>
          <kbd>⌘ K</kbd>
        </button>

        <nav className="workspace-tree" aria-label={t("workspace.navigationLabel")}>
          <div className="workspace-tree__group">
            <p>{t("workspace.workspaceLabel")}</p>
            <div className="workspace-tree__item is-muted"><CircleGauge aria-hidden="true" size={15} /><span>{t("workspace.overview")}</span></div>
            <div className="workspace-tree__item"><Bell aria-hidden="true" size={15} /><span>{t("workspace.notifications")}</span><small>0</small></div>
          </div>

          <div className="workspace-tree__group workspace-tree__projects">
            <p>{t("workspace.projects")}</p>
            <div className="workspace-project">
              <div className="workspace-project__header"><ChevronDown aria-hidden="true" size={13} /><FolderOpen aria-hidden="true" size={15} /><strong>{projectTitle}</strong></div>
              <div className="workspace-project__nodes">
                {flowSteps.map((step, index) => {
                  const nodeClassName = index === flowCurrentIndex ? "workspace-project__node is-current" : index < flowAvailableIndex ? "workspace-project__node is-complete" : index === flowAvailableIndex ? "workspace-project__node is-available" : "workspace-project__node is-locked";
                  const nodeContents = (
                    <>
                      <span>{index < flowAvailableIndex ? <Check aria-hidden="true" size={10} /> : index > flowAvailableIndex ? <LockKeyhole aria-hidden="true" size={10} /> : <ChevronRight aria-hidden="true" size={10} />}</span>
                      <strong>{flowStepLabel(step)}</strong>
                      {index !== flowCurrentIndex && index <= flowAvailableIndex ? <PencilLine aria-hidden="true" size={11} /> : null}
                    </>
                  );

                  return (
                    <div className={nodeClassName} key={step}>
                      {index <= flowAvailableIndex ? (
                        <Link aria-current={index === flowCurrentIndex ? "page" : undefined} className="workspace-node-control" href={flowStepHref(step)}>
                          {nodeContents}
                        </Link>
                      ) : (
                        <span className="workspace-node-control">{nodeContents}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </nav>

        <div className="workspace-sidebar__footer">
          <div className="workspace-sidebar__status"><span /><div><strong>{t(`privateProject.status.${trustStatus}.title`)}</strong><small>{t(`privateProject.status.${trustStatus}.body`)}</small></div></div>
        </div>
      </aside>

      <section className="workspace-shell">
        <header className="workspace-topbar">
          <div className="workspace-breadcrumb"><PanelLeft aria-hidden="true" size={16} /><span>{organization.name}</span><ChevronRight aria-hidden="true" size={12} /><strong>{projectTitle}</strong><ChevronRight aria-hidden="true" size={12} /><em>{breadcrumbLabel}</em></div>
          <div className="workspace-topbar__actions"><span className="workspace-saved"><Check aria-hidden="true" size={12} />{t("workspace.saved")}</span><button aria-disabled="true" aria-label={t("workspace.help")} disabled title={t("workspace.comingSoon")} type="button"><HelpCircle aria-hidden="true" size={16} /></button><button aria-disabled="true" aria-label={t("workspace.notifications")} disabled title={t("workspace.comingSoon")} type="button"><Bell aria-hidden="true" size={16} /></button></div>
        </header>

        <div className="workspace-scroll">
          {!isPrivateTermsStep ? (
            <header className={isFirstOnboardingStart || isPrivateSetupStep ? "workspace-welcome workspace-welcome--intro" : isFreshGuidedIntake ? "workspace-welcome workspace-welcome--start" : "workspace-welcome"}>
              <div>
                <p className="section-kicker">{isFirstOnboardingStart || isPrivateSetupStep ? t("workspace.welcomeEyebrow") : journeyTitle}</p>
                <h1>{isFirstOnboardingStart ? t("workspace.welcomeTitle") : isPrivateSetupStep ? t("privateProject.workspaceTitle") : isFreshGuidedIntake ? t("workspace.startTitle") : t("workspace.progressTitle")}</h1>
                <p>{isFirstOnboardingStart ? welcomeBody : isPrivateSetupStep ? t("privateProject.workspaceBody") : isFreshGuidedIntake ? <>{t("workspace.startBody")} <strong>{t("workspace.startBodyEmphasis")}</strong></> : t("workspace.progressBody")}</p>
              </div>
              {!isFirstOnboardingStart && !isPrivateSetupStep && !isFreshGuidedIntake ? <div className="workspace-readiness-summary"><span>{t("workspace.readiness")}</span><strong>{completionPercent}%</strong><div><i style={{width: `${completionPercent}%`}} /></div></div> : null}
            </header>
          ) : null}

          <div className={isPrivateTermsStep ? "workspace-editor-layout workspace-editor-layout--legal" : isFirstOnboardingStart || isPrivateSetupStep ? "workspace-editor-layout workspace-editor-layout--welcome" : "workspace-editor-layout"}>
            <section className={isPrivateTermsStep ? "onboarding-stage workspace-editor workspace-editor--legal" : isFirstOnboardingStart || isPrivateSetupStep ? "onboarding-stage workspace-editor workspace-editor--welcome" : "onboarding-stage workspace-editor"}>
          {journey === "capital_provider" && !isFirstOnboardingStart ? <header className="onboarding-stage__header">
            <span>{t("workspace.currentActivity")}</span>
            <h2>{t(`workspace.nodes.${journey}.${currentStep}`)}</h2>
            <p>{t(`steps.${journey}.${currentStep}.body`)}</p>
          </header> : null}
          {errorMessage ? <p className="form-notice form-notice--error" role="alert">{errorMessage}</p> : null}

          {onboardingView === "welcome" ? <IntakeStartChoice actions={{start: startDocumentIntake}} context="onboarding" journey={journey as "company" | "originator"} locale={locale} startHref={`/${locale}/onboarding?setup=terms`} /> : null}

          {isPrivateTermsStep || isProjectSetupStep ? (
            <PrivateProjectSetup
              acceptAction={acceptPrivateWorkspaceTerms}
              journey={journey as "company" | "originator"}
              legalDocument={activeLegalDocument}
              locale={locale}
              mode={isPrivateTermsStep ? "terms" : "project"}
              profile={{fullName: profile?.full_name ?? "", jobTitle: profile?.job_title ?? ""}}
              project={{
                name: intakeReview?.session?.project_name ?? storedProjectName,
                identityPolicy: intakeReview?.session?.identity_policy ?? text(answers.identity_policy) ?? "identified_restricted",
              }}
              returnHref={onboardingView === "confidentiality_review" ? `/${locale}/onboarding?setup=project` : `/${locale}/onboarding`}
              startAction={startDocumentIntake}
              termsAccepted={termsAcceptance}
              termsHref={`/${locale}/onboarding?setup=terms`}
            />
          ) : null}

          {currentStep === "organization" && journey === "capital_provider" ? (
            <form action={saveOrganizationStep} className="onboarding-stage__form">
              <FormContext locale={locale} returnStep={returnStep} />
              <div className="form-grid form-grid--onboarding">
                <label className="field field--wide"><span>{t("organizationName")}</span><input defaultValue={organization.name.includes("em cadastro") ? "" : organization.name} maxLength={160} minLength={2} name="organization_name" required /></label>
                <label className="field"><span>{t("legalName")}</span><input defaultValue={organization.legal_name ?? ""} maxLength={200} name="legal_name" /></label>
                <label className="field"><span>{t("legalIdentifier")}</span><input inputMode="numeric" maxLength={40} name="legal_identifier" placeholder={text(organizationAnswers.identifier_last4) ? `•••• ${text(organizationAnswers.identifier_last4)}` : ""} /></label>
                <label className="field"><span>{t("website")}</span><input defaultValue={organization.website ?? ""} maxLength={500} name="website" type="url" /></label>
                <label className="field"><span>{t("phone")}</span><input autoComplete="tel" maxLength={40} name="phone" type="tel" /></label>
                <label className="field"><span>{t("country")}</span><select defaultValue={organization.country_code ?? "BR"} name="country_code"><option value="BR">Brasil</option><option value="US">United States</option><option value="GB">United Kingdom</option></select></label>
                <label className="field"><span>{t("state")}</span><input defaultValue={organization.state_code ?? ""} maxLength={8} name="state_code" /></label>
                <label className="field"><span>{t("city")}</span><input defaultValue={organization.city ?? ""} maxLength={120} name="city" /></label>
                <label className="field"><span>{t("sector")}</span><input defaultValue={organization.sector ?? ""} maxLength={160} name="sector" /></label>
                <label className="field"><span>{t("subsector")}</span><input defaultValue={organization.subsector ?? ""} maxLength={160} name="subsector" /></label>
                {journey === "capital_provider" ? <label className="field"><span>{t("providerType")}</span><select defaultValue={organization.provider_type ?? "fund_manager"} name="provider_type"><option value="fund_manager">{t("providerTypes.fundManager")}</option><option value="fidc_manager">{t("providerTypes.fidcManager")}</option><option value="factor">{t("providerTypes.factor")}</option><option value="bank">{t("providerTypes.bank")}</option><option value="family_office">{t("providerTypes.familyOffice")}</option><option value="alternative_lender">{t("providerTypes.alternative")}</option><option value="other">{t("providerTypes.other")}</option></select></label> : null}
                <label className="field field--wide"><span>{t("description")}</span><textarea defaultValue={organization.description ?? ""} maxLength={2000} name="description" rows={4} /></label>
              </div>
              <StepActions back={false} backLabel={tIntake("errors.back")} continueLabel={t("continue")} locale={locale} returnStep={returnStep} />
            </form>
          ) : null}

          {onboardingView === "guided" && isDocumentFirst ? (
            !intakeReview?.session ? <p className="form-notice form-notice--error">{tIntake("errors.session")}</p> : intakeReview.session.status === "review_ready" ? (
              <IntakeReview
                caseState={await resolveCaseState({
                  supabase,
                  organizationId: organization.id,
                  sessionId: intakeReview.session.id,
                  locale: locale === "en-US" ? "en" : "pt",
                })}
                actions={{accept: acceptHighConfidenceCandidates, confirm: confirmDocumentIntake, process: processDocumentIntake, resolve: resolveIntakeIssue, review: reviewIntakeCandidate, resolveScopeSuggestion: resolveOnboardingScopeSuggestion, revokeAuthorization: revokeOnboardingAdvisorAuthorization}}
                candidates={intakeReview.candidates}
                documents={intakeReview.documents}
                issues={intakeReview.issues}
                locale={locale}
                surface="onboarding"
                session={intakeReview.session}
              />
            ) : (
              <IntakeCollect
                {...(requestedIntakeStage ? {stage: requestedIntakeStage} : {})}
                checklist={await loadIntakeChecklist({
                  supabase,
                  organizationId: organization.id,
                  sessionId: intakeReview.session.id,
                  locale: locale === "en-US" ? "en" : "pt",
                })}
                className="onboarding-stage__form"
                companyProfile={{
                  name: text(guidedCompanyAnswers.name),
                  legalName: text(guidedCompanyAnswers.legal_name),
                  website: text(guidedCompanyAnswers.website),
                  description: text(guidedCompanyAnswers.description),
                  identifierLast4: text(guidedCompanyAnswers.identifier_last4),
                }}
                companyProfileAction={saveGuidedCompanyProfile}
                companyProfileComplete={companyProfileComplete}
                documents={intakeReview.documents}
                locale={locale}
                organizationId={organization.id}
                processAction={processDocumentIntake}
                removeAction={removeIntakeDocument}
                {...(isFreshGuidedIntake ? {backHref: `/${locale}/onboarding?setup=project`} : {})}
                session={intakeReview.session}
                answerAction={saveIntakeAnswer}
                dealBrief={intakeBrief}
                dealBriefAction={saveDealBriefAction}
                setOperationAction={setIntakeOperation}
                resolveScopeSuggestionAction={resolveOnboardingScopeSuggestion}
                revokeAuthorizationAction={revokeOnboardingAdvisorAuthorization}
                surface="onboarding"
                stageBaseHref={`/${locale}/onboarding`}
                userId={userId}
              />
            )
          ) : null}

          {currentStep === "fund" ? (
            <form action={saveFundStep} className="onboarding-stage__form">
              <FormContext locale={locale} returnStep={returnStep} />
              <div className="form-grid form-grid--onboarding">
                <label className="field field--wide"><span>{t("fundName")}</span><input defaultValue={text(fundAnswers.name)} maxLength={200} minLength={2} name="fund_name" required /></label>
                <label className="field field--wide"><span>{t("fundStrategy")}</span><textarea defaultValue={text(fundAnswers.strategy)} maxLength={2000} minLength={2} name="strategy" required rows={5} /></label>
              </div>
              <div className="onboarding-note"><FileText aria-hidden="true" size={18} /><p>{t("multipleFundsNote")}</p></div>
              <StepActions backLabel={tIntake("errors.back")} continueLabel={t("continue")} locale={locale} returnStep={returnStep} />
            </form>
          ) : null}

          {currentStep === "mandate" ? (
            <form action={saveMandateStep} className="onboarding-stage__form">
              <FormContext locale={locale} returnStep={returnStep} />
              <div className="form-grid form-grid--onboarding">
                <label className="field"><span>{t("currencies")}</span><input defaultValue={Array.isArray(mandateAnswers.currencies) ? mandateAnswers.currencies.join(", ") : "BRL"} name="currencies" required /></label>
                <label className="field"><span>{t("geographies")}</span><input defaultValue={Array.isArray(mandateAnswers.geographies) ? mandateAnswers.geographies.join(", ") : "Brasil"} name="geographies" required /></label>
                <label className="field"><span>{t("ticketMin")}</span><input min="1" name="ticket_min" required step="0.01" type="number" /></label>
                <label className="field"><span>{t("ticketMax")}</span><input min="1" name="ticket_max" required step="0.01" type="number" /></label>
                <label className="field"><span>{t("sectors")}</span><input name="sectors" placeholder={t("commaSeparated")} /></label>
                <label className="field"><span>{t("excludedSectors")}</span><input name="excluded_sectors" placeholder={t("commaSeparated")} /></label>
                <label className="field"><span>{t("mandatePurposes")}</span><input name="purposes" placeholder={t("commaSeparated")} /></label>
                <label className="field"><span>{t("structureTypes")}</span><input name="structure_types" placeholder={t("commaSeparated")} /></label>
                <label className="field"><span>{t("seniority")}</span><input name="seniority" placeholder={t("commaSeparated")} /></label>
                <label className="field"><span>{t("collateralTypes")}</span><input name="collateral" placeholder={t("commaSeparated")} /></label>
                <label className="field"><span>{t("termMin")}</span><input max="360" min="1" name="term_min" type="number" /></label>
                <label className="field"><span>{t("termMax")}</span><input max="360" min="1" name="term_max" type="number" /></label>
                <label className="field"><span>{t("pricing")}</span><input name="pricing" /></label>
                <label className="field"><span>{t("validUntil")}</span><input name="valid_until" type="date" /></label>
                <label className="field field--wide"><span>{t("exclusions")}</span><textarea maxLength={3000} name="exclusions" rows={3} /></label>
              </div>
              <StepActions backLabel={tIntake("errors.back")} continueLabel={t("continue")} locale={locale} returnStep={returnStep} />
            </form>
          ) : null}

          {currentStep === "contacts" ? (
            <form action={saveContactStep} className="onboarding-stage__form">
              <FormContext locale={locale} returnStep={returnStep} />
              <div className="form-grid form-grid--onboarding">
                <label className="field"><span>{t("contactName")}</span><input defaultValue={text(contactAnswers.full_name)} name="contact_name" required /></label>
                <label className="field"><span>{t("contactTitle")}</span><input name="contact_title" /></label>
                <label className="field"><span>{t("contactEmail")}</span><input defaultValue={text(contactAnswers.email)} name="contact_email" required type="email" /></label>
                <label className="field"><span>{t("phone")}</span><input name="contact_phone" type="tel" /></label>
                <label className="field"><span>{t("routingSectors")}</span><input name="routing_sectors" placeholder={t("commaSeparated")} /></label>
                <label className="field"><span>{t("routingGeographies")}</span><input name="routing_geographies" placeholder={t("commaSeparated")} /></label>
                <label className="field"><span>{t("routingTicket")}</span><input name="routing_ticket" /></label>
                <label className="field"><span>{t("routingOperations")}</span><input name="routing_operations" placeholder={t("commaSeparated")} /></label>
              </div>
              <StepActions backLabel={tIntake("errors.back")} continueLabel={t("review")} locale={locale} returnStep={returnStep} />
            </form>
          ) : null}

          {(journey === "capital_provider" && currentStep === "review") || onboardingView === "completion" ? (
            <form action={completeOnboarding} className="onboarding-stage__form">
              <FormContext locale={locale} returnStep="" />
              <div className="onboarding-review">
                <article><span>01</span><div><strong>{organization.name}</strong><p>{organization.legal_name || t("notProvided")}</p></div><EditSectionLink {...(journey === "capital_provider" ? {} : {href: `/${locale}/onboarding?stage=company`})} label={t("workspace.edit")} locale={locale} target="organization" /></article>
                {journey === "capital_provider" ? (
                  <>
                    <article><span>02</span><div><strong>{text(fundAnswers.name)}</strong><p>{text(fundAnswers.strategy)}</p></div><EditSectionLink label={t("workspace.edit")} locale={locale} target="fund" /></article>
                    <article><span>03</span><div><strong>{t("mandateReady")}</strong><p>{t("mandateReviewBody")}</p></div><EditSectionLink label={t("workspace.edit")} locale={locale} target="mandate" /></article>
                    <article><span>04</span><div><strong>{text(contactAnswers.full_name)}</strong><p>{text(contactAnswers.email)}</p></div><EditSectionLink label={t("workspace.edit")} locale={locale} target="contacts" /></article>
                  </>
                ) : (
                  <>
                    <article><span>02</span><div><strong>{text(fundingAnswers.purpose_summary)}</strong><p>{text(fundingAnswers.currency)} {text(fundingAnswers.requested_amount)}</p></div><EditSectionLink href={`/${locale}/onboarding?stage=request`} label={t("workspace.edit")} locale={locale} /></article>
                    <article><span>03</span><div><strong>{t("documentsReady", {count: Number(answers.documents_uploaded ?? 0)})}</strong><p>{t("documentsReviewBody")}</p></div><EditSectionLink add href={`/${locale}/onboarding?stage=documents`} label={t("workspace.addDocuments")} locale={locale} /></article>
                  </>
                )}
              </div>
              <div className="onboarding-submit-note"><strong>{t("reviewNoticeTitle")}</strong><p>{journey === "capital_provider" ? t("reviewNoticeProvider") : t("reviewNoticeOriginating")}</p></div>
              <div className="onboarding-actions">
                {journey === "capital_provider" ? (
                  <button className="button button--ghost" formAction={previousOnboardingStep} formNoValidate><ArrowLeft aria-hidden="true" size={15} /></button>
                ) : (
                  <Link className="button button--ghost" href={`/${locale}/onboarding?stage=documents`}><ArrowLeft aria-hidden="true" size={15} /></Link>
                )}
                <button className="button" type="submit">{journey === "capital_provider" ? t("activateMandate") : t("submitOpportunity")}<ArrowRight aria-hidden="true" size={15} /></button>
              </div>
            </form>
          ) : null}
            </section>

            {!isFirstOnboardingStart && !isPrivateSetupStep ? <aside className="workspace-inspector">
              <section className="workspace-inspector__panel">
                <div className="workspace-inspector__heading"><div><span>{t("workspace.casePreparation")}</span><strong>{t("workspace.inConstruction")}</strong></div><span className="workspace-inspector__percent">{completionPercent}%</span></div>
                <div className="workspace-inspector__bar"><i style={{width: `${completionPercent}%`}} /></div>
                <div className={workPlan ? "workspace-checklist workspace-checklist--work-plan" : "workspace-checklist"}>
                  {workPlan ? workPlan.tasks.map((task) => (
                    <div className={`is-${task.status}`} key={task.id}>
                      <span>{task.status === "completed" ? <Check aria-hidden="true" size={11} /> : task.status === "running" ? <LoaderCircle aria-hidden="true" size={11} /> : null}</span>
                      <p>
                        <strong>{t(`workspace.workPlan.tasks.${task.id}`)}</strong>
                        <small>{t(`workspace.workPlan.status.${task.status as WorkPlanStatus}`)}</small>
                      </p>
                    </div>
                  )) : flowSteps.map((step, index) => (
                    <div className={index < flowCurrentIndex ? "is-complete" : index === flowCurrentIndex ? "is-current" : ""} key={step}>
                      <span>{index < flowCurrentIndex ? <Check aria-hidden="true" size={11} /> : null}</span>
                      <p><strong>{flowStepLabel(step)}</strong><small>{index < flowCurrentIndex ? t("workspace.complete") : index === flowCurrentIndex ? t("workspace.now") : t("workspace.later")}</small></p>
                    </div>
                  ))}
                </div>
              </section>

              {agentAvailable ? (
                <AgentPanel
                  copy={agentCopy}
                  conversationState={agentConversation?.state ?? "idle"}
                  decideAction={decideAgentProposalAction}
                  locale={locale}
                  messages={agentMessages ?? []}
                  proposals={agentProposals ?? []}
                  sessionId={intakeSessionId}
                  submitAction={submitAgentMessageAction}
                />
              ) : (
                <section className="workspace-inspector__panel workspace-inspector__guidance">
                  <span>{t("workspace.guidanceEyebrow")}</span>
                  <h3>{t("workspace.guidanceTitle")}</h3>
                  <p>{t("workspace.guidanceBody")}</p>
                  <div><Check aria-hidden="true" size={13} /><span>{t("workspace.autoSave")}</span></div>
                </section>
              )}
            </aside> : null}
          </div>
        </div>
      </section>
    </main>
  );
}
