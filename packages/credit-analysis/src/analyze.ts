import Decimal from "decimal.js";

import {
  effectiveAnnualCost, isReceivablesCession, parseCovenant, parseRate,
  parseReceivablesCoverage, type ParsedCovenant, type ParsedRate,
} from "./parse";

/**
 * The desk battery: what a head of credit computes before writing a single sentence.
 *
 * The product's weakness was never that the model wrote badly. It was that there was nothing
 * for the model to narrate: the entire deterministic layer was leverage, DSCR and a haircut,
 * so every brief was a language model improvising over four numbers. A real desk sits down
 * with a data room and produces, mechanically, before judgement enters: the stack normalized
 * to one axis, the covenant arithmetic pre and post, the maximum new money the tightest
 * covenant admits, the cash cycle and what growth will absorb, the encumbrance of the asset
 * being offered, and the distance between what the company asks and what its own numbers say.
 *
 * Aurora made the gap measurable. The transaction as asked takes leverage from 2,19x to 4,56x
 * against a 3,0x covenant, the working capital ask consumes 91% of the free receivables base,
 * and the company asks CDI+4,0 while already paying CDI+4,1 on average at half the leverage.
 * Three sentences a desk head says in the first meeting, none of which the product could
 * produce, because nothing computed them.
 *
 * Everything here is Decimal, everything is traced (every finding names its inputs and carries
 * the numbers it cites), and everything degrades honestly: an unparsable rate becomes an open
 * question, never a silent zero inside an average.
 */

export type DebtLineInput = {
  lender: string;
  instrumentType?: string;
  /** Decimal string, in units. */
  balance: string;
  rate?: string;
  /** ISO date. */
  maturity?: string;
  amortization?: string;
  collateral?: string;
  covenant?: string;
};

export type DeskInput = {
  /** Stated out loud in every cost figure. An assumption of the analysis, not a fact of the room. */
  indexLevels: {cdi: string; tlp?: string; ipca?: string; selic?: string};
  /** The date the analysis is run, for maturity and grace arithmetic. ISO. */
  referenceDate: string;
  /** Most recent full audited year. */
  audited: {
    year: number;
    revenue: string;
    ebitda: string;
    cogs?: string;
  };
  balance: {
    periodEnd: string;
    cash: string;
    receivables: string;
    inventory?: string;
    suppliers?: string;
    /** Gross debt as the balance sheet recognises it, leases included. */
    grossDebt: string;
  };
  interim?: {
    periodEnd: string;
    months: number;
    revenue: string;
    ebitda?: string;
    receivables?: string;
    cash?: string;
  };
  debt: DebtLineInput[];
  request: {
    /** Every amount the room states, with where it said so. More than one is itself a finding. */
    amounts: Array<{value: string; source: string}>;
    termMonths?: number;
    graceMonths?: number;
    rateAsk?: string;
    useOfProceeds?: Array<{item: string; amount: string}>;
    /** The slice of the ask labelled working capital, when the room says. */
    workingCapitalAsk?: string;
  };
  project?: {
    operationDate?: string;
    totalCost?: string;
  };
  /** Next projected year, for the growth-absorption arithmetic. */
  projectedNextYear?: {year: number; revenue: string};
};

export type Finding = {
  id: string;
  severity: "critical" | "high" | "medium" | "info";
  /** Desk language, numbers included. The model may rephrase; it may not renumber. */
  pt: string;
  en: string;
  /** Every figure the sentence cites, as decimal strings, so nothing has to be re-derived. */
  values: Record<string, string>;
  inputs: string[];
};

export type StackLine = {
  lender: string;
  instrumentType?: string;
  balance: string;
  rate: ParsedRate | null;
  effectiveAnnual: string | null;
  maturity?: string;
  covenant: ParsedCovenant | null;
};

