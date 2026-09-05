/**
 * Case 01 (Camil, banker preparing a meeting): the frozen inputs of `declare-scenarios` as the
 * executor consumes them, curated from the review corpus of the case with an anchor on every
 * value, plus the helpers that build them. The product's integration_preview reads these
 * inputs instead of extracting them live; that is declared wherever they appear. Hypothetical
 * fixtures in this file are labelled as such in their own notes.
 */
import Decimal from "decimal.js";
import {declareScenarios, type ScenarioInput} from "../../executors/declare-scenarios";

export const d = (value: Decimal.Value) => new Decimal(value);
export const itr = (page: number, note?: string) => ({document: "01_ITR_1T26_31mai2026.pdf", page, ...(note ? {note} : {})});
export const user = (note?: string) => ({document: "declaracao_do_usuario.md", ...(note ? {note} : {})});
export const asOf = "2026-05-31";
/**
 * The frozen gold corpus (docs/product/gold-cases/runs/gc01/ai-review-corpus/manifest.json): real names and SHA-256.
 * The corpus holds no user declaration, no versioned benchmark file and no management data, so the gold run cannot
 * source CFADS, shocks or a rollover: it is blocked, honestly. The mechanics are exercised on a synthetic manifest
 * labelled as such below.
 */
export const goldManifest: ScenarioInput["manifest"] = [
  {name: "01_ITR_1T26_31mai2026.txt", sha256: "05c8f9e9f8243b907036953e297873fc20870d3478086ad783393b79b0393c79"},
  {name: "escritura_13a_emissao.txt", sha256: "063f59f6892d919df3355b9ed6050f35d76c3261c5c6ec5f6e73327fdb474e23"},
  {name: "escritura_11a_emissao.txt", sha256: "478fb2cd6d7f07965b5365cfbf3ae83f1b332a25ca9e536be0507d74431e8c96"},
  {name: "ca_notas_comerciais_2026-05-27.txt", sha256: "1bd55c5140c81cf51a79daece6f7027aa6b3911c7995da42b65729df71879ebe"},
  {name: "anbima_ettj_2026-09-04.csv", sha256: "531e97d7ead363068fc801156d29043024390ee9bc5bc105fb85917c607c9129"},
];
export const goldDocuments: ScenarioInput["documents"] = [
  {name: "01_ITR_1T26_31mai2026.txt", kind: "itr", sha256: "05c8f9e9f8243b907036953e297873fc20870d3478086ad783393b79b0393c79"},
  {name: "escritura_13a_emissao.txt", kind: "indenture", sha256: "063f59f6892d919df3355b9ed6050f35d76c3261c5c6ec5f6e73327fdb474e23"},
  {name: "ca_notas_comerciais_2026-05-27.txt", kind: "announcement", sha256: "1bd55c5140c81cf51a79daece6f7027aa6b3911c7995da42b65729df71879ebe"},
];
export const sha = (seed: string) => seed.padEnd(64, "0");
/** Synthetic manifest for the mechanics tests, not the gold corpus: every name below is hypothetical and declared so. */
export const manifest: ScenarioInput["manifest"] = [
  {name: "01_ITR_1T26_31mai2026.pdf", sha256: sha("a1")}, {name: "declaracao_do_usuario.md", sha256: sha("b2")}, {name: "reference-data.ts", sha256: sha("c3")}, {name: "gc02-gabarito-rascunho.md", sha256: sha("d4")},
  {name: "escritura_13a_emissao.pdf", sha256: sha("e5")}, {name: "ca_notas_comerciais_2026-05-27.pdf", sha256: sha("f6")}, {name: "contrato_hipotetico.pdf", sha256: sha("a7")}, {name: "extrato_hipotetico.pdf", sha256: sha("b8")}, {name: "orcamento_gerencial_hipotetico.xlsx", sha256: sha("c9")},
];
export const documents: ScenarioInput["documents"] = [
  {name: "01_ITR_1T26_31mai2026.pdf", kind: "itr", sha256: sha("a1")}, {name: "declaracao_do_usuario.md", kind: "user", sha256: sha("b2")}, {name: "reference-data.ts", kind: "benchmark", sha256: sha("c3")},
  {name: "gc02-gabarito-rascunho.md", kind: "other", sha256: sha("d4")}, {name: "escritura_13a_emissao.pdf", kind: "indenture", sha256: sha("e5")}, {name: "ca_notas_comerciais_2026-05-27.pdf", kind: "announcement", sha256: sha("f6")},
  {name: "contrato_hipotetico.pdf", kind: "contract", sha256: sha("a7")}, {name: "extrato_hipotetico.pdf", kind: "disbursement_proof", sha256: sha("b8")}, {name: "orcamento_gerencial_hipotetico.xlsx", kind: "management", sha256: sha("c9")},
];
export const itrTxt = (page: number, note?: string) => ({document: "01_ITR_1T26_31mai2026.txt", page, ...(note ? {note} : {})});
/** Camil on the frozen corpus: the base holds the position, the periods and the covenant, and no assumption can be sourced; the minimum set is blocked. */
export const gold = (): ScenarioInput => ({
  referenceDate: asOf,
  unit: "BRL thousand",
  unitAnchor: {document: "01_ITR_1T26_31mai2026.txt", page: 39, note: "nota 15, valores em R$ mil"},
  manifest: goldManifest,
  documents: goldDocuments,
  assumptions: [
    {key: "rollover.announced", role: "rollover", period: null, value: "1", unit: "ratio", origin: "public_announcement", rationale: "a ata de 27/05/2026 aprova novas captações; não é uma política de rolagem, entra só para que o registro não fique vazio e é a única premissa que o corpus permite citar", asOf, anchor: {document: "ca_notas_comerciais_2026-05-27.txt", page: 2}, confidence: "low"},
  ],
  position: {
    perimeter: "consolidated",
    components: {grossDebt: {value: "5670186", anchor: itrTxt(39, "15")}, derivativeLiabilities: {value: "14335", anchor: itrTxt(51, "25")}, derivativeAssets: {value: "235", anchor: itrTxt(51, "25")}, cashAndEquivalents: {value: "1430714", anchor: itrTxt(20, "3")}, financialInvestments: {value: "25095", anchor: itrTxt(11)}},
    ltmEbitda: {value: "895864", periodStart: "2025-05-31", periodEnd: "2026-05-31", definitionKey: "ebitda.covenant_ltm", basis: "implied_from_reported_index", comparabilityByInstrument: [{instrument: "13ª emissão", comparability: "conditional", reasons: ["a companhia não abre o EBITDA; o valor é implícito de 4,72x sobre 4.228.477 (cerca de 895.900)"]}], anchor: itrTxt(40, "15: 4.228.477 / 4,72, derivado, aproximado")},
    averageDebtBalance: {value: "5329284.5", basis: "média simples dos saldos de 28/02/2026 e 31/05/2026", anchor: itrTxt(39, "15")},
    baseAnnualRate: {value: "0.1246", basis: "juros e variações da nota 15 sobre o saldo médio, trimestre anualizado (aproximação)", anchor: itrTxt(40, "15")},
  },
  covenant: {instrument: "13ª emissão", limit: "4.00", direction: "maximum", tier: {applicability: "conditional", condition: "4,00x aplicável no exercício encerrado depois da quitação integral dos CRA de referência, condicionado à prova; 3,50x até o vencimento ou a liquidação deles"}, state: "insufficient_evidence", comparability: "conditional", measurement: {frequency: "annual", nextDate: "2027-02-28"}, anchor: {document: "escritura_13a_emissao.txt", clause: "7.24.3(VIII)", page: 55}},
  periods: [
    {period: "2026/27", endsAt: "2027-05-31", principal: {value: "1229828", anchor: itrTxt(40, "15, cronograma")}, interest: null},
    {period: "2027/28", endsAt: "2028-05-31", principal: {value: "776868", anchor: itrTxt(40, "15, cronograma")}, interest: null},
  ],
  scenarios: [
    {id: "base", label: "Base", rolloverAllowed: true},
    {id: "adverse", label: "Adverso", rolloverAllowed: true, usesRateShock: true, usesEbitdaHaircut: true},
    {id: "no_rollover", label: "Sem rolagem", rolloverAllowed: false},
  ],
});
/**
 * Hypothetical fixture on the synthetic manifest (not the gold corpus): the position of Camil with declared
 * ranges for CFADS, shock, haircuts and rollover, so the mechanics of the executor are exercised; every
 * declared document is hypothetical and labelled so.
 */
