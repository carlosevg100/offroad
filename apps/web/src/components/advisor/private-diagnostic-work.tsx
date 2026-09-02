"use client";

import {AlertTriangle, Check, FileText, LoaderCircle, Scale} from "lucide-react";
import {useActionState} from "react";
import {useTranslations} from "next-intl";

import {
  confirmPrivateProjectDiagnostic,
  type PrivateDiagnosticDecisionState,
} from "@/app/[locale]/app/projects/[projectId]/actions";
import {IntakeActionSubmit} from "@/components/intake/intake-action-submit";
import {localizedText, type DealStateWorkbench} from "@/lib/deal-state/workbench";

type Props = {
  isProcessing: boolean;
  locale: "pt-BR" | "en-US";
  projectId: string;
  sessionId: string;
  understanding: DealStateWorkbench["understanding"];
};

const initialState: PrivateDiagnosticDecisionState = {ok: false};

export function PrivateDiagnosticWork({isProcessing, locale, projectId, sessionId, understanding}: Props) {
  const t = useTranslations("App.privateCase");
  const [state, action] = useActionState(confirmPrivateProjectDiagnostic, initialState);

  if (!understanding && !isProcessing) return null;
  if (!understanding || understanding.row.status === "confirmed") {
    return isProcessing ? (
      <section className="advisor-private-diagnostic advisor-private-diagnostic--processing" aria-live="polite">
        <LoaderCircle aria-hidden="true" className="spin" size={18} />
        <div><span>{t("diagnosticKicker")}</span><strong>{t("diagnosticProcessingTitle")}</strong><p>{t("diagnosticProcessingBody")}</p></div>
      </section>
    ) : null;
  }

  const {readiness, reconciliation} = understanding.value;
  const ready = readiness.state === "ready" && readiness.blockers.length === 0;
  const score = Math.round(readiness.score * 100);
  return (
    <section className="advisor-private-diagnostic">
      <header>
        <span>{t("diagnosticKicker")}</span>
        <h2>{t("diagnosticTitle")}</h2>
        <p>{t("diagnosticBody")}</p>
      </header>

      <div className="advisor-private-diagnostic__metrics">
        <section><small>{t("diagnosticReadiness")}</small><strong>{score}%</strong><p>{t(`diagnosticStates.${readiness.state}`)}</p></section>
        <section><small>{t("diagnosticExceptions")}</small><strong>{reconciliation.exceptions.length}</strong><p>{t("diagnosticExceptionsBody")}</p></section>
        <section><small>{t("diagnosticOpenPoints")}</small><strong>{readiness.blockers.length}</strong><p>{t("diagnosticOpenPointsBody")}</p></section>
      </div>

      <div className="advisor-private-diagnostic__components">
        {readiness.components.map((component) => (
          <section key={component.id}>
            <div><Check aria-hidden="true" size={12} /><strong>{localizedText(component.labels, locale)}</strong></div>
            <p>{localizedText(component.explanation, locale)}</p>
          </section>
        ))}
      </div>

      {readiness.blockers.length ? (
        <section className="advisor-private-diagnostic__blockers">
          <strong>{t("diagnosticBlockers")}</strong>
          <ul>{readiness.blockers.map((blocker) => <li key={blocker.id}><AlertTriangle aria-hidden="true" size={13} />{localizedText(blocker.labels, locale)}</li>)}</ul>
          <p>{t("diagnosticBlockersBody")}</p>
        </section>
      ) : null}

      <div className="advisor-private-diagnostic__dossier">
        <div><FileText aria-hidden="true" size={15} /><span><strong>{t("diagnosticDossier")}</strong><small>{t("diagnosticDossierBody")}</small></span></div>
        <a href={`/${locale}/app/case/${sessionId}`} rel="noreferrer" target="_blank">{t("diagnosticOpenDossier")}</a>
      </div>

      {ready ? (
        <form action={action} className="advisor-private-diagnostic__decision">
          <input name="locale" type="hidden" value={locale} />
          <input name="project_id" type="hidden" value={projectId} />
          <input name="session_id" type="hidden" value={sessionId} />
          <input name="object_fingerprint" type="hidden" value={understanding.row.object_fingerprint} />
          <div><Scale aria-hidden="true" size={16} /><span><strong>{t("diagnosticConfirmTitle")}</strong><p>{t("diagnosticConfirmBody")}</p></span></div>
          <IntakeActionSubmit idle={t("diagnosticConfirm")} pending={t("diagnosticConfirming")} />
        </form>
      ) : null}
      {!state.ok && state.code ? <p className="form-notice form-notice--error" role="alert">{t(`diagnosticErrors.${state.code}`)}</p> : null}
    </section>
  );
}
