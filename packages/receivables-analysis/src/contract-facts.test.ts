import {describe, expect, it} from "vitest";
import type {AssertionProvenance} from "@offroad/financial-core";

import {
  resolveReceivablesContractFacts,
  type ReceivablesFactObservation,
  type ReceivablesFactResolutionDefinitionInput,
} from "./contract-facts";

const measured: AssertionProvenance = {
  kind: "measured",
  datasetHash: "hash-1",
  anchors: [{kind: "file", fileId: "file-1", fileHash: "file-hash"}],
  universe: "portfolio-1",
  reportingDate: "2026-08-27",
  inclusions: ["all titles"],
  exclusions: [],
  formula: {id: "evidence_observation", version: "1"},
};

const definitions: readonly ReceivablesFactResolutionDefinitionInput[] = [
  {id: "contractual_assignability_confirmed", safeState: "true", safeCoverage: "complete", adverseHandling: "complete_only", unresolvedRequest: "Entregar contratos."},
  {id: "unresolved_prior_assignment_or_lien", safeState: "false", safeCoverage: "complete", adverseHandling: "any_confirmed_observation", unresolvedRequest: "Comprovar ausência de ônus."},
];

function observation(overrides: Partial<ReceivablesFactObservation> = {}): ReceivablesFactObservation {
  return {
    id: "obs-1",
    factId: "contractual_assignability_confirmed",
    state: "true",
    scope: {kind: "portfolio"},
    coverage: {status: "complete", coveredCount: 10, totalCount: 10},
    observedAt: "2026-08-27",
    validUntil: "2026-09-30",
    sourceId: "contract-set-1",
    sourceLabel: "Contratos comerciais",
    sourceOwner: "Mesa Offroad",
    explanation: "Os contratos do universo permitem cessão.",
    provenance: measured,
    ...overrides,
  };
}

describe("receivables contract fact resolution", () => {
  it("resolves a fact only from complete current evidence", () => {
    const report = resolveReceivablesContractFacts({asOf: "2026-08-28", definitions, observations: [observation()]});
    expect(report.facts.find((fact) => fact.id === "contractual_assignability_confirmed")?.state).toBe("true");
    expect(report.facts.find((fact) => fact.id === "unresolved_prior_assignment_or_lien")?.state).toBe("unknown");
    expect(report.quality.status).toBe("incomplete");
  });

  it("keeps favourable sample evidence unknown", () => {
    const report = resolveReceivablesContractFacts({
      asOf: "2026-08-28",
      definitions,
      observations: [observation({coverage: {status: "partial", coveredCount: 9, totalCount: 10}})],
    });
    expect(report.facts[0]?.state).toBe("unknown");
    expect(report.dispositions[0]).toMatchObject({decisionUseAllowed: false, reason: "partial_safe_evidence"});
  });

  it("blocks on a confirmed prior lien even when only part of the portfolio was inspected", () => {
    const report = resolveReceivablesContractFacts({
      asOf: "2026-08-28",
      definitions,
      observations: [observation({
        id: "lien-1",
        factId: "unresolved_prior_assignment_or_lien",
        state: "true",
        coverage: {status: "partial", coveredCount: 1, totalCount: 10},
        explanation: "Um título possui cessão anterior ainda não resolvida.",
      })],
    });
    expect(report.facts.find((fact) => fact.id === "unresolved_prior_assignment_or_lien")?.state).toBe("true");
  });

  it("exposes contradictory current evidence instead of choosing silently", () => {
    const report = resolveReceivablesContractFacts({
      asOf: "2026-08-28",
      definitions,
      observations: [
        observation(),
        observation({id: "obs-2", state: "false", explanation: "Um contrato proíbe cessão."}),
      ],
    });
    expect(report.facts[0]?.state).toBe("unknown");
    expect(report.conflicts).toEqual([{
      factId: "contractual_assignability_confirmed",
      observationIds: ["obs-1", "obs-2"],
      reason: "current_material_evidence_disagrees",
    }]);
  });

  it("does not let estimated or expired evidence decide", () => {
    const estimated: AssertionProvenance = {kind: "estimated", method: "desk inference", sources: ["call"], asOf: "2026-08-01", owner: "desk", confidence: "medium", validUntil: "2026-09-30"};
    const report = resolveReceivablesContractFacts({
      asOf: "2026-08-28",
      definitions,
      observations: [
        observation({id: "estimated", provenance: estimated}),
        observation({id: "expired", observedAt: "2026-07-01", validUntil: "2026-07-31"}),
      ],
    });
    expect(report.facts[0]?.state).toBe("unknown");
    expect(report.dispositions.map((item) => item.reason)).toEqual(["estimated", "stale"]);
  });

  it("rejects future evidence and invalid coverage", () => {
    expect(() => resolveReceivablesContractFacts({asOf: "2026-08-28", definitions, observations: [observation({observedAt: "2026-08-29"})]})).toThrow("future fact observation");
    expect(() => resolveReceivablesContractFacts({asOf: "2026-08-28", definitions, observations: [observation({coverage: {status: "complete", coveredCount: 9, totalCount: 10}})]})).toThrow("full universe");
    expect(() => resolveReceivablesContractFacts({asOf: "2026-02-31", definitions, observations: []})).toThrow("invalid fact observation date");
  });
});
