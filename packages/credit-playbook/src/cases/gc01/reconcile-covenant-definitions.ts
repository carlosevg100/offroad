/**
 * Case 01 (Camil, banker preparing a meeting): the frozen inputs of `reconcile-covenant-definitions` as the
 * executor consumes them, curated from the review corpus of the case with an anchor on every
 * value, plus the helpers that build them. The product's integration_preview reads these
 * inputs instead of extracting them live; that is declared wherever they appear. Hypothetical
 * fixtures in this file are labelled as such in their own notes.
 */
import {reconcileCovenantDefinitions, type CovenantReconciliationInput} from "../../executors/reconcile-covenant-definitions";

/** Camil, four live indentures (answer key section 13.1). Balances of 31/05/2026 in R$ thousand; anchors per clause and page. */
export const netDebt = "somatória da rubrica de empréstimos, financiamentos e debêntures no passivo circulante e não circulante, mais a rubrica de operações com derivativos do passivo circulante e não circulante, bem como qualquer outra rubrica que se refira à dívida onerosa da Emissora, menos a soma de disponibilidades, aplicações financeiras (circulante e não circulante) e operações com derivativos do ativo, com base no balanço patrimonial consolidado";
export const ebitda = "lucro antes das receitas e despesas financeiras acrescidos da amortização e depreciação ao longo dos últimos 12 meses, conforme reportado nas demonstrações financeiras";
export const contractual = ["loans_and_financings", "debentures", "derivative_liabilities", "other_onerous_debt", "cash_and_equivalents", "financial_investments", "derivative_assets"] as const;
export type Instrument = Extract<CovenantReconciliationInput["instruments"][number], {source: "indenture"}>;
export const indenture = (id: string, document: string, definitions: {clause: string; netDebtPage: number; ebitdaPage: number}, tierPages: [number, number], references: string[], adjustments: Instrument["ebitdaAdjustments"] = [], tierClause = "7.24.3(VIII)"): Instrument => ({
  source: "indenture", id, indexName: "Dívida Líquida/EBITDA", netDebtDefinition: netDebt, netDebtComponents: [...contractual], ebitdaDefinition: ebitda, ebitdaAdjustments: adjustments,
  measurement: {frequency: "annual", basis: "demonstrações consolidadas auditadas do exercício encerrado em fevereiro", fiscalYearEnd: "02-28"},
  tiers: [
    {limit: "3.50", condition: {type: "until_reference_settled", referenceInstruments: references}, anchor: {document, clause: `${tierClause}(a)`, page: tierPages[0]}},
    {limit: "4.00", condition: {type: "after_reference_settled", referenceInstruments: references}, anchor: {document, clause: `${tierClause}(b)`, page: tierPages[1]}},
  ],
  definitionAnchors: {netDebt: {document, clause: definitions.clause, page: definitions.netDebtPage}, ebitda: {document, clause: definitions.clause, page: definitions.ebitdaPage}},
});
export const itr = (page: number, note?: string) => (note ? {document: "01_ITR_1T26_31mai2026.pdf", page, note} : {document: "01_ITR_1T26_31mai2026.pdf", page});
export const asOf = "2026-05-31";
export const unit = "BRL thousand" as const;
export const componentValues: NonNullable<CovenantReconciliationInput["componentValues"]> = [
  {component: "loans_and_financings", covers: ["loans_and_financings", "debentures"], value: "5670186", unit, asOf, anchor: itr(39, "15: empréstimos, financiamentos e debêntures, total consolidado")},
  {component: "derivative_liabilities", covers: ["derivative_liabilities"], value: "14335", unit, asOf, anchor: itr(51, "25")},
  {component: "derivative_assets", covers: ["derivative_assets"], value: "235", unit, asOf, anchor: itr(51, "25")},
  {component: "cash_and_equivalents", covers: ["cash_and_equivalents"], value: "1430714", unit, asOf, anchor: itr(20, "3")},
  {component: "financial_investments", covers: ["financial_investments"], value: "25095", unit, asOf, anchor: itr(11, "balanço patrimonial consolidado, aplicações financeiras circulante e não circulante")},
  // Known in the base and absent from every definition: the legal question the method must keep open.
  {component: "leases", covers: ["leases"], value: "276768", unit, asOf, anchor: itr(12, "balanço patrimonial consolidado, passivo de arrendamento circulante 67.399 e não circulante 209.369")},
];
export const adjustments11: NonNullable<Instrument["ebitdaAdjustments"]> = [
  {id: "acquired-ebitda", kind: "denominator_addition", description: "EBITDA dos últimos doze meses de sociedade adquirida nos doze meses anteriores", anchor: {document: "escritura_11a_emissao.pdf", clause: "4.22.3(j)", page: 35}},
  {id: "sellers-finance", kind: "numerator_obligation", description: "obrigações a pagar decorrentes da aquisição (sellers finance)", anchor: {document: "escritura_11a_emissao.pdf", clause: "4.22.3(j)", page: 35}},
];
export const settlement = (state: "ordinary" | "unknown" | "outstanding" | "accelerated"): NonNullable<CovenantReconciliationInput["referenceSettlements"]> => [
  {instrument: "cra-eco-8", maturityDate: "2025-04-15", settlement: state, settlementDate: state === "ordinary" || state === "accelerated" ? "2025-04-15" : null, anchor: {document: "af_11a_emissao.pdf", note: "limite 4,000 aplicado ao exercício 2025/2026, confirmação indireta"}},
  {instrument: "cra-eco-5", maturityDate: "2025-04-16", settlement: state, settlementDate: state === "ordinary" || state === "accelerated" ? "2025-04-16" : null, anchor: {document: "af_13a_emissao.pdf"}},
  {instrument: "cra-eco-257", maturityDate: "2025-12-29", settlement: state, settlementDate: state === "ordinary" || state === "accelerated" ? "2025-12-29" : null, anchor: {document: "cra_257_relatorio_mensal_4t25.pdf", note: "saldo devedor até novembro de 2025; vencimento em 29/12/2025"}},
];
export const camil = (state: "ordinary" | "unknown" | "outstanding" | "accelerated"): CovenantReconciliationInput => ({
  asOfDate: asOf,
  unit,
  unitAnchor: {document: "01_ITR_1T26_31mai2026.pdf", page: 39, note: "nota 15, valores em R$ mil"},
  instruments: [
    indenture("deb-11", "escritura_11a_emissao.pdf", {clause: "4.22.3(j)", netDebtPage: 35, ebitdaPage: 35}, [34, 34], ["cra-eco-8"], adjustments11, "4.22.3(j)"),
    indenture("deb-13", "escritura_13a_emissao.pdf", {clause: "1.1", netDebtPage: 7, ebitdaPage: 8}, [54, 55], ["cra-eco-5", "cra-eco-257"], [], "7.24.3(VIII)"),
    indenture("deb-14", "escritura_14a_emissao.pdf", {clause: "1.1", netDebtPage: 7, ebitdaPage: 8}, [54, 54], ["cra-eco-5", "cra-eco-257"], [], "7.26.3(VIII)"),
    indenture("deb-15", "escritura_15a_emissao.pdf", {clause: "1.1", netDebtPage: 7, ebitdaPage: 8}, [56, 56], ["cra-eco-257"], [], "7.26.3(VIII)"),
  ],
  referenceSettlements: settlement(state),
  componentValues,
  ltmEbitda: null,
  // The ITR enumerates loans, financings, debentures, derivatives, cash and investments; it never reproduces "qualquer outra dívida onerosa".
  reported: {value: "4.72", asOf, definition: "dívida líquida da nota 15 (empréstimos e financiamentos, debêntures, instrumentos financeiros derivativos passivos menos derivativos ativos, caixa e equivalentes e aplicações financeiras) sobre EBITDA dos últimos doze meses, pro forma", netDebtComponents: ["loans_and_financings", "debentures", "derivative_liabilities", "derivative_assets", "cash_and_equivalents", "financial_investments"], ebitdaOpening: null, anchor: itr(40, "15")},
});

/** Deterministic permutation, different at every step. */
export const permute = <T>(items: readonly T[], seed: number): T[] => {
  const copy = [...items];
  let state = seed;
  for (let index = copy.length - 1; index > 0; index -= 1) {
    state = (state * 1103515245 + 12345) % 2147483648;
    const swap = state % (index + 1);
    [copy[index], copy[swap]] = [copy[swap]!, copy[index]!];
  }
  return copy;
};
export const by = (result: ReturnType<typeof reconcileCovenantDefinitions>, id: string) => result.covenants.find((covenant) => covenant.instrument === id)!;
export const withoutLeases = (input: CovenantReconciliationInput): CovenantReconciliationInput => ({...input, componentValues: [...input.componentValues!.filter((line) => line.component !== "leases"), {component: "other_onerous_debt", covers: ["other_onerous_debt"], value: "0", unit, asOf, anchor: itr(39, "hipotético: nenhuma outra dívida onerosa enumerada")}]});
