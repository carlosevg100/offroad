import {createHash} from "node:crypto";
import {z} from "zod";
import {buildDriverOperatingProjection, financialCoreVersion, actualOperatingDriverNames, projectedOperatingDriverNames,
  type DriverOperatingProjectionInput, type ProjectedOperatingDriver} from "@offroad/financial-core";
import {adoptedValueSelectionSchema as selection} from "./adopted-debt-inputs";
import {adoptedAnalysisContextSchema, createAnalysisBinding} from "./adopted-analysis-binding";

const key = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/), scenarioKey = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,59}$/);
const label = z.string().trim().min(1).max(300), words = z.string().trim().min(1).max(2000);
/** Volumes, unit prices, days and money carry at most eight decimals; rates up to twenty. */
const operand = z.string().regex(/^\d{1,24}(?:\.\d{1,8})?$/), signedOperand = z.string().regex(/^-?\d{1,24}(?:\.\d{1,8})?$/);
const rate = z.string().regex(/^\d{1,4}(?:\.\d{1,20})?$/), signedRate = z.string().regex(/^-?\d{1,4}(?:\.\d{1,20})?$/);
export const operatingProjectionOrigins = ["document", "informed", "house", "estimate"] as const;
const origin = z.enum(operatingProjectionOrigins);
/** Unit of each driver in the adopted basis. Volume times unit price is revenue in the basis' currency scale. */
export const operatingProjectionDriverUnits: Record<ProjectedOperatingDriver, string> = {volume: "quantity", netUnitPrice: "currency_per_unit",
  inputCostPerUnit: "currency_per_unit", otherVariableCostPerUnit: "currency_per_unit", fixedCosts: "currency", receivableDays: "days",
  inventoryDays: "days", payableDays: "days", maintenanceCapex: "currency", leasePayments: "currency", depreciation: "currency",
  interestExpense: "currency", taxRate: "ratio"};
const selectors = <K extends string>(keys: readonly K[]) => z.strictObject(Object.fromEntries(keys.map((k) => [k, selection])) as Record<K, typeof selection>);
const sourced = z.strictObject({value: selection, origin: selection});
/** Items of the actual year whose origin is adopted one by one. */
export const actualOperatingItems = [...actualOperatingDriverNames, "reportedRevenue", "reportedEbitda"] as const;

export const adoptedDriverProjectionInputSchema = adoptedAnalysisContextSchema.safeExtend({
  analysisId: z.uuid(), scenario: scenarioKey,
  /** What the projection is for; it bounds where the work ends. */
  purpose: selection,
  periodEnds: selection,
  conventions: z.strictObject({dayCountBasis: selection, calibrationTolerance: selection}),
  /** The actual year's operands and the adopted origin of each; reproducing them proves arithmetic, not origin. */
  actual: z.strictObject({periodStart: selection, periodEnd: selection, drivers: selectors(actualOperatingDriverNames),
    reportedRevenue: selection, reportedEbitda: selection, origins: selectors(actualOperatingItems)}),
  /** Each base column has a parallel list of origins, one per projected year. */
  base: z.strictObject({drivers: selectors(projectedOperatingDriverNames), origins: selectors(projectedOperatingDriverNames)}),
  scenarios: z.array(z.strictObject({id: key, label, role: z.enum(["alternative", "informed"]), basedOn: key, scenario: scenarioKey,
    volumeGrowthRate: sourced.nullable(), volumeFactor: sourced.nullable(),
    overrides: z.array(z.strictObject({driver: z.enum(projectedOperatingDriverNames), values: selection, origin: selection})).max(13),
    inputCostShock: z.strictObject({fromPeriodEnd: selection, rate: selection, passThroughLagMonths: selection, origin: selection}).nullable(),
  })).max(12),
  companyVersions: z.array(z.strictObject({id: key, label, status: selection, periodEnd: selection, metric: selection, value: selection,
    origin: selection, cause: selection})).max(12),
}).refine((i) => i.endDate > i.openingDate, "Invalid horizon")
  .refine((i) => new Set(i.scenarios.map((s) => s.id)).size === i.scenarios.length && !i.scenarios.some((s) => s.id === "base"), "Duplicate scenario")
  .refine((i) => new Set(i.scenarios.map((s) => s.scenario)).size === i.scenarios.length && !i.scenarios.some((s) => s.scenario === i.scenario), "Each scenario needs its own scenario key")
  .refine((i) => i.scenarios.every((s) => new Set(s.overrides.map((o) => o.driver)).size === s.overrides.length), "Duplicate override")
  .refine((i) => new Set(i.companyVersions.map((v) => v.id)).size === i.companyVersions.length, "Duplicate company version");
export type AdoptedDriverProjectionInput = z.infer<typeof adoptedDriverProjectionInputSchema>;
type Origin = z.infer<typeof origin>;
const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);

