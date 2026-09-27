import {describe, expect, it} from "vitest";

import {absentRatioGap, publishedRatio, ratioGapLabels} from "./absent-ratio";
import {analyzeCreditPosition, type DeskAnalysis, type DeskInput} from "./analyze";
import {rateCredit} from "./rating";
import {stressTable} from "./stress";
import {projectLeverageTrajectory, type Trajectory, type TrajectoryInput} from "./trajectory";
import {judgeOperation, type StructurePrice} from "./verdict";

/**
 * A ratio over a zero denominator is absent (stage 19, second polish). The desk used to publish it as
 * the division printed it ("Infinity", "NaN"), compare it with thresholds, and, where a sentence
 * printed it, refuse the whole battery or print "Infinityx". Now the field is null, the ratio is
 * listed in `absentRatios` with its gap, every sentence names the gap in words, and no absent ratio
 * is compared. No fixture reaches a zero denominator, so every pin holds; each test below fails on
 * the code before this change.
 */

const printed = (value: unknown) => JSON.stringify(value);
const noDivisionText = (value: unknown) => expect(printed(value)).not.toMatch(/Infinity|NaN/);

/** A small company that generates cash, read by the desk; each test changes what it needs. */
const desk = (overrides: Partial<DeskInput> = {}): DeskInput => ({
  indexLevels: {cdi: "0.105"},
  referenceDate: "2026-08-21",
  audited: {year: 2025, revenue: "365", ebitda: "100", cogs: "365", financialExpenses: "20"},
  balance: {periodEnd: "2025-12-31", cash: "10", receivables: "20", inventory: "20", suppliers: "10", grossDebt: "200"},
  debt: [{lender: "Banco A", balance: "200", rate: "CDI + 3,00% a.a.", maturity: "2029-06-30", covenant: "Dívida líquida/EBITDA <= 3,0x"}],
  request: {amounts: [{value: "50", source: "carta"}], rateAsk: "CDI + 1,00% a.a."},
  ...overrides,
});