export type DeskAnalysis = {
  assumptions: {cdi: string; referenceDate: string};
  stack: {
    lines: StackLine[];
    totalSchedule: string;
    totalOnBalance: string;
    scheduleGap: string;
    weightedCost: string | null;
    weightedSpreadOverCdi: string | null;
    unpriceableLines: number;
    maturingWithin24Months: string;
  };
  leverage: {
    netDebtPre: string;
    ebitda: string;
    preTurns: string;
    scenarios: Array<{amount: string; source: string; postTurns: string}>;
    tightestCovenant: {lender: string; maximum: string} | null;
    /** The number that changes the meeting: new money the tightest covenant admits. */
    maxNewDebtUnderCovenants: string | null;
  };
  workingCapital: {
    dso: string | null;
    dio: string | null;
    dpo: string | null;
    cycleDays: string | null;
    growthAbsorption: string | null;
  };
  encumbrance: {
    receivablesBase: string;
    encumbered: string;
    free: string;
    askAgainstFree: string | null;
  };
  findings: Finding[];
};

const d = (value: string | number): Decimal => new Decimal(value);
const ZERO = new Decimal(0);

/** R$ 13,6M, the way a desk says a number out loud. */
const brlM = (value: Decimal.Value): string => {
  const millions = new Decimal(value).div(1_000_000);
  return `R$ ${millions.toFixed(1).replace(".", ",")}M`;
};
const turns = (value: Decimal.Value): string => `${new Decimal(value).toFixed(2).replace(".", ",")}x`;
const pctAA = (value: Decimal.Value): string => `${new Decimal(value).times(100).toFixed(1).replace(".", ",")}% a.a.`;

/**
 * Calendar months between two ISO dates, read from the string itself.
 *
 * Never through `new Date()`: an ISO date parses as UTC midnight, which in any timezone west
 * of Greenwich is the previous local day, and "2027-09-01" quietly becoming August moves every
 * maturity and grace computation by a month. Date arithmetic in a credit analysis cannot
 * depend on the analyst's timezone.
 */
const monthsBetween = (fromIso: string, toIso: string): number => {
  const [fromYear, fromMonth] = fromIso.split("-").map(Number);
  const [toYear, toMonth] = toIso.split("-").map(Number);
  return (toYear! - fromYear!) * 12 + (toMonth! - fromMonth!);
};

