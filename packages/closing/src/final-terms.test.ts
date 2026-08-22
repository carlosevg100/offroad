import {describe, expect, it} from "vitest";

import {syntheticInvestors} from "@offroad/investor-base";
import {buildBook} from "@offroad/sounding";

import {consolidatedSchedule, finalTermsFromBook} from "./index";

describe("from the book to the paper", () => {
  const investors = syntheticInvestors.slice(0, 3);
  const [a, b, c] = investors.map((investor) => investor.id) as [string, string, string];
  const book = buildBook({
    target: "42300000",
    investors,
    basis: {cdiPct: "10.50"},
    indications: [
      {investorId: a, amount: "20000000", tenorMonths: 48, graceMonths: 12, pricing: {type: "cdi_plus", spreadPct: "3.90"}, firm: true, conditions: ["conta vinculada"]},
      {investorId: b, amount: "15000000", tenorMonths: 48, graceMonths: 12, pricing: {type: "cdi_plus", spreadPct: "4.40"}, firm: true},
      {investorId: c, amount: "25000000", tenorMonths: 36, graceMonths: 6, pricing: {type: "fixed", ratePct: "15.00"}, firm: false},
    ],
  });

  it("turns the allocated lines into terms, each with its own pricing, cut to what the book gave", () => {
    const terms = finalTermsFromBook(book, {disbursementDate: "2026-10-30", amortization: "sac", frequency: "monthly"});
    expect(terms.lines).toHaveLength(3);
    expect(terms.total).toBe("42300000");
    expect(terms.lines.map((line) => line.terms.principal)).toEqual(["20000000", "15000000", "7300000"]);
    expect(terms.lines[0]!.conditions).toEqual(["conta vinculada"]);
    expect(terms.lines[2]!.firm).toBe(false);
    expect(terms.weightedAllInPct).toBe("14.68");
    const cut = finalTermsFromBook(buildBook({target: "20000000", investors, basis: {cdiPct: "10.50"}, indications: [{investorId: a, amount: "20000000", tenorMonths: 48, pricing: {type: "cdi_plus", spreadPct: "3.90"}, firm: true}, {investorId: b, amount: "15000000", tenorMonths: 48, pricing: {type: "cdi_plus", spreadPct: "4.40"}, firm: true}]}), {disbursementDate: "2026-10-30", amortization: "sac", frequency: "monthly"});
    expect(cut.lines).toHaveLength(1);
  });

  it("consolidates the schedules on the calendar and names the peak month", () => {
    const terms = finalTermsFromBook(book, {disbursementDate: "2026-10-30", amortization: "sac", frequency: "monthly"});
    const schedule = consolidatedSchedule(terms);
    expect(schedule.perInvestor).toHaveLength(3);
    expect(schedule.lines).toHaveLength(48);
    expect(schedule.lines[0]!.openingBalance).toBe("42300000.00");
    expect(schedule.lines[47]!.closingBalance).toBe("0.00");
    expect(Number(schedule.totals.principal)).toBeCloseTo(42300000, 0);
    expect(schedule.peakPayment?.date).toBe("2027-11-30");
    expect(Number(schedule.firstYearService)).toBeGreaterThan(0);
  });
});
