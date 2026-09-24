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
 * Every request must fit the models that may answer it (§5.1): the attached documents go whole,
 * and the pack's sources follow in the declared category order, each whole or as a reference
 * only, up to the case's declared token budget per request. The script prints each source's
 * decision, each turn's estimated input on each route and the reservation of every attempt;
 * `--max-cost` defaults to the sum of those reservations, the budget under which no attempt the
 * evaluation may make is refused for money.
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
import {defaultTaskPolicies} from "@offroad/model-gateway";
import {sourcePackSchema} from "@offroad/public-research";

import {
  baselineGeneralistSnapshotSchema,
  baselineInformationBaseSchema,
  baselineSelectionCaveat,
  baselineSnapshotContentHashes,
  informationBaseHash,
  readBaselineGovernedResult,
  renderInformationBase,
  selectBaselineInformationBase,
  type BaselineDocument,
  type BaselineSource,
  type BaselineSourceCategory,
} from "../src/gold-baseline";
import {baselinePdfText, baselineSourceFromPackEntry} from "../src/gold-baseline-materials";
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
  /**
   * The declared token budget of each request, by the gateway's estimator (§5.1): for gc01 the
   * largest request both routes take with room for the whole answer (Claude Opus 5, 1,000,000
   * less the 32,000-token output ceiling; GPT-5.6 Sol, 922,000 by its own lower estimate),
   * rounded down.
   */
  requestInputTokenBudget: number;
  /** Every source of the pack in one declared category; a source without one stops the run. */
  sourceCategories: Record<string, BaselineSourceCategory>;
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
    requestInputTokenBudget: 960_000,
    sourceCategories: {
      ri_release_1t26: "periodic_report", ri_apresentacao_1t26: "periodic_report", cvm_dfp_2025: "periodic_report", cvm_itr_1t26_enet: "periodic_report",
      "anbima_ettj_2026-09-04": "market_data", bcb_sgs_cdi_diario: "market_data", bcb_sgs_selic_meta: "market_data", anbima_data_emissoes: "market_data",
      "ca_notas_comerciais_2026-05-27": "corporate_event", "ca_operacao_estruturada_2026-05-27": "corporate_event", "ca_governanca_2026-07-14": "corporate_event",
      ca_aprovacao_itr_1t26: "corporate_event", calendario_eventos_2026: "corporate_event", cm_conclusao_11a: "corporate_event", cm_conclusao_13a_cra: "corporate_event",
      cm_conclusao_14a: "corporate_event", cm_conclusao_15a: "corporate_event", cra_389_anuncio_encerramento: "corporate_event",
      cvm_cadastro_cia_aberta: "registry", cvm_ipe_2026: "registry",
      af_11a_emissao: "debt_status_report", af_13a_emissao: "debt_status_report", af_14a_emissao: "debt_status_report", af_15a_emissao: "debt_status_report",
      af_debenture_verde: "debt_status_report", cra_257_relatorio_mensal_4t25: "debt_status_report", cra_292_relatorio_mensal_4t25: "debt_status_report",
      cra_329_relatorio_mensal_4t25: "debt_status_report",
      escritura_11a_emissao: "debt_indenture", aditamento_11a_emissao: "debt_indenture", escritura_12a_emissao: "debt_indenture", escritura_13a_emissao: "debt_indenture",
      escritura_14a_emissao: "debt_indenture", escritura_15a_emissao: "debt_indenture",
      cra_257_termo_securitizacao: "securitization_terms", cra_257_aditamento_1: "securitization_terms", cra_292_termo_securitizacao: "securitization_terms",
      cra_292_aditamento_1: "securitization_terms", cra_292_aditamento_2: "securitization_terms", cra_329_termo_securitizacao: "securitization_terms",
      cra_329_aditamento_1: "securitization_terms", cra_389_termo_securitizacao: "securitization_terms", cra_389_aditamento_1: "securitization_terms",
    },
  },
};

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
    // Hashed before parsing: the parser transfers the buffer, which reads as empty afterwards.
    const contentHash = sha256(bytes);
    const {text, pages} = await baselinePdfText(bytes, document.fileName, document.id);
    documents.push({id: document.id, title: document.title, fileName: document.fileName, sha256: contentHash, pages, text});
    console.log(`document ${document.id}: ${pages} pages, ${text.length} chars`);
  }

  const packDir = join(spec.assetsDir, "source-pack");
  const pack = sourcePackSchema.parse(JSON.parse(readFileSync(join(packDir, "source-pack.json"), "utf8")));
  const stray = Object.keys(spec.sourceCategories).filter((id) => !pack.entries.some((entry) => entry.id === id));
  if (stray.length > 0) throw new Error(`categories declared for sources outside the pack: ${stray.join(", ")}`);
  const sources: BaselineSource[] = [];
  for (const entry of pack.entries) {
    const source = await baselineSourceFromPackEntry(packDir, entry, spec.companyPattern);
    sources.push(source);
    console.log(`source ${source.id}: ${source.rendering}, ${source.text?.length ?? 0} chars`);
  }

  const turns = spec.turnIds.map((id) => {
    const turn = intentGoldTurns.find((entry) => entry.id === id);
    if (!turn) throw new Error(`gold turn ${id} not found`);
    return {id, text: turn.message};
  });

  // The complete material: the schema requires the turns, the documents and the sources. Then the
  // declared selection makes every request fit the routes that may answer it; the hash below covers
  // every byte the model reads, the references of the sources left out included.
  const policy = defaultTaskPolicies.baseline_generalist;
  const model = {primary: policy.primary, fallback: policy.fallback ?? null, maxOutputTokens: policy.maxOutputTokens};
  const {base, selection} = selectBaselineInformationBase({
    base: baselineInformationBaseSchema.parse({caseId: spec.caseId, caseVersion: spec.caseVersion, language: "pt-BR", asOfDate: spec.asOfDate, turns, documents, sources}),
    categories: spec.sourceCategories, model, requestInputTokenBudget: spec.requestInputTokenBudget,
  });
  for (const source of selection.sources) {
    console.log(`selection ${source.id}: ${source.category}, ~${source.estimatedTokens} tokens, ${source.included ? "included" : "reference only"}`);
  }
  console.log(`request budget: ${selection.requestInputTokenBudget} estimated tokens per request; earlier deliverables at ${selection.deliverableAllowanceTokens} tokens each`);
  for (const turn of selection.turns) {
    console.log(`request ${turn.turnId}: ${turn.routes.map((route) => `${route.provider}/${route.model} ~${route.estimatedInputTokens} of ${route.ceilingInputTokens} tokens, reservation $${route.reservationUsd.toFixed(4)}`).join("; ")}`);
  }
  console.log(`reservations of every attempt: $${selection.maxCostUsd.toFixed(2)}`);
  const rendered = renderInformationBase(base);
  const baseHash = informationBaseHash(base);
  console.log(`information base: ${rendered.length} chars (~${selection.turns[0]!.routes[0]!.estimatedInputTokens} tokens), sha256 ${baseHash.slice(0, 16)}`);
  const dump = option("dump", "");
  if (dump) {
    writeFileSync(resolve(dump), rendered, "utf8");
    console.log(`information base written to ${resolve(dump)}`);
  }
  // The snapshot a governed evaluation of this case carries: the base, the model settings of the
  // baseline task and the caveats the run record repeats. Its canonical bytes are what the worker
  // receives and what the evaluation contract fingerprints.
  const snapshot = baselineGeneralistSnapshotSchema.parse({
    schemaVersion: "gold-baseline-snapshot.v1",
    informationBase: base,
    model,
    caveats: [
      "PDFs entraram como texto extraído por página (camada de texto do pdfjs); tabelas aparecem como linhas de texto, sem grade.",
      "Arquivos compactados do pack (índices da CVM) entraram só como metadados; os documentos que eles indexam entraram por inteiro, salvo os que não couberam no limite do pedido.",
      "O cadastro de companhias abertas entrou filtrado às linhas que citam a companhia.",
      baselineSelectionCaveat(selection),
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
  // By default the budget is every attempt the evaluation may make at its reservation, so no
  // attempt is refused for money; a smaller --max-cost is honored and may end the run partial.
  const maxCostUsd = Number(option("max-cost", selection.maxCostUsd.toFixed(2)));
  const pollSeconds = Number(option("poll-seconds", "5"));
  const requestId = option("request-id", "");
  if (!Number.isFinite(maxCostUsd) || maxCostUsd <= 0 || !Number.isSafeInteger(Math.round(maxCostUsd * 1_000_000))
    || !Number.isFinite(pollSeconds) || pollSeconds < 1) {
    console.error("--max-cost must be a positive number of dollars and --poll-seconds at least 1");
    process.exit(2);
  }
  const firstReservation = selection.turns[0]!.routes[0]!.reservationUsd;
  if (maxCostUsd < firstReservation) {
    console.error(`--max-cost ${maxCostUsd} is below the reservation of the first attempt ($${firstReservation.toFixed(4)}): the evaluation would end partial before anything is sent`);
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
