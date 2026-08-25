import {describe, expect, it} from "vitest";

import {buildDebtTruthSet} from "./debt-truth";
import {reconcileFacts, type FactCandidate} from "./facts";
import {buildFinancialTruthSet} from "./financial-truth";

const candidate = (fieldPath: string, normalizedValue: string, valueType: FactCandidate["valueType"] = "number", sourceDocument = "room.xlsx", periodEnd?: string): FactCandidate => ({
  fieldPath, normalizedValue, valueType, sourceDocument, evidenceRank: 1, informationClass: "audited",
  confidence: 0.99, anchorVerified: true, ...(periodEnd ? {periodEnd} : {}), anchor: {sheet: "truth", cell: fieldPath},
});

describe("M2 financial truth", () => {
  it("creates reconciled statements, bridges and an explicit failed identity", () => {
    const period = "2025-12-31";
    const facts = reconcileFacts([
      candidate("historical_financials.2025.revenue", "200000000", "number", "audit.pdf", period),
      candidate("historical_financials.2025.ebitda", "30000000", "number", "audit.pdf", period),
      candidate("historical_financials.2025.receivables", "38000000", "number", "audit.pdf", period),
      candidate("historical_financials.2025.inventory", "27000000", "number", "audit.pdf", period),
      candidate("historical_financials.2025.payables", "22000000", "number", "audit.pdf", period),
      candidate("historical_financials.2025.cash_taxes", "2500000", "number", "cashflow.xlsx", period),
      candidate("historical_financials.2025.maintenance_capex", "4000000", "number", "cashflow.xlsx", period),
      candidate("historical_financials.2025.working_capital_investment", "3500000", "number", "cashflow.xlsx", period),
      candidate("historical_financials.2025.fixed_charges", "1000000", "number", "cashflow.xlsx", period),
      candidate("historical_financials.2025.total_assets", "100", "number", "audit.pdf", period),
      candidate("historical_financials.2025.total_liabilities_equity", "99", "number", "audit.pdf", period),
    ]);
    const truth = buildFinancialTruthSet(facts);
    expect(truth.statements[0]).toMatchObject({reportedEbitda: "30000000", adjustedEbitda: "30000000", workingCapital: "43000000", cfads: "19000000"});
    expect(truth.identityChecks[0]?.status).toBe("fail");
    expect(truth.status).toBe("blocked");
    expect(truth.exceptions[0]?.blocksExternalOutputs).toBe(true);
  });

  it("executes all Q procedures explicitly and computes supported analytical views", () => {
    const facts = reconcileFacts([
      candidate("historical_financials.2025.revenue", "200", "number", "audit.pdf", "2025-12-31"),
      candidate("historical_financials.2025.ebitda", "30", "number", "audit.pdf", "2025-12-31"),
      candidate("historical_financials.monthly.1.month", "2025-01-31", "date"), candidate("historical_financials.monthly.1.revenue", "80"), candidate("historical_financials.monthly.1.working_capital", "20"),
      candidate("historical_financials.monthly.2.month", "2025-02-28", "date"), candidate("historical_financials.monthly.2.revenue", "120"), candidate("historical_financials.monthly.2.working_capital", "30"),
      candidate("customers.top_customers.1.name", "Cliente A", "text"), candidate("customers.top_customers.1.share_pct", "0.25"),
      candidate("customers.top_customers.2.name", "Cliente B", "text"), candidate("customers.top_customers.2.share_pct", "0.15"),
      candidate("historical_financials.currency_mix.1.currency", "USD", "text"), candidate("historical_financials.currency_mix.1.revenue", "50"), candidate("historical_financials.currency_mix.1.cost", "20"), candidate("historical_financials.currency_mix.1.debt_service", "18"), candidate("historical_financials.currency_mix.1.hedge", "3"),
      candidate("historical_financials.receivables_aging.1.bucket", "90+", "text"), candidate("historical_financials.receivables_aging.1.amount", "10"),
      candidate("historical_financials.inventory_aging.1.bucket", "180+", "text"), candidate("historical_financials.inventory_aging.1.amount", "8"),
    ]);
    const truth = buildFinancialTruthSet(facts);
    expect(truth.procedureCoverage).toHaveLength(18);
    expect(truth.analytics.customerConcentration).toMatchObject({top1: "0.25", top5: "0.4"});
    expect(truth.analytics.revenueSeasonality).toMatchObject({average: "100", amplitude: "0.4"});
    expect(truth.analytics.currencyExposure[0]).toMatchObject({currency: "USD", exposure: "15"});
    expect(truth.procedureCoverage.find((item) => item.procedureId === "Q-06")?.status).toBe("completed");
    expect(truth.procedureCoverage.find((item) => item.procedureId === "Q-05")?.status).toBe("not_computable");
  });
});

