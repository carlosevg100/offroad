import {describe, expect, it} from "vitest";

import {annualizeCostInBasisPoints, composeCdiPlusBasisPoints, shiftSpreadBand, sumBasisPoints, testSpreadNormalization} from "./price-arithmetic";

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
