import Decimal from "decimal.js";

export type RepaymentFormat = "sac" | "price" | "bullet" | "balloon";
export type InterestConvention = "nominal_annual" | "effective_annual";
export type GraceInterest = "paid" | "capitalized";

const d = (value: Decimal.Value) => new Decimal(value);
const canonical = (value: Decimal) => value.toDecimalPlaces(8).toFixed();

export type DebtServiceRow = {
  period: number;
  openingBalance: string;
  interestPaid: string;
  interestCapitalized: string;
  principal: string;
  debtService: string;
  closingBalance: string;
};

export function periodicRate(input: {annualRate: Decimal.Value; periodsPerYear: number; convention: InterestConvention}) {
  if (!Number.isInteger(input.periodsPerYear) || input.periodsPerYear <= 0) throw new RangeError("periods per year must be a positive integer");
  const annual = d(input.annualRate);
  if (annual.lt(0)) throw new RangeError("annual rate cannot be negative");
  return canonical(input.convention === "nominal_annual"
    ? annual.div(input.periodsPerYear)
    : annual.plus(1).pow(d(1).div(input.periodsPerYear)).minus(1));
}

export function buildDebtServiceSchedule(input: {
  amount: Decimal.Value;
  annualRate: Decimal.Value;
  rateConvention: InterestConvention;
  termMonths: number;
  graceMonths: number;
  graceInterest: GraceInterest;
  format: RepaymentFormat;
  balloonPercent?: Decimal.Value;
}): {periodicRate: string; rows: DebtServiceRow[]; totalInterest: string; totalDebtService: string; peakDebtService: string; weightedAverageLifeMonths: string} {
  if (!Number.isInteger(input.termMonths) || input.termMonths <= 0) throw new RangeError("term must be a positive integer");
  if (!Number.isInteger(input.graceMonths) || input.graceMonths < 0 || input.graceMonths >= input.termMonths) throw new RangeError("grace must be an integer below term");
  const originalAmount = d(input.amount);
  if (originalAmount.lte(0)) throw new RangeError("amount must be positive");
  const rate = d(periodicRate({annualRate: input.annualRate, periodsPerYear: 12, convention: input.rateConvention}));
  const repaymentPeriods = input.termMonths - input.graceMonths;
  const balloonPercent = input.format === "balloon" ? d(input.balloonPercent ?? -1) : new Decimal(0);
  if (input.format === "balloon" && (balloonPercent.lt(0) || balloonPercent.gt(1))) throw new RangeError("balloon percent must be between zero and one");

  const rows: DebtServiceRow[] = [];
  let balance = originalAmount;
  let repaymentOpening: Decimal | null = null;
  let totalInterest = new Decimal(0);
  let totalDebtService = new Decimal(0);
  let peakDebtService = new Decimal(0);
  let weightedPrincipalMonths = new Decimal(0);

  for (let period = 1; period <= input.termMonths; period += 1) {
    const opening = balance;
    const accruedInterest = opening.mul(rate);
    const inGrace = period <= input.graceMonths;
    let interestPaid = inGrace && input.graceInterest === "capitalized" ? new Decimal(0) : accruedInterest;
    const interestCapitalized = inGrace && input.graceInterest === "capitalized" ? accruedInterest : new Decimal(0);
    let principal = new Decimal(0);
    if (inGrace) {
      balance = opening.plus(interestCapitalized);
    } else {
      if (repaymentOpening === null) repaymentOpening = opening;
      const repaymentIndex = period - input.graceMonths;
      const periodsLeft = repaymentPeriods - repaymentIndex + 1;
      if (input.format === "sac") {
        principal = Decimal.min(repaymentOpening.div(repaymentPeriods), opening);
      } else if (input.format === "price") {
        const payment = rate.eq(0)
          ? repaymentOpening.div(repaymentPeriods)
          : repaymentOpening.mul(rate).div(new Decimal(1).minus(new Decimal(1).plus(rate).pow(-repaymentPeriods)));
        principal = Decimal.min(payment.minus(accruedInterest), opening);
      } else if (input.format === "bullet") {
        principal = periodsLeft === 1 ? opening : new Decimal(0);
      } else {
        const balloon = repaymentOpening.mul(balloonPercent);
        const regularPrincipal = repaymentOpening.minus(balloon).div(repaymentPeriods);
        principal = periodsLeft === 1 ? opening : Decimal.min(regularPrincipal, opening);
      }
      if (period === input.termMonths) principal = opening;
      balance = Decimal.max(opening.minus(principal), 0);
    }
    const debtService = interestPaid.plus(principal);
    totalInterest = totalInterest.plus(interestPaid).plus(interestCapitalized);
    totalDebtService = totalDebtService.plus(debtService);
    peakDebtService = Decimal.max(peakDebtService, debtService);
    weightedPrincipalMonths = weightedPrincipalMonths.plus(principal.mul(period));
    rows.push({
      period,
      openingBalance: canonical(opening),
      interestPaid: canonical(interestPaid),
      interestCapitalized: canonical(interestCapitalized),
      principal: canonical(principal),
      debtService: canonical(debtService),
      closingBalance: canonical(balance),
    });
  }
  return {
    periodicRate: canonical(rate),
    rows,
    totalInterest: canonical(totalInterest),
    totalDebtService: canonical(totalDebtService),
    peakDebtService: canonical(peakDebtService),
    weightedAverageLifeMonths: canonical(weightedPrincipalMonths.div(originalAmount)),
  };
}

