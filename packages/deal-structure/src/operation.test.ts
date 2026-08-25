import type {DebtTruthSet, FinancialTruthSet, ReconciledFact} from "@offroad/reconciliation";
import {describe, expect, it} from "vitest";

import {buildOperationTruthSet} from "./operation";

const f = (fieldPath: string, value: string, valueType: ReconciledFact["valueType"] = "number"): ReconciledFact => ({
  key: {fieldPath}, value, valueType,
  accepted: {fieldPath, normalizedValue: value, valueType, sourceDocument: "gold.xlsx", evidenceRank: 2, informationClass: "company_document", confidence: 1, anchorVerified: true, anchor: {sheet: "Inputs", cell: "A1"}},
  conflicts: [], disputed: false,
});
const financialTruth = {statements: [{period: "2025", adjustedEbitda: "35"}]} as unknown as FinancialTruthSet;
const debtTruth = {
  views: {grossFinancialDebt: "60", unrestrictedCash: "10"}, covenants: [], liquidityCoverage: [{period: "downside", coverage: "1.35", deficit: "0"}],
} as unknown as DebtTruthSet;
const policies = {version: "2026.08.25-v1", sizingMateriality: "5", residualTolerance: "0", authorizedBuffer: "10", annualDebtCost: "0.16", annualCashYield: "0.10", minimumDscr: "1.2", generalPurposeCap: "5"};

describe("M4 Operation Truth Set", () => {
  it("closes a clean capex operation with traceable need, sources and uses", () => {
    const facts = [
      f("transaction.requested_amount", "100"), f("transaction.purpose", "expansion", "text"), f("transaction.desired_term_months", "60"),
      f("project.total_cost", "100"), f("transaction.incremental_working_capital", "20"), f("transaction.transaction_costs", "3"), f("transaction.execution_buffer", "7"), f("project.company_cash", "30"),
      f("transaction.sources_and_uses.1.side", "source", "text"), f("transaction.sources_and_uses.1.item", "New debt", "text"), f("transaction.sources_and_uses.1.amount", "100"),
      f("transaction.sources_and_uses.2.side", "source", "text"), f("transaction.sources_and_uses.2.item", "Company cash", "text"), f("transaction.sources_and_uses.2.amount", "30"),
      f("transaction.sources_and_uses.3.side", "use", "text"), f("transaction.sources_and_uses.3.item", "Capex", "text"), f("transaction.sources_and_uses.3.amount", "100"),
      f("transaction.sources_and_uses.4.side", "use", "text"), f("transaction.sources_and_uses.4.item", "Capital de giro", "text"), f("transaction.sources_and_uses.4.amount", "20"),
      f("transaction.sources_and_uses.5.side", "use", "text"), f("transaction.sources_and_uses.5.item", "Custos", "text"), f("transaction.sources_and_uses.5.amount", "3"),
      f("transaction.sources_and_uses.6.side", "use", "text"), f("transaction.sources_and_uses.6.item", "Buffer", "text"), f("transaction.sources_and_uses.6.amount", "7"),
      f("transaction.declared_version", "v1", "text"), f("transaction.declared_version_confirmed_at", "2026-08-25", "date"),
      f("transaction.capacity_scenarios.1.name", "downside", "text"), f("transaction.capacity_scenarios.1.dscr", "1.35"), f("transaction.capacity_scenarios.1.liquidity_deficit", "0"),
    ];
    const truth = buildOperationTruthSet({facts, financialTruth, debtTruth, capacity: null, requestedAmount: "100", requestedTermMonths: 60, referenceDate: "2026-08-25", policies});
    expect(truth.calculatedNeed?.value).toBe("100");
    expect(truth.sourcesAndUses).toMatchObject({totalSources: "130", totalUses: "130", difference: "0", status: "pass"});
    expect(truth.proForma).toMatchObject({grossDebt: "160", netDebt: "180", leverage: "5.14285714"});
    expect(truth.procedureCoverage).toHaveLength(14);
    expect(truth.procedureCoverage.find((item) => item.procedureId === "OP-02")?.status).toBe("completed");
  });

  it("fails closed on a mismatch, an uncovered period and a bridge without take-out", () => {
    const facts = [
      f("transaction.requested_amount", "100"), f("project.total_cost", "100"), f("transaction.incremental_working_capital", "1"), f("transaction.transaction_costs", "1"), f("transaction.execution_buffer", "1"),
      f("transaction.sources_and_uses.1.side", "source", "text"), f("transaction.sources_and_uses.1.item", "Debt", "text"), f("transaction.sources_and_uses.1.amount", "100"),
      f("transaction.sources_and_uses.2.side", "use", "text"), f("transaction.sources_and_uses.2.item", "Capex", "text"), f("transaction.sources_and_uses.2.amount", "120"),
      f("transaction.bridge.amount", "100"),
      f("transaction.disbursement_schedule.1.period", "M1", "text"), f("transaction.disbursement_schedule.1.sources", "10"), f("transaction.disbursement_schedule.1.uses", "20"),
    ];
    const truth = buildOperationTruthSet({facts, financialTruth, debtTruth, capacity: null, referenceDate: "2026-08-25", policies});
    expect(truth.status).toBe("blocked");
    expect(truth.exceptions.map((item) => item.id)).toEqual(expect.arrayContaining(["sources-uses-mismatch", "bridge-without-takeout", "uncovered-disbursement-period"]));
    expect(truth.procedureCoverage.find((item) => item.procedureId === "OP-02")?.exceptionIds).toEqual(["sources-uses-mismatch"]);
    expect(truth.procedureCoverage.find((item) => item.procedureId === "OP-10")?.status).toBe("blocked");
    expect(truth.procedureCoverage.find((item) => item.procedureId === "OP-10")?.exceptionIds).toEqual(["bridge-without-takeout"]);
    expect(truth.procedureCoverage.find((item) => item.procedureId === "OP-11")?.exceptionIds).toEqual(["uncovered-disbursement-period"]);
    expect(truth.procedureCoverage.find((item) => item.procedureId === "OP-01")?.exceptionIds).toEqual([]);
  });

  it("shows the real unmatched amount when one side of sources and uses is missing", () => {
    const truth = buildOperationTruthSet({
      facts: [
        f("transaction.requested_amount", "100"),
        f("transaction.sources_and_uses.1.side", "source", "text"),
        f("transaction.sources_and_uses.1.item", "Debt", "text"),
        f("transaction.sources_and_uses.1.amount", "100"),
      ],
      financialTruth,
      debtTruth,
      capacity: null,
      referenceDate: "2026-08-25",
      policies,
    });
    expect(truth.sourcesAndUses).toMatchObject({totalSources: "100", totalUses: "0", difference: "100", status: "not_computable"});
  });
});
