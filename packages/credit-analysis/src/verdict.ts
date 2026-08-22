/**
 * Does the operation the company asked for stand up?
 *
 * This is the sentence the product exists to produce. Everything before it describes the
 * company; this judges the deal. It is deliberately not a score and not a recommendation to
 * lend: it says whether the structure on the table survives the company's own constraints,
 * what it has to carry to survive them, what it fixes, what it leaves untouched, and what the
 * second road would look like.
 *
 * Two rules of tone, both learned by getting them wrong. A finding never says an operation
 * "does not solve" something when the company has no cash to solve it otherwise: terming a
 * maturity out is a solution, it costs spread and security, and the desk's job is to price
 * both roads rather than to prefer one. And a verdict never hides behind a caveat: if the
 * covenant is already breached, the operation does not exist without a waiver, and that
 * belongs in the first line and not in a footnote.
 */

import Decimal from "decimal.js";

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

const d = (value: string | number): Decimal => new Decimal(value);
const brlM = (value: Decimal.Value): string => `R$ ${new Decimal(value).div(1_000_000).toFixed(1).replace(".", ",")}M`;
const turns = (value: Decimal.Value): string => `${new Decimal(value).toFixed(2).replace(".", ",")}x`;
const months = (count: number) => `${count} meses`;

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
  // Leverage after this structure lands: the stack plus what the ticket does not repay.
  const leverageAfter = (ticket: Decimal, redeemed: Decimal) =>
    d(desk.leverage.netDebtPre).plus(ticket.minus(redeemed)).div(desk.leverage.ebitda).toFixed(4);
  const simulate = input.simulate ?? (() => null);
  const peakOf = (result: Trajectory | null) => (result ? d(result.peak.leverageStressed) : null);
  const price = priceFor({
    amount: operation.amount,
    termMonths: operation.termMonths,
    leveragePost: (peakOf(trajectory) ?? d(leverageAfter(d(operation.amount), d(operation.refinancing ?? "0")))).toFixed(4),
  });
  const spread = (value: StructurePrice | null) =>
    value ? `CDI + ${(value.bps.min / 100).toFixed(2).replace(".", ",")}% a ${(value.bps.max / 100).toFixed(2).replace(".", ",")}%` : null;
  const conditions: VerdictNote[] = [];
  const solves: VerdictNote[] = [];
  const leaves: VerdictNote[] = [];
  const alternatives: AlternativeStructure[] = [];

  const amount = d(operation.amount);
  const refinancing = d(operation.refinancing ?? "0");
  const netNewMoney = amount.minus(refinancing);
  const pre = d(desk.leverage.preTurns);
  const covenant = desk.leverage.tightestCovenant;

  // ---- what has to be true for the operation to exist ----------------------------------------
  if (covenant && pre.gt(covenant.maximum)) {
    const excess = pre.minus(covenant.maximum);
    conditions.push({
      id: "waiver-before-anything",
      pt: `A companhia está em ${turns(pre)} contra o teto de ${turns(covenant.maximum)} (${covenant.lender}). Nenhuma dívida nova é contratável antes de um waiver ou da renegociação desse covenant, e isso não é ressalva do parecer: é a primeira condição precedente da operação. ${netNewMoney.gt(0) ? `Os ${brlM(netNewMoney)} de dinheiro novo dependem dela; a parte de troca de passivo, ${brlM(refinancing)}, é discutível com os credores atuais como alongamento.` : `Por ser troca pura de passivo, a conversa com os credores atuais é de alongamento e não de dívida nova, o que é o argumento mais forte para o waiver.`}`,
      en: `The company sits at ${turns(pre)} against a ${turns(covenant.maximum)} ceiling (${covenant.lender}). No new debt is contractable before a waiver or a renegotiation of that covenant, and this is not a caveat: it is the operation's first condition precedent. ${netNewMoney.gt(0) ? `The ${brlM(netNewMoney)} of new money depends on it; the ${brlM(refinancing)} liability swap is arguable with the existing lenders as a maturity extension.` : `Being a pure liability swap, the conversation with existing lenders is about extension rather than new debt, which is the strongest argument for the waiver.`}`,
    });
    void excess;
  }

  const wall12 = d(desk.stack.maturingWithin12Months);
  const coverage = desk.stack.liquidityCoverage12 ? d(desk.stack.liquidityCoverage12) : null;
  if (coverage && coverage.lt("1.3") && refinancing.lt(wall12)) {
    conditions.push({
      id: "near-wall-not-fully-covered",
      pt: `O tíquete resgata ${brlM(refinancing)} dos ${brlM(wall12)} que vencem em 12 meses, e o que sobra depende de caixa que cobre ${turns(coverage)} do total. A operação precisa vir com a renovação já acertada das parcelas remanescentes, ou com tíquete maior.`,
      en: `The ticket redeems ${brlM(refinancing)} of the ${brlM(wall12)} due within twelve months, and the remainder depends on cash covering ${turns(coverage)} of the total. The operation needs the rollover of the remaining parcels already agreed, or a larger ticket.`,
    });
  }

  // ---- what the money buys -------------------------------------------------------------------
  if (refinancing.gt(0) && trajectory) {
    const first = trajectory.years[0];
    if (first) {
      solves.push({
        id: "near-wall-termed-out",
        pt: `Os ${brlM(refinancing)} resgatam as parcelas mais próximas no desembolso: o principal a vencer em ${first.year} cai para ${brlM(first.principalDue)}, e o que era exigência de caixa vira ${months(operation.graceMonths)} de carência e ${months(operation.termMonths)} de prazo.`,
        en: `The ${brlM(refinancing)} redeems the nearest parcels at disbursement: principal falling due in ${first.year} drops to ${brlM(first.principalDue)}, and what was a cash demand becomes ${operation.graceMonths} months of grace over a ${operation.termMonths}-month tenor.`,
      });
    }
  }
  if (netNewMoney.gt(0)) {
    solves.push({
      id: "new-money",
      pt: `${brlM(netNewMoney)} entram como dinheiro novo${operation.purpose ? ` para ${operation.purpose}` : ""}.`,
      en: `${brlM(netNewMoney)} lands as new money${operation.purpose ? ` for ${operation.purpose}` : ""}.`,
    });
  }

  // ---- what it leaves, and the second road ---------------------------------------------------
  const heavy = trajectory?.years.filter((year) => d(year.scheduleStrain).gt(1)) ?? [];
  const worst = heavy.sort((a, b) => d(b.scheduleStrain).minus(a.scheduleStrain).toNumber())[0];
  if (worst) {
    leaves.push({
      id: "later-wall-untouched",
      pt: `${worst.year} continua exigindo ${brlM(worst.principalDue)} de amortização, ${d(worst.scheduleStrain).times(100).toFixed(0)}% do EBITDA daquele ano. Esta operação não passa por lá, e esse ano será rolado de novo.`,
      en: `${worst.year} still demands ${brlM(worst.principalDue)} of amortisation, ${d(worst.scheduleStrain).times(100).toFixed(0)}% of that year's EBITDA. This operation does not reach it, and that year will be rolled again.`,
    });
    const biggerTicket = amount.plus(worst.principalDue);
    const biggerRun = simulate({amount: biggerTicket.toFixed(2), termMonths: operation.termMonths, graceMonths: operation.graceMonths, refinancing: refinancing.plus(worst.principalDue).toFixed(2)});
    const biggerPeak = peakOf(biggerRun);
    const biggerPrice = priceFor({
      amount: biggerTicket.toFixed(2),
      termMonths: operation.termMonths,
      leveragePost: (biggerPeak ?? d(leverageAfter(biggerTicket, refinancing.plus(worst.principalDue)))).toFixed(4),
    });
    const ownPeak = peakOf(trajectory);
    const biggerTradeoff = {
      pt: `${biggerPeak && ownPeak ? `O pico de alavancagem vai de ${turns(ownPeak)} para ${turns(biggerPeak)}` : "Custa alavancagem de pico mais alta"} e o livro fica maior.${biggerPrice && price ? ` No preço: ${spread(biggerPrice)} contra ${spread(price)} da estrutura pedida${biggerPrice.bps.min === price.bps.min ? ", o mesmo spread, porque em ambas o dinheiro novo é zero e o que muda é o prazo do passivo" : `, ${((biggerPrice.bps.min - price.bps.min) / 100).toFixed(2).replace(".", ",")} ponto percentual na ponta baixa`}.` : ""}`,
      en: `${biggerPeak && ownPeak ? `Peak leverage moves from ${turns(ownPeak)} to ${turns(biggerPeak)}` : "It costs a higher peak leverage"} and the book grows.${biggerPrice && price ? ` On price: ${spread(biggerPrice)} against ${spread(price)} for the requested structure${biggerPrice.bps.min === price.bps.min ? ", the same spread, because in both the new money is zero and what changes is the maturity of the liability" : ""}.` : ""}`,
    };
    alternatives.push({
      id: "size-to-cover-the-later-wall",
      amount: amount.plus(worst.principalDue).toFixed(2),
      termMonths: operation.termMonths,
      graceMonths: operation.graceMonths,
      why: {
        pt: `Um tíquete de ${brlM(amount.plus(worst.principalDue))} resolve ${worst.year} junto com a janela curta, e a companhia deixa de voltar ao mercado no pior ano do cronograma.`,
        en: `A ${brlM(amount.plus(worst.principalDue))} ticket clears ${worst.year} together with the near window, and the company stops returning to market in the worst year of its schedule.`,
      },
      tradeoff: biggerTradeoff,
      price: biggerPrice,
    });
  }

  // A shorter, cheaper road is worth naming whenever the ask is long for private credit.
  if (operation.termMonths > 72) {
    alternatives.push({
      id: "shorter-cheaper",
      amount: operation.amount,
      termMonths: 60,
      graceMonths: Math.min(operation.graceMonths, 12),
      why: {
        pt: `Prazo de 60 meses com até 12 de carência é onde o crédito privado brasileiro tem livro de verdade; ${months(operation.termMonths)} restringe a lista de investidores e cobra prêmio por isso.`,
        en: `Sixty months with up to twelve of grace is where Brazilian private credit has a real book; ${operation.termMonths} months narrows the investor list and is charged a premium for it.`,
      },
      tradeoff: {
        pt: `Amortiza mais cedo, então exige geração de caixa antes.${(() => {
          const shorter = priceFor({amount: operation.amount, termMonths: 60, leveragePost: leverageAfter(d(operation.amount), d(operation.refinancing ?? "0"))});
          return shorter && price
            ? ` No preço: ${spread(shorter)} contra ${spread(price)}, ${((price.bps.min - shorter.bps.min) / 100).toFixed(2).replace(".", ",")} ponto percentual economizado ao encurtar.`
            : " Em troca sai mais barato e com menos condições.";
        })()}`,
        en: `It amortises earlier, so it demands cash generation sooner.${(() => {
          const shorter = priceFor({amount: operation.amount, termMonths: 60, leveragePost: leverageAfter(d(operation.amount), d(operation.refinancing ?? "0"))});
          return shorter && price ? ` On price: ${spread(shorter)} against ${spread(price)}.` : " In exchange it prices tighter and carries fewer conditions.";
        })()}`,
      },
      price: priceFor({amount: operation.amount, termMonths: 60, leveragePost: leverageAfter(d(operation.amount), d(operation.refinancing ?? "0"))}),
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
      ? `A operação para de pé como está: ${brlM(amount)} em ${months(operation.termMonths)} com ${months(operation.graceMonths)} de carência, ${operation.instrument}.`
      : standing === "stands_with_conditions"
        ? `A operação para de pé com condições: ${brlM(amount)} em ${months(operation.termMonths)} com ${months(operation.graceMonths)} de carência, ${operation.instrument}, desde que ${conditions.length === 1 ? "a condição abaixo seja resolvida antes do desembolso" : `as ${conditions.length} condições abaixo sejam resolvidas antes do desembolso`}.`
        : `A operação, como está, não resolve o problema que motivou o pedido.`,
    en: standing === "stands"
      ? `The operation stands as proposed: ${brlM(amount)} over ${operation.termMonths} months with ${operation.graceMonths} of grace, ${operation.instrument}.`
      : standing === "stands_with_conditions"
        ? `The operation stands subject to conditions: ${brlM(amount)} over ${operation.termMonths} months with ${operation.graceMonths} of grace, ${operation.instrument}, provided ${conditions.length === 1 ? "the condition below is resolved before disbursement" : `the ${conditions.length} conditions below are resolved before disbursement`}.`
        : `As proposed, the operation does not solve the problem behind the request.`,
  };

  if (price) {
    solves.push({
      id: "price",
      pt: `No mercado de hoje esta estrutura sai a ${spread(price)} ao ano, e é contra essa faixa que o investidor compara o risco descrito acima.`,
      en: `In today's market this structure prices at ${spread(price)} per year, and that is the band against which an investor weighs the risk described above.`,
    });
  }

  return {standing, headline, conditions, solves, leaves, alternatives, price};
}
