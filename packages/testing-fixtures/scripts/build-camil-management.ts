/**
 * Case 02 (CFO of Camil preparing the board): the four synthetic management documents and the
 * deterministic numbers of its answer key, computed by financial-core from the frozen Case 01
 * ledger and the synthetic budget. Every file says in its first line that it is invented.
 *
 *   pnpm --filter @offroad/testing-fixtures camil-management
 */
import {createHash} from "node:crypto";
import {mkdirSync, writeFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

import Decimal from "decimal.js";
import * as XLSX from "xlsx";

import {projectCamil} from "../src/camil-management/projection";
import {allocateContractualSchedule, budget2026_27, camilManagementLabel, itrScheduleBuckets, itrScheduleDebentureCosts, managementSeries, marketAssumptions, minimumCashPolicy} from "../src/camil-management/truth";
import {writeDocx, type DocxBlock} from "../src/fakeco/docx";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "assets", "camil-management");
mkdirSync(outDir, {recursive: true});
const d = (value: Decimal.Value) => new Decimal(value);
const fmt = (value: Decimal.Value) => d(value).toDecimalPlaces(0).toNumber().toLocaleString("pt-BR");
const periods = itrScheduleBuckets.map((bucket) => bucket.period);

// 1. Gross contractual amortization schedule plus the transaction-cost bridge to the ITR buckets.
const {rows: scheduleRows, partials, totalByPeriod: byPeriod, loanScheduleBridgeByPeriod} = allocateContractualSchedule();

// 2 to 4. Debt service, CFADS, coverage and the leverage path come from the shared projection module.
const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
const budgetYear = {
  revenue: sum(budget2026_27.netRevenue), ebitda: sum(budget2026_27.ebitda), taxes: sum(budget2026_27.cashTaxes),
  capex: sum(budget2026_27.maintenanceCapex) + sum(budget2026_27.growthCapex), workingCapital: sum(budget2026_27.changeInWorkingCapital),
  leases: sum(budget2026_27.leasePayments), dividends: sum(budget2026_27.dividends),
};
const noRollover = projectCamil({rollover: false}).years;
const rolloverAnnualRate = new Decimal(marketAssumptions.cdiAnnualPercent).plus(1.5).div(100);
const rollover = projectCamil({rollover: true, rolloverAnnualRate}).years;

