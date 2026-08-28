import {describe, expect, it} from "vitest";
import type {AssertionProvenance} from "@offroad/financial-core";

import {
  canonicalReceivablesFactResolutionCatalogue,
  canonicalReceivablesRouteCatalogue,
  resolveCanonicalReceivablesContractFacts,
} from "./receivables";

const evidence: AssertionProvenance = {
  kind: "measured",
  datasetHash: "a".repeat(64),
  anchors: [{kind: "file", fileId: "registry", fileHash: "b".repeat(64)}],
  universe: "portfolio-1",
  reportingDate: "2026-08-27",
  inclusions: ["complete title registry"],
  exclusions: [],
  formula: {id: "registry_observation", version: "1"},
};

describe("receivables playbook compilation", () => {
  it("compiles the complete canonical catalogue into the deterministic executor", () => {
    expect(canonicalReceivablesRouteCatalogue).toHaveLength(9);
    expect(canonicalReceivablesRouteCatalogue.map((route) => route.id)).toEqual(expect.arrayContaining([
      "factoring_purchase",
      "financial_institution_receivables_discount",
      "digital_credit_receivables_purchase",
      "fidc_multicedent_assignment",
      "secured_revolving_facility",
    ]));
  });

  it("compiles every fact definition and fails closed on everything not evidenced", () => {
    expect(canonicalReceivablesFactResolutionCatalogue).toHaveLength(18);
    const report = resolveCanonicalReceivablesContractFacts({
      asOf: "2026-08-28",
      observations: [{
        id: "registry-1",
        factId: "unresolved_prior_assignment_or_lien",
        state: "false",
        scope: {kind: "portfolio"},
        coverage: {status: "complete", coveredCount: 100, totalCount: 100},
        observedAt: "2026-08-27",
        sourceId: "registry-export",
        sourceLabel: "Consulta de titularidade e gravames",
        sourceOwner: "Mesa Offroad",
        explanation: "O universo consultado não apresenta direitos anteriores não resolvidos.",
        provenance: evidence,
      }],
    });
    expect(report.facts).toHaveLength(18);
    expect(report.facts.find((fact) => fact.id === "unresolved_prior_assignment_or_lien")?.state).toBe("false");
    expect(report.facts.find((fact) => fact.id === "contractual_assignability_confirmed")?.state).toBe("unknown");
    expect(report.quality.status).toBe("incomplete");
  });
});
