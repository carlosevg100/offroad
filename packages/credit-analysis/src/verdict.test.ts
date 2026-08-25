import {describe, expect, it} from "vitest";

import type {DeskAnalysis} from "./analyze";
import type {Trajectory} from "./trajectory";
import {judgeOperation, type Operation} from "./verdict";

/** Camil's shape: leverage above the covenant, a wall inside twelve months, another in 2030. */
const desk = (overrides: Partial<DeskAnalysis["leverage"]> = {}, stack: Partial<DeskAnalysis["stack"]> = {}): DeskAnalysis =>
  ({
    assumptions: {cdi: "0.105", referenceDate: "2026-08-21"},
    stack: {lines: [], totalSchedule: "5742510000", totalOnBalance: "5670186000", scheduleGap: "-72324000", weightedCost: "0.1167", weightedSpreadOverCdi: "0.0117", unpriceableLines: 0, maturingWithin24Months: "2006696000", maturingWithin12Months: "1229828000", liquidityCoverage12: "1.1633", ...stack},
    leverage: {netDebtPre: "4239486000", ebitda: "915300000", preTurns: "4.6318", scenarios: [], tightestCovenant: {lender: "escrituras", maximum: "4.0000"}, maxNewDebtUnderCovenants: "-578272000", interestCoverage: null, interestCoveragePost: null, ...overrides},
    profile: "cash_generative",
    findings: [],
    encumbrance: {receivablesBase: "0", encumbered: "0", free: "0"},
  } as unknown as DeskAnalysis);

const trajectory = (years: Array<{year: number; principalDue: string; scheduleStrain: string}>): Trajectory =>
  ({
    assumptions: {cashHeldFlat: "0", growthHaircut: "0.25", covenantCushion: "0.5", disbursement: "2026-08-21", ebitdaHeldFlat: true, refinancing: "700000000"},
    years: years.map((year) => ({...year, existingDebt: "0", newDebt: "0", netDebt: "0", ebitdaBase: "915300000", ebitdaStressed: "915300000", leverageBase: "4", leverageStressed: "4"})),
    peak: {year: 2027, leverageBase: "4.65", leverageStressed: "4.65"},
    crossings: [],
    liabilityManagement: null,
    covenantProposal: [],
    findings: [],
  } as unknown as Trajectory);

const operation: Operation = {amount: "700000000", termMonths: 60, graceMonths: 12, instrument: "CRA lastreado em recebíveis do agro", refinancing: "700000000"};

describe("the supportability analysis of the requested structure", () => {
  it("puts the breached covenant in the first line, not in a caveat", () => {
    const verdict = judgeOperation({desk: desk(), trajectory: trajectory([{year: 2027, principalDue: "58333333", scheduleStrain: "0.06"}]), operation});
    expect(verdict.standing).toBe("stands_with_conditions");
    expect(verdict.conditions[0]!.id).toBe("waiver-before-anything");
    expect(verdict.headline.pt).toContain("suportam a estrutura");
    // A pure swap is the argument for the waiver, and the verdict says so.
    expect(verdict.conditions[0]!.pt).toContain("troca pura de passivo");
  });

  it("says what the money buys and what it leaves, with the second road beside it", () => {
    const verdict = judgeOperation({
      desk: desk(),
      trajectory: trajectory([
        {year: 2027, principalDue: "58333333", scheduleStrain: "0.06"},
        {year: 2030, principalDue: "1099200000", scheduleStrain: "1.20"},
      ]),
      operation,
    });
    expect(verdict.solves[0]!.pt).toContain("2027");
    expect(verdict.leaves[0]!.pt).toContain("2030");
    // Rolling 2030 is a road, not a failure: the alternative prices the other one.
    expect(verdict.leaves[0]!.pt).toContain("será rolado de novo");
    const bigger = verdict.alternatives.find((entry) => entry.id === "size-to-cover-the-later-wall")!;
    expect(Number(bigger.amount)).toBe(700000000 + 1099200000);
    expect(bigger.tradeoff.pt).toContain("alavancagem de pico mais alta");
  });

  it("names the shorter road when the ask is long for private credit", () => {
    const verdict = judgeOperation({desk: desk(), trajectory: trajectory([{year: 2027, principalDue: "0", scheduleStrain: "0"}]), operation: {...operation, termMonths: 84, graceMonths: 24}});
    const shorter = verdict.alternatives.find((entry) => entry.id === "shorter-cheaper")!;
    expect(shorter.termMonths).toBe(60);
    expect(shorter.graceMonths).toBe(12);
  });

  it("stands without conditions when nothing binds", () => {
    const clean = desk({tightestCovenant: {lender: "escrituras", maximum: "5.0000"}}, {liquidityCoverage12: "3.0"});
    const verdict = judgeOperation({desk: clean, trajectory: trajectory([{year: 2027, principalDue: "10000000", scheduleStrain: "0.01"}]), operation});
    expect(verdict.standing).toBe("stands");
    expect(verdict.headline.pt).toContain("suportam, de forma indicativa");
  });
});
