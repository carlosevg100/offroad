"use client";

import {AlertCircle, Check, Circle, ExternalLink, FileCheck2, LoaderCircle, Search, ShieldCheck} from "lucide-react";
import {useActionState, useEffect, useRef, useState} from "react";
import {useTranslations} from "next-intl";
import {useRouter} from "next/navigation";

import {beginAdvisorProjectProcessing} from "@/app/[locale]/app/advisor-actions";
import type {IntakeChecklist} from "@/lib/intake/checklist";
import type {PreliminaryUnderstandingState} from "@/lib/intake/preliminary-understanding";
import {decidePrivateProjectPreliminary, type PrivatePreliminaryDecisionState} from "@/app/[locale]/app/projects/[projectId]/actions";
import {IntakeActionSubmit} from "@/components/intake/intake-action-submit";

type Props = {
  checklist: IntakeChecklist | null;
  locale: "pt-BR" | "en-US";
  preliminary: PreliminaryUnderstandingState;
  projectId: string;
  sessionId: string;
  shouldStart: boolean;
};

const initialState: PrivatePreliminaryDecisionState = {ok: false};

export function PrivateCaseWork({checklist, locale, preliminary, projectId, sessionId, shouldStart}: Props) {
  const t = useTranslations("App.privateCase");
  const router = useRouter();
  const attemptedStart = useRef(false);
  const [bootstrapping, setBootstrapping] = useState(shouldStart);
  const [bootstrapFailed, setBootstrapFailed] = useState(false);
  const [state, action] = useActionState(decidePrivateProjectPreliminary, initialState);
  const current = preliminary.current;

  useEffect(() => {
    if (!shouldStart || attemptedStart.current) return;
    attemptedStart.current = true;
    void beginAdvisorProjectProcessing({locale, projectId}).then((result) => {
      setBootstrapping(false);
      if (!result.ok) setBootstrapFailed(true);
      router.refresh();
    });
  }, [locale, projectId, router, shouldStart]);

  const showingProcessing = preliminary.isProcessing || bootstrapping;

  return (
    <article className="advisor-private-work">
      {showingProcessing ? (
        <section className="advisor-private-work__processing" aria-live="polite">
          <header><LoaderCircle aria-hidden="true" className="spin" size={17} /><div><strong>{t("processingTitle")}</strong><p>{t("processingBody")}</p></div></header>
          <ol>{preliminary.tasks.map((task) => (
            <li className={`is-${task.status}`} key={task.id}>
              {task.status === "completed" ? <Check aria-hidden="true" size={12} /> : task.status === "running" ? <LoaderCircle aria-hidden="true" className="spin" size={12} /> : <Circle aria-hidden="true" size={12} />}
              <span>{t(`tasks.${task.id}`)}</span>
            </li>
          ))}</ol>
        </section>
      ) : null}

      {bootstrapFailed ? <p className="form-notice form-notice--error" role="alert">{t("errors.processing")}</p> : null}

      {!current && !showingProcessing && !bootstrapFailed ? (
        <section className="advisor-private-work__empty">
          <FileCheck2 aria-hidden="true" size={18} />
          <div><strong>{t("emptyTitle")}</strong><p>{t("emptyBody")}</p></div>
        </section>
      ) : null}

      {current ? (
        current.row.status === "confirmed"
          ? <ConfirmedRequest checklist={checklist} />
          : current.row.status === "pending_confirmation"
            ? (
                <section className="advisor-private-work__understanding">
                  <header><span>{t("kicker")}</span><h2>{t("title")}</h2><p>{t("body")}</p></header>
                  <blockquote>{current.value.summary}</blockquote>
                  <div className="advisor-private-work__summary-grid">
                    <section>
                      <span><ShieldCheck aria-hidden="true" size={14} />{t("company")}</span>
                      <strong>{current.value.company.name}</strong>
                      <p>{current.value.company.companySummary}</p>
                      <dl>
                        {current.value.company.sector ? <><dt>{t("sector")}</dt><dd>{current.value.company.sector}</dd></> : null}
                        {current.value.company.geography ? <><dt>{t("geography")}</dt><dd>{current.value.company.geography}</dd></> : null}
                      </dl>
                    </section>
                    <section>
                      <span><FileCheck2 aria-hidden="true" size={14} />{t("operation")}</span>
                      <strong>{current.value.operation.archetypeLabel}</strong>
                      <p>{current.value.operation.operationSummary}</p>
                      <dl>
                        {current.value.operation.requestedAmount ? <><dt>{t("amount")}</dt><dd>{current.value.operation.currency} {current.value.operation.requestedAmount}</dd></> : null}
                        {current.value.operation.requestedTermMonths ? <><dt>{t("term")}</dt><dd>{t("months", {count: current.value.operation.requestedTermMonths})}</dd></> : null}
                      </dl>
                    </section>
                  </div>

                  {current.value.preliminaryAssessment.openPoints.length ? (
                    <section className="advisor-private-work__open-points">
                      <strong>{t("openPoints")}</strong>
                      <ul>{current.value.preliminaryAssessment.openPoints.map((point) => <li key={point}>{point}</li>)}</ul>
                    </section>
                  ) : null}

                  <section className="advisor-private-work__research">
                    <div><Search aria-hidden="true" size={14} /><strong>{t("research")}</strong><span>{t("sourceCount", {count: current.value.basis.publicResearch.sourceCount})}</span></div>
                    {current.value.basis.publicResearch.sources.length ? <ul>{current.value.basis.publicResearch.sources.slice(0, 6).map((source) => (
                      <li key={`${source.topic}:${source.url}`}><a href={source.url} rel="noreferrer" target="_blank">{source.title}<ExternalLink aria-hidden="true" size={10} /></a></li>
                    ))}</ul> : <p>{t("researchPending")}</p>}
                  </section>

                  <p className="advisor-private-work__boundary"><AlertCircle aria-hidden="true" size={13} />{current.value.preliminaryAssessment.boundary}</p>

                  <div className="advisor-private-work__decision">
                    <form action={action}>
                      <DecisionFields fingerprint={current.row.object_fingerprint} locale={locale} projectId={projectId} sessionId={sessionId} />
                      <input name="decision" type="hidden" value="confirmed" />
                      <IntakeActionSubmit idle={t("confirm")} pending={t("confirming")} />
                    </form>
                    <details>
                      <summary>{t("correct")}</summary>
                      <form action={action}>
                        <DecisionFields fingerprint={current.row.object_fingerprint} locale={locale} projectId={projectId} sessionId={sessionId} />
                        <input name="decision" type="hidden" value="changes_requested" />
                        <label htmlFor={`private-correction-${current.row.id}`}>{t("correctionLabel")}</label>
                        <textarea id={`private-correction-${current.row.id}`} maxLength={4000} minLength={3} name="correction" placeholder={t("correctionPlaceholder")} required rows={3} />
                        <IntakeActionSubmit idle={t("sendCorrection")} pending={t("sendingCorrection")} />
                      </form>
                    </details>
                  </div>
                  {!state.ok && state.code ? <p className="form-notice form-notice--error" role="alert">{t(`errors.${state.code}`)}</p> : null}
                </section>
              )
            : null
      ) : null}
    </article>
  );
}

