import Decimal from "decimal.js";
import {describe, expect, it} from "vitest";
import {calculateRelativeDebtCostBridge, calculateDebtCostAction, type debtCostActionInputSchema} from "./relative-debt-cost";
import {presentationFigure} from "./material-arithmetic";
import type {z} from "zod";

const families = ["pricing_date", "tenor", "guarantee", "instrument_distribution", "scale"] as const;
const bridge = () => ({ownSpreadBps: "260", peerSpreadBps: "135", pricingBasis: "same_indexer_quoted_spread" as const,
  ownIndexer: "CDI", peerIndexer: "CDI", curveVersion: null, coverage: "complete_scoped_bridge" as const,
  adjustments: ["60", "-10", "-15", "20", "15"].map((bps, n) => ({id: `synthetic-${n}`, family: families[n]!, bps,
    evidenceAnchor: `synthetic-market-object:${n}`, methodologyVersion: "synthetic-adopted-estimate-v1", independentEffectGroup: families[n]!}))});
const action = (): z.infer<typeof debtCostActionInputSchema> => ({actionId: "synthetic-refinancing", currency: "BRL",
  convention: "marginal_spread_budget_estimate", currentSpreadBps: "260", proposedSpreadBps: "190",
  exposure: [{id: "synthetic-remaining-principal", startDate: "2026-05-01", endDate: "2027-06-01", affectedPrincipal: "40000000",
    yearFraction: "1.08333333333333333333", timeBasis: "adopted_month_fraction", annualIndex: null, evidenceAnchor: "synthetic-contract"}],
  costs: [{id: "synthetic-fee", date: "2026-05-01", amount: "400000", evidenceAnchor: "synthetic-adopted-fee"},
    {id: "synthetic-tax", date: "2026-05-01", amount: "1349200", evidenceAnchor: "synthetic-scenario-tax-not-a-legal-default"}], costCoverage: "complete_for_stated_horizon"});

