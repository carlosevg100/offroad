import {createHash} from "node:crypto";
import {z} from "zod";
import {buildWeeklyCash, financialCoreVersion, measureCovenantHeadroom, updateAfterQuarterClose,
  type CovenantHeadroomInput, type QuarterUpdateInput, type WeeklyCashInput} from "@offroad/financial-core";
import {adoptedValueSelectionSchema as selection} from "./adopted-debt-inputs";
import {adoptedAnalysisContextSchema, analysisAmount, createAnalysisBinding} from "./adopted-analysis-binding";
import {adoptedWeeklyCashInputSchema, calculateAdoptedWeeklyCash} from "./adopted-weekly-cash";
import {adoptedCovenantHeadroomInputSchema, calculateAdoptedCovenantHeadroom} from "./adopted-covenant-headroom";
import {quarterUpdateExclusions} from "./quarter-update-results";

const key = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,39}$/), words = z.string().trim().min(1).max(2000);
const unsigned = z.string().regex(/^\d{1,24}(?:\.\d{1,20})?$/), ratio = z.string().regex(/^-?\d{1,4}(?:\.\d{1,20})?$/);
const days = z.string().regex(/^-?\d{1,5}(?:\.\d{1,20})?$/), hash = z.string().regex(/^[a-f0-9]{64}$/);

/** The close of one quarter as adopted: the period is the quarter. Structure (units, bridge membership,
 * linked lines, the stream a cause updates, the step order) is given by the composer from adopted values;
 * every figure, date, classification and reference to the prior versions is read from the basis. */
export const adoptedQuarterUpdateInputSchema = adoptedAnalysisContextSchema.safeExtend({
  analysisId: z.uuid(), scenario: z.string().trim().min(1).max(160),
  /** The prior versions this close updates, by the fingerprint of the basis each was adopted on. */
  priorWeeklyFingerprint: selection, priorCovenantFingerprint: selection,
  lines: z.array(z.strictObject({id: key, unit: z.enum(["currency", "days", "ratio"]), label: selection, projected: selection, actual: selection})).min(1).max(24),
  carry: z.strictObject({cashLineId: key, ebitdaLineId: key}),
  bridges: z.array(z.strictObject({lineId: key, causes: z.array(z.strictObject({id: key, equalsDeviationOf: key.nullable(), driverLineId: key.nullable(),
    label: selection, amount: selection, classification: selection, until: selection.nullable(), basis: selection, question: selection.nullable()})).min(1).max(12)})).min(2).max(8),
  streamUpdates: z.array(z.strictObject({streamId: key, causeIds: z.array(key).min(1).max(8), dates: selection, amounts: selection})).max(16),
  addedStreams: z.array(z.strictObject({id: key, label: selection, dates: selection, amounts: selection})).max(4),
  covenant: z.strictObject({measurementId: key, effects: z.array(z.strictObject({causeId: key, ebitda: selection, cash: selection})).max(12)}),
  facilities: z.array(z.strictObject({id: key, label: selection, limit: selection, source: selection})).max(8),
  steps: z.array(z.discriminatedUnion("mode", [
    z.strictObject({facilityId: key, mode: z.literal("fixed"), streamId: key, replacesStreamIds: z.array(key).max(8)}),
    z.strictObject({facilityId: key, mode: z.literal("residual"), date: selection})])).max(4),
  dependents: z.array(z.strictObject({id: key, label: selection, kind: selection, reads: selection, horizonStart: selection, horizonEnd: selection, recomputedBy: selection})).max(16),
}).refine(i => i.endDate > i.openingDate, "Invalid quarter")
  .refine(i => new Set(i.lines.map(l => l.id)).size === i.lines.length, "Duplicate line")
  .refine(i => i.bridges.every(b => i.lines.some(l => l.id === b.lineId)), "A bridge names a line the analysis does not carry");
export type AdoptedQuarterUpdateInput = z.infer<typeof adoptedQuarterUpdateInputSchema>;

/** The prior versions travel as they were adopted, each on its own basis; the update is a third basis. */
export const quarterUpdateAnalysesSchema = z.strictObject({
  prior: z.strictObject({weeklyCash: adoptedWeeklyCashInputSchema, covenant: adoptedCovenantHeadroomInputSchema}),
  update: adoptedQuarterUpdateInputSchema,
});
export type QuarterUpdateAnalyses = z.infer<typeof quarterUpdateAnalysesSchema>;

