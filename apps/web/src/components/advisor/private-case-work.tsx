"use client";

import {AlertCircle, Check, Circle, ExternalLink, FileCheck2, LoaderCircle, RotateCcw, Search, ShieldCheck} from "lucide-react";
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
  canRetry: boolean;
  shouldStart: boolean;
};

const initialState: PrivatePreliminaryDecisionState = {ok: false};

export function PrivateCaseWork({canRetry, checklist, locale, preliminary, projectId, sessionId, shouldStart}: Props) {
  const t = useTranslations("App.privateCase");
  const router = useRouter();
  const attemptedStart = useRef(false);
  const [bootstrapping, setBootstrapping] = useState(shouldStart);
  const [bootstrapFailed, setBootstrapFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
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
  const showingFailure = !current && !showingProcessing && (canRetry || bootstrapFailed);

  async function retryProcessing() {
    setBootstrapFailed(false);
    setRetrying(true);
    const result = await beginAdvisorProjectProcessing({locale, projectId});
    setRetrying(false);
    if (!result.ok) setBootstrapFailed(true);
    router.refresh();
  }

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

      {showingFailure ? (
        <section className="advisor-private-work__failure" role="alert">
          <AlertCircle aria-hidden="true" size={18} />
          <div><strong>{t("failedTitle")}</strong><p>{t("failedBody")}</p></div>
          <button className="button button--ghost button--small" disabled={retrying} onClick={() => void retryProcessing()} type="button">
            {retrying ? <LoaderCircle aria-hidden="true" className="spin" size={14} /> : <RotateCcw aria-hidden="true" size={14} />}
            {retrying ? t("retrying") : t("retry")}
          </button>
        </section>
      ) : null}

      {!current && !showingProcessing && !showingFailure ? (
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
                        {current.value.operation.requestedAmount ? <><dt>{t("amount")}</dt><dd>{formatMoney(current.value.operation.requestedAmount, current.value.operation.currency, locale)}</dd></> : null}
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

                  <ResearchEvidence
                    signals={current.value.preliminaryAssessment.researchSignals}
                    sources={current.value.basis.publicResearch.sources}
                  />

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

function formatMoney(value: string, currency: string, locale: "pt-BR" | "en-US"): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return `${currency} ${value}`;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${value}`;
  }
}

function ResearchEvidence({signals, sources}: {
  signals: Array<{claim: string; sourceUrls: string[]}>;
  sources: Array<{title: string; url: string}>;
}) {
  const t = useTranslations("App.privateCase");
  const titleByUrl = new Map(sources.map((source) => [source.url, source.title]));
  const sourceCount = new Set(signals.flatMap((signal) => signal.sourceUrls)).size;
  return (
    <section className="advisor-private-work__research">
      <div><Search aria-hidden="true" size={14} /><strong>{t("research")}</strong><span>{t("sourceCount", {count: sourceCount})}</span></div>
      {signals.length ? <ul>{signals.map((signal, index) => (
        <li key={`${index}:${signal.claim}`}>
          <p>{signal.claim}</p>
          <div>{signal.sourceUrls.map((url) => (
            <a href={url} key={url} rel="noreferrer" target="_blank">{titleByUrl.get(url) ?? t("source")}<ExternalLink aria-hidden="true" size={10} /></a>
          ))}</div>
        </li>
      ))}</ul> : <p>{t("researchPending")}</p>}
    </section>
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
