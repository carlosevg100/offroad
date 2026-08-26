import Decimal from "decimal.js";

import type {IndicativePrice, PriceAdjustment, PricedInstrument, RatingBand, SpreadBand} from "./index";

export const pricingTruthVersion = "2026.08.25-v1";

type Status = "completed" | "partial" | "blocked" | "not_computable" | "not_applicable";

export type PricingObservation = {
  id: string;
  sourceId: string;
  sourceOwner: string;
  sourceKind: "public_closing" | "direct_manager_confirmation" | "term_sheet" | "indication" | "sounding" | "authorized_historical";
  confidentiality: "public" | "aggregated_confidential" | "restricted_internal";
  observedOn: string;
  validUntil: string;
  status: "closed" | "term" | "indication" | "sounding";
  instrument: PricedInstrument;
  rating: RatingBand;
  normalizedSpreadBps: number;
  normalizationMethod: string;
  tenorMonths: number;
  securityClass: string;
  amortizationClass: string;
  sectorGroup: string;
  amount: string;
  regime: string;
  quality: number;
  aggregateAuthorized: boolean;
  economics?: {
    quotedSpreadBps: number;
    feeBps: number;
    oidBps: number;
    warrantBps: number;
    hedgeBps: number;
  };
};

export type GovernedPriceAdjustment = PriceAdjustment & {
  sourceId: string;
  observedOn: string;
  validUntil: string;
};

export type PricingCostComponent = {
  id: string;
  label: string;
  sourceId: string;
  validUntil: string;
  oneTimeAmount?: string;
  annualAmount?: string;
};

export type PricingPolicy = {
  version: string;
  asOf: string;
  regime: string;
  status: "active" | "invalidated";
  minObservations: number;
  minDistinctSources: number;
  minQuality: number;
  maxTenorDeltaMonths: number;
  minAmountRatio: string;
  maxAmountRatio: string;
  minBandWidthBps: number;
  maxBandWidthBps: number;
};

export type PricingTarget = {
  instrument: PricedInstrument;
  rating: RatingBand;
  cdi: string;
  tenorMonths: number;
  securityClass: string;
  amortizationClass: string;
  sectorGroup: string;
  amount: string;
  indexer: "cdi" | "ipca" | "fixed" | "other";
  indexerRationale?: string;
  targetBuyer?: string;
  expectedSpreadBps?: number;
  currentAllIn?: string;
};

export type PricingProcedureResult = {
  procedureId: `PR-${string}`;
  status: Status;
  result: Record<string, unknown> | null;
  outputCount: number;
  evidenceCount: number;
  missingInputs: string[];
  exceptionIds: string[];
};

export type PricingTruthSet = {
  version: string;
  policyVersion: string;
  status: "complete" | "partial" | "blocked";
  decision: "reference_available" | "abstain";
  indicativePrice: IndicativePrice | null;
  sample: {
    eligible: PricingObservation[];
    rejected: Array<{id: string; reasons: string[]}>;
    distinctSources: number;
    latestObservation: string | null;
  };
  allIn: {
    annualizedCostBps: number | null;
    totalRate: {min: string; max: string} | null;
    components: Array<PricingCostComponent & {annualizedBps: number | null}>;
  };
  exceptions: Array<{id: string; severity: "medium" | "high" | "critical"; message: string; affectedProcedures: `PR-${string}`[]}>
  missingInputs: string[];
  procedureCoverage: PricingProcedureResult[];
};

