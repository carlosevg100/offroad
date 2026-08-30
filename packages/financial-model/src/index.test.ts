import {describe, expect, it} from "vitest";
import type {ReconciledFact, TracedCalculation} from "@offroad/reconciliation";

import {evaluate, gridOf, rowValues} from "./evaluate";
import {buildFinancialModel, type FinancialModel} from "./model";
import {toWorkbook, toXlsxBuffer} from "./workbook";

const fact = (fieldPath: string, value: string, periodEnd = "2025-12-31"): ReconciledFact => ({
  key: {fieldPath, periodEnd},
  value,
  valueType: "number",
  accepted: {
    fieldPath,
    normalizedValue: value,
    valueType: "number",
    sourceDocument: "doc-1",
    evidenceRank: 1,
    informationClass: "financial",
    confidence: 0.98,
    anchorVerified: true,
    periodEnd,
  },
  conflicts: [],
  disputed: false,
});

const calculation = (id: string, value: string): TracedCalculation => ({
  id,
  labels: {pt: id, en: id},
  value,
  trace: [],
  inputs: [],
  warnings: [],
});

/** A company with R$ 400m of revenue, R$ 40m of EBITDA, R$ 60m of debt, asking for R$ 45m. */
const build = (overrides: Partial<Parameters<typeof buildFinancialModel>[0]> = {}): FinancialModel =>
  buildFinancialModel({
    archetypeId: "growth_expansion",
    lang: "pt",
    facts: [
      fact("historical_financials.2025.revenue", "400000000"),
      fact("historical_financials.2025.ebitda", "40000000"),
      fact("debt.total_gross", "60000000"),
      fact("historical_financials.2025.cash", "10000000"),
    ],
    calculations: [calculation("adjusted_ebitda", "40000000"), calculation("net_debt", "50000000")],
    requestedAmount: "45000000",
    requestedTermMonths: 60,
    requestedGraceMonths: 12,
    filenames: new Map([["doc-1", "DRE_auditada_2025.pdf"]]),
    ...overrides,
  });

