import Decimal from "decimal.js";

import type {CalculationTrace} from "./credit-math";
import {finiteFigure as finite, fullFigure as full, parseFigure} from "./figure-input";

/**
 * The arithmetic of the credit review (stage 19, third polish).
 *
 * `@offroad/credit-analysis` reads the rates, covenants and receivables coverage a debt schedule
 * writes in prose, builds the desk's inputs from reconciled facts, rates the credit on the desk's
 * ten-grade scale and runs the stress table a committee reads before it prices. Every figure of that
 * work is computed here, in Decimal at 40 significant digits with half-up rounding, with a trace
 * naming the formula and the operands; the package keeps the grammar of the prose it reads, the
 * scale's thresholds and weights as data, and the sentences.
 *
 * Figures are full-precision decimal strings unless the kernel states the precision it applies. A
 * value received that is not a finite decimal number is refused, never read as zero; a figure read
 * from a document or a fact that is not one is handed on as null, so the reading becomes an open
 * question instead of a number.
 */
export const creditReviewArithmeticVersion = "2026.09.27-v1";

// The same arithmetic contract the package root declares, so a kernel imported on its own computes
// exactly what it computes inside the review.
Decimal.set({precision: 40, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -30, toExpPos: 30});

const ZERO = new Decimal(0);

// Figures written in a document -----------------------------------------------------------------

/** Digits grouped by dots in threes, the first group without a leading zero, and the decimals after a comma: "1.234,5". */
const groupedFigure = /^[1-9]\d{0,2}(?:\.\d{3})+(?:,\d+)?$/;
/** Digits without grouping and the decimals after a comma: "4,10", "130". */
const plainFigure = /^\d+(?:,\d+)?$/;
/** A single dot that cannot group thousands (it is not followed by exactly three digits of a valid group): "4.10", "3.0". */
const pointFigure = /^\d+\.\d+$/;

export type DocumentFigure = {
  /** The figure in decimal notation, its digits as the document writes them ("3,0" is "3.0"), or null when the text is not a figure. */
  readonly value: string | null;
  readonly trace: CalculationTrace;
};

/**
 * A figure as a Brazilian document writes it: dots group the thousands in threes and a comma marks
 * the decimals ("1.234,5" is 1234.5, "4,10" is 4.10). A single dot that cannot group thousands can
 * only mark the decimals ("4.10" is 4.10, never 410). Any other text (two commas, a group that is
 * not three digits, a separator at either end) is not a figure, and the reading is null.
 */
export function readDocumentFigure(input: {text: string}): DocumentFigure {
  const text = input.text;
  let value: string | null = null;
  let notation = "not a figure";
  if (groupedFigure.test(text)) {
    value = text.replace(/\./g, "").replace(",", ".");
    notation = "grouped thousands";
  } else if (plainFigure.test(text)) {
    value = text.replace(",", ".");
    notation = "no grouping";
  } else if (pointFigure.test(text)) {
    value = text;
    notation = "decimal point";
  }
  return {
    value,
    trace: {
      id: "review.document_figure",
      formula: "dots group thousands in threes and a comma marks the decimals; a single dot that cannot group thousands marks the decimals; any other text is not a figure",
      operands: {text, notation},
      result: value ?? "not a figure",
    },
  };
}

/**
 * A percentage written in a document as a decimal fraction, rounded half-up to `decimals` places:
 * "4,10" is 0.041000 at six places, "130" is 1.3000 at four. Null when the text is not a figure.
 */
export function readDocumentPercent(input: {text: string; decimals: number}): DocumentFigure {
  if (!Number.isInteger(input.decimals) || input.decimals < 0 || input.decimals > 20) throw new RangeError("decimals must be an integer between 0 and 20");
  const figure = readDocumentFigure({text: input.text}).value;
  const value = figure === null ? null : new Decimal(figure).div(100).toFixed(input.decimals, Decimal.ROUND_HALF_UP);
  return {
    value,
    trace: {
      id: "review.document_percent",
      formula: `percentage read as a document writes it / 100, half-up to ${input.decimals} decimals`,
      operands: {text: input.text, figure: figure ?? "not a figure"},
      result: value ?? "not a figure",
    },
  };
}

/**
 * The annual rate a monthly rate compounds to: (1 + monthly rate)^12 - 1. A rate of 1.42% a month is
 * 18.44% a year, not 17.04%: the gap a schedule kept by hand leaves out in the company's favour.
 */
export function annualRateForMonthlyRate(input: {monthlyRate: Decimal.Value}): {readonly value: string; readonly trace: CalculationTrace} {
  const monthly = finite("monthly rate", input.monthlyRate);
  const annual = monthly.plus(1).pow(12).minus(1);
  return {
    value: full(annual),
    trace: {id: "review.monthly_compounding", formula: "annual = (1 + monthly rate)^12 - 1", operands: {monthlyRate: full(monthly)}, result: full(annual)},
  };
}

