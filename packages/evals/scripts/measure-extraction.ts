/**
 * Runs the real extractor over a gold case and scores it, with no fixture playback anywhere.
 *
 * This is the number that says whether the product reads documents or only claims to. Every
 * file is parsed for real, every candidate is produced by a real model call and checked
 * against the document it cites, and the result is scored by the same harness that scores the
 * fixture. Cost is reported because "how good" without "at what price" is half an answer.
 *
 * The document kind is taken from the gold profiles on purpose: this measures extraction (E3)
 * in isolation, not classification (E1). Mixing them would hide which half is failing.
 *
 * No model is called from this process. The documents are parsed here, as before, and the
 * extraction runs in the worker as a governed evaluation (the `measure-extraction` family): this
 * script requests it through the evaluator's own session (`../src/governed-transport`), the worker
 * reserves every pass in the database before sending it, and the script reads back what the
 * database committed, bound to the snapshot it sent, then reconciles and scores it here. The gold
 * expectations never leave this process. The environment carries the evaluator's credential and
 * the evaluation organization (SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, OFFROAD_EVALUATOR_EMAIL,
 * OFFROAD_EVALUATOR_PASSWORD, OFFROAD_EVALUATION_ORGANIZATION_ID), never a provider key.
 *
 * A live run needs `--max-cost`, in dollars at list price with every reservation included. There
 * is no default: what a measurement may spend is decided by whoever asks for it. `--dry-run`
 * parses the documents and assembles the snapshot and its budget without requesting anything.
 * `--request-id` resumes an earlier request. A partial evaluation writes only its evaluation
 * evidence and exits with status 3.
 *
 *   pnpm --filter @offroad/evals measure -- rede-horizonte [provider/model@effort] --max-cost <usd>
 *     [--dry-run] [--out <dir>] [--request-id <uuid>] [--poll-seconds <n>]
 */
import {createHash} from "node:crypto";
import {readFileSync, writeFileSync, mkdirSync} from "node:fs";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";

import {executionCanonicalText} from "@offroad/agent-contracts";
import {createTesseractEngine, parseDocument, toolVersion, type OcrEngine} from "@offroad/document-parsers";
import {
  documentExtractionVersion,
  extractionMeasurementContentHashes,
  extractionMeasurementPasses,
  extractionMeasurementRoutes,
  extractionMeasurementSnapshotSchema,
  extractionPromptVersion,
  readExtractionMeasurementResult,
  type ExtractionMeasurementDocument,
} from "@offroad/document-extraction";
import {defaultTaskPolicies, resolveModel} from "@offroad/model-gateway";
import type {DocumentProfile} from "@offroad/document-intelligence";
import {documentKindDefinition, type DocumentKind} from "@offroad/credit-ontology";
import {archetypeIdSchema} from "@offroad/credit-playbook";
import {reconcileCase} from "@offroad/reconciliation";

import {evaluateSnapshot} from "../src/metrics";
import {loadGoldCase} from "../src/gold";
import {governedEvaluationEvidence, readGovernedTransportEnvironment, requestGovernedEvaluation} from "../src/governed-transport";
import type {ExtractionSnapshot, SnapshotCandidate, SnapshotProfile} from "../src/snapshot";
import {renderMarkdownReport} from "../src/report";

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const valued = new Set(["--max-cost", "--out", "--request-id", "--poll-seconds"]);
const options = new Map<string, string>();
const positional: string[] = [];
for (let index = 0; index < argv.length; index++) {
  const arg = argv[index]!;
  if (arg === "--") continue;
  if (valued.has(arg)) {
    options.set(arg.slice(2), argv[index + 1] ?? "");
    index += 1;
  } else if (arg === "--dry-run") options.set("dry-run", "true");
  else if (arg.startsWith("--")) {
    console.error(`unknown option ${arg}`);
    process.exit(2);
  } else positional.push(arg);
}
const option = (name: string, fallback = ""): string => options.get(name) || fallback;
const dryRun = options.has("dry-run");
const caseId = positional[0] ?? "rede-horizonte";
/**
 * `provider/model@effort`, e.g. `openai/gpt-5.6-terra@medium`. Absent means the task policy
 * decides, which is what production does. The worker runs only production-allowlisted models, so
 * a sweep candidate outside the allowlist is refused here, before anything is requested.
 */
