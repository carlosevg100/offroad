import {createHash} from "node:crypto";
import {z} from "zod";
import {buildDeferredFinancingSchedule, solveEquivalentFinancingSpread, financialCoreVersion,
  type DeferredFinancingScheduleInput} from "@offroad/financial-core";
import {readContextualBasis, type AdoptionBasisEntry} from "@offroad/reconciliation";
import {adoptedDebtLiquidityInputSchema, adoptedValueSelectionSchema as selection} from "./adopted-debt-inputs";
import {resolveAdoptedCurrencyValues} from "./adopted-numeric-representation";
import {hasUnitScale} from "./adopted-input-scale";

export const adoptedFinancingProposalVersion = "2026.10.07-v1";
const shape = adoptedDebtLiquidityInputSchema.shape;
export const adoptedFinancingProposalInputSchema = z.strictObject({
  envelope: shape.envelope, scope: shape.scope, entityId: shape.entityId, perimeter: shape.perimeter,
  currency: shape.currency, scenario: shape.scenario, openingDate: shape.openingDate, endDate: shape.endDate,
  proposalId: z.uuid(), numericInterpretations: shape.numericInterpretations,
  terms: z.strictObject({grossAdvance: selection, upfrontWithheldCosts: selection, annualSpread: selection,
    unpaidInterestBase: selection, costScope: selection, lowerSpread: selection, upperSpread: selection,
    periodEnds: selection, yearFractions: selection, annualIndex: selection, yearFractionConventions: selection,
    businessDayCounts: selection.nullable(), scheduledPrincipal: selection, paysAccruedInterest: selection,
    costAssessments: z.strictObject({origination_fee: selection, recurring_fee: selection, tax: selection, other: selection})}),
}).refine(i => i.endDate > i.openingDate, "Invalid proposal horizon");
export type AdoptedFinancingProposalInput = z.infer<typeof adoptedFinancingProposalInputSchema>;
const decimal = z.string().regex(/^-?\d{1,24}(?:\.\d{1,20})?$/);
const unsigned = z.string().regex(/^\d{1,24}(?:\.\d{1,20})?$/);

/** A cost component over a server-authorized immutable basis. Only selection IDs, context
 * and identity come from the caller: amounts, curve, dates and contract conventions come
 * from contributions. This does not grant execution, publish a method or choose a bank. */
