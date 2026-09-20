import Decimal from "decimal.js";
import {buildOperatingCashProjection, type OperatingCashProjectionInput} from "./operating-cash-projection";
import {buildFinancingCashFlows, type FinancingCostsInput} from "./financing-costs";

const Exact = Decimal.clone({precision: 100, rounding: Decimal.ROUND_HALF_UP});
export const capitalPeriodCashVersion = "2026.09.20-v1";
export type CapitalMovement = {
  id: string; economicId: string; date: string; amount: string;
  account: "available" | "restricted";
  kind: "equity_contribution" | "distribution" | "asset_sale" | "acquisition";
  reason: string;
};
export type CapitalPeriodCashInput = {
  capitalMovements: readonly CapitalMovement[];
  capitalMovementInventory: {status: "declared_complete" | "unknown"; reason: string};
  operating: OperatingCashProjectionInput;
  financing: {status: "provided"; input: FinancingCostsInput} | {status: "no_debt_or_financing"; reason: string};
  openingAvailable: string | null; openingRestricted: string | null;
  /** Requires upstream adoption. Restricted operating movements need a different budget. */
  operatingCashAccount: "available";
};
function opening(value: string | null, signed: boolean) {
  if (value === null) return null;
  if (typeof value !== "string" || !(signed ? /^-?\d{1,24}(?:\.\d{1,8})?$/ : /^\d{1,24}(?:\.\d{1,8})?$/).test(value)) throw new Error("capital_period_cash_invalid_opening");
  return new Exact(value);
}

/** Recomputes both component engines; never accepts a precomputed financial result. Period
 * closing balances do not establish daily or intraday liquidity. A longer residual debt
 * remains visible instead of being treated as a lower lifetime financing cost. */
