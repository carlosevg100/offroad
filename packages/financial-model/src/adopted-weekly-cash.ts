import {createHash} from "node:crypto";
import {z} from "zod";
import {buildWeeklyCash, financialCoreVersion, weeklyCashObligations, type WeeklyCashInput} from "@offroad/financial-core";
import {adoptedValueSelectionSchema as selection} from "./adopted-debt-inputs";
import {adoptedAnalysisContextSchema, analysisAmount, createAnalysisBinding} from "./adopted-analysis-binding";

const key = z.string().trim().min(1).max(160), label = z.string().trim().min(1).max(300);
const words = z.string().trim().min(1).max(2000);
const unsigned = z.string().regex(/^\d{1,24}(?:\.\d{1,20})?$/), ratio = z.string().regex(/^\d{1,4}(?:\.\d{1,20})?$/);

/** The weeks run from the opening date (a Monday) to the end date (a Sunday). Streams carry their
 * dates and amounts as adopted lists; cases are sets of streams; actions are costed premises. */
export const adoptedWeeklyCashInputSchema = adoptedAnalysisContextSchema.safeExtend({
  analysisId: z.uuid(), scenario: z.string().trim().min(1).max(160),
  openingCash: selection, minimumCash: selection, projectionClosing: selection.nullable(), calendarEnd: selection, covenantTestDate: selection.nullable(),
  streams: z.array(z.strictObject({id: key, label: selection, category: selection, direction: selection, obligation: selection.nullable(), dates: selection, amounts: selection})).min(1).max(40),
  cases: z.array(z.strictObject({id: key, label, role: z.enum(["informed", "alternative"]), streamIds: z.array(key).min(1).max(40)})).min(1).max(8),
  actions: z.array(z.strictObject({id: key, label: selection, streamId: key, replacesStreamId: key.nullable(), amount: selection, days: selection, rate: selection, ratePeriod: selection,
    iofDaily: selection, iofDailyCapDays: selection, iofAdditional: selection, upfrontFee: selection, repaymentDate: selection})).max(4),
  /** Whether each obligation the answer cannot leave out is in the streams, does not apply, or was not examined. */
  coverage: z.strictObject(Object.fromEntries(weeklyCashObligations.map(o => [o, selection])) as Record<typeof weeklyCashObligations[number], typeof selection>),
}).refine(i => i.endDate > i.openingDate, "Invalid horizon")
  .refine(i => new Set(i.streams.map(s => s.id)).size === i.streams.length, "Duplicate stream")
  .refine(i => i.cases.every(c => c.streamIds.every(id => i.streams.some(s => s.id === id))), "A case names a stream the analysis does not carry")
  .refine(i => i.actions.every(a => i.streams.some(s => s.id === a.streamId)), "An action names a stream the analysis does not carry");
export type AdoptedWeeklyCashInput = z.infer<typeof adoptedWeeklyCashInputSchema>;

/** Weekly cash over one adopted basis: every date, amount, classification, threshold and action
 * premise is an adopted contribution read in its own context; case composition is the composer's. */
