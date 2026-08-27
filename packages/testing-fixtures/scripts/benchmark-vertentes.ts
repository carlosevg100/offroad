import {readFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {gunzipSync} from "node:zlib";

import {calculateDynamicReceivablesMetrics, calculateStaticReceivablesMetrics, type ReceivablesUniverse} from "@offroad/financial-core";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const goldRoot = join(packageRoot, "gold", "vertentes");
const manifest = JSON.parse(readFileSync(join(goldRoot, "manifest.json"), "utf8")) as {
  normalized: {path: string; uncompressedSha256: string};
};
const universe = JSON.parse(
  gunzipSync(readFileSync(join(goldRoot, manifest.normalized.path))).toString("utf8"),
) as ReceivablesUniverse;

const executeStatic = () => calculateStaticReceivablesMetrics(universe, {
  datasetHash: manifest.normalized.uncompressedSha256,
});
const executeDynamic = () => calculateDynamicReceivablesMetrics(universe, {
  datasetHash: manifest.normalized.uncompressedSha256,
});

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
if (staticResult.portfolio.titleCount.value !== "34397" || dynamicResult.rollRates.periods.length !== 23) {
  throw new Error("benchmark result diverged from the Vertentes gold case");
}
console.log(JSON.stringify({
  caseId: "A1-03",
  receivables: universe.receivables.length,
  static: benchmark(executeStatic, 10),
  dynamic: benchmark(executeDynamic, 10),
}));
