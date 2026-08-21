/**
 * The answer key for Aurora Distribuidora, derived from the same truth as the documents.
 *
 * Deriving it rather than writing it is the whole point. An answer key typed by hand drifts
 * from the files it grades the moment either changes, and the drift is invisible: the
 * measurement simply reports a lower number and everyone assumes the extractor got worse.
 *
 * It covers what the existing gold case does not. `rede-horizonte` has 79 expected fields and
 * **zero** in `debt` and `customers`, which means the debt schedule, the thing a credit desk
 * opens first, has never been measured once. It also agrees with itself everywhere, so
 * reconciliation has never been given a contradiction to find.
 *
 *   pnpm --filter @offroad/testing-fixtures fakeco:gold
 */
import {createHash} from "node:crypto";
import {mkdirSync, readFileSync, readdirSync, writeFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

import {
  balance2025, company, contradictions, customers, debt, fakecoVersion, historical,
  interim2026, leasingOffMap, missing, project, projections, request,
} from "../src/fakeco/truth";

const here = dirname(fileURLToPath(import.meta.url));
const assets = join(here, "..", "assets", "fakeco");
const goldDir = join(here, "..", "gold", "fakeco");
mkdirSync(join(goldDir, "expected"), {recursive: true});

const write = (relative: string, value: unknown) =>
  writeFileSync(join(goldDir, relative), `${JSON.stringify(value, null, 2)}\n`, "utf8");

const documents = readdirSync(assets)
  .filter((name) => !name.startsWith("."))
  .sort()
  .map((name) => ({
    name,
    sha256: createHash("sha256").update(readFileSync(join(assets, name))).digest("hex"),
  }));

write("manifest.json", {
  caseId: "fakeco",
  title: "Aurora Distribuidora de Materiais de Construção Ltda: capital de giro e quarto CD (sala de dados sintética)",
  synthetic: true,
  language: "pt",
  documentsDir: "../../assets/fakeco",
  documents,
  provenance:
    "Gerada por packages/testing-fixtures/scripts/build-fakeco.ts a partir de src/fakeco/truth.ts, " +
    "e este gabarito por build-fakeco-gold.ts a partir da mesma fonte. Nenhum número descreve empresa real. " +
    "O gerador vive no repositório de propósito: o do rede-horizonte não vive, e AGENTS.md §9 registra o custo disso.",
  version: fakecoVersion,
});

// ---------------------------------------------------------------------------------------------
// What each document is. The scale on the audited file is the one that matters: it is printed in
// thousands and everything downstream is wrong by a factor of a thousand if that is missed.
// ---------------------------------------------------------------------------------------------
write("expected/profiles.json", [
  {document: "00_Ficha_Cadastral_Aurora.docx", kind: "company_registration", informationClass: "company_document", evidenceRank: 7, entityName: company.legalName},
  {document: "01_Carta_CFO_Pedido_e_Racional.docx", kind: "capital_request_letter", informationClass: "company_document", evidenceRank: 7, entityName: company.legalName},
  {document: "02_Demonstracoes_Auditadas_2023_2025.pdf", kind: "audited_financial_statements", informationClass: "audited", evidenceRank: 1, entityName: company.legalName, periodStart: "2023-01-01", periodEnd: "2025-12-31", scale: 1000},
  {document: "03_Balancete_Gerencial_Jul2026.xls", kind: "trial_balance", informationClass: "accounting", evidenceRank: 3, entityName: company.legalName, periodStart: "2026-01-01", periodEnd: "2026-07-31"},
  {document: "04_Mapa_Divida_Jul2026.xlsx", kind: "debt_schedule", informationClass: "management", evidenceRank: 5, entityName: company.legalName, periodEnd: "2026-07-31"},
  {document: "05_Concentracao_Clientes_2025.xlsx", kind: "management_accounts", informationClass: "management", evidenceRank: 5, entityName: company.legalName, periodStart: "2025-01-01", periodEnd: "2025-12-31"},
  {document: "06_Memorial_CD_Jacarei.pdf", kind: "project_memorandum", informationClass: "company_document", evidenceRank: 7, entityName: company.legalName},
  {document: "07_Contrato_Social_Consolidado.png", kind: "corporate_docs", informationClass: "company_document", evidenceRank: 7, entityName: company.legalName},
  {document: "08_Projecoes_2026_2030.xlsx", kind: "financial_model", informationClass: "projection", evidenceRank: 6, entityName: company.legalName, periodStart: "2026-01-01", periodEnd: "2030-12-31"},
]);

// ---------------------------------------------------------------------------------------------
// The facts.
// ---------------------------------------------------------------------------------------------
/**
 * `materiality` is binary in the ontology: a fact is material or it is supporting. That is a
 * sharper question than a four-level scale, and it is the one the accuracy gate reads, so the
 * generator answers it directly instead of inventing a middle.
 */
type Field = {
  fieldPath: string; value: string; valueType: "text" | "number" | "date" | "boolean" | "list";
  materiality: "material" | "supporting"; sourceDocument?: string;
  periodStart?: string; periodEnd?: string; tolerance?: {kind: "exact"} | {kind: "relative"; value: string};
  note?: string;
};

const near = {kind: "relative" as const, value: "0.005"};
const fields: Field[] = [];
const add = (field: Field) => fields.push(field);

const DFS = "02_Demonstracoes_Auditadas_2023_2025.pdf";
const BAL = "03_Balancete_Gerencial_Jul2026.xls";
const DIV = "04_Mapa_Divida_Jul2026.xlsx";
const CLI = "05_Concentracao_Clientes_2025.xlsx";
const CAR = "01_Carta_CFO_Pedido_e_Racional.docx";
const FIC = "00_Ficha_Cadastral_Aurora.docx";
const MEM = "06_Memorial_CD_Jacarei.pdf";
const CTR = "07_Contrato_Social_Consolidado.png";
const PRJ = "08_Projecoes_2026_2030.xlsx";

// Company
add({fieldPath: "company.legal_name", value: company.legalName, valueType: "text", materiality: "material", sourceDocument: FIC});
add({fieldPath: "company.tax_id", value: company.cnpj, valueType: "text", materiality: "material", sourceDocument: FIC});
add({fieldPath: "company.legal_form", value: "ltda", valueType: "text", materiality: "material", sourceDocument: CTR, note: "Só o contrato social, que chega como foto, afirma a forma societária. Ela bloqueia metade do catálogo de instrumentos."});
add({fieldPath: "company.founded_year", value: String(company.foundedYear), valueType: "number", materiality: "supporting", sourceDocument: FIC});
add({fieldPath: "company.city", value: company.city, valueType: "text", materiality: "supporting", sourceDocument: FIC});
add({fieldPath: "company.state", value: company.state, valueType: "text", materiality: "supporting", sourceDocument: FIC});
add({fieldPath: "company.sector", value: company.sector, valueType: "text", materiality: "material", sourceDocument: FIC});
add({fieldPath: "company.employees", value: String(company.employees), valueType: "number", materiality: "supporting", sourceDocument: FIC});
company.partners.forEach((partner, index) => {
  add({fieldPath: `company.shareholder.${index + 1}.name`, value: partner.name, valueType: "text", materiality: "supporting", sourceDocument: FIC});
  add({fieldPath: `company.shareholder.${index + 1}.share`, value: partner.share.toFixed(4), valueType: "number", materiality: "supporting", sourceDocument: FIC, tolerance: near});
});
add({fieldPath: "company.share_capital", value: "12000000", valueType: "number", materiality: "supporting", sourceDocument: CTR});

// Historical, audited. Printed in thousands: the expected value is in reais, which is the
// whole test.
for (const year of historical) {
  const period = {periodStart: `${year.year}-01-01`, periodEnd: `${year.year}-12-31`};
  add({fieldPath: `historical_financials.revenue.${year.year}`, value: String(year.revenue), valueType: "number", materiality: "material", sourceDocument: DFS, ...period, tolerance: near, note: year.year === 2025 ? "O documento imprime 191.200,00 em milhares. Ler 191200 é errar por mil." : undefined});
  add({fieldPath: `historical_financials.ebitda.${year.year}`, value: String(year.ebitda), valueType: "number", materiality: "material", sourceDocument: DFS, ...period, tolerance: near});
  add({fieldPath: `historical_financials.gross_profit.${year.year}`, value: String(year.grossProfit), valueType: "number", materiality: "material", sourceDocument: DFS, ...period, tolerance: near});
  add({fieldPath: `historical_financials.net_income.${year.year}`, value: String(year.netIncome), valueType: "number", materiality: "material", sourceDocument: DFS, ...period, tolerance: near});
}
add({fieldPath: "historical_financials.cash.2025", value: String(balance2025.cash), valueType: "number", materiality: "material", sourceDocument: DFS, periodEnd: "2025-12-31", tolerance: near});
add({fieldPath: "historical_financials.receivables.2025", value: String(balance2025.receivables), valueType: "number", materiality: "material", sourceDocument: DFS, periodEnd: "2025-12-31", tolerance: near});
add({fieldPath: "historical_financials.inventory.2025", value: String(balance2025.inventory), valueType: "number", materiality: "supporting", sourceDocument: DFS, periodEnd: "2025-12-31", tolerance: near});
add({fieldPath: "historical_financials.equity.2025", value: String(balance2025.equity), valueType: "number", materiality: "material", sourceDocument: DFS, periodEnd: "2025-12-31", tolerance: near});

// Interim, stated in units in a legacy .xls.
add({fieldPath: "interim_financials.revenue.2026_07", value: String(interim2026.revenue), valueType: "number", materiality: "material", sourceDocument: BAL, periodStart: "2026-01-01", periodEnd: interim2026.periodEnd, tolerance: near});
add({fieldPath: "interim_financials.ebitda.2026_07", value: String(interim2026.ebitda), valueType: "number", materiality: "material", sourceDocument: BAL, periodStart: "2026-01-01", periodEnd: interim2026.periodEnd, tolerance: near});
add({fieldPath: "interim_financials.net_income.2026_07", value: String(interim2026.netIncome), valueType: "number", materiality: "material", sourceDocument: BAL, periodEnd: interim2026.periodEnd, tolerance: near});
add({fieldPath: "interim_financials.receivables.2026_07", value: String(interim2026.receivables), valueType: "number", materiality: "material", sourceDocument: BAL, periodEnd: interim2026.periodEnd, tolerance: near});

// Debt: the group with no coverage anywhere until now.
debt.forEach((line, index) => {
  const n = index + 1;
  add({fieldPath: `debt.line.${n}.lender`, value: line.lender, valueType: "text", materiality: "material", sourceDocument: DIV});
  add({fieldPath: `debt.line.${n}.outstanding`, value: String(line.outstanding), valueType: "number", materiality: "material", sourceDocument: DIV, periodEnd: "2026-07-31", tolerance: near});
  add({fieldPath: `debt.line.${n}.rate`, value: line.rate, valueType: "text", materiality: "material", sourceDocument: DIV});
  add({fieldPath: `debt.line.${n}.maturity`, value: line.maturity, valueType: "date", materiality: "material", sourceDocument: DIV});
  add({fieldPath: `debt.line.${n}.collateral`, value: line.collateral, valueType: "text", materiality: "material", sourceDocument: DIV});
  if (line.covenant) add({fieldPath: `debt.line.${n}.covenant`, value: line.covenant, valueType: "text", materiality: "material", sourceDocument: DIV, note: "Um covenant é o que quebra uma operação antes de ela vencer."});
});
add({fieldPath: "debt.schedule_total", value: String(debt.reduce((sum, line) => sum + line.outstanding, 0)), valueType: "number", materiality: "material", sourceDocument: DIV, periodEnd: "2026-07-31", tolerance: near});
add({fieldPath: "debt.gross_on_balance", value: String(balance2025.grossDebtOnBalance), valueType: "number", materiality: "material", sourceDocument: DFS, periodEnd: "2025-12-31", tolerance: near, note: "Inclui o arrendamento que o mapa não lista."});
add({fieldPath: "debt.leasing", value: String(leasingOffMap), valueType: "number", materiality: "material", sourceDocument: DFS, periodEnd: "2025-12-31", tolerance: near});

// Customers: the other uncovered group.
customers.forEach((customer, index) => {
  const n = index + 1;
  add({fieldPath: `customers.top.${n}.name`, value: customer.name, valueType: "text", materiality: "material", sourceDocument: CLI});
  add({fieldPath: `customers.top.${n}.share`, value: customer.share.toFixed(4), valueType: "number", materiality: "material", sourceDocument: CLI, tolerance: near});
});
add({fieldPath: "customers.top5_share", value: customers.reduce((sum, c) => sum + c.share, 0).toFixed(4), valueType: "number", materiality: "material", sourceDocument: CLI, tolerance: near});

// The transaction. The amount is the contradiction with no precedence to settle it.
add({fieldPath: "transaction.requested_amount", value: String(request.amount), valueType: "number", materiality: "material", sourceDocument: MEM, tolerance: near, note: "A carta diz 40 milhões, o plano diz 42,3. Nenhuma fonte manda na outra: é pergunta para a empresa."});
add({fieldPath: "transaction.currency", value: request.currency, valueType: "text", materiality: "material", sourceDocument: CAR});
add({fieldPath: "transaction.term_months", value: String(request.termMonths), valueType: "number", materiality: "material", sourceDocument: CAR});
add({fieldPath: "transaction.grace_months", value: String(request.graceMonths), valueType: "number", materiality: "material", sourceDocument: CAR});
add({fieldPath: "transaction.expected_rate", value: request.expectedRate, valueType: "text", materiality: "material", sourceDocument: CAR});
add({fieldPath: "transaction.purpose", value: request.purpose, valueType: "text", materiality: "material", sourceDocument: CAR});
request.useOfProceeds.forEach((use, index) => {
  add({fieldPath: `transaction.use_of_proceeds.${index + 1}.amount`, value: String(use.amount), valueType: "number", materiality: "material", sourceDocument: CAR, tolerance: near});
});

// Project.
add({fieldPath: "project.name", value: project.name, valueType: "text", materiality: "material", sourceDocument: MEM});
add({fieldPath: "project.city", value: project.city, valueType: "text", materiality: "supporting", sourceDocument: MEM});
add({fieldPath: "project.capex", value: String(project.capex), valueType: "number", materiality: "material", sourceDocument: MEM, tolerance: near});
add({fieldPath: "project.built_area", value: String(project.builtArea), valueType: "number", materiality: "supporting", sourceDocument: MEM});
add({fieldPath: "project.operation_date", value: project.operationDate, valueType: "date", materiality: "material", sourceDocument: MEM});

// Projections.
for (const year of projections) {
  add({fieldPath: `projections.revenue.${year.year}`, value: String(year.revenue), valueType: "number", materiality: "supporting", sourceDocument: PRJ, periodEnd: `${year.year}-12-31`, tolerance: near});
  add({fieldPath: `projections.ebitda.${year.year}`, value: String(year.ebitda), valueType: "number", materiality: "supporting", sourceDocument: PRJ, periodEnd: `${year.year}-12-31`, tolerance: near});
}

write("expected/fields.json", fields);

// ---------------------------------------------------------------------------------------------
// What reconciliation has to find. This file is why the case exists.
// ---------------------------------------------------------------------------------------------
const exceptions = [
  ...contradictions.map((contradiction) => ({
    id: contradiction.id,
    type: "source_conflict",
    severity: contradiction.id === "requested-amount" ? "high" : "critical",
    description: contradiction.why,
    keywords:
      contradiction.id === "revenue-2025" ? ["receita", "191", "190", "193", "divergencia", "conflito"]
      : contradiction.id === "gross-debt" ? ["divida", "arrendamento", "leasing", "45.320", "38.500", "divergencia"]
      : ["valor solicitado", "40", "42,3", "42.300", "divergencia"],
    evidenceDocuments:
      contradiction.id === "revenue-2025" ? [DFS, CAR, PRJ]
      : contradiction.id === "gross-debt" ? [DFS, DIV]
      : [CAR, MEM],
    expectedTreatment: contradiction.resolution,
  })),
  ...missing.map((gap, index) => ({
    id: `missing-${index + 1}`,
    type: "missing",
    severity: index < 2 ? "high" : "medium",
    description: `${gap.what}. ${gap.why}.`,
    keywords: gap.what.toLowerCase().split(/\s+/).filter((word) => word.length > 4).slice(0, 4),
    evidenceDocuments: [],
    expectedTreatment: "ask_the_company",
  })),
  {
    id: "scale-trap",
    type: "quality",
    severity: "critical",
    description:
      "As demonstrações auditadas estão em milhares de reais e o balancete gerencial em reais. " +
      "Misturar as duas escalas erra por um fator de mil, e é o erro mais caro que este produto pode cometer.",
    keywords: ["milhares", "escala", "unidade", "mil"],
    evidenceDocuments: [DFS, BAL],
    expectedTreatment: "normalize_to_units",
  },
  {
    id: "customer-concentration",
    type: "plausibility",
    severity: "high",
    description: `O maior cliente responde por ${(customers[0].share * 100).toFixed(1)}% da receita, e os cinco maiores por ${(customers.reduce((s, c) => s + c.share, 0) * 100).toFixed(1)}%.`,
    keywords: ["concentracao", "cliente", "18,1", "vertical"],
    evidenceDocuments: [CLI],
    expectedTreatment: "flag_to_reviewer",
  },
];
write("expected/exceptions.json", exceptions);

// ---------------------------------------------------------------------------------------------
// Deterministic outputs, computed here rather than asserted from memory.
// ---------------------------------------------------------------------------------------------
const ebitda2025 = historical[2].ebitda;
const netDebt = balance2025.grossDebtOnBalance - balance2025.cash;
write("expected/calculations.json", [
  {id: "net_debt_2025", definition: "Dívida bruta do balanço menos caixa", value: String(netDebt), unit: "BRL", periodEnd: "2025-12-31", tolerance: {kind: "relative", value: "0.005"}},
  {id: "leverage_2025", definition: "Dívida líquida / EBITDA 2025", value: (netDebt / ebitda2025).toFixed(4), periodEnd: "2025-12-31", tolerance: {kind: "relative", value: "0.01"},
   note: "Contra o covenant mais apertado do mapa (3,0x), esta é a conta que decide se a operação cabe."},
  {id: "ebitda_margin_2025", definition: "EBITDA / receita líquida 2025", value: (ebitda2025 / historical[2].revenue).toFixed(4), periodEnd: "2025-12-31", tolerance: {kind: "relative", value: "0.01"}},
  {id: "revenue_cagr_2023_2025", definition: "CAGR da receita entre 2023 e 2025", value: (Math.pow(historical[2].revenue / historical[0].revenue, 1 / 2) - 1).toFixed(4), tolerance: {kind: "relative", value: "0.01"}},
  {id: "days_receivable_2025", definition: "Contas a receber / receita x 365", value: ((balance2025.receivables / historical[2].revenue) * 365).toFixed(1), unit: "dias", periodEnd: "2025-12-31", tolerance: {kind: "relative", value: "0.01"}},
]);

console.log(`gabarito da fakeco, ${fakecoVersion}`);
console.log(`  ${documents.length} documentos`);
console.log(`  ${fields.length} campos esperados`);
const byGroup = fields.reduce<Record<string, number>>((acc, field) => {
  const group = field.fieldPath.split(".")[0] ?? "?";
  acc[group] = (acc[group] ?? 0) + 1;
  return acc;
}, {});
for (const [group, count] of Object.entries(byGroup).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${group.padEnd(24)} ${count}`);
}
console.log(`  ${exceptions.length} excecoes esperadas (${contradictions.length} contradicoes, ${missing.length} faltas, 2 sinalizacoes)`);
