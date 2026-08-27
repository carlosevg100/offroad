import {ArrowLeft} from "lucide-react";
import type {Metadata} from "next";
import Link from "next/link";
import {getTranslations} from "next-intl/server";
import {redirect} from "next/navigation";

import {IntakeCollect} from "@/components/intake/intake-collect";
import {resolveCaseState} from "@/lib/intake/case-pipeline";
import {loadIntakeChecklist} from "@/lib/intake/checklist";
import {dealBriefOf} from "@/lib/intake/deal-brief";
import {IntakeReview} from "@/components/intake/intake-review";
import {PrivateProjectForm} from "@/components/intake/private-project-setup";
import type {AppLocale} from "@/i18n/routing";
import {requireWorkspace} from "@/lib/auth/workspace";
import {loadIntakeReview} from "@/lib/intake/server";
import type {IntakeErrorCode} from "@/lib/intake/types";

import {
  acceptWorkspaceIntakeCandidates,
  confirmWorkspaceDocumentIntake,
  processWorkspaceDocumentIntake,
  saveWorkspaceIntakeAnswer,
  saveWorkspaceDealBrief,
  setWorkspaceIntakeOperation,
  removeWorkspaceIntakeDocument,
  resolveWorkspaceIntakeIssue,
  resolveWorkspaceScopeSuggestion,
  revokeWorkspaceAdvisorAuthorization,
  reviewWorkspaceIntakeCandidate,
  startWorkspaceDocumentIntake,
} from "./actions";

type Props = {
  params: Promise<{locale: string}>;
  searchParams: Promise<{error?: string; mode?: string; session?: string; step?: string}>;
};

export const dynamic = "force-dynamic";
// Processing downloads and hashes every document server-side; allow more than the default budget.
export const maxDuration = 60;
export const metadata: Metadata = {title: "New Opportunity", robots: {index: false, follow: false}};

const intakeErrorCodes: readonly string[] = ["documents", "processing", "confirmation", "validation", "session", "save", "step", "duplicate", "remove"];

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
  const guidedStep = state.step === "operation" || state.step === "request" || state.step === "documents" ? state.step : undefined;
  const review = mode === "documents" && sessionId
    ? await loadIntakeReview({supabase, organizationId: organization.id, userId, locale: locale as AppLocale, sessionId})
    : null;
  if (review?.session?.status === "confirmed" && review.session.opportunity_id) redirect(`/${locale}/app/opportunities/${review.session.opportunity_id}`);

  return (
    <main className="app-canvas intake-page">
      <Link className="text-link" href={`/${locale}/app`}><ArrowLeft aria-hidden="true" size={14} />{t("overview")}</Link>
      {notice ? <p className="form-notice form-notice--error" role="alert">{notice}</p> : null}

      {mode === "choice" ? (
        <PrivateProjectForm
          action={startWorkspaceDocumentIntake}
          backHref={`/${locale}/app`}
          journey={organization.organization_type === "originator" ? "originator" : "company"}
          locale={locale}
        />
      ) : null}

      {mode === "documents" ? (
        !review?.session ? (
          <section className="intake-form">
            <p className="form-notice form-notice--error">{tIntake("errors.sessionNotFound")}</p>
            <Link className="button button--ghost" href={`/${locale}/app/new`}>{tIntake("errors.back")}</Link>
          </section>
        ) : review.session.status === "review_ready" ? (
          <IntakeReview
            caseState={await resolveCaseState({
              supabase,
              organizationId: organization.id,
              sessionId: review.session.id,
              locale: locale === "en-US" ? "en" : "pt",
            })}
            actions={{accept: acceptWorkspaceIntakeCandidates, confirm: confirmWorkspaceDocumentIntake, process: processWorkspaceDocumentIntake, resolve: resolveWorkspaceIntakeIssue, review: reviewWorkspaceIntakeCandidate, resolveScopeSuggestion: resolveWorkspaceScopeSuggestion, revokeAuthorization: revokeWorkspaceAdvisorAuthorization}}
            candidates={review.candidates}
            documents={review.documents}
            issues={review.issues}
            locale={locale}
            session={review.session}
            surface="workspace"
          />
        ) : (
          <IntakeCollect
            {...(guidedStep ? {stage: guidedStep} : {})}
            {...(guidedStep && guidedStep !== "operation" ? {backHref: `/${locale}/app/new?mode=documents&session=${review.session.id}&step=${guidedStep === "documents" ? "request" : "operation"}`} : {})}
            checklist={await loadIntakeChecklist({
              supabase,
              organizationId: organization.id,
              sessionId: review.session.id,
              locale: locale === "en-US" ? "en" : "pt",
            })}
            documents={review.documents}
            locale={locale}
            organizationId={organization.id}
            processAction={processWorkspaceDocumentIntake}
            removeAction={removeWorkspaceIntakeDocument}
            session={review.session}
            answerAction={saveWorkspaceIntakeAnswer}
            dealBrief={dealBriefOf(review.session)}
            dealBriefAction={saveWorkspaceDealBrief}
            setOperationAction={setWorkspaceIntakeOperation}
            resolveScopeSuggestionAction={resolveWorkspaceScopeSuggestion}
            revokeAuthorizationAction={revokeWorkspaceAdvisorAuthorization}
            surface="workspace"
            userId={userId}
          />
        )
      ) : null}

    </main>
  );
}