export const camil = (): ScenarioInput => ({
  referenceDate: asOf,
  unit: "BRL thousand",
  unitAnchor: {document: "01_ITR_1T26_31mai2026.pdf", page: 39, note: "nota 15, valores em R$ mil"},
  manifest,
  documents,
  assumptions: [
    {key: "cfads.2026-27.range", role: "cfads", period: "2026/27", value: "200000", unit: "BRL thousand", origin: "user_range", rationale: "intervalo declarado para testar capacidade; a base pública não traz geração de caixa para o serviço da dívida", asOf, anchor: user("intervalo, não estimativa da companhia"), confidence: "low"},
    {key: "cfads.2027-28.range", role: "cfads", period: "2027/28", value: "200000", unit: "BRL thousand", origin: "user_range", rationale: "mesmo intervalo, declarado para a segunda janela", asOf, anchor: user(), confidence: "low"},
    {key: "shock.rate.parallel", role: "rate_shock", period: null, value: "0.02", unit: "ratio", origin: "versioned_benchmark", rationale: "choque paralelo de 200 pontos-base do parâmetro scenario.interest_rate.parallel_shock (draft)", asOf: "2026-09-05", anchor: {document: "reference-data.ts", note: "scenario.interest_rate.parallel_shock"}, confidence: "medium"},
    {key: "haircut.ebitda.adverse", role: "ebitda_haircut", period: null, value: "0.15", unit: "ratio", origin: "user_range", rationale: "queda de 15% no EBITDA, intervalo declarado", asOf, anchor: user(), confidence: "low"},
    {key: "haircut.cfads.adverse", role: "cfads_haircut", period: null, value: "0.10", unit: "ratio", origin: "user_range", rationale: "queda de 10% na geração de caixa, declarada à parte do EBITDA", asOf, anchor: user(), confidence: "low"},
    {key: "rollover.bank_lines", role: "rollover", period: null, value: "1", unit: "ratio", origin: "user_range", rationale: "rolagem integral das linhas bancárias como intervalo declarado para o teste de capacidade; o histórico (captações de 2.046.140 e liquidações de 1.285.146 no trimestre) mostra rolagens passadas, não uma política", asOf, anchor: user("premissa declarada de rolagem"), confidence: "low"},
  ],
  position: {
    perimeter: "consolidated",
    components: {grossDebt: {value: "5670186", anchor: itr(39, "15")}, derivativeLiabilities: {value: "14335", anchor: itr(51, "25")}, derivativeAssets: {value: "235", anchor: itr(51, "25")}, cashAndEquivalents: {value: "1430714", anchor: itr(20, "3")}, financialInvestments: {value: "25095", anchor: itr(11)}},
    ltmEbitda: {value: "895864", periodStart: "2025-05-31", periodEnd: "2026-05-31", definitionKey: "ebitda.covenant_ltm", basis: "implied_from_reported_index", comparabilityByInstrument: [{instrument: "13ª emissão", comparability: "conditional", reasons: ["a companhia não abre o EBITDA; o valor é implícito de 4,72x sobre 4.228.477 (cerca de 895.900)"]}, {instrument: "11ª emissão", comparability: "conditional", reasons: ["a 11ª carrega ajuste pro forma de aquisições e a obrigação de sellers finance que o índice reportado não mostra"]}], anchor: itr(40, "15: 4.228.477 / 4,72, derivado, aproximado")},
    averageDebtBalance: {value: "5329284.5", basis: "média simples dos saldos de 28/02/2026 e 31/05/2026", anchor: itr(39, "15")},
    baseAnnualRate: {value: "0.1246", basis: "serviço base do caso 02 sobre a dívida bruta", anchor: {document: "gc02-gabarito-rascunho.md", note: "seção 3"}},
  },
  covenant: {instrument: "13ª emissão", limit: "4.00", direction: "maximum", tier: {applicability: "conditional", condition: "4,00x aplicável no exercício encerrado depois da quitação integral dos CRA de referência, condicionado à prova da quitação; 3,50x até o vencimento ou a liquidação deles, também sem prova na base"}, state: "insufficient_evidence", comparability: "conditional", measurement: {frequency: "annual", nextDate: "2027-02-28"}, anchor: {document: "escritura_13a_emissao.pdf", clause: "7.24.3(VIII)", page: 55, note: "páginas 54-55"}},
  periods: [
    {period: "2026/27", endsAt: "2027-05-31", principal: {value: "1229828", anchor: itr(40, "15, cronograma")}, interest: null},
    {period: "2027/28", endsAt: "2028-05-31", principal: {value: "776868", anchor: itr(40, "15, cronograma")}, interest: null},
  ],
  scenarios: [
    {id: "base", label: "Base", rolloverAllowed: true},
    {id: "adverse", label: "Adverso", rolloverAllowed: true, usesRateShock: true, usesEbitdaHaircut: true, usesCfadsHaircut: true},
    {id: "no_rollover", label: "Sem rolagem", rolloverAllowed: false},
  ],
});
export const by = (result: ReturnType<typeof declareScenarios>, id: string) => result.scenarios.find((scenario) => scenario.id === id)!;
