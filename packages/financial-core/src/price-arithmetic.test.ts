import {describe, expect, it} from "vitest";

import {
  annualizeCostInBasisPoints, calculateCostDifference, calculateObservationWeight, calculateRecencyFactor, calculateTenorWindow, composeCdiPlusBasisPoints,
  scoreComparability, selectWeightedQuantiles, shiftSpreadBand, sumBasisPoints, testObservationWindows, testSpreadNormalization,
} from "./price-arithmetic";

describe("the price reference's arithmetic", () => {
  it("sums basis points exactly, fractional ones included, with its trace", () => {
    expect(sumBasisPoints({values: [40, -20, 75]}).value).toBe("95");
    // Binary numbers would say 0.30000000000000004.
    expect(sumBasisPoints({values: [0.1, 0.2]}).value).toBe("0.3");
    expect(sumBasisPoints({values: []}).value).toBe("0");
    expect(sumBasisPoints({values: ["12.5", 0.25]}).trace).toEqual({id: "price.basis_points_sum", formula: "sum of the basis points, in the order given", operands: {bps1: "12.5", bps2: "0.25"}, result: "12.75"});
    expect(() => sumBasisPoints({values: [Number.NaN]})).toThrow(RangeError);
    expect(() => sumBasisPoints({values: ["Infinity"]})).toThrow(RangeError);
  });

  it("moves both ends of a band by the sum of its adjustments and keeps its width", () => {
    const band = shiftSpreadBand({minBps: 280, maxBps: 400, adjustmentsBps: [40, -60, 35]});
    expect(band).toMatchObject({shift: "15", min: "295", max: "415", width: "120"});
    const fractional = shiftSpreadBand({minBps: 0, maxBps: 120, adjustmentsBps: [0.1, 0.2]});
    expect(fractional).toMatchObject({min: "0.3", max: "120.3", width: "120"});
    expect(band.trace.id).toBe("price.spread_band");
  });

  it("composes CDI and a spread in basis points as the indentures accrue them, never their sum", () => {
    // (1 + 10,5%) x (1 + 2,80%) - 1 = 13,594%, not 13,30%.
    const composed = composeCdiPlusBasisPoints({annualCdi: "0.105", spreadBps: 280});
    expect(composed.value).toBe("0.13594");
    expect(composed.spreadRate).toBe("0.028");
    expect(composeCdiPlusBasisPoints({annualCdi: "0.105", spreadBps: -250}).value).toBe("0.077375");
    expect(composed.trace.id).toBe("price.cdi_plus_basis_points");
    expect(() => composeCdiPlusBasisPoints({annualCdi: "0.105", spreadBps: "0x10"})).toThrow(RangeError);
  });

  it("holds the normalization identity within the tolerance, the tolerance itself included, on decimal sums", () => {
    // 0,1 + 0,2 + 0,01 against 0,3 is a gap of exactly 0,01: binary numbers read 0,010000000000000064.
    expect(testSpreadNormalization({componentsBps: [0.1, 0.2, 0.01, 0, 0], normalizedBps: 0.3, toleranceBps: "0.01"})).toMatchObject({sum: "0.31", gap: "0.01", holds: true});
    expect(testSpreadNormalization({componentsBps: [280.25, 12.5, 5.125, 0.02, 2.125], normalizedBps: 300, toleranceBps: "0.01"})).toMatchObject({gap: "0.02", holds: false});
    expect(() => testSpreadNormalization({componentsBps: [1], normalizedBps: 1, toleranceBps: "-0.01"})).toThrow(RangeError);
  });

  it("annualizes a cost over the weighted average life and the ticket, half-up to two decimals", () => {
    // (120.000 + 400.000 / 3,5) / 40.000.000 x 10.000 = 58,571... basis points a year.
    expect(annualizeCostInBasisPoints({annualAmount: "120000", oneTimeAmount: "400000", weightedAverageLifeYears: "3.5", ticket: "40000000"}).value).toBe("58.57");
    expect(annualizeCostInBasisPoints({oneTimeAmount: "85000.5", weightedAverageLifeYears: "2.75", ticket: "40000000"}).value).toBe("7.73");
    expect(() => annualizeCostInBasisPoints({annualAmount: "1", weightedAverageLifeYears: "0", ticket: "1"})).toThrow(RangeError);
  });
});

