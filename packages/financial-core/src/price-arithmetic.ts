import Decimal from "decimal.js";

import type {CalculationTrace} from "./credit-math";
import {finiteFigure as finite, fullFigure as full} from "./figure-input";
import {composeIndexAndSpread} from "./rate-composition";

/**
 * The arithmetic of the price reference (stage 19, post-closure polish).
 *
 * `@offroad/market-reference` states what a kind of paper costs for a kind of credit: the desk's
 * practice band with the adjustments a lender applies, and the band observed in the governed
 * sample. The sums of basis points, the band a set of adjustments shifts, a spread in basis points
 * composed with the CDI into one annual rate, the identity between an observation's economics and
 * its normalized spread, and the annualized cost of a transaction are computed here, in Decimal at
 * 40 significant digits, with a trace. Basis points arrive as the reference publishes them (numbers
 * or decimal strings) and are read exactly, so fractional basis points add up as decimals do
 * (0.1 + 0.2 is 0.3), never as binary numbers.
 *
 * The statistics of the governed sample moved here in the third polish of stage 19: the tenor
 * window, the tenor gap and the amount ratio an observation is admitted by, the recency factor, the
 * comparability score and the weight they make, the weighted quantiles of the band, and the
 * difference between the proposed all-in and the current cost. The package keeps the calendar (the
 * age of an observation in days), the policy's thresholds and weights as data, and which text
 * counts as the same sector or amortization family.
 */
export const priceArithmeticVersion = "2026.09.27-v2";

Decimal.set({precision: 40, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -30, toExpPos: 30});

export type PriceFigure = {readonly value: string; readonly trace: CalculationTrace};

/** Basis points summed exactly, in the order given: the shift a set of adjustments makes, or the costs of a transaction. */
export function sumBasisPoints(input: {values: readonly Decimal.Value[]}): PriceFigure {
  const values = input.values.map((value, index) => finite(`basis points ${index + 1}`, value));
  const sum = values.reduce((total, value) => total.plus(value), new Decimal(0));
  return {
    value: full(sum),
    trace: {id: "price.basis_points_sum", formula: "sum of the basis points, in the order given", operands: Object.fromEntries(values.map((value, index) => [`bps${index + 1}`, full(value)])), result: full(sum)},
  };
}

/**
 * A band of spreads in basis points moved by its adjustments: the shift is their sum, both ends
 * move by it, and the width is what the band spans once shifted (the same as before, exactly).
 */
export function shiftSpreadBand(input: {minBps: Decimal.Value; maxBps: Decimal.Value; adjustmentsBps: readonly Decimal.Value[]}): {
  readonly shift: string;
  readonly min: string;
  readonly max: string;
  readonly width: string;
  readonly trace: CalculationTrace;
} {
  const min = finite("low end in basis points", input.minBps);
  const max = finite("high end in basis points", input.maxBps);
  const shift = new Decimal(sumBasisPoints({values: input.adjustmentsBps}).value);
  const low = min.plus(shift);
  const high = max.plus(shift);
  const width = high.minus(low);
  return {
    shift: full(shift),
    min: full(low),
    max: full(high),
    width: full(width),
    trace: {
      id: "price.spread_band",
      formula: "shift = sum of the adjustments; band = [low + shift, high + shift]; width = high - low of the shifted band",
      operands: {minBps: full(min), maxBps: full(max), adjustmentsBps: input.adjustmentsBps.map(String).join(", ")},
      result: `min=${full(low)}; max=${full(high)}; width=${full(width)}`,
    },
  };
}

/**
 * CDI plus a spread in basis points as one annual rate, composed the way the B3 formula book and
 * the indentures accrue it: (1 + CDI) x (1 + basis points / 10,000) - 1, never CDI plus the spread.
 */
export function composeCdiPlusBasisPoints(input: {annualCdi: Decimal.Value; spreadBps: Decimal.Value}): PriceFigure & {readonly spreadRate: string} {
  const cdi = finite("annual CDI", input.annualCdi);
  const bps = finite("spread in basis points", input.spreadBps);
  const spreadRate = bps.div(10_000);
  const composed = composeIndexAndSpread({index: "DI", annualIndex: full(cdi), annualSpread: full(spreadRate)});
  return {
    value: composed.value,
    spreadRate: full(spreadRate),
    trace: {
      id: "price.cdi_plus_basis_points",
      formula: "all-in = (1 + CDI) x (1 + basis points / 10,000) - 1",
      operands: {annualCdi: full(cdi), spreadBps: full(bps), spreadRate: full(spreadRate)},
      result: composed.value,
    },
  };
}

