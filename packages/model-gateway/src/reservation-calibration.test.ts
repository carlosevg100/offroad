import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";
import {inputTokenRates, REQUEST_OVERHEAD_TOKENS} from "./token-estimate";
import type {Provider} from "./types";

/**
 * The calibration evidence of the input-token rule: the composition of the exact request bytes
 * behind every real usage figure the repository holds (rebuilt offline, byte for byte, from the
 * committed run record and evaluation fixture), and the offline o200k counts of the repository's
 * corpora. The rule must bound every real figure from above, and stay calibrated.
 */
type Sample = {id: string; provider: Provider; model: string; evidence: string; realInputTokens: number; denseCharacters: number; otherBytes: number};
const calibration = JSON.parse(readFileSync(new URL("./reservation-calibration.json", import.meta.url), "utf8")) as {
  samples: Sample[];
  o200kCorpus: {largestRateNeeded: number; files: number};
};
const estimate = (sample: Sample) => {
  const rate = inputTokenRates[sample.provider];
  return Math.ceil(sample.denseCharacters * rate.perDenseCharacter + sample.otherBytes * rate.perOtherByte) + REQUEST_OVERHEAD_TOKENS;
};
/** The rate a sample needs so that dense characters at one token each plus other bytes at that rate reach its real count. */
const rateNeeded = (sample: Sample) => (sample.realInputTokens - sample.denseCharacters) / sample.otherBytes;

describe("calibrated input-token rule", () => {
  it("bounds every real usage figure in the repository from above", () => {
    expect(calibration.samples.length).toBeGreaterThanOrEqual(13);
    for (const sample of calibration.samples) expect(estimate(sample), sample.id).toBeGreaterThanOrEqual(sample.realInputTokens);
  });

  it("stays within 20% of the real count on the gc01 baseline requests, and within 70% on small documentary ones", () => {
    for (const sample of calibration.samples) {
      const ratio = estimate(sample) / sample.realInputTokens;
      if (sample.realInputTokens > 100_000) expect(ratio, sample.id).toBeLessThan(1.2);
      else if (sample.provider === "anthropic") expect(ratio, sample.id).toBeLessThan(1.7);
    }
  });

  it("keeps the Anthropic rate at least 20% above the rate the most demanding real request needs", () => {
    const anthropic = calibration.samples.filter((sample) => sample.provider === "anthropic");
    const needed = Math.max(...anthropic.map(rateNeeded));
    expect(needed).toBeCloseTo(0.3614, 4);
    expect(inputTokenRates.anthropic.perOtherByte / needed).toBeGreaterThanOrEqual(1.2);
  });

  it("keeps the OpenAI rate above the largest o200k rate the repository's corpora need", () => {
    expect(calibration.o200kCorpus.files).toBeGreaterThanOrEqual(300);
    expect(inputTokenRates.openai.perOtherByte / calibration.o200kCorpus.largestRateNeeded).toBeGreaterThanOrEqual(1.1);
  });

  it("never counts more than one token per byte, the ceiling of byte-level tokenizers", () => {
    for (const rate of Object.values(inputTokenRates)) {
      expect(rate.perDenseCharacter).toBeLessThanOrEqual(1);
      expect(rate.perOtherByte).toBeLessThan(1);
    }
  });
});
