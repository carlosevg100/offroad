import Decimal from "decimal.js";
import {
  calculateReceivablesEligibilityAllocation,
  calculateReceivablesProviderAllocation,
  type AssertionProvenance,
  type ReceivableEligibilityClassification,
  type ReceivablesEligibilityAllocation,
  type ReceivablesProviderAllocationEnvelope,
  type ReceivablesUniverse,
} from "@offroad/financial-core";
import {
  type ReceivablesPolicyRule,
  type ReceivablesProviderCriterionId,
  type ResolvedReceivablesMandateCriterion,
  type ResolvedReceivablesProviderMandate,
} from "@offroad/fund-mandate";

import type {ReceivablesPhaseTwoReport, ReceivablesRouteEligibilityStatus} from "./phase-two";

export const receivablesPhaseTwoBReportVersion = "2026.08.27-v1";

export type ReceivablesProviderMetric = {
  value: string;
  provenance: AssertionProvenance;
};

export type ReceivablesProviderMetricSet = {
  currency: string;
  requestedAmount: ReceivablesProviderMetric;
  weightedAverageTermDays?: ReceivablesProviderMetric;
  historyMonths?: ReceivablesProviderMetric;
  pastDueOver30Ratio?: ReceivablesProviderMetric;
  pastDueOver90Ratio?: ReceivablesProviderMetric;
  dilutionRatio?: ReceivablesProviderMetric;
  adjustedLossRatio?: ReceivablesProviderMetric;
  singleObligorRatio?: ReceivablesProviderMetric;
  topTenObligorRatio?: ReceivablesProviderMetric;
};

export type ReceivablesProviderCriterionResult = {
  criterionId: ReceivablesProviderCriterionId;
  status: "pass" | "fail" | "condition" | "not_evaluated";
  hard: boolean;
  reason: string;
  caseProvenance?: AssertionProvenance;
  mandateSourceId?: string;
};

export type ReceivablesProviderFitStatus =
  | "live_appetite_confirmed"
  | "policy_fit_confirmed"
  | "conditionally_eligible"
  | "not_evaluated"
  | "ineligible";

export type ReceivablesProviderFitResult = {
  mandateId: string;
  providerId: string;
  providerLegalName: string;
  providerKind: ResolvedReceivablesProviderMandate["providerKind"];
  programId: string;
  programName: string;
  mandateVersion: number;
  status: ReceivablesProviderFitStatus;
  compatibleRouteIds: readonly string[];
  routeStatuses: readonly {routeId: string; status: ReceivablesRouteEligibilityStatus}[];
  criterionResults: readonly ReceivablesProviderCriterionResult[];
  portfolioAllocation: ReceivablesEligibilityAllocation | null;
  allocationEnvelope: ReceivablesProviderAllocationEnvelope | null;
  marketConfirmation: {
    liveAppetite: {current: boolean; confirmed: boolean; sourceId: string} | null;
    availableCapacity: {current: boolean; confirmed: boolean; sourceId: string} | null;
  };
  blockers: readonly string[];
  conditions: readonly string[];
};

export type ReceivablesPhaseTwoBInput = {
  phaseTwoA: ReceivablesPhaseTwoReport;
  universe: ReceivablesUniverse;
  asOf: string;
  metrics: ReceivablesProviderMetricSet;
  mandates: readonly ResolvedReceivablesProviderMandate[];
  titleClassificationsByProgram?: Readonly<Record<string, readonly ReceivableEligibilityClassification[] | undefined>>;
};

