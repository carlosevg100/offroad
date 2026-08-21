/**
 * The answer key for the Camil case: a listed company read from its own public filings.
 *
 * Aurora is synthetic and internally consistent by construction. This case is the opposite: two
 * real CVM documents (the 1T26 ITR and the 2026 AGOE management proposal) plus one simulated
 * request letter, with the noise real filings carry: a fiscal year that ends in February, a
 * balance printed in thousands, twelve debenture series whose balances live in one document
 * and whose rates and maturities live in another, foreign-currency lines, and a covenant that
 * is tested once a year while the company reports a pro forma figure above it.
 *
 * Every value below was read by hand from the filings and is cited to the document it came
 * from. Periods follow the ontology: a year is keyed by the year it ends in, so the fiscal year
 * ended 28/02/2026 (the company's "2025") is `historical_financials.2026`; the quarter ended 31/05/2026 is
 * `interim_financials.2026_05` with a `_3m` window for flows.
 *
 *   pnpm --filter @offroad/evals camil:gold
 */
import {createHash} from "node:crypto";
import {mkdirSync, readFileSync, readdirSync, writeFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

import {evidenceRankByClass, resolveFieldPath} from "@offroad/credit-ontology";

const here = dirname(fileURLToPath(import.meta.url));
const assets = join(here, "..", "..", "testing-fixtures", "assets", "camil");
const goldDir = join(here, "..", "..", "testing-fixtures", "gold", "camil");
mkdirSync(join(goldDir, "expected"), {recursive: true});

const write = (relative: string, value: unknown) =>
  writeFileSync(join(goldDir, relative), `${JSON.stringify(value, null, 2)}\n`, "utf8");

const ITR = "01_ITR_1T26_31mai2026.pdf";
const AGO = "02_Proposta_Administracao_AGOE_2026.pdf";
const CAR = "03_Pedido_Simulado_CRA_2026.docx";
const COMPANY = "Camil Alimentos S.A.";

const documents = readdirSync(assets)
  .filter((name) => !name.startsWith("."))
  .sort()
  .map((name) => ({name, sha256: createHash("sha256").update(readFileSync(join(assets, name))).digest("hex")}));

write("manifest.json", {
  caseId: "camil",
  title: "Camil Alimentos S.A.: alongamento de R$ 1,5 bilhão via CRA sobre demonstrações públicas (1T26)",
  synthetic: false,
  language: "pt",
  documentsDir: "../../assets/camil",
  documents,
  provenance:
    "Os dois PDFs são arquivamentos públicos da companhia (ITR de 31/05/2026 com revisão da BDO RCS e Proposta da " +
    "Administração para a AGOE de 30/06/2026), obtidos dos sites de RI/CVM em 21/08/2026. O pedido é simulado e diz isso " +
    "na primeira linha; foi gerado por packages/testing-fixtures/scripts/build-camil.ts. Este gabarito foi lido à mão dos " +
    "arquivamentos por packages/evals/scripts/build-camil-gold.ts, com cada valor citado ao documento de origem.",
  version: "camil-2026.08.21-v1",
});

write("expected/profiles.json", [
  {document: ITR, kind: "reviewed_interim_statements", informationClass: "reviewed", evidenceRank: evidenceRankByClass.reviewed, entityName: COMPANY, periodStart: "2026-03-01", periodEnd: "2026-05-31", scale: 1000},
  {document: AGO, kind: "regulatory_filing", informationClass: "company_document", evidenceRank: evidenceRankByClass.company_document, entityName: COMPANY, periodStart: "2025-03-01", periodEnd: "2026-02-28"},
  {document: CAR, kind: "capital_request_letter", informationClass: "company_document", evidenceRank: evidenceRankByClass.company_document, entityName: COMPANY},
]);

type Field = {
  fieldPath: string; value: string; valueType: "text" | "number" | "date" | "boolean" | "list";
  materiality: "material" | "supporting"; sourceDocument?: string;
  periodStart?: string; periodEnd?: string; tolerance?: {kind: "exact"} | {kind: "relative"; value: string};
  note?: string;
};
const near = {kind: "relative" as const, value: "0.005"};
const loose = {kind: "relative" as const, value: "0.01"};
const fields: Field[] = [];
const unknown: string[] = [];
const add = (field: Field) => {
  if (!resolveFieldPath(field.fieldPath)) unknown.push(field.fieldPath);
  fields.push(field);
};
/** Thousands of reais on the page, reais in the answer. */
const k = (thousands: number) => String(thousands * 1000);
/** Millions of reais on the page (directors' comments), reais in the answer. */
const m = (millions: number) => String(Math.round(millions * 1_000_000));

// Company.
add({fieldPath: "company.legal_name", value: COMPANY, valueType: "text", materiality: "material", sourceDocument: ITR});
add({fieldPath: "company.legal_identifier", value: "64904295000103", valueType: "text", materiality: "material", sourceDocument: AGO});
add({fieldPath: "company.reporting_currency", value: "BRL", valueType: "text", materiality: "material", sourceDocument: ITR});
add({fieldPath: "company.fiscal_year_end", value: "28 de fevereiro", valueType: "text", materiality: "supporting", sourceDocument: ITR});
add({fieldPath: "company.accounting_framework", value: "IFRS / CPC", valueType: "text", materiality: "supporting", sourceDocument: ITR});
add({fieldPath: "company.auditor.firm", value: "BDO RCS Auditores Independentes SS Ltda.", valueType: "text", materiality: "material", sourceDocument: ITR});
add({fieldPath: "company.sector", value: "Alimentos", valueType: "text", materiality: "supporting", sourceDocument: AGO});

// Fiscal year ended 28/02/2026 ("2025"). Balance from the ITR's comparative column, flows from the directors' comments.
const fy = {periodStart: "2025-03-01", periodEnd: "2026-02-28"};
const fyPrev = {periodStart: "2024-03-01", periodEnd: "2025-02-28"};
add({fieldPath: "historical_financials.2026.revenue", value: m(11115.0), valueType: "number", materiality: "material", sourceDocument: AGO, ...fy, tolerance: near});
add({fieldPath: "historical_financials.2026.cogs", value: m(8622.7), valueType: "number", materiality: "material", sourceDocument: AGO, ...fy, tolerance: near});
add({fieldPath: "historical_financials.2026.gross_profit", value: m(2492.3), valueType: "number", materiality: "material", sourceDocument: AGO, ...fy, tolerance: near});
add({fieldPath: "historical_financials.2026.ebitda", value: m(915.3), valueType: "number", materiality: "material", sourceDocument: AGO, ...fy, tolerance: near});
add({fieldPath: "historical_financials.2026.net_income", value: m(148.5), valueType: "number", materiality: "material", sourceDocument: AGO, ...fy, tolerance: near});
add({fieldPath: "historical_financials.2026.d_and_a", value: m(285.9), valueType: "number", materiality: "supporting", sourceDocument: AGO, ...fy, tolerance: near});
add({fieldPath: "historical_financials.2026.financial_result", value: m(-591.7), valueType: "number", materiality: "material", sourceDocument: AGO, ...fy, tolerance: near});
add({fieldPath: "historical_financials.2026.taxes", value: m(110.8), valueType: "number", materiality: "supporting", sourceDocument: AGO, ...fy, tolerance: near});
add({fieldPath: "historical_financials.2026.net_debt", value: m(2965.7), valueType: "number", materiality: "material", sourceDocument: AGO, ...fy, tolerance: near, note: "Dívida bruta menos caixa e aplicações financeiras, definição da companhia."});
add({fieldPath: "historical_financials.2026.gross_debt", value: k(4_988_383), valueType: "number", materiality: "material", sourceDocument: ITR, ...fy, tolerance: near});
add({fieldPath: "historical_financials.2026.cash", value: k(1_997_608), valueType: "number", materiality: "material", sourceDocument: ITR, ...fy, tolerance: near, note: "Caixa e equivalentes; as aplicações financeiras (R$ 25.095 mil) ficam fora."});
add({fieldPath: "historical_financials.2026.receivables", value: k(1_019_433), valueType: "number", materiality: "material", sourceDocument: ITR, ...fy, tolerance: near});
add({fieldPath: "historical_financials.2026.inventory", value: k(2_096_538), valueType: "number", materiality: "material", sourceDocument: ITR, ...fy, tolerance: near, note: "Circulante; há mais R$ 87.120 mil no não circulante."});
add({fieldPath: "historical_financials.2026.payables", value: k(1_229_105), valueType: "number", materiality: "material", sourceDocument: ITR, ...fy, tolerance: near});
add({fieldPath: "historical_financials.2026.equity", value: k(3_015_690), valueType: "number", materiality: "material", sourceDocument: ITR, ...fy, tolerance: near});
add({fieldPath: "historical_financials.2026.total_assets", value: k(10_774_545), valueType: "number", materiality: "material", sourceDocument: ITR, ...fy, tolerance: near});
add({fieldPath: "historical_financials.2025.revenue", value: m(12262.9), valueType: "number", materiality: "material", sourceDocument: AGO, ...fyPrev, tolerance: near});
add({fieldPath: "historical_financials.2025.cogs", value: m(9873.0), valueType: "number", materiality: "material", sourceDocument: AGO, ...fyPrev, tolerance: near});
add({fieldPath: "historical_financials.2025.ebitda", value: m(907.3), valueType: "number", materiality: "material", sourceDocument: AGO, ...fyPrev, tolerance: near});
add({fieldPath: "historical_financials.2025.net_income", value: m(217.0), valueType: "number", materiality: "material", sourceDocument: AGO, ...fyPrev, tolerance: near});
add({fieldPath: "historical_financials.2025.net_debt", value: m(2690.7), valueType: "number", materiality: "material", sourceDocument: AGO, ...fyPrev, tolerance: near});
add({fieldPath: "historical_financials.2025.gross_debt", value: m(5237.7), valueType: "number", materiality: "material", sourceDocument: AGO, ...fyPrev, tolerance: near});

// Quarter ended 31/05/2026, consolidated, in thousands on the page.
const q = {periodStart: "2026-03-01", periodEnd: "2026-05-31"};
add({fieldPath: "interim_financials.2026_05.revenue_3m", value: k(2_667_975), valueType: "number", materiality: "material", sourceDocument: ITR, ...q, tolerance: near});
add({fieldPath: "interim_financials.2026_05.cogs_3m", value: k(2_016_179), valueType: "number", materiality: "material", sourceDocument: ITR, ...q, tolerance: near});
add({fieldPath: "interim_financials.2026_05.gross_profit_3m", value: k(651_796), valueType: "number", materiality: "material", sourceDocument: ITR, ...q, tolerance: near});
add({fieldPath: "interim_financials.2026_05.ebit_3m", value: k(139_521), valueType: "number", materiality: "material", sourceDocument: ITR, ...q, tolerance: near});
add({fieldPath: "interim_financials.2026_05.ebitda_3m", value: m(210.0), valueType: "number", materiality: "material", sourceDocument: ITR, ...q, tolerance: loose, note: "Relatório da administração dentro do ITR: R$ 210,0 milhões, margem 7,9%."});
add({fieldPath: "interim_financials.2026_05.financial_expenses_3m", value: k(188_430), valueType: "number", materiality: "supporting", sourceDocument: ITR, ...q, tolerance: near});
add({fieldPath: "interim_financials.2026_05.financial_result_3m", value: k(-141_971), valueType: "number", materiality: "material", sourceDocument: ITR, ...q, tolerance: near});
add({fieldPath: "interim_financials.2026_05.net_income_3m", value: k(27_971), valueType: "number", materiality: "material", sourceDocument: ITR, ...q, tolerance: near});
add({fieldPath: "interim_financials.2026_05.cash", value: k(1_430_714), valueType: "number", materiality: "material", sourceDocument: ITR, periodEnd: "2026-05-31", tolerance: near});
add({fieldPath: "interim_financials.2026_05.receivables", value: k(1_881_602), valueType: "number", materiality: "material", sourceDocument: ITR, periodEnd: "2026-05-31", tolerance: near});
add({fieldPath: "interim_financials.2026_05.inventory", value: k(3_013_060), valueType: "number", materiality: "material", sourceDocument: ITR, periodEnd: "2026-05-31", tolerance: near});
add({fieldPath: "interim_financials.2026_05.payables", value: k(1_870_146), valueType: "number", materiality: "material", sourceDocument: ITR, periodEnd: "2026-05-31", tolerance: near});
add({fieldPath: "interim_financials.2026_05.gross_debt", value: k(5_670_186), valueType: "number", materiality: "material", sourceDocument: ITR, periodEnd: "2026-05-31", tolerance: near});
add({fieldPath: "interim_financials.2026_05.equity", value: k(2_989_107), valueType: "number", materiality: "material", sourceDocument: ITR, periodEnd: "2026-05-31", tolerance: near});
add({fieldPath: "interim_financials.2026_05.total_assets", value: k(12_021_830), valueType: "number", materiality: "material", sourceDocument: ITR, periodEnd: "2026-05-31", tolerance: near});

// The stack at 31/05/2026. Balances come from note 15 of the ITR; rates and maturities of the
// debentures come from the AGOE proposal, which is the point: the map is split across documents.
type Line = {lender: string; type: string; balanceK: number; currency: string; rate?: string; maturity?: string; amortization?: string; ratesFrom?: string};
const lines: Line[] = [
  {lender: "Bancos (capital de giro, moeda nacional)", type: "Capital de giro", balanceK: 1_314_412, currency: "BRL"},
  {lender: "Bancos (capital de giro, USD)", type: "Capital de giro", balanceK: 867_244, currency: "USD"},
  {lender: "Bancos (capital de giro, CLP)", type: "Capital de giro", balanceK: 54_180, currency: "CLP"},
  {lender: "Bancos (capital de giro, PEN)", type: "Capital de giro", balanceK: 181_158, currency: "PEN"},
  {lender: "11ª emissão, 1ª série", type: "Debênture", balanceK: 151_795, currency: "BRL", rate: "CDI + 1,55% a.a.", maturity: "2028-10-30", amortization: "2 parcelas"},
  {lender: "11ª emissão, 2ª série", type: "Debênture", balanceK: 505_984, currency: "BRL", rate: "CDI + 1,55% a.a.", maturity: "2028-10-30", amortization: "2 parcelas"},
  {lender: "13ª emissão, 1ª série (CRA)", type: "Debênture / CRA", balanceK: 306_038, currency: "BRL", rate: "CDI + 0,65% a.a.", maturity: "2028-11-14", amortization: "Parcela única"},
  {lender: "13ª emissão, 2ª série (CRA)", type: "Debênture / CRA", balanceK: 282_357, currency: "BRL", rate: "IPCA + 6,3416% a.a.", maturity: "2030-11-14", amortization: "2 parcelas anuais"},
  {lender: "13ª emissão, 3ª série (CRA)", type: "Debênture / CRA", balanceK: 110_321, currency: "BRL", rate: "IPCA + 6,5264% a.a.", maturity: "2033-11-14", amortization: "3 parcelas anuais"},
  {lender: "14ª emissão, 1ª série (CRA)", type: "Debênture / CRA", balanceK: 438_918, currency: "BRL", rate: "104% do DI", maturity: "2029-06-15", amortization: "Parcela única"},
  {lender: "14ª emissão, 2ª série (CRA)", type: "Debênture / CRA", balanceK: 204_059, currency: "BRL", rate: "IPCA + 6,8286% a.a.", maturity: "2031-06-16", amortization: "2 parcelas anuais"},
  {lender: "14ª emissão, 3ª série (CRA)", type: "Debênture / CRA", balanceK: 66_024, currency: "BRL", rate: "IPCA + 6,9982% a.a.", maturity: "2034-06-15", amortization: "3 parcelas anuais"},
  {lender: "15ª emissão, 1ª série (CRA)", type: "Debênture / CRA", balanceK: 770_123, currency: "BRL", rate: "105% do DI", maturity: "2030-11-14", amortization: "Parcela única"},
  {lender: "15ª emissão, 2ª série (CRA)", type: "Debênture / CRA", balanceK: 408_703, currency: "BRL", rate: "14,15% a.a. pré", maturity: "2032-11-12", amortization: "2 parcelas anuais"},
  {lender: "15ª emissão, 3ª série (CRA)", type: "Debênture / CRA", balanceK: 50_401, currency: "BRL", rate: "IPCA + 8,2% a.a.", maturity: "2032-11-12", amortization: "2 parcelas anuais"},
  {lender: "15ª emissão, 4ª série (CRA)", type: "Debênture / CRA", balanceK: 30_793, currency: "BRL", rate: "IPCA + 8,7% a.a.", maturity: "2035-11-14", amortization: "3 parcelas anuais"},
];
lines.forEach((line, index) => {
  const n = index + 1;
  add({fieldPath: `debt.instruments.${n}.lender`, value: line.lender, valueType: "text", materiality: "material", sourceDocument: ITR, periodEnd: "2026-05-31"});
  add({fieldPath: `debt.instruments.${n}.instrument_type`, value: line.type, valueType: "text", materiality: "supporting", sourceDocument: ITR});
  add({fieldPath: `debt.instruments.${n}.balance`, value: k(line.balanceK), valueType: "number", materiality: "material", sourceDocument: ITR, periodEnd: "2026-05-31", tolerance: near});
  add({fieldPath: `debt.instruments.${n}.currency`, value: line.currency, valueType: "text", materiality: "material", sourceDocument: ITR});
  if (line.rate) add({fieldPath: `debt.instruments.${n}.rate`, value: line.rate, valueType: "text", materiality: "material", sourceDocument: AGO});
  if (line.maturity) add({fieldPath: `debt.instruments.${n}.maturity`, value: line.maturity, valueType: "date", materiality: "material", sourceDocument: AGO});
  if (line.amortization) add({fieldPath: `debt.instruments.${n}.amortization`, value: line.amortization, valueType: "text", materiality: "supporting", sourceDocument: AGO});
});
[
  ["Jun/26 a Mai/27", 1_229_828], ["Jun/27 a Mai/28", 776_868], ["Jun/28 a Mai/29", 1_228_475],
  ["Jun/29 a Mai/30", 694_497], ["Jun/30 a Mai/31", 994_544], ["Após Jun/31", 809_198],
].forEach(([window, amountK], index) => {
  add({fieldPath: `debt.maturity_profile.${index + 1}.window`, value: String(window), valueType: "text", materiality: "material", sourceDocument: ITR, periodEnd: "2026-05-31"});
  add({fieldPath: `debt.maturity_profile.${index + 1}.amount`, value: k(Number(amountK)), valueType: "number", materiality: "material", sourceDocument: ITR, periodEnd: "2026-05-31", tolerance: near, note: "Cronograma consolidado por ano-safra, nota 15."});
});
add({fieldPath: "debt.total_gross", value: k(5_670_186), valueType: "number", materiality: "material", sourceDocument: ITR, periodEnd: "2026-05-31", tolerance: near});
add({fieldPath: "debt.covenants.1.metric", value: "Dívida líquida / EBITDA", valueType: "text", materiality: "material", sourceDocument: ITR});
add({fieldPath: "debt.covenants.1.threshold", value: "4.0", valueType: "number", materiality: "material", sourceDocument: ITR, note: "Medido nas demonstrações anuais; próxima medição em 28/02/2027."});
add({fieldPath: "leverage.pre_transaction_net_debt_ebitda", value: "4.72", valueType: "number", materiality: "material", sourceDocument: ITR, periodEnd: "2026-05-31", tolerance: loose, note: "Pro forma informado pela companhia na nota 15."});

// The simulated request.
add({fieldPath: "transaction.requested_amount", value: "1500000000", valueType: "number", materiality: "material", sourceDocument: CAR});
add({fieldPath: "transaction.currency", value: "BRL", valueType: "text", materiality: "material", sourceDocument: CAR});
add({fieldPath: "transaction.desired_term_months", value: "84", valueType: "number", materiality: "material", sourceDocument: CAR});
add({fieldPath: "transaction.desired_grace_months", value: "24", valueType: "number", materiality: "material", sourceDocument: CAR});
add({fieldPath: "transaction.preferred_structure", value: "CRA lastreado em debêntures", valueType: "text", materiality: "supporting", sourceDocument: CAR});
add({fieldPath: "transaction.refinancing", value: "1229828000", valueType: "number", materiality: "material", sourceDocument: CAR, tolerance: near});
add({fieldPath: "transaction.use_of_proceeds.1.item", value: "Resgate antecipado das parcelas Jun/26 a Mai/27 (empréstimos bilaterais e CCBs)", valueType: "text", materiality: "material", sourceDocument: CAR});
add({fieldPath: "transaction.use_of_proceeds.1.amount", value: "1229828000", valueType: "number", materiality: "material", sourceDocument: CAR, tolerance: near});
add({fieldPath: "transaction.use_of_proceeds.2.item", value: "Reforço de caixa para a safra 2026/27", valueType: "text", materiality: "material", sourceDocument: CAR});
add({fieldPath: "transaction.use_of_proceeds.2.amount", value: "270172000", valueType: "number", materiality: "material", sourceDocument: CAR, tolerance: near});

if (unknown.length > 0) {
  console.error(`caminhos fora do catálogo: ${unknown.join(", ")}`);
  process.exit(1);
}
write("expected/fields.json", fields);

write("expected/exceptions.json", [
  {
    id: "covenant-proforma",
    type: "plausibility",
    severity: "critical",
    description: "A companhia informa alavancagem pro forma de 4,72x em 31/05/2026 contra covenant de 4,0x medido anualmente; o pedido como desenhado precisa mostrar como chega a fevereiro de 2027 abaixo do limite.",
    keywords: ["covenant", "4,72", "4,0", "alavancagem", "pro forma"],
    evidenceDocuments: [ITR, CAR],
    expectedTreatment: "question",
  },
  {
    id: "maturity-wall",
    type: "plausibility",
    severity: "high",
    description: "R$ 1.229.828 mil vencem entre Jun/26 e Mai/27 contra caixa de R$ 1.430.714 mil, com a compra da safra concentrada no mesmo semestre.",
    keywords: ["vencimento", "1.229", "parede", "refinanciamento", "safra"],
    evidenceDocuments: [ITR],
    expectedTreatment: "question",
  },
  {
    id: "fx-lines",
    type: "quality",
    severity: "medium",
    description: "R$ 1.102.582 mil do estoque está em USD, CLP e PEN, sem indexador nem vencimento por linha na nota; o mapa por instrumento fica incompleto sem o detalhe das controladas.",
    keywords: ["moeda estrangeira", "USD", "CLP", "PEN", "controladas"],
    evidenceDocuments: [ITR, AGO],
    expectedTreatment: "question",
  },
  {
    id: "cash-definition",
    type: "source_conflict",
    severity: "medium",
    description: "A dívida líquida da companhia desconta caixa e aplicações financeiras; o balanço separa as duas rubricas. Qualquer cálculo deve dizer qual definição usa.",
    keywords: ["caixa", "aplicações financeiras", "dívida líquida", "definição"],
    evidenceDocuments: [ITR, AGO],
    expectedTreatment: "audited",
  },
]);

write("expected/calculations.json", [
  {id: "net_debt_2026_05", definition: "Dívida bruta menos caixa e aplicações financeiras em 31/05/2026 (definição da companhia)", value: "4214377000", unit: "BRL", periodEnd: "2026-05-31", tolerance: {kind: "relative", value: "0.005"}},
  {id: "net_debt_fy2025", definition: "Dívida bruta menos caixa e aplicações em 28/02/2026", value: "2965680000", unit: "BRL", periodEnd: "2026-02-28", tolerance: {kind: "relative", value: "0.005"}, note: "Bate com os R$ 2.965,7 milhões dos comentários dos diretores."},
  {id: "leverage_fy2025", definition: "Dívida líquida / EBITDA do exercício findo em 28/02/2026", value: "3.2402", periodEnd: "2026-02-28", tolerance: {kind: "relative", value: "0.01"}},
  {id: "maturity_wall_12m", definition: "Principal com vencimento de Jun/26 a Mai/27 sobre caixa e aplicações de 31/05/2026", value: "0.8447", periodEnd: "2026-05-31", tolerance: {kind: "relative", value: "0.01"}, note: "1.229.828 / 1.455.809."},
  {id: "cdi_share_of_stack", definition: "Parcela do estoque em CDI ou % do DI (capital de giro nacional e séries em DI) sobre a dívida bruta consolidada", value: "0.6149", periodEnd: "2026-05-31", tolerance: {kind: "relative", value: "0.02"}, note: "(1.314.412 + 151.795 + 505.984 + 306.038 + 438.918 + 770.123) / 5.670.186."},
]);

console.log(`${fields.length} campos, ${lines.length} linhas de dívida, ${documents.length} documentos`);