// Key order differs between a kernel's own output and its rebuilt input; the comparison is on content.
const canonical = (v: unknown): unknown => Array.isArray(v) ? v.map(canonical)
  : v !== null && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical((v as Record<string, unknown>)[k])])) : v;
const fingerprintOf = (value: unknown) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");

/** The kernel input the released weekly cash reader adopted, rebuilt from its own bindings and values
 * and checked by measuring it again: the prior version is read once, by its own reader. */
function priorWeeklyInput(a: z.infer<typeof adoptedWeeklyCashInputSchema>, r: ReturnType<typeof calculateAdoptedWeeklyCash>): WeeklyCashInput {
  const prefix = `weekly_cash.${a.analysisId}.`, bindings = new Map(r.bindings.map(b => [b.operand, b.decisionId]));
  const values = new Map(r.normalization?.values.map(v => [v.decisionId, v.trace?.values ?? null]) ?? []);
  const entries = new Map(r.contributions.map(e => [e.decisionId, e.value.value]));
  const at = (path: string) => {const id = bindings.get(prefix + path); if (!id) throw new Error("quarter_update_prior_operand_missing"); return id;};
  const money = (path: string) => {const v = values.get(at(path)); if (!v) throw new Error("quarter_update_prior_operand_missing"); return v;};
  const plain = <T>(path: string) => entries.get(at(path)) as T;
  const input: WeeklyCashInput = {currency: a.currency, firstMonday: a.openingDate,
    weeks: ((Date.parse(`${a.endDate}T00:00:00Z`) - Date.parse(`${a.openingDate}T00:00:00Z`)) / 86400000 + 1) / 7,
    openingCash: money("openingCash")[0]!, minimumCash: money("minimumCash")[0]!,
    streams: a.streams.map(s => {const p = `stream.${s.id}.`; return {id: s.id, label: plain<string>(p + "label"), category: plain(p + "category"), direction: plain(p + "direction"),
      obligation: s.obligation === null ? null : plain(p + "obligation"), dates: plain<string[]>(p + "dates"), amounts: money(p + "amounts")};}),
    cases: a.cases, actions: a.actions.map(x => {const p = `action.${x.id}.`; return {id: x.id, label: plain<string>(p + "label"), streamId: x.streamId, replacesStreamId: x.replacesStreamId,
      amount: money(p + "amount")[0]!, days: Number(plain(p + "days")), rate: plain<string>(p + "rate"), ratePeriod: plain(p + "ratePeriod"), iofDaily: plain<string>(p + "iofDaily"),
      iofDailyCapDays: Number(plain(p + "iofDailyCapDays")), iofAdditional: plain<string>(p + "iofAdditional"), upfrontFee: plain<string>(p + "upfrontFee"), repaymentDate: plain<string>(p + "repaymentDate")};}),
    projectionClosing: a.projectionClosing ? {date: a.endDate, balance: money("projectionClosing")[0]!} : null,
    calendarEnd: plain<string>("calendarEnd"), covenantTestDate: a.covenantTestDate ? plain<string>("covenantTestDate") : null,
    coverage: Object.fromEntries(Object.keys(a.coverage).map(o => [o, plain(`coverage.${o}`)])) as WeeklyCashInput["coverage"]};
  if (fingerprintOf(buildWeeklyCash(input)) !== fingerprintOf(r.weekly)) throw new Error("quarter_update_prior_not_reproduced");
  return input;
}
/** The covenant test as the released reader measured it carries every operand it was measured on. */
function priorCovenantInput(h: NonNullable<ReturnType<typeof calculateAdoptedCovenantHeadroom>["headroom"]>): CovenantHeadroomInput {
  const input: CovenantHeadroomInput = {currency: h.currency, readingDate: h.readingDate,
    limits: h.limits.map(l => ({id: l.id, label: l.label, kind: l.kind, status: l.status, maximumRatio: l.maximumRatio, source: l.source, testDates: l.testDates})),
    measurements: h.measurements.map(m => ({id: m.id, label: m.label, date: m.date, scenario: m.scenario, role: m.role, debt: m.debt, cash: m.cash,
      reportedEbitda: m.reportedEbitda, adjustments: m.adjustments, unrealizedEbitda: m.unrealizedEbitda, limitIds: m.tests.map(t => t.limitId)})),
    effects: h.effects.map(e => ({id: e.id, label: e.label, measurementId: e.measurementId, withoutEffectMeasurementId: e.withoutEffectMeasurementId}))};
  if (fingerprintOf(measureCovenantHeadroom(input)) !== fingerprintOf(h)) throw new Error("quarter_update_prior_not_reproduced");
  return input;
}

