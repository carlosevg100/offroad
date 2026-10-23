import {z} from "zod";
import {readContextualBasis, type AdoptionBasisEntry} from "@offroad/reconciliation";
import {adoptedValueSelectionSchema} from "./adopted-debt-inputs";
import {hasUnitScale} from "./adopted-input-scale";
import {covenantHeadroomPacketInputSchema, type CovenantHeadroomPacketInput} from "./covenant-headroom-packet";

const text = z.string().trim().min(1).max(2000);
export const boundCovenantHeadroomInputSchema = z.strictObject({
  envelope: z.strictObject({canonical: z.string().min(2).max(1048576), fingerprint: z.string().regex(/^[a-f0-9]{64}$/)}),
  scope: z.strictObject({workId: z.uuid(), purpose: z.string().min(3).max(300), versionId: z.uuid()}),
  question: text,
  /** Overrides the headline the basis adopts. */
  headlineMeasurementId: z.string().trim().min(1).max(160).optional(),
});
type Selection = z.infer<typeof adoptedValueSelectionSchema>;
type ValueType = AdoptionBasisEntry["value"]["type"];
const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const id = "[a-z0-9][a-z0-9-]{0,39}";
const anchorPath = new RegExp(`^covenant\\.(${uuid})\\.readingDate$`);
const limitPath = new RegExp(`^limit\\.(${id})\\.`);
const measurementPath = new RegExp(`^measurement\\.(${id})\\.`);
const adjustmentPath = new RegExp(`^measurement\\.(${id})\\.adjustment\\.(${id})\\.(?:label|amount)$`);
const effectPath = new RegExp(`^effect\\.(${id})\\.`);

/** Composes the covenant headroom packet input from the working basis alone. The analysis exists only
 * when the basis adopts its reading date (`covenant.<analysis>.readingDate`); its limits, measurements,
 * adjustments and effects are every id the field paths name, in the adopted order. Every operand is
 * selected by field path, scenario, unit and type within the analysis' own dimensions; an absent operand,
 * or one adopted twice for the same slot, is declared missing with its reason. No number is supplied here. */
