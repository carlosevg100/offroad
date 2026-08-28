import {
  canonicalReceivablesRouteCatalogue,
  runReceivablesCasePipeline,
} from "@offroad/case-engine";
import type {
  ReceivablesCapitalProviderKind,
  ReceivablesMandateObservation,
  ReceivablesProviderMandate,
} from "@offroad/fund-mandate";
import type {
  AssertionProvenance,
  ReceivableEligibilityClassification,
  ReceivablesUniverse,
  SourceAnchor,
} from "@offroad/financial-core";
import {describe, expect, it} from "vitest";

import {
  evaluateReceivablesPhaseThree,
  type ReceivablesPhaseThreeGold,
} from "./receivables-phase-three";

const datasetHash = "a".repeat(64);
const source: SourceAnchor = {
  kind: "file",
  fileId: "gold-tape",
  fileHash: "b".repeat(64),
  sheet: "receivables",
  row: 2,
};
const completeCoverage = {
  status: "complete" as const,
  startDate: "2025-01-01" as const,
  endDate: "2026-08-27" as const,
  basis: "synthetic complete event ledger",
  limitations: [],
};

function universe(): ReceivablesUniverse {
  return {
    id: "phase-three-gold",
    dates: {
      reportingDate: "2026-08-27",
      latestOriginationDate: "2026-07-10",
      dataStartDate: "2025-01-01",
      dataEndDate: "2026-07-10",
    },
    currency: "BRL",
    receivables: [
      {id: "r1", currency: "BRL", faceValue: "8000000", openValue: "8000000", issueDate: "2026-07-01", originalDueDate: "2026-09-01", currentDueDate: "2026-09-01", obligorId: "o1", status: "open", source},
      {id: "r2", currency: "BRL", faceValue: "4000000", openValue: "4000000", issueDate: "2026-07-10", originalDueDate: "2026-10-01", currentDueDate: "2026-10-01", obligorId: "o2", status: "open", source},
      {id: "r3", currency: "BRL", faceValue: "1000000", openValue: "0", issueDate: "2025-01-01", originalDueDate: "2025-02-01", currentDueDate: "2025-02-01", obligorId: "o1", status: "settled", source},
      {id: "r4", currency: "BRL", faceValue: "1000000", openValue: "0", issueDate: "2025-02-01", originalDueDate: "2025-03-01", currentDueDate: "2025-03-01", obligorId: "o2", status: "settled", source},
    ],
    settlements: [
      {id: "s3", receivableId: "r3", date: "2025-02-01", amount: "1000000", source},
      {id: "s4", receivableId: "r4", date: "2025-03-01", amount: "1000000", source},
    ],
    dilutions: [],
    extensions: [],
    repurchases: [],
    assignmentsAndLiens: [
      {id: "a3", receivableId: "r3", kind: "assignment", effectiveDate: "2025-01-02", amount: "1000000", assigneeOrBeneficiary: "Synthetic Program", withRecourse: true, source},
      {id: "a4", receivableId: "r4", kind: "assignment", effectiveDate: "2025-02-02", amount: "1000000", assigneeOrBeneficiary: "Synthetic Program", withRecourse: true, source},
    ],
    obligors: [
      {id: "o1", legalName: "Sacado Um", relatedParty: false, source},
      {id: "o2", legalName: "Sacado Dois", relatedParty: false, source},
    ],
    economicGroups: [],
    eventCoverage: {
      settlements: completeCoverage,
      dilutions: completeCoverage,
      extensions: completeCoverage,
      repurchases: completeCoverage,
      assignmentsAndLiens: completeCoverage,
    },
  };
}

const measuredProvenance = (): AssertionProvenance => ({
  kind: "measured",
  datasetHash,
  anchors: [source],
  universe: "phase-three-gold",
  reportingDate: "2026-08-27",
  inclusions: ["synthetic gold universe"],
  exclusions: [],
  formula: {id: "phase_three_gold_input", version: "1"},
});
const measured = (value: string) => ({value, provenance: measuredProvenance()});
const estimated = (id: string, value: string) => ({
  id,
  value,
  basis: "frozen synthetic gold assumption",
  provenance: {
    kind: "estimated" as const,
    method: "frozen synthetic gold assumption",
    sources: ["phase-three-gold"],
    asOf: "2026-08-27" as const,
    owner: "receivables desk",
    confidence: "high" as const,
    validUntil: "2026-09-30" as const,
  },
});
const observed = <T>(value: T): ReceivablesMandateObservation<T> => ({
  value,
  sourceKind: "relationship_confirmation",
  sourceId: `gold-${JSON.stringify(value)}`,
  sourceLabel: "Frozen synthetic provider confirmation",
  recordedBy: "analyst-1",
  observedAt: "2026-08-20",
  validUntil: "2026-09-30",
});
const threshold = <T>(value: T) => ({mode: "threshold" as const, value});

