import Decimal from "decimal.js";
import {buildIndexedDebtSchedule, type IndexedDebtInstrumentInput} from "./indexed-debt";
import {buildLiquidityCalendar, type LiquidityAccount, type LiquidityEvent} from "./liquidity-calendar";

export const datedDebtVersion = "2026.09.20-v1";
const Money = Decimal.clone({precision: 50, rounding: Decimal.ROUND_HALF_UP});
type DebtTerms = Omit<IndexedDebtInstrumentInput, "openingPrincipal" | "periods">;
export type DatedDebtPeriod = {
  period: string; startDate: string; endDate: string;
  /** Effective rates for this entire declared period; never annualized rates. */
  indexationRate: string; couponRate: string;
  drawdown: string; scheduledPrincipal: string; prepayment: string; repayAll: boolean;
};
export type DatedDebtInstrument = DebtTerms & {
  currency: string; openingPrincipal: string;
  drawdownAccount: LiquidityAccount; paymentAccount: LiquidityAccount;
  periods: readonly DatedDebtPeriod[];
};
export type DatedDebtInput = {
  openingDate: string; endDate: string; currency: string;
  /** Opening stock is end-of-day. Draws participate in the full period's effective rate;
   * cash settlement is on its last day. Other timing conventions are not inferred. */
  convention: "draw_at_period_start_pay_at_period_end";
  instruments: readonly DatedDebtInstrument[];
};
const components = ["drawdown", "indexationPaid", "couponPaid", "scheduledPrincipal", "prepayment"] as const;
export type DebtCashComponent = typeof components[number];
export type DatedDebtEvent = LiquidityEvent & {
  instrumentId: string; period: string; component: DebtCashComponent;
};

function date(value: string) {
  if (typeof value !== "string" || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) throw new Error("dated_debt_invalid_date");
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error("dated_debt_invalid_date");
  return parsed;
}
function nextDay(value: string) {
  const parsed = date(value); parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed.toISOString().slice(0, 10);
}
function amount(value: string) {
  if (typeof value !== "string" || !/^\d{1,24}(?:\.\d{1,8})?$/.test(value)) throw new Error("dated_debt_invalid_amount");
}
function rate(value: string) {
  if (typeof value !== "string" || !/^-?\d{1,4}(?:\.\d{1,16})?$/.test(value) || new Money(value).lte(-1)) throw new Error("dated_debt_invalid_effective_rate");
}

/** Debt components only, not an all-in cost or a complete cash forecast. Recomputes the
 * contractual schedule from operands; callers cannot inject a result/aggregate. All terms,
 * dates and explicit zeros must be grounded upstream in the authorized adopted basis.
 * This pure kernel neither validates sources nor confers permission to read or execute.
 */
export function buildDatedDebtCashFlows(input: DatedDebtInput) {
  // The reused indexed kernel uses the package's Decimal context. Refuse a caller's
  // global override instead of silently changing financial results or mutating it back.
  if (Decimal.precision !== 40 || Decimal.rounding !== Decimal.ROUND_HALF_UP) throw new Error("dated_debt_arithmetic_context_changed");
  date(input.openingDate); date(input.endDate);
  if (input.endDate <= input.openingDate) throw new Error("dated_debt_invalid_horizon");
  if (!/^[A-Z]{3}$/.test(input.currency) || input.convention !== "draw_at_period_start_pay_at_period_end") throw new Error("dated_debt_convention_required");
  if (!input.instruments.length || input.instruments.length > 200 || input.instruments.reduce((n, i) => n + i.periods.length, 0) > 2000) throw new Error("dated_debt_instrument_or_period_limit");
  const ids = new Set<string>();
  const events: DatedDebtEvent[] = [];
  const instruments = input.instruments.map(instrument => {
    if (!instrument.instrumentId.trim() || ids.has(instrument.instrumentId)) throw new Error("dated_debt_duplicate_instrument");
    ids.add(instrument.instrumentId);
    if (instrument.currency !== input.currency) throw new Error("dated_debt_currency_mismatch");
    if (!["available", "restricted"].includes(instrument.drawdownAccount) || !["available", "restricted"].includes(instrument.paymentAccount)) throw new Error("dated_debt_account_required");
    if (!["none", "IPCA", "CDI", "SOFR", "fixed", "other"].includes(instrument.indexer)
      || !["not_applicable", "cash_paid", "capitalized_principal"].includes(instrument.indexationTreatment)
      || !["cash_paid", "capitalized_principal"].includes(instrument.couponTreatment)
      || !["opening_principal", "indexed_principal", "average_principal"].includes(instrument.couponBase)) throw new Error("dated_debt_invalid_terms");
    amount(instrument.openingPrincipal);
    let previousEnd = input.openingDate;
    for (const period of instrument.periods) {
      date(period.startDate); date(period.endDate);
      if (period.startDate !== nextDay(previousEnd) || period.endDate < period.startDate || period.endDate > input.endDate) throw new Error("dated_debt_period_coverage");
      previousEnd = period.endDate;
      amount(period.drawdown); amount(period.scheduledPrincipal); amount(period.prepayment);
      rate(period.indexationRate); rate(period.couponRate);
      if (typeof period.repayAll !== "boolean") throw new Error("dated_debt_repayment_convention_required");
      if (instrument.indexationTreatment === "not_applicable" && !new Money(period.indexationRate).isZero()) throw new Error("dated_debt_unused_indexation_rate");
    }
    if (previousEnd !== input.endDate) throw new Error("dated_debt_period_coverage");
    const schedule = buildIndexedDebtSchedule(instrument);
    const rows = schedule.rows.map((row, index) => {
      const period = instrument.periods[index]!;
      for (const component of components) {
        const value = new Money(row[component]);
        const isDrawdown = component === "drawdown";
        events.push({
          // Tuple encoding prevents delimiter collisions between instrument/period identifiers.
          id: JSON.stringify([instrument.instrumentId, row.period, component]),
          instrumentId: instrument.instrumentId, period: row.period, component,
          date: isDrawdown ? period.startDate : period.endDate,
          account: isDrawdown ? instrument.drawdownAccount : instrument.paymentAccount,
          direction: isDrawdown || value.isNegative() ? "inflow" : "outflow",
          amount: value.abs().toFixed(), missingReason: null,
        });
      }
      return {...row, startDate: period.startDate, endDate: period.endDate};
    });
    return {...schedule, rows, closingPrincipal: rows.at(-1)!.closingPrincipal};
  });
  // Enforce the receiving kernel's date/amount/event contract before returning any projection.
  // Its temporary zero balances are validation only, never the customer's cash position.
  const validated = buildLiquidityCalendar({
    openingDate: input.openingDate, endDate: input.endDate, currency: input.currency,
    convention: "end_of_day_netting", coverage: {status: "partial", reason: "debt_components_only"},
    openingAvailable: "0", openingRestricted: "0", events,
  });
  const byId = new Map(events.map(event => [event.id, event]));
  return {
    schemaVersion: "dated-debt-cash-flows.v1" as const, engineVersion: datedDebtVersion,
    openingDate: input.openingDate, endDate: input.endDate, currency: input.currency,
    convention: input.convention, coverage: "debt_components_only" as const,
    operands: structuredClone(input),
    amountConvention: "indexed_debt_components_rounded_to_8_decimals" as const,
    /** Rounded components are the cash ledger. Never add cashDebtService again. */
    events: validated.events.map(event => ({...byId.get(event.id)!, ...event})), instruments,
  };
}
