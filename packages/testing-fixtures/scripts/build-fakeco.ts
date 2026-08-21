/**
 * Builds the Aurora Distribuidora data room from one declared truth.
 *
 * Reproducible on purpose, and in the repository on purpose. The other synthetic case's
 * generator lives outside this repo, and AGENTS.md §9 already records what that costs: rerun it
 * and the content hashes move, silently, and the fixture match breaks with no diff to read. This
 * one is versioned next to what it produces, so regenerating is a reviewable change.
 *
 *   pnpm --filter @offroad/testing-fixtures fakeco
 *
 * PDF-bound documents are emitted as HTML here and rendered by `render-fakeco.sh`, because
 * nothing in this workspace writes a PDF and a browser already does it properly.
 */
import {mkdirSync, writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

import * as XLSX from "xlsx";

import {writeDocx, type DocxBlock} from "../src/fakeco/docx";
import {
  balance2025, company, customers, debt, fakecoVersion, historical, interim2026,
  leasingOffMap, missing, project, projections, request,
} from "../src/fakeco/truth";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "assets", "fakeco");
const htmlDir = join(here, "..", "assets", "fakeco", ".html");
mkdirSync(outDir, {recursive: true});
mkdirSync(htmlDir, {recursive: true});

const written: Array<{name: string; bytes: number; sha256: string}> = [];

