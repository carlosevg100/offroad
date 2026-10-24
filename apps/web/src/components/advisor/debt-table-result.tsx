import {getTranslations} from "next-intl/server";
import type {DebtTableResultBlocksView} from "@offroad/domain-contracts";
import {formatIsoDate, formatRounded, shiftDecimal} from "@/lib/execution/format";

/** The company's debt as the blocks carry it: the total in each definition with the bridge from the
 * base, each instrument with the source of its terms, the reconciliation with the balance sheet, the
 * schedule, cross-default and baskets, leverage per definition and what is missing to prove the list
 * complete. Amounts in millions with one decimal, rates and shares in percent, multiples with two,
 * rounded only for display; nothing here recomputes a number. */
export async function DebtTableResult({locale, view}: {locale: string; view: DebtTableResultBlocksView}) {
  const t = await getTranslations({locale, namespace: "App.workExecutions.debtTable"});
  const status = await getTranslations({locale, namespace: "App.workExecutions.decisionStatus"});
  const mi = (v: string | null | undefined) => v == null ? "·" : formatRounded(shiftDecimal(v, -6), 1, locale);
  const pct = (v: string | null | undefined, places = 2) => v == null ? "·" : `${formatRounded(shiftDecimal(v, 2), places, locale)}%`;
  const x = (v: string | null) => v === null ? "·" : `${formatRounded(v, 2, locale)}x`;
  const day = (d: string) => formatIsoDate(d, locale);
  const known = (group: string, key: string) => t.has(`${group}.${key}`) ? t(`${group}.${key}`) : key;
  const instrument = (id: string) => view.instruments.find((i) => i.id === id)?.label ?? id;
  const {reconciliation, creditLines, unusedLimits, outsideEveryView} = view.reconciliation;
  const profile = view.profile;
  const chain = view.security.crossDefault;
  const {completeness, categoryCoverage} = view.completeness;
  const readings = view.framing.readings;
  return <section className="investment-result"><h2>{t("title")}</h2>
    <dl className="execution-facts">
      <dt>{t("status")}</dt><dd>{status(view.framing.status)}</dd>
      <dt>{t("question")}</dt><dd>{view.framing.question}</dd>
      <dt>{t("referenceDate")}</dt><dd>{day(view.framing.referenceDate)}</dd>
    </dl>
    <p>{t("units", {currency: view.framing.currency})}</p>

    <h3>{t("views")}</h3>
    <div className="investment-table">
      <table>
        <thead><tr><th scope="col">{t("columns.view")}</th><th scope="col">{t("columns.total")}</th><th scope="col">{t("columns.netDebt")}</th><th scope="col">{t("columns.bridge")}</th></tr></thead>
        <tbody>{view.views.map((v) => <tr key={v.id}><th scope="row">{v.label}</th><td>{mi(v.total)}</td><td>{mi(v.netDebt)}</td>
          <td>{v.bridgeFromBase.length ? v.bridgeFromBase.map((b) => `${known("components", b.component)} ${mi(b.amount)}`).join("; ") : t("bridgeNone")}</td></tr>)}</tbody>
      </table>
    </div>

    <h3>{t("reconciliation")}</h3>
    {reconciliation ? <>
      <p>{t("reconciliationStatus", {status: known("reconciliationStatuses", reconciliation.status)})}</p>
      <p>{t("reconciliationLine", {principal: mi(reconciliation.principal), accrued: mi(reconciliation.accruedInterest), unamortized: mi(reconciliation.unamortizedCost),
        accounting: mi(reconciliation.accounting), reported: mi(reconciliation.reported), difference: mi(reconciliation.difference)})}</p>
    </> : <p>{t("noReconciliation")}</p>}

    <div className="investment-table">
      <table>
        <thead><tr>
          <th scope="col">{t("columns.instrument")}</th><th scope="col">{t("columns.creditor")}</th><th scope="col">{t("columns.principal")}</th>
          <th scope="col">{t("columns.accounting")}</th><th scope="col">{t("columns.cost")}</th><th scope="col">{t("columns.finalPayment")}</th>
          <th scope="col">{t("columns.guarantee")}</th><th scope="col">{t("columns.covenant")}</th><th scope="col">{t("columns.crossDefault")}</th>
        </tr></thead>
        <tbody>{view.instruments.map((r) => <tr key={r.id}>
          <th scope="row">{r.label}</th><td>{r.creditor}</td><td>{mi(r.principal)}</td><td>{mi(r.accountingBalance)}</td>
          <td>{r.spread === null ? r.indexer : t("spread", {indexer: r.indexer, spread: pct(r.spread)})}</td>
          <td>{day(r.finalPayment)}</td><td>{r.guarantee}</td><td>{r.covenant}</td>
          <td>{r.crossDefault?.threshold ? mi(r.crossDefault.threshold) : t("noThreshold")}</td>
        </tr>)}</tbody>
      </table>
    </div>

    {creditLines.length ? <>
      <h3>{t("creditLines")}</h3>
      <div className="investment-table">
        <table>
          <thead><tr><th scope="col">{t("columns.line")}</th><th scope="col">{t("columns.creditor")}</th><th scope="col">{t("columns.limit")}</th><th scope="col">{t("columns.drawn")}</th><th scope="col">{t("columns.unused")}</th></tr></thead>
          <tbody>{creditLines.map((l) => <tr key={l.id}><th scope="row">{l.label}</th><td>{l.creditor}</td><td>{mi(l.limit)}</td><td>{mi(l.drawn)}</td><td>{mi(l.unused)}</td></tr>)}</tbody>
        </table>
      </div>
      {unusedLimits !== null ? <p>{t("unusedTotal", {amount: mi(unusedLimits)})}</p> : null}
    </> : null}

    {outsideEveryView.length ? <>
      <h3>{t("outside")}</h3>
      <ul>{outsideEveryView.map((o) => <li key={o.id}><strong>{o.label}</strong> · {known("outsideKinds", o.kind)}{o.creditor ? ` · ${o.creditor}` : ""} · {mi(o.amount)}</li>)}</ul>
    </> : null}

    {profile ? <>
      <h3>{t("profile")}</h3>
      <div className="investment-table">
        <table>
          <thead><tr><th scope="col">{t("columns.year")}</th><th scope="col">{t("columns.principal")}</th></tr></thead>
          <tbody>{profile.scheduleByYear.map((y) => <tr key={y.year}><th scope="row">{y.year}</th><td>{mi(y.principal)}</td></tr>)}</tbody>
        </table>
      </div>
      <p>{t("dueTwelve", {amount: mi(profile.dueWithinTwelveMonths), share: pct(profile.dueWithinTwelveMonthsShare, 1)})}</p>
      {profile.weightedAverageLifeYears !== null ? <p>{t("averageLife", {years: formatRounded(profile.weightedAverageLifeYears, 1, locale)})}</p> : null}
      {profile.largestCreditor ? <p>{t("largestCreditor", {creditor: profile.largestCreditor.creditor, amount: mi(profile.largestCreditor.principal), share: pct(profile.largestCreditor.share, 1)})}</p> : null}
      {profile.averageNominalCost !== null ? <p>{t("averageCost", {rate: pct(profile.averageNominalCost)})}</p> : null}
    </> : null}

    {chain ? <>
      <h3>{t("crossDefault")}</h3>
      {chain.lowestThreshold ? <p>{t("lowestThreshold", {instrument: instrument(chain.lowestThreshold.instrumentId), amount: mi(chain.lowestThreshold.threshold)})}</p> : null}
      <div className="investment-table">
        <table>
          <thead><tr><th scope="col">{t("columns.instrument")}</th><th scope="col">{t("columns.threshold")}</th><th scope="col">{t("columns.acceleration")}</th><th scope="col">{t("columns.scope")}</th><th scope="col">{t("columns.triggeredBy")}</th></tr></thead>
          <tbody>{chain.chain.map((c) => <tr key={c.instrumentId}><th scope="row">{instrument(c.instrumentId)}</th><td>{mi(c.threshold)}</td>
            <td>{known("accelerations", c.acceleration)}</td><td>{c.scope}</td><td>{c.potentiallyTriggeredBy.map(instrument).join("; ") || "·"}</td></tr>)}</tbody>
        </table>
      </div>
    </> : null}

    {view.security.negativePledgeBaskets.length ? <>
      <h3>{t("baskets")}</h3>
      <div className="investment-table">
        <table>
          <thead><tr><th scope="col">{t("columns.holder")}</th><th scope="col">{t("columns.basket")}</th><th scope="col">{t("columns.occupied")}</th><th scope="col">{t("columns.remaining")}</th><th scope="col">{t("columns.usedBy")}</th></tr></thead>
          <tbody>{view.security.negativePledgeBaskets.map((b) => <tr key={b.holderId}><th scope="row">{instrument(b.holderId)}</th><td>{mi(b.basket)}</td><td>{mi(b.occupied)}</td>
            <td>{mi(b.remaining)}<small>{b.exceeded ? t("exceeded") : t("notExceeded")}</small></td><td>{b.usedBy.map(instrument).join("; ") || "·"}</td></tr>)}</tbody>
        </table>
      </div>
    </> : null}

    {view.leverage.length ? <>
      <h3>{t("leverage")}</h3>
      <div className="investment-table">
        <table>
          <thead><tr><th scope="col">{t("columns.definition")}</th><th scope="col">{t("columns.netDebt")}</th><th scope="col">{t("columns.denominator")}</th><th scope="col">{t("columns.ratio")}</th></tr></thead>
          <tbody>{view.leverage.map((l) => <tr key={l.viewId}><th scope="row">{l.label}</th><td>{mi(l.netDebt)}</td><td>{mi(l.denominator)}</td><td>{x(l.ratio)}</td></tr>)}</tbody>
        </table>
      </div>
    </> : null}

    <h3>{t("completeness")}</h3>
    {completeness ? <>
      <p>{known("completenessStatuses", completeness.status)} {completeness.evidence}</p>
      {completeness.request ? <p>{known("requests", completeness.request)}</p> : null}
    </> : null}
    {readings?.categoriesNotExamined.length ? <p>{t("categoriesNotExamined", {list: readings.categoriesNotExamined.map((k) => known("components", k)).join("; ")})}</p> : null}
    {categoryCoverage.length ? <><p>{t("coverageTitle")}</p>
      <ul>{categoryCoverage.map((c) => <li key={c.kind}>{known("components", c.kind)}: {known("coverageStatuses", c.status)}</li>)}</ul></> : null}

    <h3>{t("gaps")}</h3>
    {view.informationGaps.length ? <ul>{view.informationGaps.map((g, n) => <li key={n}><code>{g.operand}</code>: {g.reason}</li>)}</ul> : <p>{t("noGaps")}</p>}
    <h3>{t("exclusionsTitle")}</h3>
    <ul>{view.exclusions.map((e) => <li key={e}>{known("exclusions", e)}</li>)}</ul>
  </section>;
}
