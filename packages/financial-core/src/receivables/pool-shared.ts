import Decimal from "decimal.js";

/**
 * Shared conventions of the receivables-pool kernels (eligibility, concentration, waterfall,
 * borrowing base, reconciliation, performance, evidence coverage and triggers).
 *
 * Every kernel returns its figures as full-precision decimal strings (`Decimal#toFixed()` with
 * no rounding) and a trace naming the formula and operands. Presentation rounding (two decimals
 * for money, eight for ratios) belongs to the caller that publishes the result, so a method can
 * change how it prints without changing what it computed.
 */
export const receivablesPoolKernelsVersion = "2026.09.10-v1";

// The same arithmetic contract the package root declares, so a kernel imported on its own computes
// exactly what it computes inside the published result.
Decimal.set({precision: 40, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -30, toExpPos: 30});

export type ReceivablesPoolKernelTrace = {
  id: string;
  formula: string;
  operands: Record<string, string>;
  result: string;
};

export const ZERO = new Decimal(0);
export const ONE = new Decimal(1);

export const decimal = (value: Decimal.Value): Decimal => new Decimal(value);

/** Full-precision fixed-point string: what the kernel computed, without presentation rounding. */
export const full = (value: Decimal): string => value.toFixed();

export function sum(values: Iterable<Decimal.Value>): Decimal {
  let total = ZERO;
  for (const value of values) total = total.plus(value);
  return total;
}

/** A share whose denominator may legitimately be zero: an empty universe has a zero share, never an error. */
export function safeRatio(numerator: Decimal, denominator: Decimal): Decimal {
  return denominator.isZero() ? ZERO : numerator.div(denominator);
}

export function requireNonNegative(label: string, value: Decimal.Value): Decimal {
  const parsed = decimal(value);
  if (!parsed.isFinite() || parsed.isNegative()) throw new RangeError(`${label} must be a non-negative finite number`);
  return parsed;
}

export function requireUnitInterval(label: string, value: Decimal.Value): Decimal {
  const parsed = requireNonNegative(label, value);
  if (parsed.gt(ONE)) throw new RangeError(`${label} must be between zero and one`);
  return parsed;
}
