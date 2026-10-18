import {getTranslations} from "next-intl/server";
import type {InvestmentResultBlocksView} from "@offroad/domain-contracts";
import {formatRounded, shiftDecimal} from "@/lib/execution/format";

/** The case comparison of an investment analysis, as its blocks carry it. Amounts in millions with
 * one decimal and rates in percent with one decimal, rounded only for display; the numbers come from
 * the result and nothing here recomputes them. */
export async function InvestmentResult({locale, view}: {locale: string; view: InvestmentResultBlocksView}) {
  const t = await getTranslations({locale, namespace: "App.workExecutions.investment"});
  const status = await getTranslations({locale, namespace: "App.workExecutions.decisionStatus"});
  const mi = (v: string | null) => v === null ? "·" : formatRounded(shiftDecimal(v, -6), 1, locale);
  const pct = (v: string | null) => v === null ? "·" : `${formatRounded(shiftDecimal(v, 2), 1, locale)}%`;
  const years = (v: string | null) => v === null ? "·" : formatRounded(v, 1, locale);
  const label = (id: string) => view.cases.find(c => c.id === id)?.label ?? id;
  const when = new Intl.DateTimeFormat(locale, {month: "short", year: "numeric", timeZone: "UTC"});
  const month = (d: string | null) => d ? when.format(new Date(`${d}T00:00:00Z`)) : "";
  const rate = view.metrics.find(m => m.caseId === view.framing.baseCaseId)?.discountRate ?? null;
  return <section className="investment-result"><h2>{t("title")}</h2>
    <dl className="execution-facts">
      <dt>{t("status")}</dt><dd>{status(view.framing.status)}</dd>
      <dt>{t("question")}</dt><dd>{view.framing.question}</dd>
    </dl>
    <p>{rate === null ? t("unitsNoRate", {currency: view.framing.currency}) : t("units", {currency: view.framing.currency, rate: pct(rate)})}</p>
    <div className="investment-table">
      <table>
        <thead><tr>
          <th scope="col">{t("columns.case")}</th><th scope="col">{t("columns.npv")}</th><th scope="col">{t("columns.deltaNpv")}</th>
          <th scope="col">{t("columns.irr")}</th><th scope="col">{t("columns.payback")}</th><th scope="col">{t("columns.startup")}</th>
          <th scope="col">{t("columns.peak")}</th><th scope="col">{t("columns.minWithout")}</th><th scope="col">{t("columns.minWith")}</th>
        </tr></thead>
        <tbody>{view.metrics.map(m => <tr key={m.caseId} className={m.caseId === view.framing.baseCaseId ? "investment-base" : undefined}>
          <th scope="row">{label(m.caseId)}</th>
          <td>{mi(m.netPresentValue)}</td>
          <td>{m.caseId === view.framing.baseCaseId ? "·" : mi(m.deltaNetPresentValue)}</td>
          <td>{m.annualIrr !== null ? pct(m.annualIrr) : m.irrStatus && m.irrStatus !== "calculated" ? t("irrNotDefined") : "·"}</td>
          <td>{years(m.paybackYears)}</td>
          <td>{mi(m.startupWorkingCapital)}</td>
          <td>{mi(m.peakCashNeed)}{m.peakCashNeedDate ? <small> {month(m.peakCashNeedDate)}</small> : null}</td>
          <td>{mi(m.companyMinimumCashWithout)}{m.companyMinimumCashWithoutDate ? <small> {month(m.companyMinimumCashWithoutDate)}</small> : null}</td>
          <td>{mi(m.companyMinimumCashWith)}{m.companyMinimumCashWithDate ? <small> {month(m.companyMinimumCashWithDate)}</small> : null}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <h3>{t("changing")}</h3>
    {view.conclusionChangingCaseIds.length ? <ul>{view.conclusionChangingCaseIds.map(id => <li key={id}>{label(id)}</li>)}</ul> : <p>{t("noneChanging")}</p>}
    {view.timingCaseIds.length ? <><h3>{t("timing")}</h3><ul>{view.timingCaseIds.map(id => <li key={id}>{label(id)}</li>)}</ul></> : null}
    <h3>{t("cases")}</h3>
    <ul>{view.cases.filter(c => c.changes.length).map(c => <li key={c.id}><strong>{c.label}</strong>: {c.changes.join("; ")}</li>)}</ul>
    <h3>{t("gaps")}</h3>
    {view.informationGaps.length ? <ul>{view.informationGaps.map((g, n) => <li key={n}>{label(g.caseId)} · <code>{g.operand}</code>: {g.reason}</li>)}</ul> : <p>{t("noGaps")}</p>}
    <h3>{t("exclusionsTitle")}</h3>
    <ul>{view.exclusions.map(x => <li key={x}>{t.has(`exclusions.${x}`) ? t(`exclusions.${x}`) : x}</li>)}</ul>
  </section>;
}
