import Decimal from "decimal.js";
import {
  calculateDynamicReceivablesMetrics,
  calculateStaticReceivablesMetrics,
  type DynamicReceivablesMetrics,
  type MeasuredMetric,
  type StaticReceivablesMetrics,
} from "@offroad/financial-core";

import {
  receivablesCaseSchema,
  type EligibilityReason,
  type Receivable,
  type ReceivablesCase,
  type ReceivablesDecision,
} from "./schema";
import {canonicalizeLegacyReceivablesCase} from "./canonical";

Decimal.set({precision: 40, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -30, toExpPos: 30});

const ZERO = new Decimal(0);
const ONE = new Decimal(1);
const DAY = 86_400_000;
const d = (value: Decimal.Value) => new Decimal(value);
const money = (value: Decimal) => value.toDecimalPlaces(2).toFixed(2);
const ratio = (value: Decimal) => value.toDecimalPlaces(8).toFixed(8);
const sum = (values: readonly Decimal.Value[]) => values.reduce<Decimal>((total, value) => total.plus(value), ZERO);
const safeRatio = (numerator: Decimal, denominator: Decimal) => denominator.isZero() ? ZERO : numerator.div(denominator);
const utc = (value: string) => Date.parse(`${value}T00:00:00.000Z`);
const daysBetween = (from: string, to: string) => Math.floor((utc(to) - utc(from)) / DAY);

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

function eligibilityReasons(item: Receivable, input: ReceivablesCase): Omit<ReceivableEligibility, "receivableId" | "debtorId" | "debtorGroupId" | "balance"> {
  const policy = input.policy;
  const daysPastDue = Math.max(0, daysBetween(item.dueDate, input.referenceDate));
  const seasoningDays = Math.max(0, daysBetween(item.originDate, input.referenceDate));
  const remainingTermDays = Math.max(0, daysBetween(input.referenceDate, item.dueDate));
  const reasons: EligibilityReason[] = [];
  if (d(item.outstandingBalance).lte(0)) reasons.push("zero_balance");
  if (d(item.defaultedBalance).gt(0)) reasons.push("defaulted");
  if (daysPastDue > policy.maxDaysPastDue) reasons.push("past_due");
  if (remainingTermDays > policy.maxRemainingTermDays) reasons.push("remaining_term");
  if (seasoningDays < policy.minSeasoningDays) reasons.push("seasoning");
  if (policy.requireAssignable && !item.assignable) reasons.push("not_assignable");
  if (policy.requireEvidenceVerified && !item.evidenceVerified) reasons.push("evidence_unverified");
  if (!item.anchorVerified) reasons.push("anchor_unverified");
  if (policy.registrationRule !== "not_required" && item.registration === "missing") reasons.push("registration_missing");
  if (item.registration === "conflict") reasons.push("registration_conflict");
  if (policy.excludeEncumbered && item.encumbrance !== "free") reasons.push("encumbered");
  if (policy.excludeDisputed && item.disputed) reasons.push("disputed");
  if (policy.excludeRelatedParties && item.relatedParty) reasons.push("related_party");
  if (policy.allowedDebtorSectors.length > 0 && !policy.allowedDebtorSectors.includes(item.debtorSector)) reasons.push("sector_outside_policy");
  return {daysPastDue, seasoningDays, remainingTermDays, eligible: reasons.length === 0, reasons};
}

function balancesBy(items: readonly Receivable[], key: (item: Receivable) => string): Map<string, Decimal> {
  const values = new Map<string, Decimal>();
  for (const item of items) values.set(key(item), (values.get(key(item)) ?? ZERO).plus(item.outstandingBalance));
  return values;
}

function concentration(values: Map<string, Decimal>, total: Decimal) {
  const shares = [...values.values()].map((value) => safeRatio(value, total)).sort((a, b) => b.comparedTo(a));
  return {
    top: shares[0] ?? ZERO,
    topFive: sum(shares.slice(0, 5)),
    herfindahl: sum(shares.map((share) => share.pow(2))),
  };
}

