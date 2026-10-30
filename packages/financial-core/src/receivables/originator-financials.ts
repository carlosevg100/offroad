import Decimal from "decimal.js";
import {decimal, full, requireNonNegative, sum, ZERO, type ReceivablesPoolKernelTrace} from "./pool-shared";
import {originatorDay as day} from "./originator-shared";

export type OriginatorStatementPeriod = {
  entityId: string; perimeter: string; currency: string; scale: "1";
  start: string; end: string;
  grossRevenue: string; deductions: string; netRevenue: string; ebitda: string;
};
export type OriginatorFinancialInput = {
  priorFullYear: OriginatorStatementPeriod;
  priorComparable: OriginatorStatementPeriod;
  currentComparable: OriginatorStatementPeriod;
  historical?: readonly OriginatorStatementPeriod[];
  balance: {
    asOf: string; cash: string; restrictedCash: string; receivables: string; impairmentAllowance: string;
    inventory: string; otherCurrentAssets: string; fixedAssets: string;
    bankDebt: string; nonbankRecourse: string; suppliers: string; taxDebt: string; otherLiabilities: string; equity: string;
  };
  bankLines: ReadonlyArray<{id: string; used: string; limit: string}>;
  scrUtilizedDebt: string | null;
};
export type OriginatorFinancialResult = {
  version: "2026.10.30-v1"; status: "reconciled" | "needs_reconciliation";
  gaps: string[];
  ltm: {start: string; end: string; grossRevenue: string; netRevenue: string; ebitda: string};
  history: Array<OriginatorStatementPeriod & {ebitdaMargin: string | null; priorComparableGrossGrowth: string | null}>;
  assets: string; liabilitiesAndEquity: string; balanceDifference: string;
  utilizedBankDebt: string; unusedBankLimits: string; utilizedAboveLimits: string;
  bankLinesAgainstBalanceDifference: string; bankLinesAgainstScrDifference: string | null;
  traces: ReceivablesPoolKernelTrace[];
};
const finite = (v: string) => {const d = decimal(v); if (!d.isFinite()) throw new RangeError("originator_non_finite_number"); return d;};
const amount = (v: string) => requireNonNegative("originator_amount", v);
const iso = (d: number) => new Date(d * 86400000).toISOString().slice(0, 10);
const nextYear = (v: string) => String(Number(v.slice(0, 4)) + 1).padStart(4, "0") + v.slice(4);
const statementNumbers = ["grossRevenue", "deductions", "netRevenue", "ebitda"] as const;

