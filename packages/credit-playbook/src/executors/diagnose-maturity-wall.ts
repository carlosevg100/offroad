import {createHash} from "node:crypto";

import {calculateLiquidityCoverage, maturityConcentration} from "@offroad/financial-core";
import Decimal from "decimal.js";
import {z} from "zod";

/**
 * Executor of the method `diagnose-maturity-wall` (v5, after the fourth independent review). Reads
 * the ledger's schedule, names the walls against a versioned threshold (a share strictly above it),
 * measures each period's cover sequentially through financial-core (cash carried forward, the
 * generation declared for that period and nothing for a period without one, contracted sources),
 * and says per period what depends on rollover or new debt. Interest enters the service only when
 * the base states it per period; otherwise the cover is named as principal-only. A source of
 * payment counts only with a contract and a disbursement in two documents of the base, never by a
 * flag, and an unproven source is not placed in any period. The prior figure compares only when it
 * is earlier, in the same unit and perimeter. The unit is anchored to the source that states it.
 * Cash never goes below zero: once it is exhausted the next period opens at zero and the shortfall
 * is carried separately as the cumulative deficit. A proven source must be contracted and disbursed
 * after the reference date, otherwise it already sits inside the cash and would be counted twice.
 * Negative amounts belong only to typed adjustment rows, never to a maturity bucket. An acceleration
 * scenario, when the base holds the clause and the accelerable balance, is recorded apart from the
 * contractual schedule and never added to it. Every number and every note keeps its anchor.
 */
const money = z.string().regex(/^-?\d+(\.\d+)?$/);
const nonNegative = z.string().regex(/^\d+(\.\d+)?$/);
const nonEmpty = z.string().trim().min(1);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const unitSchema = z.enum(["BRL", "BRL thousand", "BRL million", "USD", "USD thousand"]);
const anchorSchema = z.object({document: nonEmpty, page: z.number().int().positive().optional(), note: nonEmpty.optional(), clause: nonEmpty.optional()}).strict();
type Anchor = z.infer<typeof anchorSchema>;
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const UNIT_WORDS: Record<z.infer<typeof unitSchema>, RegExp> = {"BRL": /\b(R\$|reais|BRL)\b(?!\s*(mil|milh))/i, "BRL thousand": /\b(mil|thousand)\b/i, "BRL million": /\b(milh[õo]es|million)\b/i, "USD": /\bUSD\b(?!\s*(mil|thousand))/i, "USD thousand": /\bUSD\b.*\b(mil|thousand)\b/i};
const perimeterSchema = z.enum(["consolidated", "parent"]);

