import {describe, expect, it} from "vitest";
import type {AssertionProvenance, ReceivablesUniverse, SourceAnchor} from "@offroad/financial-core";

import {runReceivablesCasePipeline} from "./receivables-case";

const source: SourceAnchor = {kind: "file", fileId: "tape", fileHash: "c".repeat(64), sheet: "Carteira", row: 2};
const coverage = {status: "complete" as const, startDate: "2026-01-01" as const, endDate: "2026-08-27" as const, basis: "synthetic complete", limitations: []};
const provenance: AssertionProvenance = {
  kind: "measured",
  datasetHash: "d".repeat(64),
  anchors: [source],
  universe: "pipeline-facts",
  reportingDate: "2026-08-27",
  inclusions: ["complete registry"],
  exclusions: [],
  formula: {id: "pipeline_fact", version: "1"},
};

const universe: ReceivablesUniverse = {
  id: "pipeline-facts",
  dates: {reportingDate: "2026-08-27", latestOriginationDate: "2026-08-01", dataStartDate: "2026-08-01", dataEndDate: "2026-08-01"},
  currency: "BRL",
  receivables: [{id: "r1", currency: "BRL", faceValue: "100", openValue: "100", issueDate: "2026-08-01", originalDueDate: "2026-09-01", currentDueDate: "2026-09-01", obligorId: "o1", status: "open", source}],
  settlements: [], dilutions: [], extensions: [], repurchases: [], assignmentsAndLiens: [],
  obligors: [{id: "o1", legalName: "Sacado", relatedParty: false, source}], economicGroups: [],
  eventCoverage: {settlements: coverage, dilutions: coverage, extensions: coverage, repurchases: coverage, assignmentsAndLiens: coverage},
};

describe("receivables case fact boundary", () => {
  it("resolves evidence in the governed runner and preserves the external-use boundaries", () => {
    const report = runReceivablesCasePipeline({
      caseId: "case-facts",
      classification: {categoryIds: ["trade_receivables"], cellIds: ["mercantil_b2b"], evidence: [provenance]},
      phaseOne: {universe, datasetHash: "d".repeat(64)},
      routeFactResolution: {
        asOf: "2026-08-28",
        observations: [{
          id: "lien-1",
          factId: "unresolved_prior_assignment_or_lien",
          state: "true",
          scope: {kind: "title", id: "r1"},
          coverage: {status: "partial", coveredCount: 1, totalCount: 10},
          observedAt: "2026-08-27",
          sourceId: "registry",
          sourceLabel: "Consulta de gravames",
          sourceOwner: "Mesa Offroad",
          explanation: "O título possui cessão anterior não resolvida.",
          provenance,
        }],
      },
      providerFit: {asOf: "2026-08-28", metrics: {currency: "BRL", requestedAmount: {value: "100", provenance}}, mandates: []},
      defects: [],
      questions: [],
    });
    expect(report.factResolution?.facts.find((fact) => fact.id === "unresolved_prior_assignment_or_lien")?.state).toBe("true");
    expect(report.phaseTwoA.routes.find((route) => route.routeId === "factoring_purchase")?.status).toBe("ineligible");
    expect(report.boundaries).toEqual({companyFacingRecommendationAllowed: false, externalDirectionAllowed: false, qualifiedIntroductionAllowed: false, creditApprovalExpressed: false});
  });

  it("requires exactly one route-fact input path", () => {
    expect(() => runReceivablesCasePipeline({
      caseId: "case-facts",
      classification: {categoryIds: ["trade_receivables"], cellIds: ["mercantil_b2b"], evidence: [provenance]},
      phaseOne: {universe, datasetHash: "d".repeat(64)},
      routeFacts: [],
      routeFactResolution: {asOf: "2026-08-28", observations: []},
      providerFit: {asOf: "2026-08-28", metrics: {currency: "BRL", requestedAmount: {value: "100", provenance}}, mandates: []},
      defects: [], questions: [],
    })).toThrow("exactly one");
  });
});
