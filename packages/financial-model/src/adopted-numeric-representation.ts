import {createHash} from "node:crypto";
import {z} from "zod";
import {normalizeCurrencyRepresentation, type NumericRepresentation} from "@offroad/financial-core";
import {readContextualBasis, type AdoptionBasisEntry} from "@offroad/reconciliation";
import {hasUnitScale} from "./adopted-input-scale";

const selection = z.strictObject({decisionId: z.uuid(), definitionVersionId: z.uuid(), definitionKind: z.enum(["reported", "managerial", "contractual"])});
export const numericInterpretationGroupSchema = z.strictObject({
  id: z.uuid(), mode: selection, members: selection,
});
export const adoptedNumericRepresentationInputSchema = z.strictObject({
  envelope: z.strictObject({canonical: z.string().min(2).max(1048576), fingerprint: z.string().regex(/^[a-f0-9]{64}$/)}),
  scope: z.strictObject({workId: z.uuid(), purpose: z.string().min(3).max(300), versionId: z.uuid()}),
  decisionIds: z.array(z.uuid()).min(1).max(256),
  groups: z.array(numericInterpretationGroupSchema).max(64),
}).refine(i => new Set(i.decisionIds).size === i.decisionIds.length && new Set(i.groups.map(g => g.id)).size === i.groups.length, "Duplicate numeric selection or interpretation group");

/** A batch interpretation is itself adopted, not a caller flag or text from a document.
 * Two typed contributions record its mode and exact immutable member contribution IDs.
 * It can cover an explicitly named set of cells/series without requiring manual conversion
 * of each number. This validates integrity only; use the authorized SQL basis reader first.
 */
export function resolveAdoptedCurrencyValues(raw: unknown) {
  const input = adoptedNumericRepresentationInputSchema.parse(raw);
  const basis = readContextualBasis(input.envelope, input.scope);
  const entries = new Map(basis.entries.map(e => [e.decisionId, e]));
  const used = new Map<string, AdoptionBasisEntry>();
  const groups = new Map<string, {mode: NumericRepresentation; contributions: AdoptionBasisEntry[]}>();
  const groupContributions = new Set<string>();
  for (const group of input.groups) {
    function read(selection: z.infer<typeof numericInterpretationGroupSchema>["mode"], field: "mode" | "members") {
      const entry = entries.get(selection.decisionId);
      if (!entry || groupContributions.has(entry.decisionId) || entry.fieldPath !== `numeric_representation.${group.id}.${field}`
        || entry.definitionKind !== selection.definitionKind || entry.dimensions.definitionVersionId !== selection.definitionVersionId
        || entry.dimensions.unit !== (field === "mode" ? "convention" : "contribution_ids") || !hasUnitScale(entry.dimensions.scale)) throw new Error("numeric_interpretation_contribution_mismatch");
      groupContributions.add(entry.decisionId); return entry;
    }
    const mode = read(group.mode, "mode"); const members = read(group.members, "members");
    for (const dimension of ["entityId", "perimeter", "currency", "scenario", "periodStart", "periodEnd"] as const) {
      if (mode.dimensions[dimension] !== members.dimensions[dimension]) throw new Error("numeric_interpretation_context_mismatch");
    }
    if (!mode.dimensions.currency || !mode.dimensions.periodStart || mode.value.type !== "text" || members.value.type !== "list") throw new Error("numeric_interpretation_typed_values_required");
    const representation = z.enum(["reported_in_declared_scale", "already_in_currency_units"]).parse(mode.value.value);
    const ids = z.array(z.uuid()).min(1).max(256).parse(members.value.value);
    if (new Set(ids).size !== ids.length) throw new Error("numeric_interpretation_duplicate_member");
    for (const id of ids) {
      const target = entries.get(id);
      if (!target || groups.has(id) || groupContributions.has(id) || !["number", "list"].includes(target.value.type)) throw new Error("numeric_interpretation_invalid_member");
      for (const dimension of ["entityId", "perimeter", "currency", "scenario"] as const) {
        if (target.dimensions[dimension] !== mode.dimensions[dimension]) throw new Error("numeric_interpretation_context_mismatch");
      }
      if (!target.dimensions.periodEnd || (target.dimensions.periodStart ?? target.dimensions.periodEnd) < mode.dimensions.periodStart
        || target.dimensions.periodEnd > mode.dimensions.periodEnd!) throw new Error("numeric_interpretation_period_mismatch");
      if (!["currency", "money", mode.dimensions.currency].includes(target.dimensions.unit!)) throw new Error("numeric_interpretation_currency_required");
      groups.set(id, {mode: representation, contributions: [mode, members]});
    }
  }
  const gaps: {decisionId: string; reason: "representation_not_adopted"}[] = [];
  const values = input.decisionIds.map(id => {
    const entry = entries.get(id);
    if (!entry || groupContributions.has(id) || !entry.dimensions.currency
      || !["currency", "money", entry.dimensions.currency].includes(entry.dimensions.unit!)
      || (entry.value.type !== "number" && entry.value.type !== "list")) throw new Error("numeric_currency_contribution_required");
    used.set(id, entry);
    const group = groups.get(id);
    if (!group && !hasUnitScale(entry.dimensions.scale)) {
      gaps.push({decisionId: id, reason: "representation_not_adopted"});
      return {decisionId: id, type: entry.value.type, trace: null, interpretationDecisionIds: []};
    }
    group?.contributions.forEach(e => used.set(e.decisionId, e));
    const trace = normalizeCurrencyRepresentation({values: entry.value.type === "number" ? [entry.value.value] : entry.value.value,
      declaredScale: entry.dimensions.scale!, representation: group?.mode ?? "already_in_currency_units"});
    return {decisionId: id, type: entry.value.type, trace, interpretationDecisionIds: group?.contributions.map(e => e.decisionId) ?? []};
  });
  const payload = {schemaVersion: "adopted-currency-representation.v1" as const, scope: input.scope,
    basisFingerprint: input.envelope.fingerprint, status: gaps.length ? "partial" as const : "resolved" as const,
    values, gaps, contributions: [...used.values()], grantsExecution: false as const,
    classification: [...used.values()].some(e => e.kind === "hypothesis") ? "working_hypothesis" as const : "working_selection" as const};
  return {...payload, fingerprint: createHash("sha256").update(JSON.stringify(payload)).digest("hex")};
}
