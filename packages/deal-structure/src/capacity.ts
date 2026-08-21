import Decimal from "decimal.js";
import {archetype, type ArchetypeId} from "@offroad/credit-playbook";
import {calculateCapacityEnvelope, solveMaximumDebtByDscr} from "@offroad/financial-core";
import type {TracedCalculation} from "@offroad/reconciliation";

/**
 * How much this company can actually carry, and which of the three walls it hits first.
 *
 * A desk does not size an operation against what was asked for. It sizes against three
 * independent limits and takes the lowest, because a deal only clears if all three clear:
 *
 *   - **Cash flow.** What the generation services at the coverage a lender underwrites to.
 *     This is the one that matters most and the one companies underestimate most.
 *   - **Collateral.** What the assets support after haircuts, and after what is already
 *     pledged elsewhere.
 *   - **Market.** What this kind of paper carries at closing leverage before it stops finding
 *     buyers. Not a covenant, not a target, an observation about who buys.
 *
 * Naming the **binding constraint** is the useful part. "You asked for 38 and the answer is
 * 31" is a rejection; "you asked for 38, cash flow supports 46 and collateral supports 31, so
 * the conversation is about security, not about the amount" is the beginning of a structure.
 * Companies routinely respond to the second by finding an asset nobody had mentioned.
 *
 * Every figure here is arithmetic over reconciled facts, and every one carries its inputs.
 * Nothing is indicative in the sense of "roughly": it is indicative in the sense of "this is
 * what the numbers give, before an investor prices the risk".
 */

export type CapacityInput = {
  archetypeId: ArchetypeId;
  /** Amount asked for, decimal string. */
  requested: string;
  /** Cash available for debt service in a year, CFADS. */
  cfads?: string;
  /** Adjusted EBITDA, for the leverage ceiling. */
  adjustedEbitda?: string;
  /** Debt already outstanding, netted of cash. */
  existingNetDebt?: string;
  /** Eligible collateral after policy haircuts. */
  collateralCapacity?: string;
  /**
   * Annual debt service per unit of debt, at the tenor being discussed. A 60-month SAC
   * amortisation with interest is roughly 0.28; the caller passes what the structure implies.
   */
  annualDebtServiceFactor?: string;
  /** Annual recurring revenue, for venture debt, where EBITDA is negative by design. */
  arr?: string;
  /** Size of the last equity round, the other reference a venture lender sizes against. */
  lastEquityRound?: string;
};

export type CapacityWall = {
  id: "cash_flow" | "collateral" | "market" | "arr_and_round";
  labels: {pt: string; en: string};
  /** Decimal string, or null when the inputs to compute it are missing. */
  amount: string | null;
  /** Why this number, in terms the reader can check. */
  explanation: {pt: string; en: string};
  /** Which facts and calculations it rests on. */
  inputs: string[];
};

export type CapacityAssessment = {
  requested: string;
  /** The lowest wall, what the desk would take to market. Null when nothing could be computed. */
  recommended: string | null;
  bindingConstraint: CapacityWall["id"] | null;
  walls: CapacityWall[];
  /** Traced calculations, for the audit trail. */
  calculations: TracedCalculation[];
  /** What could not be computed and why, never silently omitted. */
  gaps: string[];
};

const money = (value: Decimal) => value.toDecimalPlaces(2).toFixed();

