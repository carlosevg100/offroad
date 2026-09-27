import {describe, expect, it} from "vitest";

import {
  annualRateForMonthlyRate, calculateEbitdaTrend, calculateRatingCoverage, calculateStressTable, gradeInternalRating, readDocumentFigure,
  readDocumentPercent, readFactFigure, readMonthCount, scoreRatingFactor, selectLargestAmount,
} from "./credit-review-arithmetic";

describe("the credit review's arithmetic", () => {
  it("reads a figure as a Brazilian document writes it, and nothing else", () => {
    expect(readDocumentFigure({text: "4,10"}).value).toBe("4.10");
    expect(readDocumentFigure({text: "1.234,5"}).value).toBe("1234.5");
    expect(readDocumentFigure({text: "1.234"}).value).toBe("1234");
    expect(readDocumentFigure({text: "130"}).value).toBe("130");
    // A single dot that cannot group thousands marks the decimals: never 410, never 35.
    expect(readDocumentFigure({text: "4.10"}).value).toBe("4.10");
    expect(readDocumentFigure({text: "3.5"}).value).toBe("3.5");
    expect(readDocumentFigure({text: "0.500"}).value).toBe("0.500");
    for (const text of ["1,2,3", "1.2.3", "1..2", ",5", "5,", ".", ",", "", "1.234.5", "4,1.0", "abc"]) {
      expect(readDocumentFigure({text}).value, text).toBeNull();
    }
    expect(readDocumentFigure({text: "1.234,5"}).trace).toEqual({
      id: "review.document_figure",
      formula: "dots group thousands in threes and a comma marks the decimals; a single dot that cannot group thousands marks the decimals; any other text is not a figure",
      operands: {text: "1.234,5", notation: "grouped thousands"},
      result: "1234.5",
    });
  });

  it("turns a written percentage into a fraction at the precision asked, half-up", () => {
    expect(readDocumentPercent({text: "4,10", decimals: 6}).value).toBe("0.041000");
    expect(readDocumentPercent({text: "130", decimals: 4}).value).toBe("1.3000");
    expect(readDocumentPercent({text: "6,34165", decimals: 6}).value).toBe("0.063417");
    expect(readDocumentPercent({text: "1,2,3", decimals: 6}).value).toBeNull();
    expect(() => readDocumentPercent({text: "1", decimals: 21})).toThrow(RangeError);
  });

  it("compounds a monthly rate into its annual rate", () => {
    // 1,42% a month is 18,44% a year, not 17,04%.
    expect(annualRateForMonthlyRate({monthlyRate: "0.0142"}).value).toBe("0.184358754343603282816981999755567990282");
    expect(annualRateForMonthlyRate({monthlyRate: "0"}).value).toBe("0");
    expect(annualRateForMonthlyRate({monthlyRate: "0.01"}).trace).toMatchObject({id: "review.monthly_compounding", formula: "annual = (1 + monthly rate)^12 - 1"});
    expect(() => annualRateForMonthlyRate({monthlyRate: "NaN"})).toThrow(RangeError);
  });

  it("reads a fact's figure and a count of months in decimal notation, never as zero", () => {
    expect(readFactFigure({text: " 16848000 "}).value).toBe("16848000");
    expect(readFactFigure({text: "4.8e1"}).value).toBe("48");
    for (const text of ["", "0x10", "Infinity", "12,5", "abc"]) expect(readFactFigure({text}).value, text).toBeNull();
    expect(readMonthCount({text: "48"}).value).toBe(48);
    expect(readMonthCount({text: " 48 "}).value).toBe(48);
    expect(readMonthCount({text: "60.5"}).value).toBe(60.5);
    // Number("") is 0 and Number("0x3C") is 60: neither is a count of months.
    expect(readMonthCount({text: ""}).value).toBeNull();
    expect(readMonthCount({text: "0x3C"}).value).toBeNull();
  });

  it("chooses the largest stated amount exactly, the first on a tie", () => {
    expect(selectLargestAmount({amounts: ["42300000", "40000000"]})).toMatchObject({value: "42300000", index: 0});
    expect(selectLargestAmount({amounts: ["40000000", "42300000"]})).toMatchObject({value: "42300000", index: 1});
    expect(selectLargestAmount({amounts: ["42300000", "42300000.00"]})).toMatchObject({value: "42300000", index: 0});
    // Binary numbers see these two as the same number.
    expect(selectLargestAmount({amounts: ["12345678901234567.01", "12345678901234567.02"]})).toMatchObject({index: 1});
    expect(() => selectLargestAmount({amounts: []})).toThrow(RangeError);
    expect(() => selectLargestAmount({amounts: ["abc"]})).toThrow(RangeError);
  });

  it("computes the rating's coverage and trend, and leaves them uncomputed over a zero", () => {
    expect(calculateRatingCoverage({ebitda: "16848000", financialExpenses: "-4212000"}).value).toBe("4");
    expect(calculateRatingCoverage({ebitda: "16848000", financialExpenses: "0"}).value).toBeNull();
    expect(calculateEbitdaTrend({current: "80", prior: "100"}).value).toBe("-0.2");
    expect(calculateEbitdaTrend({current: "80", prior: "-100"}).value).toBe("1.8");
    expect(calculateEbitdaTrend({current: "80", prior: "0"}).value).toBeNull();
  });

  it("scores a factor against ceilings and floors, edges included", () => {
    const ceilings = [{limit: "1.5", points: 4}, {limit: "2.5", points: 3}];
    expect(scoreRatingFactor({value: "1.5", bands: ceilings, reading: "at_most", otherwise: 0}).points).toBe(4);
    expect(scoreRatingFactor({value: "1.5001", bands: ceilings, reading: "at_most", otherwise: 0}).points).toBe(3);
    expect(scoreRatingFactor({value: "2.6", bands: ceilings, reading: "at_most", otherwise: 0}).points).toBe(0);
    const floors = [{limit: "1.5", points: 1}, {limit: "2.5", points: 2}];
    expect(scoreRatingFactor({value: "2.5", bands: floors, reading: "at_least", otherwise: 0}).points).toBe(2);
    expect(scoreRatingFactor({value: "1.4999", bands: floors, reading: "at_least", otherwise: 0}).points).toBe(0);
    expect(scoreRatingFactor({value: "2", bands: floors, reading: "at_least", otherwise: 0}).trace).toMatchObject({id: "rating.factor_points", result: "1"});
  });

  it("grades the rating from its points, half-up on the exact score, floored at 8 by a critical factor", () => {
    // 23 points of 40 is 57.5: the score is 58, where the binary division printed 57.
    const factors = [{points: 3, weight: 3}, {points: 2, weight: 2}, {points: 2, weight: 2}, {points: 2, weight: 1}, {points: 2, weight: 1}, {points: 2, weight: 1}];
    expect(gradeInternalRating({factors, floorAtEight: false})).toMatchObject({score: 58, grade: 5, assessed: 6});
    // 100 points is ten steps short of nine: grade 2, as the scale has always graded it.
    expect(gradeInternalRating({factors: [{points: 4, weight: 3}], floorAtEight: false})).toMatchObject({score: 100, grade: 2});
    expect(gradeInternalRating({factors: [{points: 0, weight: 3}], floorAtEight: true})).toMatchObject({score: 0, grade: 10});
    expect(gradeInternalRating({factors: [{points: 4, weight: 3}, {points: 0, weight: 3}], floorAtEight: true})).toMatchObject({score: 50, grade: 8});
    // 9 points of 16 is 56.25, a score of 56: exactly five steps of 11.2, grade 5.
    expect(gradeInternalRating({factors: [{points: 3, weight: 3}, {points: 0, weight: 1}, {points: null, weight: 2}], floorAtEight: false})).toMatchObject({score: 56, grade: 5, assessed: 2});
    expect(gradeInternalRating({factors: [{points: null, weight: 3}], floorAtEight: false})).toMatchObject({score: 0, grade: 10, assessed: 0});
  });

  it("runs the stress table on the desk's numbers", () => {
    const table = calculateStressTable({
      ebitda: "1000", netDebtPre: "2000", grossDebt: "3000", amount: null, scenarioAmounts: ["400", "500"], covenantCeiling: "3",
      weightedCost: "0.15", cdi: "0.105", cycleDays: "60", revenue: "7300", topCustomerShare: "0.2", lostCustomerMargin: "0.35",
    });
    expect(table).toMatchObject({amount: "500", netDebtPost: "2500", grossDebtPost: "3500", shockedCdi: "0.135", shockedCycleDays: "75"});
    expect(table.scenarios.map((scenario) => scenario.leverage)).toEqual(["3.125", "3.571428571428571428571428571428571428571", "2.5", "2.5", "5.112474437627811860940695296523517382413"]);
    expect(table.scenarios[0]).toMatchObject({ebitda: "800", annualInterest: "525", covenantHeadroom: "-100", breachesCovenant: true});
    expect(table.scenarios[2]).toMatchObject({annualInterest: "630", breachesCovenant: false});
    expect(table.scenarios[3]).toMatchObject({workingCapitalNeed: "300"});
    // The largest customer: 7,300 x 20% x 35% = 511 of EBITDA lost.
    expect(table.scenarios[4]).toMatchObject({ebitda: "489", covenantHeadroom: "-1033", breachesCovenant: true});
    // No EBITDA left, no covenant, no cost: nothing is divided or priced.
    const bare = calculateStressTable({
      ebitda: "0", netDebtPre: "2000", grossDebt: "3000", amount: "0", scenarioAmounts: [], covenantCeiling: null,
      weightedCost: null, cdi: "0.105", cycleDays: null, revenue: null, topCustomerShare: null, lostCustomerMargin: "0.35",
    });
    expect(bare.scenarios.every((scenario) => scenario.leverage === null && scenario.annualInterest === null && scenario.covenantHeadroom === null && scenario.breachesCovenant === null)).toBe(true);
    expect(bare.shockedCycleDays).toBeNull();
    expect(() => calculateStressTable({...{ebitda: "x", netDebtPre: "0", grossDebt: "0", amount: null, scenarioAmounts: [], covenantCeiling: null, weightedCost: null, cdi: "0.1", cycleDays: null, revenue: null, topCustomerShare: null, lostCustomerMargin: "0.35"}})).toThrow(RangeError);
  });
});
