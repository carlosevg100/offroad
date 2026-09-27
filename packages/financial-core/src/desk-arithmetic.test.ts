import {describe, expect, it} from "vitest";

import {
  allocateRefinancingNearestFirst,
  calculateDeskDebtStack,
  calculateDeskLeverage,
  calculateInterestCoverage,
  calculateLiabilityManagement,
  calculateReceivablesEncumbrance,
  calculateVentureRunway,
  calculateWorkingCapitalCycle,
  projectLeveragePath,
  testRateAskAgainstStack,
} from "./desk-arithmetic";
import {presentationFigure, presentationRatio} from "./material-arithmetic";

const at = (value: string, decimals: number) => presentationFigure({value, decimals}).value;

describe("the stack on one axis", () => {
  it("sums the lines at cents, weights the cost of what can be priced, and lets the profile speak when lines state no date", () => {
    const stack = calculateDeskDebtStack({
      lines: [
        {balance: "1000.004", effectiveAnnual: "0.10", monthsToMaturity: 6},
        {balance: "2000", effectiveAnnual: null, monthsToMaturity: 30},
        {balance: "3000", effectiveAnnual: "0.20", monthsToMaturity: null},
      ],
      grossDebt: "6200",
      cash: "3000",
      maturityProfile: [{amount: "2500", monthsToEnd: 10}, {amount: "900", monthsToEnd: null}],
    });
    expect(stack.lineBalances).toEqual(["1000.00", "2000.00", "3000.00"]);
    expect(stack.totalSchedule).toBe("6000");
    expect(stack.scheduleGap).toBe("200");
    // (1.000 x 10% + 3.000 x 20%) / 4.000: the unpriced line is out of the average, never a zero inside it.
    expect(stack.weightedCost).toBe("0.175");
    // One line has no date and the profile says more falls due: 2.500, not the 1.000 the lines show.
    expect(stack.maturingWithin12Months).toBe("2500");
    expect(stack.maturingWithin24Months).toBe("2500");
    expect(stack.liquidityCoverage12).toBe("1.2");
    expect(at(stack.maturingShare24!, 4)).toBe("0.4167");
    expect(stack.trace.id).toBe("desk.debt_stack");
  });

  it("reads the lines when every line states its date, and states nothing it cannot compute", () => {
    const stack = calculateDeskDebtStack({
      lines: [{balance: "1000", effectiveAnnual: null, monthsToMaturity: 30}],
      grossDebt: "1000",
      cash: "10",
      maturityProfile: [{amount: "900", monthsToEnd: 6}],
    });
    expect(stack.maturingWithin12Months).toBe("0");
    expect(stack.liquidityCoverage12).toBeNull();
    expect(stack.weightedCost).toBeNull();
    expect(stack.maturingShare24).toBeNull();
    expect(() => calculateDeskDebtStack({lines: [{balance: "0x10", effectiveAnnual: null, monthsToMaturity: null}], grossDebt: "1", cash: "0", maturityProfile: []})).toThrow(RangeError);
  });
});

describe("leverage and the covenant", () => {
  // Aurora as the truth file states her: 45,32M of gross debt, 8,42M of cash, 16,848M of EBITDA.
  const aurora = calculateDeskLeverage({grossDebt: "45320000", cash: "8420000", ebitda: "16848000", amounts: ["40000000", "42300000"], ceilings: ["3.0000", "3.2500"]});

  it("computes the number that changes the meeting: 13,644M fit under the tightest covenant, not 42,3M", () => {
    expect(aurora.netDebt).toBe("36900000");
    expect(at(aurora.preTurns!, 4)).toBe("2.1902");
    expect(aurora.scenarios).toEqual([{amount: "40000000.00", postTurns: "4.5643"}, {amount: "42300000.00", postTurns: "4.7009"}]);
    expect(aurora.tightest).toEqual({index: 0});
    expect(aurora.covenant).toEqual({
      maxNewDebt: "13644000", roomForNewDebt: "13644000", excessNetDebt: "13644000", alreadyAbove: false, breached: true, worstScenario: 1,
    });
    expect(aurora.largestAmount).toBe("42300000");
    expect(aurora.worstPostTurns).toBe("4.7009");
    expect(aurora.worstPostAbovePre).toBe(true);
    expect(aurora.trace.id).toBe("desk.leverage");
  });

  it("takes the first of equal ceilings, and tests no covenant over an EBITDA that is not positive", () => {
    expect(calculateDeskLeverage({grossDebt: "10", cash: "0", ebitda: "5", amounts: [], ceilings: ["3", "2.5", "2.50"]}).tightest).toEqual({index: 1});
    const burning = calculateDeskLeverage({grossDebt: "10", cash: "0", ebitda: "-5", amounts: ["1"], ceilings: ["3"]});
    expect(burning.profile).toBe("cash_burning");
    expect(burning.covenant).toBeNull();
    expect(burning.tightest).toEqual({index: 0});
    // Over a zero EBITDA the ratio is absent, never compared (stage 19, second polish; it was handed on as "Infinity").
    const zero = calculateDeskLeverage({grossDebt: "10", cash: "0", ebitda: "0", amounts: ["5"], ceilings: ["3"]});
    expect(zero.preTurns).toBeNull();
    expect(zero.scenarios[0]!.postTurns).toBeNull();
    expect(zero.covenant).toBeNull();
    expect(zero.worstPostAbovePre).toBeNull();
  });
});

