import {AlertTriangle, ArrowLeft, ShieldCheck} from "lucide-react";
import Link from "next/link";
import {getTranslations} from "next-intl/server";

import type {IntakeDocumentSummary, IntakeSession} from "@/lib/intake/types";

import type {IntakeChecklist as Checklist} from "@/lib/intake/checklist";
import {canStartPreliminaryUnderstanding, type DealBrief} from "@/lib/intake/deal-brief";
import type {ArchetypeId} from "@offroad/credit-playbook";

import {DocumentIntakeUploader} from "./document-intake-uploader";
import {IntakeChecklist, IntakeOperation} from "./intake-checklist";
import {IntakeDeliveryMap} from "./intake-delivery-map";
import {IntakeDealBrief} from "./intake-deal-brief";
import {IntakeInformation} from "./intake-information";
import {IntakeGovernance} from "./intake-governance";
import {IntakeJourneyTelemetry} from "./intake-journey-telemetry";
import {IntakeCompanyProfile} from "./intake-company-profile";
import {IntakeProcessingStatus} from "./intake-processing-status";
import {IntakeActionSubmit} from "./intake-action-submit";
import {IntakePreliminaryUnderstanding} from "./intake-preliminary-understanding";
import type {PreliminaryUnderstandingState} from "@/lib/intake/preliminary-understanding";

type GuidedStage = "company" | "operation" | "preliminary" | "documents";

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
  /** Corrigible read produced after the company, operation and preliminary documents. */
  preliminaryState?: PreliminaryUnderstandingState;
  preliminaryAction?: (formData: FormData) => Promise<void>;
  /** Current screen in the guided workspace flow. Onboarding derives it from saved answers. */
  stage?: GuidedStage;
  /** Shows only the operation-type chooser when returning from the operation brief. */
  operationTypeOnly?: boolean;
  /** The onboarding journey starts with the company, before asking what it wants to finance. */
  companyProfile?: CompanyProfile;
  companyProfileComplete?: boolean;
  companyProfileAction?: (formData: FormData) => Promise<void>;
  /** Route used by the compact back action in the guided workspace flow. */
  backHref?: string;
  /** Base route used to navigate between the four guided intake stages without mutating saved answers. */
  stageBaseHref?: string;
  resolveScopeSuggestionAction?: (formData: FormData) => Promise<void>;
  revokeAuthorizationAction?: (formData: FormData) => Promise<void>;
  surface: "onboarding" | "workspace";
};

/**
 * Upload step: drop zone + "analyze" action, plus honest states for `processing` and `failed`.
 * Used by onboarding (documents-first journey) and the workspace new-case flow.
 */
