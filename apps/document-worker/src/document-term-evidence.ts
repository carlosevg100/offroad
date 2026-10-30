import type {FactCandidate} from "@offroad/reconciliation";
import {normalizeOriginatorNumber} from "@offroad/financial-core";

/** The historical field name ends in months, but the source unit remains authoritative.
 * A quoted day count is never a month count. No calendar conversion is assumed here. */
export function documentTermEvidence(candidates: readonly FactCandidate[]): {days: number | null; months: number | null} {
  const terms = new Map<string, {unit: "days" | "months"; value: number}>();
  for (const c of candidates) {
    if (c.fieldPath !== "transaction.desired_term_months" || c.valueType !== "number" || !c.anchorVerified) continue;
    if (c.unit !== "days" && c.unit !== "months") continue;
    const anchor = c.anchor && typeof c.anchor === "object" ? c.anchor as Record<string, unknown> : null;
    if (typeof anchor?.quote !== "string") continue;
    try {
      const value = normalizeOriginatorNumber({literal: c.normalizedValue, unit: "count", notation: "decimal_notation", currency: null, declaredScale: null, representation: null, ratioConvention: null}).value;
      const count = Number(value);
      if (!Number.isSafeInteger(count) || count <= 0) continue;
      const units = c.unit === "days" ? "(?:dias?|days?)" : "(?:mês|meses|months?)";
      if (!new RegExp(`(?<![0-9.,])${value}\\s*${units}(?!\\p{L})`, "iu").test(anchor.quote)) continue;
      terms.set(c.unit + ":" + value, {unit: c.unit, value: count});
    } catch { /* An unresolved number stays unresolved; it is not a zero or a converted term. */ }
  }
  if (terms.size !== 1) return {days: null, months: null};
  const term = [...terms.values()][0]!;
  return {days: term.unit === "days" ? term.value : null, months: term.unit === "months" ? term.value : null};
}
