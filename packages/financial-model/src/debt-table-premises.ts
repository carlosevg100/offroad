import {z} from "zod";
import {debtTableComponents} from "@offroad/financial-core";
import {capacityUuid} from "./debt-capacity-premises";
import type {ProposedHypothesis} from "./investment-premises";

const text = z.string().trim().min(1).max(2000);
const label = z.string().trim().min(1).max(300);
const key = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/);
/** Money carries at most eight decimals, as the adopted numeric representation reads it. */
const amount = z.string().regex(/^\d{1,24}(?:\.\d{1,8})?$/);
const money = z.string().regex(/^-?\d{1,24}(?:\.\d{1,8})?$/);
const ratio = z.string().regex(/^-?\d{1,4}(?:\.\d{1,20})?$/);
const origins = ["document", "informed", "house", "estimate"] as const;
const originLabel: Record<(typeof origins)[number], string> = {document: "documento", informed: "informado", house: "premissa da casa", estimate: "estimativa"};
/** A value and where it came from; the source names the document, the message or the house rule. */
const fact = <T extends z.ZodType>(value: T) => z.strictObject({value, origin: z.enum(origins), source: text});
const indexers = ["CDI", "TLP", "IPCA", "SELIC", "fixed", "other"] as const;
const categories = ["lease", "supplier_finance", "guarantee_given"] as const;

/** One instrument as its prevailing terms state them (contract with amendments). The optional terms
 * are null when the contract has none; the cross-default terms are null when the clause does not exist. */
const instrument = z.strictObject({
  id: key, label: text, creditor: text, borrower: text,
  principal: amount, accruedInterest: amount, unamortizedCost: money,
  indexer: z.enum(indexers), spread: ratio,
  /** Remaining principal payments after the reference date, in order. */
  paymentDates: z.array(z.iso.date()).min(1).max(240), paymentAmounts: z.array(amount).min(1).max(240),
  guarantee: text, encumbranceAmount: amount.nullable(), usesBasketOf: z.array(key).min(1).max(12).nullable(),
  covenant: text,
  crossDefaultAcceleration: z.enum(["automatic", "non_automatic", "none"]), crossDefaultThreshold: amount.nullable(), crossDefaultScope: text.nullable(),
  crossDefaultScopeKind: z.enum(["any_financial_debt", "named_creditors"]).nullable(), crossDefaultCreditors: z.array(text).min(1).max(12).nullable(),
  crossDefaultThresholdBasis: z.enum(["amount_in_default", "outstanding_principal"]).nullable(),
  prepayment: text, negativePledgeBasket: amount.nullable(),
});
/** The credit line's creditor is required: the table reads it and the cross-default scope matches by it. */
const creditLine = z.strictObject({id: key, label: text, creditor: text, limit: amount, drawn: amount});
const obligation = z.strictObject({id: key, kind: z.enum(categories), label: text, creditor: text.nullable(), amount});
const view = z.strictObject({id: key, label, components: z.array(z.enum(debtTableComponents)).min(1).max(7)});
const leverage = z.strictObject({viewId: key, label, ebitda: money, ebitdaDeduction: money});

/** The facts of one company debt table, each with its origin. Nothing here is adopted until a person
 * confirms the set; every number the method reads comes from the adopted basis, not from this object.
 * The reference date is the opening of the horizon; money is in the company's currency units. */
