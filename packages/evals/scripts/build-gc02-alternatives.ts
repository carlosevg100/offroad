/**
 * Case 02, finding 3: which alternative reduces the amortization peak without raising the all-in
 * cost beyond the recorded tolerance. Computed by the Case 01 executors on the frozen public base
 * (ledger of 31/05/2026 in the ITR's twelve-month windows, each dated by its end) with the market
 * assumptions of the pack. Prints the Markdown tables of the answer key, including every state the
 * executors refuse to price: the base holds the 31/05 balances, not the nominal at the exit date,
 * so the exit cost stays insufficient evidence until the indenture-derived nominal enters the base.
 *
 *   pnpm --filter @offroad/evals gc02:alternatives
 */
import {executors} from "@offroad/credit-playbook";
import {marketAssumptions} from "@offroad/testing-fixtures";
import Decimal from "decimal.js";

const d = (value: Decimal.Value) => new Decimal(value);
const fmt = (value: Decimal.Value | null | undefined) => value === null || value === undefined ? "n/a" : d(value).toDecimalPlaces(0).toNumber().toLocaleString("pt-BR");
const pct = (value: Decimal.Value | null | undefined) => value === null || value === undefined ? "n/a" : `${d(value).times(100).toFixed(2)}%`;
const ledgerDate = "2026-05-31";
const exitDate = "2026-09-04";
const weekdays = (from: string, to: string) => executors.weekdaysBetween(from, to);
const calendarNote = (maturity: string) => ({document: "calendario_dias_uteis_pendente.md", note: `weekday count from ${exitDate} to ${maturity}; the ANBIMA calendar file is not yet in the corpus, so the count is an upper bound declared as such`});
const exitDocuments = [
  {name: "escritura_11a_emissao.pdf", kind: "indenture" as const}, {name: "escritura_13a_emissao.pdf", kind: "indenture" as const}, {name: "escritura_14a_emissao.pdf", kind: "indenture" as const}, {name: "escritura_15a_emissao.pdf", kind: "indenture" as const},
  {name: "01_ITR_1T26_31mai2026.pdf", kind: "itr" as const}, {name: "calendario_dias_uteis_pendente.md", kind: "calendar" as const},
];
const itr = (page: number, note: string) => ({document: "01_ITR_1T26_31mai2026.pdf", page, note});

// Exit cost of the DI series maturing in the walls, by the indenture mechanisms. The base does not hold the nominal at the exit date.
const exit = executors.estimateExitCostBySeries({
  exitDate,
  unit: "BRL thousand",
  documents: exitDocuments,
  series: [
    {id: "deb-11-1", label: "11ª emissão, 1ª série", indenture: {document: "escritura_11a_emissao.pdf", clause: "4.1"}, nominalAtExit: null, accruedAtExit: null, chargesAtExit: null, remainingFlows: null, mechanisms: [{mechanism: "negotiated_offer", availableFrom: "2021-11-15", premium: null, requiresFullAdherence: true, anchor: {document: "escritura_11a_emissao.pdf", clause: "4.14"}}], anchor: {document: "escritura_11a_emissao.pdf", clause: "4.1"}},
    {id: "deb-11-2", label: "11ª emissão, 2ª série", indenture: {document: "escritura_11a_emissao.pdf", clause: "4.1"}, nominalAtExit: null, accruedAtExit: null, chargesAtExit: null, remainingFlows: null, mechanisms: [{mechanism: "negotiated_offer", availableFrom: "2021-11-15", premium: null, requiresFullAdherence: true, anchor: {document: "escritura_11a_emissao.pdf", clause: "4.14"}}], anchor: {document: "escritura_11a_emissao.pdf", clause: "4.1"}},
    {id: "deb-13-1", label: "13ª emissão, 1ª série", indenture: {document: "escritura_13a_emissao.pdf", clause: "4.1"}, nominalAtExit: null, accruedAtExit: null, chargesAtExit: null, remainingFlows: null, mechanisms: [{mechanism: "extraordinary_amortization_di", premiumPerYear: "0.004", availableFrom: "2026-05-14", maxFraction: "0.98", fraction: "0.98", businessDays: {count: weekdays(exitDate, "2028-11-14"), maturity: "2028-11-14", anchor: calendarNote("2028-11-14")}, anchor: {document: "escritura_13a_emissao.pdf", clause: "7.18"}}], anchor: {document: "escritura_13a_emissao.pdf", clause: "4.1"}},
    {id: "deb-14-1", label: "14ª emissão, 1ª série", indenture: {document: "escritura_14a_emissao.pdf", clause: "4.1"}, nominalAtExit: null, accruedAtExit: null, chargesAtExit: null, remainingFlows: null, mechanisms: [{mechanism: "extraordinary_amortization_di", premiumPerYear: "0.004", availableFrom: "2026-06-15", maxFraction: "0.98", fraction: "0.98", businessDays: {count: weekdays(exitDate, "2029-06-14"), maturity: "2029-06-14", anchor: calendarNote("2029-06-14")}, anchor: {document: "escritura_14a_emissao.pdf", clause: "7.20"}}], anchor: {document: "escritura_14a_emissao.pdf", clause: "4.1"}},
  ],
});
const premium = (id: string) => {
  const entry = exit.exit_costs.find((cost) => cost.series_id === id)!;
  return entry.cheapest_full_exit ? {value: d(entry.cheapest_full_exit.total_payable).minus(entry.base.payable ?? 0).toFixed(), anchor: {document: "exit-costs-gc02.json", note: `route ${entry.cheapest_full_exit.mechanism}`}} : null;
};
const cdiPlus125 = d(marketAssumptions.cdiAnnualPercent).plus(1.25).div(100).toFixed(4);
const newDebt = (amount: string) => ({amount, annualRate: cdiPlus125, termMonths: 84, graceMonths: 24, format: "sac" as const, upfrontFeeRate: "0.005", disbursementDate: exitDate, origin: "custo de referência do pedido simulado do pack (CDI + 1,25%) e taxa de estruturação sintética de 0,50%", anchor: {document: "03_Pedido_Simulado_CRA_2026.docx", page: 1}});