// Figures stated as facts -----------------------------------------------------------------------

/**
 * A figure a reconciled fact states, surrounding spaces aside, in decimal notation (the notation of
 * every kernel): the figure, or null when the text is not a finite decimal number.
 */
export function readFactFigure(input: {text: string}): {readonly value: string | null; readonly trace: CalculationTrace} {
  const parsed = parseFigure(input.text.trim());
  const value = parsed ? full(parsed) : null;
  return {
    value,
    trace: {id: "review.fact_figure", formula: "the fact's text, surrounding spaces aside, read in decimal notation", operands: {text: input.text}, result: value ?? "not a figure"},
  };
}

/**
 * A count of months a fact states, as the number the trajectory reads: null when the text is not a
 * finite decimal number (an empty text is no count, never zero months).
 */
export function readMonthCount(input: {text: string}): {readonly value: number | null; readonly trace: CalculationTrace} {
  const figure = readFactFigure({text: input.text}).value;
  const value = figure === null ? null : new Decimal(figure).toNumber();
  return {
    value,
    trace: {id: "review.month_count", formula: "the fact's count of months, read in decimal notation", operands: {text: input.text}, result: value === null ? "not a figure" : String(value)},
  };
}

/**
 * The largest of the amounts stated for one request, compared exactly: the amount as stated, and its
 * position. On a tie the first stated wins, so the documents keep precedence over the product's form.
 */
export function selectLargestAmount(input: {amounts: readonly Decimal.Value[]}): {readonly value: Decimal.Value; readonly index: number; readonly trace: CalculationTrace} {
  if (input.amounts.length === 0) throw new RangeError("at least one amount is required");
  const figures = input.amounts.map((amount, index) => finite(`amount ${index + 1}`, amount));
  let index = 0;
  figures.forEach((figure, position) => {
    if (figure.gt(figures[index]!)) index = position;
  });
  return {
    value: input.amounts[index]!,
    index,
    trace: {
      id: "review.largest_amount",
      formula: "the largest amount, compared exactly; the first stated on a tie",
      operands: Object.fromEntries(figures.map((figure, position) => [`amount${position + 1}`, full(figure)])),
      result: full(figures[index]!),
    },
  };
}

// The internal rating ---------------------------------------------------------------------------

/**
 * Interest coverage as the rating reads it: EBITDA over the magnitude of the year's interest
 * expense. Not computed (null) when the expense is zero.
 */
export function calculateRatingCoverage(input: {ebitda: Decimal.Value; financialExpenses: Decimal.Value}): {readonly value: string | null; readonly trace: CalculationTrace} {
  const ebitda = finite("EBITDA", input.ebitda);
  const expenses = finite("financial expenses", input.financialExpenses).abs();
  const coverage = expenses.gt(0) ? ebitda.div(expenses) : null;
  return {
    value: coverage ? full(coverage) : null,
    trace: {
      id: "rating.interest_coverage",
      formula: "coverage = EBITDA / |interest expense|; not computed over a zero expense",
      operands: {ebitda: full(ebitda), financialExpenses: full(expenses)},
      result: coverage ? full(coverage) : "not computed (zero expense)",
    },
  };
}

/** The direction of EBITDA: (current - prior) / |prior|. Not computed (null) over a prior year of zero. */
export function calculateEbitdaTrend(input: {current: Decimal.Value; prior: Decimal.Value}): {readonly value: string | null; readonly trace: CalculationTrace} {
  const current = finite("current EBITDA", input.current);
  const prior = finite("prior EBITDA", input.prior);
  const growth = prior.isZero() ? null : current.minus(prior).div(prior.abs());
  return {
    value: growth ? full(growth) : null,
    trace: {
      id: "rating.ebitda_trend",
      formula: "growth = (current EBITDA - prior EBITDA) / |prior EBITDA|; not computed over a prior of zero",
      operands: {current: full(current), prior: full(prior)},
      result: growth ? full(growth) : "not computed (zero prior)",
    },
  };
}

export type RatingBand = {readonly limit: Decimal.Value; readonly points: number};

/**
 * The points a factor earns against its bands, compared exactly. `at_most`: the first band whose
 * limit the value does not exceed wins (ascending ceilings). `at_least`: the last band whose limit the
 * value reaches wins (ascending floors). A value no band admits earns `otherwise`.
 */