describe("relative debt cost independent C03 calibration", () => {
  it("reproduces the oracle bridge with signed adjustments and no causal credit attribution", () => {
    const r = calculateRelativeDebtCostBridge(bridge());
    expect(r).toMatchObject({grossBps: "125", knownAdjustmentsBps: "70", residualBps: "55", afterPricingDateBps: "65", causalAttribution: false, creditRating: null});
    expect(r.steps.map(s => s.afterBps)).toEqual(["65", "75", "90", "70", "55"]);
    expect(calculateRelativeDebtCostBridge(bridge())).toEqual(r);
  });
  it("does not fill unknown adjustments or call a limited residual explained credit risk", () => {
    const r = calculateRelativeDebtCostBridge({...bridge(), coverage: "limited_adjustments", adjustments: bridge().adjustments.slice(0, 1)});
    expect(r).toMatchObject({grossBps: "125", knownAdjustmentsBps: "60", unexplainedAfterKnownAdjustmentsBps: "65", residualBps: null, status: "limited_bridge"});
    expect(calculateRelativeDebtCostBridge({...bridge(), coverage: "limited_adjustments", adjustments: []}).afterPricingDateBps).toBeNull();
  });
  it("refuses unlike indexers and unproven equivalent-curve identity", () => {
    expect(() => calculateRelativeDebtCostBridge({...bridge(), peerIndexer: "IPCA"})).toThrow();
    expect(() => calculateRelativeDebtCostBridge({...bridge(), pricingBasis: "equivalent_spread_on_same_dated_curve"})).toThrow();
    expect(() => calculateRelativeDebtCostBridge({...bridge(), curveVersion: "fake-curve"})).toThrow();
    expect(calculateRelativeDebtCostBridge({...bridge(), peerIndexer: "IPCA", pricingBasis: "equivalent_spread_on_same_dated_curve", curveVersion: "adopted-same-curve-v7"}).grossBps).toBe("125");
  });
  it("refuses duplicate or overlapping effects and absent methodology/source anchors", () => {
    for (const key of ["id", "family", "independentEffectGroup"] as const) {
      const i = bridge(); i.adjustments[1] = {...i.adjustments[1]!, [key]: i.adjustments[0]![key]};
      expect(() => calculateRelativeDebtCostBridge(i)).toThrow();
    }
    expect(() => calculateRelativeDebtCostBridge({...bridge(), adjustments: [{...bridge().adjustments[0]!, evidenceAnchor: ""}]})).toThrow();
  });
  it("reproduces both short refinancing estimates under the oracle's explicitly limited convention", () => {
    for (const [reference, expected] of [["190", "0.30"], ["220", "0.17"]]) {
      const r = calculateDebtCostAction({...action(), proposedSpreadBps: reference!});
      expect(presentationFigure({value: r.nominalSavings, scale: "millions", decimals: 2}).value).toBe(expected);
      expect(presentationFigure({value: r.knownCosts, scale: "millions", decimals: 2}).value).toBe("1.75");
      expect(new Decimal(r.netNominalBenefit!).lt(0)).toBe(true); expect(r.isDebtNpv).toBe(false); expect(r.guaranteesRepricing).toBe(false);
    }
  });
  it("reproduces the rating savings/cost range only over the 90 million affected principal", () => {
    const results = [["245", "300000"], ["235", "200000"]].map(([proposedSpreadBps, cost]) => calculateDebtCostAction({...action(), proposedSpreadBps: proposedSpreadBps!,
      exposure: [{...action().exposure[0]!, affectedPrincipal: "90000000", endDate: "2027-05-01", yearFraction: "1"}],
      costs: [{...action().costs[0]!, amount: cost!}]}));
    expect(results.map(r => r.nominalSavings)).toEqual(["135000", "225000"]);
    expect(results.map(r => r.netNominalBenefit)).toEqual(["-165000", "25000"]);
  });
  it("handles changing exposure and retains complete costs without inventing net benefit when unknown", () => {
    const i = action(); i.exposure = [{...i.exposure[0]!, endDate: "2026-11-01", yearFraction: "0.5"},
      {...i.exposure[0]!, id: "second", startDate: "2026-11-01", endDate: "2027-05-01", affectedPrincipal: "20000000", yearFraction: "0.5"}];
    expect(calculateDebtCostAction(i).nominalSavings).toBe("210000");
    expect(calculateDebtCostAction({...i, costCoverage: "incomplete"})).toMatchObject({nominalSavings: "210000", knownCosts: "1749200", netNominalBenefit: null, status: "missing_costs"});
    expect(calculateDebtCostAction({...i, proposedSpreadBps: "290"}).nominalSavings).toBe("-90000");
  });
  it("requires the actual index factor when comparing effective rates", () => {
    const i = action(); i.convention = "effective_rate_difference";
    expect(() => calculateDebtCostAction(i)).toThrow();
    i.exposure[0] = {...i.exposure[0]!, endDate: "2027-05-01", yearFraction: "1", annualIndex: "0.1"};
    expect(calculateDebtCostAction(i).nominalSavings).toBe("308000");
    expect(() => calculateDebtCostAction({...i, convention: "marginal_spread_budget_estimate"})).toThrow();
    // Exact rational factors for a half-year: sqrt(1.44) - sqrt(1.21) = 0.1.
    const half = {...i, currentSpreadBps: "4400", proposedSpreadBps: "2100",
      exposure: [{...i.exposure[0]!, endDate: "2026-11-01", yearFraction: "0.5", annualIndex: "0"}]};
    expect(calculateDebtCostAction(half).nominalSavings).toBe("4000000");
  });
  it("denies calendar disagreement, omitted periods, duplicate costs and incomplete exposure", () => {
    const i = action();
    expect(() => calculateDebtCostAction({...i, exposure: [{...i.exposure[0]!, yearFraction: "1"}]})).toThrow();
    expect(() => calculateDebtCostAction({...i, exposure: [{...i.exposure[0]!, timeBasis: "actual_365_fixed"}]})).toThrow();
    expect(() => calculateDebtCostAction({...i, exposure: [{...i.exposure[0]!, endDate: "2026-05-01"}]})).toThrow();
    expect(() => calculateDebtCostAction({...i, costs: [...i.costs, i.costs[0]!]})).toThrow();
    expect(() => calculateDebtCostAction({...i, costs: [{...i.costs[0]!, date: "2028-01-01"}]})).toThrow();
    expect(() => calculateDebtCostAction({...i, exposure: [{...i.exposure[0]!, affectedPrincipal: "-1"}]})).toThrow();
  });
  it("does not depend on or mutate global Decimal precision", () => {
    const original = Decimal.precision; const expected = calculateRelativeDebtCostBridge(bridge());
    try {Decimal.set({precision: 5}); expect(calculateRelativeDebtCostBridge(bridge())).toEqual(expected); expect(Decimal.precision).toBe(5);}
    finally {Decimal.set({precision: original});}
  });
});