describe("the model computes what a credit desk would check", () => {
  const model = build();
  const grid = gridOf(model, "pt");
  const of = (sheet: string, row: string) => rowValues(model, grid, "pt", sheet, row);

  it("grows revenue off the base year and holds the realised margin", () => {
    const revenue = of("projection", "revenue");
    expect(revenue[0]).toBeCloseTo(400_000_000 * 1.06, 0);
    expect(revenue[4]).toBeCloseTo(400_000_000 * 1.06 ** 5, 0);

    // Base-year margin is 10%, so EBITDA must track revenue at 10% without being restated.
    const ebitda = of("projection", "ebitda");
    expect(ebitda[0]).toBeCloseTo(revenue[0]! * 0.1, 0);
  });

  it("does not amortise the facility during grace, then pays it down straight-line", () => {
    const amortisation = of("debt", "facility_amort");
    // 12 months of grace: year 1 pays interest only.
    expect(amortisation[0]).toBeCloseTo(0, 6);
    // 60 months tenor less 12 of grace is 4 amortising years: 45m / 4 = 11.25m a year.
    expect(amortisation[1]).toBeCloseTo(-11_250_000, 0);
    expect(amortisation[4]).toBeCloseTo(-11_250_000, 0);

    const closing = of("debt", "facility_close");
    expect(closing[0]).toBeCloseTo(45_000_000, 0);
    // Four amortising payments clear the facility by the end of year five.
    expect(closing[4]).toBeCloseTo(0, 0);
  });

  it("never amortises more principal than is outstanding", () => {
    const short = build({requestedTermMonths: 24, requestedGraceMonths: 0});
    const shortGrid = gridOf(short, "pt");
    const closing = rowValues(short, shortGrid, "pt", "debt", "facility_close");
    for (const balance of closing) expect(balance).toBeGreaterThanOrEqual(-1);
    expect(closing[4]).toBeCloseTo(0, 0);
  });

  it("honours a confirmed bullet instead of silently compiling SAC", () => {
    const bullet = build({requestedTermMonths: 36, requestedGraceMonths: 0, amortizationFormat: "bullet"});
    const bulletGrid = gridOf(bullet, "pt");
    const amortisation = rowValues(bullet, bulletGrid, "pt", "debt", "facility_amort");
    expect(amortisation[0]).toBeCloseTo(0, 6);
    expect(amortisation[1]).toBeCloseTo(0, 6);
    expect(amortisation[2]).toBeCloseTo(-45_000_000, 0);
    for (const value of amortisation.slice(3)) expect(value).toBeCloseTo(0, 6);
  });

  it("honours a confirmed Price schedule with level annual debt service after grace", () => {
    const price = build({requestedTermMonths: 60, requestedGraceMonths: 12, amortizationFormat: "price", annualInterestRate: "0.14"});
    const priceGrid = gridOf(price, "pt");
    const amortisation = rowValues(price, priceGrid, "pt", "debt", "facility_amort");
    const interest = rowValues(price, priceGrid, "pt", "debt", "facility_interest");
    const closing = rowValues(price, priceGrid, "pt", "debt", "facility_close");
    expect(amortisation[0]).toBeCloseTo(0, 6);
    const service = amortisation.map((principal, index) => principal + interest[index]!);
    expect(service[1]).toBeCloseTo(service[2]!, 0);
    expect(service[2]).toBeCloseTo(service[3]!, 0);
    expect(closing[4]).toBeCloseTo(0, 0);
  });

  it("uses the governed indicative rate when one is supplied", () => {
    const priced = build({annualInterestRate: "0.155"});
    const assumptions = priced.sheets.find((sheet) => sheet.key === "assumptions")!;
    const rate = assumptions.rows.find((row) => row.key === "interest_rate")!;
    expect(rate.cells[1]?.value).toBe(0.155);
    expect(rate.cells[2]?.value).toContain("faixa indicativa governada");
  });

  it("treats debt service as a cash outflow, consistently across sheets", () => {
    const service = of("debt", "debt_service");
    const mirrored = of("projection", "debt_service");
    for (const value of service) expect(value).toBeLessThan(0);
    expect(mirrored).toEqual(service);

    // Free cash flow is coverage less that outflow, not plus it.
    const cfads = of("projection", "cfads");
    const free = of("projection", "free_cash_flow");
    free.forEach((value, index) => expect(value).toBeCloseTo(cfads[index]! + service[index]!, 0));
  });

  it("computes DSCR as coverage over the outflow, so it is positive when the company can pay", () => {
    const dscr = of("covenants", "dscr");
    const cfads = of("projection", "cfads");
    const service = of("projection", "debt_service");
    dscr.forEach((value, index) => {
      expect(value).toBeGreaterThan(0);
      expect(value).toBeCloseTo(cfads[index]! / -service[index]!, 4);
    });
  });

  it("excludes expansion capex from coverage but charges maintenance capex", () => {
    const cfads = of("projection", "cfads");
    const operating = of("projection", "operating_cash_flow");
    const maintenance = of("projection", "maintenance_capex");
    cfads.forEach((value, index) => expect(value).toBeCloseTo(operating[index]! + maintenance[index]!, 0));
    for (const value of maintenance) expect(value).toBeLessThan(0);
  });

  it("deleverages as the facility pays down", () => {
    const leverage = of("covenants", "leverage");
    expect(leverage[0]).toBeGreaterThan(leverage[4]!);
    // Year one closes with the existing debt already one year amortised (60m over 3 years)
    // plus the whole facility, which is still in grace, less cash.
    const netDebtYearOne = 60_000_000 - 20_000_000 + 45_000_000 - 10_000_000;
    expect(leverage[0]).toBeCloseTo(netDebtYearOne / (400_000_000 * 1.06 * 0.1), 3);
  });

  it("says in words whether each year clears the covenant", () => {
    const sheet = model.sheets.find((entry) => entry.key === "covenants")!;
    const row = sheet.rows.findIndex((entry) => entry.key === "dscr_status") + 1;
    const status = evaluate(grid, `Covenants!C${row}`);
    expect(["dentro", "abaixo do mínimo"]).toContain(status);
  });

  it("charges tax only on profit", () => {
    // A facility large enough that interest swamps EBIT: the company owes nothing, and a
    // model that taxed the loss would overstate coverage in exactly the year it matters.
    const loss = build({requestedAmount: "600000000"});
    const lossGrid = gridOf(loss, "pt");
    const ebt = rowValues(loss, lossGrid, "pt", "projection", "ebt");
    const tax = rowValues(loss, lossGrid, "pt", "projection", "tax");
    expect(ebt[0]).toBeLessThan(0);
    // The invariant is per year, not across the horizon: as the facility amortises the
    // interest falls and the company returns to profit, and then it does owe tax.
    ebt.forEach((profit, index) => {
      if (profit < 0) expect(Math.abs(tax[index]!)).toBe(0);
      else expect(tax[index]!).toBeCloseTo(-profit * 0.34, 0);
    });
    expect(tax.some((value) => value < 0)).toBe(true);
  });
});