/**
 * Whether an observation's economics (quoted spread, fee, discount, warrant and hedge, in basis
 * points) add up to its normalized spread within a tolerance: the identity a normalization has to
 * keep before the observation enters the sample. A gap exactly at the tolerance keeps it.
 */
export function testSpreadNormalization(input: {componentsBps: readonly Decimal.Value[]; normalizedBps: Decimal.Value; toleranceBps: Decimal.Value}): {
  readonly sum: string;
  readonly gap: string;
  readonly holds: boolean;
  readonly trace: CalculationTrace;
} {
  const sum = new Decimal(sumBasisPoints({values: input.componentsBps}).value);
  const normalized = finite("normalized spread", input.normalizedBps);
  const tolerance = finite("tolerance", input.toleranceBps);
  if (tolerance.isNegative()) throw new RangeError("tolerance must not be negative");
  const gap = sum.minus(normalized).abs();
  const holds = !gap.gt(tolerance);
  return {
    sum: full(sum),
    gap: full(gap),
    holds,
    trace: {
      id: "price.normalization_identity",
      formula: "holds when |sum of the components - normalized spread| <= tolerance, all in basis points",
      operands: {components: input.componentsBps.map(String).join(", "), normalizedBps: full(normalized), toleranceBps: full(tolerance)},
      result: holds ? `holds; gap=${full(gap)}` : `fails; gap=${full(gap)}`,
    },
  };
}

/**
 * A cost of the transaction in basis points a year over the ticket: the annual amount plus the
 * one-time amount spread over the weighted average life, over the ticket, times 10,000, half-up to
 * two decimals.
 */
export function annualizeCostInBasisPoints(input: {annualAmount?: Decimal.Value; oneTimeAmount?: Decimal.Value; weightedAverageLifeYears: Decimal.Value; ticket: Decimal.Value}): PriceFigure {
  const annual = finite("annual amount", input.annualAmount ?? 0);
  const oneTime = finite("one-time amount", input.oneTimeAmount ?? 0);
  const life = finite("weighted average life", input.weightedAverageLifeYears);
  if (!life.gt(0)) throw new RangeError("weighted average life must be positive");
  const ticket = finite("ticket", input.ticket);
  const yearly = annual.plus(oneTime.div(life));
  const bps = yearly.div(ticket).times(10_000).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  return {
    value: full(bps),
    trace: {
      id: "price.annualized_cost",
      formula: "annualized = (annual amount + one-time amount / weighted average life) / ticket x 10,000, half-up to 2 decimals",
      operands: {annualAmount: full(annual), oneTimeAmount: full(oneTime), weightedAverageLifeYears: full(life), ticket: full(ticket)},
      result: full(bps),
    },
  };
}

// The governed sample ---------------------------------------------------------------------------

/**
 * The tenor window of the sample, in months: min(the policy's largest gap; max(the floor; the
 * share of the target tenor)). An observation whose tenor sits further from the target is refused.
 */
export function calculateTenorWindow(input: {targetMonths: Decimal.Value; maxDeltaMonths: Decimal.Value; floorMonths: Decimal.Value; relativeToTarget: Decimal.Value}): PriceFigure {
  const target = finite("target tenor", input.targetMonths);
  const maxDelta = finite("largest tenor gap", input.maxDeltaMonths);
  const floor = finite("window floor", input.floorMonths);
  const share = finite("share of the target tenor", input.relativeToTarget);
  const window = Decimal.min(maxDelta, Decimal.max(floor, share.times(target)));
  return {
    value: full(window),
    trace: {
      id: "price.tenor_window",
      formula: "window = min(largest gap; max(floor; share x target tenor)), in months",
      operands: {targetMonths: full(target), maxDeltaMonths: full(maxDelta), floorMonths: full(floor), relativeToTarget: full(share)},
      result: full(window),
    },
  };
}

