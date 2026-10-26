import {z} from "zod";
import {adoptedWeeklyCashOutputSchema, covenantHeadroomOutputSchema, weeklyCashOutputSchema} from "./ficha-calculation-results";

// The common adopted-result fields, taken from an existing adopted result so the shapes never drift.
const {schemaVersion: _s, analysisId: _a, perimeter: _p, weekly: _w, exclusions: _e, ...common} = adoptedWeeklyCashOutputSchema.shape;
const text = z.string().min(1).max(2000), decimal = z.string().regex(/^-?\d{1,24}(?:\.\d{1,20})?$/), version = z.string().min(1).max(160);
const date = z.iso.date(), hash = z.string().regex(/^[a-f0-9]{64}$/);
const week = z.strictObject({weekStart: date, closing: decimal});

export const quarterUpdateOutputSchema = z.strictObject({schemaVersion: z.literal("quarter-update.v1"), version, currency: z.string().regex(/^[A-Z]{3}$/),
  quarterStart: date, quarterEnd: date,
  lines: z.array(z.strictObject({id: version, label: text, unit: z.enum(["currency", "days", "ratio"]), projected: decimal, actual: decimal, deviation: decimal})).min(1).max(24),
  bridges: z.array(z.strictObject({lineId: version, label: text, projected: decimal, actual: decimal, deviation: decimal,
    causes: z.array(z.strictObject({id: version, label: text, amount: decimal, classification: z.enum(["calendar", "structural"]), until: date.nullable(),
      nature: z.enum(["flow", "balance"]).nullable(), basis: z.enum(["document", "interpretation"]), question: text.nullable(), equalsDeviationOf: version.nullable(), driverLineId: version.nullable()})).min(1).max(12),
    explained: decimal, residual: decimal})).min(2).max(8),
  propagation: z.array(z.strictObject({causeId: version, classification: z.enum(["calendar", "structural"]), nature: z.enum(["flow", "balance"]).nullable(), until: date.nullable(),
    streams: z.array(version).max(64), weeklyEffect: decimal.nullable(), fractionAhead: decimal.nullable(), ebitdaAhead: decimal.nullable(), cashAhead: decimal.nullable()})).max(96),
  weekly: z.strictObject({prior: weeklyCashOutputSchema, updated: weeklyCashOutputSchema,
    carriedOpening: z.strictObject({prior: decimal, deviation: decimal, updated: decimal}),
    tightest: z.strictObject({prior: week.extend({shortfallToMinimum: decimal}), updated: week.extend({shortfallToMinimum: decimal})}),
    closing: z.strictObject({prior: decimal, updated: decimal})}),
  action: z.strictObject({
    steps: z.array(z.strictObject({facilityId: version, mode: z.enum(["fixed", "residual"]), amount: decimal, limit: decimal, withinLimit: z.boolean(), caseId: version,
      source: text, minimum: week, covers: z.boolean()})).max(4),
    fullLimit: z.array(z.strictObject({facilityId: version, caseId: version, amount: decimal, minimum: week, covers: z.boolean()})).max(4),
    withinApproved: z.boolean(), covers: z.boolean().nullable()}),
  covenant: z.strictObject({measurementIds: z.array(version).min(1).max(8), prior: covenantHeadroomOutputSchema, updated: covenantHeadroomOutputSchema,
    carried: z.strictObject({ebitda: decimal, cash: decimal}),
    measurements: z.array(z.strictObject({id: version, label: text, scenario: text,
      effects: z.array(z.strictObject({causeId: version, nature: z.enum(["flow", "balance"]), fraction: decimal, ebitda: decimal, cash: decimal})).max(96),
      trailingEbitda: z.strictObject({prior: decimal, updated: decimal}), ratio: z.strictObject({prior: decimal.nullable(), updated: decimal.nullable()})})).min(1).max(8),
    measurementsNotUpdated: z.array(version).max(24), effectsNotUpdated: z.array(version).max(8)}),
  dependents: z.array(z.strictObject({id: version, label: text, kind: z.enum(["analysis", "plan", "material"]),
    status: z.enum(["updated", "affected_not_recomputed", "stale", "unchanged"]), movedBy: z.array(version).max(24),
    recomputedBy: z.enum(["weekly_cash", "covenant", "projection"]).nullable(),
    recomputedHorizon: z.strictObject({start: date, end: date, lines: z.array(version).max(24)}).nullable(), sentToThirdParties: z.literal(false)})).max(16),
  gaps: z.array(z.strictObject({item: text, reason: z.enum(["unexplained_residual", "structural_cause_not_in_weekly_cash", "structural_cause_weekly_effect_inconsistent",
    "structural_cause_question_missing", "affected_not_recomputed"])})).max(64)});

export const quarterUpdateExclusions = ["accounting_close", "cause_attribution", "financing_cost_comparison", "third_party_distribution", "credit_approval", "method_release"] as const;
/** The prior version an update reads, by identity: its basis, its result and whether it was complete. */
const priorReference = z.strictObject({analysisId: z.uuid(), basisFingerprint: hash, resultFingerprint: hash, complete: z.boolean()});
export const adoptedQuarterUpdateOutputSchema = z.strictObject({...common, schemaVersion: z.literal("adopted-quarter-update.v1"),
  analysisId: z.uuid(), perimeter: text, prior: z.strictObject({weeklyCash: priorReference, covenant: priorReference}),
  update: quarterUpdateOutputSchema.nullable(),
  covenantDefinitions: z.array(z.strictObject({limitId: version, definition: text.nullable()})).max(8),
  exclusions: z.array(z.enum(quarterUpdateExclusions)).length(6)
    .refine(v => v.join("|") === quarterUpdateExclusions.join("|"), "Exact exclusion ledger required")});