describe("the desk over a zero denominator", () => {
  it("publishes leverage over a zero EBITDA as absent, names it, and compares none of it", () => {
    // Net cash over a zero EBITDA and a rate below the stack: the division gave -Infinity before the
    // ask and +Infinity after it, which the desk read as "leverage rises", and the rate finding then
    // printed "Infinityx" through a kernel that refuses it, so the whole battery threw.
    const analysis = analyzeCreditPosition(desk({
      audited: {year: 2025, revenue: "365", ebitda: "0", cogs: "365"},
      balance: {periodEnd: "2025-12-31", cash: "300", receivables: "20", inventory: "20", suppliers: "10", grossDebt: "200"},
    }));
    expect(analysis.profile).toBe("cash_burning");
    expect(analysis.leverage.preTurns).toBeNull();
    expect(analysis.leverage.scenarios).toEqual([{amount: "50.00", source: "carta", postTurns: null}]);
    expect(analysis.absentRatios).toEqual([
      {field: "leverage.preTurns", gap: "ebitda"},
      {field: "leverage.scenarios.0.postTurns", gap: "ebitda"},
    ]);
    expect(analysis.findings.map((finding) => finding.id)).not.toContain("rate-ask-vs-stack");
    expect(analysis.findings.map((finding) => finding.id)).not.toContain("covenant-breach-day-one");
    noDivisionText(analysis);
  });

  it("publishes the days over a zero cost of goods sold as absent, with the cycle and what growth absorbs", () => {
    // Before: DIO and DPO "Infinity", the cycle and what growth absorbs "NaN".
    const analysis = analyzeCreditPosition(desk({
      audited: {year: 2025, revenue: "365", ebitda: "100", cogs: "0"},
      projectedNextYear: {year: 2026, revenue: "465"},
      request: {amounts: [{value: "50", source: "carta"}], workingCapitalAsk: "40"},
    }));
    expect(analysis.workingCapital).toEqual({dso: "20.0", dio: null, dpo: null, cycleDays: null, growthAbsorption: null});
    expect(analysis.absentRatios).toEqual([
      {field: "workingCapital.dio", gap: "cost_of_goods_sold"},
      {field: "workingCapital.dpo", gap: "cost_of_goods_sold"},
      {field: "workingCapital.cycleDays", gap: "cost_of_goods_sold"},
      {field: "workingCapital.growthAbsorption", gap: "cost_of_goods_sold"},
    ]);
    expect(analysis.findings.map((finding) => finding.id)).not.toContain("wc-ask-vs-need");
    noDivisionText(analysis);
  });

  it("says an ask is no multiple of a need of zero, instead of printing Infinity times the need", () => {
    // DSO 20 + DIO 20 - DPO 40: a cycle of zero days, so growth absorbs nothing and 40 is labelled working capital.
    const analysis = analyzeCreditPosition(desk({
      balance: {periodEnd: "2025-12-31", cash: "10", receivables: "20", inventory: "20", suppliers: "40", grossDebt: "200"},
      projectedNextYear: {year: 2026, revenue: "465"},
      request: {amounts: [{value: "50", source: "carta"}], workingCapitalAsk: "40"},
    }));
    const finding = analysis.findings.find((entry) => entry.id === "wc-ask-vs-need")!;
    // Before: "... como giro, Infinity vezes a necessidade incremental."
    expect(finding.pt).toContain("não absorve capital de giro ao ciclo atual de 0 dias, mas o pedido rotula R$ 40 como giro; sem necessidade incremental, o pedido não é múltiplo dela.");
    expect(finding.en).toContain("absorbs no working capital at the current 0-day cycle, yet the ask labels R$ 40 as working capital; with no incremental need, the ask is no multiple of it.");
    expect(finding.values).toEqual({need: "0.00", ask: "40.00", cycleDays: "0.0"});
    expect(analysis.workingCapital.growthAbsorption).toBe("0.00");
    expect(analysis.absentRatios).toBeUndefined();
    noDivisionText(analysis);
  });

  it("publishes the coverage with the ask as absent when the interest it divides by sums to zero", () => {
    // A CDI of -50% puts the ask at CDI + 0% at a cost of -50%: 1.200 of expense plus 2.400 x -50% is zero.
    const analysis = analyzeCreditPosition(desk({
      indexLevels: {cdi: "-0.5"},
      audited: {year: 2025, revenue: "365", ebitda: "1000", cogs: "365", financialExpenses: "1200"},
      request: {amounts: [{value: "2400", source: "carta"}], rateAsk: "CDI + 0% a.a."},
    }));
    expect(analysis.leverage.interestCoverage).toBe("0.8333");
    // Before: "Infinity".
    expect(analysis.leverage.interestCoveragePost).toBeNull();
    expect(analysis.absentRatios).toEqual([{field: "leverage.interestCoveragePost", gap: "interest_with_ask"}]);
    expect(analysis.findings.map((finding) => finding.id)).not.toContain("thin-interest-coverage");
    noDivisionText(analysis);
  });

  it("publishes the runway after service as absent when the burn and the ticket's interest sum to zero, and names the gap in the sentence", () => {
    // Burn of 100 a month; 2.400 asked at CDI + 0% with a CDI of -50% pays back 100 a month.
    const analysis = analyzeCreditPosition(desk({
      indexLevels: {cdi: "-0.5"},
      audited: {year: 2025, revenue: "365", ebitda: "-50", cogs: "365"},
      balance: {periodEnd: "2025-12-31", cash: "600", receivables: "20", grossDebt: "0"},
      debt: [],
      request: {amounts: [{value: "2400", source: "carta"}], rateAsk: "CDI + 0% a.a."},
      venture: {monthlyBurn: "100"},
    }));
    // Before: "Infinity" months, and a sentence that bought "Infinity meses".
    expect(analysis.runway).toMatchObject({monthsPre: "6.0", monthsPost: "30.0", monthsPostAfterService: null});
    expect(analysis.absentRatios).toEqual([{field: "runway.monthsPostAfterService", gap: "burn_with_service"}]);
    const bought = analysis.findings.find((finding) => finding.id === "runway-bought")!;
    expect(bought.pt).toContain("o runway não é calculável, porque a queima mensal somada aos juros mensais da captação é zero");
    expect(bought.en).toContain("runway is not computable, because monthly burn plus the raise's monthly interest is zero");
    expect(Object.keys(bought.values)).not.toContain("monthsPostAfterService");
    noDivisionText(analysis);
  });
});

const trajectoryInput = (overrides: Partial<TrajectoryInput> = {}): TrajectoryInput => ({
  referenceDate: "2026-06-30",
  cash: "0",
  auditedEbitda: "100",
  existing: [{lender: "Banco A", balance: "1000", maturity: "2030-06-30", amortization: "bullet"}],
  existingCovenants: [{lender: "Banco A", maximum: "3"}],
  newDebt: {amount: "500", termMonths: 36, graceMonths: 12},
  projectedEbitda: [{year: 2026, ebitda: "200"}, {year: 2027, ebitda: "0"}, {year: 2028, ebitda: "400"}],
  ...overrides,
});

