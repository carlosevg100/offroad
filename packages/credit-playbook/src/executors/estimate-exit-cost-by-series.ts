import {createHash} from "node:crypto";

import Decimal from "decimal.js";
import {z} from "zod";

/**
 * Executor of the method `estimate-exit-cost-by-series` (v3, after the first independent review).
 * For each series an alternative wants to retire on a date: which mechanisms the indenture offers on
 * that date, each with its own formula and its own quote date, and what each costs with what the base
 * holds. Mechanisms are never merged: the DI premium is [(1 + p)^(DU/252) - 1] times the unit price,
 * an IPCA extraordinary amortization pays the higher of the updated value and the present value at the
 * quote of the second prior business day, an IPCA total redemption pays the present value at the quote
 * of the immediately prior business day, a negotiated offer is open since issuance with a premium to be
 * set, and an acquisition depends on the seller. The base of any price is the nominal (updated where
 * indexed) plus accrued remuneration and charges at the exit date, each with its anchor; without them
 * the series is insufficient evidence, never zero. Business days come from a calendar the base cites.
 */
const nonNegative = z.string().regex(/^\d+(\.\d+)?$/);
const nonEmpty = z.string().trim().min(1);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const unitSchema = z.enum(["BRL", "BRL thousand", "BRL million", "USD", "USD thousand"]);
const anchorSchema = z.object({document: nonEmpty, clause: nonEmpty.optional(), page: z.number().int().positive().optional(), note: nonEmpty.optional()}).strict();
type Anchor = z.infer<typeof anchorSchema>;
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** A dated amount with its anchor; the base of every price is built from these, never from a default. */
const datedAmountSchema = z.object({value: nonNegative, asOf: isoDate, anchor: anchorSchema}).strict();

export const exitMechanismSchema = z.discriminatedUnion("mechanism", [
  z.object({
    mechanism: z.enum(["extraordinary_amortization_di", "total_redemption_di"]),
    /** Premium per year as a decimal (0.004 for 0,40%), applied as [(1 + p)^(DU/252) - 1] over the business days to maturity. */
    premiumPerYear: nonNegative,
    availableFrom: isoDate,
    /** Business days from the exit date to maturity, from the calendar the base cites. */
    businessDays: z.object({count: z.number().int().nonnegative(), maturity: isoDate, anchor: anchorSchema}).strict(),
    anchor: anchorSchema,
  }).strict(),
  z.object({
    mechanism: z.literal("extraordinary_amortization_ipca"),
    availableFrom: isoDate,
    referenceRate: z.enum(["NTN-B (ANBIMA indicative, nearest duration)", "B3 Pre x DI curve (nearest vertex to remaining duration)"]),
    /** The quote of the second business day before the exit date, when the base holds it. */
    quote: z.object({rate: nonNegative, quoteDate: isoDate, security: nonEmpty, anchor: anchorSchema}).strict().nullable(),
    /** Present value of the remaining flows at that quote, computed upstream from the flows the base holds; null otherwise. */
    presentValueAtQuote: datedAmountSchema.nullable(),
    anchor: anchorSchema,
  }).strict(),
  z.object({
    mechanism: z.literal("total_redemption_ipca"),
    availableFrom: isoDate,
    referenceRate: z.enum(["NTN-B (ANBIMA indicative, nearest duration)", "B3 Pre x DI curve (nearest vertex to remaining duration)"]),
    /** The quote of the business day immediately before the exit date, when the base holds it. */
    quote: z.object({rate: nonNegative, quoteDate: isoDate, security: nonEmpty, anchor: anchorSchema}).strict().nullable(),
    presentValueAtQuote: datedAmountSchema.nullable(),
    anchor: anchorSchema,
  }).strict(),
  z.object({
    mechanism: z.literal("negotiated_offer"),
    /** Open since issuance in the 13th, 14th and 15th; the premium is set in the notice and the holders decide. */
    availableFrom: isoDate,
    premium: z.object({rate: nonNegative, anchor: anchorSchema}).strict().nullable(),
    requiresFullAdherence: z.boolean(),
    anchor: anchorSchema,
  }).strict(),
  z.object({
    mechanism: z.literal("acquisition"),
    /** Facultative acquisition at any time, subject to the seller's acceptance; the price is whatever the seller accepts. */
    availableFrom: isoDate.nullable(),
    anchor: anchorSchema,
  }).strict(),
]);