describe("M3 debt truth", () => {
  it("builds the instrument ledger, distinct views, covenant test and reconciliation", () => {
    const facts = reconcileFacts([
      candidate("debt.instruments.1.lender", "Banco A", "text"),
      candidate("debt.instruments.1.instrument_type", "CCB", "text"),
      candidate("debt.instruments.1.principal", "10000000"),
      candidate("debt.instruments.1.accrued_interest", "500000"),
      candidate("debt.instruments.1.currency", "BRL", "text"),
      candidate("debt.instruments.1.maturity", "2027-06-30", "date"),
      candidate("debt.instruments.1.amortization", "bullet", "text"),
      candidate("debt.instruments.1.cash_cost", "CDI + 4.0%", "text"),
      candidate("debt.instruments.1.covenant_included", "true", "boolean"),
      candidate("debt.instruments.1.capacity_obligation", "true", "boolean"),
      candidate("debt.total_gross", "10500000"),
      candidate("historical_financials.2025.cash", "2000000", "number", "audit.pdf", "2025-12-31"),
      candidate("debt.covenants.1.metric", "net debt / EBITDA", "text"),
      candidate("debt.covenants.1.definition", "net debt divided by adjusted EBITDA", "text"),
      candidate("debt.covenants.1.direction", "maximum", "text"),
      candidate("debt.covenants.1.threshold", "3.0"),
      candidate("debt.covenants.1.tested_value", "2.5"),
    ]);
    const truth = buildDebtTruthSet(facts, "2026-08-25");
    expect(truth.instruments[0]).toMatchObject({balance: "10500000", completeness: 8 / 9});
    expect(truth.views).toMatchObject({grossFinancialDebt: "10500000", netFinancialDebt: "8500000", covenantDebt: "10500000"});
    expect(truth.covenants[0]).toMatchObject({headroom: "0.5", status: "pass"});
    expect(truth.reconciliations[0]?.status).toBe("pass");
  });

  it("builds contractual schedules, obligation views, debt and interest bridges, stress and cross-default", () => {
    const facts = reconcileFacts([
      candidate("debt.instruments.1.contract_id", "CCB-001", "text"), candidate("debt.instruments.1.lender", "Banco A", "text"),
      candidate("debt.instruments.1.instrument_type", "CCB", "text"), candidate("debt.instruments.1.principal", "13"),
      candidate("debt.instruments.1.currency", "BRL", "text"), candidate("debt.instruments.1.indexer", "CDI", "text"), candidate("debt.instruments.1.spread", "0.04"),
      candidate("debt.instruments.1.average_balance", "12"), candidate("debt.instruments.1.cash_interest", "1.2"), candidate("debt.instruments.1.accounting_interest", "1.3"),
      candidate("debt.instruments.1.maturity", "2027-12-31", "date"), candidate("debt.instruments.1.amortization", "bullet", "text"), candidate("debt.instruments.1.cash_cost", "CDI + 4%", "text"),
      candidate("debt.instruments.1.collateral", "recebíveis", "text"), candidate("debt.instruments.1.covenant_included", "true", "boolean"), candidate("debt.instruments.1.capacity_obligation", "true", "boolean"),
      candidate("debt.payments.1.instrument_id", "CCB-001", "text"), candidate("debt.payments.1.date", "2027-06-30", "date"), candidate("debt.payments.1.principal", "5"), candidate("debt.payments.1.interest", "1"),
      candidate("debt.payments.2.instrument_id", "CCB-001", "text"), candidate("debt.payments.2.date", "2027-12-31", "date"), candidate("debt.payments.2.principal", "8"), candidate("debt.payments.2.interest", "0.5"),
      candidate("debt.obligations.1.nature", "aval a terceiro", "text"), candidate("debt.obligations.1.amount", "4"), candidate("debt.obligations.1.off_balance_sheet", "true", "boolean"), candidate("debt.obligations.1.probability", "possible", "text"),
      candidate("debt.balance_bridge.opening_balance", "10"), candidate("debt.balance_bridge.drawdowns", "5"), candidate("debt.balance_bridge.amortizations", "2"), candidate("debt.balance_bridge.closing_balance", "13"),
      candidate("debt.interest_bridge.accounting_total", "1.3"),
      candidate("debt.cross_default_edges.1.from_instrument", "CCB-001", "text"), candidate("debt.cross_default_edges.1.to_instrument", "DEB-002", "text"), candidate("debt.cross_default_edges.1.type", "cross-acceleration", "text"), candidate("debt.cross_default_edges.1.threshold_satisfied", "true", "boolean"), candidate("debt.cross_default_edges.1.cure_expired", "true", "boolean"),
      candidate("interim_financials.2027.free_cash_flow", "20", "number", "budget.xlsx", "2027-12-31"), candidate("interim_financials.2026.cash", "3", "number", "balance.xlsx", "2026-12-31"),
    ]);
    const truth = buildDebtTruthSet(facts, "2026-08-25", {
      rateShocks: [{id: "rate-up", policyVersion: "2026.08.25-v1", indexer: "CDI", baseRate: "0.12", shock: "0.03"}],
      initialDefaultInstrumentIds: ["CCB-001"],
    });
    expect(truth.procedureCoverage).toHaveLength(31);
    expect(truth.balanceBridge).toMatchObject({value: "13", status: "pass"});
    expect(truth.interestExpenseBridge).toMatchObject({accountingTotal: "1.3", reportedDifference: "0"});
    expect(truth.views).toMatchObject({grossFinancialDebt: "13", contingentExposures: "4", offBalanceSheetExposures: "4"});
    expect(truth.weightedAverageLifeYears).not.toBeNull();
    expect(truth.liquidityCoverage[0]).toMatchObject({period: "2027", sources: "23", debtService: "14.5", deficit: "0"});
    expect(truth.stressScenarios[0]).toMatchObject({id: "rate-up", instrumentId: "debt.instruments.1"});
    expect(truth.crossDefault).toMatchObject({defaulted: ["CCB-001", "DEB-002"], accelerated: ["DEB-002"]});
  });
});
