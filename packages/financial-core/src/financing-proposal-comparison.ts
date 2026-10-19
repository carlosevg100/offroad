import Decimal from "decimal.js";
import {buildCapitalPeriodCash} from "./capital-period-cash";
import type {DatedDebtInstrument} from "./dated-debt";
import {buildDeferredFinancingSchedule, solveEquivalentFinancingSpread, type DeferredFinancingScheduleInput, type EquivalentFinancingCostInput} from "./equivalent-financing-cost";
import {buildFinancingCashFlows, financingCostCategories, type FinancingCharge, type FinancingCostAssessment} from "./financing-costs";
import type {OperatingWorkingCapital} from "./operating-cash-projection";
import {calculatePeriodFinancingTaxes} from "./period-financing-taxes";
import {projectLeverageCovenant, type ProjectedLeverageDefinition} from "./projected-leverage-covenant";

export const financingProposalComparisonVersion = "2026.10.19-v1";

export type ComparisonPeriod = {
  id: string; startDate: string; endDate: string;
  ebitda: string; leasePayments: string; depreciationAndAmortization: string;
  /** Signed operating working-capital cash flow of the period (negative consumes cash). */
  workingCapitalCashFlow: string;
  maintenanceCapexPaid: string; growthCapexPaid: string;
};

export type ProposalUnderComparison = {
  id: string; label: string;
  /** Lifetime terms of the proposal, to its final payment: equivalent cost and average life. */
  cost: {schedule: DeferredFinancingScheduleInput; costInventory: EquivalentFinancingCostInput["costInventory"]; lowerSpread: string; upperSpread: string};
  /** The proposal's instrument within the company horizon (amortization after the horizon stays residual debt). */
  instrument: DatedDebtInstrument;
  /** Charges caused by choosing this proposal (fees, taxes on credit, waivers it requires). */
  charges: readonly FinancingCharge[];
  /** Charge ids that hit cash but not the tax base (e.g. a consent fee the adopted tax rule excludes). */
  nonDeductibleChargeIds: readonly string[];
  collateralConsumed: string;
  covenant: Omit<ProjectedLeverageDefinition, "history"> & {name: string};
};

export type FinancingProposalComparisonInput = {
  currency: string; openingDate: string; endDate: string;
  openingAvailable: string;
  periods: readonly ComparisonPeriod[];
  /** Debt that exists whichever proposal is chosen, including decided prepayments. */
  commonInstruments: readonly DatedDebtInstrument[];
  commonCharges: readonly FinancingCharge[];
  commonNonDeductibleChargeIds: readonly string[];
  /** EBITDA and lease payments before the horizon for early covenant windows, oldest first. */
  covenantHistory: ProjectedLeverageDefinition["history"];
  tax: {rate: string; lossTreatment: "no_cash_benefit"};
  /** Receivables pool available as collateral before any proposal. */
  freeReceivablesPool: string;
  /** Minimum cash is measured at period ends from this period on (draw quarter onward). */
  minimumCashFromPeriod: string;
  proposals: readonly ProposalUnderComparison[];
};

const D = Decimal.clone({precision: 60, rounding: Decimal.ROUND_HALF_UP});
const eight = (v: Decimal) => v.toDecimalPlaces(8, Decimal.ROUND_HALF_UP).toFixed();
const zeroWc = (): OperatingWorkingCapital => ({receivables: "0", inventory: "0", otherOperatingAssets: "0", payables: "0", otherOperatingLiabilities: "0"});

function assessments(instruments: readonly DatedDebtInstrument[], charges: readonly FinancingCharge[]): FinancingCostAssessment[] {
  return instruments.flatMap((i) => financingCostCategories.map((category) => charges.some((c) => c.instrumentId === i.instrumentId && c.category === category)
    ? {instrumentId: i.instrumentId, category, status: "specified" as const, reason: "Adopted charge in the terms"}
    : {instrumentId: i.instrumentId, category, status: "zero" as const, reason: "No charge of this category in the adopted terms"}));
}