export function scoreRatingFactor(input: {value: Decimal.Value; bands: readonly RatingBand[]; reading: "at_most" | "at_least"; otherwise: number}): {readonly points: number; readonly trace: CalculationTrace} {
  const value = finite("factor value", input.value);
  const limits = input.bands.map((band, index) => ({limit: finite(`band ${index + 1} limit`, band.limit), points: band.points}));
  let points = input.otherwise;
  if (input.reading === "at_most") {
    const band = limits.find((entry) => value.lte(entry.limit));
    if (band) points = band.points;
  } else {
    for (const entry of limits) if (value.gte(entry.limit)) points = entry.points;
  }
  return {
    points,
    trace: {
      id: "rating.factor_points",
      formula: input.reading === "at_most"
        ? "points of the first band whose ceiling the value does not exceed; otherwise the floor points"
        : "points of the last band whose floor the value reaches; otherwise the floor points",
      operands: {value: full(value), bands: limits.map((entry) => `${full(entry.limit)}:${entry.points}`).join(", "), otherwise: String(input.otherwise)},
      result: String(points),
    },
  };
}

/**
 * The grade of the internal rating from its assessable factors: the score is the weighted points
 * over the most the assessable factors allow, times 100, half-up to a whole number (0 when nothing is
 * assessable); the grade is 10 - floor(score / 11.2), between 1 and 10, one grade for each 11.2 points
 * from grade 10 at a score of 0 (a score of 100 is grade 2); a critical leverage or runway floors it
 * at 8.
 */
export function gradeInternalRating(input: {factors: ReadonlyArray<{points: number | null; weight: number}>; floorAtEight: boolean}): {
  readonly score: number;
  readonly grade: number;
  readonly assessed: number;
  readonly trace: CalculationTrace;
} {
  const assessable = input.factors.filter((factor) => factor.points !== null);
  const earned = assessable.reduce((sum, factor) => sum.plus(finite("factor points", factor.points!).times(finite("factor weight", factor.weight))), ZERO);
  const possible = assessable.reduce((sum, factor) => sum.plus(finite("factor weight", factor.weight).times(4)), ZERO);
  const score = possible.gt(0) ? earned.times(100).div(possible).toDecimalPlaces(0, Decimal.ROUND_HALF_UP) : ZERO;
  const stepped = Decimal.min(10, Decimal.max(1, new Decimal(10).minus(score.div("11.2").floor())));
  const grade = input.floorAtEight ? Decimal.max(stepped, 8) : stepped;
  return {
    score: score.toNumber(),
    grade: grade.toNumber(),
    assessed: assessable.length,
    trace: {
      id: "rating.grade",
      formula: "score = weighted points / (4 x weights assessed) x 100, half-up to a whole number; grade = 10 - floor(score / 11.2), between 1 and 10; at least 8 when a critical leverage or runway floors it",
      operands: {earned: full(earned), possible: full(possible), floorAtEight: String(input.floorAtEight)},
      result: `score=${full(score)}; grade=${full(grade)}`,
    },
  };
}

// The stress table ------------------------------------------------------------------------------

export type StressScenarioId = "ebitda_minus_20" | "ebitda_minus_30" | "cdi_plus_300" | "cycle_plus_15" | "top_customer_lost";

export type StressScenarioFigures = {
  readonly id: StressScenarioId;
  /** EBITDA after the shock. */
  readonly ebitda: string;
  /** Leverage after the shock (post-transaction net debt over the shocked EBITDA); null when that EBITDA is not positive. */
  readonly leverage: string | null;
  /** Interest on the post-transaction gross debt at the shocked cost; null when no cost is known. */
  readonly annualInterest: string | null;
  /** Working capital the shock absorbs; null when the shock absorbs none or revenue is not stated. */
  readonly workingCapitalNeed: string | null;
  /** New money the tightest covenant still admits after the shock; null without a covenant or a positive EBITDA. */
  readonly covenantHeadroom: string | null;
  /** Whether the shocked leverage breaks the tightest covenant; null when either is absent. */
  readonly breachesCovenant: boolean | null;
};

/**
 * The stress table a committee reads before it prices, on the desk's own numbers: EBITDA down 20% and
 * 30%, the CDI up 300 basis points passed in full to the stack's cost, the cash cycle 15 days longer
 * (15/365 of the year's revenue absorbed in working capital) and the largest customer gone (its share
 * of revenue times the contribution margin lost, off EBITDA). The transaction amount is the one
 * stated, or the largest of the desk's scenarios (never below zero).
 */
