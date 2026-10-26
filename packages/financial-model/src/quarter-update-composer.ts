import {z} from "zod";
import {readContextualBasis, type AdoptionBasisEntry} from "@offroad/reconciliation";
import {adoptedValueSelectionSchema} from "./adopted-debt-inputs";
import {hasUnitScale} from "./adopted-input-scale";
import {composeBoundWeeklyCash} from "./weekly-cash-composer";
import {composeBoundCovenantHeadroom} from "./covenant-headroom-composer";
import {quarterUpdatePacketInputSchema, type QuarterUpdatePacketInput} from "./quarter-update-packet";

const text = z.string().trim().min(1).max(2000);
const bound = z.strictObject({
  envelope: z.strictObject({canonical: z.string().min(2).max(1048576), fingerprint: z.string().regex(/^[a-f0-9]{64}$/)}),
  scope: z.strictObject({workId: z.uuid(), purpose: z.string().min(3).max(300), versionId: z.uuid()}),
});
/** Three bound bases: the prior weekly cash, the prior covenant test (with the measurement the close updates as its headline) and the close. */
export const boundQuarterUpdateInputSchema = z.strictObject({
  prior: z.strictObject({weeklyCash: bound, covenant: bound}),
  update: bound,
  question: text,
});
type Selection = z.infer<typeof adoptedValueSelectionSchema>;
type ValueType = AdoptionBasisEntry["value"]["type"];
const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const k = "[a-z0-9][a-z0-9-]{0,39}";
const keyOf = z.string().regex(new RegExp(`^${k}$`));
const analysisPath = new RegExp(`^quarter_update\\.(${uuid})\\.`);
const named = (kind: string) => new RegExp(`^${kind}\\.(${k})\\.[A-Za-z]+$`);

/** Composes the quarter update packet input from the three bases alone. The prior weekly cash and
 * covenant test are composed by their own released composers, untouched; the close carries one
 * analysis (`quarter_update.<analysis>.`) whose lines, causes, series, facilities, steps and
 * dependents are every id the adopted order lists or a field path names, listed ones first. Structure
 * (line unit, the bridge of each cause, linked lines, the causes of each series, the tests updated,
 * each step) is one adopted value or the composition refuses by name. Every operand is selected by
 * field path, scenario, unit and type in the analysis' own dimensions; an absent operand, or one
 * adopted twice for the same slot, is declared missing with its reason. No number is supplied here. */
