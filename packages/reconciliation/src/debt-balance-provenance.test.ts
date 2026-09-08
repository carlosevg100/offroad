import {describe, expect, it} from "vitest";
import {buildDebtTruthSet, debtTruthSetSchema} from "./debt-truth";
import {reconcileFacts, type FactCandidate} from "./facts";

const fact = (fieldPath: string, normalizedValue: string, valueType: FactCandidate["valueType"] = "number"): FactCandidate => ({fieldPath, normalizedValue, valueType, sourceDocument: "synthetic-ledger.xlsx", evidenceRank: 1, informationClass: "audited", confidence: 1, anchorVerified: true});
const instrument = (name: string, value: string, type: FactCandidate["valueType"] = "number") => fact(`debt.instruments.1.${name}`, value, type);
const base = [instrument("lender", "Synthetic bank", "text"), instrument("instrument_type", "CCB", "text"), instrument("currency", "BRL", "text"), instrument("maturity", "2027-01-01", "date")];
const build = (...facts: FactCandidate[]) => buildDebtTruthSet(reconcileFacts([...base, ...facts]), "2026-09-08");

describe("reported balance provenance", () => {
  it("counts a reported balance once without inventing principal or dropping source components", () => {
    const truth = build(instrument("balance", "100"), instrument("accrued_interest", "10"), instrument("pik", "2"), instrument("indexation_balance", "3"));
    expect(truth.instruments[0]).toMatchObject({principal: null, principalBasis: "reported_balance_only", balance: "100", accruedInterest: "10", pik: "2", indexation: "3"});
    expect(truth.views.grossFinancialDebt).toBe("100");
    expect(truth.byLender).toEqual([{label: "Synthetic bank", value: "100"}]);
    expect(truth.byCurrency).toEqual([{label: "BRL", value: "100"}]);
    expect(Object.values(truth.maturity)).toContain("100");
    expect(truth.missingInputs).toContain("debt.instruments.1.principal");
    expect(truth.exceptions.some((exception) => exception.id === "missing_principal:debt.instruments.1")).toBe(false);
  });
  it("retains explicit principal arithmetic and reconciles a reported balance", () => {
    const truth = build(instrument("principal", "90"), instrument("balance", "100"), instrument("accrued_interest", "10"));
    expect(truth.instruments[0]).toMatchObject({principal: "90", principalBasis: "reported_principal", balance: "100"});
    expect(truth.reconciliations).toContainEqual(expect.objectContaining({id: "instrument_balance:debt.instruments.1", status: "pass", difference: "0"}));
    const mismatch = build(instrument("principal", "100"), instrument("balance", "100"), instrument("accrued_interest", "10"));
    expect(mismatch.reconciliations[0]).toMatchObject({status: "fail", expected: "100", observed: "110"});
    expect(mismatch.exceptions).toContainEqual(expect.objectContaining({id: "reconciliation:instrument_balance:debt.instruments.1", blocksExternalOutputs: true}));
  });
  it("distinguishes no balance evidence from a reported zero", () => {
    expect(build().instruments[0]).toMatchObject({principal: null, principalBasis: "missing"});
    expect(build().exceptions).toContainEqual(expect.objectContaining({id: "missing_principal:debt.instruments.1", blocksExternalOutputs: true}));
    const knownBalance = build(instrument("balance", "100"), fact("historical_financials.2025.cash", "0"));
    expect(knownBalance.status).toBe("partial");
    expect(knownBalance.missingInputs).toContain("debt.instruments.1.principal");
    expect(build(instrument("principal", "0")).instruments[0]).toMatchObject({principal: "0", principalBasis: "reported_principal", balance: "0"});
  });
  it("does not claim liquidity when opening cash is absent, but accepts evidenced zero", () => {
    const inputs = [instrument("principal", "100"), fact("debt.payments.1.date", "2027-01-01", "date"), fact("debt.payments.1.principal", "10"), fact("projections.2027.free_cash_flow", "20")];
    const missing = build(...inputs);
    expect(missing.views.cashBasis).toBe("missing");
    expect(missing.missingInputs).toContain("debt.unrestricted_cash");
    expect(missing.liquidityCoverage).toEqual([]);
    expect(missing.exceptions).toContainEqual(expect.objectContaining({id: "missing:unrestricted_cash", blocksExternalOutputs: true}));
    const zero = build(...inputs, fact("historical_financials.2025.cash", "0"));
    expect(zero.views.cashBasis).toBe("reported");
    expect(zero.missingInputs).not.toContain("debt.unrestricted_cash");
    expect(zero.liquidityCoverage).toHaveLength(1);
  });
  it("requires a fully reported instrument ledger before exposing debt totals", () => {
    const cashOnly = buildDebtTruthSet(reconcileFacts([fact("historical_financials.2025.cash", "100")]), "2026-09-08");
    expect(cashOnly.views).toMatchObject({cashBasis: "reported", balanceBasis: "missing"});
    const zero = build(instrument("principal", "0"), fact("historical_financials.2025.cash", "100"));
    expect(zero.views.balanceBasis).toBe("reported_instruments");
    expect(zero.views.grossFinancialDebt).toBe("0");
    const partial = build(instrument("principal", "100"), fact("debt.instruments.2.lender", "Synthetic second bank", "text"));
    expect(partial.views.balanceBasis).toBe("missing");
    expect(build(instrument("balance", "100")).views.balanceBasis).toBe("reported_instruments");
  });

  it("still parses historical numeric principal snapshots without asserting their provenance", () => {
    const current = build(instrument("principal", "100"));
    const {cashBasis: _cash, balanceBasis: _balance, ...views} = current.views;
    const instruments = current.instruments.map(({principalBasis: _basis, ...row}) => row);
    const legacy = debtTruthSetSchema.parse({...current, version: "2026.08.25-v2", views, instruments});
    expect(legacy.views.cashBasis).toBeUndefined();
    expect(legacy.views.balanceBasis).toBeUndefined();
    expect(legacy.instruments[0]?.principalBasis).toBeUndefined();
    expect(legacy.instruments[0]?.principal).toBe("100");
  });
});
