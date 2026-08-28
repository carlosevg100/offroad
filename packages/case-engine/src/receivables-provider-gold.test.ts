import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";

import type {ReceivablesMandateObservation, ReceivablesProviderMandate} from "@offroad/fund-mandate";
import type {AssertionProvenance, ReceivableEligibilityClassification, ReceivablesUniverse, SourceAnchor} from "@offroad/financial-core";
import type {ReceivablesPhaseTwoReport, ReceivablesProviderMetricSet} from "@offroad/receivables-analysis";
import {describe, expect, it} from "vitest";

import {analyzeCanonicalReceivablesProviderFit} from "./receivables";

type ProviderCase = {
  id: string;
  providerKind: ReceivablesProviderMandate["providerKind"];
  routeId: string;
  routeStatus: ReceivablesPhaseTwoReport["routes"][number]["status"];
  requestedAmount: string;
  eligiblePortfolioAmount: string;
  conditionalPortfolioAmount: string;
  ticketMinimum: string;
  ticketMaximum: string;
  availableCapacity: string;
  capacitySource: ReceivablesMandateObservation<string>["sourceKind"];
  liveAppetite: boolean;
  estimatedDilution: boolean;
  expectedStatus: string;
  expectedMaximumConfirmedAllocation: string | null;
};
type ProviderCases = {version: string; synthetic: true; cases: ProviderCase[]};

const here = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = resolve(here, "../../testing-fixtures");
const cases = JSON.parse(readFileSync(resolve(fixturesRoot, "gold/receivables-phase-two-b/provider-cases.json"), "utf8")) as ProviderCases;
const datasetHash = "8".repeat(64);
const source: SourceAnchor = {kind: "file", fileId: "provider-gold", fileHash: "9".repeat(64), sheet: "Carteira"};
const coverage = {status: "complete" as const, startDate: "2025-01-01" as const, endDate: "2026-08-27" as const, basis: "synthetic complete", limitations: []};

function universe(scenario: ProviderCase): ReceivablesUniverse {
  const eligible: ReceivablesUniverse["receivables"][number] = {id: "eligible", currency: "BRL", faceValue: scenario.eligiblePortfolioAmount, openValue: scenario.eligiblePortfolioAmount, issueDate: "2026-07-01", originalDueDate: "2026-09-01", currentDueDate: "2026-09-01", obligorId: "o1", status: "open", source};
  const conditional: ReceivablesUniverse["receivables"][number] = {id: "conditional", currency: "BRL", faceValue: scenario.conditionalPortfolioAmount, openValue: scenario.conditionalPortfolioAmount, issueDate: "2026-07-01", originalDueDate: "2026-10-01", currentDueDate: "2026-10-01", obligorId: "o2", status: "open", source};
  const receivables: ReceivablesUniverse["receivables"] = scenario.conditionalPortfolioAmount === "0" ? [eligible] : [eligible, conditional];
  return {
    id: `provider-gold-${scenario.id}`,
    dates: {reportingDate: "2026-08-27", latestOriginationDate: "2026-08-20", dataStartDate: "2025-01-01", dataEndDate: "2026-08-27"},
    currency: "BRL", receivables, settlements: [], dilutions: [], extensions: [], repurchases: [], assignmentsAndLiens: [],
    obligors: [{id: "o1", legalName: "Sacado Um", relatedParty: false, source}, {id: "o2", legalName: "Sacado Dois", relatedParty: false, source}], economicGroups: [],
    eventCoverage: {settlements: coverage, dilutions: coverage, extensions: coverage, repurchases: coverage, assignmentsAndLiens: coverage},
  };
}

const measured = (universeId: string, value: string): {value: string; provenance: AssertionProvenance} => ({
  value,
  provenance: {kind: "measured", datasetHash, anchors: [source], universe: universeId, reportingDate: "2026-08-27", inclusions: ["synthetic"], exclusions: [], formula: {id: "provider-gold", version: cases.version}},
});
const observation = <T>(value: T, sourceKind: ReceivablesMandateObservation<T>["sourceKind"] = "direct_declaration"): ReceivablesMandateObservation<T> => ({
  value, sourceKind, sourceId: `${sourceKind}-${JSON.stringify(value)}`, sourceLabel: "Synthetic provider gold", recordedBy: "analyst-1", observedAt: "2026-08-01", validUntil: "2026-09-30",
});
const threshold = <T>(value: T) => ({mode: "threshold" as const, value});