describe("the model is honest about what it did not receive", () => {
  it("names every assumption the desk supplied", () => {
    const model = build();
    expect(model.deskAssumptions.join(" ")).toContain("Crescimento de receita de 6%");
    expect(model.deskAssumptions.join(" ")).toContain("A Offroad não precifica");
  });

  it("flags a margin it had to invent", () => {
    const blind = buildFinancialModel({archetypeId: "other", lang: "pt", facts: [], calculations: []});
    expect(blind.deskAssumptions.some((entry) => entry.includes("Margem EBITDA de 10%"))).toBe(true);
  });

  it("marks each driver as coming from the data room or from us", () => {
    const model = build();
    const assumptions = model.sheets.find((sheet) => sheet.key === "assumptions")!;
    const facility = assumptions.rows.find((row) => row.key === "facility")!;
    expect(facility.cells[2]?.value).toBe("do data room");
    const growth = assumptions.rows.find((row) => row.key === "revenue_growth")!;
    expect(growth.cells[2]?.value).toBe("premissa Offroad: editável");
  });

  it("traces every historical number to its document and evidence rank", () => {
    const model = build();
    const sources = model.sheets.find((sheet) => sheet.key === "sources")!;
    const row = sources.rows.find((entry) => entry.key === "fact_0")!;
    expect(row.cells[3]?.value).toBe("DRE_auditada_2025.pdf");
    expect(row.cells[4]?.value).toBe(1);
    expect(row.cells[5]?.value).toBe("sim");
  });
});

describe("every editable cell is on one sheet", () => {
  it("puts no hardcoded input anywhere else", () => {
    // The structural replacement for the blue-cell convention, which this writer cannot emit.
    // A number typed into a projection is how a model quietly stops recalculating.
    const model = build();
    for (const sheet of model.sheets) {
      if (sheet.key === "assumptions" || sheet.key === "sources") continue;
      for (const row of sheet.rows) {
        for (const cell of row.cells) {
          expect(cell.role, `${sheet.key}.${row.key}`).not.toBe("input");
        }
      }
    }
  });
});

describe("the workbook", () => {
  it("writes formulas as formulas, pointing at the assumptions sheet", () => {
    const book = toWorkbook(build(), "pt");
    const projection = book.Sheets["Projeção"]!;
    expect(projection.C3?.f).toBeTruthy();
    expect(projection.C3?.f).toContain("Premissas!");
  });

  it("emits no error-typed cells", async () => {
    // A formula cell written without a cached value comes out as `t="e"` — the error type —
    // and the whole projection opens as #N/A. Nothing about the workbook object shows this;
    // it only appears once the file is written, so the guard reads the file back.
    const XLSX = await import("xlsx");
    const back = XLSX.read(toXlsxBuffer(build(), "pt"), {cellFormula: true});
    let formulas = 0;
    for (const name of back.SheetNames) {
      const sheet = back.Sheets[name]!;
      for (const [address, cell] of Object.entries(sheet)) {
        if (address.startsWith("!")) continue;
        const typed = cell as {t?: string; f?: string};
        expect(typed.t, `${name}!${address}`).not.toBe("e");
        if (typed.f) formulas += 1;
      }
    }
    // And they really are formulas in the file, not values baked at build time.
    expect(formulas).toBeGreaterThan(100);
  });

  it("opens on a cover that says what the model is not", () => {
    const book = toWorkbook(build(), "pt");
    expect(book.SheetNames[0]).toBe("Leia-me");
    const cover = Object.values(book.Sheets["Leia-me"]!)
      .map((cell) => (typeof cell === "object" && cell && "v" in cell ? String(cell.v) : ""))
      .join(" ");
    expect(cover).toContain("Não projeta balanço patrimonial");
    expect(cover).toContain("Toda célula editável está na aba Premissas");
  });

  it("produces a file", () => {
    const bytes = toXlsxBuffer(build(), "pt");
    expect(bytes.byteLength).toBeGreaterThan(4000);
    // The zip magic number: this is really an xlsx, not an error string.
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b]);
  });

  it("renders in English without leaking Portuguese sheet names", () => {
    const book = toWorkbook(buildFinancialModel({archetypeId: "growth_expansion", lang: "en", facts: [], calculations: []}), "en");
    expect(book.SheetNames).toEqual(["Read me", "Assumptions", "Projection", "Debt", "Covenants", "Sources"]);
  });
});