/**
 * Compares financing proposals for the same need on the company itself: each proposal's
 * lifetime equivalent cost and average life, then the company projected with that proposal
 * (taxes recomputed from the interest and charges it brings), minimum cash and its period,
 * debt service by year, contractual leverage on the proposal's own definition and dates,
 * collateral consumed and the horizon financing cost. Composes existing kernels only; it
 * recommends nothing.
 */
export function compareFinancingProposals(input: FinancingProposalComparisonInput) {
  if (!input.proposals.length || input.proposals.length > 8) throw new Error("proposal_comparison_count");
  if (new Set(input.proposals.map((p) => p.id)).size !== input.proposals.length) throw new Error("proposal_comparison_duplicate");
  if (!input.periods.some((p) => p.id === input.minimumCashFromPeriod)) throw new Error("proposal_comparison_window_outside_horizon");
  const pool = new D(input.freeReceivablesPool);
  const proposals = input.proposals.map((proposal) => {
    // 1. Lifetime cost and average life of the proposal on its own terms.
    const schedule = buildDeferredFinancingSchedule(proposal.cost.schedule);
    const cost = solveEquivalentFinancingSpread({baseDate: proposal.cost.schedule.baseDate, currency: proposal.cost.schedule.currency, moneyUnit: proposal.cost.schedule.moneyUnit,
      intervals: proposal.cost.schedule.periods.map(({scheduledPrincipal: _p, paysAccruedInterest: _c, ...p}) => p), netFlows: schedule.netFlows,
      costInventory: proposal.cost.costInventory, convention: "multiplicative_index_and_spread_on_net_borrower_flows",
      lowerSpread: proposal.cost.lowerSpread, upperSpread: proposal.cost.upperSpread});
    // 2. The company with this proposal: debt and charges first, taxes from them, then cash.
    const instruments = [...input.commonInstruments, proposal.instrument];
    const charges = [...input.commonCharges, ...proposal.charges];
    const nonDeductible = new Set([...input.commonNonDeductibleChargeIds, ...proposal.nonDeductibleChargeIds]);
    const financingInput = {debt: {openingDate: input.openingDate, endDate: input.endDate, currency: input.currency,
      convention: "draw_at_period_start_pay_at_period_end" as const, instruments}, assessments: assessments(instruments, charges), charges,
      drawConvention: "gross_cash_before_withholding" as const};
    const financing = buildFinancingCashFlows(financingInput);
    if (financing.status !== "calculated") throw new Error("proposal_comparison_financing_incomplete");
    const byPeriod = (period: ComparisonPeriod) => {
      const rows = financing.debt.flatMap((i) => i.rows.filter((r) => r.endDate === period.endDate));
      const interest = rows.reduce((t, r) => t.plus(r.interestAndIndexationAccrued), new D(0));
      const inPeriod = charges.filter((c) => c.date >= period.startDate && c.date <= period.endDate);
      const deductible = inPeriod.filter((c) => !nonDeductible.has(c.id)).reduce((t, c) => t.plus(c.amount), new D(0));
      const allCharges = inPeriod.reduce((t, c) => t.plus(c.amount), new D(0));
      const interestPaid = rows.reduce((t, r) => t.plus(r.couponPaid).plus(r.indexationPaid), new D(0));
      const principal = rows.reduce((t, r) => t.plus(r.scheduledPrincipal).plus(r.prepayment), new D(0));
      return {interest, deductible, allCharges, interestPaid, principal};
    };
    const flows = input.periods.map(byPeriod);
    const taxes = calculatePeriodFinancingTaxes({rate: input.tax.rate, lossTreatment: input.tax.lossTreatment,
      periods: input.periods.map((p, i) => ({period: p.id, ebitda: p.ebitda, depreciationAndAmortization: p.depreciationAndAmortization,
        leasePayments: p.leasePayments, financeExpense: flows[i]!.interest.toFixed(), financingCharges: flows[i]!.deductible.toFixed()}))});
    let wc = new D(0);
    const operating = {currency: input.currency, openingDate: input.openingDate, endDate: input.endDate, openingWorkingCapital: zeroWc(),
      convention: "accrual_ebitda_to_cash_before_financing" as const,
      periods: input.periods.map((p, i) => {
        wc = wc.minus(p.workingCapitalCashFlow);
        return {id: p.id, startDate: p.startDate, endDate: p.endDate,
          // Lease payments are paid outside IFRS 16 EBITDA; carried as a fixed operating payment.
          revenue: {mode: "amount" as const, amount: p.ebitda}, variableOperatingExpense: "0", fixedOperatingExpense: p.leasePayments,
          nonCashEbitdaAdjustment: "0",
          closingWorkingCapital: {...zeroWc(), receivables: eight(D.max(wc, 0)), payables: eight(D.max(wc.neg(), 0))},
          cashTaxesPaid: eight(new D(taxes.rows[i]!.cashTax)), cashTaxRefunds: "0",
          maintenanceCapexPaid: p.maintenanceCapexPaid, growthCapexPaid: p.growthCapexPaid};
      })};
    const cash = buildCapitalPeriodCash({capitalMovements: [], capitalMovementInventory: {status: "declared_complete", reason: "No capital movements in the comparison"},
      operating, financing: {status: "provided", input: financingInput}, openingAvailable: input.openingAvailable, openingRestricted: "0", operatingCashAccount: "available"});
    if (cash.status !== "calculated") throw new Error("proposal_comparison_cash_incomplete");
    const rows = cash.rows;
    const from = rows.findIndex((r) => r.periodId === input.minimumCashFromPeriod);
    const window = rows.slice(from);
    const low = window.reduce((m, r) => (new D(r.closingAvailable).lt(m.closingAvailable) ? r : m));
    const serviceByYear: Record<string, string> = {};
    input.periods.forEach((p, i) => {const y = p.endDate.slice(0, 4); serviceByYear[y] = new D(serviceByYear[y] ?? 0).plus(flows[i]!.interestPaid).plus(flows[i]!.principal).toFixed();});
    const covenant = projectLeverageCovenant(rows.map((r, i) => ({period: r.periodId, ebitda: input.periods[i]!.ebitda, leasePayments: input.periods[i]!.leasePayments,
      closingDebt: r.closingDebt, closingAvailableCash: r.closingAvailable})), {...proposal.covenant, history: input.covenantHistory});
    const last = rows.at(-1)!;
    return {
      id: proposal.id, label: proposal.label,
      equivalentSpread: cost.status === "calculated" ? cost.annualSpread : null, costStatus: cost.status,
      weightedAverageLifeYears: schedule.weightedAverageLifeYears,
      minimumCash: {amount: low.closingAvailable, periodId: low.periodId},
      debtServiceByYear: serviceByYear,
      covenant: {name: proposal.covenant.name, limit: covenant.limit, worst: covenant.worst, allComply: covenant.allComply, rows: covenant.rows},
      collateralConsumed: new D(proposal.collateralConsumed).toFixed(), freeReceivablesAfter: pool.minus(proposal.collateralConsumed).toFixed(),
      horizonFinancingCost: flows.reduce((t, f) => t.plus(f.interestPaid).plus(f.allCharges), new D(0)).toFixed(),
      netDebtAtHorizon: new D(last.closingDebt).minus(last.closingAvailable).toFixed(),
      taxesInHorizon: taxes.totalCashTax,
      periods: rows.map((r, i) => ({periodId: r.periodId, closingAvailable: r.closingAvailable, closingDebt: r.closingDebt, cashTax: taxes.rows[i]!.cashTax})),
    };
  });
  return {schemaVersion: "financing-proposal-comparison.v1" as const, engineVersion: financingProposalComparisonVersion, operands: input, currency: input.currency,
    openingDate: input.openingDate, endDate: input.endDate, minimumCashFromPeriod: input.minimumCashFromPeriod, proposals,
    exclusions: ["firmness_and_validity", "prepayment_terms", "reciprocity", "restricted_accounts", "choice_of_counterparty", "intraperiod_liquidity"] as const};
}
