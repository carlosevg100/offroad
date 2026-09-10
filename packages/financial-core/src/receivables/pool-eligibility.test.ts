import {describe, expect, it} from "vitest";

import type {IsoDate} from "./contracts";
import {classifyReceivablesPoolTitle, receivablesPoolEligibilityReasons, type ReceivablesPoolEligibilityPolicy, type ReceivablesPoolEligibilityTitle} from "./pool-eligibility";

const referenceDate: IsoDate = "2026-08-24";
const policy: ReceivablesPoolEligibilityPolicy = {
  maxDaysPastDue: 90, maxRemainingTermDays: 365, minSeasoningDays: 30,
  requireAssignable: true, requireEvidenceVerified: true, registrationRule: "required_when_applicable",
  excludeDisputed: true, excludeRelatedParties: true, excludeEncumbered: true, allowedDebtorSectors: [],
};
const clean: ReceivablesPoolEligibilityTitle = {
  outstandingBalance: "100000.00", defaultedBalance: "0", originDate: "2026-04-26", dueDate: "2026-09-23",
  assignable: true, evidenceVerified: true, anchorVerified: true, registration: "registered", encumbrance: "free",
  disputed: false, relatedParty: false, debtorSector: "services",
};

describe("receivables pool eligibility kernel", () => {
  it("classifies a clean title with whole-day counts and an empty reason list", () => {
    const result = classifyReceivablesPoolTitle(clean, policy, referenceDate);
    expect(result).toMatchObject({eligible: true, reasons: [], daysPastDue: 0, seasoningDays: 120, remainingTermDays: 30});
    expect(result.trace.id).toBe("receivables.pool_eligibility");
    expect(result.trace.operands).toMatchObject({referenceDate, seasoningDays: "120", remainingTermDays: "30", daysPastDue: "0"});
    expect(result.trace.result).toBe("eligible");
  });

  it("keeps every reason a title fails, in the recorded order", () => {
    const result = classifyReceivablesPoolTitle({
      ...clean, outstandingBalance: "0", defaultedBalance: "0", dueDate: "2026-04-30", assignable: false, evidenceVerified: false,
      anchorVerified: false, registration: "conflict", encumbrance: "pledged", disputed: true, relatedParty: true, debtorSector: "energy",
    }, {...policy, allowedDebtorSectors: ["services"]}, referenceDate);
    expect(result.eligible).toBe(false);
    expect(result.reasons).toEqual([
      "zero_balance", "past_due", "not_assignable", "evidence_unverified", "anchor_unverified",
      "registration_conflict", "encumbered", "disputed", "related_party", "sector_outside_policy",
    ]);
    expect(result.daysPastDue).toBe(116);
    expect(result.remainingTermDays).toBe(0);
    expect(result.trace.result).toBe(result.reasons.join(","));
    for (const reason of result.reasons) expect(receivablesPoolEligibilityReasons).toContain(reason);
  });

  it("treats the policy limits as inclusive boundaries", () => {
    const atLimit = classifyReceivablesPoolTitle({...clean, dueDate: "2026-05-26", originDate: "2026-07-25"}, policy, referenceDate);
    expect(atLimit).toMatchObject({daysPastDue: 90, seasoningDays: 30, reasons: []});
    const overLimit = classifyReceivablesPoolTitle({...clean, dueDate: "2026-05-25", originDate: "2026-07-26"}, policy, referenceDate);
    expect(overLimit).toMatchObject({daysPastDue: 91, seasoningDays: 29, reasons: ["past_due", "seasoning"]});
    const longTenor = classifyReceivablesPoolTitle({...clean, dueDate: "2027-08-24"}, policy, referenceDate);
    expect(longTenor).toMatchObject({remainingTermDays: 365, reasons: []});
    expect(classifyReceivablesPoolTitle({...clean, dueDate: "2027-08-25"}, policy, referenceDate).reasons).toEqual(["remaining_term"]);
  });

  it("applies registration and defaulted-balance tests exactly as declared", () => {
    expect(classifyReceivablesPoolTitle({...clean, registration: "missing"}, policy, referenceDate).reasons).toEqual(["registration_missing"]);
    expect(classifyReceivablesPoolTitle({...clean, registration: "missing"}, {...policy, registrationRule: "not_required"}, referenceDate).reasons).toEqual([]);
    expect(classifyReceivablesPoolTitle({...clean, defaultedBalance: "0.01"}, policy, referenceDate).reasons).toEqual(["defaulted"]);
    expect(classifyReceivablesPoolTitle({...clean, encumbrance: "unknown"}, {...policy, excludeEncumbered: false}, referenceDate).reasons).toEqual([]);
  });

  it("refuses impossible policies and dates instead of guessing", () => {
    expect(() => classifyReceivablesPoolTitle(clean, {...policy, maxDaysPastDue: -1}, referenceDate)).toThrow(RangeError);
    expect(() => classifyReceivablesPoolTitle(clean, {...policy, maxRemainingTermDays: 0}, referenceDate)).toThrow(RangeError);
    expect(() => classifyReceivablesPoolTitle({...clean, dueDate: "2026-02-30" as IsoDate}, policy, referenceDate)).toThrow(RangeError);
  });
});
