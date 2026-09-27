import {
  allocateRefinancingNearestFirst, calculateLiabilityManagement, compareFigures, presentationAmount, presentationFigure,
  presentationRatio, projectLeveragePath, selectHeaviestScheduleYear, type DecimalInput,
} from "@offroad/financial-core";

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
  /**
   * Gross debt as the balance sheet states it, when it differs from the schedule's total.
   *
   * Camil measured why this matters: the debt map sums to R$ 5.742,5M and the balance sheet
   * recognises R$ 5.670,2M, a gap of R$ 72,3M in leases the map never lists. Sizing the
   * operation off the map and publishing leverage off the balance made a pure liability swap
   * read as 4,71x against a pre of 4,63x: the operation appeared to add leverage while adding
   * no debt at all. Post-transaction leverage is stated on the same base as the pre.
   */
  balanceGrossDebt?: string;
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

// Every figure comes from a financial-core kernel; amounts and multiples print through financial-core,
// each language with its own separators.
type Locale = "pt-BR" | "en-US";
const local = (figure: string, locale: Locale) => (locale === "pt-BR" ? figure.replace(".", ",") : figure);
const brlM = (value: DecimalInput, locale: Locale = "pt-BR"): string => presentationAmount({value, locale, style: "abbreviated"}).text;
const turns = (value: DecimalInput, locale: Locale = "pt-BR"): string => `${local(presentationFigure({value, decimals: 2}).value, locale)}x`;
/** A figure at the precision the trajectory publishes it; a ratio over a zero denominator as the division prints it. */
const at = (value: DecimalInput, decimals: number): string => presentationFigure({value, decimals}).value;
const ratioAt = (value: string, decimals: number): string => presentationRatio({value, decimals}).value;
const percentAt = (value: DecimalInput, decimals: number): string => presentationFigure({value, scale: "percent", decimals}).value;

const yearMonth = (iso: string): number => {
  const [year, month] = iso.split("-").map(Number);
  return year! * 12 + (month! - 1);
};