const emit = (name: string, bytes: Uint8Array) => {
  writeFileSync(join(outDir, name), bytes);
  written.push({name, bytes: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex")});
};

const brl = (value: number) => value.toLocaleString("pt-BR", {minimumFractionDigits: 2, maximumFractionDigits: 2});
const pct = (value: number) => `${(value * 100).toLocaleString("pt-BR", {minimumFractionDigits: 1, maximumFractionDigits: 1})}%`;

// ---------------------------------------------------------------------------------------------
// 00 Ficha cadastral: who the company is. Qualitative, and the only place the CNPJ and the
// legal form appear, which is what decides half the instrument catalogue.
// ---------------------------------------------------------------------------------------------
const ficha: DocxBlock[] = [
  {kind: "heading", text: "Ficha cadastral"},
  {kind: "paragraph", text: `${company.legalName} ("${company.tradeName}"), inscrita no CNPJ sob o nº ${company.cnpj}, sociedade empresária limitada constituída em ${company.foundedYear}.`},
  {kind: "paragraph", text: `Sede em ${company.city}/${company.state}. A companhia opera ${company.branches} unidades e emprega ${company.employees} colaboradores.`},
  {kind: "paragraph", text: `Atividade: ${company.sector}.`},
  {kind: "heading", text: "Quadro societário"},
  {kind: "table", rows: [["Sócio", "Participação", "Função"], ...company.partners.map((p) => [p.name, pct(p.share), p.role])]},
  {kind: "heading", text: "Administração"},
  {kind: "table", rows: [["Nome", "Cargo", "Desde"], ...company.management.map((m) => [m.name, m.role, String(m.since)])]},
];

// ---------------------------------------------------------------------------------------------
// 01 Carta do CFO: the qualitative ask. Rounds the amount and the revenue, which is where two
// of the three contradictions enter the room.
// ---------------------------------------------------------------------------------------------
const carta: DocxBlock[] = [
  {kind: "heading", text: "Carta da diretoria financeira"},
  {kind: "paragraph", text: `São José dos Campos, 12 de agosto de 2026.`},
  {kind: "paragraph", text: `Prezados, a Aurora Materiais encerrou 2025 com receita líquida de aproximadamente R$ 190 milhões, crescimento de cerca de 13% sobre 2024, sustentado pela retomada da construção residencial no Vale do Paraíba e pela ampliação da carteira de clientes corporativos.`},
  {kind: "paragraph", text: `Buscamos captação de R$ 40 milhões, em 48 meses, com 6 meses de carência, a um custo que entendemos compatível com o nosso perfil, na ordem de CDI mais 4% ao ano.`},
  {kind: "heading", text: "Racional da operação"},
  {kind: "paragraph", text: `O ciclo de caixa alongou com o crescimento: o prazo médio de recebimento subiu de 54 para 68 dias entre 2023 e 2025, enquanto o prazo de fornecedores permaneceu em 41 dias. O capital de giro passou a ser financiado por linhas curtas e caras, e três delas vencem em 2027.`},
  {kind: "paragraph", text: `Paralelamente, a operação atingiu o limite físico do centro de distribuição de São José dos Campos. O quarto centro, em Jacareí, é condição para atender a demanda contratada da região de Campinas.`},
  {kind: "heading", text: "Destinação dos recursos"},
  {kind: "table", rows: [["Destinação", "Valor (R$)"], ...request.useOfProceeds.map((u) => [u.item, brl(u.amount)])]},
  {kind: "paragraph", text: `Permanecemos à disposição para esclarecimentos e para o envio de qualquer documento adicional.`},
  {kind: "paragraph", text: `Marcos Tanaka, Diretor financeiro.`},
];

// ---------------------------------------------------------------------------------------------
// 03 Balancete de julho: legacy .xls, and stated in units while the audited file is in
// thousands. The scale trap is the single most expensive mistake this product can make.
// ---------------------------------------------------------------------------------------------
const balanceteRows: (string | number)[][] = [
  ["Aurora Distribuidora de Materiais de Construção Ltda"],
  ["Balancete gerencial consolidado"],
  ["Período: 01/01/2026 a 31/07/2026"],
  ["Valores em reais"],
  [],
  ["Conta", "Saldo (R$)"],
  ["Receita líquida de vendas", interim2026.revenue],
  ["Custo das mercadorias vendidas", -91_230_000],
  ["Lucro bruto", 30_410_000],
  ["Despesas comerciais e administrativas", -19_440_000],
  ["EBITDA", interim2026.ebitda],
  ["Resultado financeiro líquido", -6_140_000],
  ["Lucro líquido do período", interim2026.netIncome],
  [],
  ["Caixa e equivalentes", interim2026.cash],
  ["Contas a receber de clientes", interim2026.receivables],
  ["Estoques", 42_180_000],
];

// ---------------------------------------------------------------------------------------------
// 04 Mapa de dívida: the field group the existing gold case has zero coverage of, and the one a
// credit desk opens first. It omits the leasing that the balance sheet recognises.
// ---------------------------------------------------------------------------------------------
const dividaRows: (string | number)[][] = [
  ["Mapa de dívida bancária"],
  ["Posição em 31/07/2026, valores em reais"],
  [],
  ["Credor", "Modalidade", "Saldo devedor (R$)", "Custo", "Vencimento", "Amortização", "Garantia", "Covenant"],
  ...debt.map((d) => [d.lender, d.instrument, d.outstanding, d.rate, d.maturity, d.amortization, d.collateral, d.covenant ?? "Não aplicável"]),
  [],
  ["Total", "", debt.reduce((sum, d) => sum + d.outstanding, 0), "", "", "", "", ""],
];

// ---------------------------------------------------------------------------------------------
// 05 Concentração de clientes: the other uncovered group. Concentration is a rating driver and
// it is nowhere in the only case the extractor has ever been measured on.
// ---------------------------------------------------------------------------------------------
const clientesRows: (string | number)[][] = [
  ["Concentração de clientes, exercício de 2025"],
  ["Valores em reais"],
  [],
  ["Cliente", "Receita 2025 (R$)", "% da receita", "Cliente desde", "Prazo médio"],
  ...customers.map((c) => [c.name, c.revenue, c.share, String(c.sinceYear), c.terms]),
  [],
  ["Cinco maiores", customers.reduce((s, c) => s + c.revenue, 0), customers.reduce((s, c) => s + c.share, 0), "", ""],
];

// ---------------------------------------------------------------------------------------------
// 08 Projeções: the base year disagrees with the audited statements, which is the third
// contradiction and the most common one in a real room (the model was built before the audit
// closed and nobody went back).
// ---------------------------------------------------------------------------------------------
const projecoesRows: (string | number)[][] = [
  ["Projeções 2026 a 2030"],
  ["Valores em reais. Base 2025 preliminar, anterior ao fechamento auditado."],
  [],
  ["Ano", "Receita líquida (R$)", "EBITDA (R$)", "Margem EBITDA"],
  ["2025 (base)", 193_500_000, 17_020_000, 0.0880],
  ...projections.map((p) => [String(p.year), p.revenue, p.ebitda, p.ebitda / p.revenue]),
  [],
  ["Premissas"],
  ["Crescimento de receita 2026", 0.0774],
  ["Ganho de margem com o CD de Jacareí (p.p.)", 0.006],
  ["Prazo médio de recebimento (dias)", 62],
  ["Investimento total no CD (R$)", project.capex],
];

const sheet = (rows: (string | number)[][], name: string, bookType: XLSX.BookType) => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), name);
  return new Uint8Array(XLSX.write(book, {type: "array", bookType}));
};