export function calculateCoverageSeries(input: {
  schedule: readonly DebtServiceRow[];
  scenarios: Array<{name: string; cfadsByPeriod: Record<number, Decimal.Value>}>;
}) {
  return input.scenarios.map((scenario) => {
    const periods = input.schedule.map((row) => {
      const cfads = scenario.cfadsByPeriod[row.period];
      if (cfads === undefined) return {period: row.period, cfads: null, debtService: row.debtService, dscr: null};
      const service = d(row.debtService);
      return {period: row.period, cfads: canonical(d(cfads)), debtService: row.debtService, dscr: service.gt(0) ? canonical(d(cfads).div(service)) : null};
    });
    const computable = periods.filter((period): period is typeof period & {dscr: string} => period.dscr !== null);
    const minimum = computable.length
      ? computable.reduce((lowest, period) => d(period.dscr).lt(lowest.dscr) ? period : lowest)
      : null;
    return {name: scenario.name, periods, minimumDscr: minimum?.dscr ?? null, criticalPeriod: minimum?.period ?? null};
  });
}

export function calculateCovenantHeadroom(input: {actual: Decimal.Value; limit: Decimal.Value; direction: "maximum" | "minimum"}) {
  const actual = d(input.actual);
  const limit = d(input.limit);
  const absolute = input.direction === "maximum" ? limit.minus(actual) : actual.minus(limit);
  const percentage = limit.eq(0) ? null : absolute.div(limit);
  return {absolute: canonical(absolute), percentage: percentage === null ? null : canonical(percentage), passes: absolute.gte(0)};
}

export function maturityConcentration(input: {existing: Record<string, Decimal.Value>; proposed: Record<string, Decimal.Value>}) {
  const periods = [...new Set([...Object.keys(input.existing), ...Object.keys(input.proposed)])].sort();
  const rows = periods.map((period) => ({
    period,
    existing: canonical(d(input.existing[period] ?? 0)),
    proposed: canonical(d(input.proposed[period] ?? 0)),
    consolidated: canonical(d(input.existing[period] ?? 0).plus(input.proposed[period] ?? 0)),
  }));
  const total = rows.reduce((sum, row) => sum.plus(row.consolidated), new Decimal(0));
  return {
    rows: rows.map((row) => ({...row, share: total.gt(0) ? canonical(d(row.consolidated).div(total)) : "0"})),
    total: canonical(total),
    peak: rows.length ? rows.reduce((highest, row) => d(row.consolidated).gt(highest.consolidated) ? row : highest) : null,
  };
}
