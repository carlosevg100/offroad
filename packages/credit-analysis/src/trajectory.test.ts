import Decimal from "decimal.js";
import {describe, expect, it} from "vitest";

import {projectLeverageTrajectory, type TrajectoryInput} from "./trajectory";

/** Aurora again: the same room, now asked the question the desk actually answers. */
const aurora = (): TrajectoryInput => ({
  referenceDate: "2026-08-21",
  cash: "8420000",
  existing: [
    {lender: "Banco Itaú", balance: "9840000", maturity: "2027-11-20", amortization: "Mensal", hasCovenant: true},
    {lender: "Banco Bradesco", balance: "7500000", maturity: "2028-04-15", amortization: "Mensal com 6m carência", hasCovenant: true},
    {lender: "Banco Santander", balance: "6260000", maturity: "2027-03-10", amortization: "Mensal"},
    {lender: "Banco do Brasil", balance: "5180000", maturity: "2030-08-01", amortization: "Mensal"},
    {lender: "Sicredi", balance: "4120000", maturity: "2027-06-30", amortization: "Mensal"},
    {lender: "BTG Pactual", balance: "3780000", maturity: "2026-12-20", amortization: "No vencimento"},
    {lender: "Banco Volkswagen", balance: "1820000", maturity: "2029-02-15", amortization: "Mensal"},
  ],
  newDebt: {amount: "42300000", termMonths: 48, graceMonths: 6},
  auditedEbitda: "16848000",
  projectedEbitda: [
    {year: 2026, ebitda: "18760000"},
    {year: 2027, ebitda: "22270000"},
    {year: 2028, ebitda: "26320000"},
    {year: 2029, ebitda: "29510000"},
    {year: 2030, ebitda: "32490000"},
  ],
  existingCovenants: [
    {lender: "Banco Itaú", maximum: "3.0"},
    {lender: "Banco Bradesco", maximum: "3.25"},
  ],
});

describe("the trajectory answers the founder's correction", () => {
  const trajectory = projectLeverageTrajectory(aurora());
  const yearRow = (year: number) => trajectory.years.find((row) => row.year === year)!;
  const finding = (id: string) => trajectory.findings.find((entry) => entry.id === id);

  it("amortises the new loan SAC after grace, to the centavo", () => {
    // 42,3M over 42 amortising months; by Dec 2027 ten instalments are paid:
    // 42.300.000 x 32/42 = 32.228.571,43.
    expect(yearRow(2026).newDebt).toBe("42300000.00");
    expect(yearRow(2027).newDebt).toBe("32228571.43");
    expect(yearRow(2028).newDebt).toBe("20142857.14");
    expect(yearRow(2030).newDebt).toBe("0.00");
  });

  it("runs each existing line on its own schedule, bullets included", () => {
    // BTG matures dezembro/2026: gone by the year end. The wall is visible as the existing
    // stack collapsing from 38,5M to under 6M inside eighteen months.
    expect(Number(yearRow(2026).existingDebt)).toBeCloseTo(24_696_523, -2);
    expect(Number(yearRow(2027).existingDebt)).toBeCloseTo(5_802_667, -2);
  });

  it("peaks in 2026 and crosses back under 3,0x in 2027, even in the cut scenario", () => {
    expect(trajectory.peak.year).toBe(2026);
    expect(Number(trajectory.peak.leverageStressed)).toBeCloseTo(3.204, 2);
    const three = trajectory.crossings.find((crossing) => new Decimal(crossing.maximum).eq("3"));
    expect(three?.yearStressed).toBe(2027);
  });

  it("computes the liability management that dissolves the day-one breach", () => {
    const lm = trajectory.liabilityManagement!;
    expect(lm.covenantedBalance).toBe("17340000.00");
    expect(lm.netNewMoney).toBe("24960000.00");
    expect(Number(lm.postLeverageAfterRefi)).toBeCloseTo(3.2669, 3);
    expect(lm.lendersTakenOut).toEqual(["Banco Itaú", "Banco Bradesco"]);
    expect(finding("liability-management")?.pt).toContain("deixa de existir");
  });

  it("sees that the contracted schedule outruns the operation's cash", () => {
    // 2027 demands ~R$ 29,0M of principal against R$ 22,3M of projected EBITDA.
    const strain = finding("amortization-outruns-cash");
    expect(strain?.severity).toBe("critical");
    expect(strain?.values.year).toBe("2027");
    expect(Number(yearRow(2027).principalDue)).toBeCloseTo(28_965_286, -2);
    expect(Number(yearRow(2027).scheduleStrain)).toBeGreaterThan(1);
  });

  it("proposes a step-down covenant with cushion over the cut scenario, quarter-rounded", () => {
    const step2026 = trajectory.covenantProposal.find((step) => step.year === 2026);
    // 3,2041 stressed + 0,50 cushion = 3,7041 -> next quarter turn up = 3,75.
    expect(step2026?.maximum).toBe("3.75");
    const summary = finding("leverage-trajectory");
    expect(summary?.pt).toContain("2026 ≤ 3,75x");
    expect(summary?.pt).toContain("Primeira aferição");
    // And the schedule never steps below the market floor: 2,50x is where a covenant stops
    // policing deterioration and starts policing ordinary volatility.
    for (const step of trajectory.covenantProposal) {
      expect(Number(step.maximum)).toBeGreaterThanOrEqual(2.5);
    }
    expect(trajectory.covenantProposal.at(-1)?.maximum).toBe("2.50");
  });

  it("orders findings deal-changers first", () => {
    expect(trajectory.findings[0]?.severity).toBe("critical");
  });

  it("states its assumptions instead of hiding them", () => {
    expect(trajectory.assumptions.cashHeldFlat).toBe("8420000.00");
    expect(trajectory.assumptions.growthHaircut).toBe("0.2500");
  });
});

