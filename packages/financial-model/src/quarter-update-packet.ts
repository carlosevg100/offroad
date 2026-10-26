import {createHash} from "node:crypto";
import Decimal from "decimal.js";
import {z} from "zod";
import {financialCoreVersion} from "@offroad/financial-core";
import {calculateAdoptedQuarterUpdate, quarterUpdateAnalysesSchema} from "./adopted-quarter-update";
import {adoptedQuarterUpdateOutputSchema} from "./quarter-update-results";

export const quarterUpdatePacketVersion = "2026.10.26-v1";
const Exact = Decimal.clone({precision: 60});
const text = z.string().trim().min(1).max(2000), key = z.string().trim().min(1).max(160);
const hash = z.string().regex(/^[a-f0-9]{64}$/), decimal = z.string().regex(/^-?\d{1,24}(?:\.\d{1,20})?$/);
const week = z.strictObject({weekStart: z.iso.date(), closing: decimal});
const beforeAfter = <T extends z.ZodType>(v: T) => z.strictObject({prior: v, updated: v});

/** One question after a quarter closes. The prior weekly cash and covenant test travel as they were
 * adopted; the close is its own basis. */
export const quarterUpdatePacketInputSchema = z.strictObject({
  schemaVersion: z.literal("quarter-update-packet-input.v1"),
  question: text,
  analysis: quarterUpdateAnalysesSchema,
});
export type QuarterUpdatePacketInput = z.infer<typeof quarterUpdatePacketInputSchema>;
const decisions = ["short_term_financing", "covenant_headroom", "third_party_material"] as const;
const packetExclusions = ["accounting_close", "cause_attribution", "financing_cost_comparison", "third_party_distribution", "credit_approval"] as const;

export const quarterUpdatePacketOutputSchema = z.strictObject({
  schemaVersion: z.literal("quarter-update-packet.v1"), executorVersion: z.literal(quarterUpdatePacketVersion), financialCoreVersion: key,
  question: text, basisFingerprint: hash, scope: quarterUpdateAnalysesSchema.shape.update.shape.scope, entityId: z.uuid(), currency: z.string().regex(/^[A-Z]{3}$/),
  result: adoptedQuarterUpdateOutputSchema,
  /** What the answer must say, in order: what changed, why, what persists, what it changes, the action, what did not change and the question. */
  readings: z.strictObject({
    deviations: z.array(z.strictObject({lineId: key, projected: decimal, actual: decimal, deviation: decimal})).max(24),
    bridges: z.array(z.strictObject({lineId: key, deviation: decimal, residual: decimal,
      causes: z.array(z.strictObject({id: key, label: text, amount: decimal, classification: z.enum(["calendar", "structural"]), until: z.iso.date().nullable()})).max(12)})).max(8),
    persisting: z.array(z.strictObject({causeId: key, until: z.iso.date(), nature: z.enum(["flow", "balance"]), weeklyEffect: decimal.nullable(), ebitdaAhead: decimal, cashAhead: decimal})).max(96),
    oneOff: z.array(key).max(96),
    /** A balance shift (receivable days) is already inside the closed cash and is carried once; it is never absorbed again ahead.
     * The ficha C54 oracle absorbs it a second time in the December test; this method does not. */
    balanceShiftsCarriedOnce: z.array(z.strictObject({causeId: key, amount: decimal})).max(96),
    tightestWeek: beforeAfter(week), shortfallToMinimum: beforeAfter(decimal), closingAtHorizon: beforeAfter(decimal),
    /** The facility that tops up the weeks: whether the need now exceeds its limit and where its whole limit leaves the tightest week. */
    topUp: z.strictObject({facilityId: key, limit: decimal, needExceedsLimit: z.boolean(), fullLimitMinimum: week, fullLimitCovers: z.boolean()}).nullable(),
    action: z.strictObject({steps: z.array(z.strictObject({facilityId: key, amount: decimal, limit: decimal, withinLimit: z.boolean()})).max(4),
      withinApproved: z.boolean(), covers: z.boolean().nullable(), minimumAfter: week.nullable()}),
    /** One reading per definition: the indenture's and, when the board adopted it, the managerial one; each headroom names the definition it is measured on. */
    covenant: z.strictObject({
      measurements: z.array(z.strictObject({measurementId: key, definitionRead: text, ratio: beforeAfter(decimal.nullable()), trailingEbitda: beforeAfter(decimal)})).max(8),
      headroom: z.array(z.strictObject({measurementId: key, definitionRead: text, limitId: key, kind: z.enum(["contractual", "board_policy"]), limitDefinition: text.nullable(),
        ebitdaHeadroom: beforeAfter(decimal), breached: z.boolean()})).max(16),
      anyBreach: z.boolean(), notUpdated: z.array(key).max(24)}),
    /** The year's EBITDA as the leading test reads it (the trailing twelve months at the test date). */
    projectedEbitda: beforeAfter(decimal),
    decisionsChanged: z.array(z.enum(decisions)).max(3),
    updated: z.array(key).max(16), unchanged: z.array(key).max(16), stale: z.array(key).max(16), affectedNotRecomputed: z.array(key).max(16),
    openQuestions: z.array(z.strictObject({causeId: key, question: text})).max(96),
    /** The prior versions are kept as adopted; this packet never sends a material to anyone. */
    priorVersionsKept: z.literal(true), sentToThirdParties: z.literal(false),
  }).nullable(),
  gaps: z.array(z.strictObject({operand: text, reason: text})).max(1024),
  status: z.enum(["framed", "partial", "prepared_for_human_review"]),
  exclusions: z.array(z.enum(packetExclusions)).length(5).refine((v) => v.join("|") === packetExclusions.join("|"), "Exact exclusion ledger required"),
  grantsExecution: z.literal(false), grantsPublication: z.literal(false), fingerprint: hash,
});
export type QuarterUpdatePacket = z.infer<typeof quarterUpdatePacketOutputSchema>;