const result = executors.compareRefinancingBeforeAfter({
  referenceDate: ledgerDate,
  unit: "BRL thousand",
  before: {
    grossDebt: {value: "5670186", anchor: itr(40, "nota 15, total")},
    unrestrictedCash: {value: "1455809", anchor: itr(8, "caixa e equivalentes")},
    derivativeLiabilities: {value: "14335", anchor: itr(9, "derivativos, passivo")},
    derivativeAssets: {value: "235", anchor: itr(8, "derivativos, ativo")},
    ltmEbitda: {value: "895864", definitionKey: "ebitda.contractual.13a", basis: "implied_from_reported_index", anchor: {document: "release_1T26.pdf", page: 3, note: "4,72x sobre a dívida líquida contratual de 4.228.477 (derivado, não aberto)"}},
    schedule: [
      {period: "2026/27", amount: "1229828", endsAt: "2027-05-31"}, {period: "2027/28", amount: "776868", endsAt: "2028-05-31"},
      {period: "2028/29", amount: "1228475", endsAt: "2029-05-31"}, {period: "2029/30", amount: "694497", endsAt: "2030-05-31"},
      {period: "2030/31", amount: "994544", endsAt: "2031-05-31"}, {period: "after 2031", amount: "809198", endsAt: null},
      {period: "debenture costs", amount: "-63224", endsAt: null, kind: "adjustment"},
    ],
    costOfExistingDebt: {weightedAverageRate: "0.1246", basis: "juros do serviço base do caso 02 sobre a dívida bruta (706.751 / 5.670.186); custo contábil, não all-in", anchor: itr(40, "nota 15")},
    cfadsByPeriod: null,
  },
  covenant: {limit: "4.00", direction: "maximum", state: "insufficient_evidence", comparability: "conditional", anchor: {document: "escritura_13a_emissao.pdf", clause: "7.24.3(VIII)", page: 54}},
  alternatives: [
    {id: "status-quo", label: "Manter a estrutura e rolar as linhas bancárias", newDebt: null, retired: []},
    {id: "extend-di-2028", label: "Alongar o pico de 2028/29: nova dívida de sete anos (CDI + 1,25%, dois de carência, SAC) retirando a 13ª 1ª série pelo prêmio da escritura", newDebt: newDebt("306038"), retired: [{seriesId: "deb-13-1", principal: "306038", exitPremium: premium("deb-13-1"), maturityPeriod: "2028/29", anchor: {document: "escritura_13a_emissao.pdf", clause: "4.1", note: "vencimento 14/11/2028"}}]},
    {id: "extend-di-2028-and-2029", label: "Alongar os dois picos: nova dívida de sete anos retirando a 13ª 1ª série e a 14ª 1ª série pelo prêmio da escritura", newDebt: newDebt("744956"), retired: [
      {seriesId: "deb-13-1", principal: "306038", exitPremium: premium("deb-13-1"), maturityPeriod: "2028/29", anchor: {document: "escritura_13a_emissao.pdf", clause: "4.1", note: "vencimento 14/11/2028"}},
      {seriesId: "deb-14-1", principal: "438918", exitPremium: premium("deb-14-1"), maturityPeriod: "2029/30", anchor: {document: "escritura_14a_emissao.pdf", clause: "4.1", note: "vencimento 14/06/2029"}},
    ]},
    {id: "offer-11th", label: "Retirar a 11ª emissão por oferta de resgate (prêmio a negociar)", newDebt: null, retired: [
      {seriesId: "deb-11-1", principal: "151795", exitPremium: premium("deb-11-1"), maturityPeriod: "2028/29", anchor: {document: "escritura_11a_emissao.pdf", clause: "4.1"}},
      {seriesId: "deb-11-2", principal: "505984", exitPremium: premium("deb-11-2"), maturityPeriod: "2028/29", anchor: {document: "escritura_11a_emissao.pdf", clause: "4.1"}},
    ]},
    {id: "cash-paydown", label: "Abater 300.000 das linhas bancárias de 2026/27 com caixa, ao par", newDebt: null, retired: [{seriesId: "loan-brl", principal: "300000", exitPremium: {value: "0", anchor: itr(40, "nota 15, linhas bancárias pré-pagáveis ao par")}, maturityPeriod: "2026/27", anchor: itr(40, "nota 15")}]},
  ],
  ranking: {discriminator: "peak_amount", rationale: "o conselho pediu se a estrutura aguenta os próximos anos; o pico de amortização em valor é o que a rolagem integral precisa vencer, e o custo all-in é a segunda leitura"},
  wallThreshold: {share: "0.20", policyKey: "policy.structure.maturity_wall", policyVersion: "2026.09.05-v8"},
});

