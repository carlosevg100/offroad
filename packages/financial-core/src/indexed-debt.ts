import Decimal from "decimal.js";

export type IndexedDebtTreatment = "not_applicable" | "cash_paid" | "capitalized_principal";
export type CouponTreatment = "cash_paid" | "capitalized_principal";
export type CouponBase = "opening_principal" | "indexed_principal" | "average_principal";

export type IndexedDebtPeriodInput = {
  period: string;
  /** Effective rate for this exact period, after the contractual lag and interpolation. */
  indexationRate: Decimal.Value;
  /** Effective contractual coupon/spread for this exact period. */
  couponRate: Decimal.Value;
  drawdown?: Decimal.Value;
  scheduledPrincipal?: Decimal.Value;
  prepayment?: Decimal.Value;
};

export type IndexedDebtInstrumentInput = {
  instrumentId: string;
  openingPrincipal: Decimal.Value;
  indexer: "none" | "IPCA" | "CDI" | "SOFR" | "fixed" | "other";
  indexationTreatment: IndexedDebtTreatment;
  couponTreatment: CouponTreatment;
  couponBase: CouponBase;
  periods: readonly IndexedDebtPeriodInput[];
};

export type IndexedDebtServiceRow = {
  period: string;
  openingPrincipal: string;
  drawdown: string;
  indexationAccrued: string;
  indexationPaid: string;
  indexationCapitalized: string;
  couponBase: string;
  couponAccrued: string;
  couponPaid: string;
  couponCapitalized: string;
  scheduledPrincipal: string;
  prepayment: string;
  cashDebtService: string;
  nonCashDebtIncrease: string;
  financeExpense: string;
  closingPrincipal: string;
};

export type IndexedDebtSchedule = {
  instrumentId: string;
  rows: IndexedDebtServiceRow[];
  totalCashDebtService: string;
  totalFinanceExpense: string;
  totalIndexationCapitalized: string;
  totalCouponCapitalized: string;
};

const d = (value: Decimal.Value) => new Decimal(value);
const canonical = (value: Decimal) => value.toDecimalPlaces(8).toFixed();

function nonNegative(value: Decimal.Value, label: string): Decimal {
  const parsed = d(value);
  if (parsed.isNegative()) throw new RangeError(`${label} cannot be negative`);
  return parsed;
}

function contractualRate(value: Decimal.Value, label: string): Decimal {
  const parsed = d(value);
  if (!parsed.isFinite() || parsed.lte(-1)) throw new RangeError(`${label} must be finite and greater than -100%`);
  return parsed;
}

/**
 * Builds a contractual debt roll-forward without conflating indexation with cash interest.
 *
 * Brazilian inflation-linked debt measured why the distinction is structural: IPCA may update
 * principal, may be settled in cash, or may not apply at all. Coupon/interest can independently
 * be paid or capitalized. The two non-cash components increase the debt balance and finance
 * expense but do not enter cash debt service in the accrual period.
 */