describe("coverage, runway and the cash cycle", () => {
  it("covers interest today and with the ask at its cost, and says nothing without an expense or a cost", () => {
    const coverage = calculateInterestCoverage({ebitda: "1000", financialExpenses: "-250", askAmount: "1000", askCost: "0.15"});
    expect(coverage.coverage).toBe("4");
    expect(coverage.coveragePost).toBe("2.5");
    expect(calculateInterestCoverage({ebitda: "1000", financialExpenses: "0", askAmount: "1", askCost: "0.1"}).coverage).toBeNull();
    expect(calculateInterestCoverage({ebitda: "-1", financialExpenses: "10", askAmount: "1", askCost: "0.1"}).coverage).toBeNull();
    expect(calculateInterestCoverage({ebitda: "1000", financialExpenses: "250", askAmount: "1", askCost: null}).coveragePost).toBeNull();
    expect(coverage.trace.id).toBe("desk.interest_coverage");
  });

  it("measures runway before, with the ticket and after its own interest, and the debt over ARR", () => {
    // Nimbus: 24,1M of cash burning 1,85M a month, asking 15M at CDI plus six compounded (17,13%).
    const runway = calculateVentureRunway({cash: "24100000", monthlyBurn: "1850000", ask: "15000000", assumedRate: "0.1713", grossDebt: "3200000", arr: "37326000", statedRunwayMonths: "16"});
    expect(at(runway.monthsPre, 1)).toBe("13.0");
    expect(at(runway.monthsPost, 1)).toBe("21.1");
    // Interest of 15M x 17,13% / 12 = 214.125 a month joins the burn: 39,1M / 2.064.125.
    expect(at(runway.monthsPostAfterService!, 4)).toBe("18.9427");
    expect(at(runway.monthsBought!, 1)).toBe("5.9");
    expect(at(runway.monthsBoughtBeforeService, 1)).toBe("8.1");
    expect(runway.debtAfterRaise).toBe("18200000");
    expect(at(runway.debtToArr!, 4)).toBe("0.4876");
    expect(at(runway.statedGap!, 2)).toBe("2.97");
    expect(runway.trace.id).toBe("desk.runway");
    expect(() => calculateVentureRunway({cash: "1", monthlyBurn: "0", ask: "0", assumedRate: "0.1", grossDebt: "0", arr: null, statedRunwayMonths: null})).toThrow(RangeError);
  });

  it("reads the cycle in days and what growth absorbs, and flags an ask above twice the need", () => {
    const cycle = calculateWorkingCapitalCycle({revenue: "365", receivables: "30", cogs: "365", inventory: "60", suppliers: "20", nextYearRevenue: "465", workingCapitalAsk: "40"});
    // Days divide then multiply by 365, as the desk always did; it publishes them at one decimal.
    expect([cycle.dso, cycle.dio, cycle.dpo, cycle.cycleDays].map((days) => at(days!, 1))).toEqual(["30.0", "60.0", "20.0", "70.0"]);
    expect(cycle.growth).toBe("100");
    // 100 of growth x 70 days / 365 = 19,18 absorbed; 40 is more than twice that.
    expect(at(cycle.growthAbsorption!, 2)).toBe("19.18");
    expect(cycle.askExceedsTwiceNeed).toBe(true);
    expect(at(cycle.askOverNeed!, 1)).toBe("2.1");
    expect(calculateWorkingCapitalCycle({revenue: "365", receivables: "30", cogs: "365", inventory: "60", suppliers: "20", nextYearRevenue: "465", workingCapitalAsk: "38"}).askExceedsTwiceNeed).toBe(false);
    const noCogs = calculateWorkingCapitalCycle({revenue: "365", receivables: "30", cogs: null, inventory: "60", suppliers: "20", nextYearRevenue: "465", workingCapitalAsk: "40"});
    expect([noCogs.dio, noCogs.cycleDays, noCogs.growthAbsorption]).toEqual([null, null, null]);
    expect(cycle.trace.id).toBe("desk.working_capital_cycle");
  });

  it("finds what is left of the receivables once the lines secured by them and the cessions are served", () => {
    const encumbrance = calculateReceivablesEncumbrance({
      base: "1000",
      lines: [{balance: "300", coverage: "1.3", cession: false}, {balance: "100", coverage: null, cession: true}, {balance: "50", coverage: null, cession: false}],
      workingCapitalAsk: "408",
    });
    expect(encumbrance).toMatchObject({encumbered: "490", free: "510", askAgainstFree: "0.8"});
    const exhausted = calculateReceivablesEncumbrance({base: "380", lines: [{balance: "300", coverage: "1.3", cession: false}], workingCapitalAsk: "10"});
    expect(exhausted).toMatchObject({free: "0", askAgainstFree: null});
    expect(encumbrance.trace.id).toBe("desk.receivables_encumbrance");
  });

  it("flags a rate asked at or below the stack's cost plus the tolerance, the limit itself included", () => {
    expect(testRateAskAgainstStack({askRate: "0.153", stackCost: "0.148", tolerance: "0.005"})).toMatchObject({atOrBelowStack: true, limit: "0.153"});
    expect(testRateAskAgainstStack({askRate: "0.1531", stackCost: "0.148", tolerance: "0.005"}).atOrBelowStack).toBe(false);
  });
});

