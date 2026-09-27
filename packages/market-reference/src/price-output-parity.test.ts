import {createHash} from "node:crypto";

import {describe, expect, it} from "vitest";

import {indicativePrice, spreadBands, type PriceInput} from "./index";
import {
  buildPricingTruthSet, type GovernedPriceAdjustment, type PricingCostComponent, type PricingObservation, type PricingPolicy, type PricingTarget,
} from "./pricing-truth";

/**
 * Byte-identity of the whole price outputs across the move of their remaining arithmetic into
 * `@offroad/financial-core` (stage 19, post-closure polish): the sum of the adjustments in basis
 * points, the basis points turned into a rate for the composition with the CDI, the threshold
 * comparisons that choose each adjustment and each exception, the normalization identity of an
 * observation's economics and the annualized costs. `price-sentence-parity.test.ts` pins the two
 * sentences; this pins every field, captured before any of those computations moved:
 *
 * - the desk's practice band (`indicativePrice`) over every band of the grid, with and without each
 *   adjustment and at two CDI levels, and over every threshold at its exact edge;
 * - the governed pricing truth (`buildPricingTruthSet`) over samples with whole and fractional basis
 *   points, negative spreads and traced adjustments, with costs annualized over a weighted average
 *   life (valid, expired and fractional), economics that do and do not add up to the normalized
 *   spread, and bands under the floor and over the ceiling of communication.
 *
 * A pin moves only with a deliberate change of the price.
 */
const digest = (items: Iterable<unknown>) => {
  const hash = createHash("sha256");
  let count = 0;
  for (const item of items) {
    hash.update(JSON.stringify(item, null, 1));
    count += 1;
  }
  return {count, sha256: hash.digest("hex")};
};

function* deskPrices() {
  for (const band of spreadBands) {
    for (const cdi of ["0.105", "0.1365"]) {
      for (const tenorMonths of [undefined, 18, 48, 84]) {
        for (const collateralCoverage of [undefined, "0.8", "1.3", "1.6"]) {
          for (const amount of [undefined, "8000000", "42300000"]) {
            for (const leveragePost of [undefined, "2.1", "3.8", "4.7"]) {
              const input: PriceInput = {
                instrument: band.instrument, rating: band.rating, cdi,
                ...(tenorMonths === undefined ? {} : {tenorMonths}),
                ...(collateralCoverage === undefined ? {} : {collateralCoverage}),
                ...(amount === undefined ? {} : {amount}),
                ...(leveragePost === undefined ? {} : {leveragePost}),
              };
              yield {input, price: indicativePrice(input)};
            }
          }
        }
      }
    }
  }
}

/** Each threshold of the reference at its exact edge and on both sides of it, on the two instruments whose security default differs. */
function* edgePrices() {
  const edges: Array<Partial<PriceInput>> = [
    ...[24, 25, 60, 61].map((tenorMonths) => ({tenorMonths})),
    ...["0.9999", "1", "1.1999", "1.2", "1.4999", "1.5", "1.5001"].map((collateralCoverage) => ({collateralCoverage})),
    ...["2.4999", "2.5", "3.4999", "3.5", "4.4999", "4.5", "4.5001"].map((leveragePost) => ({leveragePost})),
    ...["9999999.99", "10000000", "10000000.01"].map((amount) => ({amount})),
  ];
  for (const instrument of ["ccb", "cra"] as const) {
    for (const edge of edges) {
      const input: PriceInput = {instrument, rating: "adequate", cdi: "0.1365", ...edge};
      yield {input, price: indicativePrice(input)};
    }
  }
}

const policy: PricingPolicy = {
  version: "pricing-policy-2026-08", asOf: "2026-08-25", regime: "brl-cdi-2026-h2", status: "active",
  minObservations: 3, minDistinctSources: 3, minQuality: 0.8, maxTenorDeltaMonths: 12,
  minAmountRatio: "0.5", maxAmountRatio: "2", minBandWidthBps: 60, maxBandWidthBps: 250,
};
const target: PricingTarget = {
  instrument: "ccb", rating: "adequate", cdi: "0.105", tenorMonths: 48, securityClass: "senior_secured",
  amortizationClass: "quarterly_sculpted", sectorGroup: "consumer", amount: "40000000", indexer: "cdi",
  indexerRationale: "Operating cash flows and the target buyer base are referenced to CDI.",
  targetBuyer: "Brazilian private credit funds", expectedSpreadBps: 300, currentAllIn: "0.13",
};
type Economics = NonNullable<PricingObservation["economics"]>;
const observation = (id: string, spread: number, economics?: Economics): PricingObservation => ({
  id, sourceId: `source-${id}`, sourceOwner: "market-desk", sourceKind: "direct_manager_confirmation", confidentiality: "aggregated_confidential",
  observedOn: "2026-08-10", validUntil: "2026-09-10", status: "term", instrument: "ccb", rating: "adequate",
  normalizedSpreadBps: spread, normalizationMethod: "CDI spread observed directly", tenorMonths: 48, securityClass: "senior_secured",
  amortizationClass: "quarterly_sculpted", sectorGroup: "consumer", amount: "40000000", regime: "brl-cdi-2026-h2", quality: 0.9,
  aggregateAuthorized: true, economics: economics ?? {quotedSpreadBps: spread, feeBps: 0, oidBps: 0, warrantBps: 0, hedgeBps: 0},
});
const adjustment = (bps: number, validUntil = "2026-09-30"): GovernedPriceAdjustment => ({
  id: "security", bps, rationale: {pt: "Ajuste rastreado.", en: "Traced adjustment."}, sourceId: "desk-note", observedOn: "2026-08-20", validUntil,
});
const costs: Record<string, PricingCostComponent[]> = {
  none: [],
  valid: [
    {id: "structuring", label: "Structuring fee", sourceId: "fee-schedule", validUntil: "2026-12-31", oneTimeAmount: "400000"},
    {id: "trustee", label: "Trustee", sourceId: "trustee-quote", validUntil: "2026-12-31", annualAmount: "120000"},
    {id: "rating", label: "Rating", sourceId: "rating-quote", validUntil: "2026-12-31", oneTimeAmount: "85000.5", annualAmount: "33333.33"},
  ],
  expired: [{id: "structuring", label: "Structuring fee", sourceId: "fee-schedule", validUntil: "2026-08-01", oneTimeAmount: "400000"}],
};

