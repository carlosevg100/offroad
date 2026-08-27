import {describe, expect, it} from "vitest";

import type {ReceivablesUniverse} from "./contracts";
import {calculateStaticReceivablesMetrics, validateReceivablesUniverse} from "./static-metrics";

const HASH = "a".repeat(64);
const source = (row: number) => ({kind: "file" as const, fileId: "tape.csv", fileHash: HASH, row});

function universe(): ReceivablesUniverse {
  return {
    id: "static-metrics-test",
    dates: {
      reportingDate: "2026-06-30",
      latestOriginationDate: "2026-06-30",
      dataStartDate: "2025-07-01",
      dataEndDate: "2026-06-30",
    },
    currency: "BRL",
    receivables: [
      {id: "r1", currency: "BRL", faceValue: "100", openValue: "100", issueDate: "2025-07-01", originalDueDate: "2025-07-31", currentDueDate: "2025-07-31", obligorId: "o1", economicGroupId: "g1", status: "open", source: source(2)},
      {id: "r2", currency: "BRL", faceValue: "200", openValue: "50", issueDate: "2026-06-29", originalDueDate: "2026-07-29", currentDueDate: "2026-08-28", obligorId: "o2", economicGroupId: "g1", status: "open", source: source(3)},
      {id: "r3", currency: "BRL", faceValue: "300", openValue: "0", issueDate: "2026-06-30", originalDueDate: "2026-07-30", currentDueDate: "2026-07-30", obligorId: "o3", economicGroupId: "g2", status: "settled", source: source(4)},
    ],
    settlements: [
      {id: "s2", receivableId: "r2", date: "2026-06-30", amount: "150", source: source(20)},
      {id: "s3", receivableId: "r3", date: "2026-06-30", amount: "300", source: source(21)},
    ],
    dilutions: [],
    extensions: [],
    repurchases: [],
    assignmentsAndLiens: [],
    obligors: [
      {id: "o1", legalName: "One", relatedParty: false, source: source(10)},
      {id: "o2", legalName: "Two", relatedParty: false, source: source(11)},
      {id: "o3", legalName: "Three", relatedParty: false, source: source(12)},
    ],
    economicGroups: [
      {id: "g1", name: "Group One", obligorIds: ["o1", "o2"], source: source(10)},
      {id: "g2", name: "Group Two", obligorIds: ["o3"], source: source(12)},
    ],
    eventCoverage: {
      settlements: {status: "complete", startDate: "2025-07-01", endDate: "2026-06-30", basis: "test fixture", limitations: []},
      dilutions: {status: "complete", startDate: "2025-07-01", endDate: "2026-06-30", basis: "test fixture", limitations: []},
      extensions: {status: "complete", startDate: "2025-07-01", endDate: "2026-06-30", basis: "test fixture", limitations: []},
      repurchases: {status: "complete", startDate: "2025-07-01", endDate: "2026-06-30", basis: "test fixture", limitations: []},
      assignmentsAndLiens: {status: "not_provided", startDate: null, endDate: null, basis: "test fixture", limitations: []},
    },
  };
}

describe("static receivables metrics", () => {
  it("calculates audited portfolio, term, DSO, aging and concentration metrics", () => {
    const result = calculateStaticReceivablesMetrics(universe(), {datasetHash: HASH});

    expect(result.portfolio.titleCount.value).toBe("3");
    expect(result.portfolio.totalFaceValue.value).toBe("600");
    expect(result.portfolio.trailing365Origination.value).toBe("600");
    expect(result.portfolio.averageTicket.value).toBe("200");
    expect(result.portfolio.totalOpenValue.value).toBe("150");
    expect(result.portfolio.weightedOriginalTermDays.value).toBe("30");
    expect(result.portfolio.weightedCurrentTermDays.value).toBe("40");
    expect(result.portfolio.weightedRemainingTermDays.value).toBe("19.66666667");
    expect(result.portfolio.simpleDsoDays.value).toBe("91.25");
    expect(result.aging.past_due_over_180.value).toBe("100");
    expect(result.aging.not_due.value).toBe("50");
    expect(result.concentration.trailing365ByObligor.top_1.value).toBe("0.5");
    expect(result.concentration.trailing365ByEconomicGroup.top_1.value).toBe("0.5");
    expect(result.concentration.openByEconomicGroup.top_1.value).toBe("1");
    expect(result.portfolio.simpleDsoDays.provenance.formula.id).toBe("receivables.simple_dso");
    expect(result.portfolio.simpleDsoDays.provenance.anchors).toEqual([{kind: "file", fileId: "tape.csv", fileHash: HASH}]);
  });

  it("is invariant to input order", () => {
    const first = universe();
    const second = {...first, receivables: [...first.receivables].reverse()};
    expect(calculateStaticReceivablesMetrics(second, {datasetHash: HASH})).toEqual(
      calculateStaticReceivablesMetrics(first, {datasetHash: HASH}),
    );
  });

  it("rejects duplicate ids, missing obligors and inconsistent dates", () => {
    const duplicate = universe();
    duplicate.receivables[1]!.id = "r1";
    expect(() => validateReceivablesUniverse(duplicate)).toThrow("duplicate receivable id");

    const missingObligor = universe();
    missingObligor.receivables[1]!.obligorId = "missing";
    expect(() => validateReceivablesUniverse(missingObligor)).toThrow("unknown obligor");

    const badLatest = universe();
    badLatest.dates.latestOriginationDate = "2026-06-29";
    expect(() => validateReceivablesUniverse(badLatest)).toThrow("latest origination date");
  });

  it("requires a source hash and a dataset hash", () => {
    expect(() => calculateStaticReceivablesMetrics(universe(), {datasetHash: "bad"})).toThrow("SHA-256");
    const noFileSource = universe();
    noFileSource.receivables = noFileSource.receivables.map((item, index) => ({
      ...item,
      source: {kind: "event", eventId: `event-${index}`, sourceSystem: "ledger", occurredAt: "2026-06-30T00:00:00Z"},
    }));
    noFileSource.obligors = noFileSource.obligors.map((item, index) => ({
      ...item,
      source: {kind: "event", eventId: `obligor-${index}`, sourceSystem: "ledger", occurredAt: "2026-06-30T00:00:00Z"},
    }));
    noFileSource.economicGroups = noFileSource.economicGroups.map((item, index) => ({
      ...item,
      source: {kind: "event", eventId: `group-${index}`, sourceSystem: "ledger", occurredAt: "2026-06-30T00:00:00Z"},
    }));
    expect(calculateStaticReceivablesMetrics(noFileSource, {datasetHash: HASH}).portfolio.titleCount.value).toBe("3");
  });
});
