import {createHash} from "node:crypto";
import {z} from "zod";
import {buildFinancingCashFlows, buildLiquidityCalendar, financialCoreVersion, financingCostCategories, type FinancingCharge, type FinancingCostAssessment} from "@offroad/financial-core";
import {readContextualBasis} from "@offroad/reconciliation";
import {adoptedDebtLiquidityInputSchema, adoptedValueSelectionSchema as selection, resolveAdoptedDebtInputs} from "./adopted-debt-inputs";
import {resolveAdoptedCurrencyValues} from "./adopted-numeric-representation";
import {hasUnitScale} from "./adopted-input-scale";

const series = z.strictObject({chargeIds: selection, economicIds: selection, categories: selection,
  periods: selection, dates: selection, amounts: selection, treatments: selection, accounts: selection});
export const adoptedFinancingInputSchema = adoptedDebtLiquidityInputSchema.safeExtend({
  financing: z.array(z.strictObject({instrumentId: z.uuid(),
    drawConvention: selection,
    assessments: z.strictObject({origination_fee: selection, recurring_fee: selection, tax: selection, other: selection}),
    /** Absence is permitted only when every category explicitly has no charges. */
    charges: series.nullable(),
  })).min(1).max(16),
}).refine(i => new Set(i.financing.map(f => f.instrumentId)).size === i.financing.length
  && i.financing.length === i.instruments.length && i.financing.every(f => i.instruments.some(d => d.id === f.instrumentId)), "Financing inventory must match the instrument ledger exactly");

/** Recomputes under adopted costs, including adopted gross/net convention. No free-form
 * caller override supplies an amount, assessment, date, account or charge treatment.
 * This remains a domain adapter, not an execution authorization or publication command.
 */
