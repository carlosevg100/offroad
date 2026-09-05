/**
 * Builds the text corpus an independent reviewer reads for a gold case: every document of the
 * case rendered to plain text by the repository's own parsers (pages, tables, sheets, sections),
 * plus the JSON and CSV files copied as they are, with a manifest of hashes. Case 01's corpus was
 * built with pdftotext and is kept; cases 02 and 05 inherit it and add their own files.
 *
 *   pnpm --filter @offroad/evals corpus:build -- --case gc03
 */
import {createHash} from "node:crypto";
import {copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync} from "node:fs";
import {basename, dirname, extname, join} from "node:path";
import {fileURLToPath} from "node:url";

import {parseDocument} from "@offroad/document-parsers";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..", "..");
const assets = join(repo, "packages", "testing-fixtures", "assets");
const args = process.argv.slice(2);
const caseKey = (() => { const index = args.indexOf("--case"); return index >= 0 && args[index + 1] ? String(args[index + 1]) : "gc03"; })();

type Source = {path: string; as?: string};
const outDir = join(repo, "docs", "product", "gold-cases", "runs", caseKey, "ai-review-corpus");
const gc01Corpus = join(repo, "docs", "product", "gold-cases", "runs", "gc01", "ai-review-corpus");
/** Cases that share Camil's public base point at case 01's corpus instead of copying seven megabytes; the pointer carries that manifest's hash so a change there changes this corpus too. */
const inherit = (dir: string): Source[] => {
  const manifest = readFileSync(join(dir, "manifest.json"));
  const pointer = join(outDir, "00_INHERITED_FROM_GC01.md");
  mkdirSync(outDir, {recursive: true});
  writeFileSync(pointer, `# Base pública herdada do caso 01\n\nLeia também todos os arquivos de \`docs/product/gold-cases/runs/gc01/ai-review-corpus/\` (${JSON.parse(manifest.toString("utf8")).entries.length} arquivos; manifesto sha256 ${createHash("sha256").update(manifest).digest("hex")}). Eles são a base pública da Camil, idêntica por desenho; nada deles é repetido aqui.\n`);
  return [{path: pointer}];
};
const cases: Record<string, {caseId: string; sources: Source[]; note: string}> = {
  gc02: {caseId: "gc02-cfo-camil-conselho", note: "corpus do caso 01 (pdftotext) mais os quatro arquivos gerenciais sintéticos, renderizados pelos parsers do repositório", sources: [...inherit(gc01Corpus), ...["01_Orcamento_2026_2027.xlsx", "02_Plano_Capex.xlsx", "03_Politica_Caixa_Minimo.docx", "04_Cronograma_Contratual_Amortizacoes.xlsx", "manifest.json"].map((name) => ({path: join(assets, "camil-management", name), as: `management_${name}`}))]},
  gc03: {caseId: "gc03-assessor-recebiveis", note: "os onze documentos da Aurora renderizados pelos parsers do repositório; o PNG do contrato social não passa por OCR aqui e fica registrado como não lido", sources: readdirSync(join(assets, "fakeco")).filter((name) => !name.startsWith(".")).map((name) => ({path: join(assets, "fakeco", name)}))},
  gc04: {caseId: "gc04-analista-investimentos-prisma", note: "release e pedido simulado da Cogna renderizados pelos parsers do repositório, mais o mandato sintético da Prisma", sources: [...readdirSync(join(assets, "cogna")).filter((name) => !name.startsWith(".")).map((name) => ({path: join(assets, "cogna", name)})), {path: join(assets, "prisma", "mandate.json"), as: "prisma_mandate.json"}]},
  gc05: {caseId: "gc05-banker-expansao-camil", note: "corpus do caso 01 (pdftotext) mais os arquivos gerenciais sintéticos do caso 02, porque a projeção é compartilhada", sources: [...inherit(gc01Corpus), ...["01_Orcamento_2026_2027.xlsx", "04_Cronograma_Contratual_Amortizacoes.xlsx", "manifest.json"].map((name) => ({path: join(assets, "camil-management", name), as: `management_${name}`}))]},
};
const spec = cases[caseKey];
if (!spec) { console.error(`unknown case ${caseKey}; available: ${Object.keys(cases).join(", ")}`); process.exit(2); }

