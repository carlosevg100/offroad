/**
 * `pnpm --filter @offroad/evals baseline:gold --case gc01 [--dry-run] [--out <dir>] [--max-cost <usd>]
 *  [--request-id <uuid>] [--poll-seconds <n>]`
 *
 * Runs the fair baseline of a gold case (gold-cases/README.md §5): the strongest generalist
 * receives the same turns, the same documents, the equivalent content of the frozen source
 * pack and the same time window, with no tools and no hint of the rubric. Outputs and a run
 * record with every input hash land beside the case so the review panel reads both sides.
 * `--dry-run` assembles and hashes the information base without calling any model.
 *
 * The live run never reaches a provider from this process. It requests a governed evaluation
 * through the evaluator's own session (`../src/governed-transport`), the worker runs the baseline
 * family under the database's reservations, and this script writes the run record and the
 * deliverables the database committed, beside `evaluation.json` with the evaluation's identity,
 * fingerprints, reservations and cost. The environment carries the evaluator's credential and the
 * evaluation organization (SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, OFFROAD_EVALUATOR_EMAIL,
 * OFFROAD_EVALUATOR_PASSWORD, OFFROAD_EVALUATION_ORGANIZATION_ID), never a provider key.
 * `--request-id` resumes an earlier request instead of creating another evaluation. A partial
 * evaluation writes only `evaluation.json` and exits with status 3.
 */