function adjustedForConcentration(items: readonly Receivable[], maxDebtorShare: Decimal, maxGroupShare: Decimal): Decimal {
  const total = sum(items.map((item) => item.outstandingBalance));
  const debtorCap = total.times(maxDebtorShare);
  const groupCap = total.times(maxGroupShare);
  const groups = new Map<string, Map<string, Decimal>>();
  for (const item of items) {
    const groupId = item.debtorGroupId ?? item.debtorId;
    const debtors = groups.get(groupId) ?? new Map<string, Decimal>();
    debtors.set(item.debtorId, (debtors.get(item.debtorId) ?? ZERO).plus(item.outstandingBalance));
    groups.set(groupId, debtors);
  }
  return [...groups.values()].reduce((portfolio, debtors) => {
    const afterDebtorCaps = [...debtors.values()].reduce((group, balance) => group.plus(Decimal.min(balance, debtorCap)), ZERO);
    return portfolio.plus(Decimal.min(afterDebtorCaps, groupCap));
  }, ZERO);
}

function allocateWaterfall(input: ReceivablesCase["structure"]["waterfall"], reserveTarget: Decimal) {
  let cash = d(input.availableCash);
  const dueItems = [
    {item: "servicing_fee", due: d(input.servicingFeeDue)},
    {item: "senior_interest", due: d(input.seniorInterestDue)},
    {item: "reserve_top_up", due: Decimal.max(reserveTarget.minus(input.reserveOpening), ZERO)},
    {item: "senior_principal", due: d(input.seniorPrincipalDue)},
    {item: "mezzanine", due: d(input.mezzanineDue)},
  ];
  const allocations = dueItems.map(({item, due}, index) => {
    const paid = Decimal.min(cash, due);
    cash = cash.minus(paid);
    return {priority: index + 1, item, due: money(due), paid: money(paid), shortfall: money(due.minus(paid))};
  });
  const residual = cash;
  allocations.push({priority: 6, item: "subordinated_residual", due: money(residual), paid: money(residual), shortfall: "0.00"});
  return {allocations, residualCash: ZERO};
}

const gap = (code: string, severity: AnalysisGap["severity"], scope: AnalysisGap["scope"], pt: string, en: string, evidenceIds: string[] = []): AnalysisGap => ({
  code, severity, scope, message: {pt, en}, evidenceIds,
});

function compareTrigger(id: string, actual: Decimal, threshold: Decimal, comparison: TriggerResult["comparison"], consequence: TriggerResult["consequence"]): TriggerResult {
  const breached = comparison === "maximum" ? actual.gt(threshold) : actual.lt(threshold);
  return {id, actual: ratio(actual), threshold: ratio(threshold), comparison, status: breached ? "breached" : "within_limit", consequence};
}

