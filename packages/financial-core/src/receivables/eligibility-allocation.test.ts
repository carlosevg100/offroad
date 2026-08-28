import {describe, expect, it} from "vitest";

import type {AssertionProvenance, ReceivablesUniverse, SourceAnchor} from "./contracts";
import {calculateReceivablesEligibilityAllocation} from "./eligibility-allocation";

const source: SourceAnchor = {kind: "file", fileId: "tape", fileHash: "a".repeat(64), sheet: "Carteira", row: 2};
const measured = (receivableId: string): AssertionProvenance => ({
  kind: "measured",
  datasetHash: "b".repeat(64),
  anchors: [source],
  universe: "allocation-test",
  reportingDate: "2026-06-30",
  inclusions: [receivableId],
  exclusions: [],
  formula: {id: "classification", version: "v1"},
});

function universe(): ReceivablesUniverse {
  return {
    id: "allocation-test",
    dates: {reportingDate: "2026-06-30", latestOriginationDate: "2026-06-01", dataStartDate: "2026-01-01", dataEndDate: "2026-06-30"},
    currency: "BRL",
    receivables: [
      {id: "r1", currency: "BRL", faceValue: "100", openValue: "100", issueDate: "2026-05-01", originalDueDate: "2026-07-01", currentDueDate: "2026-07-01", obligorId: "o1", status: "open", source},
      {id: "r2", currency: "BRL", faceValue: "50", openValue: "40", issueDate: "2026-05-01", originalDueDate: "2026-07-01", currentDueDate: "2026-07-01", obligorId: "o2", status: "open", source},
      {id: "r3", currency: "BRL", faceValue: "25", openValue: "0", issueDate: "2026-01-01", originalDueDate: "2026-02-01", currentDueDate: "2026-02-01", obligorId: "o1", status: "settled", source},
    ],
    settlements: [], dilutions: [], extensions: [], repurchases: [], assignmentsAndLiens: [],
    obligors: [
      {id: "o1", legalName: "One", relatedParty: false, source},
      {id: "o2", legalName: "Two", relatedParty: false, source},
    ],
    economicGroups: [],
    eventCoverage: {
      settlements: {status: "not_provided", startDate: null, endDate: null, basis: "none", limitations: []},
      dilutions: {status: "not_provided", startDate: null, endDate: null, basis: "none", limitations: []},
      extensions: {status: "not_provided", startDate: null, endDate: null, basis: "none", limitations: []},
      repurchases: {status: "not_provided", startDate: null, endDate: null, basis: "none", limitations: []},
      assignmentsAndLiens: {status: "not_provided", startDate: null, endDate: null, basis: "none", limitations: []},
    },
  };
}

describe("receivables eligibility allocation", () => {
  it("uses one complete exclusive open-portfolio denominator", () => {
    const result = calculateReceivablesEligibilityAllocation({
      universe: universe(), datasetHash: "b".repeat(64),
      classifications: [
        {receivableId: "r1", disposition: "eligible", reason: "measured", provenance: measured("r1")},
        {receivableId: "r2", disposition: "conditional", reason: "proof pending", provenance: measured("r2")},
      ],
    });
    expect(result.denominatorValue).toBe("140");
    expect(result.amounts).toEqual({eligible: "100", conditional: "40", ineligible: "0", not_evaluated: "0"});
    expect(result.shares.eligible).toBe("0.71428571");
    expect(result.titleCounts).toEqual({eligible: 1, conditional: 1, ineligible: 0, not_evaluated: 0});
  });

  it("rejects missing titles and estimated hard exclusions", () => {
    expect(() => calculateReceivablesEligibilityAllocation({
      universe: universe(), datasetHash: "b".repeat(64),
      classifications: [{receivableId: "r1", disposition: "eligible", reason: "ok", provenance: measured("r1")}],
    })).toThrow("missing eligibility classifications: r2");

    expect(() => calculateReceivablesEligibilityAllocation({
      universe: universe(), datasetHash: "b".repeat(64),
      classifications: [
        {receivableId: "r1", disposition: "ineligible", reason: "guess", provenance: {kind: "estimated", method: "guess", sources: [], asOf: "2026-06-30", owner: "desk", confidence: "low", validUntil: "2026-07-31"}},
        {receivableId: "r2", disposition: "eligible", reason: "ok", provenance: measured("r2")},
      ],
    })).toThrow("estimated provenance cannot create a hard ineligibility: r1");
  });
});
