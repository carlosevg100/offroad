import {getTranslations} from "next-intl/server";
import type {FinancingPathsResultBlocksView} from "../../../../../packages/domain-contracts/src/lote4-financing-paths-result-blocks";
import {formatIsoDate, formatRounded, shiftDecimal} from "@/lib/execution/format";

/** The financing paths of one decision, as the blocks carry them, in the order of the method's template: what
 * happens without action, the path the gates recommend with its condition, its long instrument and its dates,
 * the dated alternative, every path on the same yardstick, cash by period, the amortization after the horizon,
 * what would change the recommendation and fact, reading and recommendation kept apart. The basis of this
 * method is adopted in millions of the currency, so amounts are shown as they are, with one decimal (costs with
 * two); ratios in times EBITDA and spreads in percent a year, rounded only for display. No investor is sounded,
 * no bank contacted, nothing issued. */
export async function FinancingPathsResult({locale, view}: {locale: string; view: FinancingPathsResultBlocksView}) {
  const t = await getTranslations({locale, namespace: "App.workExecutions.financingPaths"});
  const status = await getTranslations({locale, namespace: "App.workExecutions.decisionStatus"});
  const mi = (v: string | null) => v === null ? "·" : formatRounded(v, 1, locale);
  const cost = (v: string | null) => v === null ? "·" : formatRounded(v, 2, locale);
  const times = (v: string | null) => v === null ? "·" : `${formatRounded(v, 2, locale)}x`;
  const pct = (v: string | null) => v === null ? "·" : `${formatRounded(shiftDecimal(v, 2), 2, locale)}%`;
  const day = (d: string | null) => d === null ? "·" : formatIsoDate(d, locale);
  const known = (group: string, key: string) => t.has(`${group}.${key}`) ? t(`${group}.${key}`) : key;
  const instrument = (id: string) => view.instruments.find((i) => i.id === id)?.label ?? id;
  const path = (id: string) => view.paths.find((p) => p.id === id)?.label ?? id;
  const gates = (ids: readonly string[]) => ids.map((g) => known("gates", g)).join("; ");
  const {framing, recommendation: rec, alternative: alt} = view, w = framing.withoutAction, h = framing.horizon;
  const long = rec?.longInstrument ?? null;
  return <section className="investment-result"><h2>{t("title")}</h2>
    <dl className="execution-facts">
      <dt>{t("status")}</dt><dd>{status(framing.status)}</dd>
      <dt>{t("question")}</dt><dd>{framing.question}</dd>
    </dl>
    <p>{t("units", {currency: framing.currency})}</p>

    {w && h ? <>
      <h3>{t("withoutActionTitle")}</h3>
      <p><strong>{w.firstBelowMinimum ? t("withoutAction", {minimum: mi(h.minimumCash), first: day(w.firstBelowMinimum), lowest: mi(w.lowest.amount), lowestDate: day(w.lowest.periodId)})
        : t("withoutActionNeverBelow", {minimum: mi(h.minimumCash), lowest: mi(w.lowest.amount), lowestDate: day(w.lowest.periodId)})}</strong></p>
      <p>{t(w.peakYear.gap.startsWith("-") || /^0(?:\.0+)?$/.test(w.peakYear.gap) ? "peakYearCovered" : "peakYear", {year: w.peakYear.year, service: mi(w.peakYear.service),
        principal: mi(w.peakYear.principal), interest: mi(w.peakYear.interestPaid), available: mi(w.peakYear.availableForService), gap: mi(w.peakYear.gap.replace(/^-/, ""))})}</p>
    </> : <p>{t("noReading")}</p>}

    {h ? <>
      <h3>{t("recommendationTitle")}</h3>
      {rec ? <>
        <p><strong>{t("recommendation", {label: rec.label, minimum: mi(rec.minimumCash.amount), date: day(rec.minimumCash.periodId), cost: cost(rec.horizonFinancingCost),
          end: day(h.lastPeriodEnd), netDebt: mi(rec.netDebtAtHorizon)})}</strong></p>
        {rec.prepaidInstrumentIds.length ? <p>{t("prepaid", {instruments: rec.prepaidInstrumentIds.map(instrument).join(", ")})}</p> : null}
        <p>{t("leverage", {values: rec.leverage.map((x) => `${times(x.ratio)} (${day(x.periodId)})`).join(", "), limit: times(rec.indentureLimit)})}{" "}
          {rec.policyLimit ? t("stressPolicy", {stress: times(rec.stressWorst.ratio), date: day(rec.stressWorst.periodId), policy: times(rec.policyLimit)})
            : t("stressIndenture", {stress: times(rec.stressWorst.ratio), date: day(rec.stressWorst.periodId)})}</p>
        {long ? <>
          <p>{t("longInstrument", {label: instrument(long.id), target: mi(long.issueTarget), floor: mi(long.issueFloorInsideGates)})}
            {long.firstAmortizationYear !== null && long.lastAmortizationYear !== null ? ` ${t("amortizationYears", {first: long.firstAmortizationYear, last: long.lastAmortizationYear, term: long.termYears ?? "·"})}` : ""}</p>
          {long.equivalentSpread !== null ? <p>{t("spread", {spread: pct(long.equivalentSpread), maximum: pct(long.maximumSpread), atCondition: pct(long.equivalentSpreadAtCondition)})}{" "}
            {long.insideGatesAtCondition === null ? "" : long.insideGatesAtCondition ? t("insideAtCondition") : t("outsideAtCondition")}</p> : null}
          {long.chargesOutsideSpread.length ? <p>{t("chargesOutsideSpread", {charges: long.chargesOutsideSpread.map((c) => `${instrument(c.instrumentId)} ${cost(c.amount)} (${day(c.periodEnd)})`).join("; ")})}</p> : null}
        </> : null}
        <p>{t("calendar", {sounding: day(rec.soundingBy), decision: day(rec.routeDecisionBy)})}</p>
        {rec.mustPrecede ? <p>{t("mustPrecede", {instrument: instrument(rec.mustPrecede.instrumentId), date: day(rec.mustPrecede.date), days: rec.daysToMaturity ?? "·"})}</p> : null}
      </> : <p>{t("noRecommendation")}</p>}
      {alt ? <>
        <h3>{t("alternativeTitle")}</h3>
        <p>{t("alternative", {label: alt.label, target: mi(alt.issueTarget), instrument: instrument(alt.longInstrumentId), date: day(alt.decisionBy)})}{" "}
          {alt.conditions.length ? t("alternativeConditions", {conditions: gates(alt.conditions)}) : t("alternativeNoConditions")}</p>
      </> : null}
    </> : null}

    {view.paths.length ? <>
      <h3>{t("pathsTitle")}</h3>
      <p>{t("pathsNote")}</p>
      <div className="investment-table">
        <table>
          <thead><tr><th scope="col">{t("columns.rank")}</th><th scope="col">{t("columns.path")}</th><th scope="col">{t("columns.role")}</th><th scope="col">{t("columns.failedGates")}</th>
            <th scope="col">{t("columns.minimumCash")}</th><th scope="col">{t("columns.cost")}</th><th scope="col">{t("columns.netDebt")}</th><th scope="col">{t("columns.leverage")}</th>
            <th scope="col">{t("columns.stress")}</th><th scope="col">{t("columns.consent")}</th></tr></thead>
          <tbody>{view.paths.map((p) => <tr key={p.id}><td>{p.rank}</td><th scope="row">{p.label}</th><td>{known("roles", p.role)}</td>
            <td>{p.failedGates.length ? gates(p.failedGates) : t("insideEveryGate")}</td><td>{`${mi(p.minimumCash.amount)} (${day(p.minimumCash.periodId)})`}</td><td>{cost(p.horizonFinancingCost)}</td>
            <td>{mi(p.netDebtAtHorizon)}</td><td>{times(p.worstLeverage)}</td><td>{times(p.stressWorstLeverage)}</td><td>{p.consentRequired ? t("yes") : t("no")}</td></tr>)}</tbody>
        </table>
      </div>
    </> : null}

    {view.cash.length ? <>
      <h3>{t("cashTitle")}</h3>
      <div className="investment-table">
        <table>
          <thead><tr><th scope="col">{t("columns.period")}</th><th scope="col">{t("columns.withoutAction")}</th><th scope="col">{rec ? rec.label : t("columns.recommended")}</th></tr></thead>
          <tbody>{view.cash.map((c) => <tr key={c.periodId}><th scope="row">{day(c.periodId)}</th><td>{mi(c.withoutAction)}</td><td>{mi(c.recommended)}</td></tr>)}</tbody>
        </table>
      </div>
    </> : null}

    {view.amortization.length ? <>
      <h3>{t("amortizationTitle")}</h3>
      <div className="investment-table">
        <table>
          <thead><tr><th scope="col">{t("columns.path")}</th><th scope="col">{t("columns.instrument")}</th><th scope="col">{t("columns.profile")}</th><th scope="col">{t("columns.firstYear")}</th>
            <th scope="col">{t("columns.result")}</th></tr></thead>
          <tbody>{view.amortization.map((a) => <tr key={`${a.pathId}:${a.instrumentId}:${a.profileId}`}><th scope="row">{path(a.pathId)}</th><td>{instrument(a.instrumentId)}</td>
            <td>{a.label ?? a.profileId}</td><td>{t("firstYearCell", {year: a.firstYear.year, amortization: mi(a.firstYear.scheduledAmortization), available: mi(a.firstYear.availableAfterInterest)})}</td>
            <td>{a.passes ? t("covered") : a.firstShortfallYear !== null ? t("shortfallFrom", {year: a.firstShortfallYear}) : t("notCovered")}</td></tr>)}</tbody>
        </table>
      </div>
    </> : null}

    {view.wouldChange ? <>
      <h3>{t("wouldChangeTitle")}</h3>
      <ul>
        {view.wouldChange.demand ? <li>{t("demand", {floor: mi(view.wouldChange.demand.issueFloorInsideGates), target: mi(view.wouldChange.demand.issueTarget),
          instrument: instrument(view.wouldChange.demand.instrumentId)})}</li> : null}
        {view.wouldChange.sensitivities.map((s) => <li key={s.id}>{s.recommendationHolds ? t("sensitivityHolds", {label: s.label})
          : t("sensitivityBreaks", {label: s.label, gates: s.failedGatesOnRecommended.length ? gates(s.failedGatesOnRecommended) : t("anotherPath")})}</li>)}
      </ul>
    </> : null}

    {framing.assessment ? <>
      <h3>{t("assessmentTitle")}</h3>
      {([["facts", "factsTitle"], ["readings", "readingsTitle"], ["recommendations", "recommendationsTitle"], ["wouldChange", "changesTitle"]] as const).map(([group, title]) =>
        framing.assessment![group].length ? <div key={group}><h4>{t(title)}</h4><ul>{framing.assessment![group].map((c) => <li key={c}>{known(`codes.${group}`, c)}</li>)}</ul></div> : null)}
    </> : null}

    {framing.process ? <p>{t("process")}</p> : null}

    <h3>{t("gaps")}</h3>
    {view.informationGaps.length ? <ul>{view.informationGaps.map((g, n) => <li key={n}><code>{g.operand}</code>: {g.reason}</li>)}</ul> : <p>{t("noGaps")}</p>}
    <h3>{t("exclusionsTitle")}</h3>
    <ul>{view.exclusions.map((e) => <li key={e}>{known("exclusions", e)}</li>)}</ul>
  </section>;
}
