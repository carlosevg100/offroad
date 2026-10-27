import Decimal from "decimal.js";
import {brazilianBusinessDays} from "./business-day-calendar";
import {measureCovenantHeadroom, type CovenantLimit, type CovenantMeasurement} from "./covenant-headroom";
import {buildDeferredFinancingSchedule, solveEquivalentFinancingSpread, type DeferredFinancingScheduleInput} from "./equivalent-financing-cost";
import {proposalCompanyLedger} from "./financing-proposal-comparison";
import {calculateRelativeDebtCostBridge} from "./relative-debt-cost";

export const receivedProposalVersion = "2026.10.27-v1";
const Exact = Decimal.clone({precision: 60, rounding: Decimal.ROUND_HALF_UP});
const out = (v: Decimal) => v.toDecimalPlaces(20).toFixed();
const eight = (v: Decimal) => v.toDecimalPlaces(8, Decimal.ROUND_HALF_UP);

/** The terms of the proposal that shape its schedule and its collateral. A variant changes only these. */
export type ReceivedProposalStructure = {
  graceMonths: number; installments: number; coverage: string; restrictedAccount: boolean;
};
export type ReceivedProposalTerms = ReceivedProposalStructure & {
  lender: string; indexer: "cdi_plus" | "percent_of_cdi" | "ipca_plus" | "fixed"; firmness: "indicative" | "committed"; termSheetDate: string; validityDays: number;
  amount: string; annualSpread: string; feeRate: string;
  /** Draw date and the day of the month of every payment; payments are not moved to business days. */
  drawDate: string; paymentDay: number;
  /** Months between principal installments and between interest payments; interest is also paid on every installment. */
  installmentEveryMonths: number; interestEveryMonths: number; amortization: "sac" | "bullet";
  collateralKind: "receivables_assignment" | "financed_asset" | "other_asset" | "none";
  /** The lender's covenant, when the term sheet has one; its definition may be stated or not. */
  covenant: {maximumRatio: string; testDates: readonly string[]; definition: "same_as_indenture" | "not_stated"} | null;
  prepayment: {penaltyRate: string; penaltyMonths: number};
  reciprocity: "none_stated" | "stated";
  bankSawIndenture: boolean;
};
export type ReceivedProposalUse = {id: string; label: string; amount: string;
  kind: "seasonal_working_capital" | "long_lived_capex" | "refinancing" | "other"; tenorMinYears: string; tenorMaxYears: string};
export type ReceivedProposalBucket = {id: string; label: string; amount: string; contract: "assignable" | "prohibited_without_consent";
  encumbrance: "free" | "assigned"; holder: string | null; pastDue: boolean; countsAgainstBasket: boolean};
export type ReceivedProposalInput = {
  currency: string; readingDate: string; needDate: string;
  proposal: ReceivedProposalTerms;
  creditTax: {fixedRate: string; dailyRate: string; maxDays: number};
  /** Annual index by calendar year; the last year applies to every later year. */
  indexCurve: readonly {year: number; annualRate: string}[];
  /** Regime, rate in [0, 1] and whether periods after the calendar are taxable: an adopted hypothesis, or null when nobody stated it. */
  tax: {regime: "lucro_real" | "lucro_presumido" | "unknown"; rate: string; taxableAfterCalendar: boolean | null};
  uses: readonly ReceivedProposalUse[];
  seasonalPeak: string | null;
  /** The company without the proposal, by period, from the adopted projection and debt table. */
  calendar: {openingDate: string; periodEnds: readonly string[]; existingService: readonly string[]; availableForService: readonly string[];
    closingCash: readonly string[]; taxable: readonly boolean[]; minimumCash: string | null};
  covenant: {indenture: {maximumRatio: string; testDates: readonly string[]; source: string};
    policy: {maximumRatio: string; testDates: readonly string[]; source: string} | null;
    /** Each test without the proposal: debt, cash, reported trailing EBITDA and what the written definition deducts. */
    /** Every scenario the covenant must be read in; each in-force test date in the horizon is required in each. */
    requiredScenarios: readonly string[];
    measurements: readonly {date: string; scenario: string; debt: string; cash: string; reportedEbitda: string; definitionAdjustment: string}[]};
  portfolio: readonly ReceivedProposalBucket[];
  /** The indenture's basket for new liens: its limit, whether it is aggregate or per operation, and what is already in it. */
  basket: {limit: string; basis: "aggregate" | "per_operation"; occupied: string; consentLeadDaysMin: number; consentLeadDaysMax: number};
  collateralReference: {coverageLow: string; coverageHigh: string};
  market: {comparable: boolean; low: string; median: string; high: string; sample: number; confidence: "high" | "moderate" | "low"; observedOn: string} | null;
  history: {label: string; spread: string; date: string;
    adjustments: readonly {id: string; family: "pricing_date" | "tenor" | "guarantee" | "instrument_distribution" | "scale" | "other"; bps: string; anchor: string}[]} | null;
  variants: readonly (ReceivedProposalStructure & {id: string; label: string})[];
  alternatives: readonly {id: string; label: string; allInSpread: string | null; collateral: string; usesCovered: readonly string[];
    monthsToMoneyMin: number; monthsToMoneyMax: number}[];
};

