import Decimal from "decimal.js";

import type {CalculationTrace} from "./credit-math";
import {finiteFigure as finite, fullFigure as full} from "./figure-input";

/**
 * The arithmetic of the desk battery and of the leverage trajectory (stage 19, post-closure polish).
 *
 * `@offroad/credit-analysis` reads a company the way a head of credit does before writing a sentence:
 * the stack on one axis, leverage before and after the ask against the tightest covenant, interest
 * coverage, the runway of a company that burns cash, the cash cycle and what growth absorbs, the
 * receivables still free, and the trajectory of leverage year by year with the covenant a new
 * instrument would carry. Every figure of that reading is computed here, in Decimal at 40
 * significant digits with half-up rounding, with a trace naming the formula and the operands; the
 * package keeps the calendar (months between two dates), the text it reads and the sentences.
 *
 * Figures are full-precision decimal strings unless the kernel states the precision the desk
 * publishes. A value received that is not a finite decimal number is refused, never read as zero.
 * A ratio over a zero denominator is not a number: the desk has always published it as a division
 * by zero prints it (`Infinity`, `-Infinity`, `NaN`) and never compared it or stated it in a
 * sentence, so these kernels hand it on as that text and decide every threshold on the decimal
 * value, exactly as before.
 */
export const deskArithmeticVersion = "2026.09.27-v1";

// The same arithmetic contract the package root declares, so a kernel imported on its own computes
// exactly what it computes inside the desk.
Decimal.set({precision: 40, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -30, toExpPos: 30});

const ZERO = new Decimal(0);

// The stack on one axis -------------------------------------------------------------------------

export type DeskStackLine = {
  balance: Decimal.Value;
  /** Effective annual cost on the common axis; null when the line could not be priced. */
  effectiveAnnual: Decimal.Value | null;
  /** Calendar months from the reference date to the line's maturity; null when the line states none. */
  monthsToMaturity: number | null;
};

/** A window of a maturity profile ("Jun/26 a Mai/27: 1.229.828"): the principal and the months to its end, when it has one. */
export type DeskMaturityWindow = {amount: Decimal.Value; monthsToEnd: number | null};

export type DeskDebtStack = {
  /** Each line's balance at cents, the axis the stack is summed on. */
  readonly lineBalances: readonly string[];
  readonly totalSchedule: string;
  readonly totalOnBalance: string;
  /** Balance sheet less the schedule: positive when the balance sheet recognises debt the schedule does not list. */
  readonly scheduleGap: string;
  /** Balance-weighted effective annual cost of the lines that could be priced; null when none could. */
  readonly weightedCost: string | null;
  readonly maturingWithin24Months: string;
  readonly maturingWithin12Months: string;
  /** Cash over the principal due within 12 months; null when nothing is due. */
  readonly liquidityCoverage12: string | null;
  /** Principal due within 24 months over the schedule, capped at the whole schedule; null unless both are positive. */
  readonly maturingShare24: string | null;
  readonly trace: CalculationTrace;
};

/**
 * The stack on one axis: each line at cents, the schedule against the balance sheet, the
 * balance-weighted cost of what can be priced, and the principal falling due within 12 and 24
 * months. A line without a maturity is not a line that never matures: when some lines state no
 * date and the maturity profile of the notes says more falls due in the window, the profile wins.
 */
