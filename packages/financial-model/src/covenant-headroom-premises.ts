import Decimal from "decimal.js";
import {z} from "zod";
import {capacityUuid} from "./debt-capacity-premises";
import type {ProposedHypothesis} from "./investment-premises";

const text = z.string().trim().min(1).max(2000);
/** Ids travel inside field paths, so they never carry a dot; 40 characters keep claim ids built from them short. */
const key = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/);
const scenarioKey = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,59}$/);
/** Money carries at most eight decimals, as the adopted numeric representation reads it. */
const money = z.string().regex(/^-?\d{1,24}(?:\.\d{1,8})?$/);
const unsignedMoney = z.string().regex(/^\d{1,24}(?:\.\d{1,8})?$/);
const ratio = z.string().regex(/^\d{1,4}(?:\.\d{1,20})?$/);
const origins = ["document", "informed", "house", "estimate"] as const;
type Origin = {origin: (typeof origins)[number]; source: string};
const originLabel: Record<(typeof origins)[number], string> = {document: "documento", informed: "informado", house: "premissa da casa", estimate: "estimativa"};
/** A value and where it came from; the source names the document, the message or the house rule. */
const fact = <T extends z.ZodType>(value: T) => z.strictObject({value, origin: z.enum(origins), source: text});

/** The terms of one limit. The fact's source is the clause or minute the limit is read from. */
const limitTerm = z.strictObject({
  id: key, kind: z.enum(["contractual", "board_policy"]), status: z.enum(["in_force", "superseded"]),
  label: text, maximumRatio: ratio, testDates: z.array(z.iso.date()).max(24),
});
/** One reading of net debt over EBITDA at one date in one scenario; a contrast is not the test. */
const measurement = z.strictObject({
  id: key, label: text, role: z.enum(["test", "contrast"]), scenario: scenarioKey, limitIds: z.array(key).max(6), date: z.iso.date(),
  debt: unsignedMoney, cash: money, reportedEbitda: money,
  adjustments: z.array(z.strictObject({id: key, label: text, amount: money})).max(8),
  /** The part of the definition's EBITDA still ahead of the reading date; null when all is realized. */
  unrealizedEbitda: money.nullable(),
});

/** The facts of one covenant headroom question, each with its origin. Nothing here is adopted until a
 * person confirms the set; every number the method reads comes from the adopted basis. */
export const covenantHeadroomFactsSchema = z.strictObject({
  headroomId: z.uuid(), entityId: z.uuid(), perimeter: text, currency: z.string().regex(/^[A-Z]{3}$/), definitionVersionId: z.uuid(),
  /** The reading date opens the basis period; the basis ends at the last date read. */
  readingDate: z.iso.date(), endDate: z.iso.date(), scenario: scenarioKey,
  /** The test measurement the answer leads with. */
  headline: fact(key),
  limits: z.array(z.strictObject({term: fact(limitTerm),
    /** The EBITDA definition the limit is measured on; null when unwritten, and the source says where it was looked for. */
    definition: fact(text.nullable())})).min(1).max(6),
  measurements: z.array(fact(measurement)).min(1).max(12),
  effects: z.array(fact(z.strictObject({id: key, label: text, measurementId: key, withoutEffectMeasurementId: key}))).max(4),
  /** What a breach triggers, as the contract states it; absent, it stays a named gap. */
  consequence: z.strictObject({acceleration: fact(z.enum(["automatic", "non_automatic"])).nullable(), process: fact(text).nullable(), crossDefault: fact(text).nullable()}),
}).superRefine((f, ctx) => {
  const fail = (message: string) => ctx.addIssue({code: "custom", message});
  if (f.endDate <= f.readingDate) fail("The end date must follow the reading date");
  const limits = new Map(f.limits.map((l) => [l.term.value.id, l.term.value]));
  if (limits.size !== f.limits.length) fail("Duplicate limit");
  for (const l of limits.values()) {
    if (l.status === "in_force" && !l.testDates.length) fail(`Limit ${l.id} in force needs its test dates`);
    if (!new Decimal(l.maximumRatio).gt(0)) fail(`Limit ${l.id} must be positive`);
  }
  const ms = f.measurements.map((m) => m.value);
  if (new Set(ms.map((m) => m.id)).size !== ms.length) fail("Duplicate measurement");
  for (const m of ms) {
    if (new Set(m.adjustments.map((a) => a.id)).size !== m.adjustments.length) fail(`Measurement ${m.id} repeats an adjustment`);
    if (new Set(m.limitIds).size !== m.limitIds.length || m.limitIds.some((id) => !limits.has(id))) fail(`Measurement ${m.id} names an unknown limit`);
    if (m.role === "test" && !m.limitIds.length) fail(`Test ${m.id} needs a limit`);
    // A test is a test only of a limit in force on a date the limit is tested; anything else is a contrast.
    if (m.role === "test" && m.limitIds.some((id) => limits.get(id)?.status === "superseded")) fail(`Test ${m.id} names a superseded limit`);
    if (m.role === "test" && m.limitIds.some((id) => limits.has(id) && !limits.get(id)!.testDates.includes(m.date))) fail(`Test ${m.id} is off its limits' test dates`);
    if (m.unrealizedEbitda !== null && m.date <= f.readingDate) fail(`Measurement ${m.id} has unrealized EBITDA but is not after the reading date`);
  }
  for (const l of limits.values()) if (l.status === "in_force" && !ms.some((m) => m.role === "test" && m.limitIds.includes(l.id))) fail(`Limit ${l.id} in force is never tested`);
  if (new Set(f.effects.map((e) => e.value.id)).size !== f.effects.length) fail("Duplicate effect");
  for (const {value: e} of f.effects) {
    const a = ms.find((m) => m.id === e.measurementId), b = ms.find((m) => m.id === e.withoutEffectMeasurementId);
    if (!a || !b || a === b) fail(`Effect ${e.id} must pair two measurements`);
    else if (a.date !== b.date) fail(`Effect ${e.id} pairs measurements of different dates`);
  }
  if (ms.find((m) => m.id === f.headline.value)?.role !== "test") fail("The headline must be a test measurement");
});
export type CovenantHeadroomFacts = z.infer<typeof covenantHeadroomFactsSchema>;

