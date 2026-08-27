import {AlertTriangle, ArrowLeft, ArrowRight, LoaderCircle, RotateCcw, ShieldCheck} from "lucide-react";
import Link from "next/link";
import {getTranslations} from "next-intl/server";

import type {IntakeDocumentSummary, IntakeSession} from "@/lib/intake/types";

import type {IntakeChecklist as Checklist} from "@/lib/intake/checklist";
import {briefCompleteness, type DealBrief} from "@/lib/intake/deal-brief";
import type {ArchetypeId} from "@offroad/credit-playbook";

import {DocumentIntakeUploader} from "./document-intake-uploader";
import {IntakeChecklist, IntakeOperation} from "./intake-checklist";
import {IntakeDeliveryMap} from "./intake-delivery-map";
import {IntakeDealBrief} from "./intake-deal-brief";
import {IntakeInformation} from "./intake-information";
import {IntakeGovernance} from "./intake-governance";
import {IntakeJourneyTelemetry} from "./intake-journey-telemetry";
import {IntakeCompanyProfile} from "./intake-company-profile";

type GuidedStage = "company" | "operation" | "request" | "documents";

type CompanyProfile = {
  name?: string;
  legalName?: string;
  website?: string;
  description?: string;
  identifierLast4?: string;
};

type Props = {
  locale: string;
  session: IntakeSession;
  documents: IntakeDocumentSummary[];
  organizationId: string;
  userId: string;
  processAction: (formData: FormData) => Promise<void>;
  /** Removes one uploaded document while the session is open (`document_id`, `session_id`, `locale`). */
  removeAction?: (formData: FormData) => Promise<void>;
  /** Where to send the user if they prefer to type instead (optional). */
  manualHref?: string;
  /** Wrapper class differs between onboarding (`onboarding-stage__form`) and workspace (`intake-form`). */
  className?: string;
  /** Sets which operation the company is asking for (`archetype`, `session_id`, `locale`). */
  setOperationAction?: (formData: FormData) => Promise<void>;
  /** What the desk still needs, answered by what was read. Null until the operation is stated. */
  checklist?: Checklist | null;
  /** Saves one information answer (`requirement_id`, `answer`, `session_id`, `locale`). */
  answerAction?: (formData: FormData) => Promise<void>;
  /** The six facts that decide who could buy the paper, and the action that saves them. */
  dealBrief?: DealBrief;
  dealBriefAction?: (formData: FormData) => Promise<void>;
  /** Current screen in the guided workspace flow. Onboarding derives it from saved answers. */
  stage?: GuidedStage;
  /** The onboarding journey starts with the company, before asking what it wants to finance. */
  companyProfile?: CompanyProfile;
  companyProfileComplete?: boolean;
  companyProfileAction?: (formData: FormData) => Promise<void>;
  /** Route used by the compact back action in the guided workspace flow. */
  backHref?: string;
  /** Returns a new, still-empty intake to project setup so its identifying choices can be edited. */
  backAction?: (formData: FormData) => Promise<void>;
  /** Base route used to navigate between the three guided stages without mutating saved answers. */
  stageBaseHref?: string;
  /** Cancels only this unfinished onboarding session and returns to the welcome screen. */
  restartAction?: (formData: FormData) => Promise<void>;
  resolveScopeSuggestionAction?: (formData: FormData) => Promise<void>;
  revokeAuthorizationAction?: (formData: FormData) => Promise<void>;
  surface: "onboarding" | "workspace";
};

/**
 * Upload step: drop zone + "analyze" action, plus honest states for `processing` and `failed`.
 * Used by onboarding (documents-first journey) and the workspace new-case flow.
 */
