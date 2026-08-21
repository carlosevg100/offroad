/**
 * Builds the Nimbus data room from one declared truth. Six files a Series A startup actually
 * sends: a deck (as a document), the ask, the per-customer MRR export, the cap table, the
 * management accounts and a bank statement.
 *
 *   pnpm --filter @offroad/testing-fixtures nimbus
 */
import {createHash} from "node:crypto";
import {mkdirSync, writeFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

import * as XLSX from "xlsx";

import {writeDocx, type DocxBlock} from "../src/fakeco/docx";
import {company, debt, historical, interim2026, metrics, months, mrrByCustomer, mrrTotals, request} from "../src/nimbus/truth";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "assets", "nimbus");
mkdirSync(outDir, {recursive: true});

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
const brl = (value: number) => value.toLocaleString("pt-BR", {minimumFractionDigits: 2, maximumFractionDigits: 2});
const pct = (value: number, digits = 1) => `${(value * 100).toLocaleString("pt-BR", {minimumFractionDigits: digits, maximumFractionDigits: digits})}%`;
const mm = (value: number) => `R$ ${(value / 1_000_000).toLocaleString("pt-BR", {minimumFractionDigits: 1, maximumFractionDigits: 1})} milhões`;

// 00 Deck: the narrative, with the rounded ARR.
const deck: DocxBlock[] = [
  {kind: "heading", text: `${company.tradeName}: gestão de frotas como software`},
  {kind: "paragraph", text: `${company.legalName}, CNPJ ${company.cnpj}, fundada em ${company.foundedYear} em ${company.city}/${company.state}. ${company.employees} pessoas. Plataforma SaaS de gestão de frotas e telemetria para transportadoras, cooperativas e operadores logísticos.`},
  {kind: "heading", text: "Tração"},
  {kind: "paragraph", text: `ARR de R$ 40 milhões em julho de 2026, 40 clientes corporativos, receita recorrente com contratos anuais. Receita de ${mm(historical[1].revenue)} em 2025 (+${Math.round((historical[1].revenue / historical[0].revenue - 1) * 100)}% sobre 2024). Retenção líquida de receita de ${pct(metrics.nrr, 0)}.`},
  {kind: "heading", text: "Time e governança"},
  {kind: "table", rows: [["Nome", "Cargo", "Desde"], ...company.management.map((m) => [m.name, m.role, String(m.since)])]},
  {kind: "heading", text: "Investidores"},
  {kind: "paragraph", text: `${company.lastRound.series} de ${mm(company.lastRound.amount)} liderada por ${company.lastRound.lead} em ${company.lastRound.date.split("-").reverse().join("/")}, valuation post-money de ${mm(company.lastRound.postMoney)}. Seed por Aurora Ventures II.`},
  {kind: "table", rows: [["Acionista", "Participação", "Papel"], ...company.capTable.map((p) => [p.name, pct(p.share, 0), p.role])]},
];

// 01 The ask, with the optimistic runway.
const carta: DocxBlock[] = [
  {kind: "heading", text: "Pedido de venture debt"},
  {kind: "paragraph", text: "São Paulo, 14 de agosto de 2026."},
  {kind: "paragraph", text: `A ${company.tradeName} busca ${mm(request.amount)} em venture debt, prazo de ${request.termMonths} meses com ${request.graceMonths} meses de carência de principal, a um custo na ordem de ${request.expectedRate}.`},
  {kind: "paragraph", text: `${request.purpose} Com o caixa atual de ${mm(interim2026.cash)} temos 16 meses de runway; com a operação, chegamos à Série B com folga e sem depender do momento de mercado.`},
  {kind: "heading", text: "Destinação dos recursos"},
  {kind: "table", rows: [["Destinação", "Valor (R$)"], ...request.useOfProceeds.map((u) => [u.item, brl(u.amount)])]},
  {kind: "heading", text: "Endividamento atual"},
  {kind: "table", rows: [["Credor", "Modalidade", "Saldo (R$)", "Custo", "Vencimento", "Amortização", "Garantia"], ...debt.map((d) => [d.lender, d.instrument, brl(d.outstanding), d.rate, d.maturity, d.amortization, d.collateral])]},
  {kind: "paragraph", text: "Paula Nakamura, Diretora financeira."},
];

