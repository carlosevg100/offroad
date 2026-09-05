import {createHash} from "node:crypto";

import {aggregateDebtViews, buildDebtServiceSchedule, calculateAllInCost, calculateCovenantHeadroom, calculateLeverage, calculateLiquidityCoverage, calculateProFormaPosition, maturityConcentration} from "@offroad/financial-core";
import Decimal from "decimal.js";
import {z} from "zod";

/**
 * Executor of the method `compare-refinancing-before-after` (v7, after the fifth independent
 * review). Every alternative is shown before and after with the same objects: gross and net debt by
 * the contractual components, leverage on a declared EBITDA, headroom only against a resolved and
 * comparable limit, concentration by the schedule's own periods (safra years with their end dates,
 * new principal placed by date), principal cover per period when cash generation is declared, and
 * the all-in cost of the new debt including exit premiums and fees paid from cash. The cost of the
 * existing debt is a different basis and is never ranked against the new debt's all-in. A retired
 * series without a priced exit blocks its alternative; a ranking needs a declared discriminator.
 */
const nonNegative = z.string().regex(/^\d+(\.\d+)?$/);
const rate = z.string().regex(/^\d+(\.\d+)?$/);
const nonEmpty = z.string().trim().min(1);
/** A calendar date that exists: the regex alone would let 2026-02-30 through. */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => { const [year, month, day] = value.split("-").map(Number) as [number, number, number]; const date = new Date(Date.UTC(year, month - 1, day)); return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day; }, {message: "not a calendar date"});
const unitSchema = z.enum(["BRL", "BRL thousand", "BRL million", "USD", "USD thousand"]);
const anchorSchema = z.object({document: nonEmpty, page: z.number().int().positive().optional(), note: nonEmpty.optional(), clause: nonEmpty.optional()}).strict();
type Anchor = z.infer<typeof anchorSchema>;
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export const alternativeSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_-]*$/),
  label: nonEmpty,
  /** The new debt's terms with the class of their source: a term sheet or a proposal in the base verifies them; indicative terms are a declared scenario, never a verified cost. A merely authorized funding is not a source of principal. */
  newDebt: z.object({amount: nonNegative, annualRate: rate, termMonths: z.number().int().positive(), graceMonths: z.number().int().nonnegative(), format: z.enum(["sac", "price", "bullet", "balloon"]), upfrontFeeRate: rate, disbursementDate: isoDate, origin: nonEmpty, termsSource: z.enum(["term_sheet", "proposal", "contract", "indicative_unverified", "authorized_only"]), anchor: anchorSchema}).strict().nullable(),
  /** Series retired: each instalment leaves its own period with its anchored principal; the priced exit comes from the exit-cost executor with the mechanism and its permission on the date, or a null price blocks the alternative. */
  retired: z.array(z.object({
    seriesId: nonEmpty,
    /** The principal retired is the contractual nominal of the instalment; a carrying amount (balance with accrued interest and costs) is not a principal and is refused. */
    instalments: z.array(z.object({period: nonEmpty, principal: z.object({value: nonNegative, basis: z.enum(["contractual_nominal", "carrying_amount"]), anchor: anchorSchema}).strict(), maturityAnchor: anchorSchema}).strict()).min(1),
    exitPremium: z.object({value: nonNegative, mechanism: nonEmpty, permittedOnDate: z.boolean(), anchor: anchorSchema}).strict().nullable(),
  }).strict()).default([]),
  /** Other cash costs of the alternative (advisory, registry), an explicit zero included; null means the base does not state them and the all-in is not computed. */
  feesPaidFromCash: z.object({value: nonNegative, anchor: anchorSchema}).strict().nullable().default(null),
  /** Terms the alternative still lacks; carried, never filled. */
  uncoveredTerms: z.array(nonEmpty).default([]),
}).strict();

const UNIT_WORDS: Record<z.infer<typeof unitSchema>, RegExp> = {"BRL": /\b(R\$|reais|BRL)\b(?!\s*(mil|milh))/i, "BRL thousand": /\b(mil|thousand)\b/i, "BRL million": /\b(milh[õo]es|million)\b/i, "USD": /\bUSD\b(?!\s*(mil|thousand))/i, "USD thousand": /\bUSD\b.*\b(mil|thousand)\b/i};

