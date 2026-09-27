import {AlertTriangle, CircleHelp, MessageSquareText} from "lucide-react";
import {getTranslations} from "next-intl/server";

import {absentRatioGap, deskInputLabel, publishedRatio, type AbsentRatio, type ClientQuestion, type DeskAnalysis, type Trajectory} from "@offroad/credit-analysis";

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
/** A rate in percent, without the period: the catalog states "a.a." or "p.a." in the language of the screen. */
const percent = (value: string | null, locale: string) =>
  value === null ? null : `${(Number(value) * 100).toLocaleString(intl(locale), {minimumFractionDigits: 1, maximumFractionDigits: 1})}%`;
const days = (value: string | null) => (value === null ? null : `${Math.round(Number(value))}`);

/**
 * A ratio of the desk or of the trajectory as the screen prints it: the figure when it is a number,
 * the gap in words when it is absent (a ratio over a zero denominator), null when it was not computed
 * for another reason. A division by zero is never printed as a number, even from a desk stored
 * before absent ratios were published.
 */
const ratioOrGap = (
  output: {readonly absentRatios?: readonly AbsentRatio[]} | null,
  field: string,
  value: string | null,
  lang: "pt" | "en",
  print: (value: string) => string | null,
): {text: string | null; absent: boolean} => {
  const stated = publishedRatio(value);
  if (stated !== null) return {text: print(stated), absent: false};
  const gap = absentRatioGap(output, field, value);
  return gap ? {text: gap[lang], absent: true} : {text: null, absent: false};
};

/**
 * An input the desk lacks, in the words the questions to the company use for it, never its field
 * path: the person reading is the one who has to go and find the document.
 */