/**
 * The windows an observation is admitted by: the gap between its tenor and the target's against the
 * tenor window, and its amount over the target's against the policy's range of ratios. Amounts that
 * are not both positive leave the ratio uncomputed and the observation refused.
 */
export function testObservationWindows(input: {
  observationTenorMonths: Decimal.Value;
  targetTenorMonths: Decimal.Value;
  tenorWindowMonths: Decimal.Value;
  observationAmount: Decimal.Value;
  targetAmount: Decimal.Value;
  minAmountRatio: Decimal.Value;
  maxAmountRatio: Decimal.Value;
}): {
  readonly tenorDeltaMonths: string;
  readonly tenorInsideWindow: boolean;
  /** Whether both amounts are positive, the condition of the ratio. */
  readonly amountsPositive: boolean;
  readonly amountRatio: string | null;
  readonly amountInsideWindow: boolean | null;
  readonly trace: CalculationTrace;
} {
  const delta = finite("observation tenor", input.observationTenorMonths).minus(finite("target tenor", input.targetTenorMonths)).abs();
  const window = finite("tenor window", input.tenorWindowMonths);
  const tenorInsideWindow = !window.lt(delta);
  const observationAmount = finite("observation amount", input.observationAmount);
  const targetAmount = finite("target amount", input.targetAmount);
  const minRatio = finite("smallest amount ratio", input.minAmountRatio);
  const maxRatio = finite("largest amount ratio", input.maxAmountRatio);
  const amountsPositive = targetAmount.gt(0) && observationAmount.gt(0);
  const ratio = amountsPositive ? observationAmount.div(targetAmount) : null;
  const amountInsideWindow = ratio ? !(ratio.lt(minRatio) || ratio.gt(maxRatio)) : null;
  return {
    tenorDeltaMonths: full(delta),
    tenorInsideWindow,
    amountsPositive,
    amountRatio: ratio ? full(ratio) : null,
    amountInsideWindow,
    trace: {
      id: "price.observation_windows",
      formula: "tenor gap = |observation tenor - target tenor|, inside when it does not exceed the window; ratio = observation amount / target amount when both are positive, inside between the smallest and the largest ratio",
      operands: {
        observationTenorMonths: String(input.observationTenorMonths), targetTenorMonths: String(input.targetTenorMonths), tenorWindowMonths: full(window),
        observationAmount: full(observationAmount), targetAmount: full(targetAmount), minAmountRatio: full(minRatio), maxAmountRatio: full(maxRatio),
      },
      result: `gap=${full(delta)}; tenor ${tenorInsideWindow ? "inside" : "outside"}; ratio=${ratio ? full(ratio) : "not computed"}${amountInsideWindow === null ? "" : `; amount ${amountInsideWindow ? "inside" : "outside"}`}`,
    },
  };
}

/**
 * The recency factor of an observation: 1 up to the full-weight age, 0 from the age at which it
 * lapses, and linear in between, (lapse age - age) / (lapse age - full-weight age), half-up to six
 * decimals.
 */
export function calculateRecencyFactor(input: {ageDays: Decimal.Value; fullWeightDays: Decimal.Value; zeroWeightDays: Decimal.Value}): PriceFigure {
  const age = finite("age in days", input.ageDays);
  const fullWeight = finite("full-weight age", input.fullWeightDays);
  const zeroWeight = finite("lapse age", input.zeroWeightDays);
  if (!zeroWeight.gt(fullWeight)) throw new RangeError("the lapse age must exceed the full-weight age");
  const factor = age.lte(fullWeight)
    ? new Decimal(1)
    : age.gte(zeroWeight) ? new Decimal(0) : zeroWeight.minus(age).div(zeroWeight.minus(fullWeight)).toDecimalPlaces(6, Decimal.ROUND_HALF_UP);
  return {
    value: full(factor),
    trace: {
      id: "price.recency",
      formula: "1 up to the full-weight age; 0 from the lapse age; (lapse age - age) / (lapse age - full-weight age) between, half-up to 6 decimals",
      operands: {ageDays: full(age), fullWeightDays: full(fullWeight), zeroWeightDays: full(zeroWeight)},
      result: full(factor),
    },
  };
}

