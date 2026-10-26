import {z} from "zod";
import {readContextualBasis, type AdoptionBasisEntry} from "@offroad/reconciliation";
import {actualOperatingDriverNames, projectedOperatingDriverNames, type ProjectedOperatingDriver} from "@offroad/financial-core";
import {adoptedValueSelectionSchema} from "./adopted-debt-inputs";
import {hasUnitScale} from "./adopted-input-scale";
import {actualOperatingItems, operatingProjectionDriverUnits} from "./adopted-operating-projection-drivers";
import {operatingProjectionPacketInputSchema, type OperatingProjectionPacketInput} from "./operating-projection-packet";

const text = z.string().trim().min(1).max(2000);
export const boundOperatingProjectionInputSchema = z.strictObject({
  envelope: z.strictObject({canonical: z.string().min(2).max(1048576), fingerprint: z.string().regex(/^[a-f0-9]{64}$/)}),
  scope: z.strictObject({workId: z.uuid(), purpose: z.string().min(3).max(300), versionId: z.uuid()}),
  question: text,
});
type Selection = z.infer<typeof adoptedValueSelectionSchema>;
type ValueType = AdoptionBasisEntry["value"]["type"];
const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const id = "[a-z0-9][a-z0-9-]{0,39}";
const anchorPath = new RegExp(`^operating_projection\\.(${uuid})\\.actual\\.periodEnd$`);
const scenarioPath = new RegExp(`^scenario\\.(${id})\\.`);
const overridePath = new RegExp(`^scenario\\.(${id})\\.override\\.([A-Za-z]+)(?:\\.origin)?$`);
const versionPath = new RegExp(`^version\\.(${id})\\.`);

/** Composes the projection packet input from the working basis alone. The analysis exists only when the
 * basis adopts the end of its actual year (`operating_projection.<analysis>.actual.periodEnd`); its
 * scenarios and company versions are every id the field paths name, in the adopted order. Every operand
 * is selected by field path, scenario, unit and type within the analysis' own dimensions; an absent
 * operand, or one adopted twice for the same slot, is declared missing with its reason. A scenario rule
 * exists only when the basis adopts one of its parts. No number is supplied here. */
