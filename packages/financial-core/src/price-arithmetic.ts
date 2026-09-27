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
 */
export const priceArithmeticVersion = "2026.09.27-v1";

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