export const exitCostInputSchema = z.object({
  exitDate: isoDate,
  unit: unitSchema,
  series: z.array(z.object({
    id: nonEmpty,
    label: nonEmpty,
    /** Nominal at the exit date (updated by the index where the indenture says so), with its anchor; null when the base does not hold it. */
    nominalAtExit: datedAmountSchema.nullable(),
    /** Remuneration accrued to the exit date, with its anchor; null when the base does not hold it (never zero by default). */
    accruedAtExit: datedAmountSchema.nullable(),
    /** Charges due at the exit date (fees, penalties stated by the indenture); null when the base states none. */
    chargesAtExit: datedAmountSchema.nullable(),
    /** Every mechanism the indenture offers for this series; unilateral and negotiated routes side by side. */
    mechanisms: z.array(exitMechanismSchema).min(1),
    anchor: anchorSchema,
  }).strict()),
}).strict().superRefine((input, context) => {
  const ids = new Set<string>();
  input.series.forEach((series, index) => {
    if (ids.has(series.id)) context.addIssue({code: "custom", path: ["series", index], message: `duplicate series ${series.id}`});
    ids.add(series.id);
    for (const amount of [series.nominalAtExit, series.accruedAtExit, series.chargesAtExit]) {
      if (amount && amount.asOf !== input.exitDate) context.addIssue({code: "custom", path: ["series", index], message: `${series.id}: an amount dated ${amount.asOf} is not the base at the exit date ${input.exitDate}`});
    }
    const kinds = new Set<string>();
    series.mechanisms.forEach((mechanism, position) => {
      if (kinds.has(mechanism.mechanism)) context.addIssue({code: "custom", path: ["series", index, "mechanisms", position], message: `${series.id}: mechanism ${mechanism.mechanism} listed twice`});
      kinds.add(mechanism.mechanism);
      if ("businessDays" in mechanism) {
        if (mechanism.businessDays.maturity <= input.exitDate) context.addIssue({code: "custom", path: ["series", index, "mechanisms", position, "businessDays"], message: `${series.id}: maturity ${mechanism.businessDays.maturity} is not after the exit date`});
        const weekdays = weekdaysBetween(input.exitDate, mechanism.businessDays.maturity);
        if (mechanism.businessDays.count > weekdays) context.addIssue({code: "custom", path: ["series", index, "mechanisms", position, "businessDays"], message: `${series.id}: ${mechanism.businessDays.count} business days cannot fit in the ${weekdays} weekdays between ${input.exitDate} and ${mechanism.businessDays.maturity}`});
      }
      if ("quote" in mechanism && mechanism.quote) {
        if (mechanism.quote.quoteDate >= input.exitDate) context.addIssue({code: "custom", path: ["series", index, "mechanisms", position, "quote"], message: `${series.id}: the quote must precede the exit date`});
      }
      if (mechanism.mechanism === "extraordinary_amortization_ipca" && mechanism.presentValueAtQuote && !mechanism.quote) context.addIssue({code: "custom", path: ["series", index, "mechanisms", position], message: `${series.id}: a present value without its quote has no source`});
      if (mechanism.mechanism === "total_redemption_ipca" && mechanism.presentValueAtQuote && !mechanism.quote) context.addIssue({code: "custom", path: ["series", index, "mechanisms", position], message: `${series.id}: a present value without its quote has no source`});
    });
  });
});
export type ExitCostInput = z.input<typeof exitCostInputSchema>;

/** Weekdays strictly after `from` up to and including `to`, the ceiling of any business-day count. */
export function weekdaysBetween(from: string, to: string): number {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  let count = 0;
  for (let day = new Date(start.getTime() + 86_400_000); day <= end; day = new Date(day.getTime() + 86_400_000)) {
    const weekday = day.getUTCDay();
    if (weekday !== 0 && weekday !== 6) count += 1;
  }
  return count;
}

type Calculation = {id: string; formula: string; operands: Record<string, string>; result: string; unit: string};
type RouteState = "estimated" | "base_priced_premium_open" | "price_at_counterparty" | "insufficient_evidence" | "not_permitted";

export type ExitCostOutput = {
  schema_version: "method.estimate-exit-cost-by-series.v3";
  exit_date: string;
  unit: string;
  state: "complete" | "partial" | "empty";
  exit_costs: Array<{
    series_id: string;
    label: string;
    base: {nominal: string | null; accrued: string | null; charges: string | null; payable: string | null; anchors: {nominal: Anchor | null; accrued: Anchor | null; charges: Anchor | null}; state: "priced" | "insufficient_evidence"; reason: string | null};
    routes: Array<{mechanism: string; permitted_on_date: boolean; available_from: string | null; state: RouteState; premium: string | null; total_payable: string | null; reason: string | null; anchor: Anchor; quote: {rate: string; quoteDate: string; security: string; anchor: Anchor} | null}>;
    cheapest_unilateral: {mechanism: string; total_payable: string} | null;
    anchor: Anchor;
  }>;
  uncovered_terms: Array<{id: string; state: "insufficient_evidence"; reason: string}>;
  totals: {estimated_premium: string; estimated_payable: string; series_estimated: number; series_open: number};
  trace: {calculations: Calculation[]; inputFingerprint: string; outputFingerprint: string};
};

