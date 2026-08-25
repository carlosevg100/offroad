import {describe, expect, it} from "vitest";

import {buildDebtTruthSet} from "./debt-truth";
import {mergeInstrumentsByIdentity, reconcileFacts, renumberIndexedGroups, type FactCandidate} from "./facts";
import {buildFinancialTruthSet} from "./financial-truth";

const fact = (fieldPath: string, normalizedValue: string, valueType: FactCandidate["valueType"] = "text", sourceDocument = "room.xlsx", extras: Partial<FactCandidate> = {}): FactCandidate => ({
  fieldPath, normalizedValue, valueType, sourceDocument, evidenceRank: 3, informationClass: "reviewed",
  confidence: 0.98, anchorVerified: true, anchor: {document: sourceDocument, fieldPath}, ...extras,
});

const reconciled = (items: FactCandidate[]) => mergeInstrumentsByIdentity(renumberIndexedGroups(reconcileFacts(items)));

describe("M2 adversarial controls", () => {
  it("retains an audited versus ERP conflict instead of averaging it", () => {
    const facts = reconcileFacts([
      fact("historical_financials.2025.revenue", "100000000", "number", "audit.pdf", {evidenceRank: 1, informationClass: "audited", periodEnd: "2025-12-31"}),
      fact("historical_financials.2025.revenue", "112000000", "number", "erp.xlsx", {evidenceRank: 4, informationClass: "management", periodEnd: "2025-12-31"}),
    ]);
    const truth = buildFinancialTruthSet(facts);
    expect(truth.statements[0]?.lines[0]).toMatchObject({value: "100000000", disputed: true});
    expect(truth.status).toBe("blocked");
  });

  it("does not manufacture maintenance capex or CFADS from depreciation", () => {
    const facts = reconcileFacts([
      fact("historical_financials.2025.ebitda", "20000000", "number", "audit.pdf", {periodEnd: "2025-12-31"}),
      fact("historical_financials.2025.d_and_a", "5000000", "number", "audit.pdf", {periodEnd: "2025-12-31"}),
    ]);
    const truth = buildFinancialTruthSet(facts);
    expect(truth.statements[0]?.cfads).toBeNull();
    expect(truth.maintenanceCapexBridges[0]?.method).toBe("not_computable");
    expect(truth.missingInputs).toContain("historical_financials.2025.maintenance_capex");
  });
});

describe("M3 adversarial controls", () => {
  it("does not merge two facilities from the same bank when their contracts differ", () => {
    const facts = reconciled([
      fact("debt.instruments.1.contract_id", "CCB-001"), fact("debt.instruments.1.lender", "Banco A"), fact("debt.instruments.1.instrument_type", "CCB"), fact("debt.instruments.1.balance", "10", "number"),
      fact("debt.instruments.2.contract_id", "CCB-002"), fact("debt.instruments.2.lender", "Banco A"), fact("debt.instruments.2.instrument_type", "CCB"), fact("debt.instruments.2.balance", "20", "number"),
    ]);
    expect(new Set(facts.map((item) => item.key.fieldPath.match(/^debt\.instruments\.(\d+)\./)?.[1]).filter(Boolean)).size).toBe(2);
  });

  it("keeps recourse, repurchase and retained risk visible in a receivables transaction", () => {
    const facts = reconciled([
      fact("debt.instruments.1.lender", "FIDC Alpha"), fact("debt.instruments.1.instrument_type", "cessão de recebíveis"),
      fact("debt.instruments.1.principal", "30000000", "number"), fact("debt.instruments.1.currency", "BRL"),
      fact("debt.instruments.1.maturity", "2027-12-31", "date"), fact("debt.instruments.1.recourse", "coobrigação integral"),
      fact("debt.instruments.1.repurchase_obligation", "recompra de créditos inelegíveis"),
      fact("debt.instruments.1.retained_risk", "subordinação first loss de 15%"),
    ]);
    const truth = buildDebtTruthSet(facts, "2026-08-25");
    expect(truth.instruments[0]).toMatchObject({recourse: "coobrigação integral", repurchase: "recompra de créditos inelegíveis", retainedRisk: "subordinação first loss de 15%"});
  });

  it("separates currency and entity views and exposes cross-default", () => {
    const facts = reconciled([
      fact("debt.instruments.1.lender", "Banco Local"), fact("debt.instruments.1.instrument_type", "CCB"), fact("debt.instruments.1.principal", "100", "number"), fact("debt.instruments.1.currency", "BRL"), fact("debt.instruments.1.entity", "OpCo"), fact("debt.instruments.1.maturity", "2027-01-01", "date"),
      fact("debt.instruments.2.lender", "Offshore Fund"), fact("debt.instruments.2.instrument_type", "loan"), fact("debt.instruments.2.principal", "50", "number"), fact("debt.instruments.2.currency", "USD"), fact("debt.instruments.2.entity", "HoldCo"), fact("debt.instruments.2.maturity", "2029-01-01", "date"),
      fact("debt.covenants.1.metric", "cross-default", "text"), fact("debt.covenants.1.cross_default", "HoldCo default accelerates OpCo CCB", "text"),
    ]);
    const truth = buildDebtTruthSet(facts, "2026-08-25");
    expect(truth.byCurrency.map((item) => item.label)).toEqual(["BRL", "USD"]);
    expect(truth.byEntity.map((item) => item.label)).toEqual(["OpCo", "HoldCo"]);
    expect(truth.covenants[0]?.crossDefault).toContain("accelerates");
  });
});
