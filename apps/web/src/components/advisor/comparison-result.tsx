import {getTranslations} from "next-intl/server";
import type {FinancingComparisonResultBlocksView} from "@offroad/domain-contracts";
import {formatRounded, shiftDecimal} from "@/lib/execution/format";

/** The offers compared on the company in every adopted case, as the blocks carry them. Amounts in
 * millions with one decimal, rates in percent with two and multiples with two, rounded only for
 * display; eliminatory facts come before any preference, and nothing here recomputes a number. */
export async function ComparisonResult({locale, view}: {locale: string; view: FinancingComparisonResultBlocksView}) {
  const t = await getTranslations({locale, namespace: "App.workExecutions.comparison"});
  const status = await getTranslations({locale, namespace: "App.workExecutions.decisionStatus"});
  const mi = (v: string | null) => v === null ? "·" : formatRounded(shiftDecimal(v, -6), 1, locale);
  const pct = (v: string | null) => v === null ? "·" : `${formatRounded(shiftDecimal(v, 2), 2, locale)}%`;
  const x = (v: string) => `${formatRounded(v, 2, locale)}x`;
  const caseLabel = (id: string) => view.cases.find((c) => c.id === id)?.label ?? id;
  const fact = (key: string) => t.has(`facts.${key}`) ? t(`facts.${key}`) : key;
  // Offers without a complete reading in some case are counted apart (the packet names them by identity
  // only, and their gaps are listed below): a gap is not a refusal.
  const incomplete = [...new Set(view.conclusion.cases.flatMap((c) => c.incompleteProposalIds))];
  const proposalLabel = (id: string | null) => id === null ? "·" : view.proposals.find((p) => p.proposalId === id)?.label ?? id;
  return <section className="investment-result"><h2>{t("title")}</h2>
    <dl className="execution-facts">
      <dt>{t("status")}</dt><dd>{status(view.framing.status)}</dd>
      <dt>{t("question")}</dt><dd>{view.framing.question}</dd>
    </dl>
    <p>{t("units", {currency: view.framing.currency})}</p>
    {view.framing.nominalSpreadMisleads ? <p>{t("nominalMisleads")}</p> : null}
    {view.cases.map((c) => <div key={c.id}>
      <h3>{c.label}</h3>
      <div className="investment-table">
        <table>
          <thead><tr>
            <th scope="col">{t("columns.proposal")}</th><th scope="col">{t("columns.spread")}</th><th scope="col">{t("columns.life")}</th>
            <th scope="col">{t("columns.minimumCash")}</th><th scope="col">{t("columns.worstRatio")}</th><th scope="col">{t("columns.headroom")}</th>
            <th scope="col">{t("columns.ebitdaHeadroom")}</th><th scope="col">{t("columns.tests")}</th><th scope="col">{t("columns.freeReceivables")}</th>
            <th scope="col">{t("columns.horizonCost")}</th><th scope="col">{t("columns.facts")}</th>
          </tr></thead>
          <tbody>{view.proposals.filter((p) => p.caseId === c.id).map((p) => <tr key={p.proposalId}>
            <th scope="row">{p.label}</th>
            <td>{pct(p.equivalentSpread)}</td>
            <td>{formatRounded(p.weightedAverageLifeYears, 1, locale)}</td>
            <td>{mi(p.minimumCash)}<small>{p.minimumCashPeriod}</small></td>
            <td>{x(p.worstRatio)}<small>{p.worstPeriod}</small></td>
            <td>{x(p.headroom)}</td>
            <td>{mi(p.ebitdaHeadroom)}</td>
            <td>{p.covenantTestsPerYear}</td>
            <td>{mi(p.freeReceivablesAfter)}</td>
            <td>{mi(p.horizonFinancingCost)}</td>
            <td>{[...p.eliminatoryFacts, ...p.conditioningFacts].map(fact).join("; ") || "·"}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </div>)}
    <h3>{t("conclusion")}</h3>
    <p>{view.conclusion.viableInEveryCaseProposalIds.length
      ? t("viableEverywhere", {list: view.conclusion.viableInEveryCaseProposalIds.map(proposalLabel).join("; ")})
      : incomplete.length ? t("noneCompleteViableEverywhere") : t("noneViableEverywhere")}</p>
    {incomplete.length ? <p>{t("incomplete", {count: String(incomplete.length)})}</p> : null}
    <ul>{view.conclusion.cases.map((c) => <li key={c.caseId}>{t("perCase", {case: caseLabel(c.caseId), cheapest: proposalLabel(c.lowestEquivalentCostProposalId),
      safest: proposalLabel(c.highestMinimumCashProposalId)})}</li>)}</ul>
    {view.conclusion.conclusionChangingCaseIds.length ? <p>{t("changing", {list: view.conclusion.conclusionChangingCaseIds.map(caseLabel).join("; ")})}</p> : null}
    <h3>{t("cases")}</h3>
    <ul>{view.cases.map((c) => <li key={c.id}><strong>{c.label}</strong>{c.changes.length ? `: ${c.changes.join("; ")}` : ""}</li>)}</ul>
    <h3>{t("gaps")}</h3>
    {view.informationGaps.length ? <ul>{view.informationGaps.map((g, n) => <li key={n}>{caseLabel(g.caseId)} · <code>{g.operand}</code>: {g.reason}</li>)}</ul> : <p>{t("noGaps")}</p>}
    <h3>{t("exclusionsTitle")}</h3>
    <ul>{view.exclusions.map((e) => <li key={e}>{t.has(`exclusions.${e}`) ? t(`exclusions.${e}`) : e}</li>)}</ul>
  </section>;
}
