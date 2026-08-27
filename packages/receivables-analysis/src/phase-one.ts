import {
  calculateAdjustedDebtBridge,
  calculateDynamicReceivablesMetrics,
  calculateImplicitAdvanceRate,
  calculateSingleMaturityReceivablesProposal,
  calculateStaticReceivablesMetrics,
  type AdjustedDebtBridge,
  type AdjustedDebtBridgeInput,
  type DynamicReceivablesMetrics,
  type GovernedRateAssumption,
  type ImplicitAdvanceRate,
  type IsoDate,
  type ReceivablesUniverse,
  type SingleMaturityReceivablesProposal,
  type SingleMaturityReceivablesProposalInput,
  type StaticReceivablesMetrics,
} from "@offroad/financial-core";

export const receivablesPhaseOneReportVersion = "2026.08.27-v1";

type CanonicalContextFields = "reportingDate" | "universeId" | "datasetHash" | "currency";

export type ReceivablesPhaseOneProposalInput = {
  id: string;
  proposal: Omit<SingleMaturityReceivablesProposalInput, CanonicalContextFields>;
};

export type ReceivablesPhaseOneAdvanceRateInput = {
  periodStart: IsoDate;
  expectedDilution?: GovernedRateAssumption;
  expectedLossRate?: GovernedRateAssumption;
  dilutionStressMultiplier?: GovernedRateAssumption;
  lossStressMultiplier?: GovernedRateAssumption;
  operationalReserve?: GovernedRateAssumption;
  additionalReserves?: readonly GovernedRateAssumption[];
};

export type ReceivablesPhaseOneInput = {
  universe: ReceivablesUniverse;
  datasetHash: string;
  limitations?: readonly string[];
  adjustedDebt?: Omit<AdjustedDebtBridgeInput, CanonicalContextFields>;
  proposals?: readonly ReceivablesPhaseOneProposalInput[];
  advanceRate?: ReceivablesPhaseOneAdvanceRateInput;
};

export type ReceivablesPhaseOneProposalResult = {
  id: string;
  result: SingleMaturityReceivablesProposal;
};

export type ReceivablesPhaseOneReport = {
  version: typeof receivablesPhaseOneReportVersion;
  analysisLayer: "deterministic_math_and_provenance";
  universe: {
    id: string;
    datasetHash: string;
    currency: string;
    reportingDate: IsoDate;
    latestOriginationDate: IsoDate;
    dataStartDate: IsoDate;
    dataEndDate: IsoDate;
  };
  staticMetrics: StaticReceivablesMetrics;
  dynamicMetrics: DynamicReceivablesMetrics;
  adjustedDebt: AdjustedDebtBridge | null;
  proposals: readonly ReceivablesPhaseOneProposalResult[];
  implicitAdvanceRate: ImplicitAdvanceRate | null;
  quality: {
    status: "complete_for_phase_one" | "incomplete";
    blockers: readonly string[];
    warnings: readonly string[];
    limitations: readonly string[];
  };
  boundaries: {
    externalDirectionAllowed: false;
    buyerRecommendationAllowed: false;
    qualifiedIntroductionAllowed: false;
    creditApprovalExpressed: false;
  };
};

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))].sort();
}

