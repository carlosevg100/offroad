import {createHash} from "node:crypto";
import {z} from "zod";
import {actualOperatingDriverNames, financialCoreVersion} from "@offroad/financial-core";
import {adoptedDriverProjectionInputSchema, calculateAdoptedDriverProjection} from "./adopted-operating-projection-drivers";
import {adoptedDriverProjectionOutputSchema} from "./operating-projection-results";

export const operatingProjectionPacketVersion = "2026.10.26-v1";
const text = z.string().trim().min(1).max(2000), key = z.string().trim().min(1).max(160);
const hash = z.string().regex(/^[a-f0-9]{64}$/), decimal = z.string().regex(/^-?\d{1,24}(?:\.\d{1,20})?$/);
const origin = z.enum(["document", "informed", "house", "estimate"]);
/** The three things only the company knows that move a projection by driver; asked while not informed. */
export const operatingProjectionQuestions = ["volume", "pass_through", "receivable_days"] as const;

export const operatingProjectionPacketInputSchema = z.strictObject({
  schemaVersion: z.literal("operating-projection-packet-input.v1"),
  question: text,
  analysis: adoptedDriverProjectionInputSchema,
});
export type OperatingProjectionPacketInput = z.infer<typeof operatingProjectionPacketInputSchema>;

const effects = z.strictObject({ebitda: decimal, cashAvailableForDebt: decimal, changeInWorkingCapital: decimal});
export const operatingProjectionPacketOutputSchema = z.strictObject({
  schemaVersion: z.literal("operating-projection-packet.v1"), executorVersion: z.literal(operatingProjectionPacketVersion), financialCoreVersion: key,
  question: text, basisFingerprint: hash, scope: adoptedDriverProjectionInputSchema.shape.scope, entityId: z.uuid(), currency: z.string().regex(/^[A-Z]{3}$/),
  result: adoptedDriverProjectionOutputSchema,
  /** What the answer must say, in order. */
  readings: z.strictObject({
    purpose: text.nullable(),
    calibration: z.strictObject({periodId: key, reportedRevenue: decimal, modeledRevenue: decimal, reportedEbitda: decimal, modeledEbitda: decimal, reproduces: z.boolean()}),
    projected: z.strictObject({
      base: z.array(z.strictObject({periodId: key, revenue: decimal, ebitda: decimal, margin: decimal.nullable(), changeInWorkingCapital: decimal,
        cashAvailableForDebt: decimal, conversion: decimal.nullable()})).min(1).max(40),
      comparisons: z.array(z.strictObject({versionId: key, status: z.enum(["approved", "under_review"]), periodId: key, metric: z.enum(["revenue", "ebitda"]),
        companyValue: decimal, projectedValue: decimal, difference: decimal, unitPriceEquivalent: decimal.nullable(), cause: text.nullable()})).max(12),
      sensitivities: z.array(z.strictObject({periodId: key, ebitdaPerOnePercentPrice: decimal, ebitdaLossPerOnePercentInputCost: decimal,
        workingCapitalPerReceivableDay: decimal})).min(1).max(40),
      scenarios: z.array(z.strictObject({id: key, role: z.enum(["alternative", "informed"]), basedOn: key,
        rows: z.array(z.strictObject({periodId: key, ebitda: decimal, margin: decimal.nullable(), cashAvailableForDebt: decimal, effects})).min(1).max(40)})).max(12),
      largestCashReduction: z.strictObject({scenarioId: key, periodId: key, cashEffect: decimal, workingCapitalChangeEffect: decimal}).nullable(),
    }).nullable(),
    /** Data and assumptions kept apart: the actual year is data; each projected driver keeps its adopted origin. */
    ledger: z.array(z.strictObject({driver: key, periodId: key, origin: origin.nullable(), nature: z.enum(["data", "assumption"])})).max(1024),
    questions: z.array(z.enum(operatingProjectionQuestions)).max(3),
    openQuestions: z.array(key).max(12),
  }).nullable(),
  gaps: z.array(z.strictObject({operand: text, reason: text})).max(1024),
  status: z.enum(["framed", "partial", "prepared_for_human_review"]),
  exclusions: z.array(z.enum(["financing_recommendation", "debt_service", "credit_approval", "method_release"])).length(4)
    .refine((v) => v.join("|") === "financing_recommendation|debt_service|credit_approval|method_release", "Exact exclusion ledger required"),
  grantsExecution: z.literal(false), grantsPublication: z.literal(false), fingerprint: hash,
});
export type OperatingProjectionPacket = z.infer<typeof operatingProjectionPacketOutputSchema>;
const answered = (o: string | null | undefined) => o === "informed" || o === "document";

