import {z} from "zod";
import {debtTableFactsSchema, proposeDebtTableHypotheses, type DebtTableFacts} from "@offroad/financial-model";
import {citedSource, extractedAmount, extractedMoney, extractedOrigin, fingerprintedProposal, itemKeys, itemLabel, itemSource, proposeLote2PremisesForTurn,
  sameLabel, sourced, stated, type Lote2Completion, type Sourced, summaryRow, type Lote2Summary} from "./lote2-premises";
import {premiseEntry, turnIntentInstruction, turnIntents} from "./premise-cue";

/** The method these premises feed, pinned to its implemented version. */
export const debtTablePremiseMethod = {methodId: "build-company-debt-table", methodVersion: "2026.10.23-v1"} as const;

/** A table of the company's debt: the turn may propose the table's premises. A statement after the latest such
 * request among the recent messages is a continuation candidate; the extraction's `turnIntent` decides it. */
export function shouldProposeDebtTablePremises(message: string, hasAttachments: boolean, earlierUserMessages: readonly string[] = []): boolean {
  return premiseEntry("debt_table", message, hasAttachments, earlierUserMessages) !== null;
}

/** Why the table is needed decides what the reading leads with. */
export const debtTableSituations = ["refinancing", "near-covenant", "restructuring"] as const;
const indexers = ["CDI", "TLP", "IPCA", "SELIC", "fixed", "other"] as const;
const categories = ["lease", "supplier_finance", "guarantee_given"] as const;
const components = ["principal", "accrued_interest", "unamortized_cost", "drawn_credit_lines", "lease", "supplier_finance", "guarantee_given"] as const;
const text = z.string().trim().min(1).max(2000);
const item = {label: itemLabel, origin: extractedOrigin, source: itemSource};

/** Only what the person said or a document states. Absence stays null; nothing is estimated here. */
export const debtTableExtractionSchema = z.strictObject({
  turnIntent: z.enum(turnIntents),
  needSituation: sourced(z.enum(debtTableSituations)),
  /** The date the table is read at: the balances and the remaining payments are as of it. */
  referenceDate: sourced(z.iso.date()),
  instruments: z.array(z.strictObject({...item,
    creditor: text.nullable(), borrower: text.nullable(),
    principal: extractedAmount.nullable(), accruedInterest: extractedAmount.nullable(), unamortizedCost: extractedMoney.nullable(),
    indexer: z.enum(indexers).nullable(), spread: z.number().min(0).max(1).nullable(),
    /** Remaining principal payments after the reference date. */
    payments: z.array(z.strictObject({date: z.iso.date(), amount: extractedAmount})).min(1).max(240).nullable(),
    guarantee: text.nullable(),
    /** The amount of assets this instrument encumbers, when its guarantee is a lien. */
    encumbranceAmount: extractedAmount.nullable(),
    /** Labels of the instruments whose negative pledge basket this lien uses. */
    usesBasketOf: z.array(itemLabel).min(1).max(12).nullable(),
    covenant: text.nullable(),
    crossDefault: z.strictObject({
      acceleration: z.enum(["automatic", "non_automatic", "none"]), threshold: extractedAmount.nullable(), scope: text.nullable(),
      scopeKind: z.enum(["any_financial_debt", "named_creditors"]).nullable(), creditors: z.array(text).min(1).max(12).nullable(),
      thresholdBasis: z.enum(["amount_in_default", "outstanding_principal"]).nullable(),
    }).nullable(),
    prepayment: text.nullable(), negativePledgeBasket: extractedAmount.nullable(),
  })).max(12),
  creditLines: z.array(z.strictObject({...item, creditor: text.nullable(), limit: extractedAmount.nullable(), drawn: extractedAmount.nullable()})).max(8),
  otherObligations: z.array(z.strictObject({...item, kind: z.enum(categories), creditor: text.nullable(), amount: extractedAmount.nullable()})).max(16),
  reportedAccountingBalance: sourced(extractedMoney), availableCash: sourced(extractedMoney),
  indexRates: z.array(z.strictObject({indexer: z.enum(indexers).exclude(["fixed"]), annualRate: z.number().min(0).max(1), origin: extractedOrigin, source: itemSource})).max(8),
  /** Debt definitions written in the indenture or the notes; components as the definition adds them. */
  views: z.array(z.strictObject({...item, components: z.array(z.enum(components)).min(1).max(7)})).max(4),
  leverage: z.array(z.strictObject({...item, viewLabel: itemLabel, ebitda: extractedMoney, ebitdaDeduction: extractedMoney})).max(4),
  /** The company's EBITDA of the last twelve months, which a bank divides the market definition by. */
  lastTwelveMonthsEbitda: sourced(extractedMoney),
  /** An external register of the company's debt (Registrato, SCR): received or not. */
  externalRegister: sourced(z.enum(["received", "not_received"])),
  categoryCoverage: z.strictObject({lease: sourced(z.enum(["examined", "not_examined"])), supplier_finance: sourced(z.enum(["examined", "not_examined"])),
    guarantee_given: sourced(z.enum(["examined", "not_examined"]))}),
});
export type DebtTableExtraction = z.infer<typeof debtTableExtractionSchema>;

