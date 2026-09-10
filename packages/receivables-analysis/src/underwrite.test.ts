import {describe, expect, it} from "vitest";
import {calculateDynamicReceivablesMetrics} from "@offroad/financial-core";
import {canonicalizeLegacyReceivablesCase} from "./canonical";

import {diversifiedReceivablesCase, receivablesParametricScenarios} from "./scenarios";
import {underwriteReceivablesPool, receivablesPoolUnderwritingSchema} from "./underwrite";
import {analyzeReceivables} from "./analyze";
import {buildReceivablesHistoryCoverage} from "./history-coverage";

describe("governed receivables pool underwriting method", () => {
  it("emits a traceable pool, reconciliation, borrowing base and waterfall without model math", () => {
    const result = underwriteReceivablesPool({currency: "BRL", case: diversifiedReceivablesCase()});
    expect(result).toMatchObject({
      schema_version: "method.underwrite-receivables-pool.v1",
      state: "ready_for_structuring",
      case_id: "receivables-clean-diversified",
      reference_date: "2026-08-24",
      currency: "BRL",
      portfolio_summary: {totalOutstanding: "6000000.00", concentrationAdjustedEligibleBalance: "6000000.00"},
      borrowing_base: {supportedFacility: "4800000.00", requestedFacility: "3000000.00"},
      decision_boundary: {externalDirectionAllowed: false},
    });
    expect(result.reconciliation.tapeToAccounting.status).toBe("tied");
    expect(result.trace.policy.maxSingleDebtorShare).toBe("0.20");
    expect(result.trace.source_rows).toHaveLength(60);
    expect(result.trace.input_fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(result.trace.output_fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is byte-stable when portfolio and cash rows arrive in another order", () => {
    const first = diversifiedReceivablesCase();
    const second = structuredClone(first);
    second.portfolio.reverse();
    second.cashReceipts.reverse();
    const left = underwriteReceivablesPool({currency: "BRL", case: first});
    const right = underwriteReceivablesPool({currency: "BRL", case: second});
    expect(right).toEqual(left);
  });

  it.each([
    ["r02-accounting-mismatch", "trigger_accounting_reconciliation"],
    ["r11-single-debtor-concentration", "trigger_single_debtor_concentration"],
    ["r15-encumbered-base", "facility_above_borrowing_base"],
    ["r19-no-eligible-base", "facility_above_borrowing_base"],
    ["r20-duplicate-cash", "duplicate_cash_receipts"],
  ])("keeps adversarial %s visible instead of forcing a positive case", (scenarioId, expectedGap) => {
    const scenario = receivablesParametricScenarios.find((candidate) => candidate.id === scenarioId)!;
    const result = underwriteReceivablesPool({currency: "BRL", case: scenario.input});
    expect(result.state).not.toBe("ready_for_structuring");
    expect(result.gaps.map((entry) => entry.code)).toContain(expectedGap);
    expect(result.decision_boundary.externalDirectionAllowed).toBe(false);
  });

  it("rejects an undeclared currency rather than silently relabeling the economics", () => {
    expect(() => underwriteReceivablesPool({currency: "EUR" as "BRL", case: diversifiedReceivablesCase()})).toThrow();
  });
});


describe("R01 history and economic conventions", () => {
  it("keeps unavailable history distinct from reported zero aggregates", () => {
    const result = underwriteReceivablesPool({currency: "BRL", case: diversifiedReceivablesCase()});
    expect(result.performance.dilutionRate).toBe("0.00000000");
    expect(result.history_coverage?.aggregatePerformanceBasis).toBe("reported_title_aggregates");
    expect(result.trace.projection_version).toBe("receivables-underwriting-coverage.v1");
    for (const id of ["roll_rates", "vintages", "dilution"]) {
      expect(result.history_coverage?.families.find((family) => family.id === id)?.status).toBe("not_evaluable");
    }
    expect(result.history_coverage?.families.find((family) => family.id === "dilution")?.warnings.length).toBeGreaterThan(0);
    expect(result.economic_conventions?.concentrationDenominator).toBe("preliminary_eligible_balance");
    expect(result.economic_conventions?.waterfallOrder).toEqual(result.waterfall.map((item) => item.item));
  });

  it("does not promote a partially observed family to complete", () => {
    const metrics = structuredClone(analyzeReceivables(diversifiedReceivablesCase()).dynamicMetrics);
    metrics.dilution.totalAmount.status = "measured";
    metrics.dilution.totalAmount.value = "0";
    const family = buildReceivablesHistoryCoverage(metrics).families.find((item) => item.id === "dilution")!;
    expect(family.status).toBe("partial");
    expect(family.unavailableMetricIds.length).toBeGreaterThan(0);

  });

  it("does not count container readiness as observations for short complete history", () => {
    const input = diversifiedReceivablesCase();
    for (const title of input.portfolio) title.originDate = "2026-08-01";
    const {universe, datasetHash} = canonicalizeLegacyReceivablesCase(input);
    for (const key of Object.keys(universe.eventCoverage) as (keyof typeof universe.eventCoverage)[]) {
      universe.eventCoverage[key] = {status: "complete", startDate: universe.dates.dataStartDate,
        endDate: universe.dates.reportingDate, basis: "synthetic short complete history", limitations: []};
    }
    const metrics = calculateDynamicReceivablesMetrics(universe, {datasetHash});
    expect(metrics.rollRates.status).toBe("measured");
    expect(metrics.rollRates.periods).toEqual([]);
    expect(metrics.vintages.status).toBe("measured");
    expect(metrics.vintages.cohorts.length).toBeGreaterThan(0);
    const coverage = buildReceivablesHistoryCoverage(metrics);
    expect(coverage.families.find((item) => item.id === "roll_rates")?.status).toBe("not_evaluable");
    const vintages = coverage.families.find((item) => item.id === "vintages")!;
    expect(vintages.status).toBe("not_evaluable");
    expect(vintages.unavailableMetricIds.length).toBeGreaterThan(0);
    expect(vintages.warnings.length).toBeGreaterThan(0);
    universe.dates.reportingDate = "2026-10-31" as typeof universe.dates.reportingDate;
    for (const coverage of Object.values(universe.eventCoverage)) coverage.endDate = universe.dates.reportingDate;
    const observed = calculateDynamicReceivablesMetrics(universe, {datasetHash});
    expect(observed.rollRates.periods.length).toBeGreaterThan(0);
    observed.rollRates.status = "not_evaluable";
    observed.rollRates.warnings = ["incomplete_context"];
    const contextual = buildReceivablesHistoryCoverage(observed).families.find((item) => item.id === "roll_rates")!;
    expect(contextual.status).toBe("partial");
    expect(contextual.warnings).toContain("incomplete_context");
  });

  it("reads legacy results without inventing retrospective coverage", () => {
    const result = underwriteReceivablesPool({currency: "BRL", case: diversifiedReceivablesCase()});
    delete result.history_coverage;
    delete result.economic_conventions;
    delete result.trace.projection_version;
    const parsed = receivablesPoolUnderwritingSchema.parse(result);
    expect(parsed.history_coverage).toBeUndefined();
    expect(parsed.economic_conventions).toBeUndefined();
    expect(parsed.trace).toEqual(result.trace);
  });

  it("caps overlapping debtor and group exposures once on the preliminary base", () => {
    const input = diversifiedReceivablesCase();
    // Synthetic 6m: group A has debtors 2m+1m, B has 1m, C has 1m, D has 1m.
    // Debtor cap 1.2m; group cap 1.5m. A becomes min(1.2m+1m,1.5m).
    input.portfolio.forEach((row, index) => {
      const debtor = index < 20 ? "a1" : index < 30 ? "a2" : index < 40 ? "b" : index < 50 ? "c" : "d";
      row.debtorId = debtor;
      row.debtorGroupId = debtor.startsWith("a") ? "a" : debtor;
    });
    input.cashReceipts.forEach((receipt) => { receipt.debtorId = "a1"; });
    const result = underwriteReceivablesPool({currency: "BRL", case: input});
    expect(result.portfolio_summary.preliminaryEligibleBalance).toBe("6000000.00");
    expect(result.portfolio_summary.concentrationAdjustedEligibleBalance).toBe("4500000.00");
    expect(result.borrowing_base.maximumByAdvanceRate).toBe("3600000.00");
    expect(result.borrowing_base.maximumByOvercollateralization).toBe("3600000.00");
    expect(result.borrowing_base.supportedFacility).toBe("3600000.00");
  });
});
