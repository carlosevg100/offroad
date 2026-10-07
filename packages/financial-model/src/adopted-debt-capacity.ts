import {createHash} from "node:crypto";
import {z} from "zod";
import {debtCapacityInputSchema, findMaximumDebtCapacity, projectDebtCapacityAmount, financialCoreVersion} from "@offroad/financial-core";
import {adoptedValueSelectionSchema as selection} from "./adopted-debt-inputs";
import {readContextualBasis} from "@offroad/reconciliation";
import {adoptedAnalysisContextSchema, analysisAmount, analysisReference, createAnalysisBinding} from "./adopted-analysis-binding";

const affineNames = ["ebitda", "covenantEbitdaAdjustment", "nonCashEbitdaBridge", "cashLeasePayments",
  "changeInWorkingCapital", "maintenanceCapex", "growthCapex", "taxableBaseBeforeNewDebtInterest",
  "otherExistingFinancingCashAvailable", "capitalCashAvailable"] as const;
const moneyNames = ["existingCashInterest", "existingCashPrincipalPaid", "existingDebtForRatio"] as const;
const ratioNames = ["cashTaxRate"] as const;
const conventionNames = ["lossTaxTreatment", "newDebtTaxDeduction", "cfadsGrowthCapexTreatment"] as const;
const financingRatioNames = ["drawAtStart", "drawAtEnd", "principalPaidAtEnd", "interestFactorOnOpeningAndStartDraw",
  "interestFactorOnEndDraw", "interestFactorCreditOnEndAmortization", "withheldCostPerUnitDraw"] as const;
const financingConventionNames = ["factorConvention", "paysAccruedInterest", "unpaidInterestBase"] as const;
const selectors = <K extends string>(keys: readonly K[]) => z.strictObject(Object.fromEntries(keys.map(k => [k, selection])) as Record<K, typeof selection>);
const affineSelectors = z.strictObject(Object.fromEntries(affineNames.map(k => [k, z.strictObject({fixed: selection, perUnitNewDebt: selection})])) as Record<typeof affineNames[number], z.ZodObject<{fixed: typeof selection; perUnitNewDebt: typeof selection}>>);
const scenarioTerms = z.strictObject({openingAvailableCash: selection, cashNetting: selection, includeNewAccruedInterestInDebt: selection,
  periodEnds: selection, affine: affineSelectors, money: selectors(moneyNames), ratios: selectors(ratioNames),
  conventions: selectors(conventionNames), cfadsDefinitionAnchors: selection,
  newFinancing: z.strictObject({ratios: selectors(financingRatioNames), conventions: selectors(financingConventionNames)})});
export const adoptedDebtCapacityInputSchema = adoptedAnalysisContextSchema.safeExtend({
  analysisId: z.uuid(), scenario: z.string().min(1).max(160), maximumAmount: selection, monetaryQuantum: selection,
  fixedReviewAmount: selection.nullable(), horizonMode: selection, newDebtFinalPaymentDate: selection,
  existingDebtFinalPaymentDates: selection,
  scenarios: z.array(z.strictObject({id: z.uuid(), scenario: z.string().min(1).max(160), terms: scenarioTerms,
    rules: z.array(z.strictObject({id: z.uuid(), kind: selection, threshold: selection})).min(1).max(12)})).min(1).max(4),
}).refine(i => i.endDate > i.openingDate && new Set(i.scenarios.map(s => s.id)).size === i.scenarios.length
  && new Set(i.scenarios.map(s => s.scenario)).size === i.scenarios.length, "Unique scenarios and a valid horizon required")
  .refine(i => i.scenarios.every(s => new Set(s.rules.map(r => r.id)).size === s.rules.length), "Duplicate constraint");
export type AdoptedDebtCapacityInput = z.infer<typeof adoptedDebtCapacityInputSchema>;

/** Columnar typed adoptions keep a decade of projections under the basis size limit.
 * Every coefficient, contract factor and threshold is adopted; there is no free profile,
 * amount or JSON expression supplied by the caller. Rights remain the SQL precondition. */
