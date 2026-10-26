import {z} from "zod";
import {actualOperatingDriverNames, projectedOperatingDriverNames} from "@offroad/financial-core";
import {capacityUuid} from "./debt-capacity-premises";
import type {ProposedHypothesis} from "./investment-premises";
import {operatingProjectionDriverUnits} from "./adopted-operating-projection-drivers";

const text = z.string().trim().min(1).max(2000), label = z.string().trim().min(1).max(300);
/** Ids travel inside field paths, so they never carry a dot. */
const key = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/);
/** Volumes, unit prices, days and money carry at most eight decimals, as the adopted reader takes them. */
const operand = z.string().regex(/^\d{1,24}(?:\.\d{1,8})?$/), signedOperand = z.string().regex(/^-?\d{1,24}(?:\.\d{1,8})?$/);
const rate = z.string().regex(/^\d{1,4}(?:\.\d{1,20})?$/), signedRate = z.string().regex(/^-?\d{1,4}(?:\.\d{1,20})?$/);
const origins = ["document", "informed", "house", "estimate"] as const;
type Origin = {origin: (typeof origins)[number]; source: string};
const originLabel: Record<(typeof origins)[number], string> = {document: "documento", informed: "informado", house: "premissa da casa", estimate: "estimativa"};
/** A value and where it came from; the source names the document, the message or the house rule. */
const fact = <T extends z.ZodType>(value: T) => z.strictObject({value, origin: z.enum(origins), source: text});
const driver = z.enum(projectedOperatingDriverNames);
const column = (d: z.infer<typeof driver>) => z.array(d === "taxRate" ? rate : operand);

/** The facts of one projection by driver, each with its origin. Nothing here is adopted until a person
 * confirms the set; every number the method reads comes from the adopted basis. */
export const operatingProjectionFactsSchema = z.strictObject({
  projectionId: z.uuid(), entityId: z.uuid(), perimeter: text, currency: z.string().regex(/^[A-Z]{3}$/), definitionVersionId: z.uuid(),
  purpose: fact(text),
  conventions: z.strictObject({dayCountBasis: fact(z.enum(["360", "365"])), calibrationTolerance: fact(rate)}),
  /** The last actual year; its drivers rebuild the reported revenue and EBITDA. */
  actual: z.strictObject({periodStart: z.iso.date(), periodEnd: z.iso.date(),
    drivers: fact(z.strictObject(Object.fromEntries(actualOperatingDriverNames.map((k) => [k, operand])) as Record<(typeof actualOperatingDriverNames)[number], typeof operand>)),
    reportedRevenue: fact(signedOperand), reportedEbitda: fact(signedOperand)}),
  periodEnds: z.array(z.iso.date()).min(1).max(40),
  /** One column per driver, one value and one origin per projected year. */
  base: z.array(z.strictObject({driver, values: z.array(z.string()).min(1).max(40), origins: z.array(z.enum(origins)).min(1).max(40), source: text})).length(13),
  scenarios: z.array(z.strictObject({id: key, label, role: z.enum(["alternative", "informed"]), basedOn: key,
    volumeGrowthRate: fact(signedRate).nullable(), volumeFactor: fact(rate).nullable(),
    overrides: z.array(z.strictObject({driver, values: z.array(z.string()).min(1).max(40), origin: z.enum(origins), source: text})).max(13),
    inputCostShock: fact(z.strictObject({fromPeriodEnd: z.iso.date(), rate: signedRate, passThroughLagMonths: z.number().int().min(0).max(12)})).nullable(),
  })).max(12),
  /** The company's own budget or revision; compared, never replaced. A cause not stated is null and its source says so. */
  companyVersions: z.array(z.strictObject({id: key, label,
    version: fact(z.strictObject({status: z.enum(["approved", "under_review"]), periodEnd: z.iso.date(), metric: z.enum(["revenue", "ebitda"]), value: signedOperand})),
    cause: fact(text.nullable())})).max(12),
}).superRefine((f, ctx) => {
  const fail = (message: string) => ctx.addIssue({code: "custom", message});
  const n = f.periodEnds.length;
  if (f.actual.periodEnd < f.actual.periodStart) fail("The actual year must end after it starts");
  if (f.periodEnds.some((d, i) => d <= (i === 0 ? f.actual.periodEnd : f.periodEnds[i - 1]!))) fail("Projected periods must follow the actual year in order");
  if (new Set(f.base.map((b) => b.driver)).size !== 13) fail("Every driver needs one base column");
  for (const b of f.base) {
    if (b.values.length !== n || b.origins.length !== n) fail(`Base column ${b.driver} must have one value and one origin per projected year`);
    if (!column(b.driver).safeParse(b.values).success) fail(`Base column ${b.driver} has an invalid value`);
  }
  const ids = new Set<string>(["base"]);
  for (const s of f.scenarios) {
    if (ids.has(s.id)) fail("Duplicate scenario");
    if (!ids.has(s.basedOn)) fail(`Scenario ${s.id} must be based on the base or an earlier scenario`);
    ids.add(s.id);
    if (new Set(s.overrides.map((o) => o.driver)).size !== s.overrides.length) fail(`Scenario ${s.id} repeats an override`);
    for (const o of s.overrides) if (o.values.length !== n || !column(o.driver).safeParse(o.values).success) fail(`Override ${o.driver} of ${s.id} must have one valid value per projected year`);
    if (s.volumeGrowthRate && s.volumeFactor) fail(`Scenario ${s.id} has two volume rules`);
    if ((s.volumeGrowthRate || s.volumeFactor) && s.overrides.some((o) => o.driver === "volume")) fail(`Scenario ${s.id} has two volume rules`);
    if (s.inputCostShock && !f.periodEnds.includes(s.inputCostShock.value.fromPeriodEnd)) fail(`Scenario ${s.id} shocks an unknown period`);
  }
  if (new Set(f.companyVersions.map((v) => v.id)).size !== f.companyVersions.length) fail("Duplicate company version");
  for (const v of f.companyVersions) {
    if (v.version.origin !== "document" && v.version.origin !== "informed") fail(`Company version ${v.id} must come from the company`);
    if (!f.periodEnds.includes(v.version.value.periodEnd)) fail(`Company version ${v.id} is for an unknown period`);
  }
});
export type OperatingProjectionFacts = z.infer<typeof operatingProjectionFactsSchema>;

