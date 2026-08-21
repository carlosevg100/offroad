/**
 * The answer key for Cogna: a listed services company read from its 2T26 earnings release.
 *
 * One real public document (the release, 34 pages: highlights, segment results, cash flow,
 * debt, balance sheet and statutory income statement as annexes) plus a simulated request.
 * Every value was read by hand from the release and is cited to it. Values in the release are
 * R$ thousand in the annexes and R$ million in the highlights and the amortisation chart; the
 * answer key is in reais. Periods: quarter `interim_financials.2026_06` with `_3m`, half year
 * with `_6m`; stocks at 2026-06-30.
 *
 *   pnpm --filter @offroad/evals cogna:gold
 */
import {createHash} from "node:crypto";
import {mkdirSync, readFileSync, readdirSync, writeFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

import {evidenceRankByClass, resolveFieldPath} from "@offroad/credit-ontology";

const here = dirname(fileURLToPath(import.meta.url));
const assets = join(here, "..", "..", "testing-fixtures", "assets", "cogna");
const goldDir = join(here, "..", "..", "testing-fixtures", "gold", "cogna");
mkdirSync(join(goldDir, "expected"), {recursive: true});
const write = (relative: string, value: unknown) => writeFileSync(join(goldDir, relative), `${JSON.stringify(value, null, 2)}\n`, "utf8");

const REL = "01_Release_Resultados_2T26.pdf";
const CAR = "02_Pedido_Simulado_Debentures_2026.docx";
const COMPANY = "Cogna Educação S.A.";

const documents = readdirSync(assets).filter((name) => !name.startsWith(".")).sort()
  .map((name) => ({name, sha256: createHash("sha256").update(readFileSync(join(assets, name))).digest("hex")}));

write("manifest.json", {
  caseId: "cogna",
  title: "Cogna Educação S.A.: alongamento de R$ 1,8 bilhão em debêntures sobre o release público do 2T26",
  synthetic: false,
  archetypeId: "refinance",
  language: "pt",
  documentsDir: "../../assets/cogna",
  documents,
  provenance: "O release de resultados do 2T26 é público (RI da companhia, agosto de 2026), obtido em 21/08/2026. O pedido é simulado e diz isso na primeira linha; gerado por packages/testing-fixtures/scripts/build-cogna.ts. Gabarito lido à mão do release por packages/evals/scripts/build-cogna-gold.ts.",
  version: "cogna-2026.08.21-v1",
});

write("expected/profiles.json", [
  {document: REL, kind: "management_accounts", informationClass: "management", evidenceRank: evidenceRankByClass.management, entityName: COMPANY, periodStart: "2026-04-01", periodEnd: "2026-06-30", scale: 1000},
  {document: CAR, kind: "capital_request_letter", informationClass: "company_document", evidenceRank: evidenceRankByClass.company_document, entityName: COMPANY},
]);

type Field = {
  fieldPath: string; value: string; valueType: "text" | "number" | "date" | "boolean" | "list";
  materiality: "material" | "supporting"; sourceDocument?: string;
  periodStart?: string; periodEnd?: string; tolerance?: {kind: "exact"} | {kind: "relative"; value: string}; note?: string;
};
const near = {kind: "relative" as const, value: "0.005"};
const loose = {kind: "relative" as const, value: "0.01"};
const fields: Field[] = [];
const unknown: string[] = [];
const add = (field: Field) => { if (!resolveFieldPath(field.fieldPath)) unknown.push(field.fieldPath); fields.push(field); };
const k = (thousands: number) => String(thousands * 1000);
const m = (millions: number) => String(Math.round(millions * 1_000_000));

add({fieldPath: "company.legal_name", value: COMPANY, valueType: "text", materiality: "material", sourceDocument: REL});
add({fieldPath: "company.reporting_currency", value: "BRL", valueType: "text", materiality: "material", sourceDocument: REL});
add({fieldPath: "company.sector", value: "Educação", valueType: "text", materiality: "supporting", sourceDocument: REL});

const q = {periodStart: "2026-04-01", periodEnd: "2026-06-30"};
const h = {periodStart: "2026-01-01", periodEnd: "2026-06-30"};
const at = {periodEnd: "2026-06-30"};
// Consolidated highlights (R$ million) and cash generation (R$ thousand).
add({fieldPath: "interim_financials.2026_06.revenue_3m", value: m(1960.7), valueType: "number", materiality: "material", sourceDocument: REL, ...q, tolerance: near});
add({fieldPath: "interim_financials.2026_06.revenue_6m", value: m(4106.9), valueType: "number", materiality: "material", sourceDocument: REL, ...h, tolerance: near});
add({fieldPath: "interim_financials.2026_06.adjusted_ebitda_3m", value: m(589.4), valueType: "number", materiality: "material", sourceDocument: REL, ...q, tolerance: near, note: "EBITDA recorrente, a medida que a companhia destaca."});
add({fieldPath: "interim_financials.2026_06.adjusted_ebitda_6m", value: m(1269.0), valueType: "number", materiality: "material", sourceDocument: REL, ...h, tolerance: near});
add({fieldPath: "interim_financials.2026_06.net_income_3m", value: m(148.9), valueType: "number", materiality: "material", sourceDocument: REL, ...q, tolerance: near});
add({fieldPath: "interim_financials.2026_06.net_income_6m", value: m(290.3), valueType: "number", materiality: "material", sourceDocument: REL, ...h, tolerance: near});
add({fieldPath: "interim_financials.2026_06.d_and_a_3m", value: k(234_144), valueType: "number", materiality: "supporting", sourceDocument: REL, ...q, tolerance: near});
add({fieldPath: "interim_financials.2026_06.d_and_a_6m", value: k(466_371), valueType: "number", materiality: "supporting", sourceDocument: REL, ...h, tolerance: near});
add({fieldPath: "interim_financials.2026_06.capex_3m", value: k(150_332), valueType: "number", materiality: "material", sourceDocument: REL, ...q, tolerance: near});
add({fieldPath: "interim_financials.2026_06.capex_6m", value: k(272_383), valueType: "number", materiality: "material", sourceDocument: REL, ...h, tolerance: near});
add({fieldPath: "interim_financials.2026_06.free_cash_flow_3m", value: k(251_871), valueType: "number", materiality: "material", sourceDocument: REL, ...q, tolerance: near, note: "Geração de caixa livre após capex e juros, definição da companhia."});
add({fieldPath: "interim_financials.2026_06.free_cash_flow_6m", value: k(504_330), valueType: "number", materiality: "material", sourceDocument: REL, ...h, tolerance: near});
add({fieldPath: "interim_financials.2026_06.financial_expenses_3m", value: k(143_065), valueType: "number", materiality: "supporting", sourceDocument: REL, ...q, tolerance: loose, note: "Juros pagos no trimestre, a linha que o release traz; a despesa competência fica no ITR."});

// Balance sheet at 30/06/2026, R$ thousand.
add({fieldPath: "interim_financials.2026_06.cash", value: k(1_431_485), valueType: "number", materiality: "material", sourceDocument: REL, ...at, tolerance: near, note: "Total de disponibilidades: caixa, equivalentes e títulos, como a companhia define."});
add({fieldPath: "interim_financials.2026_06.receivables", value: k(2_763_024), valueType: "number", materiality: "material", sourceDocument: REL, ...at, tolerance: near, note: "Circulante; há mais R$ 143.765 mil no realizável a longo prazo."});
add({fieldPath: "interim_financials.2026_06.inventory", value: k(500_460), valueType: "number", materiality: "material", sourceDocument: REL, ...at, tolerance: near});
add({fieldPath: "interim_financials.2026_06.payables", value: k(715_101), valueType: "number", materiality: "material", sourceDocument: REL, ...at, tolerance: near, note: "Fornecedores; o risco sacado (R$ 678.726 mil) é linha à parte."});
add({fieldPath: "interim_financials.2026_06.gross_debt", value: k(3_926_827), valueType: "number", materiality: "material", sourceDocument: REL, ...at, tolerance: near, note: "Empréstimos, financiamentos e debêntures; arrendamentos (R$ 2,76 bi) fora, como a companhia apura."});
add({fieldPath: "interim_financials.2026_06.net_debt", value: k(2_775_379), valueType: "number", materiality: "material", sourceDocument: REL, ...at, tolerance: near});
add({fieldPath: "interim_financials.2026_06.equity", value: k(13_744_284), valueType: "number", materiality: "material", sourceDocument: REL, ...at, tolerance: near});
add({fieldPath: "interim_financials.2026_06.total_assets", value: k(24_534_326), valueType: "number", materiality: "material", sourceDocument: REL, ...at, tolerance: near});

// The stack as the release shows it: by nature, not by contract.
const lines: Array<[string, string, number, string | null]> = [
  ["Debêntures (circulante)", "Debênture", 203_029, null],
  ["Debêntures (não circulante)", "Debênture", 3_022_963, null],
  ["Empréstimos e financiamentos (circulante)", "Empréstimo bancário", 106_331, null],
  ["Empréstimos e financiamentos (não circulante)", "Empréstimo bancário", 594_504, null],
];
lines.forEach(([lender, type, balanceK], index) => {
  const n = index + 1;
  add({fieldPath: `debt.instruments.${n}.lender`, value: lender, valueType: "text", materiality: "material", sourceDocument: REL, ...at});
  add({fieldPath: `debt.instruments.${n}.instrument_type`, value: type, valueType: "text", materiality: "supporting", sourceDocument: REL});
  add({fieldPath: `debt.instruments.${n}.balance`, value: k(balanceK), valueType: "number", materiality: "material", sourceDocument: REL, ...at, tolerance: near});
});
add({fieldPath: "debt.total_gross", value: k(3_926_827), valueType: "number", materiality: "material", sourceDocument: REL, ...at, tolerance: near});
[["2026", 254], ["2027", 413], ["2028", 2140], ["2029", 811], ["2030 em diante", 309]].forEach(([window, amountM], index) => {
  add({fieldPath: `debt.maturity_profile.${index + 1}.window`, value: String(window), valueType: "text", materiality: "material", sourceDocument: REL, ...at});
  add({fieldPath: `debt.maturity_profile.${index + 1}.amount`, value: m(Number(amountM)), valueType: "number", materiality: "material", sourceDocument: REL, ...at, tolerance: loose, note: "Gráfico do cronograma de amortização, R$ milhões."});
});
add({fieldPath: "debt.covenants.1.metric", value: "Dívida líquida / EBITDA ajustado", valueType: "text", materiality: "material", sourceDocument: REL, note: "Apurado conforme as escrituras: dívida líquida inclui contas a pagar de aquisições; EBITDA ajustado soma itens não recorrentes e provisões sem caixa."});
add({fieldPath: "leverage.pre_transaction_net_debt_ebitda", value: "1.10", valueType: "number", materiality: "material", sourceDocument: REL, ...at, tolerance: loose});

// The simulated request.
add({fieldPath: "transaction.requested_amount", value: "1800000000", valueType: "number", materiality: "material", sourceDocument: CAR});
add({fieldPath: "transaction.currency", value: "BRL", valueType: "text", materiality: "material", sourceDocument: CAR});
add({fieldPath: "transaction.desired_term_months", value: "84", valueType: "number", materiality: "material", sourceDocument: CAR});
add({fieldPath: "transaction.desired_grace_months", value: "36", valueType: "number", materiality: "material", sourceDocument: CAR});
add({fieldPath: "transaction.preferred_structure", value: "Debêntures simples, não conversíveis", valueType: "text", materiality: "supporting", sourceDocument: CAR});
add({fieldPath: "transaction.refinancing", value: "1800000000", valueType: "number", materiality: "material", sourceDocument: CAR, tolerance: near});
add({fieldPath: "transaction.use_of_proceeds.1.item", value: "Resgate antecipado das debêntures com vencimento em 2028", valueType: "text", materiality: "material", sourceDocument: CAR});
add({fieldPath: "transaction.use_of_proceeds.1.amount", value: "1800000000", valueType: "number", materiality: "material", sourceDocument: CAR, tolerance: near});

if (unknown.length > 0) { console.error(`caminhos fora do catálogo: ${unknown.join(", ")}`); process.exit(1); }
write("expected/fields.json", fields);
write("expected/exceptions.json", [
  {id: "maturity-wall-2028", type: "plausibility", severity: "high", description: "R$ 2,14 bilhões vencem em 2028 contra R$ 1,43 bilhão de disponibilidades; a parede é a razão da operação e precisa aparecer na leitura.", keywords: ["2028", "2.140", "vencimento", "parede", "refinanciamento"], evidenceDocuments: [REL, CAR], expectedTreatment: "question"},
  {id: "leases-outside-debt", type: "quality", severity: "medium", description: "Arrendamentos de R$ 2,76 bilhões ficam fora da dívida bruta que a companhia apura; a mesa deve dizer qual definição usa.", keywords: ["arrendamento", "IFRS 16", "definição", "dívida bruta"], evidenceDocuments: [REL], expectedTreatment: "audited"},
]);
write("expected/calculations.json", [
  {id: "net_debt_2026_06", definition: "Dívida bruta (empréstimos, financiamentos e debêntures) menos disponibilidades, definição da companhia", value: "2495342000", unit: "BRL", periodEnd: "2026-06-30", tolerance: {kind: "relative", value: "0.005"}, note: "3.926.827 menos 1.431.485; a companhia chega a 2.775.379 somando derivativos e contas a pagar de aquisições à dívida."},
  {id: "maturity_wall_2028_vs_cash", definition: "Principal de 2028 sobre disponibilidades de 30/06/2026", value: "1.4950", periodEnd: "2026-06-30", tolerance: {kind: "relative", value: "0.01"}},
  {id: "ltm_leverage_company", definition: "Alavancagem apurada pela companhia conforme as escrituras", value: "1.10", periodEnd: "2026-06-30", tolerance: {kind: "relative", value: "0.02"}},
]);
console.log(`${fields.length} campos, ${documents.length} documentos`);
