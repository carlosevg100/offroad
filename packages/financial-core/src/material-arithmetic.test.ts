import {describe, expect, it} from "vitest";

import {
  calculateCustomerConcentration,
  calculateEbitdaAdjustments,
  calculateNewInstrumentAmount,
  presentationFigure,
  presentationNumber,
  testScheduleTieOut,
  tryPresentationNumber,
} from "./material-arithmetic";

describe("material computations", () => {
  it("sizes the new instrument as the covenanted takeout plus the net new money, with its trace", () => {
    const amount = calculateNewInstrumentAmount({covenantedBalance: "17340000", netNewMoney: "24960000"});
    expect(amount.value).toBe("42300000");
    expect(amount.trace).toEqual({
      id: "material.new_instrument_amount",
      formula: "new instrument = covenanted balance taken out + net new money",
      operands: {covenantedBalance: "17340000", netNewMoney: "24960000"},
      result: "42300000",
    });
    // Exact beyond binary floating point: 0.1 + 0.2 is 0.3, never 0.30000000000000004.
    expect(calculateNewInstrumentAmount({covenantedBalance: "0.1", netNewMoney: "0.2"}).value).toBe("0.3");
    expect(calculateNewInstrumentAmount({covenantedBalance: "123456789012345678.91", netNewMoney: "0.09"}).value).toBe("123456789012345679");
    expect(() => calculateNewInstrumentAmount({covenantedBalance: "", netNewMoney: "1"})).toThrow(RangeError);
    expect(() => calculateNewInstrumentAmount({covenantedBalance: "1", netNewMoney: "Infinity"})).toThrow(RangeError);
  });

  it("sums the leading shares in the declared ranking and ranks by share, the first listed winning a tie", () => {
    const shares = [
      {id: "c1", share: "0.181"}, {id: "c2", share: "0.12"}, {id: "c3", share: "0.095"},
      {id: "c4", share: "0.181"}, {id: "c5", share: "0.05"}, {id: "c6", share: "0.04"},
    ];
    const concentration = calculateCustomerConcentration({shares, leading: 5});
    expect(concentration.leadingTotal).toBe("0.627");
    expect(concentration.largest).toEqual({id: "c1", share: "0.181"});
    expect(concentration.ranking).toEqual(["c1", "c4", "c2", "c3", "c5", "c6"]);
    expect(concentration.trace).toMatchObject({id: "material.customer_concentration", operands: {leading: "5", c4: "0.181"}, result: "leadingTotal=0.627; largest=c1:0.181"});
    // Fewer customers than the leading count: all of them.
    expect(calculateCustomerConcentration({shares: shares.slice(0, 2), leading: 5}).leadingTotal).toBe("0.301");
    // Values that binary floating point cannot tell apart are still ordered exactly.
    expect(calculateCustomerConcentration({shares: [{id: "a", share: "0.30000000000000000001"}, {id: "b", share: "0.30000000000000000002"}], leading: 5}).ranking).toEqual(["b", "a"]);
    expect(calculateCustomerConcentration({shares: [], leading: 5})).toMatchObject({leadingTotal: "0", largest: null, ranking: []});
    expect(() => calculateCustomerConcentration({shares: [{id: "x", share: "n/d"}], leading: 5})).toThrow(RangeError);
    expect(() => calculateCustomerConcentration({shares, leading: 0})).toThrow(RangeError);
  });

  it("measures EBITDA adjustments as the signed difference and its magnitude", () => {
    expect(calculateEbitdaAdjustments({adjustedEbitda: "17420000", reportedEbitda: "16848000"})).toMatchObject({value: "572000", magnitude: "572000"});
    const negative = calculateEbitdaAdjustments({adjustedEbitda: "16000000.5", reportedEbitda: "16848000"});
    expect(negative).toMatchObject({value: "-847999.5", magnitude: "847999.5"});
    expect(negative.trace).toMatchObject({id: "material.ebitda_adjustments", operands: {adjustedEbitda: "16000000.5", reportedEbitda: "16848000"}});
  });

  it("ties the debt schedule to the balance sheet within the tolerance, the limit itself included", () => {
    expect(testScheduleTieOut({scheduleGap: "6820000", totalOnBalance: "45320000", tolerance: "0.02"}))
      .toMatchObject({outcome: "outside_tolerance", magnitude: "6820000", limit: "906400", side: "balance_above_schedule"});
    expect(testScheduleTieOut({scheduleGap: "400000", totalOnBalance: "38900000", tolerance: "0.02"}))
      .toMatchObject({outcome: "within_tolerance", limit: "778000", side: "balance_above_schedule"});
    expect(testScheduleTieOut({scheduleGap: "-2500000", totalOnBalance: "36000000", tolerance: "0.02"}))
      .toMatchObject({outcome: "outside_tolerance", magnitude: "2500000", side: "schedule_above_balance"});
    const atLimit = testScheduleTieOut({scheduleGap: "-778000", totalOnBalance: "38900000", tolerance: "0.02"});
    expect(atLimit.outcome).toBe("within_tolerance");
    expect(atLimit.trace).toMatchObject({id: "material.schedule_tie_out", result: "within_tolerance"});
    expect(() => testScheduleTieOut({scheduleGap: "1", totalOnBalance: "1", tolerance: "-0.02"})).toThrow(RangeError);
  });
});