describe("the trajectory", () => {
  it("redeems the nearest maturity first, a line without maturity last, and caps the refinancing at the stack", () => {
    const lines = [{balance: "1000", maturity: "2031-06-30"}, {balance: "1000", maturity: "2027-06-30"}, {balance: "500", maturity: null}];
    const partial = allocateRefinancingNearestFirst({lines, refinancing: "1200"});
    expect(partial).toMatchObject({existingTotal: "2500", refinancing: "1200", remaining: ["800.00", "0.00", "500.00"]});
    const capped = allocateRefinancingNearestFirst({lines, refinancing: "5000"});
    expect(capped).toMatchObject({refinancing: "2500", remaining: ["0.00", "0.00", "0.00"]});
    expect(partial.trace.id).toBe("desk.refinancing_redemption");
  });

  it("runs every line on its own schedule, the new loan SAC after grace, and proposes the covenant step-down", () => {
    // Reference June 2026; a line of 600 amortising to June 2027; 1.200 of new debt, 24 months with 12 of grace.
    const path = projectLeveragePath({
      referenceMonth: 2026 * 12 + 5,
      cash: "100",
      newDebt: {amount: "1200", termMonths: 24, graceMonths: 12},
      lines: [{balance: "600", maturityMonth: 2027 * 12 + 5, amortizes: true}],
      auditedEbitda: "400",
      growthHaircut: "0.5",
      covenantCushion: "0.5",
      covenantFloor: "2.5",
      years: [{year: 2026, ebitda: "400"}, {year: 2027, ebitda: "500"}],
      ceilings: ["3", "2"],
    });
    expect(path.years).toEqual([
      {year: 2026, existingDebt: "300.00", newDebt: "1200.00", netDebt: "1400.00", ebitdaBase: "400.00", ebitdaStressed: "400.00", leverageBase: "3.5000", leverageStressed: "3.5000", principalDue: "300.00", scheduleStrain: "0.7500"},
      {year: 2027, existingDebt: "0.00", newDebt: "600.00", netDebt: "500.00", ebitdaBase: "500.00", ebitdaStressed: "450.00", leverageBase: "1.0000", leverageStressed: "1.1111", principalDue: "900.00", scheduleStrain: "1.8000"},
    ]);
    expect(path.peakIndex).toBe(0);
    expect(path.ceilings).toEqual(["2.0000", "3.0000"]);
    expect(path.crossings).toEqual([{maximum: "2.0000", yearBase: 2027, yearStressed: 2027}, {maximum: "3.0000", yearBase: 2027, yearStressed: 2027}]);
    // 3,5 + 0,5 = 4,00; 1,1111 + 0,5 rounds up to 1,75 and stops at the 2,50 floor.
    expect(path.covenantProposal).toEqual([{year: 2026, maximum: "4.00"}, {year: 2027, maximum: "2.50"}]);
    expect(path.trace.id).toBe("desk.leverage_path");
  });

  it("holds a bullet to its maturity and a line without maturity flat, and refuses a trajectory without a projected year", () => {
    const input = {
      referenceMonth: 2026 * 12 + 5, cash: "0", newDebt: {amount: "0", termMonths: 12, graceMonths: 0}, auditedEbitda: "100", growthHaircut: "0.25", covenantCushion: "0.5", covenantFloor: "2.5", ceilings: [],
      lines: [{balance: "700", maturityMonth: 2027 * 12 + 5, amortizes: false}, {balance: "300", maturityMonth: null, amortizes: true}],
    };
    const path = projectLeveragePath({...input, years: [{year: 2026, ebitda: "100"}, {year: 2027, ebitda: "100"}]});
    expect(path.years.map((row) => row.existingDebt)).toEqual(["1000.00", "300.00"]);
    expect(() => projectLeveragePath({...input, years: []})).toThrow(RangeError);
  });

  it("measures liability management on the same base as leverage today, a pure swap adding none", () => {
    // Aurora: the Itaú and Bradesco lines (17,34M) taken out inside a 42,3M ticket.
    const takeout = calculateLiabilityManagement({ticket: "42300000", redeemed: ["9840000", "7500000"], grossDebtBefore: "38500000", cash: "8420000", ebitda: "16848000"});
    expect(takeout.redeemed).toBe("17340000");
    expect(takeout.netNewMoney).toBe("24960000");
    expect(at(takeout.leverageAfter!, 4)).toBe("3.2669");
    const swap = calculateLiabilityManagement({ticket: "700", redeemed: ["700"], grossDebtBefore: "5000", cash: "1000", ebitda: "1000"});
    expect(swap).toMatchObject({netNewMoney: "0", leverageAfter: "4"});
    expect(takeout.trace.id).toBe("desk.liability_management");
  });
});