const renderTable = (table: {rows?: Array<{cells: Array<{text: string}>}>} | {cells?: Array<{text: string}>}) => {
  const rows = (table as {rows?: Array<{cells: Array<{text: string}>}>}).rows ?? [];
  return rows.map((row) => row.cells.map((cell) => cell.text).join(" | ")).join("\n");
};
async function render(source: Source): Promise<{name: string; text: string | null; note: string}> {
  const name = source.as ?? basename(source.path);
  const ext = extname(name).toLowerCase();
  const bytes = readFileSync(source.path);
  if ([".txt", ".csv", ".json", ".md"].includes(ext)) return {name, text: bytes.toString("utf8"), note: "copied"};
  if (ext === ".png" || ext === ".jpg") return {name: `${name}.txt`, text: null, note: "image: not read by this corpus (OCR is never accepted automatically)"};
  const result = await parseDocument({bytes: new Uint8Array(bytes), documentId: name, documentVersion: 1, fileName: name});
  const layer = result.layer;
  const parts: string[] = [`# ${name} (${layer.kind}; parsers ${Object.values(result.parserVersions).join(", ")})`];
  for (const page of layer.pages ?? []) {
    parts.push(`\n\n## página ${page.n}${page.scanned ? " (digitalizada, sem texto)" : ""}\n`);
    parts.push(page.blocks.map((block) => block.text).join("\n"));
    for (const table of page.tables ?? []) parts.push(`\n[tabela]\n${renderTable(table as never)}`);
  }
  for (const sheet of layer.sheets ?? []) {
    parts.push(`\n\n## planilha ${sheet.name}${sheet.hidden ? " (oculta)" : ""}\n`);
    const byRow = new Map<number, string[]>();
    for (const cell of sheet.cells) { const row = Number(cell.ref.replace(/^[A-Z]+/, "")); byRow.set(row, [...(byRow.get(row) ?? []), `${cell.ref}=${cell.v === null ? "" : String(cell.v)}`]); }
    parts.push([...byRow.entries()].sort((a, b) => a[0] - b[0]).map(([, cells]) => cells.join(" ; ")).join("\n"));
  }
  for (const section of layer.sections ?? []) {
    parts.push(`\n\n## ${section.heading ?? section.id}\n`);
    parts.push(section.paragraphs.map((block) => block.text).join("\n"));
    for (const table of section.tables ?? []) parts.push(`\n[tabela]\n${renderTable(table as never)}`);
  }
  for (const slide of layer.slides ?? []) { parts.push(`\n\n## slide ${slide.n}\n`); parts.push(slide.blocks.map((block) => block.text).join("\n")); }
  const warnings = result.warnings.map((warning) => JSON.stringify(warning)).join("\n");
  return {name: `${name}.txt`, text: `${parts.join("\n")}${warnings ? `\n\n[avisos do parser]\n${warnings}` : ""}\n`, note: `rendered from ${layer.kind}`};
}

const entries: Array<{file: string; bytes: number; sha256: string; note: string}> = [];
for (const source of spec.sources) {
  if (!existsSync(source.path)) { console.error(`missing ${source.path}`); process.exit(1); }
  const rendered = await render(source);
  const target = join(outDir, rendered.name);
  if (rendered.text === null) writeFileSync(target, `${rendered.note}\n`);
  else if (rendered.note === "copied" && source.as === undefined && statSync(source.path).size === Buffer.byteLength(rendered.text)) copyFileSync(source.path, target);
  else writeFileSync(target, rendered.text);
  const bytes = readFileSync(target);
  entries.push({file: rendered.name, bytes: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex"), note: rendered.note});
}
entries.sort((a, b) => (a.file < b.file ? -1 : 1));
writeFileSync(join(outDir, "manifest.json"), `${JSON.stringify({schemaVersion: "ai-review-corpus.v1", caseId: spec.caseId, extractor: `packages/evals/scripts/build-review-corpus.ts (parsers do repositório); ${spec.note}`, entries}, null, 2)}\n`);
console.log(`${caseKey}: ${entries.length} files, ${entries.reduce((sum, entry) => sum + entry.bytes, 0)} bytes -> ${outDir}`);
for (const entry of entries.filter((item) => item.note !== "copied")) console.log(`  ${entry.file} ${entry.bytes}B ${entry.note}`);