export const operatingProjectionAnalysisId = (projectionId: string) => capacityUuid(`offroad:operating-projection:${projectionId}:analysis`);
/** The size of one working basis. */
export const maxOperatingProjectionHypotheses = 256;

/** The hypotheses one confirmation adopts, at the paths, units and scenarios the adopted reader reads
 * (`operating_projection.<analysis>.`). Each scenario adopts only what it changes, in its own scenario.
 * The reader's structure (scenario order, labels, roles and bases; version labels) is adopted as extra
 * hypotheses it ignores, so the packet is composed from the basis alone. A cause not stated adopts no
 * cause and states why. Every reason states the origin. Deterministic. */
export function proposeOperatingProjectionHypotheses(raw: unknown): ProposedHypothesis[] {
  const f = operatingProjectionFactsSchema.parse(raw);
  const out: ProposedHypothesis[] = [], prefix = `operating_projection.${operatingProjectionAnalysisId(f.projectionId)}.`;
  const why = (x: Origin) => `Origem: ${originLabel[x.origin]}. ${x.source}`;
  const house = (source: string) => `Origem: premissa da casa. ${source}`;
  const add = (path: string, unit: string, value: ProposedHypothesis["value"], reason: string, scenario = "base") => out.push({fieldPath: prefix + path,
    dimensions: {entityId: f.entityId, perimeter: f.perimeter, periodStart: f.actual.periodEnd, periodEnd: f.periodEnds[f.periodEnds.length - 1]!, currency: f.currency,
      unit, scale: "1", scenario, definitionVersionId: f.definitionVersionId}, value, reason});
  const txt = (path: string, unit: string, value: string, reason: string, scenario?: string) => add(path, unit, {type: "text", value}, reason, scenario);
  const num = (path: string, unit: string, value: string, reason: string, scenario?: string) => add(path, unit, {type: "number", value}, reason, scenario);
  const list = (path: string, unit: string, value: string[], reason: string, scenario?: string) => add(path, unit, {type: "list", value}, reason, scenario);
  const date = (path: string, value: string, reason: string, scenario?: string) => add(path, "date", {type: "date", value}, reason, scenario);
  txt("purpose", "text", f.purpose.value, why(f.purpose));
  list("periodEnds", "date", f.periodEnds, house("Anos projetados"));
  txt("convention.dayCountBasis", "convention", f.conventions.dayCountBasis.value, why(f.conventions.dayCountBasis));
  num("convention.calibrationTolerance", "ratio", f.conventions.calibrationTolerance.value, why(f.conventions.calibrationTolerance));
  date("actual.periodStart", f.actual.periodStart, why(f.actual.drivers));
  date("actual.periodEnd", f.actual.periodEnd, why(f.actual.drivers));
  for (const k of actualOperatingDriverNames) num(`actual.${k}`, operatingProjectionDriverUnits[k], f.actual.drivers.value[k], why(f.actual.drivers));
  num("actual.reportedRevenue", "currency", f.actual.reportedRevenue.value, why(f.actual.reportedRevenue));
  num("actual.reportedEbitda", "currency", f.actual.reportedEbitda.value, why(f.actual.reportedEbitda));
  for (const b of f.base) {
    const reason = `Origem: ${[...new Set(b.origins)].map((o) => originLabel[o]).join(", ")}. ${b.source}`;
    list(`base.${b.driver}`, operatingProjectionDriverUnits[b.driver], b.values, reason);
    list(`base.${b.driver}.origins`, "origin", b.origins, reason);
  }
  list("order.scenarios", "identity", f.scenarios.map((s) => s.id), house("Ordem de leitura dos cenários"));
  for (const s of f.scenarios) {
    const p = `scenario.${s.id}.`, sc = s.id;
    txt(p + "label", "explanation", s.label, house("Nome do cenário"), sc);
    txt(p + "role", "convention", s.role, house("Papel do cenário"), sc);
    txt(p + "basedOn", "identity", s.basedOn, house("Cenário de referência"), sc);
    for (const [name, r] of [["volumeGrowthRate", s.volumeGrowthRate], ["volumeFactor", s.volumeFactor]] as const) if (r) {
      num(p + name, "ratio", r.value, why(r), sc); txt(p + name + ".origin", "origin", r.origin, why(r), sc);
    }
    for (const o of s.overrides) {
      list(p + `override.${o.driver}`, operatingProjectionDriverUnits[o.driver], o.values, why(o), sc);
      txt(p + `override.${o.driver}.origin`, "origin", o.origin, why(o), sc);
    }
    const c = s.inputCostShock;
    if (c) {
      date(p + "shock.fromPeriodEnd", c.value.fromPeriodEnd, why(c), sc);
      num(p + "shock.rate", "ratio", c.value.rate, why(c), sc);
      num(p + "shock.passThroughLagMonths", "months", String(c.value.passThroughLagMonths), why(c), sc);
      txt(p + "shock.origin", "origin", c.origin, why(c), sc);
    }
  }
  list("order.versions", "identity", f.companyVersions.map((v) => v.id), house("Ordem de leitura das versões da companhia"));
  for (const v of f.companyVersions) {
    const p = `version.${v.id}.`, r = why(v.version);
    txt(p + "label", "explanation", v.label, r);
    txt(p + "status", "convention", v.version.value.status, r);
    date(p + "periodEnd", v.version.value.periodEnd, r);
    txt(p + "metric", "convention", v.version.value.metric, r);
    num(p + "value", "currency", v.version.value.value, r);
    txt(p + "origin", "origin", v.version.origin, r);
    // A cause not stated is asked, never assumed: the reason it is missing is adopted instead.
    if (v.cause.value === null) txt(p + "causeGap", "explanation", v.cause.source, why(v.cause));
    else txt(p + "cause", "text", v.cause.value, why(v.cause));
  }
  if (out.length > maxOperatingProjectionHypotheses) throw new Error("operating_projection_premises_exceed_basis");
  return out;
}
