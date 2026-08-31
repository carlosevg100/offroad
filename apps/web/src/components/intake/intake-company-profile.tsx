import {getTranslations} from "next-intl/server";

import type {IntakeDocumentSummary} from "@/lib/intake/types";

import {DocumentIntakeUploader} from "./document-intake-uploader";
import {IntakeActionSubmit} from "./intake-action-submit";

type CompanyProfile = {
  name?: string;
  legalName?: string;
  website?: string;
  description?: string;
  identifierLast4?: string;
};

type Props = {
  action: (formData: FormData) => Promise<void>;
  documents: IntakeDocumentSummary[];
  locale: string;
  organizationId: string;
  journey: "company" | "originator";
  profile?: CompanyProfile;
  removeAction?: (formData: FormData) => Promise<void>;
  sessionId: string;
  userId: string;
};

/** First milestone of the guided journey. Identification stays compact; company context is a
 * conversation or an existing institutional material, never a long questionnaire. */
export async function IntakeCompanyProfile({action, documents, journey, locale, organizationId, profile, removeAction, sessionId, userId}: Props) {
  const [t, tUploader] = await Promise.all([
    getTranslations({locale, namespace: "Intake.company"}),
    getTranslations({locale, namespace: "Intake.uploader"}),
  ]);

  return (
    <section className="intake-company">
      <form action={action} className="intake-company__form" id="intake-company-profile">
        <input name="locale" type="hidden" value={locale} />
        <input name="session_id" type="hidden" value={sessionId} />

        <p className="intake-company__scope">{t(journey === "originator" ? "projectScopeAdvisor" : "projectScopeCompany")}</p>

        <div className="intake-company__identity">
          <label><span>{t("name")}</span><input autoComplete="organization" defaultValue={profile?.name ?? ""} maxLength={160} minLength={2} name="company_name" required /></label>
          <label><span>{t("legalName")}</span><input defaultValue={profile?.legalName ?? ""} maxLength={200} name="legal_name" /></label>
          <label>
            <span>{t("identifier")}</span>
            <input inputMode="numeric" maxLength={40} name="legal_identifier" placeholder={t(profile?.identifierLast4 ? "identifierReplacementPlaceholder" : "identifierPlaceholder")} />
            {profile?.identifierLast4 ? <small>{t("identifierSaved", {last4: profile.identifierLast4})}</small> : null}
          </label>
          <label><span>{t("website")}</span><input autoCapitalize="none" autoCorrect="off" defaultValue={profile?.website ?? ""} inputMode="url" maxLength={500} name="website" type="text" /></label>
        </div>

        <div className="intake-company__context">
          <span className="section-kicker">{t("contextKicker")}</span>
          <label htmlFor="company-description">{t("contextTitle")}</label>
          <textarea defaultValue={profile?.description ?? ""} id="company-description" maxLength={5000} name="description" placeholder={t("contextPlaceholder")} rows={7} />
          <small>{t("contextHelp")}</small>
        </div>

      </form>

      <div className="intake-company__or"><span>{t("or")}</span></div>

      <DocumentIntakeUploader
        copy={{
          startError: tUploader("startError"),
          invalidFile: tUploader("invalidFile"),
          uploadError: tUploader("uploadError"),
          registerError: tUploader("registerError"),
          duplicateNotice: tUploader("duplicateNotice"),
          uploading: tUploader("uploading"),
          dropTitle: t("uploadTitle"),
          dropBody: t("uploadBody"),
          select: t("uploadSelect"),
          formats: tUploader("formats"),
          received: tUploader("received"),
          remove: tUploader("remove"),
        }}
        initialDocuments={documents}
        locale={locale}
        organizationId={organizationId}
        removeAction={removeAction}
        sessionId={sessionId}
        userId={userId}
      />

      <div className="intake-company__actions">
        <p>{t("continueNote")}</p>
        <IntakeActionSubmit className="button" form="intake-company-profile" idle={t("continue")} pending={t("continuePending")} />
      </div>
    </section>
  );
}
