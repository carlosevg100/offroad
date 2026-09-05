/**
 * Case 02, finding 3: which alternative reduces the amortization peak without raising the all-in
 * cost beyond the recorded tolerance. Computed by the Case 01 executors on the frozen public base
 * (ledger of 31/05/2026, ITR buckets by safra year keyed by the calendar year they end in) with the
 * market assumptions of the pack. Prints the Markdown tables of the answer key.
 *
 *   pnpm --filter @offroad/evals gc02:alternatives
 */
import {executors} from "@offroad/credit-playbook";
import {marketAssumptions} from "@offroad/testing-fixtures";
import Decimal from "decimal.js";

const d = (value: Decimal.Value) => new Decimal(value);
const fmt = (value: Decimal.Value | null | undefined) => value === null || value === undefined ? "n/a" : d(value).toDecimalPlaces(0).toNumber().toLocaleString("pt-BR");
const pct = (value: Decimal.Value | null | undefined) => value === null || value === undefined ? "n/a" : `${d(value).times(100).toFixed(2)}%`;
const referenceDate = "2026-09-04";
const businessDays = (isoDate: string) => Math.round((Date.UTC(Number(isoDate.slice(0, 4)), Number(isoDate.slice(5, 7)) - 1, Number(isoDate.slice(8, 10))) - Date.UTC(2026, 8, 4)) / 86_400_000 * 252 / 365);

// Exit cost of the DI series maturing in the 2028/29 wall, priced by the indenture rule (0,40% a.a. pro rata).
const exit = executors.estimateExitCostBySeries({
  exitDate: referenceDate,
  unit: "BRL thousand",
  series: [
    {id: "deb-11-1", label: "11ª emissão, 1ª série", principal: "151795", rule: {mechanism: "redemption_offer", premiumPercent: null, requiresFullAdherence: true, availableFrom: null}, anchor: {document: "escritura_11a_emissao.pdf", clause: "4.14"}},
    {id: "deb-11-2", label: "11ª emissão, 2ª série", principal: "505984", rule: {mechanism: "redemption_offer", premiumPercent: null, requiresFullAdherence: true, availableFrom: null}, anchor: {document: "escritura_11a_emissao.pdf", clause: "4.14"}},
    {id: "deb-13-1", label: "13ª emissão, 1ª série", principal: "306038", rule: {mechanism: "flat_premium_pro_rata", premiumPerYearPercent: "0.40", businessDaysRemaining: businessDays("2028-11-16"), availableFrom: "2026-05-14"}, anchor: {document: "escritura_13a_emissao.pdf", clause: "7.18"}},
    {id: "deb-14-1", label: "14ª emissão, 1ª série", principal: "438918", rule: {mechanism: "flat_premium_pro_rata", premiumPerYearPercent: "0.40", businessDaysRemaining: businessDays("2029-06-15"), availableFrom: "2026-06-15"}, anchor: {document: "escritura_14a_emissao.pdf", clause: "7.20"}},
  ],
});
const premium = (id: string) => exit.exitCosts.find((entry) => entry.seriesId === id)!;
const cdiPlus125 = d(marketAssumptions.cdiAnnualPercent).plus(1.25).div(100).toFixed(4);