/** The comparability score of an observation: the sum of each dimension's weight times its similarity, in the order given. */
export function scoreComparability(input: {dimensions: ReadonlyArray<{dimension: string; weight: Decimal.Value; similarity: Decimal.Value}>}): PriceFigure {
  const terms = input.dimensions.map((entry) => ({dimension: entry.dimension, weight: finite(`${entry.dimension} weight`, entry.weight), similarity: finite(`${entry.dimension} similarity`, entry.similarity)}));
  const score = terms.reduce((sum, term) => sum.plus(term.weight.times(term.similarity)), new Decimal(0));
  return {
    value: full(score),
    trace: {
      id: "price.comparability",
      formula: "score = sum of the weight x the similarity of each dimension",
      operands: Object.fromEntries(terms.map((term) => [term.dimension, `${full(term.weight)} x ${full(term.similarity)}`])),
      result: full(score),
    },
  };
}

/** The weight of an observation in the quantiles: its recency factor times its comparability score. */
export function calculateObservationWeight(input: {recency: Decimal.Value; score: Decimal.Value}): PriceFigure {
  const recency = finite("recency factor", input.recency);
  const score = finite("comparability score", input.score);
  const weight = recency.times(score);
  return {
    value: full(weight),
    trace: {id: "price.observation_weight", formula: "weight = recency factor x comparability score", operands: {recency: full(recency), score: full(score)}, result: full(weight)},
  };
}

/**
 * Weighted quantiles of a sample: the entries ordered by value (ties by id, as the locale orders
 * text), then for each quantile q the first entry whose cumulative weight reaches q x the total
 * weight: the same test as normalizing each weight, without dividing and rounding it. The entry is
 * named by its position in the input, so the caller hands on the value exactly as it received it.
 */
export function selectWeightedQuantiles(input: {entries: ReadonlyArray<{id: string; value: Decimal.Value; weight: Decimal.Value}>; quantiles: readonly Decimal.Value[]}): {
  readonly selected: ReadonlyArray<{readonly quantile: string; readonly index: number; readonly id: string}>;
  readonly trace: CalculationTrace;
} {
  if (input.entries.length === 0) throw new RangeError("at least one entry is required");
  const entries = input.entries.map((entry, index) => ({index, id: entry.id, value: finite(`value of ${entry.id}`, entry.value), weight: finite(`weight of ${entry.id}`, entry.weight)}));
  const ordered = [...entries].sort((a, b) => a.value.comparedTo(b.value) || a.id.localeCompare(b.id));
  const total = ordered.reduce((sum, entry) => sum.plus(entry.weight), new Decimal(0));
  const selected = input.quantiles.map((value) => {
    const quantile = finite("quantile", value);
    const threshold = quantile.times(total);
    let cumulative = new Decimal(0);
    let chosen = ordered[ordered.length - 1]!;
    for (const entry of ordered) {
      cumulative = cumulative.plus(entry.weight);
      if (cumulative.gte(threshold)) {
        chosen = entry;
        break;
      }
    }
    return {quantile: full(quantile), index: chosen.index, id: chosen.id};
  });
  return {
    selected,
    trace: {
      id: "price.weighted_quantiles",
      formula: "order by value, then id; for each quantile q, the first entry whose cumulative weight reaches q x total weight",
      operands: {totalWeight: full(total), order: ordered.map((entry) => `${entry.id}:${full(entry.value)}:${full(entry.weight)}`).join(", ")},
      result: selected.map((entry) => `${entry.quantile}=${entry.id}`).join("; "),
    },
  };
}

/** How far the proposed all-in sits from the company's current cost: proposed - current, both annual rates. */
export function calculateCostDifference(input: {proposed: Decimal.Value; current: Decimal.Value}): PriceFigure {
  const proposed = finite("proposed all-in", input.proposed);
  const current = finite("current cost", input.current);
  const difference = proposed.minus(current);
  return {
    value: full(difference),
    trace: {id: "price.cost_difference", formula: "difference = proposed all-in - current cost", operands: {proposed: full(proposed), current: full(current)}, result: full(difference)},
  };
}