/** Projection by driver over one adopted basis. Every driver, convention, scenario rule and company
 * version is an adopted contribution, each with its adopted origin, the actual year included: only a
 * document origin is data, and reproducing the actual year proves arithmetic, not origin.
 * A company version must come from the company (document or informed) and is compared, never replaced;
 * a difference without a stated cause is an open question. A missing operand is a gap; when any is
 * missing no projection is computed. */
export function calculateAdoptedDriverProjection(raw: unknown) {
  const input = adoptedDriverProjectionInputSchema.parse(raw), prefix = `operating_projection.${input.analysisId}.`, top = input.scenario;
  const currencyDrivers = projectedOperatingDriverNames.filter((k) => operatingProjectionDriverUnits[k] === "currency");
  const monetary = [input.actual.drivers.fixedCosts, input.actual.reportedRevenue, input.actual.reportedEbitda,
    ...currencyDrivers.map((k) => input.base.drivers[k]),
    ...input.scenarios.flatMap((s) => s.overrides.filter((o) => operatingProjectionDriverUnits[o.driver] === "currency").map((o) => o.values)),
    ...input.companyVersions.map((v) => v.value)];
  const b = createAnalysisBinding(input, monetary, {inheritedScenario: top});
  let complete = true;
  const need = <T>(v: T | null): T => {if (v === null) complete = false; return v as T;};
  const read = <T>(s: z.infer<typeof selection>, path: string, scenario: string, unit: string, type: "number" | "text" | "date" | "list", schema: z.ZodType<T>) =>
    b.read(s, prefix + path, scenario, unit, type, schema);
  const schemaOf = (k: ProjectedOperatingDriver) => k === "taxRate" ? rate : operand;
  const purpose = read(input.purpose, "purpose", top, "text", "text", words);
  const periodEnds = need(read(input.periodEnds, "periodEnds", top, "date", "list", z.array(z.iso.date()).min(1).max(40)));
  const dayCountBasis = need(read(input.conventions.dayCountBasis, "convention.dayCountBasis", top, "convention", "text", z.enum(["360", "365"])));
  const calibrationTolerance = need(read(input.conventions.calibrationTolerance, "convention.calibrationTolerance", top, "ratio", "number", rate));
  const a = input.actual;
  const actualStart = need(read(a.periodStart, "actual.periodStart", top, "date", "date", z.iso.date()));
  const actualEnd = need(read(a.periodEnd, "actual.periodEnd", top, "date", "date", z.iso.date()));
  const actualDrivers = Object.fromEntries(actualOperatingDriverNames.map((k) =>
    [k, need(read(a.drivers[k], `actual.${k}`, top, operatingProjectionDriverUnits[k], "number", operand))])) as Record<(typeof actualOperatingDriverNames)[number], string>;
  const reportedRevenue = need(read(a.reportedRevenue, "actual.reportedRevenue", top, "currency", "number", signedOperand));
  const reportedEbitda = need(read(a.reportedEbitda, "actual.reportedEbitda", top, "currency", "number", signedOperand));
  const actualOrigins = actualOperatingItems.map((item) => ({item, origin: need(read(a.origins[item], `actual.${item}.origin`, top, "origin", "text", origin))}));
  const baseDrivers = Object.fromEntries(projectedOperatingDriverNames.map((k) =>
    [k, need(read(input.base.drivers[k], `base.${k}`, top, operatingProjectionDriverUnits[k], "list", z.array(schemaOf(k)).min(1).max(40)))])) as Record<ProjectedOperatingDriver, string[]>;
  const baseOrigins = Object.fromEntries(projectedOperatingDriverNames.map((k) =>
    [k, need(read(input.base.origins[k], `base.${k}.origins`, top, "origin", "list", z.array(origin).min(1).max(40)))])) as Record<ProjectedOperatingDriver, Origin[]>;
  const toPeriod = (end: string | null) => {
    if (end === null || periodEnds === null) return null;
    if (!periodEnds.includes(end)) throw new Error("operating_projection_unknown_period");
    return end;
  };
  const scenarios = input.scenarios.map((s) => {
    const p = `scenario.${s.id}.`, sc = s.scenario;
    if (s.basedOn !== "base" && !input.scenarios.slice(0, input.scenarios.indexOf(s)).some((x) => x.id === s.basedOn)) throw new Error("operating_projection_unknown_scenario");
    const rule = (r: z.infer<typeof sourced> | null, name: string, schema: z.ZodType<string>) => r === null ? null
      : {value: need(read(r.value, p + name, sc, "ratio", "number", schema)), origin: need(read(r.origin, p + name + ".origin", sc, "origin", "text", origin))};
    const c = s.inputCostShock;
    return {id: s.id, label: s.label, role: s.role, basedOn: s.basedOn,
      volumeGrowthRate: rule(s.volumeGrowthRate, "volumeGrowthRate", signedRate), volumeFactor: rule(s.volumeFactor, "volumeFactor", rate),
      overrides: s.overrides.map((o) => ({driver: o.driver,
        values: need(read(o.values, p + `override.${o.driver}`, sc, operatingProjectionDriverUnits[o.driver], "list", z.array(schemaOf(o.driver)).min(1).max(40))),
        origin: need(read(o.origin, p + `override.${o.driver}.origin`, sc, "origin", "text", origin))})),
      inputCostShock: c === null ? null : {fromPeriodId: toPeriod(need(read(c.fromPeriodEnd, p + "shock.fromPeriodEnd", sc, "date", "date", z.iso.date()))),
        rate: need(read(c.rate, p + "shock.rate", sc, "ratio", "number", signedRate)),
        passThroughLagMonths: need(read(c.passThroughLagMonths, p + "shock.passThroughLagMonths", sc, "months", "number", z.string().regex(/^\d{1,2}$/))),
        origin: need(read(c.origin, p + "shock.origin", sc, "origin", "text", origin))}};
  });
  const openQuestions: {versionId: string; question: "difference_cause_not_stated"}[] = [];
  const companyVersions = input.companyVersions.map((v) => {
    const p = `version.${v.id}.`;
    const from = need(read(v.origin, p + "origin", top, "origin", "text", origin));
    // The company's budget is the company's: a version built by the house or estimated is not one.
    if (from !== null && from !== "document" && from !== "informed") throw new Error("operating_projection_company_version_not_from_company");
    const cause = read(v.cause, p + "cause", top, "text", "text", words);
    if (cause === null) openQuestions.push({versionId: v.id, question: "difference_cause_not_stated"});
    return {id: v.id, label: v.label, origin: from, cause,
      status: need(read(v.status, p + "status", top, "convention", "text", z.enum(["approved", "under_review"]))),
      periodId: toPeriod(need(read(v.periodEnd, p + "periodEnd", top, "date", "date", z.iso.date()))),
      metric: need(read(v.metric, p + "metric", top, "convention", "text", z.enum(["revenue", "ebitda"]))),
      value: need(read(v.value, p + "value", top, "currency", "number", signedOperand))};
  });
  if (periodEnds && Object.values(baseOrigins).some((o) => o !== null && o.length !== periodEnds.length)) throw new Error("operating_projection_column_length");
  const kernelInput: DriverOperatingProjectionInput | null = complete ? {currency: input.currency, dayCountBasis: Number(dayCountBasis) as 360 | 365,
    calibrationTolerance, actual: {id: actualEnd, startDate: actualStart, endDate: actualEnd, drivers: actualDrivers, reportedRevenue, reportedEbitda},
    periods: periodEnds.map((end, i) => ({id: end, startDate: nextDay(i === 0 ? actualEnd : periodEnds[i - 1]!), endDate: end})),
    base: baseDrivers,
    scenarios: scenarios.map((s) => ({id: s.id, label: s.label, role: s.role, basedOn: s.basedOn,
      volumeGrowthRate: s.volumeGrowthRate?.value ?? null, volumeFactor: s.volumeFactor?.value ?? null,
      overrides: Object.fromEntries(s.overrides.map((o) => [o.driver, o.values])),
      inputCostShock: s.inputCostShock && {fromPeriodId: s.inputCostShock.fromPeriodId!, rate: s.inputCostShock.rate, passThroughLagMonths: Number(s.inputCostShock.passThroughLagMonths)}})),
    companyVersions: companyVersions.map((v) => ({id: v.id, label: v.label, status: v.status, periodId: v.periodId!, metric: v.metric, value: v.value}))} : null;
  const projection = kernelInput ? buildDriverOperatingProjection(kernelInput) : null;
  const origins = {actual: actualOrigins, base: projectedOperatingDriverNames.map((driver) => ({driver, origins: baseOrigins[driver]})),
    scenarios: scenarios.map((s) => ({scenarioId: s.id, volumeGrowthRate: s.volumeGrowthRate?.origin ?? null, volumeFactor: s.volumeFactor?.origin ?? null,
      overrides: s.overrides.map((o) => ({driver: o.driver, origin: o.origin})), inputCostShock: s.inputCostShock?.origin ?? null}))};
  const payload = {schemaVersion: "adopted-operating-projection.v1" as const, financialCoreVersion, scope: input.scope, analysisId: input.analysisId,
    entityId: input.entityId, perimeter: input.perimeter, currency: input.currency, basisFingerprint: input.envelope.fingerprint, purpose, projection, origins,
    companyVersions: companyVersions.map((v) => ({versionId: v.id, origin: v.origin, cause: v.cause})), openQuestions,
    gaps: b.gaps, bindings: b.bindings, normalization: b.normalization, contributions: [...b.used.values()],
    status: projection ? "partial_composition" as const : "missing_inputs" as const,
    derivedDependencies: [{result: "operating_projection", decisionIds: [...b.used.keys()]}],
    classification: [...b.used.values()].some((e) => e.kind === "hypothesis") ? "working_hypothesis" as const : "working_selection" as const,
    exclusions: ["financing_recommendation", "budget_replacement", "debt_service", "credit_approval", "method_release"] as const,
    grantsExecution: false as const, grantsPublication: false as const};
  return {...payload, fingerprint: createHash("sha256").update(JSON.stringify(payload)).digest("hex")};
}
