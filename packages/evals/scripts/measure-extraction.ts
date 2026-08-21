/**
 * Runs the real extractor over a gold case and scores it — no fixture playback anywhere.
 *
 * This is the number that says whether the product reads documents or only claims to. Every
 * file is parsed for real, every candidate is produced by a real model call and checked
 * against the document it cites, and the result is scored by the same harness that scores the
 * fixture. Cost is reported because "how good" without "at what price" is half an answer.
 *
 * The document kind is taken from the gold profiles on purpose: this measures extraction (E3)
 * in isolation, not classification (E1). Mixing them would hide which half is failing.
 *
 *   pnpm --filter @offroad/evals measure -- rede-horizonte
 */
import {readFileSync, writeFileSync, mkdirSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

import {parseDocument} from "@offroad/document-parsers";
import {extractDocument, documentExtractionVersion} from "@offroad/document-extraction";
import {createAnthropicAdapter, createModelGateway, createOpenAIAdapter} from "@offroad/model-gateway";
import type {DocumentProfile} from "@offroad/document-intelligence";
import {documentKindDefinition, type DocumentKind} from "@offroad/credit-ontology";

import {evaluateSnapshot} from "../src/metrics";
import {loadGoldCase} from "../src/gold";
import type {ExtractionSnapshot, SnapshotCandidate, SnapshotProfile} from "../src/snapshot";
import {renderMarkdownReport} from "../src/report";

const here = dirname(fileURLToPath(import.meta.url));
const caseId = process.argv[2] ?? "rede-horizonte";
const goldDir = join(here, "..", "..", "testing-fixtures", "gold", caseId);

const gold = loadGoldCase(goldDir);
const documentsDir = join(goldDir, gold.manifest.documentsDir);

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
  onCall: (call) =>
    console.log(
      `    ${call.provider}/${call.model} ${call.usage.inputTokens}→${call.usage.outputTokens} tok  $${call.costUsd.toFixed(4)}  ${call.latencyMs}ms${call.usedFallback ? "  (fallback)" : ""}`,
    ),
});

const candidates: SnapshotCandidate[] = [];
const profiles: SnapshotProfile[] = [];
/** Full per-candidate detail (flags, anchors, quotes) — this is what makes a failure diagnosable offline. */
const detail: Record<string, unknown> = {};
const usage = {costUsd: 0, calls: 0};
const perDocument: Array<{document: string; candidates: number; unverified: number; absent: number; chunks: number; failed: number; costUsd: number; ms: number}> = [];

for (const entry of gold.manifest.documents) {
  const goldProfile = gold.profiles.find((profile) => profile.document === entry.name);
  if (!goldProfile) {
    console.log(`\n${entry.name}\n    sem perfil no gold set, pulado`);
    continue;
  }

  const kind = goldProfile.kind as DocumentKind;
  const definition = documentKindDefinition(kind);
  console.log(`\n${entry.name}  [${kind}]`);

  const startedAt = Date.now();
  const bytes = new Uint8Array(readFileSync(join(documentsDir, entry.name)));
  const parsed = await parseDocument({
    bytes,
    documentId: entry.name,
    documentVersion: 1,
    fileName: entry.name,
    localeHint: "pt-BR",
  });

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

  const result = await extractDocument({
    layer: parsed.layer,
    profile,
    fileName: entry.name,
    gateway,
    localeHint: "pt-BR",
    // A lost chunk is the difference between "this document has nothing" and "we failed to
    // read it", so it says so on the spot instead of only showing up as a missing number.
    onProgress: (progress) => {
      if (progress.stage === "chunk_failed") {
        console.log(`    !! trecho ${progress.chunk}/${progress.total} falhou: ${progress.message}`);
      }
    },
  });

  const unverified = result.candidates.filter((candidate) => !candidate.anchor_verified).length;
  console.log(
    `    ${result.candidates.length} candidatos (${unverified} sem âncora confirmada), ${result.rejected.length} recusados, ${result.malformed} malformados, ${result.absentFields.length} ausentes, ${result.chunks.total} trecho(s)${result.chunks.failed ? `, ${result.chunks.failed} falharam` : ""}`,
  );

  usage.costUsd += result.usage.costUsd;
  usage.calls += result.usage.calls;
  perDocument.push({
    document: entry.name,
    candidates: result.candidates.length,
    unverified,
    absent: result.absentFields.length,
    chunks: result.chunks.total,
    failed: result.chunks.failed,
    costUsd: result.usage.costUsd,
    ms: Date.now() - startedAt,
  });

  detail[entry.name] = {
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
    document: entry.name,
    kind,
    informationClass: definition.informationClass,
    evidenceRank: definition.evidenceRank,
    ...(profile.entityName ? {entityName: profile.entityName} : {}),
  });

  for (const candidate of result.candidates) {
    candidates.push({
      fieldPath: candidate.field_path,
      normalizedValue: candidate.normalized_value,
      valueType: candidate.value_type,
      sourceDocument: entry.name,
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
}

const snapshot: ExtractionSnapshot = {
  extractor: {name: "document-extraction", version: documentExtractionVersion},
  documents: gold.manifest.documents.map((entry) => entry.name),
  profiles,
  candidates,
  exceptions: [],
  calculations: [],
  usage,
};

const report = evaluateSnapshot(gold, snapshot);
console.log(`\n${renderMarkdownReport(report)}`);

console.log("\nPor documento:");
for (const row of perDocument) {
  console.log(`  ${row.document.padEnd(52)} ${String(row.candidates).padStart(4)} cand  ${String(row.chunks).padStart(2)} trechos  $${row.costUsd.toFixed(4)}  ${(row.ms / 1000).toFixed(1)}s`);
}
console.log(`\nTotal: ${usage.calls} chamadas, $${usage.costUsd.toFixed(4)}`);

const outDir = join(here, "..", "out");
mkdirSync(outDir, {recursive: true});
const outPath = join(outDir, `extraction-${caseId}.json`);
writeFileSync(outPath, `${JSON.stringify({report, snapshot, perDocument, detail}, null, 2)}\n`);
console.log(`\nrelatório completo: ${outPath}`);
