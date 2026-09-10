import Decimal from "decimal.js";

import type {ReceivablesAgingBucket} from "./contracts";
import {full, receivablesPoolKernelsVersion, requireNonNegative, safeRatio, sum, ZERO, type ReceivablesPoolKernelTrace} from "./pool-shared";

export type ReceivablesPoolPerformanceTitle = {
  originalAmount: string;
  defaultedBalance: string;
  recoveredInPeriod: string;
  dilutionInPeriod: string;
  repurchasedInPeriod: string;
  substitutedInPeriod: string;
};

/** The five past-due groupings the pool result publishes, folded from the seven canonical aging buckets. */
export type ReceivablesPoolAgingGroup = "current" | "days_1_30" | "days_31_60" | "days_61_90" | "days_91_plus";

export type ReceivablesPoolPerformance = {
  version: typeof receivablesPoolKernelsVersion;
  /** Ratios derived from the aggregates each title reports; they are not measured longitudinal history. */
  basis: "reported_title_aggregates";
  aging: Record<ReceivablesPoolAgingGroup, string>;
  amounts: {
    totalOutstanding: string;
    overdue1Plus: string;
    overdue30Plus: string;
    overdue90Plus: string;
    originated: string;
    defaulted: string;
    recovered: string;
    netLoss: string;
    dilution: string;
    repurchase: string;
    substitution: string;
  };
  ratios: {
    delinquency1Share: string;
    delinquency30Share: string;
    delinquency90Share: string;
    grossDefaultRate: string;
    netLossRate: string;
    recoveryRate: string;
    dilutionRate: string;
    repurchaseRate: string;
    substitutionRate: string;
  };
  trace: ReceivablesPoolKernelTrace;
};

/**
 * Folds the canonical aging buckets into the published groups and derives the reported-aggregate
 * performance ratios: delinquency over the outstanding balance, default, loss, dilution,
 * repurchase and substitution over the originated amount, recovery over the defaulted balance.
 * A zero denominator yields a zero ratio; the caller states when that means "not evaluable".
 */
export function calculateReceivablesPoolPerformance(input: {
  totalOutstanding: string;
  agingBuckets: Record<ReceivablesAgingBucket, string>;
  titles: readonly ReceivablesPoolPerformanceTitle[];
}): ReceivablesPoolPerformance {
  const total = requireNonNegative("totalOutstanding", input.totalOutstanding);
  const bucket = (name: ReceivablesAgingBucket) => requireNonNegative(`aging bucket ${name}`, input.agingBuckets[name]);
  const aging = {
    current: bucket("not_due"),
    days_1_30: bucket("past_due_1_15").plus(bucket("past_due_16_30")),
    days_31_60: bucket("past_due_31_60"),
    days_61_90: bucket("past_due_61_90"),
    days_91_plus: bucket("past_due_91_180").plus(bucket("past_due_over_180")),
  };
  const overdue1 = aging.days_1_30.plus(aging.days_31_60).plus(aging.days_61_90).plus(aging.days_91_plus);
  const overdue30 = aging.days_31_60.plus(aging.days_61_90).plus(aging.days_91_plus);
  const overdue90 = aging.days_91_plus;
  for (const title of input.titles) {
    for (const field of ["originalAmount", "defaultedBalance", "recoveredInPeriod", "dilutionInPeriod", "repurchasedInPeriod", "substitutedInPeriod"] as const) {
      requireNonNegative(field, title[field]);
    }
  }
  const defaulted = sum(input.titles.map((title) => title.defaultedBalance));
  const recovered = sum(input.titles.map((title) => title.recoveredInPeriod));
  const dilution = sum(input.titles.map((title) => title.dilutionInPeriod));
  const repurchase = sum(input.titles.map((title) => title.repurchasedInPeriod));
  const substitution = sum(input.titles.map((title) => title.substitutedInPeriod));
  const originated = sum(input.titles.map((title) => title.originalAmount));
  const netLoss = Decimal.max(defaulted.minus(recovered), ZERO);
  const ratios = {
    delinquency1Share: safeRatio(overdue1, total),
    delinquency30Share: safeRatio(overdue30, total),
    delinquency90Share: safeRatio(overdue90, total),
    grossDefaultRate: safeRatio(defaulted, originated),
    netLossRate: safeRatio(netLoss, originated),
    recoveryRate: safeRatio(recovered, defaulted),
    dilutionRate: safeRatio(dilution, originated),
    repurchaseRate: safeRatio(repurchase, originated),
    substitutionRate: safeRatio(substitution, originated),
  };
  return {
    version: receivablesPoolKernelsVersion,
    basis: "reported_title_aggregates",
    aging: {
      current: full(aging.current),
      days_1_30: full(aging.days_1_30),
      days_31_60: full(aging.days_31_60),
      days_61_90: full(aging.days_61_90),
      days_91_plus: full(aging.days_91_plus),
    },
    amounts: {
      totalOutstanding: full(total),
      overdue1Plus: full(overdue1),
      overdue30Plus: full(overdue30),
      overdue90Plus: full(overdue90),
      originated: full(originated),
      defaulted: full(defaulted),
      recovered: full(recovered),
      netLoss: full(netLoss),
      dilution: full(dilution),
      repurchase: full(repurchase),
      substitution: full(substitution),
    },
    ratios: Object.fromEntries(Object.entries(ratios).map(([key, value]) => [key, full(value)])) as ReceivablesPoolPerformance["ratios"],
    trace: {
      id: "receivables.pool_performance",
      formula: "delinquencyN = overdue over N days / totalOutstanding; grossDefault = defaulted / originated; netLoss = max(defaulted - recovered, 0) / originated; recovery = recovered / defaulted; dilution, repurchase and substitution over originated; zero denominator gives zero",
      operands: {
        totalOutstanding: full(total),
        originated: full(originated),
        defaulted: full(defaulted),
        recovered: full(recovered),
        overdue1Plus: full(overdue1),
        overdue30Plus: full(overdue30),
        overdue90Plus: full(overdue90),
        titles: String(input.titles.length),
      },
      result: full(ratios.delinquency30Share),
    },
  };
}