const isoDate = (v: string) => {
  if (typeof v !== "string" || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(v) || new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) !== v) throw new Error("received_proposal_invalid_date");
  return v;
};
const num = (v: string, signed = false) => {
  if (typeof v !== "string" || !/^-?\d{1,24}(?:\.\d{1,20})?$/.test(v)) throw new Error("received_proposal_invalid_amount");
  const d = new Exact(v); if (!signed && d.lt(0)) throw new Error("received_proposal_negative_amount"); return d;
};
const int = (v: number, min: number, max: number) => {if (!Number.isInteger(v) || v < min || v > max) throw new Error("received_proposal_invalid_count"); return v;};
const shiftDays = (d: string, n: number) => {const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10);};
const daysBetween = (a: string, b: string) => (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000;
const monthAfter = (d: string, months: number, day: number) => {
  const x = new Date(`${d}T00:00:00Z`);
  return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + months, day)).toISOString().slice(0, 10);
};

/** The proposal over its life on its contract dates: monthly grid of payments, SAC or bullet principal,
 * interest on every interest month and on every installment, the CDI by business days of the national
 * calendar over 252 with intervals split on 1 January where the curve changes; credit tax as the fixed
 * rate on the amount plus the daily rate on each installment for the calendar days from the draw to its
 * payment, capped; fee and tax withheld at the draw. Cost by the published equivalent-spread engine. */
export function buildReceivedProposalSchedule(terms: ReceivedProposalTerms, structure: ReceivedProposalStructure, input: Pick<ReceivedProposalInput, "currency" | "creditTax" | "indexCurve">) {
  const amount = num(terms.amount), draw = isoDate(terms.drawDate);
  if (!amount.gt(0)) throw new Error("received_proposal_amount_not_positive");
  if (terms.indexer !== "cdi_plus") throw new Error("received_proposal_indexer_unsupported");
  int(terms.paymentDay, 1, 28); int(structure.graceMonths, 0, 120); int(structure.installments, 1, 360);
  int(terms.installmentEveryMonths, 1, 12); int(terms.interestEveryMonths, 1, 12);
  if (terms.amortization === "bullet" && structure.installments !== 1) throw new Error("received_proposal_bullet_single_installment");
  if (terms.amortization !== "sac" && terms.amortization !== "bullet") throw new Error("received_proposal_amortization_unsupported");
  const months = structure.graceMonths + structure.installments * terms.installmentEveryMonths;
  if (months > 360) throw new Error("received_proposal_term_too_long");
  const curve = [...input.indexCurve].sort((a, b) => a.year - b.year);
  if (!curve.length || new Set(curve.map(c => c.year)).size !== curve.length) throw new Error("received_proposal_index_curve");
  const indexOf = (year: number) => {
    const c = curve.filter(x => x.year <= year).at(-1); if (!c) throw new Error("received_proposal_index_curve_not_covering"); return num(c.annualRate, true).toFixed();
  };
  // Equal principal, the last installment absorbing rounding at eight decimals.
  const share = eight(amount.div(structure.installments));
  const principalAt = new Map<number, Decimal>();
  for (let j = 1; j <= structure.installments; j++) principalAt.set(structure.graceMonths + j * terms.installmentEveryMonths,
    j === structure.installments ? amount.minus(share.mul(structure.installments - 1)) : share);
  const periods: DeferredFinancingScheduleInput["periods"] = [];
  let from = draw, iofDaily = new Exact(0);
  const tax = {fixed: num(input.creditTax.fixedRate), daily: num(input.creditTax.dailyRate), cap: int(input.creditTax.maxDays, 0, 3660)};
  for (let m = 1; m <= months; m++) {
    const principal = principalAt.get(m);
    const pays = m % terms.interestEveryMonths === 0 || principal !== undefined || m === months;
    if (!pays) continue;
    const pay = monthAfter(draw, m, terms.paymentDay);
    if (pay <= from) throw new Error("received_proposal_payment_before_draw");
    // Split on 1 January where the curve changes; a piece with no business day is not cut.
    for (let cut = from; cut < pay;) {
      const jan = `${Number(cut.slice(0, 4)) + 1}-01-01`;
      const end = jan < pay && brazilianBusinessDays(cut, jan) > 0 && brazilianBusinessDays(jan, pay) > 0 ? jan : pay, bd = brazilianBusinessDays(cut, end);
      if (bd === 0) throw new Error("received_proposal_interval_without_business_days");
      const last = end === pay;
      periods.push({id: `m${m}${last ? "" : "-a"}`, startDate: cut, endDate: end, yearFraction: out(new Exact(bd).div(252)), annualIndex: indexOf(Number(cut.slice(0, 4))),
        yearFractionConvention: "business_days_252", businessDays: bd, sourceAnchor: `received-proposal:month-${m}`,
        scheduledPrincipal: last && principal ? principal.toFixed() : "0", paysAccruedInterest: last});
      cut = end;
    }
    if (principal) iofDaily = iofDaily.plus(principal.mul(tax.daily).mul(Math.min(tax.cap, daysBetween(draw, pay))));
    from = pay;
  }
  const iof = amount.mul(tax.fixed).plus(iofDaily), fee = amount.mul(num(terms.feeRate)), upfront = iof.plus(fee);
  const scheduleInput: DeferredFinancingScheduleInput = {baseDate: draw, currency: input.currency, moneyUnit: "currency_unit", grossAdvance: amount.toFixed(),
    upfrontWithheldCosts: out(upfront), annualSpread: num(terms.annualSpread, true).toFixed(), unpaidInterestBase: "principal_plus_accrued", periods};
  const schedule = buildDeferredFinancingSchedule(scheduleInput);
  const cost = solveEquivalentFinancingSpread({baseDate: draw, currency: input.currency, moneyUnit: "currency_unit",
    intervals: periods.map(({scheduledPrincipal: _p, paysAccruedInterest: _i, ...p}) => p), netFlows: schedule.netFlows,
    costInventory: [
      {category: "origination_fee", status: fee.gt(0) ? "specified" : "zero", reason: "Fee of the term sheet"},
      {category: "recurring_fee", status: "zero", reason: "No recurring fee in the term sheet"},
      {category: "tax", status: iof.gt(0) ? "specified" : "zero", reason: "Credit tax by the adopted rule"},
      {category: "other", status: "zero", reason: "Reciprocity is read apart, never priced here"}],
    convention: "multiplicative_index_and_spread_on_net_borrower_flows", lowerSpread: "0", upperSpread: "1"});
  if (cost.status !== "calculated") throw new Error("received_proposal_cost_not_solved");
  const serviceByYear = new Map<number, Decimal>();
  for (const r of schedule.rows) {
    const y = Number(r.endDate.slice(0, 4));
    serviceByYear.set(y, (serviceByYear.get(y) ?? new Exact(0)).plus(r.interestPaid).plus(r.principalPaid));
  }
  return {scheduleInput, schedule, months, iof, fee, upfront, equivalentSpread: new Exact(cost.annualSpread!), cost,
    weightedAverageLifeYears: new Exact(schedule.weightedAverageLifeYears), finalPaymentDate: schedule.finalPaymentDate,
    serviceByYear, collateralAtDraw: amount.mul(num(structure.coverage))};
}

