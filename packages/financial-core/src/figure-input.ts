import Decimal from "decimal.js";

/**
 * How every kernel of the materials, the desk and the price reference reads a figure it receives
 * (internal to the package). Decimal notation only: text in another notation (hexadecimal, binary,
 * `Infinity`, `NaN`) and a number that is not finite are not figures, and a kernel refuses them
 * instead of reading them as zero.
 */
const decimalText = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/** The figure as a decimal, or null when the value is not a finite decimal number. */
export function parseFigure(value: Decimal.Value): Decimal | null {
  if (typeof value === "string" && !decimalText.test(value)) return null;
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  const parsed = new Decimal(value);
  return parsed.isFinite() ? parsed : null;
}

/** The figure as a decimal; refuses a value that is not a finite decimal number, naming it. */
export function finiteFigure(label: string, value: Decimal.Value): Decimal {
  const parsed = parseFigure(value);
  if (!parsed) throw new RangeError(`${label} must be a finite decimal number`);
  return parsed;
}

/** A decimal at full precision, without rounding: the figure a kernel hands on. */
export const fullFigure = (value: Decimal): string => value.toFixed();
