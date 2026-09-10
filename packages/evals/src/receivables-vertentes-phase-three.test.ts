import {indexLayer, documentLayerSchema} from "@offroad/document-intelligence";
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
import {
  buildReceivablesRawUniverse,
  detectReceivablesRawEvidence,
  proposeBalanceSources,
  type ReceivablesEvidenceDocument,
  type ReceivablesRawDetectionReport,
} from "@offroad/receivables-analysis";
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
let rawDocuments: ReceivablesEvidenceDocument[];
let rawDatasetHash: string;

async function loadRawDetection(): Promise<{
  detection: ReceivablesRawDetectionReport;
  documents: ReceivablesEvidenceDocument[];
  datasetHash: string;
}> {
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
  return {detection: detectReceivablesRawEvidence({
    universeId: manifest.fixtureId,
    reportingDate: manifest.dates.reportingDate,
    datasetHash,
    documents,
    fiscalArchives: [archive],
  }), documents, datasetHash};
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
    const loaded = await loadRawDetection();
    rawDetection = loaded.detection;
    rawDocuments = loaded.documents;
    rawDatasetHash = loaded.datasetHash;
  }, 60_000);

  it("proposes source-bound balance headers from real documents without approving or changing their economics", () => {
    const before = JSON.stringify(rawDocuments);
    const goldBefore = readFileSync(join(goldRoot, "expected", "phase-three.json"));
    const assessment = rawDetection.balanceSourceAssessment!;
    expect(assessment).toEqual(proposeBalanceSources(rawDocuments, manifest.dates.reportingDate));
    const pdf = assessment.proposals.find((proposal) => proposal.sourceId.endsWith("BALANCETE JUN26.pdf") && proposal.page === 1)!;
    const secondPage = assessment.proposals.find((proposal) => proposal.sourceId.endsWith("BALANCETE JUN26.pdf") && proposal.page === 2)!;
    const bank = assessment.proposals.find((proposal) => proposal.sourceId.endsWith("posicao bancaria.xlsx"))!;
    expect(pdf.columns.map((column) => column.role)).toEqual(["opening_balance", "debit", "credit", "closing_balance"]);
    expect(pdf.columns.find((column) => column.role === "closing_balance")?.header.text).toBe("Saldo atual");
    expect(pdf.columns.find((column) => column.role === "opening_balance")?.header.text).toBe("Saldo anterior");
    expect(pdf.context.find((context) => context.kind === "period")?.anchor.text).toContain("Periodo: 01/01/2026 a 30/06/2026");
    expect(pdf.context.find((context) => context.kind === "issued_at")?.anchor.text).toContain("Emitido em 08/07/2026");
    expect(secondPage.issues).toContain("economic_date_not_identified");
    expect(bank.columns).toContainEqual(expect.objectContaining({role: "outstanding_balance", header: expect.objectContaining({id: "sPosicao!D4", text: "Saldo devedor"})}));
    expect(bank.context).toContainEqual(expect.objectContaining({kind: "as_of", anchor: expect.objectContaining({id: "sPosicao!A2", text: "Base: 30/06/2026 - elaborado pelo financeiro"})}));
    expect(bank.context.some((context) => context.kind === "entity")).toBe(false);
    expect(bank.issues).toContain("entity_not_identified");
    for (const proposal of assessment.proposals) {
      const source = rawDocuments.find((document) => document.id === proposal.sourceId)!;
      expect(proposal.sourceHash).toBe(source.fileHash);
      expect(proposal.sourceHash).toBe(manifest.rawFiles.find((entry) => entry.path === source.id)!.sha256);
      expect(proposal.documentVersion).toBe(1);
      expect(proposal.reviewState).toBe("proposed");
      expect(proposal.calculationUse).toBe("not_permitted");
      const sourceIndex = indexLayer(documentLayerSchema.parse(source.layer));
      for (const anchor of [...proposal.columns.map((column) => column.header), ...proposal.context.map((context) => context.anchor), ...proposal.rows.flatMap((row) => row.cells)]) {
        expect(sourceIndex.byId.get(anchor.id)?.text).toBe(anchor.text);
      }
      if (proposal.page) for (const column of proposal.columns) {
        expect(column.header.bbox).toHaveLength(4);
        expect(column.header.bbox![2]).toBeGreaterThan(column.header.bbox![0]);
        expect(column.header.bbox![3]).toBeGreaterThan(column.header.bbox![1]);
      }
      expect(createHash("sha256").update(readFileSync(join(rawRoot, source.id))).digest("hex")).toBe(source.fileHash);
    }
    expect(JSON.stringify(rawDocuments)).toBe(before);
    expect(readFileSync(join(goldRoot, "expected", "phase-three.json"))).toEqual(goldBefore);
    expect(rawDetection.defects.find((defect) => defect.id === "undeclared_recourse_and_debt")?.measured).toBeUndefined();
  });

  // Rebuilding 34,397 titles can exceed the 5s default under shared CI CPU contention.
  it("reconstructs the governed universe directly from the delivered tape", () => {
    const built = buildReceivablesRawUniverse({
      universeId: manifest.fixtureId,
      datasetHash: rawDatasetHash,
      reportingDate: manifest.dates.reportingDate,
      documents: rawDocuments,
    });
    expect(built.classification).toMatchObject({
      categoryIds: ["trade_receivables"],
      cellIds: ["mercantil_b2b"],
    });
    expect(built.phaseOne?.universe.receivables).toHaveLength(34_397);
    expect(built.phaseOne?.universe.eventCoverage.dilutions.status).not.toBe("complete");
    expect(built.phaseOne?.universe.eventCoverage.repurchases.status).toBe("not_provided");
    expect(built.phaseOne?.limitations).toEqual(expect.arrayContaining([
      "repurchases, substitutions, assignments and liens were not delivered title by title",
      "debt bridge, financing proposal and advance-rate assumptions remain pending",
    ]));
  }, 15_000);

  it("detects the planted control failures from delivered evidence without reading reserved truth", () => {
    expect(rawDetection.defects.map((item) => item.id)).toEqual(gold.defectIds);
    expect(Object.fromEntries(rawDetection.defects.map((item) => [item.id, item.measured?.value]))).toMatchObject({
      cancelled_invoice_open: "34",
      dilution_misclassification: "3059552.71",
      economic_group_split: "1",
      related_party_obligor: "1",
      triangular_revenue_spike: "2025-11",
      unmarked_extensions: "340",
    });
    // Independent XML/CSV replay finds seven events in July, after the June cutoff.
    const subsequentCancellations = rawDetection.supportPeriodAssessment?.entries.filter((entry) => entry.detectorId === "cancelled_invoice_open" && entry.qualification === "subsequent");
    expect(subsequentCancellations?.map((entry) => entry.startDate).sort()).toEqual([
      "2026-07-01", "2026-07-02", "2026-07-04", "2026-07-05", "2026-07-07", "2026-07-09", "2026-07-16",
    ]);
    // The frozen target remains unchanged. The raw layer has not bound the stock-date
    // and balance column; detecting the exposure is not proof of its historical amount.
    const adjustmentObservation = rawDetection.defects.find((item) => item.id === "accounting_reconciliation_difference");
    expect(adjustmentObservation?.measured).toBeUndefined();
    const amountGaps = rawDetection.supportPeriodAssessment?.entries.filter((entry) => entry.detectorId === "accounting_reconciliation_difference" && entry.amountStatus === "missing");
    expect(amountGaps?.length).toBeGreaterThan(0);
    const debtObservation = rawDetection.defects.find((item) => item.id === "undeclared_recourse_and_debt");
    expect(debtObservation).toBeDefined();
    expect(debtObservation?.measured).toBeUndefined();
    const debtPeriods = rawDetection.supportPeriodAssessment?.entries.filter((entry) => entry.detectorId === "undeclared_recourse_and_debt");
    expect(debtPeriods).toHaveLength(4);
    expect(debtPeriods?.every((entry) => entry.qualification === "missing" && entry.dateKind === "stock_as_of" && entry.anchor.kind === "document")).toBe(true);
    expect(rawDetection.evidenceCoverage.complete).toBe(false);
    expect(rawDetection.questions.map((item) => item.id)).toEqual(gold.questionIds);
    expect(rawDetection.evidenceCoverage.deliveredEvidenceIds.some((id) => /gold|source|expected|LEIA-ME|_estilo|\.html$/.test(id))).toBe(false);
    expect(rawDetection.evidenceCoverage.searchedEvidenceIds).toEqual(rawDetection.evidenceCoverage.deliveredEvidenceIds);
    expect(rawDetection.evidenceCoverage.warnings).toEqual(expect.arrayContaining([
      "archive:documentos/recebiveis/NFs amostra.zip:invalid_nfe_access_key_length",
      ...debtPeriods!.map((entry) => `support_period:${entry.id}:missing`),
    ]));
    expect(rawDetection.evidenceCoverage.warnings).toEqual(expect.arrayContaining(amountGaps!.map((entry) => `support_period:${entry.id}:${entry.qualification}`)));
    expect(rawDetection.evidenceCoverage.warnings).toHaveLength(5 + amountGaps!.length);
    expect(rawDetection.routeFacts.find((fact) => fact.id === "cedent_ownership_confirmed")?.state).toBe("unknown");
    expect(rawDetection.routeFacts.find((fact) => fact.id === "unresolved_prior_assignment_or_lien")?.state).toBe("unknown");
    expect(rawDetection.routeFacts.find((fact) => fact.id === "title_control_and_duplicate_check_available")?.state).toBe("unknown");
  });

  it("proves normalized deterministic math while retaining raw support and live-program gaps", () => {
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

    const operationTasks = [...pipeline.evidenceCollection.operation.currentBatch, ...pipeline.evidenceCollection.operation.backlog];
    const requestedFactIds = operationTasks.flatMap((task) => task.factIds);
    expect(pipeline.evidenceCollection.operation.currentBatch.length).toBeLessThanOrEqual(5);
    expect(pipeline.evidenceCollection.operation.completedFactIds).toEqual(expect.arrayContaining([
      "claim_existence_evidenced",
    ]));
    expect(pipeline.evidenceCollection.operation.completedFactIds).not.toContain("company_credit_package_available");
    expect(requestedFactIds).toEqual(expect.arrayContaining([
      "company_credit_package_available",
      "cedent_ownership_confirmed",
      "unresolved_prior_assignment_or_lien",
      "title_control_and_duplicate_check_available",
    ]));
    expect(pipeline.evidenceCollection.operation.boundaries).toMatchObject({
      manualAttestationDecidesRouteFacts: false,
      externalVerificationExecuted: false,
      externalContactAllowed: false,
    });

    expect(evaluation.calculation).toMatchObject({exact: gold.calculations.length, accuracy: 1, missing: [], divergent: []});
    expect(evaluation.classification.accuracy).toBe(1);
    expect(evaluation.defects).toMatchObject({expected: 8, detected: 8, recall: 1, precision: 1});
    expect(evaluation.programs).toMatchObject({actual: [], exact: false});
    expect(evaluation.questions).toMatchObject({expected: 4, detected: 4, anchored: 4, valid: true});
    expect(evaluation.failedGates).toEqual(["compatible_programs", "pipeline_incomplete"]);
    expect(evaluation.passed).toBe(false);
  }, 30_000);
});
