import Decimal from "decimal.js";

export const weeklyCashVersion = "2026.10.23-v1";
const Exact = Decimal.clone({precision: 60, rounding: Decimal.ROUND_HALF_UP});

export type WeeklyCashCategory = "debt" | "statutory" | "operating" | "action";
/** A stream of dated cash events of one kind: the dates and amounts as the contract, the law or the plan state them. */
export const weeklyCashObligations = ["payroll", "thirteenth_salary", "payroll_charges", "sales_taxes", "income_taxes", "debt_service"] as const;
export type WeeklyCashObligation = typeof weeklyCashObligations[number];
export type WeeklyCashStream = {id: string; label: string; category: WeeklyCashCategory; direction: "inflow" | "outflow";
  /** The legal or contractual obligation the stream pays, when it is one of those the answer cannot leave out. */
  obligation: WeeklyCashObligation | null;
  dates: readonly string[]; amounts: readonly string[]};
export type WeeklyCashAction = {
  id: string; label: string;
  /** The single draw the action adds; when it replaces a stream (a larger line instead of a smaller one),
   * the cost is on the increment only and the replaced stream must not be in the action's case. */
  streamId: string; replacesStreamId: string | null;
  /** What the money costs while in use: rate per period (annual or monthly, compounded), tax and fee on the amount. */
  amount: string; days: number; rate: string; ratePeriod: "annual" | "monthly";
  iofDaily: string; iofDailyCapDays: number; iofAdditional: string; upfrontFee: string;
  /** Whether it is still open on the covenant test date: it adds the same amount to debt and to cash. */
  repaymentDate: string;
};
export type WeeklyCashCoverage = Record<WeeklyCashObligation, "included" | "not_applicable" | "not_examined">;
export type WeeklyCashInput = {
  currency: string; firstMonday: string; weeks: number; openingCash: string; minimumCash: string;
  streams: readonly WeeklyCashStream[];
  cases: readonly {id: string; label: string; role: "informed" | "alternative"; streamIds: readonly string[]}[];
  actions: readonly WeeklyCashAction[];
  /** The closing balance the monthly or quarterly projection shows for the same horizon, to reconcile against. */
  projectionClosing: {date: string; balance: string} | null;
  /** Debt and statutory outflows are listed up to this date, as the calendar of what falls due. */
  calendarEnd: string;
  covenantTestDate: string | null;
  /** Whether each obligation the answer cannot leave out is in the streams, does not apply, or was not examined. */
  coverage: WeeklyCashCoverage;
};

function day(value: string) {
  if (typeof value !== "string" || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) throw new Error("weekly_cash_invalid_date");
  const d = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== value) throw new Error("weekly_cash_invalid_date");
  return d;
}
const add = (value: string, days: number) => new Date(day(value).getTime() + days * 86400000).toISOString().slice(0, 10);
function amount(value: string, signed = false) {
  if (typeof value !== "string" || !/^-?\d{1,24}(?:\.\d{1,20})?$/.test(value)) throw new Error("weekly_cash_invalid_amount");
  const v = new Exact(value); if (!signed && v.isNegative()) throw new Error("weekly_cash_negative_amount");
  return v;
}
const text = (value: string, code: string) => {if (typeof value !== "string" || !value.trim() || value.length > 2000) throw new Error(code); return value;};
const out = (v: Decimal) => v.toDecimalPlaces(20).toFixed();

/** Cash week by week on a cash basis, Monday to Sunday, from dated events: the closing balance of
 * every week, the tightest week, the weeks under the minimum, the largest outflows that make each
 * week, what falls due by a date, the end of the horizon against the projection, and each action
 * costed for the time it is in use rather than by its rate. Dates are the adopted ones; no business
 * day is inferred here. Alternatives are other sets of the same adopted streams. */
