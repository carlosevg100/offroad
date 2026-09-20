import Decimal from "decimal.js";

const Exact = Decimal.clone({precision: 100, rounding: Decimal.ROUND_HALF_UP});
export const numericRepresentationVersion = "2026.09.20-v1";
export type NumericRepresentation = "reported_in_declared_scale" | "already_in_currency_units";

/** Explicit representation is an upstream evidence decision, never inferred here. No FX,
 * percentage conversion or rounding. An unsupported result is rejected rather than truncated.
 */
export function normalizeCurrencyRepresentation(input: {values: readonly string[]; declaredScale: string; representation: NumericRepresentation}) {
  if (!input.values.length || input.values.length > 2000) throw new Error("numeric_representation_value_limit");
  if (typeof input.declaredScale !== "string" || !/^\d{1,24}(?:\.\d{1,16})?$/.test(input.declaredScale)
    || new Exact(input.declaredScale).lte(0)) throw new Error("numeric_representation_invalid_scale");
  if (!["reported_in_declared_scale", "already_in_currency_units"].includes(input.representation)) throw new Error("numeric_representation_required");
  const factor = input.representation === "reported_in_declared_scale" ? new Exact(input.declaredScale) : new Exact(1);
  const values = input.values.map(value => {
    if (typeof value !== "string" || !/^-?\d{1,24}(?:\.\d{1,8})?$/.test(value)) throw new Error("numeric_representation_invalid_value");
    const normalized = new Exact(value).times(factor).toFixed();
    if (!/^-?\d{1,24}(?:\.\d{1,8})?$/.test(normalized)) throw new Error("numeric_representation_result_outside_domain");
    return normalized;
  });
  return {schemaVersion: "currency-representation.v1" as const, engineVersion: numericRepresentationVersion,
    operands: {values: [...input.values], declaredScale: input.declaredScale, representation: input.representation},
    factor: factor.toFixed(), outputScale: "1" as const, values, rounding: "none" as const};
}
