import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";
import {reconcileOriginatorStatements, type OriginatorReconciliationInput} from "./originator-reconciliation";
const raw = JSON.parse(readFileSync(new URL("../../../testing-fixtures/gold/fidc-originator/input/source-case.json", import.meta.url), "utf8"));
function fixture(): OriginatorReconciliationInput {
  const r = raw.receivables_bridge;
  return {periodStart: "2026-01-01", periodEnd: "2026-09-30", interimGrossRevenue: "43200000", monthlyGrossRevenue: raw.monthly_gross.map((amount: string, i: number) => ({month: `2026-${String(i + 1).padStart(2, "0")}`, amount})), salesByGroup: raw.sales_abc.map(([groupId, amount]: string[]) => ({groupId, amount})),
    receivables: {opening: r.opening, issued: r.issued, debtorCollections: r.debtor_collections, repurchases: r.repurchases, dilution: r.dilution, writeoffs: r.writeoffs, closing: r.closing},
    impairment: {opening: r.pdd_open, additions: r.pdd_additions, reversals: r.pdd_reversals, usedOnWriteoffs: r.pdd_used_on_writeoffs, closing: r.pdd_close, olderWriteoffRecoveries: r.older_writeoff_recoveries}, tapeClosing: "10000000", balanceGrossReceivables: "10000000", balanceImpairment: "650000", cancellationScenario: null};
}
describe("originator source reconciliations", () => {
  it("reconciles the monthly sales, ABC, gross receivables and impairment separately", () => {
    const r = reconcileOriginatorStatements(fixture()); expect(r.gaps).toEqual([]);
    expect(r.revenue).toMatchObject({monthlyGross: "43200000", salesAbcGross: "43200000", monthlyDifference: "0", abcDifference: "0"});
    expect(r.receivables.recomposedClosing).toBe("10000000"); expect(r.impairment.recomposedClosing).toBe("650000");
    expect(r.impairment.olderWriteoffRecoveries).toBe("100000"); expect(r.cancellationScenarioEbitda).toBeNull();
  });
  it("does not compare gross sales to net revenue", () => {const f = fixture(); f.interimGrossRevenue = "41472000"; expect(reconcileOriginatorStatements(f).gaps).toContain("monthly_revenue_against_interim_conflict");});
  it("rejects a duplicate monthly record even if its total happens to reconcile", () => {const f = fixture(); f.monthlyGrossRevenue = [...f.monthlyGrossRevenue, f.monthlyGrossRevenue[0]!]; expect(() => reconcileOriginatorStatements(f)).toThrow("month_identity_conflict");});
  it("reports a missing month and never annualizes the surviving months", () => {const f = fixture(); f.monthlyGrossRevenue = f.monthlyGrossRevenue.slice(1); expect(reconcileOriginatorStatements(f).gaps).toContain("monthly_revenue_window_incomplete");});
  it("does not count a repurchase as a debtor collection", () => {const f = fixture(); f.receivables.debtorCollections = "40400000"; expect(reconcileOriginatorStatements(f).receivables.difference).toBe("-1200000");});
  it("reconciles the unique tape rather than the duplicated export", () => {const f = fixture(); f.tapeClosing = "10500000"; expect(reconcileOriginatorStatements(f).receivables.tapeDifference).toBe("500000");});
  it("only computes the cancellation EBITDA sensitivity from an explicit scenario impact", () => {const f = fixture(); f.cancellationScenario = {reportedEbitdaLtm: "4440000", confirmedEbitdaImpact: "400000"}; expect(reconcileOriginatorStatements(f).cancellationScenarioEbitda).toBe("4040000");});
});
