/**
 * `pnpm --filter @offroad/evals baseline:gold --case gc01 [--dry-run] [--out <dir>]`
 *
 * Runs the fair baseline of a gold case (gold-cases/README.md §5): the strongest generalist
 * receives the same turns, the same documents, the equivalent content of the frozen source
 * pack and the same time window, with no tools and no hint of the rubric. Outputs and a run
 * record with every input hash land beside the case so the review panel reads both sides.
 * `--dry-run` assembles and hashes the information base without calling any model.
 */
import {createHash} from "node:crypto";
import {mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";

import {parsePdf} from "@offroad/document-parsers";
import {createAnthropicAdapter, createModelGateway, createOpenAIAdapter, type ContentPart} from "@offroad/model-gateway";
import {sourcePackSchema, type SourcePackEntry} from "@offroad/public-research";

import {
  BASELINE_SYSTEM_PROMPT,
  baselineInformationBaseSchema,
  baselineOutputSchema,
  baselineRunRecordSchema,
  filterCsvRows,
  informationBaseHash,
  renderInformationBase,
  renderTurnMessage,
  type BaselineDocument,
  type BaselineInformationBase,
  type BaselineRunRecord,
  type BaselineSource,
} from "../src/gold-baseline";
import {intentGoldTurns} from "../src/intent-gold";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..", "..", "..");
const args = process.argv.slice(2);
const option = (name: string, fallback: string): string => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? String(args[index + 1]) : fallback;
};
const dryRun = args.includes("--dry-run");
const caseKey = option("case", "gc01");
const sha256 = (value: string | Uint8Array): string => createHash("sha256").update(value).digest("hex");

/** The frozen inputs of each case, exactly as the case file lists them. */
const cases: Record<string, {
  caseId: string;
  caseVersion: string;
  asOfDate: string;
  assetsDir: string;
  documents: Array<{id: string; title: string; fileName: string}>;
  turnIds: string[];
  professionalContext: BaselineInformationBase["professionalContext"];
  companyPattern: RegExp;
}> = {
  gc01: {
    caseId: "gc01-analista-ib-camil",
    caseVersion: "1.0",
    asOfDate: "2026-09-04",
    assetsDir: join(repo, "packages", "testing-fixtures", "assets", "camil"),
    documents: [
      {id: "itr_1t26", title: "ITR 31/05/2026 com release de resultados (versão da companhia)", fileName: "01_ITR_1T26_31mai2026.pdf"},
      {id: "proposta_agoe_2026", title: "Proposta da administração para a AGOE de 2026", fileName: "02_Proposta_Administracao_AGOE_2026.pdf"},
    ],
    turnIds: ["gc01-t01", "gc01-t02"],
    professionalContext: {useForms: ["institutional_work"], professionalRoles: ["banker"], practiceAreas: ["investment_banking", "dcm"], primaryObjectives: ["prepare_meetings"]},
    companyPattern: /CAMIL/i,
  },
};

async function pdfText(bytes: Uint8Array, fileName: string, id: string): Promise<{text: string; pages: number}> {
  const parsed = await parsePdf({bytes, documentId: id, documentVersion: 1, fileName, mimeType: "application/pdf"});
  const pages = parsed.layer.pages ?? [];
  // Blocks are the prose; tables come out of the same layer as rows of cells. Both are rendered,
  // in page order, so the generalist reads exactly what the product's own parser produced.
  const text = pages.map((page) => {
    const blocks = page.blocks.map((block) => block.text).filter((line) => line.trim().length > 0);
    const tables = page.tables.map((table) => {
      const header = table.header && table.header.length > 0 ? [table.header.join(" | ")] : [];
      return [...header, ...table.rows.map((row) => row.cells.map((cell) => cell.text).join(" | "))].join("\n");
    });
    return [`[página ${page.n}]${page.scanned ? " (página sem texto extraível)" : ""}`, ...blocks, ...tables].join("\n");
  }).join("\n\n");
  return {text, pages: pages.length};
}

