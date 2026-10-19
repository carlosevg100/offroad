import {createHash} from "node:crypto";
import Decimal from "decimal.js";
import {z} from "zod";
import {financialCoreVersion, projectDebtCapacityAmount, type DebtCapacityInput} from "@offroad/financial-core";
import {adoptedDebtCapacityInputSchema, calculateAdoptedDebtCapacity} from "./adopted-debt-capacity";

export const debtCapacityPacketVersion = "2026.10.19-v1";
const Exact = Decimal.clone({precision: 60, rounding: Decimal.ROUND_HALF_UP});
const text = z.string().trim().min(1).max(2000), key = z.string().trim().min(1).max(160);
const decimal = z.string().regex(/^-?\d{1,30}(?:\.\d{1,40})?$/), hash = z.string().regex(/^[a-f0-9]{64}$/);
const fmt = (v: Decimal) => v.toDecimalPlaces(20).toFixed();
const roles = ["informed", "alternative"] as const;

/** One capacity question over one adopted basis: the schedule as informed and its alternatives
 * (phasing, another structure), each a complete adopted analysis. Limits name the adopted rules
 * that make each restriction, so the binding one is identified; nothing here supplies a number. */
export const debtCapacityPacketInputSchema = z.strictObject({
  schemaVersion: z.literal("debt-capacity-packet-input.v1"),
  question: text,
  cases: z.array(z.strictObject({
    id: key, role: z.enum(roles), label: text, changes: z.array(text).max(20),
    analysis: adoptedDebtCapacityInputSchema,
    limits: z.array(z.strictObject({id: key, label: text, ruleIds: z.array(z.uuid()).min(1).max(12)})).min(1).max(8),
  })).min(1).max(6),
}).superRefine((input, ctx) => {
  const fail = (message: string) => ctx.addIssue({code: "custom", message});
  if (input.cases.filter((c) => c.role === "informed").length !== 1) fail("Exactly one informed case is required");
  if (new Set(input.cases.map((c) => c.id)).size !== input.cases.length) fail("Duplicate case identity");
  if (new Set(input.cases.map((c) => c.analysis.analysisId)).size !== input.cases.length) fail("Each case needs its own adopted analysis");
  const first = input.cases[0]!.analysis;
  for (const c of input.cases) {
    const a = c.analysis;
    if (a.envelope.fingerprint !== first.envelope.fingerprint || a.scope.versionId !== first.scope.versionId || a.entityId !== first.entityId || a.currency !== first.currency)
      fail("All cases must read the same adopted basis, entity and currency");
    if (c.role === "informed" && c.changes.length) fail("The informed case declares no changes");
    if (c.role !== "informed" && !c.changes.length) fail("An alternative must say what it changes");
    const rules = new Set(a.scenarios.flatMap((s) => s.rules.map((r) => r.id)));
    const named = c.limits.flatMap((l) => l.ruleIds);
    if (named.some((r) => !rules.has(r))) fail("A limit names a rule the analysis does not carry");
    if (new Set(named).size !== named.length || named.length !== rules.size) fail("Every adopted rule belongs to exactly one limit");
  }
});
export type DebtCapacityPacketInput = z.infer<typeof debtCapacityPacketInputSchema>;

