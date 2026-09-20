import Decimal from "decimal.js";
import {buildDatedDebtCashFlows, type DatedDebtInput} from "./dated-debt";
import {buildLiquidityCalendar, type LiquidityAccount, type LiquidityEvent} from "./liquidity-calendar";

export const financingCostsVersion = "2026.09.20-v1";
const Money = Decimal.clone({precision: 50, rounding: Decimal.ROUND_HALF_UP});
export const financingCostCategories = ["origination_fee", "recurring_fee", "tax", "other"] as const;
type Category = typeof financingCostCategories[number];
export type FinancingCharge = {
  id: string;
  /** Same economic charge cannot appear once as withheld and again as a payment. */
  economicId: string;
  instrumentId: string; category: Category; period: string; date: string;
  amount: string;
  treatment: "withheld_from_gross_draw" | "cash_paid" | "capitalized_at_period_start";
  account: LiquidityAccount | null;
};
export type FinancingCostAssessment = {
  instrumentId: string; category: Category;
  status: "specified" | "zero" | "not_applicable" | "unknown";
  reason: string;
};
export type FinancingCostsInput = {
  debt: DatedDebtInput;
  /** Every instrument/category has an assessment; empty list never means free financing. */
  assessments: readonly FinancingCostAssessment[];
  charges: readonly FinancingCharge[];
  drawConvention: "gross_cash_before_withholding";
};

/** Recomputes debt with explicitly financed charges and projects cash exactly once.
 * Assessments are caller declarations, not tax/legal conclusions or completeness assurance.
 * No inferred taxes, annualized cost, contractual rounding or business-day calendar.
 * Capitalization at dates other than a period start must first split the contractual periods.
 */