const result = executors.compareRefinancingBeforeAfter({
  referenceDate,
  unit: "BRL thousand",
  before: {
    grossDebt: "5670186", unrestrictedCash: "1455809", derivativeLiabilities: "14335", derivativeAssets: "235",
    ltmEbitda: {value: "895864", basis: "implied from the reported 4,72x over the contractual net debt of 4.228.477 (derived, not opened)"},
    schedule: {"2027": "1229828", "2028": "776868", "2029": "1228475", "2030": "694497", "2031": "994544", "2032+": "809198"},
    weightedAverageRate: "0.1246",
    anchor: {document: "01_ITR_1T26_31mai2026.pdf", page: 40, note: "15; average rate from the Case 02 base-scenario service (706.751 over 5.670.186)"},
  },
  covenant: {limit: "4.00", direction: "maximum", state: "insufficient_evidence", comparability: "conditional", anchor: {document: "escritura_13a_emissao.pdf", clause: "7.24.3(VIII)", page: 54}},
  alternatives: [
    {id: "status-quo", label: "Manter a estrutura e rolar as linhas bancárias", newDebt: null, retired: []},
    {
      id: "extend-di-2028", label: "Alongar o pico de 2028/29: nova dívida de sete anos (CDI + 1,25%, dois de carência, SAC) retirando a 13ª 1ª série pelo prêmio da escritura",
      newDebt: {amount: "306038", annualRate: cdiPlus125, termMonths: 84, graceMonths: 24, format: "sac", upfrontFeeRate: "0.005", origin: "custo de referência do pedido simulado do pack (CDI + 1,25%) e taxa de estruturação sintética de 0,50%", anchor: {document: "03_Pedido_Simulado_CRA_2026.docx", page: 1}},
      retired: [{seriesId: "deb-13-1", principal: "306038", exitPremium: premium("deb-13-1").premium, maturityPeriod: "2029"}],
    },
    {
      id: "extend-di-2028-and-2029", label: "Alongar os dois picos: nova dívida de sete anos retirando a 13ª 1ª série e a 14ª 1ª série pelo prêmio da escritura",
      newDebt: {amount: "744956", annualRate: cdiPlus125, termMonths: 84, graceMonths: 24, format: "sac", upfrontFeeRate: "0.005", origin: "custo de referência do pedido simulado do pack (CDI + 1,25%) e taxa de estruturação sintética de 0,50%", anchor: {document: "03_Pedido_Simulado_CRA_2026.docx", page: 1}},
      retired: [
        {seriesId: "deb-13-1", principal: "306038", exitPremium: premium("deb-13-1").premium, maturityPeriod: "2029"},
        {seriesId: "deb-14-1", principal: "438918", exitPremium: premium("deb-14-1").premium, maturityPeriod: "2030"},
      ],
    },
    {
      id: "offer-11th", label: "Retirar a 11ª emissão por oferta de resgate (prêmio a negociar)", newDebt: null,
      retired: [{seriesId: "deb-11-1", principal: "151795", exitPremium: premium("deb-11-1").premium, maturityPeriod: "2029"}, {seriesId: "deb-11-2", principal: "505984", exitPremium: premium("deb-11-2").premium, maturityPeriod: "2029"}],
    },
    {id: "cash-paydown", label: "Abater 300.000 das linhas bancárias de 2026/27 com caixa, ao par", newDebt: null, retired: [{seriesId: "loan-brl", principal: "300000", exitPremium: "0", maturityPeriod: "2027"}]},
  ],
  ranking: {discriminator: "peak_amount", rationale: "o conselho pediu se a estrutura aguenta os próximos anos; o pico de amortização em valor é o que a rolagem integral precisa vencer, e o custo all-in é a segunda leitura"},
  wallThresholdShare: "0.20",
});

const md: string[] = [];
md.push("### Custo de saída das séries DI e da 11ª (executor `estimate-exit-cost-by-series` v2, em 04/09/2026)", "", "| Série | Mecanismo | Estado | Base | Prêmio | Total |", "| --- | --- | --- | ---: | ---: | ---: |");
for (const entry of exit.exitCosts) md.push(`| ${entry.label} | ${entry.mechanism} | ${entry.state} | ${fmt(entry.basePayable)} | ${fmt(entry.premium)} | ${fmt(entry.totalPayable)} |`);
md.push("", "### Antes e depois por alternativa (executor `compare-refinancing-before-after` v1)", "", `Antes: dívida bruta ${fmt(result.before.grossDebt)}, caixa ${fmt(result.before.unrestrictedCash)}, dívida líquida contratual ${fmt(result.before.contractualNetDebt)}, alavancagem ${d(result.before.leverage!).toFixed(2)}x, pico ${result.before.peak?.period} com ${fmt(result.before.peak?.amount)} (${pct(result.before.peak?.share)} da dívida). Headroom não medido: ${result.unsupported.join("; ")}.`, "");
md.push("| Alternativa | Estado | Custo de saída | Dívida bruta depois | Caixa depois | Dívida líquida contratual | Alavancagem | Pico depois | Participação do pico | Custo all-in da nova dívida |", "| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: |");
for (const alternative of result.alternatives) {
  if (alternative.state === "blocked") { md.push(`| ${alternative.label} | blocked: ${alternative.blockReasons.join("; ")} | | | | | | | | |`); continue; }
  const after = alternative.after!;
  md.push(`| ${alternative.label} | ${alternative.state} | ${fmt(alternative.exitCost)} | ${fmt(after.grossDebt)} | ${fmt(after.unrestrictedCash)} | ${fmt(after.contractualNetDebt)} | ${after.leverage ? `${d(after.leverage).toFixed(2)}x` : "n/a"} | ${after.peak?.period ?? "n/a"}: ${fmt(after.peak?.amount)} | ${pct(after.peak?.share)} | ${after.allInCost ? pct(after.allInCost) : "n/a"} |`);
}
const columns = ["2027", "2028", "2029", "2030", "2031", "2032+"];
md.push("", "### Concentração por ano civil de término do ano safra, depois de cada alternativa", "", `| Alternativa | ${columns.join(" | ")} |`, `| --- | ${columns.map(() => "---:").join(" | ")} |`);
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
