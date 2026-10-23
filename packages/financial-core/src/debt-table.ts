import Decimal from "decimal.js";

export const debtTableVersion = "2026.10.23-v1";
const Money = Decimal.clone({precision: 60, rounding: Decimal.ROUND_HALF_UP});

export const debtTableComponents = ["principal", "accrued_interest", "unamortized_cost", "drawn_credit_lines",
  "lease", "supplier_finance", "guarantee_given"] as const;
export type DebtTableComponent = typeof debtTableComponents[number];
export type DebtTableObligationKind = "lease" | "supplier_finance" | "guarantee_given";

export type DebtTableInstrument = {
  id: string; label: string; creditor: string; borrower: string;
  /** Outstanding contractual principal at the reference date. */
  principal: string;
  /** Accounting adjustments that reconcile principal to the reported balance. */
  accruedInterest: string; unamortizedCost: string;
  indexer: string; spread: string | null;
  /** Remaining principal payments after the reference date, as the prevailing terms state them. */
  amortization: readonly {date: string; amount: string}[];
  guarantee: {description: string; encumbranceAmount: string | null; usesBasketOf: readonly string[]};
  covenant: string | null;
  /** Acceleration of this instrument on default of another debt above the threshold. */
  crossDefault: {threshold: string | null; acceleration: "automatic" | "non_automatic"; scope: string} | null;
  prepayment: string | null;
  /** Aggregate basket this instrument's negative pledge allows for new security, if any. */
  negativePledgeBasket: string | null;
};
export type DebtTableInput = {
  referenceDate: string; currency: string;
  instruments: readonly DebtTableInstrument[];
  creditLines: readonly {id: string; label: string; creditor: string; limit: string; drawn: string}[];
  otherObligations: readonly {id: string; kind: DebtTableObligationKind; label: string; creditor: string | null; amount: string}[];
  /** Loans and financing as the financial statements report them, for reconciliation; null if not available. */
  reportedAccountingBalance: string | null;
  /** Each view is a definition: the components it sums. The first view is the base of the bridge. */
  views: readonly {id: string; label: string; components: readonly DebtTableComponent[]}[];
  availableCash: string | null;
  /** Annual rate assumed for each index over the period, for the nominal cost reading. */
  indexRates: readonly {indexer: string; annualRate: string}[];
  /** Net debt of a view over the EBITDA of the same definition, less what that definition deducts. */
  leverage: readonly {viewId: string; label: string; ebitda: string; ebitdaDeduction: string}[];
  /** Whether an external register of all financial-institution operations has been reconciled. */
  completeness: {status: "proven" | "unproven"; evidence: string};
};

function date(value: string) {
  if (typeof value !== "string" || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) throw new Error("debt_table_invalid_date");
  const d = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== value) throw new Error("debt_table_invalid_date");
  return d;
}
function amount(value: string, signed = false) {
  if (typeof value !== "string" || !/^-?\d{1,24}(?:\.\d{1,20})?$/.test(value)) throw new Error("debt_table_invalid_amount");
  const v = new Money(value);
  if (!signed && v.isNegative()) throw new Error("debt_table_negative_amount");
  return v;
}
function ratio(value: string) {
  if (typeof value !== "string" || !/^-?\d{1,4}(?:\.\d{1,20})?$/.test(value)) throw new Error("debt_table_invalid_ratio");
  return new Money(value);
}
const text = (value: string, code: string) => {if (typeof value !== "string" || !value.trim() || value.length > 2000) throw new Error(code); return value;};
const out = (v: Decimal) => v.toDecimalPlaces(20).toFixed();
const share = (part: Decimal, whole: Decimal) => whole.isZero() ? null : out(part.div(whole));
function oneYearAfter(value: string) {
  const d = date(value); const y = d.getUTCFullYear() + 1, m = d.getUTCMonth(), day = d.getUTCDate();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(day, last))).toISOString().slice(0, 10);
}

/** The debt of one entity at one date, described once: one row per instrument with its prevailing
 * terms, principal reconciled to the reported balance, credit lines kept as limits, and the debt
 * measured by each adopted definition with the bridge between them. Profile, security, basket and
 * cross-default readings come from the same rows. No term is inferred: texts and amounts are the
 * adopted ones, and a reading whose inputs are absent is returned as a gap, never estimated.
 */