export function calculateDeskDebtStack(input: {
  lines: readonly DeskStackLine[];
  grossDebt: Decimal.Value;
  cash: Decimal.Value;
  maturityProfile: readonly DeskMaturityWindow[];
}): DeskDebtStack {
  const balances = input.lines.map((line, index) => new Decimal(finite(`balance of line ${index + 1}`, line.balance).toFixed(2)));
  const costs = input.lines.map((line, index) => (line.effectiveAnnual === null ? null : finite(`cost of line ${index + 1}`, line.effectiveAnnual)));
  const totalSchedule = balances.reduce((sum, balance) => sum.plus(balance), ZERO);
  const totalOnBalance = finite("gross debt on the balance sheet", input.grossDebt);
  const scheduleGap = totalOnBalance.minus(totalSchedule);
  const priceableTotal = balances.reduce((sum, balance, index) => (costs[index] === null ? sum : sum.plus(balance)), ZERO);
  const weightedCost = priceableTotal.gt(0)
    ? balances.reduce((sum, balance, index) => (costs[index] === null ? sum : sum.plus(balance.times(costs[index]!))), ZERO).div(priceableTotal)
    : null;

  const within = (months: number | null, limit: number) => months !== null && months <= limit;
  const linesWithDates = input.lines.filter((line) => line.monthsToMaturity !== null).length;
  const maturing = (limit: number) => {
    const fromLines = balances.reduce((sum, balance, index) => (within(input.lines[index]!.monthsToMaturity, limit) ? sum.plus(balance) : sum), ZERO);
    const fromProfile = input.maturityProfile.reduce(
      (sum, window, index) => (within(window.monthsToEnd, limit) ? sum.plus(finite(`window ${index + 1} of the maturity profile`, window.amount)) : sum),
      ZERO,
    );
    return linesWithDates < input.lines.length && fromProfile.gt(fromLines) ? fromProfile : fromLines;
  };
  const maturing24 = maturing(24);
  const maturing12 = maturing(12);
  const cash = finite("cash", input.cash);
  const liquidityCoverage12 = maturing12.gt(0) ? cash.div(maturing12) : null;
  const maturingShare24 = maturing24.gt(0) && totalSchedule.gt(0) ? Decimal.min(maturing24.div(totalSchedule), 1) : null;

  return {
    lineBalances: balances.map((balance) => balance.toFixed(2)),
    totalSchedule: full(totalSchedule),
    totalOnBalance: full(totalOnBalance),
    scheduleGap: full(scheduleGap),
    weightedCost: weightedCost ? full(weightedCost) : null,
    maturingWithin24Months: full(maturing24),
    maturingWithin12Months: full(maturing12),
    liquidityCoverage12: liquidityCoverage12 ? full(liquidityCoverage12) : null,
    maturingShare24: maturingShare24 ? full(maturingShare24) : null,
    trace: {
      id: "desk.debt_stack",
      formula: "schedule = sum of the line balances at cents; gap = balance sheet - schedule; weighted cost = sum(balance x cost) / sum of priced balances; "
        + "due within N months = lines maturing within N months, or the maturity profile when some lines state no date and the profile says more; "
        + "liquidity coverage = cash / due within 12 months; 24-month share = min(due within 24 months / schedule, 1)",
      operands: {lines: String(input.lines.length), grossDebt: full(totalOnBalance), cash: full(cash), windows: String(input.maturityProfile.length)},
      result: `schedule=${full(totalSchedule)}; gap=${full(scheduleGap)}; weightedCost=${weightedCost ? full(weightedCost) : "none"}; due12=${full(maturing12)}; due24=${full(maturing24)}`,
    },
  };
}

// Leverage and covenants, before and after -----------------------------------------------------

export type DeskLeverage = {
  readonly netDebt: string;
  /** Net debt over EBITDA today; over a zero EBITDA not a number, as the division prints it. */
  readonly preTurns: string;
  /** A company whose EBITDA is not positive has no turns to count: the desk reads its runway instead. */
  readonly profile: "cash_generative" | "cash_burning";
  /** Each amount the room states, at cents, with the leverage it would leave at four decimals, in the order stated. */
  readonly scenarios: ReadonlyArray<{readonly amount: string; readonly postTurns: string}>;
  /** The largest amount stated, at cents, never below zero. */
  readonly largestAmount: string;
  /** The highest leverage the stated amounts leave (four decimals), never below zero, and whether it exceeds leverage today. */
  readonly worstPostTurns: string;
  readonly worstPostAbovePre: boolean;
  /** The tightest ceiling, the first listed among equals; null when no ceiling is stated. */
  readonly tightest: {readonly index: number} | null;
  /** The covenant arithmetic, when there is a ceiling and EBITDA is positive. */
  readonly covenant: {
    /** Ceiling x EBITDA - net debt: the new money the tightest covenant admits, negative when already above it. */
    readonly maxNewDebt: string;
    /** The same, never below zero, and its magnitude. */
    readonly roomForNewDebt: string;
    readonly excessNetDebt: string;
    readonly alreadyAbove: boolean;
    /** Whether an amount stated leaves leverage (at four decimals) above the ceiling. */
    readonly breached: boolean;
    /** The amount stated that leaves the highest leverage, the first among equals; null when none is stated. */
    readonly worstScenario: number | null;
  } | null;
  readonly trace: CalculationTrace;
};

