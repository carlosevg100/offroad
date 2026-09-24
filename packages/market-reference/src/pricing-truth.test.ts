import {describe, expect, it} from "vitest";

import {buildPricingTruthSet, type PricingObservation, type PricingPolicy, type PricingTarget} from "./pricing-truth";

const policy: PricingPolicy = {
  version: "pricing-policy-2026-08",
  asOf: "2026-08-25",
  regime: "brl-cdi-2026-h2",
  status: "active",
  minObservations: 3,
  minDistinctSources: 3,
  minQuality: 0.8,
  maxTenorDeltaMonths: 12,
  minAmountRatio: "0.5",
  maxAmountRatio: "2",
  minBandWidthBps: 60,
  maxBandWidthBps: 250,
};

const target: PricingTarget = {
  instrument: "ccb",
  rating: "adequate",
  cdi: "0.105",
  tenorMonths: 48,
  securityClass: "senior_secured",
  amortizationClass: "quarterly_sculpted",
  sectorGroup: "consumer",
  amount: "40000000",
  indexer: "cdi",
  indexerRationale: "Operating cash flows and the target buyer base are referenced to CDI.",
  targetBuyer: "Brazilian private credit funds",
  expectedSpreadBps: 300,
  currentAllIn: "0.13",
};

const observation = (id: string, spread: number, sourceId = `source-${id}`): PricingObservation => ({
  id,
  sourceId,
  sourceOwner: "market-desk",
  sourceKind: "direct_manager_confirmation",
  confidentiality: "aggregated_confidential",
  observedOn: "2026-08-10",
  validUntil: "2026-09-10",
  status: "term",
  instrument: "ccb",
  rating: "adequate",
  normalizedSpreadBps: spread,
  normalizationMethod: "CDI spread observed directly",
  tenorMonths: 48,
  securityClass: "senior_secured",
  amortizationClass: "quarterly_sculpted",
  sectorGroup: "consumer",
  amount: "40000000",
  regime: "brl-cdi-2026-h2",
  quality: 0.9,
  aggregateAuthorized: true,
  economics: {quotedSpreadBps: spread, feeBps: 0, oidBps: 0, warrantBps: 0, hedgeBps: 0},
});

describe("governed pricing truth", () => {
  it("produces an observed band only from a sufficient valid and comparable sample", () => {
    const truth = buildPricingTruthSet({
      target,
      policy,
      observations: [observation("a", 310), observation("b", 370), observation("c", 410)],
      costs: [{id: "legal", label: "Legal", sourceId: "proposal-1", validUntil: "2026-09-30", oneTimeAmount: "400000"}],
      weightedAverageLifeYears: "2.5",
    });
    expect(truth.decision).toBe("reference_available");
    expect(truth.indicativePrice?.bps).toEqual({min: 310, max: 410});
    expect(truth.indicativePrice?.provenance).toMatchObject({kind: "observed", sample: 3});
    expect(truth.allIn.annualizedCostBps).toBe(40);
    // (1 + 10,5%) × (1 + 3,10%) - 1 and (1 + 10,5%) × (1 + 4,10%) - 1; costs join the spread before composing.
    expect(truth.indicativePrice?.allIn).toEqual({min: "0.139255", max: "0.150305", cdi: "0.105000"});
    expect(truth.allIn.totalRate).toEqual({min: "0.143675", max: "0.154725"});
    expect(truth.procedureCoverage).toHaveLength(13);
    expect(truth.procedureCoverage.map((entry) => entry.procedureId)).toEqual(Array.from({length: 13}, (_, index) => `PR-${String(index + 1).padStart(2, "0")}`));
  });

  it("composes CDI and spread as the B3 formula book does: CDI 13,65% plus 3% is 17,0595%, not 16,65%", () => {
    const truth = buildPricingTruthSet({
      target: {...target, cdi: "0.1365"},
      policy,
      observations: [observation("a", 300), observation("b", 340), observation("c", 380)],
    });
    expect(truth.indicativePrice?.bps).toEqual({min: 300, max: 380});
    expect(truth.indicativePrice?.allIn.min).toBe("0.170595");
    // The linear sum would have been 0,166500: 40,95 basis points below the rate the indenture accrues.
    expect(Number(truth.indicativePrice?.allIn.min) - (0.1365 + 0.03)).toBeCloseTo(0.004095, 9);
  });

  it("abstains when the sample is small or not independent", () => {
    const truth = buildPricingTruthSet({target, policy, observations: [observation("a", 310, "same"), observation("b", 370, "same"), observation("c", 410, "same")]});
    expect(truth.decision).toBe("abstain");
    expect(truth.indicativePrice).toBeNull();
    expect(truth.exceptions.map((entry) => entry.id)).toContain("insufficient-independent-sources");
    expect(truth.procedureCoverage.find((entry) => entry.procedureId === "PR-07")?.status).toBe("blocked");
  });

  it("excludes expired and structurally incomparable observations instead of adjusting them silently", () => {
    const expired = {...observation("expired", 300), validUntil: "2026-08-01"};
    const unsecured = {...observation("unsecured", 500), securityClass: "unsecured"};
    const truth = buildPricingTruthSet({target, policy, observations: [expired, unsecured, observation("a", 310), observation("b", 370)]});
    expect(truth.decision).toBe("abstain");
    expect(truth.sample.rejected).toEqual(expect.arrayContaining([
      expect.objectContaining({id: "expired", reasons: expect.arrayContaining(["expired"])}),
      expect.objectContaining({id: "unsecured", reasons: expect.arrayContaining(["different_security"])}),
    ]));
  });

  it("blocks a deceptively narrow range rather than publishing false precision", () => {
    const truth = buildPricingTruthSet({target, policy, observations: [observation("a", 350), observation("b", 360), observation("c", 370)]});
    expect(truth.decision).toBe("abstain");
    expect(truth.exceptions.map((entry) => entry.id)).toContain("band-too-narrow");
  });

  it("invalidates the full cell after a recorded regime shock", () => {
    const truth = buildPricingTruthSet({
      target,
      policy: {...policy, status: "invalidated"},
      observations: [observation("a", 310), observation("b", 370), observation("c", 410)],
    });
    expect(truth.decision).toBe("abstain");
    expect(truth.exceptions.map((entry) => entry.id)).toContain("pricing-regime-invalidated");
  });

  it("abstains instead of presenting an IPCA or fixed-rate case as CDI", () => {
    const truth = buildPricingTruthSet({
      target: {...target, indexer: "ipca"},
      policy,
      observations: [observation("a", 310), observation("b", 370), observation("c", 410)],
    });
    expect(truth.decision).toBe("abstain");
    expect(truth.indicativePrice).toBeNull();
    expect(truth.missingInputs).toContain("pricing.supported_indexer_curve");
    expect(truth.exceptions.map((entry) => entry.id)).toContain("unsupported-indexer-curve");
  });

  it("rejects a warrant or fee normalization whose components do not tie", () => {
    const warrant = {
      ...observation("warrant", 460),
      economics: {quotedSpreadBps: 320, feeBps: 30, oidBps: 10, warrantBps: 80, hedgeBps: 10},
    };
    const truth = buildPricingTruthSet({target, policy, observations: [warrant, observation("b", 370), observation("c", 410)]});
    expect(truth.sample.rejected).toContainEqual(expect.objectContaining({id: "warrant", reasons: expect.arrayContaining(["normalization_identity_failed"])}));
    expect(truth.decision).toBe("abstain");
  });
});