export type ReceivablesPoolEvidenceTitle = {
  outstandingBalance: string;
  evidenceVerified: boolean;
  anchorVerified: boolean;
  registration: "registered" | "not_required" | "missing" | "conflict";
  assignable: boolean;
  encumbrance: "free" | "pledged" | "assigned" | "unknown";
};

export type ReceivablesPoolEvidenceCoverage = {
  version: typeof receivablesPoolKernelsVersion;
  amounts: {
    totalOutstanding: string;
    verifiedBalance: string;
    anchoredBalance: string;
    registrationCoveredBalance: string;
    assignableBalance: string;
    freeBalance: string;
  };
  shares: {
    verifiedBalanceShare: string;
    anchoredBalanceShare: string;
    registrationCoverageShare: string;
    assignableBalanceShare: string;
    freeBalanceShare: string;
  };
  trace: ReceivablesPoolKernelTrace;
};

/**
 * Shares of the outstanding balance backed by verified evidence, verified source anchors,
 * registration (registered or not required), assignability and freedom from encumbrance.
 * Each share uses the whole outstanding balance as denominator; a zero balance gives zero shares.
 */
export function calculateReceivablesPoolEvidenceCoverage(input: {
  totalOutstanding: string;
  titles: readonly ReceivablesPoolEvidenceTitle[];
}): ReceivablesPoolEvidenceCoverage {
  const total = requireNonNegative("totalOutstanding", input.totalOutstanding);
  for (const title of input.titles) requireNonNegative("outstandingBalance", title.outstandingBalance);
  const balanceWhere = (test: (title: ReceivablesPoolEvidenceTitle) => boolean) => sum(input.titles.filter(test).map((title) => title.outstandingBalance));
  const verified = balanceWhere((title) => title.evidenceVerified);
  const anchored = balanceWhere((title) => title.anchorVerified);
  const registrationCovered = balanceWhere((title) => title.registration === "registered" || title.registration === "not_required");
  const assignable = balanceWhere((title) => title.assignable);
  const free = balanceWhere((title) => title.encumbrance === "free");
  return {
    version: receivablesPoolKernelsVersion,
    amounts: {
      totalOutstanding: full(total),
      verifiedBalance: full(verified),
      anchoredBalance: full(anchored),
      registrationCoveredBalance: full(registrationCovered),
      assignableBalance: full(assignable),
      freeBalance: full(free),
    },
    shares: {
      verifiedBalanceShare: full(safeRatio(verified, total)),
      anchoredBalanceShare: full(safeRatio(anchored, total)),
      registrationCoverageShare: full(safeRatio(registrationCovered, total)),
      assignableBalanceShare: full(safeRatio(assignable, total)),
      freeBalanceShare: full(safeRatio(free, total)),
    },
    trace: {
      id: "receivables.pool_evidence_coverage",
      formula: "share = balance of titles meeting the condition / totalOutstanding; zero denominator gives zero",
      operands: {
        totalOutstanding: full(total),
        verifiedBalance: full(verified),
        anchoredBalance: full(anchored),
        registrationCoveredBalance: full(registrationCovered),
        assignableBalance: full(assignable),
        freeBalance: full(free),
        titles: String(input.titles.length),
      },
      result: full(safeRatio(verified, total)),
    },
  };
}