/** Whether the net cost by the full-deduction convention can be stated for one structure: lucro real, every company
 * period that overlaps its life (draw to final payment) taxable, and, when the life runs past the calendar, the
 * adopted hypothesis that later periods are taxable. A period after the final payment never counts. */
export function receivedProposalNetConvention(tax: ReceivedProposalInput["tax"], periods: readonly {startDate: string; endDate: string; taxable: boolean}[],
  drawDate: string, finalPaymentDate: string) {
  if (tax.regime === "unknown") return "regime_unknown" as const;
  if (tax.regime === "lucro_presumido") return "no_deduction_presumido" as const;
  const life = periods.filter(q => q.endDate >= drawDate && q.startDate <= finalPaymentDate);
  if (!life.every(q => q.taxable)) return "not_all_periods_taxable" as const;
  if (finalPaymentDate > periods.at(-1)!.endDate) return tax.taxableAfterCalendar === true ? "full_deductibility_simplified" as const
    : tax.taxableAfterCalendar === false ? "not_all_periods_taxable" as const : "life_beyond_fiscal_calendar" as const;
  return "full_deductibility_simplified" as const;
}

function validate(input: ReceivedProposalInput) {
  // A tax rate outside [0, 1] is refused before any benefit, cash or covenant is computed.
  const rate = num(input.tax.rate, true); if (rate.lt(0) || rate.gt(1)) throw new Error("received_proposal_tax_rate_out_of_domain");
  if (!/^[A-Z]{3}$/.test(input.currency)) throw new Error("received_proposal_invalid_currency");
  [input.readingDate, input.needDate, input.proposal.termSheetDate, input.calendar.openingDate].forEach(isoDate);
  const c = input.calendar, n = c.periodEnds.length;
  if (!n || n > 40) throw new Error("received_proposal_calendar_count");
  c.periodEnds.forEach((e, i) => {isoDate(e); if (e <= (i ? c.periodEnds[i - 1]! : c.openingDate)) throw new Error("received_proposal_calendar_order");});
  for (const series of [c.existingService, c.availableForService, c.closingCash, c.taxable] as readonly (readonly unknown[])[]) if (series.length !== n) throw new Error("received_proposal_calendar_series_length");
  c.existingService.forEach(v => num(v)); c.availableForService.forEach(v => num(v, true)); c.closingCash.forEach(v => num(v, true));
  if (c.minimumCash !== null) num(c.minimumCash);
  if (input.proposal.drawDate <= c.openingDate || input.proposal.drawDate > c.periodEnds.at(-1)!) throw new Error("received_proposal_draw_outside_calendar");
  if (input.readingDate > input.proposal.drawDate) throw new Error("received_proposal_reading_after_draw");
  if (!input.uses.length || input.uses.length > 8 || new Set(input.uses.map(u => u.id)).size !== input.uses.length) throw new Error("received_proposal_uses");
  for (const u of input.uses) if (!num(u.amount).gt(0) || num(u.tenorMinYears).gt(num(u.tenorMaxYears))) throw new Error("received_proposal_use_terms");
  if (!input.portfolio.length || input.portfolio.length > 12 || new Set(input.portfolio.map(b => b.id)).size !== input.portfolio.length) throw new Error("received_proposal_portfolio");
  for (const b of input.portfolio) {
    num(b.amount);
    // An assigned bucket names its holder, and only an assigned bucket can occupy the basket.
    if ((b.encumbrance === "assigned") !== (b.holder !== null)) throw new Error("received_proposal_encumbrance_holder");
    if (b.countsAgainstBasket && b.encumbrance !== "assigned") throw new Error("received_proposal_basket_flag_on_free_bucket");
  }
  const basket = input.basket;
  if (!num(basket.limit).gt(0)) throw new Error("received_proposal_basket_limit");
  int(basket.consentLeadDaysMin, 0, 365); int(basket.consentLeadDaysMax, basket.consentLeadDaysMin, 365);
  // What the portfolio shows assigned under the basket must be in the basket: an exception read as empty is refused.
  const assignedInBasket = input.portfolio.filter(b => b.countsAgainstBasket).reduce((s, b) => s.plus(b.amount), new Exact(0));
  if (num(basket.occupied).lt(assignedInBasket)) throw new Error("received_proposal_basket_usage_understated");
  if (num(basket.occupied).gt(basket.limit) && basket.basis === "aggregate") throw new Error("received_proposal_basket_overfull");
  if (num(input.collateralReference.coverageLow).gt(input.collateralReference.coverageHigh)) throw new Error("received_proposal_collateral_reference");
  if (input.market) {
    const m = input.market;
    if (!(num(m.low).lte(m.median) && num(m.median).lte(m.high))) throw new Error("received_proposal_market_range");
    int(m.sample, 1, 10000); isoDate(m.observedOn);
  }
  if (input.variants.length > 4 || new Set(input.variants.map(v => v.id)).size !== input.variants.length) throw new Error("received_proposal_variants");
  if (input.alternatives.length > 4 || new Set(input.alternatives.map(a => a.id)).size !== input.alternatives.length) throw new Error("received_proposal_alternatives");
  const useIds = new Set(input.uses.map(u => u.id));
  for (const a of input.alternatives) {
    num(a.collateral); if (a.allInSpread !== null) num(a.allInSpread, true);
    int(a.monthsToMoneyMin, 0, 120); int(a.monthsToMoneyMax, a.monthsToMoneyMin, 120);
    if (!a.usesCovered.length || a.usesCovered.some(u => !useIds.has(u))) throw new Error("received_proposal_alternative_uses");
  }
  const p = input.proposal;
  int(p.validityDays, 1, 365); int(p.prepayment.penaltyMonths, 0, 360); num(p.prepayment.penaltyRate);
  if (p.collateralKind === "none" && num(p.coverage).gt(0)) throw new Error("received_proposal_collateral_kind");
  const scenarios = input.covenant.requiredScenarios;
  if (!scenarios.length || scenarios.length > 4 || new Set(scenarios).size !== scenarios.length) throw new Error("received_proposal_covenant_scenarios");
  if (input.covenant.measurements.some(m => !scenarios.includes(m.scenario))) throw new Error("received_proposal_covenant_scenario_undeclared");
  if (new Set(input.covenant.measurements.map(m => `${m.date}|${m.scenario}`)).size !== input.covenant.measurements.length) throw new Error("received_proposal_covenant_duplicate_test");
  // No test at all is allowed: it becomes gaps, never an error and never compliance.
  if (input.covenant.measurements.length > 12) throw new Error("received_proposal_covenant_measurements");
  for (const m of input.covenant.measurements) if (!c.periodEnds.includes(m.date)) throw new Error("received_proposal_covenant_date_off_calendar");
  if (input.seasonalPeak !== null) num(input.seasonalPeak);
}

