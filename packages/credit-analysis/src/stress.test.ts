import {describe, expect, it} from "vitest";

import {analyzeCreditPosition} from "./analyze";
import {buildDeskInputs, type Fact} from "./from-facts";
import {stressTable} from "./stress";

const aurora: Fact[] = [
  {fieldPath: "historical_financials.2025.revenue", value: "191200000"},
  {fieldPath: "historical_financials.2025.ebitda", value: "16848000"},
  {fieldPath: "historical_financials.2025.cogs", value: "143400000"},
  {fieldPath: "historical_financials.2025.cash", value: "8420000"},
  {fieldPath: "historical_financials.2025.receivables", value: "47310000"},
  {fieldPath: "historical_financials.2025.inventory", value: "39880000"},
  {fieldPath: "historical_financials.2025.payables", value: "33540000"},
  {fieldPath: "historical_financials.2025.gross_debt", value: "45320000"},
  {fieldPath: "debt.instruments.1.lender", value: "Banco Itaú"},
  {fieldPath: "debt.instruments.1.balance", value: "9840000"},
  {fieldPath: "debt.instruments.1.rate", value: "CDI + 4,10% a.a."},
  {fieldPath: "debt.instruments.1.covenants", value: "Dívida líquida/EBITDA <= 3,0x"},
  {fieldPath: "transaction.requested_amount", value: "20000000"},
];

describe("the stress table", () => {
  const inputs = buildDeskInputs(aurora, {referenceDate: "2026-08-21", indexLevels: {cdi: "0.105"}});
  const desk = analyzeCreditPosition(inputs.desk!);
  const table = stressTable({desk, revenue: "191200000", topCustomerShare: "0.181"});

  it("runs the four standard shocks and the customer loss", () => {
    expect(table.map((row) => row.id)).toEqual(["ebitda_minus_20", "ebitda_minus_30", "cdi_plus_300", "cycle_plus_15", "top_customer_lost"]);
  });

  it("moves leverage with EBITDA and says when the covenant breaks", () => {
    const base = (36_900_000 + 20_000_000) / 16_848_000; // 3,38x post on reported EBITDA
    expect(Number(table[0]!.leverage)).toBeCloseTo(base / 0.8, 3);
    expect(table[1]!.breachesCovenant).toBe(true);
    expect(Number(table[1]!.covenantHeadroom)).toBeLessThan(0);
  });

  it("raises the interest bill with the CDI and leaves EBITDA alone", () => {
    const cdi = table[2]!;
    expect(cdi.leverage).toBe(table.find((row) => row.id === "cycle_plus_15")!.leverage);
    expect(Number(cdi.annualInterest)).toBeGreaterThan(Number(table[0]!.annualInterest));
    expect(cdi.assumptions.pt).toContain("13,50%");
  });

  it("prices the cycle in working capital and the customer in EBITDA", () => {
    expect(Number(table[3]!.workingCapitalNeed)).toBeCloseTo((191_200_000 * 15) / 365, 0);
    const lost = table[4]!;
    expect(Number(lost.leverage)).toBeGreaterThan(Number(table[2]!.leverage));
    expect(lost.assumptions.pt).toContain("18,1%");
  });
});