export function analyzeCreditPosition(input: DeskInput): DeskAnalysis {
  const findings: Finding[] = [];
  const cdi = d(input.indexLevels.cdi);

  // ---- the stack, on one axis -----------------------------------------------------------------
  const lines: StackLine[] = input.debt.map((line) => {
    const rate = parseRate(line.rate);
    return {
      lender: line.lender,
      ...(line.instrumentType !== undefined ? {instrumentType: line.instrumentType} : {}),
      balance: d(line.balance).toFixed(2),
      rate,
      effectiveAnnual: rate ? effectiveAnnualCost(rate, input.indexLevels) : null,
      ...(line.maturity !== undefined ? {maturity: line.maturity} : {}),
      covenant: parseCovenant(line.covenant),
    };
  });

  const totalSchedule = lines.reduce((sum, line) => sum.plus(line.balance), ZERO);
  const totalOnBalance = d(input.balance.grossDebt);
  const scheduleGap = totalOnBalance.minus(totalSchedule);

  const priceable = lines.filter((line) => line.effectiveAnnual !== null);
  const priceableTotal = priceable.reduce((sum, line) => sum.plus(line.balance), ZERO);
  const weightedCost = priceableTotal.gt(0)
    ? priceable.reduce((sum, line) => sum.plus(d(line.balance).times(line.effectiveAnnual!)), ZERO).div(priceableTotal)
    : null;
  const weightedSpread = weightedCost ? weightedCost.minus(cdi) : null;

  const maturing24 = lines
    .filter((line) => line.maturity !== undefined && monthsBetween(input.referenceDate, line.maturity) <= 24)
    .reduce((sum, line) => sum.plus(line.balance), ZERO);

  if (scheduleGap.abs().gt(totalOnBalance.times("0.02"))) {
    findings.push({
      id: "stack-vs-balance",
      severity: "critical",
      pt: `O mapa de dívida soma ${brlM(totalSchedule)} e o balanço reconhece ${brlM(totalOnBalance)}: há ${brlM(scheduleGap.abs())} de dívida ${scheduleGap.gt(0) ? "fora do mapa" : "a mais no mapa"}. Antes de qualquer estrutura, a mesa precisa saber o que é, tipicamente arrendamento ou fiança não listada.`,
      en: `The debt schedule sums to ${brlM(totalSchedule)} while the balance sheet recognises ${brlM(totalOnBalance)}: ${brlM(scheduleGap.abs())} of debt sits ${scheduleGap.gt(0) ? "outside the schedule" : "in the schedule only"}. The desk needs to know what it is before structuring, typically leases or unlisted guarantees.`,
      values: {schedule: totalSchedule.toFixed(2), onBalance: totalOnBalance.toFixed(2), gap: scheduleGap.toFixed(2)},
      inputs: ["debt.total_gross", "historical_financials.gross_debt"],
    });
  }

  const unpriceable = lines.filter((line, index) => line.effectiveAnnual === null && Boolean(input.debt[index]?.rate));
  if (unpriceable.length > 0) {
    findings.push({
      id: "unparsed-rates",
      severity: "medium",
      pt: `${unpriceable.length} linha(s) do mapa têm custo que não pôde ser posto no eixo comum (taxa ilegível ou índice sem nível informado) (${unpriceable.map((line) => line.lender).join(", ")}); o custo médio do stack está calculado sem elas.`,
      en: `${unpriceable.length} schedule line(s) carry a cost that could not be normalised (unreadable rate or index without a stated level) (${unpriceable.map((line) => line.lender).join(", ")}); the weighted cost excludes them.`,
      values: {count: String(unpriceable.length)},
      inputs: unpriceable.map((line) => `debt.instruments.${lines.indexOf(line) + 1}.rate`),
    });
  }

  // ---- leverage and covenants, pre and post ---------------------------------------------------
  const ebitda = d(input.audited.ebitda);
  const netDebtPre = totalOnBalance.minus(input.balance.cash);
  const preTurns = netDebtPre.div(ebitda);

  const scenarios = input.request.amounts.map((amount) => ({
    amount: d(amount.value).toFixed(2),
    source: amount.source,
    postTurns: netDebtPre.plus(amount.value).div(ebitda).toFixed(4),
  }));

  const covenants = lines
    .filter((line) => line.covenant !== null)
    .map((line) => ({lender: line.lender, covenant: line.covenant!}));
  const tightest = covenants.length > 0
    ? covenants.reduce((min, entry) => (d(entry.covenant.maximum).lt(min.covenant.maximum) ? entry : min))
    : null;

  let maxNewDebt: Decimal | null = null;
  if (tightest) {
    maxNewDebt = d(tightest.covenant.maximum).times(ebitda).minus(netDebtPre);
    const worst = scenarios.reduce((max, s) => (d(s.postTurns).gt(max.postTurns) ? s : max), scenarios[0]!);
    if (scenarios.some((s) => d(s.postTurns).gt(tightest.covenant.maximum))) {
      findings.push({
        id: "covenant-breach-day-one",
        severity: "critical",
        pt: `A operação como solicitada rompe covenant existente no dia um: a alavancagem sai de ${turns(preTurns)} para ${turns(worst.postTurns)} contra o teto de ${turns(tightest.covenant.maximum)} do contrato ${tightest.lender}. Nos números atuais cabem ${brlM(Decimal.max(maxNewDebt, 0))} de dívida nova antes do covenant, não ${brlM(worst.amount)}. Isso muda a natureza da operação: ou o pedido inclui quitação/renegociação das linhas com covenant, ou o tíquete cai, ou não há operação.`,
        en: `The transaction as asked breaches an existing covenant on day one: leverage moves from ${turns(preTurns)} to ${turns(worst.postTurns)} against the ${turns(tightest.covenant.maximum)} ceiling in the ${tightest.lender} contract. The current numbers admit ${brlM(Decimal.max(maxNewDebt, 0))} of new debt before the covenant, not ${brlM(worst.amount)}. That changes the nature of the deal: either the ask includes repaying or renegotiating the covenanted lines, or the ticket comes down, or there is no deal.`,
        values: {pre: preTurns.toFixed(4), post: worst.postTurns, ceiling: tightest.covenant.maximum, maxNewDebt: maxNewDebt.toFixed(2)},
        inputs: ["debt.covenants", "historical_financials.gross_debt", "historical_financials.cash", "historical_financials.ebitda", "transaction.requested_amount"],
      });
    }
  }

  if (maturing24.gt(0) && totalSchedule.gt(0)) {
    const share = maturing24.div(totalSchedule);
    if (share.gte("0.4")) {
      findings.push({
        id: "maturity-wall",
        severity: "high",
        pt: `${brlM(maturing24)} (${share.times(100).toFixed(0)}% do mapa) vencem em até 24 meses. A operação disputa caixa com uma parede de refinanciamento, e o desenho tem que dizer o que acontece com essas linhas.`,
        en: `${brlM(maturing24)} (${share.times(100).toFixed(0)}% of the schedule) matures within 24 months. The transaction competes with a refinancing wall, and the structure has to say what happens to those lines.`,
        values: {maturing24: maturing24.toFixed(2), share: share.toFixed(4)},
        inputs: ["debt.instruments"],
      });
    }
  }

  // ---- working capital: the cycle and what growth absorbs -------------------------------------
  const revenue = d(input.audited.revenue);
  const cogs = input.audited.cogs ? d(input.audited.cogs) : null;
  const dso = revenue.gt(0) ? d(input.balance.receivables).div(revenue).times(365) : null;
  const dio = cogs && input.balance.inventory ? d(input.balance.inventory).div(cogs).times(365) : null;
  const dpo = cogs && input.balance.suppliers ? d(input.balance.suppliers).div(cogs).times(365) : null;
  const cycle = dso && dio && dpo ? dso.plus(dio).minus(dpo) : null;

  let growthAbsorption: Decimal | null = null;
  if (cycle && input.projectedNextYear) {
    const growth = d(input.projectedNextYear.revenue).minus(revenue);
    if (growth.gt(0)) {
      growthAbsorption = growth.times(cycle).div(365);
      if (input.request.workingCapitalAsk) {
        const ask = d(input.request.workingCapitalAsk);
        if (ask.gt(growthAbsorption.times(2))) {
          findings.push({
            id: "wc-ask-vs-need",
            severity: "high",
            pt: `O crescimento projetado (${brlM(growth)} de receita) absorve ${brlM(growthAbsorption)} de capital de giro ao ciclo atual de ${cycle.toFixed(0)} dias, mas o pedido rotula ${brlM(ask)} como giro, ${ask.div(growthAbsorption).toFixed(1).replace(".", ",")} vezes a necessidade incremental. A diferença financia outra coisa (alongamento de ciclo, recomposição de caixa ou substituição de linhas), e a mesa precisa nomear o quê, porque o fundo vai perguntar.`,
            en: `Projected growth (${brlM(growth)} of revenue) absorbs ${brlM(growthAbsorption)} of working capital at the current ${cycle.toFixed(0)}-day cycle, yet the ask labels ${brlM(ask)} as working capital, ${ask.div(growthAbsorption).toFixed(1)} times the incremental need. The difference funds something else, and the desk has to name it, because the fund will ask.`,
            values: {need: growthAbsorption.toFixed(2), ask: ask.toFixed(2), cycleDays: cycle.toFixed(1)},
            inputs: ["projections.revenue", "historical_financials.revenue", "transaction.use_of_proceeds"],
          });
        }
      }
    }
  }

  // ---- encumbrance: how free is the asset being offered ---------------------------------------
  const receivablesBase = d(input.interim?.receivables ?? input.balance.receivables);
  let encumbered = ZERO;
  for (const [index, line] of input.debt.entries()) {
    const coverage = parseReceivablesCoverage(line.collateral);
    if (coverage) encumbered = encumbered.plus(d(line.balance).times(coverage));
    else if (isReceivablesCession(line.collateral)) encumbered = encumbered.plus(line.balance);
    void index;
  }
  const free = Decimal.max(receivablesBase.minus(encumbered), 0);
  let askAgainstFree: Decimal | null = null;
  if (input.request.workingCapitalAsk && free.gt(0)) {
    askAgainstFree = d(input.request.workingCapitalAsk).div(free);
    if (askAgainstFree.gte("0.8")) {
      findings.push({
        id: "receivables-encumbrance",
        severity: "high",
        pt: `Dos ${brlM(receivablesBase)} de recebíveis, ${brlM(encumbered)} já estão comprometidos com as linhas atuais (coberturas de 125% a 130% e cessões). Sobram ${brlM(free)} livres, e o pedido de giro de ${brlM(input.request.workingCapitalAsk)} consome ${askAgainstFree.times(100).toFixed(0)}% disso. Garantia para dinheiro novo é escassa, e qualquer estrutura vai disputar colateral com os bancos incumbentes.`,
        en: `Of ${brlM(receivablesBase)} in receivables, ${brlM(encumbered)} is already committed to the current lines (125% to 130% coverages and cessions). ${brlM(free)} remains free, and the ${brlM(input.request.workingCapitalAsk)} working-capital ask consumes ${askAgainstFree.times(100).toFixed(0)}% of it. Collateral for new money is scarce, and any structure will compete with incumbent banks for it.`,
        values: {base: receivablesBase.toFixed(2), encumbered: encumbered.toFixed(2), free: free.toFixed(2), askShare: askAgainstFree.toFixed(4)},
        inputs: ["debt.instruments", "interim_financials.receivables"],
      });
    }
  }

  // ---- the ask against the room's own numbers -------------------------------------------------
  const distinctAmounts = [...new Set(input.request.amounts.map((a) => d(a.value).toFixed(2)))];
  if (distinctAmounts.length > 1) {
    const described = input.request.amounts.map((a) => `${brlM(a.value)} (${a.source})`).join(" e ");
    findings.push({
      id: "amount-divergence",
      severity: "high",
      pt: `A sala pede dois valores diferentes: ${described}. Nenhuma fonte manda na outra; é pergunta para a empresa antes de qualquer material ir a mercado.`,
      en: `The room asks for two different amounts: ${described}. Neither source outranks the other; it is a question for the company before any material goes to market.`,
      values: Object.fromEntries(input.request.amounts.map((a, i) => [`amount_${i + 1}`, d(a.value).toFixed(2)])),
      inputs: ["transaction.requested_amount"],
    });
  }

  const rateAsk = parseRate(input.request.rateAsk);
  const rateAskAnnual = rateAsk ? effectiveAnnualCost(rateAsk, input.indexLevels) : null;
  if (rateAskAnnual && weightedCost && tightest) {
    const worstPost = scenarios.reduce((max, s) => Decimal.max(max, s.postTurns), ZERO);
    if (d(rateAskAnnual).lte(weightedCost.plus("0.005")) && worstPost.gt(preTurns)) {
      findings.push({
        id: "rate-ask-vs-stack",
        severity: "high",
        pt: `A empresa pede ${pctAA(rateAskAnnual)} (com CDI a ${pctAA(cdi)}) para dinheiro novo que leva a alavancagem a ${turns(worstPost)}, enquanto o stack atual, contratado à alavancagem menor de ${turns(preTurns)}, já custa ${pctAA(weightedCost)} na média. Dinheiro novo, mais alavancado e mais junior não sai mais barato que o estoque; a expectativa de taxa precisa ser recalibrada antes da conversa com fundos.`,
        en: `The company asks ${pctAA(rateAskAnnual)} (CDI at ${pctAA(cdi)}) for new money that takes leverage to ${turns(worstPost)}, while the current stack, written at lower leverage, already averages ${pctAA(weightedCost)}. Newer, more levered, more junior money does not price below the stock; the rate expectation needs recalibrating before any fund conversation.`,
        values: {ask: rateAskAnnual, stackAverage: weightedCost.toFixed(6), postTurns: worstPost.toFixed(4)},
        inputs: ["transaction.expected_rate", "debt.instruments"],
      });
    }
  }

  if (input.request.graceMonths !== undefined && input.project?.operationDate) {
    const graceEndsBy = monthsBetween(input.referenceDate, input.project.operationDate) - input.request.graceMonths;
    if (graceEndsBy > 0) {
      findings.push({
        id: "grace-vs-project",
        severity: "medium",
        pt: `Com desembolso na data de referência, a carência de ${input.request.graceMonths} meses termina ${graceEndsBy} meses antes de o projeto entrar em operação (${input.project.operationDate}). A amortização começa antes da receita incremental existir, e o serviço desse intervalo sai do caixa da operação atual.`,
        en: `Disbursed at the reference date, the ${input.request.graceMonths}-month grace ends ${graceEndsBy} months before the project starts operating (${input.project.operationDate}). Amortisation begins before the incremental revenue exists, and that interval is served by the current operation's cash.`,
        values: {gapMonths: String(graceEndsBy)},
        inputs: ["transaction.desired_grace_months", "project.operation_date"],
      });
    }
  }

  // Severity order, so a reader meets the deal-changers first.
  const order = {critical: 0, high: 1, medium: 2, info: 3};
  findings.sort((a, b) => order[a.severity] - order[b.severity]);

  return {
    assumptions: {cdi: cdi.toFixed(6), referenceDate: input.referenceDate},
    stack: {
      lines,
      totalSchedule: totalSchedule.toFixed(2),
      totalOnBalance: totalOnBalance.toFixed(2),
      scheduleGap: scheduleGap.toFixed(2),
      weightedCost: weightedCost ? weightedCost.toFixed(6) : null,
      weightedSpreadOverCdi: weightedSpread ? weightedSpread.toFixed(6) : null,
      unpriceableLines: unpriceable.length,
      maturingWithin24Months: maturing24.toFixed(2),
    },
    leverage: {
      netDebtPre: netDebtPre.toFixed(2),
      ebitda: ebitda.toFixed(2),
      preTurns: preTurns.toFixed(4),
      scenarios,
      tightestCovenant: tightest ? {lender: tightest.lender, maximum: tightest.covenant.maximum} : null,
      maxNewDebtUnderCovenants: maxNewDebt ? maxNewDebt.toFixed(2) : null,
    },
    workingCapital: {
      dso: dso ? dso.toFixed(1) : null,
      dio: dio ? dio.toFixed(1) : null,
      dpo: dpo ? dpo.toFixed(1) : null,
      cycleDays: cycle ? cycle.toFixed(1) : null,
      growthAbsorption: growthAbsorption ? growthAbsorption.toFixed(2) : null,
    },
    encumbrance: {
      receivablesBase: receivablesBase.toFixed(2),
      encumbered: encumbered.toFixed(2),
      free: free.toFixed(2),
      askAgainstFree: askAgainstFree ? askAgainstFree.toFixed(4) : null,
    },
    findings,
  };
}