const extreme = z.strictObject({value: decimal, date: z.iso.date()});
const scenarioReading = z.strictObject({scenarioId: z.uuid(), peakLeverage: extreme, minimumCash: extreme, minimumInterestCoverage: extreme.nullable()});
const caseOutput = z.strictObject({
  caseId: key, role: z.enum(roles), label: text, changes: z.array(text).max(20), resultStatus: z.enum(["missing_inputs", "partial_composition"]),
  limits: z.array(z.strictObject({id: key, label: text, capacity: decimal.nullable(), status: key.nullable()})).max(8),
  /** The joint capacity: the largest amount that satisfies every adopted rule at once, as the engine
   * intersects them (never the smallest of the per-limit maxima, which can overstate it). */
  capacity: decimal.nullable(), capacityStatus: z.enum(["calculated", "calibration_only", "no_feasible_amount"]).nullable(),
  /** What stops the next quantum: the limit, the date and the scenario of the first failing check. */
  binding: z.strictObject({limitId: key, date: z.iso.date(), scenarioId: z.uuid()}).nullable(), bindingLimitId: key.nullable(),
  boundedBySearchDomain: z.boolean().nullable(), calibrationOnly: z.boolean().nullable(),
  review: z.strictObject({amount: decimal, fits: z.boolean(), failingLimitIds: z.array(key).max(8), scenarios: z.array(scenarioReading).max(4)}).nullable(),
  plan: z.array(z.strictObject({date: z.iso.date(), scheduledExistingPrincipal: decimal, cashAfterInterest: decimal, paysWithoutRefinancing: z.boolean()})).max(240).nullable(),
  gaps: z.array(z.strictObject({operand: text, reason: text})).max(1024),
});
export const debtCapacityPacketOutputSchema = z.strictObject({
  schemaVersion: z.literal("debt-capacity-packet.v1"), executorVersion: z.literal(debtCapacityPacketVersion), financialCoreVersion: key,
  question: text, basisFingerprint: hash, scope: adoptedDebtCapacityInputSchema.shape.scope, entityId: z.uuid(), currency: z.string().regex(/^[A-Z]{3}$/),
  cases: z.array(caseOutput).min(1).max(6),
  comparison: z.strictObject({informedCaseId: key, requestedFitsIn: z.array(key).max(6), largestCapacityCaseId: key.nullable()}),
  status: z.enum(["framed", "partial", "prepared_for_human_review"]),
  exclusions: z.array(z.enum(["credit_approval", "nonlinear_pricing", "intraperiod_cash_certification", "investment_return", "method_release"])).length(5)
    .refine((v) => v.join("|") === "credit_approval|nonlinear_pricing|intraperiod_cash_certification|investment_return|method_release", "Exact exclusion ledger required"),
  grantsExecution: z.literal(false), grantsPublication: z.literal(false), fingerprint: hash,
});
export type DebtCapacityPacket = z.infer<typeof debtCapacityPacketOutputSchema>;

type Row = {date: string; ebitda: string; covenantEbitda: string; cashInterest: string; cfads: string; closingAvailableCash: string; closingDebt: string};
const pick = (rows: Row[], value: (r: Row) => Decimal | null, lowest: boolean) => rows.reduce<{value: Decimal; date: string} | null>((m, r) => {
  const v = value(r); if (v === null) return m;
  return m === null || (lowest ? v.lt(m.value) : v.gt(m.value)) ? {value: v, date: r.date} : m;
}, null);

/** How much new debt fits and with what profile: the largest amount under each adopted limit and
 * the one that binds, for the schedule as informed and its alternatives; the requested amount
 * reviewed on peak leverage, minimum cash and interest coverage by date in every scenario; and
 * whether the existing plan's scheduled principal is paid by cash after interest without
 * refinancing. Deterministic; the investment's own return is a separate method. */
