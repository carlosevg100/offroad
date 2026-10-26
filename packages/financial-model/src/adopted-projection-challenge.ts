import {createHash} from "node:crypto";
import {z} from "zod";
import {challengeProjection, financialCoreVersion, projectionCaseDrivers, projectionPeriodDrivers,
  type ProjectionChallengeInput, type ProjectionDriver, type ProjectionDriverCase} from "@offroad/financial-core";
import {adoptedValueSelectionSchema as selection} from "./adopted-debt-inputs";
import {adoptedAnalysisContextSchema, createAnalysisBinding} from "./adopted-analysis-binding";
import {projectionChallengeExclusions} from "./projection-challenge-results";

const key = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/), scenario = z.string().trim().min(1).max(160);
const words = z.string().trim().min(1).max(2000), periodId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,59}$/);
const unsigned = z.string().regex(/^\d{1,24}(?:\.\d{1,20})?$/), ratio = z.string().regex(/^\d{1,4}(?:\.\d{1,20})?$/);
const drivers = [...projectionPeriodDrivers, ...projectionCaseDrivers] as [ProjectionDriver, ...ProjectionDriver[]];
const caseSelection = z.strictObject(Object.fromEntries(drivers.map(d => [d, selection])) as Record<ProjectionDriver, typeof selection>);

/** The reference built by drivers and the company's plan, each in its own scenario, over the same periods.
 * Period drivers are adopted as lists in period order; case drivers as single values. */
export const adoptedProjectionChallengeInputSchema = adoptedAnalysisContextSchema.safeExtend({
  analysisId: z.uuid(), scenario, referenceScenario: scenario, planScenario: scenario,
  periodIds: selection, targetPeriodId: selection, dayBasis: selection, unitConvention: selection,
  reference: caseSelection, plan: caseSelection,
  assumptions: z.array(z.strictObject({id: key, label: selection, drivers: selection,
    /** The yardstick the assumption is read against (history, inflation, capacity, contracts). */
    ruler: selection,
    /** What would sustain the assumption before a credit committee, and whether the company has shown it. */
    evidence: selection, evidenceStatus: selection})).min(1).max(12),
  /** Installed capacity; null when not informed, and the packet names that gap. */
  capacity: z.strictObject({maximumQuantity: selection, investmentInPlan: selection, source: selection}).nullable(),
  /** The cause the plan states for its margin, when it states one. */
  marginCause: selection.nullable(),
  requestedReceivableDays: selection.nullable(), premiumOverAverage: selection.nullable(),
}).refine(i => i.endDate > i.openingDate, "Invalid horizon")
  .refine(i => new Set([i.referenceScenario, i.planScenario]).size === 2, "Reference and plan need their own scenarios")
  .refine(i => new Set(i.assumptions.map(a => a.id)).size === i.assumptions.length, "Duplicate assumption");
export type AdoptedProjectionChallengeInput = z.infer<typeof adoptedProjectionChallengeInputSchema>;

/** A projection challenge over one adopted basis: both cases' drivers, the periods, the target, each
 * assumption with its drivers, yardstick and evidence, the capacity and the plan's stated margin cause
 * are adopted contributions. Nothing is filled in: an absent operand is a gap and the challenge is not run. */