export function analyzeReceivablesPhaseOne(input: ReceivablesPhaseOneInput): ReceivablesPhaseOneReport {
  const {universe, datasetHash} = input;
  const staticMetrics = calculateStaticReceivablesMetrics(universe, {datasetHash});
  const dynamicMetrics = calculateDynamicReceivablesMetrics(universe, {datasetHash});
  const adjustedDebt = input.adjustedDebt === undefined
    ? null
    : calculateAdjustedDebtBridge({
      ...input.adjustedDebt,
      reportingDate: universe.dates.reportingDate,
      universeId: universe.id,
      datasetHash,
      currency: universe.currency,
    });

  const proposalIds = new Set<string>();
  const proposals = (input.proposals ?? []).map(({id, proposal}) => {
    if (proposalIds.has(id)) throw new RangeError(`duplicate proposal id: ${id}`);
    proposalIds.add(id);
    return {
      id,
      result: calculateSingleMaturityReceivablesProposal({
        ...proposal,
        reportingDate: universe.dates.reportingDate,
        universeId: universe.id,
        datasetHash,
        currency: universe.currency,
      }),
    };
  });

  const advanceInput = input.advanceRate;
  const implicitAdvanceRate = advanceInput === undefined
    ? null
    : calculateImplicitAdvanceRate({
      reportingDate: universe.dates.reportingDate,
      periodStart: advanceInput.periodStart,
      universeId: universe.id,
      ...(advanceInput.expectedDilution === undefined ? {} : {expectedDilution: advanceInput.expectedDilution}),
      ...(advanceInput.expectedLossRate === undefined ? {} : {expectedLossRate: advanceInput.expectedLossRate}),
      ...(advanceInput.dilutionStressMultiplier === undefined ? {} : {dilutionStressMultiplier: advanceInput.dilutionStressMultiplier}),
      ...(advanceInput.lossStressMultiplier === undefined ? {} : {lossStressMultiplier: advanceInput.lossStressMultiplier}),
      ...(advanceInput.operationalReserve === undefined ? {} : {operationalReserve: advanceInput.operationalReserve}),
      ...(advanceInput.additionalReserves === undefined ? {} : {additionalReserves: advanceInput.additionalReserves}),
    });

  const blockers: string[] = [];
  for (const [event, coverage] of Object.entries(universe.eventCoverage)) {
    if (coverage.status !== "complete") blockers.push(`coverage:${event}:${coverage.status}`);
  }
  if (dynamicMetrics.rollRates.status !== "measured") blockers.push("metric:roll_rates:not_evaluable");
  if (dynamicMetrics.vintages.status !== "measured") blockers.push("metric:vintages:not_evaluable");
  const requiredDynamicMetrics = [
    dynamicMetrics.dilution.shareOfOrigination,
    dynamicMetrics.repurchaseAndLoss.repurchaseShareOfAssigned,
    dynamicMetrics.repurchaseAndLoss.finalWrittenOffShare,
    dynamicMetrics.repurchaseAndLoss.adjustedLossShare,
    dynamicMetrics.punctualSettlement.punctualByCount,
    dynamicMetrics.punctualSettlement.punctualByValue,
    dynamicMetrics.extensions.extendedTitleShare,
    dynamicMetrics.extensions.extendedFaceShare,
    dynamicMetrics.extensions.weightedExtensionDays,
  ];
  for (const metric of requiredDynamicMetrics) {
    if (metric.status !== "measured") blockers.push(`metric:${metric.id}:not_evaluable`);
  }
  if (adjustedDebt === null) blockers.push("adjusted_debt_bridge_not_provided");
  if (proposals.length === 0) blockers.push("financing_proposal_not_provided");
  for (const proposal of proposals) {
    if (proposal.result.cet.status !== "calculated_complete") blockers.push(`proposal:${proposal.id}:complete_cet_not_available`);
  }
  if (implicitAdvanceRate === null) blockers.push("advance_rate_scenario_not_provided");
  else if (implicitAdvanceRate.status !== "calculated") blockers.push("advance_rate_not_evaluable");

  const warnings = unique([
    ...staticMetrics.quality.warnings,
    ...dynamicMetrics.quality.warnings,
    ...(adjustedDebt?.quality.warnings ?? []),
    ...proposals.flatMap((proposal) => proposal.result.cet.quality.warnings.map((warning) => `proposal:${proposal.id}:${warning}`)),
    ...(implicitAdvanceRate?.quality.warnings ?? []),
  ]);
  const coverageLimitations = Object.entries(universe.eventCoverage).flatMap(([event, coverage]) => [
    ...(coverage.status === "complete" ? [] : [`${event}_coverage_${coverage.status}`]),
    ...coverage.limitations.map((limitation) => `${event}:${limitation}`),
  ]);
  const limitations = unique([...(input.limitations ?? []), ...coverageLimitations]);

  return {
    version: receivablesPhaseOneReportVersion,
    analysisLayer: "deterministic_math_and_provenance",
    universe: {
      id: universe.id,
      datasetHash,
      currency: universe.currency,
      reportingDate: universe.dates.reportingDate,
      latestOriginationDate: universe.dates.latestOriginationDate,
      dataStartDate: universe.dates.dataStartDate,
      dataEndDate: universe.dates.dataEndDate,
    },
    staticMetrics,
    dynamicMetrics,
    adjustedDebt,
    proposals,
    implicitAdvanceRate,
    quality: {
      status: blockers.length === 0 ? "complete_for_phase_one" : "incomplete",
      blockers: unique(blockers),
      warnings,
      limitations,
    },
    boundaries: {
      externalDirectionAllowed: false,
      buyerRecommendationAllowed: false,
      qualifiedIntroductionAllowed: false,
      creditApprovalExpressed: false,
    },
  };
}
