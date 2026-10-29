import {getTranslations} from "next-intl/server";
import type {ReceivedProposalResultBlocksView} from "@offroad/domain-contracts";
import {formatIsoDate, formatRounded, shiftDecimal} from "@/lib/execution/format";

/** Whether a received proposal serves the company, as the blocks carry it, in the order the procedure weighs it:
 * firmness and what the bank saw, then the year the calendar already concentrates, the term against each use, the
 * covenant on every definition and case, the collateral against the assignable portfolio and the indenture's basket,
 * price and cost over the life apart, what each ask buys, the company's alternatives, and fact, reading,
 * recommendation and what would change the conclusion kept apart. No verdict, no acceptance, no contact with the bank.
 * Amounts in millions with one decimal, spreads in percent a year with two, covenant in times EBITDA with two;
 * rounded only for display. */
export async function ReceivedProposalResult({locale, view}: {locale: string; view: ReceivedProposalResultBlocksView}) {
  const t = await getTranslations({locale, namespace: "App.workExecutions.receivedProposal"});
  const status = await getTranslations({locale, namespace: "App.workExecutions.decisionStatus"});
  const mi = (v: string | null) => v === null ? "·" : formatRounded(shiftDecimal(v, -6), 1, locale);
  const pct = (v: string | null, places = 2) => v === null ? "·" : formatRounded(shiftDecimal(v, 2), places, locale);
  const times = (v: string | null) => v === null ? "·" : `${formatRounded(v, 2, locale)}x`;
  const bps = (v: string | null) => v === null ? "·" : formatRounded(v, 0, locale);
  const day = (d: string | null) => d === null ? "·" : formatIsoDate(d, locale);
  const known = (group: string, key: string) => t.has(`${group}.${key}`) ? t(`${group}.${key}`) : key;
  const yesNo = (v: boolean) => v ? t("yes") : t("no");
  const {framing, liquidity, fit, covenant, collateral, price, assessment} = view;
  const peak = liquidity.peak, c = collateral.collateral, pledge = collateral.negativePledge, p = price.price;
  const useLabel = (id: string) => fit.uses.find((u) => u.id === id)?.label ?? id;
  const assessed = (title: string, group: string, codes: readonly string[]) => codes.length ? <>
    <h4>{t(title)}</h4><ul>{codes.map((code) => <li key={code}>{known(group, code)}</li>)}</ul></> : null;
  return <section className="investment-result"><h2>{framing.lender ? t("lender", {lender: framing.lender}) : t("title")}</h2>
    <dl className="execution-facts">
      <dt>{t("status")}</dt><dd>{status(framing.status)}</dd>
      <dt>{t("question")}</dt><dd>{framing.question}</dd>
    </dl>
    <p>{t("units", {currency: framing.currency})}</p>
    {framing.openQuestions.map((q) => <p key={q}><strong>{known("openQuestions", q)}</strong></p>)}

    {framing.firmness ? <p>{t(`firmness.${framing.firmness.firmness}`, {date: day(framing.firmness.validUntil)})}{" "}
      {framing.firmness.bankSawIndenture ? t("sawIndenture") : t("didNotSeeIndenture")}{framing.firmness.diligenceMayReopenStructure ? ` ${t("diligence")}` : ""}</p> : null}
    {!peak && !p ? <p>{t("noReading")}</p> : null}

    {peak ? <>
      <h3>{t("liquidityTitle")}</h3>
      <p><strong>{t("liquidity", {year: String(peak.peakYear), existing: mi(peak.existingService), available: mi(peak.availableForService), proposal: mi(peak.proposalService),
        total: mi(peak.totalService)})}</strong> {t("peakQuarter", {date: day(peak.peakQuarter)})}</p>
      <p>{t("minimumWith", {amount: mi(peak.minimumCashWith.amount), date: day(peak.minimumCashWith.periodEnd)})}
        {peak.firstBelowPolicyWith ? ` ${peak.firstBelowPolicyWithout ? t("belowPolicy", {with: day(peak.firstBelowPolicyWith), without: day(peak.firstBelowPolicyWithout)})
          : t("belowPolicyWithOnly", {with: day(peak.firstBelowPolicyWith)})}` : ""}</p>
      <div className="investment-table">
        <table>
          <thead><tr><th scope="col">{t("columns.year")}</th><th scope="col">{t("columns.existingService")}</th><th scope="col">{t("columns.proposalService")}</th>
            <th scope="col">{t("columns.totalService")}</th><th scope="col">{t("columns.available")}</th><th scope="col">{t("columns.shortfallWith")}</th></tr></thead>
          <tbody>{liquidity.years.map((y) => <tr key={y.year}><th scope="row">{y.year}</th><td>{mi(y.existingService)}</td><td>{mi(y.proposalService)}</td><td>{mi(y.totalService)}</td>
            <td>{mi(y.availableForService)}</td><td>{mi(y.shortfallWith)}</td></tr>)}</tbody>
        </table>
      </div>
    </> : null}

    {fit.uses.length ? <>
      <h3>{t("fitTitle")}</h3>
      {fit.seasonalShare !== null ? <p>{t("fit", {share: `${pct(fit.seasonalShare, 0)}%`, life: formatRounded(fit.weightedAverageLifeYears ?? "0", 2, locale), date: day(fit.finalPaymentDate)})}</p> : null}
      <ul>{fit.uses.map((u) => <li key={u.id}>{t("use", {label: u.label ?? u.id, amount: mi(u.amount), reading: known("useReadings", u.reading)})}</li>)}</ul>
    </> : null}

    {covenant.rows.length || covenant.missingTests.length ? <>
      <h3>{t("covenantTitle")}</h3>
      {covenant.rows.length ? <div className="investment-table">
        <table>
          <thead><tr><th scope="col">{t("columns.date")}</th><th scope="col">{t("columns.scenario")}</th><th scope="col">{t("columns.ratio")}</th>
            {(["indenture", "proposal", "board-policy"] as const).map((l) => <th scope="col" key={l}>{known("limits", l)}</th>)}</tr></thead>
          <tbody>{covenant.rows.map((r) => <tr key={`${r.date}-${r.scenario}`}><th scope="row">{day(r.date)}</th><td>{known("scenarios", r.scenario)}</td><td>{times(r.ratioWith)}</td>
            {(["indenture", "proposal", "board-policy"] as const).map((l) => {const h = r.headroom.find((x) => x.limitId === l);
              return <td key={l}>{!h || !h.testedOnDate ? t("notTested") : h.breachedWith ? `${times(h.headroomWith)} (${t("breached")})` : times(h.headroomWith)}</td>;})}</tr>)}</tbody>
        </table>
      </div> : null}
      {covenant.testsPerYear ? <p>{t("testsPerYear", {lender: String(covenant.testsPerYear.lender), indenture: String(covenant.testsPerYear.indenture)})}</p> : null}
      <p>{covenant.anyBreachWith === null ? t("anyBreachUnknown") : covenant.anyBreachWith ? t("anyBreachYes") : t("anyBreachNo")}</p>
      {covenant.missingTests.length ? <p>{t("missingTests", {list: covenant.missingTests.map((m) => `${day(m.date)} (${known("scenarios", m.scenario)})`).join("; ")})}</p> : null}
      {covenant.untestedLimits.length ? <p>{t("untestedLimits", {list: covenant.untestedLimits.map((l) => known("limits", l)).join("; ")})}</p> : null}
      {covenant.lenderDatesBeforeDraw.length ? <p>{t("lenderBeforeDraw", {list: covenant.lenderDatesBeforeDraw.map(day).join("; ")})}</p> : null}
    </> : null}

    {c ? <>
      <h3>{t("collateralTitle")}</h3>
      <p>{t("collateral", {coverage: pct(c.coverage, 0), required: mi(c.required), free: mi(c.nominallyFree), assignable: mi(c.assignable)})}
        {c.shortfallToAssignable !== null && Number(c.shortfallToAssignable) > 0 ? ` ${t("shortfall", {shortfall: mi(c.shortfallToAssignable)})}` : ""}
        {c.seasonalPeak !== null && c.assignableLeftAfter !== null ? ` ${t("leftAfter", {left: mi(c.assignableLeftAfter), peak: mi(c.seasonalPeak)})}` : ""}
        {c.restrictedAccount ? ` ${t("restrictedAccount")}` : ""}</p>
      {collateral.reference ? <p>{t("reference", {low: pct(collateral.reference.low, 0), high: pct(collateral.reference.high, 0)})}{collateral.reference.atOrAboveTop ? ` ${t("atTop")}` : ""}</p> : null}
      {c.excluded.length ? <div className="investment-table">
        <table>
          <thead><tr><th scope="col">{t("columns.bucket")}</th><th scope="col">{t("columns.amount")}</th><th scope="col">{t("columns.holder")}</th><th scope="col">{t("columns.reasons")}</th></tr></thead>
          <tbody>{c.excluded.map((x) => <tr key={x.id}><th scope="row">{x.label ?? x.id}</th><td>{mi(x.amount)}</td><td>{x.holder ?? "·"}</td>
            <td>{x.reasons.map((r) => known("reasons", r)).join("; ")}</td></tr>)}</tbody>
        </table>
      </div> : null}
    </> : null}
    {pledge ? <p>{t("pledge", {limit: mi(pledge.limit), basis: known("bases", pledge.basis), occupied: mi(pledge.occupied), remaining: mi(pledge.remaining)})}{" "}
      {pledge.consentRequired ? <strong>{t("consent", {excess: mi(pledge.excess)})} {t("consentWindow", {by: day(pledge.consentBy), need: day(pledge.needDate), slack: String(pledge.slackDays)})}</strong>
        : t("noConsent")}</p> : null}

    {p ? <>
      <h3>{t("priceTitle")}</h3>
      <p>{t("price", {nominal: `${pct(p.nominalSpread)}%`, gross: `${pct(p.equivalentSpread)}%`})}{" "}
        {p.equivalentSpreadNet !== null ? t("net", {net: `${pct(p.equivalentSpreadNet)}%`}) : known("netConventions", p.netConvention)}</p>
      <p>{t("upfront", {upfront: pct(p.upfrontShare), iof: pct(p.creditTaxRate)})}</p>
      {p.marketPosition && price.market ? <p>{t("market", {position: known("positions", p.marketPosition), low: pct(price.market.low), high: pct(price.market.high),
        median: pct(price.market.median), sample: String(price.market.sample), confidence: known("confidences", price.market.confidence), date: day(price.market.observedOn)})}</p> : null}
      {p.history && price.history ? <>
        <p>{p.history.residualBps !== null
          ? t("history", {peer: price.history.peer, date: day(price.history.peerDate), observed: bps(p.history.observedBps), expected: bps(p.history.expectedBps), residual: bps(p.history.residualBps)})
          : t("historyNoResidual", {peer: price.history.peer, date: day(price.history.peerDate), observed: bps(p.history.observedBps), expected: bps(p.history.expectedBps)})}</p>
        <ul>{price.history.steps.map((s) => <li key={s.id}>{t("step", {family: known("families", s.family), bps: bps(s.bps)})}</li>)}</ul>
      </> : null}
    </> : null}

    {view.asks.length ? <>
      <h3>{t("asksTitle")}</h3>
      <div className="investment-table">
        <table>
          <thead><tr><th scope="col">{t("columns.ask")}</th><th scope="col">{t("columns.serviceDelta")}</th><th scope="col">{t("columns.costDelta")}</th>
            <th scope="col">{t("columns.collateralDelta")}</th><th scope="col">{t("columns.consent")}</th><th scope="col">{t("columns.account")}</th></tr></thead>
          <tbody>{view.asks.map((a) => <tr key={a.id}><th scope="row">{a.label}</th><td>{mi(a.peakYearServiceDelta)}</td><td>{bps(a.equivalentSpreadDeltaBps)}</td>
            <td>{mi(a.collateralDelta)}</td><td>{yesNo(a.consentStillRequired)}</td><td>{yesNo(a.restrictedAccount)}</td></tr>)}</tbody>
        </table>
      </div>
    </> : null}

    {view.alternatives.length ? <>
      <h3>{t("alternativesTitle")}</h3>
      <div className="investment-table">
        <table>
          <thead><tr><th scope="col">{t("columns.route")}</th><th scope="col">{t("columns.uses")}</th><th scope="col">{t("columns.allIn")}</th><th scope="col">{t("columns.difference")}</th>
            <th scope="col">{t("columns.guarantee")}</th><th scope="col">{t("columns.consent")}</th><th scope="col">{t("columns.months")}</th></tr></thead>
          <tbody>{view.alternatives.map((a) => <tr key={a.id}><th scope="row">{a.label ?? a.id}</th><td>{a.usesCovered.map(useLabel).join("; ")}</td>
            <td>{a.allInSpread === null ? t("notComparable") : `${pct(a.allInSpread)}%`}</td><td>{bps(a.allInSpreadDifferenceBps)}</td><td>{mi(a.collateral)}</td>
            <td>{yesNo(a.consentRequired)}</td><td>{a.monthsToMoney ? t("monthsRange", {min: String(a.monthsToMoney.min), max: String(a.monthsToMoney.max)}) : "·"}</td></tr>)}</tbody>
        </table>
      </div>
    </> : null}

    {assessment.facts.length || assessment.readings.length || assessment.recommendations.length ? <>
      <h3>{t("assessmentTitle")}</h3>
      {assessed("factsTitle", "facts", assessment.facts)}
      {assessed("readingsTitle", "readings", assessment.readings)}
      {assessed("recommendationsTitle", "recommendations", assessment.recommendations)}
      {assessed("wouldChangeTitle", "wouldChange", assessment.wouldChange)}
      {assessed("questionsTitle", "questions", assessment.questions)}
    </> : null}

    {framing.process ? <p>{t("process")}</p> : null}

    <h3>{t("gaps")}</h3>
    {view.informationGaps.length ? <ul>{view.informationGaps.map((g, n) => <li key={n}><code>{g.operand}</code>: {g.reason}</li>)}</ul> : <p>{t("noGaps")}</p>}
    <h3>{t("exclusionsTitle")}</h3>
    <ul>{view.exclusions.map((e) => <li key={e}>{known("exclusions", e)}</li>)}</ul>
  </section>;
}
