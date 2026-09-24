import Decimal from "decimal.js";
import {composeIndexAndSpread} from "@offroad/financial-core";

import type {IndicativePrice, PriceAdjustment, PricedInstrument, RatingBand, SpreadBand} from "./index";

export const pricingTruthVersion = "2026.09.24-v2";

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
  /**
   * Tenor window of `policy.pricing.sample-quality`: min(maxTenorDeltaMonths; max(floor; share ×
   * target tenor)). Absent fields take the proposed policy values, 6 months and 0.5.
   */
  tenorWindowFloorMonths?: number;
  tenorWindowRelative?: string;
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
    /** Per eligible observation: recency factor, comparability score and their product, the quantile weight. */
    weights: ObservationWeight[];
    /** Weighted P25, median and P75 of the normalized spread, before governed adjustments. */
    quantiles: {p25: number; p50: number; p75: number} | null;
  };
  /** Why no reference was published; "sem_base_suficiente" when the sample is below the governed minimum. */
  abstention: PricingAbstention | null;
  allIn: {
    annualizedCostBps: number | null;
    totalRate: {min: string; max: string} | null;
    components: Array<PricingCostComponent & {annualizedBps: number | null}>;
  };
  exceptions: Array<{id: string; severity: "medium" | "high" | "critical"; message: string; affectedProcedures: `PR-${string}`[]}>
  missingInputs: string[];
  procedureCoverage: PricingProcedureResult[];
};

export type ObservationWeight = {id: string; recency: string; score: string; weight: string};

export type PricingAbstention = {
  reason: "sem_base_suficiente" | "regime_invalidado" | "indexador_sem_curva" | "banda_abaixo_do_piso" | "banda_acima_do_teto" | "sem_alvo_ou_politica";
  pt: string;
  en: string;
};

/**
 * Comparability of `policy.pricing.sample-quality` (weights of Case 01, section R7). Risk band,
 * instrument and security class stay exact here, so their dimensions score 1; tenor and size are
 * windows; sector and amortization lower the weight of an observation without excluding it.
 */
const COMPARABILITY_WEIGHTS = {security: "0.25", risk: "0.25", instrument: "0.15", tenor: "0.15", sector: "0.10", size: "0.05", amortization: "0.05"} as const;
const DIRECT_MIN_SCORE = new Decimal("0.80");
const DEFAULT_TENOR_WINDOW = {floorMonths: 6, relativeToTarget: "0.5"} as const;
/** Recency by source kind: full weight up to the first count of days, linear decay to zero at the second. */
const RECENCY_DAYS: Readonly<Record<PricingObservation["sourceKind"], {full: number; zero: number}>> = {
  public_closing: {full: 90, zero: 150},
  term_sheet: {full: 120, zero: 180},
  direct_manager_confirmation: {full: 120, zero: 180},
  authorized_historical: {full: 120, zero: 180},
  indication: {full: 120, zero: 180},
  sounding: {full: 120, zero: 180},
};
const QUARTILES = {p25: new Decimal("0.25"), p50: new Decimal("0.5"), p75: new Decimal("0.75")} as const;