export function calculateAdoptedFinancingProposal(raw: unknown) {
  const input = adoptedFinancingProposalInputSchema.parse(raw);
  const basis = readContextualBasis(input.envelope, input.scope);
  const entries = new Map(basis.entries.map(e => [e.decisionId, e]));
  const used = new Map<string, AdoptionBasisEntry>(); const observations = new Set<string>();
  const gaps: {operand: string; reason: string}[] = [];
  const bindings: {operand: string; decisionId: string | null; interpretationDecisionIds: string[]}[] = [];
  const ids = [input.terms.grossAdvance, input.terms.upfrontWithheldCosts, input.terms.scheduledPrincipal].flatMap(s => s.decisionId ? [s.decisionId] : []);
  if (new Set(ids).size !== ids.length) throw new Error("proposal_basis_reused_contribution");
  const normalization = ids.length ? resolveAdoptedCurrencyValues({envelope: input.envelope, scope: input.scope, decisionIds: ids, groups: input.numericInterpretations}) : null;
  const normalized = new Map(normalization?.values.map(v => [v.decisionId, v]) ?? []);
  const prefix = `proposal.${input.proposalId}.`;
  function read<T>(s: z.infer<typeof selection>, name: string, unit: string, type: "number" | "text" | "list", schema: z.ZodType<T>): T | null {
    const numeric = s.decisionId ? normalized.get(s.decisionId) : undefined;
    const path = prefix + name;
    bindings.push({operand: path, decisionId: s.decisionId, interpretationDecisionIds: numeric?.interpretationDecisionIds ?? []});
    if (!s.decisionId) {gaps.push({operand: path, reason: s.missingReason!}); return null;}
    const e = entries.get(s.decisionId); const d = e?.dimensions;
    if (!e || used.has(e.decisionId) || (e.observationId && observations.has(e.observationId))) throw new Error("proposal_basis_missing_or_reused_contribution");
    if (e.fieldPath !== path || e.value.type !== type || e.definitionKind !== s.definitionKind
      || d!.definitionVersionId !== s.definitionVersionId || d!.entityId !== input.entityId || d!.perimeter !== input.perimeter
      || d!.currency !== input.currency || d!.unit !== unit || d!.periodStart !== input.openingDate || d!.periodEnd !== input.endDate
      || d!.scenario !== input.scenario || (unit !== "currency" && !hasUnitScale(d!.scale))) throw new Error("proposal_basis_context_mismatch");
    used.set(e.decisionId, e); if (e.observationId) observations.add(e.observationId);
    if (unit === "currency") {
      if (!numeric?.trace) {gaps.push({operand: path, reason: "Numeric representation has not been adopted"}); return null;}
      numeric.interpretationDecisionIds.forEach(id => used.set(id, entries.get(id)!));
      return schema.parse(type === "number" ? numeric.trace.values[0] : numeric.trace.values);
    }
    return schema.parse(e.value.value);
  }
  const scalar = <T>(key: keyof AdoptedFinancingProposalInput["terms"], unit: string, type: "number" | "text", schema: z.ZodType<T>) =>
    read(input.terms[key] as z.infer<typeof selection>, key, unit, type, schema);
  const series = <T>(key: keyof AdoptedFinancingProposalInput["terms"], unit: string, schema: z.ZodType<T>) =>
    read(input.terms[key] as z.infer<typeof selection>, key, unit, "list", z.array(schema).min(1).max(480));
  const gross = scalar("grossAdvance", "currency", "number", unsigned);
  const withheld = scalar("upfrontWithheldCosts", "currency", "number", unsigned);
  const spread = scalar("annualSpread", "ratio", "number", decimal);
  const unpaid = scalar("unpaidInterestBase", "convention", "text", z.enum(["principal_only", "principal_plus_accrued"]));
  const costScope = scalar("costScope", "convention", "text", z.enum(["all_costs_withheld_at_advance", "additional_cash_costs", "unknown"]));
  if (costScope !== null && costScope !== "all_costs_withheld_at_advance") gaps.push({operand: prefix + "costScope",
    reason: "Additional or unknown cash costs need their full dated charge ledger; this component cannot certify them"});
  const lower = scalar("lowerSpread", "ratio", "number", decimal); const upper = scalar("upperSpread", "ratio", "number", decimal);
  const ends = series("periodEnds", "date", z.iso.date()); const fractions = series("yearFractions", "ratio", unsigned);
  const curve = series("annualIndex", "ratio", decimal);
  const conventions = series("yearFractionConventions", "convention", z.enum(["business_days_252", "actual_365_fixed", "adopted_year_fraction"]));
  const businessDays = input.terms.businessDayCounts ? series("businessDayCounts", "count", z.string().regex(/^\d{1,3}$/)) : null;
  if (conventions?.includes("business_days_252") && !input.terms.businessDayCounts) gaps.push({operand: prefix + "businessDayCounts", reason: "Adopted business-day counts required"});
  const amort = series("scheduledPrincipal", "currency", unsigned);
  const coupons = series("paysAccruedInterest", "boolean", z.enum(["true", "false"]));
  const costInventory = Object.entries(input.terms.costAssessments).flatMap(([category, s]) => {
    const status = read(s, "costAssessments." + category, "convention", "text", z.enum(["specified", "zero", "not_applicable", "unknown"]));
    if (status === null) return [];
    return [{category: category as "origination_fee" | "recurring_fee" | "tax" | "other", status, reason: entries.get(s.decisionId!)!.reason}];
  });
  if (withheld !== null && !/^0(?:\.0+)?$/.test(withheld) && costInventory.length === 4
    && costInventory.every(c => c.status === "zero" || c.status === "not_applicable")) throw new Error("proposal_cost_inventory_contradicts_withholding");
  if (businessDays && conventions && (!conventions.includes("business_days_252")
    || conventions.some((c, i) => c !== "business_days_252" && businessDays[i] !== "0"))) throw new Error("proposal_unused_business_day_counts");
  let schedule: ReturnType<typeof buildDeferredFinancingSchedule> | null = null;
  let cost: ReturnType<typeof solveEquivalentFinancingSpread> | null = null;
  if (!gaps.length && gross !== null && withheld !== null && spread !== null && unpaid && lower !== null && upper !== null && ends && fractions && curve && conventions && amort && coupons) {
    if ([fractions, curve, conventions, amort, coupons, ...(businessDays ? [businessDays] : [])].some(a => a.length !== ends.length)) throw new Error("proposal_basis_series_length_mismatch");
    if (ends.at(-1) !== input.endDate) throw new Error("proposal_basis_horizon_mismatch");
    const periods: DeferredFinancingScheduleInput["periods"] = ends.map((endDate, i) => ({id: `${input.proposalId}:${i}`, startDate: i ? ends[i - 1]! : input.openingDate, endDate,
      yearFraction: fractions[i]!, annualIndex: curve[i]!, yearFractionConvention: conventions[i]!,
      ...(conventions[i] === "business_days_252" && businessDays ? {businessDays: Number(businessDays[i]!)} : {}),
      sourceAnchor: `basis:${basis.versionId}:${input.terms.annualIndex.decisionId}`,
      scheduledPrincipal: amort[i]!, paysAccruedInterest: coupons[i] === "true"}));
    schedule = buildDeferredFinancingSchedule({baseDate: input.openingDate, currency: input.currency, moneyUnit: "currency units", grossAdvance: gross,
      upfrontWithheldCosts: withheld, annualSpread: spread, unpaidInterestBase: unpaid, periods});
    cost = solveEquivalentFinancingSpread({baseDate: input.openingDate, currency: input.currency, moneyUnit: "currency units", intervals: periods.map(({scheduledPrincipal: _principal, paysAccruedInterest: _coupon, ...p}) => p),
      netFlows: schedule.netFlows, costInventory, convention: "multiplicative_index_and_spread_on_net_borrower_flows", lowerSpread: lower, upperSpread: upper});
    if (cost.status === "missing_inputs") cost.gaps.forEach(g => gaps.push({operand: prefix + "costAssessments." + g.category, reason: g.reason}));
    if (cost.status === "root_not_bracketed") gaps.push({operand: prefix + "spreadBracket", reason: "Equivalent spread is outside the adopted root bracket"});
  }
  const payload = {schemaVersion: "adopted-financing-proposal.v1" as const, adapterVersion: adoptedFinancingProposalVersion, financialCoreVersion,
    scope: input.scope, proposalId: input.proposalId, entityId: input.entityId, perimeter: input.perimeter, currency: input.currency,
    scenario: input.scenario, openingDate: input.openingDate, endDate: input.endDate, basisFingerprint: input.envelope.fingerprint,
    status: gaps.length ? "missing_inputs" as const : "partial_composition" as const, schedule, cost, gaps, bindings, normalization,
    contributions: [...used.values()], derivedDependencies: [{result: "schedule_and_equivalent_cost", decisionIds: [...used.keys()]}],
    classification: [...used.values()].some(e => e.kind === "hypothesis") ? "working_hypothesis" as const : "working_selection" as const,
    exclusions: ["company_liquidity", "covenants", "guarantees", "firmness", "additional_cash_costs", "choice_of_counterparty"] as const,
    grantsExecution: false as const, grantsPublication: false as const};
  return {...payload, fingerprint: createHash("sha256").update(JSON.stringify(payload)).digest("hex")};
}
