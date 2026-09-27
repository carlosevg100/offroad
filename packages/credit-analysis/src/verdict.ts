/**
 * What structure is supportable by the available evidence and market constraints?
 *
 * This is the sentence the product exists to produce. Everything before it describes the
 * company; this tests the requested structure. It is deliberately not a score, credit opinion
 * or recommendation to lend: it says whether the structure on the table is supportable under
 * the company's own constraints,
 * what it has to carry to survive them, what it fixes, what it leaves untouched, and what the
 * second road would look like.
 *
 * Two rules of tone, both learned by getting them wrong. A finding never says an operation
 * "does not solve" something when the company has no cash to solve it otherwise: terming a
 * maturity out is a solution, it costs spread and security, and the desk's job is to price
 * both roads rather than to prefer one. The analysis never hides behind a caveat: if the
 * covenant is already breached, the operation does not exist without a waiver, and that
 * belongs in the first line and not in a footnote.
 */

import {
  calculateEnlargedTicket,
  calculateLeverageAfterStructure,
  calculateNetNewMoney,
  calculateSpreadDifference,
  compareFigures,
  presentationAmount,
  presentationFigure,
  selectHeaviestScheduleYear,
  testCovenantCeiling,
  type DecimalInput,
} from "@offroad/financial-core";

import type {DeskAnalysis} from "./analyze";
import type {Trajectory} from "./trajectory";

export type Operation = {
  amount: string;
  termMonths: number;
  graceMonths: number;
  /** How the company describes the paper: "CRA lastreado em recebíveis do agro". */
  instrument: string;
  /** How much of the ticket redeems existing debt at disbursement. */
  refinancing?: string;
  /** What the company says the money is for, in its own words. */
  purpose?: string;
};

export type VerdictStanding = "stands" | "stands_with_conditions" | "does_not_stand";

export type VerdictNote = {id: string; pt: string; en: string};

/** What a structure costs in the market, as the caller's price reference computes it. */
export type StructurePrice = {bps: {min: number; max: number}; allIn: {min: string; max: string}};

export type AlternativeStructure = {
  id: string;
  amount: string;
  termMonths: number;
  graceMonths: number;
  why: {pt: string; en: string};
  tradeoff: {pt: string; en: string};
  price: StructurePrice | null;
};

export type OperationVerdict = {
  standing: VerdictStanding;
  headline: {pt: string; en: string};
  /** What has to be true for the operation to exist at all. */
  conditions: VerdictNote[];
  /** What the money changes, stated as before and after. */
  solves: VerdictNote[];
  /** What it deliberately does not touch, so nobody discovers it later. */
  leaves: VerdictNote[];
  alternatives: AlternativeStructure[];
  /** What the proposed structure costs, when a price reference was supplied. */
  price: StructurePrice | null;
};

// Every figure the verdict states or compares is a financial-core kernel: the net new money, the
// enlarged ticket, the leverage after a structure, the covenant test, the heaviest schedule year
// and the conversions to amounts, multiples, percent and basis points, all on the decimal value.
// Each language prints the same figures with its own separators (invariant 9).
type Locale = "pt-BR" | "en-US";
const local = (figure: string, locale: Locale) => (locale === "pt-BR" ? figure.replace(".", ",") : figure);
const brlM = (value: DecimalInput, locale: Locale = "pt-BR"): string => presentationAmount({value, locale, style: "abbreviated"}).text;
const turns = (value: DecimalInput, locale: Locale = "pt-BR"): string => `${local(presentationFigure({value, decimals: 2}).value, locale)}x`;
const months = (count: number) => `${count} meses`;
const bpsAsPercent = (bps: DecimalInput, locale: Locale = "pt-BR"): string => local(presentationFigure({value: bps, scale: "basis_points_as_percent", decimals: 2}).value, locale);
const spreadGap = (spreadBps: number, referenceBps: number, locale: Locale = "pt-BR"): string => bpsAsPercent(calculateSpreadDifference({spreadBps, referenceBps}).value, locale);
/** Two decimals, as the verdict's amounts are stated in the alternatives it hands on. */
const cents = (value: DecimalInput): string => presentationFigure({value, decimals: 2}).value;
const isPositive = (value: DecimalInput) => compareFigures(value, 0) > 0;