export function calculateAdoptedDebtCapacity(raw: unknown) {
  const input = adoptedDebtCapacityInputSchema.parse(raw), prefix = `debt_capacity.${input.analysisId}.`;
  const basis = readContextualBasis(input.envelope, input.scope);
  const monetary = [input.maximumAmount, input.monetaryQuantum, ...input.fixedReviewAmount ? [input.fixedReviewAmount] : [],
    ...input.scenarios.flatMap(s => [s.terms.openingAvailableCash, ...Object.values(s.terms.affine).map(a => a.fixed),
      ...Object.values(s.terms.money)])];
  // A cash threshold is monetary; a ratio threshold has unit scale. Resolve monetary
  // candidates from their typed adopted kind, then read validates both kind and unit.
  for (const s of input.scenarios) for (const r of s.rules) {
    const kind = basis.entries.find(e => e.decisionId === r.kind.decisionId)?.value;
    if (kind?.type === "text" && kind.value === "minimum_available_cash") monetary.push(r.threshold);
  }
  const b = createAnalysisBinding(input, monetary);
  const scalar = <T>(s: z.infer<typeof selection>, path: string, scenario: string, unit: string, type: "number" | "text" | "date" | "boolean", schema: z.ZodType<T>) => b.read(s, prefix + path, scenario, unit, type, schema);
  const column = <T>(s: z.infer<typeof selection>, path: string, scenario: string, unit: string, schema: z.ZodType<T>) => b.read(s, prefix + path, scenario, unit, "list", z.array(schema).min(1).max(240));
  const max = scalar(input.maximumAmount, "maximumAmount", input.scenario, "currency", "number", analysisAmount);
  const quantum = scalar(input.monetaryQuantum, "monetaryQuantum", input.scenario, "currency", "number", analysisAmount);
  const review = input.fixedReviewAmount ? scalar(input.fixedReviewAmount, "fixedReviewAmount", input.scenario, "currency", "number", analysisAmount) : null;
  const mode = scalar(input.horizonMode, "horizonMode", input.scenario, "convention", "text", z.enum(["full_settlement", "calibration_window"]));
  const finalDate = scalar(input.newDebtFinalPaymentDate, "newDebtFinalPaymentDate", input.scenario, "date", "date", z.iso.date());
  const oldDates = b.read(input.existingDebtFinalPaymentDates, prefix + "existingDebtFinalPaymentDates", input.scenario, "date", "list", z.array(z.iso.date()).max(100));
  const scenarioSchema = debtCapacityInputSchema.shape.scenarios.element;
  const periodSchema = scenarioSchema.shape.periods.element;
  const scenarios = input.scenarios.map(s => {
    const p = `scenario.${s.id}.`, t = s.terms, sc = s.scenario;
    const opening = scalar(t.openingAvailableCash, p + "openingAvailableCash", sc, "currency", "number", analysisAmount);
    const cashNetting = scalar(t.cashNetting, p + "cashNetting", sc, "convention", "text", scenarioSchema.shape.cashNetting);
    const accrued = scalar(t.includeNewAccruedInterestInDebt, p + "includeNewAccruedInterestInDebt", sc, "convention", "boolean", z.boolean());
    const ends = column(t.periodEnds, p + "periodEnds", sc, "date", z.iso.date());
    const cols: Record<string, unknown[] | null> = {};
    for (const key of affineNames) {
      cols[key + ".fixed"] = column(t.affine[key].fixed, p + key + ".fixed", sc, "currency", analysisAmount);
      cols[key + ".perUnitNewDebt"] = column(t.affine[key].perUnitNewDebt, p + key + ".perUnitNewDebt", sc, "ratio", analysisAmount);
    }
    for (const key of moneyNames) cols[key] = column(t.money[key], p + key, sc, "currency", analysisAmount);
    for (const key of ratioNames) cols[key] = column(t.ratios[key], p + key, sc, "ratio", periodSchema.shape[key]);
    for (const key of conventionNames) cols[key] = column(t.conventions[key], p + key, sc, "convention", periodSchema.shape[key]);
    cols.cfadsDefinitionAnchor = column(t.cfadsDefinitionAnchors, p + "cfadsDefinitionAnchors", sc, "reference_id", analysisReference);
    for (const key of financingRatioNames) cols["newFinancing." + key] = column(t.newFinancing.ratios[key], p + "newFinancing." + key, sc, "ratio", periodSchema.shape.newFinancing.shape[key]);
    for (const key of financingConventionNames) cols["newFinancing." + key] = column(t.newFinancing.conventions[key], p + "newFinancing." + key, sc, "convention", key === "paysAccruedInterest" ? z.enum(["true", "false"]) : periodSchema.shape.newFinancing.shape[key]);
    const rules = s.rules.map(r => {
      const path = p + `rule.${r.id}.`;
      const kind = scalar(r.kind, path + "kind", sc, "convention", "text", scenarioSchema.shape.rules.element.shape.kind);
      const threshold = kind ? scalar(r.threshold, path + "threshold", sc, kind === "minimum_available_cash" ? "currency" : "ratio", "number", analysisAmount) : null;
      return {id: r.id, kind, threshold, measurement: "all_period_ends", sourceAnchor: `adoption:${r.threshold.decisionId}`};
    });
    if (ends && Object.values(cols).some(c => c && c.length !== ends.length)) throw new Error("capacity_adopted_series_mismatch");
    const next = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
    const periods = ends?.map((endDate, n) => ({id: endDate, startDate: next(n ? ends[n - 1]! : input.openingDate), endDate,
      sourceAnchor: `adoption:${t.periodEnds.decisionId}`,
      ...Object.fromEntries(affineNames.map(k => [k, {fixed: cols[k + ".fixed"]?.[n], perUnitNewDebt: cols[k + ".perUnitNewDebt"]?.[n]}])),
      ...Object.fromEntries([...moneyNames, ...ratioNames, ...conventionNames, "cfadsDefinitionAnchor"].map(k => [k, cols[k]?.[n]])),
      newFinancing: {...Object.fromEntries([...financingRatioNames, ...financingConventionNames].map(k => [k,
        k === "paysAccruedInterest" ? cols["newFinancing." + k]?.[n] === "true" : cols["newFinancing." + k]?.[n]])), sourceAnchor: `adoption:${t.periodEnds.decisionId}`}}));
    return {id: s.id, sourceAnchor: `adoption:${t.periodEnds.decisionId}`, openingAvailableCash: opening, cashNetting,
      includeNewAccruedInterestInDebt: accrued, rules, periods};
  });
  const profile = b.gaps.length ? null : debtCapacityInputSchema.parse({currency: input.currency, moneyUnit: input.currency,
    openingDate: input.openingDate, endDate: input.endDate, maximumAmount: max, monetaryQuantum: quantum,
    horizon: {mode, newDebtFinalPaymentDate: finalDate, existingDebtFinalPaymentDates: oldDates, sourceAnchor: `adoption:${input.horizonMode.decisionId}`},
    scenarios, definition: "maximum_monetary_quantum_amount_under_all_adopted_scenario_period_constraints"});
  const capacity = profile ? findMaximumDebtCapacity(profile) : null;
  const fixedReview = profile && review !== null ? projectDebtCapacityAmount(profile, review) : null;
  const payload = {schemaVersion: "adopted-debt-capacity.v1" as const, financialCoreVersion, scope: input.scope,
    analysisId: input.analysisId, entityId: input.entityId, perimeter: input.perimeter, currency: input.currency,
    basisFingerprint: input.envelope.fingerprint, profile, capacity, fixedReview,
    gaps: b.gaps, bindings: b.bindings, normalization: b.normalization, contributions: [...b.used.values()],
    status: profile ? "partial_composition" as const : "missing_inputs" as const,
    derivedDependencies: [{result: "capacity_and_fixed_review", decisionIds: [...b.used.keys()]}],
    classification: [...b.used.values()].some(e => e.kind === "hypothesis") ? "working_hypothesis" as const : "working_selection" as const,
    exclusions: ["intraperiod_cash_certification", "nonlinear_pricing", "contract_extraction", "credit_approval", "method_release"] as const,
    grantsExecution: false as const, grantsPublication: false as const};
  return {...payload, fingerprint: createHash("sha256").update(JSON.stringify(payload)).digest("hex")};
}
