import {describe, expect, it} from "vitest";

import type {ReceivablesAgingBucket} from "./contracts";
import {calculateReceivablesPoolEvidenceCoverage, calculateReceivablesPoolPerformance, type ReceivablesPoolEvidenceTitle, type ReceivablesPoolPerformanceTitle} from "./pool-performance";

const buckets = (values: Partial<Record<ReceivablesAgingBucket, string>>): Record<ReceivablesAgingBucket, string> => ({
  not_due: "0", past_due_1_15: "0", past_due_16_30: "0", past_due_31_60: "0", past_due_61_90: "0", past_due_91_180: "0", past_due_over_180: "0", ...values,
});
const title = (overrides: Partial<ReceivablesPoolPerformanceTitle> = {}): ReceivablesPoolPerformanceTitle => ({
  originalAmount: "100000", defaultedBalance: "0", recoveredInPeriod: "0", dilutionInPeriod: "0", repurchasedInPeriod: "0", substitutedInPeriod: "0", ...overrides,
});

describe("receivables pool performance kernel", () => {
  it("folds the seven aging buckets into five groups and derives delinquency over the outstanding balance", () => {
    const result = calculateReceivablesPoolPerformance({
      totalOutstanding: "1000000",
      agingBuckets: buckets({not_due: "700000", past_due_1_15: "60000", past_due_16_30: "40000", past_due_31_60: "80000", past_due_61_90: "50000", past_due_91_180: "40000", past_due_over_180: "30000"}),
      titles: [title()],
    });
    expect(result.basis).toBe("reported_title_aggregates");
    expect(result.aging).toEqual({current: "700000", days_1_30: "100000", days_31_60: "80000", days_61_90: "50000", days_91_plus: "70000"});
    expect(result.amounts).toMatchObject({overdue1Plus: "300000", overdue30Plus: "200000", overdue90Plus: "70000"});
    expect(result.ratios).toMatchObject({delinquency1Share: "0.3", delinquency30Share: "0.2", delinquency90Share: "0.07"});
    expect(result.trace).toMatchObject({id: "receivables.pool_performance", result: "0.2"});
  });

  it("derives default, loss, recovery, dilution, repurchase and substitution over the declared denominators", () => {
    const result = calculateReceivablesPoolPerformance({
      totalOutstanding: "6000000",
      agingBuckets: buckets({not_due: "6000000"}),
      titles: [
        ...Array.from({length: 54}, () => title()),
        ...Array.from({length: 6}, () => title({defaultedBalance: "100000", recoveredInPeriod: "10000", dilutionInPeriod: "5000", repurchasedInPeriod: "2500", substitutedInPeriod: "1000"})),
      ],
    });
    expect(result.amounts).toMatchObject({originated: "6000000", defaulted: "600000", recovered: "60000", netLoss: "540000", dilution: "30000", repurchase: "15000", substitution: "6000"});
    expect(result.ratios).toEqual({
      delinquency1Share: "0", delinquency30Share: "0", delinquency90Share: "0",
      grossDefaultRate: "0.1", netLossRate: "0.09", recoveryRate: "0.1", dilutionRate: "0.005", repurchaseRate: "0.0025", substitutionRate: "0.001",
    });
  });

  it("floors net loss at zero and returns zero ratios for zero denominators instead of failing", () => {
    const overRecovered = calculateReceivablesPoolPerformance({totalOutstanding: "0", agingBuckets: buckets({}), titles: [title({defaultedBalance: "100", recoveredInPeriod: "150"})]});
    expect(overRecovered.amounts.netLoss).toBe("0");
    expect(overRecovered.ratios).toMatchObject({netLossRate: "0", recoveryRate: "1.5", delinquency30Share: "0"});
    const empty = calculateReceivablesPoolPerformance({totalOutstanding: "0", agingBuckets: buckets({}), titles: []});
    expect(Object.values(empty.ratios).every((value) => value === "0")).toBe(true);
  });

  it("refuses negative aggregates", () => {
    expect(() => calculateReceivablesPoolPerformance({totalOutstanding: "1", agingBuckets: buckets({not_due: "-1"}), titles: []})).toThrow(RangeError);
    expect(() => calculateReceivablesPoolPerformance({totalOutstanding: "1", agingBuckets: buckets({}), titles: [title({dilutionInPeriod: "-1"})]})).toThrow(RangeError);
  });
});

describe("receivables pool evidence coverage kernel", () => {
  const evidence = (overrides: Partial<ReceivablesPoolEvidenceTitle> = {}): ReceivablesPoolEvidenceTitle => ({
    outstandingBalance: "100", evidenceVerified: true, anchorVerified: true, registration: "registered", assignable: true, encumbrance: "free", ...overrides,
  });

  it("measures each coverage share over the whole outstanding balance", () => {
    const result = calculateReceivablesPoolEvidenceCoverage({totalOutstanding: "400", titles: [
      evidence(), evidence({evidenceVerified: false}), evidence({anchorVerified: false, registration: "missing"}), evidence({assignable: false, encumbrance: "assigned", registration: "not_required"}),
    ]});
    expect(result.amounts).toEqual({totalOutstanding: "400", verifiedBalance: "300", anchoredBalance: "300", registrationCoveredBalance: "300", assignableBalance: "300", freeBalance: "300"});
    expect(result.shares).toEqual({verifiedBalanceShare: "0.75", anchoredBalanceShare: "0.75", registrationCoverageShare: "0.75", assignableBalanceShare: "0.75", freeBalanceShare: "0.75"});
    expect(result.trace).toMatchObject({id: "receivables.pool_evidence_coverage", result: "0.75"});
  });

  it("counts registration conflicts as uncovered and returns zero shares for an empty balance", () => {
    expect(calculateReceivablesPoolEvidenceCoverage({totalOutstanding: "100", titles: [evidence({registration: "conflict"})]}).shares.registrationCoverageShare).toBe("0");
    expect(calculateReceivablesPoolEvidenceCoverage({totalOutstanding: "0", titles: []}).shares).toEqual({verifiedBalanceShare: "0", anchoredBalanceShare: "0", registrationCoverageShare: "0", assignableBalanceShare: "0", freeBalanceShare: "0"});
    expect(() => calculateReceivablesPoolEvidenceCoverage({totalOutstanding: "1", titles: [evidence({outstandingBalance: "-1"})]})).toThrow(RangeError);
  });
});