export const beforeAfterInputSchema = z.object({
  referenceDate: isoDate,
  unit: unitSchema,
  /** Where the source states the unit; its note must name that unit, so a relabelled scale is refused. */
  unitAnchor: anchorSchema.extend({note: nonEmpty}),
  before: z.object({
    grossDebt: z.object({value: nonNegative, anchor: anchorSchema}).strict(),
    unrestrictedCash: z.object({value: nonNegative, anchor: anchorSchema}).strict(),
    derivativeLiabilities: z.object({value: nonNegative, anchor: anchorSchema}).strict(),
    derivativeAssets: z.object({value: nonNegative, anchor: anchorSchema}).strict(),
    /** Twelve months by dates, so an annualized quarter cannot pose as LTM. */
    ltmEbitda: z.object({value: nonNegative, periodStart: isoDate, periodEnd: isoDate, definitionKey: nonEmpty, basis: z.enum(["company_opened", "implied_from_reported_index", "derived_proxy"]), anchor: anchorSchema}).strict().nullable(),
    /** The schedule in the ledger's own periods, each row anchored; `endsAt` places new principal by date, null marks the open-ended bucket. */
    schedule: z.array(z.object({period: nonEmpty, amount: z.string().regex(/^-?\d+(\.\d+)?$/), endsAt: isoDate.nullable(), kind: z.enum(["maturity", "adjustment"]).default("maturity"), anchor: anchorSchema}).strict()).min(1),
    /** Cost of the existing debt, on its own basis; never the same basis as a new debt's all-in. */
    costOfExistingDebt: z.object({weightedAverageRate: rate, basis: nonEmpty, anchor: anchorSchema}).strict(),
    /** Cash generation per period when the base declares it, each figure anchored; without it the cover per period is insufficient evidence. */
    cfadsByPeriod: z.record(nonEmpty, z.object({value: nonNegative, anchor: anchorSchema}).strict()).nullable().default(null),
  }).strict(),
  /** Every covenant the base holds, one per instrument, each with its tiers; the headroom shown is the tightest among the measurable ones, and each instrument keeps its own reading. */
  covenants: z.array(z.object({
    instrument: nonEmpty,
    limit: rate,
    direction: z.enum(["maximum", "minimum"]),
    /** When the indenture measures the index; a reading at the reference date is interim unless it is a measurement date. */
    measurement: z.object({frequency: z.enum(["annual", "semiannual", "quarterly"]), nextDate: isoDate}).strict(),
    /** Every tier the indenture writes, in order, each with its applicability: applicable when its condition is proven, conditional while the proof is missing, not applicable when ruled out. */
    tiers: z.array(z.object({limit: rate, applicability: z.enum(["applicable", "conditional", "not_applicable"]), condition: nonEmpty}).strict()).min(1).nullable(),
    state: z.enum(["resolved", "insufficient_evidence"]),
    comparability: z.enum(["comparable", "conditional", "not_comparable"]),
    anchor: anchorSchema,
  }).strict()).min(1),
  /** At least two alternatives, the status quo counting as one: a comparison with a single alternative compares nothing. */
  alternatives: z.array(alternativeSchema).min(2),
  /** The declared discriminator; without one there is no ranking. all_in_cost ranks only the new debts among themselves. */
  ranking: z.object({discriminator: z.enum(["headroom", "all_in_cost", "peak_concentration", "peak_amount", "net_debt"]), rationale: nonEmpty}).strict().nullable().default(null),
  wallThreshold: z.object({share: nonNegative, policyKey: nonEmpty, policyVersion: nonEmpty}).strict(),
}).strict().superRefine((input, context) => {
  if (!UNIT_WORDS[input.unit].test(input.unitAnchor.note)) context.addIssue({code: "custom", path: ["unitAnchor"], message: `the unit anchor's note does not name the unit ${input.unit}; a relabelled scale is refused`});
  const instruments = new Set<string>();
  input.covenants.forEach((covenant, index) => {
    if (instruments.has(covenant.instrument)) context.addIssue({code: "custom", path: ["covenants", index], message: `duplicate covenant for ${covenant.instrument}`});
    instruments.add(covenant.instrument);
    if (covenant.measurement.nextDate < input.referenceDate) context.addIssue({code: "custom", path: ["covenants", index, "measurement"], message: `${covenant.instrument}: the next measurement date cannot precede the reference date`});
    if (covenant.tiers && !covenant.tiers.some((tier) => tier.limit === covenant.limit)) context.addIssue({code: "custom", path: ["covenants", index, "tiers"], message: `${covenant.instrument}: the limit ${covenant.limit} is not one of the tiers listed`});
  });
  const ends = new Map<string, string>();
  input.before.schedule.filter((row) => row.kind === "maturity" && row.endsAt !== null).forEach((row) => { const other = ends.get(row.endsAt!); if (other) context.addIssue({code: "custom", path: ["before", "schedule"], message: `periods ${other} and ${row.period} share the end date ${row.endsAt}; a payment on that date could not be placed without an arbitrary choice`}); ends.set(row.endsAt!, row.period); });
  if (new Decimal(input.wallThreshold.share).gt(1)) context.addIssue({code: "custom", path: ["wallThreshold", "share"], message: "a wall threshold is a share of gross debt between 0 and 1"});
  if (input.before.ltmEbitda) {
    const start = new Date(`${input.before.ltmEbitda.periodStart}T00:00:00Z`); start.setUTCMonth(start.getUTCMonth() + 12);
    if (start.toISOString().slice(0, 10) !== input.before.ltmEbitda.periodEnd) context.addIssue({code: "custom", path: ["before", "ltmEbitda"], message: `the EBITDA covers ${input.before.ltmEbitda.periodStart} to ${input.before.ltmEbitda.periodEnd}, not twelve months; an annualized shorter period is not an LTM figure`});
    if (input.before.ltmEbitda.periodEnd > input.referenceDate) context.addIssue({code: "custom", path: ["before", "ltmEbitda"], message: "the EBITDA period ends after the reference date"});
  }
  const periods = new Set<string>();
  const sorted = [...input.before.schedule].sort(scheduleOrder);
  sorted.forEach((entry, index) => {
    if (periods.has(entry.period)) context.addIssue({code: "custom", path: ["before", "schedule", index], message: `duplicate period ${entry.period}`});
    periods.add(entry.period);
    if (entry.endsAt !== null && entry.endsAt <= input.referenceDate) context.addIssue({code: "custom", path: ["before", "schedule", index], message: `period ${entry.period} ends on or before the reference date`});
    if (entry.kind === "maturity" && entry.amount.startsWith("-")) context.addIssue({code: "custom", path: ["before", "schedule", index], message: `period ${entry.period} carries a negative amount; only an adjustment row may`});
    if (entry.kind === "adjustment" && entry.endsAt !== null) context.addIssue({code: "custom", path: ["before", "schedule", index], message: `adjustment ${entry.period} belongs to no period and cannot end on a date`});
  });
  if (sorted.filter((entry) => entry.endsAt === null && entry.kind === "maturity").length > 1) context.addIssue({code: "custom", path: ["before", "schedule"], message: "at most one open-ended bucket"});
  const ids = new Set<string>();
  input.alternatives.forEach((alternative, index) => {
    if (ids.has(alternative.id)) context.addIssue({code: "custom", path: ["alternatives", index], message: `duplicate alternative ${alternative.id}`});
    ids.add(alternative.id);
    const series = new Set<string>();
    alternative.retired.forEach((entry, position) => {
      if (series.has(entry.seriesId)) context.addIssue({code: "custom", path: ["alternatives", index, "retired", position], message: `${alternative.id}: series ${entry.seriesId} retired twice`});
      series.add(entry.seriesId);
      const seen = new Set<string>();
      entry.instalments.forEach((instalment, slot) => {
        if (seen.has(instalment.period)) context.addIssue({code: "custom", path: ["alternatives", index, "retired", position, "instalments", slot], message: `${alternative.id}: ${entry.seriesId} names ${instalment.period} twice`});
        seen.add(instalment.period);
        if (!periods.has(instalment.period) || input.before.schedule.find((row) => row.period === instalment.period)?.kind === "adjustment") context.addIssue({code: "custom", path: ["alternatives", index, "retired", position, "instalments", slot], message: `${alternative.id}: ${entry.seriesId} matures in ${instalment.period}, which is not a period of the schedule`});
      });
      if (entry.exitPremium && !entry.exitPremium.permittedOnDate) context.addIssue({code: "custom", path: ["alternatives", index, "retired", position, "exitPremium"], message: `${alternative.id}: the exit of ${entry.seriesId} by ${entry.exitPremium.mechanism} is not permitted on the date; a price without a permitted mechanism is not a price`});
      if (entry.exitPremium && alternative.uncoveredTerms.some((term) => /exit|quote|saida|cotac/i.test(term))) context.addIssue({code: "custom", path: ["alternatives", index, "retired", position, "exitPremium"], message: `${alternative.id}: ${entry.seriesId} carries a price and the alternative still lists an exit gap (${alternative.uncoveredTerms.filter((term) => /exit|quote|saida|cotac/i.test(term)).join(", ")}); one or the other`});
    });
    if (alternative.newDebt && alternative.newDebt.disbursementDate < input.referenceDate) context.addIssue({code: "custom", path: ["alternatives", index, "newDebt", "disbursementDate"], message: `${alternative.id}: the new debt is disbursed before the reference date`});
    if (alternative.newDebt && alternative.newDebt.graceMonths >= alternative.newDebt.termMonths) context.addIssue({code: "custom", path: ["alternatives", index, "newDebt", "graceMonths"], message: `${alternative.id}: grace must be shorter than the term`});
    if (alternative.newDebt && alternative.newDebt.termsSource === "authorized_only") context.addIssue({code: "custom", path: ["alternatives", index, "newDebt", "termsSource"], message: `${alternative.id}: a funding that is only authorized is not a source of principal; a term sheet, a proposal or a contract is`});
    alternative.retired.forEach((entry, position) => entry.instalments.forEach((instalment, slot) => { if (instalment.principal.basis === "carrying_amount") context.addIssue({code: "custom", path: ["alternatives", index, "retired", position, "instalments", slot, "principal"], message: `${alternative.id}: ${entry.seriesId} retires a carrying amount (${instalment.principal.value}); the principal retired is the contractual nominal, reconciled by the exit-cost executor`}); }));
  });
});
export type BeforeAfterInput = z.input<typeof beforeAfterInputSchema>;