async function sourceFromEntry(packDir: string, entry: SourcePackEntry, companyPattern: RegExp): Promise<BaselineSource> {
  const common = {
    id: entry.id, title: entry.title, url: entry.url, asOfDate: entry.asOfDate, version: entry.version,
    licencePolicy: entry.licence.policy, contentType: entry.contentType, sha256: entry.path ? entry.sha256 : null,
  };
  if (!entry.path) return {...common, text: null, rendering: "not_retained", note: entry.licence.note ?? "consulta manual, sem bytes"};
  const bytes = new Uint8Array(readFileSync(join(packDir, entry.path)));
  if (/pdf/i.test(entry.contentType)) {
    const {text} = await pdfText(bytes, entry.path, entry.id);
    return {...common, text, rendering: "full_text"};
  }
  if (/csv/i.test(entry.contentType) || entry.path.endsWith(".csv")) {
    const decoded = Buffer.from(bytes).toString(bytes.byteLength > 200_000 ? "latin1" : "utf8");
    if (bytes.byteLength > 200_000) {
      const filtered = filterCsvRows(decoded, companyPattern);
      return {...common, text: filtered.text, rendering: "filtered_rows", note: `${filtered.kept} de ${filtered.total} linhas, as que citam a companhia`};
    }
    return {...common, text: decoded, rendering: "full_text"};
  }
  if (/json|text\//i.test(entry.contentType)) return {...common, text: Buffer.from(bytes).toString("utf8"), rendering: "full_text"};
  return {...common, text: null, rendering: "metadata_only", note: "arquivo compactado; os documentos que ele indexa entram como fontes próprias"};
}

async function main(): Promise<void> {
  const spec = cases[caseKey];
  if (!spec) {
    console.error(`unknown case "${caseKey}". Available: ${Object.keys(cases).join(", ")}`);
    process.exit(2);
  }
  const startedAt = new Date();
  const runDir = resolve(option("out", join(repo, "docs", "product", "gold-cases", "runs", caseKey, "baseline", startedAt.toISOString().slice(0, 19).replace(/[:T]/g, "-"))));

  const documents: BaselineDocument[] = [];
  for (const document of spec.documents) {
    const bytes = new Uint8Array(readFileSync(join(spec.assetsDir, document.fileName)));
    const {text, pages} = await pdfText(bytes, document.fileName, document.id);
    documents.push({id: document.id, title: document.title, fileName: document.fileName, sha256: sha256(bytes), pages, text});
    console.log(`document ${document.id}: ${pages} pages, ${text.length} chars`);
  }

  const packDir = join(spec.assetsDir, "source-pack");
  const pack = sourcePackSchema.parse(JSON.parse(readFileSync(join(packDir, "source-pack.json"), "utf8")));
  const sources: BaselineSource[] = [];
  for (const entry of pack.entries) {
    const source = await sourceFromEntry(packDir, entry, spec.companyPattern);
    sources.push(source);
    console.log(`source ${source.id}: ${source.rendering}, ${source.text?.length ?? 0} chars`);
  }

  const turns = spec.turnIds.map((id) => {
    const turn = intentGoldTurns.find((entry) => entry.id === id);
    if (!turn) throw new Error(`gold turn ${id} not found`);
    return {id, text: turn.message};
  });

  const base = baselineInformationBaseSchema.parse({
    caseId: spec.caseId, caseVersion: spec.caseVersion, language: "pt-BR", asOfDate: spec.asOfDate,
    professionalContext: spec.professionalContext, turns, documents, sources,
  });
  const rendered = renderInformationBase(base);
  const baseHash = informationBaseHash(base);
  console.log(`information base: ${rendered.length} chars (~${Math.round(rendered.length / 3.2)} tokens), sha256 ${baseHash.slice(0, 16)}`);
  const dump = option("dump", "");
  if (dump) {
    writeFileSync(resolve(dump), rendered, "utf8");
    console.log(`information base written to ${resolve(dump)}`);
  }
  if (dryRun) {
    console.log("dry run: no model called");
    return;
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!anthropicKey && !openaiKey) {
    console.error("no model key in the environment. Run with `--env-file=.env.local`");
    process.exit(2);
  }
  const gateway = createModelGateway({
    adapters: {
      ...(anthropicKey ? {anthropic: createAnthropicAdapter({apiKey: anthropicKey})} : {}),
      ...(openaiKey ? {openai: createOpenAIAdapter({apiKey: openaiKey})} : {}),
    },
    budget: {maxCostUsd: Number(option("max-cost", "25"))},
    onCall: (call) => console.log(`    ${call.provider}/${call.model} ${call.usage.inputTokens}→${call.usage.outputTokens} tok  $${call.costUsd.toFixed(4)}  ${call.latencyMs}ms`),
  });

  mkdirSync(runDir, {recursive: true});
  const conversation: ContentPart[] = [{type: "text", text: rendered}];
  const recordTurns: BaselineRunRecord["turns"] = [];
  let provider = "";
  let model = "";
  let effort = "";
  for (const [index, turn] of turns.entries()) {
    const message = renderTurnMessage(turn, index);
    conversation.push({type: "text", text: message});
    const started = Date.now();
    const result = await gateway.complete({
      task: "baseline_generalist",
      system: BASELINE_SYSTEM_PROMPT,
      input: conversation,
      schema: baselineOutputSchema,
      schemaName: "baseline_deliverable",
      metadata: {surface: "gold_baseline", caseId: spec.caseId, turn: turn.id},
    });
    const deliverable = result.output.deliverable;
    const outputFile = `${turn.id}.output.md`;
    writeFileSync(join(runDir, outputFile), `${deliverable.trimEnd()}\n`, "utf8");
    conversation.push({type: "text", text: `## Resposta ao turno ${index + 1} (sua entrega anterior)\n\n${deliverable}`});
    provider = result.provider;
    model = result.model;
    effort = result.effort;
    recordTurns.push({
      id: turn.id, messageSha256: sha256(message), outputSha256: sha256(deliverable), outputFile,
      inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens, cachedInputTokens: result.usage.cachedInputTokens,
      costUsd: result.costUsd, latencyMs: Date.now() - started, stopReason: "end",
    });
    console.log(`turn ${turn.id}: ${deliverable.length} chars written to ${outputFile}`);
  }

  const record = baselineRunRecordSchema.parse({
    schemaVersion: "gold-baseline-run.v1",
    caseId: spec.caseId, caseVersion: spec.caseVersion, asOfDate: spec.asOfDate,
    startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(),
    provider, model, effort,
    systemPromptSha256: sha256(BASELINE_SYSTEM_PROMPT),
    informationBaseSha256: baseHash, informationBaseChars: rendered.length,
    inputs: {
      documents: documents.map((document) => ({id: document.id, sha256: document.sha256, pages: document.pages, chars: document.text.length})),
      sources: sources.map((source) => ({id: source.id, sha256: source.sha256, rendering: source.rendering, chars: source.text?.length ?? 0})),
    },
    turns: recordTurns,
    totalCostUsd: gateway.spent().costUsd,
    caveats: [
      "PDFs entraram como texto extraído por página (camada de texto do pdfjs); tabelas aparecem como linhas de texto, sem grade.",
      "Arquivos compactados do pack (índices da CVM) entraram só como metadados; os documentos que eles indexam entraram por inteiro.",
      "O cadastro de companhias abertas entrou filtrado às linhas que citam a companhia.",
    ],
  });
  writeFileSync(join(runDir, "run.json"), `${JSON.stringify(record, null, 2)}\n`, "utf8");
  console.log(`run record: ${join(runDir, "run.json")}; total $${record.totalCostUsd.toFixed(4)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
