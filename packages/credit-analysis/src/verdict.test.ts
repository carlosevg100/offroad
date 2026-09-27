import {describe, expect, it} from "vitest";

import type {DeskAnalysis} from "./analyze";
import type {Trajectory} from "./trajectory";
import {judgeOperation, type Operation, type StructurePrice} from "./verdict";

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

  it("prints spreads and the gaps between them on the decimal value, through financial-core", () => {
    // Half basis points on ties that binary floating point stores low: 500.5 bps is 5.005%, and the
    // float path printed `(500.5 / 100).toFixed(2)` as 5.00, the bigger ticket's gap of 99.5 bps as
    // 0,99 and the shorter road's saving of 100.5 bps as 1,00. No market reference quotes half basis
    // points; the kernels print what the value says.
    const quote = (min: number, max: number): StructurePrice => ({bps: {min, max}, allIn: {min: "0", max: "0"}});
    const priceFor = ({amount, termMonths}: {amount: string; termMonths: number}) =>
      termMonths === 60 ? quote(400, 550) : amount === "700000000" ? quote(500.5, 650.5) : quote(600, 750);
    const verdict = judgeOperation({
      desk: desk(),
      trajectory: trajectory([{year: 2027, principalDue: "0", scheduleStrain: "0"}, {year: 2030, principalDue: "1099200000", scheduleStrain: "1.20"}]),
      operation: {...operation, termMonths: 84, graceMonths: 24},
      priceFor,
    });
    expect(verdict.solves.find((note) => note.id === "price")?.pt).toContain("CDI + 5,01% a 6,51% ao ano");
    expect(verdict.alternatives.find((entry) => entry.id === "size-to-cover-the-later-wall")?.tradeoff.pt)
      .toContain("No preço: CDI + 6,00% a 7,50% contra CDI + 5,01% a 6,51% da estrutura pedida, 1,00 ponto percentual na ponta baixa.");
    expect(verdict.alternatives.find((entry) => entry.id === "shorter-cheaper")?.tradeoff.pt)
      .toContain("No preço: CDI + 4,00% a 5,50% contra CDI + 5,01% a 6,51%, 1,01 ponto percentual economizado ao encurtar.");
  });

  it("refuses a spread that is not a number instead of printing it", () => {
    // The float path printed `CDI + NaN%`; the kernel refuses the quote.
    const priceFor = (): StructurePrice => ({bps: {min: Number.NaN, max: 550}, allIn: {min: "0", max: "0"}});
    expect(() => judgeOperation({desk: desk(), trajectory: trajectory([{year: 2027, principalDue: "0", scheduleStrain: "0"}]), operation, priceFor})).toThrow(RangeError);
  });

  it("stands without conditions when nothing binds", () => {
    const clean = desk({tightestCovenant: {lender: "escrituras", maximum: "5.0000"}}, {liquidityCoverage12: "3.0"});
    const verdict = judgeOperation({desk: clean, trajectory: trajectory([{year: 2027, principalDue: "10000000", scheduleStrain: "0.01"}]), operation});
    expect(verdict.standing).toBe("stands");
    expect(verdict.headline.pt).toContain("suportam, de forma indicativa");
  });
});