/** Figures are already normalized by the adopted-source bridge. Currency, perimeter and periods must agree. */
export function deriveOriginatorFinancials(input: OriginatorFinancialInput): OriginatorFinancialResult {
  const a = input.priorFullYear, p = input.priorComparable, c = input.currentComparable;
  const gaps: string[] = [], traces: ReceivablesPoolKernelTrace[] = [];
  if ((input.historical?.length ?? 0) > 100) throw new RangeError("originator_historical_period_limit");
  const periods = new Map<string, OriginatorStatementPeriod>();
  if (!a.entityId.trim() || !a.perimeter.trim() || !/^[A-Z]{3}$/.test(a.currency)) throw new RangeError("originator_financial_scope_missing");
  for (const period of [...input.historical ?? [], a, p, c]) {
    if (period.entityId !== a.entityId || period.perimeter !== a.perimeter || period.currency !== a.currency || period.scale !== "1") throw new RangeError("originator_financial_scope_conflict");
    if (day(period.end) < day(period.start)) throw new RangeError("originator_financial_period_invalid");
    if (day(period.end) > day(c.end)) throw new RangeError("originator_future_financial_period");
    amount(period.grossRevenue); amount(period.deductions); finite(period.netRevenue); finite(period.ebitda);
    const recomposed = amount(period.grossRevenue).minus(period.deductions), difference = recomposed.minus(period.netRevenue);
    traces.push({id: "receivables.originator.statement_bridge", formula: "gross revenue - deductions - reported net revenue", operands: {periodStart: period.start, periodEnd: period.end, grossRevenue: period.grossRevenue, deductions: period.deductions, reportedNetRevenue: period.netRevenue}, result: full(difference)});
    if (!difference.isZero()) gaps.push(`gross_net_bridge:${period.start}/${period.end}`);
    const k = period.start + "/" + period.end, held = periods.get(k);
    if (held && statementNumbers.some(f => !finite(held[f]).eq(period[f]))) throw new RangeError("originator_historical_period_conflict");
    periods.set(k, period);
  }
  const history = [...periods.values()].sort((x, y) => x.end.localeCompare(y.end) || x.start.localeCompare(y.start)).map(period => {
    const prior = [...periods.values()].find(r => nextYear(r.start) === period.start && nextYear(r.end) === period.end);
    const margin = finite(period.netRevenue).gt(0) ? finite(period.ebitda).div(period.netRevenue) : null;
    const growth = prior && finite(prior.grossRevenue).gt(0) ? finite(period.grossRevenue).div(prior.grossRevenue).minus(1) : null;
    if (margin !== null) traces.push({id: "receivables.originator.historical_margin", formula: "reported period EBITDA / net revenue in the same period", operands: {periodStart: period.start, periodEnd: period.end, ebitda: period.ebitda, netRevenue: period.netRevenue}, result: full(margin)});
    if (growth !== null && prior) traces.push({id: "receivables.originator.comparable_revenue_growth", formula: "current gross revenue / prior comparable gross revenue - 1", operands: {currentStart: period.start, currentEnd: period.end, priorStart: prior.start, priorEnd: prior.end, currentGrossRevenue: period.grossRevenue, priorGrossRevenue: prior.grossRevenue}, result: full(growth)});
    return {...period, ebitdaMargin: margin === null ? null : full(margin), priorComparableGrossGrowth: growth === null ? null : full(growth)};
  });
  if (day(a.end) + 1 !== day(nextYear(a.start)) || p.start !== a.start || day(p.end) > day(a.end) || day(c.start) !== day(a.end) + 1 || c.start !== nextYear(p.start) || c.end !== nextYear(p.end)) throw new RangeError("originator_ltm_periods_not_comparable");
  if (input.balance.asOf !== c.end) throw new RangeError("originator_balance_period_conflict");
  const ltm = {start: iso(day(p.end) + 1), end: c.end, grossRevenue: "", netRevenue: "", ebitda: ""};
  for (const field of ["grossRevenue", "netRevenue", "ebitda"] as const) {
    const value = finite(a[field]).minus(p[field]).plus(c[field]); ltm[field] = full(value);
    traces.push({id: `receivables.originator.ltm_${field}`, formula: "prior full year - prior comparable period + current comparable period", operands: {priorFullYear: a[field], priorComparable: p[field], currentComparable: c[field], ltmStart: ltm.start, ltmEnd: ltm.end}, result: full(value)});
  }
  const b = input.balance;
  const assets = sum([b.cash, b.receivables, b.inventory, b.otherCurrentAssets, b.fixedAssets].map(amount)).minus(amount(b.impairmentAllowance));
  const liabilitiesAndEquity = sum([b.bankDebt, b.nonbankRecourse, b.suppliers, b.taxDebt, b.otherLiabilities].map(amount)).plus(finite(b.equity));
  if (amount(b.restrictedCash).gt(b.cash)) throw new RangeError("originator_restricted_cash_exceeds_cash");
  const balanceDifference = assets.minus(liabilitiesAndEquity);
  if (!balanceDifference.isZero()) gaps.push("balance_does_not_reconcile");
  let used = ZERO, unused = ZERO, aboveLimits = ZERO; const ids = new Set<string>();
  for (const line of input.bankLines) {
    if (!line.id.trim() || ids.has(line.id)) throw new RangeError("originator_bank_line_identity_conflict"); ids.add(line.id);
    const u = amount(line.used), l = amount(line.limit); used = used.plus(u);
    unused = unused.plus(Decimal.max(ZERO, l.minus(u))); aboveLimits = aboveLimits.plus(Decimal.max(ZERO, u.minus(l)));
    traces.push({id: "receivables.originator.bank_line_usage", formula: "unused commitment = max(0, limit - utilized); above limit = max(0, utilized - limit)", operands: {lineId: line.id, used: line.used, limit: line.limit}, result: full(u)});
  }
  if (!input.bankLines.length) gaps.push("bank_lines_missing");
  const bankBalanceDifference = used.minus(b.bankDebt);
  if (!bankBalanceDifference.isZero()) gaps.push("bank_lines_balance_conflict");
  const scrDifference = input.scrUtilizedDebt === null ? null : used.minus(amount(input.scrUtilizedDebt));
  if (scrDifference === null) gaps.push("scr_utilized_debt_missing"); else if (!scrDifference.isZero()) gaps.push("bank_lines_scr_conflict");
  traces.push({id: "receivables.originator.balance_reconciliation", formula: "cash + receivables - impairment allowance + inventory + other current assets + fixed assets - liabilities - equity", operands: {cash: b.cash, receivables: b.receivables, impairmentAllowance: b.impairmentAllowance, inventory: b.inventory, otherCurrentAssets: b.otherCurrentAssets, fixedAssets: b.fixedAssets, bankDebt: b.bankDebt, nonbankRecourse: b.nonbankRecourse, suppliers: b.suppliers, taxDebt: b.taxDebt, otherLiabilities: b.otherLiabilities, equity: b.equity}, result: full(balanceDifference)});
  traces.push({id: "receivables.originator.bank_utilized", formula: "sum utilized bank-line balances; unused limits are not debt", operands: {lines: String(input.bankLines.length), unusedLimits: full(unused), reportedBalanceDebt: b.bankDebt, reportedScrDebt: input.scrUtilizedDebt ?? "missing"}, result: full(used)});
  return {version: "2026.10.30-v1", status: gaps.length ? "needs_reconciliation" : "reconciled", gaps, ltm, history, assets: full(assets), liabilitiesAndEquity: full(liabilitiesAndEquity), balanceDifference: full(balanceDifference), utilizedBankDebt: full(used), unusedBankLimits: full(unused), utilizedAboveLimits: full(aboveLimits), bankLinesAgainstBalanceDifference: full(bankBalanceDifference), bankLinesAgainstScrDifference: scrDifference === null ? null : full(scrDifference), traces};
}