type Calculation = {id: string; alternative: string; formula: string; operands: Record<string, string>; result: string; unit: string};
type Snapshot = {
  gross_debt: string; deductible_cash: string; net_debt: string; contractual_net_debt: string;
  leverage: {value: string; ebitda_definition: string; ebitda_basis: string} | null;
  /** The tightest measurable headroom among the covenants, with every instrument's own reading beside it. */
  headroom: {instrument: string; absolute: string; within_limit: boolean; reading: "interim" | "measurement_date"; note: string} | null;
  headroom_by_instrument: Array<{instrument: string; limit: string; state: "measured" | "not_measured"; absolute: string | null; reason: string | null}>;
  peak: {period: string; amount: string; share_of_gross: string} | null;
  cost: {value: string; basis: string; comparable_with_new_debt: boolean};
  anchors: Record<string, Anchor>;
};

export type BeforeAfterOutput = {
  schema_version: "method.compare-refinancing-before-after.v7";
  reference_date: string;
  unit: string;
  state: "compared" | "blocked";
  block_reasons: string[];
  wall_threshold: {share: string; policyKey: string; policyVersion: string};
  /** Rows of the ledger's schedule that belong to no period (transaction costs); they reconcile the schedule to the gross debt and never enter the concentration. */
  schedule_adjustments: Array<{id: string; amount: string}>;
  before: Snapshot;
  alternatives: Array<{
    id: string; label: string; state: "compared" | "blocked"; block_reasons: string[];
    after: Snapshot | null;
    effective_date: string | null;
    temporal_note: string | null;
    exit_cost: {value: string; anchors: Anchor[]; mechanisms: Array<{seriesId: string; mechanism: string}>} | null;
    concentration: Array<{period: string; existing: string; proposed: string; consolidated: string; share_of_gross: string; is_wall: boolean; principal_coverage: string | null}> | null;
    new_debt_service: {peak_debt_service: string; total_interest: string; weighted_average_life_months: string; all_in_cost: string | null; anchor: Anchor} | null;
    uncovered_terms: Array<{id: string; state: "insufficient_evidence"; reason: string}>;
  }>;
  /** `value` is the economic figure of the discriminator (a share, a cost, an amount); `score` is the internal ordering key (higher is better). */
  ranking: {discriminator: string; rationale: string; order: Array<{id: string; value: string; score: string; reason: string}>} | null;
  unsupported: string[];
  trace: {calculations: Calculation[]; inputFingerprint: string; outputFingerprint: string};
};

