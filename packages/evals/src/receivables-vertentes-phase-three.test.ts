import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {basename, dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {gunzipSync} from "node:zlib";

import {
  canonicalReceivablesRouteCatalogue,
  runReceivablesCasePipeline,
} from "@offroad/case-engine";
import {parseDocument, parseNfeArchive} from "@offroad/document-parsers";
import type {
  AdjustedDebtBridgeInput,
  AssertionProvenance,
  GovernedRateAssumption,
  ReceivablesProposalCharge,
  ReceivablesUniverse,
} from "@offroad/financial-core";
import {detectReceivablesRawEvidence, type ReceivablesRawDetectionReport} from "@offroad/receivables-analysis";
import {beforeAll, describe, expect, it} from "vitest";

import {
  evaluateReceivablesPhaseThree,
  type ReceivablesPhaseThreeGold,
} from "./receivables-phase-three";

type Manifest = {
  fixtureId: string;
  dates: {reportingDate: "2026-06-30"};
  rawFiles: readonly {path: string; sha256: string}[];
  normalized: {path: string; uncompressedSha256: string};
};
type Structure = {
  reportingDate: "2026-06-30";
  debt: Omit<AdjustedDebtBridgeInput, "reportingDate" | "currency" | "universeId" | "datasetHash">;
  rateScenarios: {
    primeFactoring: {
      faceValue: string;
      startDate: "2026-01-01";
      maturityDate: "2026-02-12";
      monthlyOutsideDiscountRate: string;
      adValoremRate: string;
      source: ReceivablesProposalCharge["source"];
    };
  };
  advanceRateScenario: {
    periodStart: "2024-07-01";
    expectedDilution: string;
    expectedDilutionBasis: string;
    expectedLossRate: string;
    expectedLossBasis: string;
    dilutionStressMultiplier: string;
    lossStressMultiplier: string;
    operationalReserve: string;
  };
};

const here = dirname(fileURLToPath(import.meta.url));
const goldRoot = join(here, "..", "..", "testing-fixtures", "gold", "vertentes");
const rawRoot = join(here, "..", "..", "testing-fixtures", "assets", "vertentes", "raw", "empresa");
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;
const manifest = readJson<Manifest>(join(goldRoot, "manifest.json"));
const universe = JSON.parse(gunzipSync(readFileSync(join(goldRoot, manifest.normalized.path))).toString("utf8")) as ReceivablesUniverse;
const structure = readJson<Structure>(join(goldRoot, "source", "structure-cost-input.json"));
const gold = readJson<ReceivablesPhaseThreeGold>(join(goldRoot, "expected", "phase-three.json"));

let rawDetection: ReceivablesRawDetectionReport;

async function loadRawDetection(): Promise<ReceivablesRawDetectionReport> {
  const paths = manifest.rawFiles.map((entry) => entry.path).filter((path) => (
    path.startsWith("documentos/") && !path.endsWith(".zip")
  ) || (
    path.startsWith("intake/") && path.endsWith(".pdf")
  ));
  const documents = [];
  for (const path of paths) {
    const manifestEntry = manifest.rawFiles.find((entry) => entry.path === path)!;
    const parsed = await parseDocument({
      bytes: new Uint8Array(readFileSync(join(rawRoot, path))),
      documentId: path,
      documentVersion: 1,
      fileName: basename(path),
      localeHint: "pt-BR",
    });
    expect(parsed.warnings.filter((warning) => warning.code === "limit_reached")).toEqual([]);
    documents.push({id: path, fileName: basename(path), fileHash: manifestEntry.sha256, layer: parsed.layer});
  }
  const archivePath = "documentos/recebiveis/NFs amostra.zip";
  const archiveManifest = manifest.rawFiles.find((entry) => entry.path === archivePath)!;
  const archive = await parseNfeArchive({
    bytes: new Uint8Array(readFileSync(join(rawRoot, archivePath))),
    archiveId: archivePath,
    fileHash: archiveManifest.sha256,
  });
  const datasetHash = createHash("sha256")
    .update([...documents.map((document) => document.fileHash), archive.fileHash].sort().join(":"))
    .digest("hex");
  return detectReceivablesRawEvidence({
    universeId: manifest.fixtureId,
    reportingDate: manifest.dates.reportingDate,
    datasetHash,
    documents,
    fiscalArchives: [archive],
  });
}

const estimated = (id: string, value: string, method: string, basis = method): GovernedRateAssumption => ({
  id,
  value,
  basis,
  provenance: {
    kind: "estimated",
    method,
    sources: ["Vertentes governed benchmark scenario"],
    asOf: structure.reportingDate,
    owner: "receivables desk",
    confidence: "medium",
    validUntil: "2026-09-30",
  },
});

const measured = (value: string): {value: string; provenance: AssertionProvenance} => ({
  value,
  provenance: {
    kind: "measured",
    datasetHash: manifest.normalized.uncompressedSha256,
    anchors: [universe.receivables[0]!.source],
    universe: universe.id,
    reportingDate: universe.dates.reportingDate,
    inclusions: ["Vertentes normalized synthetic universe"],
    exclusions: [],
    formula: {id: "vertentes_phase_three_input", version: "1"},
  },
});

describe("Vertentes Phase 3 raw-document replay", () => {
  beforeAll(async () => {
    rawDetection = await loadRawDetection();
  }, 60_000);

  it("detects the planted control failures from delivered evidence without reading reserved truth", () => {
    expect(rawDetection.defects.map((item) => item.id)).toEqual(gold.defectIds);
    expect(Object.fromEntries(rawDetection.defects.map((item) => [item.id, item.measured?.value]))).toMatchObject({
      accounting_reconciliation_difference: "1900000",
      cancelled_invoice_open: "41",
      dilution_misclassification: "3059552.71",
      economic_group_split: "1",
      related_party_obligor: "1",
      triangular_revenue_spike: "2025-11",
      undeclared_recourse_and_debt: "9760000",
      unmarked_extensions: "340",
    });
    expect(rawDetection.questions.map((item) => item.id)).toEqual(gold.questionIds);
    expect(rawDetection.evidenceCoverage.deliveredEvidenceIds.some((id) => /gold|source|expected|LEIA-ME|_estilo|\.html$/.test(id))).toBe(false);
    expect(rawDetection.evidenceCoverage.searchedEvidenceIds).toEqual(rawDetection.evidenceCoverage.deliveredEvidenceIds);
    expect(rawDetection.evidenceCoverage.warnings).toEqual([
      "archive:documentos/recebiveis/NFs amostra.zip:invalid_nfe_access_key_length",
    ]);
  });

  it("proves exact deterministic math and leaves only unresolved route and live-program gates", () => {
    const factoring = structure.rateScenarios.primeFactoring;
    const advance = structure.advanceRateScenario;
    const factIds = new Set(canonicalReceivablesRouteCatalogue.flatMap((route) => route.criteria.map((criterion) => criterion.factId)));
    const pipeline = runReceivablesCasePipeline({
      caseId: gold.caseId,
      classification: {
        categoryIds: gold.classification.categoryIds,
        cellIds: gold.classification.cellIds,
        evidence: [measured("1").provenance],
      },
      phaseOne: {
        universe,
        datasetHash: manifest.normalized.uncompressedSha256,
        adjustedDebt: structure.debt,
        proposals: [{
          id: "prime-factoring",
          proposal: {
            faceValue: factoring.faceValue,
            startDate: factoring.startDate,
            maturityDate: factoring.maturityDate,
            quote: {regime: "outside_simple_monthly", monthlyDiscountRate: factoring.monthlyOutsideDiscountRate},
            charges: [{id: "ad-valorem", kind: "ad_valorem_face_fee", rate: factoring.adValoremRate, source: factoring.source}],
            taxTreatment: {status: "not_provided"},
            source: factoring.source,
          },
        }],
        advanceRate: {
          periodStart: advance.periodStart,
          expectedDilution: estimated("expected-dilution", advance.expectedDilution, "historical dilution proxy", advance.expectedDilutionBasis),
          expectedLossRate: estimated("expected-loss", advance.expectedLossRate, "explicit loss proxy", advance.expectedLossBasis),
          dilutionStressMultiplier: estimated("dilution-stress", advance.dilutionStressMultiplier, "scenario stress on measured dilution"),
          lossStressMultiplier: estimated("loss-stress", advance.lossStressMultiplier, "scenario stress on expected loss"),
          operationalReserve: estimated("operational-reserve", advance.operationalReserve, "scenario operating reserve"),
        },
      },
      routeFacts: [...factIds].map((id) => rawDetection.routeFacts.find((fact) => fact.id === id)
        ?? {id, state: "unknown" as const, explanation: "O documento necessário para decidir este fato ainda não foi entregue."}),
      providerFit: {
        asOf: structure.reportingDate,
        metrics: {currency: "BRL", requestedAmount: measured("15000000")},
        mandates: [],
      },
      defects: rawDetection.defects,
      questions: rawDetection.questions,
    });
    const evaluation = evaluateReceivablesPhaseThree(pipeline, gold);

    expect(evaluation.calculation).toMatchObject({exact: gold.calculations.length, accuracy: 1, missing: [], divergent: []});
    expect(evaluation.classification.accuracy).toBe(1);
    expect(evaluation.defects).toMatchObject({expected: 8, detected: 8, recall: 1, precision: 1});
    expect(evaluation.programs).toMatchObject({actual: [], exact: false});
    expect(evaluation.questions).toMatchObject({expected: 4, detected: 4, anchored: 4, valid: true});
    expect(evaluation.failedGates).toEqual(["compatible_programs", "pipeline_incomplete"]);
    expect(evaluation.passed).toBe(false);
  }, 30_000);
});
