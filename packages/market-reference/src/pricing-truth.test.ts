import {describe, expect, it} from "vitest";

import {buildPricingTruthSet, tenorWindowMonths, type PricingObservation, type PricingPolicy, type PricingTarget} from "./pricing-truth";

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
    expect(truth.abstention).toEqual({
      reason: "sem_base_suficiente",
      pt: "Sem base suficiente: 3 observações comparáveis de 1 origens; a política exige 3 observações de 3 origens.",
      en: "Insufficient basis: 3 comparable observations from 1 sources; the policy requires 3 observations from 3 sources.",
    });
  });

  it("says there is no sufficient basis below the minimum sample and publishes no band", () => {
    const truth = buildPricingTruthSet({target, policy, observations: [observation("a", 310), observation("b", 370)]});
    expect(truth.decision).toBe("abstain");
    expect(truth.indicativePrice).toBeNull();
    expect(truth.abstention?.reason).toBe("sem_base_suficiente");
    expect(truth.abstention?.pt).toContain("Sem base suficiente: 2 observações comparáveis de 2 origens");
    expect(truth.exceptions.map((entry) => entry.id)).toContain("insufficient-observations");
    // The sample statistics stay visible for the reviewer even when no band is published.
    expect(truth.sample.quantiles).toEqual({p25: 310, p50: 310, p75: 370});
    const empty = buildPricingTruthSet({target, policy, observations: []});
    expect(empty.abstention?.reason).toBe("sem_base_suficiente");
    expect(buildPricingTruthSet({target: null, policy, observations: [observation("a", 310)]}).abstention?.reason).toBe("sem_alvo_ou_politica");
  });

  it("takes the band from the weighted P25 to P75, so one outlier no longer sets an edge", () => {
    const observations = [observation("a", 250), observation("b", 300), observation("c", 340), observation("d", 380), observation("e", 520)];
    const truth = buildPricingTruthSet({target, policy, observations});
    // Minimum to maximum would have been 250 to 520, 270 bps wide, above the 250 bps ceiling: no reference at all.
    expect(truth.decision).toBe("reference_available");
    expect(truth.sample.quantiles).toEqual({p25: 300, p50: 340, p75: 380});
    expect(truth.indicativePrice?.bps).toEqual({min: 300, max: 380});
    expect(truth.indicativePrice?.base.bps).toEqual({min: 300, max: 380});
    // (1 + 10,5%) × (1 + 3,00%) - 1 and (1 + 10,5%) × (1 + 3,80%) - 1.
    expect(truth.indicativePrice?.allIn).toEqual({min: "0.138150", max: "0.146990", cdi: "0.105000"});
    expect(truth.abstention).toBeNull();
    expect(truth.procedureCoverage.find((entry) => entry.procedureId === "PR-02")?.result).toMatchObject({medianBps: 340});
    // Governed adjustments shift the quartile band; they never widen it back to the extremes.
    const shifted = buildPricingTruthSet({target, policy, observations, adjustments: [{id: "security", bps: -20, rationale: {pt: "cessão com trava", en: "locked receivables assignment"}, sourceId: "grid-2026-08", observedOn: "2026-08-01", validUntil: "2026-09-30"}]});
    expect(shifted.indicativePrice?.bps).toEqual({min: 280, max: 360});
  });

  it("weighs sector and amortization instead of excluding them", () => {
    const otherSectorBullet = {...observation("d", 280), sectorGroup: "industrial", amortizationClass: "bullet"};
    const sacVersusSculpted = {...observation("e", 330), amortizationClass: "sac"};
    const truth = buildPricingTruthSet({target, policy, observations: [observation("a", 300), observation("b", 340), observation("c", 380), otherSectorBullet, sacVersusSculpted]});
    expect(truth.sample.rejected).toEqual([]);
    const weight = (id: string) => truth.sample.weights.find((entry) => entry.id === id);
    // 0,25 + 0,25 + 0,15 exact, 0,15 tenor, 0,10 × 0,3 other sector, 0,05 size, 0,05 × 0,5 bullet against an amortizing target.
    expect(weight("d")).toEqual({id: "d", recency: "1", score: "0.905", weight: "0.905"});
    // SAC against a sculpted schedule stays in the amortizing family: 0,05 × 0,9.
    expect(weight("e")).toEqual({id: "e", recency: "1", score: "0.995", weight: "0.995"});
    expect(weight("a")).toEqual({id: "a", recency: "1", score: "1", weight: "1"});
    // The lighter observation at the low end moves P25 off it: 280 carries 0,905 of the 4,9 total weight.
    expect(truth.sample.quantiles).toEqual({p25: 300, p50: 330, p75: 340});
  });

  it("uses a tenor window proportional to the target, capped by the policy", () => {
    expect(tenorWindowMonths(48, policy).toString()).toBe("12");
    expect(tenorWindowMonths(18, policy).toString()).toBe("9");
    expect(tenorWindowMonths(12, policy).toString()).toBe("6");
    expect(tenorWindowMonths(6, policy).toString()).toBe("6");
    const short = {...target, tenorMonths: 12};
    const at = (id: string, spread: number, tenorMonths: number) => ({...observation(id, spread), tenorMonths});
    const truth = buildPricingTruthSet({target: short, policy, observations: [at("a", 300, 12), at("b", 340, 16), at("c", 380, 9), at("d", 420, 20)]});
    // Eight months from a twelve-month target is outside a six-month window; the old fixed twelve would have kept it.
    expect(truth.sample.rejected).toEqual([{id: "d", reasons: ["tenor_outside_window"]}]);
    expect(truth.indicativePrice?.bps).toEqual({min: 300, max: 380});
    const long = buildPricingTruthSet({target, policy, observations: [observation("a", 300), observation("b", 340), {...observation("c", 380), tenorMonths: 56}]});
    expect(long.sample.rejected).toEqual([]);
    // Eight months from a 48-month target is inside the window and scores 0,15 × 0,8 on tenor.
    expect(long.sample.weights.find((entry) => entry.id === "c")?.score).toBe("0.97");
  });

  it("decays old observations by source kind and never counts an observation dated after the policy", () => {
    const aged = (id: string, spread: number, observedOn: string, sourceKind: PricingObservation["sourceKind"]) => ({...observation(id, spread), observedOn, validUntil: "2026-09-30", sourceKind});
    const truth = buildPricingTruthSet({
      target,
      policy,
      observations: [
        observation("a", 300),
        aged("b", 400, "2026-03-28", "term_sheet"),
        aged("c", 360, "2026-03-28", "public_closing"),
        aged("d", 320, "2026-02-06", "indication"),
        aged("e", 330, "2026-09-01", "term_sheet"),
        aged("f", 350, "2026-04-17", "public_closing"),
      ],
    });
    // 150 days old: a term sheet keeps (180 - 150) / 60 = 0,5; a public closing is already at zero.
    expect(truth.sample.weights).toEqual([
      {id: "a", recency: "1", score: "1", weight: "1"},
      {id: "b", recency: "0.5", score: "1", weight: "0.5"},
      {id: "f", recency: "0.333333", score: "1", weight: "0.333333"},
    ]);
    expect(truth.sample.rejected).toEqual([
      {id: "c", reasons: ["outside_recency_window"]},
      {id: "d", reasons: ["outside_recency_window"]},
      {id: "e", reasons: ["observed_after_as_of"]},
    ]);
    expect(truth.indicativePrice?.bps).toEqual({min: 300, max: 400});
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
    expect(truth.abstention?.reason).toBe("banda_abaixo_do_piso");
  });

  it("invalidates the full cell after a recorded regime shock", () => {
    const truth = buildPricingTruthSet({
      target,
      policy: {...policy, status: "invalidated"},
      observations: [observation("a", 310), observation("b", 370), observation("c", 410)],
    });
    expect(truth.decision).toBe("abstain");
    expect(truth.exceptions.map((entry) => entry.id)).toContain("pricing-regime-invalidated");
    expect(truth.abstention?.reason).toBe("regime_invalidado");
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
    expect(truth.abstention?.reason).toBe("indexador_sem_curva");
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
