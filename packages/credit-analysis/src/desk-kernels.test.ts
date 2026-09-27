import {describe, expect, it} from "vitest";

import {analyzeCreditPosition, type DeskInput} from "./analyze";
import {projectLeverageTrajectory, type TrajectoryInput} from "./trajectory";

/**
 * The deliberate differences of the move of the desk's arithmetic into `@offroad/financial-core`
 * (stage 19, post-closure polish). No fixture reaches them, so every pin holds; each test below
 * fails on the code before the move.
 */
describe("what the move of the desk to financial-core changed on purpose", () => {
  const desk = (): DeskInput => ({
    indexLevels: {cdi: "0.105"},
    referenceDate: "2026-08-21",
    audited: {year: 2025, revenue: "1000", ebitda: "100"},
    balance: {periodEnd: "2025-12-31", cash: "10", receivables: "100", grossDebt: "200"},
    debt: [{lender: "A", balance: "200"}],
    request: {amounts: [{value: "50", source: "carta"}]},
  });

  it("refuses a figure that is not a finite decimal number, where decimal.js read hexadecimal and infinity", () => {
    expect(() => analyzeCreditPosition(desk())).not.toThrow();
    // Before: the balance read as 16 and the cash as an infinite amount, and the battery went on.
    expect(() => analyzeCreditPosition({...desk(), debt: [{lender: "A", balance: "0x10"}]})).toThrow(RangeError);
    expect(() => analyzeCreditPosition({...desk(), balance: {...desk().balance, cash: "Infinity"}})).toThrow(RangeError);
  });

  const trajectory = (projectedEbitda: TrajectoryInput["projectedEbitda"]): TrajectoryInput => ({
    referenceDate: "2026-06-30",
    cash: "0",
    auditedEbitda: "100",
    existing: [{lender: "A", balance: "1000", maturity: "2027-03-31", amortization: "bullet"}],
    existingCovenants: [],
    newDebt: {amount: "0", termMonths: 12, graceMonths: 0},
    projectedEbitda,
  });

  it("leaves a year of zero projected EBITDA out of the heaviest-year ranking, as the verdict does, instead of printing Infinity%", () => {
    const result = projectLeverageTrajectory(trajectory([{year: 2026, ebitda: "200"}, {year: 2027, ebitda: "0"}]));
    // The published year still states the principal and a strain that is not a number, as before.
    expect(result.years[1]).toMatchObject({principalDue: "1000.00", scheduleStrain: "Infinity"});
    // Before: "O cronograma contratado exige R$ 1 mil de amortização em 2027, Infinity% do EBITDA".
    expect(result.findings.map((finding) => finding.id)).toEqual(["leverage-trajectory"]);
    expect(JSON.stringify(result.findings)).not.toContain("Infinity");
  });

  it("refuses a trajectory without a projected year by name, where it failed reading an undefined peak", () => {
    expect(() => projectLeverageTrajectory(trajectory([]))).toThrow(RangeError);
  });
});
