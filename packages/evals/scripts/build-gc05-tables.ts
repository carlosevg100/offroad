/**
 * Case 05 (banker thinking about Camil's expansion, three turns): the deterministic tables of its
 * answer key. Capex scenarios are derived, never arbitrary: the low one is the average annual
 * additions to PP&E and intangibles of the two fiscal years in the DFP; the medium one is the
 * incremental debt capacity at the contractual leverage tiers (the sector pack carries no ceiling);
 * the high one needs a public announcement or a sector benchmark in the pack, and the pack holds
 * neither, so it is not created. Funding need, coverage and leverage come from the projection
 * shared with case 02; alternatives and the turn-3 bridge come from the case 01 executors.
 *
 *   pnpm --filter @offroad/evals gc05:tables
 */
import {executors} from "@offroad/credit-playbook";
import {calculateLeverage} from "@offroad/financial-core";
import {camilManagement, marketAssumptions, minimumCashPolicy, projectCamil, projectionPeriods} from "@offroad/testing-fixtures";
import Decimal from "decimal.js";

const d = (value: Decimal.Value) => new Decimal(value);
const fmt = (value: Decimal.Value | null | undefined) => value === null || value === undefined ? "n/a" : d(value).toDecimalPlaces(0).toNumber().toLocaleString("pt-BR");
const pct = (value: Decimal.Value | null | undefined) => value === null || value === undefined ? "n/a" : `${d(value).times(100).toFixed(2)}%`;
const md: string[] = [];
void camilManagement;

// 1. Capex scenarios and their anchors (R$ thousand).
const dfpAdditions = {fy2025_26: 463_433, fy2024_25: 334_939, anchor: "cvm_dfp_2025.txt, demonstração dos fluxos de caixa consolidada, linha 'Adições ao imobilizado e intangível'"};
const lowCapex = d(dfpAdditions.fy2025_26).plus(dfpAdditions.fy2024_25).div(2);
const impliedEbitda = d("895863.77118644");
const contractualNetDebt = d(4_228_477);
const capacityAt = (limit: Decimal.Value) => Decimal.max(d(limit).times(impliedEbitda).minus(contractualNetDebt), 0);
md.push("### Cenários de capex derivados (R$ mil por ano safra)", "", "| Cenário | Valor | Derivação | Estado |", "| --- | ---: | --- | --- |",
  `| Baixo | ${fmt(lowCapex)} | média das adições ao imobilizado e intangível consolidadas dos dois exercícios da DFP (${fmt(dfpAdditions.fy2025_26)} e ${fmt(dfpAdditions.fy2024_25)}; ${dfpAdditions.anchor}) | criado |`,
  `| Médio | ${fmt(capacityAt("4.00"))} | capacidade incremental de dívida no teto contratual de 4,00x (o pack setorial não traz teto): 4,00 × ${fmt(impliedEbitda)} menos ${fmt(contractualNetDebt)} = ${fmt(d("4.00").times(impliedEbitda).minus(contractualNetDebt))}, negativo; a 3,50x, ${fmt(d("3.50").times(impliedEbitda).minus(contractualNetDebt))} | criado com valor zero: não há capacidade incremental de dívida dentro do covenant |`,
  `| Alto | n/a | exige anúncio público de tamanho e cronograma ou benchmark setorial no pack; o release 1T26 registra a conclusão das obras de Cambaí e a normalização do capex a níveis de manutenção, e o pack não tem benchmark de expansão | não criado |`);

