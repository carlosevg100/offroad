import {describe, expect, it} from "vitest";

import Decimal from "decimal.js";

import {
  calculateCustomerConcentration,
  calculateEbitdaAdjustments,
  calculateEnlargedTicket,
  calculateLeverageAfterStructure,
  calculateNetNewMoney,
  calculateNewInstrumentAmount,
  calculateSpreadDifference,
  compareFigures,
  presentationAmount,
  presentationFigure,
  presentationNumber,
  presentationSpread,
  selectHeaviestScheduleYear,
  testCovenantCeiling,
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

  it("measures how far one spread sits from another in basis points, exactly and with its trace", () => {
    expect(calculateSpreadDifference({spreadBps: 475, referenceBps: 440})).toEqual({
      value: "35",
      trace: {id: "material.spread_difference", formula: "difference = spread - reference spread, in basis points", operands: {spreadBps: "475", referenceBps: "440"}, result: "35"},
    });
    expect(calculateSpreadDifference({spreadBps: 375, referenceBps: 415}).value).toBe("-40");
    expect(calculateSpreadDifference({spreadBps: 415, referenceBps: 415}).value).toBe("0");
    // Fractional basis points subtract exactly: binary floating point makes 372.3 - 370.1 into 2.1999999999999886.
    expect(calculateSpreadDifference({spreadBps: 372.3, referenceBps: 370.1}).value).toBe("2.2");
    expect(372.3 - 370.1).not.toBe(2.2);
    expect(calculateSpreadDifference({spreadBps: "500.5", referenceBps: "400"}).value).toBe("100.5");
    for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY, "", "n/d"]) {
      expect(() => calculateSpreadDifference({spreadBps: invalid, referenceBps: 400}), String(invalid)).toThrow(RangeError);
      expect(() => calculateSpreadDifference({spreadBps: 400, referenceBps: invalid}), String(invalid)).toThrow(RangeError);
    }
  });
});