function DecisionFields({fingerprint, locale, projectId, sessionId}: {
  fingerprint: string;
  locale: string;
  projectId: string;
  sessionId: string;
}) {
  return <>
    <input name="locale" type="hidden" value={locale} />
    <input name="project_id" type="hidden" value={projectId} />
    <input name="session_id" type="hidden" value={sessionId} />
    <input name="object_fingerprint" type="hidden" value={fingerprint} />
  </>;
}

function ConfirmedRequest({checklist}: {
  checklist: IntakeChecklist | null;
}) {
  const t = useTranslations("App.privateCase");
  const requests = checklist?.activeBatch ?? [];
  return (
    <section className="advisor-private-work__request">
      <header><Check aria-hidden="true" size={15} /><div><span>{t("requestKicker")}</span><h2>{t("requestTitle")}</h2><p>{t("requestBody")}</p></div></header>
      {requests.length ? <ol>{requests.map((item, index) => (
        <li key={item.id}>
          <span>{String(index + 1).padStart(2, "0")}</span>
          <div><strong>{item.label}</strong><p>{item.rationale}</p>{item.accepts.length ? <small>{t("acceptable")}: {item.accepts.join("; ")}</small> : null}</div>
        </li>
      ))}</ol> : <p className="advisor-private-work__request-empty">{t("requestEmpty")}</p>}
      <footer>{t("requestFooter")}</footer>
    </section>
  );
}
