import {decimal, full, requireNonNegative, sum, type ReceivablesPoolKernelTrace} from "./pool-shared";
import {originatorDay} from "./originator-shared";

export type OriginatorReconciliationInput = {
  periodStart: string; periodEnd: string; interimGrossRevenue: string;
  monthlyGrossRevenue: ReadonlyArray<{month: string; amount: string}>;
  salesByGroup: ReadonlyArray<{groupId: string; amount: string}>;
  receivables: {opening: string; issued: string; debtorCollections: string; repurchases: string; dilution: string; writeoffs: string; closing: string};
  impairment: {opening: string; additions: string; reversals: string; usedOnWriteoffs: string; closing: string; olderWriteoffRecoveries: string};
  tapeClosing: string; balanceGrossReceivables: string; balanceImpairment: string;
  /** An explicitly confirmed scenario impact, never inferred from cancelled invoice face. */
  cancellationScenario: {reportedEbitdaLtm: string; confirmedEbitdaImpact: string} | null;
};

/** Different denominators remain separate: issuance is not sales, repurchase is not debtor payment,
 * recoveries of old writeoffs do not reduce the current impairment allowance. */
export function reconcileOriginatorStatements(input: OriginatorReconciliationInput) {
  const traces: ReceivablesPoolKernelTrace[] = [], gaps: string[] = [];
  const n = (s: string) => requireNonNegative("originator_reconciliation_amount", s);
  const trace = (id: string, formula: string, operands: Record<string, string>, value: ReturnType<typeof decimal>) => {
    traces.push({id: `receivables.originator.${id}`, formula, operands, result: full(value)}); return full(value);
  };
  const start = originatorDay(input.periodStart), end = originatorDay(input.periodEnd);
  if (start > end || !input.periodStart.endsWith("-01") || !new Date((end + 1) * 86400000).toISOString().slice(0, 10).endsWith("-01")) throw new Error("originator_revenue_month_window_invalid");
  if (end - start > 366) throw new Error("originator_revenue_month_window_invalid");
  const months: string[] = [];
  for (const d = new Date(start * 86400000); d.getTime() <= end * 86400000; d.setUTCMonth(d.getUTCMonth() + 1)) months.push(d.toISOString().slice(0, 7));
  const seen = input.monthlyGrossRevenue.map(m => m.month);
  if (new Set(seen).size !== seen.length || seen.some(m => !months.includes(m))) throw new Error("originator_revenue_month_identity_conflict");
  if (months.some(m => !seen.includes(m))) gaps.push("monthly_revenue_window_incomplete");
  const groupIds = input.salesByGroup.map(g => g.groupId);
  if (groupIds.some(id => !id.trim()) || new Set(groupIds).size !== groupIds.length) throw new Error("originator_sales_group_identity_conflict");
  if (!groupIds.length) gaps.push("sales_abc_missing");
  const monthly = sum(input.monthlyGrossRevenue.map(m => n(m.amount))), abc = sum(input.salesByGroup.map(g => n(g.amount))), interim = n(input.interimGrossRevenue);
  const monthlyDifference = monthly.minus(interim), abcDifference = abc.minus(interim);
  if (!monthlyDifference.isZero()) gaps.push("monthly_revenue_against_interim_conflict");
  if (!abcDifference.isZero()) gaps.push("sales_abc_against_interim_conflict");
  const r = input.receivables, p = input.impairment;
  Object.values(r).forEach(n); Object.values(p).forEach(n);
  const closing = n(r.opening).plus(r.issued).minus(r.debtorCollections).minus(r.repurchases).minus(r.dilution).minus(r.writeoffs);
  const impairment = n(p.opening).plus(p.additions).minus(p.reversals).minus(p.usedOnWriteoffs);
  if (closing.isNegative() || impairment.isNegative()) throw new Error("originator_receivables_bridge_negative_balance");
  const difference = closing.minus(r.closing), impairmentDifference = impairment.minus(p.closing);
  if (!difference.isZero()) gaps.push("receivables_movement_does_not_reconcile");
  if (!impairmentDifference.isZero()) gaps.push("impairment_movement_does_not_reconcile");
  const tapeDifference = n(input.tapeClosing).minus(r.closing), balanceDifference = n(input.balanceGrossReceivables).minus(r.closing), allowanceDifference = n(input.balanceImpairment).minus(p.closing);
  if (!tapeDifference.isZero()) gaps.push("unique_tape_against_receivables_movement_conflict");
  if (!balanceDifference.isZero()) gaps.push("balance_against_receivables_movement_conflict");
  if (!allowanceDifference.isZero()) gaps.push("balance_against_impairment_movement_conflict");
  const scenarioEbitda = input.cancellationScenario === null ? null : trace("confirmed_cancellation_scenario", "reported EBITDA LTM - confirmed scenario EBITDA impact (scenario, not accounting restatement)", input.cancellationScenario,
    decimal(input.cancellationScenario.reportedEbitdaLtm).minus(n(input.cancellationScenario.confirmedEbitdaImpact)));
  return {status: gaps.length ? "needs_reconciliation" as const : "reconciled" as const, gaps,
    revenue: {monthlyGross: trace("monthly_gross", "sum monthly gross revenue in the same interim window", {months: String(months.length)}, monthly), salesAbcGross: trace("sales_abc", "sum sales by economic group in the same interim window", {groups: String(groupIds.length)}, abc), monthlyDifference: full(monthlyDifference), abcDifference: full(abcDifference)},
    receivables: {recomposedClosing: trace("receivables_movement", "opening + issued - debtor collections - repurchases - dilution - writeoffs", r, closing), difference: full(difference), tapeDifference: full(tapeDifference), balanceDifference: full(balanceDifference)},
    impairment: {recomposedClosing: trace("impairment_movement", "opening + additions - reversals - allowance used on writeoffs; old writeoff recoveries reported separately", p, impairment), difference: full(impairmentDifference), balanceDifference: full(allowanceDifference), olderWriteoffRecoveries: full(n(p.olderWriteoffRecoveries))},
    cancellationScenarioEbitda: scenarioEbitda, traces};
}