export function projectLeverageTrajectory(input: TrajectoryInput): Trajectory {
  const findings: Finding[] = [];
  const haircut = input.growthHaircut ?? "0.25";
  const cushion = input.covenantCushion ?? "0.5";
  const floor = input.covenantFloor ?? "2.5";

  // Proceeds that repay existing debt leave the stack on day one, nearest maturity first.
  //
  // Pro rata was the wrong model and it made every operation untestable: a refinancing that
  // takes out the parcels due in the next twelve months would also shrink the line maturing in
  // 2030 by the same factor, so the schedule after the operation looked better everywhere and
  // the desk could not say what the money actually bought. Nobody redeems pro rata. A company
  // pays down what is about to fall due, which is why it is raising in the first place.
  const redemption = allocateRefinancingNearestFirst({
    lines: input.existing.map((line) => ({balance: line.balance, maturity: line.maturity ?? null})),
    refinancing: input.newDebt.refinancing ?? "0",
  });
  const refinancing = redemption.refinancing;
  const existing: TrajectoryDebtLine[] = input.existing.map((line, index) => ({...line, balance: redemption.remaining[index]!}));

  const path = projectLeveragePath({
    referenceMonth: yearMonth(input.referenceDate),
    cash: input.cash,
    newDebt: {amount: input.newDebt.amount, termMonths: input.newDebt.termMonths, graceMonths: input.newDebt.graceMonths},
    // "mensal"/"sac"/"price" amortises linearly to maturity; otherwise bullet; no maturity, held flat.
    lines: existing.map((line) => ({
      balance: line.balance,
      maturityMonth: line.maturity ? yearMonth(line.maturity) : null,
      amortizes: /mensal|sac|price/i.test(line.amortization ?? ""),
    })),
    auditedEbitda: input.auditedEbitda,
    growthHaircut: haircut,
    covenantCushion: cushion,
    covenantFloor: floor,
    years: input.projectedEbitda,
    ceilings: input.existingCovenants.map((covenant) => covenant.maximum),
  });
  const years: TrajectoryYear[] = path.years.map((row) => ({...row}));
  const peakYear = years[path.peakIndex]!;
  const ceilings = path.ceilings;
  const crossings = path.crossings.map((crossing) => ({...crossing}));

  // ---- liability management: take out the covenanted lines inside the ticket ------------------
  const covenanted = input.existing.filter((line) => line.hasCovenant);
  let liabilityManagement: LiabilityManagement | null = null;
  if (covenanted.length === 0 && compareFigures(refinancing, 0) > 0) {
    // No single contract to take out: the covenant binds the whole stack and the room states how
    // much of it the proceeds repay. The arithmetic is the same, the lenders are "the schedule".
    const swap = calculateLiabilityManagement({
      ticket: input.newDebt.amount,
      redeemed: [refinancing],
      grossDebtBefore: input.balanceGrossDebt ? input.balanceGrossDebt : redemption.existingTotal,
      cash: input.cash,
      ebitda: input.auditedEbitda,
    });
    liabilityManagement = {
      covenantedBalance: at(refinancing, 2),
      netNewMoney: at(swap.netNewMoney, 2),
      postLeverageAfterRefi: ratioAt(swap.leverageAfter, 4),
      lendersTakenOut: [],
    };
    findings.push({
      id: "refinancing-inside-ticket",
      severity: "high",
      pt: `A captação é, em ${brlM(refinancing)}, troca de passivo: esse valor resgata dívida existente no desembolso e sobra ${brlM(swap.netNewMoney)} de dinheiro efetivamente novo. A alavancagem pós-operação é ${turns(swap.leverageAfter)} sobre o EBITDA reportado, não a soma ingênua do tíquete ao estoque. O que a operação compra é prazo e carência, e é contra isso que o fundo precifica.`,
      en: `${brlM(refinancing, "en-US")} of the raise is a liability swap: it repays existing debt at disbursement, leaving ${brlM(swap.netNewMoney, "en-US")} of genuinely new money. Post-transaction leverage is ${turns(swap.leverageAfter, "en-US")} on reported EBITDA, not the naive sum of ticket and stock. What the deal buys is tenor and grace, and that is what the fund prices.`,
      values: {refinancing: at(refinancing, 2), netNewMoney: at(swap.netNewMoney, 2), postLeverage: ratioAt(swap.leverageAfter, 4)},
      inputs: ["transaction.refinancing", "transaction.requested_amount", "debt.instruments"],
    });
  }
  if (covenanted.length > 0) {
    const takeout = calculateLiabilityManagement({
      ticket: input.newDebt.amount,
      redeemed: covenanted.map((line) => line.balance),
      grossDebtBefore: redemption.existingTotal,
      cash: input.cash,
      ebitda: input.auditedEbitda,
    });
    liabilityManagement = {
      covenantedBalance: at(takeout.redeemed, 2),
      netNewMoney: at(takeout.netNewMoney, 2),
      postLeverageAfterRefi: ratioAt(takeout.leverageAfter, 4),
      lendersTakenOut: covenanted.map((line) => line.lender),
    };

    findings.push({
      id: "liability-management",
      severity: "high",
      pt: `A estrutura que destrava a operação é quitar as linhas com covenant dentro do tíquete: ${covenanted.map((line) => `${line.lender} (${brlM(line.balance)})`).join(" e ")}, ${brlM(takeout.redeemed)} no total. O rompimento no dia um deixa de existir porque o contrato que testaria deixa de existir; sobra ${brlM(takeout.netNewMoney)} de dinheiro efetivamente novo, a alavancagem pós fica em ${turns(takeout.leverageAfter)} sobre o EBITDA reportado, e quem passa a testar é o covenant do novo instrumento, desenhado sobre a trajetória abaixo. É assim que uma empresa nesta posição capta: reestruturação e dinheiro novo no mesmo instrumento, não dinheiro novo por cima do estoque.`,
      en: `The structure that unlocks the deal is refinancing the covenanted lines inside the ticket: ${covenanted.map((line) => `${line.lender} (${brlM(line.balance, "en-US")})`).join(" and ")}, ${brlM(takeout.redeemed, "en-US")} in total. The day-one breach ceases to exist because the contract that would test it does; ${brlM(takeout.netNewMoney, "en-US")} of genuinely new money remains, post leverage stands at ${turns(takeout.leverageAfter, "en-US")} on reported EBITDA, and what binds is the new instrument's covenant, written to the trajectory below. That is how a company in this position raises: restructuring and new money in one instrument, not new money on top of the stock.`,
      values: {covenantedBalance: at(takeout.redeemed, 2), netNewMoney: at(takeout.netNewMoney, 2), postLeverage: ratioAt(takeout.leverageAfter, 4)},
      inputs: ["debt.instruments", "debt.covenants", "transaction.requested_amount"],
    });
  }

  // ---- the schedule the current stack already demands -----------------------------------------
  // The heaviest year above 0,8x of its EBITDA, by the rule the verdict ranks years with: strains
  // compare exactly, the first year among equals, and a year whose EBITDA is zero is not ranked.
  const heaviest = selectHeaviestScheduleYear({years: years.map((row, index) => ({id: String(index), strain: row.scheduleStrain})), threshold: "0.8"});
  const worst = heaviest.id !== null ? years[Number(heaviest.id)] : undefined;
  if (worst) {
    findings.push({
      id: "amortization-outruns-cash",
      severity: "critical",
      pt: `O cronograma contratado exige ${brlM(worst.principalDue)} de amortização em ${worst.year}, ${percentAt(worst.scheduleStrain, 0)}% do EBITDA projetado do ano, antes de juros e de qualquer investimento. Esse ano não se paga com o caixa da operação, então ele será rolado: a pergunta não é se rola, é a que preço e com que prazo. Alongar resolve e custa spread e garantia; dimensionar a captação para cobrir ${worst.year} agora custa tíquete maior e alavancagem de pico mais alta. As duas saídas são defensáveis, e a escolha entre elas é o que o material precisa mostrar ao investidor.`,
      en: `The contracted schedule demands ${brlM(worst.principalDue, "en-US")} of amortisation in ${worst.year}, ${percentAt(worst.scheduleStrain, 0)}% of that year's projected EBITDA, before interest and any investment. That year will not be paid out of operating cash, so it will be rolled: the question is not whether, but at what price and tenor. Terming it out works and costs spread and security; sizing the raise to cover ${worst.year} now costs a larger ticket and a higher peak leverage. Both are defensible, and choosing between them is what the material has to show the investor.`,
      values: {year: String(worst.year), principalDue: worst.principalDue, strain: worst.scheduleStrain},
      inputs: ["debt.instruments", "projections.ebitda"],
    });
  }

  // ---- trajectory and the covenant that follows it --------------------------------------------
  const covenantProposal: CovenantStep[] = path.covenantProposal.map((step) => ({...step}));

  const back = crossings.find((crossing) => compareFigures(crossing.maximum, ceilings[0]!) === 0);
  findings.push({
    id: "leverage-trajectory",
    severity: "info",
    pt: `Trajetória${input.ebitdaHeldFlat ? " (sem projeção da companhia: EBITDA mantido no nível do último exercício, premissa da mesa)" : ""}: pico de ${turns(peakYear.leverageBase)} (${turns(peakYear.leverageStressed)} no cenário com corte de ${percentAt(haircut, 0)}% do crescimento) em ${peakYear.year}, desalavancando pela amortização SAC${input.ebitdaHeldFlat ? "" : " e pela rampa do projeto"}${back && back.yearStressed ? `, e voltando abaixo de ${turns(back.maximum)} em ${back.yearStressed} mesmo no cenário cortado` : ""}. Covenant proposto para o novo instrumento, com folga de ${local(at(cushion, 2), "pt-BR")}x sobre o cenário cortado e teste anual: ${covenantProposal.map((step) => `${step.year} ≤ ${step.maximum.replace(".", ",")}x`).join("; ")}. Primeira aferição no primeiro exercício completo após o desembolso.`,
    en: `Trajectory${input.ebitdaHeldFlat ? " (no company projection: EBITDA held at the latest audited level, a desk assumption)" : ""}: peak of ${turns(peakYear.leverageBase, "en-US")} (${turns(peakYear.leverageStressed, "en-US")} with ${percentAt(haircut, 0)}% of the growth cut) in ${peakYear.year}, deleveraging through SAC amortisation${input.ebitdaHeldFlat ? "" : " and the project ramp"}${back && back.yearStressed ? `, and back under ${turns(back.maximum, "en-US")} by ${back.yearStressed} even in the cut scenario` : ""}. Proposed covenant for the new instrument, ${at(cushion, 2)}x of cushion over the cut scenario, tested annually: ${covenantProposal.map((step) => `${step.year} ≤ ${step.maximum}x`).join("; ")}. First test at the first full year after disbursement.`,
    values: {peakBase: peakYear.leverageBase, peakStressed: peakYear.leverageStressed, peakYear: String(peakYear.year)},
    inputs: ["projections.ebitda", "debt.instruments", "transaction.requested_amount"],
  });

  const order = {critical: 0, high: 1, medium: 2, info: 3};
  findings.sort((a, b) => order[a.severity] - order[b.severity]);

  return {
    assumptions: {
      cashHeldFlat: at(input.cash, 2),
      growthHaircut: at(haircut, 4),
      covenantCushion: at(cushion, 4),
      disbursement: input.referenceDate,
      ebitdaHeldFlat: input.ebitdaHeldFlat ?? false,
      refinancing: at(refinancing, 2),
    },
    years,
    peak: {year: peakYear.year, leverageBase: peakYear.leverageBase, leverageStressed: peakYear.leverageStressed},
    crossings,
    liabilityManagement,
    covenantProposal,
    findings,
  };
}
