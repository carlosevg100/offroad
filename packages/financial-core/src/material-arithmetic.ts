import Decimal from "decimal.js";

import type {CalculationTrace} from "./credit-math";

/**
 * The arithmetic of the governed credit materials (stage 19, increment 6).
 *
 * `@offroad/case-materials` assembles the documents a company takes to market; every number it
 * prints that is not a value it received (a sum, a difference, a share, a tolerance test, a unit or
 * precision conversion) is computed here, in Decimal, with a trace naming the formula and the
 * operands. Two kinds of kernel live in this file:
 *
 * - computations, which create a financial figure (the new instrument's amount, the concentration
 *   of the leading customers, the EBITDA adjustments, the tie-out of the debt schedule); and
 * - presentation conversions, which print a figure in another unit or at a stated precision
 *   (percent, millions, basis points as percent, half-up rounding) and, at the very edge, hand an
 *   exact decimal to the binary number that `Intl.NumberFormat` and a chart point require.
 *
 * Figures are full-precision decimal strings (`Decimal#toFixed()` without rounding) unless the
 * kernel is a rounding one. A value that is not a finite decimal number is refused, never read as
 * zero.
 */
export const materialArithmeticVersion = "2026.09.26-v1";

// The same arithmetic contract the package root declares, so a kernel imported on its own computes
// exactly what it computes inside a published material.
Decimal.set({precision: 40, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -30, toExpPos: 30});

export type MaterialFigure = {readonly value: string; readonly trace: CalculationTrace};

const decimalText = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

function parse(value: Decimal.Value): Decimal | null {
  if (typeof value === "string" && !decimalText.test(value)) return null;
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  const parsed = new Decimal(value);
  return parsed.isFinite() ? parsed : null;
}

function finite(label: string, value: Decimal.Value): Decimal {
  const parsed = parse(value);
  if (!parsed) throw new RangeError(`${label} must be a finite decimal number`);
  return parsed;
}

const full = (value: Decimal) => value.toFixed();

// Computations ---------------------------------------------------------------------------------

/**
 * The amount of the new instrument in a liability-management structure: the balance of the
 * covenanted lines it takes out plus the net new money for the company's plan. Sources equal uses by
 * construction, which is why the sources-and-uses table states it once.
 */
export function calculateNewInstrumentAmount(input: {covenantedBalance: Decimal.Value; netNewMoney: Decimal.Value}): MaterialFigure {
  const takeout = finite("covenanted balance", input.covenantedBalance);
  const newMoney = finite("net new money", input.netNewMoney);
  const amount = takeout.plus(newMoney);
  return {
    value: full(amount),
    trace: {
      id: "material.new_instrument_amount",
      formula: "new instrument = covenanted balance taken out + net new money",
      operands: {covenantedBalance: full(takeout), netNewMoney: full(newMoney)},
      result: full(amount),
    },
  };
}

export type CustomerConcentration = {
  /** Sum of the first `leading` shares in the order the source ranks them. */
  readonly leadingTotal: string;
  /** The largest share; among equal shares, the first one listed. Null for an empty list. */
  readonly largest: {readonly id: string; readonly share: string} | null;
  /** Every id, largest share first; equal shares keep the order the source lists them in. */
  readonly ranking: readonly string[];
  readonly trace: CalculationTrace;
};

/**
 * Customer concentration as a diligence answer states it: the share of the leading customers,
 * summed in the ranking the source declares (customer 1 is the source's largest), and the largest
 * single share, compared exactly. The ranking by share is stable, so a tie never reorders the
 * customers the source listed first.
 */
export function calculateCustomerConcentration(input: {shares: ReadonlyArray<{id: string; share: Decimal.Value}>; leading: number}): CustomerConcentration {
  if (!Number.isInteger(input.leading) || input.leading < 1) throw new RangeError("leading count must be a positive integer");
  const shares = input.shares.map((entry) => ({id: entry.id, share: finite(`share of ${entry.id}`, entry.share)}));
  const leadingTotal = shares.slice(0, input.leading).reduce((sum, entry) => sum.plus(entry.share), new Decimal(0));
  const ranked = shares.map((entry, index) => ({...entry, index}))
    .sort((a, b) => b.share.comparedTo(a.share) || a.index - b.index);
  const largest = ranked[0] ? {id: ranked[0].id, share: full(ranked[0].share)} : null;
  return {
    leadingTotal: full(leadingTotal),
    largest,
    ranking: ranked.map((entry) => entry.id),
    trace: {
      id: "material.customer_concentration",
      formula: "leading total = sum of the first N shares in the declared ranking; largest = maximum share, the first listed among equals",
      operands: {leading: String(input.leading), ...Object.fromEntries(shares.map((entry) => [entry.id, full(entry.share)]))},
      result: `leadingTotal=${full(leadingTotal)}; largest=${largest ? `${largest.id}:${largest.share}` : "none"}`,
    },
  };
}