function mandate(scenario: ProviderCase): ReceivablesProviderMandate {
  return {
    mandateId: `mandate-${scenario.id}`, providerId: `provider-${scenario.id}`, providerLegalName: `Provedor ${scenario.id}`,
    programId: `program-${scenario.id}`, programName: `Programa ${scenario.id}`, providerKind: scenario.providerKind,
    version: 1, effectiveFrom: "2026-08-01", eligibleRoutes: [observation([scenario.routeId])], currencies: [observation(["BRL"])],
    ticket: [observation(threshold({min: scenario.ticketMinimum, max: scenario.ticketMaximum}))],
    weightedAverageTermDays: [observation(threshold({min: "15", max: "180"}))], minimumHistoryMonths: [observation(threshold(12))],
    maximumPastDueOver30Ratio: [observation(threshold("0.05"))], maximumPastDueOver90Ratio: [observation(threshold("0.02"))],
    maximumDilutionRatio: [observation(threshold("0.04"))], maximumAdjustedLossRatio: [observation(threshold("0.03"))],
    maximumSingleObligorRatio: [observation(threshold("0.20"))], maximumTopTenObligorRatio: [observation(threshold("0.70"))],
    minimumEligiblePortfolioAmount: [observation(threshold(scenario.ticketMinimum))], liveAppetite: [observation(scenario.liveAppetite, "relationship_confirmation")],
    availableCapacity: [observation(scenario.availableCapacity, scenario.capacitySource)],
  };
}

describe("receivables provider gold", () => {
  it("is independently verified without importing the TypeScript engine", () => {
    expect(execFileSync("python3", [resolve(fixturesRoot, "scripts/oracle-receivables-providers.py")], {encoding: "utf8"}).trim())
      .toBe(`verified ${cases.cases.length} independent provider cases`);
  });

  for (const scenario of cases.cases) {
    it(`matches the frozen provider oracle for ${scenario.id}`, () => {
      const u = universe(scenario);
      const phaseTwoA: ReceivablesPhaseTwoReport = {
        version: "2026.08.27-v1", analysisLayer: "deterministic_route_eligibility", phaseOne: {version: "phase-one", status: "complete_for_phase_one"},
        universe: {id: u.id, datasetHash, reportingDate: "2026-08-27"},
        routes: [{routeId: scenario.routeId, label: scenario.routeId, mechanism: "receivable_purchase", status: scenario.routeStatus, capitalProviderTypes: [scenario.providerKind], serviceProviderTypes: [], criterionResults: [], portfolioAllocation: null, deskCharacteristics: {implementation: "estimated", economics: "estimated", provenanceClass: "estimated", decisionUseAllowed: false}}],
        providerUniverse: [scenario.providerKind], quality: {status: "complete_for_route_screening", blockers: [], warnings: []}, boundaries: {buyerMandateMatched: false, providerRecommendationAllowed: false, externalDirectionAllowed: false, qualifiedIntroductionAllowed: false, creditApprovalExpressed: false},
      };
      const m = (value: string) => measured(u.id, value);
      const metrics: ReceivablesProviderMetricSet = {
        currency: "BRL", requestedAmount: m(scenario.requestedAmount), weightedAverageTermDays: m("75"), historyMonths: m("20"),
        pastDueOver30Ratio: m("0.01"), pastDueOver90Ratio: m("0.005"),
        dilutionRatio: scenario.estimatedDilution
          ? {value: "0.20", provenance: {kind: "estimated", method: "synthetic estimate", sources: ["partial tape"], asOf: "2026-08-27", owner: "gold", confidence: "low", validUntil: "2026-09-01"}}
          : m("0.02"),
        adjustedLossRatio: m("0.015"), singleObligorRatio: m("0.15"), topTenObligorRatio: m("0.55"),
      };
      const classifications: ReceivableEligibilityClassification[] = u.receivables.map((title) => ({
        receivableId: title.id, disposition: title.id === "eligible" ? "eligible" : "conditional", reason: "synthetic gold", provenance: m("1").provenance,
      }));
      const report = analyzeCanonicalReceivablesProviderFit({
        phaseTwoA, universe: u, asOf: "2026-08-27", metrics, mandates: [mandate(scenario)],
        titleClassificationsByProgram: {[`program-${scenario.id}`]: classifications},
      });
      expect(report.providers[0]?.status).toBe(scenario.expectedStatus);
      expect(report.providers[0]?.allocationEnvelope?.maximumConfirmedAllocation ?? null).toBe(scenario.expectedMaximumConfirmedAllocation);
      expect(report.boundaries).toMatchObject({companyFacingRecommendationAllowed: false, externalDirectionAllowed: false, qualifiedIntroductionAllowed: false, creditApprovalExpressed: false});
    });
  }
});
