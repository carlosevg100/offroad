import Decimal from "decimal.js";

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

const d = (value: string | number): Decimal => new Decimal(value);
const ZERO = new Decimal(0);

export function stressTable(input: StressInput): StressScenario[] {
  const {desk} = input;
  const ebitda = d(desk.leverage.ebitda);
  const amount = input.amount ? d(input.amount) : desk.leverage.scenarios.reduce((max, s) => (d(s.amount).gt(max) ? d(s.amount) : max), ZERO);
  const netDebtPost = d(desk.leverage.netDebtPre).plus(amount);
  const grossDebtPost = d(desk.stack.totalOnBalance).plus(amount);
  const ceiling = desk.leverage.tightestCovenant ? d(desk.leverage.tightestCovenant.maximum) : null;
  const cdi = d(desk.assumptions.cdi);
  const weightedCost = desk.stack.weightedCost ? d(desk.stack.weightedCost) : null;
  const cycleDays = desk.workingCapital.cycleDays ? d(desk.workingCapital.cycleDays) : null;
  const revenue = input.revenue ? d(input.revenue) : null;

  const leverageOf = (e: Decimal) => (e.gt(0) ? netDebtPost.div(e) : null);
  const headroomOf = (e: Decimal) => (ceiling && e.gt(0) ? ceiling.times(e).minus(netDebtPost) : null);
  const interestAt = (cost: Decimal | null) => (cost ? grossDebtPost.times(cost) : null);

  const scenario = (
    id: StressScenario["id"], labels: {pt: string; en: string}, shockedEbitda: Decimal, cost: Decimal | null,
    workingCapitalNeed: Decimal | null, assumptions: {pt: string; en: string},
  ): StressScenario => {
    const leverage = leverageOf(shockedEbitda);
    const headroom = headroomOf(shockedEbitda);
    return {
      id, labels,
      leverage: leverage ? leverage.toFixed(4) : null,
      annualInterest: interestAt(cost)?.toFixed(2) ?? null,
      workingCapitalNeed: workingCapitalNeed ? workingCapitalNeed.toFixed(2) : null,
      covenantHeadroom: headroom ? headroom.toFixed(2) : null,
      breachesCovenant: leverage && ceiling ? leverage.gt(ceiling) : null,
      assumptions,
    };
  };

  const base = {pt: "Dívida líquida pós-operação sobre o EBITDA reportado; juros ao custo médio do estoque, com o novo papel ao mesmo custo.", en: "Post-transaction net debt over reported EBITDA; interest at the stack's weighted cost, the new paper at the same cost."};

  return [
    scenario("ebitda_minus_20", {pt: "EBITDA -20%", en: "EBITDA -20%"}, ebitda.times("0.8"), weightedCost, null, base),
    scenario("ebitda_minus_30", {pt: "EBITDA -30%", en: "EBITDA -30%"}, ebitda.times("0.7"), weightedCost, null, base),
    scenario("cdi_plus_300", {pt: "CDI +300 bps", en: "CDI +300 bps"}, ebitda, weightedCost ? weightedCost.plus("0.03") : null, null, {
      pt: `CDI de ${cdi.times(100).toFixed(2).replace(".", ",")}% para ${cdi.plus("0.03").times(100).toFixed(2).replace(".", ",")}%, repassado integralmente ao estoque pós-fixado. EBITDA inalterado.`,
      en: `CDI from ${cdi.times(100).toFixed(2)}% to ${cdi.plus("0.03").times(100).toFixed(2)}%, passed fully to the floating stack. EBITDA unchanged.`,
    }),
    scenario("cycle_plus_15", {pt: "Ciclo de caixa +15 dias", en: "Cash cycle +15 days"}, ebitda, weightedCost, revenue ? revenue.times(15).div(365) : null, {
      pt: cycleDays ? `Ciclo de ${cycleDays.toFixed(0)} para ${cycleDays.plus(15).toFixed(0)} dias; o capital de giro absorvido é 15/365 da receita anual.` : "Ciclo de caixa não calculado; o capital de giro absorvido é 15/365 da receita anual.",
      en: cycleDays ? `Cycle from ${cycleDays.toFixed(0)} to ${cycleDays.plus(15).toFixed(0)} days; the working capital absorbed is 15/365 of annual revenue.` : "Cash cycle not computed; the working capital absorbed is 15/365 of annual revenue.",
    }),
    (() => {
      const share = input.topCustomerShare ? d(input.topCustomerShare) : null;
      const margin = d(input.lostCustomerMargin ?? "0.35");
      const lost = share && revenue ? revenue.times(share).times(margin) : null;
      return scenario("top_customer_lost", {pt: "Perda do maior cliente", en: "Largest customer lost"}, lost ? ebitda.minus(lost) : ebitda, weightedCost, null, {
        pt: share ? `O maior cliente (${share.times(100).toFixed(1).replace(".", ",")}% da receita) sai; o EBITDA perde a margem de contribuição dessa receita (${margin.times(100).toFixed(0)}% assumido).` : "Concentração de clientes não informada; cenário não aplicado ao EBITDA.",
        en: share ? `The largest customer (${share.times(100).toFixed(1)}% of revenue) leaves; EBITDA loses that revenue's contribution margin (${margin.times(100).toFixed(0)}% assumed).` : "Customer concentration not stated; scenario not applied to EBITDA.",
      });
    })(),
  ];
}
