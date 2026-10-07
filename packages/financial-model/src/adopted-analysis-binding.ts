import {z} from "zod";
import {readContextualBasis, type AdoptionBasisEntry} from "@offroad/reconciliation";
import {adoptedDebtLiquidityInputSchema, adoptedValueSelectionSchema} from "./adopted-debt-inputs";
import {resolveAdoptedCurrencyValues} from "./adopted-numeric-representation";
import {hasUnitScale} from "./adopted-input-scale";

const base = adoptedDebtLiquidityInputSchema.shape;
export const adoptedAnalysisContextSchema = z.strictObject({envelope: base.envelope, scope: base.scope,
  entityId: base.entityId, perimeter: base.perimeter, currency: base.currency,
  openingDate: base.openingDate, endDate: base.endDate, numericInterpretations: base.numericInterpretations});
export type AnalysisContext = z.infer<typeof adoptedAnalysisContextSchema>;
export type AnalysisSelection = z.infer<typeof adoptedValueSelectionSchema>;
export const analysisAmount = z.string().regex(/^-?\d{1,24}(?:\.\d{1,20})?$/);
export const analysisReference = z.string().trim().min(1).max(160);

/** Internal binding for the two new analysis adapters. Unit/path/scenario are supplied by
 * build-owned code, never a user's mapping. This verifies integrity, not access: obtain the
 * immutable envelope from the SQL reader after checking current source and work rights. */
export function createAnalysisBinding(input: AnalysisContext, monetarySelections: AnalysisSelection[]) {
  const basis = readContextualBasis(input.envelope, input.scope);
  const entries = new Map(basis.entries.map(e => [e.decisionId, e]));
  const ids = monetarySelections.flatMap(s => s.decisionId ? [s.decisionId] : []);
  if (new Set(ids).size !== ids.length) throw new Error("analysis_reused_monetary_contribution");
  const normalization = ids.length ? resolveAdoptedCurrencyValues({envelope: input.envelope, scope: input.scope,
    decisionIds: ids, groups: input.numericInterpretations}) : null;
  const normalized = new Map(normalization?.values.map(v => [v.decisionId, v]) ?? []);
  const used = new Map<string, AdoptionBasisEntry>(), selected = new Set<string>(), observations = new Set<string>();
  const gaps: {operand: string; reason: string}[] = [];
  const bindings: {operand: string; decisionId: string | null; interpretationDecisionIds: string[]}[] = [];
  function read<T>(s: AnalysisSelection, path: string, scenario: string, unit: string,
    type: "number" | "text" | "date" | "boolean" | "list", schema: z.ZodType<T>): T | null {
    const n = s.decisionId ? normalized.get(s.decisionId) : undefined;
    bindings.push({operand: path, decisionId: s.decisionId, interpretationDecisionIds: n?.interpretationDecisionIds ?? []});
    if (!s.decisionId) {gaps.push({operand: path, reason: s.missingReason!}); return null;}
    const e = entries.get(s.decisionId), d = e?.dimensions;
    if (!e || selected.has(e.decisionId) || (e.observationId && observations.has(e.observationId))) throw new Error("analysis_missing_or_reused_contribution");
    if (e.fieldPath !== path || e.value.type !== type || e.definitionKind !== s.definitionKind
      || d!.definitionVersionId !== s.definitionVersionId || d!.entityId !== input.entityId || d!.perimeter !== input.perimeter
      || d!.currency !== input.currency || d!.unit !== unit || d!.scenario !== scenario
      || d!.periodStart !== input.openingDate || d!.periodEnd !== input.endDate
      || (unit !== "currency" && !hasUnitScale(d!.scale))) throw new Error("analysis_basis_context_mismatch");
    selected.add(e.decisionId); used.set(e.decisionId, e); if (e.observationId) observations.add(e.observationId);
    if (unit === "currency") {
      if (!n?.trace) {gaps.push({operand: path, reason: "Numeric representation has not been adopted"}); return null;}
      n.interpretationDecisionIds.forEach(id => used.set(id, entries.get(id)!));
      return schema.parse(type === "number" ? n.trace.values[0] : n.trace.values);
    }
    return schema.parse(e.value.value);
  }
  return {read, gaps, bindings, normalization, used};
}