export function analyzeReceivables(raw: ReceivablesCase): ReceivablesAnalysis {
  const input = receivablesCaseSchema.parse(raw);
  const canonical = canonicalizeLegacyReceivablesCase(input);
  const staticMetrics = calculateStaticReceivablesMetrics(canonical.universe, {datasetHash: canonical.datasetHash});
  const dynamicMetrics = calculateDynamicReceivablesMetrics(canonical.universe, {datasetHash: canonical.datasetHash});
  const analyzedReceivables = input.portfolio.map((item): ReceivableEligibility => ({
    receivableId: item.id,
    debtorId: item.debtorId,
    debtorGroupId: item.debtorGroupId ?? item.debtorId,
    balance: money(d(item.outstandingBalance)),
    ...eligibilityReasons(item, input),
  }));
  const total = d(requiredMetricValue(staticMetrics.portfolio.totalOpenValue));
  const eligibleIds = new Set(analyzedReceivables.filter((item) => item.eligible).map((item) => item.receivableId));
  const eligibleItems = input.portfolio.filter((item) => eligibleIds.has(item.id));
  const preliminaryEligible = sum(eligibleItems.map((item) => item.outstandingBalance));
  const adjustedEligible = adjustedForConcentration(eligibleItems, d(input.policy.maxSingleDebtorShare), d(input.policy.maxDebtorGroupShare));
  const debtors = balancesBy(input.portfolio, (item) => item.debtorId);
  const groups = balancesBy(input.portfolio, (item) => item.debtorGroupId ?? item.debtorId);
  const debtorConcentration = {
    top: d(staticMetrics.concentration.openByObligor.top_1.value ?? 0),
    topFive: d(staticMetrics.concentration.openByObligor.top_5.value ?? 0),
    herfindahl: d(staticMetrics.concentration.openByObligor.herfindahl.value ?? 0),
  };
  const groupConcentration = {
    top: d(staticMetrics.concentration.openByEconomicGroup.top_1.value ?? 0),
  };

  const aging = {
    current: d(requiredMetricValue(staticMetrics.aging.not_due)),
    days_1_30: d(requiredMetricValue(staticMetrics.aging.past_due_1_15)).plus(requiredMetricValue(staticMetrics.aging.past_due_16_30)),
    days_31_60: d(requiredMetricValue(staticMetrics.aging.past_due_31_60)),
    days_61_90: d(requiredMetricValue(staticMetrics.aging.past_due_61_90)),
    days_91_plus: d(requiredMetricValue(staticMetrics.aging.past_due_91_180)).plus(requiredMetricValue(staticMetrics.aging.past_due_over_180)),
  };
  const overdue1 = aging.days_1_30.plus(aging.days_31_60).plus(aging.days_61_90).plus(aging.days_91_plus);
  const overdue30 = aging.days_31_60.plus(aging.days_61_90).plus(aging.days_91_plus);
  const overdue90 = aging.days_91_plus;
  const defaulted = sum(input.portfolio.map((item) => item.defaultedBalance));
  const recovered = sum(input.portfolio.map((item) => item.recoveredInPeriod));
  const dilution = sum(input.portfolio.map((item) => item.dilutionInPeriod));
  const repurchase = sum(input.portfolio.map((item) => item.repurchasedInPeriod));
  const substitution = sum(input.portfolio.map((item) => item.substitutedInPeriod));
  const originated = sum(input.portfolio.map((item) => item.originalAmount));
  const netLoss = Decimal.max(defaulted.minus(recovered), ZERO);
  const weightedRemaining = d(staticMetrics.portfolio.weightedRemainingTermDays.value ?? 0);

  const verifiedBalance = sum(input.portfolio.filter((item) => item.evidenceVerified).map((item) => item.outstandingBalance));
  const anchoredBalance = sum(input.portfolio.filter((item) => item.anchorVerified).map((item) => item.outstandingBalance));
  const registrationCovered = sum(input.portfolio.filter((item) => item.registration === "registered" || item.registration === "not_required").map((item) => item.outstandingBalance));
  const assignable = sum(input.portfolio.filter((item) => item.assignable).map((item) => item.outstandingBalance));
  const free = sum(input.portfolio.filter((item) => item.encumbrance === "free").map((item) => item.outstandingBalance));

  const accounting = d(input.accounting.grossReceivablesBalance);
  const tapeDifference = total.minus(accounting).abs();
  const tapeDifferenceShare = safeRatio(tapeDifference, Decimal.max(accounting.abs(), ONE));
  const validCashReceipts = input.cashReceipts.filter((receipt) => receipt.duplicateOf === null);
  const tapeCollections = sum(input.portfolio.map((item) => item.collectedInPeriod));
  const cash = sum(validCashReceipts.map((receipt) => receipt.amount));
  const reportedCollections = d(input.accounting.reportedCollectionsInPeriod);
  const tapeCollectionsDifference = tapeCollections.minus(reportedCollections).abs();
  const tapeCollectionsDifferenceShare = safeRatio(tapeCollectionsDifference, Decimal.max(reportedCollections.abs(), ONE));
  const cashDifference = cash.minus(reportedCollections).abs();
  const cashDifferenceShare = safeRatio(cashDifference, Decimal.max(reportedCollections.abs(), ONE));
  const allCash = sum(input.cashReceipts.map((receipt) => receipt.amount));
  const receivableById = new Map(input.portfolio.map((item) => [item.id, item]));
  const unknownMappingReceiptIds = validCashReceipts.filter((receipt) => {
    if (receipt.receivableId === null || receipt.debtorId === null) return false;
    const receivable = receivableById.get(receipt.receivableId);
    return receivable === undefined || receivable.debtorId !== receipt.debtorId;
  }).map((receipt) => receipt.id);
  const unknownMapping = new Set(unknownMappingReceiptIds);
  const mappedCash = sum(validCashReceipts.filter((receipt) => receipt.receivableId !== null && receipt.debtorId !== null && !unknownMapping.has(receipt.id)).map((receipt) => receipt.amount));
  const linkedCash = sum(validCashReceipts.filter((receipt) => receipt.linkedAccount).map((receipt) => receipt.amount));
  const mappedShare = safeRatio(mappedCash, Decimal.max(cash, ONE));
  const linkedShare = safeRatio(linkedCash, Decimal.max(cash, ONE));

  const maximumByAdvance = adjustedEligible.times(input.structure.advanceRate);
  const maximumByOc = adjustedEligible.div(input.structure.requiredOvercollateralization);
  const supportedFacility = Decimal.min(maximumByAdvance, maximumByOc);
  const requested = d(input.structure.requestedFacility);
  const totalCapital = d(input.structure.actualSeniorAmount).plus(input.structure.actualMezzanineAmount).plus(input.structure.actualSubordinatedAmount);
  const subordinateCapital = d(input.structure.actualMezzanineAmount).plus(input.structure.actualSubordinatedAmount);
  const actualSubordination = safeRatio(subordinateCapital, totalCapital);
  const overcollateralization = requested.isZero() ? ZERO : adjustedEligible.div(requested);
  const reserveTarget = d(input.structure.actualSeniorAmount).times(input.structure.reserveRate);
  const waterfall = allocateWaterfall(input.structure.waterfall, reserveTarget);

  const performance = {
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
  const evidence = {
    verifiedBalanceShare: safeRatio(verifiedBalance, total),
    anchoredBalanceShare: safeRatio(anchoredBalance, total),
    registrationCoverageShare: safeRatio(registrationCovered, total),
    assignableBalanceShare: safeRatio(assignable, total),
    freeBalanceShare: safeRatio(free, total),
  };
  const eligibleShare = safeRatio(adjustedEligible, total);
  const seniorShortfall = d(waterfall.allocations.find((item) => item.item === "senior_interest")?.shortfall ?? "0")
    .plus(waterfall.allocations.find((item) => item.item === "senior_principal")?.shortfall ?? "0");

  const triggers: TriggerResult[] = [
    compareTrigger("eligible_share", eligibleShare, d(input.policy.minimumEligibleShare), "minimum", "block"),
    compareTrigger("evidence_coverage", evidence.verifiedBalanceShare, d(input.policy.minimumEvidenceCoverage), "minimum", "block"),
    compareTrigger("registration_coverage", evidence.registrationCoverageShare, d(input.policy.minimumRegistrationCoverage), "minimum", "block"),
    compareTrigger("accounting_reconciliation", tapeDifferenceShare, d(input.policy.maximumAccountingMismatchShare), "maximum", "block"),
    compareTrigger("tape_collections_reconciliation", tapeCollectionsDifferenceShare, d(input.policy.maximumCashMismatchShare), "maximum", "block"),
    compareTrigger("cash_reconciliation", cashDifferenceShare, d(input.policy.maximumCashMismatchShare), "maximum", "block"),
    compareTrigger("cash_mapping", cash.isZero() ? ONE : mappedShare, d(input.policy.minimumMappedCashShare), "minimum", "block"),
    compareTrigger("linked_account", cash.isZero() ? ONE : linkedShare, d(input.policy.minimumLinkedAccountCashShare), "minimum", "block"),
    compareTrigger("single_debtor_concentration", debtorConcentration.top, d(input.policy.maxSingleDebtorShare), "maximum", "remediate"),
    compareTrigger("debtor_group_concentration", groupConcentration.top, d(input.policy.maxDebtorGroupShare), "maximum", "remediate"),
    compareTrigger("delinquency_30", performance.delinquency30Share, d(input.policy.maximumDelinquency30Share), "maximum", "remediate"),
    compareTrigger("dilution", performance.dilutionRate, d(input.policy.maximumDilutionShare), "maximum", "remediate"),
    compareTrigger("repurchase", performance.repurchaseRate, d(input.policy.maximumRepurchaseShare), "maximum", "remediate"),
    compareTrigger("recovery", defaulted.isZero() ? ONE : performance.recoveryRate, d(input.policy.minimumRecoveryRate), "minimum", "remediate"),
    compareTrigger("subordination", actualSubordination, d(input.structure.requiredSubordinationRate), "minimum", "remediate"),
  ];

  const gaps: AnalysisGap[] = [];
  if (total.isZero()) gaps.push(gap("empty_portfolio", "blocking", "portfolio", "A carteira não contém saldo econômico.", "The portfolio has no economic balance."));
  if (supportedFacility.lt(requested)) gaps.push(gap("facility_above_borrowing_base", "blocking", "structure", "O pedido excede a base elegível suportada pela taxa de avanço e pela sobrecolateralização.", "The request exceeds the eligible borrowing base supported by the advance rate and overcollateralization."));
  if (input.cashReceipts.some((receipt) => receipt.duplicateOf !== null)) gaps.push(gap("duplicate_cash_receipts", "blocking", "servicing", "O extrato contém recebimentos duplicados ou estornados sem reconciliação concluída.", "The cash ledger contains duplicate or reversed receipts without completed reconciliation.", input.cashReceipts.filter((item) => item.duplicateOf !== null).map((item) => item.id)));
  if (unknownMappingReceiptIds.length > 0) gaps.push(gap("cash_mapping_unknown_receivable", "blocking", "servicing", "Há recebimentos ligados a título inexistente ou a sacado divergente no loan tape.", "Some receipts point to an unknown receivable or a mismatched obligor in the loan tape.", unknownMappingReceiptIds));
  if (input.portfolio.some((item) => item.registration === "conflict")) gaps.push(gap("registration_or_ownership_conflict", "blocking", "portfolio", "Há conflito de registro ou titularidade que impede tratar os direitos creditórios como base disponível.", "A registration or ownership conflict prevents treating the receivables as an available base.", input.portfolio.filter((item) => item.registration === "conflict").map((item) => item.id)));
  if (input.cashReceipts.some((receipt) => !receipt.anchorVerified)) gaps.push(gap("cash_anchor_unverified", "blocking", "servicing", "Há recebimentos sem âncora verificável no extrato de origem.", "Some receipts lack a verifiable anchor in the source statement.", input.cashReceipts.filter((item) => !item.anchorVerified).map((item) => item.id)));
  if (seniorShortfall.gt(0)) gaps.push(gap("waterfall_senior_shortfall", "material", "structure", "O caixa disponível não cobre integralmente juros e principal sênior na waterfall indicativa.", "Available cash does not fully cover senior interest and principal in the indicative waterfall."));
  for (const trigger of triggers.filter((item) => item.status === "breached")) {
    const severity = trigger.consequence === "block" ? "blocking" : "material";
    gaps.push(gap(`trigger_${trigger.id}`, severity, trigger.id.includes("cash") ? "servicing" : trigger.id.includes("concentration") ? "obligor" : trigger.id.includes("subordination") ? "structure" : "portfolio", `O gatilho ${trigger.id} está fora do limite definido.`, `The ${trigger.id} trigger is outside its defined limit.`));
  }
  if (allCash.gt(cash)) {
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
        preliminaryEligibleBalance: money(preliminaryEligible),
        concentrationAdjustedEligibleBalance: money(adjustedEligible),
        eligibleShare: ratio(eligibleShare),
        weightedAverageRemainingDays: weightedRemaining.toDecimalPlaces(2).toFixed(2),
        topDebtorShare: ratio(debtorConcentration.top),
        topFiveDebtorShare: ratio(debtorConcentration.topFive),
        topGroupShare: ratio(groupConcentration.top),
        debtorHerfindahl: ratio(debtorConcentration.herfindahl),
      },
      aging: Object.fromEntries(Object.entries(aging).map(([key, value]) => [key, money(value)])) as ReceivablesAnalysis["metrics"]["aging"],
      performance: Object.fromEntries(Object.entries(performance).map(([key, value]) => [key, ratio(value)])) as ReceivablesAnalysis["metrics"]["performance"],
      evidence: Object.fromEntries(Object.entries(evidence).map(([key, value]) => [key, ratio(value)])) as ReceivablesAnalysis["metrics"]["evidence"],
    },
    reconciliation: {
      tapeToAccounting: {tape: money(total), accounting: money(accounting), difference: money(tapeDifference), differenceShare: ratio(tapeDifferenceShare), status: tapeDifferenceShare.lte(input.policy.maximumAccountingMismatchShare) ? "tied" : "outside_tolerance"},
      tapeCollectionsToAccounting: {tape: money(tapeCollections), reported: money(reportedCollections), difference: money(tapeCollectionsDifference), differenceShare: ratio(tapeCollectionsDifferenceShare), status: tapeCollectionsDifferenceShare.lte(input.policy.maximumCashMismatchShare) ? "tied" : "outside_tolerance"},
      collectionsToCash: {reported: money(reportedCollections), cash: money(cash), difference: money(cashDifference), differenceShare: ratio(cashDifferenceShare), status: cashDifferenceShare.lte(input.policy.maximumCashMismatchShare) ? "tied" : "outside_tolerance"},
      cashControls: {
        mappedShare: ratio(mappedShare), linkedAccountShare: ratio(linkedShare),
        duplicateReceiptIds: input.cashReceipts.filter((item) => item.duplicateOf !== null).map((item) => item.id),
        unanchoredReceiptIds: input.cashReceipts.filter((item) => !item.anchorVerified).map((item) => item.id),
        unknownMappingReceiptIds,
      },
    },
    structure: {
      requestedFacility: money(requested), maximumByAdvanceRate: money(maximumByAdvance), maximumByOvercollateralization: money(maximumByOc), supportedFacility: money(supportedFacility),
      overcollateralizationAtRequest: ratio(overcollateralization), requiredOvercollateralization: d(input.structure.requiredOvercollateralization).toFixed(8),
      actualSubordinationRate: ratio(actualSubordination), requiredSubordinationRate: ratio(d(input.structure.requiredSubordinationRate)), reserveTarget: money(reserveTarget),
      waterfall: waterfall.allocations, residualCash: money(waterfall.residualCash),
    },
    triggers,
    gaps,
    decision: {status, blockingCodes, remediationCodes, refusalCodes, externalDirectionAllowed: false},
  };
}

