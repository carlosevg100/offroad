import Decimal from "decimal.js";

import type {Finding} from "./analyze";

/**
 * The leverage trajectory: how the deal actually gets done.
 *
 * The static battery says the transaction as asked breaches the Itaú covenant on day one, and
 * that is a fact about the closing date, not a verdict on the deal. The founder's correction
 * was the desk's correction: the project's EBITDA has not arrived yet, and no company in this
 * position walks away, it structures. The instruments of that structure are exactly three, and
 * this module computes all of them instead of asserting them:
 *
 *   1. **Liability management.** The covenanted lines are refinanced inside the ticket, so the
 *      contract that would have tripped no longer exists. What binds afterwards is the new
 *      instrument's covenant, which is written to the trajectory rather than to the past.
 *   2. **The trajectory itself.** Net debt year by year (new money amortising SAC after grace,
 *      existing lines running to their own schedules) over EBITDA year by year as the project
 *      ramps. Peak leverage, and the year it crosses back under each threshold, on the
 *      company's numbers and on a stated haircut of them, because a fund underwrites the
 *      haircut case.
 *   3. **Covenant design.** A step-down schedule derived from the stressed trajectory plus a
 *      stated cushion, which is how the covenant is actually negotiated: wide at the peak,
 *      tightening as the project earns, never tighter than the base case can breathe.
 *
 * And one computation that reframes everything: principal falling due each year against the
 * EBITDA available to pay it. Aurora's existing schedule demands more amortisation in the next
 * eighteen months than the whole company generates, which means the refinancing is not a
 * choice the desk is making, it is a fact the current stack already contains.
 */

export type TrajectoryDebtLine = {
  lender: string;
  balance: string;
  /** ISO date. Absent → treated as beyond the horizon (held flat). */
  maturity?: string;
  /** Text from the schedule. "mensal"/"sac" amortises linearly to maturity; otherwise bullet. */
  amortization?: string;
  /** Whether this line carries a covenant, for the liability-management arithmetic. */
  hasCovenant?: boolean;
};

export type TrajectoryInput = {
  referenceDate: string;
  /** Held flat across the horizon; stated as an assumption in the output. */
  cash: string;
  existing: TrajectoryDebtLine[];
  newDebt: {
    amount: string;
    termMonths: number;
    graceMonths: number;
    /**
     * Existing debt the proceeds repay at disbursement, when the room says so
     * (`transaction.refinancing`). Netted off the existing stack pro rata: the desk knows how
     * much is being taken out before it knows which contracts, and the leverage arithmetic
     * needs only the amount.
     */
    refinancing?: string;
  };
  /**
   * True when the projection is not the company's but the desk's fallback (EBITDA held at the
   * audited level), so the narrative says so instead of describing a ramp nobody promised.
   */
  ebitdaHeldFlat?: boolean;
  /** Most recent audited EBITDA, the base the haircut anchors on. */
  auditedEbitda: string;
  /** Projected EBITDA per calendar year, the company's own ramp. */
  projectedEbitda: Array<{year: number; ebitda: string}>;
  /**
   * Haircut applied to the *growth* over the audited base, not to the base itself: the company
   * already proved the base, the ramp is the part underwritten with suspicion. 0.25 = the fund
   * believes three quarters of the promised growth.
   */
  growthHaircut?: string;
  /** Cushion added to the stressed trajectory when proposing covenant step-downs. */
  covenantCushion?: string;
  /**
   * The tightest covenant the proposal will ever suggest. Mechanically the trajectory reaches
   * 0,25x by 2030, and no desk writes that: below a floor the covenant stops being a tripwire
   * for deterioration and becomes a tripwire for ordinary volatility. 2,5x is the
   * middle-market convention and the default.
   */
  covenantFloor?: string;
  /** Existing ceilings, for crossing years and the liability-management case. */
  existingCovenants: Array<{lender: string; maximum: string}>;
};

