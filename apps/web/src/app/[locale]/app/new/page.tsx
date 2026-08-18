import {ArrowLeft, ArrowRight, Info} from "lucide-react";
import type {Metadata} from "next";
import Link from "next/link";
import {getTranslations} from "next-intl/server";
import {redirect} from "next/navigation";

import {IntakeCollect} from "@/components/intake/intake-collect";
import {IntakeReview} from "@/components/intake/intake-review";
import {IntakeStartChoice} from "@/components/intake/intake-start-choice";
import type {AppLocale} from "@/i18n/routing";
import {requireWorkspace} from "@/lib/auth/workspace";
import {loadIntakeReview} from "@/lib/intake/server";
import type {IntakeErrorCode} from "@/lib/intake/types";

import {
  acceptWorkspaceIntakeCandidates,
  chooseWorkspaceManualIntake,
  confirmWorkspaceDocumentIntake,
  createOpportunity,
  processWorkspaceDocumentIntake,
  resolveWorkspaceIntakeIssue,
  reviewWorkspaceIntakeCandidate,
  startWorkspaceDocumentIntake,
} from "./actions";

type Props = {
  params: Promise<{locale: string}>;
  searchParams: Promise<{error?: string; mode?: string; session?: string}>;
};

export const dynamic = "force-dynamic";
export const metadata: Metadata = {title: "New Opportunity", robots: {index: false, follow: false}};

const intakeErrorCodes: readonly string[] = ["documents", "processing", "confirmation", "validation", "session", "save", "step"];

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
  const mode = state.mode === "manual" || state.mode === "documents" ? state.mode : "choice";
  const sessionId = typeof state.session === "string" ? state.session : "";
  const review = mode === "documents" && sessionId
    ? await loadIntakeReview({supabase, organizationId: organization.id, userId, locale: locale as AppLocale, sessionId})
    : null;
  if (review?.session?.status === "confirmed" && review.session.opportunity_id) redirect(`/${locale}/app/opportunities/${review.session.opportunity_id}`);

  const manualHref = `/${locale}/app/new?mode=manual${sessionId ? `&session=${sessionId}` : ""}`;

  return (
    <main className="app-canvas intake-page">
      <Link className="text-link" href={`/${locale}/app`}><ArrowLeft aria-hidden="true" size={14} />{t("overview")}</Link>
      {notice ? <p className="form-notice form-notice--error" role="alert">{notice}</p> : null}

      {mode === "choice" ? <IntakeStartChoice actions={{start: startWorkspaceDocumentIntake, manual: chooseWorkspaceManualIntake}} context="workspace" locale={locale} /> : null}

      {mode === "documents" ? (
        !review?.session ? (
          <section className="intake-form">
            <p className="form-notice form-notice--error">{tIntake("errors.sessionNotFound")}</p>
            <Link className="button button--ghost" href={`/${locale}/app/new`}>{tIntake("errors.back")}</Link>
          </section>
        ) : review.session.status === "review_ready" ? (
          <IntakeReview
            actions={{accept: acceptWorkspaceIntakeCandidates, confirm: confirmWorkspaceDocumentIntake, process: processWorkspaceDocumentIntake, resolve: resolveWorkspaceIntakeIssue, review: reviewWorkspaceIntakeCandidate}}
            candidates={review.candidates}
            documents={review.documents}
            issues={review.issues}
            locale={locale}
            manualHref={manualHref}
            session={review.session}
          />
        ) : (
          <IntakeCollect
            documents={review.documents}
            locale={locale}
            manualHref={manualHref}
            organizationId={organization.id}
            processAction={processWorkspaceDocumentIntake}
            session={review.session}
            userId={userId}
          />
        )
      ) : null}

      {mode === "manual" ? (
        <>
          <header className="intake-header"><p className="section-kicker">{t("newEyebrow")}</p><h1>{t("newTitle")}</h1></header>
          <div className="intake-layout">
            <form action={createOpportunity} className="intake-form">
              <input name="locale" type="hidden" value={locale} />
              {sessionId ? <input name="session_id" type="hidden" value={sessionId} /> : null}
              <label className="field field--wide"><span>{t("legalName")}</span><input maxLength={200} minLength={2} name="legal_name" required /></label>
              <label className="field"><span>{t("sector")}</span><select defaultValue="food_retail" name="sector"><option value="food_retail">{t("sectors.foodRetail")}</option><option value="logistics">{t("sectors.logistics")}</option><option value="manufacturing">{t("sectors.manufacturing")}</option><option value="technology">{t("sectors.technology")}</option><option value="healthcare">{t("sectors.healthcare")}</option></select></label>
              <label className="field field--wide"><span>{t("purpose")}</span><textarea maxLength={500} minLength={3} name="purpose" required rows={4} /></label>
              <label className="field"><span>{t("requestedAmount")}</span><input inputMode="decimal" name="requested_amount" placeholder="50000000" required /></label>
              <label className="field"><span>{t("currency")}</span><select defaultValue="BRL" name="currency"><option value="BRL">BRL</option><option value="USD">USD</option><option value="EUR">EUR</option></select></label>
              <label className="field"><span>{t("term")}</span><input defaultValue={48} max={360} min={1} name="desired_term_months" required type="number" /></label>
              <button className="button intake-submit" type="submit">{t("submit")}<ArrowRight aria-hidden="true" size={16} /></button>
            </form>
            <aside className="intake-note">
              <Info aria-hidden="true" size={20} /><p>{t("requestNote")}</p>
              <div><span>01</span><p>{t("useOfProceeds.growthCapex")}</p></div>
              <div><span>02</span><p>{t("useOfProceeds.workingCapital")}</p></div>
              <div><span>03</span><p>{t("useOfProceeds.refinancing")}</p></div>
              <div><span>04</span><p>{t("useOfProceeds.acquisition")}</p></div>
            </aside>
          </div>
        </>
      ) : null}
    </main>
  );
}
