import {createHash} from "node:crypto";

import {describe, expect, it} from "vitest";

import {indicativePrice, spreadBands, type PriceInput} from "./index";
import {buildPricingTruthSet, type GovernedPriceAdjustment, type PricingObservation, type PricingPolicy, type PricingTarget} from "./pricing-truth";

/**
 * Byte-identity of the two price sentences across the move of their conversions into
 * `@offroad/financial-core` (stage 19, increment 6C). The fingerprints were captured from the
 * floating-point sentences before the kernels were used:
 *
 * - the desk's practice band (`indicativePrice`), over every band of the grid, with and without
 *   each adjustment the reference applies (tenor, security, leverage, size) and at two CDI levels,
 *   which reaches negative, zero and positive spreads, whole and fractional percentages;
 * - the observed band of the governed pricing truth (`buildPricingTruthSet`), over samples with
 *   whole and fractional basis points, negative spreads and traced adjustments.
 *
 * A pin moves only with a deliberate change of the sentence.
 */
const sha256 = (value: unknown) => createHash("sha256").update(JSON.stringify(value, null, 1)).digest("hex");

const deskSentences = () => {
  const sentences: Array<{input: PriceInput; sentence: {pt: string; en: string}}> = [];
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
              const price = indicativePrice(input);
              if (price) sentences.push({input, sentence: price.sentence});
            }
          }
        }
      }
    }
  }
  return sentences;
};

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
const observation = (id: string, spread: number): PricingObservation => ({
  id, sourceId: `source-${id}`, sourceOwner: "market-desk", sourceKind: "direct_manager_confirmation", confidentiality: "aggregated_confidential",
  observedOn: "2026-08-10", validUntil: "2026-09-10", status: "term", instrument: "ccb", rating: "adequate",
  normalizedSpreadBps: spread, normalizationMethod: "CDI spread observed directly", tenorMonths: 48, securityClass: "senior_secured",
  amortizationClass: "quarterly_sculpted", sectorGroup: "consumer", amount: "40000000", regime: "brl-cdi-2026-h2", quality: 0.9,
  aggregateAuthorized: true, economics: {quotedSpreadBps: spread, feeBps: 0, oidBps: 0, warrantBps: 0, hedgeBps: 0},
});
const adjustment = (bps: number): GovernedPriceAdjustment => ({
  id: "security", bps, rationale: {pt: "Ajuste rastreado.", en: "Traced adjustment."}, sourceId: "desk-note", observedOn: "2026-08-20", validUntil: "2026-09-30",
});

const observedSentences = () => {
  // Half basis points only where the binary float holds the tie exactly (312.5 is 3.125%): a tie the
  // float stores low is a deliberate difference of the kernels, pinned in its own test.
  const samples = [[310, 370, 410], [250, 312.5, 380], [180.25, 240, 305.75], [95, 160, 222], [-150, -90, -20], [-40, 0, 45], [0.25, 60, 120]];
  const shifts = [[], [-30], [45, -12], [-100]];
  return samples.flatMap((spreads) => shifts.flatMap((bps) => ["0.105", "0.1365"].map((cdi) => {
    const truth = buildPricingTruthSet({
      target: {...target, cdi}, policy,
      observations: spreads.map((spread, index) => observation(String.fromCharCode(97 + index), spread)),
      adjustments: bps.map(adjustment),
    });
    return {spreads, bps, cdi, sentence: truth.indicativePrice?.sentence ?? null};
  })));
};

describe("the price sentences across the move to financial-core", () => {
  const desk = deskSentences();
  const observed = observedSentences();

  it("reach negative, zero and positive spreads, whole and fractional", () => {
    expect(desk.length).toBeGreaterThan(10_000);
    expect(desk.some(({sentence}) => sentence.pt.startsWith("CDI - "))).toBe(true);
    expect(desk.some(({sentence}) => sentence.pt.startsWith("CDI + 0% "))).toBe(true);
    expect(desk.some(({sentence}) => /^CDI \+ \d+,\d% /.test(sentence.pt))).toBe(true);
    expect(desk.some(({sentence}) => /^CDI \+ \d+,\d\d% /.test(sentence.pt))).toBe(true);
    expect(observed.every(({sentence}) => sentence !== null)).toBe(true);
    expect(observed.some(({sentence}) => sentence!.en.includes("CDI - "))).toBe(true);
    expect(observed.some(({sentence}) => /CDI \+ \d+\.\d\d%/.test(sentence!.en))).toBe(true);
  });

  it("reproduces every pinned sentence byte for byte", () => {
    expect({desk: sha256(desk), observed: sha256(observed)}).toEqual({
      desk: "a959f0efecf245bc48b54c53933b70088dd80fa0cfca81bf81ba4d53b2b02232",
      observed: "a3ac41aa965778b76cda19a29a2448c38b97c6ea751090cd9767fa7615167b07",
    });
  });
});
