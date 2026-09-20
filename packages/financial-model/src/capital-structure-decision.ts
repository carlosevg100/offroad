import {hasUnitScale} from "./adopted-input-scale";
import {createHash} from "node:crypto";
import {z} from "zod";
import {readContextualBasis, type AdoptionBasisEntry} from "@offroad/reconciliation";

export const capitalStructureComparisonVersion = "2026.09.20-v2";
const text = z.string().trim().min(1).max(2000);
const key = z.string().trim().min(1).max(160);
const scopeSchema = z.strictObject({workId: z.uuid(), purpose: text, versionId: z.uuid()});
const metricSchema = z.strictObject({
  id: key, label: text, fieldPath: text,
  definitionVersionId: z.uuid(), definitionKind: z.enum(["reported", "managerial", "contractual"]),
  unit: key, currency: z.string().regex(/^[A-Z]{3}$/).nullable(),
  periodStart: z.iso.date().nullable(), periodEnd: z.iso.date(),
  temporalKind: z.enum(["stock", "flow"]),
}).superRefine((m, ctx) => {
  if ((m.temporalKind === "flow") !== (m.periodStart !== null)) ctx.addIssue({code: "custom", message: "Declare a flow interval or a stock date"});
  if (m.periodStart && m.periodStart > m.periodEnd) ctx.addIssue({code: "custom", message: "Invalid metric interval"});
  if (!m.currency && !["ratio", "percent", "percentage", "count", "days", "months", "years"].includes(m.unit)) ctx.addIssue({code: "custom", message: "Monetary metric requires currency"});
});

/** Domain preparation only: neither a release manifest nor an authorization envelope.
 * Obtain the basis through the authorized SQL reader before calling this pure function.
 */
export const capitalStructureDecisionInputSchema = z.strictObject({
  schemaVersion: z.literal("capital-structure-comparison-input.v1"),
  workId: z.uuid(), question: text, purpose: text,
  entityId: z.uuid().nullable(), perimeter: text.nullable(),
  horizon: z.strictObject({start: z.iso.date(), end: z.iso.date()}),
  objectives: z.array(text).min(1).max(30),
  basis: z.strictObject({scope: scopeSchema, envelope: z.strictObject({canonical: z.string().min(2).max(1048576), fingerprint: z.string().regex(/^[a-f0-9]{64}$/)})}).nullable(),
  metrics: z.array(metricSchema).max(64),
  alternatives: z.array(z.strictObject({
    id: key, label: text, kind: z.enum(["maintain", "change", "defer", "no_financing"]),
    scenario: key,
    selections: z.array(z.strictObject({metricId: key, decisionId: z.uuid().nullable(), missingReason: text.nullable()})).max(64),
    tradeoffs: z.array(z.strictObject({description: text, basisDecisionIds: z.array(z.uuid()).max(64), classification: z.enum(["judgment", "condition"])})).max(30),
  })).max(20),
  /** Excluding the current structure requires an explicit, reviewable judgment. */
  maintenanceExclusion: z.strictObject({reason: text, basisDecisionIds: z.array(z.uuid()).max(64)}).nullable(),
  /** This increment carries constraints, but does not certify covenant compliance. */
  constraints: z.array(z.strictObject({id: key, kind: z.enum(["contractual", "house", "user"]), description: text, definitionVersionId: z.uuid().nullable(), alternativeIds: z.array(key).min(1).max(20)})).max(64),
}).superRefine((input, ctx) => {
  const fail = (message: string) => ctx.addIssue({code: "custom", message});
  if (input.horizon.start > input.horizon.end) fail("Invalid decision horizon");
  for (const rows of [input.metrics, input.alternatives, input.constraints]) if (new Set(rows.map(r => r.id)).size !== rows.length) fail("Duplicate comparison identity");
  for (const metric of input.metrics) if ((metric.periodStart ?? metric.periodEnd) < input.horizon.start || metric.periodEnd > input.horizon.end) fail("Metric outside decision horizon");
  const metricIds = new Set(input.metrics.map(m => m.id));
  for (const alt of input.alternatives) {
    if (new Set(alt.selections.map(s => s.metricId)).size !== alt.selections.length) fail("Duplicate metric selection");
    for (const selection of alt.selections) {
      if (!metricIds.has(selection.metricId)) fail("Unknown metric selection");
      if ((selection.decisionId === null) !== (selection.missingReason !== null)) fail("Select a contribution or explain its absence");
    }
  }
  const maintained = input.alternatives.filter(a => a.kind === "maintain").length;
  if (maintained > 1 || (maintained > 0 && input.maintenanceExclusion)) fail("Ambiguous current structure");
  for (const constraint of input.constraints) {
    if (constraint.kind === "contractual" && !constraint.definitionVersionId) fail("Contractual constraint requires its definition version");
    if (new Set(constraint.alternativeIds).size !== constraint.alternativeIds.length || constraint.alternativeIds.some(id => !input.alternatives.some(a => a.id === id))) fail("Unknown or duplicate constraint alternative");
  }
});
export type CapitalStructureDecisionInput = z.infer<typeof capitalStructureDecisionInputSchema>;
type ComparisonGap = {code: string; alternativeId: string | null; metricId: string | null; reason: string};