/**
 * One received proposal against the company that would take it: its cost over its life (fee, credit
 * tax and the dated curve, by the published equivalent-spread engine), its service in the company's
 * calendar and the minimum cash with it, its fit with each use of the money, the covenant with it on
 * the indenture's definition, the lender's and the board's, the collateral it asks for against the
 * portfolio that can actually be assigned and against the indenture's basket for new liens, its spread
 * against the adopted market range and against the company's own last operation (published bridge),
 * and the same figures for each variant the company could ask for. Composes published kernels; it
 * decides nothing and contacts no one.
 */
export function evaluateReceivedProposal(input: ReceivedProposalInput) {
  validate(input);
  const p = input.proposal, c = input.calendar, amount = num(p.amount);
  const received = buildReceivedProposalSchedule(p, p, input);
  // Company periods: each ends on its period end and starts the day after the previous one.
  const periods = c.periodEnds.map((e, i) => ({startDate: shiftDays(i ? c.periodEnds[i - 1]! : c.openingDate, 1), endDate: e}));
  const ledger = proposalCompanyLedger(received.scheduleInput, periods);
  const drawIndex = ledger.findIndex(l => l.draw !== "0");
  const taxRate = num(input.tax.rate), shieldApplies = input.tax.regime === "lucro_real";
  let cumulative = new Exact(0);
  const quarters = c.periodEnds.map((e, i) => {
    const l = ledger[i]!, upfront = i === drawIndex ? received.upfront : new Exact(0);
    const shield = shieldApplies && c.taxable[i] ? taxRate.mul(l.interestAccrued.plus(upfront)) : new Exact(0);
    const flow = new Exact(l.draw).minus(upfront).minus(l.interestPaid).minus(l.principalPaid).plus(shield);
    cumulative = cumulative.plus(flow);
    const existing = num(c.existingService[i]!), proposalService = l.interestPaid.plus(l.principalPaid);
    return {periodEnd: e, existingService: out(existing), proposalService: out(proposalService), totalService: out(existing.plus(proposalService)),
      availableForService: out(num(c.availableForService[i]!, true)), proposalCashFlow: out(flow), taxShield: out(shield),
      closingCashWithout: out(num(c.closingCash[i]!, true)), closingCashWith: out(num(c.closingCash[i]!, true).plus(cumulative)),
      proposalPrincipal: out(l.closingPrincipal), cumulativeProposalCash: out(cumulative)};
  });
  const years = [...new Set(c.periodEnds.map(e => Number(e.slice(0, 4))))].map(year => {
    const rows = quarters.filter(q => Number(q.periodEnd.slice(0, 4)) === year), sum = (k: "existingService" | "proposalService" | "availableForService") => rows.reduce((s, r) => s.plus(r[k]), new Exact(0));
    const existing = sum("existingService"), proposal = sum("proposalService"), available = sum("availableForService");
    return {year, periods: rows.length, existingService: out(existing), proposalService: out(proposal), totalService: out(existing.plus(proposal)),
      availableForService: out(available), shortfallWithout: out(existing.minus(available)), shortfallWith: out(existing.plus(proposal).minus(available))};
  });
  // The year that concentrates service is the one with the most existing service; ties keep the earlier year.
  const peak = years.reduce((a, b) => new Exact(b.existingService).gt(a.existingService) ? b : a);
  const peakQuarter = quarters.reduce((a, b) => new Exact(b.totalService).gt(a.totalService) ? b : a);
  const low = (key: "closingCashWithout" | "closingCashWith") => quarters.slice(drawIndex).reduce((a, b) => new Exact(b[key]).lt(a[key]) ? b : a);
  const minimumCash = c.minimumCash === null ? null : num(c.minimumCash);
  const below = (key: "closingCashWithout" | "closingCashWith") => minimumCash === null ? [] : quarters.slice(drawIndex).filter(q => new Exact(q[key]).lt(minimumCash)).map(q => q.periodEnd);

  // Collateral: what is asked, against the portfolio that can be assigned and against the indenture's basket.
  const gross = input.portfolio.reduce((s, b) => s.plus(b.amount), new Exact(0));
  const buckets = input.portfolio.map(b => {
    const reasons = [...(b.encumbrance === "assigned" ? ["assigned_to_other_creditor" as const] : []),
      ...(b.contract === "prohibited_without_consent" ? ["assignment_prohibited_without_debtor_consent" as const] : []), ...(b.pastDue ? ["past_due" as const] : [])];
    return {id: b.id, label: b.label, amount: out(num(b.amount)), holder: b.holder, assignable: reasons.length === 0, reasons};
  });
  const sumOf = (f: (b: typeof buckets[number]) => boolean) => buckets.filter(f).reduce((s, b) => s.plus(b.amount), new Exact(0));
  const assigned = sumOf(b => b.reasons.includes("assigned_to_other_creditor")), assignable = sumOf(b => b.assignable);
  const collateralUsesReceivables = p.collateralKind === "receivables_assignment";
  const usesBasket = p.collateralKind === "receivables_assignment" || p.collateralKind === "other_asset";
  const basketRemaining = input.basket.basis === "aggregate" ? Exact.max(num(input.basket.limit).minus(input.basket.occupied), 0) : num(input.basket.limit);
  const collateralView = (required: Decimal) => ({
    required: out(required),
    shortfallToAssignable: collateralUsesReceivables ? out(Exact.max(required.minus(assignable), 0)) : null,
    assignableLeftAfter: collateralUsesReceivables ? out(Exact.max(assignable.minus(required), 0)) : null,
    consentRequired: usesBasket && required.gt(basketRemaining), excessOverBasket: usesBasket ? out(Exact.max(required.minus(basketRemaining), 0)) : null,
  });
  const receivedCollateral = collateralView(received.collateralAtDraw);
  const consentFrom = shiftDays(input.readingDate, input.basket.consentLeadDaysMin), consentBy = shiftDays(input.readingDate, input.basket.consentLeadDaysMax);

  // Covenant: each adopted test with and without the proposal, through the published headroom kernel.
  const limits: CovenantLimit[] = [
    {id: "indenture", label: "Escritura vigente", kind: "contractual", status: "in_force", maximumRatio: input.covenant.indenture.maximumRatio,
      source: input.covenant.indenture.source, testDates: [...input.covenant.indenture.testDates]},
    ...(p.covenant ? [{id: "proposal", label: `Proposta ${p.lender}`, kind: "contractual" as const, status: "in_force" as const, maximumRatio: p.covenant.maximumRatio,
      // One temporal rule for the lender: a date before the draw is never one of its tests, anywhere below.
      source: "Term sheet", testDates: p.covenant.testDates.filter(d => d >= p.drawDate)}] : []),
    ...(input.covenant.policy ? [{id: "board-policy", label: "Política do conselho", kind: "board_policy" as const, status: "in_force" as const,
      maximumRatio: input.covenant.policy.maximumRatio, source: input.covenant.policy.source, testDates: [...input.covenant.policy.testDates]}] : []),
  ];
  // Coverage first: each in-force limit's test dates inside the horizon (the lender's from the draw on), in every
  // required scenario. A missing test is never read as compliance, and a limit with no test at all is carried to
  // the headroom kernel as untested (never as a test), so the gaps form instead of an error.
  const horizonEnd = c.periodEnds.at(-1)!;
  const requiredDates = [...new Set(limits.flatMap(l => l.testDates.filter(d => d <= horizonEnd && d > c.openingDate)))].sort();
  const required = requiredDates.flatMap(date => input.covenant.requiredScenarios.map(scenario => ({date, scenario})));
  const missingTests = required.filter(r => !input.covenant.measurements.some(m => m.date === r.date && m.scenario === r.scenario));
  const untestedLimits = limits.filter(l => !input.covenant.measurements.some(m => l.testDates.includes(m.date))).map(l => l.id);
  for (const l of limits) if (untestedLimits.includes(l.id)) l.status = "superseded";
  const measurements: CovenantMeasurement[] = input.covenant.measurements.flatMap((m, k) => {
    const q = quarters[c.periodEnds.indexOf(m.date)]!, limitIds = limits.filter(l => l.testDates.includes(m.date)).map(l => l.id);
    const base = {date: m.date, scenario: m.scenario, reportedEbitda: m.reportedEbitda, unrealizedEbitda: null, limitIds,
      adjustments: [{label: "Ajuste da definição escrita", amount: m.definitionAdjustment}]};
    return [{...base, id: `with-${k}`, label: `Com a proposta, ${m.scenario}, ${m.date}`, role: limitIds.length ? "test" as const : "contrast" as const,
      debt: out(num(m.debt).plus(q.proposalPrincipal)), cash: out(num(m.cash, true).plus(q.cumulativeProposalCash))},
    {...base, id: `without-${k}`, label: `Sem a proposta, ${m.scenario}, ${m.date}`, role: "contrast" as const, debt: m.debt, cash: m.cash}];
  });
  const headroom = measurements.length === 0 ? null : measureCovenantHeadroom({currency: input.currency, readingDate: input.readingDate, limits, measurements,
    effects: input.covenant.measurements.map((_, k) => ({id: `proposal-${k}`, label: "Efeito da proposta", measurementId: `with-${k}`, withoutEffectMeasurementId: `without-${k}`}))});
  const covenantRows = input.covenant.measurements.map((m, k) => {
    const w = headroom!.measurements.find(x => x.id === `with-${k}`)!, wo = headroom!.measurements.find(x => x.id === `without-${k}`)!;
    return {date: m.date, scenario: m.scenario, ratioWithout: wo.ratio, ratioWith: w.ratio,
      limits: limits.map(l => ({limitId: l.id, kind: l.kind, maximumRatio: out(num(l.maximumRatio)), testedOnDate: l.testDates.includes(m.date) && !untestedLimits.includes(l.id),
        headroomWith: w.ratio === null ? null : out(num(l.maximumRatio).minus(w.ratio)), breachedWith: w.ratio === null ? true : new Exact(w.ratio).gt(l.maximumRatio)}))};
  });
  const testsPerYear = (dates: readonly string[]) => {const y = new Map<string, number>(); dates.forEach(d => y.set(d.slice(0, 4), (y.get(d.slice(0, 4)) ?? 0) + 1)); return Math.max(0, ...y.values());};

  // Price: nominal spread against the adopted range when it is comparable; cost over the life apart.
  const spread = num(p.annualSpread, true);
  const market = input.market && input.market.comparable ? (() => {
    const m = input.market, low = num(m.low), median = num(m.median), high = num(m.high);
    return {position: spread.lt(low) ? "below_range" as const : spread.lte(median) ? "at_or_below_median" as const : spread.lte(high) ? "above_median_within_range" as const : "above_range" as const,
      toMedianBps: out(spread.minus(median).mul(10000)), toHighBps: out(spread.minus(high).mul(10000)), low: out(low), median: out(median), high: out(high),
      sample: m.sample, confidence: m.confidence, observedOn: m.observedOn};
  })() : null;
  // Net cost by the simplified convention: the spread reduced by the tax rate, assuming the interest, fee and
  // credit tax are fully deducted when paid. It holds only under lucro real with every period of the life
  // inside the horizon taxable; otherwise it is not stated and the condition is named.
  // Each structure on its own life, from its draw to its final payment, and never past it.
  const netOf = (gross: Decimal, finalPaymentDate: string) => {
    const netConvention = receivedProposalNetConvention(input.tax, periods.map((q, i) => ({...q, taxable: c.taxable[i]!})), p.drawDate, finalPaymentDate);
    return {netConvention, net: netConvention === "full_deductibility_simplified" ? out(gross.mul(new Exact(1).minus(taxRate))) : netConvention === "no_deduction_presumido" ? out(gross) : null};
  };
  const receivedNet = netOf(received.equivalentSpread, received.finalPaymentDate);
  const history = input.history ? calculateRelativeDebtCostBridge({ownSpreadBps: out(spread.mul(10000)), peerSpreadBps: out(num(input.history.spread, true).mul(10000)),
    pricingBasis: "same_indexer_quoted_spread", ownIndexer: "CDI", peerIndexer: "CDI", curveVersion: null, coverage: "complete_scoped_bridge",
    adjustments: input.history.adjustments.map(a => ({id: a.id, family: a.family, bps: a.bps, evidenceAnchor: a.anchor, methodologyVersion: receivedProposalVersion, independentEffectGroup: a.id}))}) : null;

  // Fit: each use against the proposal's life; the amount against the sum of the uses.
  const life = received.weightedAverageLifeYears, finalYears = new Exact(daysBetween(p.drawDate, received.finalPaymentDate)).div(365);
  const uses = input.uses.map(u => ({id: u.id, label: u.label, kind: u.kind, amount: out(num(u.amount)), share: out(num(u.amount).div(amount)),
    tenorMinYears: out(num(u.tenorMinYears)), tenorMaxYears: out(num(u.tenorMaxYears)),
    reading: life.gt(u.tenorMaxYears) ? "longer_than_use" as const : finalYears.lt(u.tenorMinYears) ? "shorter_than_use" as const : "within_use" as const}));
  const usesTotal = input.uses.reduce((s, u) => s.plus(u.amount), new Exact(0));

  const peakYearOf = (byYear: Map<number, Decimal>) => out(byYear.get(peak.year) ?? new Exact(0));
  const variants = input.variants.map(v => {
    const s = buildReceivedProposalSchedule(p, v, input), col = collateralView(s.collateralAtDraw);
    return {id: v.id, label: v.label, graceMonths: v.graceMonths, installments: v.installments, coverage: out(num(v.coverage)), restrictedAccount: v.restrictedAccount,
      equivalentSpread: out(s.equivalentSpread), equivalentSpreadNet: netOf(s.equivalentSpread, s.finalPaymentDate).net, netConvention: netOf(s.equivalentSpread, s.finalPaymentDate).netConvention, weightedAverageLifeYears: out(s.weightedAverageLifeYears),
      finalPaymentDate: s.finalPaymentDate, upfrontCosts: out(s.upfront), peakYearService: peakYearOf(s.serviceByYear), collateral: col,
      deltas: {equivalentSpreadBps: out(s.equivalentSpread.minus(received.equivalentSpread).mul(10000)),
        peakYearService: out(new Exact(peakYearOf(s.serviceByYear)).minus(peakYearOf(received.serviceByYear))),
        collateral: out(s.collateralAtDraw.minus(received.collateralAtDraw))}};
  });
  const alternatives = input.alternatives.map(a => ({id: a.id, label: a.label, usesCovered: [...a.usesCovered], allInSpread: a.allInSpread === null ? null : out(num(a.allInSpread, true)),
    allInSpreadDifferenceBps: a.allInSpread === null ? null : out(num(a.allInSpread, true).minus(received.equivalentSpread).mul(10000)),
    collateral: out(num(a.collateral)), consentRequired: num(a.collateral).gt(basketRemaining), monthsToMoney: {min: a.monthsToMoneyMin, max: a.monthsToMoneyMax}}));

  const firstCovenantDate = p.covenant?.testDates[0] ?? null;
  return {schemaVersion: "received-proposal.v1" as const, version: receivedProposalVersion, currency: input.currency, readingDate: input.readingDate, needDate: input.needDate,
    proposal: {lender: p.lender, firmness: p.firmness, validUntil: shiftDays(p.termSheetDate, p.validityDays), amount: out(amount), annualSpread: out(spread),
      drawDate: p.drawDate, months: received.months, finalPaymentDate: received.finalPaymentDate, bankSawIndenture: p.bankSawIndenture,
      prepaymentPenaltyRate: out(num(p.prepayment.penaltyRate)), prepaymentFreeFrom: monthAfter(p.drawDate, p.prepayment.penaltyMonths, Number(p.drawDate.slice(8, 10))),
      reciprocity: p.reciprocity, covenantDefinition: p.covenant?.definition ?? null, firstLenderTestDate: firstCovenantDate},
    cost: {fee: out(received.fee), creditTax: out(received.iof), creditTaxRate: out(received.iof.div(amount)), upfrontCosts: out(received.upfront),
      upfrontShare: out(received.upfront.div(amount)), weightedAverageLifeYears: out(life), equivalentSpread: out(received.equivalentSpread),
      equivalentSpreadNet: receivedNet.net, netConvention: receivedNet.netConvention, taxRegime: input.tax.regime, nominalToEquivalentBps: out(received.equivalentSpread.minus(spread).mul(10000)),
      serviceByYear: [...received.serviceByYear].map(([year, v]) => ({year, service: out(v)}))},
    calendar: {quarters, years, peakYear: peak.year, peakQuarter: {periodEnd: peakQuarter.periodEnd, totalService: peakQuarter.totalService},
      minimumCash: {policy: minimumCash === null ? null : out(minimumCash), without: {periodEnd: low("closingCashWithout").periodEnd, amount: low("closingCashWithout").closingCashWithout},
        with: {periodEnd: low("closingCashWith").periodEnd, amount: low("closingCashWith").closingCashWith}, belowPolicyWithout: below("closingCashWithout"), belowPolicyWith: below("closingCashWith")}},
    fit: {uses, seasonalShare: out(input.uses.filter(u => u.kind === "seasonal_working_capital").reduce((s, u) => s.plus(u.amount), new Exact(0)).div(amount)),
      amountMinusUses: out(amount.minus(usesTotal)), weightedAverageLifeYears: out(life), finalMaturityYears: out(finalYears)},
    collateral: {kind: p.collateralKind, coverage: out(num(p.coverage)), restrictedAccount: p.restrictedAccount, ...receivedCollateral,
      coverageReference: {low: out(num(input.collateralReference.coverageLow)), high: out(num(input.collateralReference.coverageHigh)),
        atOrAboveTop: num(p.coverage).gte(input.collateralReference.coverageHigh)},
      portfolio: {gross: out(gross), assigned: out(assigned), nominallyFree: out(gross.minus(assigned)), assignable: out(assignable), buckets},
      maxAmountOnAssignable: collateralUsesReceivables && num(p.coverage).gt(0) ? out(assignable.div(p.coverage)) : null,
      seasonalPeak: input.seasonalPeak === null ? null : out(num(input.seasonalPeak))},
    negativePledge: {applies: usesBasket, basis: input.basket.basis, limit: out(num(input.basket.limit)), occupied: out(num(input.basket.occupied)), remaining: out(basketRemaining),
      consentRequired: receivedCollateral.consentRequired, excess: receivedCollateral.excessOverBasket,
      maxCoverageWithoutConsent: usesBasket ? out(basketRemaining.div(amount)) : null,
      consentWindow: {from: consentFrom, by: consentBy, needDate: input.needDate, slackDays: daysBetween(consentBy, input.needDate)}},
    covenant: {rows: covenantRows, worst: headroom?.worst ?? null, required, missingTests, untestedLimits,
      lenderDatesBeforeDraw: p.covenant ? p.covenant.testDates.filter(d => d < p.drawDate) : [],
      // A breach found is a breach; without one, no conclusion while a required test is missing.
      anyBreachWith: headroom?.anyBreach ? true : missingTests.length ? null : false,
      testsPerYear: {indenture: testsPerYear(input.covenant.indenture.testDates), lender: p.covenant ? testsPerYear(p.covenant.testDates) : 0}},
    price: {market, history: history ? {peer: input.history!.label, peerDate: input.history!.date, observedBps: history.grossBps,
      expectedBps: history.knownAdjustmentsBps, residualBps: history.residualBps, steps: history.steps.map(s => ({id: s.id, family: s.family, bps: s.bps}))} : null},
    variants, alternatives,
    operands: {received: received.scheduleInput, headroom}};
}
export type ReceivedProposalEvaluation = ReturnType<typeof evaluateReceivedProposal>;
