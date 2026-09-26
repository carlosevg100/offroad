"use client";

import {AlertTriangle, LoaderCircle, RotateCcw} from "lucide-react";
import {useActionState} from "react";
import {useFormStatus} from "react-dom";
import {useTranslations} from "next-intl";

import {resumePrivateProjectAnalysis, type PrivateAnalysisResumeState} from "@/app/[locale]/app/projects/[projectId]/actions";
import type {DealStateGap} from "@/lib/deal-state/analysis-gap";
import "@/app/work-activity.css";

const initialState: PrivateAnalysisResumeState = {ok: false};

/** A result the case analysis should have produced, missing while no analysis runs: said as a gap,
 * with the next step, never as work in progress. */
export function PrivateAnalysisGap({gap, locale, projectId, sessionId}: {gap: DealStateGap; locale: "pt-BR" | "en-US"; projectId: string; sessionId: string}) {
  const t = useTranslations("App.privateCase.analysisGap");
  const [state, action] = useActionState(resumePrivateProjectAnalysis, initialState);
  return (
    <section className="advisor-private-structure advisor-private-structure--state" data-gap={gap} data-testid="analysis-gap">
      <AlertTriangle aria-hidden="true" size={18} />
      <div>
        <span>{t("kicker")}</span>
        <strong>{t(`${gap}.title`)}</strong>
        <p>{t(`${gap}.body`)}</p>
        <p>{t("nextStepBody")}</p>
        <form action={action} className="analysis-gap__action">
          <input name="locale" type="hidden" value={locale} />
          <input name="project_id" type="hidden" value={projectId} />
          <input name="session_id" type="hidden" value={sessionId} />
          <ResumeButton idle={t("resume")} pending={t("resuming")} />
        </form>
        {state.ok ? <p className="analysis-gap__note" role="status">{t("resumed")}</p>
          : state.code ? <p className="form-notice form-notice--error" role="alert">{t(`errors.${state.code}`)}</p> : null}
      </div>
    </section>
  );
}

function ResumeButton({idle, pending}: {idle: string; pending: string}) {
  const status = useFormStatus();
  return <button className="button button--ghost button--small" disabled={status.pending} type="submit">
    {status.pending ? <LoaderCircle aria-hidden="true" className="spin" size={13} /> : <RotateCcw aria-hidden="true" size={13} />}
    {status.pending ? pending : idle}
  </button>;
}
