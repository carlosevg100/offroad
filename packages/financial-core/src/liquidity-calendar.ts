import Decimal from "decimal.js";

export const liquidityCalendarVersion = "2026.09.20-v1";
const Money = Decimal.clone({precision: 50, rounding: Decimal.ROUND_HALF_UP});
export type LiquidityAccount = "available" | "restricted";
export type LiquidityEvent = {
  id: string; date: string; account: LiquidityAccount; direction: "inflow" | "outflow";
  amount: string | null; missingReason: string | null;
};
export type LiquidityCalendarInput = {
  openingDate: string; endDate: string; currency: string;
  convention: "end_of_day_netting";
  coverage: {status: "complete" | "partial"; reason: string};
  openingAvailable: string | null; openingRestricted: string | null;
  events: readonly LiquidityEvent[];
};
function validDate(value: string) {
  if (typeof value !== "string" || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) throw new Error("liquidity_invalid_date");
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error("liquidity_invalid_date");
}
function money(value: string | null, signed = false): Decimal | null {
  if (value === null) return null;
  if (typeof value !== "string" || !/^-?\d{1,24}(?:\.\d{1,8})?$/.test(value)) throw new Error("liquidity_invalid_amount");
  const parsed = new Money(value);
  if (!signed && parsed.isNegative()) throw new Error("liquidity_negative_amount");
  return parsed;
}
/** End-of-day identity, not intraday payment assurance. Dates are supplied effective dates;
 * no business-day adjustment, refinancing assumption or restricted-cash release is inferred.
 * Null operands propagate per account. Complete coverage is a caller declaration, not certification.
 */
export function buildLiquidityCalendar(input: LiquidityCalendarInput) {
  validDate(input.openingDate); validDate(input.endDate);
  if (input.endDate <= input.openingDate) throw new Error("liquidity_invalid_horizon");
  if (!/^[A-Z]{3}$/.test(input.currency) || input.convention !== "end_of_day_netting") throw new Error("liquidity_convention_required");
  if (!["complete", "partial"].includes(input.coverage.status) || !input.coverage.reason.trim()) throw new Error("liquidity_coverage_required");
  if (input.events.length > 10000) throw new Error("liquidity_event_limit");
  const balances = {available: money(input.openingAvailable, true), restricted: money(input.openingRestricted)};
  const initial = {available: balances.available?.toFixed() ?? null, restricted: balances.restricted?.toFixed() ?? null};
  const ids = new Set<string>();
  const gaps: {eventId: string | null; account: LiquidityAccount | null; reason: string}[] = [];
  for (const account of ["available", "restricted"] as const) if (balances[account] === null) gaps.push({eventId: null, account, reason: "opening_balance_unknown"});
  if (input.coverage.status === "partial") gaps.push({eventId: null, account: null, reason: input.coverage.reason});
  const events = input.events.map(event => {
    if (!event.id.trim() || ids.has(event.id)) throw new Error("liquidity_duplicate_event");
    ids.add(event.id); validDate(event.date);
    if (event.date <= input.openingDate || event.date > input.endDate) throw new Error("liquidity_event_outside_horizon");
    if (!["available", "restricted"].includes(event.account) || !["inflow", "outflow"].includes(event.direction)) throw new Error("liquidity_invalid_event");
    if ((event.amount === null) !== (typeof event.missingReason === "string" && event.missingReason.trim().length > 0) || (event.amount !== null && event.missingReason !== null)) throw new Error("liquidity_missing_reason_required");
    const amount = money(event.amount);
    if (amount === null) gaps.push({eventId: event.id, account: event.account, reason: event.missingReason!});
    return {id: event.id, date: event.date, account: event.account, direction: event.direction, amount: amount?.toFixed() ?? null, missingReason: event.missingReason};
  }).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const byDate = new Map<string, typeof events>();
  for (const event of events) {
    const day = byDate.get(event.date) ?? []; day.push(event); byDate.set(event.date, day);
  }
  const dates = [...new Set([...byDate.keys(), input.endDate])].sort();
  let firstKnownShortfallDate = balances.available?.isNegative() ? input.openingDate : null;
  let maximumKnownShortfall = balances.available ? Money.max(balances.available.negated(), 0) : null;
  const rows = dates.map(date => {
    const day = byDate.get(date) ?? [];
    const accountResult = (account: LiquidityAccount) => {
      const opening = balances[account];
      const selected = day.filter(event => event.account === account);
      const sum = (direction: LiquidityEvent["direction"]) => {
        const values = selected.filter(event => event.direction === direction);
        return values.some(event => event.amount === null) ? null : values.reduce((total, event) => total.plus(event.amount!), new Money(0));
      };
      const inflows = sum("inflow"); const outflows = sum("outflow");
      const closing = opening !== null && inflows !== null && outflows !== null ? opening.plus(inflows).minus(outflows) : null;
      balances[account] = closing;
      return {opening: opening?.toFixed() ?? null, inflows: inflows?.toFixed() ?? null, outflows: outflows?.toFixed() ?? null, closing: closing?.toFixed() ?? null};
    };
    const available = accountResult("available"); const restricted = accountResult("restricted");
    if (balances.available !== null) {
      const shortfall = Money.max(balances.available.negated(), 0);
      maximumKnownShortfall = maximumKnownShortfall === null ? shortfall : Money.max(maximumKnownShortfall, shortfall);
      if (shortfall.gt(0) && firstKnownShortfallDate === null) firstKnownShortfallDate = date;
    }
    return {date, available, restricted, eventIds: day.map(event => event.id)};
  });
  return {
    schemaVersion: "liquidity-calendar.v1" as const, engineVersion: liquidityCalendarVersion,
    openingDate: input.openingDate, endDate: input.endDate, currency: input.currency,
    convention: input.convention, coverage: {...input.coverage}, opening: initial,
    status: gaps.length ? "partial" as const : "calculated" as const,
    identity: "closing = opening + inflows - outflows",
    amountConvention: "normalized_currency_units_exact_up_to_8_decimals" as const,
    rows, events, gaps, firstKnownShortfallDate, maximumKnownShortfall: maximumKnownShortfall?.toFixed() ?? null,
    /** Calculated describes supplied operands, not forecast certainty or financing approval. */
    closingAvailable: balances.available?.toFixed() ?? null, closingRestricted: balances.restricted?.toFixed() ?? null,
  };
}