// 02 MRR by customer: the file that decides the case.
const header = ["Cliente", ...months];
const mrrRows: (string | number)[][] = [
  ["MRR por cliente, agosto de 2024 a julho de 2026, valores em reais"],
  [],
  header,
  ...mrrByCustomer.map((customer) => [customer.name, ...customer.series]),
  [],
  ["Total MRR", ...mrrTotals],
  ["ARR (MRR x 12)", ...mrrTotals.map((value) => value * 12)],
];
const resumoRows: (string | number)[][] = [
  ["Resumo de métricas, julho de 2026"],
  [],
  ["Métrica", "Valor"],
  ["MRR (R$)", metrics.mrr],
  ["ARR (R$)", metrics.arr],
  ["Retenção líquida de receita (NRR, 12 meses)", metrics.nrr],
  ["Churn mensal de logos", metrics.monthlyLogoChurn],
  ["Clientes ativos", mrrByCustomer.filter((c) => c.series[23]! > 0).length],
  ["Queima líquida média, mai-jul/2026 (R$/mês)", interim2026.monthlyBurn],
  [],
  ["Cinco maiores clientes", "MRR (R$)", "% do MRR"],
  ...metrics.topCustomers.map((c) => [c.name, c.mrr, c.share]),
];

// 03 Cap table.
const capRows: (string | number)[][] = [
  [`Cap table, ${company.legalName}, pós ${company.lastRound.series}`],
  [],
  ["Acionista", "Participação", "Papel", "Classe"],
  ...company.capTable.map((p) => [p.name, p.share, p.role, p.name.includes("FIP") ? "Preferencial" : "Ordinária"]),
  [],
  ["Última rodada", company.lastRound.series],
  ["Valor (R$)", company.lastRound.amount],
  ["Data", company.lastRound.date],
  ["Investidor líder", company.lastRound.lead],
  ["Valuation post-money (R$)", company.lastRound.postMoney],
  ["Liquidação preferencial", "1x não participativa"],
];

// 04 Management accounts, two years and seven months.
const gerencialRows: (string | number)[][] = [
  [`${company.legalName}, demonstrativo gerencial, valores em reais`],
  ["Auditoria de 2025 em andamento; números não auditados."],
  [],
  ["Conta", "2024", "2025", "jan-jul/2026"],
  ["Receita líquida", historical[0].revenue, historical[1].revenue, interim2026.revenue],
  ["Custo dos serviços (hospedagem e suporte)", -historical[0].cogs, -historical[1].cogs, -interim2026.cogs],
  ["Lucro bruto", historical[0].grossProfit, historical[1].grossProfit, interim2026.revenue - interim2026.cogs],
  ["Despesas operacionais", -historical[0].opex, -historical[1].opex, -(interim2026.revenue - interim2026.cogs - interim2026.ebitda)],
  ["EBITDA", historical[0].ebitda, historical[1].ebitda, interim2026.ebitda],
  ["Resultado líquido", historical[0].netIncome, historical[1].netIncome, interim2026.netIncome],
  [],
  ["Caixa e aplicações (fim do período)", historical[0].cash, historical[1].cash, interim2026.cash],
  ["Contas a receber", 2_100_000, 3_700_000, interim2026.receivables],
  ["Dívida bruta", 3_800_000, 3_500_000, interim2026.grossDebt],
];

// 05 Bank statement: end balance and three months of burn, as a CSV.
const statement: string[] = ["data;descricao;valor;saldo"];
let balance = 29_650_000;
const days = ["2026-05-05", "2026-05-20", "2026-05-31", "2026-06-05", "2026-06-20", "2026-06-30", "2026-07-05", "2026-07-20", "2026-07-31"];
const flows = [-1_420_000, -1_180_000, 1_010_000, -1_560_000, -1_240_000, 1_030_000, -1_600_000, -1_330_000, 1_040_000 - 300_000];
days.forEach((day, index) => {
  balance += flows[index]!;
  statement.push(`${day};${flows[index]! < 0 ? "Folha, fornecedores e infraestrutura" : "Recebimentos de clientes"};${flows[index]};${balance}`);
});
if (balance !== interim2026.cash) throw new Error(`extrato fecha em ${balance}, a verdade diz ${interim2026.cash}`);

const docs = async () => {
  emit("00_Deck_Institucional_Nimbus.docx", await writeDocx(deck));
  emit("01_Carta_Pedido_Venture_Debt.docx", await writeDocx(carta));
  emit("02_Metricas_MRR_por_Cliente_2024_2026.xlsx", sheet([{name: "MRR por cliente", rows: mrrRows}, {name: "Resumo", rows: resumoRows}]));
  emit("03_Cap_Table_Serie_A.xlsx", sheet([{name: "Cap table", rows: capRows}]));
  emit("04_Gerencial_2024_2025_Jul2026.xlsx", sheet([{name: "Gerencial", rows: gerencialRows}]));
  emit("05_Extrato_Bancario_Mai_Jul2026.csv", new TextEncoder().encode(statement.join("\n") + "\n"));
  writeFileSync(join(outDir, ".build.json"), `${JSON.stringify(written, null, 2)}\n`);
  for (const file of written) console.log(`${file.name.padEnd(44)} ${String(file.bytes).padStart(8)} bytes`);
};
await docs();