describe("the trajectory over a zero EBITDA", () => {
  it("publishes a year's leverage and strain as absent over a zero projection and names the gap", () => {
    const result = projectLeverageTrajectory(trajectoryInput());
    // Before: leverage "Infinity" and a strain "Infinity" in 2027.
    expect(result.years[1]).toMatchObject({year: 2027, leverageBase: null, leverageStressed: "13.7500", scheduleStrain: null});
    expect(result.peak).toEqual({year: 2027, leverageBase: null, leverageStressed: "13.7500"});
    expect(result.absentRatios).toEqual([
      {field: "years.2027.leverageBase", gap: "projected_ebitda"},
      {field: "years.2027.scheduleStrain", gap: "projected_ebitda"},
    ]);
    const path = result.findings.find((finding) => finding.id === "leverage-trajectory")!;
    // Before: the peak sentence printed the uncut leverage of 2027 through a kernel that refuses it, and the trajectory threw.
    expect(path.pt).toContain("pico de 13,75x no cenário com corte de 25% do crescimento em 2027 (sem o corte, a alavancagem desse ano não é calculável, porque o EBITDA projetado é zero)");
    expect(path.values).toEqual({peakStressed: "13.7500", peakYear: "2027"});
    noDivisionText(result);
  });

  it("states no peak, no covenant step and no leverage after the swap when the stressed EBITDA is zero", () => {
    // A zero audited EBITDA and a zero projection: the cut case is zero in 2027, and so is the base of the swap.
    const result = projectLeverageTrajectory(trajectoryInput({
      auditedEbitda: "0",
      existing: [{lender: "Banco A", balance: "1000", maturity: "2030-06-30", amortization: "bullet", hasCovenant: true}],
    }));
    expect(result.peak).toBeNull();
    expect(result.years[1]).toMatchObject({leverageBase: null, leverageStressed: null, scheduleStrain: null});
    expect(result.covenantProposal.find((step) => step.year === 2027)).toEqual({year: 2027, maximum: null});
    expect(result.liabilityManagement).toMatchObject({postLeverageAfterRefi: null, lendersTakenOut: ["Banco A"]});
    expect(result.absentRatios).toEqual(expect.arrayContaining([
      {field: "peak", gap: "stressed_ebitda"},
      {field: "years.2027.leverageStressed", gap: "stressed_ebitda"},
      {field: "covenantProposal.2027.maximum", gap: "stressed_ebitda"},
      {field: "liabilityManagement.postLeverageAfterRefi", gap: "ebitda"},
    ]));
    const path = result.findings.find((finding) => finding.id === "leverage-trajectory")!;
    expect(path.pt).toContain("o pico não pode ser afirmado, porque a alavancagem no cenário com corte de 25% do crescimento não é calculável em 2027: o EBITDA do ano nesse cenário é zero");
    expect(path.pt).toContain("; sem teste proposto para 2027, porque o EBITDA do ano no cenário cortado é zero.");
    expect(path.en).toContain("the peak cannot be stated, because leverage with 25% of the growth cut is not computable in 2027: that year's EBITDA in the cut case is zero");
    const swap = result.findings.find((finding) => finding.id === "liability-management")!;
    expect(swap.pt).toContain("a alavancagem pós sobre o EBITDA reportado não é calculável (o EBITDA do último exercício é zero)");
    expect(Object.keys(swap.values)).not.toContain("postLeverage");
    noDivisionText(result);
  });

  it("crosses no ceiling on an absent leverage: net cash over a zero EBITDA is not under the covenant", () => {
    // Before: -Infinity, read as under every ceiling in 2027.
    const result = projectLeverageTrajectory(trajectoryInput({cash: "2000", newDebt: {amount: "0", termMonths: 12, graceMonths: 0}}));
    expect(result.crossings).toEqual([{maximum: "3.0000", yearBase: 2026, yearStressed: 2026}]);
    const later = projectLeverageTrajectory(trajectoryInput({
      cash: "2000", newDebt: {amount: "0", termMonths: 12, graceMonths: 0},
      projectedEbitda: [{year: 2027, ebitda: "0"}, {year: 2028, ebitda: "400"}],
    }));
    expect(later.crossings[0]!.yearBase).toBe(2028);
    noDivisionText(later);
  });
});

