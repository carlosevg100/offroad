import Decimal from "decimal.js";
import {brazilianBusinessDays} from "./business-day-calendar";
import {buildCapitalPeriodCash} from "./capital-period-cash";
import type {DatedDebtInstrument} from "./dated-debt";
import {buildDeferredFinancingSchedule, solveEquivalentFinancingSpread, type DeferredFinancingScheduleInput} from "./equivalent-financing-cost";
import {buildFinancingCashFlows, financingCostCategories, type FinancingCharge, type FinancingCostAssessment} from "./financing-costs";
import type {OperatingWorkingCapital} from "./operating-cash-projection";
import {calculatePeriodFinancingTaxes} from "./period-financing-taxes";
import {projectLeverageCovenant, type ProjectedLeverageDefinition} from "./projected-leverage-covenant";

export const financingProposalComparisonVersion = "2026.10.19-v2";

export type ComparisonPeriod = {
  id: string; startDate: string; endDate: string;
  ebitda: string; leasePayments: string; depreciationAndAmortization: string;
  /** Signed operating working-capital cash flow of the period (negative consumes cash). */
  workingCapitalCashFlow: string;
  maintenanceCapexPaid: string; growthCapexPaid: string;
};

export type ProposalUnderComparison = {
  id: string; label: string;
  /** The proposal, once: draw, curve, coupon calendar and amortization over its whole life. Its
   * equivalent cost and average life come from it, and so does its place in the company: interest
   * accrued, paid and principal in each company period are derived from this schedule, cut at the
   * period ends with the schedule's own day-count convention. There is no second description. */
  cost: {schedule: DeferredFinancingScheduleInput; lowerSpread: string; upperSpread: string;
    /** The lender's charges after the horizon (recurring fees), on lifetime period ends. */
    chargesAfterHorizon?: readonly {id: string; category: FinancingCharge["category"]; date: string; amount: string}[]};
  /** Charges in the horizon. Those with the proposal's id are the lender's own (entry fee and credit
   * tax withheld at the draw, recurring fees); those naming an existing instrument are caused by
   * choosing this proposal (a consent fee paid to another lender's holders, for example). */
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
  proposals: readonly ProposalUnderComparison[];
};

const D = Decimal.clone({precision: 60, rounding: Decimal.ROUND_HALF_UP});
const eight = (v: Decimal) => v.toDecimalPlaces(8, Decimal.ROUND_HALF_UP).toFixed();
const zeroWc = (): OperatingWorkingCapital => ({receivables: "0", inventory: "0", otherOperatingAssets: "0", payables: "0", otherOperatingLiabilities: "0"});
const days = (a: string, b: string) => (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000;
const dayBefore = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);

function assessments(instruments: readonly DatedDebtInstrument[], charges: readonly FinancingCharge[]): FinancingCostAssessment[] {
  return instruments.flatMap((i) => financingCostCategories.map((category) => charges.some((c) => c.instrumentId === i.instrumentId && c.category === category)
    ? {instrumentId: i.instrumentId, category, status: "specified" as const, reason: "Adopted charge in the terms"}
    : {instrumentId: i.instrumentId, category, status: "zero" as const, reason: "No charge of this category in the adopted terms"}));
}

/** The proposal in each company period, derived from its lifetime schedule: the draw lands in the
 * period that contains the draw date; interest paid and principal in the period that contains each
 * payment date; interest accrued is cut at period ends inside a lifetime period with the period's
 * own convention (business days of the national calendar over 252, actual days over 365); a grid
 * fraction cannot be cut and must end on company period ends. */
