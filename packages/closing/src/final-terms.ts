/**
 * From the book to the paper: the allocated lines become final terms, and the final terms
 * become one schedule per line and a consolidated schedule for the company.
 *
 * Each investor keeps the pricing it indicated; the company pays the sum. Lines cut to zero
 * in the allocation are not terms. Tenor and grace are the indication's, which is what the
 * investor priced; if the desk wants one tenor for everybody it changes the indications, not
 * the arithmetic here.
 */

import Decimal from "decimal.js";

import type {Book, BookLine} from "@offroad/sounding";

import {paymentSchedule, type AmortizationSystem, type PaymentFrequency, type PaymentSchedule, type ScheduleLine, type ScheduleTerms} from "./schedule";

export type FinalTermLine = {
  investorId: string;
  investorName: string;
  terms: ScheduleTerms;
  /** Conditions the investor attached to its indication, carried to the CP list. */
  conditions: readonly string[];
  securityAsked: string | null;
  firm: boolean;
};

export type FinalTerms = {
  disbursementDate: string;
  lines: FinalTermLine[];
  total: string;
  /** Amount-weighted all-in of the lines, % p.a., on the book's basis. */
  weightedAllInPct: string | null;
};

export type ConsolidatedSchedule = {
  lines: ScheduleLine[];
  perInvestor: Array<{investorId: string; investorName: string; schedule: PaymentSchedule}>;
  totals: {interest: string; principal: string; payments: string};
  firstYearService: string;
  /** Highest single-period payment: the month the treasury has to be ready for. */
  peakPayment: {date: string; amount: string} | null;
};

export function finalTermsFromBook(book: Book, input: {disbursementDate: string; amortization: AmortizationSystem; frequency: PaymentFrequency; graceInterest?: "paid" | "capitalised"}): FinalTerms {
  const allocated = book.lines.filter((line: BookLine) => new Decimal(line.allocated).gt(0));
  const lines: FinalTermLine[] = allocated.map((line) => ({
    investorId: line.investor.id,
    investorName: line.investor.name,
    terms: {
      principal: line.allocated,
      disbursementDate: input.disbursementDate,
      tenorMonths: line.indication.tenorMonths,
      graceMonths: line.indication.graceMonths ?? 0,
      amortization: input.amortization,
      frequency: input.frequency,
      pricing: line.indication.pricing,
      basis: book.basis,
      ...(input.graceInterest ? {graceInterest: input.graceInterest} : {}),
    },
    conditions: line.indication.conditions ?? [],
    securityAsked: line.indication.securityAsked ?? null,
    firm: line.indication.firm,
  }));
  const total = lines.reduce((sum, line) => sum.plus(line.terms.principal), new Decimal(0));
  const weighted = total.gt(0) ? allocated.reduce((sum, line) => sum.plus(new Decimal(line.allInPct).times(line.allocated)), new Decimal(0)).div(total).toDecimalPlaces(2).toFixed() : null;
  return {disbursementDate: input.disbursementDate, lines, total: total.toFixed(), weightedAllInPct: weighted};
}

export function consolidatedSchedule(terms: FinalTerms): ConsolidatedSchedule {
  const perInvestor = terms.lines.map((line) => ({investorId: line.investorId, investorName: line.investorName, schedule: paymentSchedule(line.terms)}));
  // Periods are keyed by date so lines with different frequencies still add up on the calendar.
  const byDate = new Map<string, {interest: Decimal; principal: Decimal; opening: Decimal; closing: Decimal; inGrace: boolean}>();
  for (const {schedule} of perInvestor) {
    for (const line of schedule.lines) {
      const current = byDate.get(line.date) ?? {interest: new Decimal(0), principal: new Decimal(0), opening: new Decimal(0), closing: new Decimal(0), inGrace: true};
      current.interest = current.interest.plus(line.interest);
      current.principal = current.principal.plus(line.principal);
      current.inGrace = current.inGrace && line.inGrace;
      byDate.set(line.date, current);
    }
  }
  const dates = [...byDate.keys()].sort();
  let balance = terms.lines.reduce((sum, line) => sum.plus(line.terms.principal), new Decimal(0));
  const lines: ScheduleLine[] = dates.map((date, index) => {
    const period = byDate.get(date)!;
    const opening = balance;
    // Capitalised grace interest raises the balance; it shows as zero payment and a higher closing balance.
    const capitalised = perInvestor.reduce((sum, {schedule}) => {
      const line = schedule.lines.find((entry) => entry.date === date);
      return line && line.inGrace && line.payment === "0.00" ? sum.plus(line.interest) : sum;
    }, new Decimal(0));
    balance = opening.minus(period.principal).plus(capitalised);
    const payment = period.interest.plus(period.principal).minus(capitalised);
    return {n: index + 1, date, openingBalance: opening.toFixed(2), interest: period.interest.toFixed(2), principal: period.principal.toFixed(2), payment: payment.toFixed(2), closingBalance: balance.toFixed(2), inGrace: period.inGrace};
  });
  const sum = (key: "interest" | "principal" | "payment") => lines.reduce((acc, line) => acc.plus(line[key]), new Decimal(0));
  const firstYearEnd = addMonthsIso(terms.disbursementDate, 12);
  const firstYear = lines.filter((line) => line.date <= firstYearEnd).reduce((acc, line) => acc.plus(line.payment), new Decimal(0));
  const peak = lines.reduce<ScheduleLine | null>((best, line) => (best === null || new Decimal(line.payment).gt(best.payment) ? line : best), null);
  return {
    lines,
    perInvestor,
    totals: {interest: sum("interest").toFixed(2), principal: sum("principal").toFixed(2), payments: sum("payment").toFixed(2)},
    firstYearService: firstYear.toFixed(2),
    peakPayment: peak ? {date: peak.date, amount: peak.payment} : null,
  };
}

function addMonthsIso(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const total = m - 1 + months;
  const year = y + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12 + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(d, lastDay)).padStart(2, "0")}`;
}
