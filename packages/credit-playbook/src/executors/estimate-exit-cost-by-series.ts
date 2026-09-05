import {createHash} from "node:crypto";

import {macaulayDurationBusinessDays, presentValueByBusinessDays} from "@offroad/financial-core";
import Decimal from "decimal.js";
import {z} from "zod";

/**
 * Executor of the method `estimate-exit-cost-by-series` (v5, after the third independent review).
 * For each series an alternative wants to retire on a date: which mechanisms its indenture offers on
 * that date, each with its own formula, scope and quote day, and what each costs with what the base
 * holds. The base of any price is the nominal at the exit date (updated where indexed, with the
 * derivation the source allows), the remuneration accrued to that date and the charges the indenture
 * states, each dated at the exit and anchored; a 31/05 balance is not a nominal at 04/09, and a
 * missing component is insufficient evidence, never zero. Mechanisms are never merged: the DI
 * premium is [(1 + p)^(DU/252) - 1] over the amount retired, truncated at eight decimals; an
 * extraordinary amortization retires a fraction the indenture caps and never competes as a full
 * exit; a make-whole redemption discounts the remaining flows at the quote of the contractual day
 * (the prior or the second prior business day, as the series says, and that distance is checked
 * against the calendar), adds the charges the indenture adds, and applies the floor the series says
 * (the updated value, or none); the duration that selects the reference security is discounted at
 * the series' own remuneration; a negotiated offer is open since issuance with a premium to be set;
 * an acquisition depends on the seller and may be partial. Every anchor names a document of the
 * base's registry and every mechanism cites the series' indenture with its clause; a series without
 * an indenture is not priced.
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
const quoteSchema = z.object({
  rate: nonNegative,
  quoteDate: isoDate,
  /** Business days between the quote date and the exit date: the weekdays between them less the holidays the calendar lists. */
  businessDaysBeforeExit: z.number().int().positive(),
  /** Holidays between the quote date and the exit date, from the calendar the base cites (zero must be stated too). */
  holidaysBetween: z.object({count: z.number().int().nonnegative(), anchor: anchorSchema}).strict(),
  security: nonEmpty,
  /** The reference security's own duration in business days, when the source states it, so the nearest-duration choice is auditable. */
  securityDurationBusinessDays: z.number().int().positive().nullable().default(null),
  anchor: anchorSchema,
}).strict();
const businessDaysSchema = z.object({count: z.number().int().nonnegative(), maturity: isoDate, anchor: anchorSchema}).strict();
const referenceRateSchema = z.enum(["NTN-B (ANBIMA indicative, nearest duration)", "B3 Pre x DI curve (nearest vertex to remaining duration)"]);
const makeWholeFields = {
  availableFrom: isoDate,
  referenceRate: referenceRateSchema,
  /** The floor the series writes: the updated value (max of A and B) or none (present value only). */
  floor: z.enum(["max_with_base", "present_value_only"]),
  /** The contractual quote day the series writes. */
  quoteDay: z.enum(["prior_business_day", "second_prior_business_day"]),
  /** The quote of that day, when the base holds it. */
  quote: quoteSchema.nullable(),
  anchor: anchorSchema,
};