/**
 * Net leverage before the ask and after each amount the room states, the tightest covenant ceiling
 * and the new money it admits: the number that changes the meeting.
 */
export function calculateDeskLeverage(input: {
  grossDebt: Decimal.Value;
  cash: Decimal.Value;
  ebitda: Decimal.Value;
  amounts: readonly Decimal.Value[];
  ceilings: readonly Decimal.Value[];
}): DeskLeverage {
  const grossDebt = finite("gross debt", input.grossDebt);
  const cash = finite("cash", input.cash);
  const ebitda = finite("EBITDA", input.ebitda);
  const netDebt = grossDebt.minus(cash);
  const preTurns = netDebt.div(ebitda);
  const amounts = input.amounts.map((amount, index) => finite(`amount ${index + 1}`, amount));
  const scenarios = amounts.map((amount) => ({amount: amount.toFixed(2), postTurns: netDebt.plus(amount).div(ebitda).toFixed(4)}));
  const largestAmount = scenarios.reduce((max, scenario) => (new Decimal(scenario.amount).gt(max) ? new Decimal(scenario.amount) : max), ZERO);
  const worstPost = scenarios.reduce((max, scenario) => Decimal.max(max, scenario.postTurns), ZERO);

  const ceilings = input.ceilings.map((ceiling, index) => finite(`ceiling ${index + 1}`, ceiling));
  let tightest: {index: number; maximum: Decimal} | null = null;
  ceilings.forEach((maximum, index) => {
    if (!tightest || maximum.lt(tightest.maximum)) tightest = {index, maximum};
  });
  const bound = tightest as {index: number; maximum: Decimal} | null;
  const burning = ebitda.lte(0);

  let covenant: DeskLeverage["covenant"] = null;
  if (bound && !burning) {
    const maxNewDebt = bound.maximum.times(ebitda).minus(netDebt);
    covenant = {
      maxNewDebt: full(maxNewDebt),
      roomForNewDebt: full(Decimal.max(maxNewDebt, 0)),
      excessNetDebt: full(maxNewDebt.abs()),
      alreadyAbove: preTurns.gt(bound.maximum),
      breached: scenarios.some((scenario) => new Decimal(scenario.postTurns).gt(bound.maximum)),
      worstScenario: scenarios.length === 0 ? null : scenarios.reduce((worst, scenario, index) => (new Decimal(scenario.postTurns).gt(scenarios[worst]!.postTurns) ? index : worst), 0),
    };
  }

  return {
    netDebt: full(netDebt),
    preTurns: full(preTurns),
    profile: burning ? "cash_burning" : "cash_generative",
    scenarios,
    largestAmount: full(largestAmount),
    worstPostTurns: full(worstPost),
    worstPostAbovePre: worstPost.gt(preTurns),
    tightest: bound ? {index: bound.index} : null,
    covenant,
    trace: {
      id: "desk.leverage",
      formula: "net debt = gross debt - cash; leverage = net debt / EBITDA; after an amount = (net debt + amount) / EBITDA at four decimals; "
        + "tightest = lowest ceiling, the first listed among equals; admitted new money = ceiling x EBITDA - net debt, only when EBITDA is positive",
      operands: {grossDebt: full(grossDebt), cash: full(cash), ebitda: full(ebitda), amounts: amounts.map(full).join(", "), ceilings: ceilings.map(full).join(", ")},
      result: `netDebt=${full(netDebt)}; pre=${full(preTurns)}; post=${scenarios.map((scenario) => scenario.postTurns).join(", ")}${covenant ? `; admitted=${covenant.maxNewDebt}` : ""}`,
    },
  };
}

/**
 * Interest coverage today (EBITDA over the year's interest expense, as a magnitude) and with the
 * ask's interest added at its cost: the rate the company asks when it can be read, the stack's
 * weighted cost otherwise. Null when the expense or EBITDA is not positive, or no cost is known.
 */