export const debtTableFactsSchema = z.strictObject({
  tableId: z.uuid(), entityId: z.uuid(), perimeter: text, currency: z.string().regex(/^[A-Z]{3}$/), definitionVersionId: z.uuid(),
  referenceDate: z.iso.date(), endDate: z.iso.date(),
  instruments: z.array(fact(instrument)).min(1).max(12),
  creditLines: z.array(fact(creditLine)).max(8),
  otherObligations: z.array(fact(obligation)).max(16),
  reportedAccountingBalance: fact(money), availableCash: fact(money),
  indexRates: z.array(fact(z.strictObject({indexer: z.enum(indexers).exclude(["fixed"]), annualRate: ratio}))).max(8),
  /** Each view is a definition; the first is the base of the bridge. */
  views: z.array(fact(view)).min(1).max(6),
  leverage: z.array(fact(leverage)).max(4),
  completeness: fact(z.strictObject({status: z.enum(["proven", "unproven"]), evidence: text})),
  categoryCoverage: z.strictObject({lease: fact(z.enum(["examined", "not_examined"])), supplier_finance: fact(z.enum(["examined", "not_examined"])),
    guarantee_given: fact(z.enum(["examined", "not_examined"]))}),
}).superRefine((f, ctx) => {
  const fail = (message: string) => ctx.addIssue({code: "custom", message});
  if (f.endDate <= f.referenceDate) fail("The horizon must end after the reference date");
  const ids = [...f.instruments, ...f.creditLines, ...f.otherObligations].map((x) => x.value.id);
  if (new Set(ids).size !== ids.length) fail("Duplicate item");
  const byId = new Map(f.instruments.map((i) => [i.value.id, i.value]));
  for (const {value: i} of f.instruments) {
    if (i.paymentDates.length !== i.paymentAmounts.length) fail(`Instrument ${i.id} must have one amount per payment date`);
    if (i.paymentDates.some((d, n) => d <= f.referenceDate || (n > 0 && d < i.paymentDates[n - 1]!))) fail(`Instrument ${i.id} payments must be in order after the reference date`);
    const clause = [i.crossDefaultThreshold, i.crossDefaultScope, i.crossDefaultScopeKind, i.crossDefaultCreditors, i.crossDefaultThresholdBasis];
    if (i.crossDefaultAcceleration === "none" && clause.some((x) => x !== null)) fail(`Instrument ${i.id} has cross-default terms without the clause`);
    if (i.crossDefaultAcceleration !== "none" && (i.crossDefaultScope === null || i.crossDefaultScopeKind === null || i.crossDefaultThresholdBasis === null))
      fail(`Instrument ${i.id} cross-default needs scope, scope kind and threshold basis`);
    if (i.crossDefaultAcceleration !== "none" && (i.crossDefaultScopeKind === "named_creditors") !== (i.crossDefaultCreditors !== null))
      fail(`Instrument ${i.id} names creditors exactly when the scope is named creditors`);
    for (const holder of i.usesBasketOf ?? [])
      if (holder === i.id || byId.get(holder)?.negativePledgeBasket == null) fail(`Instrument ${i.id} uses the basket of ${holder}, which has none`);
    if (i.usesBasketOf !== null && i.encumbranceAmount === null) fail(`Instrument ${i.id} uses a basket without the encumbered amount`);
  }
  for (const {value: l} of f.creditLines) if (Number(l.drawn) > Number(l.limit)) fail(`Credit line ${l.id} drawn above its limit`);
  const viewIds = f.views.map((v) => v.value.id);
  if (new Set(viewIds).size !== viewIds.length) fail("Duplicate view");
  if (f.views.some((v) => new Set(v.value.components).size !== v.value.components.length)) fail("Duplicate view component");
  if (new Set(f.indexRates.map((r) => r.value.indexer)).size !== f.indexRates.length) fail("Duplicate index rate");
  if (f.leverage.some((l) => !viewIds.includes(l.value.viewId))) fail("Leverage on an unknown view");
  if (new Set(f.leverage.map((l) => l.value.viewId)).size !== f.leverage.length) fail("Duplicate leverage definition");
  for (const k of categories)
    if (f.categoryCoverage[k].value === "not_examined" && f.otherObligations.some((o) => o.value.kind === k)) fail(`Category ${k} has items but was not examined`);
});
export type DebtTableFacts = z.infer<typeof debtTableFactsSchema>;

export const debtTableAnalysisId = (tableId: string) => capacityUuid(`offroad:debt-table:${tableId}:analysis`);
/** The method has one scenario. */
export const debtTableScenario = "base";
/** The size of one working basis. */
export const maxDebtTableHypotheses = 256;

/** The hypotheses one confirmation adopts for the debt table: every term, statement, definition and
 * classification the adopted reader reads, plus the order and labels of the structure so the packet is
 * composed from the basis alone. Optional terms the contract lacks are not proposed. Every reason
 * states the origin of the value. Deterministic; nothing is calculated here. */