export type TrajectoryYear = {
  year: number;
  existingDebt: string;
  newDebt: string;
  netDebt: string;
  ebitdaBase: string;
  ebitdaStressed: string;
  leverageBase: string;
  leverageStressed: string;
  /** Principal contractually due in the year, existing schedule plus the new loan. */
  principalDue: string;
  /** principalDue / ebitdaBase: above 1 the schedule outruns the whole operation. */
  scheduleStrain: string;
};

export type LiabilityManagement = {
  covenantedBalance: string;
  netNewMoney: string;
  postLeverageAfterRefi: string;
  lendersTakenOut: string[];
};

export type CovenantStep = {year: number; maximum: string};

export type Trajectory = {
  assumptions: {cashHeldFlat: string; growthHaircut: string; covenantCushion: string; disbursement: string; ebitdaHeldFlat: boolean; refinancing: string};
  years: TrajectoryYear[];
  peak: {year: number; leverageBase: string; leverageStressed: string};
  crossings: Array<{maximum: string; yearBase: number | null; yearStressed: number | null}>;
  liabilityManagement: LiabilityManagement | null;
  covenantProposal: CovenantStep[];
  findings: Finding[];
};

const d = (value: string | number): Decimal => new Decimal(value);
const brlM = (value: Decimal.Value): string => `R$ ${new Decimal(value).div(1_000_000).toFixed(1).replace(".", ",")}M`;
const turns = (value: Decimal.Value): string => `${new Decimal(value).toFixed(2).replace(".", ",")}x`;

const yearMonth = (iso: string): number => {
  const [year, month] = iso.split("-").map(Number);
  return year! * 12 + (month! - 1);
};

/** Outstanding balance of an existing line at a year-end, on its own schedule. */
const existingAt = (line: TrajectoryDebtLine, referenceYm: number, atYm: number): Decimal => {
  if (atYm <= referenceYm) return d(line.balance);
  if (!line.maturity) return d(line.balance);
  const maturityYm = yearMonth(line.maturity);
  if (atYm >= maturityYm) return new Decimal(0);
  const amortizes = /mensal|sac|price/i.test(line.amortization ?? "");
  if (!amortizes) return d(line.balance);
  const total = maturityYm - referenceYm;
  const elapsed = atYm - referenceYm;
  return d(line.balance).times(total - elapsed).div(total);
};

/** Outstanding of the new loan at a year-end: flat through grace, SAC afterwards. */
const newDebtAt = (amount: Decimal, disbursementYm: number, graceMonths: number, termMonths: number, atYm: number): Decimal => {
  if (atYm <= disbursementYm) return amount;
  const amortMonths = termMonths - graceMonths;
  const amortised = Math.min(Math.max(atYm - disbursementYm - graceMonths, 0), amortMonths);
  return amount.times(amortMonths - amortised).div(amortMonths);
};

