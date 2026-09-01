import {ArrowLeft} from "lucide-react";
import type {Metadata} from "next";
import Link from "next/link";
import {getTranslations} from "next-intl/server";
import {redirect} from "next/navigation";

import {IntakeCollect} from "@/components/intake/intake-collect";
import {resolveCaseState} from "@/lib/intake/case-pipeline";
import {loadIntakeChecklist} from "@/lib/intake/checklist";
import {canStartPreliminaryUnderstanding, dealBriefOf} from "@/lib/intake/deal-brief";
import {IntakeReview} from "@/components/intake/intake-review";
import {PrivateProjectSetup} from "@/components/intake/private-project-setup";
import {loadPreliminaryUnderstanding} from "@/lib/intake/preliminary-understanding";
import type {AppLocale} from "@/i18n/routing";
import {requireWorkspace} from "@/lib/auth/workspace";
import {loadIntakeCollection, loadIntakeReview} from "@/lib/intake/server";
import type {IntakeErrorCode} from "@/lib/intake/types";
import type {Json} from "@/types/database";

import {
  acceptWorkspaceIntakeCandidates,
  acceptWorkspacePrivateTerms,
  confirmWorkspaceDocumentIntake,
  decideWorkspacePreliminaryUnderstanding,
  processWorkspaceDocumentIntake,
  saveWorkspaceIntakeAnswer,
  saveWorkspaceDealBrief,
  setWorkspaceIntakeOperation,
  removeWorkspaceIntakeDocument,
  resolveWorkspaceIntakeIssue,
  resolveWorkspaceScopeSuggestion,
  revokeWorkspaceAdvisorAuthorization,
  reviewWorkspaceIntakeCandidate,
  reviseWorkspaceDiagnosticCase,
  saveWorkspaceGuidedCompanyProfile,
  startWorkspaceDocumentIntake,
} from "./actions";

type Props = {
  params: Promise<{locale: string}>;
  searchParams: Promise<{edit?: string; error?: string; mode?: string; session?: string; setup?: string; stage?: string; step?: string}>;
};

type WorkspaceProjectSetup = {
  profile?: {full_name?: string; job_title?: string};
  legal_document?: {
    title: string;
    version: string;
    rendered_text: string;
    body_sections: Json;
    acceptance_statement: string;
    information_rights_statement: string;
  } | null;
  terms_accepted?: boolean;
};

export const dynamic = "force-dynamic";
// Processing downloads and hashes every document server-side; allow more than the default budget.
export const maxDuration = 60;
export const metadata: Metadata = {title: "New Opportunity", robots: {index: false, follow: false}};

const intakeErrorCodes: readonly string[] = ["documents", "processing", "confirmation", "validation", "session", "save", "step", "duplicate", "remove"];

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

