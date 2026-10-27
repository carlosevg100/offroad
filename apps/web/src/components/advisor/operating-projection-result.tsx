import {getTranslations} from "next-intl/server";
import type {OperatingProjectionResultBlocksView} from "@offroad/domain-contracts";
import {formatIsoDate, formatRounded, shiftDecimal} from "@/lib/execution/format";

/** The projection by driver as the blocks carry it: the last year rebuilt from its drivers first, then
 * the base by year to the cash available for debt, the company's own versions side by side with the
 * cause of each difference, sensitivities in currency, the scenarios against their base, data apart
 * from assumptions and the questions only the company can answer. Amounts in millions with one
 * decimal, margins in percent, rounded only for display; nothing here recomputes a number. */
export async function OperatingProjectionResult({locale, view}: {locale: string; view: OperatingProjectionResultBlocksView}) {
  const t = await getTranslations({locale, namespace: "App.workExecutions.operatingProjection"});
  const status = await getTranslations({locale, namespace: "App.workExecutions.decisionStatus"});
  const mi = (v: string | null) => v === null ? "·" : formatRounded(shiftDecimal(v, -6), 1, locale);
  const pct = (v: string | null) => v === null ? "·" : `${formatRounded(shiftDecimal(v, 2), 1, locale)}%`;
  const period = (p: string) => formatIsoDate(p, locale);
  /** A scenario by the label the result gives it; the id only when the result carries none. */
  const scenarioName = (id: string) => view.scenarios.find((s) => s.id === id)?.label ?? id;
  const known = (group: string, key: string) => t.has(`${group}.${key}`) ? t(`${group}.${key}`) : key;
  const {framing} = view;
  const c = framing.calibration;
  const assumptions = [...new Set(view.ledger.filter((l) => l.nature === "assumption").map((l) => known("drivers", l.driver)))];
  const data = view.ledger.filter((l) => l.nature === "data").length;
  return <section className="investment-result"><h2>{t("title")}</h2>
    <dl className="execution-facts">
      <dt>{t("status")}</dt><dd>{status(framing.status)}</dd>
      <dt>{t("question")}</dt><dd>{framing.question}</dd>
      {framing.purpose ? <><dt>{t("purpose")}</dt><dd>{framing.purpose}</dd></> : null}
    </dl>
    <p>{t("units", {currency: framing.currency})}</p>

    {c ? <>
      <p><strong>{t("calibration", {period: period(c.periodId), reportedRevenue: mi(c.reportedRevenue), modeledRevenue: mi(c.modeledRevenue),
        reportedEbitda: mi(c.reportedEbitda), modeledEbitda: mi(c.modeledEbitda)})}</strong></p>
      <p>{c.reproduces ? t("reproduces") : t("notReproduced")} {c.documented ? t("documented") : t("notDocumented")}</p>
    </> : <p>{t("noCalibration")}</p>}

    {view.base.length ? <>
      <h3>{t("base")}</h3>
      <div className="investment-table">
        <table>
          <thead><tr><th scope="col">{t("columns.period")}</th><th scope="col">{t("columns.revenue")}</th><th scope="col">{t("columns.ebitda")}</th><th scope="col">{t("columns.margin")}</th>
            <th scope="col">{t("columns.workingCapital")}</th><th scope="col">{t("columns.cashForDebt")}</th><th scope="col">{t("columns.conversion")}</th></tr></thead>
          <tbody>{view.base.map((r) => <tr key={r.periodId}><th scope="row">{period(r.periodId)}</th><td>{mi(r.revenue)}</td><td>{mi(r.ebitda)}</td><td>{pct(r.margin)}</td>
            <td>{mi(r.changeInWorkingCapital)}</td><td>{mi(r.cashAvailableForDebt)}</td><td>{pct(r.conversion)}</td></tr>)}</tbody>
        </table>
      </div>
    </> : null}

    {view.comparisons.length ? <>
      <h3>{t("comparisons")}</h3>
      <p>{t("comparisonsNote")}</p>
      <div className="investment-table">
        <table>
          <thead><tr><th scope="col">{t("columns.version")}</th><th scope="col">{t("columns.versionStatus")}</th><th scope="col">{t("columns.period")}</th><th scope="col">{t("columns.metric")}</th>
            <th scope="col">{t("columns.company")}</th><th scope="col">{t("columns.projected")}</th><th scope="col">{t("columns.difference")}</th><th scope="col">{t("columns.cause")}</th></tr></thead>
          <tbody>{view.comparisons.map((r) => <tr key={`${r.versionId}:${r.periodId}:${r.metric}`}><th scope="row">{r.versionId}</th><td>{known("versionStatuses", r.status)}</td>
            <td>{period(r.periodId)}</td><td>{known("metrics", r.metric)}</td><td>{mi(r.companyValue)}</td><td>{mi(r.projectedValue)}</td><td>{mi(r.difference)}</td>
            <td>{r.cause ?? t("noCause")}</td></tr>)}</tbody>
        </table>
      </div>
    </> : null}

    {view.sensitivities.length ? <>
      <h3>{t("sensitivities")}</h3>
      <div className="investment-table">
        <table>
          <thead><tr><th scope="col">{t("columns.period")}</th><th scope="col">{t("columns.price")}</th><th scope="col">{t("columns.inputCost")}</th><th scope="col">{t("columns.receivableDay")}</th></tr></thead>
          <tbody>{view.sensitivities.map((r) => <tr key={r.periodId}><th scope="row">{period(r.periodId)}</th><td>{mi(r.ebitdaPerOnePercentPrice)}</td>
            <td>{mi(r.ebitdaLossPerOnePercentInputCost)}</td><td>{mi(r.workingCapitalPerReceivableDay)}</td></tr>)}</tbody>
        </table>
      </div>
    </> : null}

    {view.scenarios.length ? <>
      <h3>{t("scenarios")}</h3>
      {view.largestCashReduction ? <p><strong>{t("largestCashReduction", {scenario: scenarioName(view.largestCashReduction.scenarioId), period: period(view.largestCashReduction.periodId),
        cash: mi(view.largestCashReduction.cashEffect), workingCapital: mi(view.largestCashReduction.workingCapitalChangeEffect)})}</strong></p> : null}
      {view.scenarios.map((s) => <div key={s.id}>
        <h4>{t("scenario", {id: s.label ?? s.id, role: known("roles", s.role), basedOn: s.basedOn === "base" ? t("baseName") : scenarioName(s.basedOn)})}</h4>
        {s.changes.length ? <p>{t("changes", {list: s.changes.map((x) => `${known("drivers", x.item)} (${known("natures", x.nature)})`).join("; ")})}</p> : null}
        <div className="investment-table">
          <table>
            <thead><tr><th scope="col">{t("columns.period")}</th><th scope="col">{t("columns.ebitda")}</th><th scope="col">{t("columns.margin")}</th><th scope="col">{t("columns.cashForDebt")}</th>
              <th scope="col">{t("columns.ebitdaEffect")}</th><th scope="col">{t("columns.cashEffect")}</th></tr></thead>
            <tbody>{s.rows.map((r) => <tr key={r.periodId}><th scope="row">{period(r.periodId)}</th><td>{mi(r.ebitda)}</td><td>{pct(r.margin)}</td><td>{mi(r.cashAvailableForDebt)}</td>
              <td>{mi(r.effects.ebitda)}</td><td>{mi(r.effects.cashAvailableForDebt)}</td></tr>)}</tbody>
          </table>
        </div>
      </div>)}
    </> : null}

    {view.ledger.length ? <>
      <h3>{t("ledger")}</h3>
      <p>{t("ledgerLine", {data, assumptions: view.ledger.length - data})}</p>
      {assumptions.length ? <p>{t("assumptionDrivers", {list: assumptions.join("; ")})}</p> : null}
    </> : null}

    {framing.questions.length ? <>
      <h3>{t("questionsTitle")}</h3>
      <ul>{framing.questions.map((q) => <li key={q}>{known("questions", q)}</li>)}</ul>
    </> : null}
    {framing.openQuestions.length ? <p>{t("openQuestions", {list: framing.openQuestions.join("; ")})}</p> : null}

    <h3>{t("gaps")}</h3>
    {view.informationGaps.length ? <ul>{view.informationGaps.map((g, n) => <li key={n}><code>{g.operand}</code>: {g.reason}</li>)}</ul> : <p>{t("noGaps")}</p>}
    <h3>{t("exclusionsTitle")}</h3>
    <ul>{view.exclusions.map((e) => <li key={e}>{known("exclusions", e)}</li>)}</ul>
  </section>;
}
