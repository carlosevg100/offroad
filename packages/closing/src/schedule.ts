/**
 * The payment schedule of the paper as signed: dates, interest, principal, balance.
 *
 * Deterministic arithmetic over the final terms. The floating leg is read against the CDI the
 * desk states, so the schedule is the schedule "at this CDI" and says so; it is a plan for
 * cash, not a forecast of rates. Monthly periods accrue 1/12 of the annual rate, which is how
 * a CCB is usually written; a 252-business-day daily accrual is the issuer's agent's job at
 * settlement and would put a calendar in a place where only the terms belong.
 */

import Decimal from "decimal.js";

export type AmortizationSystem = "sac" | "price" | "bullet";
export type PaymentFrequency = "monthly" | "quarterly" | "semiannual" | "annual";

export type SchedulePricing =
  | {type: "cdi_plus"; spreadPct: string}
  | {type: "cdi_pct"; pct: string}
  | {type: "fixed"; ratePct: string}
  | {type: "ipca_plus"; spreadPct: string};

export type ScheduleTerms = {
  principal: string;
  /** ISO date of disbursement; the first period starts here. */
  disbursementDate: string;
  tenorMonths: number;
  /** Months with interest only, before principal starts. */
  graceMonths: number;
  amortization: AmortizationSystem;
  frequency: PaymentFrequency;
  pricing: SchedulePricing;
  /** The basis every floating leg is read against, % p.a. */
  basis: {cdiPct: string; ipcaPct?: string};
  /** Interest during grace: paid each period, or capitalised into principal. */
  graceInterest?: "paid" | "capitalised";
};

export type ScheduleLine = {
  n: number;
  date: string;
  openingBalance: string;
  interest: string;
  principal: string;
  payment: string;
  closingBalance: string;
  inGrace: boolean;
};

export type PaymentSchedule = {
  terms: ScheduleTerms;
  /** Annual rate the schedule was computed at, % p.a. */
  annualRatePct: string;
  periodRatePct: string;
  lines: ScheduleLine[];
  totals: {interest: string; principal: string; payments: string};
  /** Interest plus principal in the first 12 months: what the company has to fund next year. */
  firstYearService: string;
  notes: {pt: string; en: string}[];
};

const monthsPer: Record<PaymentFrequency, number> = {monthly: 1, quarterly: 3, semiannual: 6, annual: 12};

export function annualRate(pricing: SchedulePricing, basis: ScheduleTerms["basis"]): Decimal {
  const cdi = new Decimal(basis.cdiPct);
  switch (pricing.type) {
    case "cdi_plus":
      return cdi.plus(pricing.spreadPct);
    case "cdi_pct":
      return cdi.times(pricing.pct).div(100);
    case "fixed":
      return new Decimal(pricing.ratePct);
    case "ipca_plus": {
      if (!basis.ipcaPct) throw new Error("An IPCA+ schedule needs the stated IPCA");
      return new Decimal(1).plus(new Decimal(basis.ipcaPct).div(100)).times(new Decimal(1).plus(new Decimal(pricing.spreadPct).div(100))).minus(1).times(100);
    }
  }
}

/** Adds whole months to an ISO date, clamping the day to the month's length. */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const total = (m - 1) + months;
  const year = y + Math.floor(total / 12);
  const month = (total % 12 + 12) % 12 + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function paymentSchedule(terms: ScheduleTerms): PaymentSchedule {
  const step = monthsPer[terms.frequency];
  if (terms.tenorMonths <= 0 || terms.tenorMonths % step !== 0) throw new RangeError("tenor must be a positive multiple of the payment frequency");
  if (terms.graceMonths < 0 || terms.graceMonths >= terms.tenorMonths || terms.graceMonths % step !== 0) throw new RangeError("grace must be shorter than the tenor and a multiple of the payment frequency");
  const rate = annualRate(terms.pricing, terms.basis);
  // Effective compounding per period from the annual rate, the way Brazilian paper accrues.
  const periodRate = new Decimal(1).plus(rate.div(100)).pow(new Decimal(step).div(12)).minus(1);
  const periods = terms.tenorMonths / step;
  const gracePeriods = terms.graceMonths / step;
  const amortizing = periods - gracePeriods;
  const capitalise = terms.graceInterest === "capitalised";

  const lines: ScheduleLine[] = [];
  let balance = new Decimal(terms.principal);
  // Price: level payment over the amortising periods, computed on the balance at the end of grace.
  let pricePayment: Decimal | null = null;
  for (let n = 1; n <= periods; n += 1) {
    const opening = balance;
    const interest = opening.times(periodRate).toDecimalPlaces(2);
    const inGrace = n <= gracePeriods;
    let principal = new Decimal(0);
    let payment: Decimal;
    if (inGrace) {
      if (capitalise) {
        balance = opening.plus(interest);
        payment = new Decimal(0);
      } else {
        payment = interest;
      }
    } else {
      const remaining = periods - n + 1;
      if (terms.amortization === "bullet") {
        principal = n === periods ? opening : new Decimal(0);
      } else if (terms.amortization === "sac") {
        principal = n === periods ? opening : opening.div(remaining).toDecimalPlaces(2);
      } else {
        if (pricePayment === null) {
          const factor = periodRate.isZero() ? new Decimal(1).div(amortizing) : periodRate.div(new Decimal(1).minus(new Decimal(1).plus(periodRate).pow(-amortizing)));
          pricePayment = opening.times(factor).toDecimalPlaces(2);
        }
        principal = n === periods ? opening : pricePayment.minus(interest).toDecimalPlaces(2);
      }
      balance = opening.minus(principal);
      payment = interest.plus(principal);
    }
    lines.push({
      n,
      date: addMonths(terms.disbursementDate, n * step),
      openingBalance: opening.toFixed(2),
      interest: interest.toFixed(2),
      principal: principal.toFixed(2),
      payment: payment.toFixed(2),
      closingBalance: balance.toFixed(2),
      inGrace,
    });
  }

  const sum = (key: "interest" | "principal" | "payment") => lines.reduce((acc, line) => acc.plus(line[key]), new Decimal(0));
  const firstYear = lines.filter((line) => line.n * step <= 12).reduce((acc, line) => acc.plus(line.payment), new Decimal(0));
  const notes: {pt: string; en: string}[] = [];
  if (terms.pricing.type !== "fixed") notes.push({pt: `Cronograma calculado com CDI de ${terms.basis.cdiPct}% a.a.${terms.basis.ipcaPct ? ` e IPCA de ${terms.basis.ipcaPct}% a.a.` : ""}; os juros efetivos seguem o índice na data de cada parcela.`, en: `Schedule computed at CDI ${terms.basis.cdiPct}% p.a.${terms.basis.ipcaPct ? ` and IPCA ${terms.basis.ipcaPct}% p.a.` : ""}; actual interest follows the index at each payment date.`});
  if (capitalise) notes.push({pt: "Juros da carência capitalizados ao principal.", en: "Grace-period interest capitalised into principal."});

  return {
    terms,
    annualRatePct: rate.toDecimalPlaces(4).toFixed(),
    periodRatePct: periodRate.times(100).toDecimalPlaces(6).toFixed(),
    lines,
    totals: {interest: sum("interest").toFixed(2), principal: sum("principal").toFixed(2), payments: sum("payment").toFixed(2)},
    firstYearService: firstYear.toFixed(2),
    notes,
  };
}
