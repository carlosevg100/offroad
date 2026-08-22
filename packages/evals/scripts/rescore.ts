/**
 * Re-scores a recorded run against the current code, for free, in seconds.
 *
 * The expensive half of a measurement is the provider answering questions about a document.
 * That answer does not change when the verifier learns a new period spelling, when the
 * reconciliation folds two rows into one, or when the scoring stops calling a named
 * contradiction a wrong value. Those are most of the changes, and each one was costing a
 * two-hour run and seven dollars to judge.
 *
 * So a run keeps what the model said, and this replays it: parse the documents locally,
 * verify, renumber, reconcile and score with whatever the code says today. If the prompt
 * fingerprint moved, the capture answers a different question and the report says so instead
 * of quietly reporting a number nobody should trust.
 *
 * Usage: pnpm --filter @offroad/evals rescore <path-to-extraction-*.json> [more.json ...]
 */

import {readFileSync} from "node:fs";
import {basename, dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

import {documentKindDefinition, type DocumentKind} from "@offroad/credit-ontology";
import {archetypeIdSchema} from "@offroad/credit-playbook";
import {extractionPromptVersion, renumberByTable} from "@offroad/document-extraction";
import {indexLayer, rawExtractionCandidateSchema, verifyCandidates, type DocumentProfile} from "@offroad/document-intelligence";
import {createTesseractEngine, parseDocument, toolVersion, type OcrEngine} from "@offroad/document-parsers";
import {reconcileCase} from "@offroad/reconciliation";
import {analyzeCreditPosition, buildDeskInputs, projectLeverageTrajectory, type Fact} from "@offroad/credit-analysis";

import {loadGoldCase} from "../src/gold";
import {evaluateSnapshot} from "../src/metrics";
import {renderMarkdownReport} from "../src/report";
import type {ExtractionSnapshot, SnapshotCandidate, SnapshotProfile} from "../src/snapshot";

const here = dirname(fileURLToPath(import.meta.url));
const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("usage: rescore <extraction-*.json> [...]");
  process.exit(2);
}

const tesseractBin = process.env.TESSERACT_BIN ?? "tesseract";
const tesseractVersion = await toolVersion(tesseractBin);
const ocr: OcrEngine | null = tesseractVersion === "unavailable"
  ? null
  : createTesseractEngine({bin: tesseractBin, pdftoppmBin: process.env.PDFTOPPM_BIN ?? "pdftoppm", languages: process.env.OCR_LANGUAGES ?? "por+eng", timeoutMs: 120_000, version: tesseractVersion});

