import Decimal from "decimal.js";

export const projectedLeverageCovenantVersion = "2026.10.19-v1";

export type ProjectedLeveragePeriod = {
  period: string;
  /** Period EBITDA on the reported (IFRS 16) basis. */
  ebitda: string;
  /** Lease payments in the period, used when the definition excludes IFRS 16. */
  leasePayments: string;
  /** Closing financial debt (principal, excluding unpaid accrued coupon unless the definition adds it). */
  closingDebt: string;
  closingAvailableCash: string;
};

export type ProjectedLeverageDefinition = {
  /** Adopted contractual definition, by components. */
  leaseLiabilityInDebt: boolean;
  /** Lease liability added to debt when the definition includes it (adopted; held constant if one value). */
  leaseLiability: string;
  /** Deduct trailing lease payments from EBITDA (definitions that exclude IFRS 16). */
  ebitdaExcludesLeases: boolean;
  /** Number of trailing periods that make the EBITDA window (4 quarters). */
  trailingPeriods: number;
  /** EBITDA and lease payments of the periods before the horizon, oldest first, to complete early windows. */
  history: readonly {period: string; ebitda: string; leasePayments: string}[];
  measurementPeriods: readonly string[];
  limit: string;
  comparator: "lte" | "lt";
};

const D = Decimal.clone({precision: 50, rounding: Decimal.ROUND_HALF_UP});
const num = (value: string, label: string) => {
  if (typeof value !== "string" || !/^-?\d{1,24}(?:\.\d{1,30})?$/.test(value)) throw new Error(`projected_covenant_invalid_${label}`);
  return new D(value);
};

/**
 * Net leverage projected on each contractual measurement date, by the contract's own definition:
 * (debt - available cash [+ lease liability]) / trailing EBITDA [- trailing lease payments].
 * Pure arithmetic on adopted projections and definitions; a missing window is an error, never a
 * shorter window. Reports the ratio, the headroom to the limit and the worst date.
 */
export function projectLeverageCovenant(periods: readonly ProjectedLeveragePeriod[], definition: ProjectedLeverageDefinition) {
  if (!periods.length || periods.length > 2000) throw new Error("projected_covenant_period_limit");
  if (!Number.isInteger(definition.trailingPeriods) || definition.trailingPeriods < 1 || definition.trailingPeriods > 24) throw new Error("projected_covenant_window_invalid");
  if (!["lte", "lt"].includes(definition.comparator)) throw new Error("projected_covenant_comparator_required");
  const limit = num(definition.limit, "limit");
  const lease = num(definition.leaseLiability, "lease_liability");
  const series = [...definition.history.map((h) => ({period: h.period, ebitda: num(h.ebitda, "ebitda"), lease: num(h.leasePayments, "lease")})),
    ...periods.map((p) => ({period: p.period, ebitda: num(p.ebitda, "ebitda"), lease: num(p.leasePayments, "lease")}))];
  if (new Set(series.map((s) => s.period)).size !== series.length) throw new Error("projected_covenant_duplicate_period");
  if (!definition.measurementPeriods.length) throw new Error("projected_covenant_measurement_required");
  const rows = definition.measurementPeriods.map((period) => {
    const p = periods.find((x) => x.period === period);
    const at = series.findIndex((s) => s.period === period);
    if (!p || at < 0) throw new Error("projected_covenant_measurement_outside_projection");
    if (at + 1 < definition.trailingPeriods) throw new Error("projected_covenant_window_incomplete");
    const window = series.slice(at + 1 - definition.trailingPeriods, at + 1);
    const ebitda = window.reduce((t, s) => t.plus(s.ebitda), new D(0)).minus(definition.ebitdaExcludesLeases ? window.reduce((t, s) => t.plus(s.lease), new D(0)) : 0);
    if (ebitda.lte(0)) throw new Error("projected_covenant_nonpositive_ebitda");
    const netDebt = num(p.closingDebt, "debt").minus(num(p.closingAvailableCash, "cash")).plus(definition.leaseLiabilityInDebt ? lease : 0);
    const ratio = netDebt.div(ebitda);
    const headroom = limit.minus(ratio);
    const complies = definition.comparator === "lte" ? ratio.lte(limit) : ratio.lt(limit);
    return {period, netDebt: netDebt.toFixed(), trailingEbitda: ebitda.toFixed(), ratio: ratio.toFixed(), headroom: headroom.toFixed(), complies};
  });
  const worst = rows.reduce((w, r) => (new D(r.ratio).gt(w.ratio) ? r : w));
  return {schemaVersion: "projected-leverage-covenant.v1" as const, engineVersion: projectedLeverageCovenantVersion,
    limit: limit.toFixed(), comparator: definition.comparator, rows,
    worst: {period: worst.period, ratio: worst.ratio, headroom: worst.headroom}, allComply: rows.every((r) => r.complies)};
}