export const debtTableExtractionContract = {
  task: "debt_table_extraction" as const,
  system: [
    "Você extrai os dados que permitem montar a tabela de dívida da companhia, a partir da mensagem de uma pessoa, das mensagens anteriores e de campos já extraídos de documentos (contratos, escrituras, aditamentos, notas explicativas, balancetes, extratos, Registrato).",
    "Extraia somente o que foi dito ou o que está em documento. Se não estiver, devolva null (em value, origin e source, ou no campo). Nunca estime, nunca complete, nunca arredonde por conta própria.",
    "needSituation é por que a tabela é necessária: refinanciamento (refinancing), companhia perto de covenant (near-covenant) ou reestruturação (restructuring). Só preencha se a conversa ou o documento disser.",
    "Valores monetários em reais, sem separador de milhar (R$ 60 milhões vira 60000000). Taxas em fração (CDI + 2,4% vira spread 0.024). Datas no formato AAAA-MM-DD.",
    "referenceDate é a data da posição (por exemplo o balancete de 30/jun). Para cada operação, pela cláusula vigente (contrato com aditamentos): credor, devedor, principal, juros acruados, custo a amortizar (negativo quando reduz o saldo), indexador (CDI, TLP, IPCA, SELIC, fixed ou other) e spread, cada pagamento de principal restante depois da data da posição, garantia, covenant financeiro (escreva \"Nenhum covenant financeiro\" quando o contrato não tiver), cross-default e pré-pagamento.",
    "No cross-default: acceleration none quando não há cláusula; senão automatic ou non_automatic, o limiar em reais quando houver, o escopo como escrito, scopeKind any_financial_debt ou named_creditors com os credores nomeados, e thresholdBasis amount_in_default (valor em atraso) ou outstanding_principal (saldo devedor).",
    "encumbranceAmount é o valor de ativos onerados pela garantia; negativePledgeBasket é a cesta de ônus permitidos da operação; usesBasketOf lista os rótulos das operações cuja cesta essa garantia ocupa.",
    "Linhas de crédito (conta garantida, rotativo): credor, limite e saldo sacado. Outras obrigações: arrendamentos (lease), risco sacado (supplier_finance) e fianças prestadas (guarantee_given), com o valor.",
    "reportedAccountingBalance é o saldo de empréstimos e financiamentos da nota explicativa; availableCash é o caixa disponível na data. indexRates só quando a taxa do indexador estiver em documento ou na conversa.",
    "views são definições de dívida escritas (por exemplo a da escritura e a contábil), com os componentes que somam. leverage é a alavancagem de uma definição: rótulo da definição em viewLabel, EBITDA e a dedução que a definição manda fazer. lastTwelveMonthsEbitda é o EBITDA dos últimos doze meses, quando dito.",
    "externalRegister é received quando o Registrato ou o SCR foi enviado, not_received quando foi dito que não foi. categoryCoverage diz se arrendamentos, risco sacado e fianças foram examinados, quando dito.",
    "origin é informed quando a pessoa disse, document quando veio de um campo de documento. source cita em poucas palavras de onde veio.",
    turnIntentInstruction,
  ].join("\n"),
  schema: debtTableExtractionSchema,
  schemaName: "debt_table_extraction_v2",
  outputMode: "prompted_json" as const,
  maxOutputTokens: 16_000,
  cacheKey: "debt-table-extraction-2026.10.23-v2",
};

