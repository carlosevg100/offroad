import Decimal from "decimal.js";
import {
  allocateReceivablesPoolWaterfall,
  calculateDynamicReceivablesMetrics,
  calculateReceivablesPoolBorrowingBase,
  calculateReceivablesPoolEvidenceCoverage,
  calculateReceivablesPoolPerformance,
  calculateStaticReceivablesMetrics,
  capReceivablesPoolConcentration,
  classifyReceivablesPoolTitle,
  compareReceivablesPoolTrigger,
  reconcileReceivablesPoolLedgers,
  type DynamicReceivablesMetrics,
  type IsoDate,
  type MeasuredMetric,
  type ReceivablesAgingBucket,
  type ReceivablesPoolTrigger,
  type StaticReceivablesMetrics,
} from "@offroad/financial-core";

import {
  receivablesCaseSchema,
  type EligibilityReason,
  type ReceivablesCase,
  type ReceivablesDecision,
} from "./schema";
import {canonicalizeLegacyReceivablesCase} from "./canonical";

Decimal.set({precision: 40, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -30, toExpPos: 30});

const ZERO = new Decimal(0);
const ONE = new Decimal(1);
const d = (value: Decimal.Value) => new Decimal(value);
/** Presentation layer of the published result: money at two decimals, ratios at eight. The kernels stay unrounded. */
const money = (value: Decimal.Value) => d(value).toDecimalPlaces(2).toFixed(2);
const ratio = (value: Decimal.Value) => d(value).toDecimalPlaces(8).toFixed(8);
const sum = (values: readonly Decimal.Value[]) => values.reduce<Decimal>((total, value) => total.plus(value), ZERO);

function requiredMetricValue(metric: MeasuredMetric): string {
  if (metric.status !== "measured" || metric.value === null) {
    throw new RangeError(`required static metric is not evaluable: ${metric.id}`);
  }
  return metric.value;
}

export type ReceivableEligibility = {
  receivableId: string;
  debtorId: string;
  debtorGroupId: string;
  balance: string;
  daysPastDue: number;
  seasoningDays: number;
  remainingTermDays: number;
  eligible: boolean;
  reasons: EligibilityReason[];
};

export type AnalysisGap = {
  code: string;
  severity: "blocking" | "material" | "attention";
  scope: "portfolio" | "cedent" | "obligor" | "servicing" | "structure";
  message: {pt: string; en: string};
  evidenceIds: string[];
};

export type TriggerResult = {
  id: string;
  actual: string;
  threshold: string;
  comparison: "maximum" | "minimum";
  status: "within_limit" | "breached";
  consequence: "block" | "remediate";
};