// 2. Funding need by period: base projection (maintenance capex) versus the low scenario applied to the outer years, no rollover
//    (the need is what the market has to provide) and with rollover of maturing principal.
const capexLow = Object.fromEntries(projectionPeriods.slice(1).map((period) => [period, lowCapex]));
const base = projectCamil({rollover: false}).years;
const low = projectCamil({rollover: false, capexByPeriod: capexLow}).years;
const lowRoll = projectCamil({rollover: true, capexByPeriod: capexLow}).years;
md.push("", "### Funding need por ano safra (déficit de caixa sem rolagem, financial-core)", "", "| Ano safra | CFADS base | Déficit base | CFADS cenário baixo | Déficit cenário baixo | Déficit acumulado (baixo) | Com rolagem: caixa final (baixo) | Folga sobre o piso |", "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
let peak: {period: string; deficit: Decimal} | null = null;
base.forEach((year, index) => {
  const l = low[index]!; const r = lowRoll[index]!;
  const incremental = d(l.deficit).minus(index === 0 ? 0 : d(low[index - 1]!.deficit));
  if (!peak || incremental.gt(peak.deficit)) peak = {period: year.period, deficit: incremental};
  md.push(`| ${year.period} | ${fmt(year.cfads)} | ${fmt(year.deficit)} | ${fmt(l.cfads)} | ${fmt(incremental)} | ${fmt(l.deficit)} | ${fmt(r.closingCash)} | ${fmt(d(r.closingCash).minus(minimumCashPolicy.floor))} |`);
});
md.push("", `Pico do funding need incremental (cenário baixo, sem rolagem): ${peak!.period} com ${fmt(peak!.deficit)}. A sazonalidade do orçamento sintético (compra de safra no segundo e terceiro trimestres) concentra a necessidade de caixa entre junho e novembro; a alternativa que evita pedir caixa nesse pior trimestre é a que desembolsa antes de junho ou financia o estoque (linha de safra), não a que vence em novembro.`);
const levLow = lowRoll.map((year) => ({period: year.period, leverage: calculateLeverage(year.netDebt, year.ebitda).value}));
md.push("", "Alavancagem com rolagem e capex do cenário baixo: " + levLow.map((entry) => `${entry.period} ${d(entry.leverage).toFixed(2)}x`).join("; ") + ". Nenhum ano cruza 4,00x para baixo dentro do horizonte.");

// 3. Alternatives on the same model (executors of case 01) and the turn-3 bridge. The base holds the 31/05 balances,
// not the nominal at the exit date, so the exit cost of every series stays insufficient evidence and the alternatives
// that retire a series stay blocked until the indenture-derived nominal enters the base.
const cdiPlus = (spread: number) => d(marketAssumptions.cdiAnnualPercent).plus(spread).div(100).toFixed(4);
const exitDate = "2026-09-04";
const calendarNote = (maturity: string) => ({document: "calendario_dias_uteis_pendente.md", note: `weekday count from ${exitDate} to ${maturity}; the ANBIMA calendar file is not yet in the corpus, so the count is an upper bound declared as such`});
const exitDocuments = [
  {name: "escritura_11a_emissao.pdf", kind: "indenture" as const}, {name: "escritura_13a_emissao.pdf", kind: "indenture" as const}, {name: "escritura_14a_emissao.pdf", kind: "indenture" as const}, {name: "escritura_15a_emissao.pdf", kind: "indenture" as const},
  {name: "01_ITR_1T26_31mai2026.pdf", kind: "itr" as const}, {name: "calendario_dias_uteis_pendente.md", kind: "calendar" as const},
];
const exit = executors.estimateExitCostBySeries({exitDate, unit: "BRL thousand", documents: exitDocuments, series: [
  {id: "deb-13-1", label: "13ª emissão, 1ª série", indenture: {document: "escritura_13a_emissao.pdf", clause: "4.1"}, nominalAtExit: null, accruedAtExit: null, chargesAtExit: null, remainingFlows: null, mechanisms: [{mechanism: "extraordinary_amortization_di", premiumPerYear: "0.004", availableFrom: "2026-05-14", maxFraction: "0.98", fraction: "0.98", businessDays: {count: executors.weekdaysBetween(exitDate, "2028-11-14"), maturity: "2028-11-14", anchor: calendarNote("2028-11-14")}, anchor: {document: "escritura_13a_emissao.pdf", clause: "7.18"}}], anchor: {document: "escritura_13a_emissao.pdf", clause: "4.1"}},
  {id: "deb-14-1", label: "14ª emissão, 1ª série", indenture: {document: "escritura_14a_emissao.pdf", clause: "4.1"}, nominalAtExit: null, accruedAtExit: null, chargesAtExit: null, remainingFlows: null, mechanisms: [{mechanism: "extraordinary_amortization_di", premiumPerYear: "0.004", availableFrom: "2026-06-15", maxFraction: "0.98", fraction: "0.98", businessDays: {count: executors.weekdaysBetween(exitDate, "2029-06-14"), maturity: "2029-06-14", anchor: calendarNote("2029-06-14")}, anchor: {document: "escritura_14a_emissao.pdf", clause: "7.20"}}], anchor: {document: "escritura_14a_emissao.pdf", clause: "4.1"}},
  {id: "deb-11", label: "11ª emissão", indenture: {document: "escritura_11a_emissao.pdf", clause: "4.1"}, nominalAtExit: null, accruedAtExit: null, chargesAtExit: null, remainingFlows: null, mechanisms: [{mechanism: "negotiated_offer", availableFrom: "2021-11-15", premium: null, requiresFullAdherence: true, anchor: {document: "escritura_11a_emissao.pdf", clause: "4.14"}}], anchor: {document: "escritura_11a_emissao.pdf", clause: "4.1"}},
]});
const premium = (id: string) => {
  const entry = exit.exit_costs.find((cost) => cost.series_id === id)!;
  return entry.cheapest_full_exit ? {value: d(entry.cheapest_full_exit.total_payable).minus(entry.base.payable ?? 0).toFixed(), anchor: {document: "exit-costs-gc05.json", note: `route ${entry.cheapest_full_exit.mechanism}`}} : null;
};
const itr = (page: number, note: string) => ({document: "01_ITR_1T26_31mai2026.pdf", page, note});
const beforeAfter = (rate: string, termMonths: number) => executors.compareRefinancingBeforeAfter({
  referenceDate: "2026-05-31", unit: "BRL thousand",
  before: {
    grossDebt: {value: "5670186", anchor: itr(40, "nota 15, total")}, unrestrictedCash: {value: "1455809", anchor: itr(8, "caixa e equivalentes")}, derivativeLiabilities: {value: "14335", anchor: itr(9, "derivativos, passivo")}, derivativeAssets: {value: "235", anchor: itr(8, "derivativos, ativo")},
    ltmEbitda: {value: "895864", definitionKey: "ebitda.contractual.13a", basis: "implied_from_reported_index", anchor: {document: "release_1T26.pdf", page: 3, note: "4,72x (derivado)"}},
    schedule: [{period: "2026/27", amount: "1229828", endsAt: "2027-05-31"}, {period: "2027/28", amount: "776868", endsAt: "2028-05-31"}, {period: "2028/29", amount: "1228475", endsAt: "2029-05-31"}, {period: "2029/30", amount: "694497", endsAt: "2030-05-31"}, {period: "2030/31", amount: "994544", endsAt: "2031-05-31"}, {period: "after 2031", amount: "809198", endsAt: null}, {period: "debenture costs", amount: "-63224", endsAt: null, kind: "adjustment"}],
    costOfExistingDebt: {weightedAverageRate: "0.1246", basis: "juros do serviço base sobre a dívida bruta; custo contábil, não all-in", anchor: itr(40, "nota 15")}, cfadsByPeriod: null,
  },
  covenant: {limit: "4.00", direction: "maximum", state: "insufficient_evidence", comparability: "conditional", anchor: {document: "escritura_13a_emissao.pdf", clause: "7.24.3(VIII)", page: 54}},
  alternatives: [
    {id: "status-quo", label: "Manter a estrutura e rolar as linhas", newDebt: null, retired: []},
    {id: "x-extend-di-2028", label: "X: alongar a parede de 2028/29 retirando a 13ª 1ª série", newDebt: {amount: "306038", annualRate: rate, termMonths, graceMonths: 24, format: "sac", upfrontFeeRate: "0.005", disbursementDate: exitDate, origin: "custo de referência do pedido simulado (CDI + 1,25%), sintético", anchor: {document: "03_Pedido_Simulado_CRA_2026.docx", page: 1}}, retired: [{seriesId: "deb-13-1", principal: "306038", exitPremium: premium("deb-13-1"), maturityPeriod: "2028/29", anchor: {document: "escritura_13a_emissao.pdf", clause: "4.1"}}]},
    {id: "y-extend-both", label: "Y: alongar as duas paredes retirando a 13ª 1ª e a 14ª 1ª séries", newDebt: {amount: "744956", annualRate: rate, termMonths, graceMonths: 24, format: "sac", upfrontFeeRate: "0.005", disbursementDate: exitDate, origin: "idem", anchor: {document: "03_Pedido_Simulado_CRA_2026.docx", page: 1}}, retired: [{seriesId: "deb-13-1", principal: "306038", exitPremium: premium("deb-13-1"), maturityPeriod: "2028/29", anchor: {document: "escritura_13a_emissao.pdf", clause: "4.1"}}, {seriesId: "deb-14-1", principal: "438918", exitPremium: premium("deb-14-1"), maturityPeriod: "2029/30", anchor: {document: "escritura_14a_emissao.pdf", clause: "4.1"}}]},
    {id: "offer-11th", label: "Retirar a 11ª por oferta (prêmio a negociar)", newDebt: null, retired: [{seriesId: "deb-11", principal: "657779", exitPremium: premium("deb-11"), maturityPeriod: "2028/29", anchor: {document: "escritura_11a_emissao.pdf", clause: "4.1"}}]},
  ],
  ranking: {discriminator: "peak_amount", rationale: "a expansão só cabe se a parede de 2028/29 for alongada; o pico em valor é o discriminador, o custo all-in a segunda leitura"},
  wallThreshold: {share: "0.20", policyKey: "policy.structure.maturity_wall", policyVersion: "2026.09.05-v8"},
});
const turn1 = beforeAfter(cdiPlus(1.25), 84);
const turn3 = beforeAfter(cdiPlus(1.0), 120);
const cell = (result: ReturnType<typeof beforeAfter>, id: string, period: string) => fmt(result.alternatives.find((a) => a.id === id)!.concentration?.find((row) => row.period === period)?.consolidated);
const line = (result: ReturnType<typeof beforeAfter>, id: string) => { const a = result.alternatives.find((alternative) => alternative.id === id)!; return a.state === "blocked" || !a.after ? `blocked: ${a.block_reasons.join("; ")}` : `custo de saída ${fmt(a.exit_cost?.value)}; pico ${a.after.peak?.period} ${fmt(a.after.peak?.amount)}; all-in ${a.new_debt_service ? pct(a.new_debt_service.all_in_cost) : "n/a"}; 2028/29 ${cell(result, id, "2028/29")}; 2030/31 ${cell(result, id, "2030/31")}`; };
md.push("", "### Alternativas no mesmo modelo, turno 1 (CDI + 1,25%, 84 meses) e turno 3 (CDI + 1,00%, 120 meses)", "", "| Alternativa | Turno 1 | Turno 3 |", "| --- | --- | --- |");
for (const id of ["status-quo", "x-extend-di-2028", "y-extend-both", "offer-11th"]) md.push(`| ${id} | ${line(turn1, id)} | ${line(turn3, id)} |`);
const rankingLine = (result: ReturnType<typeof beforeAfter>) => result.ranking ? result.ranking.order.map((entry) => `${entry.id} (${fmt(d(entry.value).negated())})`).join(" > ") : `sem ranking: ${result.unsupported.join("; ")}`;
md.push("", `Ranking turno 1: ${rankingLine(turn1)}. Ranking turno 3: ${rankingLine(turn3)}.`);
md.push("", "### Bridge do turno 3 (o que foi recomputado e o que não foi)", "", "| Nó | Turno 1 | Turno 3 | Recomputado |", "| --- | --- | --- | --- |",
  `| ledger e cronograma (antes) | fingerprint do antes idêntico | idêntico | não |`,
  `| custo de saída por série | ${exit.trace.outputFingerprint.slice(0, 12)} | ${exit.trace.outputFingerprint.slice(0, 12)} | não |`,
  `| serviço da nova dívida de X | ${fmt(turn1.alternatives.find((a) => a.id === "x-extend-di-2028")!.new_debt_service?.total_interest)} de juros | ${fmt(turn3.alternatives.find((a) => a.id === "x-extend-di-2028")!.new_debt_service?.total_interest)} de juros | sim |`,
  `| all-in de X | ${pct(turn1.alternatives.find((a) => a.id === "x-extend-di-2028")!.new_debt_service?.all_in_cost)} | ${pct(turn3.alternatives.find((a) => a.id === "x-extend-di-2028")!.new_debt_service?.all_in_cost)} | sim |`,
  `| concentração depois de X | 2028/29 ${cell(turn1, "x-extend-di-2028", "2028/29")} | 2028/29 ${cell(turn3, "x-extend-di-2028", "2028/29")} | sim |`,
  `| ranking | ${turn1.ranking ? turn1.ranking.order.map((entry) => entry.id).join(" > ") : "sem ranking"} | ${turn3.ranking ? turn3.ranking.order.map((entry) => entry.id).join(" > ") : "sem ranking"} | ${(turn1.ranking?.order.map((entry) => entry.id).join() ?? "") === (turn3.ranking?.order.map((entry) => entry.id).join() ?? "") ? "recomputado, sem mudança de ordem" : "recomputado, ordem mudou"} |`,
  `| fingerprint do resultado | ${turn1.trace.outputFingerprint.slice(0, 12)} | ${turn3.trace.outputFingerprint.slice(0, 12)} | sim |`);
console.log(md.join("\n"));