export function prepareCapitalStructureComparison(raw: unknown) {
  const input = capitalStructureDecisionInputSchema.parse(raw);
  if (input.basis && (input.basis.scope.workId !== input.workId || input.basis.scope.purpose !== input.purpose)) throw new Error("capital_comparison_basis_scope_mismatch");
  const basis = input.basis ? readContextualBasis(input.basis.envelope, input.basis.scope) : null;
  const entries = new Map((basis?.entries ?? []).map(entry => [entry.decisionId, entry]));
  const used = new Map<string, AdoptionBasisEntry>();
  const requireEntry = (id: string) => {
    const entry = entries.get(id);
    if (!entry) throw new Error("capital_comparison_contribution_missing");
    // Every referenced contribution remains in the requested entity/perimeter.
    if (entry.dimensions.entityId !== input.entityId || entry.dimensions.perimeter !== input.perimeter) throw new Error("capital_comparison_context_mismatch");
    used.set(id, entry);
    return entry;
  };
  const gaps: ComparisonGap[] = [];
  const gap = (code: string, reason: string, alternativeId: string | null = null, metricId: string | null = null) => gaps.push({code, reason, alternativeId, metricId});
  if (!input.entityId || !input.perimeter) gap("context_required", "Entity and perimeter are required for a numerical comparison");
  if (!basis) gap("basis_required", "No immutable working basis was selected");
  if (!input.metrics.length) gap("metrics_required", "Comparable decision metrics have not been specified");
  if (input.alternatives.length < 2) gap("alternatives_required", "A comparison requires at least two explicit alternatives");
  if (!input.alternatives.some(a => a.kind === "maintain") && !input.maintenanceExclusion) gap("current_structure_required", "Include the current structure or explain why it is not applicable");
  input.maintenanceExclusion?.basisDecisionIds.forEach(requireEntry);
  const alternatives = input.alternatives.map(alt => {
    const values = input.metrics.map(metric => {
      const selection = alt.selections.find(s => s.metricId === metric.id);
      if (!selection?.decisionId) {
        const reason = selection?.missingReason ?? "No contribution selected for this metric";
        gap("metric_input_required", reason, alt.id, metric.id);
        return {metricId: metric.id, value: null, decisionId: null, kind: null, missingReason: reason};
      }
      const entry = requireEntry(selection.decisionId);
      const dimensions = entry.dimensions;
      if (entry.value.type !== "number" || entry.fieldPath !== metric.fieldPath || entry.definitionKind !== metric.definitionKind
        || dimensions.definitionVersionId !== metric.definitionVersionId || dimensions.scenario !== alt.scenario
        || dimensions.periodStart !== metric.periodStart || dimensions.periodEnd !== metric.periodEnd
        || dimensions.currency !== metric.currency || dimensions.unit !== metric.unit || !hasUnitScale(dimensions.scale)) throw new Error("capital_comparison_metric_mismatch");
      // The reader preserves assertions. Require declared unit scale instead of guessing normalization.
      return {metricId: metric.id, value: entry.value.value, decisionId: entry.decisionId, kind: entry.kind, missingReason: null};
    });
    alt.tradeoffs.forEach(t => t.basisDecisionIds.forEach(requireEntry));
    return {id: alt.id, label: alt.label, kind: alt.kind, scenario: alt.scenario, values, tradeoffs: alt.tradeoffs};
  });
  for (const constraint of input.constraints) gap("constraint_evaluation_required", constraint.description);
  const payload = {
    schemaVersion: "capital-structure-comparison.v1" as const,
    contractVersion: capitalStructureComparisonVersion,
    status: !used.size ? "framed" as const : gaps.length ? "partial" as const : "basis_comparable" as const,
    scope: {workId: input.workId, purpose: input.purpose, entityId: input.entityId, perimeter: input.perimeter},
    question: input.question, horizon: input.horizon, objectives: input.objectives,
    basis: basis ? {versionId: basis.versionId, fingerprint: input.basis!.envelope.fingerprint} : null,
    metrics: input.metrics, alternatives, maintenanceExclusion: input.maintenanceExclusion,
    constraints: input.constraints.map(constraint => ({...constraint, evaluation: "pending" as const})),
    contributions: [...used.values()], gaps,
    /** Comparable selected inputs do not constitute a financing recommendation or a cash forecast. */
    recommendation: null, calculationTraces: [], grantsExecution: false as const,
  };
  return {...payload, fingerprint: createHash("sha256").update(JSON.stringify(payload)).digest("hex")};
}
