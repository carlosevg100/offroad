/**
 * Case 01 (Camil, banker preparing a meeting): the frozen inputs of `compare-refinancing-before-after` as the
 * executor consumes them, curated from the review corpus of the case with an anchor on every
 * value, plus the helpers that build them. The product's integration_preview reads these
 * inputs instead of extracting them live; that is declared wherever they appear. Hypothetical
 * fixtures in this file are labelled as such in their own notes.
 */
import Decimal from "decimal.js";
import {compareRefinancingBeforeAfter, type BeforeAfterInput} from "../../executors/compare-refinancing-before-after";

export const itr = (page: number, note?: string) => ({document: "01_ITR_1T26_31mai2026.pdf", page, ...(note ? {note} : {})});
export const d = (value: Decimal.Value) => new Decimal(value);
/**
 * Camil at 31/05/2026, R$ thousand: the ledger's schedule in the ITR's twelve-month windows from the
 * reference date (each window named by the safra years it spans and dated by its end), the debenture
 * transaction costs as the ledger's adjustment row, and the retirement of the DI series of the 13th
 * (14/11/2028, window 2028/29) and the 14th (14/06/2029, window 2029/30) with a new five-year SAC
 * debenture. The new debt's terms are indicative, not a quote.
 */
export const camil = (): BeforeAfterInput => ({
  referenceDate: "2026-05-31",
  unit: "BRL thousand",
  unitAnchor: {document: "01_ITR_1T26_31mai2026.pdf", page: 39, note: "nota 15, valores em R$ mil"},
  before: {
    grossDebt: {value: "5670186", anchor: itr(40, "nota 15, total de empréstimos, financiamentos e debêntures")},
    unrestrictedCash: {value: "1455809", anchor: itr(51, "caixa e equivalentes (1.430.714) mais aplicações financeiras (25.095), quadro de dívida líquida")},
    derivativeLiabilities: {value: "14335", anchor: itr(51, "instrumentos financeiros derivativos, passivo, quadro de dívida líquida")},
    derivativeAssets: {value: "235", anchor: itr(51, "instrumentos financeiros derivativos, ativo, quadro de dívida líquida")},
    ltmEbitda: {value: "895864", periodStart: "2025-05-31", periodEnd: "2026-05-31", definitionKey: "ebitda.contractual.13a", basis: "implied_from_reported_index", anchor: itr(40, "nota 15: 4.228.477 / 4,72, derivado, não aberto pela companhia")},
    schedule: [
      {period: "2026/27", amount: "1229828", endsAt: "2027-05-31", anchor: itr(40, "nota 15, cronograma")}, {period: "2027/28", amount: "776868", endsAt: "2028-05-31", anchor: itr(40, "nota 15, cronograma")},
      {period: "2028/29", amount: "1228475", endsAt: "2029-05-31", anchor: itr(40, "nota 15, cronograma")}, {period: "2029/30", amount: "694497", endsAt: "2030-05-31", anchor: itr(40, "nota 15, cronograma")},
      {period: "2030/31", amount: "994544", endsAt: "2031-05-31", anchor: itr(40, "nota 15, cronograma")}, {period: "after 2031", amount: "809198", endsAt: null, anchor: itr(40, "nota 15, cronograma")},
      {period: "debenture costs", amount: "-63224", endsAt: null, kind: "adjustment", anchor: itr(40, "nota 15, custos de debêntures")},
    ],
    costOfExistingDebt: {weightedAverageRate: "0.1246", basis: "juros do serviço base do caso 02 sobre a dívida bruta (706.751 / 5.670.186), custo contábil, não all-in", anchor: itr(40, "nota 15")},
    cfadsByPeriod: null,
  },
  // The four indentures carry the same two-tier covenant; the 11th adds its own definition. Every one of them is listed, none resolved.
  covenants: [
    {instrument: "11ª emissão", limit: "4.00", direction: "maximum", measurement: {frequency: "annual", nextDate: "2027-02-28"}, tiers: [{limit: "3.50", applicability: "conditional", condition: "até o vencimento ou a liquidação dos CRA de referência, sem fato na base"}, {limit: "4.00", applicability: "conditional", condition: "no exercício encerrado depois da quitação integral dos CRA de referência, condicionado à prova"}], state: "insufficient_evidence", comparability: "conditional", anchor: {document: "escritura_11a_emissao.pdf", clause: "4.22.3(j)", page: 35}},
    {instrument: "13ª emissão", limit: "4.00", direction: "maximum", measurement: {frequency: "annual", nextDate: "2027-02-28"}, tiers: [{limit: "3.50", applicability: "conditional", condition: "até o vencimento ou a liquidação dos CRA de referência, sem fato na base"}, {limit: "4.00", applicability: "conditional", condition: "4,00x condicionado à prova da quitação ordinária dos CRA de referência"}], state: "insufficient_evidence", comparability: "conditional", anchor: {document: "escritura_13a_emissao.pdf", clause: "7.24.3(VIII)", page: 54}},
    {instrument: "14ª emissão", limit: "4.00", direction: "maximum", measurement: {frequency: "annual", nextDate: "2027-02-28"}, tiers: [{limit: "3.50", applicability: "conditional", condition: "até o vencimento ou a liquidação dos CRA de referência"}, {limit: "4.00", applicability: "conditional", condition: "condicionado à prova da quitação"}], state: "insufficient_evidence", comparability: "conditional", anchor: {document: "escritura_14a_emissao.pdf", clause: "7.26.3(VIII)", page: 54}},
    {instrument: "15ª emissão", limit: "4.00", direction: "maximum", measurement: {frequency: "annual", nextDate: "2027-02-28"}, tiers: [{limit: "3.50", applicability: "conditional", condition: "até o vencimento ou a liquidação dos CRA de referência"}, {limit: "4.00", applicability: "conditional", condition: "condicionado à prova da quitação"}], state: "insufficient_evidence", comparability: "conditional", anchor: {document: "escritura_15a_emissao.pdf", clause: "7.26.3(VIII)", page: 56}},
  ],
  alternatives: [
    // The principal retired is the contractual nominal of each series (304.160 and 411.643 debentures of R$ 1.000), never the ITR's carrying amount; the new debt's terms are indicative and declared as such.
    {id: "extend-di", label: "Alongar as séries DI da 13ª e da 14ª com nova debênture de cinco anos", newDebt: {amount: "745000", annualRate: "0.145", termMonths: 60, graceMonths: 24, format: "sac", upfrontFeeRate: "0.01", disbursementDate: "2026-09-04", origin: "termos indicativos, curva de 04/09/2026; não há proposta nem term sheet no corpus", termsSource: "indicative_unverified", anchor: {document: "anbima_ettj_2026-09-04.csv"}}, retired: [
      {seriesId: "deb-13-1", instalments: [{period: "2028/29", principal: {value: "304160", basis: "contractual_nominal", anchor: {document: "escritura_13a_emissao.pdf", clause: "4.1", note: "304.160 debêntures de R$ 1.000"}}, maturityAnchor: {document: "escritura_13a_emissao.pdf", clause: "7.7.1", note: "vencimento 14/11/2028"}}], exitPremium: {value: "2448", mechanism: "total_redemption_di", permittedOnDate: true, anchor: {document: "exit-costs-gc01.json", note: "route total_redemption_di, 0,40% a.a. pro rata"}}},
      {seriesId: "deb-14-1", instalments: [{period: "2029/30", principal: {value: "411643", basis: "contractual_nominal", anchor: {document: "escritura_14a_emissao.pdf", clause: "4.1", note: "411.643 debêntures de R$ 1.000"}}, maturityAnchor: {document: "escritura_14a_emissao.pdf", clause: "7.7.1", note: "vencimento 14/06/2029"}}], exitPremium: {value: "5266", mechanism: "total_redemption_di", permittedOnDate: true, anchor: {document: "exit-costs-gc01.json", note: "route total_redemption_di"}}},
    ], feesPaidFromCash: {value: "1500", anchor: {document: "03_Pedido_Simulado_CRA_2026.docx", page: 1, note: "custos de estruturação sintéticos"}}},
    {id: "status-quo", label: "Manter a estrutura", newDebt: null, retired: []},
    // The 13th's second series amortizes in two instalments, 14/11/2029 (clause 7.8.2) and at maturity 14/11/2030 (clause 7.7.2): each leaves its own window; the nominal split is the indenture's, not half of a carrying amount.
    {id: "retire-ipca", label: "Retirar as séries IPCA antes da carência", newDebt: null, retired: [{seriesId: "deb-13-2", instalments: [{period: "2029/30", principal: {value: "125000", basis: "contractual_nominal", anchor: {document: "escritura_13a_emissao.pdf", clause: "7.8.2", note: "50% do valor nominal atualizado em 14/11/2029 (nominal hipotético de 250.000 para o teste)"}}, maturityAnchor: {document: "escritura_13a_emissao.pdf", clause: "7.8.2", note: "primeira parcela em 14/11/2029"}}, {period: "2030/31", principal: {value: "125000", basis: "contractual_nominal", anchor: {document: "escritura_13a_emissao.pdf", clause: "7.7.2", note: "saldo no vencimento"}}, maturityAnchor: {document: "escritura_13a_emissao.pdf", clause: "7.7.2", note: "vencimento em 14/11/2030"}}], exitPremium: null}], uncoveredTerms: ["ipca_exit_quote"]},
  ],
  ranking: {discriminator: "peak_concentration", rationale: "a tese é suavizar o degrau de 2028/29; custo e headroom entram como restrição, não como discriminador"},
  wallThreshold: {share: "0.20", policyKey: "policy.structure.maturity_wall", policyVersion: "2026.09.05-v8"},
});
/** Deep clone with every object's keys in reverse order: the same input, another key order. */
export const reversedKeys = <T,>(value: T): T => (Array.isArray(value) ? value.map(reversedKeys) as T : value && typeof value === "object" ? Object.fromEntries(Object.entries(value as Record<string, unknown>).reverse().map(([key, inner]) => [key, reversedKeys(inner)])) as T : value);
export const find = (result: ReturnType<typeof compareRefinancingBeforeAfter>, id: string) => result.alternatives.find((alternative) => alternative.id === id)!;
