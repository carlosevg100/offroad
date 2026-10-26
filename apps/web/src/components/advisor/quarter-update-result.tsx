import {getTranslations} from "next-intl/server";
import type {QuarterUpdateResultBlocksView} from "@offroad/domain-contracts";
import {formatIsoDate, formatRounded, shiftDecimal} from "@/lib/execution/format";

/** What the closed quarter changed, as the blocks carry it: actual against projected line by line, the
 * EBITDA and cash bridges by cause, what is one-off and what persists, the tightest week and the covenant
 * test before and after, the action within what is approved, which decisions change and which analyses
 * were updated, did not change or became stale. Prior versions are kept and nothing was sent to anyone.
 * Amounts in millions with one decimal, ratios in multiples, rounded only for display. */
export async function QuarterUpdateResult({locale, view}: {locale: string; view: QuarterUpdateResultBlocksView}) {
  const t = await getTranslations({locale, namespace: "App.workExecutions.quarterUpdate"});
  const status = await getTranslations({locale, namespace: "App.workExecutions.decisionStatus"});
  const mi = (v: string | null) => v === null ? "·" : formatRounded(shiftDecimal(v, -6), 1, locale);
  const pct = (v: string) => `${formatRounded(shiftDecimal(v, 2), 1, locale)}%`;
  const ratio = (v: string | null) => v === null ? "·" : `${formatRounded(v, 2, locale)}x`;
  const day = (d: string | null) => d === null ? "·" : formatIsoDate(d, locale);
  const known = (group: string, key: string) => t.has(`${group}.${key}`) ? t(`${group}.${key}`) : key;
  const yesNo = (v: boolean | null) => v === null ? t("unknown") : v ? t("yes") : t("no");
  const {framing, persisting, action, covenant, dependents} = view;
  const byUnit = (unit: string, v: string) => unit === "currency" ? mi(v) : unit === "ratio" ? pct(v) : formatRounded(v, 0, locale);
  const lineLabel = (id: string) => view.lines.find((l) => l.id === id)?.label ?? id;
  const causes = view.bridges.flatMap((b) => b.causes);
  const causeLabel = (id: string) => causes.find((c) => c.id === id)?.label ?? id;
  return <section className="investment-result"><h2>{t("title")}</h2>
    <dl className="execution-facts">
      <dt>{t("status")}</dt><dd>{status(framing.status)}</dd>
      <dt>{t("question")}</dt><dd>{framing.question}</dd>
    </dl>
    <p>{t("units", {currency: framing.currency})}</p>
    {framing.quarterStart ? <p>{t("quarter", {start: day(framing.quarterStart), end: day(framing.quarterEnd)})}</p> : null}

    {view.lines.length ? <>
      <h3>{t("lines")}</h3>
      <div className="investment-table">
        <table>
          <thead><tr><th scope="col">{t("columns.line")}</th><th scope="col">{t("columns.projected")}</th><th scope="col">{t("columns.actual")}</th><th scope="col">{t("columns.deviation")}</th></tr></thead>
          <tbody>{view.lines.map((l) => <tr key={l.id}><th scope="row">{l.label}</th><td>{byUnit(l.unit, l.projected)}</td><td>{byUnit(l.unit, l.actual)}</td><td>{byUnit(l.unit, l.deviation)}</td></tr>)}</tbody>
        </table>
      </div>
    </> : <p>{t("noReading")}</p>}

    {view.bridges.map((b) => <div key={b.lineId}>
      <h3>{t("bridge", {line: lineLabel(b.lineId), deviation: mi(b.deviation)})}</h3>
      <ul>{b.causes.map((c) => <li key={c.id}>{c.label}: {mi(c.amount)} ({c.classification === "structural" ? t("structuralUntil", {date: day(c.until)}) : t("calendar")})</li>)}</ul>
      {/^-?0+(?:\.0+)?$/.test(b.residual) ? null : <p>{t("residual", {amount: mi(b.residual)})}</p>}
    </div>)}

    {persisting.rows.length ? <>
      <h3>{t("persisting")}</h3>
      <div className="investment-table">
        <table>
          <thead><tr><th scope="col">{t("columns.cause")}</th><th scope="col">{t("columns.nature")}</th><th scope="col">{t("columns.until")}</th><th scope="col">{t("columns.ebitdaAhead")}</th>
            <th scope="col">{t("columns.cashAhead")}</th></tr></thead>
          <tbody>{persisting.rows.map((p) => <tr key={p.causeId}><th scope="row">{causeLabel(p.causeId)}</th><td>{known("natures", p.nature)}</td><td>{day(p.until)}</td>
            <td>{mi(p.ebitdaAhead)}</td><td>{mi(p.cashAhead)}</td></tr>)}</tbody>
        </table>
      </div>
    </> : null}
    {persisting.oneOff.length ? <p>{t("oneOff", {list: persisting.oneOff.map(causeLabel).join("; ")})}</p> : null}
    {persisting.balanceShiftsCarriedOnce.length ? <p>{t("balanceShifts", {list: persisting.balanceShiftsCarriedOnce.map((b) => `${causeLabel(b.causeId)} (${mi(b.amount)})`).join("; ")})}</p> : null}

    {framing.tightestWeek ? <>
      <h3>{t("weekly")}</h3>
      <p><strong>{t("tightest", {prior: mi(framing.tightestWeek.prior.closing), priorWeek: day(framing.tightestWeek.prior.weekStart),
        updated: mi(framing.tightestWeek.updated.closing), updatedWeek: day(framing.tightestWeek.updated.weekStart)})}</strong></p>
      {framing.shortfallToMinimum ? <p>{t("shortfall", {prior: mi(framing.shortfallToMinimum.prior), updated: mi(framing.shortfallToMinimum.updated)})}</p> : null}
      {framing.closingAtHorizon ? <p>{t("closingAtHorizon", {prior: mi(framing.closingAtHorizon.prior), updated: mi(framing.closingAtHorizon.updated)})}</p> : null}
      {framing.topUp ? <p>{framing.topUp.needExceedsLimit
        ? t("topUpExceeds", {facility: framing.topUp.facilityId, limit: mi(framing.topUp.limit), closing: mi(framing.topUp.fullLimitMinimum.closing)})
        : t("topUpCovers", {facility: framing.topUp.facilityId, limit: mi(framing.topUp.limit)})}</p> : null}
    </> : null}

    {action.steps.length ? <>
      <h3>{t("action")}</h3>
      <div className="investment-table">
        <table>
          <thead><tr><th scope="col">{t("columns.facility")}</th><th scope="col">{t("columns.amount")}</th><th scope="col">{t("columns.limit")}</th><th scope="col">{t("columns.withinLimit")}</th>
            <th scope="col">{t("columns.source")}</th><th scope="col">{t("columns.minimumAfter")}</th></tr></thead>
          <tbody>{action.steps.map((s) => <tr key={s.facilityId}><th scope="row">{s.facilityId}</th><td>{mi(s.amount)}</td><td>{mi(s.limit)}</td><td>{yesNo(s.withinLimit)}</td>
            <td>{s.source}</td><td>{mi(s.minimum.closing)}</td></tr>)}</tbody>
        </table>
      </div>
      <p>{action.withinApproved ? t("withinApproved") : t("outsideApproved")} {action.covers === null ? "" : action.covers
        ? t("actionCovers", {closing: mi(action.minimumAfter?.closing ?? null), week: day(action.minimumAfter?.weekStart ?? null)}) : t("actionDoesNotCover")}</p>
    </> : null}

    {covenant ? <>
      <h3>{t("covenant")}</h3>
      <div className="investment-table">
        <table>
          <thead><tr><th scope="col">{t("columns.definition")}</th><th scope="col">{t("columns.ratioPrior")}</th><th scope="col">{t("columns.ratioUpdated")}</th>
            <th scope="col">{t("columns.ebitdaPrior")}</th><th scope="col">{t("columns.ebitdaUpdated")}</th></tr></thead>
          <tbody>{covenant.measurements.map((m) => <tr key={m.measurementId}><th scope="row">{m.definitionRead}</th><td>{ratio(m.ratio.prior)}</td><td>{ratio(m.ratio.updated)}</td>
            <td>{mi(m.trailingEbitda.prior)}</td><td>{mi(m.trailingEbitda.updated)}</td></tr>)}</tbody>
        </table>
      </div>
      <div className="investment-table">
        <table>
          <thead><tr><th scope="col">{t("columns.definition")}</th><th scope="col">{t("columns.limit")}</th><th scope="col">{t("columns.kind")}</th><th scope="col">{t("columns.headroomPrior")}</th>
            <th scope="col">{t("columns.headroomUpdated")}</th><th scope="col">{t("columns.breached")}</th></tr></thead>
          <tbody>{covenant.headroom.map((h) => <tr key={`${h.measurementId}:${h.limitId}`}><th scope="row">{h.definitionRead}</th><td>{h.limitDefinition ?? h.limitId}</td>
            <td>{known("kinds", h.kind)}</td><td>{mi(h.ebitdaHeadroom.prior)}</td><td>{mi(h.ebitdaHeadroom.updated)}</td><td>{yesNo(h.breached)}</td></tr>)}</tbody>
        </table>
      </div>
      <p>{covenant.anyBreach ? t("anyBreach") : t("noBreach")}</p>
      {covenant.notUpdated.length ? <p>{t("notUpdated", {list: covenant.notUpdated.join("; ")})}</p> : null}
    </> : null}
    {framing.projectedEbitda ? <p>{t("projectedEbitda", {prior: mi(framing.projectedEbitda.prior), updated: mi(framing.projectedEbitda.updated)})}</p> : null}

    <h3>{t("decisions")}</h3>
    {framing.decisionsChanged.length ? <ul>{framing.decisionsChanged.map((d) => <li key={d}>{known("decisionCodes", d)}</li>)}</ul> : <p>{t("noDecisionChanged")}</p>}

    {dependents.rows.length ? <>
      <h3>{t("dependents")}</h3>
      <div className="investment-table">
        <table>
          <thead><tr><th scope="col">{t("columns.dependent")}</th><th scope="col">{t("columns.kind")}</th><th scope="col">{t("columns.dependentStatus")}</th><th scope="col">{t("columns.owner")}</th></tr></thead>
          <tbody>{dependents.rows.map((d) => <tr key={d.id} className={d.status === "stale" ? "investment-base" : undefined}><th scope="row">{d.label}</th><td>{known("dependentKinds", d.kind)}</td>
            <td>{known("dependentStatuses", d.status)}</td><td>{d.owner ?? "·"}</td></tr>)}</tbody>
        </table>
      </div>
    </> : null}

    {view.openQuestions.length ? <>
      <h3>{t("openQuestions")}</h3>
      <ul>{view.openQuestions.map((q) => <li key={q.causeId}>{q.question}</li>)}</ul>
    </> : null}

    {framing.priorVersionsKept !== null ? <p>{t("kept")}</p> : null}

    <h3>{t("gaps")}</h3>
    {view.informationGaps.length ? <ul>{view.informationGaps.map((g, n) => <li key={n}><code>{g.operand}</code>: {known("gapReasons", g.reason)}</li>)}</ul> : <p>{t("noGaps")}</p>}
    <h3>{t("exclusionsTitle")}</h3>
    <ul>{view.exclusions.map((e) => <li key={e}>{known("exclusions", e)}</li>)}</ul>
  </section>;
}
