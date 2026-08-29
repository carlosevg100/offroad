import type {AssertionProvenance, ReceivablesUniverse, SourceAnchor} from "@offroad/financial-core";
import {describe, expect, it} from "vitest";

import {runReceivablesCasePipeline} from "./receivables-case";
import {projectReceivablesUnderstanding} from "./receivables-understanding";

const source: SourceAnchor = {kind: "file", fileId: "tape", fileHash: "c".repeat(64), sheet: "Carteira", row: 2};
const coverage = {status: "complete" as const, startDate: "2026-01-01" as const, endDate: "2026-08-27" as const, basis: "synthetic complete", limitations: []};
const provenance: AssertionProvenance = {
  kind: "measured",
  datasetHash: "d".repeat(64),
  anchors: [source],
  universe: "understanding-gold",
  reportingDate: "2026-08-27",
  inclusions: ["complete registry"],
  exclusions: [],
  formula: {id: "understanding_gold", version: "1"},
};

const universe: ReceivablesUniverse = {
  id: "understanding-gold",
  dates: {reportingDate: "2026-08-27", latestOriginationDate: "2026-08-01", dataStartDate: "2026-08-01", dataEndDate: "2026-08-01"},
  currency: "BRL",
  receivables: [{id: "r1", currency: "BRL", faceValue: "100", openValue: "100", issueDate: "2026-08-01", originalDueDate: "2026-09-01", currentDueDate: "2026-09-01", obligorId: "o1", status: "open", source}],
  settlements: [], dilutions: [], extensions: [], repurchases: [], assignmentsAndLiens: [],
  obligors: [{id: "o1", legalName: "Sacado", relatedParty: false, source}], economicGroups: [],
  eventCoverage: {settlements: coverage, dilutions: coverage, extensions: coverage, repurchases: coverage, assignmentsAndLiens: coverage},
};

describe("receivables understanding projection", () => {
  it("turns the governed report into a gated snapshot without leaking later-stage work", () => {
    const report = runReceivablesCasePipeline({
      caseId: "case-understanding",
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
      defects: [{id: "duplicate-title", description: "Um identificador de título aparece em fontes incompatíveis.", evidence: [provenance]}],
      questions: [{
        id: "commercial-cause",
        text: "Qual é a causa comercial da divergência?",
        triggerId: "duplicate-title",
        trigger: provenance,
        evidenceSearch: {deliveredEvidenceIds: ["tape"], searchedEvidenceIds: ["tape"], status: "exhausted_without_answer"},
      }],
    });

    const projection = projectReceivablesUnderstanding({report, createdAt: "2026-08-29T12:00:00.000Z"});
    expect(projection.version).toBe("2026.08.29-v1");
    expect(projection.snapshot.claims.some((claim) => claim.id === "receivables.metric.portfolio.total_open_value" && claim.classification === "calculated")).toBe(true);
    expect(projection.snapshot.claims.some((claim) => claim.id === "receivables.fact.unresolved_prior_assignment_or_lien" && claim.classification === "confirmed" && claim.decisionImpact === "transaction_blocker")).toBe(true);
    expect(projection.snapshot.claims.some((claim) => claim.id.includes("provider") || claim.id.includes("shortlist"))).toBe(false);
    expect(projection.clarification.items).toHaveLength(5);
    expect(projection.clarification.items[0]).toMatchObject({claimId: "receivables.fact.unresolved_prior_assignment_or_lien", priority: "transaction_blocker", classification: "confirmed"});
    expect(projection.gate.status).toBe("passed");
    expect(projection.boundaries).toEqual({structureRecommendationAllowed: false, materialProductionAllowed: false, matchingAllowed: false, qualifiedIntroductionAllowed: false});
  });
});
