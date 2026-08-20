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
 *   pnpm --filter @offroad/evals measure:classification -- rede-horizonte
 */
import {readFileSync, writeFileSync, mkdirSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

import {parseDocument} from "@offroad/document-parsers";
import {createClassifier, documentClassificationVersion} from "@offroad/document-classification";
import {createAnthropicAdapter, createModelGateway, createOpenAIAdapter} from "@offroad/model-gateway";

import {loadGoldCase} from "../src/gold";

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

const classify = createClassifier(gateway);

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

const rows: Row[] = [];
const usage = {costUsd: 0, calls: 0};

for (const entry of gold.manifest.documents) {
  const expected = gold.profiles.find((profile) => profile.document === entry.name);
  if (!expected) {
    console.log(`\n${entry.name}\n    sem perfil no gold set, pulado`);
    continue;
  }

  const startedAt = Date.now();
  const bytes = new Uint8Array(readFileSync(join(documentsDir, entry.name)));
  const parsed = await parseDocument({
    bytes,
    documentId: entry.name,
    documentVersion: 1,
    fileName: entry.name,
    localeHint: "pt-BR",
  });

  const {profile, usage: callUsage} = await classify({parsed, fileName: entry.name, locale: "pt-BR"});
  const costUsd = Number(callUsage?.classifyCostUsd ?? 0);
  usage.costUsd += costUsd;
  usage.calls += Number(callUsage?.classifyCalls ?? 1);

  // Compared only when the gold set states one. A period the case never claimed is not a miss.
  const expectedPeriodEnd = expected.periodEnd ?? null;
  const actualPeriodEnd = profile.period_end ?? null;

  const row: Row = {
    document: entry.name,
    expectedKind: expected.kind,
    actualKind: profile.document_kind,
    kindCorrect: profile.document_kind === expected.kind,
    expectedClass: expected.informationClass,
    actualClass: profile.information_class,
    classCorrect: profile.information_class === expected.informationClass,
    expectedPeriodEnd,
    actualPeriodEnd,
    periodCorrect: expectedPeriodEnd === null ? null : actualPeriodEnd === expectedPeriodEnd,
    confidence: profile.confidence,
    costUsd,
    ms: Date.now() - startedAt,
  };
  rows.push(row);

  const mark = row.kindCorrect ? "ok " : "ERR";
  console.log(
    `\n${mark} ${entry.name}\n    esperado ${row.expectedKind} / obtido ${row.actualKind}` +
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
  classifierVersion: documentClassificationVersion,
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
console.log(`classificacao (E1) — ${caseId} — ${documentClassificationVersion}`);
console.log(`  tipo do documento     ${kindCorrect.length}/${rows.length}  ${pct(summary.kindAccuracy)}`);
console.log(`  classe da informacao  ${classCorrect.length}/${rows.length}  ${pct(summary.informationClassAccuracy)}`);
console.log(
  `  periodo               ${periodCorrect.length}/${periodScored.length}  ${summary.periodAccuracy === null ? "n/a" : pct(summary.periodAccuracy)}`,
);
console.log(`  errado com confianca  ${confidentlyWrong.length}   (>= 0.80 e errado: passa direto pelo revisor)`);
console.log(`  certo sem confianca   ${unsureButRight.length}   (< 0.80 e certo: custa uma olhada, nao um erro)`);
console.log(`  custo                 $${usage.costUsd.toFixed(4)} em ${usage.calls} chamada(s)`);
console.log("=".repeat(78));

const outDir = join(here, "..", "results");
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
