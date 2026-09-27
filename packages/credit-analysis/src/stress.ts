import {calculateStressTable, presentationFigure, type StressScenarioFigures} from "@offroad/financial-core";

import {absentRatioGap, publishedRatio} from "./absent-ratio";
import type {DeskAnalysis} from "./analyze";

/**
 * The stress table a committee reads before it prices.
 *
 * Four shocks every credit committee in Brazil applies, standardised so two cases can be
 * compared: EBITDA down 20% and 30%, CDI up 300 bps, the cash cycle 15 days longer, and the
 * largest customer gone. Each shock is recomputed from the desk's own numbers, never from a
 * model, and says what it does to leverage, to the interest bill, to working capital and to
 * the headroom under the tightest covenant. A shock that needs a number the room does not
 * carry says so instead of guessing.
 *
 * Every figure of the table, the shocked CDI and cycle its sentences state and every figure they
 * print come from `@offroad/financial-core` (stage 19, third polish); the labels and the sentences
 * stay here.
 */

export type StressScenario = {
  id: "ebitda_minus_20" | "ebitda_minus_30" | "cdi_plus_300" | "cycle_plus_15" | "top_customer_lost";
  labels: {pt: string; en: string};
  /** Leverage after the shock, post-transaction on reported EBITDA, or null when not computable. */
  leverage: string | null;
  /** Interest cost after the shock at the stated index levels, or null. */
  annualInterest: string | null;
  /** Working capital the shock absorbs, or null. */
  workingCapitalNeed: string | null;
  /** New money still admitted by the tightest covenant after the shock, or null. */
  covenantHeadroom: string | null;
  /** Whether the shocked leverage breaks the tightest covenant. */
  breachesCovenant: boolean | null;
  assumptions: {pt: string; en: string};
};

export type StressInput = {
  desk: DeskAnalysis;
  /** The transaction amount the stress is run on; the larger stated amount when absent. */
  amount?: string;
  /** Annual revenue, for the cycle shock; the audited year when absent. */
  revenue?: string;
  /** Share of revenue in the largest customer, as a fraction. */
  topCustomerShare?: string;
  /** Contribution margin lost with that customer, as a fraction of its revenue; 0.35 by default. */
  lostCustomerMargin?: string;
};

/** A figure at the precision the table publishes it, half-up on the decimal value; null stays null. */
const at = (value: string | null, decimals: number) => (value === null ? null : presentationFigure({value, decimals}).value);
/** A fraction as the percentage a sentence states. */
const percent = (value: string, decimals: number) => presentationFigure({value, scale: "percent", decimals}).value;

export function stressTable(input: StressInput): StressScenario[] {
  const {desk} = input;
  // A cycle absent over a zero cost of goods sold is named, never printed as a number of days.
  const cycleText = publishedRatio(desk.workingCapital.cycleDays);
  const cycleDays = cycleText ? cycleText : null;
  const cycleGap = cycleDays ? null : absentRatioGap(desk, "workingCapital.cycleDays", desk.workingCapital.cycleDays);
  const share = input.topCustomerShare ? input.topCustomerShare : null;
  const margin = input.lostCustomerMargin ?? "0.35";
  const table = calculateStressTable({
    ebitda: desk.leverage.ebitda,
    netDebtPre: desk.leverage.netDebtPre,
    grossDebt: desk.stack.totalOnBalance,
    amount: input.amount ? input.amount : null,
    scenarioAmounts: desk.leverage.scenarios.map((scenario) => scenario.amount),
    covenantCeiling: desk.leverage.tightestCovenant ? desk.leverage.tightestCovenant.maximum : null,
    weightedCost: desk.stack.weightedCost ? desk.stack.weightedCost : null,
    cdi: desk.assumptions.cdi,
    cycleDays,
    revenue: input.revenue ? input.revenue : null,
    topCustomerShare: share,
    lostCustomerMargin: margin,
  });
  const [minus20, minus30, cdiShock, cycleShock, customerLost] = table.scenarios as [StressScenarioFigures, StressScenarioFigures, StressScenarioFigures, StressScenarioFigures, StressScenarioFigures];

  const scenario = (figures: StressScenarioFigures, labels: {pt: string; en: string}, assumptions: {pt: string; en: string}): StressScenario => ({
    id: figures.id, labels,
    leverage: at(figures.leverage, 4),
    annualInterest: at(figures.annualInterest, 2),
    workingCapitalNeed: at(figures.workingCapitalNeed, 2),
    covenantHeadroom: at(figures.covenantHeadroom, 2),
    breachesCovenant: figures.breachesCovenant,
    assumptions,
  });

  const base = {pt: "Dívida líquida pós-operação sobre o EBITDA reportado; juros ao custo médio do estoque, com o novo papel ao mesmo custo.", en: "Post-transaction net debt over reported EBITDA; interest at the stack's weighted cost, the new paper at the same cost."};

  const cdiFrom = percent(desk.assumptions.cdi, 2);
  const cdiTo = percent(table.shockedCdi, 2);
  return [
    scenario(minus20, {pt: "EBITDA -20%", en: "EBITDA -20%"}, base),
    scenario(minus30, {pt: "EBITDA -30%", en: "EBITDA -30%"}, base),
    scenario(cdiShock, {pt: "CDI +300 bps", en: "CDI +300 bps"}, {
      pt: `CDI de ${cdiFrom.replace(".", ",")}% para ${cdiTo.replace(".", ",")}%, repassado integralmente ao estoque pós-fixado. EBITDA inalterado.`,
      en: `CDI from ${cdiFrom}% to ${cdiTo}%, passed fully to the floating stack. EBITDA unchanged.`,
    }),
    scenario(cycleShock, {pt: "Ciclo de caixa +15 dias", en: "Cash cycle +15 days"}, {
      pt: cycleDays
        ? `Ciclo de ${at(cycleDays, 0)} para ${at(table.shockedCycleDays, 0)} dias; o capital de giro absorvido é 15/365 da receita anual.`
        : `Ciclo de caixa ${cycleGap ? cycleGap.pt : "não calculado"}; o capital de giro absorvido é 15/365 da receita anual.`,
      en: cycleDays
        ? `Cycle from ${at(cycleDays, 0)} to ${at(table.shockedCycleDays, 0)} days; the working capital absorbed is 15/365 of annual revenue.`
        : `Cash cycle ${cycleGap ? cycleGap.en : "not computed"}; the working capital absorbed is 15/365 of annual revenue.`,
    }),
    scenario(customerLost, {pt: "Perda do maior cliente", en: "Largest customer lost"}, {
      pt: share ? `O maior cliente (${percent(share, 1).replace(".", ",")}% da receita) sai; o EBITDA perde a margem de contribuição dessa receita (${percent(margin, 0)}% assumido).` : "Concentração de clientes não informada; cenário não aplicado ao EBITDA.",
      en: share ? `The largest customer (${percent(share, 1)}% of revenue) leaves; EBITDA loses that revenue's contribution margin (${percent(margin, 0)}% assumed).` : "Customer concentration not stated; scenario not applied to EBITDA.",
    }),
  ];
}