export function calculateInterestCoverage(input: {
  ebitda: Decimal.Value;
  financialExpenses: Decimal.Value | null;
  askAmount: Decimal.Value;
  askCost: Decimal.Value | null;
}): {readonly coverage: string | null; readonly coveragePost: string | null; readonly trace: CalculationTrace} {
  const ebitda = finite("EBITDA", input.ebitda);
  const expenses = input.financialExpenses === null ? null : finite("financial expenses", input.financialExpenses).abs();
  const coverage = expenses && expenses.gt(0) && ebitda.gt(0) ? ebitda.div(expenses) : null;
  const askAmount = finite("amount asked", input.askAmount);
  const askCost = input.askCost === null ? null : finite("cost of the amount asked", input.askCost);
  const coveragePost = coverage && expenses && askCost ? ebitda.div(expenses.plus(askAmount.times(askCost))) : null;
  return {
    coverage: coverage ? full(coverage) : null,
    coveragePost: coveragePost ? full(coveragePost) : null,
    trace: {
      id: "desk.interest_coverage",
      formula: "coverage = EBITDA / |interest expense|; with the ask = EBITDA / (|interest expense| + amount asked x its annual cost)",
      operands: {ebitda: full(ebitda), financialExpenses: expenses ? full(expenses) : "none", askAmount: full(askAmount), askCost: askCost ? full(askCost) : "none"},
      result: `coverage=${coverage ? full(coverage) : "none"}; post=${coveragePost ? full(coveragePost) : "none"}`,
    },
  };
}

/**
 * The runway a venture lender reads instead of turns: months of cash before the deal, months the
 * ticket buys, and months it buys once its own interest is paid monthly out of the same cash; debt
 * after the raise over ARR; and how far the runway the company states sits from the computed one.
 */
export function calculateVentureRunway(input: {
  cash: Decimal.Value;
  monthlyBurn: Decimal.Value;
  ask: Decimal.Value;
  assumedRate: Decimal.Value;
  grossDebt: Decimal.Value;
  arr: Decimal.Value | null;
  statedRunwayMonths: Decimal.Value | null;
}): {
  readonly monthsPre: string;
  readonly monthsPost: string;
  readonly monthsPostAfterService: string;
  /** Months the deal buys after its own interest, and before it. */
  readonly monthsBought: string;
  readonly monthsBoughtBeforeService: string;
  readonly debtAfterRaise: string;
  readonly debtToArr: string | null;
  /** |stated runway - computed runway|, when the company states one. */
  readonly statedGap: string | null;
  readonly trace: CalculationTrace;
} {
  const burn = finite("monthly burn", input.monthlyBurn);
  if (!burn.gt(0)) throw new RangeError("monthly burn must be positive");
  const cash = finite("cash", input.cash);
  const ask = finite("amount asked", input.ask);
  const rate = finite("assumed annual rate", input.assumedRate);
  const grossDebt = finite("gross debt", input.grossDebt);
  const monthsPre = cash.div(burn);
  const monthsPost = cash.plus(ask).div(burn);
  const monthlyInterest = ask.times(rate).div(12);
  const monthsPostAfterService = cash.plus(ask).div(burn.plus(monthlyInterest));
  const arr = input.arr === null ? null : finite("ARR", input.arr);
  const debtAfterRaise = grossDebt.plus(ask);
  const debtToArr = arr && arr.gt(0) ? debtAfterRaise.div(arr) : null;
  const statedGap = input.statedRunwayMonths === null ? null : finite("stated runway", input.statedRunwayMonths).minus(monthsPre).abs();
  return {
    monthsPre: full(monthsPre),
    monthsPost: full(monthsPost),
    monthsPostAfterService: full(monthsPostAfterService),
    monthsBought: full(monthsPostAfterService.minus(monthsPre)),
    monthsBoughtBeforeService: full(monthsPost.minus(monthsPre)),
    debtAfterRaise: full(debtAfterRaise),
    debtToArr: debtToArr ? full(debtToArr) : null,
    statedGap: statedGap ? full(statedGap) : null,
    trace: {
      id: "desk.runway",
      formula: "runway = cash / burn; with the ticket = (cash + ticket) / burn; after its interest = (cash + ticket) / (burn + ticket x rate / 12); debt to ARR = (gross debt + ticket) / ARR",
      operands: {cash: full(cash), monthlyBurn: full(burn), ask: full(ask), assumedRate: full(rate), grossDebt: full(grossDebt), arr: arr ? full(arr) : "none"},
      result: `pre=${full(monthsPre)}; post=${full(monthsPost)}; afterService=${full(monthsPostAfterService)}; debtToArr=${debtToArr ? full(debtToArr) : "none"}`,
    },
  };
}