const modelArg = positional[1] ?? process.env.MODEL ?? "";
const modelOverride = modelArg
  ? (() => {
      const [reference, effort] = modelArg.split("@");
      const [provider, ...rest] = reference!.split("/");
      if (provider !== "anthropic" && provider !== "openai") throw new Error(`unknown provider in --model: ${modelArg}`);
      const ref: {provider: "anthropic" | "openai"; model: string; effort?: "low" | "medium" | "high" | "xhigh" | "max"} = {provider, model: rest.join("/")};
      if (effort) ref.effort = effort as "low" | "medium" | "high" | "xhigh" | "max";
      return ref;
    })()
  : undefined;
const goldDir = join(here, "..", "..", "testing-fixtures", "gold", caseId);
const sha256 = (value: string | Uint8Array): string => createHash("sha256").update(value).digest("hex");
/** How long a request may wait for the worker to claim it, beyond the work the budget allows. */
const queueAllowanceMs = 30 * 60_000;

async function main(): Promise<void> {
  const gold = loadGoldCase(goldDir);
  const documentsDir = join(goldDir, gold.manifest.documentsDir);
  const outDir = resolve(option("out", join(here, "..", "out")));

  // The same Tesseract the worker runs, when the machine has it. Without it, a scanned page is
  // parsed as empty and the report says so instead of pretending the OCR path was measured.
  const tesseractBin = process.env.TESSERACT_BIN ?? "tesseract";
  const tesseractVersion = await toolVersion(tesseractBin);
  const ocr: OcrEngine | null = tesseractVersion === "unavailable"
    ? null
    : createTesseractEngine({bin: tesseractBin, pdftoppmBin: process.env.PDFTOPPM_BIN ?? "pdftoppm", languages: process.env.OCR_LANGUAGES ?? "por+eng", timeoutMs: 120_000, version: tesseractVersion});
  console.log(ocr ? `OCR: ${tesseractVersion}` : "OCR: indisponível nesta máquina (páginas escaneadas serão lidas como vazias)");

  // Parsing stays here, where the files are: the snapshot carries each layer and the profile the
  // gold hands the extractor, never the gold's expected values.
  const documents: ExtractionMeasurementDocument[] = [];
  const parseMs = new Map<string, number>();
  for (const entry of gold.manifest.documents) {
    const goldProfile = gold.profiles.find((profile) => profile.document === entry.name);
    if (!goldProfile) {
      console.log(`\n${entry.name}\n    sem perfil no gold set, pulado`);
      continue;
    }

    const kind = goldProfile.kind as DocumentKind;
    const definition = documentKindDefinition(kind);
    const startedAt = Date.now();
    const bytes = new Uint8Array(readFileSync(join(documentsDir, entry.name)));
    const parsed = await parseDocument(
      {bytes, documentId: entry.name, documentVersion: 1, fileName: entry.name, localeHint: "pt-BR"},
      ocr ? {ocr} : {},
    );
    parseMs.set(entry.name, Date.now() - startedAt);

    const profile: DocumentProfile = {
      documentId: entry.name,
      kind,
      informationClass: definition.informationClass,
      evidenceRank: definition.evidenceRank,
      ...(goldProfile.entityName ? {entityName: goldProfile.entityName} : {}),
      ...(goldProfile.periodEnd ? {periodEnd: goldProfile.periodEnd} : {}),
      language: "pt",
      quality: {alerts: []},
      confidence: 1,
    };
    documents.push({name: entry.name, sha256: sha256(bytes), profile, layer: parsed.layer});
  }

  // The routes the task policy gives this run: the worker's gateway takes the same policy from the snapshot.
  let resolved: ReturnType<typeof resolveModel>;
  try {
    resolved = resolveModel("extract_fields", defaultTaskPolicies, {override: modelOverride});
  } catch {
    console.error(`${modelArg} is not a production-allowlisted model; the governed evaluation runs only those, so a sweep of it cannot run through the worker`);
    process.exit(2);
  }
  const snapshot = extractionMeasurementSnapshotSchema.parse({
    schemaVersion: "extraction-measurement-snapshot.v1",
    caseId: gold.manifest.caseId,
    caseVersion: gold.manifest.version,
    extractor: {version: documentExtractionVersion, promptVersion: extractionPromptVersion()},
    model: {primary: resolved.primary, fallback: resolved.fallback ?? null, maxOutputTokens: resolved.policy.maxOutputTokens, timeoutMs: resolved.policy.timeoutMs},
    documents,
  });
  const snapshotText = executionCanonicalText(snapshot);
  const plan = await extractionMeasurementPasses(snapshot);
  const passes = plan.reduce((total, count) => total + count, 0);
  // Each pass sends once and may fall back once, and every call may take the task's whole timeout.
  // The worker reserves each attempt at its list-price upper bound before sending it.
  const routes = extractionMeasurementRoutes(snapshot);
  const maxModelCalls = passes * routes.length;
  const maxDurationMs = maxModelCalls * snapshot.model.timeoutMs;
  console.log(`\nevaluation snapshot: ${snapshot.documents.length} documents, ${passes} passes, ${Buffer.byteLength(snapshotText, "utf8")} bytes, sha256 ${sha256(snapshotText).slice(0, 16)}`);
  console.log(`evaluation routes: ${routes.map((route) => `${route.provider}/${route.model}@${route.effort}`).join(", ")}; at most ${maxModelCalls} calls, ${maxDurationMs} ms of work`);
  if (dryRun) {
    console.log("dry run: no model called");
    return;
  }

  // Live: the worker runs the extraction family under the governed transport. This process holds
  // no provider key and builds no adapter or gateway; it asks through the evaluator's session and
  // reads back what the database committed.
  const maxCostUsd = Number(option("max-cost"));
  const pollSeconds = Number(option("poll-seconds", "5"));
  const requestId = option("request-id");
  if (!option("max-cost") || !Number.isFinite(maxCostUsd) || maxCostUsd <= 0 || !Number.isSafeInteger(Math.round(maxCostUsd * 1_000_000))
    || !Number.isFinite(pollSeconds) || pollSeconds < 1) {
    console.error("a live run needs --max-cost, a positive number of dollars at list price with every reservation included (there is no default), and --poll-seconds of at least 1");
    process.exit(2);
  }
  const budget = {maxCostMicrousd: Math.round(maxCostUsd * 1_000_000), maxModelCalls, maxDurationMs, expiresInMs: maxDurationMs + queueAllowanceMs};
  console.log(`evaluation budget: ${budget.maxCostMicrousd} microusd, ${maxModelCalls} calls, ${maxDurationMs} ms of work`);
  const evaluation = await requestGovernedEvaluation({
    audience: {caseId: snapshot.caseId, caseVersion: snapshot.caseVersion, scriptId: "measure-extraction"},
    routes,
    budget,
    snapshot,
    sourceContentHashes: extractionMeasurementContentHashes(snapshot),
    ...(requestId ? {requestId} : {}),
  }, {
    environment: readGovernedTransportEnvironment(),
    pollIntervalMs: pollSeconds * 1000,
    onProgress: (progress) => {
      if (progress.phase === "requested") console.log(`evaluation requested: ${progress.executionId} (${progress.request}), request ${progress.requestId}`);
      if (progress.phase === "waiting") console.log(`evaluation waiting: job ${progress.job ?? "unknown"}, run ${progress.run ?? "unknown"}, attempts ${progress.attempts ?? 0}`);
    },
  });

  mkdirSync(outDir, {recursive: true});
  writeFileSync(join(outDir, `extraction-${caseId}.evaluation.json`), `${JSON.stringify(governedEvaluationEvidence(evaluation), null, 2)}\n`, "utf8");
  console.log(`evaluation committed: ${evaluation.outcome}/${evaluation.reason}, ${evaluation.cost.spentMicrousd} microusd over ${evaluation.cost.spentCalls} calls`);
  if (evaluation.outcome !== "succeeded") {
    // A partial evaluation publishes only its reason: there is no extraction to score.
    console.error(`evaluation ${evaluation.executionId} is partial: ${evaluation.reason}`);
    process.exitCode = 3;
    return;
  }
  const measured = readExtractionMeasurementResult(evaluation.result, snapshot, plan);

  const candidates: SnapshotCandidate[] = [];
  const profiles: SnapshotProfile[] = [];
  /** Full per-candidate detail (flags, anchors, quotes): this is what makes a failure diagnosable offline. */
  const detail: Record<string, unknown> = {};
  const rawByDocument: Record<string, unknown[]> = {};
  const usage = {costUsd: 0, calls: 0};
  const perDocument: Array<{document: string; candidates: number; unverified: number; absent: number; chunks: number; failed: number; costUsd: number; ms: number}> = [];

  snapshot.documents.forEach((document, index) => {
    const {extraction: result, failures, ms} = measured.documents[index]!;
    const {profile} = document;
    const definition = documentKindDefinition(profile.kind);
    console.log(`\n${document.name}  [${profile.kind}]`);
    // A lost chunk is the difference between "this document has nothing" and "we failed to
    // read it", so it is said per document instead of only showing up as a missing number.
    for (const failure of failures) console.log(`    !! trecho ${failure.pass}/${failure.of} falhou: ${failure.message}`);

    const unverified = result.candidates.filter((candidate) => !candidate.anchor_verified).length;
    console.log(
      `    ${result.candidates.length} candidatos (${unverified} sem âncora confirmada), ${result.rejected.length} recusados, ${result.malformed} malformados, ${result.absentFields.length} ausentes, ${result.chunks.total} trecho(s)${result.chunks.failed ? `, ${result.chunks.failed} falharam` : ""}`,
    );

    usage.costUsd += result.usage.costUsd;
    usage.calls += result.usage.calls;
    perDocument.push({
      document: document.name,
      candidates: result.candidates.length,
      unverified,
      absent: result.absentFields.length,
      chunks: result.chunks.total,
      failed: result.chunks.failed,
      costUsd: result.usage.costUsd,
      // Reading here plus extracting in the worker: the time this document took, queueing aside.
      ms: (parseMs.get(document.name) ?? 0) + ms,
    });

    // The provider's own answer, kept verbatim. `pnpm --filter @offroad/evals rescore` replays
    // this through the current verifier, reconciliation and scoring without spending a cent, so
    // a change to any of them is measured in seconds instead of two hours.
    rawByDocument[document.name] = result.raw;

    detail[document.name] = {
      candidates: result.candidates.map((candidate) => ({
        field_path: candidate.field_path,
        value_raw: candidate.value_raw,
        normalized_value: candidate.normalized_value,
        anchor: candidate.anchor,
        quote: candidate.quote,
        confidence: candidate.confidence,
        anchor_verified: candidate.anchor_verified,
        verifier_flags: candidate.verifier_flags,
      })),
      rejected: result.rejected.map((rejection) => ({field_path: rejection.candidate.field_path, reason: rejection.reason})),
      absent: result.absentFields,
      alerts: result.alerts,
      malformed: result.malformed,
    };

    profiles.push({
      document: document.name,
      kind: profile.kind,
      informationClass: definition.informationClass,
      evidenceRank: definition.evidenceRank,
      ...(profile.entityName ? {entityName: profile.entityName} : {}),
    });

    for (const candidate of result.candidates) {
      candidates.push({
        fieldPath: candidate.field_path,
        normalizedValue: candidate.normalized_value,
        valueType: candidate.value_type,
        sourceDocument: document.name,
        ...(candidate.period?.start ? {periodStart: candidate.period.start} : {}),
        ...(candidate.period?.end ? {periodEnd: candidate.period.end} : {}),
        ...(candidate.entity?.scope ? {entityScope: candidate.entity.scope} : {}),
        informationClass: candidate.information_class,
        evidenceRank: definition.evidenceRank,
        confidence: candidate.confidence,
        anchorVerified: candidate.anchor_verified,
        anchorPrecision: candidate.anchor_precision,
        // Nothing is auto-accepted by this run: the auto-accept policy is a separate decision
        // (D-014) and claiming it here would corrupt the hallucination metric.
        autoAccepted: false,
      });
    }
  });

  // The same reconciliation the product runs, over the same candidates: the exceptions it raises
  // (and fails to raise) are part of what this measurement is for.
  const archetypeId = archetypeIdSchema.parse(gold.manifest.archetypeId ?? "other");
  const reconciliation = reconcileCase({
    archetypeId,
    candidates: candidates.map((candidate) => ({
      fieldPath: candidate.fieldPath,
      normalizedValue: candidate.normalizedValue,
      valueType: candidate.valueType,
      sourceDocument: candidate.sourceDocument ?? "",
      evidenceRank: candidate.evidenceRank,
      informationClass: candidate.informationClass,
      confidence: candidate.confidence,
      anchorVerified: candidate.anchorVerified,
      ...(candidate.periodStart ? {periodStart: candidate.periodStart} : {}),
      ...(candidate.periodEnd ? {periodEnd: candidate.periodEnd} : {}),
    })),
    documents: profiles.map((profile) => ({id: profile.document, kind: profile.kind as DocumentKind})),
    locale: "pt",
  });

  const extractionSnapshot: ExtractionSnapshot = {
    extractor: {name: "document-extraction", version: measured.extractor.version},
    documents: gold.manifest.documents.map((entry) => entry.name),
    profiles,
    candidates,
    exceptions: [
      ...reconciliation.exceptions.map((exception) => ({
        ruleId: exception.ruleId,
        type: exception.type,
        severity: exception.severity,
        title: exception.title,
        description: exception.description,
        fieldPaths: [...new Set(exception.evidence.map((entry) => entry.fieldPath).filter((path): path is string => Boolean(path)))],
      })),
      // A gap the reconciliation names (a missing document, a missing material fact) is an
      // exception the gold may expect; scoring only the rules would hide whether it was seen.
      ...reconciliation.gaps.map((gap) => ({type: "missing", severity: gap.severity, title: gap.title, description: gap.description})),
    ],
    calculations: reconciliation.calculations.map((calculation) => ({id: calculation.id, value: calculation.value})),
    usage,
  };
  console.log(`\nConciliação: ${reconciliation.exceptions.length} exceção(ões), ${reconciliation.calculations.length} cálculo(s)`);
  for (const exception of reconciliation.exceptions) console.log(`  [${exception.severity}] ${exception.ruleId} ${exception.title}: ${exception.description.slice(0, 160)}`);

  const report = evaluateSnapshot(gold, extractionSnapshot);
  console.log(`\n### Modelo\n\n${modelArg ? `sweep: ${modelArg} (não é o modelo de produção; a política decide em produção)` : "política da tarefa (o que produção usa)"}`);
  console.log(`\n${renderMarkdownReport(report)}`);

  console.log("\nPor documento:");
  for (const row of perDocument) {
    console.log(`  ${row.document.padEnd(52)} ${String(row.candidates).padStart(4)} cand  ${String(row.chunks).padStart(2)} trechos  $${row.costUsd.toFixed(4)}  ${(row.ms / 1000).toFixed(1)}s`);
  }
  console.log(`\nTotal: ${usage.calls} chamadas, $${usage.costUsd.toFixed(4)}`);

  mkdirSync(outDir, {recursive: true});
  const outPath = join(outDir, `extraction-${caseId}.json`);
  writeFileSync(outPath, `${JSON.stringify({report, snapshot: extractionSnapshot, perDocument, detail, sweep: modelArg ? {model: modelArg} : null, raw: rawByDocument, promptVersion: measured.extractor.promptVersion}, null, 2)}\n`);
  console.log(`\nrelatório completo: ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