export function composeBoundQuarterUpdate(raw: unknown): QuarterUpdatePacketInput {
  const input = boundQuarterUpdateInputSchema.parse(raw);
  const basis = readContextualBasis(input.update.envelope, input.update.scope);
  const entries = [...basis.entries].sort((a, b) => a.decisionId < b.decisionId ? -1 : 1);
  const roles = entries.flatMap((e) => {const m = analysisPath.exec(e.fieldPath); return m ? [{analysisId: m[1]!, entry: e}] : [];});
  if (!roles.length) throw new Error("quarter_update_analysis_missing");
  if (new Set(roles.map((r) => r.analysisId)).size !== 1) throw new Error("quarter_update_analysis_ambiguous");
  const analysisId = roles[0]!.analysisId, anchor = (roles.find((r) => r.entry.fieldPath.endsWith(".order.lines")) ?? roles[0]!).entry, d = anchor.dimensions, sc = d.scenario!, prefix = `quarter_update.${analysisId}.`;
  const own = entries.filter((e) => e.fieldPath.startsWith(prefix) && e.dimensions.scenario === sc && e.dimensions.entityId === d.entityId && e.dimensions.perimeter === d.perimeter
    && e.dimensions.currency === d.currency && e.dimensions.periodStart === d.periodStart && e.dimensions.periodEnd === d.periodEnd);
  const used = new Set<string>(), definitions: Selection[] = [], missing: Selection[] = [];
  function select(p: string, unit: string, type: ValueType): Selection {
    const matches = own.filter((e) => e.fieldPath === prefix + p && e.value.type === type && e.dimensions.unit === unit
      && (unit === "currency" || hasUnitScale(e.dimensions.scale)) && !used.has(e.decisionId));
    if (matches.length === 1) {
      const e = matches[0]!; used.add(e.decisionId);
      const selection = {decisionId: e.decisionId, definitionVersionId: e.dimensions.definitionVersionId!, definitionKind: e.definitionKind, missingReason: null};
      definitions.push(selection); return selection;
    }
    const selection = {decisionId: null, definitionVersionId: anchor.dimensions.definitionVersionId!, definitionKind: anchor.definitionKind,
      missingReason: matches.length > 1 ? `${matches.length} contributions match ${p} for scenario ${sc}; keep one value per slot in the working basis`
        : `No contribution adopted for ${p} in scenario ${sc}`};
    missing.push(selection); return selection;
  }
  const optional = (p: string, unit: string, type: ValueType) => own.some((e) => e.fieldPath === prefix + p) ? select(p, unit, type) : null;
  // Structure the reader receives as given: one adopted value or the composition refuses.
  function meta(p: string, type: ValueType, code: string, required: true): string | string[];
  function meta(p: string, type: ValueType, code: string, required: false): string | string[] | null;
  function meta(p: string, type: ValueType, code: string, required: boolean) {
    const found = own.filter((e) => e.fieldPath === prefix + p && e.value.type === type);
    if (found.length > 1) throw new Error(`${code}_ambiguous`);
    if (!found.length) {if (required) throw new Error(`${code}_missing`); return null;}
    return found[0]!.value.value as string | string[];
  }
  const one = (p: string, code: string) => keyOf.parse(meta(p, "text", code, true));
  const maybe = (p: string, code: string) => {const v = meta(p, "text", code, false); return v === null ? null : keyOf.parse(v);};
  // Every id the adopted order lists or any field path names is composed; none disappears silently.
  const keys = (kind: string, orderPath: string) => {
    const order = z.array(keyOf).parse(meta(orderPath, "list", "quarter_update_order", false) ?? []);
    if (new Set(order).size !== order.length) throw new Error("quarter_update_order_ambiguous");
    const pattern = named(kind);
    const seen = [...new Set(own.flatMap((e) => {const m = pattern.exec(e.fieldPath.slice(prefix.length)); return m ? [m[1]!] : [];}))].filter((x) => !order.includes(x)).sort();
    return [...order, ...seen];
  };
  const lines = keys("line", "order.lines").map((id) => {
    const p = `line.${id}.`, unit = z.enum(["currency", "days", "ratio"]).parse(meta(p + "unit", "text", "quarter_update_line_unit", true));
    return {id, unit, label: select(p + "label", "text", "text"), projected: select(p + "projected", unit, "number"), actual: select(p + "actual", unit, "number")};
  });
  const causes = keys("cause", "order.causes").map((id) => {
    const p = `cause.${id}.`;
    return {lineId: one(p + "lineId", "quarter_update_cause_bridge"), cause: {id, equalsDeviationOf: maybe(p + "equalsDeviationOf", "quarter_update_cause_link"),
      driverLineId: maybe(p + "driverLineId", "quarter_update_cause_driver"), label: select(p + "label", "text", "text"), amount: select(p + "amount", "currency", "number"),
      classification: select(p + "classification", "convention", "text"), until: optional(p + "until", "date", "date"), nature: optional(p + "nature", "convention", "text"), basis: select(p + "basis", "convention", "text"),
      question: optional(p + "question", "text", "text")}};
  });
  const bridgeOrder = z.array(keyOf).parse(meta("order.bridges", "list", "quarter_update_order", false) ?? []);
  const bridgeIds = [...bridgeOrder, ...[...new Set(causes.map((c) => c.lineId))].filter((x) => !bridgeOrder.includes(x)).sort()];
  const bridges = bridgeIds.map((lineId) => ({lineId, causes: causes.filter((c) => c.lineId === lineId).map((c) => c.cause)}));
  const streamUpdates = keys("streamUpdate", "order.streamUpdates").map((streamId) => {
    const p = `streamUpdate.${streamId}.`;
    return {streamId, causeIds: z.array(keyOf).parse(meta(p + "causeIds", "list", "quarter_update_stream_causes", true)),
      dates: select(p + "dates", "date", "list"), amounts: select(p + "amounts", "currency", "list")};
  });
  const addedStreams = keys("added", "order.added").map((id) => {
    const p = `added.${id}.`;
    return {id, label: select(p + "label", "text", "text"), dates: select(p + "dates", "date", "list"), amounts: select(p + "amounts", "currency", "list")};
  });
  const facilities = keys("facility", "order.facilities").map((id) => {
    const p = `facility.${id}.`;
    return {id, label: select(p + "label", "text", "text"), limit: select(p + "limit", "currency", "number"), source: select(p + "source", "text", "text")};
  });
  const steps = keys("step", "order.steps").map((facilityId) => {
    const p = `step.${facilityId}.`, mode = z.enum(["fixed", "residual"]).parse(meta(p + "mode", "text", "quarter_update_step_mode", true));
    return mode === "fixed" ? {facilityId, mode, streamId: one(p + "streamId", "quarter_update_step_stream"),
      replacesStreamIds: z.array(keyOf).parse(meta(p + "replacesStreamIds", "list", "quarter_update_step_replacement", true))}
      : {facilityId, mode, date: select(p + "date", "date", "date")};
  });
  const dependents = keys("dependent", "order.dependents").map((id) => {
    const p = `dependent.${id}.`;
    return {id, label: select(p + "label", "text", "text"), kind: select(p + "kind", "convention", "text"), reads: select(p + "reads", "identity", "list"),
      horizonStart: select(p + "horizonStart", "date", "date"), horizonEnd: select(p + "horizonEnd", "date", "date"), recomputedBy: select(p + "recomputedBy", "convention", "text")};
  });
  const measurementIds = z.array(keyOf).min(1).parse(meta("covenant.measurementIds", "list", "quarter_update_covenant_measurement", true));
  const update = {envelope: input.update.envelope, scope: input.update.scope, entityId: d.entityId!, perimeter: d.perimeter!, currency: d.currency!,
    openingDate: d.periodStart!, endDate: d.periodEnd!, numericInterpretations: [], analysisId, scenario: sc,
    priorWeeklyFingerprint: select("prior.weeklyCash.fingerprint", "identity", "text"), priorCovenantFingerprint: select("prior.covenant.fingerprint", "identity", "text"),
    lines, carry: {cashLineId: one("carry.cashLineId", "quarter_update_carry"), ebitdaLineId: one("carry.ebitdaLineId", "quarter_update_carry")},
    bridges, streamUpdates, addedStreams, covenant: {measurementIds}, facilities, steps, dependents};
  // A missing operand carries the lowest resolved definition so the reference is stable; the executor ignores it.
  const borrowed = [...definitions].sort((a, b) => a.definitionVersionId < b.definitionVersionId ? -1 : 1)[0];
  if (borrowed) for (const m of missing) {m.definitionVersionId = borrowed.definitionVersionId; m.definitionKind = borrowed.definitionKind;}
  // The prior versions are composed by their own composers, exactly as they were adopted.
  const weeklyCash = composeBoundWeeklyCash({...input.prior.weeklyCash, question: input.question}).analysis;
  const covenant = composeBoundCovenantHeadroom({...input.prior.covenant, question: input.question, headlineMeasurementId: measurementIds[0]!}).analysis;
  return quarterUpdatePacketInputSchema.parse({schemaVersion: "quarter-update-packet-input.v1", question: input.question, analysis: {prior: {weeklyCash, covenant}, update}});
}