/**
 * The cash cycle and what growth absorbs: days of receivables over revenue, of inventory and of
 * suppliers over the cost of goods sold, the cycle they make, the working capital next year's
 * growth absorbs at that cycle, and whether the working-capital ask exceeds twice that need.
 */
export function calculateWorkingCapitalCycle(input: {
  revenue: Decimal.Value;
  receivables: Decimal.Value;
  cogs: Decimal.Value | null;
  inventory: Decimal.Value | null;
  suppliers: Decimal.Value | null;
  nextYearRevenue: Decimal.Value | null;
  workingCapitalAsk: Decimal.Value | null;
}): {
  readonly dso: string | null;
  readonly dio: string | null;
  readonly dpo: string | null;
  readonly cycleDays: string | null;
  readonly growth: string | null;
  readonly growthAbsorption: string | null;
  /** Whether the working-capital ask exceeds twice what growth absorbs, and by how many times the need. */
  readonly askExceedsTwiceNeed: boolean;
  readonly askOverNeed: string | null;
  readonly trace: CalculationTrace;
} {
  const revenue = finite("revenue", input.revenue);
  const cogs = input.cogs === null ? null : finite("cost of goods sold", input.cogs);
  const dso = revenue.gt(0) ? finite("receivables", input.receivables).div(revenue).times(365) : null;
  const dio = cogs && input.inventory !== null ? finite("inventory", input.inventory).div(cogs).times(365) : null;
  const dpo = cogs && input.suppliers !== null ? finite("suppliers", input.suppliers).div(cogs).times(365) : null;
  const cycle = dso && dio && dpo ? dso.plus(dio).minus(dpo) : null;
  let growth: Decimal | null = null;
  let absorption: Decimal | null = null;
  let askOverNeed: Decimal | null = null;
  if (cycle && input.nextYearRevenue !== null) {
    growth = finite("next year's revenue", input.nextYearRevenue).minus(revenue);
    if (growth.gt(0)) {
      absorption = growth.times(cycle).div(365);
      if (input.workingCapitalAsk !== null) {
        const ask = finite("working-capital ask", input.workingCapitalAsk);
        if (ask.gt(absorption.times(2))) askOverNeed = ask.div(absorption);
      }
    }
  }
  const text = (value: Decimal | null) => (value ? full(value) : null);
  return {
    dso: text(dso),
    dio: text(dio),
    dpo: text(dpo),
    cycleDays: text(cycle),
    growth: text(growth),
    growthAbsorption: text(absorption),
    askExceedsTwiceNeed: askOverNeed !== null,
    askOverNeed: text(askOverNeed),
    trace: {
      id: "desk.working_capital_cycle",
      formula: "DSO = receivables / revenue x 365; DIO = inventory / COGS x 365; DPO = suppliers / COGS x 365; cycle = DSO + DIO - DPO; "
        + "absorbed = growth of revenue x cycle / 365, when revenue grows; the ask is flagged above twice what is absorbed",
      operands: {revenue: full(revenue), cogs: cogs ? full(cogs) : "none", nextYearRevenue: input.nextYearRevenue === null ? "none" : String(input.nextYearRevenue)},
      result: `cycle=${text(cycle) ?? "none"}; absorbed=${text(absorption) ?? "none"}; askOverNeed=${text(askOverNeed) ?? "none"}`,
    },
  };
}

/**
 * How free the receivables offered as security are: each line secured by receivables at a stated
 * coverage takes its balance times the coverage, a cession takes its balance, and what is left of
 * the base (never below zero) is free; the working-capital ask is read against it.
 */
