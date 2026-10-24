import {getTranslations} from "next-intl/server";
import type {WeeklyCashResultBlocksView} from "@offroad/domain-contracts";
import {formatIsoDate, formatRounded, shiftDecimal} from "@/lib/execution/format";

/** Cash week by week to the horizon, as the blocks carry it: the tightest week and its closing first,
 * the weeks below the minimum and the shortfall, what goes out in them, whether the period closing
 * hides the week, the cheapest covering action and every action by cost, sensitivities, the weeks of
 * the stated case, the calendar, the reconciliation with the projection and the obligations
 * covered. Amounts in millions with one decimal and action costs with two, rounded only for
 * display; nothing here recomputes a number. */
export async function WeeklyCashResult({locale, view}: {locale: string; view: WeeklyCashResultBlocksView}) {
  const t = await getTranslations({locale, namespace: "App.workExecutions.weeklyCash"});
  const status = await getTranslations({locale, namespace: "App.workExecutions.decisionStatus"});
  const mi = (v: string | null) => v === null ? "·" : formatRounded(shiftDecimal(v, -6), 1, locale);
  const cost = (v: string) => formatRounded(shiftDecimal(v, -6), 2, locale);
  const day = (d: string | null) => d === null ? "·" : formatIsoDate(d, locale);
  const known = (group: string, key: string) => t.has(`${group}.${key}`) ? t(`${group}.${key}`) : key;
  const yesNo = (v: boolean | null) => v === null ? t("unknown") : v ? t("yes") : t("no");
  const caseLabel = (id: string) => view.cases.find((c) => c.id === id)?.label ?? id;
  const action = (id: string) => view.actions.find((a) => a.id === id) ?? null;
  const {framing} = view;
  const readings = framing.readings;
  const informed = view.cases.find((c) => c.role === "informed") ?? null;
  const weeks = informed ? view.weeks.filter((w) => w.caseId === informed.id) : [];
  const covers = new Map((readings?.actionsByCost ?? []).map((a) => [a.id, a.covers]));
  const ordered = readings ? [...readings.actionsByCost.flatMap((a) => action(a.id) ?? []), ...view.actions.filter((a) => !covers.has(a.id))] : view.actions;
  const {reconciliation, coverage} = view.reconciliation;
  return <section className="investment-result"><h2>{t("title")}</h2>
    <dl className="execution-facts">
      <dt>{t("status")}</dt><dd>{status(framing.status)}</dd>
      <dt>{t("question")}</dt><dd>{framing.question}</dd>
    </dl>
    <p>{t("units", {currency: framing.currency})}</p>
    {framing.firstMonday ? <p>{t("horizon", {from: day(framing.firstMonday), to: day(framing.horizonEnd), opening: mi(framing.openingCash), minimum: mi(framing.minimumCash)})}</p> : null}

    {readings ? <>
      <p><strong>{t("tightest", {week: day(readings.tightestWeek.weekStart), closing: mi(readings.tightestWeek.closing)})}</strong></p>
      <p>{readings.weeksBelowMinimum.length ? t("belowMinimum", {list: readings.weeksBelowMinimum.map(day).join("; "), amount: mi(readings.shortfallToMinimum)}) : t("noneBelow")}</p>
      {readings.causes.length ? <><h3>{t("causes")}</h3>
        <ul>{readings.causes.map((c) => <li key={c.streamId}>{c.label}: {mi(c.amount)}</li>)}</ul></> : null}
      <p>{readings.closingHidesTheWeek ? t("closingHides") : t("closingShows")}</p>
      {readings.cheapestCoveringAction ? <p>{t("cheapest", {action: action(readings.cheapestCoveringAction.id)?.label ?? readings.cheapestCoveringAction.id, cost: cost(readings.cheapestCoveringAction.cost)})}
        {readings.cheapestCoveringAction.openAtCovenantTest ? ` ${t("cheapestOpen")}` : ""}</p> : <p>{t("noCheapest")}</p>}
    </> : null}

    {ordered.length ? <>
      <h3>{t("actions")}</h3>
      <div className="investment-table">
        <table>
          <thead><tr><th scope="col">{t("columns.action")}</th><th scope="col">{t("columns.amount")}</th><th scope="col">{t("columns.days")}</th><th scope="col">{t("columns.interest")}</th>
            <th scope="col">{t("columns.iof")}</th><th scope="col">{t("columns.fee")}</th><th scope="col">{t("columns.cost")}</th><th scope="col">{t("columns.covers")}</th><th scope="col">{t("columns.openAtTest")}</th></tr></thead>
          <tbody>{ordered.map((a) => <tr key={a.id}><th scope="row">{a.label}</th><td>{mi(a.amount)}</td><td>{a.days}</td><td>{cost(a.interest)}</td><td>{cost(a.iof)}</td>
            <td>{cost(a.fee)}</td><td>{cost(a.cost)}</td><td>{yesNo(covers.get(a.id) ?? null)}</td><td>{yesNo(a.openAtCovenantTest)}</td></tr>)}</tbody>
        </table>
      </div>
    </> : null}

    {readings?.sensitivities.length ? <>
      <h3>{t("sensitivities")}</h3>
      <div className="investment-table">
        <table>
          <thead><tr><th scope="col">{t("columns.case")}</th><th scope="col">{t("columns.minimum")}</th><th scope="col">{t("columns.minimumWeek")}</th><th scope="col">{t("columns.weeksBelow")}</th></tr></thead>
          <tbody>{readings.sensitivities.map((s) => <tr key={s.caseId}><th scope="row">{caseLabel(s.caseId)}</th><td>{mi(s.minimum)}</td><td>{day(s.weekStart)}</td><td>{s.weeksBelowMinimum}</td></tr>)}</tbody>
        </table>
      </div>
    </> : null}

    {view.cases.length ? <>
      <h3>{t("cases")}</h3>
      <div className="investment-table">
        <table>
          <thead><tr><th scope="col">{t("columns.case")}</th><th scope="col">{t("columns.minimum")}</th><th scope="col">{t("columns.minimumWeek")}</th><th scope="col">{t("columns.weeksBelow")}</th>
            <th scope="col">{t("columns.closing")}</th><th scope="col">{t("columns.shortfall")}</th></tr></thead>
          <tbody>{view.cases.map((c) => <tr key={c.id} className={c.role === "informed" ? "investment-base" : undefined}><th scope="row">{c.label}</th><td>{mi(c.minimum)}</td><td>{day(c.minimumWeek)}</td>
            <td>{c.weeksBelowMinimum.length}</td><td>{mi(c.closing)}</td><td>{mi(c.shortfallToMinimum)}</td></tr>)}</tbody>
        </table>
      </div>
    </> : null}

    {informed && weeks.length ? <>
      <h3>{t("weeks", {case: informed.label})}</h3>
      <div className="investment-table">
        <table>
          <thead><tr><th scope="col">{t("columns.week")}</th><th scope="col">{t("columns.inflows")}</th><th scope="col">{t("columns.outflows")}</th><th scope="col">{t("columns.closing")}</th><th scope="col">{t("columns.below")}</th></tr></thead>
          <tbody>{weeks.map((w) => <tr key={w.weekStart} className={w.belowMinimum ? "investment-base" : undefined}><th scope="row">{day(w.weekStart)}</th><td>{mi(w.inflows)}</td><td>{mi(w.outflows)}</td>
            <td>{mi(w.closing)}</td><td>{yesNo(w.belowMinimum)}</td></tr>)}</tbody>
        </table>
      </div>
    </> : null}

    {view.calendar.length ? <>
      <h3>{t("calendar")}</h3>
      <div className="investment-table">
        <table>
          <thead><tr><th scope="col">{t("columns.date")}</th><th scope="col">{t("columns.item")}</th><th scope="col">{t("columns.category")}</th><th scope="col">{t("columns.amount")}</th></tr></thead>
          <tbody>{view.calendar.map((c, n) => <tr key={n}><th scope="row">{day(c.date)}</th><td>{c.label}</td><td>{known("categories", c.category)}</td><td>{mi(c.amount)}</td></tr>)}</tbody>
        </table>
      </div>
    </> : null}

    <h3>{t("reconciliation")}</h3>
    <p>{reconciliation ? t("reconciliationLine", {date: day(reconciliation.date), weekly: mi(reconciliation.weekly), projection: mi(reconciliation.projection), difference: mi(reconciliation.difference)})
      : t("noReconciliation")}</p>
    {coverage.length ? <><h3>{t("coverage")}</h3>
      <ul>{coverage.map((c) => <li key={c.obligation}>{known("obligations", c.obligation)}: {known("coverageStatuses", c.status)}</li>)}</ul></> : null}
    {readings?.obligationsNotExamined.length ? <p>{t("notExamined", {list: readings.obligationsNotExamined.map((o) => known("obligations", o)).join("; ")})}</p> : null}

    <h3>{t("gaps")}</h3>
    {view.informationGaps.length ? <ul>{view.informationGaps.map((g, n) => <li key={n}><code>{g.operand}</code>: {g.reason}</li>)}</ul> : <p>{t("noGaps")}</p>}
    <h3>{t("exclusionsTitle")}</h3>
    <ul>{view.exclusions.map((e) => <li key={e}>{known("exclusions", e)}</li>)}</ul>
  </section>;
}