// 5. Files.
const written: Array<{name: string; bytes: number; sha256: string}> = [];
const emit = (name: string, bytes: Uint8Array) => {
  writeFileSync(join(outDir, name), bytes);
  written.push({name, bytes: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex")});
};
const sheet = (sheets: Array<{name: string; rows: (string | number)[][]; widths?: number[]}>) => {
  const book = XLSX.utils.book_new();
  for (const entry of sheets) {
    const worksheet = XLSX.utils.aoa_to_sheet(entry.rows);
    if (entry.widths) worksheet["!cols"] = entry.widths.map((wch) => ({wch}));
    XLSX.utils.book_append_sheet(book, worksheet, entry.name);
  }
  return new Uint8Array(XLSX.write(book, {type: "array", bookType: "xlsx"}));
};
const label = [camilManagementLabel];
emit("01_Orcamento_2026_2027.xlsx", sheet([{name: "Orcamento", widths: [46, 22, 22, 22, 22, 18], rows: [
  label, ["Camil Alimentos S.A. (simulação), orçamento do ano safra 2026/27, R$ mil, consolidado"], [],
  ["Linha", ...budget2026_27.quarters, "Ano"],
  ["Receita líquida", ...budget2026_27.netRevenue, budgetYear.revenue],
  ["EBITDA", ...budget2026_27.ebitda, budgetYear.ebitda],
  ["Impostos caixa", ...budget2026_27.cashTaxes, budgetYear.taxes],
  ["Capex de manutenção", ...budget2026_27.maintenanceCapex, sum(budget2026_27.maintenanceCapex)],
  ["Capex de crescimento", ...budget2026_27.growthCapex, sum(budget2026_27.growthCapex)],
  ["Variação do capital de giro (aumento positivo)", ...budget2026_27.changeInWorkingCapital, budgetYear.workingCapital],
  ["Pagamentos de arrendamento", ...budget2026_27.leasePayments, budgetYear.leases],
  ["Dividendos", ...budget2026_27.dividends, budgetYear.dividends],
  [], ["Anos seguintes: crescimento nominal de 2% ao ano, capex só de manutenção, variação de capital de giro de R$ 50 milhões por ano (premissa gerencial sintética)"],
]}]));
emit("02_Plano_Capex.xlsx", sheet([{name: "Capex", widths: [48, 20, 18, 18, 18], rows: [
  label, ["Plano de capex 2026/27 a 2028/29, R$ mil"], [],
  ["Projeto", "Classe", "2026/27", "2027/28", "2028/29"],
  ["Manutenção das plantas de arroz e feijão", "manutenção", sum(budget2026_27.maintenanceCapex), Math.round(sum(budget2026_27.maintenanceCapex) * 1.02), Math.round(sum(budget2026_27.maintenanceCapex) * 1.0404)],
  ["Expansão de massas e café", "crescimento", sum(budget2026_27.growthCapex), 0, 0],
  ["Total", "", budgetYear.capex, Math.round(sum(budget2026_27.maintenanceCapex) * 1.02), Math.round(sum(budget2026_27.maintenanceCapex) * 1.0404)],
]}]));
const policy: DocxBlock[] = [
  {kind: "heading", text: "Camil Alimentos S.A. (simulação): política de caixa mínimo"},
  {kind: "paragraph", text: camilManagementLabel},
  {kind: "paragraph", text: `Regra: ${minimumCashPolicy.rule}.`},
  {kind: "table", rows: [["Parâmetro", "Valor"], ["Piso de caixa (R$ mil)", fmt(minimumCashPolicy.floor)], ["Linhas comprometidas (R$ mil)", fmt(minimumCashPolicy.committedLines)], ["Revisão", minimumCashPolicy.reviewCycle]]},
  {kind: "paragraph", text: "Caixa elegível: caixa e equivalentes mais aplicações financeiras de liquidez imediata; aplicações com prazo acima de noventa dias não contam para o piso."},
];
emit("03_Politica_Caixa_Minimo.docx", await writeDocx(policy));
emit("04_Cronograma_Contratual_Amortizacoes.xlsx", sheet([
  {name: "Cronograma", widths: [42, 18, 24, 62, 15, 15, 15, 15, 15, 15, 16], rows: [
    label, ["Cronograma contratual sintético de amortizações por série, ano safra (junho a maio), R$ mil; principal bruto reconciliado separadamente ao cronograma contábil da nota 15 do ITR de 31/05/2026"], [],
    ["Série", "Vencimento", "Remuneração", "Fonte da taxa", ...periods, "Total"],
    ...managementSeries.map((series) => {
      const amounts = periods.map((period) => scheduleRows.filter((row) => row.period === period && row.id === series.id).reduce((total, row) => total.plus(row.amount), d(0)));
      const rate = series.rate.type === "fixed" ? `prefixada ${series.rate.rate}% a.a.` : series.rate.type === "percent_of_index" ? `${series.rate.percent}% do ${series.rate.index}` : `${series.rate.index} + ${series.rate.spread}% a.a.`;
      return [series.label, series.maturity ?? "linhas rotativas", rate, series.rateSource === "public" ? "relatório do agente fiduciário" : "gerencial (sintético)", ...amounts.map((amount) => amount.toDecimalPlaces(0).toNumber()), amounts.reduce((total, amount) => total.plus(amount), d(0)).toDecimalPlaces(0).toNumber()];
    }),
    ["Principal contratual sintético", "", "", "arquivos gerenciais sintéticos", ...periods.map((period) => byPeriod(period).toDecimalPlaces(0).toNumber()), periods.reduce((total, period) => total.plus(byPeriod(period)), d(0)).toDecimalPlaces(0).toNumber()],
    ["Ajuste de bridge das linhas", "", "", "custos de transação de 9.099 mais diferença de arredondamento de 1", ...periods.map((period) => loanScheduleBridgeByPeriod(period).toDecimalPlaces(0).toNumber()), periods.reduce((total, period) => total.plus(loanScheduleBridgeByPeriod(period)), d(0)).toDecimalPlaces(0).toNumber()],
    ["Cronograma público da nota 15", "", "", "ITR nota 15", ...itrScheduleBuckets.map((bucket) => bucket.amount), itrScheduleBuckets.reduce((total, bucket) => total + bucket.amount, 0)],
    ["Custos de transação de debêntures", "", "", "ITR nota 15; não alocados por ano", ...periods.map(() => 0), itrScheduleDebentureCosts],
    ["Saldo contábil reconciliado", "", "", "cronograma público menos custos de debêntures", ...periods.map(() => 0), itrScheduleBuckets.reduce((total, bucket) => total + bucket.amount, 0) + itrScheduleDebentureCosts],
  ]},
  {name: "Parciais", widths: [120], rows: [label, ["Amortizações parciais sintéticas usadas na alocação por série"], ...partials.map((line) => [line])]},
]));
const manifest = {schemaVersion: "camil-management.v1", label: camilManagementLabel, generatedBy: "packages/testing-fixtures/scripts/build-camil-management.ts", files: written};
writeFileSync(join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

// 6. The answer-key tables, printed as Markdown.
const md: string[] = [];
md.push("### Cronograma contratual por série (sintético, principal bruto)", "", `| Série | ${periods.join(" | ")} |`, `| --- | ${periods.map(() => "---:").join(" | ")} |`);
for (const series of managementSeries) md.push(`| ${series.label} | ${periods.map((period) => fmt(scheduleRows.filter((row) => row.period === period && row.id === series.id).reduce((total, row) => total.plus(row.amount), d(0)))).join(" | ")} |`);
md.push(`| Principal bruto | ${periods.map((period) => fmt(byPeriod(period))).join(" | ")} |`, `| Ajuste do bridge das linhas | ${periods.map((period) => fmt(loanScheduleBridgeByPeriod(period))).join(" | ")} |`, `| Cronograma público | ${itrScheduleBuckets.map((bucket) => fmt(bucket.amount)).join(" | ")} |`, "", `Parciais: ${partials.join("; ")}.`, "");
md.push("### Serviço da dívida por ano safra (financial-core, cenário base)", "", "| Ano safra | Principal contratual sintético | Principal caixa após IPCA | Juros caixa | IPCA capitalizado | Serviço de dívida caixa |", "| --- | ---: | ---: | ---: | ---: | ---: |");
for (const year of noRollover) md.push(`| ${year.period} | ${fmt(year.contractualPrincipal)} | ${fmt(year.principal)} | ${fmt(year.interest)} | ${fmt(year.indexationCapitalized)} | ${fmt(year.cashDebtService)} |`);
md.push("", "### DSCR e liquidez sem rolagem (financial-core)", "", "| Ano safra | Receita | EBITDA | CFADS | Caixa inicial | Serviço de dívida | DSCR | Usos de caixa | Cobertura de liquidez | Caixa final | Déficit |", "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
for (const year of noRollover) md.push(`| ${year.period} | ${fmt(year.revenue)} | ${fmt(year.ebitda)} | ${fmt(year.cfads)} | ${fmt(year.openingCash)} | ${fmt(year.cashDebtService)} | ${year.dscr === null ? "n/a" : d(year.dscr).toFixed(2)} | ${fmt(year.cashUses)} | ${year.liquidityCoverage === null ? "n/a" : d(year.liquidityCoverage).toFixed(2)} | ${fmt(year.closingCash)} | ${fmt(year.deficit)} |`);
md.push("", `### Liquidez com rolagem integral do principal (financial-core; rolagem a ${rolloverAnnualRate.times(100).toFixed(2)}% a.a.)`, "", "| Ano safra | Serviço de dívida | Juros da rolagem | Proventos de rolagem | DSCR bruto | Cobertura de liquidez | Caixa final | Piso da política | Folga sobre o piso |", "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
for (const year of rollover) md.push(`| ${year.period} | ${fmt(year.cashDebtService)} | ${fmt(year.rolloverInterest)} | ${fmt(year.contractedSources)} | ${year.dscr === null ? "n/a" : d(year.dscr).toFixed(2)} | ${year.liquidityCoverage === null ? "n/a" : d(year.liquidityCoverage).toFixed(2)} | ${fmt(year.closingCash)} | ${fmt(minimumCashPolicy.floor)} | ${fmt(d(year.closingCash).minus(minimumCashPolicy.floor))} |`);
md.push("", "### Trajetória de alavancagem econômica com rolagem (não é teste de covenant)", "", "A dívida prospectiva parte do principal contratual bruto do cronograma gerencial sintético. É uma visão de caixa, não o saldo contábil prospectivo: o fixture ainda não contém a curva de apropriação dos custos pelo método da taxa efetiva.", "", "| Ano safra | EBITDA | Principal contratual bruto | Caixa elegível | Dívida líquida econômica | Índice econômico |", "| --- | ---: | ---: | ---: | ---: | ---: |");
for (const year of rollover) md.push(`| ${year.period} | ${fmt(year.ebitda)} | ${fmt(year.grossDebt)} | ${fmt(year.closingCash)} | ${fmt(year.netDebt)} | ${d(year.leverage).toFixed(2)}x |`);
console.log(md.join("\n"));
console.log("\nfiles:", written.map((file) => `${file.name} ${file.bytes}B ${file.sha256.slice(0, 12)}`).join("; "));