const fieldLabel = (path: string, lang: "pt" | "en", locale: string) => {
  const label = deskInputLabel(path)[lang];
  return label.charAt(0).toLocaleUpperCase(intl(locale)) + label.slice(1);
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
  const ratePct = (value: string | null) => (value === null ? null : t("perYear", {rate: percent(value, locale) ?? ""}));
  const monthsLabel = (value: string) => t("months", {count: Number(value).toLocaleString(intl(locale), {minimumFractionDigits: 1, maximumFractionDigits: 1})});
  const ratio = (output: {readonly absentRatios?: readonly AbsentRatio[]} | null, field: string, value: string | null, print: (value: string) => string | null) =>
    ratioOrGap(output, field, value, lang, print);
  const runwayAfterService = desk?.runway ? ratio(desk, "runway.monthsPostAfterService", desk.runway.monthsPostAfterService, monthsLabel) : null;
  const runwayMetrics: Array<{id: string; label: string; value: string | null; hint?: string; absent?: boolean}> = desk?.runway
    ? [
        {id: "burn", label: t("monthlyBurn"), value: millions(desk.runway.monthlyBurn, locale)},
        {id: "runwayPre", label: t("runwayPre"), value: monthsLabel(desk.runway.monthsPre)},
        {id: "runwayPost", label: t("runwayPost"), value: runwayAfterService!.text, absent: runwayAfterService!.absent, hint: t("runwayPostHint", {rate: ratePct(desk.runway.assumedRate) ?? ""})},
        {id: "arr", label: t("arr"), value: millions(desk.runway.arr, locale)},
        {id: "debtToArr", label: t("debtToArr"), value: desk.runway.debtToArr ? `${(Number(desk.runway.debtToArr) * 100).toFixed(0)}%` : null},
        {id: "nrr", label: t("nrr"), value: desk.runway.nrr ? `${(Number(desk.runway.nrr) * 100).toFixed(0)}%` : null},
      ]
    : [];
  // Over a zero EBITDA leverage is absent and the gap is named; over a negative one it is a number without meaning.
  const leveragePre = desk ? ratio(desk, "leverage.preTurns", desk.leverage.preTurns, (value) => turns(value, locale)) : null;
  const leveragePost = desk && requestedScenario ? ratio(desk, "leverage.scenarios.0.postTurns", requestedScenario.postTurns, (value) => turns(value, locale)) : null;
  const coveragePost = desk ? ratio(desk, "leverage.interestCoveragePost", desk.leverage.interestCoveragePost, (value) => turns(value, locale)) : null;
  const cycle = desk ? ratio(desk, "workingCapital.cycleDays", desk.workingCapital.cycleDays, (value) => t("days", {count: days(value) ?? ""})) : null;
  const metrics: Array<{id: string; label: string; value: string | null; hint?: string; absent?: boolean}> = desk
    ? [
        ...runwayMetrics,
        {id: "netDebt", label: t("netDebt"), value: millions(desk.leverage.netDebtPre, locale)},
        {id: "ebitda", label: t("ebitda"), value: millions(desk.leverage.ebitda, locale)},
        {id: "leveragePre", label: t("leveragePre"), value: leveragePre!.absent ? leveragePre!.text : desk.profile === "cash_burning" ? t("notMeaningful") : leveragePre!.text, absent: leveragePre!.absent},
        {
          id: "leveragePost",
          label: t("leveragePost"),
          value: leveragePost?.absent ? leveragePost.text : desk.profile === "cash_burning" ? t("notMeaningful") : leveragePost ? leveragePost.text : null,
          absent: leveragePost?.absent ?? false,
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
          ...(coveragePost!.text ? {hint: t("interestCoveragePostHint", {coverage: coveragePost!.text})} : {}),
        },
        {id: "weightedCost", label: t("weightedCost"), value: ratePct(desk.stack.weightedCost)},
        {
          id: "spread",
          label: t("spreadOverCdi"),
          value: desk.stack.weightedSpreadOverCdi
            ? `CDI ${Number(desk.stack.weightedSpreadOverCdi) < 0 ? "-" : "+"} ${ratePct(String(Math.abs(Number(desk.stack.weightedSpreadOverCdi))))}`
            : null,
        },
        {
          id: "maturing12",
          label: t("maturing12"),
          value: millions(desk.stack.maturingWithin12Months, locale),
          ...(desk.stack.liquidityCoverage12 ? {hint: t("coverage12Hint", {coverage: turns(desk.stack.liquidityCoverage12, locale) ?? ""})} : {}),
        },
        {id: "maturing", label: t("maturing24"), value: millions(desk.stack.maturingWithin24Months, locale)},
        {id: "cycle", label: t("cashCycle"), value: cycle!.text, absent: cycle!.absent},
        {id: "freeReceivables", label: t("freeReceivables"), value: millions(desk.encumbrance.free, locale)},
      ]
    : [];

  const severityLabel = (severity: "critical" | "high" | "medium" | "info") => t(`severity_${severity}`);

  return (
    <div className="case-desk">
      <header className="case-desk__head">
        <h3>{t("title")}</h3>
        {desk ? <span className="case-desk__assumptions">{t("assumptions", {cdi: ratePct(desk.assumptions.cdi) ?? "", date: desk.assumptions.referenceDate})}</span> : null}
      </header>

      {desk ? (
        <>
          <dl className="case-desk__metrics">
            {metrics.map((metric) => (
              <div key={metric.id} className={metric.value === null || metric.absent ? "is-unavailable" : ""}>
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
                  // No peak is marked when the trajectory cannot state one (a year's leverage in the cut case is absent).
                  const isPeak = trajectory.peak !== null && year.year === trajectory.peak.year;
                  const print = (value: string) => turns(value, locale);
                  return (
                    <tr key={year.year} className={isPeak ? "is-peak" : ""}>
                      <th scope="row">{year.year}{isPeak ? <span className="case-desk__peak">{t("peak")}</span> : null}</th>
                      <td>{millions(year.netDebt, locale)}</td>
                      <td>{millions(year.ebitdaBase, locale)}</td>
                      <td>{ratio(trajectory, `years.${year.year}.leverageBase`, year.leverageBase, print).text}</td>
                      <td>{ratio(trajectory, `years.${year.year}.leverageStressed`, year.leverageStressed, print).text}</td>
                      <td>{millions(year.principalDue, locale)}</td>
                      <td>{step ? ratio(trajectory, `covenantProposal.${step.year}.maximum`, step.maximum, print).text : ""}</td>
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
                  leverage: ratio(trajectory, "liabilityManagement.postLeverageAfterRefi", trajectory.liabilityManagement.postLeverageAfterRefi, (value) => turns(value, locale)).text ?? "",
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
              <li key={path} data-field-path={path}>
                <strong>{fieldLabel(path, lang, locale)}</strong>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