export function projectLeverageTrajectory(input: TrajectoryInput): Trajectory {
  const findings: Finding[] = [];
  const referenceYm = yearMonth(input.referenceDate);
  const cash = d(input.cash);
  const amount = d(input.newDebt.amount);
  const haircut = d(input.growthHaircut ?? "0.25");
  const cushion = d(input.covenantCushion ?? "0.5");
  const floor = d(input.covenantFloor ?? "2.5");
  const audited = d(input.auditedEbitda);

  // Proceeds that repay existing debt leave the stack on day one, nearest maturity first.
  //
  // Pro rata was the wrong model and it made every operation untestable: a refinancing that
  // takes out the parcels due in the next twelve months would also shrink the line maturing in
  // 2030 by the same factor, so the schedule after the operation looked better everywhere and
  // the desk could not say what the money actually bought. Nobody redeems pro rata. A company
  // pays down what is about to fall due, which is why it is raising in the first place.
  const existingTotalAtStart = input.existing.reduce((sum, line) => sum.plus(line.balance), new Decimal(0));
  const refinancing = Decimal.min(d(input.newDebt.refinancing ?? "0"), existingTotalAtStart);
  const byMaturity = [...input.existing].sort((a, b) => (a.maturity ?? "9999-12-31").localeCompare(b.maturity ?? "9999-12-31"));
  let toRedeem = refinancing;
  const redeemed = new Map<TrajectoryDebtLine, Decimal>();
  for (const line of byMaturity) {
    if (toRedeem.lte(0)) break;
    const take = Decimal.min(toRedeem, d(line.balance));
    redeemed.set(line, take);
    toRedeem = toRedeem.minus(take);
  }
  const existing: TrajectoryDebtLine[] = input.existing.map((line) => ({
    ...line,
    balance: d(line.balance).minus(redeemed.get(line) ?? 0).toFixed(2),
  }));

  const years: TrajectoryYear[] = input.projectedEbitda.map(({year, ebitda}) => {
    const atYm = year * 12 + 11; // December of the year.
    const prevYm = (year - 1) * 12 + 11;

    const existingNow = existing.reduce((sum, line) => sum.plus(existingAt(line, referenceYm, atYm)), new Decimal(0));
    const existingPrev = existing.reduce((sum, line) => sum.plus(existingAt(line, referenceYm, Math.max(prevYm, referenceYm))), new Decimal(0));
    const newNow = newDebtAt(amount, referenceYm, input.newDebt.graceMonths, input.newDebt.termMonths, atYm);
    const newPrev = newDebtAt(amount, referenceYm, input.newDebt.graceMonths, input.newDebt.termMonths, Math.max(prevYm, referenceYm));

    const netDebt = existingNow.plus(newNow).minus(cash);
    const base = d(ebitda);
    const stressed = audited.plus(Decimal.max(base.minus(audited), 0).times(new Decimal(1).minus(haircut)));
    const principalDue = existingPrev.minus(existingNow).plus(newPrev.minus(newNow));

    return {
      year,
      existingDebt: existingNow.toFixed(2),
      newDebt: newNow.toFixed(2),
      netDebt: netDebt.toFixed(2),
      ebitdaBase: base.toFixed(2),
      ebitdaStressed: stressed.toFixed(2),
      leverageBase: netDebt.div(base).toFixed(4),
      leverageStressed: netDebt.div(stressed).toFixed(4),
      principalDue: principalDue.toFixed(2),
      scheduleStrain: principalDue.div(base).toFixed(4),
    };
  });

  const peakYear = years.reduce((max, row) => (d(row.leverageStressed).gt(max.leverageStressed) ? row : max), years[0]!);

  const ceilings = [...new Set(input.existingCovenants.map((c) => d(c.maximum).toFixed(4)))].sort((a, b) => d(a).minus(b).toNumber());
  const crossings = ceilings.map((maximum) => ({
    maximum,
    yearBase: years.find((row) => d(row.leverageBase).lte(maximum))?.year ?? null,
    yearStressed: years.find((row) => d(row.leverageStressed).lte(maximum))?.year ?? null,
  }));

  // ---- liability management: take out the covenanted lines inside the ticket ------------------
  const covenanted = input.existing.filter((line) => line.hasCovenant);
  let liabilityManagement: LiabilityManagement | null = null;
  if (covenanted.length === 0 && refinancing.gt(0)) {
    // No single contract to take out: the covenant binds the whole stack and the room states how
    // much of it the proceeds repay. The arithmetic is the same, the lenders are "the schedule".
    const netNewMoney = amount.minus(refinancing);
    const postDebt = existingTotalAtStart.minus(refinancing).plus(amount);
    const postLeverage = postDebt.minus(cash).div(audited);
    liabilityManagement = {
      covenantedBalance: refinancing.toFixed(2),
      netNewMoney: netNewMoney.toFixed(2),
      postLeverageAfterRefi: postLeverage.toFixed(4),
      lendersTakenOut: [],
    };
    findings.push({
      id: "refinancing-inside-ticket",
      severity: "high",
      pt: `A captação é, em ${brlM(refinancing)}, troca de passivo: esse valor resgata dívida existente no desembolso e sobra ${brlM(netNewMoney)} de dinheiro efetivamente novo. A alavancagem pós-operação é ${turns(postLeverage)} sobre o EBITDA reportado, não a soma ingênua do tíquete ao estoque. O que a operação compra é prazo e carência, e é contra isso que o fundo precifica.`,
      en: `${brlM(refinancing)} of the raise is a liability swap: it repays existing debt at disbursement, leaving ${brlM(netNewMoney)} of genuinely new money. Post-transaction leverage is ${turns(postLeverage)} on reported EBITDA, not the naive sum of ticket and stock. What the deal buys is tenor and grace, and that is what the fund prices.`,
      values: {refinancing: refinancing.toFixed(2), netNewMoney: netNewMoney.toFixed(2), postLeverage: postLeverage.toFixed(4)},
      inputs: ["transaction.refinancing", "transaction.requested_amount", "debt.instruments"],
    });
  }
  if (covenanted.length > 0) {
    const covenantedBalance = covenanted.reduce((sum, line) => sum.plus(line.balance), new Decimal(0));
    const netNewMoney = amount.minus(covenantedBalance);
    const existingTotal = input.existing.reduce((sum, line) => sum.plus(line.balance), new Decimal(0));
    const postDebt = existingTotal.minus(covenantedBalance).plus(amount);
    const postLeverage = postDebt.minus(cash).div(audited);
    liabilityManagement = {
      covenantedBalance: covenantedBalance.toFixed(2),
      netNewMoney: netNewMoney.toFixed(2),
      postLeverageAfterRefi: postLeverage.toFixed(4),
      lendersTakenOut: covenanted.map((line) => line.lender),
    };

    findings.push({
      id: "liability-management",
      severity: "high",
      pt: `A estrutura que destrava a operação é quitar as linhas com covenant dentro do tíquete: ${covenanted.map((line) => `${line.lender} (${brlM(line.balance)})`).join(" e ")}, ${brlM(covenantedBalance)} no total. O rompimento no dia um deixa de existir porque o contrato que testaria deixa de existir; sobra ${brlM(netNewMoney)} de dinheiro efetivamente novo, a alavancagem pós fica em ${turns(postLeverage)} sobre o EBITDA reportado, e quem passa a testar é o covenant do novo instrumento, desenhado sobre a trajetória abaixo. É assim que uma empresa nesta posição capta: reestruturação e dinheiro novo no mesmo instrumento, não dinheiro novo por cima do estoque.`,
      en: `The structure that unlocks the deal is refinancing the covenanted lines inside the ticket: ${covenanted.map((line) => `${line.lender} (${brlM(line.balance)})`).join(" and ")}, ${brlM(covenantedBalance)} in total. The day-one breach ceases to exist because the contract that would test it does; ${brlM(netNewMoney)} of genuinely new money remains, post leverage stands at ${turns(postLeverage)} on reported EBITDA, and what binds is the new instrument's covenant, written to the trajectory below. That is how a company in this position raises: restructuring and new money in one instrument, not new money on top of the stock.`,
      values: {covenantedBalance: covenantedBalance.toFixed(2), netNewMoney: netNewMoney.toFixed(2), postLeverage: postLeverage.toFixed(4)},
      inputs: ["debt.instruments", "debt.covenants", "transaction.requested_amount"],
    });
  }

  // ---- the schedule the current stack already demands -----------------------------------------
  const strained = years.filter((row) => d(row.scheduleStrain).gt("0.8"));
  if (strained.length > 0) {
    const worst = strained.reduce((max, row) => (d(row.scheduleStrain).gt(max.scheduleStrain) ? row : max));
    findings.push({
      id: "amortization-outruns-cash",
      severity: "critical",
      pt: `O cronograma contratado exige ${brlM(worst.principalDue)} de amortização em ${worst.year}, ${d(worst.scheduleStrain).times(100).toFixed(0)}% do EBITDA projetado do ano, antes de juros e de qualquer investimento. Esse ano não se paga com o caixa da operação, então ele será rolado: a pergunta não é se rola, é a que preço e com que prazo. Alongar resolve e custa spread e garantia; dimensionar a captação para cobrir ${worst.year} agora custa tíquete maior e alavancagem de pico mais alta. As duas saídas são defensáveis, e a escolha entre elas é o que o material precisa mostrar ao investidor.`,
      en: `The contracted schedule demands ${brlM(worst.principalDue)} of amortisation in ${worst.year}, ${d(worst.scheduleStrain).times(100).toFixed(0)}% of that year's projected EBITDA, before interest and any investment. That year will not be paid out of operating cash, so it will be rolled: the question is not whether, but at what price and tenor. Terming it out works and costs spread and security; sizing the raise to cover ${worst.year} now costs a larger ticket and a higher peak leverage. Both are defensible, and choosing between them is what the material has to show the investor.`,
      values: {year: String(worst.year), principalDue: worst.principalDue, strain: worst.scheduleStrain},
      inputs: ["debt.instruments", "projections.ebitda"],
    });
  }

  // ---- trajectory and the covenant that follows it --------------------------------------------
  const covenantProposal: CovenantStep[] = years.map((row) => {
    const stepped = d(row.leverageStressed).plus(cushion);
    const rounded = stepped.times(4).ceil().div(4); // to the nearest upper quarter turn
    return {year: row.year, maximum: Decimal.max(rounded, floor).toFixed(2)};
  });

  const back = crossings.find((crossing) => d(crossing.maximum).eq(ceilings[0] ?? "3"));
  findings.push({
    id: "leverage-trajectory",
    severity: "info",
    pt: `Trajetória${input.ebitdaHeldFlat ? " (sem projeção da companhia: EBITDA mantido no nível do último exercício, premissa da mesa)" : ""}: pico de ${turns(peakYear.leverageBase)} (${turns(peakYear.leverageStressed)} no cenário com corte de ${haircut.times(100).toFixed(0)}% do crescimento) em ${peakYear.year}, desalavancando pela amortização SAC${input.ebitdaHeldFlat ? "" : " e pela rampa do projeto"}${back && back.yearStressed ? `, e voltando abaixo de ${turns(back.maximum)} em ${back.yearStressed} mesmo no cenário cortado` : ""}. Covenant proposto para o novo instrumento, com folga de ${cushion.toFixed(2).replace(".", ",")}x sobre o cenário cortado e teste anual: ${covenantProposal.map((step) => `${step.year} ≤ ${step.maximum.replace(".", ",")}x`).join("; ")}. Primeira aferição no primeiro exercício completo após o desembolso.`,
    en: `Trajectory${input.ebitdaHeldFlat ? " (no company projection: EBITDA held at the latest audited level, a desk assumption)" : ""}: peak of ${turns(peakYear.leverageBase)} (${turns(peakYear.leverageStressed)} with ${haircut.times(100).toFixed(0)}% of the growth cut) in ${peakYear.year}, deleveraging through SAC amortisation${input.ebitdaHeldFlat ? "" : " and the project ramp"}${back && back.yearStressed ? `, and back under ${turns(back.maximum)} by ${back.yearStressed} even in the cut scenario` : ""}. Proposed covenant for the new instrument, ${cushion.toFixed(2)}x of cushion over the cut scenario, tested annually: ${covenantProposal.map((step) => `${step.year} ≤ ${step.maximum}x`).join("; ")}. First test at the first full year after disbursement.`,
    values: {peakBase: peakYear.leverageBase, peakStressed: peakYear.leverageStressed, peakYear: String(peakYear.year)},
    inputs: ["projections.ebitda", "debt.instruments", "transaction.requested_amount"],
  });

  const order = {critical: 0, high: 1, medium: 2, info: 3};
  findings.sort((a, b) => order[a.severity] - order[b.severity]);

  return {
    assumptions: {
      cashHeldFlat: cash.toFixed(2),
      growthHaircut: haircut.toFixed(4),
      covenantCushion: cushion.toFixed(4),
      disbursement: input.referenceDate,
      ebitdaHeldFlat: input.ebitdaHeldFlat ?? false,
      refinancing: refinancing.toFixed(2),
    },
    years,
    peak: {year: peakYear.year, leverageBase: peakYear.leverageBase, leverageStressed: peakYear.leverageStressed},
    crossings,
    liabilityManagement,
    covenantProposal,
    findings,
  };
}