describe("the operation verdict's computations", () => {
  it("states the net new money as the ticket less the debt it redeems, with its trace", () => {
    expect(calculateNetNewMoney({ticket: "42300000", refinancing: "0"})).toEqual({
      value: "42300000",
      trace: {id: "material.net_new_money", formula: "net new money = ticket - existing debt redeemed at disbursement", operands: {ticket: "42300000", refinancing: "0"}, result: "42300000"},
    });
    expect(calculateNetNewMoney({ticket: "800000000", refinancing: "600000000"}).value).toBe("200000000");
    expect(calculateNetNewMoney({ticket: "700000000", refinancing: "700000000"}).value).toBe("0");
    // A refinancing larger than the ticket is stated, not hidden.
    expect(calculateNetNewMoney({ticket: "1", refinancing: "1.5"}).value).toBe("-0.5");
    expect(() => calculateNetNewMoney({ticket: "42300000", refinancing: ""})).toThrow(RangeError);
  });

  it("enlarges the ticket and the debt it redeems by the principal of the year it clears", () => {
    const bigger = calculateEnlargedTicket({ticket: "42300000", refinancing: "0", principalDue: "29011238.05"});
    expect(bigger).toMatchObject({ticket: "71311238.05", refinancing: "29011238.05"});
    expect(bigger.trace).toEqual({
      id: "material.enlarged_ticket",
      formula: "enlarged ticket = ticket + principal due; enlarged refinancing = refinancing + principal due",
      operands: {ticket: "42300000", refinancing: "0", principalDue: "29011238.05"},
      result: "ticket=71311238.05; refinancing=29011238.05",
    });
    expect(() => calculateEnlargedTicket({ticket: "1", refinancing: "0", principalDue: "n/d"})).toThrow(RangeError);
  });

  it("measures leverage after a structure, half-up at the stated decimals, and refuses to invent it over a zero EBITDA", () => {
    const leverage = calculateLeverageAfterStructure({netDebt: "37360000", ticket: "42300000", redeemed: "0", ebitda: "16848000", decimals: 4});
    expect(leverage.value).toBe("4.7282");
    expect(leverage.trace).toEqual({
      id: "material.leverage_after_structure",
      formula: "leverage = (net debt + ticket - redeemed) / EBITDA, half-up to 4 decimals",
      operands: {netDebt: "37360000", ticket: "42300000", redeemed: "0", ebitda: "16848000"},
      result: "4.7282",
    });
    expect(calculateLeverageAfterStructure({netDebt: "1", ticket: "0", redeemed: "0", ebitda: "8"}).value).toBe("0.125");
    // A tie on the fifth decimal rounds up, as the decimal value says.
    expect(calculateLeverageAfterStructure({netDebt: "1.00005", ticket: "0", redeemed: "0", ebitda: "1", decimals: 4}).value).toBe("1.0001");
    // The same text the verdict's Decimal expression printed, on a grid of structures.
    for (const [netDebt, ticket, redeemed, ebitda] of [["4239486000", "800000000", "600000000", "915300000"], ["-120000", "5000000", "0", "3100000"], ["37360000", "71311238.05", "29011238.05", "16848000"], ["10", "3", "1", "-7"]]) {
      expect(calculateLeverageAfterStructure({netDebt: netDebt!, ticket: ticket!, redeemed: redeemed!, ebitda: ebitda!, decimals: 4}).value)
        .toBe(new Decimal(netDebt!).plus(new Decimal(ticket!).minus(redeemed!)).div(ebitda!).toFixed(4));
    }
    const zero = calculateLeverageAfterStructure({netDebt: "37360000", ticket: "42300000", redeemed: "0", ebitda: "0.00", decimals: 4});
    expect(zero.value).toBeNull();
    expect(zero.trace.result).toBe("not computable: zero EBITDA");
    expect(() => calculateLeverageAfterStructure({netDebt: "1", ticket: "1", redeemed: "0", ebitda: "1", decimals: 1.5})).toThrow(RangeError);
    expect(() => calculateLeverageAfterStructure({netDebt: "Infinity", ticket: "1", redeemed: "0", ebitda: "1"})).toThrow(RangeError);
  });

  it("tests leverage against the covenant ceiling, never comparing a leverage that is not a number", () => {
    expect(testCovenantCeiling({leverage: "4.6318", ceiling: "4.0000"})).toMatchObject({outcome: "above_ceiling", excess: "0.6318"});
    expect(testCovenantCeiling({leverage: "2.1918", ceiling: "3.0"})).toMatchObject({outcome: "within_ceiling", excess: null});
    // At the ceiling is within it: the covenant is breached above the maximum.
    expect(testCovenantCeiling({leverage: "3.0000", ceiling: "3"}).outcome).toBe("within_ceiling");
    expect(testCovenantCeiling({leverage: "4.6318", ceiling: "4.0000"}).trace).toEqual({
      id: "material.covenant_ceiling", formula: "above when leverage > ceiling; excess = leverage - ceiling",
      operands: {leverage: "4.6318", ceiling: "4"}, result: "above_ceiling; excess=0.6318",
    });
    // The ratio over a zero EBITDA prints as Infinity or NaN upstream; it is not a leverage to compare.
    for (const leverage of ["Infinity", "-Infinity", "NaN"]) {
      const test = testCovenantCeiling({leverage, ceiling: "3.0"});
      expect(test, leverage).toMatchObject({outcome: "not_computable", excess: null});
      expect(test.trace.operands.leverage).toBe(leverage);
    }
    expect(() => testCovenantCeiling({leverage: "2", ceiling: "n/d"})).toThrow(RangeError);
  });

  it("selects the heaviest schedule year above the threshold, the first listed among equals, exactly", () => {
    const years = [{id: "2026", strain: "0.4200"}, {id: "2027", strain: "1.3000"}, {id: "2028", strain: "1.3000"}, {id: "2029", strain: "1.0000"}];
    const heaviest = selectHeaviestScheduleYear({years, threshold: 1});
    expect(heaviest).toMatchObject({id: "2027", strain: "1.3"});
    expect(heaviest.trace).toEqual({
      id: "material.heaviest_schedule_year",
      formula: "heaviest = largest strain above the threshold, the first listed among equals; a strain that is not a finite number is not ranked",
      operands: {threshold: "1", 2026: "0.42", 2027: "1.3", 2028: "1.3", 2029: "1"},
      result: "2027:1.3",
    });
    // The threshold itself is not above it.
    expect(selectHeaviestScheduleYear({years: [{id: "2029", strain: "1.0000"}], threshold: 1})).toMatchObject({id: null, strain: null});
    // Strains that binary floating point cannot tell apart are still ordered exactly.
    expect(selectHeaviestScheduleYear({years: [{id: "a", strain: "1.30000000000000000001"}, {id: "b", strain: "1.30000000000000000002"}], threshold: 1}).id).toBe("b");
    // A strain over a zero projected EBITDA is not a number: not ranked, named in the trace.
    const unranked = selectHeaviestScheduleYear({years: [{id: "2027", strain: "Infinity"}, {id: "2028", strain: "NaN"}, {id: "2029", strain: "1.2"}], threshold: 1});
    expect(unranked).toMatchObject({id: "2029", strain: "1.2"});
    expect(unranked.trace.result).toBe("2029:1.2; not ranked: 2027, 2028");
    expect(() => selectHeaviestScheduleYear({years, threshold: "n/d"})).toThrow(RangeError);
  });

  it("compares figures exactly, for the thresholds a decision tests", () => {
    expect(compareFigures("1.1633", "1.3")).toBe(-1);
    expect(compareFigures("0", 0)).toBe(0);
    expect(compareFigures("600000000", "1229828000")).toBe(-1);
    expect(compareFigures("0.30000000000000000002", "0.30000000000000000001")).toBe(1);
    expect(() => compareFigures("Infinity", 0)).toThrow(RangeError);
    expect(() => compareFigures(0, "")).toThrow(RangeError);
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

  it("prints every whole basis point as a percentage exactly as the floating-point path printed it", () => {
    // The market reference quotes whole basis points. For every one of them the kernel and
    // `(bps / 100).toFixed(2)` print the same text, so moving a quote to the kernel changes no byte.
    const differing: number[] = [];
    for (let bps = -10_000; bps <= 10_000; bps += 1) {
      if (presentationFigure({value: bps, scale: "basis_points_as_percent", decimals: 2}).value !== (bps / 100).toFixed(2)) differing.push(bps);
    }
    expect(differing).toEqual([]);
    // Half a basis point on a tie the binary float stores low now rounds up, as the value says.
    expect(presentationFigure({value: 100.5, scale: "basis_points_as_percent", decimals: 2}).value).toBe("1.01");
    expect((100.5 / 100).toFixed(2)).toBe("1.00");
    expect(presentationFigure({value: -100.5, scale: "basis_points_as_percent", decimals: 2}).value).toBe("-1.01");
    // A tie the binary float stores high agrees with it.
    expect(presentationFigure({value: 0.5, scale: "basis_points_as_percent", decimals: 2}).value).toBe((0.5 / 100).toFixed(2));
    expect(() => presentationFigure({value: Number.NaN, scale: "basis_points_as_percent", decimals: 2})).toThrow(RangeError);
  });

  it("prints an amount in a sentence by one rule: millions from 999,500, thousands from one thousand, the exact amount below", () => {
    const text = (value: string, locale: "pt-BR" | "en-US" = "pt-BR") => presentationAmount({value, locale, style: "abbreviated"}).text;
    expect(text("17420000")).toBe("R$ 17,4M");
    expect(text("17420000", "en-US")).toBe("R$ 17.4M");
    expect(text("1099200000")).toBe("R$ 1099,2M");
    // Under a million, thousands without decimals: never "R$ 0,0M" for an amount that is not zero.
    expect(text("45000")).toBe("R$ 45 mil");
    expect(text("45000", "en-US")).toBe("R$ 45 thousand");
    expect(text("49999")).toBe("R$ 50 mil");
    expect(text("572000")).toBe("R$ 572 mil");
    expect(text("999499.99")).toBe("R$ 999 mil");
    // Where thousands would round to a thousand thousand, the amount is stated in millions.
    expect(text("999500")).toBe("R$ 1,0M");
    expect(text("1000")).toBe("R$ 1 mil");
    // Below a thousand, the exact amount.
    expect(text("999.99")).toBe("R$ 999,99");
    expect(text("0.3", "en-US")).toBe("R$ 0.3");
    expect(text("0")).toBe("R$ 0");
    expect(text("-45000")).toBe("R$ -45 mil");
    expect(text("-17420000", "en-US")).toBe("R$ -17.4M");
    expect(presentationAmount({value: "45000", locale: "pt-BR", style: "abbreviated"})).toEqual({
      text: "R$ 45 mil", figure: "45", unit: "thousands",
      trace: {
        id: "material.presentation_amount", formula: "millions, half-up to 1 decimal, from 999500; thousands, half-up to 0 decimals, from 1000; below, the exact amount",
        operands: {value: "45000", style: "abbreviated", locale: "pt-BR"}, result: "R$ 45 mil",
      },
    });
    // No amount that is not zero prints as zero, from a cent to R$ 2 million.
    const zeroes: string[] = [];
    for (const step of ["0.01", "0.49", "1", "37", "499", "500", "999", "49999", "50000", "999499", "999500", "1049999", "1950000"]) {
      for (const locale of ["pt-BR", "en-US"] as const) {
        const printed = presentationAmount({value: step, locale, style: "abbreviated"});
        if (/^R\$ -?0(?:[.,]0+)?(?:M| mil| thousand)?$/.test(printed.text)) zeroes.push(`${step} ${printed.text}`);
      }
    }
    expect(zeroes).toEqual([]);
    expect(() => presentationAmount({value: "n/d", locale: "pt-BR", style: "abbreviated"})).toThrow(RangeError);
  });

  it("prints an amount in a table in whole units grouped by the locale, exact below one unit", () => {
    const text = (value: string, locale: "pt-BR" | "en-US" = "pt-BR") => presentationAmount({value, locale, style: "whole"}).text;
    expect(text("42300000")).toBe("R$ 42.300.000");
    expect(text("42300000", "en-US")).toBe("R$ 42,300,000");
    expect(text("-8420000")).toBe("R$ -8.420.000");
    expect(text("1.5")).toBe("R$ 2");
    expect(text("0.4")).toBe("R$ 0,4");
    expect(text("0")).toBe("R$ 0");
    expect(presentationAmount({value: "500476", locale: "en-US", style: "whole", currency: "US$"}).text).toBe("US$ 500,476");
    // The text the Intl path printed for every whole amount the materials carry.
    for (const value of ["58576524", "500476", "-8420000", "1820000", "0", "999", "1000", "123456789012"]) {
      for (const locale of ["pt-BR", "en-US"] as const) {
        expect(text(value, locale)).toBe(`R$ ${Number(value).toLocaleString(locale, {maximumFractionDigits: 0})}`);
      }
    }
  });

  it("states a spread as a signed percentage, and prints every whole basis point as both price sentences printed it", () => {
    expect(presentationSpread({bps: 250})).toEqual({sign: "+", magnitude: "2.5", trace: {id: "material.presentation_spread", formula: "sign of the spread; |basis points| / 100", operands: {bps: "250"}, result: "+2.5"}});
    expect(presentationSpread({bps: -100})).toMatchObject({sign: "-", magnitude: "1"});
    expect(presentationSpread({bps: 0})).toMatchObject({sign: "+", magnitude: "0"});
    expect(presentationSpread({bps: -0})).toMatchObject({sign: "+", magnitude: "0"});
    expect(presentationSpread({bps: 370, decimals: 2})).toMatchObject({sign: "+", magnitude: "3.70"});
    // The desk sentence printed `Math.abs(bps) / 100`; the observed sentence printed `Math.abs(bps / 100)`
    // through Intl with at most two decimals. For every whole basis point both texts are unchanged.
    // One formatter with the options `toLocaleString` took prints the same text, without building a
    // formatter per call.
    const intl = new Intl.NumberFormat("pt-BR", {maximumFractionDigits: 2});
    const differing: number[] = [];
    for (let bps = -10_000; bps <= 10_000; bps += 1) {
      const exact = presentationSpread({bps});
      const rounded = presentationSpread({bps, decimals: 2});
      const desk = `${exact.sign} ${exact.magnitude}` === `${bps >= 0 ? "+" : "-"} ${Math.abs(bps) / 100}`;
      const observed = `${rounded.sign} ${intl.format(presentationNumber(rounded.magnitude).value)}` === `${bps >= 0 ? "+" : "-"} ${intl.format(Math.abs(bps / 100))}`;
      if (!desk || !observed) differing.push(bps);
    }
    expect(differing).toEqual([]);
    expect(intl.format(12.5)).toBe((12.5).toLocaleString("pt-BR", {maximumFractionDigits: 2}));
    // Intl rounds the shortest decimal of the quotient, so the observed sentence already agreed on
    // half basis points; the kernel keeps that on the decimal value.
    expect(presentationSpread({bps: 100.5, decimals: 2}).magnitude).toBe("1.01");
    expect(Math.abs(100.5 / 100).toLocaleString("en-US", {maximumFractionDigits: 2})).toBe("1.01");
    // A fractional basis point divided in binary printed its representation error in the desk
    // sentence; the kernel prints the exact quotient. The desk grid quotes whole basis points only.
    expect(presentationSpread({bps: 1998.7}).magnitude).toBe("19.987");
    expect(`${Math.abs(1998.7) / 100}`).toBe("19.987000000000002");
    expect(() => presentationSpread({bps: Number.NaN})).toThrow(RangeError);
    // Twenty thousand quotes in each sentence: the default five seconds is not a budget for a loaded runner.
  }, 60_000);

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