// ---------------------------------------------------------------------------------------------
// The two PDFs are written as HTML and rendered by the shell step.
// ---------------------------------------------------------------------------------------------
const page = (title: string, body: string) => `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>${title}</title><style>
  @page { size: A4; margin: 22mm 18mm; }
  body { font: 10.5pt/1.5 "Times New Roman", Georgia, serif; color: #111; }
  h1 { font-size: 15pt; margin: 0 0 2pt; }
  h2 { font-size: 11.5pt; margin: 18pt 0 6pt; border-bottom: 0.5pt solid #999; padding-bottom: 2pt; }
  .sub { color: #444; font-size: 9.5pt; margin: 0 0 16pt; }
  table { width: 100%; border-collapse: collapse; margin: 8pt 0 14pt; font-size: 9.5pt; }
  th, td { border-bottom: 0.5pt solid #ccc; padding: 4pt 6pt; text-align: left; }
  td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; }
  .note { font-size: 9pt; color: #444; margin-top: 14pt; }
</style></head><body>${body}</body></html>`;

// 02 Demonstrações auditadas, printed in thousands. The header says so once, in words, exactly
// as a real statement does, and everything downstream depends on reading that one line.
const dfsHtml = page(
  "Demonstrações financeiras auditadas",
  `<h1>${company.legalName}</h1>
  <p class="sub">Demonstrações financeiras dos exercícios findos em 31 de dezembro de 2023, 2024 e 2025<br>
  Auditadas por Marcondes &amp; Auditores Independentes S/S. Parecer sem ressalvas emitido em 18 de março de 2026.</p>
  <h2>Demonstração do resultado</h2>
  <p class="sub">Em milhares de reais</p>
  <table><thead><tr><th>Conta</th><th class="n">2023</th><th class="n">2024</th><th class="n">2025</th></tr></thead><tbody>
  ${[
    ["Receita líquida de vendas", ...historical.map((h) => h.revenue)],
    ["Custo das mercadorias vendidas", ...historical.map((h) => -h.cogs)],
    ["Lucro bruto", ...historical.map((h) => h.grossProfit)],
    ["Despesas comerciais e administrativas", ...historical.map((h) => -h.sga)],
    ["EBITDA", ...historical.map((h) => h.ebitda)],
    ["Depreciação e amortização", ...historical.map((h) => -h.depreciation)],
    ["Resultado financeiro líquido", ...historical.map((h) => -h.financialExpenses)],
    ["Lucro líquido do exercício", ...historical.map((h) => h.netIncome)],
  ].map(([label, ...values]) =>
      `<tr><td>${label}</td>${(values as number[]).map((v) => `<td class="n">${brl(v / 1000)}</td>`).join("")}</tr>`).join("")}
  </tbody></table>
  <h2>Balanço patrimonial em 31 de dezembro de 2025</h2>
  <p class="sub">Em milhares de reais</p>
  <table><tbody>
  ${[
    ["Caixa e equivalentes de caixa", balance2025.cash],
    ["Contas a receber de clientes", balance2025.receivables],
    ["Estoques", balance2025.inventory],
    ["Imobilizado líquido", balance2025.fixedAssets],
    ["Total do ativo", balance2025.totalAssets],
    ["Fornecedores", balance2025.suppliers],
    ["Empréstimos e financiamentos, circulante", balance2025.shortTermDebt],
    ["Empréstimos e financiamentos, não circulante", balance2025.longTermDebt],
    ["Patrimônio líquido", balance2025.equity],
  ].map(([label, value]) => `<tr><td>${label}</td><td class="n">${brl((value as number) / 1000)}</td></tr>`).join("")}
  </tbody></table>
  <p class="note">Nota 14, Empréstimos e financiamentos: o saldo consolidado de empréstimos, financiamentos e
  arrendamentos mercantis em 31 de dezembro de 2025 totaliza R$ ${brl(balance2025.grossDebtOnBalance / 1000)} mil,
  dos quais R$ ${brl(leasingOffMap / 1000)} mil referem-se a arrendamentos mercantis reconhecidos conforme o CPC 06 (R2).</p>`,
);

