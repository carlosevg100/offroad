import {ArrowRight, ExternalLink, FileCheck2, Search, ShieldCheck} from "lucide-react";
import {getTranslations} from "next-intl/server";
import Link from "next/link";

import type {PreliminaryUnderstandingState} from "@/lib/intake/preliminary-understanding";

import {IntakeActionSubmit} from "./intake-action-submit";
import {IntakeProcessingStatus} from "./intake-processing-status";

type Props = {
  action: (formData: FormData) => Promise<void>;
  retryAction: (formData: FormData) => Promise<void>;
  locale: string;
  sessionId: string;
  state: PreliminaryUnderstandingState;
  continueHref?: string;
  editHref?: string;
};

export async function IntakePreliminaryUnderstanding({action, retryAction, locale, sessionId, state, continueHref, editHref}: Props) {
  const t = await getTranslations({locale, namespace: "Intake.preliminary"});
  const current = state.current;

  if (state.isProcessing) {
    return (
      <IntakeProcessingStatus
        body={t("processingBody")}
        locale={locale}
        newProjectLabel={t("newProject")}
        overviewLabel={t("overview")}
        tasks={state.tasks.map((task) => ({
          label: t(`tasks.${task.id}`),
          status: task.status,
          statusLabel: t(`taskStatus.${task.status}`),
        }))}
        title={t("processingTitle")}
      />
    );
  }

  if (!current) {
    return (
      <section className="preliminary-understanding__failed" role="alert">
        <div>
          <strong>{t("failedTitle")}</strong>
          <p>{t("failedBody")}</p>
        </div>
        <form action={retryAction}>
          <input name="locale" type="hidden" value={locale} />
          <input name="session_id" type="hidden" value={sessionId} />
          <IntakeActionSubmit idle={t("retry")} pending={t("retryPending")} />
        </form>
      </section>
    );
  }

  const {value, row} = current;
  const research = value.basis.publicResearch;
  const sources = research.sources.slice(0, 8);
  const amount = value.operation.requestedAmount
    ? new Intl.NumberFormat(locale, {style: "currency", currency: value.operation.currency, maximumFractionDigits: 0}).format(Number(value.operation.requestedAmount))
    : null;

  return (
    <section className="preliminary-understanding">
      <header className="preliminary-understanding__header">
        <span className="section-kicker">{t("kicker")}</span>
        <h3>{t("title")}</h3>
        <p>{t("body")}</p>
      </header>

      <div className="preliminary-understanding__summary">
        <strong>{t("summaryLabel")}</strong>
        <p>{value.summary}</p>
      </div>

      <div className="preliminary-understanding__grid">
        <article>
          <span><ShieldCheck aria-hidden="true" size={16} />{t("companyLabel")}</span>
          <h4>{value.company.name}</h4>
          {value.company.legalName && value.company.legalName !== value.company.name ? <p>{value.company.legalName}</p> : null}
          <p className="preliminary-understanding__narrative">{value.company.companySummary}</p>
          <dl>
            {value.company.sector ? <><dt>{t("sector")}</dt><dd>{value.company.sector}</dd></> : null}
            {value.company.geography ? <><dt>{t("geography")}</dt><dd>{value.company.geography}</dd></> : null}
            {value.company.website ? <><dt>{t("website")}</dt><dd>{value.company.website}</dd></> : null}
          </dl>
        </article>

        <article>
          <span><FileCheck2 aria-hidden="true" size={16} />{t("operationLabel")}</span>
          <h4>{value.operation.archetypeLabel}</h4>
          <p className="preliminary-understanding__narrative">{value.operation.operationSummary}</p>
          <dl>
            {amount ? <><dt>{t("amount")}</dt><dd>{amount}</dd></> : null}
            {value.operation.requestedTermMonths ? <><dt>{t("term")}</dt><dd>{t("termMonths", {count: value.operation.requestedTermMonths})}</dd></> : null}
          </dl>
        </article>
      </div>

      {value.company.sectorSummary || value.company.positioningSummary ? (
        <section className="preliminary-understanding__context">
          {value.company.sectorSummary ? <article><strong>{t("sectorReading")}</strong><p>{value.company.sectorSummary}</p></article> : null}
          {value.company.positioningSummary ? <article><strong>{t("positioningReading")}</strong><p>{value.company.positioningSummary}</p></article> : null}
        </section>
      ) : null}

      <section className="preliminary-understanding__research">
        <header>
          <span><Search aria-hidden="true" size={16} />{t("researchLabel")}</span>
          <strong>{research.sourceCount > 0 ? t("researchFound", {count: research.sourceCount}) : t("researchAbstained")}</strong>
          <p>{t("researchBody")}</p>
        </header>
        {sources.length > 0 ? (
          <ul>
            {sources.map((source) => (
              <li key={`${source.topic}:${source.url}`}>
                <span>{t(`topic_${source.topic}`)}</span>
                <a href={source.url} rel="noreferrer" target="_blank">{source.title}<ExternalLink aria-hidden="true" size={12} /></a>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {value.preliminaryAssessment.openPoints.length > 0 ? (
        <section className="preliminary-understanding__open-points">
          <strong>{t("openPoints")}</strong>
          <ul>{value.preliminaryAssessment.openPoints.map((point) => <li key={point}>{point}</li>)}</ul>
        </section>
      ) : null}

      {value.preliminaryAssessment.researchSignals.length > 0 ? (
        <section className="preliminary-understanding__signals">
          <strong>{t("researchSignals")}</strong>
          <ul>{value.preliminaryAssessment.researchSignals.map((signal) => (
            <li key={`${signal.claim}:${signal.sourceUrls[0]}`}>
              <span>{signal.claim}</span>
              <a href={signal.sourceUrls[0]} rel="noreferrer" target="_blank">{t("viewSource")}<ExternalLink aria-hidden="true" size={12} /></a>
            </li>
          ))}</ul>
        </section>
      ) : null}

      <p className="preliminary-understanding__boundary">{value.preliminaryAssessment.boundary}</p>

      {row.status === "confirmed" ? (
        <section className="preliminary-understanding__decision preliminary-understanding__decision--confirmed">
          <div><h4>{t("confirmedTitle")}</h4><p>{t("confirmedBody")}</p></div>
          <div className="preliminary-understanding__confirmed-actions">
            {editHref ? <Link className="button button--ghost" href={editHref}>{t("editInputs")}</Link> : null}
            {continueHref ? <Link className="button" href={continueHref}>{t("continueToRequest")}<ArrowRight aria-hidden="true" size={14} /></Link> : null}
          </div>
        </section>
      ) : (
        <>
          <section className="preliminary-understanding__decision">
            <div>
              <h4>{t("decisionTitle")}</h4>
              <p>{t("decisionBody")}</p>
            </div>
            <form action={action}>
              <input name="locale" type="hidden" value={locale} />
              <input name="session_id" type="hidden" value={sessionId} />
              <input name="object_fingerprint" type="hidden" value={row.object_fingerprint} />
              <input name="decision" type="hidden" value="confirmed" />
              <IntakeActionSubmit idle={t("confirm")} pending={t("confirmPending")} />
            </form>
          </section>

          <details className="preliminary-understanding__correction">
            <summary>{t("correct")}</summary>
            <form action={action}>
              <input name="locale" type="hidden" value={locale} />
              <input name="session_id" type="hidden" value={sessionId} />
              <input name="object_fingerprint" type="hidden" value={row.object_fingerprint} />
              <input name="decision" type="hidden" value="changes_requested" />
              <label htmlFor="preliminary-correction">{t("correctionLabel")}</label>
              <textarea id="preliminary-correction" maxLength={4000} minLength={3} name="correction" placeholder={t("correctionPlaceholder")} required rows={4} />
              <button className="button button--ghost" type="submit">{t("sendCorrection")}<ArrowRight aria-hidden="true" size={14} /></button>
            </form>
          </details>
        </>
      )}
    </section>
  );
}