export function calculateAdoptedFinancingLiquidity(raw: unknown) {
  const {financing: costInputs, ...base} = adoptedFinancingInputSchema.parse(raw);
  const resolved = resolveAdoptedDebtInputs(base);
  const {input, used, gaps, bindings, instrumentBindings} = resolved;
  const basis = readContextualBasis(input.envelope, input.scope);
  const entries = new Map(basis.entries.map(e => [e.decisionId, e]));
  const observations = new Set([...used.values()].flatMap(e => e.observationId ? [e.observationId] : []));
  const amountIds = costInputs.flatMap(c => c.charges?.amounts.decisionId ? [c.charges.amounts.decisionId] : []);
  const costNormalization = amountIds.length ? resolveAdoptedCurrencyValues({envelope: input.envelope, scope: input.scope,
    decisionIds: amountIds, groups: input.numericInterpretations}) : null;
  const normalized = new Map(costNormalization?.values.map(v => [v.decisionId, v]) ?? []);
  const first = new Date(`${input.openingDate}T00:00:00Z`); first.setUTCDate(first.getUTCDate() + 1);
  const firstDate = first.toISOString().slice(0, 10);
  function read<T>(s: z.infer<typeof selection>, path: string, unit: string, type: "text" | "list", schema: z.ZodType<T>): T | null {
    const numeric = s.decisionId ? normalized.get(s.decisionId) : undefined;
    bindings.push({operand: path, decisionId: s.decisionId, missingReason: s.missingReason, interpretationDecisionIds: numeric?.interpretationDecisionIds ?? []});
    if (!s.decisionId) {gaps.push({operand: path, reason: s.missingReason!}); return null;}
    const e = entries.get(s.decisionId); const d = e?.dimensions;
    if (!e || used.has(e.decisionId) || (e.observationId && observations.has(e.observationId))) throw new Error("financing_basis_missing_or_reused_contribution");
    if (e.fieldPath !== path || e.value.type !== type || e.definitionKind !== s.definitionKind
      || d!.definitionVersionId !== s.definitionVersionId || d!.entityId !== input.entityId || d!.perimeter !== input.perimeter
      || d!.currency !== input.currency || d!.unit !== unit || d!.periodStart !== firstDate || d!.periodEnd !== input.endDate
      || d!.scenario !== input.scenario || (unit !== "currency" && !hasUnitScale(d!.scale))) throw new Error("financing_basis_context_mismatch");
    used.set(e.decisionId, e); if (e.observationId) observations.add(e.observationId);
    if (unit === "currency") {
      if (!numeric?.trace) {gaps.push({operand: path, reason: "Numeric representation has not been adopted"}); return null;}
      numeric.interpretationDecisionIds.forEach(id => used.set(id, entries.get(id)!));
      return schema.parse(numeric.trace.values);
    }
    return schema.parse(e.value.value);
  }
  const charges: FinancingCharge[] = []; const assessments: FinancingCostAssessment[] = [];
  const list = <T>(schema: z.ZodType<T>) => z.array(schema).min(1).max(2000);
  for (const cost of costInputs) {
    const start = bindings.length; const prefix = `financing.${cost.instrumentId}.`;
    read(cost.drawConvention, prefix + "drawConvention", "convention", "text", z.literal("gross_cash_before_withholding"));
    for (const category of financingCostCategories) {
      const s = cost.assessments[category];
      const status = read(s, prefix + category + ".assessment", "convention", "text", z.enum(["specified", "zero", "not_applicable", "unknown"]));
      if (status === null) continue;
      const reason = entries.get(s.decisionId!)!.reason;
      assessments.push({instrumentId: cost.instrumentId, category, status, reason});
      if (status === "unknown") gaps.push({operand: prefix + category, reason});
    }
    const specified = assessments.some(a => a.instrumentId === cost.instrumentId && a.status === "specified");
    if (specified && !cost.charges) gaps.push({operand: prefix + "charges", reason: "Specified costs require adopted charge series"});
    if (cost.charges) {
      const term = <T>(name: keyof typeof cost.charges, unit: string, schema: z.ZodType<T>) => read(cost.charges![name], prefix + name, unit, "list", list(schema));
      const ids = term("chargeIds", "identity", z.string().trim().min(1).max(160));
      const economicIds = term("economicIds", "identity", z.string().trim().min(1).max(160));
      const categories = term("categories", "convention", z.enum(financingCostCategories));
      const periods = term("periods", "date", z.iso.date());
      const dates = term("dates", "date", z.iso.date());
      const amounts = term("amounts", "currency", z.string().regex(/^\d{1,24}(?:\.\d{1,8})?$/));
      const treatments = term("treatments", "convention", z.enum(["withheld_from_gross_draw", "cash_paid", "capitalized_at_period_start"]));
      const accounts = term("accounts", "convention", z.enum(["available", "restricted", "none"]));
      if (ids && economicIds && categories && periods && dates && amounts && treatments && accounts) {
        if ([economicIds, categories, periods, dates, amounts, treatments, accounts].some(v => v.length !== ids.length)) throw new Error("financing_basis_series_length_mismatch");
        ids.forEach((id, n) => charges.push({id, economicId: economicIds[n]!, instrumentId: cost.instrumentId,
          category: categories[n]!, period: periods[n]!, date: dates[n]!, amount: amounts[n]!, treatment: treatments[n]!, account: accounts[n] === "none" ? null : accounts[n]!}));
      }
    }
    instrumentBindings.set(cost.instrumentId, [...new Set([...(instrumentBindings.get(cost.instrumentId) ?? []),
      ...bindings.slice(start).flatMap(b => b.decisionId ? [b.decisionId, ...b.interpretationDecisionIds] : [])])]);
  }
  const financing = gaps.length ? null : buildFinancingCashFlows({debt: {openingDate: input.openingDate, endDate: input.endDate,
    currency: input.currency, convention: "draw_at_period_start_pay_at_period_end", instruments: resolved.instruments},
    drawConvention: "gross_cash_before_withholding", charges, assessments});
  const liquidity = financing?.events ? buildLiquidityCalendar({openingDate: input.openingDate, endDate: input.endDate, currency: input.currency,
    openingAvailable: resolved.openingAvailable, openingRestricted: resolved.openingRestricted, convention: "end_of_day_netting",
    coverage: {status: "partial", reason: `Declared operating coverage: ${input.coverageReason}. Completeness requires review.`},
    events: [...resolved.operatingEvents, ...financing.events]}) : null;
  const payload = {schemaVersion: "adopted-financing-liquidity.v1" as const, financialCoreVersion, scope: input.scope,
    entityId: input.entityId, perimeter: input.perimeter, currency: input.currency, openingScenario: input.openingScenario,
    scenario: input.scenario, openingDate: input.openingDate, endDate: input.endDate, basisFingerprint: input.envelope.fingerprint,
    status: gaps.length || financing?.status !== "calculated" ? "missing_inputs" as const : "partial_composition" as const,
    financing, liquidity, gaps, bindings, contributions: [...used.values()],
    numericNormalization: {debtAndOperating: resolved.normalization, costs: costNormalization},
    derivedDependencies: financing?.events?.map(event => {
      const identity: string[] = JSON.parse(event.id);
      const instrumentId = identity.length === 3 ? identity[0]! : charges.find(c => c.id === identity[1])!.instrumentId;
      return {eventId: event.id, decisionIds: instrumentBindings.get(instrumentId)!};
    }) ?? [],
    exclusions: ["annual_effective_cost", "operating_completeness_certification"] as const,
    classification: [...used.values()].some(e => e.kind === "hypothesis") ? "working_hypothesis" as const : "working_selection" as const,
    grantsExecution: false as const};
  return {...payload, fingerprint: createHash("sha256").update(JSON.stringify(payload)).digest("hex")};
}
