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
  indexLevels: {cdi: string; tlp?: string; ipca?: string; selic?: string; tr?: string};
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
  /**
   * Principal due per window, the way a note prints it ("Jun/26 a Mai/27: 1.229.828"). Listed
   * companies disclose this and rarely disclose maturities per line; when the lines carry no
   * dates, the wall is read from here.
   */
  maturityProfile?: Array<{window: string; amount: string; endsOn?: string}>;
  /**
   * Covenants the room states for the company as a whole rather than per line, the way a
   * listed company's notes do ("os principais instrumentos estão sujeitos a Dívida líquida /
   * EBITDA ≤ 4,0x"). They bind the stack, not one lender, and are labelled by their scope.
   */
  covenants?: Array<{scope: string; text: string}>;
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
  /**
   * What a venture lender reads instead of EBITDA: recurring revenue, burn, runway, the last
   * round, retention and concentration. Any of them may be absent; the runway arithmetic needs
   * burn, everything else sharpens it.
   */
  venture?: {
    arr?: string;
    mrr?: string;
    monthlyBurn?: string;
    runwayMonthsStated?: string;
    lastEquityRoundAmount?: string;
    lastEquityRoundDate?: string;
    nrr?: string;
    monthlyChurn?: string;
    topCustomerShare?: string;
  };
};

