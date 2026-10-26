import {getTranslations} from "next-intl/server";
import type {ProjectionChallengeResultBlocksView} from "@offroad/domain-contracts";
import {formatRounded, shiftDecimal} from "@/lib/execution/format";

/** Where the plan will be challenged, as the blocks carry it: the gap at the target period first, then
 * each assumption in order of its isolated effect with the yardstick and the evidence that would sustain
 * it, the interaction, the margin per unit, capacity, receivable days and the premium mix, and how to
 * present the plan. No scenario was run and no model rebuilt. Amounts in millions with one decimal,
 * margins and shares in percent, rounded only for display. */
export async function ProjectionChallengeResult({locale, view}: {locale: string; view: ProjectionChallengeResultBlocksView}) {
  const t = await getTranslations({locale, namespace: "App.workExecutions.projectionChallenge"});
  const status = await getTranslations({locale, namespace: "App.workExecutions.decisionStatus"});
  const mi = (v: string | null) => v === null ? "·" : formatRounded(shiftDecimal(v, -6), 1, locale);
  const pct = (v: string | null) => v === null ? "·" : `${formatRounded(shiftDecimal(v, 2), 1, locale)}%`;
  const plain = (v: string | null, places = 2) => v === null ? "·" : formatRounded(v, places, locale);
  const known = (group: string, key: string) => t.has(`${group}.${key}`) ? t(`${group}.${key}`) : key;
  const {framing, margin, rulers} = view;
  const gap = framing.gap, rec = framing.recommendation;
  const label = (id: string) => view.assumptions.find((a) => a.assumptionId === id)?.label ?? id;
  return <section className="investment-result"><h2>{t("title")}</h2>
    <dl className="execution-facts">
      <dt>{t("status")}</dt><dd>{status(framing.status)}</dd>
      <dt>{t("question")}</dt><dd>{framing.question}</dd>
    </dl>
    <p>{t("units", {currency: framing.currency})}</p>

    {gap ? <>
      <p><strong>{t("gap", {period: gap.targetPeriodId, plan: mi(gap.plan.ebitda), reference: mi(gap.reference.ebitda), ebitda: mi(gap.ebitda), cash: mi(gap.cash)})}</strong></p>
      <p>{t("margin", {first: pct(gap.planMarginFirst), target: pct(gap.plan.margin), reference: pct(gap.reference.margin)})}{" "}
        {gap.marginCauseStated ? t("marginCause", {cause: gap.marginCauseStated}) : t("noMarginCause")}</p>
    </> : <p>{t("noGap")}</p>}

    {view.assumptions.length ? <>
      <h3>{t("assumptions")}</h3>
      <div className="investment-table">
        <table>
          <thead><tr><th scope="col">{t("columns.assumption")}</th><th scope="col">{t("columns.ebitda")}</th><th scope="col">{t("columns.cash")}</th><th scope="col">{t("columns.share")}</th>
            <th scope="col">{t("columns.ruler")}</th><th scope="col">{t("columns.evidence")}</th><th scope="col">{t("columns.evidenceStatus")}</th></tr></thead>
          <tbody>{view.assumptions.map((a) => <tr key={a.assumptionId} className={a.assumptionId === framing.largestAssumptionId ? "investment-base" : undefined}>
            <th scope="row">{a.label}</th><td>{mi(a.effect.ebitda)}</td><td>{mi(a.effect.cash)}</td><td>{pct(a.cumulativeShareOfEbitdaGap)}</td><td>{a.ruler ?? "·"}</td>
            <td>{a.evidenceThatWouldSustain?.join("; ") ?? "·"}</td><td>{a.evidenceStatus ? known("evidenceStatuses", a.evidenceStatus) : "·"}</td></tr>)}</tbody>
        </table>
      </div>
      <p>{t("isolated")}</p>
    </> : null}

    {margin.interaction ? <p>{t("interaction", {ebitda: mi(margin.interaction.fromReference.ebitda), cash: mi(margin.interaction.fromReference.cash)})}</p> : null}
    {margin.unitMargin ? <p>{t("unitMargin", {first: plain(margin.unitMargin.planFirst), target: plain(margin.unitMargin.planTarget), reference: plain(margin.unitMargin.referenceTarget),
      change: pct(margin.unitMargin.planChange)})}</p> : null}

    <h3>{t("rulers")}</h3>
    {rulers.capacity ? <p>{rulers.capacity.aboveWithoutInvestment
      ? t("capacityAbove", {maximum: plain(rulers.capacity.maximumQuantity, 1), period: rulers.capacity.firstPeriodAbove ?? "·", excess: plain(rulers.capacity.excessAtTarget, 1)})
      : rulers.capacity.firstPeriodAbove ? t("capacityWithInvestment", {maximum: plain(rulers.capacity.maximumQuantity, 1), period: rulers.capacity.firstPeriodAbove})
        : t("capacityWithin", {maximum: plain(rulers.capacity.maximumQuantity, 1)})}
      {rulers.capacity.source ? ` ${t("source", {source: rulers.capacity.source})}` : ""}</p> : <p>{t("noCapacity")}</p>}
    {rulers.receivables ? <p>{t("receivables", {days: plain(rulers.receivables.planDays, 0), perDay: mi(rulers.receivables.cashPerDay)})}
      {rulers.receivables.requestedDays !== null ? ` ${t("requestedDays", {days: plain(rulers.receivables.requestedDays, 0), cash: mi(rulers.receivables.cashAtRequestedDays)})}` : ""}</p> : null}
    {rulers.premiumMix ? <p>{t("premiumMix", {premium: pct(rulers.premiumMix.premiumOverAverage), share: pct(rulers.premiumMix.shareNeededAtTarget), perPeriod: pct(rulers.premiumMix.sharePerPeriod)})}</p> : null}

    {rec ? <>
      <h3>{t("recommendation")}</h3>
      <p><strong>{known("recommendations", rec.kind)}</strong></p>
      {rec.conditions.length ? <p>{t("conditions", {list: rec.conditions.map(label).join("; ")})}</p> : null}
      {rec.capacityCondition ? <p>{known("capacityConditions", rec.capacityCondition)}</p> : null}
    </> : null}

    {framing.openQuestions.length ? <>
      <h3>{t("openQuestions")}</h3>
      <ul>{framing.openQuestions.map((q) => <li key={q}>{known("questions", q)}</li>)}</ul>
    </> : null}

    <h3>{t("gaps")}</h3>
    {view.informationGaps.length ? <ul>{view.informationGaps.map((g, n) => <li key={n}><code>{g.operand}</code>: {g.reason}</li>)}</ul> : <p>{t("noGaps")}</p>}
    <h3>{t("exclusionsTitle")}</h3>
    <ul>{view.exclusions.map((e) => <li key={e}>{known("exclusions", e)}</li>)}</ul>
  </section>;
}