export function toReceivablesCaseFromSimpleTape(input: {
  id: string;
  referenceDate: string;
  cedentName: string;
  tape: Array<{receivableId: string; debtorId: string; balance: string; daysPastDue: number}>;
}): ReceivablesCase {
  const reference = utc(input.referenceDate);
  const portfolio = input.tape.map((item, index): Receivable => {
    const due = new Date(reference - item.daysPastDue * DAY);
    if (item.daysPastDue === 0) due.setUTCDate(due.getUTCDate() + 60 + (index % 60));
    const origin = new Date(reference - (450 + (index % 90)) * DAY);
    return {
      id: item.receivableId,
      debtorId: item.debtorId,
      debtorGroupId: item.debtorId,
      debtorSector: "services",
      originDate: origin.toISOString().slice(0, 10),
      dueDate: due.toISOString().slice(0, 10),
      originalAmount: item.balance,
      outstandingBalance: item.balance,
      paidAmount: "0",
      collectedInPeriod: "0",
      defaultedBalance: item.daysPastDue > 90 ? item.balance : "0",
      recoveredInPeriod: item.daysPastDue > 90 ? d(item.balance).times("0.35").toFixed(2) : "0",
      dilutionInPeriod: "0",
      repurchasedInPeriod: "0",
      substitutedInPeriod: "0",
      assignable: true,
      evidenceVerified: true,
      registration: "registered",
      encumbrance: "free",
      disputed: false,
      relatedParty: false,
      sourceDocumentId: "receivables-aging.csv",
      sourceAnchor: `row:${item.receivableId}`,
      anchorVerified: true,
    };
  });
  const total = sum(portfolio.map((item) => item.outstandingBalance));
  return receivablesCaseSchema.parse({
    schemaVersion: "2026.08.24-v1",
    id: input.id,
    referenceDate: input.referenceDate,
    cedent: {id: "cedent-1", legalName: input.cedentName, servicingRole: "cedent"},
    portfolio,
    cashReceipts: [],
    accounting: {grossReceivablesBalance: total.toFixed(2), allowanceBalance: "0", reportedCollectionsInPeriod: "0"},
    policy: defaultReceivablesPolicy,
    structure: {
      requestedFacility: total.times("0.55").toFixed(2), advanceRate: "0.75", requiredOvercollateralization: "1.25", requiredSubordinationRate: "0.15",
      actualSeniorAmount: total.times("0.50").toFixed(2), actualMezzanineAmount: "0", actualSubordinatedAmount: total.times("0.12").toFixed(2), reserveRate: "0.03",
      waterfall: {availableCash: "0", servicingFeeDue: "0", seniorInterestDue: "0", seniorPrincipalDue: "0", reserveOpening: total.times("0.015").toFixed(2), mezzanineDue: "0"},
    },
  });
}

export const defaultReceivablesPolicy = {
  maxDaysPastDue: 90,
  maxRemainingTermDays: 365,
  minSeasoningDays: 30,
  requireAssignable: true,
  requireEvidenceVerified: true,
  registrationRule: "required_when_applicable",
  excludeDisputed: true,
  excludeRelatedParties: true,
  excludeEncumbered: true,
  allowedDebtorSectors: [],
  maxSingleDebtorShare: "0.20",
  maxDebtorGroupShare: "0.25",
  minimumEligibleShare: "0.60",
  minimumEvidenceCoverage: "0.90",
  minimumRegistrationCoverage: "0.90",
  maximumDelinquency30Share: "0.15",
  maximumDilutionShare: "0.05",
  maximumRepurchaseShare: "0.08",
  minimumRecoveryRate: "0.25",
  maximumAccountingMismatchShare: "0.01",
  maximumCashMismatchShare: "0.01",
  minimumMappedCashShare: "0.95",
  minimumLinkedAccountCashShare: "0.95",
} as const;