export type ReceivablesPhaseTwoBReport = {
  version: typeof receivablesPhaseTwoBReportVersion;
  analysisLayer: "deterministic_provider_mandate_fit";
  asOf: string;
  universe: ReceivablesPhaseTwoReport["universe"];
  providers: readonly ReceivablesProviderFitResult[];
  summary: {
    screened: number;
    liveAppetiteConfirmed: number;
    policyFitConfirmed: number;
    conditional: number;
    notEvaluated: number;
    ineligible: number;
  };
  quality: {status: "complete_for_internal_shortlist" | "incomplete"; blockers: readonly string[]; warnings: readonly string[]};
  boundaries: {
    buyerMandateMatched: boolean;
    internalShortlistAllowed: boolean;
    companyFacingRecommendationAllowed: false;
    externalDirectionAllowed: false;
    qualifiedIntroductionAllowed: false;
    creditApprovalExpressed: false;
  };
};

type NumericRule = ResolvedReceivablesMandateCriterion<ReceivablesPolicyRule<string>> | null;

function decimal(value: string, label: string): Decimal {
  const parsed = new Decimal(value);
  if (!parsed.isFinite() || parsed.isNegative()) throw new RangeError(`${label} must be a non-negative decimal`);
  return parsed;
}

function metricUsable(metric: ReceivablesProviderMetric | undefined): metric is ReceivablesProviderMetric {
  return Boolean(metric && metric.provenance.kind !== "estimated");
}

function sourceUsable<T>(criterion: ResolvedReceivablesMandateCriterion<T> | null): criterion is ResolvedReceivablesMandateCriterion<T> {
  return Boolean(criterion?.decisionUseAllowed);
}

function result(
  criterionId: ReceivablesProviderCriterionId,
  status: ReceivablesProviderCriterionResult["status"],
  hard: boolean,
  reason: string,
  criterion?: ResolvedReceivablesMandateCriterion<unknown> | null,
  metric?: ReceivablesProviderMetric,
): ReceivablesProviderCriterionResult {
  return {
    criterionId,
    status,
    hard,
    reason,
    ...(metric ? {caseProvenance: metric.provenance} : {}),
    ...(criterion ? {mandateSourceId: criterion.accepted.sourceId} : {}),
  };
}

function evaluateMaximum(
  criterionId: ReceivablesProviderCriterionId,
  criterion: NumericRule,
  metric: ReceivablesProviderMetric | undefined,
): ReceivablesProviderCriterionResult {
  if (!sourceUsable(criterion)) return result(criterionId, "not_evaluated", true, "Política ausente, vencida ou sem fonte utilizável.", criterion);
  if (criterion.divergent) return result(criterionId, "condition", true, "As fontes do mandato divergem e exigem reconfirmação.", criterion);
  const rule = criterion.value;
  if (rule.mode === "no_restriction") return result(criterionId, "pass", true, "O programa confirmou não aplicar este limite.", criterion);
  if (rule.mode === "case_by_case") return result(criterionId, "condition", true, rule.note, criterion);
  if (!metricUsable(metric)) return result(criterionId, "not_evaluated", true, "Métrica do caso ausente ou apenas estimada.", criterion, metric);
  const passes = decimal(metric.value, criterionId).lte(decimal(rule.value, criterionId));
  return result(criterionId, passes ? "pass" : "fail", true, passes ? "Métrica dentro do máximo confirmado." : "Métrica acima do máximo confirmado.", criterion, metric);
}

function evaluateMinimum(
  criterionId: ReceivablesProviderCriterionId,
  criterion: NumericRule,
  metric: ReceivablesProviderMetric | undefined,
): ReceivablesProviderCriterionResult {
  if (!sourceUsable(criterion)) return result(criterionId, "not_evaluated", true, "Política ausente, vencida ou sem fonte utilizável.", criterion);
  if (criterion.divergent) return result(criterionId, "condition", true, "As fontes do mandato divergem e exigem reconfirmação.", criterion);
  const rule = criterion.value;
  if (rule.mode === "no_restriction") return result(criterionId, "pass", true, "O programa confirmou não aplicar este mínimo.", criterion);
  if (rule.mode === "case_by_case") return result(criterionId, "condition", true, rule.note, criterion);
  if (!metricUsable(metric)) return result(criterionId, "not_evaluated", true, "Métrica do caso ausente ou apenas estimada.", criterion, metric);
  const passes = decimal(metric.value, criterionId).gte(decimal(rule.value, criterionId));
  return result(criterionId, passes ? "pass" : "fail", true, passes ? "Métrica acima do mínimo confirmado." : "Métrica abaixo do mínimo confirmado.", criterion, metric);
}

