import {createHash} from "node:crypto";
import {z} from "zod";
import {buildInvestmentProject, calculateStartupWorkingCapital, calculateProjectRampExposure,
  valueInvestmentProject, projectCompanyWithAndWithoutInvestment, financialCoreVersion,
  startupWorkingCapitalInputSchema, investmentProjectPeriodSchema, companyCounterfactualInputSchema,
  projectValuationInputSchema, investmentProjectInputSchema} from "@offroad/financial-core";
import {adoptedValueSelectionSchema as selection} from "./adopted-debt-inputs";
import {adoptedAnalysisContextSchema, analysisAmount, analysisReference, createAnalysisBinding} from "./adopted-analysis-binding";

const stockNames = ["receivables", "inventory", "newPayables", "lostSupplierCredit"] as const;
const projectMoney = ["annualNetRevenue", "annualAvoidedOperatingCost", "annualVariableOperatingCost",
  "annualFixedOperatingCost", "annualMaintenanceCapex", "growthCapexPaid", "annualDepreciation"] as const;
const companyMoney = ["ebitda", "nonCashEbitdaBridge", "cashLeasePayments", "netWorkingCapitalChange",
  "maintenanceCapex", "growthCapex", "taxableBaseBeforeProject", "netFinancingCashAvailable",
  "netCapitalCashAvailable", "netRestrictedCashMovement", "closingDebtStock"] as const;
const startupMoney = ["annualIncrementalRevenue", "annualNewVariableCost", "annualDisplacedPurchases"] as const;
const startupDays = ["receivableDays", "inventoryDays", "newSupplierDays", "lostSupplierDays"] as const;
const selectors = <K extends string>(keys: readonly K[]) => z.strictObject(Object.fromEntries(keys.map(k => [k, selection])) as Record<K, typeof selection>);
const stocks = selectors(stockNames);
const startup = z.strictObject({money: selectors(startupMoney), days: selectors(startupDays), adoptedYearDays: selection});
export const adoptedInvestmentAnalysisInputSchema = adoptedAnalysisContextSchema.safeExtend({
  analysisId: z.uuid(), scenario: z.string().trim().min(1).max(160),
  /** A sensitivity may reuse the operands it does not change from this adopted scenario. */
  inheritedScenario: z.string().trim().min(1).max(160).optional(), periodEnds: selection,
  project: z.strictObject({money: selectors(projectMoney), cashTaxRate: selection, lossTaxTreatment: selection, fixedCostScaling: selection,
    exposure: z.discriminatedUnion("mode", [
      z.strictObject({mode: z.literal("provided_period_exposures"), loadYearFractions: selection, activeYearFractions: selection}),
      z.strictObject({mode: z.literal("monthly_ramp"), operationStartMonth: selection, stageMonths: selection, stageLoads: selection, terminalLoad: selection}),
    ]),
    openingWorkingCapital: stocks,
    closingWorkingCapital: z.discriminatedUnion("mode", [
      z.strictObject({mode: z.literal("provided_stocks"), stocks}),
      z.strictObject({mode: z.literal("startup_drivers"), startup, retainedCapitalMultipliers: selection}),
    ]),
  }),
  company: z.strictObject({openingAvailableCash: selection, openingRestrictedCash: selection, money: selectors(companyMoney),
    cashTaxRate: selection, lossTaxTreatment: selection, debtInventoryStatus: selection, debtIds: selection, finalPaymentDates: selection}).nullable(),
  valuation: z.strictObject({perspective: selection, baseDate: selection, timing: selection, adoptedTimes: selection,
    discountRate: selection, irrLower: selection, irrUpper: selection, precisionMode: selection, precisionDecimals: selection, precisionQuantum: selection}),
}).refine(i => i.endDate > i.openingDate, "Valid investment horizon required")
  .refine(i => i.inheritedScenario !== i.scenario, "A scenario cannot inherit from itself");
export type AdoptedInvestmentAnalysisInput = z.infer<typeof adoptedInvestmentAnalysisInputSchema>;
const next = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);

/** Investment economics first. All run rates, ramp, startup working capital, tax policy,
 * baseline company and valuation choices are adopted, while project flows and valuation
 * are derived without rounding back into source inputs. No caller-supplied cash answer. */