export function buildCapitalPeriodCash(input: CapitalPeriodCashInput) {
  if (input.operatingCashAccount !== "available") throw new Error("capital_period_cash_operating_account_required");
  const op = buildOperatingCashProjection(input.operating);
  let cash = opening(input.openingAvailable, true); let restricted = opening(input.openingRestricted, false);
  if (!input.financing || !["provided", "no_debt_or_financing"].includes(input.financing.status)) throw new Error("capital_period_cash_financing_inventory_required");
  if (input.financing.status === "no_debt_or_financing" && (typeof input.financing.reason !== "string" || !input.financing.reason.trim())) throw new Error("capital_period_cash_no_debt_reason_required");
  if (input.financing.status === "provided") {
    const d = input.financing.input.debt;
    if (d.currency !== op.currency || d.openingDate !== op.openingDate || d.endDate !== op.endDate) throw new Error("capital_period_cash_context_mismatch");
  }
  const financing = input.financing.status === "provided" ? buildFinancingCashFlows(input.financing.input) : null;
  if (!input.capitalMovementInventory || !["declared_complete", "unknown"].includes(input.capitalMovementInventory.status)
    || typeof input.capitalMovementInventory.reason !== "string" || !input.capitalMovementInventory.reason.trim()
    || !Array.isArray(input.capitalMovements) || input.capitalMovements.length > 2000) throw new Error("capital_period_cash_movement_inventory_required");
  const ids = new Set<string>(); const economics = new Set<string>(financing?.charges.map(c => c.economicId) ?? []);
  const movements = input.capitalMovements.map(m => {
    if (typeof m.id !== "string" || !m.id.trim() || ids.has(m.id) || typeof m.economicId !== "string" || !m.economicId.trim()
      || economics.has(m.economicId)) throw new Error("capital_period_cash_duplicate_movement");
    ids.add(m.id); economics.add(m.economicId);
    const date = new Date(`${m.date}T00:00:00Z`);
    if (!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(m.date) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== m.date
      || m.date <= op.openingDate || m.date > op.endDate) throw new Error("capital_period_cash_movement_date");
    if (!["equity_contribution", "distribution", "asset_sale", "acquisition"].includes(m.kind)
      || !["available", "restricted"].includes(m.account) || typeof m.reason !== "string" || !m.reason.trim()) throw new Error("capital_period_cash_movement_definition");
    const amount = opening(m.amount, false);
    if (amount === null) throw new Error("capital_period_cash_movement_amount_required");
    return {...m, amount: amount.toFixed(), direction: ["equity_contribution", "asset_sale"].includes(m.kind) ? "inflow" as const : "outflow" as const};
  });
  const common = {schemaVersion: "capital-period-cash.v1" as const, engineVersion: capitalPeriodCashVersion,
    operands: structuredClone(input), operating: op, financing, capitalMovements: movements,
    measurement: "opening_and_period_end_balances" as const,
    exclusions: ["intraperiod_liquidity", "lifetime_cost_when_residual_debt_exists", "contractual_covenant_certification", "source_completeness"] as const};
  const gaps: string[] = [];
  if (input.capitalMovementInventory.status === "unknown") gaps.push("capital_movements_unknown");
  if (cash === null) gaps.push("opening_available_unknown");
  if (restricted === null) gaps.push("opening_restricted_unknown");
  if (financing?.status === "missing_inputs") gaps.push("financing_costs_unknown");
  if (gaps.length) return {...common, status: "missing_inputs" as const, rows: null, summary: null, gaps};
  let minimumAvailable = cash!; let minimumRestricted = restricted!;
  const events = financing?.events ?? [];
  const rows = op.rows.map(period => {
    const selected = events.filter(e => e.date >= period.startDate && e.date <= period.endDate);
    const net = (account: "available" | "restricted") => selected.filter(e => e.account === account)
      .reduce((sum, e) => sum.plus(new Exact(e.amount!).times(e.direction === "inflow" ? 1 : -1)), new Exact(0));
    const availableFinance = net("available"); const restrictedFinance = net("restricted");
    const capital = movements.filter(m => m.date >= period.startDate && m.date <= period.endDate);
    const capitalNet = (account: "available" | "restricted") => capital.filter(m => m.account === account)
      .reduce((n, m) => n.plus(new Exact(m.amount).times(m.direction === "inflow" ? 1 : -1)), new Exact(0));
    const availableCapital = capitalNet("available"); const restrictedCapital = capitalNet("restricted");
    const openingAvailable = cash!; const openingRestricted = restricted!;
    cash = cash!.plus(period.cashBeforeFinancing).plus(availableFinance).plus(availableCapital);
    restricted = restricted!.plus(restrictedFinance).plus(restrictedCapital);
    minimumAvailable = Exact.min(minimumAvailable, cash); minimumRestricted = Exact.min(minimumRestricted, restricted);
    const debts = (financing?.debt ?? []).map(instrument => {
      const row = instrument.rows.find(r => r.endDate === period.endDate);
      if (!row) throw new Error("capital_period_cash_debt_stock_date_missing");
      return {instrumentId: instrument.instrumentId, closingPrincipal: row.closingPrincipal};
    });
    const closingDebt = debts.reduce((n, d) => n.plus(d.closingPrincipal), new Exact(0));
    return {periodId: period.periodId, startDate: period.startDate, endDate: period.endDate,
      openingAvailable: openingAvailable.toFixed(), openingRestricted: openingRestricted.toFixed(),
      cashBeforeFinancing: period.cashBeforeFinancing, netFinancingAvailable: availableFinance.toFixed(),
      netFinancingRestricted: restrictedFinance.toFixed(), netCapitalAvailable: availableCapital.toFixed(), netCapitalRestricted: restrictedCapital.toFixed(), capitalMovementIds: capital.map(m => m.id), closingAvailable: cash.toFixed(), closingRestricted: restricted.toFixed(),
      availableShortfallAtPeriodEnd: Exact.max(cash.negated(), 0).toFixed(), restrictedShortfallAtPeriodEnd: Exact.max(restricted.negated(), 0).toFixed(),
      closingDebt: closingDebt.toFixed(), instrumentStocks: debts, financingEventIds: selected.map(e => e.id)};
  });
  return {...common, status: "calculated" as const, rows, gaps,
    summary: {closingAvailable: cash!.toFixed(), closingRestricted: restricted!.toFixed(),
      minimumAvailableAtMeasuredDates: minimumAvailable.toFixed(), maximumAvailableShortfallAtMeasuredDates: Exact.max(minimumAvailable.negated(), 0).toFixed(),
      minimumRestrictedAtMeasuredDates: minimumRestricted.toFixed(), maximumRestrictedShortfallAtMeasuredDates: Exact.max(minimumRestricted.negated(), 0).toFixed(),
      closingDebt: rows.at(-1)!.closingDebt, nominalFinancingCostInHorizon: financing?.totals?.nominalFinancingCostInHorizon ?? "0",
      lifetimeCostCompared: false as const, intraperiodLiquidityVerified: false as const}};
}