describe("honest degradation", () => {
  it("holds a line flat when it has no maturity, rather than inventing a schedule", () => {
    const input = aurora();
    input.existing = [{lender: "Banco X", balance: "10000000"}];
    input.existingCovenants = [];
    const trajectory = projectLeverageTrajectory(input);
    for (const row of trajectory.years) expect(row.existingDebt).toBe("10000000.00");
    expect(trajectory.liabilityManagement).toBeNull();
  });

  it("cuts only the growth, never the audited base", () => {
    const input = aurora();
    input.projectedEbitda = [{year: 2026, ebitda: "15000000"}];
    const trajectory = projectLeverageTrajectory(input);
    // Projection below the audited base: the stressed basis floors at the base, because the
    // company already proved the base and the haircut is suspicion about the ramp.
    expect(trajectory.years[0]!.ebitdaStressed).toBe("16848000.00");
  });
});

describe("what the money actually buys", () => {
  /** Two lines: one falling due next year, one in five. A refinancing takes out the near one. */
  const stack = [
    {lender: "Bilaterais 12m", balance: "1000", maturity: "2027-06-30", amortization: "mensal"},
    {lender: "Debênture 2031", balance: "1000", maturity: "2031-06-30", amortization: "bullet"},
  ];

  it("redeems the nearest maturity, not a slice of every line", () => {
    const withOperation = projectLeverageTrajectory({
      referenceDate: "2026-06-30",
      cash: "0",
      auditedEbitda: "500",
      projectedEbitda: [{year: 2027, ebitda: "500"}, {year: 2031, ebitda: "500"}],
      existing: stack,
      existingCovenants: [],
      newDebt: {amount: "1000", termMonths: 60, graceMonths: 12, refinancing: "1000"},
    });
    const in2027 = withOperation.years.find((year) => year.year === 2027)!;
    // The 2031 bullet is untouched: the operation bought time on the near parcels and nothing else.
    expect(Number(in2027.existingDebt)).toBe(1000);
    const in2031 = withOperation.years.find((year) => year.year === 2031)!;
    expect(Number(in2031.existingDebt)).toBe(0);
  });
});

describe("a pure liability swap adds no leverage", () => {
  it("states the post on the same base as the pre, even when the map and the balance disagree", () => {
    const result = projectLeverageTrajectory({
      referenceDate: "2026-06-30",
      cash: "1000",
      balanceGrossDebt: "5000",
      auditedEbitda: "1000",
      projectedEbitda: [{year: 2027, ebitda: "1000"}],
      // The schedule sums to 5.100: the map lists 100 the balance sheet does not.
      existing: [{lender: "A", balance: "2600", maturity: "2027-06-30"}, {lender: "B", balance: "2500", maturity: "2031-06-30"}],
      existingCovenants: [],
      newDebt: {amount: "700", termMonths: 60, graceMonths: 12, refinancing: "700"},
    });
    // (5000 - 1000) / 1000 = 4.00x before, and a swap of 700 for 700 leaves it there.
    expect(result.liabilityManagement?.postLeverageAfterRefi).toBe("4.0000");
    expect(result.liabilityManagement?.netNewMoney).toBe("0.00");
  });
});
