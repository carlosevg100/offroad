import {
  calculateDeskDebtStack, calculateDeskLeverage, calculateInterestCoverage, calculateReceivablesEncumbrance, calculateVentureRunway,
  calculateWorkingCapitalCycle, compareFigures, composeIndexAndSpread, presentationAmount, presentationFigure, presentationRatio,
  spreadOverIndex, testRateAskAgainstStack, testScheduleTieOut, tryPresentationNumber, type DecimalInput,
} from "@offroad/financial-core";

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
 * Every figure here comes from a `@offroad/financial-core` kernel (Decimal, traced, tested),
 * every finding names its inputs and carries the numbers it cites, and everything degrades
 * honestly: an unparsable rate becomes an open question, never a silent zero inside an average.
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
    /** Interest expense of the year, as a magnitude. */
    financialExpenses?: string;
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
    /** Principal due within 12 months, from the profile when the lines cannot say. */
    maturingWithin12Months: string;
    /** Cash over the principal due within 12 months; null when nothing is due. */
    liquidityCoverage12: string | null;
  };
  leverage: {
    netDebtPre: string;
    ebitda: string;
    preTurns: string;
    scenarios: Array<{amount: string; source: string; postTurns: string}>;
    tightestCovenant: {lender: string; maximum: string} | null;
    /** The number that changes the meeting: new money the tightest covenant admits. */
    maxNewDebtUnderCovenants: string | null;
    /** EBITDA over the year's interest expense; null when the room does not state the expense. */
    interestCoverage: string | null;
    /** The same coverage with the ask's interest added at the stack's cost, or the ask's own rate. */
    interestCoveragePost: string | null;
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

type Locale = "pt-BR" | "en-US";
const local = (figure: string, locale: Locale) => (locale === "pt-BR" ? figure.replace(".", ",") : figure);
/**
 * R$ 13,6M and R$ 13.6M, the way a desk says a number out loud, by the one rule every material
 * prints amounts with (financial-core): thousands below a million, never "R$ 0,0M" for an amount
 * that is not zero. Each language prints its own separators; the figures are the same.
 */
const brlM = (value: DecimalInput, locale: Locale = "pt-BR"): string => presentationAmount({value, locale, style: "abbreviated"}).text;
const turns = (value: DecimalInput, locale: Locale = "pt-BR"): string => `${local(presentationFigure({value, decimals: 2}).value, locale)}x`;
const pctAA = (value: DecimalInput, locale: Locale = "pt-BR"): string =>
  `${local(presentationFigure({value, scale: "percent", decimals: 1}).value, locale)}% ${locale === "pt-BR" ? "a.a." : "p.a."}`;
/** A figure at the precision the desk publishes it, rounded half-up on the decimal value. */
const at = (value: DecimalInput, decimals: number): string => presentationFigure({value, decimals}).value;
/** A ratio at the precision the desk publishes it; over a zero denominator, as the division prints it. */
const ratioAt = (value: string, decimals: number): string => presentationRatio({value, decimals}).value;
const percentAt = (value: DecimalInput, decimals: number): string => presentationFigure({value, scale: "percent", decimals}).value;
/** A ratio the desk may compare with a threshold: a ratio over a zero denominator is never compared. */
const comparable = (value: string | null): value is string => value !== null && tryPresentationNumber(value) !== null;

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
  const cdi = input.indexLevels.cdi;

  // ---- the stack, on one axis -----------------------------------------------------------------
  const read = input.debt.map((line) => {
    const rate = parseRate(line.rate);
    return {line, rate, effectiveAnnual: rate ? effectiveAnnualCost(rate, input.indexLevels) : null};
  });
  // The profile wins when the lines cannot speak: a line without a maturity is not a line that
  // never matures, and a note that says "Jun/26 a Mai/27: 1.229.828" has already done the sum.
  const stack = calculateDeskDebtStack({
    lines: read.map(({line, effectiveAnnual}) => ({
      balance: line.balance,
      effectiveAnnual,
      monthsToMaturity: line.maturity !== undefined ? monthsBetween(input.referenceDate, line.maturity) : null,
    })),
    grossDebt: input.balance.grossDebt,
    cash: input.balance.cash,
    maturityProfile: (input.maturityProfile ?? []).map((entry) => ({
      amount: entry.amount,
      monthsToEnd: entry.endsOn !== undefined ? monthsBetween(input.referenceDate, entry.endsOn) : null,
    })),
  });
  const lines: StackLine[] = read.map(({line, rate, effectiveAnnual}, index) => ({
    lender: line.lender,
    ...(line.instrumentType !== undefined ? {instrumentType: line.instrumentType} : {}),
    balance: stack.lineBalances[index]!,
    rate,
    effectiveAnnual,
    ...(line.maturity !== undefined ? {maturity: line.maturity} : {}),
    covenant: parseCovenant(line.covenant),
  }));
  // The spread a composed cost carries over the CDI is (1 + cost) / (1 + CDI) - 1, not cost - CDI.
  const weightedSpread = stack.weightedCost !== null ? spreadOverIndex({annualRate: stack.weightedCost, annualIndex: cdi}).value : null;

  // The wall a desk actually worries about is the next twelve months against the cash on hand.
  // A company can carry a heavy schedule if it sits on the cash to meet it; a light one is a
  // wall if the cash is not there. The ratio says which, before any refinancing assumption.
  const coverage12 = stack.liquidityCoverage12;
  if (coverage12 !== null && compareFigures(coverage12, "1.5") < 0) {
    const tight = compareFigures(coverage12, 1) < 0;
    findings.push({
      id: "short-term-principal-vs-cash",
      severity: tight ? "critical" : "high",
      pt: `${brlM(stack.maturingWithin12Months)} de principal vencem nos próximos 12 meses contra ${brlM(input.balance.cash)} de caixa: cobertura de ${local(at(coverage12, 2), "pt-BR")}x. ${tight ? "O caixa não cobre o principal do ano: sem refinanciamento ou geração acima do histórico, a companhia não chega ao fim do período pelos próprios meios, e a captação tem que ser dimensionada para isso." : "Cobre, mas sem folga para a sazonalidade do capital de giro: parte do caixa que paga a dívida é o caixa que compra estoque, e a mesa precisa ver o fluxo mensal antes de tratar o refinanciamento como opcional."}`,
      en: `${brlM(stack.maturingWithin12Months, "en-US")} of principal falls due in the next 12 months against ${brlM(input.balance.cash, "en-US")} of cash: ${at(coverage12, 2)}x coverage. ${tight ? "Cash does not cover the year's principal: without refinancing or generation above history, the company does not reach the end of the period on its own means, and the raise has to be sized for that." : "It covers, but without room for working-capital seasonality: part of the cash that pays the debt is the cash that buys inventory, and the desk needs the monthly flow before treating refinancing as optional."}`,
      values: {maturing12: at(stack.maturingWithin12Months, 2), cash: at(input.balance.cash, 2), coverage: at(coverage12, 4)},
      inputs: ["debt.maturity_profile", "debt.instruments", "interim_financials.cash"],
    });
  }

  const tieOut = testScheduleTieOut({scheduleGap: stack.scheduleGap, totalOnBalance: stack.totalOnBalance, tolerance: "0.02"});
  if (tieOut.outcome === "outside_tolerance") {
    const outside = tieOut.side === "balance_above_schedule";
    findings.push({
      id: "stack-vs-balance",
      severity: "critical",
      pt: `O mapa de dívida soma ${brlM(stack.totalSchedule)} e o balanço reconhece ${brlM(stack.totalOnBalance)}: há ${brlM(tieOut.magnitude)} de dívida ${outside ? "fora do mapa" : "a mais no mapa"}. Antes de qualquer estrutura, a mesa precisa saber o que é, tipicamente arrendamento ou fiança não listada.`,
      en: `The debt schedule sums to ${brlM(stack.totalSchedule, "en-US")} while the balance sheet recognises ${brlM(stack.totalOnBalance, "en-US")}: ${brlM(tieOut.magnitude, "en-US")} of debt sits ${outside ? "outside the schedule" : "in the schedule only"}. The desk needs to know what it is before structuring, typically leases or unlisted guarantees.`,
      values: {schedule: at(stack.totalSchedule, 2), onBalance: at(stack.totalOnBalance, 2), gap: at(stack.scheduleGap, 2)},
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
  const covenants = [
    ...lines.filter((line) => line.covenant !== null).map((line) => ({lender: line.lender, covenant: line.covenant!})),
    ...(input.covenants ?? [])
      .map((entry) => ({lender: entry.scope, covenant: parseCovenant(entry.text)}))
      .filter((entry): entry is {lender: string; covenant: ParsedCovenant} => entry.covenant !== null),
  ];
  const leverage = calculateDeskLeverage({
    grossDebt: input.balance.grossDebt,
    cash: input.balance.cash,
    ebitda: input.audited.ebitda,
    amounts: input.request.amounts.map((amount) => amount.value),
    ceilings: covenants.map((entry) => entry.covenant.maximum),
  });
  const scenarios = input.request.amounts.map((amount, index) => ({
    amount: leverage.scenarios[index]!.amount,
    source: amount.source,
    postTurns: leverage.scenarios[index]!.postTurns,
  }));
  const tightest = leverage.tightest ? covenants[leverage.tightest.index]! : null;

  // ---- interest coverage: what the operation earns against what the debt costs ---------------
  const askRateParsed = parseRate(input.request.rateAsk);
  const askCostRaw = askRateParsed ? effectiveAnnualCost(askRateParsed, input.indexLevels) : null;
  const askCost = askCostRaw !== null ? askCostRaw : stack.weightedCost;
  const interest = calculateInterestCoverage({
    ebitda: input.audited.ebitda,
    financialExpenses: input.audited.financialExpenses ? input.audited.financialExpenses : null,
    askAmount: leverage.largestAmount,
    askCost,
  });
  const coveragePost = interest.coveragePost;
  if (comparable(coveragePost) && compareFigures(coveragePost, "2") < 0) {
    findings.push({
      id: "thin-interest-coverage",
      severity: compareFigures(coveragePost, "1.5") < 0 ? "critical" : "high",
      pt: `Cobertura de juros de ${local(at(interest.coverage!, 1), "pt-BR")}x hoje e ${local(at(coveragePost, 1), "pt-BR")}x com a operação (juros do pedido a ${pctAA(askCost!)}${askCostRaw ? ", a taxa pedida" : ", o custo médio do estoque"}). Abaixo de 2x a operação consome a maior parte do que a companhia gera antes de amortizar um real; abaixo de 1,5x o serviço depende de refinanciamento contínuo.`,
      en: `Interest coverage of ${at(interest.coverage!, 1)}x today and ${at(coveragePost, 1)}x with the deal (the ask's interest at ${pctAA(askCost!, "en-US")}${askCostRaw ? ", the rate asked" : ", the stack's weighted cost"}). Under 2x the operation consumes most of what the company generates before amortising a real; under 1.5x service depends on continuous refinancing.`,
      values: {coverage: at(interest.coverage!, 4), coveragePost: at(coveragePost, 4), askCost: at(askCost!, 6)},
      inputs: ["historical_financials.ebitda", "historical_financials.financial_expenses", "transaction.requested_amount", "debt.instruments"],
    });
  }

  // Leverage over a negative EBITDA is a number with no meaning, and a covenant test on it is
  // a sentence with no meaning. The cash-burning company is read through its runway instead.
  let maxNewDebt: string | null = null;
  if (tightest && leverage.covenant) {
    const test = leverage.covenant;
    maxNewDebt = test.maxNewDebt;
    if (test.breached) {
      const worst = scenarios[test.worstScenario!]!;
      // Already above the ceiling before the deal is a different sentence from "the deal breaks
      // it": the first is a fact about the company today, and new money can only enter as a swap.
      findings.push({
        id: "covenant-breach-day-one",
        severity: "critical",
        pt: test.alreadyAbove
          ? `A companhia já está acima do covenant antes da operação: ${turns(leverage.preTurns)} contra o teto de ${turns(tightest.covenant.maximum)} (${tightest.lender}), excesso de ${brlM(test.excessNetDebt)} de dívida líquida. Não cabe dívida nova por cima do estoque; a operação só existe como troca de passivo (resgate de linhas dentro do tíquete) ou com renegociação do covenant, e a trajetória até a próxima medição é o que a mesa precisa mostrar.`
          : `A operação como solicitada rompe covenant existente no dia um: a alavancagem sai de ${turns(leverage.preTurns)} para ${turns(worst.postTurns)} contra o teto de ${turns(tightest.covenant.maximum)} (${tightest.lender}). Nos números atuais cabem ${brlM(test.roomForNewDebt)} de dívida nova antes do covenant, não ${brlM(worst.amount)}. Isso muda a natureza da operação: ou o pedido inclui quitação/renegociação das linhas com covenant, ou o tíquete cai, ou não há operação.`,
        en: test.alreadyAbove
          ? `The company is already above the covenant before the deal: ${turns(leverage.preTurns, "en-US")} against the ${turns(tightest.covenant.maximum, "en-US")} ceiling (${tightest.lender}), ${brlM(test.excessNetDebt, "en-US")} of net debt in excess. No new debt fits on top of the stock; the deal exists only as a liability swap (lines repaid inside the ticket) or with a renegotiated covenant, and the trajectory to the next test is what the desk has to show.`
          : `The transaction as asked breaches an existing covenant on day one: leverage moves from ${turns(leverage.preTurns, "en-US")} to ${turns(worst.postTurns, "en-US")} against the ${turns(tightest.covenant.maximum, "en-US")} ceiling (${tightest.lender}). The current numbers admit ${brlM(test.roomForNewDebt, "en-US")} of new debt before the covenant, not ${brlM(worst.amount, "en-US")}. That changes the nature of the deal: either the ask includes repaying or renegotiating the covenanted lines, or the ticket comes down, or there is no deal.`,
        values: {pre: at(leverage.preTurns, 4), post: worst.postTurns, ceiling: tightest.covenant.maximum, maxNewDebt: at(test.maxNewDebt, 2)},
        inputs: ["debt.covenants", "historical_financials.gross_debt", "historical_financials.cash", "historical_financials.ebitda", "transaction.requested_amount"],
      });
    }
  }

  const share = stack.maturingShare24;
  if (share !== null && compareFigures(share, "0.4") >= 0) {
    findings.push({
      id: "maturity-wall",
      severity: "high",
      pt: `${brlM(stack.maturingWithin24Months)} (${percentAt(share, 0)}% do mapa) vencem em até 24 meses. A operação disputa caixa com uma parede de refinanciamento, e o desenho tem que dizer o que acontece com essas linhas.`,
      en: `${brlM(stack.maturingWithin24Months, "en-US")} (${percentAt(share, 0)}% of the schedule) matures within 24 months. The transaction competes with a refinancing wall, and the structure has to say what happens to those lines.`,
      values: {maturing24: at(stack.maturingWithin24Months, 2), share: at(share, 4)},
      inputs: ["debt.instruments"],
    });
  }

  // ---- runway: the axis a venture lender actually reads ---------------------------------------
  //
  // Months of cash before the deal, months the ticket buys, and months it buys once it has to
  // pay its own interest out of the same cash. The third number is the honest one: a loan that
  // buys eight months and costs two of them back buys six, and the founder's letter will have
  // quoted the first figure.
  let runway: RunwayAnalysis | null = null;
  const venture = input.venture;
  if (venture?.monthlyBurn && compareFigures(venture.monthlyBurn, 0) > 0) {
    const ask = leverage.largestAmount;
    const askRate = parseRate(input.request.rateAsk);
    const askRateCost = askRate ? effectiveAnnualCost(askRate, input.indexLevels) : null;
    // Venture practice when the ask names no rate: CDI plus six, before the warrant, compounded.
    const assumedRate = askRateCost ? askRateCost : composeIndexAndSpread({index: "DI", annualIndex: cdi, annualSpread: "0.06"}).value;
    const run = calculateVentureRunway({
      cash: input.balance.cash,
      monthlyBurn: venture.monthlyBurn,
      ask,
      assumedRate,
      grossDebt: input.balance.grossDebt,
      arr: venture.arr ? venture.arr : null,
      statedRunwayMonths: venture.runwayMonthsStated ? venture.runwayMonthsStated : null,
    });
    runway = {
      monthlyBurn: at(venture.monthlyBurn, 2),
      cash: at(input.balance.cash, 2),
      monthsPre: at(run.monthsPre, 1),
      monthsPost: at(run.monthsPost, 1),
      monthsPostAfterService: ratioAt(run.monthsPostAfterService, 1),
      assumedRate: at(assumedRate, 6),
      arr: venture.arr ? at(venture.arr, 2) : null,
      debtToArr: run.debtToArr ? at(run.debtToArr, 4) : null,
      nrr: venture.nrr ? at(venture.nrr, 4) : null,
      topCustomerShare: venture.topCustomerShare ? at(venture.topCustomerShare, 4) : null,
    };
    const months = (value: string, locale: Locale = "pt-BR") => local(ratioAt(value, 1), locale);

    if (compareFigures(run.monthsPre, 12) < 0) {
      const underNine = compareFigures(run.monthsPre, 9) < 0;
      findings.push({
        id: "runway-short",
        severity: underNine ? "critical" : "high",
        pt: `Runway de ${months(run.monthsPre)} meses antes da operação (caixa de ${brlM(input.balance.cash)} sobre queima de ${brlM(venture.monthlyBurn)} por mês). ${underNine ? "Abaixo de nove meses não é venture debt, é ponte de equity: o credor entraria para financiar a própria saída." : "Abaixo de doze meses o credor vai exigir que a rodada esteja encaminhada antes do desembolso, não depois."}`,
        en: `Runway of ${months(run.monthsPre, "en-US")} months before the deal (${brlM(input.balance.cash, "en-US")} of cash over ${brlM(venture.monthlyBurn, "en-US")} of monthly burn). ${underNine ? "Under nine months this is not venture debt but an equity bridge: the lender would be funding its own exit." : "Under twelve months the lender will want the round in motion before disbursement, not after."}`,
        values: {monthsPre: at(run.monthsPre, 2), cash: at(input.balance.cash, 2), burn: at(venture.monthlyBurn, 2)},
        inputs: ["interim_financials.cash", "interim_financials.monthly_burn"],
      });
    }
    if (run.statedGap !== null && compareFigures(run.statedGap, "1.5") > 0) {
      const stated = venture.runwayMonthsStated!;
      findings.push({
        id: "runway-stated-vs-computed",
        severity: "high",
        pt: `A companhia declara ${at(stated, 0)} meses de runway; o caixa sobre a queima média dá ${months(run.monthsPre)}. A diferença é a queima escolhida (melhor mês contra média do trimestre), e o credor usa a média.`,
        en: `The company states ${at(stated, 0)} months of runway; cash over average burn gives ${months(run.monthsPre, "en-US")}. The difference is the burn chosen (best month versus quarterly average), and the lender uses the average.`,
        values: {stated: at(stated, 2), computed: at(run.monthsPre, 2)},
        inputs: ["company.runway_months", "interim_financials.cash", "interim_financials.monthly_burn"],
      });
    }
    if (compareFigures(ask, 0) > 0) {
      findings.push({
        id: "runway-bought",
        severity: "info",
        pt: `A captação de ${brlM(ask)} leva o runway de ${months(run.monthsPre)} para ${months(run.monthsPost)} meses antes do serviço, e para ${months(run.monthsPostAfterService)} com os juros pagos do mesmo caixa (${pctAA(assumedRate)} assumido${askRateCost ? ", a taxa pedida" : ", prática de venture debt quando o pedido não nomeia taxa"}). O que a operação compra é ${months(run.monthsBought)} meses, não ${months(run.monthsBoughtBeforeService)}.`,
        en: `The ${brlM(ask, "en-US")} raise takes runway from ${months(run.monthsPre, "en-US")} to ${months(run.monthsPost, "en-US")} months before service, and to ${months(run.monthsPostAfterService, "en-US")} with interest paid from the same cash (${pctAA(assumedRate, "en-US")} assumed${askRateCost ? ", the rate asked" : ", venture-debt practice when the ask names no rate"}). What the deal buys is ${months(run.monthsBought, "en-US")} months, not ${months(run.monthsBoughtBeforeService, "en-US")}.`,
        values: {monthsPre: at(run.monthsPre, 2), monthsPost: at(run.monthsPost, 2), monthsPostAfterService: ratioAt(run.monthsPostAfterService, 2), assumedRate: at(assumedRate, 6)},
        inputs: ["transaction.requested_amount", "interim_financials.cash", "interim_financials.monthly_burn"],
      });
    }
    if (run.debtToArr !== null && compareFigures(run.debtToArr, "0.35") > 0) {
      findings.push({
        id: "debt-to-arr",
        severity: "high",
        pt: `Dívida total pós-operação de ${brlM(run.debtAfterRaise)} sobre ARR de ${brlM(venture.arr!)}: ${percentAt(run.debtToArr, 0)}% do ARR. A prática de venture debt fica entre 20% e 35%; acima disso o credor está financiando a queima, não a tração.`,
        en: `Total post-deal debt of ${brlM(run.debtAfterRaise, "en-US")} over ARR of ${brlM(venture.arr!, "en-US")}: ${percentAt(run.debtToArr, 0)}% of ARR. Venture practice sits between 20% and 35%; above that the lender is funding burn, not traction.`,
        values: {debtToArr: at(run.debtToArr, 4), arr: at(venture.arr!, 2), debtPost: at(run.debtAfterRaise, 2)},
        inputs: ["interim_financials.arr", "debt.total_gross", "transaction.requested_amount"],
      });
    }
    if (venture.nrr && compareFigures(venture.nrr, 1) < 0) {
      findings.push({
        id: "nrr-below-par",
        severity: "high",
        pt: `Retenção líquida de receita de ${percentAt(venture.nrr, 0)}%: a base encolhe sem venda nova. Em venture debt a base é a garantia; abaixo de 100% o credor precifica churn, não crescimento.`,
        en: `Net revenue retention of ${percentAt(venture.nrr, 0)}%: the base shrinks without new sales. In venture debt the base is the collateral; under 100% the lender prices churn, not growth.`,
        values: {nrr: at(venture.nrr, 4)},
        inputs: ["company.net_revenue_retention"],
      });
    }
    if (venture.topCustomerShare && compareFigures(venture.topCustomerShare, "0.20") > 0) {
      findings.push({
        id: "customer-concentration",
        severity: "high",
        pt: `O maior cliente responde por ${percentAt(venture.topCustomerShare, 0)}% do MRR. Acima de 20% a perda de um contrato move o runway em meses, e o credor vai pedir o contrato e uma cláusula de vencimento antecipado ligada a ele.`,
        en: `The largest customer is ${percentAt(venture.topCustomerShare, 0)}% of MRR. Above 20% losing one contract moves runway by months, and the lender will ask for the contract and an acceleration clause tied to it.`,
        values: {topCustomerShare: at(venture.topCustomerShare, 4)},
        inputs: ["customers.top_customers.1.share_pct"],
      });
    }
  }

  // ---- working capital: the cycle and what growth absorbs -------------------------------------
  const workingCapitalAsk = input.request.workingCapitalAsk ? input.request.workingCapitalAsk : null;
  const cycle = calculateWorkingCapitalCycle({
    revenue: input.audited.revenue,
    receivables: input.balance.receivables,
    cogs: input.audited.cogs ? input.audited.cogs : null,
    inventory: input.balance.inventory ? input.balance.inventory : null,
    suppliers: input.balance.suppliers ? input.balance.suppliers : null,
    nextYearRevenue: input.projectedNextYear ? input.projectedNextYear.revenue : null,
    workingCapitalAsk,
  });
  if (cycle.askExceedsTwiceNeed) {
    findings.push({
      id: "wc-ask-vs-need",
      severity: "high",
      pt: `O crescimento projetado (${brlM(cycle.growth!)} de receita) absorve ${brlM(cycle.growthAbsorption!)} de capital de giro ao ciclo atual de ${ratioAt(cycle.cycleDays!, 0)} dias, mas o pedido rotula ${brlM(workingCapitalAsk!)} como giro, ${local(ratioAt(cycle.askOverNeed!, 1), "pt-BR")} vezes a necessidade incremental. A diferença financia outra coisa (alongamento de ciclo, recomposição de caixa ou substituição de linhas), e a mesa precisa nomear o quê, porque o fundo vai perguntar.`,
      en: `Projected growth (${brlM(cycle.growth!, "en-US")} of revenue) absorbs ${brlM(cycle.growthAbsorption!, "en-US")} of working capital at the current ${ratioAt(cycle.cycleDays!, 0)}-day cycle, yet the ask labels ${brlM(workingCapitalAsk!, "en-US")} as working capital, ${ratioAt(cycle.askOverNeed!, 1)} times the incremental need. The difference funds something else, and the desk has to name it, because the fund will ask.`,
      values: {need: at(cycle.growthAbsorption!, 2), ask: at(workingCapitalAsk!, 2), cycleDays: ratioAt(cycle.cycleDays!, 1)},
      inputs: ["projections.revenue", "historical_financials.revenue", "transaction.use_of_proceeds"],
    });
  }

  // ---- encumbrance: how free is the asset being offered ---------------------------------------
  const receivablesBase = input.interim?.receivables ?? input.balance.receivables;
  const encumbrance = calculateReceivablesEncumbrance({
    base: receivablesBase,
    lines: input.debt.map((line) => ({balance: line.balance, coverage: parseReceivablesCoverage(line.collateral), cession: isReceivablesCession(line.collateral)})),
    workingCapitalAsk,
  });
  const askAgainstFree = encumbrance.askAgainstFree;
  if (askAgainstFree !== null && compareFigures(askAgainstFree, "0.8") >= 0) {
    findings.push({
      id: "receivables-encumbrance",
      severity: "high",
      pt: `Dos ${brlM(receivablesBase)} de recebíveis, ${brlM(encumbrance.encumbered)} já estão comprometidos com as linhas atuais (coberturas de 125% a 130% e cessões). Sobram ${brlM(encumbrance.free)} livres, e o pedido de giro de ${brlM(workingCapitalAsk!)} consome ${percentAt(askAgainstFree, 0)}% disso. Garantia para dinheiro novo é escassa, e qualquer estrutura vai disputar colateral com os bancos incumbentes.`,
      en: `Of ${brlM(receivablesBase, "en-US")} in receivables, ${brlM(encumbrance.encumbered, "en-US")} is already committed to the current lines (125% to 130% coverages and cessions). ${brlM(encumbrance.free, "en-US")} remains free, and the ${brlM(workingCapitalAsk!, "en-US")} working-capital ask consumes ${percentAt(askAgainstFree, 0)}% of it. Collateral for new money is scarce, and any structure will compete with incumbent banks for it.`,
      values: {base: at(receivablesBase, 2), encumbered: at(encumbrance.encumbered, 2), free: at(encumbrance.free, 2), askShare: at(askAgainstFree, 4)},
      inputs: ["debt.instruments", "interim_financials.receivables"],
    });
  }

  // ---- the ask against the room's own numbers -------------------------------------------------
  if (new Set(scenarios.map((scenario) => scenario.amount)).size > 1) {
    const described = (locale: Locale) => input.request.amounts.map((a) => `${brlM(a.value, locale)} (${a.source})`).join(locale === "pt-BR" ? " e " : " and ");
    findings.push({
      id: "amount-divergence",
      severity: "high",
      pt: `A sala pede dois valores diferentes: ${described("pt-BR")}. Nenhuma fonte manda na outra; é pergunta para a empresa antes de qualquer material ir a mercado.`,
      en: `The room asks for two different amounts: ${described("en-US")}. Neither source outranks the other; it is a question for the company before any material goes to market.`,
      values: Object.fromEntries(scenarios.map((scenario, i) => [`amount_${i + 1}`, scenario.amount])),
      inputs: ["transaction.requested_amount"],
    });
  }

  const rateAsk = parseRate(input.request.rateAsk);
  const rateAskAnnual = rateAsk ? effectiveAnnualCost(rateAsk, input.indexLevels) : null;
  if (rateAskAnnual && stack.weightedCost !== null && tightest) {
    const test = testRateAskAgainstStack({askRate: rateAskAnnual, stackCost: stack.weightedCost, tolerance: "0.005"});
    if (test.atOrBelowStack && leverage.worstPostAbovePre) {
      findings.push({
        id: "rate-ask-vs-stack",
        severity: "high",
        pt: `A empresa pede ${pctAA(rateAskAnnual)} (com CDI a ${pctAA(cdi)}) para dinheiro novo que leva a alavancagem a ${turns(leverage.worstPostTurns)}, enquanto o stack atual, contratado à alavancagem menor de ${turns(leverage.preTurns)}, já custa ${pctAA(stack.weightedCost)} na média. Dinheiro novo, mais alavancado e mais junior não sai mais barato que o estoque; a expectativa de taxa precisa ser recalibrada antes da conversa com fundos.`,
        en: `The company asks ${pctAA(rateAskAnnual, "en-US")} (CDI at ${pctAA(cdi, "en-US")}) for new money that takes leverage to ${turns(leverage.worstPostTurns, "en-US")}, while the current stack, written at the lower leverage of ${turns(leverage.preTurns, "en-US")}, already averages ${pctAA(stack.weightedCost, "en-US")} Newer, more levered, more junior money does not price below the stock; the rate expectation needs recalibrating before any fund conversation.`,
        values: {ask: rateAskAnnual, stackAverage: at(stack.weightedCost, 6), postTurns: ratioAt(leverage.worstPostTurns, 4)},
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
    assumptions: {cdi: at(cdi, 6), referenceDate: input.referenceDate},
    stack: {
      lines,
      totalSchedule: at(stack.totalSchedule, 2),
      totalOnBalance: at(stack.totalOnBalance, 2),
      scheduleGap: at(stack.scheduleGap, 2),
      weightedCost: stack.weightedCost !== null ? at(stack.weightedCost, 6) : null,
      weightedSpreadOverCdi: weightedSpread !== null ? at(weightedSpread, 6) : null,
      unpriceableLines: unpriceable.length,
      maturingWithin24Months: at(stack.maturingWithin24Months, 2),
      maturingWithin12Months: at(stack.maturingWithin12Months, 2),
      liquidityCoverage12: coverage12 !== null ? at(coverage12, 4) : null,
    },
    leverage: {
      netDebtPre: at(leverage.netDebt, 2),
      ebitda: at(input.audited.ebitda, 2),
      preTurns: ratioAt(leverage.preTurns, 4),
      scenarios,
      tightestCovenant: tightest ? {lender: tightest.lender, maximum: tightest.covenant.maximum} : null,
      maxNewDebtUnderCovenants: maxNewDebt !== null ? at(maxNewDebt, 2) : null,
      interestCoverage: interest.coverage !== null ? at(interest.coverage, 4) : null,
      interestCoveragePost: coveragePost !== null ? ratioAt(coveragePost, 4) : null,
    },
    workingCapital: {
      dso: cycle.dso !== null ? ratioAt(cycle.dso, 1) : null,
      dio: cycle.dio !== null ? ratioAt(cycle.dio, 1) : null,
      dpo: cycle.dpo !== null ? ratioAt(cycle.dpo, 1) : null,
      cycleDays: cycle.cycleDays !== null ? ratioAt(cycle.cycleDays, 1) : null,
      growthAbsorption: cycle.growthAbsorption !== null ? ratioAt(cycle.growthAbsorption, 2) : null,
    },
    encumbrance: {
      receivablesBase: at(receivablesBase, 2),
      encumbered: at(encumbrance.encumbered, 2),
      free: at(encumbrance.free, 2),
      askAgainstFree: askAgainstFree !== null ? at(askAgainstFree, 4) : null,
    },
    profile: leverage.profile,
    runway,
    findings,
  };
}
