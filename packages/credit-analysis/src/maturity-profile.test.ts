import {describe, expect, it} from "vitest";

import {analyzeCreditPosition} from "./analyze";
import {buildDeskInputs, windowEnd, type Fact} from "./from-facts";

describe("a note's amortisation windows", () => {
  it("reads the last month of a window, a bare year, and refuses an open-ended one", () => {
    expect(windowEnd("Jun/26 a Mai/27")).toBe("2027-05-28");
    expect(windowEnd("Jun/28 a Mai/29")).toBe("2029-05-28");
    expect(windowEnd("2028")).toBe("2028-12-31");
    expect(windowEnd("Após Jun/31")).toBeUndefined();
  });

  it("feeds the 24-month wall when the lines carry no maturities", () => {
    const facts: Fact[] = [
      {fieldPath: "historical_financials.2025.revenue", value: "11115000000"},
      {fieldPath: "historical_financials.2025.ebitda", value: "915300000"},
      {fieldPath: "historical_financials.2025.cash", value: "1430714000"},
      {fieldPath: "historical_financials.2025.receivables", value: "1881602000"},
      {fieldPath: "historical_financials.2025.gross_debt", value: "5670186000"},
      {fieldPath: "debt.instruments.1.lender", value: "Bancos (capital de giro)"},
      {fieldPath: "debt.instruments.1.balance", value: "2417000000"},
      {fieldPath: "debt.instruments.2.lender", value: "Debêntures"},
      {fieldPath: "debt.instruments.2.balance", value: "3253186000"},
      {fieldPath: "debt.maturity_profile.1.window", value: "Jun/26 a Mai/27"},
      {fieldPath: "debt.maturity_profile.1.amount", value: "1229828000"},
      {fieldPath: "debt.maturity_profile.2.window", value: "Jun/27 a Mai/28"},
      {fieldPath: "debt.maturity_profile.2.amount", value: "776868000"},
      {fieldPath: "debt.maturity_profile.3.window", value: "Após Jun/31"},
      {fieldPath: "debt.maturity_profile.3.amount", value: "809198000"},
      {fieldPath: "transaction.requested_amount", value: "1500000000"},
    ];
    const inputs = buildDeskInputs(facts, {referenceDate: "2026-08-21", indexLevels: {cdi: "0.105"}});
    expect(inputs.desk?.maturityProfile).toHaveLength(3);
    const desk = analyzeCreditPosition(inputs.desk!);
    // Jun/26 to May/27 ends within 24 months of August 2026; Jun/27 to May/28 ends in month 21 too.
    expect(desk.stack.maturingWithin24Months).toBe("2006696000.00");
    expect(desk.findings.some((finding) => finding.id === "maturity-wall")).toBe(false);
    // Jun/26 to May/27 is the year ahead: 1,23bn against 1,43bn of cash is 1,16x, and that is
    // the sentence, not the 35% share of the schedule that the 24-month test waves through.
    expect(desk.stack.maturingWithin12Months).toBe("1229828000.00");
    expect(desk.stack.liquidityCoverage12).toBe("1.1633");
    const wall = desk.findings.find((finding) => finding.id === "short-term-principal-vs-cash")!;
    expect(wall.severity).toBe("high");
    expect(wall.pt).toContain("1,16x");
  });
});
