import {readDocumentFigure} from "../credit-review-arithmetic";
import {normalizeCurrencyRepresentation, type NumericRepresentation} from "../numeric-representation";
import {decimal, full, type ReceivablesPoolKernelTrace} from "./pool-shared";

export type OriginatorNumericInput = {
  literal: string;
  notation: "brazilian_document" | "decimal_notation";
  unit: "currency" | "ratio" | "multiple" | "count";
  currency: string | null;
  declaredScale: string | null;
  representation: NumericRepresentation | null;
  ratioConvention: "percent" | "fraction" | null;
};

/** Parses the source literal and applies only explicit unit and representation decisions. */
export function normalizeOriginatorNumber(input: OriginatorNumericInput): {value: string; trace: ReceivablesPoolKernelTrace} {
  let text = input.literal.trim().replace(/\u00a0/g, " ");
  if (!text || text.length > 200) throw new RangeError("originator_numeric_literal_invalid");
  const prefix = /^(R\$|US\$|€)\s*/.exec(text);
  if (prefix) {
    const currency = {"R$": "BRL", "US$": "USD", "€": "EUR"}[prefix[1]!];
    if (input.unit !== "currency" || input.currency !== currency) throw new RangeError("originator_numeric_currency_conflict");
    text = text.slice(prefix[0].length);
  }
  const printedPercent = /%$/.test(text);
  if (printedPercent) {
    if (input.unit !== "ratio" || input.ratioConvention === "fraction") throw new RangeError("originator_numeric_ratio_conflict");
    text = text.slice(0, -1).trim();
  }
  if (/[x×]$/i.test(text)) {
    if (input.unit !== "multiple") throw new RangeError("originator_numeric_multiple_conflict");
    text = text.slice(0, -1).trim();
  }
  let negative = false;
  if (/^\(.*\)$/.test(text)) {negative = true; text = text.slice(1, -1).trim();}
  if (text.startsWith("-")) {if (negative) throw new RangeError("originator_numeric_sign_conflict"); negative = true; text = text.slice(1).trim();}
  let parsed: string | null = null;
  if (input.notation === "brazilian_document") parsed = readDocumentFigure({text}).value;
  else if (input.notation === "decimal_notation" && /^\d+(?:\.\d+)?$/.test(text)) parsed = text;
  if (parsed === null) throw new RangeError("originator_numeric_literal_invalid");
  let value = decimal(parsed).times(negative ? -1 : 1), factor = "1";
  if (!value.isFinite()) throw new RangeError("originator_non_finite_number");
  if (input.unit === "currency") {
    if (input.ratioConvention !== null) throw new RangeError("originator_numeric_unit_conflict");
    if (!input.currency || !/^[A-Z]{3}$/.test(input.currency)) throw new RangeError("originator_numeric_currency_missing");
    if (input.declaredScale === null || input.representation === null) throw new RangeError("originator_numeric_scale_unconfirmed");
    const normalized = normalizeCurrencyRepresentation({values: [full(value)], declaredScale: input.declaredScale, representation: input.representation});
    value = decimal(normalized.values[0]!); factor = normalized.factor;
  } else {
    if (input.currency !== null || input.declaredScale !== null || input.representation !== null) throw new RangeError("originator_numeric_unit_conflict");
    if (input.unit === "ratio") {
      const convention = printedPercent ? "percent" : input.ratioConvention;
      if (convention === null) throw new RangeError("originator_numeric_ratio_convention_missing");
      if (convention === "percent") {value = value.div(100); factor = "0.01";}
    } else if (input.ratioConvention !== null) throw new RangeError("originator_numeric_unit_conflict");
    if (input.unit === "count" && (!value.isInteger() || value.lt(0))) throw new RangeError("originator_numeric_count_invalid");
  }
  return {value: full(value), trace: {id: "receivables.originator.source_number", formula: "parse the literal under the declared notation; apply the confirmed currency representation or percent convention without rounding", operands: {literal: input.literal, notation: input.notation, unit: input.unit, currency: input.currency ?? "none", declaredScale: input.declaredScale ?? "none", representation: input.representation ?? "none", ratioConvention: printedPercent ? "printed_percent" : input.ratioConvention ?? "none", factor}, result: full(value)}};
}
