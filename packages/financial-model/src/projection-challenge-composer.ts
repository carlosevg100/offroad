import {z} from "zod";
import {readContextualBasis, type AdoptionBasisEntry} from "@offroad/reconciliation";
import {projectionCaseDrivers, projectionPeriodDrivers} from "@offroad/financial-core";
import {adoptedValueSelectionSchema} from "./adopted-debt-inputs";
import {hasUnitScale} from "./adopted-input-scale";
import {projectionChallengePacketInputSchema, type ProjectionChallengePacketInput} from "./projection-challenge-packet";
import {projectionChallengeDriverUnits as units} from "./projection-challenge-premises";

const text = z.string().trim().min(1).max(2000);
export const boundProjectionChallengeInputSchema = z.strictObject({
  envelope: z.strictObject({canonical: z.string().min(2).max(1048576), fingerprint: z.string().regex(/^[a-f0-9]{64}$/)}),
  scope: z.strictObject({workId: z.uuid(), purpose: z.string().min(3).max(300), versionId: z.uuid()}),
  question: text,
});
type Selection = z.infer<typeof adoptedValueSelectionSchema>;
type ValueType = AdoptionBasisEntry["value"]["type"];
const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const id = "[a-z0-9][a-z0-9-]{0,39}";
const anchorPath = new RegExp(`^projection_challenge\\.(${uuid})\\.periodIds$`);
const assumptionPath = new RegExp(`^assumption\\.(${id})\\.`);

/** Composes the projection challenge packet input from the working basis alone. The analysis exists only
 * when the basis adopts its periods (`projection_challenge.<analysis>.periodIds`); the two scenarios are
 * the adopted structure; assumptions are every id the field paths name, in the adopted order. Every
 * operand is selected by field path, scenario, unit and type within the analysis' own dimensions; an
 * absent operand, or one adopted twice for the same slot, is declared missing with its reason. Capacity,
 * the stated margin cause, requested receivable days and the premium are read only when adopted. No number
 * is supplied here. */
