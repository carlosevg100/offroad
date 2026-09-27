import {createHash} from "node:crypto";

import {describe, expect, it} from "vitest";

import {buildPricingTruthSet, tenorWindowMonths, type PricingCostComponent, type PricingObservation, type PricingPolicy, type PricingTarget} from "./pricing-truth";

/**
 * Byte-identity of the governed sample statistics across the move of their arithmetic into
 * `@offroad/financial-core` (stage 19, third polish): the recency factor of each observation, its
 * comparability score, the weight they make, the weighted quantiles, the tenor window, the amount
 * ratio and the differences between the proposed all-in and the current cost. The truth pin of
 * `price-output-parity.test.ts` holds its samples at one age, one tenor and one amount, so it never
 * reaches the decay of recency, a comparability below one or a window; these fingerprints were
 * captured from `pricing-truth.ts` as the second polish left it, before any of that arithmetic moved:
 *
 * - every age around the full-weight window and the decay of each kind of source;
 * - tenors inside, at and outside the window, under the default window and a governed one, at
 *   several target tenors;
 * - amount ratios at and around every edge of the size bands and of the policy window, and amounts
 *   that are not positive;
 * - sectors and amortization profiles equal, equal but written apart, of the same family and not;
 * - every other reason an observation is refused;
 * - published bands over decayed weights, with the expectation below, inside and above the band,
 *   and the current cost below, at and above the proposed all-in;
 * - ties of spread broken by the observation id, and cumulative weights exactly at a quartile.
 *
 * A pin moves only with a deliberate change.
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

const asOf = "2026-08-25";
const daysBefore = (days: number) => new Date(Date.parse(`${asOf}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);

const base: PricingPolicy = {
  version: "pricing-policy-2026-08", asOf, regime: "brl-cdi-2026-h2", status: "active",
  minObservations: 3, minDistinctSources: 3, minQuality: 0.8, maxTenorDeltaMonths: 12,
  minAmountRatio: "0.5", maxAmountRatio: "2", minBandWidthBps: 60, maxBandWidthBps: 250,
};
const wide: PricingPolicy = {
  ...base, version: "pricing-policy-wide", minObservations: 2, minDistinctSources: 2, maxTenorDeltaMonths: 36,
  minAmountRatio: "0.2", maxAmountRatio: "5", minBandWidthBps: 0, maxBandWidthBps: 1000, tenorWindowFloorMonths: 3, tenorWindowRelative: "0.75",
};
const target: PricingTarget = {
  instrument: "ccb", rating: "adequate", cdi: "0.105", tenorMonths: 48, securityClass: "senior_secured",
  amortizationClass: "quarterly_sculpted", sectorGroup: "consumer", amount: "40000000", indexer: "cdi",
  indexerRationale: "Operating cash flows and the target buyer base are referenced to CDI.",
  targetBuyer: "Brazilian private credit funds", expectedSpreadBps: 300, currentAllIn: "0.13",
};
const observation = (id: string, spread: number, overrides: Partial<PricingObservation> = {}): PricingObservation => ({
  id, sourceId: `source-${id}`, sourceOwner: "market-desk", sourceKind: "direct_manager_confirmation", confidentiality: "aggregated_confidential",
  observedOn: daysBefore(15), validUntil: "2026-12-31", status: "term", instrument: "ccb", rating: "adequate",
  normalizedSpreadBps: spread, normalizationMethod: "CDI spread observed directly", tenorMonths: 48, securityClass: "senior_secured",
  amortizationClass: "quarterly_sculpted", sectorGroup: "consumer", amount: "40000000", regime: "brl-cdi-2026-h2", quality: 0.9,
  aggregateAuthorized: true, ...overrides,
});
const costs: PricingCostComponent[] = [
  {id: "structuring", label: "Structuring fee", sourceId: "fee-schedule", validUntil: "2026-12-31", oneTimeAmount: "400000"},
  {id: "trustee", label: "Trustee", sourceId: "trustee-quote", validUntil: "2026-12-31", annualAmount: "120000"},
];

function* truthSets() {
  // Recency: every age around the full-weight window and the decay of each kind of source.
  const ages = [-1, 0, 15, 90, 91, 100, 119, 120, 121, 149, 150, 151, 179, 180, 200];
  for (const sourceKind of ["public_closing", "direct_manager_confirmation", "sounding", "term_sheet"] as const) {
    for (const policy of [base, wide]) {
      yield {sweep: "recency", sourceKind, policy: policy.version, truth: buildPricingTruthSet({
        target, policy,
        observations: ages.map((age, index) => observation(`${sourceKind}-${age}`, 180 + index * 17, {sourceKind, observedOn: daysBefore(age)})),
      })};
    }
  }
  // Tenor: inside, at and outside the window, at several target tenors, under the default and a governed window.
  for (const targetTenor of [6, 12, 18, 30, 48, 100]) {
    for (const policy of [base, wide]) {
      const deltas = [0, 1, 5, 6, 7, 9, 12, 13, 24, 25, 30, 36, 37];
      const tenors = [...new Set(deltas.flatMap((delta) => [targetTenor + delta, targetTenor - delta]).filter((tenor) => tenor > 0))];
      yield {sweep: "tenor", targetTenor, policy: policy.version, truth: buildPricingTruthSet({
        target: {...target, tenorMonths: targetTenor}, policy,
        observations: tenors.map((tenorMonths, index) => observation(`tenor-${tenorMonths}`, 200 + index * 11, {tenorMonths})),
      })};
    }
  }
  // Size: ratios at and around every edge of the size bands and of the policy window, and amounts that are not positive.
  const ratios = ["0.19", "0.2", "0.24", "0.25", "0.3", "0.49", "0.5", "1", "2", "2.01", "3.99", "4", "4.01", "5", "5.01"];
  for (const policy of [base, wide]) {
    yield {sweep: "size", policy: policy.version, truth: buildPricingTruthSet({
      target, policy,
      observations: [
        ...ratios.map((ratio, index) => observation(`ratio-${ratio}`, 210 + index * 9, {amount: String(Number(ratio) * 40_000_000)})),
        observation("amount-zero", 300, {amount: "0"}), observation("amount-negative", 305, {amount: "-1"}), observation("amount-fraction", 310, {amount: "13333333.33"}),
      ],
    })};
  }
  yield {sweep: "size", policy: "target-zero", truth: buildPricingTruthSet({target: {...target, amount: "0"}, policy: wide, observations: [observation("a", 250), observation("b", 300)]})};
  // Sector and amortization: equal, equal but written apart, of the same family, and not.
  const sectors = ["consumer", "Consumer ", " CONSUMER", "industrial"];
  const amortizations = ["quarterly_sculpted", "Quarterly_Sculpted", "bullet", "balloon", "Balão", "SAC", "price", "custom", "seasonal", "sazonal", "monthly"];
  for (const policy of [base, wide]) {
    for (const targetAmortization of ["quarterly_sculpted", "bullet", "monthly"]) {
      yield {sweep: "profile", policy: policy.version, targetAmortization, truth: buildPricingTruthSet({
        target: {...target, amortizationClass: targetAmortization}, policy,
        observations: sectors.flatMap((sectorGroup, s) => amortizations.map((amortizationClass, a) => observation(`profile-${s}-${a}`, 190 + s * 40 + a * 3, {sectorGroup, amortizationClass}))),
      })};
    }
    // The lowest scores: every dimension that only lowers the weight at its worst, with the size and tenor windows wide open.
    yield {sweep: "profile-floor", policy: policy.version, truth: buildPricingTruthSet({
      target, policy: {...policy, maxTenorDeltaMonths: 60, minAmountRatio: "0.01", maxAmountRatio: "100"},
      observations: [
        observation("floor-a", 220, {sectorGroup: "industrial", amortizationClass: "bullet", tenorMonths: 20, amount: "4000000"}),
        observation("floor-b", 240, {sectorGroup: "industrial", amortizationClass: "monthly", tenorMonths: 60, amount: "90000000"}),
        observation("floor-c", 260, {sectorGroup: "industrial", tenorMonths: 36, amount: "20000000"}),
        observation("floor-d", 280, {amortizationClass: "bullet", tenorMonths: 30}),
        observation("floor-e", 300, {sectorGroup: "industrial", amortizationClass: "bullet", tenorMonths: 54, amount: "12000000"}),
      ],
    })};
  }
  // Every other reason an observation is refused.
  yield {sweep: "refusals", truth: buildPricingTruthSet({
    target, policy: base,
    observations: [
      observation("ok-1", 250), observation("ok-2", 300), observation("ok-3", 350),
      observation("quality-below", 260, {quality: 0.79}), observation("quality-at", 270, {quality: 0.8}),
      observation("restricted", 280, {confidentiality: "restricted_internal"}), observation("unauthorized", 290, {aggregateAuthorized: false}),
      observation("no-owner", 300, {sourceOwner: ""}), observation("other-regime", 310, {regime: "brl-cdi-2026-h1"}),
      observation("other-instrument", 320, {instrument: "cra"}), observation("other-band", 330, {rating: "watch"}),
      observation("other-security", 340, {securityClass: "unsecured"}), observation("bad-date", 350, {observedOn: "2026-13-01"}),
      observation("expired", 360, {validUntil: "2026-08-24"}), observation("no-lineage", 370, {normalizationMethod: ""}),
      observation("economics", 380, {economics: {quotedSpreadBps: 300, feeBps: 50, oidBps: 20, warrantBps: 0, hedgeBps: 0}}),
    ],
  })};
  // Published bands over decayed weights: the expectation below, inside and above the band, the current cost around the all-in.
  const decayed = [
    observation("w-a", 240, {observedOn: daysBefore(130)}), observation("w-b", 275, {observedOn: daysBefore(20), sectorGroup: "industrial"}),
    observation("w-c", 310, {observedOn: daysBefore(160)}), observation("w-d", 330, {observedOn: daysBefore(45), amortizationClass: "bullet"}),
    observation("w-e", 355, {observedOn: daysBefore(125), tenorMonths: 40}), observation("w-f", 390, {observedOn: daysBefore(5)}),
  ];
  for (const expectedSpreadBps of [200, 275, 300, 355, 420, 330.5]) {
    for (const currentAllIn of ["0.13", "0.2", "0.1", "0.137", "0.1370005"]) {
      yield {sweep: "published", expectedSpreadBps, currentAllIn, truth: buildPricingTruthSet({
        target: {...target, expectedSpreadBps, currentAllIn}, policy: wide, observations: decayed, costs, weightedAverageLifeYears: "3.25",
      })};
    }
  }
  // Ties of spread broken by the observation id, and cumulative weights exactly at a quartile.
  yield {sweep: "ties", truth: buildPricingTruthSet({
    target, policy: wide,
    observations: [observation("d", 300), observation("c", 300), observation("b", 250), observation("a", 350), observation("e", 250), observation("f", 400), observation("g", 300), observation("h", 450)],
  })};
  yield {sweep: "quartile-edge", truth: buildPricingTruthSet({
    target, policy: wide,
    observations: [observation("q1", 200), observation("q2", 260), observation("q3", 320), observation("q4", 380)],
  })};
  yield {sweep: "fractional", truth: buildPricingTruthSet({
    target, policy: wide,
    observations: [observation("f1", 212.25, {observedOn: daysBefore(133)}), observation("f2", 260.5, {observedOn: daysBefore(97)}), observation("f3", 301.125, {observedOn: daysBefore(170)}), observation("f4", 333.75)],
  })};
}

function* windows() {
  for (const targetMonths of [0, 1, 6, 8, 12, 13, 18, 24, 25, 30, 48, 100]) {
    for (const policy of [base, wide, {...base, tenorWindowRelative: "0.3333"}, {...base, tenorWindowFloorMonths: 0}, {...wide, maxTenorDeltaMonths: 7.5}]) {
      yield {targetMonths, window: tenorWindowMonths(targetMonths, policy).toString()};
    }
  }
}

describe("the governed sample statistics across the move to financial-core", () => {
  it("reach the decay of recency, comparability below one, every window and every edge of the quartiles", () => {
    const truths = [...truthSets()].map(({truth}) => truth);
    const weights = truths.flatMap((truth) => truth.sample.weights);
    expect(weights.some((weight) => weight.recency !== "1" && weight.recency !== "0")).toBe(true);
    expect(weights.some((weight) => weight.score !== "1")).toBe(true);
    const reasons = new Set(truths.flatMap((truth) => truth.sample.rejected.flatMap((entry) => entry.reasons)));
    for (const reason of ["outside_recency_window", "observed_after_as_of", "tenor_outside_window", "amount_outside_window", "invalid_amount", "comparability_below_policy", "quality_below_policy", "expired", "invalid_date"]) {
      expect(reasons.has(reason), reason).toBe(true);
    }
    const published = truths.filter((truth) => truth.indicativePrice);
    expect(published.length).toBeGreaterThan(0);
    const gaps = published.map((truth) => truth.procedureCoverage.find((entry) => entry.procedureId === "PR-08")?.result?.gapToNearest);
    expect(gaps.some((gap) => gap === 0) && gaps.some((gap) => typeof gap === "number" && gap > 0)).toBe(true);
  });

  it("reproduces every pinned output byte for byte", () => {
    expect({truth: digest(truthSets()), windows: digest(windows())}).toEqual({
      truth: {count: 65, sha256: "53e81a5d3fd9f94cf16a6013c94479115ba2aca0f86eef9eb8efd021dbd5376c"},
      windows: {count: 60, sha256: "2ebf6b643c91b42bbde50b7180431a3777790b057dcc3e1fb4a84780df076360"},
    });
  });
});