function* truthSets() {
  // Whole, quarter and half basis points; 312.5 sits on a tie at two decimals (3.125%).
  const samples = [[310, 370, 410], [250, 312.5, 380], [180.25, 240, 305.75], [95, 160, 222], [-150, -90, -20], [-40, 0, 45], [0.25, 60, 120], [300, 310, 320], [100, 250, 420]];
  const shifts = [[], [-30], [45, -12], [-100], [20.5, 0.25]];
  for (const spreads of samples) {
    for (const bps of shifts) {
      for (const cdi of ["0.105", "0.1365"]) {
        for (const [costKey, components] of Object.entries(costs)) {
          for (const life of costKey === "none" ? [undefined] : ["3.5", "0", "2.75"]) {
            yield {spreads, bps, cdi, costKey, life, truth: buildPricingTruthSet({
              target: {...target, cdi}, policy,
              observations: spreads.map((spread, index) => observation(String.fromCharCode(97 + index), spread)),
              adjustments: [...bps.map((value) => adjustment(value)), adjustment(15, "2026-08-01")],
              costs: components,
              ...(life === undefined ? {} : {weightedAverageLifeYears: life}),
            })};
          }
        }
      }
    }
  }
  // Economics that add up to the normalized spread within the 0.01 identity, exactly at it, and beyond it.
  for (const [label, economics] of Object.entries({
    exact: {quotedSpreadBps: 280.25, feeBps: 12.5, oidBps: 5.125, warrantBps: 0, hedgeBps: 2.125},
    within: {quotedSpreadBps: 280.25, feeBps: 12.5, oidBps: 5.125, warrantBps: 0.005, hedgeBps: 2.125},
    atTolerance: {quotedSpreadBps: 280.25, feeBps: 12.5, oidBps: 5.125, warrantBps: 0.01, hedgeBps: 2.125},
    beyond: {quotedSpreadBps: 280.25, feeBps: 12.5, oidBps: 5.125, warrantBps: 0.02, hedgeBps: 2.125},
    tenths: {quotedSpreadBps: 0.1, feeBps: 0.2, oidBps: 0, warrantBps: 0, hedgeBps: 299.7},
  })) {
    yield {label, truth: buildPricingTruthSet({
      target, policy,
      observations: [observation("a", 300, economics), observation("b", 250), observation("c", 380), observation("d", 330)],
    })};
  }
  // A sample under the governed minimum, in observations and in sources.
  yield {label: "two observations", truth: buildPricingTruthSet({target, policy, observations: [observation("a", 300), observation("b", 250)]})};
}

describe("the whole price outputs across the move to financial-core", () => {
  it("reach every adjustment, the edges of every threshold, costs and every exception of the band", () => {
    const adjustments = new Set([...deskPrices(), ...edgePrices()].flatMap(({price}) => price?.adjustments.map((entry) => `${entry.id}:${entry.bps}`) ?? []));
    expect([...adjustments].sort()).toEqual(["leverage:-25", "leverage:35", "leverage:75", "security:-30", "security:-60", "security:40", "security:50", "size:50", "tenor:-20", "tenor:40"]);
    const truths = [...truthSets()].map(({truth}) => truth);
    const exceptions = new Set(truths.flatMap((truth) => truth.exceptions.map((exception) => exception.id)));
    expect([...exceptions].sort()).toEqual(["band-too-narrow", "band-too-wide", "expired-or-untraced-adjustment", "insufficient-independent-sources", "insufficient-observations"]);
    expect(truths.some((truth) => truth.allIn.annualizedCostBps !== null && truth.allIn.totalRate !== null)).toBe(true);
    expect(truths.some((truth) => truth.missingInputs.includes("pricing.weighted_average_life_and_valid_cost_sources"))).toBe(true);
    expect(truths.some((truth) => truth.sample.rejected.some((entry) => entry.reasons.includes("normalization_identity_failed")))).toBe(true);
  });

  it("reproduces every pinned output byte for byte", () => {
    expect({desk: digest(deskPrices()), edges: digest(edgePrices()), truth: digest(truthSets())}).toEqual({
      desk: {count: 15360, sha256: "71464e8c9df7170d005e7fd4cd66506592feef4c7d8749a0d71d76636a14548b"},
      edges: {count: 42, sha256: "51fa2d178ccdfead9be2a69cb6c911fa4c04d58da65e5c3e997f034bcead80a2"},
      truth: {count: 636, sha256: "0da40644e8d00de00d76ec1e1db601e724345d22856b3a04134114ca2060ae30"},
    });
  });
});