const d = (value: Decimal.Value) => new Decimal(value);
const out = (value: Decimal) => value.toDecimalPlaces(8).toFixed();
const truncate8 = (value: Decimal) => value.toDecimalPlaces(8, Decimal.ROUND_DOWN).toFixed();
const stableStringify = (value: unknown): string => JSON.stringify(value, (_key, inner: unknown) => (inner && typeof inner === "object" && !Array.isArray(inner) ? Object.fromEntries(Object.entries(inner as Record<string, unknown>).sort(([a], [b]) => compare(a, b))) : inner));
const fingerprint = (value: unknown) => createHash("sha256").update(stableStringify(value)).digest("hex");

function canonical(input: z.infer<typeof exitCostInputSchema>) {
  return {...input, series: [...input.series].sort((a, b) => compare(a.id, b.id)).map((series) => ({...series, mechanisms: [...series.mechanisms].sort((a, b) => compare(a.mechanism, b.mechanism))}))};
}

export function estimateExitCostBySeries(raw: ExitCostInput): ExitCostOutput {
  const input = canonical(exitCostInputSchema.parse(raw));
  const calculations: Calculation[] = [];
  const record = (calculation: Omit<Calculation, "unit">, unit: string = input.unit) => calculations.push({...calculation, unit});
  const uncovered: ExitCostOutput["uncovered_terms"] = [];

  const exitCosts = input.series.map((series): ExitCostOutput["exit_costs"][number] => {
    const missing = [["nominal", series.nominalAtExit], ["accrued", series.accruedAtExit]].filter(([, amount]) => amount === null).map(([name]) => name as string);
    const anchors = {nominal: series.nominalAtExit?.anchor ?? null, accrued: series.accruedAtExit?.anchor ?? null, charges: series.chargesAtExit?.anchor ?? null};
    let base: ExitCostOutput["exit_costs"][number]["base"];
    if (missing.length > 0) {
      const reason = `the base does not hold the ${missing.join(" and ")} of ${series.label} at ${input.exitDate}; a price needs nominal plus accrued remuneration plus charges at the exit date, none of them assumed`;
      uncovered.push({id: `base:${series.id}`, state: "insufficient_evidence", reason});
      base = {nominal: series.nominalAtExit ? out(d(series.nominalAtExit.value)) : null, accrued: null, charges: series.chargesAtExit ? out(d(series.chargesAtExit.value)) : null, payable: null, anchors, state: "insufficient_evidence", reason};
    } else {
      const payable = d(series.nominalAtExit!.value).plus(series.accruedAtExit!.value).plus(series.chargesAtExit?.value ?? 0);
      record({id: `financial.exit_base:${series.id}`, formula: "nominalAtExit + accruedAtExit + chargesAtExit", operands: {nominalAtExit: series.nominalAtExit!.value, accruedAtExit: series.accruedAtExit!.value, chargesAtExit: series.chargesAtExit?.value ?? "0"}, result: out(payable)});
      base = {nominal: out(d(series.nominalAtExit!.value)), accrued: out(d(series.accruedAtExit!.value)), charges: series.chargesAtExit ? out(d(series.chargesAtExit.value)) : null, payable: out(payable), anchors, state: "priced", reason: null};
    }
    const basePayable = base.payable ? d(base.payable) : null;
    const routes = series.mechanisms.map((mechanism): ExitCostOutput["exit_costs"][number]["routes"][number] => {
      const availableFrom = mechanism.availableFrom ?? null;
      const permitted = availableFrom === null ? true : input.exitDate >= availableFrom;
      const common = {mechanism: mechanism.mechanism, permitted_on_date: permitted, available_from: availableFrom, anchor: mechanism.anchor, quote: "quote" in mechanism && mechanism.quote ? {rate: mechanism.quote.rate, quoteDate: mechanism.quote.quoteDate, security: mechanism.quote.security, anchor: mechanism.quote.anchor} : null};
      if (!permitted) return {...common, state: "not_permitted", premium: null, total_payable: null, reason: `this mechanism is only available from ${availableFrom}`};
      if (mechanism.mechanism === "acquisition") return {...common, state: "price_at_counterparty", premium: null, total_payable: null, reason: "facultative acquisition depends on the seller's acceptance; the price is whatever the seller accepts, and the base holds no offer"};
      if (!basePayable) return {...common, state: "insufficient_evidence", premium: null, total_payable: null, reason: base.reason};
      if (mechanism.mechanism === "extraordinary_amortization_di" || mechanism.mechanism === "total_redemption_di") {
        const factor = d(mechanism.premiumPerYear).plus(1).pow(d(mechanism.businessDays.count).div(252)).minus(1);
        const premium = d(truncate8(basePayable.times(factor)));
        record({id: `structure.exit_premium:${series.id}:${mechanism.mechanism}`, formula: "[(1 + premiumPerYear)^(businessDays/252) - 1] * basePayable, truncated at eight decimals", operands: {premiumPerYear: mechanism.premiumPerYear, businessDays: String(mechanism.businessDays.count), maturity: mechanism.businessDays.maturity, basePayable: out(basePayable)}, result: out(premium)});
        return {...common, state: "estimated", premium: out(premium), total_payable: out(basePayable.plus(premium)), reason: null};
      }
      if (mechanism.mechanism === "extraordinary_amortization_ipca" || mechanism.mechanism === "total_redemption_ipca") {
        const which = mechanism.mechanism === "extraordinary_amortization_ipca" ? "the second business day before the exit date" : "the business day immediately before the exit date";
        if (!mechanism.quote || !mechanism.presentValueAtQuote) return {...common, state: "insufficient_evidence", premium: null, total_payable: null, reason: `needs the ${mechanism.referenceRate} quote of ${which} and the present value of the remaining flows at that quote; the base holds neither`};
        const present = d(mechanism.presentValueAtQuote.value);
        const payable = mechanism.mechanism === "extraordinary_amortization_ipca" ? Decimal.max(basePayable, present) : present;
        record({id: `structure.exit_make_whole:${series.id}:${mechanism.mechanism}`, formula: mechanism.mechanism === "extraordinary_amortization_ipca" ? "max(basePayable, presentValueAtQuote)" : "presentValueAtQuote", operands: {basePayable: out(basePayable), presentValueAtQuote: mechanism.presentValueAtQuote.value, quoteRate: mechanism.quote.rate, quoteDate: mechanism.quote.quoteDate, security: mechanism.quote.security}, result: out(payable)});
        return {...common, state: "estimated", premium: out(payable.minus(basePayable)), total_payable: out(payable), reason: null};
      }
      if (mechanism.mechanism === "negotiated_offer") {
        // The base is priced by the indenture; the premium is set in the notice, never negative.
        if (mechanism.premium === null) return {...common, state: "base_priced_premium_open", premium: null, total_payable: null, reason: `the indenture prices the base (${out(basePayable)}); the premium is set in the offer notice${mechanism.requiresFullAdherence ? " and the redemption needs the adherence of every holder" : " and the holders decide"}; no notice exists in the base`};
        const premium = basePayable.times(mechanism.premium.rate);
        record({id: `structure.exit_premium:${series.id}:negotiated_offer`, formula: "basePayable * premiumRate", operands: {basePayable: out(basePayable), premiumRate: mechanism.premium.rate}, result: out(premium)});
        return {...common, state: "estimated", premium: out(premium), total_payable: out(basePayable.plus(premium)), reason: mechanism.requiresFullAdherence ? "requires adherence of every holder" : "holders decide in assembly"};
      }
      throw new Error(`unknown mechanism ${(mechanism as {mechanism: string}).mechanism}`);
    });
    const unilateral = routes.filter((route) => route.state === "estimated" && route.mechanism !== "negotiated_offer" && route.total_payable !== null).sort((a, b) => compare(a.total_payable!, b.total_payable!) || compare(a.mechanism, b.mechanism));
    return {series_id: series.id, label: series.label, base, routes, cheapest_unilateral: unilateral[0] ? {mechanism: unilateral[0].mechanism, total_payable: unilateral[0].total_payable!} : null, anchor: series.anchor};
  });

  const estimated = exitCosts.filter((entry) => entry.cheapest_unilateral !== null);
  const totals = {
    estimated_premium: out(estimated.reduce((sum, entry) => sum.plus(d(entry.cheapest_unilateral!.total_payable).minus(entry.base.payable!)), d(0))),
    estimated_payable: out(estimated.reduce((sum, entry) => sum.plus(entry.cheapest_unilateral!.total_payable), d(0))),
    series_estimated: estimated.length,
    series_open: exitCosts.length - estimated.length,
  };
  if (input.series.length === 0) record({id: "structure.exit_cost:none", formula: "no series to retire", operands: {}, result: "0"});
  const state: ExitCostOutput["state"] = input.series.length === 0 ? "empty" : totals.series_open > 0 ? "partial" : "complete";
  const body = {schema_version: "method.estimate-exit-cost-by-series.v3" as const, exit_date: input.exitDate, unit: input.unit, state, exit_costs: exitCosts, uncovered_terms: uncovered, totals};
  return {...body, trace: {calculations, inputFingerprint: fingerprint(input), outputFingerprint: fingerprint({...body, calculations})}};
}
