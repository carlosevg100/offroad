import {createHash} from "node:crypto";

import {calculateLiquidityCoverage, maturityConcentration} from "@offroad/financial-core";
import Decimal from "decimal.js";
import {z} from "zod";

/**
 * Executor of the method `diagnose-maturity-wall` (v3, after the second independent review). Reads
 * the ledger's schedule, names the walls against a versioned threshold (a share strictly above it),
 * measures each period's cover sequentially through financial-core (cash carried forward, declared
 * generation, contracted sources), and says per period what depends on rollover or new debt. A
 * source of payment counts only with a contract and a disbursement in the base, never by a flag.
 * Every number keeps its anchor. A covenant breach is named as a non-automatic acceleration event.
 */
const money = z.string().regex(/^-?\d+(\.\d+)?$/);
const nonNegative = z.string().regex(/^\d+(\.\d+)?$/);
const nonEmpty = z.string().trim().min(1);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const unitSchema = z.enum(["BRL", "BRL thousand", "BRL million", "USD", "USD thousand"]);
const anchorSchema = z.object({document: nonEmpty, page: z.number().int().positive().optional(), note: nonEmpty.optional(), clause: nonEmpty.optional()}).strict();
type Anchor = z.infer<typeof anchorSchema>;
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export const maturityWallInputSchema = z.object({
  referenceDate: isoDate,
  unit: unitSchema,
  /** Gross debt as the ledger reports it, with the ledger's unit: a rescaled schedule under the wrong label does not pass. */
  grossDebt: z.object({value: nonNegative, unit: unitSchema, anchor: anchorSchema}).strict(),
  /** The schedule as the note states it: buckets with an end date (null for open-ended buckets); the prior figure carries its own date and anchor. */
  periods: z.array(z.object({period: nonEmpty, amount: money, prior: z.object({amount: money, asOf: isoDate, anchor: anchorSchema}).strict().nullable().default(null), endsAt: isoDate.nullable()}).strict()),
  scheduleAnchor: anchorSchema,
  cash: z.object({
    value: nonNegative,
    /** What the number means: the ledger never assumes day-zero liquidity from equivalents. */
    definition: z.enum(["accounting_equivalents_up_to_90_days", "day_zero_available", "contractual_net_debt_definition"]),
    anchor: anchorSchema,
  }).strict(),
  /** Cash generation available for debt service (CFADS), never EBITDA: the basis says how it was derived, the period is twelve months. */
  operatingGeneration: z.object({value: money, basis: z.enum(["cfads_ltm", "cfads_declared_projection"]), periodMonths: z.literal(12), anchor: anchorSchema}).strict().nullable().default(null),
  /** Sources of payment mentioned in the file. One counts only when the base holds a contract and a proof of disbursement, each a document of its own class. */
  claimedSources: z.array(z.object({
    id: nonEmpty,
    label: nonEmpty,
    amount: nonNegative,
    period: nonEmpty.nullable(),
    evidence: z.object({
      approval: anchorSchema.nullable(),
      contract: z.object({kind: z.literal("contract"), anchor: anchorSchema}).strict().nullable(),
      disbursement: z.object({kind: z.literal("disbursement_proof"), anchor: anchorSchema}).strict().nullable(),
    }).strict(),
  }).strict()).default([]),
  /** Concentration strictly above this share of gross debt in one period is a wall; the policy is named. */
  wallThreshold: z.object({share: nonNegative, policyKey: nonEmpty, policyVersion: nonEmpty}).strict(),
}).strict().superRefine((input, context) => {
  const seen = new Set<string>();
  input.periods.forEach((period, index) => {
    if (seen.has(period.period)) context.addIssue({code: "custom", path: ["periods", index], message: `duplicate period ${period.period}`});
    seen.add(period.period);
    if (period.endsAt !== null && period.endsAt <= input.referenceDate) context.addIssue({code: "custom", path: ["periods", index], message: `period ${period.period} ends on or before the reference date`});
  });
  if (input.grossDebt.unit !== input.unit) context.addIssue({code: "custom", path: ["grossDebt", "unit"], message: `the ledger reports the gross debt in ${input.grossDebt.unit} and the schedule is declared in ${input.unit}`});
  const sourceIds = new Set<string>();
  input.claimedSources.forEach((source, index) => {
    if (sourceIds.has(source.id)) context.addIssue({code: "custom", path: ["claimedSources", index, "id"], message: `duplicate source ${source.id}`});
    sourceIds.add(source.id);
    if (source.period !== null && !seen.has(source.period)) context.addIssue({code: "custom", path: ["claimedSources", index, "period"], message: `source "${source.label}" names a period that is not in the schedule`});
    if (source.evidence.contract && source.evidence.disbursement && source.evidence.contract.anchor.document === source.evidence.disbursement.anchor.document && source.evidence.contract.anchor.page === source.evidence.disbursement.anchor.page) context.addIssue({code: "custom", path: ["claimedSources", index, "evidence"], message: `source "${source.label}": the contract and the disbursement proof cannot be the same page of the same document`});
    if (source.evidence.approval && source.evidence.contract && source.evidence.approval.document === source.evidence.contract.anchor.document) context.addIssue({code: "custom", path: ["claimedSources", index, "evidence"], message: `source "${source.label}": a board approval is not a contract; the contract needs its own document`});
  });
});
export type MaturityWallInput = z.input<typeof maturityWallInputSchema>;

