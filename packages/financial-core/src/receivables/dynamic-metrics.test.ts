import {describe, expect, it} from "vitest";

import type {ReceivablesUniverse} from "./contracts";
import {calculateDynamicReceivablesMetrics, receivablesRollDestinations} from "./dynamic-metrics";

const HASH = "b".repeat(64);
const source = (row: number) => ({kind: "file" as const, fileId: "performance.csv", fileHash: HASH, row});

function universe(): ReceivablesUniverse {
  return {
    id: "dynamic-metrics-test",
    dates: {reportingDate: "2026-04-30", latestOriginationDate: "2026-01-01", dataStartDate: "2026-01-01", dataEndDate: "2026-01-01"},
    currency: "BRL",
    receivables: [
      {id: "r1", currency: "BRL", faceValue: "100", openValue: "0", issueDate: "2026-01-01", originalDueDate: "2026-01-31", currentDueDate: "2026-01-31", obligorId: "o1", economicGroupId: "g1", status: "settled", source: source(2)},
      {id: "r2", currency: "BRL", faceValue: "200", openValue: "0", issueDate: "2026-01-01", originalDueDate: "2026-01-31", currentDueDate: "2026-03-02", obligorId: "o2", economicGroupId: "g2", status: "settled", source: source(3)},
      {id: "r3", currency: "BRL", faceValue: "300", openValue: "0", issueDate: "2026-01-01", originalDueDate: "2026-01-31", currentDueDate: "2026-01-31", obligorId: "o3", economicGroupId: "g3", status: "written_off", source: source(4)},
    ],
    settlements: [
      {id: "s1", receivableId: "r1", date: "2026-02-10", amount: "100", source: source(10)},
      {id: "s2", receivableId: "r2", date: "2026-03-15", amount: "190", source: source(11)},
    ],
    dilutions: [{id: "d2", receivableId: "r2", date: "2026-03-15", amount: "10", reason: "rebate", source: source(12)}],
    extensions: [{id: "e2", receivableId: "r2", date: "2026-02-01", identifiedAt: "2026-02-01", previousDueDate: "2026-01-31", newDueDate: "2026-03-02", source: source(13)}],
    repurchases: [],
    assignmentsAndLiens: [],
    obligors: [
      {id: "o1", legalName: "One", economicGroupId: "g1", relatedParty: false, source: source(20)},
      {id: "o2", legalName: "Two", economicGroupId: "g2", relatedParty: false, source: source(21)},
      {id: "o3", legalName: "Three", economicGroupId: "g3", relatedParty: false, source: source(22)},
    ],
    economicGroups: [
      {id: "g1", name: "One", obligorIds: ["o1"], source: source(20)},
      {id: "g2", name: "Two", obligorIds: ["o2"], source: source(21)},
      {id: "g3", name: "Three", obligorIds: ["o3"], source: source(22)},
    ],
    eventCoverage: {
      settlements: {status: "complete", startDate: "2026-01-01", endDate: "2026-04-30", basis: "test fixture", limitations: []},
      dilutions: {status: "complete", startDate: "2026-01-01", endDate: "2026-04-30", basis: "test fixture", limitations: []},
      extensions: {status: "complete", startDate: "2026-01-01", endDate: "2026-04-30", basis: "test fixture", limitations: []},
      repurchases: {status: "complete", startDate: "2026-01-01", endDate: "2026-04-30", basis: "test fixture", limitations: []},
      assignmentsAndLiens: {status: "not_provided", startDate: null, endDate: null, basis: "test fixture", limitations: []},
    },
  };
}

