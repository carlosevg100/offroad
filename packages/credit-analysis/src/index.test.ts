import Decimal from "decimal.js";
import {describe, expect, it} from "vitest";

import {analyzeCreditPosition, type DeskInput} from "./analyze";
import {effectiveAnnualCost, parseCovenant, parseRate, parseReceivablesCoverage} from "./parse";

describe("the language a Brazilian schedule is written in", () => {
  it("reads index plus spread", () => {
    expect(parseRate("CDI + 4,10% a.a.")).toEqual({kind: "index_plus_spread", index: "CDI", spreadAnnual: "0.041000"});
    expect(parseRate("TLP + 2,90% a.a.")).toEqual({kind: "index_plus_spread", index: "TLP", spreadAnnual: "0.029000"});
  });

  it("compounds a monthly rate instead of multiplying it", () => {
    // 1% a.m. is 12,6825% a.a., not 12%. The difference is exactly what a hand-kept schedule
    // gets wrong in the company's favour.
    const rate = parseRate("1,00% a.m.")!;
    expect(effectiveAnnualCost(rate, {cdi: "0.105"})).toBe("0.126825");
  });

  it("refuses to guess a rate it cannot read", () => {
    expect(parseRate("taxa amiga combinada com o gerente")).toBeNull();
  });

  it("returns null, not zero, when an index has no stated level", () => {
    const finame = parseRate("TLP + 2,90% a.a.")!;
    expect(effectiveAnnualCost(finame, {cdi: "0.105"})).toBeNull();
  });

  it("reads a leverage covenant and a coverage clause", () => {
    expect(parseCovenant("Dívida líquida/EBITDA <= 3,0x")).toMatchObject({metric: "net_debt_ebitda", maximum: "3.0000"});
    expect(parseReceivablesCoverage("Duplicatas 130%")).toBe("1.3000");
  });
});

/** Aurora Distribuidora, as the truth file states her. Every expected value below is hand-checked. */
const aurora = (): DeskInput => ({
  indexLevels: {cdi: "0.105", tlp: "0.079"},
  referenceDate: "2026-08-21",
  audited: {year: 2025, revenue: "191200000", ebitda: "16848000", cogs: "143400000"},
  balance: {periodEnd: "2025-12-31", cash: "8420000", receivables: "47310000", inventory: "39880000", suppliers: "33540000", grossDebt: "45320000"},
  interim: {periodEnd: "2026-07-31", months: 7, revenue: "121640000", receivables: "51940000"},
  debt: [
    {lender: "Banco Itaú", balance: "9840000", rate: "CDI + 4,10% a.a.", maturity: "2027-11-20", collateral: "Duplicatas 130%", covenant: "Dívida líquida/EBITDA <= 3,0x"},
    {lender: "Banco Bradesco", balance: "7500000", rate: "CDI + 3,85% a.a.", maturity: "2028-04-15", collateral: "Aval dos sócios", covenant: "Dívida líquida/EBITDA <= 3,25x"},
    {lender: "Banco Santander", balance: "6260000", rate: "CDI + 4,45% a.a.", maturity: "2027-03-10", collateral: "Duplicatas 125%"},
    {lender: "Banco do Brasil", balance: "5180000", rate: "TLP + 2,90% a.a.", maturity: "2030-08-01", collateral: "Alienação fiduciária da frota"},
    {lender: "Sicredi", balance: "4120000", rate: "CDI + 5,20% a.a.", maturity: "2027-06-30", collateral: "Aval dos sócios"},
    {lender: "BTG Pactual", balance: "3780000", rate: "1,42% a.m.", maturity: "2026-12-20", collateral: "Recebíveis cedidos"},
    {lender: "Banco Volkswagen", balance: "1820000", rate: "1,18% a.m.", maturity: "2029-02-15", collateral: "Alienação fiduciária de 11 veículos"},
  ],
  request: {
    amounts: [{value: "40000000", source: "carta do CFO"}, {value: "42300000", source: "plano do projeto"}],
    termMonths: 48,
    graceMonths: 6,
    rateAsk: "CDI + 4,00% a.a.",
    workingCapitalAsk: "25000000",
  },
  project: {operationDate: "2027-09-01"},
  projectedNextYear: {year: 2026, revenue: "208500000"},
});