describe("material presentation conversions", () => {
  it("scales exactly and rounds half away from zero on the decimal value", () => {
    expect(presentationFigure({value: "0.627", scale: "percent", decimals: 1}).value).toBe("62.7");
    expect(presentationFigure({value: "6820000", scale: "millions", decimals: 1}).value).toBe("6.8");
    expect(presentationFigure({value: "71000000", scale: "millions", decimals: 0}).value).toBe("71");
    expect(presentationFigure({value: 370, scale: "basis_points_as_percent", decimals: 2}).value).toBe("3.70");
    expect(presentationFigure({value: "0.105", scale: "percent"}).value).toBe("10.5");
    // A tie on the decimal value rounds up. Binary floating point stores 1.005 as 1.00499999... and
    // `Number("1.005").toFixed(2)` prints 1.00; the kernel prints what the value says.
    expect(presentationFigure({value: "1.005", decimals: 2}).value).toBe("1.01");
    expect(Number("1.005").toFixed(2)).toBe("1.00");
    expect(presentationFigure({value: "2.675", decimals: 2}).value).toBe("2.68");
    expect(presentationFigure({value: "-0.125", decimals: 2}).value).toBe("-0.13");
    // Ties that binary floating point represents exactly agree with the float path.
    expect(presentationFigure({value: "3.125", decimals: 2}).value).toBe(Number("3.125").toFixed(2));
    expect(presentationFigure({value: "-1.5", decimals: 2}).value).toBe("-1.50");
    expect(presentationFigure({value: "42500000", scale: "millions", decimals: 0}).value).toBe("43");
    expect(presentationFigure({value: "1.23456789", decimals: 2}).trace).toEqual({
      id: "material.presentation_figure", formula: "value, half-up to 2 decimals", operands: {value: "1.23456789", scale: "unit"}, result: "1.23",
    });
    expect(() => presentationFigure({value: "1", decimals: -1})).toThrow(RangeError);
    expect(() => presentationFigure({value: "abc", decimals: 2})).toThrow(RangeError);
  });

  it("hands the exact decimal to the binary number the display needs, as Number reads decimal text", () => {
    for (const text of ["18760000", "12450000.75", "-3290000.4", "0.181", "-0", "1e3", "123456789.123456789"]) {
      expect(presentationNumber(text).value).toBe(Number(text));
    }
    expect(presentationNumber("12450000.75").trace).toEqual({id: "material.presentation_number", formula: "nearest binary64 number to the decimal", operands: {value: "12450000.75"}, result: "12450000.75"});
    for (const text of ["", " 12 ", "n/d", "0x1A", "1_000", "Infinity", "NaN"]) {
      expect(() => presentationNumber(text), JSON.stringify(text)).toThrow(RangeError);
      expect(tryPresentationNumber(text), JSON.stringify(text)).toBeNull();
    }
    expect(tryPresentationNumber("33000000")?.value).toBe(33000000);
  });
});
