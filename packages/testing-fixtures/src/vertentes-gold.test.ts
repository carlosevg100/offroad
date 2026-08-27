import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {gunzipSync} from "node:zlib";

import {
  calculateStaticReceivablesMetrics,
  receivablesAgingBuckets,
  type ConcentrationCut,
  type MeasuredMetric,
  type ReceivablesAgingBucket,
  type ReceivablesUniverse,
} from "@offroad/financial-core";
import {describe, expect, it} from "vitest";

type ExpectedStatic = {
  version: string;
  reportingDate: string;
  latestOriginationDate: string;
  dataStartDate: string;
  portfolio: Record<string, string>;
  aging: Record<ReceivablesAgingBucket, string>;
  concentration: Record<string, Record<ConcentrationCut | "herfindahl", string>>;
};

type VertentesManifest = {
  synthetic: boolean;
  counts: {rawFiles: number; receivables: number; obligors: number; economicGroups: number; settlements: number; dilutions: number; extensions: number};
  rawFiles: Array<{path: string; bytes: number; sha256: string}>;
  reservedTruth: Array<{path: string; bytes: number; sha256: string}>;
  expectedFiles: Array<{path: string; bytes: number; sha256: string}>;
  normalized: {path: string; bytes: number; sha256: string; uncompressedBytes: number; uncompressedSha256: string};
};

type IllustrativeEligibility = {
  status: string;
  exclusiveExclusions: Record<"past_due_over_30" | "related_party" | "cancelled_invoice" | "economic_group_concentration" | "total", string>;
  eligibleOpenValue: string;
  eligibleShare: string;
};

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, "..");
const goldRoot = join(packageRoot, "gold", "vertentes");
const rawRoot = join(packageRoot, "assets", "vertentes", "raw", "empresa");
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;
const manifest = readJson<VertentesManifest>(join(goldRoot, "manifest.json"));
const compressed = readFileSync(join(goldRoot, manifest.normalized.path));
const uncompressed = gunzipSync(compressed);
const universe = JSON.parse(uncompressed.toString("utf8")) as ReceivablesUniverse;
const expected = readJson<ExpectedStatic>(join(goldRoot, "expected", "static-metrics.json"));
const illustrativeEligibility = readJson<IllustrativeEligibility>(join(goldRoot, "expected", "illustrative-eligibility.json"));

const cents = (value: string) => {
  const [integer = "0", fraction = ""] = value.split(".");
  return BigInt(integer) * 100n + BigInt((fraction + "00").slice(0, 2));
};
const fixed8 = (value: string) => {
  const [integer = "0", fraction = ""] = value.split(".");
  return BigInt(integer) * 100_000_000n + BigInt((fraction + "00000000").slice(0, 8));
};
const measuredValue = (metric: MeasuredMetric) => {
  expect(metric.status).toBe("measured");
  expect(metric.value).not.toBeNull();
  return metric.value!;
};

function allMetrics(result: ReturnType<typeof calculateStaticReceivablesMetrics>): MeasuredMetric[] {
  return [
    ...Object.values(result.portfolio),
    ...Object.values(result.aging),
    ...Object.values(result.concentration.trailing365ByObligor),
    ...Object.values(result.concentration.trailing365ByEconomicGroup),
    ...Object.values(result.concentration.openByObligor),
    ...Object.values(result.concentration.openByEconomicGroup),
  ];
}