const isoValid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`));
const median = (values: number[]) => {
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle]! : (ordered[middle - 1]! + ordered[middle]!) / 2;
};
const moneyRatio = (observation: string, target: string) => new Decimal(observation).div(target);
const fmt = (value: number, locale: "pt" | "en") => `${value >= 0 ? "+" : "-"} ${Math.abs(value / 100).toLocaleString(locale === "pt" ? "pt-BR" : "en-US", {maximumFractionDigits: 2})}%`;

export function buildPricingTruthSet(input: {
  target: PricingTarget | null;
  policy?: PricingPolicy;
  observations?: readonly PricingObservation[];
  adjustments?: readonly GovernedPriceAdjustment[];
  costs?: readonly PricingCostComponent[];
  weightedAverageLifeYears?: string;
}): PricingTruthSet {
  const policy = input.policy;
  const target = input.target;
  const observations = [...(input.observations ?? [])];
  const missing = new Set<string>();
  const exceptions: PricingTruthSet["exceptions"] = [];
  const rejected: PricingTruthSet["sample"]["rejected"] = [];

  if (!target) missing.add("pricing.target");
  if (!policy) missing.add("pricing.policy");
  if (!observations.length) missing.add("pricing.observations");
  if (target && target.indexer !== "cdi") {
    missing.add("pricing.supported_indexer_curve");
    exceptions.push({
      id: "unsupported-indexer-curve",
      severity: "critical",
      message: "The governed pricing engine does not yet have a validated all-in curve for this indexer.",
      affectedProcedures: ["PR-01", "PR-06", "PR-07", "PR-09", "PR-10", "PR-11"],
    });
  }
  if (policy?.status === "invalidated") exceptions.push({id: "pricing-regime-invalidated", severity: "critical", message: "The active pricing regime was invalidated and must be rebuilt before a new reference is published.", affectedProcedures: ["PR-01", "PR-02", "PR-07", "PR-09", "PR-12"]});

  const eligible = target && policy ? observations.filter((observation) => {
    const reasons: string[] = [];
    if (!isoValid(observation.observedOn) || !isoValid(observation.validUntil)) reasons.push("invalid_date");
    else if (observation.validUntil < policy.asOf) reasons.push("expired");
    if (!observation.aggregateAuthorized) reasons.push("aggregate_not_authorized");
    if (!observation.sourceOwner) reasons.push("missing_owner");
    if (observation.confidentiality === "restricted_internal") reasons.push("restricted_from_aggregate");
    if (observation.quality < policy.minQuality) reasons.push("quality_below_policy");
    if (observation.regime !== policy.regime) reasons.push("different_regime");
    if (observation.instrument !== target.instrument) reasons.push("different_instrument");
    if (observation.rating !== target.rating) reasons.push("different_risk_band");
    if (observation.securityClass !== target.securityClass) reasons.push("different_security");
    if (observation.amortizationClass !== target.amortizationClass) reasons.push("different_amortization");
    if (observation.sectorGroup !== target.sectorGroup) reasons.push("different_sector");
    if (Math.abs(observation.tenorMonths - target.tenorMonths) > policy.maxTenorDeltaMonths) reasons.push("tenor_outside_window");
    if (new Decimal(target.amount).lte(0) || new Decimal(observation.amount).lte(0)) reasons.push("invalid_amount");
    else {
      const ratio = moneyRatio(observation.amount, target.amount);
      if (ratio.lt(policy.minAmountRatio) || ratio.gt(policy.maxAmountRatio)) reasons.push("amount_outside_window");
    }
    if (!observation.sourceId || !observation.normalizationMethod) reasons.push("missing_lineage");
    if (observation.economics) {
      const normalized = observation.economics.quotedSpreadBps
        + observation.economics.feeBps
        + observation.economics.oidBps
        + observation.economics.warrantBps
        + observation.economics.hedgeBps;
      if (Math.abs(normalized - observation.normalizedSpreadBps) > 0.01) reasons.push("normalization_identity_failed");
    }
    if (reasons.length) rejected.push({id: observation.id, reasons});
    return reasons.length === 0;
  }) : [];

  const distinctSources = new Set(eligible.map((observation) => observation.sourceId)).size;
  const sampleSufficient = Boolean(policy?.status === "active" && eligible.length >= policy.minObservations && distinctSources >= policy.minDistinctSources);
  if (policy && eligible.length < policy.minObservations) exceptions.push({id: "insufficient-observations", severity: "critical", message: "Comparable observations do not reach the governed minimum sample.", affectedProcedures: ["PR-01", "PR-02", "PR-07", "PR-09"]});
  if (policy && distinctSources < policy.minDistinctSources) exceptions.push({id: "insufficient-independent-sources", severity: "critical", message: "The sample does not reach the governed minimum number of distinct sources.", affectedProcedures: ["PR-02", "PR-07", "PR-13"]});

  const validAdjustments = (input.adjustments ?? []).filter((adjustment) => policy && adjustment.validUntil >= policy.asOf && Boolean(adjustment.sourceId));
  const rejectedAdjustments = (input.adjustments ?? []).filter((adjustment) => !policy || adjustment.validUntil < policy.asOf || !adjustment.sourceId);
  if (rejectedAdjustments.length) exceptions.push({id: "expired-or-untraced-adjustment", severity: "high", message: "At least one proposed pricing adjustment is expired or lacks a source.", affectedProcedures: ["PR-03", "PR-04", "PR-05", "PR-08"]});

  let indicativePrice: IndicativePrice | null = null;
  if (target && policy && sampleSufficient) {
    const spreads = eligible.map((observation) => observation.normalizedSpreadBps);
    const shift = validAdjustments.reduce((sum, adjustment) => sum + adjustment.bps, 0);
    const baseMin = Math.min(...spreads);
    const baseMax = Math.max(...spreads);
    const width = baseMax - baseMin;
    if (width < policy.minBandWidthBps) exceptions.push({id: "band-too-narrow", severity: "critical", message: "The observed band is narrower than the governed communication floor.", affectedProcedures: ["PR-01", "PR-07", "PR-09"]});
    if (width > policy.maxBandWidthBps) exceptions.push({id: "band-too-wide", severity: "critical", message: "The observed dispersion is wider than the governed communication ceiling.", affectedProcedures: ["PR-01", "PR-02", "PR-07", "PR-09"]});
    if (!exceptions.some((exception) => exception.severity === "critical")) {
      const bps = {min: baseMin + shift, max: baseMax + shift};
      const cdi = new Decimal(target.cdi);
      const base: SpreadBand = {instrument: target.instrument, rating: target.rating, bps: {min: baseMin, max: baseMax}};
      const latest = [...eligible].sort((a, b) => b.observedOn.localeCompare(a.observedOn))[0]!.observedOn;
      const allIn = {min: cdi.plus(new Decimal(bps.min).div(10_000)).toFixed(6), max: cdi.plus(new Decimal(bps.max).div(10_000)).toFixed(6), cdi: cdi.toFixed(6)};
      indicativePrice = {
        instrument: target.instrument,
        rating: target.rating,
        bps,
        allIn,
        base,
        adjustments: validAdjustments.map(({id, bps: adjustmentBps, rationale}) => ({id, bps: adjustmentBps, rationale})),
        provenance: {kind: "observed", sample: eligible.length, windowMonths: Math.max(1, Math.ceil((Date.parse(`${policy.asOf}T00:00:00Z`) - Date.parse(`${eligible.sort((a, b) => a.observedOn.localeCompare(b.observedOn))[0]!.observedOn}T00:00:00Z`)) / 2_629_746_000))},
        sentence: {
          pt: `Referência indicativa de CDI ${fmt(bps.min, "pt")} a CDI ${fmt(bps.max, "pt")} ao ano, baseada em ${eligible.length} observações comparáveis de ${distinctSources} fontes, com dado mais recente em ${latest}. Sujeita à análise e à decisão dos investidores.`,
          en: `Indicative reference of CDI ${fmt(bps.min, "en")} to CDI ${fmt(bps.max, "en")} per year, based on ${eligible.length} comparable observations from ${distinctSources} sources, with the latest data from ${latest}. Subject to investor analysis and decision.`,
        },
      };
    }
  }

  const costComponents = (input.costs ?? []).map((component) => {
    if (!target || !policy || component.validUntil < policy.asOf || !input.weightedAverageLifeYears || new Decimal(input.weightedAverageLifeYears).lte(0)) return {...component, annualizedBps: null};
    const annual = new Decimal(component.annualAmount ?? 0).plus(new Decimal(component.oneTimeAmount ?? 0).div(input.weightedAverageLifeYears));
    return {...component, annualizedBps: Number(annual.div(target.amount).times(10_000).toDecimalPlaces(2).toFixed())};
  });
  const annualizedCostBps = costComponents.length && costComponents.every((component) => component.annualizedBps !== null)
    ? Number(costComponents.reduce((sum, component) => sum.plus(component.annualizedBps!), new Decimal(0)).toFixed(2))
    : null;
  if ((input.costs?.length ?? 0) > 0 && annualizedCostBps === null) missing.add("pricing.weighted_average_life_and_valid_cost_sources");
  const totalRate = indicativePrice && annualizedCostBps !== null
    ? {
        min: new Decimal(indicativePrice.allIn.min).plus(new Decimal(annualizedCostBps).div(10_000)).toFixed(6),
        max: new Decimal(indicativePrice.allIn.max).plus(new Decimal(annualizedCostBps).div(10_000)).toFixed(6),
      }
    : null;

  const result = (procedureId: `PR-${string}`, status: Status, value: Record<string, unknown> | null, procedureMissing: string[] = [], procedureExceptions: string[] = [], evidenceCount = 0): PricingProcedureResult => ({
    procedureId, status, result: value, outputCount: value ? Object.keys(value).length : 0, evidenceCount, missingInputs: procedureMissing, exceptionIds: procedureExceptions,
  });
  const exceptionIds = (id: `PR-${string}`) => exceptions.filter((exception) => exception.affectedProcedures.includes(id)).map((exception) => exception.id);
  const latestObservation = eligible.length ? [...eligible].sort((a, b) => b.observedOn.localeCompare(a.observedOn))[0]!.observedOn : null;
  const expectedGap = target?.expectedSpreadBps !== undefined && indicativePrice ? {
    expectation: target.expectedSpreadBps,
    supportedMin: indicativePrice.bps.min,
    supportedMax: indicativePrice.bps.max,
    gapToNearest: target.expectedSpreadBps < indicativePrice.bps.min ? indicativePrice.bps.min - target.expectedSpreadBps : target.expectedSpreadBps > indicativePrice.bps.max ? target.expectedSpreadBps - indicativePrice.bps.max : 0,
  } : null;
  const currentComparison = target?.currentAllIn && indicativePrice ? {
    current: target.currentAllIn,
    proposedMin: indicativePrice.allIn.min,
    proposedMax: indicativePrice.allIn.max,
    deltaMin: new Decimal(indicativePrice.allIn.min).minus(target.currentAllIn).toFixed(6),
    deltaMax: new Decimal(indicativePrice.allIn.max).minus(target.currentAllIn).toFixed(6),
  } : null;

  const coverage: PricingProcedureResult[] = [
    result("PR-01", indicativePrice ? "completed" : "blocked", indicativePrice ? {cell: `${target!.instrument}:${target!.rating}:${target!.tenorMonths}:${target!.securityClass}`, band: indicativePrice.bps, sample: eligible.length, latestObservation} : null, indicativePrice ? [] : ["reliable pricing cell"], exceptionIds("PR-01"), eligible.length),
    result("PR-02", sampleSufficient ? "completed" : observations.length ? "blocked" : "not_computable", observations.length ? {eligible, rejected, medianBps: eligible.length ? median(eligible.map((entry) => entry.normalizedSpreadBps)) : null} : null, observations.length ? sampleSufficient ? [] : ["comparable sample"] : ["pricing observations"], exceptionIds("PR-02"), eligible.length),
    result("PR-03", validAdjustments.some((entry) => entry.id === "security") ? "completed" : "not_applicable", validAdjustments.some((entry) => entry.id === "security") ? {adjustments: validAdjustments.filter((entry) => entry.id === "security")} : null, [], exceptionIds("PR-03"), validAdjustments.filter((entry) => entry.id === "security").length),
    result("PR-04", validAdjustments.some((entry) => entry.id === "tenor") ? "completed" : eligible.length ? "partial" : "not_computable", eligible.length ? {targetMonths: target?.tenorMonths, observedMonths: eligible.map((entry) => entry.tenorMonths), adjustment: validAdjustments.find((entry) => entry.id === "tenor") ?? null} : null, validAdjustments.some((entry) => entry.id === "tenor") ? [] : ["observed tenor curve"], exceptionIds("PR-04"), eligible.length),
    result("PR-05", validAdjustments.some((entry) => entry.id === "size") ? "completed" : eligible.length ? "partial" : "not_computable", eligible.length ? {targetAmount: target?.amount, observedAmounts: eligible.map((entry) => entry.amount), adjustment: validAdjustments.find((entry) => entry.id === "size") ?? null} : null, validAdjustments.some((entry) => entry.id === "size") ? [] : ["observed size and liquidity adjustment"], exceptionIds("PR-05"), eligible.length),
    result("PR-06", target?.indexerRationale && target.targetBuyer ? "completed" : target ? "partial" : "not_computable", target ? {indexer: target.indexer, rationale: target.indexerRationale ?? null, targetBuyer: target.targetBuyer ?? null} : null, target ? [!target.indexerRationale ? "indexer rationale" : "", !target.targetBuyer ? "target buyer" : ""].filter(Boolean) : ["pricing target"], exceptionIds("PR-06"), 0),
    result("PR-07", indicativePrice ? "completed" : "blocked", policy ? {policyVersion: policy.version, regime: policy.regime, sample: eligible.length, sources: distinctSources, latestObservation} : null, policy ? indicativePrice ? [] : ["valid house-grid cell"] : ["pricing policy"], exceptionIds("PR-07"), eligible.length),
    result("PR-08", expectedGap ? expectedGap.gapToNearest === 0 ? "not_applicable" : "completed" : "not_computable", expectedGap, expectedGap ? [] : ["borrower cost expectation and supported band"], exceptionIds("PR-08"), 0),
    result("PR-09", indicativePrice ? "completed" : "blocked", indicativePrice ? {sentence: indicativePrice.sentence, widthBps: indicativePrice.bps.max - indicativePrice.bps.min} : null, indicativePrice ? [] : ["supported pricing band"], exceptionIds("PR-09"), eligible.length),
    result("PR-10", annualizedCostBps !== null && indicativePrice ? "completed" : input.costs?.length ? "partial" : "not_computable", input.costs?.length ? {components: costComponents, annualizedCostBps, spread: indicativePrice?.bps ?? null} : null, annualizedCostBps !== null ? [] : ["valid costs and weighted average life"], exceptionIds("PR-10"), input.costs?.length ?? 0),
    result("PR-11", currentComparison ? "completed" : "not_computable", currentComparison, currentComparison ? [] : ["current all-in cost and supported band"], exceptionIds("PR-11"), 0),
    result("PR-12", policy ? rejected.some((entry) => entry.reasons.includes("expired")) ? "completed" : observations.length ? "completed" : "not_computable" : "not_computable", policy ? {asOf: policy.asOf, active: eligible.length, expired: rejected.filter((entry) => entry.reasons.includes("expired")).map((entry) => entry.id)} : null, policy ? [] : ["pricing policy"], exceptionIds("PR-12"), observations.length),
    result("PR-13", observations.length ? observations.every((entry) => entry.sourceId && entry.sourceOwner && isoValid(entry.observedOn) && isoValid(entry.validUntil)) ? "completed" : "partial" : "not_computable", observations.length ? {observations: observations.map((entry) => ({id: entry.id, sourceKind: entry.sourceKind, sourceOwner: entry.sourceOwner, confidentiality: entry.confidentiality, status: entry.status, quality: entry.quality, validUntil: entry.validUntil, aggregateAuthorized: entry.aggregateAuthorized}))} : null, observations.length ? [] : ["authorized pricing observations"], exceptionIds("PR-13"), observations.length),
  ];
  if (coverage.length !== 13) throw new Error(`pricing procedure coverage expected 13, received ${coverage.length}`);
  const critical = exceptions.some((exception) => exception.severity === "critical");
  return {
    version: pricingTruthVersion,
    policyVersion: policy?.version ?? "required_missing",
    status: critical || !indicativePrice ? "blocked" : coverage.every((item) => item.status === "completed" || item.status === "not_applicable") ? "complete" : "partial",
    decision: indicativePrice ? "reference_available" : "abstain",
    indicativePrice,
    sample: {eligible, rejected, distinctSources, latestObservation},
    allIn: {annualizedCostBps, totalRate, components: costComponents},
    exceptions,
    missingInputs: [...missing].sort(),
    procedureCoverage: coverage,
  };
}