type Calculation = {id: string; formula: string; operands: Record<string, string>; result: string; unit: string};

export type MaturityWallOutput = {
  schema_version: "method.diagnose-maturity-wall.v3";
  reference_date: string;
  unit: string;
  state: "complete" | "incomplete" | "blocked";
  block_reasons: string[];
  incomplete_reasons: string[];
  wall_threshold: {share: string; policyKey: string; policyVersion: string};
  walls: Array<{period: string; amount: string; share_of_gross: string; change_from_prior: {amount: string; prior_as_of: string; anchor: Anchor} | null; is_wall: boolean; anchor: Anchor}>;
  peak: {period: string; amount: string; share_of_gross: string} | null;
  coverage: {
    cash_definition: string;
    cash: {value: string; anchor: Anchor};
    operating_generation: {value: string; basis: string; anchor: Anchor} | null;
    by_period: Array<{period: string; amount: string; opening_cash: string; sources: string; contracted_sources: string; debt_service: string; coverage: string | null; closing_cash: string; incremental_deficit: string; cumulative_deficit: string; rollover_dependency: string; state: "assessed" | "not_assessed"}>;
    /** The shortfall carried to the end of the assessed horizon: what rollover or new debt must provide in total. */
    cumulative_deficit: string;
    caveat: string;
  };
  sources: Array<{id: string; label: string; amount: string; period: string | null; state: "proven" | "unproven"; reason: string; evidence: {approval: Anchor | null; contract: Anchor | null; disbursement: Anchor | null}}>;
  uncovered_terms: Array<{id: string; state: "insufficient_evidence"; reason: string}>;
  notes: string[];
  trace: {calculations: Calculation[]; inputFingerprint: string; outputFingerprint: string};
};

const d = (value: Decimal.Value) => new Decimal(value);
const out = (value: Decimal) => value.toDecimalPlaces(8).toFixed();
const stableStringify = (value: unknown): string => JSON.stringify(value, (_key, inner: unknown) => (inner && typeof inner === "object" && !Array.isArray(inner) ? Object.fromEntries(Object.entries(inner as Record<string, unknown>).sort(([a], [b]) => compare(a, b))) : inner));
const fingerprint = (value: unknown) => createHash("sha256").update(stableStringify(value)).digest("hex");

function canonical(input: z.infer<typeof maturityWallInputSchema>) {
  // Dated buckets in date order, then open-ended buckets by label: the order the cover walks.
  const periods = [...input.periods].sort((a, b) => (a.endsAt === null && b.endsAt === null ? compare(a.period, b.period) : a.endsAt === null ? 1 : b.endsAt === null ? -1 : compare(a.endsAt, b.endsAt) || compare(a.period, b.period)));
  return {...input, periods, claimedSources: [...input.claimedSources].sort((a, b) => compare(a.id, b.id))};
}