describe("a ratio as the desk publishes it", () => {
  it("rounds a finite ratio as presentationFigure does and keeps an absent ratio absent, the text a division by zero printed before included", () => {
    expect(presentationRatio({value: "2.19016", decimals: 4}).value).toBe("2.1902");
    expect(presentationRatio({value: null, decimals: 4}).value).toBeNull();
    // Before: the text was handed on as it is, so a desk published "Infinity" and "NaN".
    for (const text of ["Infinity", "-Infinity", "NaN"]) expect(presentationRatio({value: text, decimals: 4}).value).toBeNull();
    expect(() => presentationRatio({value: "abc", decimals: 2})).toThrow(RangeError);
  });
});

/**
 * A ratio over a zero denominator is absent (stage 19, second polish): null, listed in `absent` with
 * the denominator, and never compared. Every expectation below fails on the kernels as the
 * post-closure polish left them, which published the ratio as the division printed it.
 */
describe("a ratio over a zero denominator", () => {
  it("leaves leverage absent over a zero EBITDA and compares none of it", () => {
    // Net cash of 50 over a zero EBITDA: the division gave -Infinity today and +Infinity after 80 of new debt.
    const zero = calculateDeskLeverage({grossDebt: "50", cash: "100", ebitda: "0", amounts: ["80", "20"], ceilings: ["3"]});
    expect(zero).toMatchObject({preTurns: null, worstPostTurns: null, worstPostAbovePre: null, profile: "cash_burning", covenant: null, tightest: {index: 0}});
    expect(zero.scenarios).toEqual([{amount: "80.00", postTurns: null}, {amount: "20.00", postTurns: null}]);
    expect(zero.absent.map((entry) => entry.ratio)).toEqual(["preTurns", "scenarios.0.postTurns", "scenarios.1.postTurns", "worstPostTurns"]);
    expect(zero.absent.every((entry) => entry.denominator === "EBITDA")).toBe(true);
    expect(zero.trace.result).toContain("pre=absent (zero EBITDA)");
    // A negative EBITDA divides: its leverage is a number, as before.
    const negative = calculateDeskLeverage({grossDebt: "50", cash: "100", ebitda: "-10", amounts: ["80"], ceilings: []});
    expect(negative).toMatchObject({preTurns: "5", scenarios: [{amount: "80.00", postTurns: "-3.0000"}], absent: []});
    expect(calculateDeskLeverage({grossDebt: "45320000", cash: "8420000", ebitda: "16848000", amounts: ["40000000"], ceilings: []}).absent).toEqual([]);
  });

  it("leaves the coverage with the ask absent when the interest it divides by sums to zero", () => {
    // 100 of interest and 1.000 asked at a cost of -10%: the ask's interest cancels the expense.
    const zero = calculateInterestCoverage({ebitda: "500", financialExpenses: "100", askAmount: "1000", askCost: "-0.1"});
    expect(zero).toMatchObject({coverage: "5", coveragePost: null, absent: [{ratio: "coveragePost", denominator: "interest expense plus the interest on the amount asked"}]});
    // Not computed for another reason is not absent: no expense stated.
    expect(calculateInterestCoverage({ebitda: "500", financialExpenses: null, askAmount: "1000", askCost: "0.1"})).toMatchObject({coveragePost: null, absent: []});
  });

  it("leaves the runway after service absent when the burn plus the ticket's interest is zero", () => {
    // 1.200 asked at -100% a year pays back 100 a month, exactly the burn.
    const zero = calculateVentureRunway({cash: "600", monthlyBurn: "100", ask: "1200", assumedRate: "-1", grossDebt: "0", arr: null, statedRunwayMonths: null});
    expect(zero).toMatchObject({monthsPre: "6", monthsPost: "18", monthsPostAfterService: null, monthsBought: null, monthsBoughtBeforeService: "12"});
    expect(zero.absent.map((entry) => entry.ratio)).toEqual(["monthsPostAfterService", "monthsBought"]);
  });

  it("leaves the days over a zero cost of goods sold absent, and the cycle and what growth absorbs with them", () => {
    const zero = calculateWorkingCapitalCycle({revenue: "365", receivables: "30", cogs: "0", inventory: "60", suppliers: "20", nextYearRevenue: "465", workingCapitalAsk: "40"});
    expect(zero).toMatchObject({dso: "30", dio: null, dpo: null, cycleDays: null, growth: "100", growthAbsorption: null, askExceedsTwiceNeed: false, askOverNeed: null});
    expect(zero.absent.map((entry) => entry.ratio)).toEqual(["dio", "dpo", "cycleDays", "growthAbsorption"]);
    expect(zero.absent.every((entry) => entry.denominator === "cost of goods sold")).toBe(true);
    // Inventory not stated: DIO and the cycle are not computed, which is not absent; DPO over the zero cost is.
    const partial = calculateWorkingCapitalCycle({revenue: "365", receivables: "30", cogs: "0", inventory: null, suppliers: "20", nextYearRevenue: null, workingCapitalAsk: null});
    expect(partial.absent.map((entry) => entry.ratio)).toEqual(["dpo"]);
    // A cycle of zero days absorbs nothing: the ask still exceeds twice that, and how many times the need it is, is absent.
    const flat = calculateWorkingCapitalCycle({revenue: "365", receivables: "20", cogs: "365", inventory: "20", suppliers: "40", nextYearRevenue: "465", workingCapitalAsk: "40"});
    expect(flat).toMatchObject({cycleDays: "0", growthAbsorption: "0", askExceedsTwiceNeed: true, askOverNeed: null, growthRelease: null});
    expect(flat.absent).toEqual([{ratio: "askOverNeed", denominator: "working capital that growth absorbs"}]);
  });

  it("reads a negative need as working capital released, never as a negative multiple of the ask (stage 19, third polish)", () => {
    // DSO 20, DIO 36.5 and DPO 146: a cycle of -89.5 days. Revenue growing by 100 releases 100 x 89.5 / 365 of working capital.
    const negative = calculateWorkingCapitalCycle({revenue: "365", receivables: "20", cogs: "100", inventory: "10", suppliers: "40", nextYearRevenue: "465", workingCapitalAsk: "40"});
    expect(negative).toMatchObject({cycleDays: "-89.5", askExceedsTwiceNeed: true, askOverNeed: null, absent: []});
    expect(negative.growthAbsorption!.startsWith("-24.52054794520547945")).toBe(true);
    expect(negative.growthRelease!.startsWith("24.52054794520547945")).toBe(true);
    expect(negative.trace.result).toContain("askOverNeed=none (growth releases 24.5205479452");
    // Until then the ask was divided by the negative need: 40 over -24.52 printed as -1.6 times the need.
    expect(negative.askOverNeed).toBeNull();
    // A positive need keeps its multiple and releases nothing.
    const positive = calculateWorkingCapitalCycle({revenue: "365", receivables: "40", cogs: "365", inventory: "20", suppliers: "20", nextYearRevenue: "465", workingCapitalAsk: "40"});
    expect(positive).toMatchObject({cycleDays: "40", askExceedsTwiceNeed: true, growthRelease: null});
    expect(positive.askOverNeed!.startsWith("3.65")).toBe(true);
  });

  it("leaves a year's leverage, strain and covenant step absent over a zero EBITDA, never ranks or compares them, and states no peak around an absent one", () => {
    const input = {
      referenceMonth: 2026 * 12 + 5, cash: "0", newDebt: {amount: "0", termMonths: 12, graceMonths: 0}, growthHaircut: "0.25", covenantCushion: "0.5", covenantFloor: "2.5", ceilings: ["3"],
      lines: [{balance: "1000", maturityMonth: 2030 * 12 + 5, amortizes: false}],
    };
    // Audited EBITDA of 100: a zero projection in 2027 leaves the base leverage and the strain absent; the stressed case stays on the audited base.
    const projected = projectLeveragePath({...input, auditedEbitda: "100", years: [{year: 2026, ebitda: "400"}, {year: 2027, ebitda: "0"}]});
    expect(projected.years[1]).toMatchObject({ebitdaBase: "0.00", ebitdaStressed: "100.00", leverageBase: null, leverageStressed: "10.0000", scheduleStrain: null});
    expect(projected.peakIndex).toBe(1);
    expect(projected.absent.map((entry) => entry.ratio)).toEqual(["2027.leverageBase", "2027.scheduleStrain"]);
    // Audited EBITDA of zero and a zero projection: the stressed case is zero too, so the peak is absent and so is that year's step.
    const stressed = projectLeveragePath({...input, auditedEbitda: "0", years: [{year: 2026, ebitda: "400"}, {year: 2027, ebitda: "0"}]});
    expect(stressed.years[1]).toMatchObject({leverageBase: null, leverageStressed: null, scheduleStrain: null});
    expect(stressed.peakIndex).toBeNull();
    expect(stressed.covenantProposal).toEqual([{year: 2026, maximum: "4.00"}, {year: 2027, maximum: null}]);
    expect(stressed.absent.map((entry) => entry.ratio)).toEqual(["2027.leverageBase", "2027.leverageStressed", "2027.scheduleStrain", "2027.covenantStep", "peak"]);
    expect(stressed.trace.result).toContain("peak=absent");
    // Net cash over a zero EBITDA: the division gave -Infinity, which crossed under every ceiling. An absent leverage crosses none.
    const netCash = projectLeveragePath({...input, cash: "2000", auditedEbitda: "0", years: [{year: 2027, ebitda: "0"}, {year: 2028, ebitda: "400"}]});
    expect(netCash.crossings).toEqual([{maximum: "3.0000", yearBase: 2028, yearStressed: 2028}]);
    expect(netCash.covenantProposal[0]).toEqual({year: 2027, maximum: null});
  });

  it("leaves the leverage after a liability swap absent over a zero EBITDA", () => {
    const zero = calculateLiabilityManagement({ticket: "700", redeemed: ["700"], grossDebtBefore: "5000", cash: "1000", ebitda: "0"});
    expect(zero).toMatchObject({netNewMoney: "0", leverageAfter: null, absent: [{ratio: "leverageAfter", denominator: "EBITDA"}]});
  });
});
