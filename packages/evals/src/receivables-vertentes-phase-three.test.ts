import {readFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {gunzipSync} from "node:zlib";

import {
  canonicalReceivablesRouteCatalogue,
  runReceivablesCasePipeline,
} from "@offroad/case-engine";
import type {
  AdjustedDebtBridgeInput,
  AssertionProvenance,
  GovernedRateAssumption,
  ReceivablesProposalCharge,
  ReceivablesUniverse,
} from "@offroad/financial-core";
import {describe, expect, it} from "vitest";

import {
  evaluateReceivablesPhaseThree,
  type ReceivablesPhaseThreeGold,
} from "./receivables-phase-three";

type Manifest = {normalized: {path: string; uncompressedSha256: string}};
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
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;
const manifest = readJson<Manifest>(join(goldRoot, "manifest.json"));
const universe = JSON.parse(gunzipSync(readFileSync(join(goldRoot, manifest.normalized.path))).toString("utf8")) as ReceivablesUniverse;
const structure = readJson<Structure>(join(goldRoot, "source", "structure-cost-input.json"));
const gold = readJson<ReceivablesPhaseThreeGold>(join(goldRoot, "expected", "phase-three.json"));

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

describe("Vertentes Phase 3 measured baseline", () => {
  it("proves exact deterministic math and exposes the still-missing inference gates", () => {
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
      routeFacts: [...factIds].map((id) => ({id, state: "unknown", explanation: "Raw-document eligibility detector not yet accredited."})),
      providerFit: {
        asOf: structure.reportingDate,
        metrics: {currency: "BRL", requestedAmount: measured("15000000")},
        mandates: [],
      },
      defects: [],
      questions: [],
    });
    const evaluation = evaluateReceivablesPhaseThree(pipeline, gold);

    expect(evaluation.calculation).toMatchObject({exact: gold.calculations.length, accuracy: 1, missing: [], divergent: []});
    expect(evaluation.classification.accuracy).toBe(1);
    expect(evaluation.defects).toMatchObject({expected: 8, detected: 0, recall: 0});
    expect(evaluation.programs).toMatchObject({actual: [], exact: false});
    expect(evaluation.questions).toMatchObject({expected: 4, detected: 0, valid: false});
    expect(evaluation.failedGates).toEqual(expect.arrayContaining([
      "compatible_programs",
      "defect_recall",
      "pipeline_incomplete",
      "question_contract",
    ]));
    expect(evaluation.passed).toBe(false);
  }, 30_000);
});