function evaluateRange(
  criterionId: "ticket" | "weighted_average_term_days",
  criterion: ResolvedReceivablesMandateCriterion<ReceivablesPolicyRule<{min: string; max: string}>> | null,
  metric: ReceivablesProviderMetric | undefined,
): ReceivablesProviderCriterionResult {
  if (!sourceUsable(criterion)) return result(criterionId, "not_evaluated", true, "Política ausente, vencida ou sem fonte utilizável.", criterion);
  if (criterion.divergent) return result(criterionId, "condition", true, "As fontes do mandato divergem e exigem reconfirmação.", criterion);
  const rule = criterion.value;
  if (rule.mode === "no_restriction") return result(criterionId, "pass", true, "O programa confirmou não aplicar esta faixa.", criterion);
  if (rule.mode === "case_by_case") return result(criterionId, "condition", true, rule.note, criterion);
  if (!metricUsable(metric)) return result(criterionId, "not_evaluated", true, "Métrica do caso ausente ou apenas estimada.", criterion, metric);
  const value = decimal(metric.value, criterionId);
  const min = decimal(rule.value.min, criterionId);
  const max = decimal(rule.value.max, criterionId);
  if (value.lt(min)) return result(criterionId, "fail", true, "A operação está abaixo do menor ticket ou prazo confirmado.", criterion, metric);
  if (value.gt(max)) {
    return result(
      criterionId,
      criterionId === "ticket" ? "pass" : "fail",
      true,
      criterionId === "ticket"
        ? "O pedido excede o cheque individual. O programa continua compatível até seu limite e pode integrar uma estrutura com mais de um financiador."
        : "O prazo está acima do máximo confirmado.",
      criterion,
      metric,
    );
  }
  return result(criterionId, "pass", true, "Métrica dentro da faixa confirmada.", criterion, metric);
}

