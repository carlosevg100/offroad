import {describe, expect, it} from "vitest";

import {diversifiedReceivablesCase, receivablesParametricScenarios} from "./scenarios";
import {underwriteReceivablesPool} from "./underwrite";

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
