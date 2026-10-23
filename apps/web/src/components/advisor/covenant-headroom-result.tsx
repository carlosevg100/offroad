import {getTranslations} from "next-intl/server";
import type {CovenantHeadroomResultBlocksView} from "@offroad/domain-contracts";
import {formatIsoDate, formatRounded, shiftDecimal} from "@/lib/execution/format";

type Measurement = CovenantHeadroomResultBlocksView["measurements"][number];

/** Where the company stands against each covenant and the board policy, as the blocks carry it: the
 * headline date, ratio and tightest limit first, then the headroom per limit in EBITDA and in net
 * debt, the other measurements, contrasts named as contrasts, effects and the consequence of a
 * breach. Amounts in millions with one decimal, ratios with two, shares in percent, rounded only
 * for display; nothing here recomputes a number. */
export async function CovenantHeadroomResult({locale, view}: {locale: string; view: CovenantHeadroomResultBlocksView}) {
  const t = await getTranslations({locale, namespace: "App.workExecutions.covenantHeadroom"});
  const status = await getTranslations({locale, namespace: "App.workExecutions.decisionStatus"});
  const mi = (v: string | null) => v === null ? "·" : formatRounded(shiftDecimal(v, -6), 1, locale);
  const pct = (v: string | null) => v === null ? "·" : `${formatRounded(shiftDecimal(v, 2), 1, locale)}%`;
  const x = (v: string | null) => v === null ? t("notMeasured") : `${formatRounded(v, 2, locale)}x`;
  const day = (d: string) => formatIsoDate(d, locale);
  const known = (group: string, key: string) => t.has(`${group}.${key}`) ? t(`${group}.${key}`) : key;
  const limit = (id: string | null) => id === null ? "·" : view.limits.find((l) => l.id === id)?.label ?? id;
  const measurement = (id: string) => view.measurements.find((m) => m.id === id)?.label ?? id;
  const readings = view.framing.readings;
  const headline = readings?.headline ?? null;
  const tests = view.measurements.filter((m) => m.role === "test");
  const contrasts = view.measurements.filter((m) => m.role === "contrast");
  const {consequence, definitions, openQuestions} = view.consequence;
  const measurementsTable = (rows: readonly Measurement[]) => <div className="investment-table">
    <table>
      <thead><tr><th scope="col">{t("columns.measurement")}</th><th scope="col">{t("columns.date")}</th><th scope="col">{t("columns.scenario")}</th>
        <th scope="col">{t("columns.netDebt")}</th><th scope="col">{t("columns.ebitda")}</th><th scope="col">{t("columns.ratio")}</th><th scope="col">{t("columns.tightest")}</th></tr></thead>
      <tbody>{rows.map((m) => {
        const tight = m.tests.find((c) => c.limitId === m.tightestLimitId) ?? null;
        return <tr key={m.id}><th scope="row">{m.label}</th><td>{day(m.date)}</td><td>{known("scenarios", m.scenario)}</td><td>{mi(m.netDebt)}</td><td>{mi(m.ebitda)}</td><td>{x(m.ratio)}</td>
          <td>{limit(m.tightestLimitId)}{tight ? <small>{t("columns.ebitdaHeadroom")}: {mi(tight.ebitdaHeadroom)}{tight.breached ? ` · ${t("columns.breached")} ${t("yes")}` : ""}</small> : null}</td></tr>;
      })}</tbody>
    </table>
  </div>;
  return <section className="investment-result"><h2>{t("title")}</h2>
    <dl className="execution-facts">
      <dt>{t("status")}</dt><dd>{status(view.framing.status)}</dd>
      <dt>{t("question")}</dt><dd>{view.framing.question}</dd>
      <dt>{t("readingDate")}</dt><dd>{day(view.framing.readingDate)}</dd>
    </dl>
    <p>{t("units", {currency: view.framing.currency})}</p>

    {headline ? <>
      <p><strong>{headline.ratio === null ? t("headlineNoRatio", {date: day(headline.date)})
        : t("headline", {date: day(headline.date), ratio: x(headline.ratio), limit: limit(headline.tightestLimitId)})}</strong></p>
      <div className="investment-table">
        <table>
          <thead><tr><th scope="col">{t("columns.limit")}</th><th scope="col">{t("columns.kind")}</th><th scope="col">{t("columns.ebitdaHeadroom")}</th>
            <th scope="col">{t("columns.netDebtHeadroom")}</th><th scope="col">{t("columns.unrealized")}</th><th scope="col">{t("columns.breached")}</th></tr></thead>
          <tbody>{headline.byLimit.map((b) => <tr key={b.limitId}><th scope="row">{limit(b.limitId)}</th><td>{known("kinds", b.kind)}</td><td>{mi(b.ebitdaHeadroom)}</td>
            <td>{mi(b.netDebtHeadroom)}</td><td>{pct(b.unrealizedEbitdaLossToLimit)}</td><td>{b.breached ? t("yes") : t("no")}</td></tr>)}</tbody>
        </table>
      </div>
    </> : null}
    {readings ? <>
      {headline && headline.byLimit.some((b) => b.kind === "board_policy") ? <p>{readings.policyBindsFirst ? t("policyBindsFirst") : t("contractBindsFirst")}</p> : null}
      {readings.worst ? <p>{t("worst", {measurement: measurement(readings.worst.measurementId), limit: limit(readings.worst.limitId), amount: mi(readings.worst.ebitdaHeadroom)})}</p> : null}
      <p>{readings.anyBreach ? t("anyBreach") : t("noBreach")}</p>
    </> : null}

    <h3>{t("limits")}</h3>
    <ul>{view.limits.map((l) => {
      const state = typeof l.status === "string" ? l.status : null;
      return <li key={l.id}><strong>{l.label}</strong> · {known("kinds", l.kind)}{state ? ` · ${known("limitStatuses", state)}` : ""}</li>;
    })}</ul>

    {tests.length ? <><h3>{t("tests")}</h3>{measurementsTable(tests)}</> : null}
    {contrasts.length ? <><h3>{t("contrasts")}</h3><p>{t("contrastsNote")}</p>{measurementsTable(contrasts)}</> : null}

    {view.effects.length ? <>
      <h3>{t("effects")}</h3>
      <div className="investment-table">
        <table>
          <thead><tr><th scope="col">{t("columns.effect")}</th><th scope="col">{t("columns.ratioEffect")}</th><th scope="col">{t("columns.netDebtEffect")}</th></tr></thead>
          <tbody>{view.effects.map((e) => <tr key={e.id}><th scope="row">{e.label}</th><td>{e.ratioEffect === null ? "·" : `${formatRounded(e.ratioEffect, 2, locale)}x`}</td><td>{mi(e.netDebtEffect)}</td></tr>)}</tbody>
        </table>
      </div>
    </> : null}

    <h3>{t("consequence")}</h3>
    <dl className="execution-facts">
      <dt>{t("acceleration")}</dt><dd>{consequence.acceleration ? known("accelerations", consequence.acceleration) : "·"}</dd>
      <dt>{t("process")}</dt><dd>{consequence.process ?? "·"}</dd>
      <dt>{t("crossDefaultLabel")}</dt><dd>{consequence.crossDefault ?? "·"}</dd>
    </dl>

    {definitions.length ? <><h3>{t("definitions")}</h3>
      <ul>{definitions.map((d) => <li key={d.limitId}><strong>{limit(d.limitId)}</strong>: {d.definition ?? t("definitionMissing")}</li>)}</ul></> : null}
    {openQuestions.length ? <><h3>{t("openQuestions")}</h3>
      <ul>{openQuestions.map((q, n) => <li key={n}><strong>{limit(q.limitId)}</strong>: {known("questions", q.question)}</li>)}</ul></> : null}

    <h3>{t("gaps")}</h3>
    {view.informationGaps.length ? <ul>{view.informationGaps.map((g, n) => <li key={n}><code>{g.operand}</code>: {g.reason}</li>)}</ul> : <p>{t("noGaps")}</p>}
    <h3>{t("exclusionsTitle")}</h3>
    <ul>{view.exclusions.map((e) => <li key={e}>{known("exclusions", e)}</li>)}</ul>
  </section>;
}
