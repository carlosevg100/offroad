import {readFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {gunzipSync} from "node:zlib";

import {
  calculateDynamicReceivablesMetrics,
  calculateStaticReceivablesMetrics,
  type AdjustedDebtBridgeInput,
  type GovernedRateAssumption,
  type ReceivablesProposalCharge,
  type ReceivablesUniverse,
} from "@offroad/financial-core";
import {analyzeReceivablesPhaseOne} from "@offroad/receivables-analysis";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const goldRoot = join(packageRoot, "gold", "vertentes");
const manifest = JSON.parse(readFileSync(join(goldRoot, "manifest.json"), "utf8")) as {
  normalized: {path: string; uncompressedSha256: string};
};
const universe = JSON.parse(
  gunzipSync(readFileSync(join(goldRoot, manifest.normalized.path))).toString("utf8"),
) as ReceivablesUniverse;
const structure = JSON.parse(readFileSync(join(goldRoot, "source", "structure-cost-input.json"), "utf8")) as {
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

const estimated = (id: string, value: string, method: string, basis = method): GovernedRateAssumption => ({
  id,
  value,
  basis,
  provenance: {
    kind: "estimated",
    method,
    sources: ["Vertentes governed benchmark scenario"],
    asOf: structure.reportingDate,
    owner: "credit desk",
    confidence: "medium",
    validUntil: "2026-09-30",
  },
});

const executeStatic = () => calculateStaticReceivablesMetrics(universe, {
  datasetHash: manifest.normalized.uncompressedSha256,
});
const executeDynamic = () => calculateDynamicReceivablesMetrics(universe, {
  datasetHash: manifest.normalized.uncompressedSha256,
});
const executePhaseOne = () => {
  const factoring = structure.rateScenarios.primeFactoring;
  const advance = structure.advanceRateScenario;
  return analyzeReceivablesPhaseOne({
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
  });
};

function benchmark(execute: () => unknown, iterations: number) {
  execute();
  const durations: number[] = [];
  for (let index = 0; index < iterations; index += 1) {
    const startedAt = performance.now();
    execute();
    durations.push(performance.now() - startedAt);
  }
  durations.sort((left, right) => left - right);
  const median = durations[Math.floor(durations.length / 2)]!;
  const p95 = durations[Math.ceil(durations.length * 0.95) - 1]!;
  return {
    iterations: durations.length,
    medianMilliseconds: Number(median.toFixed(2)),
    p95Milliseconds: Number(p95.toFixed(2)),
  };
}

const staticResult = executeStatic();
const dynamicResult = executeDynamic();
const phaseOneResult = executePhaseOne();
if (
  staticResult.portfolio.titleCount.value !== "34397"
  || dynamicResult.rollRates.periods.length !== 23
  || phaseOneResult.adjustedDebt?.adjustedNetDebt.value !== "20940000"
) {
  throw new Error("benchmark result diverged from the Vertentes gold case");
}
console.log(JSON.stringify({
  caseId: "A1-03",
  receivables: universe.receivables.length,
  static: benchmark(executeStatic, 10),
  dynamic: benchmark(executeDynamic, 10),
  phaseOne: benchmark(executePhaseOne, 5),
}));