export type ReceivablesAnalysis = {
  version: "2026.08.24-v1";
  caseId: string;
  staticMetrics: StaticReceivablesMetrics;
  dynamicMetrics: DynamicReceivablesMetrics;
  analyzedReceivables: ReceivableEligibility[];
  metrics: {
    portfolio: {
      receivableCount: number;
      debtorCount: number;
      debtorGroupCount: number;
      totalOutstanding: string;
      preliminaryEligibleBalance: string;
      concentrationAdjustedEligibleBalance: string;
      eligibleShare: string;
      weightedAverageRemainingDays: string;
      topDebtorShare: string;
      topFiveDebtorShare: string;
      topGroupShare: string;
      debtorHerfindahl: string;
    };
    aging: Record<"current" | "days_1_30" | "days_31_60" | "days_61_90" | "days_91_plus", string>;
    performance: {
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
    evidence: {
      verifiedBalanceShare: string;
      anchoredBalanceShare: string;
      registrationCoverageShare: string;
      assignableBalanceShare: string;
      freeBalanceShare: string;
    };
  };
  reconciliation: {
    tapeToAccounting: {tape: string; accounting: string; difference: string; differenceShare: string; status: "tied" | "outside_tolerance"};
    tapeCollectionsToAccounting: {tape: string; reported: string; difference: string; differenceShare: string; status: "tied" | "outside_tolerance"};
    collectionsToCash: {reported: string; cash: string; difference: string; differenceShare: string; status: "tied" | "outside_tolerance"};
    cashControls: {mappedShare: string; linkedAccountShare: string; duplicateReceiptIds: string[]; unanchoredReceiptIds: string[]; unknownMappingReceiptIds: string[]};
  };
  structure: {
    requestedFacility: string;
    maximumByAdvanceRate: string;
    maximumByOvercollateralization: string;
    supportedFacility: string;
    overcollateralizationAtRequest: string;
    requiredOvercollateralization: string;
    actualSubordinationRate: string;
    requiredSubordinationRate: string;
    reserveTarget: string;
    waterfall: Array<{priority: number; item: string; due: string; paid: string; shortfall: string}>;
    residualCash: string;
  };
  triggers: TriggerResult[];
  gaps: AnalysisGap[];
  decision: {
    status: ReceivablesDecision;
    blockingCodes: string[];
    remediationCodes: string[];
    refusalCodes: string[];
    externalDirectionAllowed: false;
  };
};

const agingBucketIds: readonly ReceivablesAgingBucket[] = [
  "not_due", "past_due_1_15", "past_due_16_30", "past_due_31_60", "past_due_61_90", "past_due_91_180", "past_due_over_180",
];

const gap = (code: string, severity: AnalysisGap["severity"], scope: AnalysisGap["scope"], pt: string, en: string, evidenceIds: string[] = []): AnalysisGap => ({
  code, severity, scope, message: {pt, en}, evidenceIds,
});

function publishTrigger(trigger: ReceivablesPoolTrigger): TriggerResult {
  return {id: trigger.id, actual: ratio(trigger.actual), threshold: ratio(trigger.threshold), comparison: trigger.comparison, status: trigger.status, consequence: trigger.consequence};
}

/**
 * Orchestrates the deterministic kernels of `@offroad/financial-core` over a validated case and
 * assembles gaps and the bounded decision. No figure is computed here: eligibility, concentration
 * caps, borrowing base, waterfall, reconciliation, performance, evidence coverage and triggers
 * come from the kernels; this module only chooses inputs, formats the published strings and
 * turns kernel outcomes into gap codes.
 */
export function analyzeReceivables(raw: ReceivablesCase): ReceivablesAnalysis {
  const input = receivablesCaseSchema.parse(raw);
  const canonical = canonicalizeLegacyReceivablesCase(input);
  const staticMetrics = calculateStaticReceivablesMetrics(canonical.universe, {datasetHash: canonical.datasetHash});
  const dynamicMetrics = calculateDynamicReceivablesMetrics(canonical.universe, {datasetHash: canonical.datasetHash});
  const referenceDate = input.referenceDate as IsoDate;
  const analyzedReceivables = input.portfolio.map((item): ReceivableEligibility => {
    const classification = classifyReceivablesPoolTitle({
      outstandingBalance: item.outstandingBalance,
      defaultedBalance: item.defaultedBalance,
      originDate: item.originDate as IsoDate,
      dueDate: item.dueDate as IsoDate,
      assignable: item.assignable,
      evidenceVerified: item.evidenceVerified,
      anchorVerified: item.anchorVerified,
      registration: item.registration,
      encumbrance: item.encumbrance,
      disputed: item.disputed,
      relatedParty: item.relatedParty,
      debtorSector: item.debtorSector,
    }, input.policy, referenceDate);
    return {
      receivableId: item.id,
      debtorId: item.debtorId,
      debtorGroupId: item.debtorGroupId ?? item.debtorId,
      balance: money(item.outstandingBalance),
      daysPastDue: classification.daysPastDue,
      seasoningDays: classification.seasoningDays,
      remainingTermDays: classification.remainingTermDays,
      eligible: classification.eligible,
      reasons: classification.reasons,
    };
  });
  const total = d(requiredMetricValue(staticMetrics.portfolio.totalOpenValue));
  const eligibleIds = new Set(analyzedReceivables.filter((item) => item.eligible).map((item) => item.receivableId));
  const eligibleItems = input.portfolio.filter((item) => eligibleIds.has(item.id));
  const concentration = capReceivablesPoolConcentration({
    items: eligibleItems.map((item) => ({debtorId: item.debtorId, debtorGroupId: item.debtorGroupId ?? item.debtorId, balance: item.outstandingBalance})),
    maxSingleDebtorShare: input.policy.maxSingleDebtorShare,
    maxDebtorGroupShare: input.policy.maxDebtorGroupShare,
  });
  const debtors = new Set(input.portfolio.map((item) => item.debtorId));
  const groups = new Set(input.portfolio.map((item) => item.debtorGroupId ?? item.debtorId));
  const debtorConcentration = {
    top: d(staticMetrics.concentration.openByObligor.top_1.value ?? 0),
    topFive: d(staticMetrics.concentration.openByObligor.top_5.value ?? 0),
    herfindahl: d(staticMetrics.concentration.openByObligor.herfindahl.value ?? 0),
  };
  const groupConcentration = {
    top: d(staticMetrics.concentration.openByEconomicGroup.top_1.value ?? 0),
  };
  const weightedRemaining = d(staticMetrics.portfolio.weightedRemainingTermDays.value ?? 0);

  const performance = calculateReceivablesPoolPerformance({
    totalOutstanding: total.toFixed(),
    agingBuckets: Object.fromEntries(agingBucketIds.map((bucket) => [bucket, requiredMetricValue(staticMetrics.aging[bucket])])) as Record<ReceivablesAgingBucket, string>,
    titles: input.portfolio,
  });
  const evidence = calculateReceivablesPoolEvidenceCoverage({totalOutstanding: total.toFixed(), titles: input.portfolio});
  const reconciliation = reconcileReceivablesPoolLedgers({
    tapeOutstanding: total.toFixed(),
    accountingGrossBalance: input.accounting.grossReceivablesBalance,
    tapeCollections: sum(input.portfolio.map((item) => item.collectedInPeriod)).toFixed(),
    reportedCollections: input.accounting.reportedCollectionsInPeriod,
    receipts: input.cashReceipts,
    titles: input.portfolio,
    maximumAccountingMismatchShare: input.policy.maximumAccountingMismatchShare,
    maximumCashMismatchShare: input.policy.maximumCashMismatchShare,
  });
  const cash = d(reconciliation.cashControls.validCashReceipts);
  const defaulted = d(performance.amounts.defaulted);

  const borrowingBase = calculateReceivablesPoolBorrowingBase({
    adjustedEligibleBalance: concentration.adjustedEligibleBalance,
    totalOutstanding: total.toFixed(),
    requestedFacility: input.structure.requestedFacility,
    advanceRate: input.structure.advanceRate,
    requiredOvercollateralization: input.structure.requiredOvercollateralization,
    requiredSubordinationRate: input.structure.requiredSubordinationRate,
    actualSeniorAmount: input.structure.actualSeniorAmount,
    actualMezzanineAmount: input.structure.actualMezzanineAmount,
    actualSubordinatedAmount: input.structure.actualSubordinatedAmount,
    reserveRate: input.structure.reserveRate,
  });
  const waterfall = allocateReceivablesPoolWaterfall({
    availableCash: input.structure.waterfall.availableCash,
    servicingFeeDue: input.structure.waterfall.servicingFeeDue,
    seniorInterestDue: input.structure.waterfall.seniorInterestDue,
    seniorPrincipalDue: input.structure.waterfall.seniorPrincipalDue,
    mezzanineDue: input.structure.waterfall.mezzanineDue,
    reserveOpening: input.structure.waterfall.reserveOpening,
    reserveTarget: borrowingBase.reserveTarget,
  });
  const publishedWaterfall = waterfall.allocations.map((allocation) => ({
    priority: allocation.priority, item: allocation.item, due: money(allocation.due), paid: money(allocation.paid), shortfall: money(allocation.shortfall),
  }));
  // The published two-decimal shortfalls are what the gap reads, as the result shows them.
  const seniorShortfall = d(publishedWaterfall.find((item) => item.item === "senior_interest")?.shortfall ?? "0")
    .plus(publishedWaterfall.find((item) => item.item === "senior_principal")?.shortfall ?? "0");

  const trigger = (id: string, actual: Decimal.Value, threshold: string, comparison: TriggerResult["comparison"], consequence: TriggerResult["consequence"]) => (
    publishTrigger(compareReceivablesPoolTrigger({id, actual: d(actual).toFixed(), threshold, comparison, consequence}))
  );
  const triggers: TriggerResult[] = [
    trigger("eligible_share", borrowingBase.eligibleShare, input.policy.minimumEligibleShare, "minimum", "block"),
    trigger("evidence_coverage", evidence.shares.verifiedBalanceShare, input.policy.minimumEvidenceCoverage, "minimum", "block"),
    trigger("registration_coverage", evidence.shares.registrationCoverageShare, input.policy.minimumRegistrationCoverage, "minimum", "block"),
    trigger("accounting_reconciliation", reconciliation.tapeToAccounting.differenceShare, input.policy.maximumAccountingMismatchShare, "maximum", "block"),
    trigger("tape_collections_reconciliation", reconciliation.tapeCollectionsToAccounting.differenceShare, input.policy.maximumCashMismatchShare, "maximum", "block"),
    trigger("cash_reconciliation", reconciliation.collectionsToCash.differenceShare, input.policy.maximumCashMismatchShare, "maximum", "block"),
    // A period without cash has nothing to map: the control counts as fully met, not as zero.
    trigger("cash_mapping", cash.isZero() ? ONE : reconciliation.cashControls.mappedShare, input.policy.minimumMappedCashShare, "minimum", "block"),
    trigger("linked_account", cash.isZero() ? ONE : reconciliation.cashControls.linkedAccountShare, input.policy.minimumLinkedAccountCashShare, "minimum", "block"),
    trigger("single_debtor_concentration", debtorConcentration.top, input.policy.maxSingleDebtorShare, "maximum", "remediate"),
    trigger("debtor_group_concentration", groupConcentration.top, input.policy.maxDebtorGroupShare, "maximum", "remediate"),
    trigger("delinquency_30", performance.ratios.delinquency30Share, input.policy.maximumDelinquency30Share, "maximum", "remediate"),
    trigger("dilution", performance.ratios.dilutionRate, input.policy.maximumDilutionShare, "maximum", "remediate"),
    trigger("repurchase", performance.ratios.repurchaseRate, input.policy.maximumRepurchaseShare, "maximum", "remediate"),
    // Without defaults there is nothing to recover: the floor counts as met.
    trigger("recovery", defaulted.isZero() ? ONE : performance.ratios.recoveryRate, input.policy.minimumRecoveryRate, "minimum", "remediate"),
    trigger("subordination", borrowingBase.actualSubordinationRate, input.structure.requiredSubordinationRate, "minimum", "remediate"),
  ];

  const gaps: AnalysisGap[] = [];
  if (total.isZero()) gaps.push(gap("empty_portfolio", "blocking", "portfolio", "A carteira não contém saldo econômico.", "The portfolio has no economic balance."));
  if (!borrowingBase.requestCoveredBySupportedFacility) gaps.push(gap("facility_above_borrowing_base", "blocking", "structure", "O pedido excede a base elegível suportada pela taxa de avanço e pela sobrecolateralização.", "The request exceeds the eligible borrowing base supported by the advance rate and overcollateralization."));
  if (reconciliation.cashControls.duplicateReceiptIds.length > 0) gaps.push(gap("duplicate_cash_receipts", "blocking", "servicing", "O extrato contém recebimentos duplicados ou estornados sem reconciliação concluída.", "The cash ledger contains duplicate or reversed receipts without completed reconciliation.", reconciliation.cashControls.duplicateReceiptIds));
  if (reconciliation.cashControls.unknownMappingReceiptIds.length > 0) gaps.push(gap("cash_mapping_unknown_receivable", "blocking", "servicing", "Há recebimentos ligados a título inexistente ou a sacado divergente no loan tape.", "Some receipts point to an unknown receivable or a mismatched obligor in the loan tape.", reconciliation.cashControls.unknownMappingReceiptIds));
  if (input.portfolio.some((item) => item.registration === "conflict")) gaps.push(gap("registration_or_ownership_conflict", "blocking", "portfolio", "Há conflito de registro ou titularidade que impede tratar os direitos creditórios como base disponível.", "A registration or ownership conflict prevents treating the receivables as an available base.", input.portfolio.filter((item) => item.registration === "conflict").map((item) => item.id)));
  if (reconciliation.cashControls.unanchoredReceiptIds.length > 0) gaps.push(gap("cash_anchor_unverified", "blocking", "servicing", "Há recebimentos sem âncora verificável no extrato de origem.", "Some receipts lack a verifiable anchor in the source statement.", reconciliation.cashControls.unanchoredReceiptIds));
  if (seniorShortfall.gt(0)) gaps.push(gap("waterfall_senior_shortfall", "material", "structure", "O caixa disponível não cobre integralmente juros e principal sênior na waterfall indicativa.", "Available cash does not fully cover senior interest and principal in the indicative waterfall."));
  for (const breached of triggers.filter((item) => item.status === "breached")) {
    const severity = breached.consequence === "block" ? "blocking" : "material";
    gaps.push(gap(`trigger_${breached.id}`, severity, breached.id.includes("cash") ? "servicing" : breached.id.includes("concentration") ? "obligor" : breached.id.includes("subordination") ? "structure" : "portfolio", `O gatilho ${breached.id} está fora do limite definido.`, `The ${breached.id} trigger is outside its defined limit.`));
  }
  if (d(reconciliation.cashControls.excludedDuplicateCash).gt(0)) {
    gaps.push(gap("cash_ledger_contains_excluded_duplicates", "attention", "servicing", "O total bruto do extrato inclui itens duplicados que foram excluídos da conciliação.", "The gross cash ledger includes duplicate items excluded from reconciliation."));
  }

  const blockingCodes = [...new Set(gaps.filter((item) => item.severity === "blocking").map((item) => item.code))];
  const remediationCodes = [...new Set(gaps.filter((item) => item.severity === "material").map((item) => item.code))];
  const remediableEligibilityReasons = new Set<EligibilityReason>(["seasoning", "evidence_unverified", "anchor_unverified", "registration_missing"]);
  const potentiallyEligibleBalance = sum(analyzedReceivables
    .filter((item) => item.reasons.every((reason) => remediableEligibilityReasons.has(reason)))
    .map((item) => item.balance));
  const refusalCodes = total.isZero()
    ? ["empty_portfolio"]
    : potentiallyEligibleBalance.isZero()
      ? ["no_economically_eligible_receivables"]
      : [];
  const status: ReceivablesDecision = refusalCodes.length > 0
    ? "not_viable"
    : blockingCodes.length > 0 || remediationCodes.length > 0
      ? "needs_remediation"
      : "ready_for_structuring";

  return {
    version: "2026.08.24-v1",
    caseId: input.id,
    staticMetrics,
    dynamicMetrics,
    analyzedReceivables,
    metrics: {
      portfolio: {
        receivableCount: input.portfolio.length,
        debtorCount: debtors.size,
        debtorGroupCount: groups.size,
        totalOutstanding: money(total),
        preliminaryEligibleBalance: money(concentration.preliminaryEligibleBalance),
        concentrationAdjustedEligibleBalance: money(concentration.adjustedEligibleBalance),
        eligibleShare: ratio(borrowingBase.eligibleShare),
        weightedAverageRemainingDays: weightedRemaining.toDecimalPlaces(2).toFixed(2),
        topDebtorShare: ratio(debtorConcentration.top),
        topFiveDebtorShare: ratio(debtorConcentration.topFive),
        topGroupShare: ratio(groupConcentration.top),
        debtorHerfindahl: ratio(debtorConcentration.herfindahl),
      },
      aging: Object.fromEntries(Object.entries(performance.aging).map(([key, value]) => [key, money(value)])) as ReceivablesAnalysis["metrics"]["aging"],
      performance: Object.fromEntries(Object.entries(performance.ratios).map(([key, value]) => [key, ratio(value)])) as ReceivablesAnalysis["metrics"]["performance"],
      evidence: Object.fromEntries(Object.entries(evidence.shares).map(([key, value]) => [key, ratio(value)])) as ReceivablesAnalysis["metrics"]["evidence"],
    },
    reconciliation: {
      tapeToAccounting: {tape: money(reconciliation.tapeToAccounting.left), accounting: money(reconciliation.tapeToAccounting.right), difference: money(reconciliation.tapeToAccounting.difference), differenceShare: ratio(reconciliation.tapeToAccounting.differenceShare), status: reconciliation.tapeToAccounting.status},
      tapeCollectionsToAccounting: {tape: money(reconciliation.tapeCollectionsToAccounting.left), reported: money(reconciliation.tapeCollectionsToAccounting.right), difference: money(reconciliation.tapeCollectionsToAccounting.difference), differenceShare: ratio(reconciliation.tapeCollectionsToAccounting.differenceShare), status: reconciliation.tapeCollectionsToAccounting.status},
      collectionsToCash: {reported: money(reconciliation.collectionsToCash.right), cash: money(reconciliation.collectionsToCash.left), difference: money(reconciliation.collectionsToCash.difference), differenceShare: ratio(reconciliation.collectionsToCash.differenceShare), status: reconciliation.collectionsToCash.status},
      cashControls: {
        mappedShare: ratio(reconciliation.cashControls.mappedShare), linkedAccountShare: ratio(reconciliation.cashControls.linkedAccountShare),
        duplicateReceiptIds: reconciliation.cashControls.duplicateReceiptIds,
        unanchoredReceiptIds: reconciliation.cashControls.unanchoredReceiptIds,
        unknownMappingReceiptIds: reconciliation.cashControls.unknownMappingReceiptIds,
      },
    },
    structure: {
      requestedFacility: money(borrowingBase.requestedFacility), maximumByAdvanceRate: money(borrowingBase.maximumByAdvanceRate), maximumByOvercollateralization: money(borrowingBase.maximumByOvercollateralization), supportedFacility: money(borrowingBase.supportedFacility),
      overcollateralizationAtRequest: ratio(borrowingBase.overcollateralizationAtRequest), requiredOvercollateralization: d(input.structure.requiredOvercollateralization).toFixed(8),
      actualSubordinationRate: ratio(borrowingBase.actualSubordinationRate), requiredSubordinationRate: ratio(input.structure.requiredSubordinationRate), reserveTarget: money(borrowingBase.reserveTarget),
      waterfall: publishedWaterfall, residualCash: money(waterfall.unallocatedCash),
    },
    triggers,
    gaps,
    decision: {status, blockingCodes, remediationCodes, refusalCodes, externalDirectionAllowed: false},
  };
}
