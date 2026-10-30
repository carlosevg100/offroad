import {describe, expect, it} from "vitest";
import {reviewOriginatorCredit} from "./originator-credit-review";
import {originatorCreditReviewFixture as base} from "./originator-credit-review.test-support";

describe("originator credit over source literals", () => {
  it("derives LTM and debt from the source records before producing the committee result", () => {
    const r = reviewOriginatorCredit(base());
    expect(r.gaps).toEqual([]); expect(r.status).toBe("prepared_for_committee_review");
    expect(r.financials).toMatchObject({ltm: {grossRevenue: "57600000", netRevenue: "55296000", ebitda: "4440000"}, assets: "23850000", utilizedBankDebt: "9400000"});
    expect(r.credit).toMatchObject({decisionAuthority: "committee", rating: {points: 3, grade: "B"}, capacity: {additionalFace: "2500000", resultingTotalFace: "3000000", headroomAboveCashFloor: "25000", severeDeficit: "475000"}});
    expect(r.numericReadings.length).toBeGreaterThan(80); expect(r.grantsCredit).toBe(false); expect(r.grantsPurchase).toBe(false);
  });
  it("does not compute a formal grade from a policy absent from the records", () => {
    const f = base(); f.policy = null;
    expect(reviewOriginatorCredit(f)).toMatchObject({status: "pending_evidence", credit: {rating: null, capacity: null}, gaps: [{operand: "credit", reason: "credit_policy_missing"}]});
  });
  it("requires the exact monetary scale and keeps the other decoded values visible", () => {
    const f = base(); f.contexts.find(c => c.id === "statements-currency")!.declaredScale = null;
    const r = reviewOriginatorCredit(f);
    expect(r.status).toBe("pending_evidence"); expect(r.credit).toBeNull();
    expect(r.gaps).toContainEqual({operand: "priorFullYear.grossRevenue", reason: "originator_numeric_scale_unconfirmed"});
    expect(r.numericReadings.some(n => n.operand === "scr.utilizedDebt" && n.value === "9400000")).toBe(true);
  });
  it("does not accept a new number the cited passage does not contain", () => {
    const f = base(); f.financials.currentComparable.ebitda.literal = "3240001";
    expect(reviewOriginatorCredit(f).gaps).toContainEqual({operand: "currentComparable.ebitda", reason: "numeric_literal_not_in_quote"});
  });
  it("does not borrow the scale of a different file", () => {
    const f = base(); f.financials.currentComparable.ebitda.contextId = "bank-lines-currency";
    expect(reviewOriginatorCredit(f).gaps).toContainEqual({operand: "currentComparable.ebitda", reason: "numeric_context_from_another_source"});
  });
  it("refuses a currency mismatch rather than converting it", () => {
    const f = base(); f.contexts.find(c => c.id === "statements-currency")!.currency = "USD";
    expect(reviewOriginatorCredit(f).gaps).toContainEqual({operand: "priorFullYear.grossRevenue", reason: "numeric_unit_or_currency_conflict"});
  });
  it("does not use the policy of another fund program", () => {
    const f = base(); f.policy!.fundProgramId = "other-program";
    expect(reviewOriginatorCredit(f).gaps).toContainEqual({operand: "policy", reason: "policy_fund_program_mismatch"});
  });
  it("does not turn a number quoted in a bank statement into a selected fund rule", () => {
    const f = base(); f.policy!.cashFloor = {...f.financials.balance.cash};
    expect(reviewOriginatorCredit(f).gaps).toContainEqual({operand: "policy", reason: "policy_number_from_another_source_version"});
  });
  it("does not join different companies or financial perimeters", () => {
    const f = base(); f.financials.currentComparable.entityId = "another-company";
    expect(reviewOriginatorCredit(f).gaps).toContainEqual({operand: "currentComparable", reason: "financial_source_scope_conflict"});
  });
  it("requires confirmed links between debtors and economic groups", () => {
    const f = base(); f.portfolio.groupMappingConfirmed = false;
    expect(reviewOriginatorCredit(f).gaps).toContainEqual({operand: "portfolio", reason: "economic_group_links_unconfirmed"});
  });
  it("does not reconcile a June SCR against a September debt position", () => {
    const f = base(); f.financials.scr.asOf = "2026-06-30";
    expect(reviewOriginatorCredit(f).gaps).toContainEqual({operand: "financials", reason: "scr_financial_period_mismatch"});
  });
  it("does not age a newer tape at an older reporting date", () => {
    const f = base(); f.portfolio.asOf = "2026-10-29";
    expect(reviewOriginatorCredit(f).gaps).toContainEqual({operand: "portfolio", reason: "portfolio_cutoff_mismatch"});
  });
  it("does not compare a balance and tape from different reporting cuts", () => {
    const f = base(); f.reportingDate = "2026-10-29";
    expect(reviewOriginatorCredit(f).gaps).toContainEqual({operand: "financials", reason: "balance_reporting_cutoff_mismatch"});
  });
  it("keeps the historical financial years and comparable growth in the dossier", () => {
    const r = reviewOriginatorCredit(base());
    expect(r.financials?.history.find(h => h.end === "2024-12-31")).toMatchObject({grossRevenue: "48000000", netRevenue: "46080000"});
    expect(r.financials?.history.find(h => h.end === "2025-12-31")?.priorComparableGrossGrowth).toBe("0.125");
  });
  it("refuses two different byte identities for one immutable version", () => {
    const f = base(); f.sources.push({...f.sources[0]!, id: "another-passage", sha256: "c".repeat(64)});
    expect(() => reviewOriginatorCredit(f)).toThrow("source_version_identity_conflict");
  });
  it("records the deficit and policy breach of a 130-day request without approving it", () => {
    const f = base(); f.request.requestedTermDays = 130; f.request.requestedAdditionalFace = "2500000";
    expect(reviewOriginatorCredit(f)).toMatchObject({status: "prepared_for_committee_review", credit: {status: "recommend_decline", capacity: {additionalFace: "0", requestedMaturityCashAfterStress: "625000", requestedFaceCashDeficit: "175000"}}});
  });
  it("reconciles the movement ledger against the unique tape and the balance", () => {
    expect(reviewOriginatorCredit(base()).reconciliation).toMatchObject({status: "reconciled", revenue: {monthlyGross: "43200000", salesAbcGross: "43200000"}, receivables: {recomposedClosing: "10000000"}, impairment: {recomposedClosing: "650000", olderWriteoffRecoveries: "100000"}});
  });
  it("withholds the rating and suggested limit when a documentary bridge differs", () => {
    const f = base(); f.reconciliation.receivables.closing = {...f.financials.balance.cash};
    const r = reviewOriginatorCredit(f); expect(r.status).toBe("pending_evidence");
    expect(r.credit).toMatchObject({status: "needs_evidence", rating: null, capacity: null});
    expect(r.gaps.some(g => g.reason === "receivables_movement_does_not_reconcile")).toBe(true);
  });
  it("does not reconcile a sales series from another perimeter", () => {
    const f = base(); f.reconciliation.perimeter = "consolidated";
    expect(reviewOriginatorCredit(f).gaps).toContainEqual({operand: "reconciliation", reason: "reconciliation_source_scope_conflict"});
  });
  it("does not treat invoice cancellation as an automatic EBITDA restatement", () => {
    expect(reviewOriginatorCredit(base()).reconciliation?.cancellationScenarioEbitda).toBeNull();
  });
});
