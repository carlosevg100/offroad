import {createHash} from "node:crypto";
import {z} from "zod";
import {evaluateDefinedRatio, financialCoreVersion} from "@offroad/financial-core";
import {readContextualBasis, type AdoptionBasisEntry} from "@offroad/reconciliation";
import {adoptedDebtLiquidityInputSchema, adoptedValueSelectionSchema as selection} from "./adopted-debt-inputs";
import {resolveAdoptedCurrencyValues} from "./adopted-numeric-representation";
import {hasUnitScale} from "./adopted-input-scale";

const shape = adoptedDebtLiquidityInputSchema.shape;
const operand = z.strictObject({selection, periodStart: z.iso.date().nullable()});
export const adoptedDefinedRatioInputSchema = z.strictObject({
  envelope: shape.envelope, scope: shape.scope, entityId: shape.entityId, perimeter: shape.perimeter,
  currency: shape.currency, scenario: shape.scenario, measurementDate: z.iso.date(),
  ratioId: z.string().regex(/^[a-z][a-z0-9_]{0,79}$/),
  definitionKind: z.enum(["managerial", "contractual"]),
  numerator: operand, denominator: operand, limit: selection, comparator: selection, convention: selection,
  numericInterpretations: shape.numericInterpretations,
}).superRefine((i, c) => {
  if ([i.numerator, i.denominator].some(o => o.periodStart && o.periodStart > i.measurementDate)) c.addIssue({code: "custom", message: "Invalid ratio period"});
  if ([i.numerator.selection, i.denominator.selection, i.limit, i.comparator, i.convention].some(s => s.definitionKind !== i.definitionKind)) c.addIssue({code: "custom", message: "Do not relabel managerial inputs as contractual definitions"});
});

/** Evaluates adopted, already-defined monetary numerator/denominator. It does not invent
 * the components of net debt, EBITDA or CFADS. Obtain the envelope through an authorized
 * reader; definitions and observations remain dependencies, never permissions. */
export function calculateAdoptedDefinedRatio(raw: unknown) {
  const input = adoptedDefinedRatioInputSchema.parse(raw);
  const basis = readContextualBasis(input.envelope, input.scope);
  const entries = new Map(basis.entries.map(e => [e.decisionId, e]));
  const used = new Map<string, AdoptionBasisEntry>(); const observed = new Set<string>();
  const gaps: {operand: string; reason: string}[] = [];
  const moneyIds = [input.numerator.selection, input.denominator.selection].flatMap(s => s.decisionId ? [s.decisionId] : []);
  if (new Set(moneyIds).size !== moneyIds.length) throw new Error("defined_ratio_reused_contribution");
  const normalized = moneyIds.length ? resolveAdoptedCurrencyValues({envelope: input.envelope, scope: input.scope, decisionIds: moneyIds, groups: input.numericInterpretations}) : null;
  const numbers = new Map(normalized?.values.map(v => [v.decisionId, v]) ?? []);
  const bindings: {operand: string; decisionId: string | null; definitionVersionId: string; interpretationDecisionIds: string[]}[] = [];
  function read<T>(s: z.infer<typeof selection>, field: string, unit: string, type: "number" | "text", start: string | null, schema: z.ZodType<T>): T | null {
    const path = `defined_ratio.${input.ratioId}.${field}`;
    const n = s.decisionId ? numbers.get(s.decisionId) : undefined;
    bindings.push({operand: field, decisionId: s.decisionId, definitionVersionId: s.definitionVersionId, interpretationDecisionIds: n?.interpretationDecisionIds ?? []});
    if (!s.decisionId) {gaps.push({operand: field, reason: s.missingReason!}); return null;}
    const e = entries.get(s.decisionId); const d = e?.dimensions;
    if (!e || used.has(e.decisionId) || (e.observationId && observed.has(e.observationId))) throw new Error("defined_ratio_reused_or_missing_contribution");
    if (e.fieldPath !== path || e.definitionKind !== input.definitionKind || e.value.type !== type
      || d!.definitionVersionId !== s.definitionVersionId || d!.entityId !== input.entityId || d!.perimeter !== input.perimeter
      || d!.currency !== (unit === "currency" ? input.currency : null) || d!.unit !== unit || d!.scenario !== input.scenario
      || d!.periodStart !== start || d!.periodEnd !== input.measurementDate
      || (unit !== "currency" && !hasUnitScale(d!.scale))) throw new Error("defined_ratio_context_mismatch");
    used.set(e.decisionId, e); if (e.observationId) observed.add(e.observationId);
    if (unit === "currency") {
      if (!n?.trace) {gaps.push({operand: field, reason: "Numeric representation has not been adopted"}); return null;}
      n.interpretationDecisionIds.forEach(id => used.set(id, entries.get(id)!));
      return schema.parse(n.trace.values[0]);
    }
    return schema.parse(e.value.value);
  }
  const decimal = z.string().regex(/^-?\d{1,24}(?:\.\d{1,12})?$/);
  const numerator = read(input.numerator.selection, "numerator", "currency", "number", input.numerator.periodStart, decimal);
  const denominator = read(input.denominator.selection, "denominator", "currency", "number", input.denominator.periodStart, decimal);
  const limit = read(input.limit, "limit", "ratio", "number", null, decimal);
  const comparator = read(input.comparator, "comparator", "convention", "text", null, z.enum(["lt", "lte", "gt", "gte"]));
  const convention = read(input.convention, "convention", "convention", "text", null, z.literal("positive_denominator_unrounded_comparison"));
  const calculation = !gaps.length && comparator && convention ? evaluateDefinedRatio({numerator, denominator, limit, comparator, convention}) : null;
  if (calculation?.status === "nonpositive_denominator") gaps.push({operand: "denominator", reason: "Nonpositive denominator does not support this defined ratio convention"});
  const payload = {schemaVersion: "adopted-defined-ratio.v1" as const, financialCoreVersion,
    scope: input.scope, entityId: input.entityId, perimeter: input.perimeter, currency: input.currency,
    scenario: input.scenario, measurementDate: input.measurementDate, ratioId: input.ratioId,
    definitionKind: input.definitionKind, basisFingerprint: input.envelope.fingerprint,
    status: calculation?.status === "calculated" ? "defined_boundary_calculated" as const : "missing_or_incompatible_inputs" as const,
    calculation, gaps, bindings, contributions: [...used.values()], normalization: normalized,
    classification: [...used.values()].some(e => e.kind === "hypothesis") ? "working_hypothesis" as const : "working_selection" as const,
    derivedDependencies: [...used.keys()], certifiesContractualCompliance: false as const,
    pendingReviews: ["definition_components_and_source", "measurement_applicability", "contractual_rounding", "waiver_cure_and_legal_effects"] as const,
    grantsExecution: false as const};
  return {...payload, fingerprint: createHash("sha256").update(JSON.stringify(payload)).digest("hex")};
}
