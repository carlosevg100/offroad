/**
 * Aurora's receivables aging and tape at 31/07/2026 (Case 03, "envia documentos" branch), from the
 * declared rules in `src/fakeco/receivables.ts`. Rerun `pnpm --filter @offroad/evals fakeco:gold`
 * afterwards so the gold manifest carries the new hashes.
 *
 *   pnpm --filter @offroad/testing-fixtures fakeco:receivables
 */
import {createHash} from "node:crypto";
import {writeFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

import * as XLSX from "xlsx";

import {agingBuckets, agingByDebtor, buildReceivablesTape, encumbrances, receivablesLabel, receivablesReferenceDate, receivablesTotal} from "../src/fakeco/receivables";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "assets", "fakeco");
const rows = buildReceivablesTape();
const total = rows.reduce((sum, row) => sum + row.balance, 0);
if (total !== receivablesTotal) throw new Error(`tape ${total} does not tie to the balance sheet ${receivablesTotal}`);

const brl = (value: number) => value.toLocaleString("pt-BR", {minimumFractionDigits: 2, maximumFractionDigits: 2});
const labels: Record<string, string> = {current: "A vencer", days_1_30: "1 a 30 dias", days_31_60: "31 a 60 dias", days_61_90: "61 a 90 dias", days_91_plus: "Acima de 90 dias"};
const aging = agingByDebtor(rows);
const book = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
  [receivablesLabel], [`Aurora Distribuidora de Materiais de Construção Ltda: aging da carteira de duplicatas em ${receivablesReferenceDate}, em reais`], [],
  ["Sacado", "Setor", ...agingBuckets.map((bucket) => labels[bucket]!), "Total"],
  ...aging.map((entry) => [entry.debtorName, entry.sector === "public" ? "público" : "privado", ...agingBuckets.map((bucket) => entry.buckets[bucket]), entry.total]),
  ["Total", "", ...agingBuckets.map((bucket) => aging.reduce((sum, entry) => sum + entry.buckets[bucket], 0)), total],
]), "Aging");
XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
  [receivablesLabel], ["Ônus sobre a carteira (mapa de dívida de julho de 2026)"], [],
  ["Contrato", "Natureza", "Valor coberto", "Regra"],
  ...encumbrances.map((entry) => [entry.contract, entry.kind === "pledged" ? "duplicatas em garantia" : "recebíveis cedidos", entry.amount, entry.rule]),
  ["Total onerado", "", encumbrances.reduce((sum, entry) => sum + entry.amount, 0), ""],
  ["Carteira livre", "", total - encumbrances.reduce((sum, entry) => sum + entry.amount, 0), ""],
]), "Onus");
const xlsx = new Uint8Array(XLSX.write(book, {type: "array", bookType: "xlsx"}));
const csvLines = [`# ${receivablesLabel}`, "duplicata;sacado_id;sacado;setor;valor;dias_atraso;vencimento;onus;contrato", ...rows.map((row) => [row.receivableId, row.debtorId, row.debtorName, row.sector === "public" ? "publico" : "privado", brl(row.balance), row.daysPastDue, row.dueDate, row.encumbrance === "free" ? "livre" : row.encumbrance === "pledged" ? "garantia" : "cedida", row.contract ?? ""].join(";"))];
const csv = new TextEncoder().encode(`${csvLines.join("\n")}\n`);
for (const [name, bytes] of [["09_Aging_Recebiveis_Jul2026.xlsx", xlsx], ["10_Tape_Duplicatas_Jul2026.csv", csv]] as const) {
  writeFileSync(join(outDir, name), bytes);
  console.log(`${name} ${bytes.byteLength} bytes sha256=${createHash("sha256").update(bytes).digest("hex").slice(0, 16)}`);
}
console.log(`${rows.length} duplicatas; total ${brl(total)}; encumbered ${brl(rows.filter((row) => row.encumbrance !== "free").reduce((sum, row) => sum + row.balance, 0))}`);