export const exitMechanismSchema = z.discriminatedUnion("mechanism", [
  z.object({
    mechanism: z.literal("extraordinary_amortization_di"),
    /** Premium per year as a decimal (0.004 for 0,40%), applied as [(1 + p)^(DU/252) - 1] over the amount retired. */
    premiumPerYear: nonNegative,
    availableFrom: isoDate,
    /** The share of the nominal the indenture lets an amortization retire (0.98 for 98%), and the share this alternative retires. */
    maxFraction: nonNegative,
    fraction: nonNegative,
    businessDays: businessDaysSchema,
    anchor: anchorSchema,
  }).strict(),
  z.object({mechanism: z.literal("total_redemption_di"), premiumPerYear: nonNegative, availableFrom: isoDate, businessDays: businessDaysSchema, anchor: anchorSchema}).strict(),
  z.object({mechanism: z.literal("extraordinary_amortization_ipca"), maxFraction: nonNegative, fraction: nonNegative, ...makeWholeFields}).strict(),
  z.object({mechanism: z.literal("total_redemption_ipca"), ...makeWholeFields}).strict(),
  z.object({mechanism: z.literal("extraordinary_amortization_pre"), maxFraction: nonNegative, fraction: nonNegative, ...makeWholeFields}).strict(),
  z.object({mechanism: z.literal("total_redemption_pre"), ...makeWholeFields}).strict(),
  z.object({
    mechanism: z.literal("negotiated_offer"),
    /** Open since issuance in the 13th, 14th and 15th; the premium is set in the notice and the holders decide. */
    availableFrom: isoDate,
    premium: z.object({rate: nonNegative, anchor: anchorSchema}).strict().nullable(),
    requiresFullAdherence: z.boolean(),
    anchor: anchorSchema,
  }).strict(),
  z.object({mechanism: z.literal("acquisition"), availableFrom: isoDate.nullable(), anchor: anchorSchema}).strict(),
]);
const MAKE_WHOLE = new Set(["extraordinary_amortization_ipca", "total_redemption_ipca", "extraordinary_amortization_pre", "total_redemption_pre"]);
const PARTIAL = new Set(["extraordinary_amortization_di", "extraordinary_amortization_ipca", "extraordinary_amortization_pre"]);