export function calculateReceivablesEncumbrance(input: {
  base: Decimal.Value;
  lines: ReadonlyArray<{balance: Decimal.Value; coverage: Decimal.Value | null; cession: boolean}>;
  workingCapitalAsk: Decimal.Value | null;
}): {readonly encumbered: string; readonly free: string; readonly askAgainstFree: string | null; readonly trace: CalculationTrace} {
  const base = finite("receivables base", input.base);
  const encumbered = input.lines.reduce((sum, line, index) => {
    if (line.coverage !== null) return sum.plus(finite(`balance of line ${index + 1}`, line.balance).times(finite(`coverage of line ${index + 1}`, line.coverage)));
    return line.cession ? sum.plus(finite(`balance of line ${index + 1}`, line.balance)) : sum;
  }, ZERO);
  const free = Decimal.max(base.minus(encumbered), 0);
  const askAgainstFree = input.workingCapitalAsk !== null && free.gt(0) ? finite("working-capital ask", input.workingCapitalAsk).div(free) : null;
  return {
    encumbered: full(encumbered),
    free: full(free),
    askAgainstFree: askAgainstFree ? full(askAgainstFree) : null,
    trace: {
      id: "desk.receivables_encumbrance",
      formula: "encumbered = sum(balance x coverage) of lines secured by receivables + balance of lines with receivables ceded; free = max(base - encumbered, 0); ask against free = ask / free",
      operands: {base: full(base), lines: String(input.lines.length), workingCapitalAsk: input.workingCapitalAsk === null ? "none" : String(input.workingCapitalAsk)},
      result: `encumbered=${full(encumbered)}; free=${full(free)}; askAgainstFree=${askAgainstFree ? full(askAgainstFree) : "none"}`,
    },
  };
}

/** Whether the rate a company asks sits at or below the stack's weighted cost plus a tolerance: new money asking less than the stock costs. */
export function testRateAskAgainstStack(input: {askRate: Decimal.Value; stackCost: Decimal.Value; tolerance: Decimal.Value}): {
  readonly atOrBelowStack: boolean;
  readonly limit: string;
  readonly trace: CalculationTrace;
} {
  const ask = finite("rate asked", input.askRate);
  const stack = finite("stack's weighted cost", input.stackCost);
  const tolerance = finite("tolerance", input.tolerance);
  const limit = stack.plus(tolerance);
  const atOrBelowStack = ask.lte(limit);
  return {
    atOrBelowStack,
    limit: full(limit),
    trace: {id: "desk.rate_ask_vs_stack", formula: "flagged when the rate asked <= the stack's weighted cost + tolerance", operands: {askRate: full(ask), stackCost: full(stack), tolerance: full(tolerance)}, result: atOrBelowStack ? "at_or_below_stack" : "above_stack"},
  };
}

// The trajectory ---------------------------------------------------------------------------------

/**
 * Proceeds that repay existing debt leave the stack on day one, nearest maturity first: a company
 * pays down what is about to fall due, which is why it raises. The refinancing is capped at the
 * stack; each line keeps what is left of it, at cents, in the order given.
 */
export function allocateRefinancingNearestFirst(input: {lines: ReadonlyArray<{balance: Decimal.Value; maturity: string | null}>; refinancing: Decimal.Value}): {
  readonly existingTotal: string;
  readonly refinancing: string;
  readonly remaining: readonly string[];
  readonly trace: CalculationTrace;
} {
  const balances = input.lines.map((line, index) => finite(`balance of line ${index + 1}`, line.balance));
  const existingTotal = balances.reduce((sum, balance) => sum.plus(balance), ZERO);
  const refinancing = Decimal.min(finite("refinancing", input.refinancing), existingTotal);
  const order = input.lines.map((_, index) => index)
    .sort((a, b) => (input.lines[a]!.maturity ?? "9999-12-31").localeCompare(input.lines[b]!.maturity ?? "9999-12-31"));
  const redeemed: Array<Decimal | null> = balances.map(() => null);
  let toRedeem = refinancing;
  for (const index of order) {
    if (toRedeem.lte(0)) break;
    const take = Decimal.min(toRedeem, balances[index]!);
    redeemed[index] = take;
    toRedeem = toRedeem.minus(take);
  }
  const remaining = balances.map((balance, index) => balance.minus(redeemed[index] ?? 0).toFixed(2));
  return {
    existingTotal: full(existingTotal),
    refinancing: full(refinancing),
    remaining,
    trace: {
      id: "desk.refinancing_redemption",
      formula: "refinancing = min(refinancing, stack); redeemed nearest maturity first, a line without maturity last; each line keeps its balance less what it redeems, at cents",
      operands: {refinancing: String(input.refinancing), stack: full(existingTotal)},
      result: `redeemed=${redeemed.map((value) => (value ? full(value) : "0")).join(", ")}`,
    },
  };
}

