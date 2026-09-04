import {describe, expect, it} from "vitest";

import {defaultReadingStrategies, offroadTaskRegistry, readingStrategySchema} from "./task-registry";

describe("reading strategy on every TaskSpec", () => {
  it("leaves no task without a declared way of reading", () => {
    for (const spec of offroadTaskRegistry) {
      expect(spec.readingStrategies.length, spec.id).toBeGreaterThan(0);
      for (const strategy of spec.readingStrategies) expect(readingStrategySchema.options).toContain(strategy);
    }
  });

  it("reads extraction and contract work whole, not by similarity", () => {
    const byId = new Map(offroadTaskRegistry.map((spec) => [spec.id, spec]));
    expect(byId.get("D03")?.readingStrategies).toEqual(["exhaustive_corpus"]);
    expect(byId.get("D04")?.readingStrategies).toEqual(["exhaustive_corpus"]);
    expect(byId.get("S08")?.readingStrategies).toContain("exhaustive_corpus");
    expect(byId.get("S08")?.readingStrategies).toContain("original_vs_amendment");
    expect(byId.get("S08")?.readingStrategies).toContain("threshold_scan");
    expect(byId.get("D06")?.readingStrategies).toContain("version_reconciliation");
  });

  it("scans monitoring work against thresholds and the previous version", () => {
    for (const spec of offroadTaskRegistry.filter((candidate) => candidate.id.startsWith("L"))) {
      expect(spec.readingStrategies, spec.id).toEqual(["threshold_scan", "version_reconciliation"]);
    }
  });

  it("derives a default from the execution class for everything else", () => {
    expect(defaultReadingStrategies("extraction")).toEqual(["exhaustive_corpus"]);
    expect(defaultReadingStrategies("research")).toEqual(["exact_search", "semantic_retrieval"]);
    expect(defaultReadingStrategies("judgment")).toEqual(["structured_query", "semantic_retrieval"]);
    const research = offroadTaskRegistry.find((spec) => spec.executionClass === "research" && spec.id !== "K04");
    expect(research?.readingStrategies).toEqual(defaultReadingStrategies("research"));
  });
});