export const exitCostInputSchema = z.object({
  exitDate: isoDate,
  unit: unitSchema,
  /** The documents of the base; every anchor must name one of them, and a mechanism must cite an indenture. */
  documents: z.array(z.object({name: nonEmpty, kind: z.enum(["indenture", "itr", "ledger", "quote", "calendar", "notice", "market_data", "other"])}).strict()).min(1),
  series: z.array(z.object({
    id: nonEmpty,
    label: nonEmpty,
    /** The indenture that governs the series; without one in the base the series is not priced. */
    indenture: z.object({document: nonEmpty, clause: nonEmpty.optional()}).strict().nullable(),
    /** Nominal at the exit date (updated where indexed), with the derivation the source allows; null when the base does not hold it. */
    nominalAtExit: z.object({value: nonNegative, asOf: isoDate, derivation: z.enum(["unit_value_x_quantity_updated", "unit_value_x_quantity", "ledger_balance_at_exit_date", "trustee_report_at_exit_date"]), anchor: anchorSchema}).strict().nullable(),
    /** Remuneration accrued to the exit date; null when the base does not hold it (never zero by default). */
    accruedAtExit: datedAmountSchema.nullable(),
    /** Charges due at the exit date as the indenture states them, an explicit zero included; null when the base is silent. */
    chargesAtExit: datedAmountSchema.nullable(),
    /** Remaining flows after the exit date for the make-whole prices, each with its business days from the exit date; null when the base has no schedule. */
    remainingFlows: z.array(z.object({id: nonEmpty, date: isoDate, amount: nonNegative, businessDaysFromExit: z.number().int().positive(), anchor: anchorSchema}).strict()).nullable(),
    /** The series' own remuneration as an annual rate (the real spread for an IPCA series, the fixed rate for a pre series), which the indenture uses to discount the duration that selects the reference security. */
    remunerationRate: z.object({value: nonNegative, anchor: anchorSchema}).strict().nullable(),
    mechanisms: z.array(exitMechanismSchema),
    anchor: anchorSchema,
  }).strict()),
}).strict().superRefine((input, context) => {
  const documents = new Map(input.documents.map((document) => [document.name, document.kind]));
  const names = new Set<string>();
  input.documents.forEach((document, index) => { if (names.has(document.name)) context.addIssue({code: "custom", path: ["documents", index], message: `duplicate document ${document.name}`}); names.add(document.name); });
  const checkAnchor = (anchor: Anchor, path: (string | number)[]) => { if (!documents.has(anchor.document)) context.addIssue({code: "custom", path, message: `anchor names ${anchor.document}, which is not a document of the base`}); };
  const ids = new Set<string>();
  input.series.forEach((series, index) => {
    if (ids.has(series.id)) context.addIssue({code: "custom", path: ["series", index], message: `duplicate series ${series.id}`});
    ids.add(series.id);
    checkAnchor(series.anchor, ["series", index, "anchor"]);
    if (series.indenture && documents.get(series.indenture.document) !== "indenture") context.addIssue({code: "custom", path: ["series", index, "indenture"], message: `${series.id}: ${series.indenture.document} is not registered as an indenture`});
    for (const [name, amount] of [["nominalAtExit", series.nominalAtExit], ["accruedAtExit", series.accruedAtExit], ["chargesAtExit", series.chargesAtExit]] as const) {
      if (!amount) continue;
      checkAnchor(amount.anchor, ["series", index, name, "anchor"]);
      if (amount.asOf !== input.exitDate) context.addIssue({code: "custom", path: ["series", index, name], message: `${series.id}: ${name} dated ${amount.asOf} is not the base at the exit date ${input.exitDate}`});
    }
    const flowIds = new Set<string>();
    (series.remainingFlows ?? []).forEach((flow, position) => {
      checkAnchor(flow.anchor, ["series", index, "remainingFlows", position, "anchor"]);
      if (flowIds.has(flow.id)) context.addIssue({code: "custom", path: ["series", index, "remainingFlows", position], message: `${series.id}: duplicate flow ${flow.id}`});
      flowIds.add(flow.id);
      if (flow.date <= input.exitDate) context.addIssue({code: "custom", path: ["series", index, "remainingFlows", position], message: `${series.id}: flow ${flow.id} on ${flow.date} is not after the exit date`});
      if (flow.businessDaysFromExit > weekdaysBetween(input.exitDate, flow.date)) context.addIssue({code: "custom", path: ["series", index, "remainingFlows", position], message: `${series.id}: flow ${flow.id} claims ${flow.businessDaysFromExit} business days in ${weekdaysBetween(input.exitDate, flow.date)} weekdays`});
    });
    const kinds = new Set<string>();
    series.mechanisms.forEach((mechanism, position) => {
      const path = ["series", index, "mechanisms", position];
      if (kinds.has(mechanism.mechanism)) context.addIssue({code: "custom", path, message: `${series.id}: mechanism ${mechanism.mechanism} listed twice`});
      kinds.add(mechanism.mechanism);
      checkAnchor(mechanism.anchor, [...path, "anchor"]);
      if (documents.get(mechanism.anchor.document) !== "indenture") context.addIssue({code: "custom", path: [...path, "anchor"], message: `${series.id}: mechanism ${mechanism.mechanism} must cite an indenture, not ${mechanism.anchor.document}`});
      if (series.indenture && mechanism.anchor.document !== series.indenture.document) context.addIssue({code: "custom", path: [...path, "anchor"], message: `${series.id}: mechanism ${mechanism.mechanism} cites ${mechanism.anchor.document}, not the series' indenture ${series.indenture.document}`});
      if (!mechanism.anchor.clause) context.addIssue({code: "custom", path: [...path, "anchor"], message: `${series.id}: mechanism ${mechanism.mechanism} must cite the clause of the indenture that writes it`});
      if ("businessDays" in mechanism) {
        checkAnchor(mechanism.businessDays.anchor, [...path, "businessDays", "anchor"]);
        if (documents.get(mechanism.businessDays.anchor.document) !== "calendar") context.addIssue({code: "custom", path: [...path, "businessDays"], message: `${series.id}: business days must cite a calendar of the base`});
        if (mechanism.businessDays.maturity <= input.exitDate) context.addIssue({code: "custom", path: [...path, "businessDays"], message: `${series.id}: maturity ${mechanism.businessDays.maturity} is not after the exit date`});
        if (mechanism.businessDays.count === 0) context.addIssue({code: "custom", path: [...path, "businessDays"], message: `${series.id}: a maturity after the exit date has at least one business day; a count of zero prices a premium of zero`});
        const weekdays = weekdaysBetween(input.exitDate, mechanism.businessDays.maturity);
        if (mechanism.businessDays.count > weekdays) context.addIssue({code: "custom", path: [...path, "businessDays"], message: `${series.id}: ${mechanism.businessDays.count} business days cannot fit in the ${weekdays} weekdays between ${input.exitDate} and ${mechanism.businessDays.maturity}`});
      }
      if ("fraction" in mechanism) {
        if (new Decimal(mechanism.maxFraction).gte(1) || new Decimal(mechanism.maxFraction).lte(0)) context.addIssue({code: "custom", path, message: `${series.id}: an extraordinary amortization retires a fraction the indenture caps below 100%; maxFraction must be in (0, 1)`});
        if (new Decimal(mechanism.fraction).gt(mechanism.maxFraction) || new Decimal(mechanism.fraction).lte(0)) context.addIssue({code: "custom", path, message: `${series.id}: the fraction ${mechanism.fraction} exceeds the ${mechanism.maxFraction} the indenture allows, or is not positive`});
      }
      if ("quote" in mechanism && mechanism.quote) {
        checkAnchor(mechanism.quote.anchor, [...path, "quote", "anchor"]);
        if (mechanism.quote.quoteDate >= input.exitDate) context.addIssue({code: "custom", path: [...path, "quote"], message: `${series.id}: the quote must precede the exit date`});
        checkAnchor(mechanism.quote.holidaysBetween.anchor, [...path, "quote", "holidaysBetween"]);
        if (documents.get(mechanism.quote.holidaysBetween.anchor.document) !== "calendar") context.addIssue({code: "custom", path: [...path, "quote", "holidaysBetween"], message: `${series.id}: the holidays between the quote and the exit must cite a calendar of the base`});
        const expected = weekdaysBetween(mechanism.quote.quoteDate, input.exitDate) - mechanism.quote.holidaysBetween.count;
        if (mechanism.quote.businessDaysBeforeExit !== expected) context.addIssue({code: "custom", path: [...path, "quote"], message: `${series.id}: the quote of ${mechanism.quote.quoteDate} is ${expected} business days before ${input.exitDate} by the calendar (${weekdaysBetween(mechanism.quote.quoteDate, input.exitDate)} weekdays less ${mechanism.quote.holidaysBetween.count} holidays), not ${mechanism.quote.businessDaysBeforeExit}`});
        if (documents.get(mechanism.quote.anchor.document) !== "quote" && documents.get(mechanism.quote.anchor.document) !== "market_data") context.addIssue({code: "custom", path: [...path, "quote", "anchor"], message: `${series.id}: a quote must cite a quote or market data document of the base`});
      }
      if ("premium" in mechanism && mechanism.premium) checkAnchor(mechanism.premium.anchor, [...path, "premium", "anchor"]);
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
type Route = {
  mechanism: string; scope: "full" | "partial" | "partial_or_full"; fraction: string | null; permitted_on_date: boolean; available_from: string | null; state: RouteState;
  amount_retired: string | null; premium: string | null; total_payable: string | null; reason: string | null; anchor: Anchor;
  quote: {rate: string; quoteDate: string; businessDaysBeforeExit: number; security: string; securityDurationBusinessDays: number | null; anchor: Anchor} | null;
  /** The present value of the remaining flows at the quote, the duration at the series' own remuneration (which selects the security), and the flows counted. */
  present_value: {value: string; duration_business_days_at_remuneration: string; remuneration_rate: string; flows: number; charges_added: string} | null;
};

export type ExitCostOutput = {
  schema_version: "method.estimate-exit-cost-by-series.v5";
  exit_date: string;
  unit: string;
  state: "complete" | "partial" | "empty";
  exit_costs: Array<{
    series_id: string;
    label: string;
    indenture: {document: string; clause: string | null} | null;
    base: {nominal: string | null; nominal_derivation: string | null; accrued: string | null; charges: string | null; payable: string | null; anchors: {nominal: Anchor | null; accrued: Anchor | null; charges: Anchor | null}; state: "priced" | "insufficient_evidence"; reason: string | null};
    routes: Route[];
    cheapest_full_exit: {mechanism: string; total_payable: string} | null;
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
  return {
    ...input,
    documents: [...input.documents].sort((a, b) => compare(a.name, b.name)),
    series: [...input.series].sort((a, b) => compare(a.id, b.id)).map((series) => ({...series, remainingFlows: series.remainingFlows ? [...series.remainingFlows].sort((a, b) => compare(a.date, b.date) || compare(a.id, b.id)) : null, mechanisms: [...series.mechanisms].sort((a, b) => compare(a.mechanism, b.mechanism))})),
  };
}

export function estimateExitCostBySeries(raw: ExitCostInput): ExitCostOutput {
  const input = canonical(exitCostInputSchema.parse(raw));
  const calculations: Calculation[] = [];
  const record = (calculation: Omit<Calculation, "unit">, unit: string = input.unit) => calculations.push({...calculation, unit});
  const uncovered: ExitCostOutput["uncovered_terms"] = [];

  const exitCosts = input.series.map((series): ExitCostOutput["exit_costs"][number] => {
    const anchors = {nominal: series.nominalAtExit?.anchor ?? null, accrued: series.accruedAtExit?.anchor ?? null, charges: series.chargesAtExit?.anchor ?? null};
    const indenture = series.indenture ? {document: series.indenture.document, clause: series.indenture.clause ?? null} : null;
    const missing = ([["nominal", series.nominalAtExit], ["accrued remuneration", series.accruedAtExit], ["charges", series.chargesAtExit]] as const).filter(([, amount]) => amount === null).map(([name]) => name);
    let base: ExitCostOutput["exit_costs"][number]["base"];
    if (!indenture) {
      const reason = `no indenture of ${series.label} is in the base; without the instrument that writes the mechanisms nothing is priced`;
      uncovered.push({id: `indenture:${series.id}`, state: "insufficient_evidence", reason});
      base = {nominal: null, nominal_derivation: null, accrued: null, charges: null, payable: null, anchors, state: "insufficient_evidence", reason};
    } else if (missing.length > 0) {
      const reason = `the base does not hold the ${missing.join(", ")} of ${series.label} at ${input.exitDate}; a price needs the nominal at the exit date, the remuneration accrued to it and the charges the indenture states (an explicit zero included), none of them assumed`;
      uncovered.push({id: `base:${series.id}`, state: "insufficient_evidence", reason});
      base = {nominal: series.nominalAtExit ? out(d(series.nominalAtExit.value)) : null, nominal_derivation: series.nominalAtExit?.derivation ?? null, accrued: series.accruedAtExit ? out(d(series.accruedAtExit.value)) : null, charges: series.chargesAtExit ? out(d(series.chargesAtExit.value)) : null, payable: null, anchors, state: "insufficient_evidence", reason};
    } else {
      const payable = d(series.nominalAtExit!.value).plus(series.accruedAtExit!.value).plus(series.chargesAtExit!.value);
      record({id: `financial.exit_base:${series.id}`, formula: "nominalAtExit + accruedAtExit + chargesAtExit", operands: {nominalAtExit: series.nominalAtExit!.value, nominalDerivation: series.nominalAtExit!.derivation, accruedAtExit: series.accruedAtExit!.value, chargesAtExit: series.chargesAtExit!.value}, result: out(payable)});
      base = {nominal: out(d(series.nominalAtExit!.value)), nominal_derivation: series.nominalAtExit!.derivation, accrued: out(d(series.accruedAtExit!.value)), charges: out(d(series.chargesAtExit!.value)), payable: out(payable), anchors, state: "priced", reason: null};
    }
    const basePayable = base.payable ? d(base.payable) : null;

    const routes = series.mechanisms.map((mechanism): Route => {
      const availableFrom = mechanism.availableFrom ?? null;
      const permitted = availableFrom === null ? true : input.exitDate >= availableFrom;
      const partial = PARTIAL.has(mechanism.mechanism);
      const fraction = "fraction" in mechanism ? mechanism.fraction : null;
      const scope = mechanism.mechanism === "acquisition" ? "partial_or_full" as const : partial ? "partial" as const : "full" as const;
      const common = {mechanism: mechanism.mechanism, scope, fraction, permitted_on_date: permitted, available_from: availableFrom, anchor: mechanism.anchor, quote: "quote" in mechanism && mechanism.quote ? {rate: mechanism.quote.rate, quoteDate: mechanism.quote.quoteDate, businessDaysBeforeExit: mechanism.quote.businessDaysBeforeExit, security: mechanism.quote.security, securityDurationBusinessDays: mechanism.quote.securityDurationBusinessDays, anchor: mechanism.quote.anchor} : null, present_value: null, amount_retired: null, premium: null, total_payable: null};
      if (!indenture) return {...common, state: "insufficient_evidence", reason: base.reason};
      if (!permitted) return {...common, state: "not_permitted", reason: `this mechanism is only available from ${availableFrom}`};
      if (mechanism.mechanism === "acquisition") return {...common, state: "price_at_counterparty", reason: "facultative acquisition of the debentures a seller accepts, all or part of the series; the price is whatever the seller accepts, and the base holds no offer"};
      if (!basePayable) return {...common, state: "insufficient_evidence", reason: base.reason};
      const retired = fraction ? basePayable.times(fraction) : basePayable;
      if (mechanism.mechanism === "extraordinary_amortization_di" || mechanism.mechanism === "total_redemption_di") {
        const factor = d(mechanism.premiumPerYear).plus(1).pow(d(mechanism.businessDays.count).div(252)).minus(1);
        const premium = d(truncate8(retired.times(factor)));
        record({id: `structure.exit_premium:${series.id}:${mechanism.mechanism}`, formula: "[(1 + premiumPerYear)^(businessDays/252) - 1] * amountRetired, truncated at eight decimals", operands: {premiumPerYear: mechanism.premiumPerYear, businessDays: String(mechanism.businessDays.count), maturity: mechanism.businessDays.maturity, basePayable: out(basePayable), fraction: fraction ?? "1", amountRetired: out(retired)}, result: out(premium)});
        return {...common, state: "estimated", amount_retired: out(retired), premium: out(premium), total_payable: out(retired.plus(premium)), reason: partial ? `retires ${fraction} of the series; not a full exit` : null};
      }
      if (MAKE_WHOLE.has(mechanism.mechanism) && "quoteDay" in mechanism) {
        const requiredOffset = mechanism.quoteDay === "prior_business_day" ? 1 : 2;
        const which = mechanism.quoteDay === "prior_business_day" ? "the business day immediately before the exit date" : "the second business day before the exit date";
        if (!mechanism.quote) return {...common, state: "insufficient_evidence", reason: `needs the ${mechanism.referenceRate} quote of ${which}; the base holds none`};
        if (mechanism.quote.businessDaysBeforeExit !== requiredOffset) return {...common, state: "insufficient_evidence", reason: `the quote in the base is ${mechanism.quote.businessDaysBeforeExit} business days before the exit; the series requires ${which}`};
        if (!series.remainingFlows || series.remainingFlows.length === 0) return {...common, state: "insufficient_evidence", reason: `needs the remaining flows of ${series.label} after ${input.exitDate} to discount at the quote; the base holds no schedule`};
        if (!series.remunerationRate) return {...common, state: "insufficient_evidence", reason: `needs the remuneration rate of ${series.label}: the indenture discounts the duration that selects the reference security at the series' own remuneration, and the base does not state it`};
        const flows = series.remainingFlows.map((flow) => ({id: flow.id, amount: flow.amount, businessDays: flow.businessDaysFromExit}));
        const present = presentValueByBusinessDays(flows, mechanism.quote.rate);
        const duration = macaulayDurationBusinessDays(flows, series.remunerationRate.value);
        calculations.push({...present.trace, id: `${present.trace.id}:${series.id}:${mechanism.mechanism}`, unit: input.unit});
        calculations.push({...duration.trace, id: `${duration.trace.id}:${series.id}:${mechanism.mechanism}`, formula: `${duration.trace.formula}, discounted at the series' remuneration`, unit: "business days"});
        // The indenture compares the updated value with the present value of the remaining flows, then adds the charges due; the fraction scales both.
        const chargesRetired = d(series.chargesAtExit!.value).times(fraction ?? 1);
        const principalAndAccrued = d(series.nominalAtExit!.value).plus(series.accruedAtExit!.value).times(fraction ?? 1);
        const presentValue = d(present.value).times(fraction ?? 1);
        const payable = (mechanism.floor === "max_with_base" ? Decimal.max(principalAndAccrued, presentValue) : presentValue).plus(chargesRetired);
        record({id: `structure.exit_make_whole:${series.id}:${mechanism.mechanism}`, formula: mechanism.floor === "max_with_base" ? "max((nominal + accrued) * fraction, presentValueAtQuote * fraction) + charges * fraction" : "presentValueAtQuote * fraction + charges * fraction", operands: {nominalPlusAccrued: out(principalAndAccrued), presentValueAtQuote: present.value, charges: out(chargesRetired), fraction: fraction ?? "1", quoteRate: mechanism.quote.rate, quoteDate: mechanism.quote.quoteDate, quoteDay: mechanism.quoteDay, security: mechanism.quote.security, referenceRate: mechanism.referenceRate, durationAtRemuneration: duration.value, remunerationRate: series.remunerationRate.value}, result: out(payable)});
        return {...common, state: "estimated", amount_retired: out(retired), premium: out(payable.minus(retired)), total_payable: out(payable), present_value: {value: out(presentValue), duration_business_days_at_remuneration: duration.value, remuneration_rate: series.remunerationRate.value, flows: flows.length, charges_added: out(chargesRetired)}, reason: partial ? `retires ${fraction} of the series; not a full exit` : null};
      }
      if (mechanism.mechanism === "negotiated_offer") {
        if (mechanism.premium === null) return {...common, state: "base_priced_premium_open", amount_retired: out(basePayable), reason: `the indenture prices the base (${out(basePayable)}); the premium is set in the offer notice${mechanism.requiresFullAdherence ? " and the redemption needs the adherence of every holder" : " and the holders decide"}; no notice exists in the base`};
        const premium = basePayable.times(mechanism.premium.rate);
        record({id: `structure.exit_premium:${series.id}:negotiated_offer`, formula: "basePayable * premiumRate", operands: {basePayable: out(basePayable), premiumRate: mechanism.premium.rate}, result: out(premium)});
        return {...common, state: "estimated", amount_retired: out(basePayable), premium: out(premium), total_payable: out(basePayable.plus(premium)), reason: mechanism.requiresFullAdherence ? "requires adherence of every holder" : "holders decide in assembly"};
      }
      throw new Error(`unknown mechanism ${(mechanism as {mechanism: string}).mechanism}`);
    });
    const fullExits = routes.filter((route) => route.state === "estimated" && route.scope === "full" && route.mechanism !== "negotiated_offer" && route.total_payable !== null).sort((a, b) => d(a.total_payable!).comparedTo(d(b.total_payable!)) || compare(a.mechanism, b.mechanism));
    return {series_id: series.id, label: series.label, indenture, base, routes, cheapest_full_exit: fullExits[0] ? {mechanism: fullExits[0].mechanism, total_payable: fullExits[0].total_payable!} : null, anchor: series.anchor};
  });

  const estimated = exitCosts.filter((entry) => entry.cheapest_full_exit !== null);
  const totals = {
    estimated_premium: out(estimated.reduce((sum, entry) => sum.plus(d(entry.cheapest_full_exit!.total_payable).minus(entry.base.payable!)), d(0))),
    estimated_payable: out(estimated.reduce((sum, entry) => sum.plus(entry.cheapest_full_exit!.total_payable), d(0))),
    series_estimated: estimated.length,
    series_open: exitCosts.length - estimated.length,
  };
  if (input.series.length === 0) record({id: "structure.exit_cost:none", formula: "no series to retire", operands: {}, result: "0"});
  const state: ExitCostOutput["state"] = input.series.length === 0 ? "empty" : totals.series_open > 0 ? "partial" : "complete";
  const body = {schema_version: "method.estimate-exit-cost-by-series.v5" as const, exit_date: input.exitDate, unit: input.unit, state, exit_costs: exitCosts, uncovered_terms: uncovered, totals};
  const inputFingerprint = fingerprint(input);
  return {...body, trace: {calculations, inputFingerprint, outputFingerprint: fingerprint({...body, calculations, inputFingerprint})}};
}
