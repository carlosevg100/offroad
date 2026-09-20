import Decimal from "decimal.js";

const Exact = Decimal.clone({precision: 100, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -100, toExpPos: 100});
export const definedRatioVersion = "2026.09.20-v1";
export type DefinedRatioInput = {
  numerator: string | null;
  denominator: string | null;
  limit: string | null;
  comparator: "lt" | "lte" | "gt" | "gte";
  /** Arithmetic convention only. Contractual definitions and source rights are upstream. */
  convention: "positive_denominator_unrounded_comparison";
};

/** A displayed quotient must never decide a boundary. Cross-products preserve exact
 * comparison, including strict limits, within the bounded decimal input domain.
 * A zero/negative denominator is not an economic pass or a legal breach. */
export function evaluateDefinedRatio(input: DefinedRatioInput) {
  if (!input || input.convention !== "positive_denominator_unrounded_comparison"
    || !["lt", "lte", "gt", "gte"].includes(input.comparator)) throw new Error("defined_ratio_convention_required");
  const parse = (value: string | null) => {
    if (value === null) return null;
    if (typeof value !== "string" || !/^-?\d{1,24}(?:\.\d{1,12})?$/.test(value)) throw new Error("defined_ratio_invalid_decimal");
    return new Exact(value);
  };
  const numerator = parse(input.numerator); const denominator = parse(input.denominator); const limit = parse(input.limit);
  const common = {engineVersion: definedRatioVersion, operands: structuredClone(input),
    displayRounding: "18_decimal_places_half_up" as const,
    comparisonRounding: "none_cross_products" as const, certifiesContractualCompliance: false as const};
  const missing = (["numerator", "denominator", "limit"] as const).filter(k => input[k] === null);
  if (missing.length) return {...common, status: "missing_inputs" as const, missing, ratio: null, margin: null, satisfiesDefinedBoundary: null, crossProducts: null};
  if (denominator!.lte(0)) return {...common, status: "nonpositive_denominator" as const, missing, ratio: null, margin: null, satisfiesDefinedBoundary: null, crossProducts: null};
  const threshold = limit!.times(denominator!);
  const comparison = numerator!.comparedTo(threshold);
  const upper = input.comparator === "lt" || input.comparator === "lte";
  const satisfies = input.comparator === "lt" ? comparison < 0 : input.comparator === "lte" ? comparison <= 0
    : input.comparator === "gt" ? comparison > 0 : comparison >= 0;
  const marginNumerator = upper ? threshold.minus(numerator!) : numerator!.minus(threshold);
  const display = (value: Decimal) => value.toDecimalPlaces(18, Exact.ROUND_HALF_UP).toFixed();
  return {...common, status: "calculated" as const, missing,
    ratio: display(numerator!.div(denominator!)), margin: display(marginNumerator.div(denominator!)),
    satisfiesDefinedBoundary: satisfies,
    crossProducts: {numerator: numerator!.toFixed(), limitTimesDenominator: threshold.toFixed(), marginNumerator: marginNumerator.toFixed()}};
}
