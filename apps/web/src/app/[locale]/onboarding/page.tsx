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
  Network,
  PanelLeft,
  PencilLine,
  Plus,
  Search,
} from "lucide-react";
import type {Metadata} from "next";
import {getTranslations} from "next-intl/server";
import Link from "next/link";
import {redirect} from "next/navigation";

import {BrandMark} from "@/components/brand-mark";
import {IntakeCollect} from "@/components/intake/intake-collect";
import {buildCaseState} from "@/lib/intake/case-pipeline";
import {loadIntakeChecklist} from "@/lib/intake/checklist";
import {IntakeReview} from "@/components/intake/intake-review";
import {IntakeStartChoice} from "@/components/intake/intake-start-choice";
import {OnboardingDocumentUploader} from "@/components/onboarding-document-uploader";
import type {AppLocale} from "@/i18n/routing";
import {loadIntakeReview} from "@/lib/intake/server";
import type {IntakeErrorCode} from "@/lib/intake/types";
import {createClient} from "@/lib/supabase/server";
import type {Json} from "@/types/database";

import {
  acceptHighConfidenceCandidates,
  chooseManualIntake,
  completeOnboarding,
  confirmDocumentIntake,
  finishDocumentsStep,
  previousOnboardingStep,
  processDocumentIntake,
  saveIntakeAnswer,
  setIntakeOperation,
  removeIntakeDocument,
  resolveIntakeIssue,
  reviewIntakeCandidate,
  saveAdvisedCompanyStep,
  saveContactStep,
  saveFundingStep,
  saveFundStep,
  saveMandateStep,
  saveOrganizationStep,
  startDocumentIntake,
} from "./actions";

export const dynamic = "force-dynamic";
// Document processing downloads and hashes every file server-side; allow more than the default budget.
export const maxDuration = 60;
export const metadata: Metadata = {title: "Institutional Profile", robots: {index: false, follow: false}};

type Props = {params: Promise<{locale: string}>; searchParams: Promise<{error?: string; section?: string}>};
type AnswerMap = Record<string, Json | undefined>;
type Journey = "company" | "originator" | "capital_provider";
const intakeErrorCodes: readonly string[] = ["documents", "processing", "confirmation", "validation", "session", "save", "step", "duplicate", "remove"];