export function buildDebtTable(input: DebtTableInput) {
  const reference = date(input.referenceDate);
  if (!/^[A-Z]{3}$/.test(input.currency)) throw new Error("debt_table_invalid_currency");
  if (!input.instruments.length || input.instruments.length > 32) throw new Error("debt_table_instrument_count");
  if (input.creditLines.length > 32 || input.otherObligations.length > 64) throw new Error("debt_table_item_count");
  if (!input.views.length || input.views.length > 8) throw new Error("debt_table_view_count");
  const ids = [...input.instruments.map(i => i.id), ...input.creditLines.map(l => l.id), ...input.otherObligations.map(o => o.id)];
  if (ids.some(id => !id.trim()) || new Set(ids).size !== ids.length) throw new Error("debt_table_duplicate_item");
  const gaps: {item: string; reason: string}[] = [];

  const rows = input.instruments.map(i => {
    text(i.label, "debt_table_label_required"); text(i.creditor, "debt_table_creditor_required"); text(i.borrower, "debt_table_borrower_required");
    text(i.indexer, "debt_table_indexer_required"); text(i.guarantee.description, "debt_table_guarantee_required");
    const principal = amount(i.principal), accrued = amount(i.accruedInterest), cost = amount(i.unamortizedCost, true);
    if (!i.amortization.length || i.amortization.length > 2000) throw new Error("debt_table_schedule_required");
    let last = "";
    const schedule = i.amortization.map(p => {
      date(p.date);
      if (p.date <= input.referenceDate) throw new Error("debt_table_payment_not_after_reference");
      if (p.date < last) throw new Error("debt_table_schedule_order");
      last = p.date;
      return {date: p.date, amount: amount(p.amount)};
    });
    const scheduled = schedule.reduce((s, p) => s.plus(p.amount), new Money(0));
    if (!scheduled.eq(principal)) gaps.push({item: i.id, reason: "schedule_does_not_sum_to_principal"});
    if (i.crossDefault) {
      text(i.crossDefault.scope, "debt_table_cross_default_scope_required");
      if (!["automatic", "non_automatic"].includes(i.crossDefault.acceleration)) throw new Error("debt_table_cross_default_acceleration");
      if (i.crossDefault.threshold !== null) amount(i.crossDefault.threshold);
    }
    return {i, principal, accrued, cost, schedule, scheduled};
  });
  const known = new Set(input.instruments.map(i => i.id));
  for (const r of rows) for (const holder of r.i.guarantee.usesBasketOf) {
    if (!known.has(holder) || holder === r.i.id) throw new Error("debt_table_unknown_basket_holder");
    if (rows.find(x => x.i.id === holder)!.i.negativePledgeBasket === null) throw new Error("debt_table_holder_without_basket");
    if (r.i.guarantee.encumbranceAmount === null) throw new Error("debt_table_basket_use_without_amount");
  }

  const sum = (values: Decimal[]) => values.reduce((s, v) => s.plus(v), new Money(0));
  const principal = sum(rows.map(r => r.principal)), accrued = sum(rows.map(r => r.accrued)), unamortized = sum(rows.map(r => r.cost));
  const accounting = principal.plus(accrued).plus(unamortized);
  const reported = input.reportedAccountingBalance === null ? null : amount(input.reportedAccountingBalance, true);
  if (reported === null) gaps.push({item: "reconciliation", reason: "reported_balance_not_adopted"});
  const lines = input.creditLines.map(l => {
    text(l.label, "debt_table_label_required"); text(l.creditor, "debt_table_creditor_required");
    const limit = amount(l.limit), drawn = amount(l.drawn);
    if (drawn.gt(limit)) throw new Error("debt_table_drawn_above_limit");
    return {id: l.id, label: l.label, creditor: l.creditor, limit: out(limit), drawn: out(drawn), unused: out(limit.minus(drawn)), drawnValue: drawn};
  });
  const obligations = input.otherObligations.map(o => {
    if (!["lease", "supplier_finance", "guarantee_given"].includes(o.kind)) throw new Error("debt_table_obligation_kind");
    text(o.label, "debt_table_label_required");
    return {...o, value: amount(o.amount)};
  });
  const componentValue: Record<DebtTableComponent, Decimal> = {
    principal, accrued_interest: accrued, unamortized_cost: unamortized,
    drawn_credit_lines: sum(lines.map(l => l.drawnValue)),
    lease: sum(obligations.filter(o => o.kind === "lease").map(o => o.value)),
    supplier_finance: sum(obligations.filter(o => o.kind === "supplier_finance").map(o => o.value)),
    guarantee_given: sum(obligations.filter(o => o.kind === "guarantee_given").map(o => o.value)),
  };
  const viewIds = new Set<string>();
  const views = input.views.map(v => {
    if (!v.id.trim() || viewIds.has(v.id)) throw new Error("debt_table_duplicate_view");
    viewIds.add(v.id); text(v.label, "debt_table_label_required");
    if (!v.components.length || new Set(v.components).size !== v.components.length || v.components.some(c => !debtTableComponents.includes(c))) throw new Error("debt_table_view_components");
    return {id: v.id, label: v.label, components: [...v.components], total: sum(v.components.map(c => componentValue[c]))};
  });
  const base = views[0]!;
  const used = new Set(views.flatMap(v => v.components));
  const cash = input.availableCash === null ? null : amount(input.availableCash, true);
  if (cash === null) gaps.push({item: "net_debt", reason: "available_cash_not_adopted"});

  const byYear = new Map<number, Decimal>();
  const horizon = oneYearAfter(input.referenceDate);
  let dueWithinYear = new Money(0), weighted = new Money(0);
  for (const r of rows) for (const p of r.schedule) {
    const y = Number(p.date.slice(0, 4));
    byYear.set(y, (byYear.get(y) ?? new Money(0)).plus(p.amount));
    if (p.date <= horizon) dueWithinYear = dueWithinYear.plus(p.amount);
    const days = (date(p.date).getTime() - reference.getTime()) / 86400000;
    weighted = weighted.plus(p.amount.mul(days).div(365));
  }
  const scheduledTotal = sum(rows.map(r => r.scheduled));
  const creditors = new Map<string, Decimal>();
  for (const r of rows) creditors.set(r.i.creditor, (creditors.get(r.i.creditor) ?? new Money(0)).plus(r.principal));
  const ranked = [...creditors.entries()].sort((a, b) => b[1].cmp(a[1]) || (a[0] < b[0] ? -1 : 1));

  const rates = new Map<string, Decimal>();
  for (const r of input.indexRates) {
    if (rates.has(r.indexer)) throw new Error("debt_table_duplicate_index_rate");
    rates.set(r.indexer, ratio(r.annualRate));
  }
  const costs = rows.map(r => {
    const index = r.i.indexer === "fixed" ? new Money(0) : rates.get(r.i.indexer);
    if (index === undefined || r.i.spread === null) return {id: r.i.id, nominalRate: null};
    return {id: r.i.id, nominalRate: new Money(1).plus(index).mul(new Money(1).plus(ratio(r.i.spread))).minus(1)};
  });
  const averageCost = costs.every(c => c.nominalRate !== null) && !principal.isZero()
    ? sum(rows.map((r, n) => r.principal.mul(costs[n]!.nominalRate!))).div(principal) : null;
  if (averageCost === null) gaps.push({item: "average_cost", reason: "index_rate_or_spread_not_adopted"});

  const baskets = rows.filter(r => r.i.negativePledgeBasket !== null).map(r => {
    const limit = amount(r.i.negativePledgeBasket!);
    const users = rows.filter(u => u.i.guarantee.usesBasketOf.includes(r.i.id));
    const occupied = sum(users.map(u => amount(u.i.guarantee.encumbranceAmount!)));
    return {holderId: r.i.id, basket: out(limit), occupied: out(occupied), remaining: out(limit.minus(occupied)), exceeded: occupied.gt(limit), usedBy: users.map(u => u.i.id)};
  });
  const crossDefault = rows.filter(r => r.i.crossDefault?.threshold != null).map(r => {
    const threshold = amount(r.i.crossDefault!.threshold!);
    return {instrumentId: r.i.id, threshold: out(threshold), acceleration: r.i.crossDefault!.acceleration, scope: r.i.crossDefault!.scope,
      /** Other instruments whose default, at their outstanding principal, exceeds this threshold. */
      triggeredBy: rows.filter(o => o.i.id !== r.i.id && o.principal.gt(threshold)).map(o => o.i.id)};
  }).sort((a, b) => new Money(a.threshold).cmp(b.threshold) || (a.instrumentId < b.instrumentId ? -1 : 1));

  const leverage = input.leverage.map(l => {
    const view = views.find(v => v.id === l.viewId);
    if (!view) throw new Error("debt_table_unknown_view");
    text(l.label, "debt_table_label_required");
    const ebitda = amount(l.ebitda, true), deduction = amount(l.ebitdaDeduction, true), denominator = ebitda.minus(deduction);
    const net = cash === null ? null : view.total.minus(cash);
    return {viewId: l.viewId, label: l.label, netDebt: net === null ? null : out(net), ebitda: out(ebitda), ebitdaDeduction: out(deduction),
      denominator: out(denominator), ratio: net === null || !denominator.gt(0) ? null : out(net.div(denominator))};
  });
  if (input.completeness.status !== "proven" && input.completeness.status !== "unproven") throw new Error("debt_table_completeness_status");
  text(input.completeness.evidence, "debt_table_completeness_evidence_required");

  return {
    schemaVersion: "debt-table.v1" as const, version: debtTableVersion, referenceDate: input.referenceDate, currency: input.currency,
    rows: rows.map((r, n) => ({id: r.i.id, label: r.i.label, creditor: r.i.creditor, borrower: r.i.borrower,
      principal: out(r.principal), accountingBalance: out(r.principal.plus(r.accrued).plus(r.cost)),
      indexer: r.i.indexer, spread: r.i.spread, nominalRate: costs[n]!.nominalRate === null ? null : out(costs[n]!.nominalRate!),
      finalPayment: r.schedule[r.schedule.length - 1]!.date, scheduleMatchesPrincipal: r.scheduled.eq(r.principal),
      guarantee: r.i.guarantee.description, covenant: r.i.covenant, crossDefault: r.i.crossDefault, prepayment: r.i.prepayment})),
    reconciliation: {principal: out(principal), accruedInterest: out(accrued), unamortizedCost: out(unamortized), accounting: out(accounting),
      reported: reported === null ? null : out(reported), difference: reported === null ? null : out(accounting.minus(reported)),
      status: reported === null ? "not_reported" as const : accounting.eq(reported) ? "exact" as const : "difference" as const},
    creditLines: lines.map(({drawnValue: _, ...l}) => l),
    views: views.map(v => ({id: v.id, label: v.label, components: v.components, total: out(v.total),
      bridgeFromBase: debtTableComponents.flatMap(c => {
        const inView = v.components.includes(c), inBase = base.components.includes(c);
        return inView === inBase ? [] : [{component: c, amount: out(inView ? componentValue[c] : componentValue[c].neg())}];
      }),
      netDebt: cash === null ? null : out(v.total.minus(cash))})),
    outsideEveryView: obligations.filter(o => !used.has(o.kind)).map(o => ({id: o.id, kind: o.kind, label: o.label, creditor: o.creditor, amount: out(o.value)})),
    unusedLimits: out(sum(lines.map(l => new Money(l.unused)))),
    profile: {
      scheduleByYear: [...byYear.entries()].sort((a, b) => a[0] - b[0]).map(([year, v]) => ({year, principal: out(v)})),
      dueWithinTwelveMonths: out(dueWithinYear), dueWithinTwelveMonthsShare: share(dueWithinYear, principal), twelveMonthHorizon: horizon,
      weightedAverageLifeYears: scheduledTotal.isZero() ? null : out(weighted.div(scheduledTotal)),
      largestCreditor: ranked.length ? {creditor: ranked[0]![0], principal: out(ranked[0]![1]), share: share(ranked[0]![1], principal)} : null,
      averageNominalCost: averageCost === null ? null : out(averageCost),
    },
    negativePledgeBaskets: baskets,
    crossDefault: {chain: crossDefault, lowestThreshold: crossDefault[0] ? {instrumentId: crossDefault[0].instrumentId, threshold: crossDefault[0].threshold} : null},
    leverage,
    completeness: {status: input.completeness.status, evidence: input.completeness.evidence,
      request: input.completeness.status === "proven" ? null : "external_register_of_financial_institution_operations"},
    gaps,
  };
}
export type DebtTable = ReturnType<typeof buildDebtTable>;