export function buildWeeklyCash(input: WeeklyCashInput) {
  if (!/^[A-Z]{3}$/.test(input.currency)) throw new Error("weekly_cash_invalid_currency");
  if (day(input.firstMonday).getUTCDay() !== 1) throw new Error("weekly_cash_week_must_start_monday");
  if (!Number.isInteger(input.weeks) || input.weeks < 1 || input.weeks > 104) throw new Error("weekly_cash_weeks");
  const opening = amount(input.openingCash, true), minimum = amount(input.minimumCash, true);
  const horizonEnd = add(input.firstMonday, input.weeks * 7 - 1);
  day(input.calendarEnd);
  if (input.streams.length > 64 || !input.cases.length || input.cases.length > 8 || input.actions.length > 8) throw new Error("weekly_cash_count");
  const streams = new Map<string, {s: WeeklyCashStream; events: {date: string; amount: Decimal}[]}>();
  for (const s of input.streams) {
    if (!s.id.trim() || streams.has(s.id)) throw new Error("weekly_cash_duplicate_stream");
    text(s.label, "weekly_cash_label_required");
    if (!["debt", "statutory", "operating", "action"].includes(s.category) || !["inflow", "outflow"].includes(s.direction)) throw new Error("weekly_cash_stream_kind");
    if (s.obligation !== null && (!weeklyCashObligations.includes(s.obligation) || s.direction !== "outflow")) throw new Error("weekly_cash_stream_obligation");
    if (!s.dates.length || s.dates.length !== s.amounts.length || s.dates.length > 2000) throw new Error("weekly_cash_stream_series");
    const events = s.dates.map((d, n) => {
      day(d); if (d < input.firstMonday || d > horizonEnd) throw new Error("weekly_cash_event_outside_horizon");
      return {date: d, amount: amount(s.amounts[n]!)};
    });
    streams.set(s.id, {s, events});
  }
  const caseIds = new Set<string>();
  if (input.cases.filter(c => c.role === "informed").length !== 1) throw new Error("weekly_cash_one_informed_case");
  const weekStarts = Array.from({length: input.weeks}, (_, k) => add(input.firstMonday, 7 * k));
  const cases = input.cases.map(c => {
    if (!c.id.trim() || caseIds.has(c.id)) throw new Error("weekly_cash_duplicate_case");
    caseIds.add(c.id); text(c.label, "weekly_cash_label_required");
    if (!c.streamIds.length || new Set(c.streamIds).size !== c.streamIds.length || c.streamIds.some(id => !streams.has(id))) throw new Error("weekly_cash_case_streams");
    const used = c.streamIds.map(id => streams.get(id)!);
    let balance = opening;
    const rows = weekStarts.map(start => {
      const end = add(start, 7);
      let inflow = new Exact(0), outflow = new Exact(0);
      const outs: {streamId: string; label: string; category: WeeklyCashCategory; amount: Decimal}[] = [];
      for (const u of used) {
        let sum = new Exact(0);
        for (const e of u.events) if (e.date >= start && e.date < end) sum = sum.plus(e.amount);
        if (sum.isZero()) continue;
        if (u.s.direction === "inflow") inflow = inflow.plus(sum);
        else {outflow = outflow.plus(sum); outs.push({streamId: u.s.id, label: u.s.label, category: u.s.category, amount: sum});}
      }
      balance = balance.plus(inflow).minus(outflow);
      outs.sort((a, b) => b.amount.cmp(a.amount) || (a.streamId < b.streamId ? -1 : 1));
      return {weekStart: start, inflows: out(inflow), outflows: out(outflow), closing: out(balance), belowMinimum: balance.lt(minimum),
        largestOutflows: outs.slice(0, 3).map(o => ({label: o.label, amount: out(o.amount)})),
        outflowsByStream: outs.map(o => ({streamId: o.streamId, label: o.label, category: o.category, amount: out(o.amount)}))};
    });
    const tightest = rows.reduce((m, r) => new Exact(r.closing).lt(m.closing) ? r : m);
    return {id: c.id, label: c.label, role: c.role, rows, minimum: {weekStart: tightest.weekStart, closing: tightest.closing},
      weeksBelowMinimum: rows.filter(r => r.belowMinimum).map(r => r.weekStart), closing: rows[rows.length - 1]!.closing,
      shortfallToMinimum: out(Decimal.max(minimum.minus(tightest.closing), 0))};
  });
  const informed = cases.find(c => c.role === "informed")!;
  const calendar = [...streams.values()].filter(u => u.s.direction === "outflow" && (u.s.category === "debt" || u.s.category === "statutory")
    && input.cases.find(c => c.role === "informed")!.streamIds.includes(u.s.id))
    .flatMap(u => u.events.filter(e => e.date <= input.calendarEnd).map(e => ({date: e.date, label: u.s.label, category: u.s.category, amount: out(e.amount)})))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.label < b.label ? -1 : 1));
  // Every action stream a case uses carries its own costed, checked action; isolation counts every action stream present.
  const actionStreamIds = new Set([...streams.values()].filter(u => u.s.category === "action").map(u => u.s.id));
  const costed = new Set(input.actions.map(a => a.streamId));
  if (new Set(input.actions.map(a => a.streamId)).size !== input.actions.length) throw new Error("weekly_cash_duplicate_action");
  for (const c of input.cases) if (c.streamIds.some(id => actionStreamIds.has(id) && !costed.has(id))) throw new Error("weekly_cash_action_stream_without_action");
  const actions = input.actions.map(a => {
    text(a.label, "weekly_cash_label_required");
    const stream = streams.get(a.streamId);
    if (!stream || stream.s.category !== "action" || stream.s.direction !== "inflow") throw new Error("weekly_cash_action_stream");
    // One draw per action: what is open on the test date is then a date and an amount, not an order of events.
    if (stream.events.length !== 1) throw new Error("weekly_cash_action_single_draw");
    if (!Number.isInteger(a.days) || a.days < 1 || a.days > 3660 || !Number.isInteger(a.iofDailyCapDays) || a.iofDailyCapDays < 0) throw new Error("weekly_cash_action_days");
    if (!["annual", "monthly"].includes(a.ratePeriod)) throw new Error("weekly_cash_action_rate_period");
    day(a.repaymentDate);
    const draw = stream.events[0]!;
    // Time in use is from the draw to the repayment, and a repayment inside the horizon would be a cash flow the case does not carry.
    if ((day(a.repaymentDate).getTime() - day(draw.date).getTime()) / 86400000 !== a.days) throw new Error("weekly_cash_action_days_mismatch");
    if (a.repaymentDate <= horizonEnd) throw new Error("weekly_cash_action_repaid_inside_horizon");
    const replaced = a.replacesStreamId === null ? null : streams.get(a.replacesStreamId);
    if (a.replacesStreamId !== null && (!replaced || replaced.events.length !== 1 || replaced.s.direction !== "inflow" || replaced.events[0]!.date !== draw.date)) throw new Error("weekly_cash_action_replacement");
    const increment = replaced ? draw.amount.minus(replaced.events[0]!.amount) : draw.amount;
    if (!increment.gt(0) || !amount(a.amount).eq(increment)) throw new Error("weekly_cash_action_amount_mismatch");
    const holding = input.cases.filter(c => c.streamIds.includes(a.streamId));
    if (replaced && holding.some(c => c.streamIds.includes(a.replacesStreamId!))) throw new Error("weekly_cash_action_replacement");
    const value = amount(a.amount), rate = amount(a.rate), period = a.ratePeriod === "annual" ? 365 : 30;
    const interest = value.mul(new Exact(1).plus(rate).pow(new Exact(a.days).div(period)).minus(1));
    const iof = value.mul(amount(a.iofDaily)).mul(Math.min(a.days, a.iofDailyCapDays)).plus(value.mul(amount(a.iofAdditional)));
    const fee = value.mul(amount(a.upfrontFee));
    const cases = holding.map(c => c.id);
    /** A case proves this action alone covers only when no other action is in it. */
    const isolatedCases = holding.filter(c => c.streamIds.filter(id => actionStreamIds.has(id)).length === 1).map(c => c.id);
    const openAtTest = input.covenantTestDate === null ? null : draw.date <= input.covenantTestDate && a.repaymentDate > input.covenantTestDate;
    return {id: a.id, label: a.label, cases, isolatedCases, amount: out(value), days: a.days, interest: out(interest), iof: out(iof), fee: out(fee),
      cost: out(interest.plus(iof).plus(fee)), openAtCovenantTest: openAtTest,
      /** A draw open on the test date adds its whole amount to gross debt and to cash: net debt does not move that day. */
      covenantEffect: openAtTest ? {grossDebt: out(draw.amount), cash: out(draw.amount), netDebt: "0"} : null};
  }).sort((a, b) => new Exact(a.cost).cmp(b.cost) || (a.id < b.id ? -1 : 1));
  const reconciliation = input.projectionClosing === null ? null : (() => {
    day(input.projectionClosing.date);
    if (input.projectionClosing.date !== horizonEnd) throw new Error("weekly_cash_projection_date");
    const projected = amount(input.projectionClosing.balance, true);
    return {date: horizonEnd, weekly: informed.closing, projection: out(projected), difference: out(new Exact(informed.closing).minus(projected))};
  })();
  const informedStreams = new Set(input.cases.find(c => c.role === "informed")!.streamIds);
  const coverage = weeklyCashObligations.map(o => {
    const v = input.coverage?.[o];
    if (v !== "included" && v !== "not_applicable" && v !== "not_examined") throw new Error("weekly_cash_coverage_required");
    const present = [...streams.values()].some(u => u.s.obligation === o && informedStreams.has(u.s.id));
    if (v === "included" && !present) throw new Error("weekly_cash_obligation_declared_without_stream");
    if (v !== "included" && present) throw new Error("weekly_cash_obligation_stream_without_declaration");
    return {obligation: o, status: v};
  });
  return {schemaVersion: "weekly-cash.v1" as const, version: weeklyCashVersion, currency: input.currency, firstMonday: input.firstMonday, horizonEnd,
    openingCash: out(opening), minimumCash: out(minimum), cases, calendar, actions, reconciliation, coverage,
    gaps: coverage.filter(c => c.status === "not_examined").map(c => ({item: c.obligation, reason: "obligation_not_examined"}))};
}
export type WeeklyCash = ReturnType<typeof buildWeeklyCash>;