export function prepareDebtCapacityPacket(raw: unknown): DebtCapacityPacket {
  const input = debtCapacityPacketInputSchema.parse(raw);
  const cases = input.cases.map((c) => {
    const full = calculateAdoptedDebtCapacity(c.analysis);
    const limits = c.limits.map((l) => {
      const subset = {...c.analysis, scenarios: c.analysis.scenarios.map((s) => ({...s, rules: s.rules.filter((r) => l.ruleIds.includes(r.id))})).filter((s) => s.rules.length)};
      const r = calculateAdoptedDebtCapacity(subset) as {capacity: {maximumFeasibleAmount: string | null; status: string} | null};
      return {id: l.id, label: l.label, capacity: r.capacity?.maximumFeasibleAmount ?? null, status: r.capacity?.status ?? null};
    });
    const joint = full.capacity as {status: "calculated" | "calibration_only" | "no_feasible_amount"; maximumFeasibleAmount: string | null; boundedBySearchDomain: boolean;
      followingChecks: {ruleId: string; passed: boolean; date: string; scenarioId: string}[] | null} | null;
    const stop = joint?.followingChecks?.find((x) => !x.passed) ?? null;
    const limitOf = (ruleId: string) => c.limits.find((l) => l.ruleIds.includes(ruleId))!.id;
    const binding = stop ? {limitId: limitOf(stop.ruleId), date: stop.date, scenarioId: stop.scenarioId} : null;
    const profile = full.profile as DebtCapacityInput | null;
    const fixed = full.fixedReview as {amount: string; checks: {ruleId: string; passed: boolean}[]; financialRows: {scenarioId: string; rows: Row[]}[]} | null;
    const review = fixed ? {amount: fixed.amount, fits: fixed.checks.every((x) => x.passed),
      failingLimitIds: c.limits.filter((l) => fixed.checks.some((x) => !x.passed && l.ruleIds.includes(x.ruleId))).map((l) => l.id),
      scenarios: fixed.financialRows.map((s) => {
        const leverage = pick(s.rows, (r) => new Exact(r.covenantEbitda).gt(0) ? new Exact(r.closingDebt).minus(r.closingAvailableCash).div(r.covenantEbitda) : null, false)!;
        const cash = pick(s.rows, (r) => new Exact(r.closingAvailableCash), true)!;
        const coverage = pick(s.rows, (r) => new Exact(r.cashInterest).gt(0) ? new Exact(r.ebitda).div(r.cashInterest) : null, true);
        return {scenarioId: s.scenarioId, peakLeverage: {value: fmt(leverage.value), date: leverage.date}, minimumCash: {value: fmt(cash.value), date: cash.date},
          minimumInterestCoverage: coverage ? {value: fmt(coverage.value), date: coverage.date} : null};
      })} : null;
    // The plan as it stands, with no new debt: scheduled principal against cash after interest in the first scenario.
    const plan = profile ? (() => {
      const zero = projectDebtCapacityAmount(profile, "0"), s = profile.scenarios[0]!, rows = zero.financialRows[0]!.rows as Row[];
      return s.periods.map((p, i) => {
        const after = new Exact(rows[i]!.cfads).minus(rows[i]!.cashInterest);
        return {date: p.endDate, scheduledExistingPrincipal: fmt(new Exact(p.existingCashPrincipalPaid)), cashAfterInterest: fmt(after), paysWithoutRefinancing: after.gte(p.existingCashPrincipalPaid)};
      });
    })() : null;
    return {caseId: c.id, role: c.role, label: c.label, changes: c.changes, resultStatus: full.status, limits,
      capacity: joint?.maximumFeasibleAmount ?? null, capacityStatus: joint?.status ?? null, binding, bindingLimitId: binding?.limitId ?? null,
      boundedBySearchDomain: joint ? joint.boundedBySearchDomain : null, calibrationOnly: joint ? joint.status === "calibration_only" : null, review, plan, gaps: full.gaps};
  });
  const informed = cases.find((c) => c.role === "informed")!;
  const first = input.cases[0]!.analysis;
  const withCapacity = cases.filter((c) => c.capacity !== null);
  const status = informed.capacityStatus === null ? "framed" as const : cases.some((c) => c.gaps.length) ? "partial" as const : "prepared_for_human_review" as const;
  const payload = {schemaVersion: "debt-capacity-packet.v1" as const, executorVersion: debtCapacityPacketVersion, financialCoreVersion,
    question: input.question, basisFingerprint: first.envelope.fingerprint, scope: first.scope, entityId: first.entityId, currency: first.currency,
    cases, comparison: {informedCaseId: informed.caseId, requestedFitsIn: cases.filter((c) => c.review?.fits).map((c) => c.caseId),
      largestCapacityCaseId: withCapacity.length ? withCapacity.reduce((m, c) => (new Exact(c.capacity!).gt(m.capacity!) ? c : m)).caseId : null},
    status, exclusions: ["credit_approval", "nonlinear_pricing", "intraperiod_cash_certification", "investment_return", "method_release"] as const,
    grantsExecution: false as const, grantsPublication: false as const};
  return debtCapacityPacketOutputSchema.parse({...payload, fingerprint: createHash("sha256").update(JSON.stringify(payload)).digest("hex")});
}