for (const file of files) {
  const startedAt = Date.now();
  const recorded = JSON.parse(readFileSync(file, "utf8")) as {
    report: {caseId: string};
    raw?: Record<string, unknown[]>;
    promptVersion?: string;
    sweep?: {model: string} | null;
    snapshot: {usage?: {costUsd: number; calls: number}};
  };

  const caseId = recorded.report.caseId;
  if (!recorded.raw) {
    console.error(`${basename(file)}: gravado antes do replay existir (sem \`raw\`). Só uma medição nova reponde por este caso.`);
    continue;
  }

  const goldDir = join(here, "..", "..", "testing-fixtures", "gold", caseId);
  const gold = loadGoldCase(goldDir);
  const documentsDir = join(goldDir, gold.manifest.documentsDir);

  const current = extractionPromptVersion();
  const stale = recorded.promptVersion !== current;

  const candidates: SnapshotCandidate[] = [];
  const profiles: SnapshotProfile[] = [];

  for (const entry of gold.manifest.documents) {
    const goldProfile = gold.profiles.find((profile) => profile.document === entry.name);
    const raw = recorded.raw[entry.name];
    if (!goldProfile || !raw) continue;

    const kind = goldProfile.kind as DocumentKind;
    const definition = documentKindDefinition(kind);
    const bytes = new Uint8Array(readFileSync(join(documentsDir, entry.name)));
    const parsed = await parseDocument({bytes, documentId: entry.name, documentVersion: 1, fileName: entry.name, localeHint: "pt-BR"}, ocr ? {ocr} : {});

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

    // The recorded answer, parsed by the same contract the gateway enforces at call time.
    const parsedRaw = raw.map((candidate) => rawExtractionCandidateSchema.safeParse(candidate)).filter((result) => result.success).map((result) => result.data);
    const report = verifyCandidates(renumberByTable(parsedRaw), {
      index: indexLayer(parsed.layer),
      layer: parsed.layer,
      profile,
      documentVersion: 1,
      localeHint: "pt-BR",
    });

    profiles.push({
      document: entry.name,
      kind,
      informationClass: definition.informationClass,
      evidenceRank: definition.evidenceRank,
      ...(profile.entityName ? {entityName: profile.entityName} : {}),
    });

    for (const candidate of report.verified) {
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
        autoAccepted: false,
      });
    }
    console.log(`  ${entry.name}: ${raw.length} brutos → ${report.verified.length} verificados, ${report.rejected.length} recusados`);
  }

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

  const snapshot: ExtractionSnapshot = {
    extractor: {name: "document-extraction (replay)", version: current},
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
        fieldPaths: [...new Set(exception.evidence.map((evidence) => evidence.fieldPath).filter((path): path is string => Boolean(path)))],
      })),
      ...reconciliation.gaps.map((gap) => ({type: "missing", severity: gap.severity, title: gap.title, description: gap.description})),
    ],
    calculations: reconciliation.calculations.map((calculation) => ({id: calculation.id, value: calculation.value})),
  };

  const evaluated = evaluateSnapshot(gold, snapshot);

  /**
   * The question the field count does not answer: with what was actually read, does the desk
   * produce a credit reading, and is it the reading the answer key produces?
   *
   * A case can miss forty fields of a 140-page filing and still be analysable, because a desk
   * runs on about twenty numbers; and a case can read almost everything and be unanalysable,
   * because the twenty it needs are not among them. Cogna measured the second: its room is a
   * quarterly release, so no amount of extraction gives the desk the annual statements it asks
   * for. Recall is an input. This is the output.
   */
  const deskFrom = (facts: Fact[]) => {
    const inputs = buildDeskInputs(facts, {
      referenceDate: "2026-08-21",
      indexLevels: {cdi: "0.105", tlp: "0.079", ipca: "0.045", tr: "0.002"},
      statedRequest: {},
    });
    const desk = inputs.desk ? analyzeCreditPosition(inputs.desk) : null;
    const trajectory = inputs.trajectory ? projectLeverageTrajectory(inputs.trajectory) : null;
    return {desk, trajectory, missing: inputs.missing};
  };

  const fromExtraction = deskFrom(reconciliation.facts.map((fact) => ({fieldPath: fact.key.fieldPath, value: fact.value})));
  const fromGold = deskFrom(gold.fields.map((field) => ({fieldPath: field.fieldPath, value: field.value})));

  const findings = (result: ReturnType<typeof deskFrom>) => [...(result.desk?.findings ?? []).map((finding) => finding.id), ...(result.trajectory?.findings ?? []).map((finding) => finding.id)].sort();
  const extracted = findings(fromExtraction);
  const expected = findings(fromGold);
  console.log(`\n## ${caseId} (replay${recorded.sweep ? `, ${recorded.sweep.model}` : ""}) em ${((Date.now() - startedAt) / 1000).toFixed(1)}s, US$ 0,00`);
  if (stale) {
    console.log(`\n> A captura é da versão de prompt \`${recorded.promptVersion ?? "desconhecida"}\` e o código está em \`${current}\`.`);
    console.log("> O modelo responderia outra coisa hoje. Estes números valem para a canalização (verificador, conciliação, pontuação), não para a extração.");
  }
  console.log(`\n${renderMarkdownReport(evaluated)}`);

  console.log("\n## A mesa");
  const line = (label: string, result: ReturnType<typeof deskFrom>) =>
    result.desk
      ? `${label}: alavancagem pré ${result.desk.leverage.preTurns}x, ${result.desk.findings.length} leitura(s)${result.missing.length ? `, faltando ${result.missing.length} campo(s)` : ""}`
      : `${label}: **não analisável**, faltam ${result.missing.join(", ") || "insumos"}`;
  console.log(`- ${line("com o que foi extraído", fromExtraction)}`);
  console.log(`- ${line("com o gabarito", fromGold)}`);
  const lost = expected.filter((id) => !extracted.includes(id));
  const gained = extracted.filter((id) => !expected.includes(id));
  console.log(lost.length === 0 && gained.length === 0
    ? "- **as leituras batem**: a extração entrega a mesma análise que o gabarito."
    : `- leituras perdidas: ${lost.join(", ") || "nenhuma"}; leituras a mais: ${gained.join(", ") || "nenhuma"}`);
  console.log(`\nA medição original custou US$ ${(recorded.snapshot.usage?.costUsd ?? 0).toFixed(2)} em ${recorded.snapshot.usage?.calls ?? 0} chamadas.`);
}