describe("the verdict, the grade and the shocks over an absent ratio", () => {
  const zeroDesk = (): DeskAnalysis => analyzeCreditPosition(desk({
    audited: {year: 2025, revenue: "365", ebitda: "0", cogs: "0"},
    balance: {periodEnd: "2025-12-31", cash: "10", receivables: "20", inventory: "20", suppliers: "10", grossDebt: "200"},
  }));

  it("prices nothing on a trajectory whose peak is absent, and writes no waiver on an absent leverage", () => {
    const trajectory: Trajectory = projectLeverageTrajectory(trajectoryInput({auditedEbitda: "0"}));
    expect(trajectory.peak).toBeNull();
    const asked: Array<{leveragePost: string}> = [];
    const priceFor = (structure: {leveragePost: string}): StructurePrice => {
      asked.push(structure);
      return {bps: {min: 400, max: 550}, allIn: {min: "0.15", max: "0.17"}};
    };
    // Before: the trajectory printed its peak "Infinity" through a kernel that refuses it, and threw before any verdict.
    const verdict = judgeOperation({desk: zeroDesk(), trajectory, operation: {amount: "500", termMonths: 36, graceMonths: 12, instrument: "CCB"}, priceFor});
    expect(asked).toEqual([]);
    expect(verdict.price).toBeNull();
    expect(verdict.conditions.map((condition) => condition.id)).not.toContain("waiver-before-anything");
    noDivisionText(verdict);
  });

  it("does not rate an absent runway after service, and names why", () => {
    const venture = analyzeCreditPosition(desk({
      indexLevels: {cdi: "-0.5"},
      audited: {year: 2025, revenue: "365", ebitda: "-50", cogs: "365"},
      balance: {periodEnd: "2025-12-31", cash: "600", receivables: "20", grossDebt: "0"},
      debt: [],
      request: {amounts: [{value: "2400", source: "carta"}], rateAsk: "CDI + 0% a.a."},
      venture: {monthlyBurn: "100"},
    }));
    // Before: the runway "Infinity" earned the four points of a runway above 24 months.
    const runway = rateCredit({desk: venture, trajectory: null}).factors.find((factor) => factor.id === "runway")!;
    expect(runway).toMatchObject({value: null, points: null});
    expect(runway.rationale.pt).toBe("Não avaliada: o runway após a operação não é calculável, porque a queima mensal somada aos juros mensais da captação é zero.");
  });

  it("names an absent cash cycle in the shock that lengthens it", () => {
    // Before: "Ciclo de NaN para NaN dias".
    const cycle = stressTable({desk: zeroDesk(), revenue: "365"}).find((row) => row.id === "cycle_plus_15")!;
    expect(cycle.assumptions.pt).toBe("Ciclo de caixa não calculável (custo das mercadorias vendidas do último exercício igual a zero); o capital de giro absorvido é 15/365 da receita anual.");
    expect(cycle.assumptions.en).toBe("Cash cycle not computable (cost of goods sold for the latest financial year is zero); the working capital absorbed is 15/365 of annual revenue.");
  });
});

describe("reading an absent ratio", () => {
  it("names the gap the output lists, reads the division text of a desk stored before as absent, and leaves a ratio not computed for another reason alone", () => {
    const listed = {absentRatios: [{field: "workingCapital.dio", gap: "cost_of_goods_sold" as const}]};
    expect(absentRatioGap(listed, "workingCapital.dio", null)).toEqual(ratioGapLabels.cost_of_goods_sold);
    // Null without a listed gap is an input the room does not carry, not an absent ratio.
    expect(absentRatioGap({}, "workingCapital.dio", null)).toBeNull();
    // A desk stored before this change printed the division: read as absent, by what the field divides by.
    expect(absentRatioGap(undefined, "years.2027.leverageBase", "Infinity")).toEqual(ratioGapLabels.projected_ebitda);
    expect(absentRatioGap(undefined, "years.2027.leverageStressed", "NaN")).toEqual(ratioGapLabels.stressed_ebitda);
    expect(absentRatioGap(undefined, "leverage.preTurns", "-Infinity")).toEqual(ratioGapLabels.ebitda);
    expect(absentRatioGap(undefined, "workingCapital.cycleDays", "NaN")).toEqual(ratioGapLabels.cost_of_goods_sold);
    expect(absentRatioGap(undefined, "leverage.preTurns", "2.19")).toBeNull();
    expect([publishedRatio("Infinity"), publishedRatio("NaN"), publishedRatio(null), publishedRatio(undefined), publishedRatio("2.19")]).toEqual([null, null, null, null, "2.19"]);
    for (const label of Object.values(ratioGapLabels)) {
      for (const text of [label.pt, label.en]) expect(text).not.toMatch(/[\u2013\u2014_]|Infinity|NaN/);
    }
  });
});