describe("what a desk head sees in Aurora in five minutes", () => {
  const analysis = analyzeCreditPosition(aurora());
  const finding = (id: string) => analysis.findings.find((entry) => entry.id === id);

  it("computes the number that changes the meeting: R$ 13,6M fit, not R$ 40M", () => {
    // max new debt = 3,0 x 16.848.000 - (45.320.000 - 8.420.000) = 50.544.000 - 36.900.000.
    expect(analysis.leverage.maxNewDebtUnderCovenants).toBe("13644000.00");
    const breach = finding("covenant-breach-day-one");
    expect(breach?.severity).toBe("critical");
    expect(breach?.pt).toContain("R$ 13,6M");
    expect(breach?.pt).toContain("dia um");
  });

  it("takes leverage from ~2,19x to past 4,5x under either stated amount", () => {
    expect(new Decimal(analysis.leverage.preTurns).toNumber()).toBeCloseTo(2.19, 2);
    for (const scenario of analysis.leverage.scenarios) {
      expect(new Decimal(scenario.postTurns).toNumber()).toBeGreaterThan(4.5);
    }
  });

  it("sees the R$ 6,8M of debt outside the schedule, which is the leasing", () => {
    expect(analysis.stack.scheduleGap).toBe("6820000.00");
    expect(finding("stack-vs-balance")?.severity).toBe("critical");
  });

  it("prices every line once the index levels are stated, and compounds the monthly ones", () => {
    expect(analysis.stack.unpriceableLines).toBe(0);
    const weighted = new Decimal(analysis.stack.weightedCost!);
    // Hand check: stack averages ~14,6% a.a. with CDI at 10,5% and TLP at 7,9%.
    expect(weighted.toNumber()).toBeGreaterThan(0.14);
    expect(weighted.toNumber()).toBeLessThan(0.152);
  });

  it("sees the refinancing wall: R$ 31,5M inside 24 months", () => {
    // BTG dez/26, Santander mar/27, Sicredi jun/27, Itaú nov/27 e Bradesco abr/28 all fall
    // inside 24 months of the reference date: 3,78 + 6,26 + 4,12 + 9,84 + 7,50. The first
    // hand-count missed Bradesco, and the engine was right: 82% of the schedule refinances
    // inside the proposed loan's grace-plus-first-year.
    expect(analysis.stack.maturingWithin24Months).toBe("31500000.00");
    expect(finding("maturity-wall")?.severity).toBe("high");
  });

  it("computes the cash cycle a distributor actually runs", () => {
    expect(Number(analysis.workingCapital.dso)).toBeCloseTo(90.3, 0);
    expect(Number(analysis.workingCapital.dpo)).toBeCloseTo(85.4, 0);
    expect(Number(analysis.workingCapital.cycleDays)).toBeCloseTo(106.4, 0);
  });

  it("confronts the working-capital label with the arithmetic of growth", () => {
    // 17,3M of projected growth at a 106-day cycle absorbs ~R$ 5,0M, not R$ 25M.
    const need = new Decimal(analysis.workingCapital.growthAbsorption!);
    expect(need.toNumber()).toBeGreaterThan(4_900_000);
    expect(need.toNumber()).toBeLessThan(5_200_000);
    expect(finding("wc-ask-vs-need")?.severity).toBe("high");
  });

  it("measures how little of the receivables base is actually free", () => {
    // 9,84M x 1,30 + 6,26M x 1,25 + 3,78M ceded = 24.397.000 encumbered of 51.940.000.
    expect(analysis.encumbrance.encumbered).toBe("24397000.00");
    expect(analysis.encumbrance.free).toBe("27543000.00");
    expect(finding("receivables-encumbrance")?.pt).toContain("91%");
  });

  it("refuses to pick between the two stated amounts", () => {
    const divergence = finding("amount-divergence");
    expect(divergence?.severity).toBe("high");
    expect(divergence?.pt).toContain("carta do CFO");
    expect(divergence?.pt).toContain("plano do projeto");
  });

  it("says the rate expectation does not survive the company's own stack", () => {
    expect(finding("rate-ask-vs-stack")?.severity).toBe("high");
  });

  it("sees amortisation starting before the project earns", () => {
    const grace = finding("grace-vs-project");
    expect(grace?.values.gapMonths).toBe("7");
  });

  it("orders the findings so the deal-changers come first", () => {
    const severities = analysis.findings.map((entry) => entry.severity);
    const firstNonCritical = severities.findIndex((severity) => severity !== "critical");
    expect(severities.slice(0, firstNonCritical).every((severity) => severity === "critical")).toBe(true);
  });

  it("cites its inputs on every finding, because a number without provenance is an opinion", () => {
    for (const entry of analysis.findings) {
      expect(entry.inputs.length).toBeGreaterThan(0);
      expect(Object.keys(entry.values).length).toBeGreaterThan(0);
    }
  });
});

describe("honest degradation", () => {
  it("keeps unpriceable lines out of the average and says so", () => {
    const input = aurora();
    input.indexLevels = {cdi: "0.105"};
    const analysis = analyzeCreditPosition(input);
    expect(analysis.stack.unpriceableLines).toBe(1);
    expect(analysis.findings.some((entry) => entry.id === "unparsed-rates" && entry.pt.includes("Banco do Brasil"))).toBe(true);
  });

  it("stays silent where it cannot compute rather than inventing", () => {
    const input = aurora();
    delete input.interim;
    delete (input as {projectedNextYear?: unknown}).projectedNextYear;
    input.request.amounts = [{value: "10000000", source: "carta"}];
    input.request.workingCapitalAsk = undefined as never;
    const analysis = analyzeCreditPosition(input);
    expect(analysis.workingCapital.growthAbsorption).toBeNull();
    expect(analysis.findings.find((entry) => entry.id === "amount-divergence")).toBeUndefined();
  });
});