const d = (value: Decimal.Value) => new Decimal(value);
const out = (value: Decimal) => value.toDecimalPlaces(8).toFixed();
const stableStringify = (value: unknown): string => JSON.stringify(value, (_key, inner: unknown) => (inner && typeof inner === "object" && !Array.isArray(inner) ? Object.fromEntries(Object.entries(inner as Record<string, unknown>).sort(([a], [b]) => compare(a, b))) : inner));
const fingerprint = (value: unknown) => createHash("sha256").update(stableStringify(value)).digest("hex");
const addMonths = (isoDate: string, months: number) => { const date = new Date(`${isoDate}T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() + months); return date.toISOString().slice(0, 10); };

const scheduleOrder = (a: {period: string; endsAt: string | null; kind: string}, b: {period: string; endsAt: string | null; kind: string}) => (a.kind !== b.kind ? (a.kind === "adjustment" ? 1 : -1) : a.endsAt === null && b.endsAt === null ? compare(a.period, b.period) : a.endsAt === null ? 1 : b.endsAt === null ? -1 : compare(a.endsAt, b.endsAt) || compare(a.period, b.period));
function canonical(input: z.infer<typeof beforeAfterInputSchema>) {
  return {
    ...input,
    before: {...input.before, schedule: [...input.before.schedule].sort(scheduleOrder)},
    covenants: [...input.covenants].sort((a, b) => compare(a.instrument, b.instrument)),
    alternatives: [...input.alternatives].sort((a, b) => compare(a.id, b.id)).map((alternative) => ({...alternative, retired: [...alternative.retired].sort((a, b) => compare(a.seriesId, b.seriesId)).map((series) => ({...series, instalments: [...series.instalments].sort((a, b) => compare(a.period, b.period))})), uncoveredTerms: [...alternative.uncoveredTerms].sort(compare)})),
  };
}

export function compareRefinancingBeforeAfter(raw: BeforeAfterInput): BeforeAfterOutput {
  const input = canonical(beforeAfterInputSchema.parse(raw));
  const calculations: Calculation[] = [];
  const record = (calculation: Omit<Calculation, "unit">, unit: string = input.unit) => calculations.push({...calculation, unit});
  const unsupported: string[] = [];
  const blockReasons: string[] = [];
  const threshold = d(input.wallThreshold.share);
  const measurable = input.covenants.map((covenant) => {
    const tier = covenant.tiers?.find((entry) => entry.limit === covenant.limit) ?? null;
    const reasons: string[] = [];
    if (covenant.state !== "resolved") reasons.push(`limit ${covenant.state}`);
    if (covenant.comparability !== "comparable") reasons.push(`comparability ${covenant.comparability}`);
    if (covenant.tiers === null) reasons.push("tier evidence absent (insufficient evidence), not applicable by default");
    else if (!tier || tier.applicability !== "applicable") reasons.push(`tier ${tier?.applicability ?? "unknown"}${tier ? ` (${tier.condition})` : ""}`);
    return {covenant, reasons};
  });
  for (const entry of measurable.filter((item) => item.reasons.length > 0)) unsupported.push(`headroom is not measured for ${entry.covenant.instrument}: ${entry.reasons.join(", ")}`);
  const canMeasureHeadroom = measurable.some((entry) => entry.reasons.length === 0);
  const ebitda = input.before.ltmEbitda;
  if (!ebitda) unsupported.push("leverage is not measured: no EBITDA with a definition in the base");
  else if (d(ebitda.value).lte(0)) unsupported.push("leverage is not measured: the EBITDA in the base is zero or negative");
  if (!input.before.cfadsByPeriod) unsupported.push("principal cover per period is not measured: no cash generation per period in the base");
  const scheduleTotal = input.before.schedule.reduce((sum, entry) => sum.plus(entry.amount), d(0));
  if (!scheduleTotal.eq(input.before.grossDebt.value)) blockReasons.push(`the schedule sums to ${out(scheduleTotal)} and the gross debt is ${input.before.grossDebt.value}; the ledger did not reconcile them`);
  const maturities = input.before.schedule.filter((entry) => entry.kind === "maturity");
  const adjustments = input.before.schedule.filter((entry) => entry.kind === "adjustment");
  const periodOf = (date: string): string | null => {
    const dated = maturities.filter((entry) => entry.endsAt !== null);
    const hit = dated.find((entry) => date <= entry.endsAt!);
    if (hit) return hit.period;
    const open = maturities.find((entry) => entry.endsAt === null);
    return open ? open.period : null;
  };

  const snapshot = (label: string, grossDebt: Decimal, cash: Decimal, cost: Snapshot["cost"], consolidated: Record<string, Decimal.Value>, anchors: Record<string, Anchor>): Snapshot => {
    const views = aggregateDebtViews({rows: [{id: "gross_debt", principal: out(grossDebt), covenantIncluded: true}, {id: "derivative_liabilities", principal: input.before.derivativeLiabilities.value, covenantIncluded: true}], cash: cash.plus(input.before.derivativeAssets.value)});
    const contractual = d(views.netFinancialDebt);
    record({id: "financial.debt_views:contractual", alternative: label, formula: "grossDebt + derivativeLiabilities - derivativeAssets - deductibleCash", operands: {grossDebt: out(grossDebt), derivativeLiabilities: input.before.derivativeLiabilities.value, derivativeAssets: input.before.derivativeAssets.value, deductibleCash: out(cash)}, result: out(contractual)});
    let leverage: Snapshot["leverage"] = null;
    if (ebitda && d(ebitda.value).gt(0)) {
      const result = calculateLeverage(out(contractual), ebitda.value);
      record({id: "financial.net_leverage", alternative: label, formula: "contractualNetDebt / ltmEbitda", operands: {contractualNetDebt: out(contractual), ltmEbitda: ebitda.value, ebitdaBasis: ebitda.basis}, result: result.value}, "x");
      leverage = {value: result.value, ebitda_definition: ebitda.definitionKey, ebitda_basis: ebitda.basis};
    }
    let headroom: Snapshot["headroom"] = null;
    const byInstrument: Snapshot["headroom_by_instrument"] = [];
    if (leverage) {
      for (const {covenant, reasons} of measurable) {
        if (reasons.length > 0) { byInstrument.push({instrument: covenant.instrument, limit: covenant.limit, state: "not_measured", absolute: null, reason: reasons.join(", ")}); continue; }
        const result = calculateCovenantHeadroom({actual: leverage.value, limit: covenant.limit, direction: covenant.direction});
        record({id: `structure.covenant_headroom:${covenant.instrument}`, alternative: label, formula: covenant.direction === "maximum" ? "limit - actual" : "actual - limit", operands: {actual: leverage.value, limit: covenant.limit}, result: result.absolute}, "x");
        byInstrument.push({instrument: covenant.instrument, limit: covenant.limit, state: "measured", absolute: result.absolute, reason: null});
        const onDate = covenant.measurement.nextDate === input.referenceDate;
        const candidate = {instrument: covenant.instrument, absolute: result.absolute, within_limit: result.passes, reading: onDate ? "measurement_date" as const : "interim" as const, note: onDate ? `measured on the measurement date of ${covenant.instrument}` : `interim reading at ${input.referenceDate}; ${covenant.instrument} measures ${covenant.measurement.frequency}ly, next on ${covenant.measurement.nextDate}; neither a breach nor a compliance`};
        if (headroom === null || d(candidate.absolute).lt(headroom.absolute)) headroom = candidate;
      }
    } else if (canMeasureHeadroom) for (const {covenant} of measurable) byInstrument.push({instrument: covenant.instrument, limit: covenant.limit, state: "not_measured", absolute: null, reason: "no leverage measured"});
    const concentration = maturityConcentration({existing: consolidated, proposed: {}});
    const peak = concentration.peak && grossDebt.gt(0) ? {period: concentration.peak.period, amount: concentration.peak.consolidated, share_of_gross: out(d(concentration.peak.consolidated).div(grossDebt))} : null;
    if (peak) record({id: "structure.maturity_concentration:peak", alternative: label, formula: "peak / grossDebt", operands: {peak: peak.amount, grossDebt: out(grossDebt)}, result: peak.share_of_gross}, "x");
    return {gross_debt: out(grossDebt), deductible_cash: out(cash), net_debt: out(grossDebt.minus(cash)), contractual_net_debt: out(contractual), leverage, headroom, headroom_by_instrument: byInstrument, peak, cost, anchors};
  };

  const beforeSchedule = Object.fromEntries(maturities.map((entry) => [entry.period, entry.amount]));
  const before = snapshot("before", d(input.before.grossDebt.value), d(input.before.unrestrictedCash.value), {value: input.before.costOfExistingDebt.weightedAverageRate, basis: input.before.costOfExistingDebt.basis, comparable_with_new_debt: false}, beforeSchedule, {grossDebt: input.before.grossDebt.anchor, unrestrictedCash: input.before.unrestrictedCash.anchor, derivativeLiabilities: input.before.derivativeLiabilities.anchor, derivativeAssets: input.before.derivativeAssets.anchor, ...(ebitda ? {ltmEbitda: ebitda.anchor} : {}), cost: input.before.costOfExistingDebt.anchor, ...Object.fromEntries(input.before.schedule.map((row) => [`schedule:${row.period}`, row.anchor]))});

  const alternatives = input.alternatives.map((alternative): BeforeAfterOutput["alternatives"][number] => {
    const reasons: string[] = [];
    const uncovered: BeforeAfterOutput["alternatives"][number]["uncovered_terms"] = alternative.uncoveredTerms.map((term) => ({id: term, state: "insufficient_evidence" as const, reason: `the alternative lacks ${term}; carried as a gap, not filled`}));
    if (alternative.newDebt?.termsSource === "indicative_unverified") uncovered.push({id: "new_debt_terms", state: "insufficient_evidence", reason: `the terms of the new debt (${alternative.newDebt.origin}) are indicative and not verified by a term sheet, a proposal or a contract in the base; the after is a declared scenario, not a verified cost`});
    const unpriced = alternative.retired.filter((series) => series.exitPremium === null);
    const transacts = alternative.newDebt !== null || alternative.retired.length > 0;
    if (unpriced.length > 0) reasons.push(`exit cost is not priced for ${unpriced.map((series) => series.seriesId).join(", ")}; the alternative cannot be compared`);
    if (reasons.length > 0 || blockReasons.length > 0) return {id: alternative.id, label: alternative.label, state: "blocked", block_reasons: [...blockReasons, ...reasons], after: null, effective_date: null, temporal_note: null, exit_cost: null, concentration: null, new_debt_service: null, uncovered_terms: uncovered};

    const retiredPrincipal = alternative.retired.reduce((sum, series) => sum.plus(series.instalments.reduce((inner, instalment) => inner.plus(instalment.principal.value), d(0))), d(0));
    const exitCost = alternative.retired.reduce((sum, series) => sum.plus(series.exitPremium!.value), d(0));
    // Fees the base does not state are unknown, not zero, when the alternative transacts: the position is computed without them and the all-in is not. The status quo has no fees to state.
    const fees = alternative.feesPaidFromCash ? d(alternative.feesPaidFromCash.value) : d(0);
    if (!alternative.feesPaidFromCash && transacts) uncovered.push({id: "fees_paid_from_cash", state: "insufficient_evidence", reason: "the cash fees of the alternative are not in the base; an explicit zero must be stated; the all-in cost is not computed and the cash after excludes them"});
    const newAmount = alternative.newDebt ? d(alternative.newDebt.amount) : d(0);
    const upfrontFees = alternative.newDebt ? newAmount.times(alternative.newDebt.upfrontFeeRate) : d(0);
    // What the new debt raises beyond the principal it retires stays in cash; what it falls short of comes out of cash.
    const net = newAmount.minus(retiredPrincipal);
    // The engine reads cashContribution as cash put into the deal: a negative contribution is the surplus the new debt leaves in cash.
    const proForma = calculateProFormaPosition({grossDebt: input.before.grossDebt.value, unrestrictedCash: input.before.unrestrictedCash.value, newDebt: out(newAmount), refinancedDebt: out(retiredPrincipal), feesPaidFromCash: out(fees.plus(exitCost).plus(upfrontFees)), cashContribution: out(net.negated())});
    record({id: "operation.pro_forma_position", alternative: alternative.id, formula: "grossDebt + newDebt - retired ; cash + (newDebt - retired) - exitCost - upfrontFees - feesPaidFromCash", operands: {newDebt: out(newAmount), refinancedDebt: out(retiredPrincipal), netProceeds: out(net), exitCost: out(exitCost), upfrontFees: out(upfrontFees), feesPaidFromCash: out(fees)}, result: proForma.grossDebt});

    // Schedule after: retired series leave their periods; the new principal lands in the period that holds its payment date.
    const existing: Record<string, Decimal> = Object.fromEntries(maturities.map((entry) => [entry.period, d(entry.amount)]));
    for (const series of alternative.retired) for (const instalment of series.instalments) {
      if (existing[instalment.period]!.lt(instalment.principal.value)) reasons.push(`${series.seriesId}: the period ${instalment.period} holds ${out(existing[instalment.period]!)} and cannot lose ${instalment.principal.value}`);
      existing[instalment.period] = existing[instalment.period]!.minus(instalment.principal.value);
    }
    if (reasons.length > 0) return {id: alternative.id, label: alternative.label, state: "blocked", block_reasons: reasons, after: null, effective_date: null, temporal_note: null, exit_cost: null, concentration: null, new_debt_service: null, uncovered_terms: uncovered};
    const proposed: Record<string, Decimal> = {};
    let newDebtService: BeforeAfterOutput["alternatives"][number]["new_debt_service"] = null;
    let cost: Snapshot["cost"] = {value: input.before.costOfExistingDebt.weightedAverageRate, basis: `${input.before.costOfExistingDebt.basis}; no new debt`, comparable_with_new_debt: false};
    if (alternative.newDebt) {
      const schedule = buildDebtServiceSchedule({amount: alternative.newDebt.amount, annualRate: alternative.newDebt.annualRate, rateConvention: "effective_annual", termMonths: alternative.newDebt.termMonths, graceMonths: alternative.newDebt.graceMonths, graceInterest: "paid", format: alternative.newDebt.format});
      record({id: "structure.debt_service_schedule", alternative: alternative.id, formula: `${alternative.newDebt.format}, ${alternative.newDebt.termMonths} months, ${alternative.newDebt.graceMonths} of grace`, operands: {amount: alternative.newDebt.amount, annualRate: alternative.newDebt.annualRate, disbursementDate: alternative.newDebt.disbursementDate}, result: schedule.totalDebtService});
      let lastKey: string | null = null;
      let placed = d(0);
      for (const row of schedule.rows) {
        if (d(row.principal).isZero()) continue;
        const date = addMonths(alternative.newDebt.disbursementDate, row.period);
        const key = periodOf(date);
        if (key === null) { reasons.push(`the new debt pays principal on ${date}, beyond the last dated period, and the schedule has no open-ended bucket to hold it`); break; }
        proposed[key] = (proposed[key] ?? d(0)).plus(row.principal);
        placed = placed.plus(row.principal);
        lastKey = key;
      }
      // The engine rounds each instalment; the residual of the rounding goes with the last instalment so the schedule after reconciles exactly to the gross debt after.
      if (reasons.length === 0 && lastKey !== null && !placed.eq(newAmount)) {
        const residual = newAmount.minus(placed);
        proposed[lastKey] = proposed[lastKey]!.plus(residual);
        record({id: "structure.debt_service_schedule:rounding_residual", alternative: alternative.id, formula: "amount - sum(rounded instalments), added to the last instalment", operands: {amount: out(newAmount), placed: out(placed)}, result: out(residual)});
      }
      if (reasons.length > 0) return {id: alternative.id, label: alternative.label, state: "blocked", block_reasons: reasons, after: null, effective_date: null, temporal_note: null, exit_cost: null, concentration: null, new_debt_service: null, uncovered_terms: uncovered};
      const termYears = d(alternative.newDebt.termMonths).div(12);
      if (alternative.feesPaidFromCash) {
        const allIn = calculateAllInCost(alternative.newDebt.annualRate, d(alternative.newDebt.upfrontFeeRate).plus(newAmount.gt(0) ? exitCost.plus(fees).div(newAmount) : 0).toFixed(), termYears.toFixed());
        record({id: "financial.all_in_cost", alternative: alternative.id, formula: "annualRate + (upfrontFeeRate + (exitCost + feesPaidFromCash) / amount) / termYears", operands: {annualRate: alternative.newDebt.annualRate, upfrontFeeRate: alternative.newDebt.upfrontFeeRate, exitCost: out(exitCost), feesPaidFromCash: out(fees), amount: out(newAmount), termYears: termYears.toFixed()}, result: allIn.value}, "x");
        newDebtService = {peak_debt_service: schedule.peakDebtService, total_interest: schedule.totalInterest, weighted_average_life_months: schedule.weightedAverageLifeMonths, all_in_cost: allIn.value, anchor: alternative.newDebt.anchor};
        cost = {value: allIn.value, basis: "all-in of the new debt: coupon plus upfront fee, exit premiums and cash fees amortized over the term", comparable_with_new_debt: true};
      } else {
        newDebtService = {peak_debt_service: schedule.peakDebtService, total_interest: schedule.totalInterest, weighted_average_life_months: schedule.weightedAverageLifeMonths, all_in_cost: null, anchor: alternative.newDebt.anchor};
        cost = {value: alternative.newDebt.annualRate, basis: "coupon of the new debt only; the all-in is not computed because the cash fees are not in the base", comparable_with_new_debt: false};
      }
    }
    const consolidated = Object.fromEntries(maturities.map((entry) => [entry.period, existing[entry.period]!.plus(proposed[entry.period] ?? 0)]));
    const grossAfter = d(proForma.grossDebt);
    const rows = maturities.map((entry) => {
      const total = consolidated[entry.period]!;
      const share = grossAfter.gt(0) ? total.div(grossAfter) : d(0);
      const cfads = input.before.cfadsByPeriod?.[entry.period];
      let coverage: string | null = null;
      if (cfads !== undefined && total.gt(0)) {
        const cover = calculateLiquidityCoverage([{period: entry.period, openingCash: d(0), cfads: cfads.value, contractedSources: d(0), principal: out(total), interest: 0}])[0]!;
        record({id: `financial.liquidity_coverage:${entry.period}`, alternative: alternative.id, formula: "cfads / principal (no opening cash, no interest)", operands: {cfads: cfads.value, principal: out(total), cfadsAnchor: `${cfads.anchor.document}${cfads.anchor.page ? ` p. ${cfads.anchor.page}` : ""}`}, result: cover.coverage ?? "n/a"}, "x");
        coverage = cover.coverage;
      } else if (input.before.cfadsByPeriod && cfads === undefined) uncovered.push({id: `principal_coverage:${entry.period}`, state: "insufficient_evidence", reason: `no cash generation declared for ${entry.period}; its principal cover is not measured and no figure is repeated from another period`});
      return {period: entry.period, existing: out(existing[entry.period]!), proposed: out(proposed[entry.period] ?? d(0)), consolidated: out(total), share_of_gross: out(share), is_wall: d(out(share)).gt(threshold), principal_coverage: coverage};
    });
    // The schedule after must reconcile to the gross debt after exactly, adjustments included.
    const afterTotal = rows.reduce((sum, row) => sum.plus(row.consolidated), d(0)).plus(adjustments.reduce((sum, entry) => sum.plus(entry.amount), d(0)));
    record({id: "financial.debt_ledger_balance:after", alternative: alternative.id, formula: "sum(consolidated periods) + adjustments - grossDebtAfter", operands: {schedule: out(afterTotal), grossDebtAfter: out(grossAfter)}, result: out(afterTotal.minus(grossAfter))});
    if (!afterTotal.eq(grossAfter)) reasons.push(`the schedule after sums to ${out(afterTotal)} and the gross debt after is ${out(grossAfter)}; the alternative does not reconcile`);
    if (reasons.length > 0) return {id: alternative.id, label: alternative.label, state: "blocked", block_reasons: reasons, after: null, effective_date: null, temporal_note: null, exit_cost: null, concentration: null, new_debt_service: null, uncovered_terms: uncovered};
    const afterAnchors: Record<string, Anchor> = {...before.anchors, ...(alternative.newDebt ? {newDebt: alternative.newDebt.anchor, cost: alternative.newDebt.anchor} : {}), ...(alternative.feesPaidFromCash ? {feesPaidFromCash: alternative.feesPaidFromCash.anchor} : {}), ...Object.fromEntries(alternative.retired.flatMap((series) => [[`retired:${series.seriesId}:exit`, series.exitPremium!.anchor], ...series.instalments.flatMap((instalment) => [[`retired:${series.seriesId}:${instalment.period}:principal`, instalment.principal.anchor], [`retired:${series.seriesId}:${instalment.period}:maturity`, instalment.maturityAnchor]])])), ...Object.fromEntries(input.before.schedule.map((row) => [`schedule:${row.period}`, row.anchor])), ...Object.fromEntries(Object.entries(input.before.cfadsByPeriod ?? {}).map(([period, entry]) => [`cfads:${period}`, entry.anchor]))};
    const after = snapshot(alternative.id, grossAfter, d(proForma.unrestrictedCash), cost, Object.fromEntries(rows.map((row) => [row.period, row.consolidated])), afterAnchors);
    const effectiveDate = alternative.newDebt ? alternative.newDebt.disbursementDate : input.referenceDate;
    return {
      id: alternative.id, label: alternative.label, state: "compared", block_reasons: [], after,
      effective_date: effectiveDate,
      temporal_note: effectiveDate === input.referenceDate ? `before and after are both stated at ${input.referenceDate}` : `the before and the retired balances are stated at ${input.referenceDate}; the new debt is dated ${effectiveDate}; the balances between the two dates are not rolled forward, so the after is a pro forma at ${input.referenceDate} with a transaction dated ${effectiveDate} (declared)`,
      exit_cost: {value: out(exitCost), anchors: alternative.retired.map((series) => series.exitPremium!.anchor), mechanisms: alternative.retired.map((series) => ({seriesId: series.seriesId, mechanism: series.exitPremium!.mechanism}))},
      concentration: rows, new_debt_service: newDebtService, uncovered_terms: uncovered,
    };
  });

  let ranking: BeforeAfterOutput["ranking"] = null;
  if (input.ranking) {
    const compared = alternatives.filter((alternative) => alternative.state === "compared" && alternative.after);
    const value = (alternative: (typeof compared)[number]): Decimal | null => {
      const after = alternative.after!;
      switch (input.ranking!.discriminator) {
        case "headroom": return after.headroom ? d(after.headroom.absolute) : null;
        case "all_in_cost": return after.cost.comparable_with_new_debt ? d(after.cost.value).negated() : null;
        case "peak_concentration": return after.peak ? d(after.peak.share_of_gross).negated() : null;
        case "peak_amount": return after.peak ? d(after.peak.amount).negated() : null;
        case "net_debt": return d(after.contractual_net_debt).negated();
      }
    };
    const scored = compared.map((alternative) => ({alternative, score: value(alternative)}));
    if (compared.length === 0) unsupported.push("no ranking: no alternative could be compared");
    else if (scored.some((entry) => entry.score === null)) unsupported.push(input.ranking.discriminator === "all_in_cost" ? "ranking by all_in_cost needs a new debt in every compared alternative; the cost of existing debt is another basis" : `ranking by ${input.ranking.discriminator} needs a value every compared alternative lacks`);
    else {
      const sorted = scored.sort((a, b) => b.score!.comparedTo(a.score!) || compare(a.alternative.id, b.alternative.id));
      ranking = {discriminator: input.ranking.discriminator, rationale: input.ranking.rationale, order: sorted.map((entry, index) => ({id: entry.alternative.id, value: out(input.ranking!.discriminator === "headroom" ? entry.score! : entry.score!.negated()), score: out(entry.score!), reason: index === 0 ? `best ${input.ranking!.discriminator}` : entry.score!.eq(sorted[0]!.score!) ? `tied with the best on ${input.ranking!.discriminator}; ordered by id, not by merit` : `ranks below by ${input.ranking!.discriminator}`}))};
    }
  } else unsupported.push("no ranking: the discriminator was not declared");
  for (const alternative of alternatives) if (alternative.state === "blocked") unsupported.push(`${alternative.id}: ${alternative.block_reasons.join("; ")}`);

  const body = {schema_version: "method.compare-refinancing-before-after.v7" as const, reference_date: input.referenceDate, unit: input.unit, state: blockReasons.length > 0 ? "blocked" as const : "compared" as const, block_reasons: blockReasons, wall_threshold: input.wallThreshold, schedule_adjustments: adjustments.map((entry) => ({id: entry.period, amount: entry.amount})), before, alternatives, ranking, unsupported: [...unsupported].sort(compare)};
  const inputFingerprint = fingerprint(input);
  return {...body, trace: {calculations, inputFingerprint, outputFingerprint: fingerprint({...body, calculations, inputFingerprint})}};
}