/** Adjustments between reported and adjusted EBITDA: the signed difference and its magnitude. */
export function calculateEbitdaAdjustments(input: {adjustedEbitda: Decimal.Value; reportedEbitda: Decimal.Value}): MaterialFigure & {readonly magnitude: string} {
  const adjusted = finite("adjusted EBITDA", input.adjustedEbitda);
  const reported = finite("reported EBITDA", input.reportedEbitda);
  const difference = adjusted.minus(reported);
  return {
    value: full(difference),
    magnitude: full(difference.abs()),
    trace: {
      id: "material.ebitda_adjustments",
      formula: "adjustments = adjusted EBITDA - reported EBITDA; magnitude = |adjustments|",
      operands: {adjustedEbitda: full(adjusted), reportedEbitda: full(reported)},
      result: full(difference),
    },
  };
}

export type ScheduleTieOut = {
  readonly outcome: "within_tolerance" | "outside_tolerance";
  /** |balance - schedule|. */
  readonly magnitude: string;
  /** tolerance x total debt on the balance sheet. */
  readonly limit: string;
  /** Which side carries the difference: debt on the balance sheet that the schedule misses, or the reverse. */
  readonly side: "balance_above_schedule" | "schedule_above_balance";
  readonly trace: CalculationTrace;
};

/**
 * Whether the debt schedule ties to the balance sheet: the gap (balance minus schedule) is within
 * the tolerance when its magnitude does not exceed the tolerance times the debt on the balance
 * sheet. A gap exactly at the limit is within it.
 */
export function testScheduleTieOut(input: {scheduleGap: Decimal.Value; totalOnBalance: Decimal.Value; tolerance: Decimal.Value}): ScheduleTieOut {
  const gap = finite("schedule gap", input.scheduleGap);
  const balance = finite("debt on the balance sheet", input.totalOnBalance);
  const tolerance = finite("tolerance", input.tolerance);
  if (tolerance.isNegative()) throw new RangeError("tolerance must not be negative");
  const limit = balance.times(tolerance);
  const within = gap.abs().lte(limit);
  return {
    outcome: within ? "within_tolerance" : "outside_tolerance",
    magnitude: full(gap.abs()),
    limit: full(limit),
    side: gap.gt(0) ? "balance_above_schedule" : "schedule_above_balance",
    trace: {
      id: "material.schedule_tie_out",
      formula: "within when |balance - schedule| <= tolerance x debt on the balance sheet",
      operands: {scheduleGap: full(gap), totalOnBalance: full(balance), tolerance: full(tolerance)},
      result: within ? "within_tolerance" : "outside_tolerance",
    },
  };
}

// Presentation conversions ---------------------------------------------------------------------

export type PresentationScale = "unit" | "percent" | "millions" | "basis_points_as_percent";

const scales: Record<PresentationScale, {apply: (value: Decimal) => Decimal; formula: string}> = {
  unit: {apply: (value) => value, formula: "value"},
  percent: {apply: (value) => value.times(100), formula: "value x 100"},
  millions: {apply: (value) => value.div(1_000_000), formula: "value / 1,000,000"},
  basis_points_as_percent: {apply: (value) => value.div(100), formula: "basis points / 100"},
};

/**
 * A figure in the unit and at the precision a document prints it: scaled exactly, then rounded half
 * away from zero to `decimals` places when a precision is stated. Rounding is on the decimal value,
 * so a figure that sits exactly on a tie (1.005 to two places) rounds up, as the reader expects.
 */
export function presentationFigure(input: {value: Decimal.Value; scale?: PresentationScale; decimals?: number}): MaterialFigure {
  const scale = input.scale ?? "unit";
  if (input.decimals !== undefined && (!Number.isInteger(input.decimals) || input.decimals < 0 || input.decimals > 20)) {
    throw new RangeError("decimals must be an integer between 0 and 20");
  }
  const value = finite("presentation value", input.value);
  const scaled = scales[scale].apply(value);
  const printed = input.decimals === undefined ? full(scaled) : scaled.toFixed(input.decimals, Decimal.ROUND_HALF_UP);
  return {
    value: printed,
    trace: {
      id: "material.presentation_figure",
      formula: input.decimals === undefined ? scales[scale].formula : `${scales[scale].formula}, half-up to ${input.decimals} decimals`,
      operands: {value: full(value), scale},
      result: printed,
    },
  };
}

/**
 * The exact decimal handed to the binary number `Intl.NumberFormat` prints and a native chart point
 * stores. This is the only floating-point step of a material, at the display boundary, and it reads
 * the decimal exactly as `Number` reads decimal text.
 */
export function presentationNumber(value: Decimal.Value): {readonly value: number; readonly trace: CalculationTrace} {
  const parsed = finite("presentation number", value);
  const number = parsed.toNumber();
  return {value: number, trace: {id: "material.presentation_number", formula: "nearest binary64 number to the decimal", operands: {value: full(parsed)}, result: String(number)}};
}

/** The same conversion for a value that may be text: null when it is not a finite decimal number, so the caller prints it as written. */
export function tryPresentationNumber(value: Decimal.Value): {readonly value: number; readonly trace: CalculationTrace} | null {
  return parse(value) ? presentationNumber(value) : null;
}