export function proposalCompanyLedger(schedule: DeferredFinancingScheduleInput, periods: readonly {startDate: string; endDate: string}[]) {
  const built = buildDeferredFinancingSchedule(schedule);
  // Every business-day period must be the national calendar's count, cut or not.
  schedule.periods.forEach((p, i) => {
    const start = i ? schedule.periods[i - 1]!.endDate : schedule.baseDate;
    if (p.yearFractionConvention === "business_days_252" && brazilianBusinessDays(start, p.endDate) !== p.businessDays) throw new Error("proposal_comparison_calendar_mismatch");
  });
  // On contract dates the draw date belongs to the period that contains it (a draw on a period end
  // is in that period); on the period grid the draw opens the period after the recorded date.
  const contract = schedule.periods.some((p) => p.yearFractionConvention !== "adopted_year_fraction");
  const draw = periods.findIndex((p) => contract ? p.endDate >= schedule.baseDate : p.endDate > schedule.baseDate);
  if (draw < 0 || schedule.baseDate < dayBefore(periods[0]!.startDate)) throw new Error("proposal_comparison_draw_outside_horizon");
  const fractionTo = (p: DeferredFinancingScheduleInput["periods"][number], start: string, cut: string) => {
    if (cut === start) return new D(0);
    if (cut === p.endDate) return new D(p.yearFraction);
    if (p.yearFractionConvention === "business_days_252") return new D(brazilianBusinessDays(start, cut)).div(252);
    if (p.yearFractionConvention === "actual_365_fixed") return new D(days(start, cut)).div(365);
    throw new Error("proposal_comparison_lifetime_split_unavailable");
  };
  const factor = (p: DeferredFinancingScheduleInput["periods"][number], fraction: Decimal) =>
    new D(p.annualIndex).plus(1).times(new D(schedule.annualSpread).plus(1)).pow(fraction).minus(1);
  const accruedTo = (i: number, cut: string) => {
    const p = schedule.periods[i]!, start = i ? schedule.periods[i - 1]!.endDate : schedule.baseDate;
    return new D(built.rows[i]!.interestBase).times(factor(p, fractionTo(p, start, cut)));
  };
  return periods.map((q, n) => {
    const previousEnd = n ? periods[n - 1]!.endDate : dayBefore(periods[0]!.startDate);
    let accrued = new D(0), paid = new D(0), principal = new D(0);
    schedule.periods.forEach((p, i) => {
      const start = i ? schedule.periods[i - 1]!.endDate : schedule.baseDate;
      const from = previousEnd > start ? previousEnd : start, to = q.endDate < p.endDate ? q.endDate : p.endDate;
      if (to > from) accrued = accrued.plus(accruedTo(i, to)).minus(accruedTo(i, from));
      if (p.endDate > previousEnd && p.endDate <= q.endDate) {paid = paid.plus(built.rows[i]!.interestPaid); principal = principal.plus(p.scheduledPrincipal);}
    });
    const lastRow = built.rows.filter((r) => r.endDate <= q.endDate).at(-1);
    const closing = n < draw ? new D(0) : lastRow ? new D(lastRow.closingPrincipal) : new D(schedule.grossAdvance);
    return {draw: n === draw ? schedule.grossAdvance : "0", interestAccrued: accrued, interestPaid: paid, principalPaid: principal, closingPrincipal: closing};
  });
}

/**
 * Compares financing proposals for the same need on the company itself: each proposal's
 * lifetime equivalent cost and average life, then the company projected with that proposal
 * (taxes recomputed from the interest and charges it brings), minimum cash from its draw,
 * debt service by year, contractual leverage on the proposal's own definition and dates,
 * collateral consumed and the horizon financing cost. One schedule per proposal feeds both
 * views. Composes existing kernels only; it recommends nothing.
 */