export function composeBoundProjectionChallenge(raw: unknown): ProjectionChallengePacketInput {
  const input = boundProjectionChallengeInputSchema.parse(raw);
  const basis = readContextualBasis(input.envelope, input.scope);
  const entries = [...basis.entries].sort((a, b) => a.decisionId < b.decisionId ? -1 : 1);
  const anchors = entries.flatMap((e) => {const m = anchorPath.exec(e.fieldPath); return m && e.value.type === "list" ? [{analysisId: m[1]!, entry: e}] : [];});
  if (!anchors.length) throw new Error("projection_challenge_analysis_missing");
  if (anchors.length > 1) throw new Error("projection_challenge_analysis_ambiguous");
  const {analysisId, entry: anchor} = anchors[0]!, prefix = `projection_challenge.${analysisId}.`, d = anchor.dimensions, top = d.scenario!;
  const own = entries.filter((e) => e.fieldPath.startsWith(prefix) && e.dimensions.entityId === d.entityId && e.dimensions.perimeter === d.perimeter
    && e.dimensions.currency === d.currency && e.dimensions.periodStart === d.periodStart && e.dimensions.periodEnd === d.periodEnd);
  const rel = (e: AdoptionBasisEntry) => e.fieldPath.slice(prefix.length);
  const used = new Set<string>(), definitions: Selection[] = [], missing: Selection[] = [];
  function select(p: string, scenario: string, unit: string, type: ValueType): Selection {
    const matches = own.filter((e) => rel(e) === p && e.value.type === type && e.dimensions.unit === unit && e.dimensions.scenario === scenario
      && (unit === "currency" || hasUnitScale(e.dimensions.scale)) && !used.has(e.decisionId));
    if (matches.length === 1) {
      const e = matches[0]!; used.add(e.decisionId);
      const selection = {decisionId: e.decisionId, definitionVersionId: e.dimensions.definitionVersionId!, definitionKind: e.definitionKind, missingReason: null};
      definitions.push(selection); return selection;
    }
    const selection = {decisionId: null, definitionVersionId: d.definitionVersionId!, definitionKind: anchor.definitionKind,
      missingReason: matches.length > 1 ? `${matches.length} contributions match ${p} for scenario ${scenario}; keep one value per slot in the working basis`
        : `No contribution adopted for ${p} in scenario ${scenario}`};
    missing.push(selection); return selection;
  }
  function meta(p: string) {
    const found = own.filter((e) => rel(e) === p && e.value.type === "text" && e.dimensions.scenario === top);
    if (found.length > 1) throw new Error("projection_challenge_structure_ambiguous");
    return found[0]?.value.value as string | undefined;
  }
  const referenceScenario = meta("structure.referenceScenario"), planScenario = meta("structure.planScenario");
  if (!referenceScenario || !planScenario) throw new Error("projection_challenge_structure_missing");
  const adopted = (p: string) => own.some((e) => rel(e) === p);
  const found = new Set(own.flatMap((e) => {const m = assumptionPath.exec(rel(e)); return m ? [m[1]!] : [];}));
  const order = own.filter((e) => rel(e) === "order.assumptions" && e.value.type === "list" && e.dimensions.scenario === top);
  if (order.length > 1) throw new Error("projection_challenge_structure_ambiguous");
  const listed = ((order[0]?.value.value ?? []) as string[]).filter((x) => found.has(x));
  const assumptionIds = [...new Set(listed), ...[...found].filter((x) => !listed.includes(x)).sort()];
  const kase = (k: "reference" | "plan", sc: string) => Object.fromEntries([
    ...projectionPeriodDrivers.map((dr) => [dr, select(`case.${k}.${dr}`, sc, units[dr], "list")]),
    ...projectionCaseDrivers.map((dr) => [dr, select(`case.${k}.${dr}`, sc, units[dr], "number")])]);
  const analysis = {envelope: input.envelope, scope: input.scope, entityId: d.entityId!, perimeter: d.perimeter!, currency: d.currency!,
    openingDate: d.periodStart!, endDate: d.periodEnd!, numericInterpretations: [], analysisId, scenario: top, referenceScenario, planScenario,
    periodIds: select("periodIds", top, "identity", "list"), targetPeriodId: select("targetPeriodId", top, "identity", "text"),
    dayBasis: select("dayBasis", top, "convention", "text"), unitConvention: select("unitConvention", top, "text", "text"),
    reference: kase("reference", referenceScenario), plan: kase("plan", planScenario),
    assumptions: assumptionIds.map((a) => {
      const p = `assumption.${a}.`;
      return {id: a, label: select(p + "label", top, "text", "text"), drivers: select(p + "drivers", top, "identity", "list"), ruler: select(p + "ruler", top, "text", "text"),
        evidence: select(p + "evidence", top, "text", "list"), evidenceStatus: select(p + "evidenceStatus", top, "convention", "text")};
    }),
    capacity: ["capacity.maximumQuantity", "capacity.investmentInPlan", "capacity.source"].some(adopted)
      ? {maximumQuantity: select("capacity.maximumQuantity", top, "quantity", "number"), investmentInPlan: select("capacity.investmentInPlan", top, "convention", "boolean"),
        source: select("capacity.source", top, "text", "text")} : null,
    marginCause: adopted("marginCause") ? select("marginCause", top, "text", "text") : null,
    requestedReceivableDays: adopted("requestedReceivableDays") ? select("requestedReceivableDays", top, "days", "number") : null,
    premiumOverAverage: adopted("premiumOverAverage") ? select("premiumOverAverage", top, "ratio", "number") : null};
  // A missing operand carries the lowest resolved definition so the reference is stable; the reader ignores it.
  const borrowed = [...definitions].sort((a, b) => a.definitionVersionId < b.definitionVersionId ? -1 : 1)[0];
  if (borrowed) for (const m of missing) {m.definitionVersionId = borrowed.definitionVersionId; m.definitionKind = borrowed.definitionKind;}
  return projectionChallengePacketInputSchema.parse({schemaVersion: "projection-challenge-packet-input.v1", question: input.question, analysis});
}