export function judgeOperation(input: {
  desk: DeskAnalysis;
  trajectory: Trajectory | null;
  operation: Operation;
  /**
   * The market's price for a structure, injected by the caller.
   *
   * It is a function rather than a number because the second road has to be priced too: an
   * alternative whose advantage is described as "better price" and never says how much better
   * is an opinion, and a committee cannot choose between two opinions.
   */
  priceFor?: (structure: {amount: string; termMonths: number; leveragePost: string}) => StructurePrice | null;
  /**
   * Re-runs the trajectory for a structure the company did not ask for.
   *
   * Without it an alternative is priced on the same numbers as the proposal and comes out at
   * the same spread, which is worse than saying nothing: it presents a real choice as a
   * non-choice. A bigger ticket that also clears a later maturity is still a liability swap on
   * day one, so what actually differs is the peak of the trajectory, and only re-running it
   * shows that.
   */
  simulate?: (structure: {amount: string; termMonths: number; graceMonths: number; refinancing: string}) => Trajectory | null;
}): OperationVerdict {
  const {desk, trajectory, operation} = input;
  const priceFor = input.priceFor ?? (() => null);
  // Leverage after this structure lands: the stack plus what the ticket does not repay, at the four
  // decimals the price reference reads. Null over a zero EBITDA, where there is no leverage to price.
  const leverageAfter = (ticket: DecimalInput, redeemed: DecimalInput) =>
    calculateLeverageAfterStructure({netDebt: desk.leverage.netDebtPre, ticket, redeemed, ebitda: desk.leverage.ebitda, decimals: 4}).value;
  const simulate = input.simulate ?? (() => null);
  const peakOf = (result: Trajectory | null) => result?.peak?.leverageStressed ?? null;
  const fourDecimals = (value: DecimalInput) => presentationFigure({value, decimals: 4}).value;
  /**
   * Prices a structure at the leverage it leaves: the stressed peak of its trajectory when there is
   * one, the leverage after the structure otherwise. A trajectory whose peak is absent (a year's
   * leverage in the cut case over a zero EBITDA) leaves no leverage to price, so there is no price.
   */
  const priceAt = (structure: {amount: string; termMonths: number}, run: Trajectory | null, leverage: () => string | null) => {
    if (run && !run.peak) return null;
    const peak = peakOf(run);
    const leveragePost = peak !== null ? fourDecimals(peak) : leverage();
    return leveragePost === null ? null : priceFor({...structure, leveragePost});
  };
  const amount = operation.amount;
  const refinancing = operation.refinancing ?? "0";
  const price = priceAt({amount, termMonths: operation.termMonths}, trajectory, () => leverageAfter(amount, refinancing));
  const spread = (value: StructurePrice | null, locale: Locale = "pt-BR") =>
    value ? `CDI + ${bpsAsPercent(value.bps.min, locale)}% ${locale === "pt-BR" ? "a" : "to"} ${bpsAsPercent(value.bps.max, locale)}%` : null;
  const conditions: VerdictNote[] = [];
  const solves: VerdictNote[] = [];
  const leaves: VerdictNote[] = [];
  const alternatives: AlternativeStructure[] = [];

  const netNewMoney = calculateNetNewMoney({ticket: amount, refinancing}).value;
  const pre = desk.leverage.preTurns;
  const covenant = desk.leverage.tightestCovenant;

  // ---- what has to be true for the operation to exist ----------------------------------------
  // An absent leverage (over a zero EBITDA) is not computable and never compared with the ceiling.
  if (covenant && pre !== null && testCovenantCeiling({leverage: pre, ceiling: covenant.maximum}).outcome === "above_ceiling") {
    conditions.push({
      id: "waiver-before-anything",
      pt: `A companhia está em ${turns(pre)} contra o teto de ${turns(covenant.maximum)} (${covenant.lender}). Nenhuma dívida nova é contratável antes de um waiver ou da renegociação desse covenant. Esta é a primeira condição precedente da estrutura indicativa. ${isPositive(netNewMoney) ? `Os ${brlM(netNewMoney)} de dinheiro novo dependem dela; a parte de troca de passivo, ${brlM(refinancing)}, é discutível com os credores atuais como alongamento.` : `Por ser troca pura de passivo, a conversa com os credores atuais é de alongamento e não de dívida nova, o que é o argumento mais forte para o waiver.`}`,
      en: `The company sits at ${turns(pre, "en-US")} against a ${turns(covenant.maximum, "en-US")} ceiling (${covenant.lender}). No new debt is contractable before a waiver or a renegotiation of that covenant, and this is not a caveat: it is the operation's first condition precedent. ${isPositive(netNewMoney) ? `The ${brlM(netNewMoney, "en-US")} of new money depends on it; the ${brlM(refinancing, "en-US")} liability swap is arguable with the existing lenders as a maturity extension.` : `Being a pure liability swap, the conversation with existing lenders is about extension rather than new debt, which is the strongest argument for the waiver.`}`,
    });
  }

  const wall12 = desk.stack.maturingWithin12Months;
  const coverage = desk.stack.liquidityCoverage12;
  if (coverage && compareFigures(coverage, "1.3") < 0 && compareFigures(refinancing, wall12) < 0) {
    conditions.push({
      id: "near-wall-not-fully-covered",
      pt: `O tíquete resgata ${brlM(refinancing)} dos ${brlM(wall12)} que vencem em 12 meses, e o que sobra depende de caixa que cobre ${turns(coverage)} do total. A operação precisa vir com a renovação já acertada das parcelas remanescentes, ou com tíquete maior.`,
      en: `The ticket redeems ${brlM(refinancing, "en-US")} of the ${brlM(wall12, "en-US")} due within 12 months, and the remainder depends on cash covering ${turns(coverage, "en-US")} of the total. The operation needs the rollover of the remaining parcels already agreed, or a larger ticket.`,
    });
  }

  // ---- what the money buys -------------------------------------------------------------------
  if (isPositive(refinancing) && trajectory) {
    const first = trajectory.years[0];
    if (first) {
      solves.push({
        id: "near-wall-termed-out",
        pt: `Os ${brlM(refinancing)} resgatam as parcelas mais próximas no desembolso: o principal a vencer em ${first.year} cai para ${brlM(first.principalDue)}, e o que era exigência de caixa vira ${months(operation.graceMonths)} de carência e ${months(operation.termMonths)} de prazo.`,
        en: `The ${brlM(refinancing, "en-US")} redeems the nearest parcels at disbursement: principal falling due in ${first.year} drops to ${brlM(first.principalDue, "en-US")}, and what was a cash demand becomes ${operation.graceMonths} months of grace over a ${operation.termMonths}-month tenor.`,
      });
    }
  }
  if (isPositive(netNewMoney)) {
    solves.push({
      id: "new-money",
      pt: `${brlM(netNewMoney)} entram como dinheiro novo${operation.purpose ? ` para ${operation.purpose}` : ""}.`,
      en: `${brlM(netNewMoney, "en-US")} lands as new money${operation.purpose ? ` for ${operation.purpose}` : ""}.`,
    });
  }

  // ---- what it leaves, and the second road ---------------------------------------------------
  const heaviest = trajectory ? selectHeaviestScheduleYear({years: trajectory.years.map((year) => ({id: String(year.year), strain: year.scheduleStrain})), threshold: 1}) : null;
  const worst = heaviest?.id ? trajectory!.years.find((year) => String(year.year) === heaviest.id) : undefined;
  if (worst) {
    // The heaviest year is ranked among the strains that are numbers, so its strain is one.
    const strain = presentationFigure({value: worst.scheduleStrain!, scale: "percent", decimals: 0}).value;
    leaves.push({
      id: "later-wall-untouched",
      pt: `${worst.year} continua exigindo ${brlM(worst.principalDue)} de amortização, ${strain}% do EBITDA daquele ano. Esta operação não passa por lá, e esse ano será rolado de novo.`,
      en: `${worst.year} still demands ${brlM(worst.principalDue, "en-US")} of amortisation, ${strain}% of that year's EBITDA. This operation does not reach it, and that year will be rolled again.`,
    });
    const bigger = calculateEnlargedTicket({ticket: amount, refinancing, principalDue: worst.principalDue});
    const biggerRun = simulate({amount: cents(bigger.ticket), termMonths: operation.termMonths, graceMonths: operation.graceMonths, refinancing: cents(bigger.refinancing)});
    const biggerPeak = peakOf(biggerRun);
    const biggerPrice = priceAt({amount: cents(bigger.ticket), termMonths: operation.termMonths}, biggerRun, () => leverageAfter(bigger.ticket, bigger.refinancing));
    const ownPeak = peakOf(trajectory);
    const biggerTradeoff = {
      pt: `${biggerPeak && ownPeak ? `O pico de alavancagem vai de ${turns(ownPeak)} para ${turns(biggerPeak)}` : "Custa alavancagem de pico mais alta"} e o livro fica maior.${biggerPrice && price ? ` No preço: ${spread(biggerPrice)} contra ${spread(price)} da estrutura pedida${biggerPrice.bps.min === price.bps.min ? ", o mesmo spread, porque em ambas o dinheiro novo é zero e o que muda é o prazo do passivo" : `, ${spreadGap(biggerPrice.bps.min, price.bps.min)} ponto percentual na ponta baixa`}.` : ""}`,
      en: `${biggerPeak && ownPeak ? `Peak leverage moves from ${turns(ownPeak, "en-US")} to ${turns(biggerPeak, "en-US")}` : "It costs a higher peak leverage"} and the book grows.${biggerPrice && price ? ` On price: ${spread(biggerPrice, "en-US")} against ${spread(price, "en-US")} for the requested structure${biggerPrice.bps.min === price.bps.min ? ", the same spread, because in both the new money is zero and what changes is the maturity of the liability" : `, ${spreadGap(biggerPrice.bps.min, price.bps.min, "en-US")} percentage point at the low end`}.` : ""}`,
    };
    alternatives.push({
      id: "size-to-cover-the-later-wall",
      amount: cents(bigger.ticket),
      termMonths: operation.termMonths,
      graceMonths: operation.graceMonths,
      why: {
        pt: `Um tíquete de ${brlM(bigger.ticket)} resolve ${worst.year} junto com a janela curta, e a companhia deixa de voltar ao mercado no pior ano do cronograma.`,
        en: `A ${brlM(bigger.ticket, "en-US")} ticket clears ${worst.year} together with the near window, and the company stops returning to market in the worst year of its schedule.`,
      },
      tradeoff: biggerTradeoff,
      price: biggerPrice,
    });
  }

  // A shorter, cheaper road is worth naming whenever the ask is long for private credit.
  if (operation.termMonths > 72) {
    // Priced at the leverage the requested ticket leaves, as the requested structure is when it has no trajectory.
    const shorterPrice = () => priceAt({amount, termMonths: 60}, null, () => leverageAfter(amount, refinancing));
    alternatives.push({
      id: "shorter-cheaper",
      amount: operation.amount,
      termMonths: 60,
      graceMonths: Math.min(operation.graceMonths, 12),
      why: {
        pt: `Prazo de 60 meses com até 12 de carência é onde o crédito privado brasileiro tem livro de verdade; ${months(operation.termMonths)} restringe a lista de investidores e cobra prêmio por isso.`,
        en: `A 60-month tenor with up to 12 of grace is where Brazilian private credit has a real book; ${operation.termMonths} months narrows the investor list and is charged a premium for it.`,
      },
      tradeoff: {
        pt: `Amortiza mais cedo, então exige geração de caixa antes.${(() => {
          const shorter = shorterPrice();
          return shorter && price
            ? ` No preço: ${spread(shorter)} contra ${spread(price)}, ${spreadGap(price.bps.min, shorter.bps.min)} ponto percentual economizado ao encurtar.`
            : " Em troca sai mais barato e com menos condições.";
        })()}`,
        en: `It amortises earlier, so it demands cash generation sooner.${(() => {
          const shorter = shorterPrice();
          return shorter && price
            ? ` On price: ${spread(shorter, "en-US")} against ${spread(price, "en-US")}, ${spreadGap(price.bps.min, shorter.bps.min, "en-US")} percentage point saved by shortening.`
            : " In exchange it prices tighter and carries fewer conditions.";
        })()}`,
      },
      price: shorterPrice(),
    });
  }

  const standing: VerdictStanding = conditions.some((condition) => condition.id === "waiver-before-anything")
    ? "stands_with_conditions"
    : conditions.length > 0
      ? "stands_with_conditions"
      : solves.length > 0
        ? "stands"
        : "does_not_stand";

  const headline = {
    pt: standing === "stands"
      ? `As evidências e premissas analisadas suportam, de forma indicativa, a estrutura de ${brlM(amount)} em ${months(operation.termMonths)} com ${months(operation.graceMonths)} de carência, ${operation.instrument}.`
      : standing === "stands_with_conditions"
        ? `As evidências e premissas analisadas suportam a estrutura de ${brlM(amount)} em ${months(operation.termMonths)} com ${months(operation.graceMonths)} de carência, ${operation.instrument}, com os ajustes e condições indicativas descritos abaixo.`
        : `As evidências disponíveis não suportam a configuração solicitada. As alternativas abaixo preservam o objetivo econômico sempre que possível.`,
    en: standing === "stands"
      ? `The evidence and assumptions analyzed indicatively support a ${brlM(amount, "en-US")} structure over ${operation.termMonths} months with ${operation.graceMonths} of grace, ${operation.instrument}.`
      : standing === "stands_with_conditions"
        ? `The evidence and assumptions analyzed support a ${brlM(amount, "en-US")} structure over ${operation.termMonths} months with ${operation.graceMonths} of grace, ${operation.instrument}, with the indicative adjustments and conditions described below.`
        : `The available evidence does not support the requested configuration. The alternatives below preserve the economic objective wherever possible.`,
  };

  if (price) {
    solves.push({
      id: "price",
      pt: `No mercado de hoje esta estrutura sai a ${spread(price)} ao ano, e é contra essa faixa que o investidor compara o risco descrito acima.`,
      en: `In today's market this structure prices at ${spread(price, "en-US")} per year, and that is the band against which an investor weighs the risk described above.`,
    });
  }

  return {standing, headline, conditions, solves, leaves, alternatives, price};
}
