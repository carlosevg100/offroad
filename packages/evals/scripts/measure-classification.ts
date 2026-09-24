/**
 * Runs the real classifier over a gold case and scores it (E1).
 *
 * The number this produces did not exist until now, and its absence was load-bearing. Extraction
 * (E3) has been measured for weeks at 75.4% recall, but that measurement hands the extractor the
 * *correct* document kind on purpose, to isolate the two stages. In production nothing hands it
 * anything: the classifier decides, and a wrong kind is not a small error downstream, it is the
 * wrong field set, asked of the wrong document, scored against the wrong expectations. So "how
 * good is extraction" was only ever half an answer, and this is the other half.
 *
 * Four things are scored, because "accuracy" alone would hide the failures that matter:
 *
 *   - the kind, which decides what E3 is asked for;
 *   - the information class, which decides evidence precedence between conflicting sources;
 *   - the period, because a right kind with the wrong period puts a 2024 number in a 2026 row;
 *   - the calibration of confidence, because the product routes anything under 0.8 to a human,
 *     and a classifier that is confidently wrong is worse than one that is unsure.
 *
 * No model is called from this process. The documents are parsed here, as before, and the
 * classification runs in the worker as a governed evaluation (the `measure-classification`
 * family): this script requests it through the evaluator's own session (`../src/governed-transport`),
 * the worker reserves every call in the database before sending it, and the script reads back
 * what the database committed, bound to the snapshot it sent, and compares it with the gold here.
 * The expected profiles are this measurement's answer key and never leave this process. The
 * environment carries the evaluator's credential and the evaluation organization (SUPABASE_URL,
 * SUPABASE_PUBLISHABLE_KEY, OFFROAD_EVALUATOR_EMAIL, OFFROAD_EVALUATOR_PASSWORD,
 * OFFROAD_EVALUATION_ORGANIZATION_ID), never a provider key.
 *
 * A live run needs `--max-cost`, in dollars at list price with every reservation included. There
 * is no default: what a measurement may spend is decided by whoever asks for it. `--dry-run`
 * parses the documents and assembles the snapshot and its budget without requesting anything.
 * `--request-id` resumes an earlier request. A partial evaluation writes only its evaluation
 * evidence and exits with status 3.
 *
 *   pnpm --filter @offroad/evals measure:classification -- rede-horizonte --max-cost <usd>
 *     [--dry-run] [--out <dir>] [--request-id <uuid>] [--poll-seconds <n>]
 */
import {createHash} from "node:crypto";
import {readFileSync, writeFileSync, mkdirSync} from "node:fs";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";

import {executionCanonicalText} from "@offroad/agent-contracts";
import {parseDocument} from "@offroad/document-parsers";
import {
  classificationMeasurementContentHashes,
  classificationMeasurementRoutes,
  classificationMeasurementSnapshotSchema,
  documentClassificationVersion,
  readClassificationMeasurementResult,
} from "@offroad/document-classification";
import {defaultTaskPolicies, resolveModel} from "@offroad/model-gateway";

import {loadGoldCase} from "../src/gold";
import {governedEvaluationEvidence, readGovernedTransportEnvironment, requestGovernedEvaluation} from "../src/governed-transport";

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
const goldDir = join(here, "..", "..", "testing-fixtures", "gold", caseId);
const sha256 = (value: string | Uint8Array): string => createHash("sha256").update(value).digest("hex");
/** How long a request may wait for the worker to claim it, beyond the work the budget allows. */
const queueAllowanceMs = 30 * 60_000;

type Row = {
  document: string;
  expectedKind: string;
  actualKind: string;
  kindCorrect: boolean;
  expectedClass: string;
  actualClass: string;
  classCorrect: boolean;
  expectedPeriodEnd: string | null;
  actualPeriodEnd: string | null;
  periodCorrect: boolean | null;
  confidence: number;
  costUsd: number;
  ms: number;
};

