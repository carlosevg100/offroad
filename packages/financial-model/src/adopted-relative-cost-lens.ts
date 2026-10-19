import Decimal from "decimal.js";
import {z} from "zod";
import {readContextualBasis, type AdoptionBasisEntry} from "@offroad/reconciliation";
import {adoptedValueSelectionSchema as selection} from "./adopted-debt-inputs";
import {adoptedRelativeDebtCostInputSchema} from "./adopted-relative-debt-cost";
import {hasUnitScale} from "./adopted-input-scale";

const Exact = Decimal.clone({precision: 60, rounding: Decimal.ROUND_HALF_UP});
const decimal = z.string().regex(/^-?\d{1,24}(?:\.\d{1,20})?$/);
const text = z.string().trim().min(1).max(400);
const fmt = (v: Decimal) => v.toDecimalPlaces(20).toFixed();
export const relativeCostLensVersion = "2026.10.19-v1";
const shape = adoptedRelativeDebtCostInputSchema.shape;

/** A committee indicator for both companies. A numeric row compares values under one adopted
 * definition and direction; a qualitative row (a rating, a concentration measured on different
 * client counts, a credit history) carries the classification a person adopted, with origin. */
const lensRow = z.discriminatedUnion("kind", [
  z.strictObject({id: z.uuid(), kind: z.literal("numeric"), label: selection, definition: selection, unit: z.enum(["ratio", "multiple", "currency"]),
    own: selection, peer: selection, direction: selection}),
  z.strictObject({id: z.uuid(), kind: z.literal("qualitative"), label: selection, own: selection, peer: selection, classification: selection}),
]);
export const adoptedRelativeCostLensInputSchema = z.strictObject({
  envelope: shape.envelope, scope: shape.scope, entityId: shape.entityId, peerEntityId: shape.peerEntityId, perimeter: shape.perimeter, peerPerimeter: shape.peerPerimeter,
  currency: shape.currency, scenario: shape.scenario, openingDate: shape.openingDate, endDate: shape.endDate, comparisonId: shape.comparisonId,
  rows: z.array(lensRow).min(1).max(24),
  /** Relative difference above which a worse indicator weighs against; below it, it weighs little. */
  materialityThreshold: selection,
  /** Market value of one rating notch in basis points, low and high, and the peer's published rating. */
  notch: z.strictObject({bpsLow: selection, bpsHigh: selection, peerRating: selection}),
}).refine((i) => new Set(i.rows.map((r) => r.id)).size === i.rows.length, "Duplicate lens row");
export type AdoptedRelativeCostLensInput = z.infer<typeof adoptedRelativeCostLensInputSchema>;
const classes = ["weighs_against", "weighs_little", "neutral", "favours"] as const;

/** Reads the committee lens from the same adopted basis as the spread bridge and classifies each
 * numeric indicator by the adopted direction and materiality; qualitative rows keep the adopted
 * judgment. It translates the credit residual into rating notches only as a reading against the
 * adopted market value of a notch; it never assigns a rating. */
export function readAdoptedRelativeCostLens(raw: unknown, residualBps: string | null) {
  const input = adoptedRelativeCostLensInputSchema.parse(raw);
  const basis = readContextualBasis(input.envelope, input.scope);
  const entries = new Map(basis.entries.map((e) => [e.decisionId, e]));
  const used = new Map<string, AdoptionBasisEntry>(), gaps: {operand: string; reason: string}[] = [];
  const prefix = `relative_cost.${input.comparisonId}.lens.`;
  function read<T>(s: z.infer<typeof selection>, name: string, unit: string, type: "number" | "text", schema: z.ZodType<T>, peer = false): T | null {
    const path = prefix + name;
    if (!s.decisionId) {gaps.push({operand: path, reason: s.missingReason!}); return null;}
    const e = entries.get(s.decisionId), d = e?.dimensions;
    if (!e || used.has(e.decisionId)) throw new Error("relative_cost_lens_missing_or_reused_contribution");
    if (e.fieldPath !== path || e.value.type !== type || e.definitionKind !== s.definitionKind || d!.definitionVersionId !== s.definitionVersionId
      || d!.entityId !== (peer ? input.peerEntityId : input.entityId) || d!.perimeter !== (peer ? input.peerPerimeter : input.perimeter)
      || d!.currency !== input.currency || d!.scenario !== input.scenario || d!.unit !== unit || d!.periodStart !== input.openingDate
      || d!.periodEnd !== input.endDate || !hasUnitScale(d!.scale)) throw new Error("relative_cost_lens_context_mismatch");
    used.set(e.decisionId, e);
    return schema.parse(e.value.value);
  }
  const threshold = read(input.materialityThreshold, "materialityThreshold", "ratio", "number", decimal);
  const rows = input.rows.map((r) => {
    const p = `${r.id}.`;
    const label = read(r.label, p + "label", "explanation", "text", text);
    if (r.kind === "qualitative") {
      const own = read(r.own, p + "own", "explanation", "text", text), peer = read(r.peer, p + "peer", "explanation", "text", text, true);
      const classification = read(r.classification, p + "classification", "convention", "text", z.enum(classes));
      return {id: r.id, kind: r.kind, label, own, peer, definition: null, relativeDifference: null, classification, classificationBasis: "adopted_judgment" as const};
    }
    const definition = read(r.definition, p + "definition", "explanation", "text", text);
    const own = read(r.own, p + "own", r.unit, "number", decimal), peer = read(r.peer, p + "peer", r.unit, "number", decimal, true);
    const direction = read(r.direction, p + "direction", "convention", "text", z.enum(["higher_is_better", "higher_is_worse"]));
    if (own === null || peer === null || direction === null || threshold === null)
      return {id: r.id, kind: r.kind, label, own, peer, definition, relativeDifference: null, classification: null, classificationBasis: "calculated" as const};
    const base = new Exact(peer).abs();
    if (base.isZero()) throw new Error("relative_cost_lens_zero_reference");
    // Positive means the company is worse than the peer on this indicator.
    const worse = (direction === "higher_is_better" ? new Exact(peer).minus(own) : new Exact(own).minus(peer)).div(base);
    const classification = worse.isZero() ? "neutral" as const : worse.lt(0) ? "favours" as const : worse.gt(threshold) ? "weighs_against" as const : "weighs_little" as const;
    return {id: r.id, kind: r.kind, label, own, peer, definition, relativeDifference: fmt(worse), classification, classificationBasis: "calculated" as const};
  });
  const low = read(input.notch.bpsLow, "notch.bpsLow", "basis_points", "number", decimal), high = read(input.notch.bpsHigh, "notch.bpsHigh", "basis_points", "number", decimal);
  const peerRating = read(input.notch.peerRating, "notch.peerRating", "explanation", "text", text, true);
  if (low !== null && high !== null && (!new Exact(low).gt(0) || new Exact(high).lt(low))) throw new Error("relative_cost_lens_notch_range");
  const notches = residualBps !== null && low !== null && high !== null
    ? {fewest: fmt(new Exact(residualBps).div(high)), most: fmt(new Exact(residualBps).div(low)), bpsPerNotch: {low, high}, peerRating, readingOnly: true as const} : null;
  return {schemaVersion: "relative-cost-lens.v1" as const, version: relativeCostLensVersion, rows, materialityThreshold: threshold, impliedNotches: notches,
    notDrivers: rows.filter((r) => r.classification === "neutral").map((r) => r.id), gaps, contributions: [...used.values()],
    creditRating: null, causalAttribution: false as const};
}