describe("the governed sample's arithmetic (stage 19, third polish)", () => {
  it("bounds the tenor window by the floor, the share of the target and the largest gap", () => {
    expect(calculateTenorWindow({targetMonths: 48, maxDeltaMonths: 12, floorMonths: 6, relativeToTarget: "0.5"}).value).toBe("12");
    expect(calculateTenorWindow({targetMonths: 18, maxDeltaMonths: 12, floorMonths: 6, relativeToTarget: "0.5"}).value).toBe("9");
    expect(calculateTenorWindow({targetMonths: 6, maxDeltaMonths: 12, floorMonths: 6, relativeToTarget: "0.5"}).value).toBe("6");
    expect(calculateTenorWindow({targetMonths: 27, maxDeltaMonths: 36, floorMonths: 0, relativeToTarget: "0.3333"}).trace).toMatchObject({id: "price.tenor_window", result: "8.9991"});
  });

  it("admits an observation by its tenor gap and its amount ratio, and refuses amounts that are not positive", () => {
    const inside = testObservationWindows({observationTenorMonths: 36, targetTenorMonths: 48, tenorWindowMonths: "12", observationAmount: "20000000", targetAmount: "40000000", minAmountRatio: "0.5", maxAmountRatio: "2"});
    expect(inside).toMatchObject({tenorDeltaMonths: "12", tenorInsideWindow: true, amountsPositive: true, amountRatio: "0.5", amountInsideWindow: true});
    const outside = testObservationWindows({observationTenorMonths: 61, targetTenorMonths: 48, tenorWindowMonths: "12", observationAmount: "80400000", targetAmount: "40000000", minAmountRatio: "0.5", maxAmountRatio: "2"});
    expect(outside).toMatchObject({tenorDeltaMonths: "13", tenorInsideWindow: false, amountRatio: "2.01", amountInsideWindow: false});
    expect(testObservationWindows({observationTenorMonths: 48, targetTenorMonths: 48, tenorWindowMonths: "12", observationAmount: "-1", targetAmount: "40000000", minAmountRatio: "0.5", maxAmountRatio: "2"}))
      .toMatchObject({amountsPositive: false, amountRatio: null, amountInsideWindow: null});
    expect(() => testObservationWindows({observationTenorMonths: Number.NaN, targetTenorMonths: 48, tenorWindowMonths: "12", observationAmount: "1", targetAmount: "1", minAmountRatio: "0.5", maxAmountRatio: "2"})).toThrow(RangeError);
  });

  it("decays recency linearly between the full-weight age and the lapse, half-up to six decimals", () => {
    expect(calculateRecencyFactor({ageDays: 90, fullWeightDays: 90, zeroWeightDays: 150}).value).toBe("1");
    expect(calculateRecencyFactor({ageDays: 100, fullWeightDays: 90, zeroWeightDays: 150}).value).toBe("0.833333");
    expect(calculateRecencyFactor({ageDays: 149, fullWeightDays: 90, zeroWeightDays: 150}).value).toBe("0.016667");
    expect(calculateRecencyFactor({ageDays: 150, fullWeightDays: 90, zeroWeightDays: 150}).value).toBe("0");
    expect(() => calculateRecencyFactor({ageDays: 1, fullWeightDays: 90, zeroWeightDays: 90})).toThrow(RangeError);
  });

  it("scores comparability and weighs an observation exactly", () => {
    const score = scoreComparability({dimensions: [
      {dimension: "security", weight: "0.25", similarity: "1"}, {dimension: "tenor", weight: "0.15", similarity: "0.8"}, {dimension: "sector", weight: "0.10", similarity: "0.3"},
    ]});
    expect(score.value).toBe("0.4");
    expect(score.trace.operands).toEqual({security: "0.25 x 1", tenor: "0.15 x 0.8", sector: "0.1 x 0.3"});
    expect(calculateObservationWeight({recency: "0.833333", score: "0.915"}).value).toBe("0.762499695");
  });

  it("selects weighted quantiles by cumulative weight, ties of value broken by id", () => {
    const entries = [{id: "d", value: 300, weight: "1"}, {id: "c", value: 300, weight: "1"}, {id: "b", value: 250, weight: "1"}, {id: "a", value: 350, weight: "1"}];
    const {selected} = selectWeightedQuantiles({entries, quantiles: ["0.25", "0.5", "0.75"]});
    // Ordered b, c, d, a: a cumulative weight of exactly 2 reaches the median at c, not d.
    expect(selected.map((entry) => entry.id)).toEqual(["b", "c", "d"]);
    expect(selected.map((entry) => entry.index)).toEqual([2, 1, 0]);
    const weighted = selectWeightedQuantiles({entries: [{id: "x", value: 100, weight: "0.1"}, {id: "y", value: 200, weight: "0.9"}], quantiles: ["0.25"]});
    expect(weighted.selected[0]!.id).toBe("y");
    expect(() => selectWeightedQuantiles({entries: [], quantiles: ["0.5"]})).toThrow(RangeError);
  });

  it("measures the proposed all-in against the current cost", () => {
    expect(calculateCostDifference({proposed: "0.139255", current: "0.13"}).value).toBe("0.009255");
    expect(calculateCostDifference({proposed: "0.13", current: "0.1370005"}).trace).toMatchObject({id: "price.cost_difference", result: "-0.0070005"});
  });
});