import {createHash} from "node:crypto";
import {mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";

import {executionCanonicalText} from "@offroad/agent-contracts";
import {parsePdf} from "@offroad/document-parsers";
import {defaultTaskPolicies} from "@offroad/model-gateway";
import {sourcePackSchema, type SourcePackEntry} from "@offroad/public-research";

import {
  baselineGeneralistSnapshotSchema,
  baselineInformationBaseSchema,
  baselineSnapshotContentHashes,
  filterCsvRows,
  informationBaseHash,
  readBaselineGovernedResult,
  renderInformationBase,
  type BaselineDocument,
  type BaselineSource,
} from "../src/gold-baseline";
import {governedEvaluationEvidence, readGovernedTransportEnvironment, requestGovernedEvaluation} from "../src/governed-transport";
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
/** How long a request may wait for the worker to claim it, beyond the work the budget allows. */
const queueAllowanceMs = 30 * 60_000;

/** The frozen inputs of each case, exactly as the case file lists them. */
const cases: Record<string, {
  caseId: string;
  caseVersion: string;
  asOfDate: string;
  assetsDir: string;
  documents: Array<{id: string; title: string; fileName: string}>;
  turnIds: string[];
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

  // The complete base: the schema requires the turns, the documents and the sources, and the
  // hash below must cover every byte the model would read, the documents included.
  const base = baselineInformationBaseSchema.parse({
    caseId: spec.caseId, caseVersion: spec.caseVersion, language: "pt-BR", asOfDate: spec.asOfDate,
    turns, documents, sources,
  });
  const rendered = renderInformationBase(base);
  const baseHash = informationBaseHash(base);
  console.log(`information base: ${rendered.length} chars (~${Math.round(rendered.length / 3.2)} tokens), sha256 ${baseHash.slice(0, 16)}`);
  const dump = option("dump", "");
  if (dump) {
    writeFileSync(resolve(dump), rendered, "utf8");
    console.log(`information base written to ${resolve(dump)}`);
  }
  // The snapshot a governed evaluation of this case carries: the base, the model settings of the
  // baseline task and the caveats the run record repeats. Its canonical bytes are what the worker
  // receives and what the evaluation contract fingerprints.
  const policy = defaultTaskPolicies.baseline_generalist;
  const snapshot = baselineGeneralistSnapshotSchema.parse({
    schemaVersion: "gold-baseline-snapshot.v1",
    informationBase: base,
    model: {primary: policy.primary, fallback: policy.fallback ?? null, maxOutputTokens: policy.maxOutputTokens},
    caveats: [
      "PDFs entraram como texto extraído por página (camada de texto do pdfjs); tabelas aparecem como linhas de texto, sem grade.",
      "Arquivos compactados do pack (índices da CVM) entraram só como metadados; os documentos que eles indexam entraram por inteiro.",
      "O cadastro de companhias abertas entrou filtrado às linhas que citam a companhia.",
    ],
  });
  const snapshotText = executionCanonicalText(snapshot);
  console.log(`evaluation snapshot: ${Buffer.byteLength(snapshotText, "utf8")} bytes, sha256 ${sha256(snapshotText).slice(0, 16)}`);
  if (dryRun) {
    console.log("dry run: no model called");
    return;
  }

  // Live: the worker runs the baseline family under the governed transport. This process holds no
  // provider key and builds no adapter or gateway; it asks through the evaluator's session and
  // writes what the database committed.
  const maxCostUsd = Number(option("max-cost", "25"));
  const pollSeconds = Number(option("poll-seconds", "5"));
  const requestId = option("request-id", "");
  if (!Number.isFinite(maxCostUsd) || maxCostUsd <= 0 || !Number.isSafeInteger(Math.round(maxCostUsd * 1_000_000))
    || !Number.isFinite(pollSeconds) || pollSeconds < 1) {
    console.error("--max-cost must be a positive number of dollars and --poll-seconds at least 1");
    process.exit(2);
  }
  // Each turn sends once and may fall back once, and every call may take the task's whole timeout.
  // The worker reserves each attempt at its list-price upper bound before sending it.
  const routes = snapshot.model.fallback ? [snapshot.model.primary, snapshot.model.fallback] : [snapshot.model.primary];
  const maxModelCalls = snapshot.informationBase.turns.length * routes.length;
  const maxDurationMs = maxModelCalls * policy.timeoutMs;
  const budget = {maxCostMicrousd: Math.round(maxCostUsd * 1_000_000), maxModelCalls, maxDurationMs, expiresInMs: maxDurationMs + queueAllowanceMs};
  console.log(`evaluation budget: ${budget.maxCostMicrousd} microusd, ${maxModelCalls} calls, ${maxDurationMs} ms of work`);
  const evaluation = await requestGovernedEvaluation({
    audience: {caseId: spec.caseId, caseVersion: spec.caseVersion, scriptId: "run-gold-baseline"},
    routes,
    budget,
    snapshot,
    sourceContentHashes: baselineSnapshotContentHashes(snapshot),
    ...(requestId ? {requestId} : {}),
  }, {
    environment: readGovernedTransportEnvironment(),
    pollIntervalMs: pollSeconds * 1000,
    onProgress: (progress) => {
      if (progress.phase === "requested") console.log(`evaluation requested: ${progress.executionId} (${progress.request}), request ${progress.requestId}`);
      if (progress.phase === "waiting") console.log(`evaluation waiting: job ${progress.job ?? "unknown"}, run ${progress.run ?? "unknown"}, attempts ${progress.attempts ?? 0}`);
    },
  });

  mkdirSync(runDir, {recursive: true});
  writeFileSync(join(runDir, "evaluation.json"), `${JSON.stringify(governedEvaluationEvidence(evaluation), null, 2)}\n`, "utf8");
  console.log(`evaluation committed: ${evaluation.outcome}/${evaluation.reason}, ${evaluation.cost.spentMicrousd} microusd over ${evaluation.cost.spentCalls} calls`);
  if (evaluation.outcome !== "succeeded") {
    // A partial evaluation publishes only its reason: there is no record and no deliverable to write.
    console.error(`evaluation ${evaluation.executionId} is partial: ${evaluation.reason}`);
    process.exitCode = 3;
    return;
  }
  const {record, outputs} = readBaselineGovernedResult(evaluation.result, snapshot);
  for (const output of outputs) {
    writeFileSync(join(runDir, output.file), `${output.deliverable.trimEnd()}\n`, "utf8");
    console.log(`turn ${output.turnId}: ${output.deliverable.length} chars written to ${output.file}`);
  }
  writeFileSync(join(runDir, "run.json"), `${JSON.stringify(record, null, 2)}\n`, "utf8");
  console.log(`run record: ${join(runDir, "run.json")}; total $${record.totalCostUsd.toFixed(4)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
