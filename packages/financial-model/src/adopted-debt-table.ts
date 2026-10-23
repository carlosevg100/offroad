import {createHash} from "node:crypto";
import {z} from "zod";
import {buildDebtTable, debtTableComponents, financialCoreVersion, type DebtTableInput} from "@offroad/financial-core";
import {adoptedValueSelectionSchema as selection} from "./adopted-debt-inputs";
import {adoptedAnalysisContextSchema, analysisAmount, analysisReference, createAnalysisBinding} from "./adopted-analysis-binding";

const key = z.string().trim().min(1).max(160), label = z.string().trim().min(1).max(300);
const instrumentTerms = z.strictObject({
  label: selection, creditor: selection, borrower: selection,
  principal: selection, accruedInterest: selection, unamortizedCost: selection,
  indexer: selection, spread: selection, paymentDates: selection, paymentAmounts: selection,
  guarantee: selection, encumbranceAmount: selection.nullable(), usesBasketOf: selection.nullable(),
  covenant: selection, crossDefaultAcceleration: selection, crossDefaultThreshold: selection.nullable(), crossDefaultScope: selection.nullable(),
  crossDefaultScopeKind: selection.nullable(), crossDefaultCreditors: selection.nullable(), crossDefaultThresholdBasis: selection.nullable(),
  prepayment: selection, negativePledgeBasket: selection.nullable(),
});
export const adoptedDebtTableInputSchema = adoptedAnalysisContextSchema.safeExtend({
  analysisId: z.uuid(), scenario: z.string().trim().min(1).max(160),
  instruments: z.array(z.strictObject({id: key, terms: instrumentTerms})).min(1).max(12),
  creditLines: z.array(z.strictObject({id: key, label: selection, creditor: selection, limit: selection, drawn: selection})).max(8),
  otherObligations: z.array(z.strictObject({id: key, kind: selection, label: selection, creditor: selection.nullable(), amount: selection})).max(16),
  reportedAccountingBalance: selection, availableCash: selection,
  indexRates: z.array(z.strictObject({indexer: key, annualRate: selection})).max(8),
  views: z.array(z.strictObject({id: key, label, components: selection})).min(1).max(6),
  leverage: z.array(z.strictObject({viewId: key, label, ebitda: selection, ebitdaDeduction: selection})).max(4),
  completenessStatus: selection, completenessEvidence: selection,
  /** Whether leases, supplier finance and guarantees given were examined; examined with no item is a confirmed absence. */
  categoryCoverage: z.strictObject({lease: selection, supplier_finance: selection, guarantee_given: selection}),
}).refine(i => i.endDate > i.openingDate, "Invalid horizon")
  .refine(i => new Set([...i.instruments.map(x => x.id), ...i.creditLines.map(x => x.id), ...i.otherObligations.map(x => x.id)]).size
    === i.instruments.length + i.creditLines.length + i.otherObligations.length, "Duplicate item")
  .refine(i => new Set(i.views.map(v => v.id)).size === i.views.length, "Duplicate view")
  .refine(i => new Set(i.indexRates.map(r => r.indexer)).size === i.indexRates.length, "Duplicate index rate");
export type AdoptedDebtTableInput = z.infer<typeof adoptedDebtTableInputSchema>;

const words = z.string().trim().min(1).max(2000);
const unsigned = z.string().regex(/^\d{1,24}(?:\.\d{1,20})?$/);

/** The debt table over one adopted basis. Every amount, term text, schedule, definition and
 * classification is an adopted contribution read in its own context; structural ids and view
 * labels are the composer's, never a number. The reference date is the opening of the horizon. */