describe("Vertentes A1-03 gold", () => {
  it("preserves the complete raw room and the reserved truth by hash", () => {
    expect(manifest.synthetic).toBe(true);
    expect(manifest.counts).toEqual({
      rawFiles: 21,
      receivables: 34397,
      obligors: 1200,
      economicGroups: 1199,
      settlements: 30734,
      dilutions: 4840,
      extensions: 340,
    });
    for (const file of manifest.rawFiles) {
      const bytes = readFileSync(join(rawRoot, file.path));
      expect(bytes.byteLength, file.path).toBe(file.bytes);
      expect(sha256(bytes), file.path).toBe(file.sha256);
    }
    for (const file of manifest.reservedTruth) {
      const bytes = readFileSync(join(goldRoot, file.path));
      expect(bytes.byteLength, file.path).toBe(file.bytes);
      expect(sha256(bytes), file.path).toBe(file.sha256);
    }
    for (const file of manifest.expectedFiles) {
      const bytes = readFileSync(join(goldRoot, "expected", file.path));
      expect(bytes.byteLength, file.path).toBe(file.bytes);
      expect(sha256(bytes), file.path).toBe(file.sha256);
    }
    expect(compressed.byteLength).toBe(manifest.normalized.bytes);
    expect(sha256(compressed)).toBe(manifest.normalized.sha256);
    expect(uncompressed.byteLength).toBe(manifest.normalized.uncompressedBytes);
    expect(sha256(uncompressed)).toBe(manifest.normalized.uncompressedSha256);
  });

  it("keeps the illustrative eligibility scenario exclusive and explicitly estimated", () => {
    const exclusions = illustrativeEligibility.exclusiveExclusions;
    const allocated = fixed8(exclusions.past_due_over_30)
      + fixed8(exclusions.related_party)
      + fixed8(exclusions.cancelled_invoice)
      + fixed8(exclusions.economic_group_concentration);
    expect(allocated).toBe(fixed8(exclusions.total));
    expect(fixed8(illustrativeEligibility.eligibleOpenValue) + allocated).toBe(fixed8(expected.portfolio.totalOpenValue!));
    expect(illustrativeEligibility.eligibleShare).toBe("0.74619108");
    expect(illustrativeEligibility.status).toBe("estimated_policy_not_buyer_confirmed");
  });

  it("keeps reporting, origination and data interval dates economically distinct", () => {
    expect(universe.dates.reportingDate).toBe(expected.reportingDate);
    expect(universe.dates.latestOriginationDate).toBe(expected.latestOriginationDate);
    expect(universe.dates.dataStartDate).toBe(expected.dataStartDate);
    expect(universe.dates.reportingDate).not.toBe(universe.dates.latestOriginationDate);
    expect(universe.extensions).toHaveLength(340);
    expect(universe.extensions.every((event) => event.date === null)).toBe(true);
    expect(universe.receivables.filter((item) => item.originalDueDate !== item.currentDueDate)).toHaveLength(340);
  });

  it("matches every approved static metric exactly", () => {
    const result = calculateStaticReceivablesMetrics(universe, {datasetHash: manifest.normalized.uncompressedSha256});
    expect(result.version).toBe(expected.version);
    expect(result.portfolio.titleCount.value).toBe(expected.portfolio.titleCount);
    expect(result.portfolio.totalFaceValue.value).toBe(expected.portfolio.totalFaceValue);
    expect(result.portfolio.trailing365Origination.value).toBe(expected.portfolio.trailing365Origination);
    expect(result.portfolio.averageTicket.value).toBe(expected.portfolio.averageTicket);
    expect(result.portfolio.totalOpenValue.value).toBe(expected.portfolio.totalOpenValue);
    expect(result.portfolio.weightedOriginalTermDays.value).toBe(expected.portfolio.weightedOriginalTermDays);
    expect(result.portfolio.weightedCurrentTermDays.value).toBe(expected.portfolio.weightedCurrentTermDays);
    expect(result.portfolio.weightedRemainingTermDays.value).toBe(expected.portfolio.weightedRemainingTermDays);
    expect(result.portfolio.simpleDsoDays.value).toBe(expected.portfolio.simpleDsoDays);
    expect(result.portfolio.countbackDsoDays.value).toBe(expected.portfolio.countbackDsoDays);

    for (const bucket of receivablesAgingBuckets) expect(result.aging[bucket].value, bucket).toBe(expected.aging[bucket]);
    for (const [scope, cuts] of Object.entries(expected.concentration)) {
      const actual = result.concentration[scope as keyof typeof result.concentration];
      for (const [cut, value] of Object.entries(cuts)) {
        expect(actual[cut as keyof typeof actual].value, `${scope}.${cut}`).toBe(value);
      }
    }
  }, 10_000);

  it("reconciles static invariants and emits complete measured provenance", () => {
    const result = calculateStaticReceivablesMetrics(universe, {datasetHash: manifest.normalized.uncompressedSha256});
    const agingTotal = Object.values(result.aging).reduce((total, metric) => total + cents(measuredValue(metric)), 0n);
    expect(agingTotal).toBe(cents(measuredValue(result.portfolio.totalOpenValue)));
    for (const scope of Object.values(result.concentration)) {
      expect(Number(measuredValue(scope.top_1))).toBeLessThanOrEqual(Number(measuredValue(scope.top_5)));
      expect(Number(measuredValue(scope.top_5))).toBeLessThanOrEqual(Number(measuredValue(scope.top_10)));
      expect(Number(measuredValue(scope.top_10))).toBeLessThanOrEqual(Number(measuredValue(scope.top_50)));
      expect(Number(measuredValue(scope.top_50))).toBeLessThanOrEqual(1);
    }
    for (const metric of allMetrics(result)) {
      expect(metric.provenance.kind).toBe("measured");
      expect(metric.provenance.datasetHash).toBe(manifest.normalized.uncompressedSha256);
      expect(metric.provenance.anchors.length).toBeGreaterThan(0);
      expect(metric.provenance.universe.length).toBeGreaterThan(0);
      expect(metric.provenance.formula.version).toBe(expected.version);
    }
  }, 10_000);

  it("replays deterministically regardless of title order", () => {
    const first = calculateStaticReceivablesMetrics(universe, {datasetHash: manifest.normalized.uncompressedSha256});
    const reversed: ReceivablesUniverse = {...universe, receivables: [...universe.receivables].reverse()};
    const second = calculateStaticReceivablesMetrics(reversed, {datasetHash: manifest.normalized.uncompressedSha256});
    expect(second).toEqual(first);
  }, 10_000);
});