function evaluateProvider(
  input: ReceivablesPhaseTwoBInput,
  mandate: ResolvedReceivablesProviderMandate,
): ReceivablesProviderFitResult {
  const routeStatuses = input.phaseTwoA.routes
    .filter((route) => mandate.eligibleRoutes?.value.includes(route.routeId))
    .map((route) => ({routeId: route.routeId, status: route.status}));
  const compatibleRouteIds = routeStatuses
    .filter((route) => route.status === "technically_eligible" || route.status === "conditionally_eligible")
    .map((route) => route.routeId);
  const criteria: ReceivablesProviderCriterionResult[] = [];
  if (!sourceUsable(mandate.eligibleRoutes)) {
    criteria.push(result("eligible_routes", "not_evaluated", true, "Rotas do programa ausentes, vencidas ou sem fonte utilizável.", mandate.eligibleRoutes));
  } else if (routeStatuses.length === 0 || routeStatuses.every((route) => route.status === "ineligible")) {
    criteria.push(result("eligible_routes", "fail", true, "Nenhuma rota do programa é tecnicamente compatível com o caso.", mandate.eligibleRoutes));
  } else if (routeStatuses.every((route) => route.status === "not_evaluated")) {
    criteria.push(result("eligible_routes", "not_evaluated", true, "As rotas declaradas ainda não puderam ser avaliadas tecnicamente.", mandate.eligibleRoutes));
  } else if (routeStatuses.some((route) => route.status === "technically_eligible")) {
    criteria.push(result("eligible_routes", "pass", true, "Ao menos uma rota declarada é tecnicamente elegível.", mandate.eligibleRoutes));
  } else {
    criteria.push(result("eligible_routes", "condition", true, "A rota compatível ainda possui pendências remediáveis.", mandate.eligibleRoutes));
  }

  if (!sourceUsable(mandate.currencies)) {
    criteria.push(result("currencies", "not_evaluated", true, "Moedas do programa ausentes, vencidas ou sem fonte utilizável.", mandate.currencies));
  } else {
    criteria.push(result("currencies", mandate.currencies.value.includes(input.metrics.currency) ? "pass" : "fail", true, mandate.currencies.value.includes(input.metrics.currency) ? "Moeda aceita pelo programa." : "Moeda fora da política confirmada.", mandate.currencies));
  }
  criteria.push(evaluateRange("ticket", mandate.ticket, input.metrics.requestedAmount));
  criteria.push(evaluateRange("weighted_average_term_days", mandate.weightedAverageTermDays, input.metrics.weightedAverageTermDays));
  const historyMetric = input.metrics.historyMonths;
  if (!sourceUsable(mandate.minimumHistoryMonths)) {
    criteria.push(result("minimum_history_months", "not_evaluated", true, "Histórico mínimo ausente, vencido ou sem fonte utilizável.", mandate.minimumHistoryMonths));
  } else if (mandate.minimumHistoryMonths.value.mode === "no_restriction") {
    criteria.push(result("minimum_history_months", "pass", true, "O programa confirmou não aplicar histórico mínimo.", mandate.minimumHistoryMonths));
  } else if (mandate.minimumHistoryMonths.value.mode === "case_by_case") {
    criteria.push(result("minimum_history_months", "condition", true, mandate.minimumHistoryMonths.value.note, mandate.minimumHistoryMonths));
  } else if (!metricUsable(historyMetric)) {
    criteria.push(result("minimum_history_months", "not_evaluated", true, "Histórico do caso ausente ou apenas estimado.", mandate.minimumHistoryMonths, historyMetric));
  } else {
    criteria.push(result("minimum_history_months", decimal(historyMetric.value, "minimum_history_months").gte(mandate.minimumHistoryMonths.value.value) ? "pass" : "fail", true, "Histórico comparado ao mínimo confirmado.", mandate.minimumHistoryMonths, historyMetric));
  }
  criteria.push(evaluateMaximum("maximum_past_due_over_30_ratio", mandate.maximumPastDueOver30Ratio, input.metrics.pastDueOver30Ratio));
  criteria.push(evaluateMaximum("maximum_past_due_over_90_ratio", mandate.maximumPastDueOver90Ratio, input.metrics.pastDueOver90Ratio));
  criteria.push(evaluateMaximum("maximum_dilution_ratio", mandate.maximumDilutionRatio, input.metrics.dilutionRatio));
  criteria.push(evaluateMaximum("maximum_adjusted_loss_ratio", mandate.maximumAdjustedLossRatio, input.metrics.adjustedLossRatio));
  criteria.push(evaluateMaximum("maximum_single_obligor_ratio", mandate.maximumSingleObligorRatio, input.metrics.singleObligorRatio));
  criteria.push(evaluateMaximum("maximum_top_ten_obligor_ratio", mandate.maximumTopTenObligorRatio, input.metrics.topTenObligorRatio));

  const classifications = input.titleClassificationsByProgram?.[mandate.programId];
  const portfolioAllocation = classifications === undefined ? null : calculateReceivablesEligibilityAllocation({
    universe: input.universe,
    datasetHash: input.phaseTwoA.universe.datasetHash,
    classifications,
  });
  const eligibleMetric: ReceivablesProviderMetric | undefined = portfolioAllocation ? {
    value: portfolioAllocation.amounts.eligible,
    provenance: {
      kind: "measured",
      datasetHash: portfolioAllocation.provenance.datasetHash,
      anchors: input.universe.receivables.filter((title) => title.status === "open").map((title) => title.source),
      universe: portfolioAllocation.provenance.universeId,
      reportingDate: input.universe.dates.reportingDate,
      inclusions: portfolioAllocation.provenance.inclusions,
      exclusions: portfolioAllocation.provenance.exclusions,
      formula: {id: "receivables_provider_title_allocation", version: portfolioAllocation.version},
      numerator: "open value classified as eligible for this provider program",
      denominator: "open receivables value",
      unit: input.universe.currency,
    },
  } : undefined;
  criteria.push(evaluateMinimum("minimum_eligible_portfolio_amount", mandate.minimumEligiblePortfolioAmount, eligibleMetric));

  const policyCriteria = criteria;
  const policyFailed = policyCriteria.some((criterion) => criterion.status === "fail");
  const policyUnknown = policyCriteria.some((criterion) => criterion.status === "not_evaluated" && criterion.hard);
  const policyConditional = policyCriteria.some((criterion) => criterion.status === "condition");
  const appetiteCurrent = sourceUsable(mandate.liveAppetite) && mandate.liveAppetite.confirmed && !mandate.liveAppetite.divergent;
  const capacityCurrent = sourceUsable(mandate.availableCapacity) && mandate.availableCapacity.confirmed && !mandate.availableCapacity.divergent;
  const appetiteOpen = appetiteCurrent && mandate.liveAppetite?.value === true;
  const capacity = capacityCurrent ? mandate.availableCapacity?.value : null;
  let allocationEnvelope: ReceivablesProviderAllocationEnvelope | null = null;
  if (portfolioAllocation && capacity && mandate.ticket?.value.mode === "threshold") {
    allocationEnvelope = calculateReceivablesProviderAllocation({
      requestedAmount: input.metrics.requestedAmount.value,
      ticketMinimum: mandate.ticket.value.value.min,
      ticketMaximum: mandate.ticket.value.value.max,
      availableCapacity: capacity,
      eligiblePortfolioAmount: portfolioAllocation.amounts.eligible,
      conditionalPortfolioAmount: portfolioAllocation.amounts.conditional,
    });
  }
  const allocationDependsOnConditional = Boolean(
    allocationEnvelope
    && !allocationEnvelope.minimumTicketMet
    && allocationEnvelope.minimumTicketMetIncludingConditional,
  );
  const liveConfirmed = appetiteOpen && capacityCurrent && Boolean(allocationEnvelope?.minimumTicketMet);
  const status: ReceivablesProviderFitStatus = policyFailed
    ? "ineligible"
    : policyUnknown
      ? "not_evaluated"
      : policyConditional || allocationDependsOnConditional
        ? "conditionally_eligible"
        : liveConfirmed
          ? "live_appetite_confirmed"
          : "policy_fit_confirmed";
  const blockers = [
    ...policyCriteria.filter((criterion) => criterion.status === "fail").map((criterion) => `criterion:${criterion.criterionId}:failed`),
    ...policyCriteria.filter((criterion) => criterion.status === "not_evaluated" && criterion.hard).map((criterion) => `criterion:${criterion.criterionId}:not_evaluated`),
    ...(!appetiteCurrent ? ["live_appetite_not_current_and_confirmed"] : mandate.liveAppetite?.value === false ? ["provider_not_accepting_new_transactions"] : []),
    ...(!capacityCurrent ? ["available_capacity_not_current_and_confirmed"] : []),
    ...(allocationEnvelope && !allocationEnvelope.minimumTicketMet ? ["confirmed_allocation_below_minimum_ticket"] : []),
  ];
  const conditions = [
    ...policyCriteria.filter((criterion) => criterion.status === "condition").map((criterion) => `criterion:${criterion.criterionId}:condition`),
    ...(allocationEnvelope && !allocationEnvelope.wholeRequestCovered ? ["provider_covers_part_of_request_only"] : []),
    ...(allocationDependsOnConditional ? ["minimum_ticket_depends_on_conditional_titles"] : []),
  ];
  return {
    mandateId: mandate.mandateId,
    providerId: mandate.providerId,
    providerLegalName: mandate.providerLegalName,
    providerKind: mandate.providerKind,
    programId: mandate.programId,
    programName: mandate.programName,
    mandateVersion: mandate.version,
    status,
    compatibleRouteIds,
    routeStatuses,
    criterionResults: criteria,
    portfolioAllocation,
    allocationEnvelope,
    marketConfirmation: {
      liveAppetite: mandate.liveAppetite ? {
        current: mandate.liveAppetite.current,
        confirmed: mandate.liveAppetite.confirmed,
        sourceId: mandate.liveAppetite.accepted.sourceId,
      } : null,
      availableCapacity: mandate.availableCapacity ? {
        current: mandate.availableCapacity.current,
        confirmed: mandate.availableCapacity.confirmed,
        sourceId: mandate.availableCapacity.accepted.sourceId,
      } : null,
    },
    blockers,
    conditions,
  };
}