async function main(): Promise<void> {
  const gold = loadGoldCase(goldDir);
  const documentsDir = join(goldDir, gold.manifest.documentsDir);
  const outDir = resolve(option("out", join(here, "..", "results")));

  // Parsing stays here, where the files are: the snapshot carries each parse whole and nothing of
  // what the gold expects.
  const documents: Array<{name: string; sha256: string; parsed: unknown}> = [];
  const parseMs = new Map<string, number>();
  for (const entry of gold.manifest.documents) {
    const expected = gold.profiles.find((profile) => profile.document === entry.name);
    if (!expected) {
      console.log(`\n${entry.name}\n    sem perfil no gold set, pulado`);
      continue;
    }

    const startedAt = Date.now();
    const bytes = new Uint8Array(readFileSync(join(documentsDir, entry.name)));
    const {conversion, ...parsed} = await parseDocument({
      bytes,
      documentId: entry.name,
      documentVersion: 1,
      fileName: entry.name,
      localeHint: "pt-BR",
    });
    parseMs.set(entry.name, Date.now() - startedAt);
    documents.push({name: entry.name, sha256: sha256(bytes), parsed: {...parsed, conversion: conversion ?? null}});
  }

  // The routes the task policy gives this run: the worker's gateway takes the same policy from the snapshot.
  const resolved = resolveModel("classify_document", defaultTaskPolicies, {});
  const snapshot = classificationMeasurementSnapshotSchema.parse({
    schemaVersion: "classification-measurement-snapshot.v1",
    caseId: gold.manifest.caseId,
    caseVersion: gold.manifest.version,
    classifierVersion: documentClassificationVersion,
    model: {primary: resolved.primary, fallback: resolved.fallback ?? null, maxOutputTokens: resolved.policy.maxOutputTokens, timeoutMs: resolved.policy.timeoutMs},
    documents,
  });
  const snapshotText = executionCanonicalText(snapshot);
  // Each document is one classification that sends once and may fall back once, and every call
  // may take the task's whole timeout. The worker reserves each attempt at its list-price upper bound.
  const routes = classificationMeasurementRoutes(snapshot);
  const maxModelCalls = snapshot.documents.length * routes.length;
  const maxDurationMs = maxModelCalls * snapshot.model.timeoutMs;
  console.log(`\nevaluation snapshot: ${snapshot.documents.length} documents, ${Buffer.byteLength(snapshotText, "utf8")} bytes, sha256 ${sha256(snapshotText).slice(0, 16)}`);
  console.log(`evaluation routes: ${routes.map((route) => `${route.provider}/${route.model}@${route.effort}`).join(", ")}; at most ${maxModelCalls} calls, ${maxDurationMs} ms of work`);
  if (dryRun) {
    console.log("dry run: no model called");
    return;
  }

  // Live: the worker runs the classification family under the governed transport. This process
  // holds no provider key and builds no adapter or gateway; it asks through the evaluator's
  // session and reads back what the database committed.
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
    audience: {caseId: snapshot.caseId, caseVersion: snapshot.caseVersion, scriptId: "measure-classification"},
    routes,
    budget,
    snapshot,
    sourceContentHashes: classificationMeasurementContentHashes(snapshot),
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
  writeFileSync(join(outDir, `${caseId}-classification.evaluation.json`), `${JSON.stringify(governedEvaluationEvidence(evaluation), null, 2)}\n`, "utf8");
  console.log(`evaluation committed: ${evaluation.outcome}/${evaluation.reason}, ${evaluation.cost.spentMicrousd} microusd over ${evaluation.cost.spentCalls} calls`);
  if (evaluation.outcome !== "succeeded") {
    // A partial evaluation publishes only its reason: there is no classification to score.
    console.error(`evaluation ${evaluation.executionId} is partial: ${evaluation.reason}`);
    process.exitCode = 3;
    return;
  }
  const measured = readClassificationMeasurementResult(evaluation.result, snapshot);

  const rows: Row[] = [];
  const usage = {costUsd: 0, calls: 0};

  for (const actual of measured.documents) {
    const expected = gold.profiles.find((profile) => profile.document === actual.document)!;
    usage.costUsd += actual.costUsd;
    usage.calls += actual.calls;

    // Compared only when the gold set states one. A period the case never claimed is not a miss.
    const expectedPeriodEnd = expected.periodEnd ?? null;
    const actualPeriodEnd = actual.actualPeriodEnd;

    const row: Row = {
      document: actual.document,
      expectedKind: expected.kind,
      actualKind: actual.actualKind,
      kindCorrect: actual.actualKind === expected.kind,
      expectedClass: expected.informationClass,
      actualClass: actual.actualClass,
      classCorrect: actual.actualClass === expected.informationClass,
      expectedPeriodEnd,
      actualPeriodEnd,
      periodCorrect: expectedPeriodEnd === null ? null : actualPeriodEnd === expectedPeriodEnd,
      confidence: actual.confidence,
      costUsd: actual.costUsd,
      // Reading here plus classifying in the worker: the time this document took, queueing aside.
      ms: (parseMs.get(actual.document) ?? 0) + actual.ms,
    };
    rows.push(row);

    const mark = row.kindCorrect ? "ok " : "ERR";
    console.log(
      `\n${mark} ${actual.document}\n    esperado ${row.expectedKind} / obtido ${row.actualKind}` +
        `\n    classe   ${row.expectedClass} / ${row.actualClass}${row.classCorrect ? "" : "   <-- diverge"}` +
        `\n    periodo  ${row.expectedPeriodEnd ?? "n/a"} / ${row.actualPeriodEnd ?? "null"}${row.periodCorrect === false ? "   <-- diverge" : ""}` +
        `\n    confianca ${row.confidence.toFixed(2)}  $${row.costUsd.toFixed(4)}  ${row.ms}ms`,
    );
  }

  const ratio = (part: number, whole: number) => (whole === 0 ? 0 : part / whole);
  const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

  const kindCorrect = rows.filter((row) => row.kindCorrect);
  const classCorrect = rows.filter((row) => row.classCorrect);
  const periodScored = rows.filter((row) => row.periodCorrect !== null);
  const periodCorrect = periodScored.filter((row) => row.periodCorrect === true);

  // The two calibration failures, kept apart because they cost different things. A confident
  // mistake is routed straight past the reviewer; an unsure correct answer only costs a look.
  const confidentlyWrong = rows.filter((row) => !row.kindCorrect && row.confidence >= 0.8);
  const unsureButRight = rows.filter((row) => row.kindCorrect && row.confidence < 0.8);

  const summary = {
    caseId,
    classifierVersion: measured.classifierVersion,
    documents: rows.length,
    kindAccuracy: ratio(kindCorrect.length, rows.length),
    informationClassAccuracy: ratio(classCorrect.length, rows.length),
    periodAccuracy: periodScored.length === 0 ? null : ratio(periodCorrect.length, periodScored.length),
    confidentlyWrong: confidentlyWrong.length,
    unsureButRight: unsureButRight.length,
    costUsd: usage.costUsd,
    calls: usage.calls,
    rows,
  };

  console.log(`\n${"=".repeat(78)}`);
  console.log(`classificacao (E1): ${caseId}, ${measured.classifierVersion}`);
  console.log(`  tipo do documento     ${kindCorrect.length}/${rows.length}  ${pct(summary.kindAccuracy)}`);
  console.log(`  classe da informacao  ${classCorrect.length}/${rows.length}  ${pct(summary.informationClassAccuracy)}`);
  console.log(
    `  periodo               ${periodCorrect.length}/${periodScored.length}  ${summary.periodAccuracy === null ? "n/a" : pct(summary.periodAccuracy)}`,
  );
  console.log(`  errado com confianca  ${confidentlyWrong.length}   (>= 0.80 e errado: passa direto pelo revisor)`);
  console.log(`  certo sem confianca   ${unsureButRight.length}   (< 0.80 e certo: custa uma olhada, nao um erro)`);
  console.log(`  custo                 $${usage.costUsd.toFixed(4)} em ${usage.calls} chamada(s)`);
  console.log("=".repeat(78));

  mkdirSync(outDir, {recursive: true});
  const outFile = join(outDir, `${caseId}-classification.json`);
  writeFileSync(outFile, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(`\nresultado completo: ${outFile}`);

  if (confidentlyWrong.length > 0) {
    console.log("\nErrado e confiante, que e o caso que o produto nao pega:");
    for (const row of confidentlyWrong) {
      console.log(`  ${row.document}: disse ${row.actualKind} (${row.confidence.toFixed(2)}), era ${row.expectedKind}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