export function buildIndexedDebtSchedule(input: IndexedDebtInstrumentInput): IndexedDebtSchedule {
  if (!input.instrumentId.trim()) throw new RangeError("instrument id is required");
  if (input.periods.length === 0) throw new RangeError("at least one debt period is required");
  if (input.indexer === "none" && input.indexationTreatment !== "not_applicable") {
    throw new RangeError("a non-indexed instrument cannot accrue indexation");
  }
  if (input.indexer !== "none" && input.indexationTreatment === "not_applicable"
      && input.periods.some((period) => !d(period.indexationRate).isZero())) {
    throw new RangeError("non-zero indexation requires an explicit treatment");
  }

  let principal = nonNegative(input.openingPrincipal, "opening principal");
  let totalCashDebtService = new Decimal(0);
  let totalFinanceExpense = new Decimal(0);
  let totalIndexationCapitalized = new Decimal(0);
  let totalCouponCapitalized = new Decimal(0);
  const seenPeriods = new Set<string>();
  const rows: IndexedDebtServiceRow[] = [];

  for (const period of input.periods) {
    if (!period.period.trim() || seenPeriods.has(period.period)) throw new RangeError(`duplicate or empty debt period: ${period.period}`);
    seenPeriods.add(period.period);
    const openingPrincipal = principal;
    const drawdown = nonNegative(period.drawdown ?? 0, "drawdown");
    const indexationRate = contractualRate(period.indexationRate, "indexation rate");
    const couponRate = contractualRate(period.couponRate, "coupon rate");
    const scheduledRequested = nonNegative(period.scheduledPrincipal ?? 0, "scheduled principal");
    const prepaymentRequested = nonNegative(period.prepayment ?? 0, "prepayment");
    const preIndexationPrincipal = openingPrincipal.plus(drawdown);
    const indexationAccrued = input.indexationTreatment === "not_applicable"
      ? new Decimal(0)
      : preIndexationPrincipal.mul(indexationRate);
    const indexationPaid = input.indexationTreatment === "cash_paid" ? indexationAccrued : new Decimal(0);
    const indexationCapitalized = input.indexationTreatment === "capitalized_principal" ? indexationAccrued : new Decimal(0);
    const indexedPrincipal = preIndexationPrincipal.plus(indexationCapitalized);
    const requestedPrincipal = scheduledRequested.plus(prepaymentRequested);
    if (requestedPrincipal.gt(indexedPrincipal)) throw new RangeError(`principal payment exceeds outstanding balance in ${period.period}`);
    const paidPrincipal = requestedPrincipal;
    const scheduledPrincipal = scheduledRequested;
    const prepayment = prepaymentRequested;
    const couponBase = input.couponBase === "opening_principal"
      ? preIndexationPrincipal
      : input.couponBase === "average_principal"
        ? indexedPrincipal.minus(paidPrincipal.div(2))
        : indexedPrincipal;
    const couponAccrued = Decimal.max(couponBase, 0).mul(couponRate);
    const couponPaid = input.couponTreatment === "cash_paid" ? couponAccrued : new Decimal(0);
    const couponCapitalized = input.couponTreatment === "capitalized_principal" ? couponAccrued : new Decimal(0);
    principal = indexedPrincipal.plus(couponCapitalized).minus(paidPrincipal);
    const cashDebtService = indexationPaid.plus(couponPaid).plus(paidPrincipal);
    const nonCashDebtIncrease = indexationCapitalized.plus(couponCapitalized);
    const financeExpense = indexationAccrued.plus(couponAccrued);

    totalCashDebtService = totalCashDebtService.plus(cashDebtService);
    totalFinanceExpense = totalFinanceExpense.plus(financeExpense);
    totalIndexationCapitalized = totalIndexationCapitalized.plus(indexationCapitalized);
    totalCouponCapitalized = totalCouponCapitalized.plus(couponCapitalized);
    rows.push({
      period: period.period,
      openingPrincipal: canonical(openingPrincipal),
      drawdown: canonical(drawdown),
      indexationAccrued: canonical(indexationAccrued),
      indexationPaid: canonical(indexationPaid),
      indexationCapitalized: canonical(indexationCapitalized),
      couponBase: canonical(couponBase),
      couponAccrued: canonical(couponAccrued),
      couponPaid: canonical(couponPaid),
      couponCapitalized: canonical(couponCapitalized),
      scheduledPrincipal: canonical(scheduledPrincipal),
      prepayment: canonical(prepayment),
      cashDebtService: canonical(cashDebtService),
      nonCashDebtIncrease: canonical(nonCashDebtIncrease),
      financeExpense: canonical(financeExpense),
      closingPrincipal: canonical(principal),
    });
  }

  return {
    instrumentId: input.instrumentId,
    rows,
    totalCashDebtService: canonical(totalCashDebtService),
    totalFinanceExpense: canonical(totalFinanceExpense),
    totalIndexationCapitalized: canonical(totalIndexationCapitalized),
    totalCouponCapitalized: canonical(totalCouponCapitalized),
  };
}

export function aggregateIndexedDebtSchedules(schedules: readonly IndexedDebtSchedule[]) {
  const periods = [...new Set(schedules.flatMap((schedule) => schedule.rows.map((row) => row.period)))].sort();
  return periods.map((period) => {
    const rows = schedules.flatMap((schedule) => schedule.rows.filter((row) => row.period === period));
    const sum = (key: keyof Pick<IndexedDebtServiceRow, "openingPrincipal" | "drawdown" | "indexationAccrued" | "indexationPaid" | "indexationCapitalized" | "couponAccrued" | "couponPaid" | "couponCapitalized" | "scheduledPrincipal" | "prepayment" | "cashDebtService" | "nonCashDebtIncrease" | "financeExpense" | "closingPrincipal">) =>
      canonical(rows.reduce((total, row) => total.plus(row[key]), new Decimal(0)));
    return {
      period,
      openingPrincipal: sum("openingPrincipal"),
      drawdown: sum("drawdown"),
      indexationAccrued: sum("indexationAccrued"),
      indexationPaid: sum("indexationPaid"),
      indexationCapitalized: sum("indexationCapitalized"),
      couponAccrued: sum("couponAccrued"),
      couponPaid: sum("couponPaid"),
      couponCapitalized: sum("couponCapitalized"),
      scheduledPrincipal: sum("scheduledPrincipal"),
      prepayment: sum("prepayment"),
      cashDebtService: sum("cashDebtService"),
      nonCashDebtIncrease: sum("nonCashDebtIncrease"),
      financeExpense: sum("financeExpense"),
      closingPrincipal: sum("closingPrincipal"),
    };
  });
}
