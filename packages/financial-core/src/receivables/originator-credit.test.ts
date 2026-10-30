import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";
import {analyzeOriginatorCredit, type OriginatorCreditInput} from "./originator-credit";

const fixture = JSON.parse(readFileSync(new URL("../../../testing-fixtures/gold/fidc-originator/input/credit.json", import.meta.url), "utf8")) as {synthetic: true; input: OriginatorCreditInput};
const oracle = JSON.parse(readFileSync(new URL("../../../testing-fixtures/gold/fidc-originator/expected/oracle.json", import.meta.url), "utf8")) as {accepted_titles: Array<{title: string; face: string}>; exclusive_exclusions: Array<{title: string; face: string; reason: string}>};
const base = (): OriginatorCreditInput => structuredClone(fixture.input);

describe("originator credit kernel with a supplied, explicitly synthetic policy", () => {
  it("reconciles debt, original/current arrears, the duplicate and economic-group concentration", () => {
    const r = analyzeOriginatorCredit(base());
    expect(r.metrics).toMatchObject({rawRows: 19, uniqueTitles: 18, duplicateRows: 1, rawFace: "10500000", uniqueFace: "10000000", duplicateFace: "500000", originalPastDueFace: "700000", currentPastDueFace: "400000", originalPastDueRatio: "0.07", largestGroupFace: "3000000", topFiveGroupsFace: "7500000", largestGroupRatio: "0.3", hhi: "0.1592", adjustedDebt: "11000000", freeCash: "1000000", netDebt: "10000000", unusedBankLimits: "1800000", netDebtToEbitda: "2.252252252252252252252252252252252252252"});
    expect(r.rating).toEqual({points: 3, grade: "B", totalFaceCap: "3000000"});
  });
  it("matches every eligible title and every exclusive exclusion against the independent authoring oracle", () => {
    const r = analyzeOriginatorCredit(base());
    expect(r.eligibility).toMatchObject({preliminaryFace: "5400000", eligibleFace: "4800000"});
    const order = (a: {title: string}, b: {title: string}) => a.title.localeCompare(b.title);
    expect(r.eligibility!.accepted.map(x => ({title: x.reference, face: x.face})).sort(order)).toEqual([...oracle.accepted_titles].sort(order));
    const reasons: Record<string, string> = {cessao_anterior: "prior_assignment", relacionada: "related_party", nota_cancelada: "invoice_cancelled", atraso_original: "original_arrears", entrega_ausente: "delivery_unverified", concentracao: "concentration"};
    expect(r.eligibility!.excluded.map(x => ({title: x.reference, face: x.face, reason: x.reason})).sort(order)).toEqual(oracle.exclusive_exclusions.map(x => ({...x, reason: reasons[x.reason]})).sort(order));
  });
  it("separates total exposure, already utilized exposure and the available increment", () => {
    const r = analyzeOriginatorCredit(base());
    expect(r.status).toBe("recommend_conditional"); expect(r.decisionAuthority).toBe("committee");
    expect(r.capacity).toMatchObject({ratingHeadroom: "2500000", regulationHeadroom: "4500000", collateralHeadroom: "4800000", additionalFace: "2500000", resultingTotalFace: "3000000", minimumCashBeforeNewStress: "1200000", stressedMinimumCash: "825000", headroomAboveCashFloor: "25000", severeMinimumCash: "325000", severeDeficit: "475000", requestedFaceCashDeficit: "50000", maturityCashAfterStress: "1025000"});
    expect(r.traces.every(t => t.id && t.formula && Object.keys(t.operands).length && t.result)).toBe(true);
  });
  it("does not add unused bank limits to debt", () => {
    const i = base(); i.financials.unusedBankLimits = "999999999";
    expect(analyzeOriginatorCredit(i).metrics.adjustedDebt).toBe("11000000");
  });
  it("tests the current contractual term while preserving original arrears", () => {
    const i = base(); const t = i.titles.find(t => t.reference === "F02")!; t.currentDueDate = "2027-10-29";
    const r = analyzeOriginatorCredit(i);
    expect(r.eligibility!.excluded).toContainEqual({reference: t.reference, debtorId: t.debtorId, issueDate: t.issueDate, reason: "term_exceeded", face: t.face});
    expect(r.metrics.originalPastDueFace).toBe("700000");
  });
  it("does not turn an empty pool into zero delinquency and a formal grade", () => {
    const i = base(); i.titles = [];
    expect(analyzeOriginatorCredit(i)).toMatchObject({status: "needs_evidence", rating: null, capacity: null, gaps: ["nonzero_portfolio_missing"]});
  });
  it("gives no grade or formal limit without an actual policy", () => {
    const i = base(); i.policy = null; const r = analyzeOriginatorCredit(i);
    expect(r.status).toBe("not_evaluated"); expect(r.rating).toBeNull(); expect(r.capacity).toBeNull(); expect(r.gaps).toContain("credit_policy_missing");
  });
  it("requires the confirmed additional-exposure collateral scope", () => {
    const i = base(); i.poolSupportsAdditionalExposure = false;
    expect(analyzeOriginatorCredit(i)).toMatchObject({status: "needs_evidence", rating: null, capacity: null, gaps: ["additional_collateral_scope_unconfirmed"]});
  });
  it("refuses to issue a current grade or limit from the old SCR", () => {
    const i = base(); i.financials.scrDate = "2026-06-30";
    expect(analyzeOriginatorCredit(i)).toMatchObject({status: "needs_evidence", rating: null, capacity: null, gaps: ["scr_stale"]});
  });
  it("applies the documented SCR veto while preserving the reason", () => {
    const i = base(); i.financials.scrPastDue = "1"; const r = analyzeOriginatorCredit(i);
    expect(r.status).toBe("recommend_decline"); expect(r.vetoes).toEqual(["scr_past_due_policy_veto"]); expect(r.capacity!.additionalFace).toBe("0");
  });
  it("does not turn a veto off through a missing cash schedule", () => {
    const i = base(); i.financials.scrLossClassified = "1"; i.cashBeforeNewCoobligation = [];
    expect(analyzeOriginatorCredit(i)).toMatchObject({status: "recommend_decline", vetoes: ["scr_loss_policy_veto"], capacity: null});
  });
  it("shows the cash deficit of extending the same requested increment to 130 days", () => {
    const i = base(); i.requestedTermDays = 130; i.requestedAdditionalFace = "2500000"; const r = analyzeOriginatorCredit(i);
    expect(r.status).toBe("recommend_decline"); expect(r.vetoes).toContain("requested_term_exceeds_policy");
    expect(r.capacity).toMatchObject({additionalFace: "0", requestedMaturityCashAfterStress: "625000", requestedFaceCashDeficit: "175000"});
  });
  it("reduces the increment when the declared cash has fallen", () => {
    const i = base(); i.cashBeforeNewCoobligation = i.cashBeforeNewCoobligation.map(s => ({date: s.date, amount: String(Number(s.amount) - 100000)}));
    expect(analyzeOriginatorCredit(i).capacity).toMatchObject({additionalFace: "2000000", stressedMinimumCash: "800000", headroomAboveCashFloor: "0"});
  });
  it("has no additional capacity when the total grade limit is already utilized", () => {
    const i = base(); i.currentFundFaceExposure = "3000000";
    expect(analyzeOriginatorCredit(i)).toMatchObject({status: "no_additional_capacity", capacity: {additionalFace: "0", resultingTotalFace: "3000000"}});
  });
  it("does not extrapolate a cash maturity that is not in the supplied schedule", () => {
    const i = base(); i.requestedTermDays = 118;
    expect(analyzeOriginatorCredit(i)).toMatchObject({status: "needs_evidence", capacity: null, gaps: ["cash_horizon_incomplete"]});
  });
  it("retains the original due-date arrears after extension", () => {
    const i = base(); const t = i.titles.find(t => t.reference === "F01")!;
    expect(t.currentDueDate > i.reportingDate).toBe(true);
    expect(analyzeOriginatorCredit(i).eligibility!.excluded).toContainEqual(expect.objectContaining({reference: "F01", reason: "original_arrears", face: "300000"}));
  });
  it("fails closed on economically conflicting duplicate rows", () => {
    const i = base(); i.titles.at(-1)!.face = "500001";
    expect(() => analyzeOriginatorCredit(i)).toThrow("originator_duplicate_conflict");
  });
  it("recognizes equivalent decimal representations on an exact duplicate", () => {
    const i = base(); i.titles.at(-1)!.face = "500000.00";
    expect(analyzeOriginatorCredit(i).metrics.uniqueFace).toBe("10000000");
  });
  it("returns the same result when raw rows arrive in another order", () => {
    const i = base(); const j = base(); j.titles = [...j.titles].reverse();
    expect(analyzeOriginatorCredit(j)).toEqual(analyzeOriginatorCredit(i));
  });
  it("does not depend on calibrated names or references", () => {
    const i = base(); i.titles = i.titles.map(t => ({...t, reference: "renamed-" + t.reference, groupId: "renamed-" + t.groupId, debtorId: "renamed-" + t.debtorId}));
    const r = analyzeOriginatorCredit(i), expected = analyzeOriginatorCredit(base());
    expect(r.metrics).toEqual(expected.metrics); expect(r.capacity).toEqual(expected.capacity); expect(r.rating).toEqual(expected.rating);
  });
  it.each(["-1", "NaN", "Infinity"])("refuses invalid utilized bank debt %s", bankUsed => {
    const i = base(); i.financials.bankUsed = bankUsed; expect(() => analyzeOriginatorCredit(i)).toThrow();
  });
  it("does not score an expired policy", () => {
    const i = base(); i.policy!.effectiveUntil = "2026-10-28";
    expect(analyzeOriginatorCredit(i)).toMatchObject({status: "needs_evidence", rating: null, capacity: null, gaps: ["credit_policy_outside_validity"]});
  });
  it("does not give a finite leverage grade for nonpositive EBITDA", () => {
    const i = base(); i.financials.ebitdaLtm = "0";
    expect(analyzeOriginatorCredit(i)).toMatchObject({status: "needs_evidence", rating: null, capacity: null, gaps: ["positive_ltm_ebitda_missing"]});
  });
  it("keeps unknown assignment evidence outside the eligible collateral", () => {
    const i = base(); i.titles.find(t => t.reference === "F02")!.assignment = "unknown";
    expect(analyzeOriginatorCredit(i).eligibility!.excluded).toContainEqual(expect.objectContaining({reference: "F02", reason: "unknown_evidence", face: "400000"}));
  });
  it("does not give a current credit result when the tape contains issuance after its cutoff", () => {
    const i = base(); i.titles.find(t => t.reference === "F02")!.issueDate = "2026-10-01";
    expect(analyzeOriginatorCredit(i)).toMatchObject({status: "needs_evidence", rating: null, capacity: null, gaps: ["source_universe_outside_cutoff"]});
  });
  it("requires a complete explicit exclusion order", () => {
    const i = base(); i.policy!.exclusionPriority = ["prior_assignment"];
    expect(() => analyzeOriginatorCredit(i)).toThrow("originator_exclusion_order_incomplete");
  });
  it("does not mutate the supplied facts or policy", () => {
    const i = base(), before = JSON.stringify(i); analyzeOriginatorCredit(i); expect(JSON.stringify(i)).toBe(before);
  });
  it("uses the explicit operation date rather than moving the stress when the analysis date changes", () => {
    const i = base(); i.analysisDate = "2026-10-30";
    expect(analyzeOriginatorCredit(i)).toMatchObject({analysisDate: "2026-10-30", operationStartDate: "2026-10-29", capacity: {additionalFace: "2500000", maturityCashAfterStress: "1025000"}});
  });
  it("refuses an absent operation date instead of making a house assumption", () => {
    const i = base(); i.operationStartDate = "";
    expect(() => analyzeOriginatorCredit(i)).toThrow("originator_invalid_date");
  });
});