export async function IntakeCollect({locale, session, documents, organizationId, userId, processAction, removeAction, className, setOperationAction, checklist, answerAction, dealBrief, dealBriefAction, preliminaryState, preliminaryAction, stage, operationTypeOnly = false, companyProfile, companyProfileComplete = false, companyProfileAction, backHref, stageBaseHref, resolveScopeSuggestionAction, revokeAuthorizationAction, surface}: Props) {
  const t = await getTranslations({locale, namespace: "Intake"});
  const failed = session.status === "failed";
  const processing = session.status === "processing";
  const operationInputReady = canStartPreliminaryUnderstanding(dealBrief ?? {}, documents.length);
  const currentStage: GuidedStage = stage === "company" || !companyProfileComplete
    ? "company"
    : !checklist?.archetypeId
      ? "operation"
      : !operationInputReady
        ? "operation"
        : stage ?? (preliminaryState?.current?.row.status === "confirmed" ? "documents" : "preliminary");
  const milestoneNumber = currentStage === "company" ? 1 : currentStage === "operation" ? 2 : currentStage === "preliminary" ? 3 : 4;
  const introKey = surface === "workspace"
    ? currentStage === "company" ? "company" : currentStage === "operation" ? "workspaceOperation" : currentStage === "preliminary" ? "workspacePreliminary" : "workspaceDocuments"
    : currentStage;
  const stageHref = (target: GuidedStage) => stageBaseHref
    ? `${stageBaseHref}${stageBaseHref.includes("?") ? "&" : "?"}stage=${target}`
    : undefined;
  const resolvedBackHref = backHref ?? (stageBaseHref && currentStage !== "operation"
    ? currentStage === "company"
      ? surface === "onboarding" ? `${stageBaseHref}?setup=project` : undefined
      : stageHref(currentStage === "documents" ? "preliminary" : currentStage === "preliminary" ? "operation" : "company")
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
      <nav aria-label={t("guided.progressLabel")} className="intake-milestones">
        {[1, 2, 3, 4, 5, 6, 7].map((number) => (
          <span className={number === milestoneNumber ? "is-current" : number < milestoneNumber ? "is-complete" : "is-locked"} key={number}>
            <i>{number < milestoneNumber ? "✓" : String(number).padStart(2, "0")}</i>
            <b>{t(`guided.milestones.${number}`)}</b>
          </span>
        ))}
      </nav>

      {resolvedBackHref ? (
        <div className="intake-guide__navigation">
          <Link className="intake-guide__back" href={resolvedBackHref}>
            <ArrowLeft aria-hidden="true" size={14} />{t("guided.back")}
          </Link>
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
      {processing && currentStage !== "preliminary" ? (
        <IntakeProcessingStatus
          body={t("collect.processingBody")}
          locale={locale}
          newProjectLabel={t("collect.processingNewProject")}
          overviewLabel={t("collect.processingOverview")}
          title={t("collect.processingTitle")}
        />
      ) : null}

      {!processing && currentStage === "documents" ? <IntakeGovernance
        locale={locale}
        resolveScopeSuggestion={resolveScopeSuggestionAction}
        revokeAuthorization={revokeAuthorizationAction}
        session={session}
      /> : null}

      {!processing && currentStage === "company" && companyProfileAction ? (
        <IntakeCompanyProfile
          action={companyProfileAction}
          documents={documents}
          locale={locale}
          organizationId={organizationId}
          journey={session.journey === "originator" ? "originator" : "company"}
          profile={companyProfile}
          removeAction={removeAction}
          sessionId={session.id}
          userId={userId}
        />
      ) : null}

      {!processing && currentStage === "operation" && setOperationAction && (operationTypeOnly || !checklist?.archetypeId) ? (
        <IntakeOperation
          locale={locale}
          selected={operationTypeOnly && checklist?.archetypeId ? checklist.archetypeId as ArchetypeId : null}
          action={setOperationAction}
          sessionId={session.id}
          journey={session.journey === "originator" ? "originator" : "company"}
          initialClientName={borrowerRecord && typeof borrowerRecord.legalName === "string" ? borrowerRecord.legalName : undefined}
          initialAuthorityKind={authorization && typeof authorization.authorityKind === "string" ? authorization.authorityKind : undefined}
          initialAuthorityReference={authorization && typeof authorization.declarationReference === "string" ? authorization.declarationReference : undefined}
          authorityAlreadyDeclared={authorization?.status === "declared"}
        />
      ) : null}

      {!processing && !operationTypeOnly && currentStage === "operation" && dealBriefAction && checklist?.archetypeId ? (
        <div className="intake-operation-context">
          {preliminaryState?.current?.row.status === "changes_requested" && preliminaryState.current.row.correction ? (
            <aside className="intake-operation-context__correction" role="status">
              <strong>{t("guided.correctionTitle")}</strong>
              <p>{preliminaryState.current.row.correction}</p>
              <small>{t("guided.correctionBody")}</small>
            </aside>
          ) : null}
          {setOperationAction ? (
            <details className="intake-operation-context__type">
              <summary>
                <span>{t("operation.selected")}</span>
                <strong>{t(`operation.${checklist.archetypeId}`)}</strong>
                <em>{t("operation.change")}</em>
              </summary>
              <IntakeOperation
                locale={locale}
                selected={checklist.archetypeId as ArchetypeId}
                action={setOperationAction}
                sessionId={session.id}
                journey={session.journey === "originator" ? "originator" : "company"}
                initialClientName={borrowerRecord && typeof borrowerRecord.legalName === "string" ? borrowerRecord.legalName : undefined}
                initialAuthorityKind={authorization && typeof authorization.authorityKind === "string" ? authorization.authorityKind : undefined}
                initialAuthorityReference={authorization && typeof authorization.declarationReference === "string" ? authorization.declarationReference : undefined}
                authorityAlreadyDeclared={authorization?.status === "declared"}
              />
            </details>
          ) : null}
          <IntakeDealBrief action={dealBriefAction} brief={dealBrief ?? {}} locale={locale} sessionId={session.id} />
          <section className="intake-operation-materials">
            <header>
              <span className="section-kicker">{t("brief.uploadKicker")}</span>
              <h3>{t("brief.uploadTitle")}</h3>
              <p>{t("brief.uploadBody")}</p>
            </header>
            <DocumentIntakeUploader
              copy={{
                startError: t("uploader.startError"),
                invalidFile: t("uploader.invalidFile"),
                uploadError: t("uploader.uploadError"),
                registerError: t("uploader.registerError"),
                duplicateNotice: t("uploader.duplicateNotice"),
                uploading: t("uploader.uploading"),
                dropTitle: t("brief.uploadDropTitle"),
                dropBody: t("brief.uploadDropBody"),
                select: t("brief.uploadSelect"),
                formats: t("uploader.formats"),
                received: t("uploader.received"),
                remove: t("uploader.remove"),
              }}
              initialDocuments={documents}
              locale={locale}
              organizationId={organizationId}
              removeAction={removeAction}
              sessionId={session.id}
              userId={userId}
            />
          </section>
          <div className="intake-operation-context__actions">
            <p>{t("brief.continueNote")}</p>
            <IntakeActionSubmit form="intake-operation-brief" idle={t("brief.save")} pending={t("brief.savePending")} />
          </div>
        </div>
      ) : null}

      {currentStage === "preliminary" && preliminaryAction && preliminaryState ? (
        <IntakePreliminaryUnderstanding
          action={preliminaryAction}
          continueHref={stageHref("documents")}
          editHref={stageHref("operation")}
          locale={locale}
          retryAction={processAction}
          sessionId={session.id}
          state={preliminaryState}
        />
      ) : null}

      {!processing && currentStage === "documents" ? (
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
              duplicateNotice: t("uploader.duplicateNotice"),
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

      {!processing && currentStage === "documents" && checklist && answerAction ? (
        <IntakeInformation
          action={answerAction}
          items={checklist.activeBatch.filter((item) => item.source === "information")}
          locale={locale}
          sessionId={session.id}
        />
      ) : null}

      {!processing && currentStage === "documents" ? <div className="intake-collect__process">
        <div><ShieldCheck size={15} /><span>{t("collect.notice")}</span></div>
        {!processing ? <form action={processAction}>
          <input name="locale" type="hidden" value={locale} />
          <input name="session_id" type="hidden" value={session.id} />
          <IntakeActionSubmit
            idle={failed ? t("collect.retry") : t("collect.analyze")}
            pending={t("collect.analyzePending")}
          />
        </form> : null}
      </div> : null}

    </section>
  );
}