const md: string[] = [];
md.push(`### Custo de saída das séries DI e da 11ª (executor \`estimate-exit-cost-by-series\` v4, em ${exitDate})`, "", "| Série | Base | Estado da base | Rotas | Mais barata unilateral |", "| --- | ---: | --- | --- | ---: |");
for (const entry of exit.exit_costs) md.push(`| ${entry.label} | ${fmt(entry.base.payable)} | ${entry.base.state}${entry.base.reason ? `: ${entry.base.reason}` : ""} | ${entry.routes.map((route) => `${route.mechanism} (${route.state})`).join("; ")} | ${entry.cheapest_full_exit ? `${entry.cheapest_full_exit.mechanism} ${fmt(entry.cheapest_full_exit.total_payable)}` : "n/a"} |`);
if (exit.uncovered_terms.length > 0) md.push("", `Termos não cobertos: ${exit.uncovered_terms.map((term) => `${term.id} (${term.reason})`).join("; ")}.`);
md.push("", "### Antes e depois por alternativa (executor `compare-refinancing-before-after` v3)", "", `Antes: dívida bruta ${fmt(result.before.gross_debt)}, caixa ${fmt(result.before.unrestricted_cash)}, dívida líquida contratual ${fmt(result.before.contractual_net_debt)}, alavancagem ${result.before.leverage ? `${d(result.before.leverage.value).toFixed(2)}x (${result.before.leverage.ebitda_basis})` : "n/a"}, pico ${result.before.peak?.period} com ${fmt(result.before.peak?.amount)} (${pct(result.before.peak?.share_of_gross)} da dívida bruta). Estado ${result.state}. Não medido: ${result.unsupported.join("; ")}.`, "");
md.push("| Alternativa | Estado | Custo de saída | Dívida bruta depois | Caixa depois | Dívida líquida contratual | Alavancagem | Pico depois | Participação do pico | Custo all-in da nova dívida |", "| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: |");
for (const alternative of result.alternatives) {
  if (alternative.state === "blocked" || !alternative.after) { md.push(`| ${alternative.label} | blocked: ${alternative.block_reasons.join("; ")} | | | | | | | | |`); continue; }
  const after = alternative.after;
  md.push(`| ${alternative.label} | ${alternative.state} | ${fmt(alternative.exit_cost?.value)} | ${fmt(after.gross_debt)} | ${fmt(after.unrestricted_cash)} | ${fmt(after.contractual_net_debt)} | ${after.leverage ? `${d(after.leverage.value).toFixed(2)}x` : "n/a"} | ${after.peak?.period ?? "n/a"}: ${fmt(after.peak?.amount)} | ${pct(after.peak?.share_of_gross)} | ${alternative.new_debt_service ? pct(alternative.new_debt_service.all_in_cost) : "n/a"} |`);
}
const columns = ["2026/27", "2027/28", "2028/29", "2029/30", "2030/31", "after 2031"];
md.push("", "### Concentração por janela de doze meses do ITR, depois de cada alternativa", "", `| Alternativa | ${columns.join(" | ")} |`, `| --- | ${columns.map(() => "---:").join(" | ")} |`);
for (const alternative of result.alternatives) {
  if (!alternative.concentration) continue;
  const byPeriod = new Map(alternative.concentration.map((row) => [row.period, row.consolidated]));
  md.push(`| ${alternative.id} | ${columns.map((period) => fmt(byPeriod.get(period) ?? "0")).join(" | ")} |`);
}
if (result.ranking) {
  md.push("", `### Ordenação pelo discriminador declarado (${result.ranking.discriminator})`, "", `Racional: ${result.ranking.rationale}.`, "", "| Posição | Alternativa | Valor | Motivo |", "| --- | --- | ---: | --- |");
  result.ranking.order.forEach((entry, index) => md.push(`| ${index + 1} | ${entry.id} | ${fmt(d(entry.value).negated())} | ${entry.reason} |`));
}
md.push("", `Fingerprints: exit ${exit.trace.outputFingerprint.slice(0, 16)}; before/after ${result.trace.outputFingerprint.slice(0, 16)}.`);
console.log(md.join("\n"));