export function calculateAdoptedInvestmentAnalysis(raw: unknown) {
  const input = adoptedInvestmentAnalysisInputSchema.parse(raw), prefix = `investment.${input.analysisId}.`, p = input.project;
  const monetary = [...Object.values(p.money), ...Object.values(p.openingWorkingCapital), input.valuation.precisionQuantum,
    ...p.closingWorkingCapital.mode === "provided_stocks" ? Object.values(p.closingWorkingCapital.stocks) : Object.values(p.closingWorkingCapital.startup.money),
    ...input.company ? [input.company.openingAvailableCash, input.company.openingRestrictedCash, ...Object.values(input.company.money)] : []];
  const b = createAnalysisBinding(input, monetary, {inheritedScenario: input.inheritedScenario});
  const scalar = <T>(s: z.infer<typeof selection>, path: string, unit: string, type: "number" | "text" | "date", schema: z.ZodType<T>) => b.read(s, prefix + path, input.scenario, unit, type, schema);
  const column = <T>(s: z.infer<typeof selection>, path: string, unit: string, schema: z.ZodType<T>, empty = false) => b.read(s, prefix + path, input.scenario, unit, "list", z.array(schema).min(empty ? 0 : 1).max(480));
  const ends = column(input.periodEnds, "periodEnds", "date", z.iso.date());
  const cols: Record<string, unknown[] | null> = {};
  for (const k of projectMoney) cols[k] = column(p.money[k], "project." + k, "currency", investmentProjectPeriodSchema.shape[k]);
  for (const k of ["cashTaxRate", "lossTaxTreatment", "fixedCostScaling"] as const) cols[k] = column(p[k], "project." + k, k === "cashTaxRate" ? "ratio" : "convention", investmentProjectPeriodSchema.shape[k]);
  const opening: Record<string, string | null> = {};
  for (const k of stockNames) opening[k] = scalar(p.openingWorkingCapital[k], "project.openingWorkingCapital." + k, "currency", "number", analysisAmount);
  let startupCapital: ReturnType<typeof calculateStartupWorkingCapital> | null = null;
  if (p.closingWorkingCapital.mode === "provided_stocks") {
    for (const k of stockNames) cols["wc." + k] = column(p.closingWorkingCapital.stocks[k], "project.closingWorkingCapital." + k, "currency", analysisAmount);
  } else {
    const s = p.closingWorkingCapital.startup, terms: Record<string, string | null> = {};
    for (const k of startupMoney) terms[k] = scalar(s.money[k], "project.startup." + k, "currency", "number", analysisAmount);
    for (const k of startupDays) terms[k] = scalar(s.days[k], "project.startup." + k, "days", "number", startupWorkingCapitalInputSchema.shape[k]);
    const yearDays = scalar(s.adoptedYearDays, "project.startup.adoptedYearDays", "convention", "text", startupWorkingCapitalInputSchema.shape.adoptedYearDays);
    const multipliers = column(p.closingWorkingCapital.retainedCapitalMultipliers, "project.startup.retainedCapitalMultipliers", "ratio", z.string().regex(/^\d{1,24}(?:\.\d{1,20})?$/));
    if (Object.values(terms).every(v => v !== null) && yearDays) startupCapital = calculateStartupWorkingCapital(startupWorkingCapitalInputSchema.parse({...terms, adoptedYearDays: yearDays, sourceAnchor: `adoption:${s.adoptedYearDays.decisionId}`}));
    if (startupCapital && multipliers) for (const k of stockNames) cols["wc." + k] = multipliers.map(m => multiply(startupCapital![k], m));
  }
  let ramp: ReturnType<typeof calculateProjectRampExposure>[] | null = null;
  if (p.exposure.mode === "provided_period_exposures") {
    cols.loadYearFraction = column(p.exposure.loadYearFractions, "project.exposure.loadYearFractions", "ratio", analysisAmount);
    cols.activeYearFraction = column(p.exposure.activeYearFractions, "project.exposure.activeYearFractions", "ratio", analysisAmount);
  } else {
    const e = p.exposure;
    const operation = scalar(e.operationStartMonth, "project.ramp.operationStartMonth", "date", "date", z.iso.date());
    const months = column(e.stageMonths, "project.ramp.stageMonths", "months", z.string().regex(/^[1-9]\d{0,2}$/), true);
    const loads = column(e.stageLoads, "project.ramp.stageLoads", "ratio", analysisAmount, true);
    const terminal = scalar(e.terminalLoad, "project.ramp.terminalLoad", "ratio", "number", analysisAmount);
    if (months && loads && months.length !== loads.length) throw new Error("investment_ramp_series_mismatch");
    if (ends && operation && months && loads && terminal !== null) {
      ramp = ends.map((endDate, n) => calculateProjectRampExposure({startDate: next(n ? ends[n - 1]! : input.openingDate), endDate,
        operationStartMonth: operation, stages: months.map((m, i) => ({months: Number(m), load: loads[i]!})), terminalLoad: terminal, sourceAnchor: `adoption:${e.operationStartMonth.decisionId}`}));
      cols.loadYearFraction = ramp.map(r => r.loadEquivalentYearFraction); cols.activeYearFraction = ramp.map(r => r.activeYearFraction);
    }
  }
  const projectGaps = b.gaps.length;
  const perspective = scalar(input.valuation.perspective, "valuation.perspective", "convention", "text", z.enum(["standalone_project", "incremental_company"]));
  const valuationBaseDate = scalar(input.valuation.baseDate, "valuation.baseDate", "date", "date", z.iso.date());
  const timing = scalar(input.valuation.timing, "valuation.timing", "convention", "text", projectValuationInputSchema.shape.timing);
  const times = column(input.valuation.adoptedTimes, "valuation.adoptedTimes", "years", analysisAmount, true);
  const discountRate = scalar(input.valuation.discountRate, "valuation.discountRate", "ratio", "number", projectValuationInputSchema.shape.discountRate);
  const irrLower = scalar(input.valuation.irrLower, "valuation.irrLower", "ratio", "number", projectValuationInputSchema.shape.irrLower);
  const irrUpper = scalar(input.valuation.irrUpper, "valuation.irrUpper", "ratio", "number", projectValuationInputSchema.shape.irrUpper);
  const precision = scalar(input.valuation.precisionMode, "valuation.precisionMode", "convention", "text", z.enum(["unrounded", "calibration_rounding", "calibration_monetary_quantum"]));
  const decimals = scalar(input.valuation.precisionDecimals, "valuation.precisionDecimals", "count", "number", z.string().regex(/^[0-8]$/));
  const precisionQuantum = scalar(input.valuation.precisionQuantum, "valuation.precisionQuantum", "currency", "number", analysisAmount);
  const valuationGaps = b.gaps.length > projectGaps;
  const companyGapStart = b.gaps.length;
  const companyCols: Record<string, unknown[] | null> = {};
  let companyValues: {available: string | null; restricted: string | null; inventory: "provided" | "no_debt" | null; ids: string[] | null; dates: string[] | null} | null = null;
  if (input.company) {
    const c = input.company;
    companyValues = {available: scalar(c.openingAvailableCash, "company.openingAvailableCash", "currency", "number", analysisAmount),
      restricted: scalar(c.openingRestrictedCash, "company.openingRestrictedCash", "currency", "number", analysisAmount),
      inventory: scalar(c.debtInventoryStatus, "company.debtInventoryStatus", "convention", "text", z.enum(["provided", "no_debt"])),
      ids: column(c.debtIds, "company.debtIds", "identity", analysisReference, true), dates: column(c.finalPaymentDates, "company.finalPaymentDates", "date", z.iso.date(), true)};
    for (const k of companyMoney) companyCols[k] = column(c.money[k], "company." + k, "currency", companyCounterfactualInputSchema.shape.periods.element.shape[k]);
    for (const k of ["cashTaxRate", "lossTaxTreatment"] as const) companyCols[k] = column(c[k], "company." + k, k === "cashTaxRate" ? "ratio" : "convention", companyCounterfactualInputSchema.shape.periods.element.shape[k]);
  } else b.gaps.push({operand: prefix + "company", reason: "Company baseline and debt maturities are needed for the financing counterfactual"});
  if (ends && [...Object.values(cols), ...Object.values(companyCols)].some(c => c && c.length !== ends.length)) throw new Error("investment_adopted_series_mismatch");
  if (timing === "adopted_times" && ends && times && times.length !== ends.length) throw new Error("investment_valuation_times_mismatch");
  if (timing === "actual_365_fixed" && times?.length) throw new Error("investment_unused_valuation_times");
  if (precision !== "calibration_rounding" && decimals !== null && decimals !== "0") throw new Error("investment_unused_rounding_precision");
  if (precision !== "calibration_monetary_quantum" && precisionQuantum !== null && !new Exact(precisionQuantum).eq(0)) throw new Error("investment_unused_rounding_quantum");
  const projectInput = !projectGaps && ends ? {currency: input.currency, moneyUnit: input.currency,
    openingDate: input.openingDate, endDate: input.endDate, openingIncrementalWorkingCapital: opening,
    definition: "incremental_unlevered_cash_flow" as const,
    periods: ends.map((endDate, n) => ({id: endDate, startDate: next(n ? ends[n - 1]! : input.openingDate), endDate, sourceAnchor: `adoption:${input.periodEnds.decisionId}`,
      ...Object.fromEntries([...projectMoney, "cashTaxRate", "lossTaxTreatment", "fixedCostScaling", "loadYearFraction", "activeYearFraction"].map(k => [k, cols[k]?.[n]])),
      closingIncrementalWorkingCapital: Object.fromEntries(stockNames.map(k => [k, cols["wc." + k]?.[n]]))}))} : null;
  const project = projectInput ? buildInvestmentProject(investmentProjectInputSchema.parse(projectInput)) : null;
  let company: ReturnType<typeof projectCompanyWithAndWithoutInvestment> | null = null;
  if (project && b.gaps.length === companyGapStart && companyValues && input.company) {
    const c = companyValues;
    if (c.ids!.length !== c.dates!.length || (c.inventory === "no_debt" && c.ids!.length)) throw new Error("investment_debt_inventory_mismatch");
    company = projectCompanyWithAndWithoutInvestment(companyCounterfactualInputSchema.parse({project: project.operands, openingAvailableCash: c.available, openingRestrictedCash: c.restricted,
      debtInventory: c.inventory === "no_debt" ? {status: "no_debt", reason: `adoption:${input.company.debtInventoryStatus.decisionId}`}
        : {status: "provided", instruments: c.ids!.map((instrumentId, n) => ({instrumentId, finalPaymentDate: c.dates![n], sourceAnchor: `adoption:${input.company!.finalPaymentDates.decisionId}`}))},
      periods: ends!.map((endDate, n) => ({periodId: endDate, startDate: next(n ? ends![n - 1]! : input.openingDate), endDate, sourceAnchor: `adoption:${input.periodEnds.decisionId}`,
        ...Object.fromEntries(Object.entries(companyCols).map(([k, col]) => [k, col?.[n]]))})), definition: "same_baseline_and_financing_with_and_without_investment"}));
  }
  let valuation: ReturnType<typeof valueInvestmentProject> | null = null;
  const valuationRows = perspective === "standalone_project" ? project?.rows.map(r => ({id: r.periodId, date: r.endDate, amount: r.unleveredCashFlow}))
    : company?.rows.map(r => ({id: r.periodId, date: r.endDate, amount: r.incrementalCompanyCash}));
  if (perspective === "incremental_company" && !company) b.gaps.push({operand: prefix + "valuation.perspective", reason: "Joint company taxes must be projected before valuing incremental company cash"});
  if (!valuationGaps && valuationRows && valuationBaseDate && timing && discountRate !== null && irrLower !== null && irrUpper !== null && precision && decimals !== null && precisionQuantum !== null && times) {
    if (valuationBaseDate < input.openingDate || valuationBaseDate > input.endDate) throw new Error("investment_valuation_base_outside_horizon");
    valuation = valueInvestmentProject({baseDate: valuationBaseDate, currency: input.currency, moneyUnit: input.currency,
      flows: valuationRows.map((r, n) => ({...r, sourceAnchor: `derived:${input.scope.versionId}:${r.id}`, ...timing === "adopted_times" ? {adoptedTimeYears: times[n]!} : {}})),
      timing, timingSourceAnchor: `adoption:${input.valuation.timing.decisionId}`, discountRate, irrLower, irrUpper,
      flowPrecision: precision === "unrounded" ? {mode: "unrounded"} : precision === "calibration_rounding"
        ? {mode: "calibration_rounding", decimals: Number(decimals), reason: `adoption:${input.valuation.precisionMode.decisionId}`}
        : {mode: "calibration_monetary_quantum", quantum: precisionQuantum, reason: `adoption:${input.valuation.precisionMode.decisionId}`}});
  }
  const payload = {schemaVersion: "adopted-investment-analysis.v1" as const, financialCoreVersion, scope: input.scope,
    analysisId: input.analysisId, entityId: input.entityId, perimeter: input.perimeter, currency: input.currency, scenario: input.scenario,
    inheritedScenario: input.inheritedScenario ?? null,
    basisFingerprint: input.envelope.fingerprint, project, startupCapital, ramp, company, valuation, valuationPerspective: perspective,
    gaps: b.gaps, bindings: b.bindings, normalization: b.normalization, contributions: [...b.used.values()],
    status: b.gaps.length ? "missing_inputs" as const : "partial_composition" as const,
    classification: [...b.used.values()].some(e => e.kind === "hypothesis") ? "working_hypothesis" as const : "working_selection" as const,
    derivedDependencies: [{result: "project_company_and_valuation", decisionIds: [...b.used.keys()]}],
    exclusions: ["automatic_terminal_release", "intraperiod_cash_certification", "tax_law_inference", "financing_recommendation", "method_release"] as const,
    grantsExecution: false as const, grantsPublication: false as const};
  return {...payload, fingerprint: createHash("sha256").update(JSON.stringify(payload)).digest("hex")};
}

import Decimal from "decimal.js";
const Exact = Decimal.clone({precision: 80, rounding: Decimal.ROUND_HALF_UP});
const multiply = (a: string, b: string) => new Exact(a).times(b).toDecimalPlaces(20).toFixed();