export function calculateAdoptedWeeklyCash(raw: unknown) {
  const input = adoptedWeeklyCashInputSchema.parse(raw), prefix = `weekly_cash.${input.analysisId}.`, sc = input.scenario;
  const days = (Date.parse(`${input.endDate}T00:00:00Z`) - Date.parse(`${input.openingDate}T00:00:00Z`)) / 86400000 + 1;
  if (days % 7 !== 0) throw new Error("weekly_cash_horizon_not_whole_weeks");
  const monetary = [input.openingCash, input.minimumCash, ...input.projectionClosing ? [input.projectionClosing] : [], ...input.streams.map(s => s.amounts), ...input.actions.map(a => a.amount)];
  const b = createAnalysisBinding(input, monetary);
  let complete = true;
  const need = <T>(v: T | null): T => {if (v === null) complete = false; return v as T;};
  const read = <T>(s: z.infer<typeof selection>, path: string, unit: string, type: "number" | "text" | "date" | "list", schema: z.ZodType<T>) => b.read(s, prefix + path, sc, unit, type, schema);
  const streams = input.streams.map(s => {
    const p = `stream.${s.id}.`;
    return {id: s.id, label: need(read(s.label, p + "label", "text", "text", words)),
      category: need(read(s.category, p + "category", "convention", "text", z.enum(["debt", "statutory", "operating", "action"]))),
      direction: need(read(s.direction, p + "direction", "convention", "text", z.enum(["inflow", "outflow"]))),
      obligation: s.obligation === null ? null : need(read(s.obligation, p + "obligation", "convention", "text", z.enum(weeklyCashObligations))),
      dates: need(read(s.dates, p + "dates", "date", "list", z.array(z.iso.date()).min(1).max(2000))),
      amounts: need(read(s.amounts, p + "amounts", "currency", "list", z.array(unsigned).min(1).max(2000)))};
  });
  const actions = input.actions.map(a => {
    const p = `action.${a.id}.`;
    return {id: a.id, label: need(read(a.label, p + "label", "text", "text", words)), streamId: a.streamId, replacesStreamId: a.replacesStreamId,
      amount: need(read(a.amount, p + "amount", "currency", "number", unsigned)),
      days: need(read(a.days, p + "days", "days", "number", z.string().regex(/^\d{1,4}$/))),
      rate: need(read(a.rate, p + "rate", "ratio", "number", ratio)),
      ratePeriod: need(read(a.ratePeriod, p + "ratePeriod", "convention", "text", z.enum(["annual", "monthly"]))),
      iofDaily: need(read(a.iofDaily, p + "iofDaily", "ratio", "number", ratio)),
      iofDailyCapDays: need(read(a.iofDailyCapDays, p + "iofDailyCapDays", "days", "number", z.string().regex(/^\d{1,4}$/))),
      iofAdditional: need(read(a.iofAdditional, p + "iofAdditional", "ratio", "number", ratio)),
      upfrontFee: need(read(a.upfrontFee, p + "upfrontFee", "ratio", "number", ratio)),
      repaymentDate: need(read(a.repaymentDate, p + "repaymentDate", "date", "date", z.iso.date()))};
  });
  const opening = need(read(input.openingCash, "openingCash", "currency", "number", analysisAmount));
  const minimum = need(read(input.minimumCash, "minimumCash", "currency", "number", analysisAmount));
  const closing = input.projectionClosing ? read(input.projectionClosing, "projectionClosing", "currency", "number", analysisAmount) : null;
  const calendarEnd = need(read(input.calendarEnd, "calendarEnd", "date", "date", z.iso.date()));
  const testDate = input.covenantTestDate ? read(input.covenantTestDate, "covenantTestDate", "date", "date", z.iso.date()) : null;
  const coverage = Object.fromEntries(weeklyCashObligations.map(o => [o, need(read(input.coverage[o], `coverage.${o}`, "convention", "text", z.enum(["included", "not_applicable", "not_examined"])))])) as WeeklyCashInput["coverage"];
  const kernelInput: WeeklyCashInput | null = complete ? {coverage, currency: input.currency, firstMonday: input.openingDate, weeks: days / 7, openingCash: opening, minimumCash: minimum,
    streams, cases: input.cases, actions: actions.map(a => ({...a, days: Number(a.days), iofDailyCapDays: Number(a.iofDailyCapDays)})),
    projectionClosing: closing === null ? null : {date: input.endDate, balance: closing}, calendarEnd, covenantTestDate: testDate} : null;
  const weekly = kernelInput ? buildWeeklyCash(kernelInput) : null;
  const payload = {schemaVersion: "adopted-weekly-cash.v1" as const, financialCoreVersion, scope: input.scope, analysisId: input.analysisId,
    entityId: input.entityId, perimeter: input.perimeter, currency: input.currency, basisFingerprint: input.envelope.fingerprint, weekly,
    gaps: b.gaps, bindings: b.bindings, normalization: b.normalization, contributions: [...b.used.values()],
    status: weekly ? "partial_composition" as const : "missing_inputs" as const,
    derivedDependencies: [{result: "weekly_cash", decisionIds: [...b.used.keys()]}],
    classification: [...b.used.values()].some(e => e.kind === "hypothesis") ? "working_hypothesis" as const : "working_selection" as const,
    exclusions: ["business_day_inference", "intraday_liquidity", "receivables_assignment_eligibility", "credit_approval", "method_release"] as const,
    grantsExecution: false as const, grantsPublication: false as const};
  return {...payload, fingerprint: createHash("sha256").update(JSON.stringify(payload)).digest("hex")};
}
