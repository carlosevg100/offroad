import {AlertTriangle, CircleHelp, MessageSquareText} from "lucide-react";
import {getTranslations} from "next-intl/server";

import type {ClientQuestion, DeskAnalysis, Trajectory} from "@offroad/credit-analysis";
import {resolveFieldPath} from "@offroad/credit-ontology";

type Props = {
  locale: string;
  desk: DeskAnalysis | null;
  trajectory: Trajectory | null;
  deskMissing: readonly string[];
  clientQuestions: readonly ClientQuestion[];
};

const asLocale = (locale: string) => (locale === "en-US" ? "en" : "pt") as "pt" | "en";
const intl = (locale: string) => (locale === "en-US" ? "en-US" : "pt-BR");

/** R$ 36,9M: the way a desk says a balance out loud. */
const millions = (value: string | null, locale: string) => {
  if (value === null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return value;
  return `R$ ${(parsed / 1_000_000).toLocaleString(intl(locale), {minimumFractionDigits: 1, maximumFractionDigits: 1})}M`;
};
const turns = (value: string | null, locale: string) =>
  value === null ? null : `${Number(value).toLocaleString(intl(locale), {minimumFractionDigits: 2, maximumFractionDigits: 2})}x`;
const ratePct = (value: string | null, locale: string) =>
  value === null ? null : `${(Number(value) * 100).toLocaleString(intl(locale), {minimumFractionDigits: 1, maximumFractionDigits: 1})}% a.a.`;
const days = (value: string | null) => (value === null ? null : `${Math.round(Number(value))}`);

/** Field path to the words a company recognises, falling back to the path when the catalogue does not know it. */
const fieldLabel = (path: string, lang: "pt" | "en") => {
  const resolved = resolveFieldPath(path);
  if (!resolved) return path;
  const period = resolved.params.period ? ` (${resolved.params.period.replace("_", "/")})` : "";
  return `${resolved.definition.labels[lang]}${period}`;
};

/**
 * The desk's own reading of the case, before any prose.
 *
 * Everything here is arithmetic over reconciled facts: the stack on one axis, leverage before
 * and after the ask, the room the tightest covenant leaves, the cash cycle, the receivables
 * still free, and the leverage trajectory year by year with the covenant the structure would
 * carry. The narrative downstream may rephrase these numbers; it may not renumber them, which
 * is why they are shown first and shown raw.
 *
 * Findings carry their severity on the left edge and the figures they cite in the sentence.
 * Questions to the company come in meeting order, each born from a finding, so the reader
 * knows why each one is being asked. Missing inputs are named in the company's words, not in
 * field paths, because the person reading is the one who has to go and find the document.
 */
export async function IntakeDesk({locale, desk, trajectory, deskMissing, clientQuestions}: Props) {
  const t = await getTranslations({locale, namespace: "Intake.desk"});
  const lang = asLocale(locale);

  if (!desk && deskMissing.length === 0 && clientQuestions.length === 0) return null;

  const requestedScenario = desk?.leverage.scenarios[0] ?? null;
  const monthsLabel = (value: string) => t("months", {count: Number(value).toLocaleString(intl(locale), {minimumFractionDigits: 1, maximumFractionDigits: 1})});
  const runwayMetrics: Array<{id: string; label: string; value: string | null; hint?: string}> = desk?.runway
    ? [
        {id: "burn", label: t("monthlyBurn"), value: millions(desk.runway.monthlyBurn, locale)},
        {id: "runwayPre", label: t("runwayPre"), value: monthsLabel(desk.runway.monthsPre)},
        {id: "runwayPost", label: t("runwayPost"), value: monthsLabel(desk.runway.monthsPostAfterService), hint: t("runwayPostHint", {rate: ratePct(desk.runway.assumedRate, locale) ?? ""})},
        {id: "arr", label: t("arr"), value: millions(desk.runway.arr, locale)},
        {id: "debtToArr", label: t("debtToArr"), value: desk.runway.debtToArr ? `${(Number(desk.runway.debtToArr) * 100).toFixed(0)}%` : null},
        {id: "nrr", label: t("nrr"), value: desk.runway.nrr ? `${(Number(desk.runway.nrr) * 100).toFixed(0)}%` : null},
      ]
    : [];
  const metrics: Array<{id: string; label: string; value: string | null; hint?: string}> = desk
    ? [
        ...runwayMetrics,
        {id: "netDebt", label: t("netDebt"), value: millions(desk.leverage.netDebtPre, locale)},
        {id: "ebitda", label: t("ebitda"), value: millions(desk.leverage.ebitda, locale)},
        {id: "leveragePre", label: t("leveragePre"), value: desk.profile === "cash_burning" ? t("notMeaningful") : turns(desk.leverage.preTurns, locale)},
        {
          id: "leveragePost",
          label: t("leveragePost"),
          value: desk.profile === "cash_burning" ? t("notMeaningful") : requestedScenario ? turns(requestedScenario.postTurns, locale) : null,
          ...(requestedScenario ? {hint: t("leveragePostHint", {amount: millions(requestedScenario.amount, locale) ?? ""})} : {}),
        },
        {
          id: "covenantRoom",
          label: t("covenantRoom"),
          value: millions(desk.leverage.maxNewDebtUnderCovenants, locale),
          ...(desk.leverage.tightestCovenant
            ? {hint: t("covenantRoomHint", {lender: desk.leverage.tightestCovenant.lender, maximum: turns(desk.leverage.tightestCovenant.maximum, locale) ?? ""})}
            : {}),
        },
        {
          id: "coverage",
          label: t("interestCoverage"),
          value: desk.profile === "cash_burning" ? t("notMeaningful") : turns(desk.leverage.interestCoverage, locale),
          ...(desk.leverage.interestCoveragePost ? {hint: t("interestCoveragePostHint", {coverage: turns(desk.leverage.interestCoveragePost, locale) ?? ""})} : {}),
        },
        {id: "weightedCost", label: t("weightedCost"), value: ratePct(desk.stack.weightedCost, locale)},
        {
          id: "spread",
          label: t("spreadOverCdi"),
          value: desk.stack.weightedSpreadOverCdi
            ? `CDI ${Number(desk.stack.weightedSpreadOverCdi) < 0 ? "-" : "+"} ${ratePct(String(Math.abs(Number(desk.stack.weightedSpreadOverCdi))), locale)}`
            : null,
        },
        {
          id: "maturing12",
          label: t("maturing12"),
          value: millions(desk.stack.maturingWithin12Months, locale),
          ...(desk.stack.liquidityCoverage12 ? {hint: t("coverage12Hint", {coverage: turns(desk.stack.liquidityCoverage12, locale) ?? ""})} : {}),
        },
        {id: "maturing", label: t("maturing24"), value: millions(desk.stack.maturingWithin24Months, locale)},
        {id: "cycle", label: t("cashCycle"), value: desk.workingCapital.cycleDays ? t("days", {count: days(desk.workingCapital.cycleDays) ?? ""}) : null},
        {id: "freeReceivables", label: t("freeReceivables"), value: millions(desk.encumbrance.free, locale)},
      ]
    : [];

  const severityLabel = (severity: "critical" | "high" | "medium" | "info") => t(`severity_${severity}`);

  return (
    <div className="case-desk">
      <header className="case-desk__head">
        <h3>{t("title")}</h3>
        {desk ? <span className="case-desk__assumptions">{t("assumptions", {cdi: ratePct(desk.assumptions.cdi, locale) ?? "", date: desk.assumptions.referenceDate})}</span> : null}
      </header>

      {desk ? (
        <>
          <dl className="case-desk__metrics">
            {metrics.map((metric) => (
              <div key={metric.id} className={metric.value === null ? "is-unavailable" : ""}>
                <dt>{metric.label}</dt>
                <dd>{metric.value ?? t("notComputed")}</dd>
                {metric.hint ? <span>{metric.hint}</span> : null}
              </div>
            ))}
          </dl>

          {desk.findings.length > 0 ? (
            <section className="case-desk__findings">
              <h4>{t("findingsTitle")}</h4>
              <ul>
                {desk.findings.map((finding) => (
                  <li key={finding.id} className={`is-${finding.severity}`}>
                    <span className="case-desk__severity">{severityLabel(finding.severity)}</span>
                    <span>{finding[lang]}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}

      {trajectory ? (
        <section className="case-desk__trajectory">
          <h4>{t("trajectoryTitle")}</h4>
          <p className="case-desk__note">
            {t("trajectoryAssumptions", {
              haircut: `${Math.round(Number(trajectory.assumptions.growthHaircut) * 100)}%`,
              cushion: turns(trajectory.assumptions.covenantCushion, locale) ?? "",
            })}
          </p>
          <div className="case-desk__table">
            <table>
              <thead>
                <tr>
                  <th>{t("year")}</th>
                  <th>{t("netDebtColumn")}</th>
                  <th>{t("ebitdaColumn")}</th>
                  <th>{t("leverageBase")}</th>
                  <th>{t("leverageStressed")}</th>
                  <th>{t("principalDue")}</th>
                  <th>{t("covenantColumn")}</th>
                </tr>
              </thead>
              <tbody>
                {trajectory.years.map((year) => {
                  const step = trajectory.covenantProposal.find((entry) => entry.year === year.year);
                  const isPeak = year.year === trajectory.peak.year;
                  return (
                    <tr key={year.year} className={isPeak ? "is-peak" : ""}>
                      <th scope="row">{year.year}{isPeak ? <span className="case-desk__peak">{t("peak")}</span> : null}</th>
                      <td>{millions(year.netDebt, locale)}</td>
                      <td>{millions(year.ebitdaBase, locale)}</td>
                      <td>{turns(year.leverageBase, locale)}</td>
                      <td>{turns(year.leverageStressed, locale)}</td>
                      <td>{millions(year.principalDue, locale)}</td>
                      <td>{step ? turns(step.maximum, locale) : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {trajectory.liabilityManagement ? (
            <div className="case-desk__lm">
              <strong>{t("lmTitle")}</strong>
              <span>
                {t(trajectory.liabilityManagement.lendersTakenOut.length > 0 ? "lmBody" : "lmBodyRefinancing", {
                  lenders: trajectory.liabilityManagement.lendersTakenOut.join(", "),
                  balance: millions(trajectory.liabilityManagement.covenantedBalance, locale) ?? "",
                  newMoney: millions(trajectory.liabilityManagement.netNewMoney, locale) ?? "",
                  leverage: turns(trajectory.liabilityManagement.postLeverageAfterRefi, locale) ?? "",
                })}
              </span>
            </div>
          ) : null}

          {trajectory.findings.length > 0 ? (
            <ul className="case-desk__findings-list">
              {trajectory.findings.map((finding) => (
                <li key={finding.id} className={`is-${finding.severity}`}>
                  <span className="case-desk__severity">{severityLabel(finding.severity)}</span>
                  <span>{finding[lang]}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {clientQuestions.length > 0 ? (
        <section className="case-desk__questions">
          <h4>
            <MessageSquareText aria-hidden="true" size={15} /> {t("questionsTitle")}
          </h4>
          <p className="case-desk__note">{t("questionsBody")}</p>
          <ol>
            {clientQuestions.map((question) => (
              <li key={question.findingId} className={`is-${question.severity}`}>
                <span className="case-desk__severity">{severityLabel(question.severity)}</span>
                <span>{question[lang]}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {deskMissing.length > 0 ? (
        <section className="case-desk__missing">
          <h4>
            {desk ? <CircleHelp aria-hidden="true" size={15} /> : <AlertTriangle aria-hidden="true" size={15} />} {desk ? t("missingSomeTitle") : t("missingAllTitle")}
          </h4>
          <p className="case-desk__note">{desk ? t("missingSomeBody") : t("missingAllBody")}</p>
          <ul>
            {deskMissing.map((path) => (
              <li key={path}>
                <strong>{fieldLabel(path, lang)}</strong>
                <code>{path}</code>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