// 06 Memorial do projeto: qualitative, and the place the missing licence is visible as a
// protocol number rather than a licence.
const memorialHtml = page(
  "Memorial descritivo do centro de distribuição",
  `<h1>Centro de Distribuição Jacareí</h1>
  <p class="sub">Memorial descritivo, agosto de 2026</p>
  <h2>Objeto</h2>
  <p>Implantação de centro de distribuição em ${project.city}/${project.state}, com terreno de ${project.landArea.toLocaleString("pt-BR")} m²
  e área construída projetada de ${project.builtArea.toLocaleString("pt-BR")} m², destinado ao atendimento das regiões de Campinas e do Alto Tietê.</p>
  <h2>Cronograma</h2>
  <table><tbody>
  <tr><td>Início da obra</td><td class="n">${project.startDate}</td></tr>
  <tr><td>Entrada em operação</td><td class="n">${project.operationDate}</td></tr>
  </tbody></table>
  <h2>Investimento</h2>
  <table><thead><tr><th>Item</th><th class="n">Valor (R$)</th></tr></thead><tbody>
  ${request.useOfProceeds.slice(1).map((u) => `<tr><td>${u.item}</td><td class="n">${brl(u.amount)}</td></tr>`).join("")}
  <tr><td><strong>Investimento total do projeto</strong></td><td class="n"><strong>${brl(project.capex)}</strong></td></tr>
  </tbody></table>
  <h2>Retorno esperado</h2>
  <p>A companhia estima receita incremental de R$ ${brl(project.expectedRevenueUplift)} no terceiro ano completo de operação,
  com margem EBITDA 0,6 ponto percentual acima da margem consolidada atual.</p>
  <h2>Licenciamento</h2>
  <p>O licenciamento ambiental encontra-se em análise na CETESB sob o protocolo nº 2026/114.882-7, protocolado em 03 de julho de 2026.
  A licença prévia ainda não foi emitida.</p>`,
);

