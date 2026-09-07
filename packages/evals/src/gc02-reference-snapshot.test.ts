import {describe, expect, it} from "vitest";

import {buildGc02ReferenceSnapshot} from "./gc02-reference-snapshot";

describe("GC02 signed reference snapshot", () => {
  it("keeps public identity, contractual debt and cash bases distinct", () => {
    const snapshot = buildGc02ReferenceSnapshot();
    expect(snapshot.economicIdentity.accountingGrossDebt).toBe(5_670_186);
    expect(snapshot.economicIdentity.contractualGrossPrincipal).toBe(5_742_510);
    expect(snapshot.economicIdentity.accountingCashAndEquivalents).toBe(1_430_714);
    expect(snapshot.economicIdentity.covenantDeductibleCash).toBe(1_455_809);
    expect(snapshot.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("does not turn unresolved alternatives or covenant definitions into an answer", () => {
    const snapshot = buildGc02ReferenceSnapshot();
    expect(snapshot.options.filter((option) => option.state === "blocked")).toHaveLength(4);
    expect(snapshot.coverageGaps.find((gap) => gap.topic === "Covenant prospectivo")?.materiality).toBe("blocking");
    expect(snapshot.currentEvidence.covenantState).not.toBe("covered");
  });

  it("uses the same signed projections that feed the reference products", () => {
    const snapshot = buildGc02ReferenceSnapshot();
    expect(snapshot.projections.rollover[0]?.period).toBe("2026/27");
    expect(snapshot.projections.rollover[0]?.closingCash).toBeCloseTo(956_560.81457019, 6);
    expect(snapshot.projections.rollover[0]?.liquidityCoverage).toBeCloseTo(1.45710956, 8);
    expect(snapshot.projections.noRollover[0]?.closingCash).toBeCloseTo(-277_915.18542981, 6);
    expect(snapshot.projections.noRollover[0]?.dscr).toBeCloseTo(0.19767025, 8);
  });
});