/** A projection by driver for a stated purpose: the last actual year rebuilt from its drivers, the base by
 * year with cash available for debt, the company's own budget and revision side by side with the cause
 * of each difference, sensitivities in currency, the scenarios against the one each is based on, data
 * and assumptions kept apart, and at most three questions that only the company can answer. When the
 * last year is not reproduced nothing is projected. It ends at the projection; it does not recommend
 * financing. Deterministic. */
export function prepareOperatingProjectionPacket(raw: unknown): OperatingProjectionPacket {
  const input = operatingProjectionPacketInputSchema.parse(raw);
  const result = adoptedDriverProjectionOutputSchema.parse(calculateAdoptedDriverProjection(input.analysis));
  const r = result.projection;
  const readings = r ? (() => {
    const c = r.calibration, p = r.projection, roles = new Map(input.analysis.scenarios.map((s) => [s.id, s.role]));
    const causes = new Map(result.companyVersions.map((v) => [v.versionId, v.cause]));
    const periodIds = r.projection?.base.map((x) => x.periodId) ?? [];
    const ledger = [...actualOperatingDriverNames.map((driver) => ({driver, periodId: c.periodId, origin: null, nature: "data" as const})),
      ...result.origins.base.flatMap((b) => (b.origins ?? []).map((o, i) => ({driver: b.driver, periodId: periodIds[i] ?? String(i), origin: o,
        nature: o === "document" ? "data" as const : "assumption" as const})))];
    const informed = result.origins.scenarios.filter((s) => roles.get(s.scenarioId) === "informed");
    const baseOf = (d: string) => result.origins.base.find((b) => b.driver === d)?.origins ?? [];
    const questions = operatingProjectionQuestions.filter((q) => q === "volume"
      ? !(baseOf("volume").every(answered) || informed.some((s) => answered(s.volumeGrowthRate) || answered(s.volumeFactor) || s.overrides.some((o) => o.driver === "volume" && answered(o.origin))))
      : q === "pass_through" ? !result.origins.scenarios.some((s) => answered(s.inputCostShock))
        : !(baseOf("receivableDays").every(answered) || informed.some((s) => s.overrides.some((o) => o.driver === "receivableDays" && answered(o.origin)))));
    return {purpose: result.purpose,
      calibration: {periodId: c.periodId, reportedRevenue: c.reportedRevenue, modeledRevenue: c.modeledRevenue, reportedEbitda: c.reportedEbitda,
        modeledEbitda: c.modeledEbitda, reproduces: c.reproduces},
      projected: p ? {
        base: p.base.map((x) => ({periodId: x.periodId, revenue: x.revenue, ebitda: x.ebitda, margin: x.margin, changeInWorkingCapital: x.changeInWorkingCapital,
          cashAvailableForDebt: x.cashAvailableForDebt, conversion: x.conversion})),
        comparisons: p.comparisons.map((x) => ({versionId: x.id, status: x.status, periodId: x.periodId, metric: x.metric, companyValue: x.companyValue,
          projectedValue: x.projectedValue, difference: x.difference, unitPriceEquivalent: x.unitPriceEquivalent, cause: causes.get(x.id) ?? null})),
        sensitivities: p.sensitivities.map((x) => ({periodId: x.periodId, ebitdaPerOnePercentPrice: x.ebitdaPerOnePercentPrice,
          ebitdaLossPerOnePercentInputCost: x.ebitdaLossPerOnePercentInputCost, workingCapitalPerReceivableDay: x.workingCapitalPerReceivableDay})),
        scenarios: p.scenarios.map((s) => ({id: s.id, role: s.role, basedOn: s.basedOn,
          rows: s.rows.map((x) => ({periodId: x.periodId, ebitda: x.ebitda, margin: x.margin, cashAvailableForDebt: x.cashAvailableForDebt, effects: x.effects}))})),
        largestCashReduction: p.largestCashReduction} : null,
      ledger, questions, openQuestions: result.openQuestions.map((q) => q.versionId)};
  })() : null;
  const gaps = result.gaps;
  const status = !readings?.projected ? "framed" as const : gaps.length || result.openQuestions.length ? "partial" as const : "prepared_for_human_review" as const;
  const payload = {schemaVersion: "operating-projection-packet.v1" as const, executorVersion: operatingProjectionPacketVersion, financialCoreVersion,
    question: input.question, basisFingerprint: result.basisFingerprint, scope: result.scope, entityId: result.entityId, currency: result.currency,
    result, readings, gaps, status,
    exclusions: ["financing_recommendation", "debt_service", "credit_approval", "method_release"] as const,
    grantsExecution: false as const, grantsPublication: false as const};
  return operatingProjectionPacketOutputSchema.parse({...payload, fingerprint: createHash("sha256").update(JSON.stringify(payload)).digest("hex")});
}