/** The definitions a bank or an agency reads that the company's documents do not write. */
const houseViews = [
  {id: "ifrs16", label: "Com arrendamentos", components: ["principal", "drawn_credit_lines", "lease"] as const, source: "definição com arrendamentos"},
  {id: "mercado", label: "Mercado", components: ["principal", "drawn_credit_lines", "lease", "supplier_finance"] as const, source: "leitura de bancos e agências"},
];
const accountingView = {id: "contabil", label: "Contábil", components: ["principal", "accrued_interest", "unamortized_cost"] as const, source: "definição contábil de empréstimos e financiamentos"};
const sameComponents = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((c) => b.includes(c));

/** Turns the extraction into the facts the method needs. Required facts nobody stated make the
 * proposal wait; the reply asks for them in one batch. House premises are only the conventions the
 * method reads that a company does not state: the definitions with leases and of the market, the
 * accounting definition when none is written, completeness unproven without an external register,
 * and a category nobody examined. Nothing about the company's debt is assumed. */
export function completeDebtTableFacts(input: {extraction: DebtTableExtraction; ids: {tableId: string; entityId: string; definitionVersionId: string}; currency: "BRL"}): Lote2Completion<DebtTableFacts> {
  const e = input.extraction, missing: string[] = [], used: string[] = [];
  const need = <T>(name: string, f: Sourced<T>) => {const s = stated(f); if (!s) missing.push(name); return s;};
  const situation = need("needSituation", e.needSituation), reference = need("referenceDate", e.referenceDate);
  if (!e.instruments.length) missing.push("instruments");
  const reported = need("reportedAccountingBalance", e.reportedAccountingBalance), cash = need("availableCash", e.availableCash);
  const ids = itemKeys([...e.instruments.map((i) => i.label), ...e.creditLines.map((l) => l.label), ...e.otherObligations.map((o) => o.label)]);
  const instrumentIds = ids.slice(0, e.instruments.length), lineIds = ids.slice(e.instruments.length, e.instruments.length + e.creditLines.length);
  const obligationIds = ids.slice(e.instruments.length + e.creditLines.length);
  const instruments = e.instruments.map((i, n) => {
    const p = `instruments.${n + 1}.`, before = missing.length;
    for (const k of ["creditor", "borrower", "principal", "accruedInterest", "unamortizedCost", "indexer", "spread", "payments", "guarantee", "covenant", "crossDefault", "prepayment"] as const)
      if (i[k] === null) missing.push(p + k);
    const payments = [...(i.payments ?? [])].sort((a, b) => a.date.localeCompare(b.date));
    if (reference && payments.some((x) => x.date <= reference.value)) missing.push(p + "payments");
    const basket = (i.usesBasketOf ?? []).map((label) => e.instruments.findIndex((o) => sameLabel(o.label, label)));
    if (basket.some((k) => k < 0 || k === n || e.instruments[k]!.negativePledgeBasket === null) || (i.usesBasketOf !== null && i.encumbranceAmount === null)) missing.push(p + "usesBasketOf");
    const c = i.crossDefault;
    if (c && c.acceleration !== "none" && (c.scope === null || c.scopeKind === null || c.thresholdBasis === null || (c.scopeKind === "named_creditors") !== (c.creditors !== null))) missing.push(p + "crossDefault");
    if (missing.length > before) return null;
    const clause = c!.acceleration === "none" ? {crossDefaultThreshold: null, crossDefaultScope: null, crossDefaultScopeKind: null, crossDefaultCreditors: null, crossDefaultThresholdBasis: null}
      : {crossDefaultThreshold: c!.threshold, crossDefaultScope: c!.scope, crossDefaultScopeKind: c!.scopeKind, crossDefaultCreditors: c!.scopeKind === "named_creditors" ? c!.creditors : null, crossDefaultThresholdBasis: c!.thresholdBasis};
    return {value: {id: instrumentIds[n]!, label: i.label, creditor: i.creditor!, borrower: i.borrower!, principal: i.principal!, accruedInterest: i.accruedInterest!, unamortizedCost: i.unamortizedCost!,
      indexer: i.indexer!, spread: String(i.spread!), paymentDates: payments.map((x) => x.date), paymentAmounts: payments.map((x) => x.amount), guarantee: i.guarantee!,
      encumbranceAmount: i.encumbranceAmount, usesBasketOf: i.usesBasketOf === null ? null : basket.map((k) => instrumentIds[k]!), covenant: i.covenant!,
      crossDefaultAcceleration: c!.acceleration, ...clause, prepayment: i.prepayment!, negativePledgeBasket: i.negativePledgeBasket},
      origin: i.origin, source: citedSource(i.origin, i.source)};
  });
  const creditLines = e.creditLines.map((l, n) => {
    const p = `creditLines.${n + 1}.`, before = missing.length;
    for (const k of ["creditor", "limit", "drawn"] as const) if (l[k] === null) missing.push(p + k);
    if (l.limit !== null && l.drawn !== null && Number(l.drawn) > Number(l.limit)) missing.push(p + "drawn");
    return missing.length > before ? null : {value: {id: lineIds[n]!, label: l.label, creditor: l.creditor!, limit: l.limit!, drawn: l.drawn!}, origin: l.origin, source: citedSource(l.origin, l.source)};
  });
  const obligations = e.otherObligations.map((o, n) => {
    if (o.amount === null) {missing.push(`otherObligations.${n + 1}.amount`); return null;}
    return {value: {id: obligationIds[n]!, kind: o.kind, label: o.label, creditor: o.creditor, amount: o.amount}, origin: o.origin, source: citedSource(o.origin, o.source)};
  });
  // Coverage: a stated reading wins; a category with items was examined; otherwise nobody examined it.
  const coverage = Object.fromEntries(categories.map((k) => {
    const s = stated(e.categoryCoverage[k]), first = e.otherObligations.find((o) => o.kind === k);
    if (s?.value === "not_examined" && first) missing.push(`categoryCoverage.${k}`);
    if (s) return [k, s];
    if (first) return [k, {value: "examined" as const, origin: first.origin, source: citedSource(first.origin, first.source)}];
    used.push("categoryNotExamined");
    return [k, {value: "not_examined" as const, origin: "house" as const, source: "Ninguém confirmou se a categoria existe; fica como não examinada"}];
  })) as DebtTableFacts["categoryCoverage"];
  // Definitions: the written ones first (the first is the base of the bridge), then the house readings not already written.
  const viewIds = itemKeys(e.views.map((v) => v.label));
  const views: DebtTableFacts["views"] = e.views.map((v, n) => ({value: {id: viewIds[n]!, label: v.label, components: [...new Set(v.components)]}, origin: v.origin, source: citedSource(v.origin, v.source)}));
  if (!views.length) {views.push({value: {id: accountingView.id, label: accountingView.label, components: [...accountingView.components]}, origin: "house", source: accountingView.source}); used.push("accountingView");}
  for (const h of houseViews) if (!views.some((v) => sameComponents(v.value.components, h.components))) {
    const id = views.some((v) => v.value.id === h.id) ? `${h.id}-casa` : h.id;
    views.push({value: {id, label: h.label, components: [...h.components]}, origin: "house", source: h.source});
    used.push(h.id === "ifrs16" ? "leaseView" : "marketView");
  }
  const leverage: DebtTableFacts["leverage"] = [];
  e.leverage.forEach((l, n) => {
    const view = views.find((v) => sameLabel(v.value.label, l.viewLabel) || v.value.id === l.viewLabel);
    if (!view) {missing.push(`leverage.${n + 1}.viewLabel`); return;}
    leverage.push({value: {viewId: view.value.id, label: l.label, ebitda: l.ebitda, ebitdaDeduction: l.ebitdaDeduction}, origin: l.origin, source: citedSource(l.origin, l.source)});
  });
  // A bank divides the market definition by the last twelve months' EBITDA, with no deduction.
  const ltm = stated(e.lastTwelveMonthsEbitda), market = views.find((v) => sameComponents(v.value.components, houseViews[1]!.components));
  if (ltm && market && !leverage.some((l) => l.value.viewId === market.value.id) && leverage.length < 4) {
    leverage.unshift({value: {viewId: market.value.id, label: "Banco", ebitda: ltm.value, ebitdaDeduction: "0"}, origin: "house",
      source: `EBITDA dos últimos doze meses na leitura do banco (${ltm.source})`.slice(0, 2000)});
    used.push("bankLeverage");
  }
  const register = stated(e.externalRegister);
  const completeness = register ? {value: register.value === "received" ? {status: "proven" as const, evidence: "Registrato recebido"} : {status: "unproven" as const, evidence: "Registrato não recebido"},
    origin: register.origin, source: register.source} : {value: {status: "unproven" as const, evidence: "Registrato não recebido"}, origin: "house" as const,
    source: "Sem registro externo da dívida, a completude da tabela não está comprovada"};
  if (!register) used.push("completenessUnproven");
  if (missing.length || !situation || !reference || !reported || !cash) return {status: "missing", missing: [...new Set(missing)]};
  const items = instruments.map((x) => x!);
  const last = items.flatMap((i) => i.value.paymentDates).sort().at(-1)!;
  const facts = debtTableFactsSchema.parse({...input.ids, perimeter: "standalone", currency: input.currency, referenceDate: reference.value, endDate: `${last.slice(0, 4)}-12-31`,
    instruments: items, creditLines: creditLines.map((x) => x!), otherObligations: obligations.map((x) => x!),
    reportedAccountingBalance: reported, availableCash: cash,
    indexRates: e.indexRates.map((r) => ({value: {indexer: r.indexer, annualRate: String(r.annualRate)}, origin: r.origin, source: citedSource(r.origin, r.source)})),
    views, leverage, completeness, categoryCoverage: coverage});
  return {status: "complete", facts, situationId: situation.value, housePremiseKeys: [...new Set(used)]};
}

