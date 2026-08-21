import {describe, expect, it} from "vitest";

import {analyzeCreditPosition} from "./analyze";
import {buildDeskInputs, type Fact} from "./from-facts";
import {parseRate} from "./parse";
import {questionsForCompany} from "./questions";

/** A Series A startup: the desk reads runway, not turns. */
const nimbus: Fact[] = [
  {fieldPath: "historical_financials.2025.revenue", value: "28600000"},
  {fieldPath: "historical_financials.2025.ebitda", value: "-19400000"},
  {fieldPath: "historical_financials.2025.cash", value: "36400000"},
  {fieldPath: "historical_financials.2025.receivables", value: "3700000"},
  {fieldPath: "historical_financials.2025.gross_debt", value: "3500000"},
  {fieldPath: "interim_financials.2026_07.revenue_7m", value: "21900000"},
  {fieldPath: "interim_financials.2026_07.cash", value: "24100000"},
  {fieldPath: "interim_financials.2026_07.receivables", value: "4900000"},
  {fieldPath: "interim_financials.2026_07.gross_debt", value: "3200000"},
  {fieldPath: "interim_financials.2026_07.arr", value: "37326000"},
  {fieldPath: "interim_financials.2026_07.monthly_burn", value: "1850000"},
  {fieldPath: "company.runway_months", value: "16"},
  {fieldPath: "company.net_revenue_retention", value: "0.93"},
  {fieldPath: "customers.top_customers.1.share_pct", value: "0.24"},
  {fieldPath: "debt.instruments.1.lender", value: "FINEP"},
  {fieldPath: "debt.instruments.1.balance", value: "3200000"},
  {fieldPath: "debt.instruments.1.rate", value: "TR + 5,00% a.a."},
  {fieldPath: "debt.covenants.1.metric", value: "Dívida líquida / EBITDA"},
  {fieldPath: "debt.covenants.1.threshold", value: "3.0"},
  {fieldPath: "transaction.requested_amount", value: "15000000"},
  {fieldPath: "transaction.desired_term_months", value: "36"},
  {fieldPath: "transaction.desired_grace_months", value: "12"},
  {fieldPath: "projections.2026.ebitda", value: "-10000000"},
  {fieldPath: "projections.2027.ebitda", value: "2000000"},
];
const options = {referenceDate: "2026-08-21", indexLevels: {cdi: "0.105", tlp: "0.079", ipca: "0.045", tr: "0.002"}};

describe("the desk on a cash-burning company", () => {
  const inputs = buildDeskInputs(nimbus, options);
  const desk = analyzeCreditPosition(inputs.desk!);

  it("reads TR-indexed lines", () => {
    expect(parseRate("TR + 5,00% a.a.")).toEqual({kind: "index_plus_spread", index: "TR", spreadAnnual: "0.050000"});
    expect(desk.stack.unpriceableLines).toBe(0);
  });

  it("declares the profile and refuses to test a covenant over a negative EBITDA", () => {
    expect(desk.profile).toBe("cash_burning");
    expect(desk.findings.some((finding) => finding.id === "covenant-breach-day-one")).toBe(false);
    expect(inputs.trajectory).toBeNull();
  });

  it("computes runway before, after, and after paying its own interest", () => {
    expect(desk.runway?.monthsPre).toBe("13.0");
    expect(desk.runway?.monthsPost).toBe("21.1");
    expect(Number(desk.runway?.monthsPostAfterService)).toBeLessThan(21.1);
    expect(desk.runway?.assumedRate).toBe("0.165000");
  });

  it("catches the founder's runway, the debt-to-ARR, the retention and the concentration", () => {
    const ids = desk.findings.map((finding) => finding.id);
    expect(ids).toEqual(expect.arrayContaining(["runway-stated-vs-computed", "debt-to-arr", "nrr-below-par", "customer-concentration", "runway-bought"]));
    expect(desk.findings.find((finding) => finding.id === "runway-stated-vs-computed")!.pt).toContain("16 meses");
  });

  it("asks the venture questions", () => {
    const questions = questionsForCompany(desk, null, inputs.missing);
    const ids = questions.map((question) => question.findingId);
    expect(ids).toEqual(expect.arrayContaining(["runway-stated-vs-computed", "debt-to-arr", "customer-concentration", "nrr-below-par"]));
  });

  it("flags a short runway as the first sentence", () => {
    const short = analyzeCreditPosition({...inputs.desk!, balance: {...inputs.desk!.balance, cash: "14000000"}});
    expect(short.findings[0]?.id).toBe("runway-short");
    expect(short.findings[0]?.severity).toBe("critical");
  });
});