function answerObject(answers: AnswerMap, key: string): AnswerMap {
  const value = answers[key];
  return value && typeof value === "object" && !Array.isArray(value) ? value as AnswerMap : {};
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

function EditSectionLink({locale, target, label, add = false}: {locale: string; target: string; label: string; add?: boolean}) {
  return (
    <Link className="onboarding-edit-action" href={`/${locale}/onboarding?section=${target}`}>
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

  const {data: claimsData, error: claimsError} = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (claimsError || !userId) redirect(`/${locale}/login`);
  const {data: membership} = await supabase.from("organization_memberships").select("organization_id").eq("user_id", userId).eq("status", "active").limit(1).maybeSingle();
  if (!membership) redirect(`/${locale}/signup?error=session`);
  const [{data: organization}, {data: progress}] = await Promise.all([
    supabase.from("organizations").select("id, name, legal_name, website, country_code, state_code, city, sector, subsector, provider_type, description").eq("id", membership.organization_id).single(),
    supabase.from("onboarding_progress").select("journey, current_step, answers, completed_at").eq("organization_id", membership.organization_id).eq("user_id", userId).maybeSingle(),
  ]);
  if (!organization || !progress) redirect(`/${locale}/signup?error=session`);
  if (progress.completed_at) redirect(`/${locale}/app`);

  const journey = progress.journey as Journey;
  const persistedStep = progress.current_step;
  const answers = (progress.answers ?? {}) as AnswerMap;
  const organizationAnswers = answerObject(answers, "organization");
  const companyAnswers = answerObject(answers, "advised_company");
  const fundingAnswers = answerObject(answers, "funding");
  const fundAnswers = answerObject(answers, "fund");
  const mandateAnswers = answerObject(answers, "mandate");
  const contactAnswers = answerObject(answers, "contact");
  const intakeMode = text(answers.intake_mode);
  const intakeSessionId = text(answers.intake_session_id);
  const isDocumentFirst = journey !== "capital_provider" && intakeMode === "documents";
  const steps = isDocumentFirst
    ? ["documents", "review"]
    : journey === "company"
    ? ["organization", "funding", "documents", "review"]
    : journey === "originator"
      ? ["organization", "company", "funding", "documents", "review"]
      : ["organization", "fund", "mandate", "contacts", "review"];
  const furthestAvailableIndex = isDocumentFirst
    ? Number(answers.documents_uploaded ?? 0) > 0 ? 1 : 0
    : journey === "company"
    ? Number(answers.documents_uploaded ?? 0) > 0 ? 3 : typeof answers.opportunity_id === "string" ? 2 : typeof answers.company_id === "string" ? 1 : 0
    : journey === "originator"
      ? Number(answers.documents_uploaded ?? 0) > 0 ? 4 : typeof answers.opportunity_id === "string" ? 3 : typeof answers.company_id === "string" ? 2 : typeof answers.organization === "object" ? 1 : 0
      : typeof answers.contact_id === "string" ? 4 : typeof answers.mandate_id === "string" ? 3 : typeof answers.fund_id === "string" ? 2 : typeof answers.organization === "object" ? 1 : 0;
  const requestedSection = typeof state.section === "string"
    && steps.includes(state.section)
    && steps.indexOf(state.section) <= furthestAvailableIndex
    ? state.section
    : null;
  const currentStep = requestedSection ?? persistedStep;
  const returnStep = currentStep !== persistedStep ? persistedStep : "";
  const currentIndex = Math.max(0, steps.indexOf(currentStep));
  const completedCount = furthestAvailableIndex;
  const completionPercent = Math.max(12, Math.round((completedCount / steps.length) * 100));
  const journeyTitle = journey === "company" ? t("journeyCompany") : journey === "originator" ? t("journeyOriginator") : t("journeyProvider");
  const JourneyIcon = journey === "company" ? Building2 : journey === "originator" ? Network : Landmark;
  const projectTitle = journey === "company" ? t("workspace.companyProject") : journey === "originator" ? t("workspace.originatorProject") : t("workspace.providerProject");

  let documents: Array<{id: string; original_name: string; byte_size: number | null}> = [];
  const opportunityId = text(answers.opportunity_id);
  const intakeReview = isDocumentFirst && intakeSessionId
    ? await loadIntakeReview({supabase, organizationId: organization.id, userId, locale: locale as AppLocale, sessionId: intakeSessionId})
    : null;
  if (!intakeReview && currentStep === "documents" && opportunityId) {
    const result = await supabase.from("source_documents").select("id, original_name, byte_size").eq("organization_id", organization.id).eq("opportunity_id", opportunityId).order("created_at");
    documents = result.data ?? [];
  }

  const errorMessage = state.error === "documents"
    ? t("documentsRequired")
    : state.error === "validation"
      ? t("validationError")
      : state.error && intakeErrorCodes.includes(state.error)
        ? tIntake(`errors.${state.error as IntakeErrorCode}`)
        : state.error
          ? t("error")
          : null;

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
                {steps.map((step, index) => {
                  const nodeClassName = index === currentIndex ? "workspace-project__node is-current" : index < furthestAvailableIndex ? "workspace-project__node is-complete" : index === furthestAvailableIndex ? "workspace-project__node is-available" : "workspace-project__node is-locked";
                  const nodeContents = (
                    <>
                      <span>{index < furthestAvailableIndex ? <Check aria-hidden="true" size={10} /> : index > furthestAvailableIndex ? <LockKeyhole aria-hidden="true" size={10} /> : <ChevronRight aria-hidden="true" size={10} />}</span>
                      <strong>{t(`workspace.nodes.${journey}.${step}`)}</strong>
                      {index !== currentIndex && index <= furthestAvailableIndex ? <PencilLine aria-hidden="true" size={11} /> : null}
                    </>
                  );

                  return (
                    <div className={nodeClassName} key={step}>
                      {index <= furthestAvailableIndex ? (
                        <Link aria-current={index === currentIndex ? "page" : undefined} className="workspace-node-control" href={`/${locale}/onboarding?section=${step}`}>
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
          <div className="workspace-sidebar__status"><span /><div><strong>{t("workspace.privateWorkspace")}</strong><small>{t("workspace.privateWorkspaceBody")}</small></div></div>
        </div>
      </aside>

      <section className="workspace-shell">
        <header className="workspace-topbar">
          <div className="workspace-breadcrumb"><PanelLeft aria-hidden="true" size={16} /><span>{organization.name}</span><ChevronRight aria-hidden="true" size={12} /><strong>{projectTitle}</strong><ChevronRight aria-hidden="true" size={12} /><em>{t(`workspace.nodes.${journey}.${currentStep}`)}</em></div>
          <div className="workspace-topbar__actions"><span className="workspace-saved"><Check aria-hidden="true" size={12} />{t("workspace.saved")}</span><button aria-disabled="true" aria-label={t("workspace.help")} disabled title={t("workspace.comingSoon")} type="button"><HelpCircle aria-hidden="true" size={16} /></button><button aria-disabled="true" aria-label={t("workspace.notifications")} disabled title={t("workspace.comingSoon")} type="button"><Bell aria-hidden="true" size={16} /></button></div>
        </header>

        <div className="workspace-scroll">
          <header className="workspace-welcome">
            <div><p className="section-kicker">{journeyTitle}</p><h1>{t("workspace.welcomeTitle")}</h1><p>{t("workspace.welcomeBody")}</p></div>
            <div className="workspace-readiness-summary"><span>{t("workspace.readiness")}</span><strong>{completionPercent}%</strong><div><i style={{width: `${completionPercent}%`}} /></div></div>
          </header>

          <div className="workspace-editor-layout">
            <section className="onboarding-stage workspace-editor">
          <header className="onboarding-stage__header">
            <span>{t("workspace.currentActivity")}</span>
            <h2>{t(`workspace.nodes.${journey}.${currentStep}`)}</h2>
            <p>{t(`steps.${journey}.${currentStep}.body`)}</p>
          </header>
          {errorMessage ? <p className="form-notice form-notice--error" role="alert">{errorMessage}</p> : null}

          {currentStep === "organization" && journey !== "capital_provider" && !intakeMode ? <IntakeStartChoice actions={{start: startDocumentIntake, manual: chooseManualIntake}} context="onboarding" locale={locale} /> : null}

          {currentStep === "organization" && (journey === "capital_provider" || intakeMode === "manual") ? (
            <form action={saveOrganizationStep} className="onboarding-stage__form">
              <FormContext locale={locale} returnStep={returnStep} />
              <div className="form-grid form-grid--onboarding">
                <label className="field field--wide"><span>{journey === "company" ? t("companyName") : t("organizationName")}</span><input defaultValue={organization.name.includes("em cadastro") ? "" : organization.name} maxLength={160} minLength={2} name="organization_name" required /></label>
                <label className="field"><span>{t("legalName")}</span><input defaultValue={organization.legal_name ?? ""} maxLength={200} name="legal_name" /></label>
                <label className="field"><span>{t("legalIdentifier")}</span><input aria-describedby="identifier-note" inputMode="numeric" maxLength={40} name="legal_identifier" placeholder={text(organizationAnswers.identifier_last4) ? `•••• ${text(organizationAnswers.identifier_last4)}` : ""} /><small id="identifier-note">{t("identifierNote")}</small></label>
                <label className="field"><span>{t("website")}</span><input defaultValue={organization.website ?? ""} maxLength={500} name="website" type="url" /></label>
                <label className="field"><span>{t("phone")}</span><input autoComplete="tel" maxLength={40} name="phone" type="tel" /></label>
                <label className="field"><span>{t("country")}</span><select defaultValue={organization.country_code ?? "BR"} name="country_code"><option value="BR">Brasil</option><option value="US">United States</option><option value="GB">United Kingdom</option></select></label>
                <label className="field"><span>{t("state")}</span><input defaultValue={organization.state_code ?? ""} maxLength={8} name="state_code" /></label>
                <label className="field"><span>{t("city")}</span><input defaultValue={organization.city ?? ""} maxLength={120} name="city" /></label>
                <label className="field"><span>{t("sector")}</span><input defaultValue={organization.sector ?? ""} maxLength={160} name="sector" /></label>
                <label className="field"><span>{t("subsector")}</span><input defaultValue={organization.subsector ?? ""} maxLength={160} name="subsector" /></label>
                {journey === "capital_provider" ? <label className="field"><span>{t("providerType")}</span><select defaultValue={organization.provider_type ?? "fund_manager"} name="provider_type"><option value="fund_manager">{t("providerTypes.fundManager")}</option><option value="fidc_manager">{t("providerTypes.fidcManager")}</option><option value="factor">{t("providerTypes.factor")}</option><option value="bank">{t("providerTypes.bank")}</option><option value="family_office">{t("providerTypes.familyOffice")}</option><option value="alternative_lender">{t("providerTypes.alternative")}</option><option value="other">{t("providerTypes.other")}</option></select></label> : null}
                {journey !== "company" ? <label className="field field--wide"><span>{t("description")}</span><textarea defaultValue={organization.description ?? ""} maxLength={2000} name="description" rows={4} /></label> : null}
              </div>
              <StepActions back={false} backLabel={tIntake("errors.back")} continueLabel={t("continue")} locale={locale} returnStep={returnStep} />
            </form>
          ) : null}

          {currentStep === "company" ? (
            <form action={saveAdvisedCompanyStep} className="onboarding-stage__form">
              <FormContext locale={locale} returnStep={returnStep} />
              <div className="form-grid form-grid--onboarding">
                <label className="field"><span>{t("companyName")}</span><input defaultValue={text(companyAnswers.display_name)} maxLength={160} minLength={2} name="company_name" required /></label>
                <label className="field"><span>{t("legalName")}</span><input defaultValue={text(companyAnswers.legal_name)} maxLength={200} minLength={2} name="company_legal_name" required /></label>
                <label className="field"><span>{t("legalIdentifier")}</span><input inputMode="numeric" maxLength={40} name="legal_identifier" /></label>
                <label className="field"><span>{t("country")}</span><select defaultValue="BR" name="country_code"><option value="BR">Brasil</option><option value="US">United States</option></select></label>
                <label className="field"><span>{t("website")}</span><input defaultValue={text(companyAnswers.website)} name="website" type="url" /></label>
                <label className="field"><span>{t("sector")}</span><input defaultValue={text(companyAnswers.sector)} name="sector" /></label>
                <label className="field"><span>{t("subsector")}</span><input defaultValue={text(companyAnswers.subsector)} name="subsector" /></label>
                <label className="field"><span>{t("relationship")}</span><select defaultValue={text(companyAnswers.relationship) || "engaged_advisor"} name="relationship"><option value="engaged_advisor">{t("relationships.engaged")}</option><option value="exclusive_mandate">{t("relationships.exclusive")}</option><option value="company_authorized">{t("relationships.authorized")}</option></select></label>
                <label className="field"><span>{t("authorityKind")}</span><select defaultValue={text(companyAnswers.authority_kind) || "mandate"} name="authority_kind"><option value="mandate">{t("authorityKinds.mandate")}</option><option value="power_of_attorney">{t("authorityKinds.power")}</option><option value="board_resolution">{t("authorityKinds.board")}</option><option value="other">{t("authorityKinds.other")}</option></select></label>
                <label className="field"><span>{t("authorityReference")}</span><input defaultValue={text(companyAnswers.authority_reference)} name="authority_reference" /></label>
                <label className="field"><span>{t("companyContact")}</span><input defaultValue={text(companyAnswers.contact_name)} name="company_contact_name" /></label>
                <label className="field"><span>{t("companyContactEmail")}</span><input defaultValue={text(companyAnswers.contact_email)} name="company_contact_email" type="email" /></label>
              </div>
              <StepActions backLabel={tIntake("errors.back")} continueLabel={t("continue")} locale={locale} returnStep={returnStep} />
            </form>
          ) : null}

          {currentStep === "funding" ? (
            <form action={saveFundingStep} className="onboarding-stage__form">
              <FormContext locale={locale} returnStep={returnStep} />
              <div className="form-grid form-grid--onboarding">
                <label className="field"><span>{t("purposeCategory")}</span><select defaultValue={text(fundingAnswers.purpose_category) || "growth"} name="purpose_category"><option value="working_capital">{t("purposes.workingCapital")}</option><option value="growth">{t("purposes.growth")}</option><option value="capex">Capex</option><option value="acquisition">{t("purposes.acquisition")}</option><option value="equipment">{t("purposes.equipment")}</option><option value="refinance">{t("purposes.refinance")}</option><option value="other">{t("purposes.other")}</option></select></label>
                <label className="field"><span>{t("desiredTiming")}</span><input defaultValue={text(fundingAnswers.desired_timing)} maxLength={500} name="desired_timing" /></label>
                <label className="field field--wide"><span>{t("purposeSummary")}</span><textarea defaultValue={text(fundingAnswers.purpose_summary)} maxLength={500} minLength={3} name="purpose_summary" required rows={3} /></label>
                <label className="field field--wide"><span>{t("rationale")}</span><textarea defaultValue={text(fundingAnswers.rationale)} maxLength={4000} name="rationale" required rows={4} /></label>
                <label className="field"><span>{t("requestedAmount")}</span><input defaultValue={text(fundingAnswers.requested_amount)} min="1" name="requested_amount" required step="0.01" type="number" /></label>
                <label className="field"><span>{t("currency")}</span><select defaultValue={text(fundingAnswers.currency) || "BRL"} name="currency"><option value="BRL">BRL</option><option value="USD">USD</option><option value="EUR">EUR</option></select></label>
                <label className="field"><span>{t("desiredTerm")}</span><input defaultValue={text(fundingAnswers.desired_term_months)} max="360" min="1" name="desired_term_months" type="number" /></label>
                <label className="field"><span>{t("repaymentSource")}</span><input defaultValue={text(fundingAnswers.repayment_source)} maxLength={2000} name="repayment_source" /></label>
                <label className="field field--wide"><span>{t("strategicImportance")}</span><textarea defaultValue={text(fundingAnswers.strategic_importance)} maxLength={3000} name="strategic_importance" rows={3} /></label>
                <label className="field field--wide"><span>{t("expectedOutcome")}</span><textarea defaultValue={text(fundingAnswers.expected_outcome)} maxLength={3000} name="expected_outcome" rows={3} /></label>
                <label className="field field--wide"><span>{t("collateral")}</span><textarea defaultValue={text(fundingAnswers.collateral_summary)} maxLength={2000} name="collateral_summary" rows={3} /></label>
              </div>
              <StepActions backLabel={tIntake("errors.back")} continueLabel={t("continue")} locale={locale} returnStep={returnStep} />
            </form>
          ) : null}

          {currentStep === "documents" && isDocumentFirst ? (
            !intakeReview?.session ? <p className="form-notice form-notice--error">{tIntake("errors.session")}</p> : intakeReview.session.status === "review_ready" ? (
              <IntakeReview
                caseState={await buildCaseState({
                  supabase,
                  organizationId: organization.id,
                  sessionId: intakeReview.session.id,
                  locale: locale === "en-US" ? "en" : "pt",
                })}
                actions={{accept: acceptHighConfidenceCandidates, confirm: confirmDocumentIntake, process: processDocumentIntake, resolve: resolveIntakeIssue, review: reviewIntakeCandidate}}
                candidates={intakeReview.candidates}
                documents={intakeReview.documents}
                issues={intakeReview.issues}
                locale={locale}
                session={intakeReview.session}
              />
            ) : (
              <IntakeCollect
                checklist={await loadIntakeChecklist({
                  supabase,
                  organizationId: organization.id,
                  sessionId: intakeReview.session.id,
                  locale: locale === "en-US" ? "en" : "pt",
                })}
                className="onboarding-stage__form"
                documents={intakeReview.documents}
                locale={locale}
                organizationId={organization.id}
                processAction={processDocumentIntake}
                removeAction={removeIntakeDocument}
                session={intakeReview.session}
                answerAction={saveIntakeAnswer}
                setOperationAction={setIntakeOperation}
                userId={userId}
              />
            )
          ) : currentStep === "documents" ? (
            <div className="onboarding-stage__form">
              <OnboardingDocumentUploader copy={{
                title: t("uploadTitle"),
                body: t("uploadBody"),
                choose: t("uploadChoose"),
                drop: t("uploadDrop"),
                uploading: t("uploading"),
                error: t("uploadError"),
                categories: t("uploadCategories"),
                received: t("uploadReceived"),
                guidanceTitle: t("uploadGuidanceTitle"),
                guidanceBody: t("uploadGuidanceBody"),
                essential: {title: t("uploadGuidance.essential.title"), items: [t("uploadGuidance.essential.financials"), t("uploadGuidance.essential.trialBalances"), t("uploadGuidance.essential.debtSchedule")]},
                recommended: {title: t("uploadGuidance.recommended.title"), items: [t("uploadGuidance.recommended.projections"), t("uploadGuidance.recommended.presentation"), t("uploadGuidance.recommended.transaction")]},
                complementary: {title: t("uploadGuidance.complementary.title"), items: [t("uploadGuidance.complementary.contracts"), t("uploadGuidance.complementary.cim"), t("uploadGuidance.complementary.other")]},
              }} initialDocuments={documents} opportunityId={opportunityId} organizationId={organization.id} userId={userId} />
              <form action={finishDocumentsStep}><FormContext locale={locale} returnStep={returnStep} /><StepActions backLabel={tIntake("errors.back")} continueLabel={t("review")} locale={locale} returnStep={returnStep} /></form>
            </div>
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

          {currentStep === "review" ? (
            <form action={completeOnboarding} className="onboarding-stage__form">
              <FormContext locale={locale} returnStep="" />
              <div className="onboarding-review">
                <article><span>01</span><div><strong>{organization.name}</strong><p>{organization.legal_name || t("notProvided")}</p></div><EditSectionLink label={t("workspace.edit")} locale={locale} target="organization" /></article>
                {journey === "capital_provider" ? (
                  <>
                    <article><span>02</span><div><strong>{text(fundAnswers.name)}</strong><p>{text(fundAnswers.strategy)}</p></div><EditSectionLink label={t("workspace.edit")} locale={locale} target="fund" /></article>
                    <article><span>03</span><div><strong>{t("mandateReady")}</strong><p>{t("mandateReviewBody")}</p></div><EditSectionLink label={t("workspace.edit")} locale={locale} target="mandate" /></article>
                    <article><span>04</span><div><strong>{text(contactAnswers.full_name)}</strong><p>{text(contactAnswers.email)}</p></div><EditSectionLink label={t("workspace.edit")} locale={locale} target="contacts" /></article>
                  </>
                ) : (
                  <>
                    <article><span>02</span><div><strong>{text(fundingAnswers.purpose_summary)}</strong><p>{text(fundingAnswers.currency)} {text(fundingAnswers.requested_amount)}</p></div><EditSectionLink label={t("workspace.edit")} locale={locale} target="funding" /></article>
                    <article><span>03</span><div><strong>{t("documentsReady", {count: Number(answers.documents_uploaded ?? 0)})}</strong><p>{t("documentsReviewBody")}</p></div><EditSectionLink add label={t("workspace.addDocuments")} locale={locale} target="documents" /></article>
                  </>
                )}
              </div>
              <div className="onboarding-submit-note"><strong>{t("reviewNoticeTitle")}</strong><p>{journey === "capital_provider" ? t("reviewNoticeProvider") : t("reviewNoticeOriginating")}</p></div>
              <div className="onboarding-actions">
                <button className="button button--ghost" formAction={previousOnboardingStep} formNoValidate><ArrowLeft aria-hidden="true" size={15} /></button>
                <button className="button" type="submit">{journey === "capital_provider" ? t("activateMandate") : t("submitOpportunity")}<ArrowRight aria-hidden="true" size={15} /></button>
              </div>
            </form>
          ) : null}
            </section>

            <aside className="workspace-inspector">
              <section className="workspace-inspector__panel">
                <div className="workspace-inspector__heading"><div><span>{t("workspace.casePreparation")}</span><strong>{t("workspace.inConstruction")}</strong></div><span className="workspace-inspector__percent">{completionPercent}%</span></div>
                <div className="workspace-inspector__bar"><i style={{width: `${completionPercent}%`}} /></div>
                <div className="workspace-checklist">
                  {steps.map((step, index) => (
                    <div className={index < currentIndex ? "is-complete" : index === currentIndex ? "is-current" : ""} key={step}>
                      <span>{index < currentIndex ? <Check aria-hidden="true" size={11} /> : null}</span>
                      <p><strong>{t(`workspace.nodes.${journey}.${step}`)}</strong><small>{index < currentIndex ? t("workspace.complete") : index === currentIndex ? t("workspace.now") : t("workspace.later")}</small></p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="workspace-inspector__panel workspace-inspector__guidance">
                <span>{t("workspace.guidanceEyebrow")}</span>
                <h3>{t("workspace.guidanceTitle")}</h3>
                <p>{t("workspace.guidanceBody")}</p>
                <div><Check aria-hidden="true" size={13} /><span>{t("workspace.autoSave")}</span></div>
              </section>
            </aside>
          </div>
        </div>
      </section>
    </main>
  );
}