const houseViewKey: Record<string, string> = {[houseViews[0]!.label]: "leaseView", [houseViews[1]!.label]: "marketView", [accountingView.label]: "accountingView"};
/** The card: each instrument, credit line, other obligation and definition, and the completeness. */
export function debtTableSummary(facts: DebtTableFacts, situationId: string): Lote2Summary {
  const row = summaryRow;
  return {situationId, referenceDate: facts.referenceDate, items: [
    ...facts.instruments.map((x) => row("instrument", x.value.label, x)),
    ...facts.creditLines.map((x) => row("credit_line", x.value.label, x)),
    ...facts.otherObligations.map((x) => row("obligation", x.value.label, x)),
    ...facts.views.map((x) => row("view", x.value.label, x, x.origin === "house" ? houseViewKey[x.value.label] ?? null : null)),
    row("premise", facts.completeness.value.evidence, facts.completeness, facts.completeness.value.status === "proven" ? "completenessProven" : "completenessUnproven"),
  ]};
}

/** The proposal the worker records next to its reply: facts with origin, the hypotheses one
 * confirmation adopts, the card summary and the fingerprint the confirmation checks. */
export function buildDebtTablePremiseProposal(facts: DebtTableFacts, situationId: string) {
  return fingerprintedProposal(debtTablePremiseMethod, facts, proposeDebtTableHypotheses(facts), debtTableSummary(facts, situationId));
}

export async function proposeDebtTablePremisesForTurn(input: {
  message: string; hasAttachments: boolean; recentUserMessages: string[]; projectId: string | null;
  loadEvidence: () => Promise<unknown>; extract: (text: string) => Promise<unknown>;
  log: (event: string, detail: Record<string, unknown>) => void;
}) {
  const entry = input.projectId ? premiseEntry("debt_table", input.message, input.hasAttachments, input.recentUserMessages) : null;
  if (!input.projectId || !entry) return null;
  return proposeLote2PremisesForTurn({logPrefix: "debt_table_premises", idName: "debt-table", schema: debtTableExtractionSchema,
    complete: (extraction, id) => completeDebtTableFacts({extraction, ids: {tableId: id, entityId: id, definitionVersionId: id}, currency: "BRL"}),
    build: buildDebtTablePremiseProposal}, {...input, entry, projectId: input.projectId});
}