export type RunwayAnalysis = {
  monthlyBurn: string;
  cash: string;
  /** cash / burn, months, before the deal. */
  monthsPre: string;
  /** (cash + ask) / burn: what the ticket buys before its own service. */
  monthsPost: string;
  /** Same, with the ticket's interest paid monthly out of the same cash. */
  monthsPostAfterService: string;
  /** Annual rate assumed for the service, stated; the ask's own rate when parseable. */
  assumedRate: string;
  arr: string | null;
  /** (existing debt + ask) / ARR. Venture practice keeps this under roughly a third. */
  debtToArr: string | null;
  nrr: string | null;
  topCustomerShare: string | null;
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
  /** Whether leverage arithmetic means anything: a company that burns cash has no turns to count. */
  profile: "cash_generative" | "cash_burning";
  runway: RunwayAnalysis | null;
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

  const maturingFromLines = lines
    .filter((line) => line.maturity !== undefined && monthsBetween(input.referenceDate, line.maturity) <= 24)
    .reduce((sum, line) => sum.plus(line.balance), ZERO);
  // The profile wins when the lines cannot speak: a line without a maturity is not a line that
  // never matures, and a note that says "Jun/26 a Mai/27: 1.229.828" has already done the sum.
  const linesWithDates = lines.filter((line) => line.maturity !== undefined).length;
  const profileWithin24 = (input.maturityProfile ?? [])
    .filter((entry) => entry.endsOn !== undefined && monthsBetween(input.referenceDate, entry.endsOn) <= 24)
    .reduce((sum, entry) => sum.plus(entry.amount), ZERO);
  const maturing24 = linesWithDates < lines.length && profileWithin24.gt(maturingFromLines) ? profileWithin24 : maturingFromLines;

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

  const covenants = [
    ...lines.filter((line) => line.covenant !== null).map((line) => ({lender: line.lender, covenant: line.covenant!})),
    ...(input.covenants ?? [])
      .map((entry) => ({lender: entry.scope, covenant: parseCovenant(entry.text)}))
      .filter((entry): entry is {lender: string; covenant: ParsedCovenant} => entry.covenant !== null),
  ];
  const tightest = covenants.length > 0
    ? covenants.reduce((min, entry) => (d(entry.covenant.maximum).lt(min.covenant.maximum) ? entry : min))
    : null;

  // Leverage over a negative EBITDA is a number with no meaning, and a covenant test on it is
  // a sentence with no meaning. The cash-burning company is read through its runway instead.
  const burning = ebitda.lte(0);

  let maxNewDebt: Decimal | null = null;
  if (tightest && !burning) {
    maxNewDebt = d(tightest.covenant.maximum).times(ebitda).minus(netDebtPre);
    const worst = scenarios.reduce((max, s) => (d(s.postTurns).gt(max.postTurns) ? s : max), scenarios[0]!);
    if (scenarios.some((s) => d(s.postTurns).gt(tightest.covenant.maximum))) {
      // Already above the ceiling before the deal is a different sentence from "the deal breaks
      // it": the first is a fact about the company today, and new money can only enter as a swap.
      const alreadyAbove = preTurns.gt(tightest.covenant.maximum);
      findings.push({
        id: "covenant-breach-day-one",
        severity: "critical",
        pt: alreadyAbove
          ? `A companhia já está acima do covenant antes da operação: ${turns(preTurns)} contra o teto de ${turns(tightest.covenant.maximum)} (${tightest.lender}), excesso de ${brlM(maxNewDebt.abs())} de dívida líquida. Não cabe dívida nova por cima do estoque; a operação só existe como troca de passivo (resgate de linhas dentro do tíquete) ou com renegociação do covenant, e a trajetória até a próxima medição é o que a mesa precisa mostrar.`
          : `A operação como solicitada rompe covenant existente no dia um: a alavancagem sai de ${turns(preTurns)} para ${turns(worst.postTurns)} contra o teto de ${turns(tightest.covenant.maximum)} (${tightest.lender}). Nos números atuais cabem ${brlM(Decimal.max(maxNewDebt, 0))} de dívida nova antes do covenant, não ${brlM(worst.amount)}. Isso muda a natureza da operação: ou o pedido inclui quitação/renegociação das linhas com covenant, ou o tíquete cai, ou não há operação.`,
        en: alreadyAbove
          ? `The company is already above the covenant before the deal: ${turns(preTurns)} against the ${turns(tightest.covenant.maximum)} ceiling (${tightest.lender}), ${brlM(maxNewDebt.abs())} of net debt in excess. No new debt fits on top of the stock; the deal exists only as a liability swap (lines repaid inside the ticket) or with a renegotiated covenant, and the trajectory to the next test is what the desk has to show.`
          : `The transaction as asked breaches an existing covenant on day one: leverage moves from ${turns(preTurns)} to ${turns(worst.postTurns)} against the ${turns(tightest.covenant.maximum)} ceiling (${tightest.lender}). The current numbers admit ${brlM(Decimal.max(maxNewDebt, 0))} of new debt before the covenant, not ${brlM(worst.amount)}. That changes the nature of the deal: either the ask includes repaying or renegotiating the covenanted lines, or the ticket comes down, or there is no deal.`,
        values: {pre: preTurns.toFixed(4), post: worst.postTurns, ceiling: tightest.covenant.maximum, maxNewDebt: maxNewDebt.toFixed(2)},
        inputs: ["debt.covenants", "historical_financials.gross_debt", "historical_financials.cash", "historical_financials.ebitda", "transaction.requested_amount"],
      });
    }
  }

  if (maturing24.gt(0) && totalSchedule.gt(0)) {
    const share = Decimal.min(maturing24.div(totalSchedule), 1);
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

  // ---- runway: the axis a venture lender actually reads ---------------------------------------
  //
  // Months of cash before the deal, months the ticket buys, and months it buys once it has to
  // pay its own interest out of the same cash. The third number is the honest one: a loan that
  // buys eight months and costs two of them back buys six, and the founder's letter will have
  // quoted the first figure.
  let runway: RunwayAnalysis | null = null;
  const venture = input.venture;
  if (venture?.monthlyBurn && d(venture.monthlyBurn).gt(0)) {
    const burn = d(venture.monthlyBurn);
    const cashNow = d(input.balance.cash);
    const ask = scenarios.length > 0 ? scenarios.reduce((max, s) => (d(s.amount).gt(max) ? d(s.amount) : max), ZERO) : ZERO;
    const askRate = parseRate(input.request.rateAsk);
    const askCost = askRate ? effectiveAnnualCost(askRate, input.indexLevels) : null;
    // Venture practice when the ask names no rate: CDI plus six, before the warrant.
    const assumedRate = askCost ? d(askCost) : cdi.plus("0.06");
    const monthsPre = cashNow.div(burn);
    const monthsPost = cashNow.plus(ask).div(burn);
    const monthlyInterest = ask.times(assumedRate).div(12);
    const monthsPostAfterService = cashNow.plus(ask).div(burn.plus(monthlyInterest));
    const arr = venture.arr ? d(venture.arr) : null;
    const debtToArr = arr && arr.gt(0) ? totalOnBalance.plus(ask).div(arr) : null;
    const nrr = venture.nrr ? d(venture.nrr) : null;
    const topShare = venture.topCustomerShare ? d(venture.topCustomerShare) : null;
    runway = {
      monthlyBurn: burn.toFixed(2),
      cash: cashNow.toFixed(2),
      monthsPre: monthsPre.toFixed(1),
      monthsPost: monthsPost.toFixed(1),
      monthsPostAfterService: monthsPostAfterService.toFixed(1),
      assumedRate: assumedRate.toFixed(6),
      arr: arr ? arr.toFixed(2) : null,
      debtToArr: debtToArr ? debtToArr.toFixed(4) : null,
      nrr: nrr ? nrr.toFixed(4) : null,
      topCustomerShare: topShare ? topShare.toFixed(4) : null,
    };
    const months = (value: Decimal) => value.toFixed(1).replace(".", ",");

    if (monthsPre.lt(12)) {
      findings.push({
        id: "runway-short",
        severity: monthsPre.lt(9) ? "critical" : "high",
        pt: `Runway de ${months(monthsPre)} meses antes da operação (caixa de ${brlM(cashNow)} sobre queima de ${brlM(burn)} por mês). ${monthsPre.lt(9) ? "Abaixo de nove meses não é venture debt, é ponte de equity: o credor entraria para financiar a própria saída." : "Abaixo de doze meses o credor vai exigir que a rodada esteja encaminhada antes do desembolso, não depois."}`,
        en: `Runway of ${monthsPre.toFixed(1)} months before the deal (${brlM(cashNow)} of cash over ${brlM(burn)} of monthly burn). ${monthsPre.lt(9) ? "Under nine months this is not venture debt but an equity bridge: the lender would be funding its own exit." : "Under twelve months the lender will want the round in motion before disbursement, not after."}`,
        values: {monthsPre: monthsPre.toFixed(2), cash: cashNow.toFixed(2), burn: burn.toFixed(2)},
        inputs: ["interim_financials.cash", "interim_financials.monthly_burn"],
      });
    }
    if (venture.runwayMonthsStated && d(venture.runwayMonthsStated).minus(monthsPre).abs().gt("1.5")) {
      findings.push({
        id: "runway-stated-vs-computed",
        severity: "high",
        pt: `A companhia declara ${d(venture.runwayMonthsStated).toFixed(0)} meses de runway; o caixa sobre a queima média dá ${months(monthsPre)}. A diferença é a queima escolhida (melhor mês contra média do trimestre), e o credor usa a média.`,
        en: `The company states ${d(venture.runwayMonthsStated).toFixed(0)} months of runway; cash over average burn gives ${monthsPre.toFixed(1)}. The difference is the burn chosen (best month versus quarterly average), and the lender uses the average.`,
        values: {stated: d(venture.runwayMonthsStated).toFixed(2), computed: monthsPre.toFixed(2)},
        inputs: ["company.runway_months", "interim_financials.cash", "interim_financials.monthly_burn"],
      });
    }
    if (ask.gt(0)) {
      findings.push({
        id: "runway-bought",
        severity: "info",
        pt: `A captação de ${brlM(ask)} leva o runway de ${months(monthsPre)} para ${months(monthsPost)} meses antes do serviço, e para ${months(monthsPostAfterService)} com os juros pagos do mesmo caixa (${pctAA(assumedRate)} assumido${askCost ? ", a taxa pedida" : ", prática de venture debt quando o pedido não nomeia taxa"}). O que a operação compra é ${months(monthsPostAfterService.minus(monthsPre))} meses, não ${months(monthsPost.minus(monthsPre))}.`,
        en: `The ${brlM(ask)} raise takes runway from ${monthsPre.toFixed(1)} to ${monthsPost.toFixed(1)} months before service, and to ${monthsPostAfterService.toFixed(1)} with interest paid from the same cash (${pctAA(assumedRate)} assumed${askCost ? ", the rate asked" : ", venture-debt practice when the ask names no rate"}). What the deal buys is ${monthsPostAfterService.minus(monthsPre).toFixed(1)} months, not ${monthsPost.minus(monthsPre).toFixed(1)}.`,
        values: {monthsPre: monthsPre.toFixed(2), monthsPost: monthsPost.toFixed(2), monthsPostAfterService: monthsPostAfterService.toFixed(2), assumedRate: assumedRate.toFixed(6)},
        inputs: ["transaction.requested_amount", "interim_financials.cash", "interim_financials.monthly_burn"],
      });
    }
    if (debtToArr && debtToArr.gt("0.35")) {
      findings.push({
        id: "debt-to-arr",
        severity: "high",
        pt: `Dívida total pós-operação de ${brlM(totalOnBalance.plus(ask))} sobre ARR de ${brlM(arr!)}: ${debtToArr.times(100).toFixed(0)}% do ARR. A prática de venture debt fica entre 20% e 35%; acima disso o credor está financiando a queima, não a tração.`,
        en: `Total post-deal debt of ${brlM(totalOnBalance.plus(ask))} over ARR of ${brlM(arr!)}: ${debtToArr.times(100).toFixed(0)}% of ARR. Venture practice sits between 20% and 35%; above that the lender is funding burn, not traction.`,
        values: {debtToArr: debtToArr.toFixed(4), arr: arr!.toFixed(2), debtPost: totalOnBalance.plus(ask).toFixed(2)},
        inputs: ["interim_financials.arr", "debt.total_gross", "transaction.requested_amount"],
      });
    }
    if (nrr && nrr.lt(1)) {
      findings.push({
        id: "nrr-below-par",
        severity: "high",
        pt: `Retenção líquida de receita de ${nrr.times(100).toFixed(0)}%: a base encolhe sem venda nova. Em venture debt a base é a garantia; abaixo de 100% o credor precifica churn, não crescimento.`,
        en: `Net revenue retention of ${nrr.times(100).toFixed(0)}%: the base shrinks without new sales. In venture debt the base is the collateral; under 100% the lender prices churn, not growth.`,
        values: {nrr: nrr.toFixed(4)},
        inputs: ["company.net_revenue_retention"],
      });
    }
    if (topShare && topShare.gt("0.20")) {
      findings.push({
        id: "customer-concentration",
        severity: "high",
        pt: `O maior cliente responde por ${topShare.times(100).toFixed(0)}% do MRR. Acima de 20% a perda de um contrato move o runway em meses, e o credor vai pedir o contrato e uma cláusula de vencimento antecipado ligada a ele.`,
        en: `The largest customer is ${topShare.times(100).toFixed(0)}% of MRR. Above 20% losing one contract moves runway by months, and the lender will ask for the contract and an acceleration clause tied to it.`,
        values: {topCustomerShare: topShare.toFixed(4)},
        inputs: ["customers.top_customers.1.share_pct"],
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
    profile: burning ? "cash_burning" : "cash_generative",
    runway,
    findings,
  };
}
