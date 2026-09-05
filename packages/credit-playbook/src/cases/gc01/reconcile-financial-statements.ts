/**
 * Case 01 (Camil, banker preparing a meeting): the frozen inputs of `reconcile-financial-statements` as the
 * executor consumes them, curated from the review corpus of the case with an anchor on every
 * value, plus the helpers that build them. The product's integration_preview reads these
 * inputs instead of extracting them live; that is declared wherever they appear. Hypothetical
 * fixtures in this file are labelled as such in their own notes.
 */
import {referenceDataRegistryVersion} from "../../reference-data";
import {reconcileFinancialStatements, type ReconciliationInput} from "../../executors/reconcile-financial-statements";

export const itr = (page: number, note?: string) => ({document: "01_ITR_1T26_31mai2026.pdf", page, ...(note ? {note} : {})});
export const release = (page: number, table: string) => ({document: "ri_release_1t26.pdf", page, table});
export const asOf = "2026-05-31";
export const policy = (value: string) => ({value, policyKey: "policy.reconciliation.tolerance", policyVersion: referenceDataRegistryVersion});
export type Source = ReconciliationInput["pairedAccounts"] extends Array<infer A> | undefined ? (A extends {sources: Array<infer S>} ? S : never) : never;
export const source = (name: string, value: string, definition: string, definitionKey: string, components: string[], anchor: Source["anchor"], definitionAnchor: Source["anchor"] = anchor, periodMonths = 0): Source => ({source: name, value, definition, definitionKey, definitionAnchor, components, asOf, anchor, periodMonths});
/** A release figure published in R$ million with one decimal, converted to R$ thousand with its rounding band recorded. */
export const million = (statedValue: string) => ({stated: {value: statedValue, unit: "BRL million" as const, decimals: 1}});
/** Camil 1T26: the dividend divergence (four amounts), the three inventory presentations plus the balance sheet, the two net debt definitions, the roll-forwards and the interest bridge. R$ thousand. */
export const camil = (): ReconciliationInput => ({
  referenceDate: asOf,
  unit: "BRL thousand",
  tolerance: {working_capital: policy("1000"), net_debt: policy("1000"), interest: policy("2000")},
  pairedAccounts: [
    {id: "dividends", label: "Dividendos a pagar", family: "dividends", sources: [
      {...source("nota 18 nominal", "395000", "dividendos declarados: valor nominal das onze parcelas remanescentes na nota 18(e), depois da primeira parcela de 25.000 já paga", "dividends.nominal_remaining", ["dividends_declared", "nominal", "remaining_installments"], itr(46, "18e, parcelas remanescentes")), derivation: {formula: "difference", operands: [{label: "dividendos aprovados", value: "420000", anchor: {document: "02_Proposta_Administracao_AGOE_2026.pdf", page: 36, note: "proposta da administração à AGOE: dividendos declarados de 420.000"}}, {label: "primeira parcela paga", value: "25000", anchor: itr(46, "18e, parcela paga")}]}},
      {...source("balanço (valor presente)", "338565", "dividendos declarados: valor contábil consolidado, nominal menos ajuste a valor presente", "dividends.carrying_amount", ["dividends_declared", "carrying_amount"], itr(46, "18e")), derivation: {formula: "difference", operands: [{label: "nominal remanescente", value: "395000", anchor: itr(46, "18e")}, {label: "ajuste a valor presente", value: "56435", anchor: itr(46, "18e, ajuste a valor presente")}]}},
      source("nota 25 contábil", "322498", "dividendos declarados: valor contábil consolidado na tabela de instrumentos financeiros", "dividends.carrying_amount", ["dividends_declared", "carrying_amount"], itr(51, "25")),
      source("nota 25 valor justo", "420000", "dividendos declarados: valor justo na tabela de instrumentos financeiros", "dividends.fair_value", ["dividends_declared", "fair_value"], itr(51, "25")),
    ]},
    {id: "inventories", label: "Estoques", family: "working_capital", sources: [
      source("nota 5", "3088478", "estoques incluindo adiantamentos a fornecedores de 643.241", "inventories.note5", ["inventories", "advances_to_suppliers"], itr(21, "5")),
      {...source("release, capital de giro", "2445200", "estoques sem adiantamentos a fornecedores", "inventories.release_wc", ["inventories"], release(13, "Capital de giro")), ...million("2445.2")},
      {...source("release, balanço gerencial", "2437100", "estoques no balanço gerencial, sem os adiantamentos a produtores de 576.000, que ficam em linha própria", "inventories.release_management", ["inventories_management_view"], release(15, "Balanço gerencial")), ...million("2437.1")},
      source("balanço patrimonial, circulante", "3013060", "estoques no ativo circulante do balanço consolidado, incluindo os adiantamentos a produtores", "inventories.balance_sheet_current", ["inventories", "advances_to_producers"], itr(11)),
    ], explanations: [
      {fromSource: "release, capital de giro", toSource: "nota 5", adjustment: "643241", description: "adiantamentos a fornecedores incluídos na nota 5 e apresentados à parte no release", anchor: itr(21, "5")},
      {fromSource: "release, balanço gerencial", toSource: "balanço patrimonial, circulante", adjustment: "576000", description: "adiantamentos a produtores em linha própria do balanço gerencial, dentro dos estoques do balanço", anchor: release(15, "Balanço gerencial")},
      {fromSource: "nota 5", toSource: "balanço patrimonial, circulante", adjustment: "-75418", description: "parcela não circulante dos estoques e adiantamentos da nota 5 fora do ativo circulante (3.088.478 - 75.418 = 3.013.060)", anchor: itr(21, "5, abertura circulante e não circulante")},
    ]},
    {id: "net_debt_release", label: "Dívida líquida (definição do release)", family: "net_debt", sources: [
      {...source("release", "4214400", "dívida bruta menos caixa e aplicações, em R$ milhões arredondados", "net_debt.release", ["gross_debt", "cash", "investments"], release(12, "Endividamento e Caixa")), ...million("4214.4")},
      {...source("recalculado das notas", "4214377", "dívida bruta da nota 15 menos caixa e equivalentes da nota 3 menos aplicações financeiras do balanço", "net_debt.release", ["gross_debt", "cash", "investments"], itr(40, "15"), release(12, "Endividamento e Caixa")), derivation: {formula: "difference", operands: [{label: "dívida bruta", value: "5670186", anchor: itr(39, "15")}, {label: "caixa e equivalentes", value: "1430714", anchor: itr(20, "3")}, {label: "aplicações financeiras", value: "25095", anchor: itr(11)}]}},
    ]},
    {id: "net_debt_release_vs_contractual", label: "Dívida líquida do release contra a contratual", family: "net_debt", sources: [
      {...source("release", "4214400", "dívida bruta menos caixa e aplicações", "net_debt.release", ["gross_debt", "cash", "investments"], release(12, "Endividamento e Caixa")), ...million("4214.4")},
      {...source("contratual (nota 15)", "4228477", "dívida bruta (empréstimos, financiamentos, debêntures e outras dívidas onerosas; arrendamentos só se a escritura os incluir, condição jurídica aberta) mais derivativos passivos menos derivativos ativos, caixa e aplicações financeiras", "net_debt.contractual", ["gross_debt", "other_onerous_debt", "leases_if_included", "derivative_liabilities", "derivative_assets", "cash", "investments"], itr(40, "15"), {document: "escritura_13a_emissao.pdf", clause: "1.1, Dívida Líquida", page: 7}), derivation: {formula: "signed_sum", operands: [{label: "dívida bruta", value: "5670186", sign: "+", anchor: itr(39, "15")}, {label: "derivativos passivos", value: "14335", sign: "+", anchor: itr(12, "balanço patrimonial: instrumentos financeiros derivativos, passivo; também nota 25, p. 51")}, {label: "derivativos ativos", value: "235", sign: "-", anchor: itr(51, "25")}, {label: "caixa e equivalentes", value: "1430714", sign: "-", anchor: itr(20, "3")}, {label: "aplicações financeiras", value: "25095", sign: "-", anchor: itr(11)}]}},
    ]},
    {id: "leases", label: "Passivo de arrendamento", family: "leases", sources: [
      source("balanço", "276768", "passivo de arrendamento circulante 67.399 mais não circulante 209.369, consolidado", "leases.balance_sheet", ["lease_liabilities"], itr(12)),
    ]},
  ],
  balanceSheet: {assets: {value: "12021830", anchor: itr(11)}, liabilities: {value: "9032723", anchor: itr(12)}, equity: {value: "2989107", anchor: itr(12)}},
  debtBridge: {opening: {value: "4988383", anchor: itr(40, "15, saldo em 28/02/2026")}, lines: [
    {id: "captacoes", label: "Captações", published: "2046140", category: "drawdowns", anchor: itr(40, "15, captações")},
    {id: "juros_e_variacoes", label: "Juros e variações monetárias", published: "172359", category: "accruedInterest", anchor: itr(40, "15, juros e variações monetárias")},
    {id: "apropriacao_custos", label: "Apropriação de custos de transação", published: "-4741", category: "otherAdditions", anchor: itr(40, "15, apropriação de custos")},
    {id: "amortizacao_principal", label: "Amortização de principal", published: "-1285146", sign: "absolute", category: "amortizations", anchor: itr(40, "15, amortização de principal, publicada entre parênteses")},
    {id: "amortizacao_juros", label: "Amortização de juros", published: "-229611", sign: "absolute", category: "amortizations", anchor: itr(40, "15, amortização de juros, publicada entre parênteses")},
    {id: "variacao_cambial", label: "Variação cambial", published: "60", category: "foreignExchange", anchor: itr(40, "15, variação cambial")},
    {id: "ajuste_conversao", label: "Ajuste de conversão", published: "-17258", category: "foreignExchange", anchor: itr(40, "15, ajuste de conversão")},
  ], closing: {value: "5670186", anchor: itr(40, "15, saldo em 31/05/2026")}, anchor: itr(40, "15")},
  cashBridge: {opening: {value: "1997608", anchor: itr(20, "3")}, netChange: {value: "-566894", anchor: itr(16, "demonstração dos fluxos de caixa consolidada")}, closing: {value: "1430714", anchor: itr(20, "3")}},
  interestBridge: {fromDebtMovement: {value: "172359", sign: "as_published", components: ["interest", "monetary_variation"], anchor: itr(40, "15")}, fromIncomeStatement: {value: "-170548", sign: "absolute", components: ["interest"], anchor: itr(48, "22, despesa publicada entre parênteses")}},
});
export const by = (result: ReturnType<typeof reconcileFinancialStatements>, id: string) => result.reconciliations.find((entry) => entry.id === id)!;
