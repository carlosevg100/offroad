import {describe, expect, it} from "vitest";

import {
  calculateAmountDifference, calculateLeverageCeilingRoom, calculateSizingGap, calculateVentureDebtCapacity, designCollateralCoverage, selectLowestFigure,
  sumAmounts, sumAmountsByKey, testWithinTolerance,
} from "./deal-arithmetic";

describe("the deal structure's arithmetic", () => {
  it("sizes the venture wall at the lower share, half-up to cents, ARR first on a tie", () => {
    expect(calculateVentureDebtCapacity({arr: "12000000", lastEquityRound: "8000000", arrShare: "0.30", roundShare: "0.35"})).toMatchObject({value: "2800000", binding: "last_equity_round"});
    expect(calculateVentureDebtCapacity({arr: "5000000", lastEquityRound: "40000000", arrShare: "0.30", roundShare: "0.35"})).toMatchObject({value: "1500000", binding: "arr"});
    // 100,05 x 30% = 30,015: half-up to 30,02.
    expect(calculateVentureDebtCapacity({arr: "100.05", lastEquityRound: null, arrShare: "0.30", roundShare: "0.35"}).value).toBe("30.02");
    expect(calculateVentureDebtCapacity({arr: "35", lastEquityRound: "30", arrShare: "0.30", roundShare: "0.35"})).toMatchObject({value: "10.5", binding: "arr"});
    expect(calculateVentureDebtCapacity({arr: "0", lastEquityRound: "-1", arrShare: "0.30", roundShare: "0.35"})).toMatchObject({value: null, binding: null});
    expect(() => calculateVentureDebtCapacity({arr: "0x10", lastEquityRound: null, arrShare: "0.30", roundShare: "0.35"})).toThrow(RangeError);
  });

  it("gives the room under the leverage ceiling, never negative, and none over an EBITDA that is not positive", () => {
    expect(calculateLeverageCeilingRoom({adjustedEbitda: "33000000", leverageCeiling: "3.5", existingNetDebt: "58700000"})).toMatchObject({value: "56800000", ebitda: "33000000"});
    expect(calculateLeverageCeilingRoom({adjustedEbitda: "33000000", leverageCeiling: "3.5", existingNetDebt: "500000000"}).value).toBe("0");
    expect(calculateLeverageCeilingRoom({adjustedEbitda: "0.003", leverageCeiling: "3.5", existingNetDebt: "0"})).toMatchObject({value: "0.01", ebitda: "0"});
    expect(calculateLeverageCeilingRoom({adjustedEbitda: "0", leverageCeiling: "3.5", existingNetDebt: "0"}).value).toBeNull();
    expect(calculateLeverageCeilingRoom({adjustedEbitda: "-1", leverageCeiling: "3.5", existingNetDebt: "0"}).trace.result).toBe("not computed (EBITDA not positive)");
  });

  it("selects the lowest figure exactly, the first on a tie", () => {
    expect(selectLowestFigure({values: ["120000000", "36800000", "36800000.00", "40000000"]})).toMatchObject({value: "36800000", index: 1});
    expect(selectLowestFigure({values: []})).toMatchObject({value: null, index: null});
    expect(() => selectLowestFigure({values: ["1", "abc"]})).toThrow(RangeError);
  });

  it("designs the coverage by rank, then eligible value, until the coverage required is reached", () => {
    const coverage = designCollateralCoverage({
      amount: "25000000", coverage: "1.3",
      assets: [
        {value: "51940000", encumbered: "24400000", haircut: "0.30", rank: 2},
        {value: "42180000", encumbered: "0", haircut: "0.50", rank: 6},
        {value: "28000000", encumbered: "0", haircut: "0.40", rank: 3},
        {value: "3200000", encumbered: "1820000", haircut: "0.40", rank: 4},
        {value: "0", encumbered: "0", haircut: "1.00", rank: 8},
      ],
    });
    expect(coverage.lines.map((line) => line.eligible)).toEqual(["19278000.00", "21090000.00", "16800000.00", "828000.00", "0.00"]);
    expect(coverage.order).toEqual([0, 2, 3, 1, 4]);
    expect(coverage.selected).toEqual([0, 2]);
    expect(coverage).toMatchObject({required: "32500000", eligibleSelected: "36078000", coverageReached: "1.44312", sufficient: true, shortfall: null});
    const short = designCollateralCoverage({amount: "42300000", coverage: "1.3", assets: [{value: "51940000", encumbered: "24400000", haircut: "0.30", rank: 2}]});
    expect(short).toMatchObject({sufficient: false, shortfall: "35712000", required: "54990000"});
    // Encumbered above the value frees nothing; equal ranks and values keep the order given.
    const ties = designCollateralCoverage({amount: "1", coverage: "0", assets: [{value: "5", encumbered: "9", haircut: "0.5", rank: 1}, {value: "10", encumbered: "0", haircut: "0.5", rank: 1}, {value: "10", encumbered: "0", haircut: "0.5", rank: 1}]});
    expect(ties.lines[0]!.eligible).toBe("0.00");
    expect(ties.order).toEqual([1, 2, 0]);
    expect(designCollateralCoverage({amount: "0", coverage: "1.3", assets: []})).toMatchObject({coverageReached: null, sufficient: true});
  });

  it("sums, differences and ties amounts exactly", () => {
    expect(sumAmounts({amounts: ["33333333.333", "33333333.333", "33333333.334"]}).value).toBe("100000000");
    expect(sumAmounts({amounts: []}).value).toBe("0");
    expect(() => sumAmounts({amounts: ["100", ""]})).toThrow(RangeError);
    expect(calculateAmountDifference({amount: "100", reference: "104.5"})).toMatchObject({value: "-4.5", magnitude: "4.5"});
    expect(testWithinTolerance({difference: "-0.5", tolerance: "0.5"}).within).toBe(true);
    expect(testWithinTolerance({difference: "0.6", tolerance: "-0.5"}).within).toBe(false);
    expect(calculateSizingGap({requested: "100000000", envelope: "70000000.50"}).value).toBe("29999999.5");
    expect(calculateSizingGap({requested: "100", envelope: "120"}).value).toBe("0");
    expect(sumAmountsByKey({entries: [{key: "Y1", amount: "10"}, {key: "Y2", amount: "5"}, {key: "Y1", amount: "2.5"}]}).totals).toEqual({Y1: "12.5", Y2: "5"});
  });
});
