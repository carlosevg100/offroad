import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";

import type {AssertionProvenance, ReceivablesUniverse, SourceAnchor} from "@offroad/financial-core";
import {analyzeReceivablesPhaseOne, type ReceivablesEligibilityFact} from "@offroad/receivables-analysis";
import {describe, expect, it} from "vitest";

import {analyzeCanonicalReceivablesPhaseTwo} from "./receivables";

type RouteCase = {
  id: string;
  facts: Record<string, "true" | "false" | "unknown">;
  estimatedFacts?: string[];
  expected: Record<string, string>;
};
type RouteCases = {version: string; synthetic: true; cases: RouteCase[]};

const here = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = resolve(here, "../../testing-fixtures");
const cases = JSON.parse(readFileSync(resolve(fixturesRoot, "gold/receivables-phase-two/route-cases.json"), "utf8")) as RouteCases;
const datasetHash = "e".repeat(64);
const source: SourceAnchor = {kind: "file", fileId: "phase-two-gold", fileHash: "f".repeat(64), sheet: "Carteira", row: 2};
const coverage = {status: "complete" as const, startDate: "2026-06-01" as const, endDate: "2026-06-30" as const, basis: "synthetic complete", limitations: []};

function universe(): ReceivablesUniverse {
  return {
    id: "phase-two-gold",
    dates: {reportingDate: "2026-06-30", latestOriginationDate: "2026-06-01", dataStartDate: "2026-06-01", dataEndDate: "2026-06-01"},
    currency: "BRL",
    receivables: [{id: "r1", currency: "BRL", faceValue: "100", openValue: "100", issueDate: "2026-06-01", originalDueDate: "2026-07-01", currentDueDate: "2026-07-01", obligorId: "o1", status: "open", source}],
    settlements: [], dilutions: [], extensions: [], repurchases: [], assignmentsAndLiens: [],
    obligors: [{id: "o1", legalName: "Synthetic Obligor", relatedParty: false, source}], economicGroups: [],
    eventCoverage: {settlements: coverage, dilutions: coverage, extensions: coverage, repurchases: coverage, assignmentsAndLiens: coverage},
  };
}

const measured = (id: string): AssertionProvenance => ({
  kind: "measured", datasetHash, anchors: [source], universe: "phase-two-gold", reportingDate: "2026-06-30",
  inclusions: [id], exclusions: [], formula: {id: "gold-fact", version: cases.version},
});
const estimated = (id: string): AssertionProvenance => ({
  kind: "estimated", method: "synthetic desk estimate", sources: [id], asOf: "2026-06-30", owner: "gold oracle", confidence: "medium", validUntil: "2026-07-31",
});

describe("receivables route gold", () => {
  it("is independently verified without importing the TypeScript engine", () => {
    const output = execFileSync("python3", [resolve(fixturesRoot, "scripts/oracle-receivables-routes.py")], {encoding: "utf8"});
    expect(output.trim()).toBe(`verified ${cases.cases.length} independent route cases`);
  });

  for (const scenario of cases.cases) {
    it(`matches the frozen route oracle for ${scenario.id}`, () => {
      const u = universe();
      const phaseOne = analyzeReceivablesPhaseOne({universe: u, datasetHash});
      const estimatedFacts = new Set(scenario.estimatedFacts ?? []);
      const facts: ReceivablesEligibilityFact[] = Object.entries(scenario.facts).map(([id, state]) => ({
        id, state, explanation: `${id}=${state}`,
        ...(state === "unknown" ? {} : {provenance: estimatedFacts.has(id) ? estimated(id) : measured(id)}),
      }));
      const report = analyzeCanonicalReceivablesPhaseTwo({phaseOne, universe: u, facts});
      expect(Object.fromEntries(report.routes.map((route) => [route.routeId, route.status]))).toEqual(scenario.expected);
      expect(report.boundaries).toEqual({
        buyerMandateMatched: false,
        providerRecommendationAllowed: false,
        externalDirectionAllowed: false,
        qualifiedIntroductionAllowed: false,
        creditApprovalExpressed: false,
      });
    });
  }
});