/** What the closed quarter changed and what it changes ahead: actual against projected; EBITDA and
 * cash explained by cause to the exact deviation, the residual named; what is one-off and what persists
 * until a date; the weekly cash and the covenant test measured again on the prior versions, kept beside
 * the update; whether the need now exceeds the facility that tops up the weeks; the action within what
 * is approved; the covenant by each definition read, indenture and managerial, with the definition behind
 * each headroom; which dependents were updated, which did not change and which material is stale; and the
 * question that changes the diagnosis. A balance shift is carried once in the closed cash: unlike the ficha
 * C54 oracle, it is not absorbed again in the December test. Deterministic; it never sends a material to a
 * third party. */
export function prepareQuarterUpdatePacket(raw: unknown): QuarterUpdatePacket {
  const input = quarterUpdatePacketInputSchema.parse(raw);
  const result = adoptedQuarterUpdateOutputSchema.parse(calculateAdoptedQuarterUpdate(input.analysis));
  const u = result.update;
  const readings = u ? (() => {
    const causes = u.bridges.flatMap((b) => b.causes);
    const residualStep = u.action.steps.find((s) => s.mode === "residual"), full = u.action.fullLimit[0];
    const topUp = residualStep && full ? {facilityId: residualStep.facilityId, limit: residualStep.limit,
      needExceedsLimit: new Exact(u.weekly.tightest.updated.shortfallToMinimum).gt(residualStep.limit), fullLimitMinimum: full.minimum, fullLimitCovers: full.covers} : null;
    const definitions = new Map(result.covenantDefinitions.map((d) => [d.limitId, d.definition]));
    const headroom = u.covenant.measurements.flatMap((m) => {
      const before = u.covenant.prior.measurements.find((x) => x.id === m.id)!, after = u.covenant.updated.measurements.find((x) => x.id === m.id)!;
      return after.tests.map((t) => ({measurementId: m.id, definitionRead: m.label, limitId: t.limitId, kind: t.kind, limitDefinition: definitions.get(t.limitId) ?? null, breached: t.breached,
        ebitdaHeadroom: {prior: before.tests.find((x) => x.limitId === t.limitId)!.ebitdaHeadroom, updated: t.ebitdaHeadroom}}));
    });
    const lessHeadroom = headroom.some((h) => new Exact(h.ebitdaHeadroom.updated).lt(h.ebitdaHeadroom.prior));
    const needGrew = new Exact(u.weekly.tightest.updated.shortfallToMinimum).gt(u.weekly.tightest.prior.shortfallToMinimum);
    const by = (status: string) => u.dependents.filter((d) => d.status === status).map((d) => d.id);
    const last = u.action.steps[u.action.steps.length - 1];
    return {
      deviations: u.lines.map((l) => ({lineId: l.id, projected: l.projected, actual: l.actual, deviation: l.deviation})),
      bridges: u.bridges.map((b) => ({lineId: b.lineId, deviation: b.deviation, residual: b.residual,
        causes: b.causes.map((c) => ({id: c.id, label: c.label, amount: c.amount, classification: c.classification, until: c.until}))})),
      persisting: u.propagation.filter((p) => p.classification === "structural").map((p) => ({causeId: p.causeId, until: p.until!, nature: p.nature!,
        weeklyEffect: p.weeklyEffect, ebitdaAhead: p.ebitdaAhead!, cashAhead: p.cashAhead!})),
      balanceShiftsCarriedOnce: causes.filter((c) => c.nature === "balance").map((c) => ({causeId: c.id, amount: c.amount})),
      oneOff: causes.filter((c) => c.classification === "calendar").map((c) => c.id),
      tightestWeek: {prior: {weekStart: u.weekly.tightest.prior.weekStart, closing: u.weekly.tightest.prior.closing},
        updated: {weekStart: u.weekly.tightest.updated.weekStart, closing: u.weekly.tightest.updated.closing}},
      shortfallToMinimum: {prior: u.weekly.tightest.prior.shortfallToMinimum, updated: u.weekly.tightest.updated.shortfallToMinimum},
      closingAtHorizon: u.weekly.closing, topUp,
      action: {steps: u.action.steps.map((s) => ({facilityId: s.facilityId, amount: s.amount, limit: s.limit, withinLimit: s.withinLimit})),
        withinApproved: u.action.withinApproved, covers: u.action.covers, minimumAfter: last ? last.minimum : null},
      covenant: {measurements: u.covenant.measurements.map((m) => ({measurementId: m.id, definitionRead: m.label, ratio: m.ratio, trailingEbitda: m.trailingEbitda})),
        headroom, anyBreach: u.covenant.updated.anyBreach, notUpdated: u.covenant.measurementsNotUpdated},
      projectedEbitda: u.covenant.measurements[0]!.trailingEbitda,
      // A decision changes when the need grows, the headroom shrinks or a material sent before the close no longer carries the closed figures.
      decisionsChanged: [...needGrew ? ["short_term_financing" as const] : [], ...lessHeadroom ? ["covenant_headroom" as const] : [], ...by("stale").length ? ["third_party_material" as const] : []],
      updated: by("updated"), unchanged: by("unchanged"), stale: by("stale"), affectedNotRecomputed: by("affected_not_recomputed"),
      openQuestions: causes.filter((c) => c.question !== null).map((c) => ({causeId: c.id, question: c.question!})),
      priorVersionsKept: true as const, sentToThirdParties: false as const,
    };
  })() : null;
  const gaps = [...result.gaps, ...(u?.gaps ?? []).map((g) => ({operand: `quarter_update.${result.analysisId}.${g.item}`, reason: g.reason}))];
  const status = !u ? "framed" as const : gaps.length ? "partial" as const : "prepared_for_human_review" as const;
  const payload = {schemaVersion: "quarter-update-packet.v1" as const, executorVersion: quarterUpdatePacketVersion, financialCoreVersion,
    question: input.question, basisFingerprint: result.basisFingerprint, scope: result.scope, entityId: result.entityId, currency: result.currency,
    result, readings, gaps, status, exclusions: packetExclusions, grantsExecution: false as const, grantsPublication: false as const};
  return quarterUpdatePacketOutputSchema.parse({...payload, fingerprint: createHash("sha256").update(JSON.stringify(payload)).digest("hex")});
}