export const covenantHeadroomAnalysisId = (headroomId: string) => capacityUuid(`offroad:covenant-headroom:${headroomId}:analysis`);
/** The size of one working basis. */
export const maxCovenantHeadroomHypotheses = 256;

/** The hypotheses one confirmation adopts, at the paths, units and scenarios the adopted reader reads
 * (`covenant.<analysis>.`). The reader's structure (reading date, headline, measurement role, label,
 * scenario and limits, effect pairs, order) is adopted as extra hypotheses it ignores, so the packet is
 * composed from the basis alone. An unwritten definition adopts no definition and states why; an
 * absent consequence term adopts nothing. Every reason states the origin. Deterministic. */
export function proposeCovenantHeadroomHypotheses(raw: unknown): ProposedHypothesis[] {
  const f = covenantHeadroomFactsSchema.parse(raw);
  const out: ProposedHypothesis[] = [], prefix = `covenant.${covenantHeadroomAnalysisId(f.headroomId)}.`, top = f.scenario;
  const why = (x: Origin) => `Origem: ${originLabel[x.origin]}. ${x.source}`;
  const house = (source: string) => `Origem: premissa da casa. ${source}`;
  const add = (path: string, unit: string, value: ProposedHypothesis["value"], reason: string, scenario = top) => out.push({fieldPath: prefix + path,
    dimensions: {entityId: f.entityId, perimeter: f.perimeter, periodStart: f.readingDate, periodEnd: f.endDate, currency: f.currency, unit, scale: "1", scenario, definitionVersionId: f.definitionVersionId},
    value, reason});
  const txt = (path: string, unit: string, value: string, reason: string, scenario = top) => add(path, unit, {type: "text", value}, reason, scenario);
  const list = (path: string, unit: string, value: string[], reason: string, scenario = top) => add(path, unit, {type: "list", value}, reason, scenario);
  const num = (path: string, unit: string, value: string, reason: string, scenario = top) => add(path, unit, {type: "number", value}, reason, scenario);
  const date = (path: string, value: string, reason: string, scenario = top) => add(path, "date", {type: "date", value}, reason, scenario);
  // Structure the reader receives as plain fields.
  date("readingDate", f.readingDate, house("Data da leitura adotada"));
  txt("headlineMeasurementId", "identity", f.headline.value, why(f.headline));
  list("order.limits", "identity", f.limits.map((l) => l.term.value.id), house("Ordem de leitura dos limites"));
  list("order.measurements", "identity", f.measurements.map((m) => m.value.id), house("Ordem de leitura das medições"));
  list("order.effects", "identity", f.effects.map((e) => e.value.id), house("Ordem de leitura dos efeitos"));
  for (const {term, definition} of f.limits) {
    const l = term.value, p = `limit.${l.id}.`;
    txt(p + "kind", "convention", l.kind, why(term));
    txt(p + "status", "convention", l.status, why(term));
    list(p + "testDates", "date", l.testDates, why(term));
    txt(p + "label", "text", l.label, why(term));
    num(p + "maximumRatio", "ratio", l.maximumRatio, why(term));
    txt(p + "source", "text", term.source, why(term));
    // An unwritten definition is asked, never assumed: the reason it is missing is adopted instead.
    if (definition.value === null) txt(p + "definitionGap", "explanation", definition.source, why(definition));
    else txt(p + "definition", "text", definition.value, why(definition));
  }
  for (const m of f.measurements) {
    const v = m.value, p = `measurement.${v.id}.`, sc = v.scenario, r = why(m);
    txt(p + "role", "convention", v.role, r, sc);
    txt(p + "label", "explanation", v.label, r, sc);
    list(p + "limitIds", "identity", v.limitIds, r, sc);
    list(p + "adjustmentIds", "identity", v.adjustments.map((a) => a.id), r, sc);
    date(p + "date", v.date, r, sc);
    num(p + "debt", "currency", v.debt, r, sc);
    num(p + "cash", "currency", v.cash, r, sc);
    num(p + "reportedEbitda", "currency", v.reportedEbitda, r, sc);
    for (const a of v.adjustments) {
      txt(p + `adjustment.${a.id}.label`, "text", a.label, r, sc);
      num(p + `adjustment.${a.id}.amount`, "currency", a.amount, r, sc);
    }
    if (v.unrealizedEbitda !== null) num(p + "unrealizedEbitda", "currency", v.unrealizedEbitda, r, sc);
  }
  for (const e of f.effects) {
    const v = e.value, p = `effect.${v.id}.`;
    txt(p + "label", "explanation", v.label, why(e));
    txt(p + "measurementId", "identity", v.measurementId, why(e));
    txt(p + "withoutEffectMeasurementId", "identity", v.withoutEffectMeasurementId, why(e));
  }
  const c = f.consequence;
  if (c.acceleration) txt("consequence.acceleration", "convention", c.acceleration.value, why(c.acceleration));
  if (c.process) txt("consequence.process", "text", c.process.value, why(c.process));
  if (c.crossDefault) txt("consequence.crossDefault", "text", c.crossDefault.value, why(c.crossDefault));
  // A working basis holds at most 256 premises; a set larger than that is refused here, not at confirmation.
  if (out.length > maxCovenantHeadroomHypotheses) throw new Error("covenant_headroom_premises_exceed_basis");
  return out;
}
