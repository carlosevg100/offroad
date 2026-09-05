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
import {allocateContractualSchedule, budget2026_27, camilManagementLabel, itrDebentureCosts, itrScheduleBuckets, managementSeries, minimumCashPolicy} from "../src/camil-management/truth";
import {writeDocx, type DocxBlock} from "../src/fakeco/docx";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "assets", "camil-management");
mkdirSync(outDir, {recursive: true});
const d = (value: Decimal.Value) => new Decimal(value);
const fmt = (value: Decimal.Value) => d(value).toDecimalPlaces(0).toNumber().toLocaleString("pt-BR");
const periods = itrScheduleBuckets.map((bucket) => bucket.period);

// 1. Contractual amortization schedule, allocated in the truth module and tied to the ITR buckets there.
const {rows: scheduleRows, partials, totalByPeriod: byPeriod} = allocateContractualSchedule();

// 2 to 4. Debt service, CFADS, coverage and the leverage path come from the shared projection module.
const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
const budgetYear = {
  revenue: sum(budget2026_27.netRevenue), ebitda: sum(budget2026_27.ebitda), taxes: sum(budget2026_27.cashTaxes),
  capex: sum(budget2026_27.maintenanceCapex) + sum(budget2026_27.growthCapex), workingCapital: sum(budget2026_27.changeInWorkingCapital),
  leases: sum(budget2026_27.leasePayments), dividends: sum(budget2026_27.dividends),
};
const noRollover = projectCamil({rollover: false}).years;
const rollover = projectCamil({rollover: true}).years;

// 5. Files.
const written: Array<{name: string; bytes: number; sha256: string}> = [];
const emit = (name: string, bytes: Uint8Array) => {
  writeFileSync(join(outDir, name), bytes);
  written.push({name, bytes: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex")});
};
const sheet = (sheets: Array<{name: string; rows: (string | number)[][]}>) => {
  const book = XLSX.utils.book_new();
  for (const entry of sheets) XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(entry.rows), entry.name);
  return new Uint8Array(XLSX.write(book, {type: "array", bookType: "xlsx"}));
};
const label = [camilManagementLabel];
emit("01_Orcamento_2026_2027.xlsx", sheet([{name: "Orcamento", rows: [
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
emit("02_Plano_Capex.xlsx", sheet([{name: "Capex", rows: [
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
  {name: "Cronograma", rows: [
    label, ["Cronograma contratual de amortizações por série, ano safra (junho a maio), R$ mil; totais por ano iguais à nota 15 do ITR de 31/05/2026; alocação por série sintética"], [],
    ["Série", "Vencimento", "Remuneração", "Fonte da taxa", ...periods, "Total"],
    ...managementSeries.map((series) => {
      const amounts = periods.map((period) => scheduleRows.filter((row) => row.period === period && row.id === series.id).reduce((total, row) => total.plus(row.amount), d(0)));
      const rate = series.rate.type === "fixed" ? `prefixada ${series.rate.rate}% a.a.` : series.rate.type === "percent_of_index" ? `${series.rate.percent}% do ${series.rate.index}` : `${series.rate.index} + ${series.rate.spread}% a.a.`;
      return [series.label, series.maturity ?? "linhas rotativas", rate, series.rateSource === "public" ? "relatório do agente fiduciário" : "gerencial (sintético)", ...amounts.map((amount) => amount.toDecimalPlaces(0).toNumber()), amounts.reduce((total, amount) => total.plus(amount), d(0)).toDecimalPlaces(0).toNumber()];
    }),
    ["Custos de transação de debêntures", "", "", "ITR nota 15", ...periods.map(() => 0), itrDebentureCosts],
    ["Total", "", "", "", ...periods.map((period) => byPeriod(period).toDecimalPlaces(0).toNumber()), byPeriod("2026/27").plus(byPeriod("2027/28")).plus(byPeriod("2028/29")).plus(byPeriod("2029/30")).plus(byPeriod("2030/31")).plus(byPeriod("after 2031")).plus(itrDebentureCosts).toDecimalPlaces(0).toNumber()],
  ]},
  {name: "Parciais", rows: [label, ["Amortizações parciais declaradas para caber nos totais do ITR"], ...partials.map((line) => [line])]},
]));
const manifest = {schemaVersion: "camil-management.v1", label: camilManagementLabel, generatedBy: "packages/testing-fixtures/scripts/build-camil-management.ts", files: written};
writeFileSync(join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

// 6. The answer-key tables, printed as Markdown.
const md: string[] = [];
md.push("### Cronograma contratual por série (sintético, totais iguais ao ITR)", "", `| Série | ${periods.join(" | ")} |`, `| --- | ${periods.map(() => "---:").join(" | ")} |`);
for (const series of managementSeries) md.push(`| ${series.label} | ${periods.map((period) => fmt(scheduleRows.filter((row) => row.period === period && row.id === series.id).reduce((total, row) => total.plus(row.amount), d(0)))).join(" | ")} |`);
md.push(`| Total | ${periods.map((period) => fmt(byPeriod(period))).join(" | ")} |`, "", `Parciais: ${partials.join("; ")}.`, "");
md.push("### Serviço da dívida por ano safra (financial-core, cenário base)", "", "| Ano safra | Principal | Juros caixa | IPCA capitalizado | Serviço caixa |", "| --- | ---: | ---: | ---: | ---: |");
for (const year of noRollover) md.push(`| ${year.period} | ${fmt(year.principal)} | ${fmt(year.interest)} | ${fmt(year.indexationCapitalized)} | ${fmt(d(year.principal).plus(year.interest))} |`);
md.push("", "### CFADS e cobertura sem rolagem (financial-core)", "", "| Ano safra | EBITDA | CFADS | Caixa inicial | Serviço | Cobertura | Caixa final | Déficit |", "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
for (const year of noRollover) md.push(`| ${year.period} | ${fmt(year.ebitda)} | ${fmt(year.cfads)} | ${fmt(year.openingCash)} | ${fmt(year.debtService)} | ${year.coverage === null ? "n/a" : d(year.coverage).toFixed(2)} | ${fmt(year.closingCash)} | ${fmt(year.deficit)} |`);
md.push("", "### Cobertura com rolagem integral do principal (financial-core)", "", "| Ano safra | Serviço | Cobertura | Caixa final | Piso da política | Folga sobre o piso |", "| --- | ---: | ---: | ---: | ---: | ---: |");
for (const year of rollover) md.push(`| ${year.period} | ${fmt(year.debtService)} | ${year.coverage === null ? "n/a" : d(year.coverage).toFixed(2)} | ${fmt(year.closingCash)} | ${fmt(minimumCashPolicy.floor)} | ${fmt(d(year.closingCash).minus(minimumCashPolicy.floor))} |`);
md.push("", "### Trajetória de alavancagem com rolagem (dívida líquida sobre EBITDA)", "", "| Ano safra | EBITDA | Dívida bruta | Caixa | Dívida líquida | Índice | Contra 4,00x | Contra 3,50x |", "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
for (const year of rollover) md.push(`| ${year.period} | ${fmt(year.ebitda)} | ${fmt(year.grossDebt)} | ${fmt(year.closingCash)} | ${fmt(year.netDebt)} | ${d(year.leverage).toFixed(2)}x | ${d(4).minus(year.leverage).toFixed(2)} | ${d(3.5).minus(year.leverage).toFixed(2)} |`);
console.log(md.join("\n"));
console.log("\nfiles:", written.map((file) => `${file.name} ${file.bytes}B ${file.sha256.slice(0, 12)}`).join("; "));