const isoValid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`));
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
const moneyRatio = (observation: string, target: string) => new Decimal(observation).div(target);

/** Tenor window in months: min(maxTenorDeltaMonths; max(floor; share × target)). */
export function tenorWindowMonths(targetMonths: number, policy: Pick<PricingPolicy, "maxTenorDeltaMonths" | "tenorWindowFloorMonths" | "tenorWindowRelative">): Decimal {
  const floor = new Decimal(policy.tenorWindowFloorMonths ?? DEFAULT_TENOR_WINDOW.floorMonths);
  const relative = new Decimal(policy.tenorWindowRelative ?? DEFAULT_TENOR_WINDOW.relativeToTarget).times(targetMonths);
  return Decimal.min(policy.maxTenorDeltaMonths, Decimal.max(floor, relative));
}

const tenorSimilarity = (deltaMonths: number) => deltaMonths <= 6 ? "1" : deltaMonths <= 12 ? "0.8" : deltaMonths <= 24 ? "0.5" : "0";
const sizeSimilarity = (ratio: Decimal) => ratio.gte("0.5") && ratio.lte(2) ? "1" : ratio.gte("0.25") && ratio.lte(4) ? "0.5" : "0";
const sectorSimilarity = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase() ? "1" : "0.3";
function amortizationFamily(value: string): "concentrated" | "amortizing" | null {
  const text = value.trim().toLowerCase();
  if (/bullet|balloon|bal[aã]o/.test(text)) return "concentrated";
  if (/\bsac\b|price|sculpt|amortiz|custom|seasonal|sazonal/.test(text)) return "amortizing";
  return null;
}
function amortizationSimilarity(a: string, b: string): string {
  if (a.trim().toLowerCase() === b.trim().toLowerCase()) return "1";
  const left = amortizationFamily(a);
  return left !== null && left === amortizationFamily(b) ? "0.9" : "0.5";
}

/** Recency factor: 1 inside the full-weight window, linear to 0 at the end of the decay, 0 after. */
function recencyFactor(ageDays: number, kind: PricingObservation["sourceKind"]): Decimal {
  const window = RECENCY_DAYS[kind];
  if (ageDays <= window.full) return new Decimal(1);
  if (ageDays >= window.zero) return new Decimal(0);
  return new Decimal(window.zero - ageDays).div(window.zero - window.full).toDecimalPlaces(6, Decimal.ROUND_HALF_UP);
}

/**
 * Weighted quantile: order by spread, then the first value whose cumulative normalized weight
 * reaches q. The comparison is cumulative weight against q × total weight, which is the same test
 * without dividing each weight and rounding it.
 */
function weightedQuantile(entries: ReadonlyArray<{id: string; value: number; weight: Decimal}>, q: Decimal): number {
  const ordered = [...entries].sort((a, b) => a.value - b.value || a.id.localeCompare(b.id));
  const threshold = q.times(ordered.reduce((sum, entry) => sum.plus(entry.weight), new Decimal(0)));
  let cumulative = new Decimal(0);
  for (const entry of ordered) {
    cumulative = cumulative.plus(entry.weight);
    if (cumulative.gte(threshold)) return entry.value;
  }
  return ordered[ordered.length - 1]!.value;
}

/** Comparability score of an observation that already passed the exact and window filters. */
function comparabilityScore(input: {observation: PricingObservation; target: PricingTarget; tenorDeltaMonths: number; amountRatio: Decimal}): Decimal {
  const weight = (dimension: keyof typeof COMPARABILITY_WEIGHTS) => new Decimal(COMPARABILITY_WEIGHTS[dimension]);
  return weight("security").plus(weight("risk")).plus(weight("instrument"))
    .plus(weight("tenor").times(tenorSimilarity(input.tenorDeltaMonths)))
    .plus(weight("sector").times(sectorSimilarity(input.observation.sectorGroup, input.target.sectorGroup)))
    .plus(weight("size").times(sizeSimilarity(input.amountRatio)))
    .plus(weight("amortization").times(amortizationSimilarity(input.observation.amortizationClass, input.target.amortizationClass)));
}

/** The single reason no reference was published, in the order a reviewer would have to clear them. */
function abstentionFor(input: {target: PricingTarget | null; policy: PricingPolicy | undefined; exceptions: PricingTruthSet["exceptions"]; eligibleCount: number; distinctSources: number}): PricingAbstention {
  const raised = new Set(input.exceptions.map((exception) => exception.id));
  if (!input.target || !input.policy) {
    return {reason: "sem_alvo_ou_politica", pt: "Sem referência: faltam o alvo de precificação ou a política vigente.", en: "No reference: the pricing target or the governing policy is missing."};
  }
  if (raised.has("pricing-regime-invalidated")) {
    return {reason: "regime_invalidado", pt: "Sem referência: o regime de precificação vigente foi invalidado e precisa ser refeito antes de nova referência.", en: "No reference: the active pricing regime was invalidated and must be rebuilt before a new reference."};
  }
  if (raised.has("unsupported-indexer-curve")) {
    return {reason: "indexador_sem_curva", pt: "Sem referência: o indexador do alvo ainda não tem curva validada.", en: "No reference: the target's indexer does not yet have a validated curve."};
  }
  const policy = input.policy;
  const sample = {
    reason: "sem_base_suficiente" as const,
    pt: `Sem base suficiente: ${input.eligibleCount} observações comparáveis de ${input.distinctSources} origens; a política exige ${policy.minObservations} observações de ${policy.minDistinctSources} origens.`,
    en: `Insufficient basis: ${input.eligibleCount} comparable observations from ${input.distinctSources} sources; the policy requires ${policy.minObservations} observations from ${policy.minDistinctSources} sources.`,
  };
  if (input.eligibleCount < policy.minObservations || input.distinctSources < policy.minDistinctSources) return sample;
  if (raised.has("band-too-narrow")) {
    return {reason: "banda_abaixo_do_piso", pt: `Sem referência: a faixa entre P25 e P75 fica abaixo do piso de comunicação de ${policy.minBandWidthBps} pontos-base.`, en: `No reference: the P25 to P75 range is below the ${policy.minBandWidthBps} basis-point communication floor.`};
  }
  if (raised.has("band-too-wide")) {
    return {reason: "banda_acima_do_teto", pt: `Sem referência: a faixa entre P25 e P75 passa do teto de comunicação de ${policy.maxBandWidthBps} pontos-base.`, en: `No reference: the P25 to P75 range exceeds the ${policy.maxBandWidthBps} basis-point communication ceiling.`};
  }
  return sample;
}
/**
 * CDI plus a spread in basis points as one annual rate, composed the way the B3 formula book and
 * the indentures accrue it: (1 + CDI) × (1 + spread) - 1, never CDI + spread.
 */
const cdiPlus = (cdi: Decimal, spreadBps: Decimal.Value) =>
  new Decimal(composeIndexAndSpread({index: "DI", annualIndex: cdi.toString(), annualSpread: new Decimal(spreadBps).div(10_000).toString()}).value);
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

  // Risk band, instrument and security class stay exact. Tenor and size are windows; sector and
  // amortization only lower the weight; age decays the weight and ends it at the recency limit.
  const admitted: Array<{observation: PricingObservation; weight: ObservationWeight}> = [];
  if (target && policy) {
    const tenorWindow = tenorWindowMonths(target.tenorMonths, policy);
    for (const observation of observations) {
      const reasons: string[] = [];
      let ageDays: number | null = null;
      if (!isoValid(observation.observedOn) || !isoValid(observation.validUntil)) reasons.push("invalid_date");
      else {
        if (observation.validUntil < policy.asOf) reasons.push("expired");
        ageDays = daysBetween(observation.observedOn, policy.asOf);
        if (ageDays < 0) reasons.push("observed_after_as_of");
      }
      if (!observation.aggregateAuthorized) reasons.push("aggregate_not_authorized");
      if (!observation.sourceOwner) reasons.push("missing_owner");
      if (observation.confidentiality === "restricted_internal") reasons.push("restricted_from_aggregate");
      if (observation.quality < policy.minQuality) reasons.push("quality_below_policy");
      if (observation.regime !== policy.regime) reasons.push("different_regime");
      if (observation.instrument !== target.instrument) reasons.push("different_instrument");
      if (observation.rating !== target.rating) reasons.push("different_risk_band");
      if (observation.securityClass !== target.securityClass) reasons.push("different_security");
      const tenorDeltaMonths = Math.abs(observation.tenorMonths - target.tenorMonths);
      if (tenorWindow.lt(tenorDeltaMonths)) reasons.push("tenor_outside_window");
      let amountRatio: Decimal | null = null;
      if (new Decimal(target.amount).lte(0) || new Decimal(observation.amount).lte(0)) reasons.push("invalid_amount");
      else {
        amountRatio = moneyRatio(observation.amount, target.amount);
        if (amountRatio.lt(policy.minAmountRatio) || amountRatio.gt(policy.maxAmountRatio)) reasons.push("amount_outside_window");
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
      const recency = ageDays !== null && ageDays >= 0 ? recencyFactor(ageDays, observation.sourceKind) : null;
      if (recency?.isZero()) reasons.push("outside_recency_window");
      const score = amountRatio ? comparabilityScore({observation, target, tenorDeltaMonths, amountRatio}) : null;
      if (score?.lt(DIRECT_MIN_SCORE)) reasons.push("comparability_below_policy");
      if (reasons.length || !recency || !score) {
        rejected.push({id: observation.id, reasons});
        continue;
      }
      admitted.push({observation, weight: {id: observation.id, recency: recency.toString(), score: score.toString(), weight: recency.times(score).toString()}});
    }
  }
  const eligible = admitted.map((entry) => entry.observation);
  const weights = admitted.map((entry) => entry.weight);
  const weightedSpreads = admitted.map(({observation, weight}) => ({id: observation.id, value: observation.normalizedSpreadBps, weight: new Decimal(weight.weight)}));
  const quantiles = weightedSpreads.length
    ? {p25: weightedQuantile(weightedSpreads, QUARTILES.p25), p50: weightedQuantile(weightedSpreads, QUARTILES.p50), p75: weightedQuantile(weightedSpreads, QUARTILES.p75)}
    : null;

  const distinctSources = new Set(eligible.map((observation) => observation.sourceId)).size;
  const sampleSufficient = Boolean(policy?.status === "active" && eligible.length >= policy.minObservations && distinctSources >= policy.minDistinctSources);
  if (policy && eligible.length < policy.minObservations) exceptions.push({id: "insufficient-observations", severity: "critical", message: "Comparable observations do not reach the governed minimum sample.", affectedProcedures: ["PR-01", "PR-02", "PR-07", "PR-09"]});
  if (policy && distinctSources < policy.minDistinctSources) exceptions.push({id: "insufficient-independent-sources", severity: "critical", message: "The sample does not reach the governed minimum number of distinct sources.", affectedProcedures: ["PR-02", "PR-07", "PR-13"]});

  const validAdjustments = (input.adjustments ?? []).filter((adjustment) => policy && adjustment.validUntil >= policy.asOf && Boolean(adjustment.sourceId));
  const rejectedAdjustments = (input.adjustments ?? []).filter((adjustment) => !policy || adjustment.validUntil < policy.asOf || !adjustment.sourceId);
  if (rejectedAdjustments.length) exceptions.push({id: "expired-or-untraced-adjustment", severity: "high", message: "At least one proposed pricing adjustment is expired or lacks a source.", affectedProcedures: ["PR-03", "PR-04", "PR-05", "PR-08"]});

  let indicativePrice: IndicativePrice | null = null;
  if (target && policy && sampleSufficient && quantiles) {
    const shift = validAdjustments.reduce((sum, adjustment) => sum + adjustment.bps, 0);
    // The band is the weighted P25 to P75 of the governed sample, never its minimum and maximum:
    // one outlier at either end no longer sets the edge the house would have to defend.
    const baseMin = quantiles.p25;
    const baseMax = quantiles.p75;
    const width = baseMax - baseMin;
    if (width < policy.minBandWidthBps) exceptions.push({id: "band-too-narrow", severity: "critical", message: "The observed band is narrower than the governed communication floor.", affectedProcedures: ["PR-01", "PR-07", "PR-09"]});
    if (width > policy.maxBandWidthBps) exceptions.push({id: "band-too-wide", severity: "critical", message: "The observed dispersion is wider than the governed communication ceiling.", affectedProcedures: ["PR-01", "PR-02", "PR-07", "PR-09"]});
    if (!exceptions.some((exception) => exception.severity === "critical")) {
      const bps = {min: baseMin + shift, max: baseMax + shift};
      const cdi = new Decimal(target.cdi);
      const base: SpreadBand = {instrument: target.instrument, rating: target.rating, bps: {min: baseMin, max: baseMax}};
      const latest = [...eligible].sort((a, b) => b.observedOn.localeCompare(a.observedOn))[0]!.observedOn;
      const oldest = [...eligible].sort((a, b) => a.observedOn.localeCompare(b.observedOn))[0]!.observedOn;
      const allIn = {min: cdiPlus(cdi, bps.min).toFixed(6), max: cdiPlus(cdi, bps.max).toFixed(6), cdi: cdi.toFixed(6)};
      indicativePrice = {
        instrument: target.instrument,
        rating: target.rating,
        bps,
        allIn,
        base,
        adjustments: validAdjustments.map(({id, bps: adjustmentBps, rationale}) => ({id, bps: adjustmentBps, rationale})),
        provenance: {kind: "observed", sample: eligible.length, windowMonths: Math.max(1, Math.ceil((Date.parse(`${policy.asOf}T00:00:00Z`) - Date.parse(`${oldest}T00:00:00Z`)) / 2_629_746_000))},
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
  // Annualized costs join the spread before the composition with the CDI, as the cost catalogue
  // states: all-in = (1 + CDI) × (1 + spread + annualized costs) - 1.
  const totalRate = indicativePrice && annualizedCostBps !== null
    ? {
        min: cdiPlus(new Decimal(indicativePrice.allIn.cdi), new Decimal(indicativePrice.bps.min).plus(annualizedCostBps)).toFixed(6),
        max: cdiPlus(new Decimal(indicativePrice.allIn.cdi), new Decimal(indicativePrice.bps.max).plus(annualizedCostBps)).toFixed(6),
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
    result("PR-02", sampleSufficient ? "completed" : observations.length ? "blocked" : "not_computable", observations.length ? {eligible, rejected, weights, quantiles, medianBps: quantiles?.p50 ?? null} : null, observations.length ? sampleSufficient ? [] : ["comparable sample"] : ["pricing observations"], exceptionIds("PR-02"), eligible.length),
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
    sample: {eligible, rejected, distinctSources, latestObservation, weights, quantiles},
    abstention: indicativePrice ? null : abstentionFor({target, policy, exceptions, eligibleCount: eligible.length, distinctSources}),
    allIn: {annualizedCostBps, totalRate, components: costComponents},
    exceptions,
    missingInputs: [...missing].sort(),
    procedureCoverage: coverage,
  };
}
