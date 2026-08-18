import {AlertTriangle, ArrowRight, LoaderCircle, ShieldCheck} from "lucide-react";
import Link from "next/link";
import {getTranslations} from "next-intl/server";

import type {IntakeDocumentSummary, IntakeSession} from "@/lib/intake/types";

import {DocumentIntakeUploader} from "./document-intake-uploader";

type Props = {
  locale: string;
  session: IntakeSession;
  documents: IntakeDocumentSummary[];
  organizationId: string;
  userId: string;
  processAction: (formData: FormData) => Promise<void>;
  /** Where to send the user if they prefer to type instead (optional). */
  manualHref?: string;
  /** Wrapper class differs between onboarding (`onboarding-stage__form`) and workspace (`intake-form`). */
  className?: string;
};

/**
 * Upload step: drop zone + "analyze" action, plus honest states for `processing` and `failed`.
 * Used by onboarding (documents-first journey) and the workspace new-case flow.
 */
export async function IntakeCollect({locale, session, documents, organizationId, userId, processAction, manualHref, className}: Props) {
  const t = await getTranslations({locale, namespace: "Intake"});
  const failed = session.status === "failed";
  const processing = session.status === "processing";
  return (
    <section className={`${className ?? "intake-form"} intake-collect`}>
      <div className="intake-collect__intro">
        <span className="section-kicker">{t("collect.kicker")}</span>
        <h3>{t("collect.title")}</h3>
        <p>{t("collect.body")}</p>
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
        }}
        initialDocuments={documents}
        organizationId={organizationId}
        sessionId={session.id}
        userId={userId}
      />

      <div className="intake-collect__process">
        <div><ShieldCheck size={15} /><span>{t("collect.notice")}</span></div>
        <form action={processAction}>
          <input name="locale" type="hidden" value={locale} />
          <input name="session_id" type="hidden" value={session.id} />
          <button className="button" disabled={!documents.length} type="submit">
            {failed || processing ? t("collect.retry") : t("collect.analyze")}<ArrowRight size={15} />
          </button>
        </form>
        {manualHref && failed ? <Link className="button button--ghost" href={manualHref}>{t("review.fillManually")}</Link> : null}
      </div>
    </section>
  );
}