export function diagnoseMaturityWall(raw: MaturityWallInput): MaturityWallOutput {
  const input = canonical(maturityWallInputSchema.parse(raw));
  const calculations: Calculation[] = [];
  const record = (calculation: Omit<Calculation, "unit">, unit: string = input.unit) => calculations.push({...calculation, unit});
  const blockReasons: string[] = [];
  const incompleteReasons: string[] = [];
  const uncovered: MaturityWallOutput["uncovered_terms"] = [];
  const notes: string[] = ["a covenant that is not met is a non-automatic acceleration event: the holders decide in assembly whether to declare it; the contractual schedule and an acceleration scenario are never added together"];
  if (input.periods.length === 0) blockReasons.push("no schedule in the base: nothing to diagnose");
  const gross = d(input.grossDebt.value);
  if (gross.isZero()) blockReasons.push("gross debt is zero; a wall has no denominator");
  const scheduleTotal = input.periods.reduce((sum, period) => sum.plus(period.amount), d(0));
  if (input.periods.length > 0 && !scheduleTotal.eq(gross)) blockReasons.push(`the schedule sums to ${out(scheduleTotal)} and the gross debt is ${out(gross)}; the ledger did not reconcile them`);
  if (blockReasons.length > 0) {
    // A blocked ledger stops the diagnosis: no wall, no peak, no cover is computed on numbers that do not reconcile.
    const body = {
      schema_version: "method.diagnose-maturity-wall.v3" as const, reference_date: input.referenceDate, unit: input.unit, state: "blocked" as const, block_reasons: blockReasons, incomplete_reasons: [],
      wall_threshold: input.wallThreshold, walls: [], peak: null,
      coverage: {cash_definition: input.cash.definition, cash: {value: out(d(input.cash.value)), anchor: input.cash.anchor}, operating_generation: null, by_period: [], cumulative_deficit: "0", caveat: "diagnosis stopped: the ledger is blocked"},
      sources: [], uncovered_terms: [], notes,
    };
    const inputFingerprint = fingerprint(input);
    return {...body, trace: {calculations, inputFingerprint, outputFingerprint: fingerprint({...body, calculations, inputFingerprint})}};
  }

  // 1. Concentration and walls, through financial-core's concentration rows and a strict threshold.
  const threshold = d(input.wallThreshold.share);
  const concentration = maturityConcentration({existing: Object.fromEntries(input.periods.map((period) => [period.period, period.amount])), proposed: {}});
  const walls = input.periods.map((period) => {
    const amount = d(period.amount);
    const share = gross.isZero() ? d(0) : amount.div(gross);
    record({id: `structure.maturity_concentration:${period.period}`, formula: "amount / grossDebt", operands: {amount: period.amount, grossDebt: input.grossDebt.value}, result: out(share)}, "x");
    // The share is compared at the eight decimals it is written with; exactly the threshold is not a wall.
    return {period: period.period, amount: out(amount), share_of_gross: out(share), change_from_prior: period.prior === null ? null : {amount: out(amount.minus(period.prior.amount)), prior_as_of: period.prior.asOf, anchor: period.prior.anchor}, is_wall: d(out(share)).gt(threshold), anchor: input.scheduleAnchor};
  });
  const peak = concentration.peak ? {period: concentration.peak.period, amount: concentration.peak.consolidated, share_of_gross: out(gross.isZero() ? d(0) : d(concentration.peak.consolidated).div(gross))} : null;

  // 2. Sources: proven only with contract and disbursement in the base.
  const sources = input.claimedSources.map((source) => {
    const proven = source.evidence.contract !== null && source.evidence.disbursement !== null;
    const reason = proven ? "a contract and a disbursement proof, each in its own document, are in the base" : `${[source.evidence.approval ? "approved" : null, source.evidence.contract ? "contracted" : null].filter(Boolean).join(" and ") || "mentioned"} only; without a contract and a disbursement proof in the base an approval is not a source of payment`;
    return {id: source.id, label: source.label, amount: out(d(source.amount)), period: source.period, state: proven ? "proven" as const : "unproven" as const, reason, evidence: {approval: source.evidence.approval, contract: source.evidence.contract?.anchor ?? null, disbursement: source.evidence.disbursement?.anchor ?? null}};
  });
  for (const source of sources.filter((entry) => entry.state === "unproven")) uncovered.push({id: `source:${source.id}`, state: "insufficient_evidence", reason: source.reason});

  // 3. Sequential cover per annual period through financial-core: cash carried forward, generation per year, proven sources in their period.
  const cash = d(input.cash.value);
  const generation = input.operatingGeneration ? d(input.operatingGeneration.value) : null;
  if (!generation) { incompleteReasons.push("no cash generation available for debt service (CFADS) with a declared basis in the base: the cover below is cash only"); uncovered.push({id: "operating_generation", state: "insufficient_evidence", reason: "CFADS not stated as LTM or declared projection; EBITDA is not accepted in its place"}); }
  if (input.cash.definition !== "day_zero_available") uncovered.push({id: "cash_availability", state: "insufficient_evidence", reason: input.cash.definition === "accounting_equivalents_up_to_90_days" ? "cash and equivalents are redeemable within up to 90 days under the accounting definition; day-zero availability is not proven" : "cash follows the contractual net debt definition; availability for payment is not asserted"});
  const assessed = input.periods.filter((period) => period.endsAt !== null);
  const liquidity = calculateLiquidityCoverage(assessed.map((period) => ({
    period: period.period, openingCash: cash, cfads: generation ?? 0, principal: period.amount, interest: 0,
    contractedSources: sources.filter((source) => source.state === "proven" && source.period === period.period).reduce((sum, source) => sum.plus(source.amount), d(0)),
  })));
  // The shortfall compounds forward through negative closing cash, so the running figure is the last assessed period's deficit.
  let cumulative = d(0);
  let previousCumulative = d(0);
  const byPeriod = input.periods.map((period) => {
    const row = liquidity.find((entry) => entry.period === period.period);
    if (!row) return {period: period.period, amount: out(d(period.amount)), opening_cash: "0", sources: "0", contracted_sources: "0", debt_service: out(d(period.amount)), coverage: null, closing_cash: "0", incremental_deficit: "0", cumulative_deficit: "0", rollover_dependency: "not assessed: open-ended bucket", state: "not_assessed" as const};
    const contracted = sources.filter((source) => source.state === "proven" && source.period === period.period).reduce((sum, source) => sum.plus(source.amount), d(0));
    // The engine carries negative cash forward, so its deficit is cumulative; the period's own dependency is the increment.
    cumulative = d(row.deficit);
    const incremental = Decimal.max(cumulative.minus(previousCumulative), 0);
    previousCumulative = cumulative;
    record({id: `financial.liquidity_coverage:${period.period}`, formula: "(openingCash + generation + contractedSources) / principal ; cumulative deficit = max(service - sources, 0) ; incremental = cumulative - previous cumulative", operands: {openingCash: row.openingCash, generation: generation ? out(generation) : "insufficient_evidence", contractedSources: out(contracted), principal: period.amount}, result: row.coverage ?? "n/a"}, "x");
    return {
      period: period.period, amount: out(d(period.amount)), opening_cash: row.openingCash, sources: row.sources, contracted_sources: out(contracted), debt_service: row.debtService, coverage: row.coverage, closing_cash: row.closingCash, incremental_deficit: out(incremental), cumulative_deficit: out(cumulative),
      rollover_dependency: incremental.gt(0) ? `${out(incremental)} of this period's principal depends on rollover or new debt (cumulative shortfall carried: ${out(cumulative)})` : cumulative.gt(0) ? `this period adds no new dependency; the carried shortfall of ${out(cumulative)} remains` : "covered by carried cash, declared generation and contracted sources",
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
    schema_version: "method.diagnose-maturity-wall.v3" as const, reference_date: input.referenceDate, unit: input.unit, state, block_reasons: blockReasons, incomplete_reasons: incompleteReasons,
    wall_threshold: input.wallThreshold, walls, peak,
    coverage: {cash_definition: input.cash.definition, cash: {value: out(cash), anchor: input.cash.anchor}, operating_generation: input.operatingGeneration ? {value: out(generation!), basis: input.operatingGeneration.basis, anchor: input.operatingGeneration.anchor} : null, by_period: byPeriod, cumulative_deficit: out(cumulative), caveat},
    sources, uncovered_terms: uncovered, notes,
  };
  const inputFingerprint = fingerprint(input);
  return {...body, trace: {calculations, inputFingerprint, outputFingerprint: fingerprint({...body, calculations, inputFingerprint})}};
}
