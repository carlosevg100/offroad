import {createHash} from "node:crypto";

import {buildDebtServiceSchedule, calculateAllInCost, calculateCovenantHeadroom, calculateLeverage, calculateProFormaPosition, maturityConcentration} from "@offroad/financial-core";
import Decimal from "decimal.js";
import {z} from "zod";

/**
 * Executor of the method `compare-refinancing-before-after` (v3, after the first independent
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
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const unitSchema = z.enum(["BRL", "BRL thousand", "BRL million", "USD", "USD thousand"]);
const anchorSchema = z.object({document: nonEmpty, page: z.number().int().positive().optional(), note: nonEmpty.optional(), clause: nonEmpty.optional()}).strict();
type Anchor = z.infer<typeof anchorSchema>;
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export const alternativeSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_-]*$/),
  label: nonEmpty,
  newDebt: z.object({amount: nonNegative, annualRate: rate, termMonths: z.number().int().positive(), graceMonths: z.number().int().nonnegative(), format: z.enum(["sac", "price", "bullet", "balloon"]), upfrontFeeRate: rate, disbursementDate: isoDate, origin: nonEmpty, anchor: anchorSchema}).strict().nullable(),
  /** Series retired, each with its priced exit (from the exit-cost executor) and its anchor; a null price blocks the alternative. */
  retired: z.array(z.object({seriesId: nonEmpty, principal: nonNegative, exitPremium: z.object({value: nonNegative, anchor: anchorSchema}).strict().nullable(), maturityPeriod: nonEmpty, anchor: anchorSchema}).strict()).default([]),
  /** Other cash costs of the alternative (advisory, registry), with their anchor when above zero. */
  feesPaidFromCash: z.object({value: nonNegative, anchor: anchorSchema}).strict().nullable().default(null),
  /** Terms the alternative still lacks; carried, never filled. */
  uncoveredTerms: z.array(nonEmpty).default([]),
}).strict();

export const beforeAfterInputSchema = z.object({
  referenceDate: isoDate,
  unit: unitSchema,
  before: z.object({
    grossDebt: z.object({value: nonNegative, anchor: anchorSchema}).strict(),
    unrestrictedCash: z.object({value: nonNegative, anchor: anchorSchema}).strict(),
    derivativeLiabilities: z.object({value: nonNegative, anchor: anchorSchema}).strict(),
    derivativeAssets: z.object({value: nonNegative, anchor: anchorSchema}).strict(),
    ltmEbitda: z.object({value: nonNegative, definitionKey: nonEmpty, basis: z.enum(["company_opened", "implied_from_reported_index", "derived_proxy"]), anchor: anchorSchema}).strict().nullable(),
    /** The schedule in the ledger's own periods; `endsAt` places new principal by date, null marks the open-ended bucket. */
    schedule: z.array(z.object({period: nonEmpty, amount: z.string().regex(/^-?\d+(\.\d+)?$/), endsAt: isoDate.nullable(), kind: z.enum(["maturity", "adjustment"]).default("maturity")}).strict()).min(1),
    /** Cost of the existing debt, on its own basis; never the same basis as a new debt's all-in. */
    costOfExistingDebt: z.object({weightedAverageRate: rate, basis: nonEmpty, anchor: anchorSchema}).strict(),
    /** Cash generation per period when the base declares it; without it the cover per period is insufficient evidence. */
    cfadsByPeriod: z.record(nonEmpty, nonNegative).nullable().default(null),
  }).strict(),
  covenant: z.object({limit: rate, direction: z.enum(["maximum", "minimum"]), state: z.enum(["resolved", "insufficient_evidence"]), comparability: z.enum(["comparable", "conditional", "not_comparable"]), anchor: anchorSchema}).strict(),
  alternatives: z.array(alternativeSchema).min(1),
  /** The declared discriminator; without one there is no ranking. all_in_cost ranks only the new debts among themselves. */
  ranking: z.object({discriminator: z.enum(["headroom", "all_in_cost", "peak_concentration", "peak_amount", "net_debt"]), rationale: nonEmpty}).strict().nullable().default(null),
  wallThreshold: z.object({share: nonNegative, policyKey: nonEmpty, policyVersion: nonEmpty}).strict(),
}).strict().superRefine((input, context) => {
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
      if (!periods.has(entry.maturityPeriod) || input.before.schedule.find((row) => row.period === entry.maturityPeriod)?.kind === "adjustment") context.addIssue({code: "custom", path: ["alternatives", index, "retired", position], message: `${alternative.id}: ${entry.seriesId} matures in ${entry.maturityPeriod}, which is not a period of the schedule`});
    });
    if (alternative.newDebt && alternative.newDebt.disbursementDate < input.referenceDate) context.addIssue({code: "custom", path: ["alternatives", index, "newDebt", "disbursementDate"], message: `${alternative.id}: the new debt is disbursed before the reference date`});
    if (alternative.newDebt && alternative.newDebt.graceMonths >= alternative.newDebt.termMonths) context.addIssue({code: "custom", path: ["alternatives", index, "newDebt", "graceMonths"], message: `${alternative.id}: grace must be shorter than the term`});
  });
});
export type BeforeAfterInput = z.input<typeof beforeAfterInputSchema>;

