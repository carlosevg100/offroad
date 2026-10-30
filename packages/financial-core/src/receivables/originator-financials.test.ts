import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";
import {deriveOriginatorFinancials, type OriginatorFinancialInput} from "./originator-financials";

const source = JSON.parse(readFileSync(new URL("../../../testing-fixtures/gold/fidc-originator/input/source-case.json", import.meta.url), "utf8"));
function base(): OriginatorFinancialInput {
  const statement = (period: string, start: string, end: string) => {
    const s = source.annual.find((p: {period: string}) => p.period === period);
    return {entityId: "synthetic-cedent", perimeter: "standalone", currency: "BRL", scale: "1" as const, start, end, grossRevenue: s.gross, deductions: s.deductions, netRevenue: s.net, ebitda: s.ebitda};
  };
  const b = source.balance_september;
  return {priorFullYear: statement("2025", "2025-01-01", "2025-12-31"), priorComparable: statement("2025-01/09", "2025-01-01", "2025-09-30"), currentComparable: statement("2026-01/09", "2026-01-01", "2026-09-30"), historical: [statement("2024", "2024-01-01", "2024-12-31")],
    balance: {asOf: "2026-09-30", cash: b.cash, restrictedCash: b.restricted_cash, receivables: b.receivables, impairmentAllowance: b.pdd, inventory: b.inventory, otherCurrentAssets: b.other_current_assets, fixedAssets: b.fixed_assets, bankDebt: b.bank_debt, nonbankRecourse: b.nonbank_recourse, suppliers: b.suppliers, taxDebt: b.tax_debt, otherLiabilities: b.other_liabilities, equity: b.equity},
    bankLines: source.bank_lines.map((l: {id: string; used: string; limit: string}) => ({id: l.id, used: l.used, limit: l.limit})), scrUtilizedDebt: source.scr.current_used};
}
describe("originator financial recomposition", () => {
  it("derives the LTM from actual comparable periods and reconciles the balance and utilized bank debt", () => {
    expect(deriveOriginatorFinancials(base())).toMatchObject({status: "reconciled", gaps: [], ltm: {start: "2025-10-01", end: "2026-09-30", grossRevenue: "57600000", netRevenue: "55296000", ebitda: "4440000"}, assets: "23850000", liabilitiesAndEquity: "23850000", balanceDifference: "0", utilizedBankDebt: "9400000", unusedBankLimits: "1800000", utilizedAboveLimits: "0", bankLinesAgainstBalanceDifference: "0", bankLinesAgainstScrDifference: "0"});
  });
  it("does not accept incomparable interim endpoints", () => {
    const i = base(); i.priorComparable.end = "2025-06-30";
    expect(() => deriveOriginatorFinancials(i)).toThrow("originator_ltm_periods_not_comparable");
  });
  it("retains historical years, period margins and only comparable revenue growth", () => {
    const r = deriveOriginatorFinancials(base());
    expect(r.history).toHaveLength(4);
    expect(r.history.find(p => p.end === "2024-12-31")).toMatchObject({grossRevenue: "48000000", netRevenue: "46080000", priorComparableGrossGrowth: null});
    expect(r.history.find(p => p.end === "2025-12-31")).toMatchObject({grossRevenue: "54000000", priorComparableGrossGrowth: "0.125"});
    expect(r.history.find(p => p.end === "2025-09-30")?.priorComparableGrossGrowth).toBeNull();
  });
  it("refuses two different figures for the same historical period", () => {
    const i = base(); i.historical = [{...i.priorFullYear, ebitda: "4200001"}]; expect(() => deriveOriginatorFinancials(i)).toThrow("historical_period_conflict");
  });
  it("does not label a future projection as historical financials", () => {
    const i = base(); i.historical = [{...i.priorFullYear, start: "2027-01-01", end: "2027-12-31"}]; expect(() => deriveOriginatorFinancials(i)).toThrow("future_financial_period");
  });
  it("does not annualize an incomplete year", () => {
    const i = base(); i.priorFullYear.start = "2025-02-01";
    expect(() => deriveOriginatorFinancials(i)).toThrow("originator_ltm_periods_not_comparable");
  });
  it("does not bridge different companies, currencies or perimeters", () => {
    for (const [key, value] of [["entityId", "other-company"], ["currency", "USD"], ["perimeter", "consolidated"]] as const) {
      const i = base(); i.currentComparable[key] = value;
      expect(() => deriveOriginatorFinancials(i)).toThrow("originator_financial_scope_conflict");
    }
  });
  it("keeps a reported gross-to-net mismatch open instead of replacing the reported net figure", () => {
    const i = base(); i.currentComparable.netRevenue = "41472001";
    expect(deriveOriginatorFinancials(i)).toMatchObject({status: "needs_reconciliation", gaps: ["gross_net_bridge:2026-01-01/2026-09-30"], ltm: {netRevenue: "55296001"}});
  });
  it("shows an unreconciled balance", () => {
    const i = base(); i.balance.equity = "6350001";
    expect(deriveOriginatorFinancials(i)).toMatchObject({status: "needs_reconciliation", gaps: ["balance_does_not_reconcile"], balanceDifference: "-1"});
  });
  it("names a SCR disagreement without discarding either figure", () => {
    const i = base(); i.scrUtilizedDebt = "7800000";
    expect(deriveOriginatorFinancials(i)).toMatchObject({status: "needs_reconciliation", gaps: ["bank_lines_scr_conflict"], utilizedBankDebt: "9400000", bankLinesAgainstScrDifference: "1600000"});
  });
  it("does not treat absence of SCR as zero debt", () => {
    const i = base(); i.scrUtilizedDebt = null;
    expect(deriveOriginatorFinancials(i)).toMatchObject({status: "needs_reconciliation", gaps: ["scr_utilized_debt_missing"], bankLinesAgainstScrDifference: null});
  });
  it("does not offset an overdrawn line against unused limits on another line", () => {
    const i = base(); i.bankLines = [{id: "overdrawn", used: "100", limit: "50"}, {id: "unused", used: "0", limit: "100"}];
    expect(deriveOriginatorFinancials(i)).toMatchObject({utilizedBankDebt: "100", unusedBankLimits: "100", utilizedAboveLimits: "50"});
  });
  it("rejects the same bank line twice", () => {
    const i = base(); i.bankLines = [i.bankLines[0]!, i.bankLines[0]!];
    expect(() => deriveOriginatorFinancials(i)).toThrow("originator_bank_line_identity_conflict");
  });
  it("refuses impossible calendar dates and a balance from another period", () => {
    const i = base(); i.currentComparable.end = "2026-02-30";
    expect(() => deriveOriginatorFinancials(i)).toThrow("originator_invalid_date");
    const j = base(); j.balance.asOf = "2026-06-30";
    expect(() => deriveOriginatorFinancials(j)).toThrow("originator_balance_period_conflict");
  });
});