export const maturityWallInputSchema = z.object({
  referenceDate: isoDate,
  unit: unitSchema,
  /** Where the source states the unit; its note must name that unit, so a coherent rescale under another label is refused. */
  unitAnchor: anchorSchema.extend({note: nonEmpty}),
  perimeter: perimeterSchema.default("consolidated"),
  /** Gross debt as the ledger reports it, with the ledger's unit: a rescaled schedule under the wrong label does not pass. */
  grossDebt: z.object({value: nonNegative, unit: unitSchema, anchor: anchorSchema}).strict(),
  /** The schedule as the note states it: buckets with an end date (null for open-ended buckets); the prior figure carries its own date and anchor. */
  /** Maturity buckets carry non-negative amounts; an adjustment row (transaction costs) may be negative, belongs to no period and never enters the cover. */
  periods: z.array(z.object({period: nonEmpty, amount: money, kind: z.enum(["maturity", "adjustment"]).default("maturity"), prior: z.object({amount: money, asOf: isoDate, unit: unitSchema, perimeter: perimeterSchema.default("consolidated"), anchor: anchorSchema}).strict().nullable().default(null), endsAt: isoDate.nullable()}).strict()),
  /** Interest per period when the base states it; without it the cover is principal-only and says so. */
  interestByPeriod: z.record(nonEmpty, z.object({value: nonNegative, anchor: anchorSchema}).strict()).nullable().default(null),
  scheduleAnchor: anchorSchema,
  cash: z.object({
    value: nonNegative,
    /** What the number means: the ledger never assumes day-zero liquidity from equivalents. */
    definition: z.enum(["accounting_equivalents_up_to_90_days", "day_zero_available", "contractual_net_debt_definition"]),
    anchor: anchorSchema,
  }).strict(),
  /** Cash generation available for debt service (CFADS), never EBITDA: the basis says how it was derived, the period is twelve months. */
  operatingGeneration: z.object({basis: z.enum(["cfads_ltm", "cfads_declared_projection"]), /** Generation per period of the schedule; a period absent here has no declared generation and is covered by cash only. */ byPeriod: z.record(nonEmpty, money), anchor: anchorSchema}).strict().nullable().default(null),
  /** Sources of payment mentioned in the file. One counts only when the base holds a contract and a proof of disbursement, each a document of its own class. */
  claimedSources: z.array(z.object({
    id: nonEmpty,
    label: nonEmpty,
    amount: nonNegative,
    /** The period the file assigns the source to; it is placed there only once the source is proven. */
    claimedPeriod: nonEmpty.nullable(),
    evidence: z.object({
      approval: anchorSchema.nullable(),
      contract: z.object({kind: z.literal("contract"), date: isoDate, anchor: anchorSchema}).strict().nullable(),
      /** The disbursement must fall after the reference date: an earlier one already sits inside the cash. */
      disbursement: z.object({kind: z.literal("disbursement_proof"), date: isoDate, anchor: anchorSchema}).strict().nullable(),
    }).strict(),
  }).strict()).default([]),
  /** Concentration strictly above this share of gross debt in one period is a wall; the policy is named. */
  wallThreshold: z.object({share: nonNegative, policyKey: nonEmpty, policyVersion: nonEmpty}).strict(),
  /** The acceleration mechanics the indenture writes, when the base holds them; null keeps the mechanism unasserted. */
  acceleration: z.object({
    clause: z.object({text: nonEmpty, anchor: anchorSchema}).strict(),
    /** What the indenture says happens by default: declared unless the assembly waives it, or declared only by the assembly. */
    defaultOutcome: z.enum(["declared_unless_assembly_waives", "declared_only_by_assembly"]),
    accelerableBalance: z.object({value: nonNegative, anchor: anchorSchema}).strict().nullable(),
  }).strict().nullable().default(null),
}).strict().superRefine((input, context) => {
  if (new Decimal(input.wallThreshold.share).gt(1)) context.addIssue({code: "custom", path: ["wallThreshold", "share"], message: "a wall threshold is a share of gross debt between 0 and 1"});
  if (!UNIT_WORDS[input.unit].test(input.unitAnchor.note)) context.addIssue({code: "custom", path: ["unitAnchor"], message: `the unit anchor's note does not name the unit ${input.unit}; a rescaled schedule under another label is refused`});
  const seen = new Set<string>();
  input.periods.forEach((period, index) => {
    if (seen.has(period.period)) context.addIssue({code: "custom", path: ["periods", index], message: `duplicate period ${period.period}`});
    seen.add(period.period);
    if (period.endsAt !== null && period.endsAt <= input.referenceDate) context.addIssue({code: "custom", path: ["periods", index], message: `period ${period.period} ends on or before the reference date`});
    if (period.prior && period.prior.asOf >= input.referenceDate) context.addIssue({code: "custom", path: ["periods", index, "prior"], message: `period ${period.period}: the prior figure is dated ${period.prior.asOf}, not before the reference date`});
    if (period.kind === "maturity" && period.amount.startsWith("-")) context.addIssue({code: "custom", path: ["periods", index, "amount"], message: `period ${period.period} carries a negative amount; only a typed adjustment row may, and it never enters the cover`});
    if (period.kind === "adjustment" && period.endsAt !== null) context.addIssue({code: "custom", path: ["periods", index], message: `adjustment ${period.period} belongs to no period and cannot end on a date`});
  });
  for (const key of Object.keys(input.interestByPeriod ?? {})) if (!seen.has(key)) context.addIssue({code: "custom", path: ["interestByPeriod"], message: `interest names a period that is not in the schedule: ${key}`});
  for (const key of Object.keys(input.operatingGeneration?.byPeriod ?? {})) if (!seen.has(key)) context.addIssue({code: "custom", path: ["operatingGeneration"], message: `generation names a period that is not in the schedule: ${key}`});
  if (input.grossDebt.unit !== input.unit) context.addIssue({code: "custom", path: ["grossDebt", "unit"], message: `the ledger reports the gross debt in ${input.grossDebt.unit} and the schedule is declared in ${input.unit}`});
  const sourceIds = new Set<string>();
  input.claimedSources.forEach((source, index) => {
    if (sourceIds.has(source.id)) context.addIssue({code: "custom", path: ["claimedSources", index, "id"], message: `duplicate source ${source.id}`});
    sourceIds.add(source.id);
    if (source.claimedPeriod !== null && !seen.has(source.claimedPeriod)) context.addIssue({code: "custom", path: ["claimedSources", index, "claimedPeriod"], message: `source "${source.label}" names a period that is not in the schedule`});
    if (source.evidence.contract && source.evidence.disbursement && source.evidence.contract.anchor.document === source.evidence.disbursement.anchor.document) context.addIssue({code: "custom", path: ["claimedSources", index, "evidence"], message: `source "${source.label}": the contract and the disbursement proof must be two documents of the base, not two places of one`});
    if (source.evidence.disbursement && source.evidence.disbursement.date <= input.referenceDate) context.addIssue({code: "custom", path: ["claimedSources", index, "evidence", "disbursement"], message: `source "${source.label}": disbursed on ${source.evidence.disbursement.date}, on or before the reference date; that cash already sits in the balance and counting it again is double counting`});
    if (source.evidence.contract && source.evidence.disbursement && source.evidence.disbursement.date < source.evidence.contract.date) context.addIssue({code: "custom", path: ["claimedSources", index, "evidence"], message: `source "${source.label}": disbursed before it was contracted`});
    if (source.evidence.approval && source.evidence.contract && source.evidence.approval.document === source.evidence.contract.anchor.document) context.addIssue({code: "custom", path: ["claimedSources", index, "evidence"], message: `source "${source.label}": a board approval is not a contract; the contract needs its own document`});
  });
});
export type MaturityWallInput = z.input<typeof maturityWallInputSchema>;