export type LeveragePathYear = {
  year: number;
  existingDebt: string;
  newDebt: string;
  netDebt: string;
  ebitdaBase: string;
  ebitdaStressed: string;
  leverageBase: string;
  leverageStressed: string;
  principalDue: string;
  scheduleStrain: string;
};

/**
 * Leverage year by year once a new loan lands: existing lines run to their own schedules (linear to
 * maturity when they amortise, bullets otherwise, flat when they state no maturity), the new loan is
 * flat through grace and SAC afterwards, cash is held flat, and EBITDA is the company's projection
 * and a stressed one that believes only part of the growth over the audited base. Amounts at cents
 * and ratios at four decimals, as the trajectory publishes them. Then the peak (the highest stressed
 * leverage, the first year among equals), the first year under each existing ceiling, and the
 * covenant step-down: the stressed leverage plus a cushion, up to the next quarter turn, never below
 * a floor.
 */
export function projectLeveragePath(input: {
  /** year x 12 + month - 1 of the reference date, which is also the disbursement. */
  referenceMonth: number;
  cash: Decimal.Value;
  newDebt: {amount: Decimal.Value; termMonths: number; graceMonths: number};
  lines: ReadonlyArray<{balance: Decimal.Value; maturityMonth: number | null; amortizes: boolean}>;
  auditedEbitda: Decimal.Value;
  growthHaircut: Decimal.Value;
  covenantCushion: Decimal.Value;
  covenantFloor: Decimal.Value;
  years: ReadonlyArray<{year: number; ebitda: Decimal.Value}>;
  ceilings: readonly Decimal.Value[];
}): {
  readonly years: readonly LeveragePathYear[];
  readonly peakIndex: number;
  readonly ceilings: readonly string[];
  readonly crossings: ReadonlyArray<{maximum: string; yearBase: number | null; yearStressed: number | null}>;
  readonly covenantProposal: ReadonlyArray<{year: number; maximum: string}>;
  readonly trace: CalculationTrace;
} {
  if (input.years.length === 0) throw new RangeError("the trajectory needs at least one projected year");
  const reference = input.referenceMonth;
  const cash = finite("cash", input.cash);
  const amount = finite("new debt", input.newDebt.amount);
  const audited = finite("audited EBITDA", input.auditedEbitda);
  const haircut = finite("growth haircut", input.growthHaircut);
  const cushion = finite("covenant cushion", input.covenantCushion);
  const floor = finite("covenant floor", input.covenantFloor);
  const lines = input.lines.map((line, index) => ({...line, balance: finite(`balance of line ${index + 1}`, line.balance)}));

  const existingAt = (line: (typeof lines)[number], at: number): Decimal => {
    if (at <= reference) return line.balance;
    if (line.maturityMonth === null) return line.balance;
    if (at >= line.maturityMonth) return new Decimal(0);
    if (!line.amortizes) return line.balance;
    const total = line.maturityMonth - reference;
    const elapsed = at - reference;
    return line.balance.times(total - elapsed).div(total);
  };
  const newDebtAt = (at: number): Decimal => {
    if (at <= reference) return amount;
    const amortMonths = input.newDebt.termMonths - input.newDebt.graceMonths;
    const amortised = Math.min(Math.max(at - reference - input.newDebt.graceMonths, 0), amortMonths);
    return amount.times(amortMonths - amortised).div(amortMonths);
  };

  const years: LeveragePathYear[] = input.years.map(({year, ebitda}) => {
    const at = year * 12 + 11; // December of the year.
    const previous = Math.max((year - 1) * 12 + 11, reference);
    const existingNow = lines.reduce((sum, line) => sum.plus(existingAt(line, at)), new Decimal(0));
    const existingPrevious = lines.reduce((sum, line) => sum.plus(existingAt(line, previous)), new Decimal(0));
    const newNow = newDebtAt(at);
    const newPrevious = newDebtAt(previous);
    const netDebt = existingNow.plus(newNow).minus(cash);
    const base = finite(`EBITDA of ${year}`, ebitda);
    const stressed = audited.plus(Decimal.max(base.minus(audited), 0).times(new Decimal(1).minus(haircut)));
    const principalDue = existingPrevious.minus(existingNow).plus(newPrevious.minus(newNow));
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

  const peakIndex = years.reduce((peak, row, index) => (new Decimal(row.leverageStressed).gt(years[peak]!.leverageStressed) ? index : peak), 0);
  const ceilings = [...new Set(input.ceilings.map((ceiling, index) => finite(`ceiling ${index + 1}`, ceiling).toFixed(4)))]
    .sort((a, b) => new Decimal(a).comparedTo(b));
  const crossings = ceilings.map((maximum) => ({
    maximum,
    yearBase: years.find((row) => new Decimal(row.leverageBase).lte(maximum))?.year ?? null,
    yearStressed: years.find((row) => new Decimal(row.leverageStressed).lte(maximum))?.year ?? null,
  }));
  const covenantProposal = years.map((row) => {
    const stepped = new Decimal(row.leverageStressed).plus(cushion);
    const rounded = stepped.times(4).ceil().div(4); // to the nearest upper quarter turn
    return {year: row.year, maximum: Decimal.max(rounded, floor).toFixed(2)};
  });

  return {
    years,
    peakIndex,
    ceilings,
    crossings,
    covenantProposal,
    trace: {
      id: "desk.leverage_path",
      formula: "per year-end: existing = own schedule (linear to maturity when amortising); new = flat through grace, SAC after; net debt = existing + new - cash; "
        + "stressed EBITDA = audited + max(projected - audited, 0) x (1 - haircut); leverage = net debt / EBITDA; principal due = fall of the balances in the year; strain = principal due / EBITDA; "
        + "peak = highest stressed leverage, the first year among equals; crossing = first year at or under each ceiling; covenant = max(ceil((stressed + cushion) x 4) / 4, floor)",
      operands: {cash: full(cash), newDebt: full(amount), termMonths: String(input.newDebt.termMonths), graceMonths: String(input.newDebt.graceMonths), auditedEbitda: full(audited), growthHaircut: full(haircut), covenantCushion: full(cushion), covenantFloor: full(floor)},
      result: `peak=${years[peakIndex]!.year}:${years[peakIndex]!.leverageStressed}; covenant=${covenantProposal.map((step) => `${step.year}:${step.maximum}`).join(", ")}`,
    },
  };
}

/**
 * Liability management: the part of a ticket that redeems existing debt at disbursement (the
 * covenanted lines taken out, or the refinancing the room states) and the new money left, and net
 * leverage once the structure lands on the audited EBITDA, on the same base as leverage today: the
 * debt before, less what is redeemed, plus the ticket. Every term is an amount in cents, so the sum
 * is exact at 40 significant digits in any order.
 */
export function calculateLiabilityManagement(input: {
  ticket: Decimal.Value;
  redeemed: readonly Decimal.Value[];
  grossDebtBefore: Decimal.Value;
  cash: Decimal.Value;
  ebitda: Decimal.Value;
}): {readonly redeemed: string; readonly netNewMoney: string; readonly leverageAfter: string; readonly trace: CalculationTrace} {
  const ticket = finite("ticket", input.ticket);
  const redeemed = input.redeemed.reduce<Decimal>((sum, value, index) => sum.plus(finite(`redeemed ${index + 1}`, value)), new Decimal(0));
  const before = finite("gross debt before", input.grossDebtBefore);
  const cash = finite("cash", input.cash);
  const ebitda = finite("EBITDA", input.ebitda);
  const netNewMoney = ticket.minus(redeemed);
  const after = before.minus(redeemed).plus(ticket);
  const leverageAfter = after.minus(cash).div(ebitda);
  return {
    redeemed: full(redeemed),
    netNewMoney: full(netNewMoney),
    leverageAfter: full(leverageAfter),
    trace: {
      id: "desk.liability_management",
      formula: "new money = ticket - redeemed; leverage after = (gross debt before - redeemed + ticket - cash) / EBITDA",
      operands: {ticket: full(ticket), redeemed: full(redeemed), grossDebtBefore: full(before), cash: full(cash), ebitda: full(ebitda)},
      result: `newMoney=${full(netNewMoney)}; leverageAfter=${full(leverageAfter)}`,
    },
  };
}