export function assessCapacity(input: CapacityInput): CapacityAssessment {
  const definition = archetype(input.archetypeId);
  const calculations: TracedCalculation[] = [];
  const gaps: string[] = [];

  // Venture debt is sized against a company that burns cash on purpose: the cash-flow wall and
  // the EBITDA-multiple wall do not exist for it. What exists is a fraction of the recurring
  // revenue and a fraction of the last round, whichever is lower, and the collateral wall.
  const ventureDebt = definition.id === "venture_debt";
  let arrAndRound: string | null = null;
  if (ventureDebt) {
    const candidates: Array<{label: string; value: Decimal}> = [];
    if (input.arr && new Decimal(input.arr).gt(0)) candidates.push({label: "arr", value: new Decimal(input.arr).times("0.30")});
    if (input.lastEquityRound && new Decimal(input.lastEquityRound).gt(0)) candidates.push({label: "last_equity_round", value: new Decimal(input.lastEquityRound).times("0.35")});
    if (candidates.length > 0) {
      const lowest = candidates.reduce((min, entry) => (entry.value.lt(min.value) ? entry : min));
      arrAndRound = money(lowest.value);
      calculations.push({
        id: "capacity_arr_and_round",
        labels: {pt: "Capacidade por ARR e última rodada", en: "Capacity from ARR and last round"},
        value: arrAndRound,
        trace: [
          {label: "arr", value: input.arr ?? "n/d"},
          {label: "arr_fraction", value: "0.30"},
          {label: "last_equity_round", value: input.lastEquityRound ?? "n/d"},
          {label: "round_fraction", value: "0.35"},
          {label: "binding", value: lowest.label},
        ],
        inputs: ["historical_financials.arr", "company.last_equity_round.amount", "playbook.venture_debt"],
        warnings: [],
      });
    } else {
      gaps.push("ARR ou valor da última rodada");
    }
  }

  // ---- wall 1: what the cash flow services -------------------------------------------------
  let cashFlow: string | null = null;
  if (ventureDebt) {
    // Not a gap: a venture lender does not ask a pre-profit company for DSCR.
  } else if (input.cfads && input.annualDebtServiceFactor) {
    const result = solveMaximumDebtByDscr(input.cfads, definition.structure.minimumDscr, input.annualDebtServiceFactor);
    cashFlow = result.value;
    calculations.push({
      id: "capacity_cash_flow",
      labels: {pt: "Capacidade por geração de caixa", en: "Capacity from cash generation"},
      value: result.value,
      trace: result.trace,
      inputs: ["calculated.cfads", "playbook.minimum_dscr"],
      warnings: [],
    });
  } else {
    gaps.push(input.cfads ? "fator de serviço da dívida" : "CFADS (caixa disponível para o serviço da dívida)");
  }

  // ---- wall 2: what the collateral supports ------------------------------------------------
  const collateral = input.collateralCapacity ?? null;
  if (!collateral) gaps.push("capacidade de garantias após haircut");

  // ---- wall 3: what the market carries -----------------------------------------------------
  //
  // Honest naming, because this one is easy to over-read. The number is EBITDA times the
  // playbook's leverage ceiling, the desk's own view of what this profile places, not an
  // observation of transactions that cleared. It is a good proxy for *size*, and it says nothing
  // at all about tenor, which is the other half of what the market decides; that half lives in
  // `market.ts` and is labelled by provenance for the same reason.
  let market: string | null = null;
  if (ventureDebt) {
    // No EBITDA ceiling by construction; the ARR wall above plays this role.
  } else if (input.adjustedEbitda) {
    const ebitda = new Decimal(input.adjustedEbitda);
    if (ebitda.gt(0)) {
      const ceiling = ebitda.times(definition.structure.leverageCeiling);
      const headroom = ceiling.minus(new Decimal(input.existingNetDebt ?? "0"));
      // Already above the ceiling means no incremental room, not negative room.
      market = money(Decimal.max(headroom, new Decimal(0)));
      calculations.push({
        id: "capacity_market",
        labels: {pt: "Capacidade pelo teto de alavancagem", en: "Capacity at the leverage ceiling"},
        value: market,
        trace: [
          {label: "adjusted_ebitda", value: money(ebitda)},
          {label: "leverage_ceiling", value: definition.structure.leverageCeiling},
          {label: "existing_net_debt", value: input.existingNetDebt ?? "0"},
        ],
        inputs: ["calculated.adjusted_ebitda", "playbook.leverage_ceiling", "calculated.net_debt"],
        warnings: [],
      });
    } else {
      gaps.push("EBITDA ajustado positivo");
    }
  } else {
    gaps.push("EBITDA ajustado");
  }

  const ventureWall: CapacityWall = {
    id: "arr_and_round",
    labels: {pt: "Fração do ARR e da última rodada", en: "Fraction of ARR and last round"},
    amount: arrAndRound,
    explanation: {
      pt: arrAndRound
        ? "O menor entre 30% do ARR e 35% da última rodada de equity: a prática de venture debt, onde o EBITDA é negativo por desenho e o que sustenta a dívida é a receita recorrente e o apoio dos investidores."
        : "Não calculada: falta o ARR ou o valor da última rodada.",
      en: arrAndRound
        ? "The lower of 30% of ARR and 35% of the last equity round: venture-debt practice, where EBITDA is negative by design and what carries the debt is recurring revenue and sponsor support."
        : "Not computed: ARR or the last round size is missing.",
    },
    inputs: ["historical_financials.arr", "company.last_equity_round.amount"],
  };
  const walls: CapacityWall[] = [
    ...(ventureDebt ? [ventureWall] : []),
    ...(ventureDebt ? [] : [{
      id: "cash_flow" as const,
      labels: {pt: "Geração de caixa", en: "Cash generation"},
      amount: cashFlow,
      explanation: {
        pt: cashFlow
          ? `A geração cobre um serviço de dívida a um DSCR mínimo de ${definition.structure.minimumDscr}x, que é a cobertura que um financiador subscreve para este tipo de operação.`
          : "Não calculada: falta CFADS ou o fator de serviço da dívida do prazo em discussão.",
        en: cashFlow
          ? `Generation covers debt service at a minimum DSCR of ${definition.structure.minimumDscr}x, the coverage a lender underwrites to for this operation.`
          : "Not computed: CFADS or the debt service factor for the tenor under discussion is missing.",
      },
      inputs: ["calculated.cfads"],
    }]),
    {
      id: "collateral",
      labels: {pt: "Garantias", en: "Collateral"},
      amount: collateral,
      explanation: {
        pt: collateral
          ? "Base elegível dos ativos após os haircuts de política e descontado o que já está gravado."
          : "Não calculada: falta a base elegível dos ativos e o haircut por classe.",
        en: collateral
          ? "Eligible asset base after policy haircuts and net of what is already encumbered."
          : "Not computed: the eligible asset base and per-class haircut are missing.",
      },
      inputs: ["calculated.collateral_capacity_total"],
    },
    ...(ventureDebt ? [] : [{
      id: "market" as const,
      labels: {pt: "Apetite de mercado (alavancagem)", en: "Market appetite (leverage)"},
      amount: market,
      explanation: {
        pt: market
          ? `Espaço até ${definition.structure.leverageCeiling}x dívida líquida / EBITDA no fechamento, que é onde este tipo de papel deixa de encontrar comprador. Este teto é a leitura do desk, não uma média de operações observadas, e ele fala de tamanho, não de prazo. Não é covenant nem meta.`
          : "Não calculada: falta EBITDA ajustado positivo.",
        en: market
          ? `Room to ${definition.structure.leverageCeiling}x net debt / EBITDA at closing, where this paper stops finding buyers. This ceiling is the desk's read rather than an average of observed transactions, and it speaks to size, not tenor. Not a covenant and not a target.`
          : "Not computed: positive adjusted EBITDA is missing.",
      },
      inputs: ["calculated.adjusted_ebitda"],
    }]),
  ];

  const computed = walls.filter((wall): wall is CapacityWall & {amount: string} => wall.amount !== null);
  if (computed.length === 0) {
    return {requested: input.requested, recommended: null, bindingConstraint: null, walls, calculations, gaps};
  }

  // The envelope takes the lowest of the three. A wall that could not be computed is not
  // treated as infinite, it is simply absent, and the gaps say so, because a recommendation
  // that ignores a missing constraint is a recommendation that will move later.
  const envelope = calculateCapacityEnvelope({
    requested: input.requested,
    cashFlowCapacity: cashFlow ?? arrAndRound ?? computed[0]!.amount,
    collateralCapacity: collateral ?? computed[0]!.amount,
    marketCapacity: market ?? arrAndRound ?? computed[0]!.amount,
  });

  const binding = computed.reduce((lowest, wall) =>
    new Decimal(wall.amount).lt(new Decimal(lowest.amount)) ? wall : lowest,
  );

  return {
    requested: envelope.requested,
    recommended: binding.amount,
    bindingConstraint: binding.id,
    walls,
    calculations,
    gaps,
  };
}