export function calculateAdoptedProjectionChallenge(raw: unknown) {
  const input = adoptedProjectionChallengeInputSchema.parse(raw), prefix = `projection_challenge.${input.analysisId}.`, top = input.scenario;
  const monetaryKeys = ["fixedCosts", "interestExpense", "maintenanceCapex", "leasePayments", "depreciation"] as const;
  const b = createAnalysisBinding(input, [input.reference, input.plan].flatMap(c => monetaryKeys.map(k => c[k])));
  let complete = true;
  const need = <T>(v: T | null): T => {if (v === null) complete = false; return v as T;};
  const read = <T>(s: z.infer<typeof selection>, path: string, sc: string, unit: string, type: "number" | "text" | "date" | "boolean" | "list", schema: z.ZodType<T>) =>
    b.read(s, prefix + path, sc, unit, type, schema);
  const periods = need(read(input.periodIds, "periodIds", top, "identity", "list", z.array(periodId).min(2).max(20)));
  const target = need(read(input.targetPeriodId, "targetPeriodId", top, "identity", "text", periodId));
  const dayBasis = need(read(input.dayBasis, "dayBasis", top, "convention", "text", z.enum(["360", "365"])));
  const unitConvention = read(input.unitConvention, "unitConvention", top, "text", "text", words);
  if (unitConvention === null) complete = false;
  const readCase = (c: typeof input.reference, id: "reference" | "plan", sc: string) => {
    const p = `case.${id}.`, list = (k: string, unit: string) => need(read(c[k as ProjectionDriver], p + k, sc, unit, "list", z.array(unsigned).min(2).max(20)));
    const series = {quantity: list("quantity", "quantity"), netUnitPrice: list("netUnitPrice", "unit_price"), variableUnitCost: list("variableUnitCost", "unit_price"),
      fixedCosts: list("fixedCosts", "currency"), interestExpense: list("interestExpense", "currency")};
    const one = (k: ProjectionDriver, unit: string, schema: z.ZodType<string>) => need(read(c[k], p + k, sc, unit, "number", schema));
    const scalars = {receivableDays: one("receivableDays", "days", unsigned), inventoryDays: one("inventoryDays", "days", unsigned), payableDays: one("payableDays", "days", unsigned),
      maintenanceCapex: one("maintenanceCapex", "currency", unsigned), leasePayments: one("leasePayments", "currency", unsigned),
      depreciation: one("depreciation", "currency", unsigned), taxRate: one("taxRate", "ratio", ratio)};
    if (!complete || periods === null) return null;
    if (Object.values(series).some(v => v.length !== periods.length)) throw new Error("projection_challenge_period_length");
    return {...scalars, periods: periods.map((pid, i) => ({id: pid, quantity: series.quantity[i]!, netUnitPrice: series.netUnitPrice[i]!,
      variableUnitCost: series.variableUnitCost[i]!, fixedCosts: series.fixedCosts[i]!, interestExpense: series.interestExpense[i]!}))} as ProjectionDriverCase;
  };
  const reference = readCase(input.reference, "reference", input.referenceScenario);
  const plan = readCase(input.plan, "plan", input.planScenario);
  const assumptions = input.assumptions.map(a => {
    const p = `assumption.${a.id}.`;
    return {id: a.id, label: need(read(a.label, p + "label", top, "text", "text", words)),
      drivers: need(read(a.drivers, p + "drivers", top, "identity", "list", z.array(z.enum(drivers)).min(1).max(12))),
      ruler: read(a.ruler, p + "ruler", top, "text", "text", words),
      evidence: read(a.evidence, p + "evidence", top, "text", "list", z.array(words).min(1).max(8)),
      evidenceStatus: read(a.evidenceStatus, p + "evidenceStatus", top, "convention", "text", z.enum(["documented", "not_presented"]))};
  });
  const capacity = input.capacity === null ? null : {
    maximumQuantity: read(input.capacity.maximumQuantity, "capacity.maximumQuantity", top, "quantity", "number", unsigned),
    investmentInPlan: read(input.capacity.investmentInPlan, "capacity.investmentInPlan", top, "convention", "boolean", z.boolean()),
    source: read(input.capacity.source, "capacity.source", top, "text", "text", words)};
  if (capacity && (capacity.maximumQuantity === null || capacity.investmentInPlan === null)) complete = false;
  const marginCause = input.marginCause ? read(input.marginCause, "marginCause", top, "text", "text", words) : null;
  const requested = input.requestedReceivableDays ? need(read(input.requestedReceivableDays, "requestedReceivableDays", top, "days", "number", unsigned)) : null;
  const premium = input.premiumOverAverage ? need(read(input.premiumOverAverage, "premiumOverAverage", top, "ratio", "number", ratio)) : null;
  const kernelInput: ProjectionChallengeInput | null = complete && reference && plan ? {currency: input.currency, dayBasis, targetPeriodId: target, reference, plan,
    assumptions: assumptions.map(a => ({id: a.id, label: a.label, drivers: a.drivers})),
    capacity: capacity === null ? null : {maximumQuantity: capacity.maximumQuantity!, investmentInPlan: capacity.investmentInPlan!},
    requestedReceivableDays: requested, premiumOverAverage: premium} : null;
  const challenge = kernelInput ? challengeProjection(kernelInput) : null;
  const payload = {schemaVersion: "adopted-projection-challenge.v1" as const, financialCoreVersion, scope: input.scope, analysisId: input.analysisId,
    entityId: input.entityId, perimeter: input.perimeter, currency: input.currency, basisFingerprint: input.envelope.fingerprint, unitConvention, challenge,
    assumptions: assumptions.map(a => ({assumptionId: a.id, ruler: a.ruler, evidenceThatWouldSustain: a.evidence, evidenceStatus: a.evidenceStatus})),
    capacitySource: capacity?.source ?? null, marginCause,
    gaps: b.gaps, bindings: b.bindings, normalization: b.normalization, contributions: [...b.used.values()],
    status: challenge ? "partial_composition" as const : "missing_inputs" as const,
    derivedDependencies: [{result: "projection_challenge", decisionIds: [...b.used.keys()]}],
    classification: [...b.used.values()].some(e => e.kind === "hypothesis") ? "working_hypothesis" as const : "working_selection" as const,
    exclusions: projectionChallengeExclusions, grantsExecution: false as const, grantsPublication: false as const};
  return {...payload, fingerprint: createHash("sha256").update(JSON.stringify(payload)).digest("hex")};
}