function provider(
  programId: string,
  providerKind: ReceivablesCapitalProviderKind,
  routeId: string,
): ReceivablesProviderMandate {
  return {
    mandateId: `mandate-${programId}`,
    providerId: `provider-${programId}`,
    providerLegalName: `Synthetic ${programId}`,
    providerKind,
    programId,
    programName: `Synthetic ${programId}`,
    version: 1,
    effectiveFrom: "2026-08-01",
    eligibleRoutes: [observed([routeId])],
    currencies: [observed(["BRL"])],
    ticket: [observed(threshold({min: "2000000", max: "10000000"}))],
    weightedAverageTermDays: [observed(threshold({min: "15", max: "180"}))],
    minimumHistoryMonths: [observed(threshold(12))],
    maximumPastDueOver30Ratio: [observed(threshold("0.05"))],
    maximumPastDueOver90Ratio: [observed(threshold("0.02"))],
    maximumDilutionRatio: [observed(threshold("0.04"))],
    maximumAdjustedLossRatio: [observed(threshold("0.03"))],
    maximumSingleObligorRatio: [observed(threshold("0.70"))],
    maximumTopTenObligorRatio: [observed(threshold("1"))],
    minimumEligiblePortfolioAmount: [observed(threshold("2000000"))],
    liveAppetite: [observed(true)],
    availableCapacity: [observed("10000000")],
  };
}

function pipeline() {
  const caseUniverse = universe();
  const factExpectations = new Map<string, "true" | "false">();
  for (const route of canonicalReceivablesRouteCatalogue) {
    for (const criterion of route.criteria) factExpectations.set(criterion.factId, criterion.expected);
  }
  const routeFacts = [...factExpectations.entries()].map(([id, expected]) => ({
    id,
    state: expected,
    explanation: "Frozen synthetic fact satisfies the canonical route criterion.",
    provenance: measuredProvenance(),
  }));
  const titleClassifications: ReceivableEligibilityClassification[] = caseUniverse.receivables.filter((receivable) => receivable.status === "open").map((receivable) => ({
    receivableId: receivable.id,
    disposition: "eligible",
    reason: "synthetic gold policy pass",
    provenance: measuredProvenance(),
  }));
  return runReceivablesCasePipeline({
    caseId: "phase-three-gold",
    classification: {
      categoryIds: ["receivables_financing"],
      cellIds: ["trade_receivables_assignment"],
      evidence: [measuredProvenance()],
    },
    phaseOne: {
      universe: caseUniverse,
      datasetHash,
      adjustedDebt: {
        positions: [{id: "bank-1", creditor: "Bank One", category: "bank_debt", principal: "1000000", declarationStatus: "company_declared", sources: [source]}],
        companyDeclaredDebt: {value: "1000000", source},
        cash: {value: "100000", source},
        ebitdaForLeverage: {value: "500000", periodStart: "2025-01-01", periodEnd: "2025-12-31", basis: "reported", source},
      },
      proposals: [{
        id: "proposal-one",
        proposal: {
          faceValue: "10000000",
          startDate: "2026-08-27",
          maturityDate: "2026-10-01",
          quote: {regime: "inside_compound_monthly", monthlyRate: "0.02"},
          source,
          charges: [],
          taxTreatment: {status: "not_applicable", source},
        },
      }],
      advanceRate: {
        periodStart: "2025-01-01",
        expectedDilution: estimated("expected-dilution", "0"),
        expectedLossRate: estimated("expected-loss", "0.01"),
        dilutionStressMultiplier: estimated("dilution-stress", "1.5"),
        lossStressMultiplier: estimated("loss-stress", "2"),
        operationalReserve: estimated("operational-reserve", "0.01"),
      },
    },
    routeFacts,
    providerFit: {
      asOf: "2026-08-27",
      metrics: {
        currency: "BRL",
        requestedAmount: measured("10000000"),
        weightedAverageTermDays: measured("75"),
        historyMonths: measured("20"),
        pastDueOver30Ratio: measured("0"),
        pastDueOver90Ratio: measured("0"),
        dilutionRatio: measured("0"),
        adjustedLossRatio: measured("0"),
        singleObligorRatio: measured("0.66666667"),
        topTenObligorRatio: measured("1"),
      },
      mandates: [provider("factoring-gold", "factoring_company", "factoring_purchase")],
      titleClassificationsByProgram: {"factoring-gold": titleClassifications},
    },
    defects: [{
      id: "related_party_review",
      description: "Synthetic defect retained for harness validation.",
      evidence: [measuredProvenance()],
      measured: {value: "1", unit: "count", provenance: measuredProvenance()},
    }],
    questions: [{
      id: "q-1",
      text: "Confirme se existe cessão anterior não refletida na base entregue.",
      triggerId: "assignment_registry_not_delivered",
      trigger: measuredProvenance(),
      evidenceSearch: {
        deliveredEvidenceIds: ["gold-tape", "gold-contract"],
        searchedEvidenceIds: ["gold-contract", "gold-tape"],
        status: "exhausted_without_answer",
      },
    }],
  });
}

