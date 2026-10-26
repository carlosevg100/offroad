import {getTranslations} from "next-intl/server";
import type {ReceivablesFundingResultBlocksView} from "@offroad/domain-contracts";
import {formatIsoDate, formatRounded, shiftDecimal} from "@/lib/execution/format";

/** How much of the portfolio turns into cash, as the blocks carry it: the assignable part of the gross
 * first, each group with the reason for what is left out, each option with its volume and its cost for
 * the same amount and time against the bank line, the plan from the cheapest option with the line as
 * reserve, when to start, the conditions, what a release frees and the questions that change the plan.
 * No buyer is named or contacted and no approval is promised. Amounts in millions with one decimal and
 * costs with two, rates in percent a year, rounded only for display. */
export async function ReceivablesFundingResult({locale, view}: {locale: string; view: ReceivablesFundingResultBlocksView}) {
  const t = await getTranslations({locale, namespace: "App.workExecutions.receivablesFunding"});
  const status = await getTranslations({locale, namespace: "App.workExecutions.decisionStatus"});
  const mi = (v: string | null) => v === null ? "·" : formatRounded(shiftDecimal(v, -6), 1, locale);
  const cost = (v: string | null) => v === null ? "·" : formatRounded(shiftDecimal(v, -6), 2, locale);
  const pct = (v: string | null) => v === null ? "·" : `${formatRounded(shiftDecimal(v, 2), 1, locale)}%`;
  const rate = (v: string) => `${formatRounded(shiftDecimal(v, 2), 2, locale)}%`;
  const day = (d: string | null) => d === null ? "·" : formatIsoDate(d, locale);
  const known = (group: string, key: string) => t.has(`${group}.${key}`) ? t(`${group}.${key}`) : key;
  const yesNo = (v: boolean | null) => v === null ? t("unknown") : v ? t("yes") : t("no");
  const {framing} = view;
  const option = (id: string) => view.options.find((o) => o.id === id)?.label ?? id;
  const item = (id: string) => view.portfolio.find((i) => i.itemId === id)?.label ?? id;
  return <section className="investment-result"><h2>{t("title")}</h2>
    <dl className="execution-facts">
      <dt>{t("status")}</dt><dd>{status(framing.status)}</dd>
      <dt>{t("question")}</dt><dd>{framing.question}</dd>
    </dl>
    <p>{t("units", {currency: framing.currency})}</p>
    {framing.referenceDate ? <p>{t("referenceDate", {date: day(framing.referenceDate)})}</p> : null}

    {framing.gross !== null && framing.assignable !== null ? <p><strong>{t("headline", {gross: mi(framing.gross), assignable: mi(framing.assignable), share: pct(framing.assignableShare)})}</strong></p>
      : <p>{t("noReading")}</p>}
    {framing.need ? <p>{t("need", {average: mi(framing.need.average), peak: mi(framing.need.peak), start: day(framing.need.startDate), days: framing.need.calendarDays,
      profile: known("profiles", framing.need.profile)})}</p> : null}

    {view.portfolio.length ? <>
      <h3>{t("portfolio")}</h3>
      <div className="investment-table">
        <table>
          <thead><tr><th scope="col">{t("columns.group")}</th><th scope="col">{t("columns.amount")}</th><th scope="col">{t("columns.assignable")}</th><th scope="col">{t("columns.excluded")}</th>
            <th scope="col">{t("columns.reasons")}</th><th scope="col">{t("columns.holder")}</th></tr></thead>
          <tbody>{view.portfolio.map((i) => <tr key={i.itemId}><th scope="row">{i.label}</th><td>{mi(i.amount)}</td><td>{mi(i.assignable)}</td><td>{mi(i.excluded)}</td>
            <td>{i.reasons.length ? i.reasons.map((r) => known("reasons", r)).join("; ") : "·"}</td>
            <td>{i.encumbranceHolder ? (i.releaseEvent ? t("holderUntil", {holder: i.encumbranceHolder, event: i.releaseEvent}) : i.encumbranceHolder) : "·"}</td></tr>)}</tbody>
        </table>
      </div>
    </> : null}

    {view.options.length ? <>
      <h3>{t("options")}</h3>
      <p>{t("optionsNote")}</p>
      <div className="investment-table">
        <table>
          <thead><tr><th scope="col">{t("columns.option")}</th><th scope="col">{t("columns.kind")}</th><th scope="col">{t("columns.volume")}</th><th scope="col">{t("columns.cost")}</th>
            <th scope="col">{t("columns.differenceToBankLine")}</th><th scope="col">{t("columns.annualEffective")}</th><th scope="col">{t("columns.spreadOverDi")}</th><th scope="col">{t("columns.iof")}</th>
            <th scope="col">{t("columns.balanceSheet")}</th><th scope="col">{t("columns.lien")}</th></tr></thead>
          <tbody>{view.options.map((o) => <tr key={o.id}><th scope="row">{o.label ?? o.id}</th><td>{known("kinds", o.kind)}</td>
            <td>{o.volume === null ? t("notApplicable") : `${mi(o.volume)}${o.volumeVerified ? "" : ` (${t("toConfirm")})`}`}</td><td>{cost(o.cost)}</td><td>{cost(o.differenceToBankLine)}</td>
            <td>{rate(o.annualEffective)}</td><td>{rate(o.spreadOverDi)}</td><td>{yesNo(o.iofApplies)}</td><td>{known("balanceSheets", o.balanceSheet)}</td><td>{known("liens", o.lien)}</td></tr>)}</tbody>
        </table>
      </div>
    </> : null}

    {view.plan.length ? <>
      <h3>{t("plan")}</h3>
      <div className="investment-table">
        <table>
          <thead><tr><th scope="col">{t("columns.option")}</th><th scope="col">{t("columns.capacity")}</th><th scope="col">{t("columns.allocated")}</th><th scope="col">{t("columns.cumulative")}</th></tr></thead>
          <tbody>{view.plan.map((s) => <tr key={s.optionId}><th scope="row">{option(s.optionId)}</th><td>{mi(s.capacity)}</td><td>{mi(s.amount)}</td><td>{mi(s.cumulative)}</td></tr>)}</tbody>
        </table>
      </div>
    </> : null}
    {framing.planCoversPeak !== null ? <p>{framing.planCoversPeak ? t("coversPeak") : t("doesNotCoverPeak")}</p> : null}
    {framing.bankLineReserve ? <p>{t("reserve", {line: option(framing.bankLineReserve)})}</p> : null}
    {framing.startBy ? <p><strong>{t("startBy", {date: day(framing.startBy), slack: framing.slackDays ?? 0})}</strong></p> : null}
    {framing.conditionsPrecedent.length ? <ul>{framing.conditionsPrecedent.map((c) => <li key={c.code}>{t(`conditions.${c.code}`, {amount: mi(c.amount)})}</li>)}</ul> : null}

    {view.releases.length ? <>
      <h3>{t("releases")}</h3>
      <ul>{view.releases.map((r) => <li key={r.itemId}>{t("release", {event: r.releaseEvent, amount: mi(r.amount), item: item(r.itemId), after: mi(r.assignableAfterRelease)})}
        {r.verified ? "" : ` ${t("releaseUnverified")}`}</li>)}</ul>
    </> : null}

    {framing.dedicatedVehicle ? <p>{t("dedicatedVehicle", {monthly: mi(framing.dedicatedVehicle.monthlyAssignable)})} {known("vehicleReadings", framing.dedicatedVehicle.reading)}</p> : null}

    {view.questions.length ? <>
      <h3>{t("questions")}</h3>
      <ul>{view.questions.map((q, n) => <li key={n}>{t(`questionCodes.${q.code}`, {item: q.itemId ? item(q.itemId) : "", amount: mi(q.amount)})}</li>)}</ul>
    </> : null}

    {framing.process ? <p>{t("process")}</p> : null}

    <h3>{t("gaps")}</h3>
    {view.informationGaps.length ? <ul>{view.informationGaps.map((g, n) => <li key={n}><code>{g.operand}</code>: {known("gapReasons", g.reason)}</li>)}</ul> : <p>{t("noGaps")}</p>}
    <h3>{t("exclusionsTitle")}</h3>
    <ul>{view.exclusions.map((e) => <li key={e}>{known("exclusions", e)}</li>)}</ul>
  </section>;
}