export function compareFinancingProposals(input: FinancingProposalComparisonInput) {
  if (!input.proposals.length || input.proposals.length > 8) throw new Error("proposal_comparison_count");
  if (new Set(input.proposals.map((p) => p.id)).size !== input.proposals.length) throw new Error("proposal_comparison_duplicate");
  const commonIds = new Set(input.commonInstruments.map((i) => i.instrumentId));
  // Every charge is a positive amount with its own id: nothing is counted twice across the company,
  // the horizon and the life of a proposal.
  const chargeIds = [...input.commonCharges.map((c) => c.id), ...input.proposals.flatMap((p) => [...p.charges.map((c) => c.id), ...(p.cost.chargesAfterHorizon ?? []).map((c) => c.id)])];
  if (new Set(chargeIds).size !== chargeIds.length) throw new Error("proposal_comparison_duplicate_charge");
  const economic = [...input.commonCharges, ...input.proposals.flatMap((p) => p.charges)].map((c) => c.economicId);
  if (new Set(economic).size !== economic.length) throw new Error("proposal_comparison_duplicate_charge");
  for (const p of input.proposals) for (const c of [...p.charges, ...(p.cost.chargesAfterHorizon ?? [])]) if (!new D(c.amount).gt(0)) throw new Error("proposal_comparison_positive_charge_required");
  for (const p of input.proposals) for (const c of p.cost.chargesAfterHorizon ?? []) if (c.date <= input.endDate) throw new Error("proposal_comparison_charge_inside_horizon");
  const pool = new D(input.freeReceivablesPool);
  // Receivables and the collateral a proposal takes from them are amounts, never negative.
  if (pool.lt(0) || input.proposals.some((p) => new D(p.collateralConsumed).lt(0))) throw new Error("proposal_comparison_negative_collateral");
  const proposals = input.proposals.map((proposal) => {
    if (commonIds.has(proposal.id)) throw new Error("proposal_comparison_duplicate");
    const lifetime = proposal.cost.schedule;
    const own = proposal.charges.filter((c) => c.instrumentId === proposal.id);
    const caused = proposal.charges.filter((c) => c.instrumentId !== proposal.id);
    if (caused.some((c) => !commonIds.has(c.instrumentId))) throw new Error("proposal_comparison_charge_payee_unknown");
    // 1. Lifetime cost and average life, on the single schedule.
    const schedule = buildDeferredFinancingSchedule(lifetime);
    const ledger = proposalCompanyLedger(lifetime, input.periods);
    const draw = ledger.findIndex((l) => l.draw !== "0");
    const drawPeriod = input.periods[draw]!;
    const upfront = own.filter((c) => c.date >= drawPeriod.startDate && c.date <= drawPeriod.endDate && (c.category === "origination_fee" || c.category === "tax"));
    if (!upfront.reduce((t, c) => t.plus(c.amount), new D(0)).eq(lifetime.upfrontWithheldCosts)) throw new Error("proposal_comparison_upfront_charges_mismatch");
    const boundaries = new Set(lifetime.periods.map((p) => p.endDate));
    const later = [...own.filter((c) => !upfront.includes(c)), ...(proposal.cost.chargesAfterHorizon ?? [])];
    for (const c of later) if (!boundaries.has(c.date)) throw new Error("proposal_comparison_charge_off_lifetime_grid");
    const costCharges = [...upfront, ...later];
    const cost = solveEquivalentFinancingSpread({baseDate: lifetime.baseDate, currency: lifetime.currency, moneyUnit: lifetime.moneyUnit,
      intervals: lifetime.periods.map(({scheduledPrincipal: _p, paysAccruedInterest: _c, ...p}) => p),
      netFlows: [...schedule.netFlows, ...later.map((c) => ({id: `charge:${c.id}`, date: c.date, amount: new D(c.amount).neg().toFixed(), sourceAnchor: c.id}))],
      costInventory: financingCostCategories.map((category) => costCharges.some((c) => c.category === category)
        ? {category, status: "specified" as const, reason: "Adopted charge of this proposal"}
        : {category, status: "zero" as const, reason: "No charge of this category in the adopted terms"}),
      convention: "multiplicative_index_and_spread_on_net_borrower_flows", lowerSpread: proposal.cost.lowerSpread, upperSpread: proposal.cost.upperSpread});
    // 2. The company with this proposal: existing debt and the charges this choice causes on it through
    // the debt kernels; the proposal itself from its ledger; taxes from both; cash and debt overlaid.
    const charges = [...input.commonCharges, ...caused];
    const nonDeductible = new Set([...input.commonNonDeductibleChargeIds, ...proposal.nonDeductibleChargeIds]);
    const financingInput = {debt: {openingDate: input.openingDate, endDate: input.endDate, currency: input.currency,
      convention: "draw_at_period_start_pay_at_period_end" as const, instruments: input.commonInstruments}, assessments: assessments(input.commonInstruments, charges), charges,
      drawConvention: "gross_cash_before_withholding" as const};
    const financing = buildFinancingCashFlows(financingInput);
    if (financing.status !== "calculated") throw new Error("proposal_comparison_financing_incomplete");
    const allCharges = [...charges, ...own];
    const flows = input.periods.map((period, i) => {
      const rows = financing.debt.flatMap((x) => x.rows.filter((r) => r.endDate === period.endDate));
      const inPeriod = allCharges.filter((c) => c.date >= period.startDate && c.date <= period.endDate);
      const l = ledger[i]!;
      return {interest: rows.reduce((t, r) => t.plus(r.interestAndIndexationAccrued), new D(0)).plus(l.interestAccrued),
        deductible: inPeriod.filter((c) => !nonDeductible.has(c.id)).reduce((t, c) => t.plus(c.amount), new D(0)),
        allCharges: inPeriod.reduce((t, c) => t.plus(c.amount), new D(0)),
        ownCharges: own.filter((c) => c.date >= period.startDate && c.date <= period.endDate).reduce((t, c) => t.plus(c.amount), new D(0)),
        interestPaid: rows.reduce((t, r) => t.plus(r.couponPaid).plus(r.indexationPaid), new D(0)).plus(l.interestPaid),
        principal: rows.reduce((t, r) => t.plus(r.scheduledPrincipal).plus(r.prepayment), new D(0)).plus(l.principalPaid)};
    });
    const taxes = calculatePeriodFinancingTaxes({rate: input.tax.rate, lossTreatment: input.tax.lossTreatment,
      periods: input.periods.map((p, i) => ({period: p.id, ebitda: p.ebitda, depreciationAndAmortization: p.depreciationAndAmortization,
        leasePayments: p.leasePayments, financeExpense: flows[i]!.interest.toDecimalPlaces(20).toFixed(), financingCharges: flows[i]!.deductible.toDecimalPlaces(20).toFixed()}))});
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
    let overlay = new D(0);
    const rows = cash.rows.map((r, i) => {
      const l = ledger[i]!;
      overlay = overlay.plus(l.draw).minus(flows[i]!.ownCharges).minus(l.interestPaid).minus(l.principalPaid);
      return {periodId: r.periodId, closingAvailable: new D(r.closingAvailable).plus(overlay).toDecimalPlaces(20).toFixed(), closingDebt: new D(r.closingDebt).plus(l.closingPrincipal).toDecimalPlaces(20).toFixed()};
    });
    // Minimum cash is measured at period ends from this proposal's draw on.
    const low = rows.slice(draw).reduce((m, r) => (new D(r.closingAvailable).lt(m.closingAvailable) ? r : m));
    const serviceByYear: Record<string, string> = {};
    input.periods.forEach((p, i) => {const y = p.endDate.slice(0, 4); serviceByYear[y] = new D(serviceByYear[y] ?? 0).plus(flows[i]!.interestPaid).plus(flows[i]!.principal).toFixed();});
    const covenant = projectLeverageCovenant(rows.map((r, i) => ({period: r.periodId, ebitda: input.periods[i]!.ebitda, leasePayments: input.periods[i]!.leasePayments,
      closingDebt: r.closingDebt, closingAvailableCash: r.closingAvailable})), {...proposal.covenant, history: input.covenantHistory});
    const last = rows.at(-1)!;
    return {
      id: proposal.id, label: proposal.label,
      equivalentSpread: cost.status === "calculated" ? cost.annualSpread : null, costStatus: cost.status,
      weightedAverageLifeYears: schedule.weightedAverageLifeYears,
      drawPeriodId: input.periods[draw]!.id,
      minimumCash: {amount: low.closingAvailable, periodId: low.periodId},
      debtServiceByYear: serviceByYear,
      covenant: {name: proposal.covenant.name, limit: covenant.limit, worst: covenant.worst, allComply: covenant.allComply, rows: covenant.rows},
      collateralConsumed: new D(proposal.collateralConsumed).toFixed(), freeReceivablesAfter: pool.minus(proposal.collateralConsumed).toFixed(),
      horizonFinancingCost: flows.reduce((t, f) => t.plus(f.interestPaid).plus(f.allCharges), new D(0)).toFixed(),
      netDebtAtHorizon: new D(last.closingDebt).minus(last.closingAvailable).toFixed(),
      taxesInHorizon: taxes.totalCashTax,
      periods: rows.map((r, i) => ({periodId: r.periodId, closingAvailable: r.closingAvailable, closingDebt: r.closingDebt, cashTax: taxes.rows[i]!.cashTax,
        proposalInterestAccrued: ledger[i]!.interestAccrued.toDecimalPlaces(20).toFixed(), proposalInterestPaid: ledger[i]!.interestPaid.toDecimalPlaces(20).toFixed(),
        proposalPrincipalPaid: ledger[i]!.principalPaid.toDecimalPlaces(20).toFixed()})),
    };
  });
  return {schemaVersion: "financing-proposal-comparison.v2" as const, engineVersion: financingProposalComparisonVersion, operands: input, currency: input.currency,
    openingDate: input.openingDate, endDate: input.endDate, proposals,
    exclusions: ["firmness_and_validity", "prepayment_terms", "reciprocity", "restricted_accounts", "choice_of_counterparty", "intraperiod_liquidity"] as const};
}
