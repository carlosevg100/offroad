import type {ReceivablesUniverse, SourceAnchor} from "@offroad/financial-core";
import {describe, expect, it} from "vitest";

import {analyzeReceivablesPhaseOne} from "./phase-one";

const datasetHash = "a".repeat(64);
const source: SourceAnchor = {
  kind: "file",
  fileId: "test-tape",
  fileHash: "b".repeat(64),
  sheet: "receivables",
  row: 2,
};

const completeCoverage = {
  status: "complete" as const,
  startDate: "2025-01-01" as const,
  endDate: "2026-06-30" as const,
  basis: "complete event ledger",
  limitations: [],
};

function universe(): ReceivablesUniverse {
  return {
    id: "phase-one-test",
    dates: {
      reportingDate: "2026-06-30",
      latestOriginationDate: "2026-05-01",
      dataStartDate: "2026-05-01",
      dataEndDate: "2026-05-01",
    },
    currency: "BRL",
    receivables: [{
      id: "r-1",
      currency: "BRL",
      faceValue: "100000",
      openValue: "100000",
      issueDate: "2026-05-01",
      originalDueDate: "2026-06-01",
      currentDueDate: "2026-06-01",
      obligorId: "o-1",
      economicGroupId: "g-1",
      status: "open",
      source,
    }],
    settlements: [],
    dilutions: [],
    extensions: [],
    repurchases: [],
    assignmentsAndLiens: [{
      id: "assignment-1",
      receivableId: "r-1",
      kind: "assignment",
      effectiveDate: "2026-05-02",
      amount: "100000",
      assigneeOrBeneficiary: "Vehicle One",
      withRecourse: true,
      source,
    }],
    obligors: [{id: "o-1", legalName: "Obligor One", economicGroupId: "g-1", relatedParty: false, source}],
    economicGroups: [{id: "g-1", name: "Group One", obligorIds: ["o-1"], source}],
    eventCoverage: {
      settlements: completeCoverage,
      dilutions: completeCoverage,
      extensions: completeCoverage,
      repurchases: completeCoverage,
      assignmentsAndLiens: completeCoverage,
    },
  };
}

const estimated = (id: string, value: string, basis: string) => ({
  id,
  value,
  basis,
  provenance: {
    kind: "estimated" as const,
    method: basis,
    sources: ["phase-one-test"],
    asOf: "2026-06-30" as const,
    owner: "credit desk",
    confidence: "medium" as const,
    validUntil: "2026-09-30" as const,
  },
});

describe("receivables Phase 1 canonical orchestrator", () => {
  it("composes canonical engines without expressing buyer direction or credit approval", () => {
    const report = analyzeReceivablesPhaseOne({
      universe: universe(),
      datasetHash,
      adjustedDebt: {
        positions: [{
          id: "bank-1",
          creditor: "Bank One",
          category: "bank_debt",
          principal: "1000000",
          declarationStatus: "company_declared",
          sources: [source],
        }],
        companyDeclaredDebt: {value: "1000000", source},
        cash: {value: "100000", source},
        ebitdaForLeverage: {value: "500000", periodStart: "2025-01-01", periodEnd: "2025-12-31", basis: "reported", source},
      },
      proposals: [{
        id: "proposal-one",
        proposal: {
          faceValue: "100000",
          startDate: "2026-07-01",
          maturityDate: "2026-08-01",
          quote: {regime: "inside_compound_monthly", monthlyRate: "0.02"},
          source,
          charges: [],
          taxTreatment: {status: "not_applicable", source},
        },
      }],
      advanceRate: {
        periodStart: "2025-01-01",
        expectedDilution: estimated("expected-dilution", "0", "historical measured dilution used as a governed forward proxy"),
        expectedLossRate: estimated("expected-loss", "0.01", "governed forward loss assumption"),
        dilutionStressMultiplier: estimated("dilution-stress", "1.5", "governed dilution stress"),
        lossStressMultiplier: estimated("loss-stress", "2", "governed loss stress"),
        operationalReserve: estimated("operational-reserve", "0.01", "governed operating reserve"),
      },
    });

    expect(report.quality.status).toBe("complete_for_phase_one");
    expect(report.quality.blockers).toEqual([]);
    expect(report.adjustedDebt?.adjustedNetDebt.value).toBe("900000");
    expect(report.proposals[0]?.result.cet.status).toBe("calculated_complete");
    expect(report.implicitAdvanceRate?.implicitAdvanceRate.value).toBe("0.97");
    expect(report.boundaries).toEqual({
      externalDirectionAllowed: false,
      buyerRecommendationAllowed: false,
      qualifiedIntroductionAllowed: false,
      creditApprovalExpressed: false,
    });
  });

  it("reports missing structure inputs as blockers instead of inventing them", () => {
    const report = analyzeReceivablesPhaseOne({universe: universe(), datasetHash});
    expect(report.quality.status).toBe("incomplete");
    expect(report.quality.blockers).toEqual([
      "adjusted_debt_bridge_not_provided",
      "advance_rate_scenario_not_provided",
      "financing_proposal_not_provided",
    ]);
    expect(report.adjustedDebt).toBeNull();
    expect(report.implicitAdvanceRate).toBeNull();
  });

  it("rejects duplicate proposal identities", () => {
    const proposal = {
      faceValue: "100000",
      startDate: "2026-07-01" as const,
      maturityDate: "2026-08-01" as const,
      quote: {regime: "inside_compound_monthly" as const, monthlyRate: "0.02"},
      source,
      charges: [],
      taxTreatment: {status: "not_applicable" as const, source},
    };
    expect(() => analyzeReceivablesPhaseOne({
      universe: universe(),
      datasetHash,
      proposals: [{id: "same", proposal}, {id: "same", proposal}],
    })).toThrow("duplicate proposal id");
  });
});