const gold: ReceivablesPhaseThreeGold = {
  caseId: "phase-three-gold",
  classification: {categoryIds: ["receivables_financing"], cellIds: ["trade_receivables_assignment"]},
  calculations: [
    {id: "phaseOne.staticMetrics.portfolio.totalOpenValue", value: "12000000"},
    {id: "phaseOne.adjustedDebt.adjustedNetDebt", value: "900000"},
    {id: "defect.related_party_review", value: "1"},
  ],
  defectIds: ["related_party_review"],
  compatibleProgramIds: ["factoring-gold"],
  questionIds: ["q-1"],
};

describe("receivables Phase 3 full-case evaluation", () => {
  it("passes a complete frozen gold replay across all deterministic layers", () => {
    const pipelineReport = pipeline();
    const report = evaluateReceivablesPhaseThree(pipelineReport, gold);
    expect(report.passed, JSON.stringify({evaluation: report, pipeline: pipelineReport.quality, phaseOne: pipelineReport.phaseOne.quality, phaseTwoA: pipelineReport.phaseTwoA.quality, phaseTwoB: pipelineReport.phaseTwoB.quality}, null, 2)).toBe(true);
    expect(report.failedGates).toEqual([]);
    expect(report.calculation.accuracy).toBe(1);
    expect(report.classification.accuracy).toBe(1);
    expect(report.defects).toMatchObject({recall: 1, precision: 1});
    expect(report.programs).toMatchObject({exact: true, actual: ["factoring-gold"]});
    expect(report.questions).toMatchObject({expected: 1, detected: 1, valid: true, answerableFromDeliveredEvidence: 0});
    expect(report.provenance.coverage).toBe(1);
  });

  it("fails visibly when the frozen gold expects an undetected defect or another provider", () => {
    const report = evaluateReceivablesPhaseThree(pipeline(), {
      ...gold,
      defectIds: ["related_party_review", "unmarked_extensions"],
      compatibleProgramIds: ["factoring-gold", "finance-company-gold"],
    });
    expect(report.passed).toBe(false);
    expect(report.failedGates).toEqual(expect.arrayContaining(["compatible_programs", "defect_recall"]));
    expect(report.defects.missed).toEqual(["unmarked_extensions"]);
    expect(report.programs.missing).toEqual(["finance-company-gold"]);
  });

  it("rejects a client question before all delivered evidence was searched", () => {
    const valid = pipeline();
    const invalid = runReceivablesCasePipeline({
      caseId: valid.caseId,
      classification: valid.classification,
      phaseOne: {
        universe: universe(),
        datasetHash,
      },
      routeFacts: [],
      providerFit: {asOf: "2026-08-27", metrics: {currency: "BRL", requestedAmount: measured("1")}, mandates: []},
      defects: [],
      questions: [{
        id: "invalid-question",
        text: "Pergunta que ainda é respondível pela documentação.",
        triggerId: "missing-search",
        trigger: measuredProvenance(),
        evidenceSearch: {deliveredEvidenceIds: ["a", "b"], searchedEvidenceIds: ["a"], status: "exhausted_without_answer"},
      }],
    });
    expect(invalid.quality.status).toBe("incomplete");
    expect(invalid.quality.blockers).toContain("question:invalid-question:delivered_evidence_not_exhausted");
  });
});