type Calculation = {id: string; alternative: string; formula: string; operands: Record<string, string>; result: string; unit: string};
type Snapshot = {
  gross_debt: string; unrestricted_cash: string; net_debt: string; contractual_net_debt: string;
  leverage: {value: string; ebitda_definition: string; ebitda_basis: string} | null;
  headroom: {absolute: string; passes: boolean} | null;
  peak: {period: string; amount: string; share_of_gross: string} | null;
  cost: {value: string; basis: string; comparable_with_new_debt: boolean};
  anchors: Record<string, Anchor>;
};

export type BeforeAfterOutput = {
  schema_version: "method.compare-refinancing-before-after.v3";
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
    exit_cost: {value: string; anchors: Anchor[]} | null;
    concentration: Array<{period: string; existing: string; proposed: string; consolidated: string; share_of_gross: string; is_wall: boolean; principal_coverage: string | null}> | null;
    new_debt_service: {peak_debt_service: string; total_interest: string; weighted_average_life_months: string; all_in_cost: string; anchor: Anchor} | null;
    uncovered_terms: Array<{id: string; state: "insufficient_evidence"; reason: string}>;
  }>;
  ranking: {discriminator: string; rationale: string; order: Array<{id: string; value: string; reason: string}>} | null;
  unsupported: string[];
  trace: {calculations: Calculation[]; inputFingerprint: string; outputFingerprint: string};
};