/** The quarter update over three adopted bases: the prior weekly cash and the prior covenant test are
 * read by their own released readers, untouched; the close (lines, causes and their classification,
 * the updated series, the effects until the test, the facilities and the dependents) is read from its
 * own basis, which must name the prior versions by fingerprint. Nothing of the prior is re-adopted. */
export function calculateAdoptedQuarterUpdate(raw: unknown) {
  const {prior, update: input} = quarterUpdateAnalysesSchema.parse(raw), prefix = `quarter_update.${input.analysisId}.`, sc = input.scenario;
  for (const p of [prior.weeklyCash, prior.covenant]) if (p.entityId !== input.entityId || p.perimeter !== input.perimeter || p.currency !== input.currency) throw new Error("quarter_update_prior_context_mismatch");
  const weekly = calculateAdoptedWeeklyCash(prior.weeklyCash), covenant = calculateAdoptedCovenantHeadroom(prior.covenant);
  const lineUnit = new Map(input.lines.map(l => [l.id, l.unit]));
  const monetary = [...input.lines.filter(l => l.unit === "currency").flatMap(l => [l.projected, l.actual]), ...input.bridges.flatMap(b => b.causes.map(c => c.amount)),
    ...input.streamUpdates.map(u => u.amounts), ...input.addedStreams.map(s => s.amounts), ...input.covenant.effects.flatMap(e => [e.ebitda, e.cash]), ...input.facilities.map(f => f.limit)];
  const b = createAnalysisBinding(input, monetary);
  let complete = true;
  const need = <T>(v: T | null): T => {if (v === null) complete = false; return v as T;};
  const read = <T>(s: z.infer<typeof selection>, path: string, unit: string, type: "number" | "text" | "date" | "list", schema: z.ZodType<T>) => b.read(s, prefix + path, sc, unit, type, schema);
  const priorWeeklyFingerprint = need(read(input.priorWeeklyFingerprint, "prior.weeklyCash.fingerprint", "identity", "text", hash));
  const priorCovenantFingerprint = need(read(input.priorCovenantFingerprint, "prior.covenant.fingerprint", "identity", "text", hash));
  // The close updates the versions it names, never another adoption of them.
  if ((priorWeeklyFingerprint !== null && priorWeeklyFingerprint !== prior.weeklyCash.envelope.fingerprint)
    || (priorCovenantFingerprint !== null && priorCovenantFingerprint !== prior.covenant.envelope.fingerprint)) throw new Error("quarter_update_prior_version_mismatch");
  const lineValue = (unit: string) => unit === "currency" ? analysisAmount : unit === "days" ? days : ratio;
  const lines = input.lines.map(l => {const p = `line.${l.id}.`; return {id: l.id, unit: l.unit, label: need(read(l.label, p + "label", "text", "text", words)),
    projected: need(read(l.projected, p + "projected", l.unit, "number", lineValue(l.unit))), actual: need(read(l.actual, p + "actual", l.unit, "number", lineValue(l.unit)))};});
  if (!lineUnit.has(input.carry.cashLineId) || !lineUnit.has(input.carry.ebitdaLineId)) throw new Error("quarter_update_unknown_line");
  const bridges = input.bridges.map(br => ({lineId: br.lineId, causes: br.causes.map(c => {
    const p = `cause.${c.id}.`;
    return {id: c.id, equalsDeviationOf: c.equalsDeviationOf, driverLineId: c.driverLineId,
      label: need(read(c.label, p + "label", "text", "text", words)), amount: need(read(c.amount, p + "amount", "currency", "number", analysisAmount)),
      classification: need(read(c.classification, p + "classification", "convention", "text", z.enum(["calendar", "structural"]))),
      until: c.until === null ? null : need(read(c.until, p + "until", "date", "date", z.iso.date())),
      basis: need(read(c.basis, p + "basis", "convention", "text", z.enum(["document", "interpretation"]))),
      question: c.question === null ? null : need(read(c.question, p + "question", "text", "text", words))};
  })}));
  const updates = input.streamUpdates.map(u => {const p = `streamUpdate.${u.streamId}.`; return {streamId: u.streamId, causeIds: u.causeIds,
    dates: need(read(u.dates, p + "dates", "date", "list", z.array(z.iso.date()).min(1).max(2000))), amounts: need(read(u.amounts, p + "amounts", "currency", "list", z.array(unsigned).min(1).max(2000)))};});
  const added = input.addedStreams.map(s => {const p = `added.${s.id}.`; return {id: s.id, label: need(read(s.label, p + "label", "text", "text", words)),
    category: "operating" as const, direction: "inflow" as const, obligation: null,
    dates: need(read(s.dates, p + "dates", "date", "list", z.array(z.iso.date()).min(1).max(2000))), amounts: need(read(s.amounts, p + "amounts", "currency", "list", z.array(unsigned).min(1).max(2000)))};});
  const effects = input.covenant.effects.map(e => {const p = `effect.${e.causeId}.`; return {causeId: e.causeId,
    ebitda: need(read(e.ebitda, p + "ebitda", "currency", "number", analysisAmount)), cash: need(read(e.cash, p + "cash", "currency", "number", analysisAmount))};});
  const facilities = input.facilities.map(f => {const p = `facility.${f.id}.`; return {id: f.id, label: need(read(f.label, p + "label", "text", "text", words)),
    limit: need(read(f.limit, p + "limit", "currency", "number", unsigned)), source: need(read(f.source, p + "source", "text", "text", words))};});
  const steps = input.steps.map(s => s.mode === "fixed" ? s : {facilityId: s.facilityId, mode: s.mode, date: need(read(s.date, `step.${s.facilityId}.date`, "date", "date", z.iso.date()))});
  const dependents = input.dependents.map(d => {const p = `dependent.${d.id}.`; const by = need(read(d.recomputedBy, p + "recomputedBy", "convention", "text", z.enum(["weekly_cash", "covenant", "projection", "none"])));
    return {id: d.id, label: need(read(d.label, p + "label", "text", "text", words)), kind: need(read(d.kind, p + "kind", "convention", "text", z.enum(["analysis", "plan", "material"]))),
      reads: need(read(d.reads, p + "reads", "identity", "list", z.array(key).max(24))), horizonStart: need(read(d.horizonStart, p + "horizonStart", "date", "date", z.iso.date())),
      horizonEnd: need(read(d.horizonEnd, p + "horizonEnd", "date", "date", z.iso.date())), recomputedBy: by === "none" ? null : by};});
  const priorComplete = weekly.weekly !== null && covenant.headroom !== null;
  const kernelInput: QuarterUpdateInput | null = complete && priorComplete ? {currency: input.currency, quarterStart: input.openingDate, quarterEnd: input.endDate,
    lines, bridges, carry: input.carry,
    prior: {weeklyCash: priorWeeklyInput(prior.weeklyCash, weekly), covenant: priorCovenantInput(covenant.headroom!)},
    weekly: {updates, added}, covenant: {measurementId: input.covenant.measurementId, effects}, facilities, steps, dependents} : null;
  const update = kernelInput ? updateAfterQuarterClose(kernelInput) : null;
  const reference = (r: {analysisId: string; basisFingerprint: string; fingerprint: string}, done: boolean) =>
    ({analysisId: r.analysisId, basisFingerprint: r.basisFingerprint, resultFingerprint: r.fingerprint, complete: done});
  // A prior version that is not complete is a gap of this update, named by its own operand.
  const gaps = [...b.gaps, ...weekly.weekly ? [] : weekly.gaps, ...covenant.headroom ? [] : covenant.gaps];
  const payload = {schemaVersion: "adopted-quarter-update.v1" as const, financialCoreVersion, scope: input.scope, analysisId: input.analysisId,
    entityId: input.entityId, perimeter: input.perimeter, currency: input.currency, basisFingerprint: input.envelope.fingerprint,
    prior: {weeklyCash: reference(weekly, weekly.weekly !== null), covenant: reference(covenant, covenant.headroom !== null)}, update,
    gaps, bindings: b.bindings, normalization: b.normalization, contributions: [...b.used.values()],
    status: update ? "partial_composition" as const : "missing_inputs" as const,
    derivedDependencies: [{result: "quarter_update", decisionIds: [...b.used.keys()]}],
    classification: [...b.used.values()].some(e => e.kind === "hypothesis") ? "working_hypothesis" as const : "working_selection" as const,
    exclusions: quarterUpdateExclusions, grantsExecution: false as const, grantsPublication: false as const};
  return {...payload, fingerprint: createHash("sha256").update(JSON.stringify(payload)).digest("hex")};
}