export function calculateAdoptedDebtTable(raw: unknown) {
  const input = adoptedDebtTableInputSchema.parse(raw), prefix = `debt_table.${input.analysisId}.`, sc = input.scenario;
  const monetary = [input.reportedAccountingBalance, input.availableCash,
    ...input.instruments.flatMap(i => [i.terms.principal, i.terms.accruedInterest, i.terms.unamortizedCost, i.terms.paymentAmounts,
      ...[i.terms.encumbranceAmount, i.terms.crossDefaultThreshold, i.terms.negativePledgeBasket].flatMap(s => s ? [s] : [])]),
    ...input.creditLines.flatMap(l => [l.limit, l.drawn]), ...input.otherObligations.map(o => o.amount),
    ...input.leverage.flatMap(l => [l.ebitda, l.ebitdaDeduction])];
  const b = createAnalysisBinding(input, monetary);
  const read = <T>(s: z.infer<typeof selection>, path: string, unit: string, type: "number" | "text" | "date" | "boolean" | "list", schema: z.ZodType<T>) =>
    b.read(s, prefix + path, sc, unit, type, schema);
  const optional = <T>(s: z.infer<typeof selection> | null, path: string, unit: string, type: "number" | "text" | "list", schema: z.ZodType<T>) =>
    s === null ? {absent: true as const, value: null} : {absent: false as const, value: read(s, path, unit, type, schema)};

  let complete = true;
  const need = <T>(v: T | null): T => {if (v === null) complete = false; return v as T;};
  const instruments = input.instruments.map(({id, terms: t}) => {
    const p = `instrument.${id}.`;
    const dates = read(t.paymentDates, p + "paymentDates", "date", "list", z.array(z.iso.date()).min(1).max(240));
    const amounts = read(t.paymentAmounts, p + "paymentAmounts", "currency", "list", z.array(unsigned).min(1).max(240));
    if (dates && amounts && dates.length !== amounts.length) throw new Error("debt_table_adopted_schedule_mismatch");
    const encumbrance = optional(t.encumbranceAmount, p + "encumbranceAmount", "currency", "number", unsigned);
    const basketOf = optional(t.usesBasketOf, p + "usesBasketOf", "reference_id", "list", z.array(analysisReference).max(12));
    const threshold = optional(t.crossDefaultThreshold, p + "crossDefaultThreshold", "currency", "number", unsigned);
    const scope = optional(t.crossDefaultScope, p + "crossDefaultScope", "text", "text", words);
    const acceleration = read(t.crossDefaultAcceleration, p + "crossDefaultAcceleration", "convention", "text", z.enum(["automatic", "non_automatic", "none"]));
    const basket = optional(t.negativePledgeBasket, p + "negativePledgeBasket", "currency", "number", unsigned);
    const clauseTerms = [t.crossDefaultThreshold, t.crossDefaultScope, t.crossDefaultScopeKind, t.crossDefaultCreditors, t.crossDefaultThresholdBasis];
    if (acceleration === "none" && clauseTerms.some(Boolean)) throw new Error("debt_table_cross_default_without_clause");
    if (acceleration !== null && acceleration !== "none" && (!t.crossDefaultScope || !t.crossDefaultScopeKind || !t.crossDefaultThresholdBasis)) throw new Error("debt_table_cross_default_scope_required");
    const scopeKind = optional(t.crossDefaultScopeKind, p + "crossDefaultScopeKind", "convention", "text", z.enum(["any_financial_debt", "named_creditors"]));
    const creditors = optional(t.crossDefaultCreditors, p + "crossDefaultCreditors", "text", "list", z.array(words).min(1).max(12));
    const basis = optional(t.crossDefaultThresholdBasis, p + "crossDefaultThresholdBasis", "convention", "text", z.enum(["amount_in_default", "outstanding_principal"]));
    const row = {
      id, label: need(read(t.label, p + "label", "text", "text", words)), creditor: need(read(t.creditor, p + "creditor", "text", "text", words)),
      borrower: need(read(t.borrower, p + "borrower", "text", "text", words)),
      principal: need(read(t.principal, p + "principal", "currency", "number", unsigned)),
      accruedInterest: need(read(t.accruedInterest, p + "accruedInterest", "currency", "number", unsigned)),
      unamortizedCost: need(read(t.unamortizedCost, p + "unamortizedCost", "currency", "number", analysisAmount)),
      indexer: need(read(t.indexer, p + "indexer", "convention", "text", z.enum(["CDI", "TLP", "IPCA", "SELIC", "fixed", "other"]))),
      spread: read(t.spread, p + "spread", "ratio", "number", z.string().regex(/^-?\d{1,4}(?:\.\d{1,20})?$/)),
      amortization: dates && amounts ? dates.map((date, n) => ({date, amount: amounts[n]!})) : need<{date: string; amount: string}[]>(null),
      guarantee: {description: need(read(t.guarantee, p + "guarantee", "text", "text", words)),
        encumbranceAmount: encumbrance.absent ? null : need(encumbrance.value), usesBasketOf: basketOf.absent ? [] : need(basketOf.value)},
      covenant: need(read(t.covenant, p + "covenant", "text", "text", words)),
      crossDefault: acceleration === null ? need(null) : acceleration === "none" ? null
        : {threshold: threshold.absent ? null : need(threshold.value), acceleration, scope: need(scope.value), scopeKind: need(scopeKind.value),
          creditors: creditors.absent ? [] : need(creditors.value), thresholdBasis: need(basis.value)},
      prepayment: need(read(t.prepayment, p + "prepayment", "text", "text", words)),
      negativePledgeBasket: basket.absent ? null : need(basket.value),
    };
    return row;
  });
  const creditLines = input.creditLines.map(l => {
    const p = `credit_line.${l.id}.`;
    return {id: l.id, label: need(read(l.label, p + "label", "text", "text", words)), creditor: need(read(l.creditor, p + "creditor", "text", "text", words)),
      limit: need(read(l.limit, p + "limit", "currency", "number", unsigned)), drawn: need(read(l.drawn, p + "drawn", "currency", "number", unsigned))};
  });
  const otherObligations = input.otherObligations.map(o => {
    const p = `obligation.${o.id}.`, creditor = optional(o.creditor, p + "creditor", "text", "text", words);
    return {id: o.id, kind: need(read(o.kind, p + "kind", "convention", "text", z.enum(["lease", "supplier_finance", "guarantee_given"]))),
      label: need(read(o.label, p + "label", "text", "text", words)), creditor: creditor.absent ? null : need(creditor.value),
      amount: need(read(o.amount, p + "amount", "currency", "number", unsigned))};
  });
  const reported = read(input.reportedAccountingBalance, "reportedAccountingBalance", "currency", "number", analysisAmount);
  const cash = read(input.availableCash, "availableCash", "currency", "number", analysisAmount);
  const indexRates = input.indexRates.flatMap(r => {
    const v = read(r.annualRate, `index_rate.${r.indexer}`, "ratio", "number", z.string().regex(/^-?\d{1,4}(?:\.\d{1,20})?$/));
    return v === null ? [] : [{indexer: r.indexer, annualRate: v}];
  });
  const views = input.views.map(v => ({id: v.id, label: v.label,
    components: need(read(v.components, `view.${v.id}.components`, "convention", "list", z.array(z.enum(debtTableComponents)).min(1).max(7)))}));
  const leverage = input.leverage.flatMap(l => {
    if (!input.views.some(v => v.id === l.viewId)) throw new Error("debt_table_unknown_view");
    const ebitda = read(l.ebitda, `leverage.${l.viewId}.ebitda`, "currency", "number", analysisAmount);
    const deduction = read(l.ebitdaDeduction, `leverage.${l.viewId}.ebitdaDeduction`, "currency", "number", analysisAmount);
    return ebitda === null || deduction === null ? [] : [{viewId: l.viewId, label: l.label, ebitda, ebitdaDeduction: deduction}];
  });
  const status = need(read(input.completenessStatus, "completenessStatus", "convention", "text", z.enum(["proven", "unproven"])));
  const evidence = need(read(input.completenessEvidence, "completenessEvidence", "text", "text", words));

  const coverageOf = (k: "lease" | "supplier_finance" | "guarantee_given") => need(read(input.categoryCoverage[k], `categoryCoverage.${k}`, "convention", "text", z.enum(["examined", "not_examined"])));
  const categoryCoverage = {lease: coverageOf("lease"), supplier_finance: coverageOf("supplier_finance"), guarantee_given: coverageOf("guarantee_given")};
  const kernelInput: DebtTableInput | null = complete ? {referenceDate: input.openingDate, currency: input.currency, instruments, creditLines,
    otherObligations, reportedAccountingBalance: reported, views, availableCash: cash, indexRates, leverage,
    completeness: {status, evidence}, categoryCoverage} : null;
  const table = kernelInput ? buildDebtTable(kernelInput) : null;
  const payload = {schemaVersion: "adopted-debt-table.v1" as const, financialCoreVersion, scope: input.scope, analysisId: input.analysisId,
    entityId: input.entityId, perimeter: input.perimeter, currency: input.currency, referenceDate: input.openingDate,
    basisFingerprint: input.envelope.fingerprint, table,
    gaps: b.gaps, bindings: b.bindings, normalization: b.normalization, contributions: [...b.used.values()],
    status: table ? "partial_composition" as const : "missing_inputs" as const,
    derivedDependencies: [{result: "debt_table", decisionIds: [...b.used.keys()]}],
    classification: [...b.used.values()].some(e => e.kind === "hypothesis") ? "working_hypothesis" as const : "working_selection" as const,
    exclusions: ["contract_extraction", "covenant_measurement", "credit_approval", "structure_opinion", "method_release"] as const,
    grantsExecution: false as const, grantsPublication: false as const};
  return {...payload, fingerprint: createHash("sha256").update(JSON.stringify(payload)).digest("hex")};
}