const d = (value: Decimal.Value) => new Decimal(value);
const out = (value: Decimal) => value.toDecimalPlaces(8).toFixed();
const stableStringify = (value: unknown): string => JSON.stringify(value, (_key, inner: unknown) => (inner && typeof inner === "object" && !Array.isArray(inner) ? Object.fromEntries(Object.entries(inner as Record<string, unknown>).sort(([a], [b]) => compare(a, b))) : inner));
const fingerprint = (value: unknown) => createHash("sha256").update(stableStringify(value)).digest("hex");
const addMonths = (isoDate: string, months: number) => { const date = new Date(`${isoDate}T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() + months); return date.toISOString().slice(0, 10); };

const scheduleOrder = (a: {period: string; endsAt: string | null; kind: string}, b: {period: string; endsAt: string | null; kind: string}) => (a.kind !== b.kind ? (a.kind === "adjustment" ? 1 : -1) : a.endsAt === null && b.endsAt === null ? compare(a.period, b.period) : a.endsAt === null ? 1 : b.endsAt === null ? -1 : compare(a.endsAt, b.endsAt));
function canonical(input: z.infer<typeof beforeAfterInputSchema>) {
  return {
    ...input,
    before: {...input.before, schedule: [...input.before.schedule].sort(scheduleOrder)},
    alternatives: [...input.alternatives].sort((a, b) => compare(a.id, b.id)).map((alternative) => ({...alternative, retired: [...alternative.retired].sort((a, b) => compare(a.seriesId, b.seriesId)), uncoveredTerms: [...alternative.uncoveredTerms].sort(compare)})),
  };
}

export function compareRefinancingBeforeAfter(raw: BeforeAfterInput): BeforeAfterOutput {
  const input = canonical(beforeAfterInputSchema.parse(raw));
  const calculations: Calculation[] = [];
  const record = (calculation: Omit<Calculation, "unit">, unit: string = input.unit) => calculations.push({...calculation, unit});
  const unsupported: string[] = [];
  const blockReasons: string[] = [];
  const threshold = d(input.wallThreshold.share);
  const canMeasureHeadroom = input.covenant.state === "resolved" && input.covenant.comparability === "comparable";
  if (!canMeasureHeadroom) unsupported.push(`headroom is not measured: covenant limit ${input.covenant.state}, comparability ${input.covenant.comparability}`);
  const ebitda = input.before.ltmEbitda;
  if (!ebitda) unsupported.push("leverage is not measured: no EBITDA with a definition in the base");
  else if (d(ebitda.value).lte(0)) unsupported.push("leverage is not measured: the EBITDA in the base is zero or negative");
  if (!input.before.cfadsByPeriod) unsupported.push("principal cover per period is not measured: no cash generation per period in the base");
  const scheduleTotal = input.before.schedule.reduce((sum, entry) => sum.plus(entry.amount), d(0));
  if (!scheduleTotal.eq(input.before.grossDebt.value)) blockReasons.push(`the schedule sums to ${out(scheduleTotal)} and the gross debt is ${input.before.grossDebt.value}; the ledger did not reconcile them`);
  const maturities = input.before.schedule.filter((entry) => entry.kind === "maturity");
  const adjustments = input.before.schedule.filter((entry) => entry.kind === "adjustment");
  const periodOf = (date: string): string => {
    const dated = maturities.filter((entry) => entry.endsAt !== null);
    const hit = dated.find((entry) => date <= entry.endsAt!);
    if (hit) return hit.period;
    const open = maturities.find((entry) => entry.endsAt === null);
    return open ? open.period : dated[dated.length - 1]!.period;
  };

  const snapshot = (label: string, grossDebt: Decimal, cash: Decimal, cost: Snapshot["cost"], consolidated: Record<string, Decimal.Value>, anchors: Record<string, Anchor>): Snapshot => {
    const contractual = grossDebt.plus(input.before.derivativeLiabilities.value).minus(input.before.derivativeAssets.value).minus(cash);
    record({id: "financial.debt_views:contractual", alternative: label, formula: "grossDebt + derivativeLiabilities - derivativeAssets - unrestrictedCash", operands: {grossDebt: out(grossDebt), derivativeLiabilities: input.before.derivativeLiabilities.value, derivativeAssets: input.before.derivativeAssets.value, unrestrictedCash: out(cash)}, result: out(contractual)});
    let leverage: Snapshot["leverage"] = null;
    if (ebitda && d(ebitda.value).gt(0)) {
      const result = calculateLeverage(out(contractual), ebitda.value);
      record({id: "financial.net_leverage", alternative: label, formula: "contractualNetDebt / ltmEbitda", operands: {contractualNetDebt: out(contractual), ltmEbitda: ebitda.value, ebitdaBasis: ebitda.basis}, result: result.value}, "x");
      leverage = {value: result.value, ebitda_definition: ebitda.definitionKey, ebitda_basis: ebitda.basis};
    }
    let headroom: Snapshot["headroom"] = null;
    if (leverage && canMeasureHeadroom) {
      const result = calculateCovenantHeadroom({actual: leverage.value, limit: input.covenant.limit, direction: input.covenant.direction});
      record({id: "structure.covenant_headroom", alternative: label, formula: input.covenant.direction === "maximum" ? "limit - actual" : "actual - limit", operands: {actual: leverage.value, limit: input.covenant.limit}, result: result.absolute}, "x");
      headroom = {absolute: result.absolute, passes: result.passes};
    }
    const concentration = maturityConcentration({existing: consolidated, proposed: {}});
    const peak = concentration.peak && grossDebt.gt(0) ? {period: concentration.peak.period, amount: concentration.peak.consolidated, share_of_gross: out(d(concentration.peak.consolidated).div(grossDebt))} : null;
    if (peak) record({id: "structure.maturity_concentration:peak", alternative: label, formula: "peak / grossDebt", operands: {peak: peak.amount, grossDebt: out(grossDebt)}, result: peak.share_of_gross}, "x");
    return {gross_debt: out(grossDebt), unrestricted_cash: out(cash), net_debt: out(grossDebt.minus(cash)), contractual_net_debt: out(contractual), leverage, headroom, peak, cost, anchors};
  };

  const beforeSchedule = Object.fromEntries(maturities.map((entry) => [entry.period, entry.amount]));
  const before = snapshot("before", d(input.before.grossDebt.value), d(input.before.unrestrictedCash.value), {value: input.before.costOfExistingDebt.weightedAverageRate, basis: input.before.costOfExistingDebt.basis, comparable_with_new_debt: false}, beforeSchedule, {grossDebt: input.before.grossDebt.anchor, unrestrictedCash: input.before.unrestrictedCash.anchor, derivativeLiabilities: input.before.derivativeLiabilities.anchor, derivativeAssets: input.before.derivativeAssets.anchor, ...(ebitda ? {ltmEbitda: ebitda.anchor} : {}), cost: input.before.costOfExistingDebt.anchor});

  const alternatives = input.alternatives.map((alternative): BeforeAfterOutput["alternatives"][number] => {
    const reasons: string[] = [];
    const uncovered: BeforeAfterOutput["alternatives"][number]["uncovered_terms"] = alternative.uncoveredTerms.map((term) => ({id: term, state: "insufficient_evidence" as const, reason: `the alternative lacks ${term}; carried as a gap, not filled`}));
    const unpriced = alternative.retired.filter((series) => series.exitPremium === null);
    if (unpriced.length > 0) reasons.push(`exit cost is not priced for ${unpriced.map((series) => series.seriesId).join(", ")}; the alternative cannot be compared`);
    if (reasons.length > 0 || blockReasons.length > 0) return {id: alternative.id, label: alternative.label, state: "blocked", block_reasons: [...blockReasons, ...reasons], after: null, exit_cost: null, concentration: null, new_debt_service: null, uncovered_terms: uncovered};

    const retiredPrincipal = alternative.retired.reduce((sum, series) => sum.plus(series.principal), d(0));
    const exitCost = alternative.retired.reduce((sum, series) => sum.plus(series.exitPremium!.value), d(0));
    const fees = alternative.feesPaidFromCash ? d(alternative.feesPaidFromCash.value) : d(0);
    const newAmount = alternative.newDebt ? d(alternative.newDebt.amount) : d(0);
    const upfrontFees = alternative.newDebt ? newAmount.times(alternative.newDebt.upfrontFeeRate) : d(0);
    const proForma = calculateProFormaPosition({grossDebt: input.before.grossDebt.value, unrestrictedCash: input.before.unrestrictedCash.value, newDebt: out(newAmount), refinancedDebt: out(retiredPrincipal), feesPaidFromCash: out(fees.plus(exitCost).plus(upfrontFees)), cashContribution: "0"});
    record({id: "operation.pro_forma_position", alternative: alternative.id, formula: "grossDebt + newDebt - retired ; cash - exitCost - upfrontFees - feesPaidFromCash", operands: {newDebt: out(newAmount), refinancedDebt: out(retiredPrincipal), exitCost: out(exitCost), upfrontFees: out(upfrontFees), feesPaidFromCash: out(fees)}, result: proForma.grossDebt});

    // Schedule after: retired series leave their periods; the new principal lands in the period that holds its payment date.
    const existing: Record<string, Decimal> = Object.fromEntries(maturities.map((entry) => [entry.period, d(entry.amount)]));
    for (const series of alternative.retired) {
      if (existing[series.maturityPeriod]!.lt(series.principal)) reasons.push(`${series.seriesId}: the period ${series.maturityPeriod} holds ${out(existing[series.maturityPeriod]!)} and cannot lose ${series.principal}`);
      existing[series.maturityPeriod] = existing[series.maturityPeriod]!.minus(series.principal);
    }
    if (reasons.length > 0) return {id: alternative.id, label: alternative.label, state: "blocked", block_reasons: reasons, after: null, exit_cost: null, concentration: null, new_debt_service: null, uncovered_terms: uncovered};
    const proposed: Record<string, Decimal> = {};
    let newDebtService: BeforeAfterOutput["alternatives"][number]["new_debt_service"] = null;
    let cost: Snapshot["cost"] = {value: input.before.costOfExistingDebt.weightedAverageRate, basis: `${input.before.costOfExistingDebt.basis}; no new debt`, comparable_with_new_debt: false};
    if (alternative.newDebt) {
      const schedule = buildDebtServiceSchedule({amount: alternative.newDebt.amount, annualRate: alternative.newDebt.annualRate, rateConvention: "effective_annual", termMonths: alternative.newDebt.termMonths, graceMonths: alternative.newDebt.graceMonths, graceInterest: "paid", format: alternative.newDebt.format});
      record({id: "structure.debt_service_schedule", alternative: alternative.id, formula: `${alternative.newDebt.format}, ${alternative.newDebt.termMonths} months, ${alternative.newDebt.graceMonths} of grace`, operands: {amount: alternative.newDebt.amount, annualRate: alternative.newDebt.annualRate, disbursementDate: alternative.newDebt.disbursementDate}, result: schedule.totalDebtService});
      for (const row of schedule.rows) {
        if (d(row.principal).isZero()) continue;
        const key = periodOf(addMonths(alternative.newDebt.disbursementDate, row.period));
        proposed[key] = (proposed[key] ?? d(0)).plus(row.principal);
      }
      const termYears = d(alternative.newDebt.termMonths).div(12);
      const allIn = calculateAllInCost(alternative.newDebt.annualRate, d(alternative.newDebt.upfrontFeeRate).plus(newAmount.gt(0) ? exitCost.plus(fees).div(newAmount) : 0).toFixed(), termYears.toFixed());
      record({id: "financial.all_in_cost", alternative: alternative.id, formula: "annualRate + (upfrontFeeRate + (exitCost + feesPaidFromCash) / amount) / termYears", operands: {annualRate: alternative.newDebt.annualRate, upfrontFeeRate: alternative.newDebt.upfrontFeeRate, exitCost: out(exitCost), feesPaidFromCash: out(fees), amount: out(newAmount), termYears: termYears.toFixed()}, result: allIn.value}, "x");
      newDebtService = {peak_debt_service: schedule.peakDebtService, total_interest: schedule.totalInterest, weighted_average_life_months: schedule.weightedAverageLifeMonths, all_in_cost: allIn.value, anchor: alternative.newDebt.anchor};
      cost = {value: allIn.value, basis: "all-in of the new debt: coupon plus upfront fee, exit premiums and cash fees amortized over the term", comparable_with_new_debt: true};
    }
    const consolidated = Object.fromEntries(maturities.map((entry) => [entry.period, existing[entry.period]!.plus(proposed[entry.period] ?? 0)]));
    const grossAfter = d(proForma.grossDebt);
    const rows = maturities.map((entry) => {
      const total = consolidated[entry.period]!;
      const share = grossAfter.gt(0) ? total.div(grossAfter) : d(0);
      const cfads = input.before.cfadsByPeriod?.[entry.period];
      return {period: entry.period, existing: out(existing[entry.period]!), proposed: out(proposed[entry.period] ?? d(0)), consolidated: out(total), share_of_gross: out(share), is_wall: d(out(share)).gt(threshold), principal_coverage: cfads !== undefined && total.gt(0) ? out(d(cfads).div(total)) : null};
    });
    const after = snapshot(alternative.id, grossAfter, d(proForma.unrestrictedCash), cost, Object.fromEntries(rows.map((row) => [row.period, row.consolidated])), {...before.anchors, ...(alternative.newDebt ? {newDebt: alternative.newDebt.anchor} : {}), ...Object.fromEntries(alternative.retired.map((series) => [`retired:${series.seriesId}`, series.anchor]))});
    return {
      id: alternative.id, label: alternative.label, state: "compared", block_reasons: [], after,
      exit_cost: {value: out(exitCost), anchors: alternative.retired.map((series) => series.exitPremium!.anchor)},
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
      ranking = {discriminator: input.ranking.discriminator, rationale: input.ranking.rationale, order: sorted.map((entry, index) => ({id: entry.alternative.id, value: out(entry.score!), reason: index === 0 ? `best ${input.ranking!.discriminator}` : entry.score!.eq(sorted[0]!.score!) ? `tied with the best on ${input.ranking!.discriminator}; ordered by id, not by merit` : `ranks below by ${input.ranking!.discriminator}`}))};
    }
  } else unsupported.push("no ranking: the discriminator was not declared");
  for (const alternative of alternatives) if (alternative.state === "blocked") unsupported.push(`${alternative.id}: ${alternative.block_reasons.join("; ")}`);

  const body = {schema_version: "method.compare-refinancing-before-after.v3" as const, reference_date: input.referenceDate, unit: input.unit, state: blockReasons.length > 0 ? "blocked" as const : "compared" as const, block_reasons: blockReasons, wall_threshold: input.wallThreshold, schedule_adjustments: adjustments.map((entry) => ({id: entry.period, amount: entry.amount})), before, alternatives, ranking, unsupported: [...unsupported].sort(compare)};
  const inputFingerprint = fingerprint(input);
  return {...body, trace: {calculations, inputFingerprint, outputFingerprint: fingerprint({...body, calculations, inputFingerprint})}};
}