export function composeBoundCovenantHeadroom(raw: unknown): CovenantHeadroomPacketInput {
  const input = boundCovenantHeadroomInputSchema.parse(raw);
  const basis = readContextualBasis(input.envelope, input.scope);
  const entries = [...basis.entries].sort((a, b) => a.decisionId < b.decisionId ? -1 : 1);
  const anchors = entries.flatMap((e) => {const m = anchorPath.exec(e.fieldPath); return m && e.value.type === "date" ? [{analysisId: m[1]!, entry: e}] : [];});
  if (!anchors.length) throw new Error("covenant_headroom_analysis_missing");
  if (anchors.length > 1) throw new Error("covenant_headroom_analysis_ambiguous");
  const {analysisId, entry: anchor} = anchors[0]!, prefix = `covenant.${analysisId}.`, d = anchor.dimensions, top = d.scenario!;
  const own = entries.filter((e) => e.fieldPath.startsWith(prefix) && e.dimensions.entityId === d.entityId && e.dimensions.perimeter === d.perimeter
    && e.dimensions.currency === d.currency && e.dimensions.periodStart === d.periodStart && e.dimensions.periodEnd === d.periodEnd);
  const rel = (e: AdoptionBasisEntry) => e.fieldPath.slice(prefix.length);
  const used = new Set<string>(), definitions: Selection[] = [], missing: Selection[] = [];
  function select(p: string, scenario: string, unit: string, type: ValueType, absent?: string): Selection {
    // As the reader allows, an operand carries its own scenario or, explicitly, the inherited top one; one candidate across both.
    const matches = own.filter((e) => rel(e) === p && e.value.type === type && e.dimensions.unit === unit && (e.dimensions.scenario === scenario || e.dimensions.scenario === top)
      && (unit === "currency" || hasUnitScale(e.dimensions.scale)) && !used.has(e.decisionId));
    if (matches.length === 1) {
      const e = matches[0]!; used.add(e.decisionId);
      const selection = {decisionId: e.decisionId, definitionVersionId: e.dimensions.definitionVersionId!, definitionKind: e.definitionKind, missingReason: null};
      definitions.push(selection); return selection;
    }
    const selection = {decisionId: null, definitionVersionId: d.definitionVersionId!, definitionKind: anchor.definitionKind,
      missingReason: matches.length > 1 ? `${matches.length} contributions match ${p} for scenario ${scenario}; keep one value per slot in the working basis`
        : absent ?? `No contribution adopted for ${p} in scenario ${scenario}`};
    missing.push(selection); return selection;
  }
  // Structure the reader takes as plain fields; each must be adopted once.
  function meta<T extends ValueType>(p: string, type: T, scenario?: string) {
    const found = own.filter((e) => rel(e) === p && e.value.type === type && (scenario === undefined || e.dimensions.scenario === scenario));
    if (found.length > 1) throw new Error("covenant_headroom_structure_ambiguous");
    return found[0] as (AdoptionBasisEntry & {value: Extract<AdoptionBasisEntry["value"], {type: T}>}) | undefined;
  }
  const ids = (pattern: RegExp, order: string) => {
    const found = new Set(own.flatMap((e) => {const m = pattern.exec(rel(e)); return m ? [m[1]!] : [];}));
    const listed = (meta(order, "list", top)?.value.value ?? []).filter((x) => found.has(x));
    return [...new Set(listed), ...[...found].filter((x) => !listed.includes(x)).sort()];
  };
  const headlineMeasurementId = input.headlineMeasurementId ?? meta("headlineMeasurementId", "text", top)?.value.value;
  if (!headlineMeasurementId) throw new Error("covenant_headroom_headline_missing");
  const limits = ids(limitPath, "order.limits").map((k) => {
    const p = `limit.${k}.`, gap = meta(p + "definitionGap", "text", top)?.value.value;
    return {id: k, kind: select(p + "kind", top, "convention", "text"), status: select(p + "status", top, "convention", "text"),
      testDates: select(p + "testDates", top, "date", "list"), label: select(p + "label", top, "text", "text"),
      maximumRatio: select(p + "maximumRatio", top, "ratio", "number"), source: select(p + "source", top, "text", "text"),
      definition: select(p + "definition", top, "text", "text", gap)};
  });
  const measurements = ids(measurementPath, "order.measurements").map((k) => {
    const p = `measurement.${k}.`, role = meta(p + "role", "text");
    if (!role) throw new Error("covenant_headroom_measurement_structure_missing");
    const sc = role.dimensions.scenario!, at = (name: string, unit: string, type: ValueType) => select(p + name, sc, unit, type);
    const adjustmentIds = new Set(own.flatMap((e) => {const m = adjustmentPath.exec(rel(e)); return m && m[1] === k ? [m[2]!] : [];}));
    // Every adopted adjustment id stays: an absent label or amount is a missing selection, never a dropped deduction.
    const listed = meta(p + "adjustmentIds", "list", sc)?.value.value ?? [];
    if (listed.some((x) => !new RegExp(`^${id}$`).test(x))) throw new Error("covenant_headroom_measurement_structure_invalid");
    const adjustments = [...new Set(listed), ...[...adjustmentIds].filter((x) => !listed.includes(x)).sort()];
    return {id: k, label: meta(p + "label", "text", sc)?.value.value ?? k, role: z.enum(["test", "contrast"]).parse(role.value.value),
      limitIds: meta(p + "limitIds", "list", sc)?.value.value ?? [], scenario: sc,
      date: at("date", "date", "date"), debt: at("debt", "currency", "number"), cash: at("cash", "currency", "number"),
      reportedEbitda: at("reportedEbitda", "currency", "number"),
      adjustments: adjustments.map((a) => ({id: a, label: at(`adjustment.${a}.label`, "text", "text"), amount: at(`adjustment.${a}.amount`, "currency", "number")})),
      // Optional: absent means all of the definition's EBITDA is realized, and that is no gap.
      unrealizedEbitda: own.some((e) => rel(e) === p + "unrealizedEbitda") ? at("unrealizedEbitda", "currency", "number") : null};
  });
  const effects = ids(effectPath, "order.effects").map((k) => {
    const p = `effect.${k}.`, part = (name: string) => meta(p + name, "text", top)?.value.value;
    const label = part("label"), measurementId = part("measurementId"), withoutEffectMeasurementId = part("withoutEffectMeasurementId");
    if (!label || !measurementId || !withoutEffectMeasurementId) throw new Error("covenant_headroom_effect_structure_missing");
    return {id: k, label, measurementId, withoutEffectMeasurementId};
  });
  const consequence = {acceleration: select("consequence.acceleration", top, "convention", "text"),
    process: select("consequence.process", top, "text", "text"), crossDefault: select("consequence.crossDefault", top, "text", "text")};
  // A missing operand carries the lowest resolved definition so the reference is stable; the reader ignores it.
  const borrowed = [...definitions].sort((a, b) => a.definitionVersionId < b.definitionVersionId ? -1 : 1)[0];
  if (borrowed) for (const m of missing) {m.definitionVersionId = borrowed.definitionVersionId; m.definitionKind = borrowed.definitionKind;}
  const analysis = {envelope: input.envelope, scope: input.scope, entityId: d.entityId!, perimeter: d.perimeter!, currency: d.currency!,
    openingDate: d.periodStart!, endDate: d.periodEnd!, numericInterpretations: [], analysisId, scenario: top,
    readingDate: (anchor.value as {value: string}).value, limits, measurements, effects, consequence};
  return covenantHeadroomPacketInputSchema.parse({schemaVersion: "covenant-headroom-packet-input.v1", question: input.question, headlineMeasurementId, analysis});
}