type Calculation = {id: string; formula: string; operands: Record<string, string>; result: string; unit: string};

export type MaturityWallOutput = {
  schema_version: "method.diagnose-maturity-wall.v5";
  reference_date: string;
  unit: string;
  state: "complete" | "incomplete" | "blocked";
  block_reasons: string[];
  incomplete_reasons: string[];
  wall_threshold: {share: string; policyKey: string; policyVersion: string};
  walls: Array<{period: string; amount: string; share_of_gross: string; change_from_prior: {amount: string; prior_as_of: string; anchor: Anchor} | null; prior_comparability: string | null; is_wall: boolean; anchor: Anchor}>;
  peak: {period: string; amount: string; share_of_gross: string} | null;
  coverage: {
    cash_definition: string;
    cash: {value: string; anchor: Anchor};
    operating_generation: {basis: string; anchor: Anchor; periods_declared: string[]} | null;
    /** principal_only when the base states no interest per period; full_debt_service when it does. */
    coverage_basis: "principal_only" | "full_debt_service";
    by_period: Array<{period: string; principal: string; interest: string | null; interest_anchor: Anchor | null; basis: "principal_only" | "full_debt_service"; debt_service: string; opening_cash: string; generation: string | null; generation_declared: boolean; contracted_sources: string; sources: string; coverage: string | null; closing_cash: string; incremental_deficit: string; cumulative_deficit: string; rollover_dependency: string; state: "assessed" | "not_assessed"}>;
    /** The shortfall carried to the end of the assessed horizon: what rollover or new debt must provide in total. */
    cumulative_deficit: string;
    caveat: string;
  };
  /** `period` is set only for a proven source; `claimed_period` keeps what the file says. */
  sources: Array<{id: string; label: string; amount: string; period: string | null; claimed_period: string | null; state: "proven" | "unproven"; reason: string; evidence: {approval: Anchor | null; contract: {date: string; anchor: Anchor} | null; disbursement: {date: string; anchor: Anchor} | null}}>;
  /** Rows of the schedule that belong to no period (transaction costs); they reconcile the schedule to the gross debt and never enter the cover. */
  schedule_adjustments: Array<{id: string; amount: string}>;
  /** The acceleration reading the indenture allows, recorded apart from the contractual schedule and never added to it. */
  acceleration_scenario: {state: "not_asserted" | "recorded"; clause: Anchor | null; default_outcome: string | null; accelerable_balance: {value: string; anchor: Anchor} | null; note: string};
  uncovered_terms: Array<{id: string; state: "insufficient_evidence"; reason: string}>;
  notes: Array<{text: string; anchor: Anchor | null}>;
  trace: {calculations: Calculation[]; inputFingerprint: string; outputFingerprint: string};
};

