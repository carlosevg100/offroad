import {createHash} from "node:crypto";
import {z} from "zod";
import {financialCoreVersion, measureCovenantHeadroom, type CovenantHeadroomInput} from "@offroad/financial-core";
import {adoptedValueSelectionSchema as selection} from "./adopted-debt-inputs";
import {adoptedAnalysisContextSchema, analysisAmount, createAnalysisBinding} from "./adopted-analysis-binding";

const key = z.string().trim().min(1).max(160), label = z.string().trim().min(1).max(300);
const words = z.string().trim().min(1).max(2000);
const unsigned = z.string().regex(/^\d{1,24}(?:\.\d{1,20})?$/);
const ratio = z.string().regex(/^\d{1,4}(?:\.\d{1,20})?$/);

export const adoptedCovenantHeadroomInputSchema = adoptedAnalysisContextSchema.safeExtend({
  analysisId: z.uuid(), scenario: z.string().trim().min(1).max(160), readingDate: z.iso.date(),
  limits: z.array(z.strictObject({id: key, kind: selection, status: selection, testDates: selection, label: selection, maximumRatio: selection, source: selection,
    /** The EBITDA definition the limit is measured on; for a board policy it is often unwritten, and then it is a question. */
    definition: selection})).min(1).max(6),
  measurements: z.array(z.strictObject({id: key, label, role: z.enum(["test", "contrast"]), limitIds: z.array(key).max(6),
    date: selection, scenario: z.string().trim().min(1).max(160), debt: selection, cash: selection, reportedEbitda: selection,
    adjustments: z.array(z.strictObject({id: key, label: selection, amount: selection})).max(8),
    unrealizedEbitda: selection.nullable()})).min(1).max(12),
  effects: z.array(z.strictObject({id: key, label, measurementId: key, withoutEffectMeasurementId: key})).max(4),
  /** What happens on a breach, as the contract states it, and what follows from it. */
  consequence: z.strictObject({acceleration: selection, process: selection, crossDefault: selection}),
}).refine(i => i.endDate > i.openingDate, "Invalid horizon")
  .refine(i => new Set(i.limits.map(l => l.id)).size === i.limits.length, "Duplicate limit")
  .refine(i => new Set(i.measurements.map(m => m.id)).size === i.measurements.length, "Duplicate measurement");
export type AdoptedCovenantHeadroomInput = z.infer<typeof adoptedCovenantHeadroomInputSchema>;

/** Covenant headroom over one adopted basis. Debt, cash, reported EBITDA and each adjustment at each
 * date are adopted contributions read in their own scenario; limits, their definitions and the
 * consequence are adopted terms. An unwritten definition is returned as an open question. */
export function calculateAdoptedCovenantHeadroom(raw: unknown) {
  const input = adoptedCovenantHeadroomInputSchema.parse(raw), prefix = `covenant.${input.analysisId}.`;
  const monetary = input.measurements.flatMap(m => [m.debt, m.cash, m.reportedEbitda, ...m.adjustments.map(a => a.amount), ...m.unrealizedEbitda ? [m.unrealizedEbitda] : []]);
  const b = createAnalysisBinding(input, monetary, {inheritedScenario: input.scenario});
  let complete = true;
  const need = <T>(v: T | null): T => {if (v === null) complete = false; return v as T;};
  const read = <T>(s: z.infer<typeof selection>, path: string, scenario: string, unit: string, type: "number" | "text" | "date" | "list", schema: z.ZodType<T>) =>
    b.read(s, prefix + path, scenario, unit, type, schema);
  const sc = input.scenario;
  const openQuestions: {limitId: string; question: string}[] = [];
  const limits = input.limits.map(l => {
    const p = `limit.${l.id}.`;
    const definition = read(l.definition, p + "definition", sc, "text", "text", words);
    // A limit whose definition is not written still binds; how it is measured is asked, never assumed.
    if (definition === null) openQuestions.push({limitId: l.id, question: "ebitda_definition_not_written"});
    return {id: l.id, kind: need(read(l.kind, p + "kind", sc, "convention", "text", z.enum(["contractual", "board_policy"]))),
      status: need(read(l.status, p + "status", sc, "convention", "text", z.enum(["in_force", "superseded"]))),
      testDates: need(read(l.testDates, p + "testDates", sc, "date", "list", z.array(z.iso.date()).max(24))),
      label: need(read(l.label, p + "label", sc, "text", "text", words)), maximumRatio: need(read(l.maximumRatio, p + "maximumRatio", sc, "ratio", "number", ratio)),
      source: need(read(l.source, p + "source", sc, "text", "text", words)), definition};
  });
  const measurements = input.measurements.map(m => {
    const p = `measurement.${m.id}.`;
    if (m.limitIds.some(id => !input.limits.some(l => l.id === id))) throw new Error("covenant_unknown_limit");
    return {id: m.id, label: m.label, role: m.role, scenario: m.scenario, limitIds: m.limitIds,
      date: need(read(m.date, p + "date", m.scenario, "date", "date", z.iso.date())),
      debt: need(read(m.debt, p + "debt", m.scenario, "currency", "number", unsigned)),
      cash: need(read(m.cash, p + "cash", m.scenario, "currency", "number", analysisAmount)),
      reportedEbitda: need(read(m.reportedEbitda, p + "reportedEbitda", m.scenario, "currency", "number", analysisAmount)),
      adjustments: m.adjustments.map(a => ({label: need(read(a.label, p + `adjustment.${a.id}.label`, m.scenario, "text", "text", words)),
        amount: need(read(a.amount, p + `adjustment.${a.id}.amount`, m.scenario, "currency", "number", analysisAmount))})),
      unrealizedEbitda: m.unrealizedEbitda ? need(read(m.unrealizedEbitda, p + "unrealizedEbitda", m.scenario, "currency", "number", analysisAmount)) : null};
  });
  const consequence = {acceleration: read(input.consequence.acceleration, "consequence.acceleration", sc, "convention", "text", z.enum(["automatic", "non_automatic"])),
    process: read(input.consequence.process, "consequence.process", sc, "text", "text", words),
    crossDefault: read(input.consequence.crossDefault, "consequence.crossDefault", sc, "text", "text", words)};
  const kernelInput: CovenantHeadroomInput | null = complete ? {currency: input.currency, readingDate: input.readingDate,
    limits: limits.map(({definition: _, ...l}) => l), measurements, effects: input.effects} : null;
  const headroom = kernelInput ? measureCovenantHeadroom(kernelInput) : null;
  const payload = {schemaVersion: "adopted-covenant-headroom.v1" as const, financialCoreVersion, scope: input.scope, analysisId: input.analysisId,
    entityId: input.entityId, perimeter: input.perimeter, currency: input.currency, readingDate: input.readingDate,
    basisFingerprint: input.envelope.fingerprint, headroom,
    definitions: limits.map(l => ({limitId: l.id, definition: l.definition})), openQuestions, consequence,
    gaps: b.gaps, bindings: b.bindings, normalization: b.normalization, contributions: [...b.used.values()],
    status: headroom ? "partial_composition" as const : "missing_inputs" as const,
    derivedDependencies: [{result: "covenant_headroom", decisionIds: [...b.used.keys()]}],
    classification: [...b.used.values()].some(e => e.kind === "hypothesis") ? "working_hypothesis" as const : "working_selection" as const,
    exclusions: ["projection", "contract_extraction", "waiver_negotiation", "credit_approval", "method_release"] as const,
    grantsExecution: false as const, grantsPublication: false as const};
  return {...payload, fingerprint: createHash("sha256").update(JSON.stringify(payload)).digest("hex")};
}