describe("dynamic receivables metrics", () => {
  it("calculates monthly migrations on original due dates and reconciles every row", () => {
    const result = calculateDynamicReceivablesMetrics(universe(), {datasetHash: HASH});
    expect(result.rollRates.status).toBe("measured");
    expect(result.rollRates.periods).toHaveLength(3);
    const january = result.rollRates.periods[0]!;
    expect(january.fromDate).toBe("2026-01-31");
    expect(january.rows.not_due.sourceExposure).toBe("600");
    expect(january.rows.not_due.transitions.resolved.amount).toBe("100");
    expect(january.rows.not_due.transitions.past_due_16_30.amount).toBe("500");
    expect(january.rows.not_due.transitions.resolved.rate.value).toBe("0.16666667");

    for (const period of result.rollRates.periods) {
      for (const row of Object.values(period.rows)) {
        if (row.sourceExposure === "0") continue;
        const amount = receivablesRollDestinations.reduce((total, destination) => total + Number(row.transitions[destination].amount), 0);
        const rate = receivablesRollDestinations.reduce((total, destination) => total + Number(row.transitions[destination].rate.value), 0);
        expect(amount).toBeCloseTo(Number(row.sourceExposure), 8);
        expect(rate).toBeCloseTo(1, 8);
      }
    }
  });

  it("calculates fully observed vintage survival and keeps immature horizons unavailable", () => {
    const result = calculateDynamicReceivablesMetrics(universe(), {datasetHash: HASH});
    const cohort = result.vintages.cohorts[0]!;
    expect(cohort.cohortMonth).toBe("2026-01");
    expect(cohort.horizons[30].unresolvedAmount).toBe("500");
    expect(cohort.horizons[30].unresolvedShare.value).toBe("0.83333333");
    expect(cohort.horizons[60].unresolvedAmount).toBe("300");
    expect(cohort.horizons[60].unresolvedShare.value).toBe("0.5");
    expect(cohort.horizons[90].unresolvedShare.status).toBe("not_evaluable");
    expect(cohort.horizons[90].unresolvedShare.value).toBeNull();
  });

  it("measures dilution, final loss, punctuality and extensions without inventing assigned volume", () => {
    const result = calculateDynamicReceivablesMetrics(universe(), {datasetHash: HASH});
    expect(result.dilution.totalAmount.value).toBe("10");
    expect(result.dilution.byReason.rebate.amount.value).toBe("10");
    expect(result.repurchaseAndLoss.finalWrittenOffAmount.value).toBe("300");
    expect(result.repurchaseAndLoss.adjustedLossShare.value).toBe("0.5");
    expect(result.repurchaseAndLoss.repurchaseShareOfAssigned.status).toBe("not_evaluable");
    expect(result.punctualSettlement.punctualByCount.value).toBe("0");
    expect(result.extensions.extendedTitleShare.value).toBe("0.33333333");
    expect(result.extensions.weightedExtensionDays.value).toBe("30");
  });

  it("measures only the unresolved amount of a partially resolved written-off title", () => {
    const input = universe();
    input.settlements = [...input.settlements, {
      id: "s3",
      receivableId: "r3",
      date: "2026-03-31",
      amount: "100",
      source: source(14),
    }];
    const result = calculateDynamicReceivablesMetrics(input, {datasetHash: HASH});
    expect(result.repurchaseAndLoss.finalWrittenOffAmount.value).toBe("200");
    expect(result.repurchaseAndLoss.finalWrittenOffShare.value).toBe("0.33333333");
    expect(result.repurchaseAndLoss.adjustedLossAmount.value).toBe("200");
  });

  it("fails closed when lifecycle events were not provided", () => {
    const input = universe();
    input.eventCoverage = {
      settlements: {status: "not_provided", startDate: null, endDate: null, basis: "absent", limitations: []},
      dilutions: {status: "not_provided", startDate: null, endDate: null, basis: "absent", limitations: []},
      extensions: {status: "not_provided", startDate: null, endDate: null, basis: "absent", limitations: []},
      repurchases: {status: "not_provided", startDate: null, endDate: null, basis: "absent", limitations: []},
      assignmentsAndLiens: {status: "not_provided", startDate: null, endDate: null, basis: "absent", limitations: []},
    };
    const result = calculateDynamicReceivablesMetrics(input, {datasetHash: HASH});
    expect(result.rollRates.status).toBe("not_evaluable");
    expect(result.vintages.status).toBe("not_evaluable");
    expect(result.dilution.totalAmount.status).toBe("not_evaluable");
    expect(result.repurchaseAndLoss.adjustedLossShare.status).toBe("not_evaluable");
    expect(result.punctualSettlement.punctualByValue.status).toBe("not_evaluable");
    expect(result.extensions.extendedTitleCount.status).toBe("not_evaluable");
  });
});