export function buildFinancingCashFlows(input: FinancingCostsInput) {
  if (input.drawConvention !== "gross_cash_before_withholding") throw new Error("financing_gross_draw_convention_required");
  if (!input.debt.instruments.length || input.debt.instruments.length > 200
    || input.debt.instruments.reduce((n, i) => n + i.periods.length, 0) > 2000) throw new Error("financing_instrument_or_period_limit");
  if (input.charges.length > 2000 || input.assessments.length !== input.debt.instruments.length * financingCostCategories.length) throw new Error("financing_cost_inventory_required");
  const instruments = new Map(input.debt.instruments.map(i => [i.instrumentId, i]));
  const assessments = new Map<string, FinancingCostAssessment>();
  const key = (instrument: string, category: string) => JSON.stringify([instrument, category]);
  for (const assessment of input.assessments) {
    const id = key(assessment.instrumentId, assessment.category);
    if (!instruments.has(assessment.instrumentId) || !financingCostCategories.includes(assessment.category)
      || assessments.has(id) || !["specified", "zero", "not_applicable", "unknown"].includes(assessment.status)
      || typeof assessment.reason !== "string" || !assessment.reason.trim() || assessment.reason.length > 2000) throw new Error("financing_invalid_assessment");
    assessments.set(id, {...assessment});
  }
  const ids = new Set<string>(); const economicIds = new Set<string>();
  const charges = input.charges.map(charge => {
    if (typeof charge.id !== "string" || !charge.id.trim() || charge.id.length > 160 || ids.has(charge.id)
      || typeof charge.economicId !== "string" || !charge.economicId.trim() || charge.economicId.length > 160 || economicIds.has(charge.economicId)) throw new Error("financing_duplicate_charge");
    ids.add(charge.id); economicIds.add(charge.economicId);
    const instrument = instruments.get(charge.instrumentId);
    const period = instrument?.periods.find(p => p.period === charge.period);
    if (!instrument || !period || assessments.get(key(charge.instrumentId, charge.category))?.status !== "specified") throw new Error("financing_charge_assessment_mismatch");
    if (typeof charge.amount !== "string" || !/^\d{1,24}(?:\.\d{1,8})?$/.test(charge.amount) || new Money(charge.amount).lte(0)) throw new Error("financing_positive_charge_required");
    if (typeof charge.date !== "string" || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(charge.date)
      || !Number.isFinite(new Date(`${charge.date}T00:00:00Z`).getTime())
      || new Date(`${charge.date}T00:00:00Z`).toISOString().slice(0, 10) !== charge.date
      || charge.date < period.startDate || charge.date > period.endDate) throw new Error("financing_charge_outside_period");
    if (!["withheld_from_gross_draw", "cash_paid", "capitalized_at_period_start"].includes(charge.treatment)) throw new Error("financing_treatment_required");
    if (charge.treatment === "capitalized_at_period_start") {
      if (charge.date !== period.startDate || charge.account !== null) throw new Error("financing_capitalization_convention_mismatch");
    } else {
      if (!["available", "restricted"].includes(charge.account!)) throw new Error("financing_account_required");
      if (charge.treatment === "withheld_from_gross_draw" && (charge.date !== period.startDate || charge.account !== instrument.drawdownAccount)) throw new Error("financing_withholding_convention_mismatch");
    }
    return {...charge, amount: new Money(charge.amount).toFixed()};
  });
  for (const a of assessments.values()) {
    const found = charges.filter(c => c.instrumentId === a.instrumentId && c.category === a.category);
    if ((a.status === "specified") !== (found.length > 0)) throw new Error("financing_charge_assessment_mismatch");
  }
  const sum = (selected: readonly FinancingCharge[]) => selected.reduce((total, c) => total.plus(c.amount), new Money(0));
  const adjustedInput = structuredClone(input.debt);
  const cashDraws = new Map<string, string>();
  for (const instrument of adjustedInput.instruments) for (const period of instrument.periods) {
    if (typeof period.drawdown !== "string" || !/^\d{1,24}(?:\.\d{1,8})?$/.test(period.drawdown)) throw new Error("financing_invalid_gross_draw");
    cashDraws.set(JSON.stringify([instrument.instrumentId, period.period, "drawdown"]), period.drawdown);
    const selected = charges.filter(c => c.instrumentId === instrument.instrumentId && c.period === period.period);
    const withheld = sum(selected.filter(c => c.treatment === "withheld_from_gross_draw"));
    if (withheld.gt(period.drawdown)) throw new Error("financing_withholding_exceeds_gross_draw");
    // The underlying engine accrues on principal + draws at period start. A financed charge
    // adds principal on exactly that date. It is removed from the cash draw below and remains
    // separately identified in every returned row; it never becomes proceeds to the borrower.
    period.drawdown = new Money(period.drawdown).plus(sum(selected.filter(c => c.treatment === "capitalized_at_period_start"))).toFixed();
  }
  // Validate and recompute the enriched principal ledger. Original scheduled payments can
  // legitimately repay financed charges as well as cash draws; validating them against a
  // counterfactual debt with no financed charges would reject that valid amortization.
  const adjusted = buildDatedDebtCashFlows(adjustedInput);
  const gaps = [...assessments.values()].filter(a => a.status === "unknown");
  const common = {
    schemaVersion: "financing-cash-flows.v1" as const, engineVersion: financingCostsVersion,
    operands: structuredClone(input), assessments: [...assessments.values()], charges,
    drawConvention: input.drawConvention, gaps,
    /** Nominal cost in this horizon is neither CET nor an annual effective rate. */
    annualEffectiveCost: null, annualEffectiveCostStatus: "not_calculated" as const,
  };
  if (gaps.length) return {...common, status: "missing_inputs" as const, debt: null, events: null, totals: null};
  const events: LiquidityEvent[] = adjusted.events.map(e => ({...e,
    amount: e.component === "drawdown" ? cashDraws.get(e.id)! : e.amount,
  }));
  for (const charge of charges) if (charge.treatment !== "capitalized_at_period_start") events.push({
    id: JSON.stringify(["financing_charge", charge.id]), date: charge.date,
    account: charge.account!, direction: "outflow", amount: charge.amount, missingReason: null,
  });
  const validated = buildLiquidityCalendar({
    openingDate: input.debt.openingDate, endDate: input.debt.endDate, currency: input.debt.currency,
    convention: "end_of_day_netting", coverage: {status: "partial", reason: "financing_only"},
    openingAvailable: "0", openingRestricted: "0", events,
  });
  const debt = adjusted.instruments.map(instrument => {
    const {totalFinanceExpense, rows, ...schedule} = instrument;
    return {...schedule, totalInterestAndIndexationAccrued: totalFinanceExpense,
    rows: rows.map(row => {
      const {financeExpense, nonCashDebtIncrease, ...terms} = row;
      const period = instruments.get(instrument.instrumentId)!.periods.find(p => p.period === row.period)!;
      const selected = charges.filter(c => c.instrumentId === instrument.instrumentId && c.period === row.period);
      const capitalized = sum(selected.filter(c => c.treatment === "capitalized_at_period_start"));
      return {...terms, drawdown: period.drawdown,
        interestAndIndexationAccrued: financeExpense,
        nominalChargesInPeriod: sum(selected).toFixed(),
        nonCashDebtIncrease: new Money(nonCashDebtIncrease).plus(capitalized).toFixed(),
        capitalizedCharges: capitalized.toFixed(),
        withheldCharges: sum(selected.filter(c => c.treatment === "withheld_from_gross_draw")).toFixed(),
        chargeIds: selected.map(c => c.id),
      };
    }),
  };});
  const total = (values: string[]) => values.reduce((n, v) => n.plus(v), new Money(0));
  const grossDraws = total([...cashDraws.values()]);
  const withheld = sum(charges.filter(c => c.treatment === "withheld_from_gross_draw"));
  const financeExpense = total(adjusted.instruments.map(i => i.totalFinanceExpense));
  return {...common, status: "calculated" as const, debt, events: validated.events,
    totals: {
      grossDraws: grossDraws.toFixed(), withheldCharges: withheld.toFixed(),
      proceedsAfterWithholding: grossDraws.minus(withheld).toFixed(),
      cashPaidCharges: sum(charges.filter(c => c.treatment === "cash_paid")).toFixed(),
      capitalizedCharges: sum(charges.filter(c => c.treatment === "capitalized_at_period_start")).toFixed(),
      nominalCharges: sum(charges).toFixed(), accruedInterestAndIndexation: financeExpense.toFixed(),
      nominalFinancingCostInHorizon: financeExpense.plus(sum(charges)).toFixed(),
      closingPrincipal: total(adjusted.instruments.map(i => i.closingPrincipal)).toFixed(),
    },
  };
}