const d = (value: Decimal.Value) => new Decimal(value);
const out = (value: Decimal) => value.toDecimalPlaces(8).toFixed();
const stableStringify = (value: unknown): string => JSON.stringify(value, (_key, inner: unknown) => (inner && typeof inner === "object" && !Array.isArray(inner) ? Object.fromEntries(Object.entries(inner as Record<string, unknown>).sort(([a], [b]) => compare(a, b))) : inner));
const fingerprint = (value: unknown) => createHash("sha256").update(stableStringify(value)).digest("hex");

function canonical(input: z.infer<typeof maturityWallInputSchema>) {
  // Dated buckets in date order, then open-ended buckets by label: the order the cover walks.
  const periods = [...input.periods].sort((a, b) => (a.kind !== b.kind ? (a.kind === "adjustment" ? 1 : -1) : a.endsAt === null && b.endsAt === null ? compare(a.period, b.period) : a.endsAt === null ? 1 : b.endsAt === null ? -1 : compare(a.endsAt, b.endsAt) || compare(a.period, b.period)));
  return {...input, periods, claimedSources: [...input.claimedSources].sort((a, b) => compare(a.id, b.id))};
}

export function diagnoseMaturityWall(raw: MaturityWallInput): MaturityWallOutput {
  const input = canonical(maturityWallInputSchema.parse(raw));
  const calculations: Calculation[] = [];
  const record = (calculation: Omit<Calculation, "unit">, unit: string = input.unit) => calculations.push({...calculation, unit});
  const blockReasons: string[] = [];
  const incompleteReasons: string[] = [];
  const uncovered: MaturityWallOutput["uncovered_terms"] = [];
  const notes: MaturityWallOutput["notes"] = input.acceleration
    ? [{text: `a covenant that is not met is a non-automatic acceleration event under the clause in the base: ${input.acceleration.defaultOutcome === "declared_unless_assembly_waives" ? "the acceleration is declared unless the assembly of holders, duly installed with quorum, resolves not to declare it" : "the acceleration is declared only by resolution of the assembly of holders"}; the contractual schedule and an acceleration scenario are never added together`, anchor: input.acceleration.clause.anchor}]
    : [{text: "a covenant that is not met is a non-automatic acceleration event; the indenture clause that writes the assembly's default is not in the base, so the mechanism is not asserted; the contractual schedule and an acceleration scenario are never added together", anchor: null}];
  const accelerationScenario: MaturityWallOutput["acceleration_scenario"] = input.acceleration
    ? {state: "recorded", clause: input.acceleration.clause.anchor, default_outcome: input.acceleration.defaultOutcome, accelerable_balance: input.acceleration.accelerableBalance ? {value: out(d(input.acceleration.accelerableBalance.value)), anchor: input.acceleration.accelerableBalance.anchor} : null, note: input.acceleration.accelerableBalance ? `if declared, ${out(d(input.acceleration.accelerableBalance.value))} becomes due at once; recorded apart from the contractual schedule, never added to it` : "the accelerable balance is not in the base; the scenario is recorded without an amount"}
    : {state: "not_asserted", clause: null, default_outcome: null, accelerable_balance: null, note: "no acceleration clause in the base; no acceleration scenario is asserted"};
  const maturities = input.periods.filter((period) => period.kind === "maturity");
  const adjustments = input.periods.filter((period) => period.kind === "adjustment");
  if (maturities.length === 0) blockReasons.push("no schedule in the base: nothing to diagnose");
  const gross = d(input.grossDebt.value);
  if (gross.isZero()) blockReasons.push("gross debt is zero; a wall has no denominator");
  const scheduleTotal = input.periods.reduce((sum, period) => sum.plus(period.amount), d(0));
  if (input.periods.length > 0 && !scheduleTotal.eq(gross)) blockReasons.push(`the schedule sums to ${out(scheduleTotal)} and the gross debt is ${out(gross)}; the ledger did not reconcile them`);
  if (blockReasons.length > 0) {
    // A blocked ledger stops the diagnosis: no wall, no peak, no cover is computed on numbers that do not reconcile.
    const body = {
      schema_version: "method.diagnose-maturity-wall.v5" as const, reference_date: input.referenceDate, unit: input.unit, state: "blocked" as const, block_reasons: blockReasons, incomplete_reasons: [],
      wall_threshold: input.wallThreshold, walls: [], peak: null,
      coverage: {cash_definition: input.cash.definition, cash: {value: out(d(input.cash.value)), anchor: input.cash.anchor}, operating_generation: null, coverage_basis: input.interestByPeriod ? "full_debt_service" as const : "principal_only" as const, by_period: [], cumulative_deficit: "0", caveat: "diagnosis stopped: the ledger is blocked"},
      sources: [], schedule_adjustments: adjustments.map((entry) => ({id: entry.period, amount: entry.amount})), acceleration_scenario: accelerationScenario, uncovered_terms: [], notes,
    };
    const inputFingerprint = fingerprint(input);
    return {...body, trace: {calculations, inputFingerprint, outputFingerprint: fingerprint({...body, calculations, inputFingerprint})}};
  }

  // 1. Concentration and walls, through financial-core's concentration rows and a strict threshold.
  const threshold = d(input.wallThreshold.share);
  const concentration = maturityConcentration({existing: Object.fromEntries(maturities.map((period) => [period.period, period.amount])), proposed: {}});
  const walls = maturities.map((period) => {
    const amount = d(period.amount);
    const share = gross.isZero() ? d(0) : amount.div(gross);
    record({id: `structure.maturity_concentration:${period.period}`, formula: "amount / grossDebt", operands: {amount: period.amount, grossDebt: input.grossDebt.value}, result: out(share)}, "x");
    // The share is compared at the eight decimals it is written with; exactly the threshold is not a wall.
    const priorIssue = period.prior === null ? null : period.prior.unit !== input.unit ? `the prior figure is in ${period.prior.unit}, the schedule in ${input.unit}; not compared` : period.prior.perimeter !== input.perimeter ? `the prior figure is ${period.prior.perimeter}, the schedule ${input.perimeter}; not compared` : null;
    return {period: period.period, amount: out(amount), share_of_gross: out(share), change_from_prior: period.prior === null || priorIssue ? null : {amount: out(amount.minus(period.prior.amount)), prior_as_of: period.prior.asOf, anchor: period.prior.anchor}, prior_comparability: period.prior === null ? "no prior figure in the base" : priorIssue ?? "earlier date, same unit and perimeter", is_wall: d(out(share)).gt(threshold), anchor: input.scheduleAnchor};
  });
  const peak = concentration.peak ? {period: concentration.peak.period, amount: concentration.peak.consolidated, share_of_gross: out(gross.isZero() ? d(0) : d(concentration.peak.consolidated).div(gross))} : null;

  // 2. Sources: proven only with contract and disbursement in the base.
  const sources = input.claimedSources.map((source) => {
    const proven = source.evidence.contract !== null && source.evidence.disbursement !== null;
    const reason = proven ? "a contract and a disbursement proof, each in its own document, are in the base" : `${[source.evidence.approval ? "approved" : null, source.evidence.contract ? "contracted" : null].filter(Boolean).join(" and ") || "mentioned"} only; without a contract and a disbursement proof in the base an approval is not a source of payment`;
    return {id: source.id, label: source.label, amount: out(d(source.amount)), period: proven ? source.claimedPeriod : null, claimed_period: source.claimedPeriod, state: proven ? "proven" as const : "unproven" as const, reason: proven ? `${reason}; contracted ${source.evidence.contract!.date}, disbursed ${source.evidence.disbursement!.date}, after the reference date` : `${reason}; the period the file assigns (${source.claimedPeriod ?? "none"}) is not used`, evidence: {approval: source.evidence.approval, contract: source.evidence.contract ? {date: source.evidence.contract.date, anchor: source.evidence.contract.anchor} : null, disbursement: source.evidence.disbursement ? {date: source.evidence.disbursement.date, anchor: source.evidence.disbursement.anchor} : null}};
  });
  for (const source of sources.filter((entry) => entry.state === "unproven")) uncovered.push({id: `source:${source.id}`, state: "insufficient_evidence", reason: source.reason});

  // 3. Sequential cover per annual period through financial-core: cash carried forward, generation per year, proven sources in their period.
  const cash = d(input.cash.value);
  const assessedPeriods = maturities.filter((period) => period.endsAt !== null);
  const generationFor = (period: string): Decimal | null => { const value = input.operatingGeneration?.byPeriod[period]; return value === undefined ? null : d(value); };
  const undeclared = assessedPeriods.filter((period) => generationFor(period.period) === null).map((period) => period.period);
  if (!input.operatingGeneration) { incompleteReasons.push("no cash generation available for debt service (CFADS) with a declared basis in the base: the cover below is cash only"); uncovered.push({id: "operating_generation", state: "insufficient_evidence", reason: "CFADS not stated as LTM or declared projection; EBITDA is not accepted in its place"}); }
  else if (undeclared.length > 0) { incompleteReasons.push(`no generation declared for ${undeclared.join(", ")}: those periods are covered by cash and contracted sources only; a single figure is never repeated across years`); uncovered.push({id: "operating_generation:periods", state: "insufficient_evidence", reason: `generation declared only for ${Object.keys(input.operatingGeneration.byPeriod).sort(compare).join(", ")}`}); }
  if (!input.interestByPeriod) { incompleteReasons.push("no interest per period in the base: the cover is principal-only, not full debt service"); uncovered.push({id: "interest", state: "insufficient_evidence", reason: "interest per period not stated; it is not filled with zero, the cover is named principal-only"}); }
  else for (const period of assessedPeriods) if (!input.interestByPeriod[period.period]) { incompleteReasons.push(`no interest declared for ${period.period}; its cover is principal-only`); uncovered.push({id: `interest:${period.period}`, state: "insufficient_evidence", reason: `interest of ${period.period} not stated; that period's cover is principal-only`}); }
  const interestComplete = input.interestByPeriod !== null && assessedPeriods.every((period) => input.interestByPeriod![period.period]);
  if (input.cash.definition !== "day_zero_available") uncovered.push({id: "cash_availability", state: "insufficient_evidence", reason: input.cash.definition === "accounting_equivalents_up_to_90_days" ? "cash and equivalents are redeemable within up to 90 days under the accounting definition; day-zero availability is not proven" : "cash follows the contractual net debt definition; availability for payment is not asserted"});
  const assessed = assessedPeriods;
  const interestFor = (period: string): Decimal | null => { const entry = input.interestByPeriod?.[period]; return entry ? d(entry.value) : null; };
  // Each period runs through financial-core with the cash the previous period left, never below zero: an exhausted cash opens the next period at zero and the shortfall is carried apart.
  let carriedCash = cash;
  let cumulative = d(0);
  const byPeriod = maturities.map((period) => {
    if (period.endsAt === null) return {period: period.period, principal: out(d(period.amount)), interest: null, interest_anchor: null, basis: "principal_only" as const, debt_service: out(d(period.amount)), opening_cash: "0", generation: null, generation_declared: false, contracted_sources: "0", sources: "0", coverage: null, closing_cash: "0", incremental_deficit: "0", cumulative_deficit: "0", rollover_dependency: "not assessed: open-ended bucket", state: "not_assessed" as const};
    const generation = generationFor(period.period);
    const interest = interestFor(period.period);
    const contracted = sources.filter((source) => source.state === "proven" && source.period === period.period).reduce((sum, source) => sum.plus(source.amount), d(0));
    const row = calculateLiquidityCoverage([{period: period.period, openingCash: carriedCash, cfads: generation ?? 0, principal: period.amount, interest: interest ?? 0, contractedSources: contracted}])[0]!;
    const incremental = d(row.deficit);
    cumulative = cumulative.plus(incremental);
    carriedCash = Decimal.max(d(row.closingCash), 0);
    record({id: `financial.liquidity_coverage:${period.period}`, formula: "(openingCash + generation + contractedSources) / (principal + interest) ; deficit = max(service - sources, 0) ; next opening cash = max(closing cash, 0) ; cumulative deficit = sum of deficits", operands: {openingCash: row.openingCash, generation: generation ? out(generation) : "not_declared", contractedSources: out(contracted), principal: period.amount, interest: interest ? out(interest) : "not_declared"}, result: row.coverage ?? "n/a"}, "x");
    return {
      period: period.period, principal: out(d(period.amount)), interest: interest ? out(interest) : null, interest_anchor: input.interestByPeriod?.[period.period]?.anchor ?? null, basis: interest ? "full_debt_service" as const : "principal_only" as const, debt_service: row.debtService, opening_cash: row.openingCash, generation: generation ? out(generation) : null, generation_declared: generation !== null, contracted_sources: out(contracted), sources: row.sources, coverage: row.coverage, closing_cash: out(Decimal.max(d(row.closingCash), 0)), incremental_deficit: out(incremental), cumulative_deficit: out(cumulative),
      rollover_dependency: incremental.gt(0) ? `${out(incremental)} of this period's ${interest ? "debt service" : "principal"} depends on rollover or new debt (cumulative shortfall carried: ${out(cumulative)})` : cumulative.gt(0) ? `this period adds no new dependency; the carried shortfall of ${out(cumulative)} remains` : `covered by carried cash${generation ? ", declared generation" : ""} and contracted sources`,
      state: "assessed" as const,
    };
  });
  const caveat = input.cash.definition === "day_zero_available"
    ? "cash is stated as available on day zero"
    : input.cash.definition === "accounting_equivalents_up_to_90_days"
      ? "cash and equivalents are redeemable within up to 90 days under the accounting definition; this is not day-zero liquidity"
      : "cash follows the contractual net debt definition; availability for payment is not asserted";
  const state: MaturityWallOutput["state"] = blockReasons.length > 0 ? "blocked" : incompleteReasons.length > 0 ? "incomplete" : "complete";
  const body = {
    schema_version: "method.diagnose-maturity-wall.v5" as const, reference_date: input.referenceDate, unit: input.unit, state, block_reasons: blockReasons, incomplete_reasons: incompleteReasons,
    wall_threshold: input.wallThreshold, walls, peak,
    coverage: {cash_definition: input.cash.definition, cash: {value: out(cash), anchor: input.cash.anchor}, operating_generation: input.operatingGeneration ? {basis: input.operatingGeneration.basis, anchor: input.operatingGeneration.anchor, periods_declared: Object.keys(input.operatingGeneration.byPeriod).sort(compare)} : null, coverage_basis: interestComplete ? "full_debt_service" as const : "principal_only" as const, by_period: byPeriod, cumulative_deficit: out(cumulative), caveat},
    sources, schedule_adjustments: adjustments.map((entry) => ({id: entry.period, amount: entry.amount})), acceleration_scenario: accelerationScenario, uncovered_terms: uncovered, notes,
  };
  const inputFingerprint = fingerprint(input);
  return {...body, trace: {calculations, inputFingerprint, outputFingerprint: fingerprint({...body, calculations, inputFingerprint})}};
}
