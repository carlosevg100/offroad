import Decimal from "decimal.js";

import type {CalculationResult, DecimalInput} from "./credit-math";

/**
 * How an index and a spread (or a real coupon) combine into one annual rate, as Brazilian
 * indentures and the B3 formula books write it.
 *
 * A "DI + 3%" debenture accrues the DI factor times (1 + 3%)^(DU/252): the spread multiplies the
 * index, it does not add to it. The same holds for IPCA plus a real coupon, TLP plus the agent's
 * spread, SELIC plus spread and TR plus a coupon. Adding the two annual rates understates the
 * cost by about index times spread: with the DI at 13,65% and a 3% spread, 40,95 basis points.
 * "p% of the DI" applies p to each day's DI rate and compounds the days. A prefixed rate compares
 * with the DI through the DI x pré rate at the same duration.
 *
 * Every function works on annual effective rates of a 252 business-day year, returns the rate as
 * a decimal fraction and records its operands, the formula and the gap to the linear sum that a
 * hand-kept schedule would have used.
 *
 * Sources: B3, Manual de Apreçamento de Debêntures (30/05/2022), sections 2.2.1 (percentual
 * spread) and 2.2.2 (multiplicative spread); B3, Manual de Curvas (12/12/2025), section 2.1.
 */

const Rate = Decimal.clone({precision: 40, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -30, toExpPos: 30});
const DAYS_PER_YEAR = 252;
const RATE_DECIMALS = 12;

const r = (value: DecimalInput) => new Rate(value.toString());
const out = (value: Decimal) => value.toDecimalPlaces(RATE_DECIMALS).toFixed();
const bps = (value: Decimal) => value.times(10_000).toDecimalPlaces(6).toFixed();

export type IndexedRateIndex = "DI" | "SELIC" | "IPCA" | "TLP" | "TR";

export type RateComposition = CalculationResult & {
  /** Index plus spread, the figure a linear composition would have shown. */
  linearSum: string;
  /** Composed minus linear, in basis points: what the linear sum leaves out. */
  compositionEffectBps: string;
};

function assertRate(value: Decimal, name: string): void {
  if (!value.isFinite()) throw new RangeError(`${name} must be a finite rate`);
  if (value.lte(-1)) throw new RangeError(`${name} must be above -100%`);
}

/**
 * Annual rate of an index plus a spread or real coupon: (1 + index) × (1 + spread) - 1.
 * For DU business days the factor is [(1 + index) × (1 + spread)]^(DU/252), so the annual rate is
 * the composition itself.
 */
export function composeIndexAndSpread(input: {index: IndexedRateIndex; annualIndex: DecimalInput; annualSpread: DecimalInput}): RateComposition {
  const index = r(input.annualIndex);
  const spread = r(input.annualSpread);
  assertRate(index, `annual ${input.index}`);
  assertRate(spread, "annual spread");
  const composed = index.plus(1).times(spread.plus(1)).minus(1);
  const linear = index.plus(spread);
  return {
    value: out(composed),
    linearSum: out(linear),
    compositionEffectBps: bps(composed.minus(linear)),
    trace: [
      {label: "formula", value: "(1 + index) * (1 + spread) - 1"},
      {label: "index", value: input.index},
      {label: "annual_index", value: out(index)},
      {label: "annual_spread", value: out(spread)},
      {label: "linear_sum", value: out(linear)},
    ],
    warnings: [],
  };
}

/**
 * Annual equivalent of p% of the DI: [1 + ((1 + DI)^(1/252) - 1) × p]^252 - 1. The equivalence
 * depends on the DI level, so a percentage of the DI is never a fixed spread.
 */
export function annualRateForPercentOfDi(input: {annualDi: DecimalInput; percentOfDi: DecimalInput}): RateComposition {
  const di = r(input.annualDi);
  const percent = r(input.percentOfDi);
  assertRate(di, "annual DI");
  if (percent.lt(0)) throw new RangeError("the percentage of the DI must be non-negative");
  const daily = di.plus(1).pow(new Rate(1).div(DAYS_PER_YEAR)).minus(1).times(percent);
  const composed = daily.plus(1).pow(DAYS_PER_YEAR).minus(1);
  const linear = di.times(percent);
  return {
    value: out(composed),
    linearSum: out(linear),
    compositionEffectBps: bps(composed.minus(linear)),
    trace: [
      {label: "formula", value: "(1 + ((1 + DI)^(1/252) - 1) * p)^252 - 1"},
      {label: "annual_di", value: out(di)},
      {label: "percent_of_di", value: out(percent)},
      {label: "daily_rate", value: daily.toDecimalPlaces(16).toFixed()},
      {label: "linear_product", value: out(linear)},
    ],
    warnings: [],
  };
}

/**
 * Spread of an annual rate over an index at the same duration: (1 + rate) / (1 + index) - 1. It
 * turns a prefixed rate into its DI-plus-spread equivalent against the DI x pré rate of the same
 * duration, and a composed cost back into the spread it carries.
 */
export function spreadOverIndex(input: {annualRate: DecimalInput; annualIndex: DecimalInput}): RateComposition {
  const rate = r(input.annualRate);
  const index = r(input.annualIndex);
  assertRate(rate, "annual rate");
  assertRate(index, "annual index");
  const spread = rate.plus(1).div(index.plus(1)).minus(1);
  const linear = rate.minus(index);
  return {
    value: out(spread),
    linearSum: out(linear),
    compositionEffectBps: bps(spread.minus(linear)),
    trace: [
      {label: "formula", value: "(1 + rate) / (1 + index) - 1"},
      {label: "annual_rate", value: out(rate)},
      {label: "annual_index", value: out(index)},
      {label: "linear_difference", value: out(linear)},
    ],
    warnings: [],
  };
}