export function composeBoundOperatingProjection(raw: unknown): OperatingProjectionPacketInput {
  const input = boundOperatingProjectionInputSchema.parse(raw);
  const basis = readContextualBasis(input.envelope, input.scope);
  const entries = [...basis.entries].sort((a, b) => a.decisionId < b.decisionId ? -1 : 1);
  const anchors = entries.flatMap((e) => {const m = anchorPath.exec(e.fieldPath); return m && e.value.type === "date" ? [{analysisId: m[1]!, entry: e}] : [];});
  if (!anchors.length) throw new Error("operating_projection_analysis_missing");
  if (anchors.length > 1) throw new Error("operating_projection_analysis_ambiguous");
  const {analysisId, entry: anchor} = anchors[0]!, prefix = `operating_projection.${analysisId}.`, d = anchor.dimensions, top = d.scenario!;
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
    if (found.length > 1) throw new Error("operating_projection_structure_ambiguous");
    return found[0] as (AdoptionBasisEntry & {value: Extract<AdoptionBasisEntry["value"], {type: T}>}) | undefined;
  }
  const ids = (pattern: RegExp, order: string) => {
    const found = new Set(own.flatMap((e) => {const m = pattern.exec(rel(e)); return m ? [m[1]!] : [];}));
    const listed = (meta(order, "list", top)?.value.value ?? []).filter((x) => found.has(x));
    return [...new Set(listed), ...[...found].filter((x) => !listed.includes(x)).sort()];
  };
  const has = (p: string) => own.some((e) => rel(e) === p);
  const at = (p: string, unit: string, type: ValueType) => select(p, top, unit, type);
  const drivers = (names: readonly ProjectedOperatingDriver[], path: (k: string) => string, unit: (k: ProjectedOperatingDriver) => string, type: ValueType) =>
    Object.fromEntries(names.map((k) => [k, at(path(k), unit(k), type)]));
  const scenarios = ids(scenarioPath, "order.scenarios").map((k) => {
    const p = `scenario.${k}.`, role = meta(p + "role", "text");
    if (!role) throw new Error("operating_projection_scenario_structure_missing");
    const sc = role.dimensions.scenario!, pick = (name: string, unit: string, type: ValueType) => select(p + name, sc, unit, type);
    const rule = (name: string) => has(p + name) || has(p + name + ".origin") ? {value: pick(name, "ratio", "number"), origin: pick(name + ".origin", "origin", "text")} : null;
    const overridden = [...new Set(own.flatMap((e) => {const m = overridePath.exec(rel(e)); return m && m[1] === k ? [m[2]!] : [];}))].sort();
    if (overridden.some((x) => !(projectedOperatingDriverNames as readonly string[]).includes(x))) throw new Error("operating_projection_scenario_structure_invalid");
    const shocked = own.some((e) => rel(e).startsWith(p + "shock."));
    return {id: k, label: meta(p + "label", "text", sc)?.value.value ?? k, role: z.enum(["alternative", "informed"]).parse(role.value.value),
      basedOn: meta(p + "basedOn", "text", sc)?.value.value ?? "base", scenario: sc,
      volumeGrowthRate: rule("volumeGrowthRate"), volumeFactor: rule("volumeFactor"),
      overrides: (overridden as ProjectedOperatingDriver[]).map((o) => ({driver: o, values: pick(`override.${o}`, operatingProjectionDriverUnits[o], "list"),
        origin: pick(`override.${o}.origin`, "origin", "text")})),
      inputCostShock: shocked ? {fromPeriodEnd: pick("shock.fromPeriodEnd", "date", "date"), rate: pick("shock.rate", "ratio", "number"),
        passThroughLagMonths: pick("shock.passThroughLagMonths", "months", "number"), origin: pick("shock.origin", "origin", "text")} : null};
  });
  const companyVersions = ids(versionPath, "order.versions").map((k) => {
    const p = `version.${k}.`, gap = meta(p + "causeGap", "text", top)?.value.value;
    return {id: k, label: meta(p + "label", "text", top)?.value.value ?? k, status: at(p + "status", "convention", "text"), periodEnd: at(p + "periodEnd", "date", "date"),
      metric: at(p + "metric", "convention", "text"), value: at(p + "value", "currency", "number"), origin: at(p + "origin", "origin", "text"),
      cause: select(p + "cause", top, "text", "text", gap)};
  });
  const analysis = {envelope: input.envelope, scope: input.scope, entityId: d.entityId!, perimeter: d.perimeter!, currency: d.currency!,
    openingDate: d.periodStart!, endDate: d.periodEnd!, numericInterpretations: [], analysisId, scenario: top,
    purpose: at("purpose", "text", "text"), periodEnds: at("periodEnds", "date", "list"),
    conventions: {dayCountBasis: at("convention.dayCountBasis", "convention", "text"), calibrationTolerance: at("convention.calibrationTolerance", "ratio", "number")},
    actual: {periodStart: at("actual.periodStart", "date", "date"), periodEnd: select("actual.periodEnd", top, "date", "date"),
      drivers: drivers(actualOperatingDriverNames, (k) => `actual.${k}`, (k) => operatingProjectionDriverUnits[k], "number"),
      reportedRevenue: at("actual.reportedRevenue", "currency", "number"), reportedEbitda: at("actual.reportedEbitda", "currency", "number"),
      origins: Object.fromEntries(actualOperatingItems.map((k) => [k, at(`actual.${k}.origin`, "origin", "text")]))},
    base: {drivers: drivers(projectedOperatingDriverNames, (k) => `base.${k}`, (k) => operatingProjectionDriverUnits[k], "list"),
      origins: drivers(projectedOperatingDriverNames, (k) => `base.${k}.origins`, () => "origin", "list")},
    scenarios, companyVersions};
  // A missing operand carries the lowest resolved definition so the reference is stable; the reader ignores it.
  const borrowed = [...definitions].sort((a, b) => a.definitionVersionId < b.definitionVersionId ? -1 : 1)[0];
  if (borrowed) for (const m of missing) {m.definitionVersionId = borrowed.definitionVersionId; m.definitionKind = borrowed.definitionKind;}
  return operatingProjectionPacketInputSchema.parse({schemaVersion: "operating-projection-packet-input.v1", question: input.question, analysis});
}