export function calculateStressTable(input: {
  ebitda: Decimal.Value;
  netDebtPre: Decimal.Value;
  grossDebt: Decimal.Value;
  amount: Decimal.Value | null;
  scenarioAmounts: readonly Decimal.Value[];
  covenantCeiling: Decimal.Value | null;
  weightedCost: Decimal.Value | null;
  cdi: Decimal.Value;
  cycleDays: Decimal.Value | null;
  revenue: Decimal.Value | null;
  topCustomerShare: Decimal.Value | null;
  lostCustomerMargin: Decimal.Value;
}): {
  readonly amount: string;
  readonly netDebtPost: string;
  readonly grossDebtPost: string;
  /** The CDI after the 300 basis-point shock. */
  readonly shockedCdi: string;
  /** The cash cycle after the 15-day shock; null when the cycle is not stated. */
  readonly shockedCycleDays: string | null;
  readonly scenarios: readonly StressScenarioFigures[];
  readonly trace: CalculationTrace;
} {
  const ebitda = finite("EBITDA", input.ebitda);
  const amount = input.amount !== null
    ? finite("transaction amount", input.amount)
    : input.scenarioAmounts.reduce<Decimal>((max, value, index) => {
      const scenario = finite(`scenario amount ${index + 1}`, value);
      return scenario.gt(max) ? scenario : max;
    }, ZERO);
  const netDebtPost = finite("net debt", input.netDebtPre).plus(amount);
  const grossDebtPost = finite("gross debt", input.grossDebt).plus(amount);
  const ceiling = input.covenantCeiling === null ? null : finite("covenant ceiling", input.covenantCeiling);
  const cost = input.weightedCost === null ? null : finite("weighted cost", input.weightedCost);
  const cdi = finite("CDI", input.cdi);
  const cycle = input.cycleDays === null ? null : finite("cash cycle", input.cycleDays);
  const revenue = input.revenue === null ? null : finite("revenue", input.revenue);
  const share = input.topCustomerShare === null ? null : finite("largest customer's share", input.topCustomerShare);
  const margin = finite("contribution margin lost", input.lostCustomerMargin);
  const lost = share && revenue ? revenue.times(share).times(margin) : null;

  const scenario = (id: StressScenarioId, shocked: Decimal, shockedCost: Decimal | null, workingCapitalNeed: Decimal | null): StressScenarioFigures => {
    const leverage = shocked.gt(0) ? netDebtPost.div(shocked) : null;
    const headroom = ceiling && shocked.gt(0) ? ceiling.times(shocked).minus(netDebtPost) : null;
    return {
      id,
      ebitda: full(shocked),
      leverage: leverage ? full(leverage) : null,
      annualInterest: shockedCost ? full(grossDebtPost.times(shockedCost)) : null,
      workingCapitalNeed: workingCapitalNeed ? full(workingCapitalNeed) : null,
      covenantHeadroom: headroom ? full(headroom) : null,
      breachesCovenant: leverage && ceiling ? leverage.gt(ceiling) : null,
    };
  };

  const scenarios = [
    scenario("ebitda_minus_20", ebitda.times("0.8"), cost, null),
    scenario("ebitda_minus_30", ebitda.times("0.7"), cost, null),
    scenario("cdi_plus_300", ebitda, cost ? cost.plus("0.03") : null, null),
    scenario("cycle_plus_15", ebitda, cost, revenue ? revenue.times(15).div(365) : null),
    scenario("top_customer_lost", lost ? ebitda.minus(lost) : ebitda, cost, null),
  ];
  const shockedCdi = cdi.plus("0.03");
  const shockedCycle = cycle ? cycle.plus(15) : null;
  return {
    amount: full(amount),
    netDebtPost: full(netDebtPost),
    grossDebtPost: full(grossDebtPost),
    shockedCdi: full(shockedCdi),
    shockedCycleDays: shockedCycle ? full(shockedCycle) : null,
    scenarios,
    trace: {
      id: "stress.table",
      formula: "net debt and gross debt after the amount; EBITDA x 0.8 and x 0.7; cost + 0.03; revenue x 15 / 365 absorbed; EBITDA - revenue x largest share x margin lost; "
        + "leverage = net debt after / shocked EBITDA when positive; interest = gross debt after x cost; headroom = ceiling x shocked EBITDA - net debt after; breach when leverage > ceiling",
      operands: {
        ebitda: full(ebitda), amount: full(amount), netDebtPre: String(input.netDebtPre), grossDebt: String(input.grossDebt),
        covenantCeiling: ceiling ? full(ceiling) : "none", weightedCost: cost ? full(cost) : "none", cdi: full(cdi),
        revenue: revenue ? full(revenue) : "none", topCustomerShare: share ? full(share) : "none", lostCustomerMargin: full(margin),
      },
      result: scenarios.map((entry) => `${entry.id}: leverage=${entry.leverage ?? "none"}`).join("; "),
    },
  };
}
