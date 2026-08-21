/**
 * The answer key for Nimbus, derived from the same truth as the documents.
 *
 *   pnpm --filter @offroad/evals nimbus:gold
 */
import {createHash} from "node:crypto";
import {mkdirSync, readFileSync, readdirSync, writeFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

import {resolveFieldPath} from "@offroad/credit-ontology";
import {nimbus} from "@offroad/testing-fixtures";

const {company, contradictions, debt, historical, interim2026, metrics, missing, nimbusVersion, request} = nimbus;

const here = dirname(fileURLToPath(import.meta.url));
const assets = join(here, "..", "..", "testing-fixtures", "assets", "nimbus");
const goldDir = join(here, "..", "..", "testing-fixtures", "gold", "nimbus");
mkdirSync(join(goldDir, "expected"), {recursive: true});
const write = (relative: string, value: unknown) => writeFileSync(join(goldDir, relative), `${JSON.stringify(value, null, 2)}\n`, "utf8");

const documents = readdirSync(assets).filter((name) => !name.startsWith(".")).sort()
  .map((name) => ({name, sha256: createHash("sha256").update(readFileSync(join(assets, name))).digest("hex")}));

write("manifest.json", {
  caseId: "nimbus",
  title: "Nimbus Tecnologia em Gestão de Frotas S.A.: venture debt de R$ 15 milhões para chegar à Série B (sala de dados sintética)",
  synthetic: true,
  archetypeId: "venture_debt",
  language: "pt",
  documentsDir: "../../assets/nimbus",
  documents,
  provenance: "Gerada por packages/testing-fixtures/scripts/build-nimbus.ts a partir de src/nimbus/truth.ts, e este gabarito por build-nimbus-gold.ts a partir da mesma fonte. Nenhum número descreve empresa real.",
  version: nimbusVersion,
});

const DECK = "00_Deck_Institucional_Nimbus.docx";
const CAR = "01_Carta_Pedido_Venture_Debt.docx";
const MET = "02_Metricas_MRR_por_Cliente_2024_2026.xlsx";
const CAP = "03_Cap_Table_Serie_A.xlsx";
const GER = "04_Gerencial_2024_2025_Jul2026.xlsx";
const EXT = "05_Extrato_Bancario_Mai_Jul2026.csv";

write("expected/profiles.json", [
  {document: DECK, kind: "investor_deck", informationClass: "management", evidenceRank: 5, entityName: company.legalName},
  {document: CAR, kind: "capital_request_letter", informationClass: "company_document", evidenceRank: 7, entityName: company.legalName},
  {document: MET, kind: "metrics_report", informationClass: "management", evidenceRank: 5, entityName: company.legalName, periodStart: "2024-08-01", periodEnd: "2026-07-31"},
  {document: CAP, kind: "cap_table", informationClass: "company_document", evidenceRank: 7, entityName: company.legalName},
  {document: GER, kind: "management_accounts", informationClass: "management", evidenceRank: 5, entityName: company.legalName, periodStart: "2024-01-01", periodEnd: "2026-07-31"},
  {document: EXT, kind: "bank_statements", informationClass: "bank_statement", evidenceRank: 4, entityName: company.legalName, periodStart: "2026-05-01", periodEnd: "2026-07-31"},
]);

type Field = {
  fieldPath: string; value: string; valueType: "text" | "number" | "date" | "boolean" | "list";
  materiality: "material" | "supporting"; sourceDocument?: string;
  periodStart?: string; periodEnd?: string; tolerance?: {kind: "exact"} | {kind: "relative"; value: string}; note?: string;
};
const near = {kind: "relative" as const, value: "0.005"};
const fields: Field[] = [];
const unknown: string[] = [];
const add = (field: Field) => { if (!resolveFieldPath(field.fieldPath)) unknown.push(field.fieldPath); fields.push(field); };

add({fieldPath: "company.legal_name", value: company.legalName, valueType: "text", materiality: "material", sourceDocument: DECK});
add({fieldPath: "company.legal_identifier", value: company.cnpj.replace(/\D/g, ""), valueType: "text", materiality: "material", sourceDocument: DECK});
add({fieldPath: "company.city", value: company.city, valueType: "text", materiality: "supporting", sourceDocument: DECK});
add({fieldPath: "company.state", value: company.state, valueType: "text", materiality: "supporting", sourceDocument: DECK});
add({fieldPath: "company.sector", value: company.sector, valueType: "text", materiality: "supporting", sourceDocument: DECK});
add({fieldPath: "company.founded_year", value: String(company.foundedYear), valueType: "number", materiality: "supporting", sourceDocument: DECK});
add({fieldPath: "company.employees", value: String(company.employees), valueType: "number", materiality: "supporting", sourceDocument: DECK});
company.capTable.forEach((holder, index) => {
  add({fieldPath: `company.controllers.${index + 1}.name`, value: holder.name, valueType: "text", materiality: "material", sourceDocument: CAP});
  add({fieldPath: `company.controllers.${index + 1}.ownership_pct`, value: holder.share.toFixed(4), valueType: "number", materiality: "material", sourceDocument: CAP, tolerance: near});
});
company.management.forEach((person, index) => {
  add({fieldPath: `company.management.${index + 1}.name`, value: person.name, valueType: "text", materiality: "supporting", sourceDocument: DECK});
  add({fieldPath: `company.management.${index + 1}.title`, value: person.role, valueType: "text", materiality: "supporting", sourceDocument: DECK});
});
add({fieldPath: "company.last_equity_round.amount", value: String(company.lastRound.amount), valueType: "number", materiality: "material", sourceDocument: CAP});
add({fieldPath: "company.last_equity_round.date", value: company.lastRound.date, valueType: "date", materiality: "material", sourceDocument: CAP});
add({fieldPath: "company.last_equity_round.lead_investor", value: company.lastRound.lead, valueType: "text", materiality: "supporting", sourceDocument: CAP});
add({fieldPath: "company.last_equity_round.post_money_valuation", value: String(company.lastRound.postMoney), valueType: "number", materiality: "supporting", sourceDocument: CAP});
add({fieldPath: "company.runway_months", value: String(metrics.runwayMonths), valueType: "number", materiality: "material", sourceDocument: EXT, note: "Calculado: caixa de julho sobre a queima média de maio a julho. A carta diz 16."});
add({fieldPath: "company.net_revenue_retention", value: metrics.nrr.toFixed(4), valueType: "number", materiality: "material", sourceDocument: MET, tolerance: {kind: "relative", value: "0.01"}});
add({fieldPath: "company.monthly_churn_pct", value: metrics.monthlyLogoChurn.toFixed(4), valueType: "number", materiality: "material", sourceDocument: MET, tolerance: {kind: "relative", value: "0.02"}});

for (const year of historical) {
  const period = {periodStart: `${year.year}-01-01`, periodEnd: `${year.year}-12-31`};
  add({fieldPath: `historical_financials.${year.year}.revenue`, value: String(year.revenue), valueType: "number", materiality: "material", sourceDocument: GER, ...period, tolerance: near});
  add({fieldPath: `historical_financials.${year.year}.cogs`, value: String(year.cogs), valueType: "number", materiality: "material", sourceDocument: GER, ...period, tolerance: near});
  add({fieldPath: `historical_financials.${year.year}.gross_profit`, value: String(year.grossProfit), valueType: "number", materiality: "material", sourceDocument: GER, ...period, tolerance: near});
  add({fieldPath: `historical_financials.${year.year}.ebitda`, value: String(year.ebitda), valueType: "number", materiality: "material", sourceDocument: GER, ...period, tolerance: near});
  add({fieldPath: `historical_financials.${year.year}.net_income`, value: String(year.netIncome), valueType: "number", materiality: "material", sourceDocument: GER, ...period, tolerance: near});
  add({fieldPath: `historical_financials.${year.year}.cash`, value: String(year.cash), valueType: "number", materiality: "material", sourceDocument: GER, ...period, tolerance: near});
}
add({fieldPath: "historical_financials.2025.receivables", value: "3700000", valueType: "number", materiality: "material", sourceDocument: GER, periodEnd: "2025-12-31", tolerance: near});
add({fieldPath: "historical_financials.2025.gross_debt", value: "3500000", valueType: "number", materiality: "material", sourceDocument: GER, periodEnd: "2025-12-31", tolerance: near});

const q = {periodStart: "2026-01-01", periodEnd: "2026-07-31"};
add({fieldPath: "interim_financials.2026_07.revenue_7m", value: String(interim2026.revenue), valueType: "number", materiality: "material", sourceDocument: GER, ...q, tolerance: near});
add({fieldPath: "interim_financials.2026_07.ebitda_7m", value: String(interim2026.ebitda), valueType: "number", materiality: "material", sourceDocument: GER, ...q, tolerance: near});
add({fieldPath: "interim_financials.2026_07.net_income_7m", value: String(interim2026.netIncome), valueType: "number", materiality: "material", sourceDocument: GER, ...q, tolerance: near});
add({fieldPath: "interim_financials.2026_07.cash", value: String(interim2026.cash), valueType: "number", materiality: "material", sourceDocument: EXT, periodEnd: "2026-07-31", tolerance: near, note: "Extrato e gerencial concordam."});
add({fieldPath: "interim_financials.2026_07.receivables", value: String(interim2026.receivables), valueType: "number", materiality: "material", sourceDocument: GER, periodEnd: "2026-07-31", tolerance: near});
add({fieldPath: "interim_financials.2026_07.gross_debt", value: String(interim2026.grossDebt), valueType: "number", materiality: "material", sourceDocument: GER, periodEnd: "2026-07-31", tolerance: near});
add({fieldPath: "interim_financials.2026_07.mrr", value: String(metrics.mrr), valueType: "number", materiality: "material", sourceDocument: MET, periodEnd: "2026-07-31", tolerance: near});
add({fieldPath: "interim_financials.2026_07.arr", value: String(metrics.arr), valueType: "number", materiality: "material", sourceDocument: MET, periodEnd: "2026-07-31", tolerance: near, note: "O deck diz R$ 40 milhões; o export por cliente manda."});
add({fieldPath: "interim_financials.2026_07.monthly_burn", value: String(interim2026.monthlyBurn), valueType: "number", materiality: "material", sourceDocument: MET, periodStart: "2026-05-01", periodEnd: "2026-07-31", tolerance: {kind: "relative", value: "0.02"}});

metrics.topCustomers.forEach((customer, index) => {
  add({fieldPath: `customers.top_customers.${index + 1}.name`, value: customer.name, valueType: "text", materiality: "material", sourceDocument: MET});
  add({fieldPath: `customers.top_customers.${index + 1}.share_pct`, value: customer.share.toFixed(4), valueType: "number", materiality: "material", sourceDocument: MET, tolerance: {kind: "relative", value: "0.01"}});
});

debt.forEach((line, index) => {
  const n = index + 1;
  add({fieldPath: `debt.instruments.${n}.lender`, value: line.lender, valueType: "text", materiality: "material", sourceDocument: CAR});
  add({fieldPath: `debt.instruments.${n}.instrument_type`, value: line.instrument, valueType: "text", materiality: "supporting", sourceDocument: CAR});
  add({fieldPath: `debt.instruments.${n}.balance`, value: String(line.outstanding), valueType: "number", materiality: "material", sourceDocument: CAR, tolerance: near});
  add({fieldPath: `debt.instruments.${n}.rate`, value: line.rate, valueType: "text", materiality: "material", sourceDocument: CAR});
  add({fieldPath: `debt.instruments.${n}.maturity`, value: line.maturity, valueType: "date", materiality: "material", sourceDocument: CAR});
  add({fieldPath: `debt.instruments.${n}.amortization`, value: line.amortization, valueType: "text", materiality: "supporting", sourceDocument: CAR});
  add({fieldPath: `debt.instruments.${n}.collateral`, value: line.collateral, valueType: "text", materiality: "supporting", sourceDocument: CAR});
});
add({fieldPath: "debt.total_gross", value: String(interim2026.grossDebt), valueType: "number", materiality: "material", sourceDocument: GER, periodEnd: "2026-07-31", tolerance: near});

add({fieldPath: "transaction.requested_amount", value: String(request.amount), valueType: "number", materiality: "material", sourceDocument: CAR});
add({fieldPath: "transaction.currency", value: "BRL", valueType: "text", materiality: "material", sourceDocument: CAR});
add({fieldPath: "transaction.desired_term_months", value: String(request.termMonths), valueType: "number", materiality: "material", sourceDocument: CAR});
add({fieldPath: "transaction.desired_grace_months", value: String(request.graceMonths), valueType: "number", materiality: "material", sourceDocument: CAR});
add({fieldPath: "transaction.purpose", value: request.purpose, valueType: "text", materiality: "material", sourceDocument: CAR});
add({fieldPath: "transaction.preferred_structure", value: "Venture debt com warrant", valueType: "text", materiality: "supporting", sourceDocument: CAR});
request.useOfProceeds.forEach((use, index) => {
  add({fieldPath: `transaction.use_of_proceeds.${index + 1}.item`, value: use.item, valueType: "text", materiality: "material", sourceDocument: CAR});
  add({fieldPath: `transaction.use_of_proceeds.${index + 1}.amount`, value: String(use.amount), valueType: "number", materiality: "material", sourceDocument: CAR, tolerance: near});
});

if (unknown.length > 0) { console.error(`caminhos fora do catálogo: ${unknown.join(", ")}`); process.exit(1); }
write("expected/fields.json", fields);

write("expected/exceptions.json", [
  ...contradictions.map((entry) => ({
    id: entry.id,
    type: "source_conflict",
    severity: "critical",
    description: entry.resolution,
    keywords: entry.id === "arr-deck-vs-export" ? ["arr", "40", "deck", "export", "divergencia"] : ["runway", "16", "13", "queima", "extrato"],
    evidenceDocuments: entry.values.map((value) => value.document),
    expectedTreatment: "management",
  })),
  ...missing.map((entry) => ({
    id: `missing-${entry.id}`,
    type: "missing",
    severity: entry.id === "audited_statements" ? "high" : "medium",
    description: entry.why,
    keywords: entry.id.split("_"),
    evidenceDocuments: [],
    expectedTreatment: "question",
  })),
]);

write("expected/calculations.json", [
  {id: "runway_months", definition: "Caixa de 31/07/2026 sobre a queima média de maio a julho", value: String(metrics.runwayMonths), periodEnd: "2026-07-31", tolerance: {kind: "relative", value: "0.05"}},
  {id: "arr_2026_07", definition: "MRR de julho de 2026 vezes doze, a partir do export por cliente", value: String(metrics.arr), unit: "BRL", periodEnd: "2026-07-31", tolerance: {kind: "relative", value: "0.005"}},
  {id: "capacity_arr_and_round", definition: "Menor entre 30% do ARR e 35% da última rodada", value: String(Math.min(metrics.arr * 0.30, company.lastRound.amount * 0.35)), unit: "BRL", periodEnd: "2026-07-31", tolerance: {kind: "relative", value: "0.01"}},
  {id: "runway_after_debt", definition: "Runway com a captação, antes do serviço da dívida: (caixa + pedido) / queima", value: ((interim2026.cash + request.amount) / interim2026.monthlyBurn).toFixed(1), periodEnd: "2026-07-31", tolerance: {kind: "relative", value: "0.05"}},
]);
console.log(`${fields.length} campos, ${documents.length} documentos; ARR ${metrics.arr}, NRR ${metrics.nrr.toFixed(3)}, runway ${metrics.runwayMonths}`);