// 07 Contrato social: rendered as a photograph of a page, which is how this document actually
// arrives. It is the OCR path, and it is the only place the legal form is stated in a scan.
const contratoHtml = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><style>
  body { margin: 0; background: #6b6b63; width: 860px; padding: 22px 0 30px; }
  .paper { width: 760px; margin: 0 auto; background: #fdfcf5; padding: 54px 60px;
           font: 12.5pt/1.85 "Times New Roman", Georgia, serif; color: #1b1b1b;
           box-shadow: 0 10px 26px rgba(0,0,0,.45); transform: rotate(-0.7deg); }
  h1 { text-align: center; font-size: 13.5pt; letter-spacing: .06em; margin: 0 0 26px; }
  p { margin: 0 0 13px; text-align: justify; }
  .sig { margin-top: 44px; border-top: 1px solid #333; width: 300px; padding-top: 5px; font-size: 10.5pt; }
</style></head><body><div class="paper">
  <h1>CONTRATO SOCIAL CONSOLIDADO</h1>
  <p><strong>CLÁUSULA PRIMEIRA.</strong> A sociedade gira sob a denominação de ${company.legalName},
  constituída sob a forma de <strong>sociedade empresária limitada</strong>, inscrita no CNPJ/MF sob o nº ${company.cnpj}.</p>
  <p><strong>CLÁUSULA SEGUNDA.</strong> A sociedade tem sede e foro na cidade de ${company.city}, Estado de ${company.state},
  podendo abrir filiais em qualquer parte do território nacional.</p>
  <p><strong>CLÁUSULA TERCEIRA.</strong> O objeto social é o comércio atacadista e varejista de materiais de construção,
  ferragens, ferramentas e produtos correlatos, bem como a prestação de serviços de logística e entrega.</p>
  <p><strong>CLÁUSULA QUARTA.</strong> O capital social é de R$ 12.000.000,00 (doze milhões de reais), dividido em
  12.000.000 (doze milhões) de quotas no valor nominal de R$ 1,00 cada, totalmente subscritas e integralizadas,
  distribuídas entre os sócios na proporção de ${company.partners.map((p) => `${pct(p.share)} a ${p.name}`).join(", ")}.</p>
  <p><strong>CLÁUSULA QUINTA.</strong> A administração da sociedade cabe à sócia ${company.partners[0].name},
  a quem compete a representação ativa e passiva, judicial e extrajudicial.</p>
  <div class="sig">${company.partners[0].name}<br>Sócia administradora</div>
</div></body></html>`;

// ---------------------------------------------------------------------------------------------

const main = async () => {
  emit("00_Ficha_Cadastral_Aurora.docx", await writeDocx(ficha));
  emit("01_Carta_CFO_Pedido_e_Racional.docx", await writeDocx(carta));
  emit("03_Balancete_Gerencial_Jul2026.xls", sheet(balanceteRows, "Balancete", "xls"));
  emit("04_Mapa_Divida_Jul2026.xlsx", sheet(dividaRows, "Dívida", "xlsx"));
  emit("05_Concentracao_Clientes_2025.xlsx", sheet(clientesRows, "Clientes", "xlsx"));
  emit("08_Projecoes_2026_2030.xlsx", sheet(projecoesRows, "Projeções", "xlsx"));

  writeFileSync(join(htmlDir, "02_Demonstracoes_Auditadas_2023_2025.html"), dfsHtml, "utf8");
  writeFileSync(join(htmlDir, "06_Memorial_CD_Jacarei.html"), memorialHtml, "utf8");
  writeFileSync(join(htmlDir, "07_Contrato_Social_Consolidado.html"), contratoHtml, "utf8");

  const summary = {
    version: fakecoVersion,
    company: company.legalName,
    synthetic: true,
    generatedFrom: "packages/testing-fixtures/src/fakeco/truth.ts",
    files: written,
    pendingRender: [
      {html: "02_Demonstracoes_Auditadas_2023_2025.html", as: "02_Demonstracoes_Auditadas_2023_2025.pdf"},
      {html: "06_Memorial_CD_Jacarei.html", as: "06_Memorial_CD_Jacarei.pdf"},
      {html: "07_Contrato_Social_Consolidado.html", as: "07_Contrato_Social_Consolidado.png"},
    ],
    missingOnPurpose: missing,
  };
  writeFileSync(join(outDir, ".build.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  console.log(`Aurora Distribuidora, ${fakecoVersion}`);
  for (const file of written) console.log(`  ${file.name.padEnd(44)} ${String(file.bytes).padStart(7)} bytes`);
  console.log(`  ${summary.pendingRender.length} documentos aguardando renderização (render-fakeco.sh)`);
};

await main();