export function analyzeReceivablesPhaseTwoB(input: ReceivablesPhaseTwoBInput): ReceivablesPhaseTwoBReport {
  if (input.phaseTwoA.universe.id !== input.universe.id) throw new RangeError("Phase 2B universe does not match Phase 2A");
  if (input.metrics.requestedAmount.provenance.kind !== "measured") {
    throw new RangeError("Phase 2B requested amount must be measured");
  }
  if (input.phaseTwoA.universe.datasetHash !== input.metrics.requestedAmount.provenance.datasetHash) {
    throw new RangeError("Phase 2B metric dataset does not match Phase 2A");
  }
  if (input.phaseTwoA.universe.reportingDate !== input.universe.dates.reportingDate) throw new RangeError("Phase 2B reporting date does not match Phase 2A");
  const ids = new Set<string>();
  const programIds = new Set<string>();
  for (const mandate of input.mandates) {
    if (ids.has(mandate.mandateId)) throw new RangeError(`duplicate receivables mandate: ${mandate.mandateId}`);
    ids.add(mandate.mandateId);
    if (programIds.has(mandate.programId)) throw new RangeError(`duplicate active receivables program: ${mandate.programId}`);
    programIds.add(mandate.programId);
    if (mandate.asOf !== input.asOf) throw new RangeError(`mandate ${mandate.mandateId} was not resolved at the report as-of date`);
  }
  const providers = input.mandates.map((mandate) => evaluateProvider(input, mandate));
  const counts = (status: ReceivablesProviderFitStatus) => providers.filter((provider) => provider.status === status).length;
  const live = counts("live_appetite_confirmed");
  const policy = counts("policy_fit_confirmed");
  const blockers = providers.flatMap((provider) => provider.blockers.map((blocker) => `program:${provider.programId}:${blocker}`));
  const warnings = providers.flatMap((provider) => provider.conditions.map((condition) => `program:${provider.programId}:${condition}`));
  return {
    version: receivablesPhaseTwoBReportVersion,
    analysisLayer: "deterministic_provider_mandate_fit",
    asOf: input.asOf,
    universe: input.phaseTwoA.universe,
    providers,
    summary: {
      screened: providers.length,
      liveAppetiteConfirmed: live,
      policyFitConfirmed: policy,
      conditional: counts("conditionally_eligible"),
      notEvaluated: counts("not_evaluated"),
      ineligible: counts("ineligible"),
    },
    quality: {status: live > 0 ? "complete_for_internal_shortlist" : "incomplete", blockers, warnings},
    boundaries: {
      buyerMandateMatched: live + policy > 0,
      internalShortlistAllowed: live > 0,
      companyFacingRecommendationAllowed: false,
      externalDirectionAllowed: false,
      qualifiedIntroductionAllowed: false,
      creditApprovalExpressed: false,
    },
  };
}