export async function IntakeCollect({locale, session, documents, organizationId, userId, processAction, removeAction, manualHref, className, setOperationAction, checklist, answerAction, dealBrief, dealBriefAction, stage, companyProfile, companyProfileComplete = false, companyProfileAction, backHref, backAction, stageBaseHref, restartAction, resolveScopeSuggestionAction, revokeAuthorizationAction, surface}: Props) {
  const t = await getTranslations({locale, namespace: "Intake"});
  const failed = session.status === "failed";
  const processing = session.status === "processing";
  const answeredBrief = briefCompleteness(dealBrief ?? {}).answered;
  const currentStage: GuidedStage = surface === "onboarding" && (stage === "company" || !companyProfileComplete)
    ? "company"
    : !checklist?.archetypeId
    ? "operation"
    : stage === "documents" && answeredBrief === 0
      ? "request"
      : stage ?? (answeredBrief === 0 ? "request" : "documents");
  const milestoneNumber = currentStage === "company" ? 1 : currentStage === "documents" ? 3 : 2;
  const introKey = surface === "workspace"
    ? currentStage === "operation" ? "workspaceOperation" : currentStage === "request" ? "workspaceRequest" : "workspaceDocuments"
    : currentStage;
  const resolvedBackHref = backHref ?? (stageBaseHref && currentStage !== "operation"
    ? currentStage === "company"
      ? undefined
      : `${stageBaseHref}?stage=${currentStage === "documents" ? "request" : currentStage === "request" ? "operation" : "company"}`
    : stageBaseHref && surface === "onboarding" && currentStage === "operation"
      ? `${stageBaseHref}?stage=company`
    : undefined);
  const analysisScope = session.analysis_scope && typeof session.analysis_scope === "object" && !Array.isArray(session.analysis_scope)
    ? session.analysis_scope
    : null;
  const scopeEntities = analysisScope && Array.isArray(analysisScope.entities) ? analysisScope.entities : [];
  const borrower = scopeEntities.find((entry) => (
    entry && typeof entry === "object" && !Array.isArray(entry) && entry.role === "borrower"
  ));
  const borrowerRecord = borrower && typeof borrower === "object" && !Array.isArray(borrower) ? borrower : null;
  const authorization = session.advisor_authorization && typeof session.advisor_authorization === "object" && !Array.isArray(session.advisor_authorization)
    ? session.advisor_authorization
    : null;
  return (
    <section className={`${className ?? "intake-form"} intake-collect`}>
      <IntakeJourneyTelemetry
        activeRequestCount={checklist?.activeBatch.length ?? 0}
        documentCount={documents.length}
        journey={session.journey === "originator" ? "originator" : "company"}
        locale={locale}
        stage={currentStage}
        state={failed ? "failed" : processing ? "processing" : "open"}
        surface={surface}
      />
      {surface === "onboarding" ? (
        <nav aria-label={t("guided.progressLabel")} className="intake-milestones">
          {[1, 2, 3, 4, 5, 6, 7].map((number) => (
            <span className={number === milestoneNumber ? "is-current" : number < milestoneNumber ? "is-complete" : "is-locked"} key={number}>
              <i>{number < milestoneNumber ? "✓" : String(number).padStart(2, "0")}</i>
              <b>{t(`guided.milestones.${number}`)}</b>
            </span>
          ))}
        </nav>
      ) : (
        <nav aria-label={t("guided.progressLabel")} className="intake-guide__progress">
          {[1, 2, 3].map((number) => (
            <span className={number === milestoneNumber ? "is-current" : number < milestoneNumber ? "is-complete" : ""} key={number}>
              <i>{number < milestoneNumber ? "✓" : number}</i>{t(`guided.step${number}`)}
            </span>
          ))}
        </nav>
      )}

      {(resolvedBackHref || backAction || restartAction) ? (
        <div className="intake-guide__navigation">
          {resolvedBackHref ? (
            <Link className="intake-guide__back" href={resolvedBackHref}>
              <ArrowLeft aria-hidden="true" size={14} />{t("guided.back")}
            </Link>
          ) : backAction ? (
            <form action={backAction}>
              <input name="locale" type="hidden" value={locale} />
              <input name="session_id" type="hidden" value={session.id} />
              <button className="intake-guide__back" type="submit">
                <ArrowLeft aria-hidden="true" size={14} />{t("guided.backToProject")}
              </button>
            </form>
          ) : <span />}
          {restartAction ? (
            <details className="intake-guide__restart">
              <summary><RotateCcw aria-hidden="true" size={13} />{t("guided.restart")}</summary>
              <div>
                <p>{t("guided.restartBody")}</p>
                <form action={restartAction}>
                  <input name="locale" type="hidden" value={locale} />
                  <input name="session_id" type="hidden" value={session.id} />
                  <button className="button button--ghost" type="submit">{t("guided.restartConfirm")}</button>
                </form>
              </div>
            </details>
          ) : null}
        </div>
      ) : null}

      <div className="intake-collect__intro intake-guide__intro">
        <span className="section-kicker">{t(`guided.${introKey}Kicker`)}</span>
        <h3>{t(`guided.${introKey}Title`)}</h3>
        <p>{t(`guided.${introKey}Body`)}</p>
      </div>

      {failed ? (
        <div className="form-notice form-notice--error" role="alert">
          <strong><AlertTriangle aria-hidden="true" size={14} /> {t("collect.failedTitle")}</strong> {t("collect.failedBody")}
        </div>
      ) : null}
      {processing ? (
        <div className="form-notice" role="status">
          <strong><LoaderCircle aria-hidden="true" className="spin" size={14} /> {t("collect.processingTitle")}</strong> {t("collect.processingBody")}
        </div>
      ) : null}

      {currentStage !== "company" ? <IntakeGovernance
        locale={locale}
        resolveScopeSuggestion={resolveScopeSuggestionAction}
        revokeAuthorization={revokeAuthorizationAction}
        session={session}
      /> : null}

      {currentStage === "company" && companyProfileAction ? (
        <IntakeCompanyProfile
          action={companyProfileAction}
          documents={documents}
          locale={locale}
          organizationId={organizationId}
          profile={companyProfile}
          removeAction={removeAction}
          sessionId={session.id}
          userId={userId}
        />
      ) : null}

      {currentStage === "operation" && setOperationAction ? (
        <IntakeOperation
          locale={locale}
          selected={(checklist?.archetypeId ?? null) as ArchetypeId | null}
          action={setOperationAction}
          sessionId={session.id}
          journey={session.journey === "originator" ? "originator" : "company"}
          initialClientName={borrowerRecord && typeof borrowerRecord.legalName === "string" ? borrowerRecord.legalName : undefined}
          initialAuthorityKind={authorization && typeof authorization.authorityKind === "string" ? authorization.authorityKind : undefined}
          initialAuthorityReference={authorization && typeof authorization.declarationReference === "string" ? authorization.declarationReference : undefined}
          authorityAlreadyDeclared={authorization?.status === "declared"}
        />
      ) : null}

      {currentStage === "request" && dealBriefAction && checklist?.archetypeId ? (
        <IntakeDealBrief action={dealBriefAction} brief={dealBrief ?? {}} locale={locale} sessionId={session.id} />
      ) : null}

      {currentStage === "documents" ? (
        <div className="intake-guide__documents">
          <IntakeChecklist
            checklist={checklist ?? null}
            locale={locale}
            sessionId={session.id}
            {...(answerAction ? {respond: answerAction} : {})}
          />
          <DocumentIntakeUploader
            copy={{
              startError: t("uploader.startError"),
              invalidFile: t("uploader.invalidFile"),
              uploadError: t("uploader.uploadError"),
              registerError: t("uploader.registerError"),
              uploading: t("uploader.uploading"),
              dropTitle: t("uploader.dropTitle"),
              dropBody: t("uploader.dropBody"),
              select: t("uploader.select"),
              formats: t("uploader.formats"),
              received: t("uploader.received"),
              remove: t("uploader.remove"),
            }}
            initialDocuments={documents}
            locale={locale}
            organizationId={organizationId}
            removeAction={session.status === "confirmed" ? undefined : removeAction}
            sessionId={session.id}
            userId={userId}
          />
          {setOperationAction ? (
            <IntakeDeliveryMap checklist={checklist ?? null} documents={documents} locale={locale} sessionStatus={session.status} />
          ) : null}
        </div>
      ) : null}

      {currentStage === "documents" && checklist && answerAction ? (
        <IntakeInformation
          action={answerAction}
          items={checklist.activeBatch.filter((item) => item.source === "information")}
          locale={locale}
          sessionId={session.id}
        />
      ) : null}

      {currentStage === "documents" ? <div className="intake-collect__process">
        <div><ShieldCheck size={15} /><span>{t("collect.notice")}</span></div>
        <form action={processAction}>
          <input name="locale" type="hidden" value={locale} />
          <input name="session_id" type="hidden" value={session.id} />
          <button className="button" disabled={!documents.length} type="submit">
            {failed || processing ? t("collect.retry") : t("collect.analyze")}<ArrowRight size={15} />
          </button>
        </form>
        {manualHref && failed ? <Link className="button button--ghost" href={manualHref}>{t("review.fillManually")}</Link> : null}
      </div> : null}

    </section>
  );
}