export default async function NewOpportunityPage({params, searchParams}: Props) {
  const {locale} = await params;
  const state = await searchParams;
  const [t, tIntake] = await Promise.all([
    getTranslations({locale, namespace: "App"}),
    getTranslations({locale, namespace: "Intake"}),
  ]);
  const {supabase, organization, userId} = await requireWorkspace(locale);
  if (organization.organization_type === "capital_provider") redirect(`/${locale}/app`);

  const notice = state.error ? tIntake(`errors.${intakeErrorCodes.includes(state.error) ? state.error as IntakeErrorCode : "save"}`) : null;
  if (state.mode === "manual") redirect(`/${locale}/app/new`);
  const mode = state.mode === "documents" ? "documents" : "choice";
  const sessionId = typeof state.session === "string" ? state.session : "";
  const requestedStep = state.step ?? state.stage;
  const guidedStep = requestedStep === "company" || requestedStep === "operation" || requestedStep === "preliminary" || requestedStep === "documents"
    ? requestedStep
    : requestedStep === "request" ? "operation" : undefined;
  const runtime = {supabase, organizationId: organization.id, userId, locale: locale as AppLocale, sessionId};
  const collection = mode === "documents" && sessionId ? await loadIntakeCollection(runtime) : null;
  const preliminary = collection?.session
    ? await loadPreliminaryUnderstanding(supabase, organization.id, collection.session.id)
    : null;
  const preliminaryConfirmed = preliminary?.current?.row.status === "confirmed";
  const deepReviewReady = Boolean(
    collection?.session?.status === "review_ready"
    && preliminaryConfirmed
    && preliminary?.current?.row.processing_run_id !== collection.session.current_run_id,
  );
  // The first run is only the corrigible company/operation read. Do not run reconciliation or
  // load the deep review surface until a later, post-request evidence run has completed.
  const review = deepReviewReady
    ? await loadIntakeReview(runtime)
    : collection ? {...collection, candidates: [], issues: []} : null;
  const companyProfile = objectValue(review?.session?.company_profile);
  if (review?.session?.status === "confirmed" && review.session.opportunity_id) redirect(`/${locale}/app/opportunities/${review.session.opportunity_id}`);
  const companyProfileComplete = Boolean(review?.session?.company_profile_confirmed_at);
  const tailoredChecklist = review?.session ? await loadIntakeChecklist({
    supabase,
    organizationId: organization.id,
    sessionId: review.session.id,
    locale: locale === "en-US" ? "en" : "pt",
  }) : null;
  const availableGuidedStep = review?.session
    ? !companyProfileComplete
      ? "company"
      : !review.session.archetype || !canStartPreliminaryUnderstanding(dealBriefOf(review.session), review.documents.length)
        ? "operation"
        : !preliminaryConfirmed
          ? "preliminary"
          : "documents"
    : "company";
  const guidedOrder = ["company", "operation", "preliminary", "documents"] as const;
  const effectiveGuidedStep = review?.session && guidedStep
    && guidedOrder.indexOf(guidedStep) <= guidedOrder.indexOf(availableGuidedStep)
    ? guidedStep
    : availableGuidedStep;
  const editingOperationType = effectiveGuidedStep === "operation"
    && state.edit === "type"
    && Boolean(tailoredChecklist?.archetypeId);
  const editingProject = mode === "documents" && state.setup === "project" && Boolean(review?.session);
  const {data: projectSetupData} = mode === "choice"
    ? await supabase.rpc("get_workspace_project_setup", {p_locale: locale})
    : {data: null};
  const projectSetup = projectSetupData && typeof projectSetupData === "object" && !Array.isArray(projectSetupData)
    ? projectSetupData as WorkspaceProjectSetup
    : null;
  const termsAccepted = projectSetup?.terms_accepted === true;
  const setupMode = state.setup === "project" && termsAccepted ? "project" : "terms";

  return (
    <main className="app-canvas intake-page">
      <Link className="text-link" href={`/${locale}/app`}><ArrowLeft aria-hidden="true" size={14} />{t("overview")}</Link>
      {notice ? <p className="form-notice form-notice--error" role="alert">{notice}</p> : null}

      {mode === "choice" ? (
        <section className={`intake-setup-card intake-setup-card--${setupMode}`}>
          <PrivateProjectSetup
            acceptAction={acceptWorkspacePrivateTerms}
            journey={organization.organization_type === "originator" ? "originator" : "company"}
            legalDocument={projectSetup?.legal_document ?? null}
            locale={locale}
            mode={setupMode}
            profile={{
              fullName: projectSetup?.profile?.full_name ?? "",
              jobTitle: projectSetup?.profile?.job_title ?? "",
            }}
            returnHref={`/${locale}/app/new?setup=project`}
            startAction={startWorkspaceDocumentIntake}
            termsAccepted={state.setup === "terms" && termsAccepted}
            termsAcceptanceRecorded={termsAccepted}
            termsHref={`/${locale}/app/new?setup=terms`}
          />
        </section>
      ) : null}

      {editingProject && review?.session ? (
        <section className="intake-setup-card intake-setup-card--project">
          <PrivateProjectSetup
            acceptAction={acceptWorkspacePrivateTerms}
            journey={organization.organization_type === "originator" ? "originator" : "company"}
            locale={locale}
            mode="project"
            profile={{fullName: "", jobTitle: ""}}
            project={{
              id: review.session.id,
              name: review.session.project_name ?? "",
              identityPolicy: review.session.identity_policy ?? "identified_restricted",
            }}
            returnHref={`/${locale}/app/new?mode=documents&session=${review.session.id}&step=company`}
            startAction={startWorkspaceDocumentIntake}
            termsAccepted
            termsHref={`/${locale}/app/new?mode=documents&session=${review.session.id}&step=company`}
          />
        </section>
      ) : null}

      {mode === "documents" && !editingProject ? (
        !review?.session ? (
          <section className="intake-form">
            <p className="form-notice form-notice--error">{tIntake("errors.sessionNotFound")}</p>
            <Link className="button button--ghost" href={`/${locale}/app/new`}>{tIntake("errors.back")}</Link>
          </section>
        ) : deepReviewReady ? (
          <IntakeReview
            answerAction={saveWorkspaceIntakeAnswer}
            caseState={await resolveCaseState({
              supabase,
              organizationId: organization.id,
              sessionId: review.session.id,
              locale: locale === "en-US" ? "en" : "pt",
            })}
            actions={{accept: acceptWorkspaceIntakeCandidates, confirm: confirmWorkspaceDocumentIntake, process: processWorkspaceDocumentIntake, revise: reviseWorkspaceDiagnosticCase, resolve: resolveWorkspaceIntakeIssue, review: reviewWorkspaceIntakeCandidate, resolveScopeSuggestion: resolveWorkspaceScopeSuggestion, revokeAuthorization: revokeWorkspaceAdvisorAuthorization}}
            candidates={review.candidates}
            checklist={tailoredChecklist}
            documents={review.documents}
            issues={review.issues}
            locale={locale}
            organizationId={organization.id}
            removeAction={removeWorkspaceIntakeDocument}
            session={review.session}
            surface="workspace"
            userId={userId}
          />
        ) : (
          <IntakeCollect
            {...(effectiveGuidedStep ? {stage: effectiveGuidedStep} : {})}
            backHref={effectiveGuidedStep === "company"
              ? `/${locale}/app/new?mode=documents&session=${review.session.id}&setup=project`
              : effectiveGuidedStep === "operation" && !editingOperationType && tailoredChecklist?.archetypeId
                ? `/${locale}/app/new?mode=documents&session=${review.session.id}&step=operation&edit=type`
                : `/${locale}/app/new?mode=documents&session=${review.session.id}&step=${effectiveGuidedStep === "documents" ? "preliminary" : effectiveGuidedStep === "preliminary" ? "operation" : "company"}`}
            checklist={tailoredChecklist}
            documents={review.documents}
            companyProfile={{
              name: stringValue(companyProfile.name),
              legalName: stringValue(companyProfile.legal_name),
              website: stringValue(companyProfile.website),
              description: stringValue(companyProfile.description),
              identifierLast4: stringValue(companyProfile.identifier_last4),
            }}
            companyProfileAction={saveWorkspaceGuidedCompanyProfile}
            companyProfileComplete={companyProfileComplete}
            locale={locale}
            organizationId={organization.id}
            processAction={processWorkspaceDocumentIntake}
            operationTypeOnly={editingOperationType}
            preliminaryAction={decideWorkspacePreliminaryUnderstanding}
            preliminaryState={preliminary ?? {
              current: null,
              isProcessing: review.session.status === "processing",
              tasks: [
                {id: "receive", status: review.session.status === "processing" ? "running" : "pending"},
                {id: "read", status: "pending"},
                {id: "organize", status: "pending"},
                {id: "research", status: "pending"},
                {id: "compile", status: "pending"},
              ],
            }}
            removeAction={removeWorkspaceIntakeDocument}
            session={review.session}
            answerAction={saveWorkspaceIntakeAnswer}
            dealBrief={dealBriefOf(review.session)}
            dealBriefAction={saveWorkspaceDealBrief}
            setOperationAction={setWorkspaceIntakeOperation}
            resolveScopeSuggestionAction={resolveWorkspaceScopeSuggestion}
            revokeAuthorizationAction={revokeWorkspaceAdvisorAuthorization}
            stageBaseHref={`/${locale}/app/new?mode=documents&session=${review.session.id}`}
            surface="workspace"
            userId={userId}
          />
        )
      ) : null}

    </main>
  );
}
