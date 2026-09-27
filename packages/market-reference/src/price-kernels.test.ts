import {describe, expect, it} from "vitest";

import {indicativePrice} from "./index";
import {buildPricingTruthSet, type GovernedPriceAdjustment, type PricingObservation, type PricingPolicy, type PricingTarget} from "./pricing-truth";

/**
 * The deliberate differences of the move of the price reference's arithmetic into
 * `@offroad/financial-core` (stage 19, post-closure polish). The grid quotes whole basis points and
 * no fixture reaches them, so every pin holds; each test below fails on the code before the move.
 */
const policy: PricingPolicy = {
  version: "pricing-policy-2026-08", asOf: "2026-08-25", regime: "brl-cdi-2026-h2", status: "active",
  minObservations: 3, minDistinctSources: 3, minQuality: 0.8, maxTenorDeltaMonths: 12,
  minAmountRatio: "0.5", maxAmountRatio: "2", minBandWidthBps: 60, maxBandWidthBps: 250,
};
const target: PricingTarget = {
  instrument: "ccb", rating: "adequate", cdi: "0.105", tenorMonths: 48, securityClass: "senior_secured",
  amortizationClass: "quarterly_sculpted", sectorGroup: "consumer", amount: "40000000", indexer: "cdi",
};
const observation = (id: string, spread: number, economics?: PricingObservation["economics"]): PricingObservation => ({
  id, sourceId: `source-${id}`, sourceOwner: "market-desk", sourceKind: "direct_manager_confirmation", confidentiality: "aggregated_confidential",
  observedOn: "2026-08-10", validUntil: "2026-09-10", status: "term", instrument: "ccb", rating: "adequate",
  normalizedSpreadBps: spread, normalizationMethod: "CDI spread observed directly", tenorMonths: 48, securityClass: "senior_secured",
  amortizationClass: "quarterly_sculpted", sectorGroup: "consumer", amount: "40000000", regime: "brl-cdi-2026-h2", quality: 0.9,
  aggregateAuthorized: true, economics: economics ?? {quotedSpreadBps: spread, feeBps: 0, oidBps: 0, warrantBps: 0, hedgeBps: 0},
});
const adjustment = (bps: number): GovernedPriceAdjustment => ({
  id: "security", bps, rationale: {pt: "Ajuste rastreado.", en: "Traced adjustment."}, sourceId: "desk-note", observedOn: "2026-08-20", validUntil: "2026-09-30",
});

describe("what the move of the price reference to financial-core changed on purpose", () => {
  it("adds and subtracts fractional basis points as decimals, not as binary numbers", () => {
    const truth = buildPricingTruthSet({
      target: {...target, expectedSpreadBps: 0.1}, policy,
      observations: [observation("a", 0), observation("b", 60), observation("c", 120)],
      adjustments: [adjustment(0.1), adjustment(0.2)],
    });
    // Before: 0.30000000000000004, a width of 120.00000000000001 and a gap of 0.20000000000000004.
    expect(truth.indicativePrice!.bps).toEqual({min: 0.3, max: 120.3});
    expect(truth.procedureCoverage.find((entry) => entry.procedureId === "PR-09")!.result).toMatchObject({widthBps: 120});
    expect(truth.procedureCoverage.find((entry) => entry.procedureId === "PR-08")!.result).toMatchObject({gapToNearest: 0.2});
  });

  it("keeps an observation whose economics add up to its spread exactly at the tolerance", () => {
    const truth = buildPricingTruthSet({
      target, policy,
      observations: [observation("a", 0.3, {quotedSpreadBps: 0.1, feeBps: 0.2, oidBps: 0.01, warrantBps: 0, hedgeBps: 0}), observation("b", 60), observation("c", 120)],
    });
    // Before: the binary sum left a gap of 0.010000000000000064 and the observation was rejected.
    expect(truth.sample.rejected).toEqual([]);
    expect(truth.sample.eligible.map((entry) => entry.id)).toEqual(["a", "b", "c"]);
  });

  it("does not annualize a cost over a ticket that is not positive, where it published an infinite cost", () => {
    const truth = buildPricingTruthSet({
      target: {...target, amount: "0"}, policy,
      observations: [observation("a", 300)],
      costs: [{id: "structuring", label: "Structuring fee", sourceId: "fee-schedule", validUntil: "2026-12-31", oneTimeAmount: "400000"}],
      weightedAverageLifeYears: "3.5",
    });
    expect(truth.allIn.components[0]!.annualizedBps).toBeNull();
    expect(truth.allIn.annualizedCostBps).toBeNull();
    expect(truth.missingInputs).toContain("pricing.weighted_average_life_and_valid_cost_sources");
  });

  it("refuses a threshold input that is not a finite decimal number, where decimal.js read hexadecimal", () => {
    expect(indicativePrice({instrument: "ccb", rating: "adequate", cdi: "0.105", collateralCoverage: "2"})!.adjustments.map((entry) => entry.bps)).toEqual([-60]);
    // Before: "0x2" read as 2 and the paper priced as senior secured.
    expect(() => indicativePrice({instrument: "ccb", rating: "adequate", cdi: "0.105", collateralCoverage: "0x2"})).toThrow(RangeError);
  });
});