export function proposeDebtTableHypotheses(raw: unknown): ProposedHypothesis[] {
  const f = debtTableFactsSchema.parse(raw);
  const out: ProposedHypothesis[] = [], prefix = `debt_table.${debtTableAnalysisId(f.tableId)}.`;
  const why = (x: {origin: (typeof origins)[number]; source: string}) => `Origem: ${originLabel[x.origin]}. ${x.source}`;
  const house = (source: string) => `Origem: premissa da casa. ${source}`;
  const add = (path: string, unit: string, value: ProposedHypothesis["value"], reason: string) => out.push({fieldPath: prefix + path,
    dimensions: {entityId: f.entityId, perimeter: f.perimeter, periodStart: f.referenceDate, periodEnd: f.endDate, currency: f.currency, unit, scale: "1",
      scenario: debtTableScenario, definitionVersionId: f.definitionVersionId},
    value, reason});
  const num = (path: string, unit: string, value: string, reason: string) => add(path, unit, {type: "number", value}, reason);
  const txt = (path: string, unit: string, value: string, reason: string) => add(path, unit, {type: "text", value}, reason);
  const list = (path: string, unit: string, value: string[], reason: string) => add(path, unit, {type: "list", value}, reason);

  // The structure, in order: the first view is the base of the bridge and items keep their order in the table.
  list("structure.instruments", "identity", f.instruments.map((x) => x.value.id), house("Operações da tabela, na ordem adotada"));
  list("structure.creditLines", "identity", f.creditLines.map((x) => x.value.id), house("Linhas de crédito da tabela, na ordem adotada"));
  list("structure.otherObligations", "identity", f.otherObligations.map((x) => x.value.id), house("Outras obrigações da tabela, na ordem adotada"));
  list("structure.indexRates", "identity", f.indexRates.map((x) => x.value.indexer), house("Indexadores com taxa adotada"));
  list("structure.views", "identity", f.views.map((x) => x.value.id), house("Definições de dívida; a primeira é a base da ponte"));
  list("structure.leverage", "identity", f.leverage.map((x) => x.value.viewId), house("Definições com alavancagem"));

  for (const x of f.instruments) {
    const i = x.value, p = `instrument.${i.id}.`, r = why(x);
    txt(p + "label", "text", i.label, r); txt(p + "creditor", "text", i.creditor, r); txt(p + "borrower", "text", i.borrower, r);
    num(p + "principal", "currency", i.principal, r); num(p + "accruedInterest", "currency", i.accruedInterest, r); num(p + "unamortizedCost", "currency", i.unamortizedCost, r);
    txt(p + "indexer", "convention", i.indexer, r); num(p + "spread", "ratio", i.spread, r);
    list(p + "paymentDates", "date", i.paymentDates, r); list(p + "paymentAmounts", "currency", i.paymentAmounts, r);
    txt(p + "guarantee", "text", i.guarantee, r);
    if (i.encumbranceAmount !== null) num(p + "encumbranceAmount", "currency", i.encumbranceAmount, r);
    if (i.usesBasketOf !== null) list(p + "usesBasketOf", "reference_id", i.usesBasketOf, r);
    txt(p + "covenant", "text", i.covenant, r);
    txt(p + "crossDefaultAcceleration", "convention", i.crossDefaultAcceleration, r);
    if (i.crossDefaultThreshold !== null) num(p + "crossDefaultThreshold", "currency", i.crossDefaultThreshold, r);
    if (i.crossDefaultScope !== null) txt(p + "crossDefaultScope", "text", i.crossDefaultScope, r);
    if (i.crossDefaultScopeKind !== null) txt(p + "crossDefaultScopeKind", "convention", i.crossDefaultScopeKind, r);
    if (i.crossDefaultCreditors !== null) list(p + "crossDefaultCreditors", "text", i.crossDefaultCreditors, r);
    if (i.crossDefaultThresholdBasis !== null) txt(p + "crossDefaultThresholdBasis", "convention", i.crossDefaultThresholdBasis, r);
    txt(p + "prepayment", "text", i.prepayment, r);
    if (i.negativePledgeBasket !== null) num(p + "negativePledgeBasket", "currency", i.negativePledgeBasket, r);
  }
  for (const x of f.creditLines) {
    const l = x.value, p = `credit_line.${l.id}.`, r = why(x);
    txt(p + "label", "text", l.label, r); txt(p + "creditor", "text", l.creditor, r);
    num(p + "limit", "currency", l.limit, r); num(p + "drawn", "currency", l.drawn, r);
  }
  for (const x of f.otherObligations) {
    const o = x.value, p = `obligation.${o.id}.`, r = why(x);
    txt(p + "kind", "convention", o.kind, r); txt(p + "label", "text", o.label, r);
    if (o.creditor !== null) txt(p + "creditor", "text", o.creditor, r);
    num(p + "amount", "currency", o.amount, r);
  }
  num("reportedAccountingBalance", "currency", f.reportedAccountingBalance.value, why(f.reportedAccountingBalance));
  num("availableCash", "currency", f.availableCash.value, why(f.availableCash));
  for (const x of f.indexRates) num(`index_rate.${x.value.indexer}`, "ratio", x.value.annualRate, why(x));
  for (const x of f.views) {
    txt(`view.${x.value.id}.label`, "explanation", x.value.label, why(x));
    list(`view.${x.value.id}.components`, "convention", x.value.components, why(x));
  }
  for (const x of f.leverage) {
    const p = `leverage.${x.value.viewId}.`;
    txt(p + "label", "explanation", x.value.label, why(x));
    num(p + "ebitda", "currency", x.value.ebitda, why(x)); num(p + "ebitdaDeduction", "currency", x.value.ebitdaDeduction, why(x));
  }
  txt("completenessStatus", "convention", f.completeness.value.status, why(f.completeness));
  txt("completenessEvidence", "text", f.completeness.value.evidence, why(f.completeness));
  for (const k of categories) txt(`categoryCoverage.${k}`, "convention", f.categoryCoverage[k].value, why(f.categoryCoverage[k]));
  // A working basis holds at most 256 premises; a set larger than that is refused here, not at confirmation.
  if (out.length > maxDebtTableHypotheses) throw new Error("debt_table_premises_exceed_basis");
  return out;
}
