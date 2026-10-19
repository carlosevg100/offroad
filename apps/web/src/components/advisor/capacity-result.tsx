import {getTranslations} from "next-intl/server";
import type {DebtCapacityResultBlocksView} from "@offroad/domain-contracts";
import {formatRounded, shiftDecimal} from "@/lib/execution/format";

/** How much new debt fits and with what profile, as the blocks carry it: the largest amount under
 * each limit and the one that binds, the amount asked reviewed in every case, and the plan in place
 * against cash. Amounts in millions with one decimal and multiples with two, rounded only for
 * display; nothing here recomputes a number. */
export async function CapacityResult({locale, view}: {locale: string; view: DebtCapacityResultBlocksView}) {
  const t = await getTranslations({locale, namespace: "App.workExecutions.capacity"});
  const status = await getTranslations({locale, namespace: "App.workExecutions.decisionStatus"});
  const mi = (v: string | null) => v === null ? "·" : formatRounded(shiftDecimal(v, -6), 1, locale);
  const x = (v: string | null) => v === null ? "·" : `${formatRounded(v, 2, locale)}x`;
  const year = (d: string | null) => d ? d.slice(0, 4) : "";
  const caseLabel = (id: string) => view.cases.find((c) => c.id === id)?.label ?? id;
  const limitLabel = (caseId: string, id: string | null) => id === null ? "·" : view.limits.find((l) => l.caseId === caseId && l.limitId === id)?.label ?? id;
  return <section className="investment-result"><h2>{t("title")}</h2>
    <dl className="execution-facts">
      <dt>{t("status")}</dt><dd>{status(view.framing.status)}</dd>
      <dt>{t("question")}</dt><dd>{view.framing.question}</dd>
    </dl>
    <p>{t("units", {currency: view.framing.currency})}</p>
    <div className="investment-table">
      <table>
        <thead><tr><th scope="col">{t("columns.schedule")}</th><th scope="col">{t("columns.capacity")}</th><th scope="col">{t("columns.binding")}</th></tr></thead>
        <tbody>{view.capacity.map((c) => <tr key={c.caseId} className={c.caseId === view.framing.informedCaseId ? "investment-base" : undefined}>
          <th scope="row">{caseLabel(c.caseId)}</th>
          <td>{mi(c.capacity)}{c.calibrationOnly ? <small>{t("calibrationOnly")}</small> : null}{c.boundedBySearchDomain ? <small>{t("bounded")}</small> : null}</td>
          <td>{c.bindingLimitId ? <>{limitLabel(c.caseId, c.bindingLimitId)}<small>{t("bindingWhen", {year: year(c.bindingDate), scenario: t(`scenarios.${c.bindingScenario ?? "base"}`)})}</small></> : "·"}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <h3>{t("byLimit")}</h3>
    <div className="investment-table">
      <table>
        <thead><tr><th scope="col">{t("columns.schedule")}</th><th scope="col">{t("columns.limit")}</th><th scope="col">{t("columns.capacity")}</th></tr></thead>
        <tbody>{view.limits.map((l) => <tr key={`${l.caseId}:${l.limitId}`}><th scope="row">{caseLabel(l.caseId)}</th><td>{l.label}</td><td>{mi(l.capacity)}</td></tr>)}</tbody>
      </table>
    </div>
    {view.review.length ? <>
      <h3>{t("review", {amount: mi(view.review[0]!.amount)})}</h3>
      <div className="investment-table">
        <table>
          <thead><tr><th scope="col">{t("columns.schedule")}</th><th scope="col">{t("columns.scenario")}</th><th scope="col">{t("columns.fits")}</th>
            <th scope="col">{t("columns.peakLeverage")}</th><th scope="col">{t("columns.minimumCash")}</th><th scope="col">{t("columns.coverage")}</th></tr></thead>
          <tbody>{view.review.map((r) => <tr key={`${r.caseId}:${r.scenario}`}>
            <th scope="row">{caseLabel(r.caseId)}</th><td>{t(`scenarios.${r.scenario}`)}</td>
            <td>{r.fits ? t("fits") : t("doesNotFit", {limits: r.failingLimitIds.map((id) => limitLabel(r.caseId, id)).join("; ")})}</td>
            <td>{x(r.peakLeverage)}<small>{year(r.peakLeverageDate)}</small></td>
            <td>{mi(r.minimumCash)}<small>{year(r.minimumCashDate)}</small></td>
            <td>{x(r.minimumInterestCoverage)}<small>{year(r.minimumInterestCoverageDate)}</small></td>
          </tr>)}</tbody>
        </table>
      </div>
    </> : null}
    {view.plan.length ? <>
      <h3>{t("plan")}</h3>
      <div className="investment-table">
        <table>
          <thead><tr><th scope="col">{t("columns.year")}</th><th scope="col">{t("columns.scheduled")}</th><th scope="col">{t("columns.cashAfterInterest")}</th><th scope="col">{t("columns.pays")}</th></tr></thead>
          <tbody>{view.plan.map((p) => <tr key={p.date}><th scope="row">{year(p.date)}</th><td>{mi(p.scheduledExistingPrincipal)}</td><td>{mi(p.cashAfterInterest)}</td>
            <td>{p.paysWithoutRefinancing ? t("pays") : t("needsRefinancing")}</td></tr>)}</tbody>
        </table>
      </div>
    </> : null}
    <h3>{t("cases")}</h3>
    <ul>{view.cases.map((c) => <li key={c.id}><strong>{c.label}</strong>{c.changes.length ? `: ${c.changes.join("; ")}` : ""}</li>)}</ul>
    <h3>{t("gaps")}</h3>
    {view.informationGaps.length ? <ul>{view.informationGaps.map((g, n) => <li key={n}>{caseLabel(g.caseId)} · <code>{g.operand}</code>: {g.reason}</li>)}</ul> : <p>{t("noGaps")}</p>}
    <h3>{t("exclusionsTitle")}</h3>
    <ul>{view.exclusions.map((e) => <li key={e}>{t.has(`exclusions.${e}`) ? t(`exclusions.${e}`) : e}</li>)}</ul>
  </section>;
}
