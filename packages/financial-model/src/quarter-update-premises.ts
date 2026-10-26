import {z} from "zod";
import {capacityUuid} from "./debt-capacity-premises";
import type {ProposedHypothesis} from "./investment-premises";

const text = z.string().trim().min(1).max(2000);
const key = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/);
/** Money carries at most eight decimals, as the adopted numeric representation reads it. */
const money = z.string().regex(/^-?\d{1,24}(?:\.\d{1,8})?$/);
const unsignedMoney = z.string().regex(/^\d{1,24}(?:\.\d{1,8})?$/);
const measure = z.string().regex(/^-?\d{1,6}(?:\.\d{1,8})?$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const origins = ["document", "informed", "house", "estimate"] as const;
const originLabel: Record<(typeof origins)[number], string> = {document: "documento", informed: "informado", house: "premissa da casa", estimate: "estimativa"};
/** A value and where it came from; the source names the document, the message or the house rule. */
const fact = <T extends z.ZodType>(value: T) => z.strictObject({value, origin: z.enum(origins), source: text});
type Origin = {origin: (typeof origins)[number]; source: string};

const line = z.strictObject({id: key, label: text, unit: z.enum(["currency", "days", "ratio"]), projected: measure, actual: measure});
/** A cause of one bridged deviation: one-off (calendar) or persisting until a date (structural). */
const cause = z.strictObject({id: key, label: text, amount: money, classification: z.enum(["calendar", "structural"]), until: z.iso.date().nullable(),
  equalsDeviationOf: key.nullable(), driverLineId: key.nullable(), basis: z.enum(["document", "interpretation"]), question: text.nullable(),
  /** A structural flow recurs each period; a structural balance shift is carried once in the closed cash. Null for a calendar cause. */
  nature: z.enum(["flow", "balance"]).nullable()});
const series = {dates: z.array(z.iso.date()).min(1).max(2000), amounts: z.array(unsignedMoney).min(1).max(2000)};
const step = z.discriminatedUnion("mode", [
  z.strictObject({facilityId: key, mode: z.literal("fixed"), streamId: key, replacesStreamIds: z.array(key).min(1).max(8)}),
  z.strictObject({facilityId: key, mode: z.literal("residual"), date: z.iso.date()})]);
/** recomputedBy names the result this packet computes ("weekly_cash", "covenant:<measurement>", "projection:<year>") or "none"; owner names the method that must recompute it otherwise. */
const dependent = z.strictObject({id: key, label: text, kind: z.enum(["analysis", "plan", "material"]), reads: z.array(key).max(24),
  horizonStart: z.iso.date(), horizonEnd: z.iso.date(), recomputedBy: z.string().regex(/^(none|weekly_cash|covenant:[a-z0-9][a-z0-9-]{0,39}|projection:[1-9]\d{3})$/), owner: text.nullable(),
  /** Its economic identity: the quantities it consumes, and the definition and scenario they are measured on. */
  quantities: z.array(z.string().regex(/^[a-z][a-z0-9_]{0,59}$/)).max(8), definition: text.nullable(), scenario: text.nullable()});
/** How the cause moves the series inside its window: amounts scaled by a factor, or events delayed by days. */
const transform = z.discriminatedUnion("kind", [z.strictObject({kind: z.literal("scale"), factor: z.string().regex(/^\d{1,4}(?:\.\d{1,8})?$/)}),
  z.strictObject({kind: z.literal("delay"), days: z.number().int().min(-366).max(366)})]);

/** The facts of one quarter close, each with its origin. The prior weekly cash and covenant test are
 * named by the fingerprint of the basis each was adopted on; nothing of them is restated here. Nothing
 * is adopted until a person confirms the set; every number the method reads comes from the basis. */
export const quarterUpdateFactsSchema = z.strictObject({
  updateId: z.uuid(), entityId: z.uuid(), perimeter: text, currency: z.string().regex(/^[A-Z]{3}$/), definitionVersionId: z.uuid(),
  quarterStart: z.iso.date(), quarterEnd: z.iso.date(),
  priorWeeklyFingerprint: fact(hash), priorCovenantFingerprint: fact(hash),
  lines: z.array(fact(line)).min(1).max(24),
  carry: fact(z.strictObject({cashLineId: key, ebitdaLineId: key})),
  bridges: z.array(z.strictObject({lineId: key, causes: z.array(fact(cause)).min(1).max(12)})).min(2).max(8),
  streamUpdates: z.array(fact(z.strictObject({streamId: key, causeIds: z.array(key).min(1).max(8), transform, ...series}))).max(16),
  addedStreams: z.array(fact(z.strictObject({id: key, label: text, ...series}))).max(4),
  /** The prior test measurements the close updates, the leading one first; their effects are derived, never stated. */
  covenant: fact(z.strictObject({measurementIds: z.array(key).min(1).max(8)})),
  facilities: z.array(fact(z.strictObject({id: key, label: text, limit: unsignedMoney, source: text}))).max(8),
  steps: z.array(fact(step)).max(4),
  dependents: z.array(fact(dependent)).max(24),
}).superRefine((f, ctx) => {
  const fail = (message: string) => ctx.addIssue({code: "custom", message});
  if (f.quarterEnd <= f.quarterStart) fail("The quarter must end after it starts");
  const lines = new Map(f.lines.map((l) => [l.value.id, l.value]));
  if (lines.size !== f.lines.length) fail("Duplicate line");
  const known = (id: string | null) => id === null || lines.has(id);
  const {cashLineId, ebitdaLineId} = f.carry.value;
  if (cashLineId === ebitdaLineId || [cashLineId, ebitdaLineId].some((id) => lines.get(id)?.unit !== "currency")) fail("Cash and EBITDA must be two currency lines of the close");
  if (new Set(f.bridges.map((b) => b.lineId)).size !== f.bridges.length || ![cashLineId, ebitdaLineId].every((id) => f.bridges.some((b) => b.lineId === id))) fail("Cash and EBITDA each need one bridge");
  const causes = new Map<string, z.infer<typeof cause>>();
  for (const b of f.bridges) {
    if (lines.get(b.lineId)?.unit !== "currency") fail(`Bridge ${b.lineId} must be a currency line of the close`);
    for (const {value: c} of b.causes) {
      if (causes.has(c.id)) fail(`Duplicate cause ${c.id}`);
      causes.set(c.id, c);
      if ((c.classification === "structural") !== (c.until !== null)) fail(`Cause ${c.id}: a structural cause persists until a date; a calendar cause has none`);
      if (c.until !== null && c.until <= f.quarterEnd) fail(`Cause ${c.id} must persist past the close`);
      if ((c.classification === "structural") !== (c.nature !== null)) fail(`Cause ${c.id}: only a structural cause is a flow or a balance shift`);
      if (c.classification === "structural" && b.lineId !== cashLineId && b.lineId !== ebitdaLineId) fail(`Cause ${c.id}: a structural cause belongs to the cash or the EBITDA bridge`);
      if (c.nature === "balance" && b.lineId !== cashLineId) fail(`Cause ${c.id}: a balance shift belongs to the cash bridge`);
      if (!known(c.equalsDeviationOf) || !known(c.driverLineId) || c.equalsDeviationOf === b.lineId) fail(`Cause ${c.id} names a line the close does not carry`);
    }
  }
  const structural = (id: string) => causes.get(id)?.classification === "structural";
  for (const {value: u} of f.streamUpdates) {
    if (u.dates.length !== u.amounts.length) fail(`Stream ${u.streamId} must have one amount per date`);
    if (!u.causeIds.every(structural)) fail(`Stream ${u.streamId} must be moved by structural causes of the close`);
  }
  for (const {value: s} of f.addedStreams) if (s.dates.length !== s.amounts.length) fail(`Stream ${s.id} must have one amount per date`);
  if (new Set(f.covenant.value.measurementIds).size !== f.covenant.value.measurementIds.length) fail("Duplicate covenant measurement");
  const facilities = new Set(f.facilities.map((x) => x.value.id));
  if (facilities.size !== f.facilities.length) fail("Duplicate facility");
  if (new Set(f.steps.map((s) => s.value.facilityId)).size !== f.steps.length || f.steps.some((s) => !facilities.has(s.value.facilityId))) fail("Each step draws once on a facility of the close");
  for (const {value: s} of f.steps) if (s.mode === "fixed" && !f.addedStreams.some((x) => x.value.id === s.streamId)) fail(`Step on ${s.facilityId} draws a stream the close does not add`);
  if (new Set(f.dependents.map((d) => d.value.id)).size !== f.dependents.length) fail("Duplicate dependent");
  for (const {value: d} of f.dependents) if (!d.reads.every((id) => lines.has(id)) || d.horizonEnd < d.horizonStart) fail(`Dependent ${d.id} reads a line the close does not carry or has no horizon`);
});
export type QuarterUpdateFacts = z.infer<typeof quarterUpdateFactsSchema>;

export const quarterUpdateAnalysisId = (updateId: string) => capacityUuid(`offroad:quarter-update:${updateId}:analysis`);
/** The size of one working basis. */
export const maxQuarterUpdateHypotheses = 256;

/** The hypotheses one confirmation adopts for the close: every figure, date, classification, series,
 * effect, limit and dependent the adopted reader reads, plus the structure it receives as given (line
 * units, the bridge of each cause, linked and driver lines, the causes of each series, the tests updated,
 * the steps and the order of everything), so the packet is composed from the basis alone. The prior
 * versions are named by fingerprint and stay on their own bases. Deterministic; nothing is calculated here. */
export function proposeQuarterUpdateHypotheses(raw: unknown): ProposedHypothesis[] {
  const f = quarterUpdateFactsSchema.parse(raw);
  const out: ProposedHypothesis[] = [], prefix = `quarter_update.${quarterUpdateAnalysisId(f.updateId)}.`;
  const why = (x: Origin) => `Origem: ${originLabel[x.origin]}. ${x.source}`;
  const house = (source: string) => `Origem: premissa da casa. ${source}`;
  const add = (path: string, unit: string, value: ProposedHypothesis["value"], reason: string) => out.push({fieldPath: prefix + path,
    dimensions: {entityId: f.entityId, perimeter: f.perimeter, periodStart: f.quarterStart, periodEnd: f.quarterEnd, currency: f.currency, unit, scale: "1", scenario: "base", definitionVersionId: f.definitionVersionId},
    value, reason});
  const num = (path: string, unit: string, value: string, reason: string) => add(path, unit, {type: "number", value}, reason);
  const txt = (path: string, unit: string, value: string, reason: string) => add(path, unit, {type: "text", value}, reason);
  const list = (path: string, unit: string, value: string[], reason: string) => add(path, unit, {type: "list", value}, reason);
  const date = (path: string, value: string, reason: string) => add(path, "date", {type: "date", value}, reason);

  txt("prior.weeklyCash.fingerprint", "identity", f.priorWeeklyFingerprint.value, why(f.priorWeeklyFingerprint));
  txt("prior.covenant.fingerprint", "identity", f.priorCovenantFingerprint.value, why(f.priorCovenantFingerprint));
  for (const l of f.lines) {
    const v = l.value, p = `line.${v.id}.`, r = why(l);
    txt(p + "label", "text", v.label, r); txt(p + "unit", "convention", v.unit, r);
    num(p + "projected", v.unit, v.projected, r); num(p + "actual", v.unit, v.actual, r);
  }
  txt("carry.cashLineId", "identity", f.carry.value.cashLineId, why(f.carry));
  txt("carry.ebitdaLineId", "identity", f.carry.value.ebitdaLineId, why(f.carry));
  for (const b of f.bridges) for (const c of b.causes) {
    const v = c.value, p = `cause.${v.id}.`, r = why(c);
    txt(p + "lineId", "identity", b.lineId, r);
    txt(p + "label", "text", v.label, r); num(p + "amount", "currency", v.amount, r);
    txt(p + "classification", "convention", v.classification, r); txt(p + "basis", "convention", v.basis, r);
    if (v.until !== null) date(p + "until", v.until, r);
    if (v.nature !== null) txt(p + "nature", "convention", v.nature, r);
    if (v.question !== null) txt(p + "question", "text", v.question, r);
    if (v.equalsDeviationOf !== null) txt(p + "equalsDeviationOf", "identity", v.equalsDeviationOf, r);
    if (v.driverLineId !== null) txt(p + "driverLineId", "identity", v.driverLineId, r);
  }
  for (const u of f.streamUpdates) {
    const v = u.value, p = `streamUpdate.${v.streamId}.`, r = why(u);
    list(p + "causeIds", "identity", v.causeIds, r); list(p + "dates", "date", v.dates, r); list(p + "amounts", "currency", v.amounts, r);
    txt(p + "transformKind", "convention", v.transform.kind, r);
    if (v.transform.kind === "scale") num(p + "transformValue", "ratio", v.transform.factor, r); else num(p + "transformValue", "days", String(v.transform.days), r);
  }
  for (const s of f.addedStreams) {
    const v = s.value, p = `added.${v.id}.`, r = why(s);
    txt(p + "label", "text", v.label, r); list(p + "dates", "date", v.dates, r); list(p + "amounts", "currency", v.amounts, r);
  }
  list("covenant.measurementIds", "identity", f.covenant.value.measurementIds, why(f.covenant));
  for (const x of f.facilities) {
    const v = x.value, p = `facility.${v.id}.`, r = why(x);
    txt(p + "label", "text", v.label, r); num(p + "limit", "currency", v.limit, r); txt(p + "source", "text", v.source, r);
  }
  for (const s of f.steps) {
    const v = s.value, p = `step.${v.facilityId}.`, r = why(s);
    txt(p + "mode", "convention", v.mode, r);
    if (v.mode === "fixed") {txt(p + "streamId", "identity", v.streamId, r); list(p + "replacesStreamIds", "identity", v.replacesStreamIds, r);}
    else date(p + "date", v.date, r);
  }
  for (const d of f.dependents) {
    const v = d.value, p = `dependent.${v.id}.`, r = why(d);
    txt(p + "label", "text", v.label, r); txt(p + "kind", "convention", v.kind, r); list(p + "reads", "identity", v.reads, r);
    date(p + "horizonStart", v.horizonStart, r); date(p + "horizonEnd", v.horizonEnd, r); txt(p + "recomputedBy", "convention", v.recomputedBy, r);
    if (v.owner !== null) txt(p + "owner", "text", v.owner, r);
    list(p + "quantities", "identity", v.quantities, r);
    if (v.definition !== null) txt(p + "definition", "text", v.definition, r);
    if (v.scenario !== null) txt(p + "scenario", "identity", v.scenario, r);
  }
  list("order.lines", "identity", f.lines.map((l) => l.value.id), house("Ordem das linhas como informada"));
  list("order.bridges", "identity", f.bridges.map((b) => b.lineId), house("Ordem das pontes como informada"));
  list("order.causes", "identity", f.bridges.flatMap((b) => b.causes.map((c) => c.value.id)), house("Ordem das causas como informada"));
  if (f.streamUpdates.length) list("order.streamUpdates", "identity", f.streamUpdates.map((u) => u.value.streamId), house("Ordem das séries atualizadas como informada"));
  if (f.addedStreams.length) list("order.added", "identity", f.addedStreams.map((s) => s.value.id), house("Ordem das séries novas como informada"));
  if (f.facilities.length) list("order.facilities", "identity", f.facilities.map((x) => x.value.id), house("Ordem das linhas aprovadas como informada"));
  if (f.steps.length) list("order.steps", "identity", f.steps.map((s) => s.value.facilityId), house("Ordem dos passos da ação como proposta"));
  if (f.dependents.length) list("order.dependents", "identity", f.dependents.map((d) => d.value.id), house("Ordem das dependências como informada"));
  // A working basis holds at most 256 premises; a set larger than that is refused here, not at confirmation.
  if (out.length > maxQuarterUpdateHypotheses) throw new Error("quarter_update_premises_exceed_basis");
  return out;
}
