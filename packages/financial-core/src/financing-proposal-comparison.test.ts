import Decimal from "decimal.js";
import {describe, expect, it} from "vitest";
import {compareFinancingProposals, proposalCompanyLedger, type DatedDebtInstrument, type DeferredFinancingScheduleInput,
  type FinancingCharge, type FinancingProposalComparisonInput, type ProposalUnderComparison} from "./index";

// Ficha C02 (fictitious company "Aurora"): three proposals for R$ 70 mi plugged into the company
// projection of ficha C32 without the packaging line. Expected values come from the independent
// Python oracle modelo_c02.py (resultados.json), never from this TypeScript.
const P = Decimal.clone({precision: 60});
const quarters = ["3T26", "4T26", "1T27", "2T27", "3T27", "4T27", "1T28", "2T28", "3T28", "4T28"];
const ends = ["2026-09-30", "2026-12-31", "2027-03-31", "2027-06-30", "2027-09-30", "2027-12-31", "2028-03-31", "2028-06-30", "2028-09-30", "2028-12-31"];
const starts = ["2026-07-01", ...ends.slice(0, -1).map((e) => {const d = new Date(`${e}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10);})];
const cdi = ["0.149", "0.149", "0.14", "0.14", "0.14", "0.14", "0.1275", "0.1275", "0.1275", "0.1275"];
const rate16 = (v: Decimal) => v.toDecimalPlaces(16, Decimal.ROUND_HALF_UP).toFixed();
const floating = (spread: string) => cdi.map((c) => rate16(new P(c).plus(1).mul(new P(spread).plus(1)).pow("0.25").minus(1)));
const fixed = (annual: string) => cdi.map(() => rate16(new P(annual).plus(1).pow("0.25").minus(1)));
const ebitdaBase = ["13.5", "14", "14", "14", "14.3", "14.3", "14.7", "14.7", "14.7", "14.7"];

function instrument(id: string, opening: string, rates: string[], o: {draw?: [number, string]; amort?: Record<number, string>; prepay?: Record<number, string>;
  pays?: number[]; base?: "opening_principal" | "average_principal"}): DatedDebtInstrument {
  return {instrumentId: id, currency: "BRL", openingPrincipal: opening, indexer: "none", indexationTreatment: "not_applicable",
    couponTreatment: o.pays ? "accrued_until_paid" : "cash_paid", couponBase: o.base ?? "opening_principal",
    drawdownAccount: "available", paymentAccount: "available",
    periods: quarters.map((period, q) => ({period, startDate: starts[q]!, endDate: ends[q]!, indexationRate: "0", couponRate: rates[q]!,
      drawdown: o.draw && o.draw[0] === q ? o.draw[1] : "0", scheduledPrincipal: o.amort?.[q] ?? "0", prepayment: o.prepay?.[q] ?? "0",
      repayAll: false, ...(o.pays ? {paysAccruedCoupon: o.pays.includes(q)} : {})}))};
}
const charge = (id: string, instrumentId: string, category: FinancingCharge["category"], q: number, amount: string): FinancingCharge =>
  ({id, economicId: id, instrumentId, category, period: quarters[q]!, date: starts[q]!, amount, treatment: "cash_paid", account: "available"});

const finameAmort = Object.fromEntries(quarters.map((_, q) => [q, new P(30).div(54).mul(3).toDecimalPlaces(8).toFixed()]));
const common: DatedDebtInstrument[] = [
  instrument("debenture-2021", "60", floating("0.024"), {amort: {1: "15", 3: "15", 5: "15", 7: "15"}, pays: [1, 3, 5, 7, 9]}),
  instrument("ccb-bradesco", "40", floating("0.026"), {prepay: {2: "40"}}),
  instrument("finame", "30", fixed("0.097"), {amort: finameAmort, base: "average_principal"}),
  instrument("giro-4T26", "0", floating("0.025"), {draw: [1, "17"], amort: {2: "17"}}),
  instrument("giro-4T27", "0", floating("0.020"), {draw: [5, "20"], amort: {6: "20"}}),
  instrument("giro-4T28", "0", floating("0.020"), {draw: [9, "20"]}),
];
const iof = (v: string) => new P(v).mul(new P("0.000082").mul(182).plus("0.0038")).toFixed();
const commonCharges = [
  charge("giro-4T26-fee", "giro-4T26", "origination_fee", 1, new P(17).mul("0.003").toFixed()), charge("giro-4T26-iof", "giro-4T26", "tax", 1, iof("17")),
  charge("giro-4T27-fee", "giro-4T27", "origination_fee", 5, new P(20).mul("0.003").toFixed()), charge("giro-4T27-iof", "giro-4T27", "tax", 5, iof("20")),
  charge("giro-4T28-fee", "giro-4T28", "origination_fee", 9, new P(20).mul("0.003").toFixed()), charge("giro-4T28-iof", "giro-4T28", "tax", 9, iof("20")),
  charge("bradesco-premium", "ccb-bradesco", "other", 2, "0.4"),
];

// Lifetime terms for equivalent cost, on the C02 quarterly convention (21 quarters from 1T27).
function lifetime(spread: string, upfront: string, amort: number[], semiannual: boolean): DeferredFinancingScheduleInput {
  let previous = "2026-12-31"; let repaid = new P(0);
  return {baseDate: previous, currency: "BRL", moneyUnit: "BRL million", grossAdvance: "70", upfrontWithheldCosts: upfront,
    annualSpread: spread, unpaidInterestBase: "principal_plus_accrued",
    periods: Array.from({length: 21}, (_, q) => {
      const end = new Date(Date.UTC(2027 + Math.floor(q / 4), (q % 4 + 1) * 3, 0)).toISOString().slice(0, 10);
      const a = amort.includes(q) ? (q === amort.at(-1) ? new P(70).minus(repaid) : new P(70).div(amort.length).toDecimalPlaces(20)) : new P(0);
      repaid = repaid.plus(a);
      const p = {id: `q${q}`, startDate: previous, endDate: end, yearFraction: "0.25", annualIndex: q < 4 ? "0.14" : q < 8 ? "0.1275" : "0.12",
        yearFractionConvention: "adopted_year_fraction" as const, sourceAnchor: "C02-quarter", scheduledPrincipal: a.toFixed(),
        paysAccruedInterest: !semiannual || q % 2 === 1 || q === 20};
      previous = end; return p;
    })};
}
const IOF70 = new P(70).mul("0.03373").toFixed();
function proposal(id: string, spread: string, fee: string, withIof: boolean, lifeAmort: number[], semiannual: boolean, _inHorizon: Record<number, string>,
  collateral: string, covenant: {lease: boolean; dates: string[]; limit: string}): ProposalUnderComparison {
  const charges = [charge(`${id}-fee`, id, "origination_fee", 2, new P(70).mul(fee).toFixed()), ...(withIof ? [charge(`${id}-iof`, id, "tax", 2, IOF70)] : []),
    ...(new P(collateral).gt(0) ? [charge(`${id}-waiver`, "debenture-2021", "other", 1, "0.525")] : [])];
  return {id, label: id, collateralConsumed: collateral, charges, nonDeductibleChargeIds: new P(collateral).gt(0) ? [`${id}-waiver`] : [],
    cost: {schedule: lifetime(spread, new P(70).mul(fee).plus(withIof ? IOF70 : 0).toFixed(), lifeAmort, semiannual), lowerSpread: "0", upperSpread: "0.2"},
    covenant: {name: covenant.lease ? "lease liability in debt, IFRS 16 EBITDA" : "excluding leases", leaseLiabilityInDebt: covenant.lease, leaseLiability: "8",
      ebitdaExcludesLeases: !covenant.lease, trailingPeriods: 4, measurementPeriods: covenant.dates, limit: covenant.limit, comparator: "lte"}};
}
const proposals = [
  proposal("itau", "0.023", "0.010", true, [6, 8, 10, 12, 14, 16, 18, 20], false, {8: "8.75"}, "28", {lease: true, dates: ["2T27", "4T27", "2T28", "4T28"], limit: "3"}),
  proposal("santander", "0.0255", "0.008", true, [10, 12, 14, 16, 18, 20], false, {}, "21", {lease: false, dates: ["4T27", "4T28"], limit: "3"}),
  proposal("fundo", "0.031", "0.015", false, [16, 20], true, {}, "0", {lease: false, dates: ["2T27", "4T27", "2T28", "4T28"], limit: "2.75"}),
];
function input(shock: string): FinancingProposalComparisonInput {
  return {currency: "BRL", openingDate: "2026-06-30", endDate: "2028-12-31", openingAvailable: "35",
    periods: quarters.map((id, q) => ({id, startDate: starts[q]!, endDate: ends[q]!,
      ebitda: new P(ebitdaBase[q]!).mul(q >= 1 ? new P(1).minus(shock) : 1).toFixed(), leasePayments: "0.75", depreciationAndAmortization: "3",
      workingCapitalCashFlow: new P("-0.625").plus([1, 5, 9].includes(q) ? -25 : 0).plus([2, 6].includes(q) ? 25 : 0).toFixed(),
      maintenanceCapexPaid: "2", growthCapexPaid: "0"})),
    commonInstruments: common, commonCharges, commonNonDeductibleChargeIds: [],
    covenantHistory: [{period: "1T26", ebitda: "13.5", leasePayments: "0.75"}, {period: "2T26", ebitda: "13.5", leasePayments: "0.75"}],
    tax: {rate: "0.34", lossTreatment: "no_cash_benefit"}, freeReceivablesPool: "58", proposals};
}

const oracle = {
  base: {
    itau: {spread: "4.0000", life: "3.5", min: ["13.2636", "4T28"], service2028: "64.3725", worst: "1.9475", headroom: "1.0525", free: "30", cost: "51.8920", netDebt: "81.3197"},
    santander: {spread: "4.0047", life: "4", min: ["19.4592", "2T28"], service2028: "56.1175", worst: "1.9071", headroom: "1.0929", free: "37", cost: "52.4246", netDebt: "81.6387"},
    fundo: {spread: "3.5475", life: "4.75", min: ["20.7828", "2T28"], service2028: "56.7119", worst: "1.8788", headroom: "0.8712", free: "58", cost: "51.2504", netDebt: "80.5113"},
  },
  bank: {
    itau: {min: ["-0.2610", "4T28"], worst: "2.4513", headroom: "0.5487", netDebt: "94.8443"},
    santander: {min: ["8.1700", "4T28"], worst: "2.4368", headroom: "0.5632", netDebt: "95.1633"},
    fundo: {min: ["9.7266", "4T28"], worst: "2.3936", headroom: "0.3564", netDebt: "93.6068"},
  },
} as const;
const near = (a: string, b: string, tol = "0.00005") => new P(a).minus(b).abs().lte(tol);

describe("C02: financing proposals compared on the company itself", () => {
  const base = compareFinancingProposals(input("0"));
  it.each(["itau", "santander", "fundo"] as const)("reproduces the oracle base case for %s", (id) => {
    const r = base.proposals.find((p) => p.id === id)!; const o = oracle.base[id];
    expect(near(new P(r.equivalentSpread!).mul(100).toFixed(), o.spread)).toBe(true);
    expect(near(r.weightedAverageLifeYears, o.life)).toBe(true);
    expect([r.minimumCash.periodId, near(r.minimumCash.amount, o.min[0])]).toEqual([o.min[1], true]);
    expect(near(r.debtServiceByYear["2028"]!, o.service2028)).toBe(true);
    expect(near(r.covenant.worst.ratio, o.worst)).toBe(true);
    expect(near(r.covenant.worst.headroom, o.headroom)).toBe(true);
    expect(near(r.freeReceivablesAfter, o.free)).toBe(true);
    expect(near(r.horizonFinancingCost, o.cost)).toBe(true);
    expect(near(r.netDebtAtHorizon, o.netDebt)).toBe(true);
  });
  const bank = compareFinancingProposals(input("0.15"));
  it.each(["itau", "santander", "fundo"] as const)("reproduces the bank's stress case (EBITDA -15%%) for %s", (id) => {
    const r = bank.proposals.find((p) => p.id === id)!; const o = oracle.bank[id];
    expect([r.minimumCash.periodId, near(r.minimumCash.amount, o.min[0])]).toEqual([o.min[1], true]);
    expect(near(r.covenant.worst.ratio, o.worst)).toBe(true);
    expect(near(r.covenant.worst.headroom, o.headroom)).toBe(true);
    expect(near(r.netDebtAtHorizon, o.netDebt)).toBe(true);
  });
  it("puts a lender's recurring fee in the lifetime cost, not only in cash (independent review case)", () => {
    // Fund with a deductible R$ 1 mi fee on 2027-12-31: the reviewer's independent recomputation gives CDI + 3.914770708%.
    const i = input("0"), fundo = i.proposals[2]!;
    const withFee = {...fundo, charges: [...fundo.charges, charge("fundo-recurring", "fundo", "recurring_fee", 5, "1")].map((c) => c.id === "fundo-recurring" ? {...c, date: "2027-12-31"} : c)};
    const r = compareFinancingProposals({...i, proposals: [withFee]}).proposals[0]!;
    expect(near(new P(r.equivalentSpread!).mul(100).toFixed(), "3.914770708", "0.0000001")).toBe(true);
    const offGrid = {...fundo, charges: [...fundo.charges, charge("fundo-recurring", "fundo", "recurring_fee", 5, "1")]};
    expect(() => compareFinancingProposals({...i, proposals: [offGrid]})).toThrow("proposal_comparison_charge_off_lifetime_grid");
    expect(() => compareFinancingProposals({...i, freeReceivablesPool: "-1"})).toThrow("proposal_comparison_negative_collateral");
    for (const change of [{treatment: "withheld_from_gross_draw" as const}, {treatment: "capitalized_at_period_start" as const, account: null}, {account: "restricted" as const}])
      expect(() => compareFinancingProposals({...i, proposals: i.proposals.map((p) => ({...p, charges: p.charges.map((c) => ({...c, ...change}))}))})).toThrow("proposal_comparison_charge_treatment_unsupported");
    expect(() => compareFinancingProposals({...i, proposals: i.proposals.map((p) => ({...p, cost: {...p.cost, schedule: {...p.cost.schedule, currency: "USD"}}}))})).toThrow("proposal_comparison_currency_mismatch");
    expect(() => compareFinancingProposals({...i, proposals: i.proposals.map((p) => ({...p, collateralConsumed: "-28"}))})).toThrow("proposal_comparison_negative_collateral");
  });
  it("derives the proposal in the company from its single schedule", () => {
    const r = compareFinancingProposals(input("0")).proposals.find((p) => p.id === "fundo")!;
    // Semiannual coupon: interest accrues every quarter and is paid in 2T27, 4T27, 2T28 and 4T28 only.
    expect(r.periods.map((p) => new P(p.proposalInterestPaid).gt(0))).toEqual([false, false, false, true, false, true, false, true, false, true]);
    expect(r.periods.slice(2).every((p) => new P(p.proposalInterestAccrued).gt(0))).toBe(true);
    expect(r.drawPeriodId).toBe("1T27");
  });
  it("cuts a contract-date period at the company period end with the national calendar and refuses what it cannot cut", () => {
    const schedule = {baseDate: "2027-01-15", currency: "BRL", moneyUnit: "BRL million", grossAdvance: "70", upfrontWithheldCosts: "0", annualSpread: "0.03",
      unpaidInterestBase: "principal_plus_accrued" as const,
      periods: [{id: "p1", startDate: "2027-01-15", endDate: "2027-04-15", yearFraction: new P(61).div(252).toDecimalPlaces(20).toFixed(), annualIndex: "0.14",
        yearFractionConvention: "business_days_252" as const, businessDays: 61, sourceAnchor: "x", scheduledPrincipal: "70", paysAccruedInterest: true}]};
    const quarters = [{startDate: "2027-01-01", endDate: "2027-03-31"}, {startDate: "2027-04-01", endDate: "2027-06-30"}];
    const l = proposalCompanyLedger(schedule, quarters);
    const total = new P(70).times(new P("1.14").times("1.03").pow(new P(61).div(252)).minus(1));
    expect(l[0]!.interestAccrued.plus(l[1]!.interestAccrued).minus(total).abs().lt("1e-15")).toBe(true);
    expect(l[0]!.interestAccrued.gt(0) && l[1]!.interestAccrued.gt(0)).toBe(true);
    expect([l[0]!.interestPaid.toNumber(), l[1]!.principalPaid.toNumber(), l[0]!.closingPrincipal.toNumber(), l[1]!.closingPrincipal.toNumber()]).toEqual([0, 70, 70, 0]);
    expect(() => proposalCompanyLedger({...schedule, periods: [{...schedule.periods[0]!, businessDays: 60, yearFraction: new P(60).div(252).toDecimalPlaces(20).toFixed()}]}, quarters)).toThrow("proposal_comparison_calendar_mismatch");
    expect(() => proposalCompanyLedger({...schedule, periods: [{...schedule.periods[0]!, yearFractionConvention: "adopted_year_fraction" as const, businessDays: undefined, yearFraction: "0.25"}]}, quarters)).toThrow("proposal_comparison_lifetime_split_unavailable");
  });
  it("refuses an entry that does not match the lender's charges and a charge to an unknown instrument", () => {
    const i = input("0"), fundo = i.proposals[2]!;
    const upfront = {...fundo, cost: {...fundo.cost, schedule: {...fundo.cost.schedule, upfrontWithheldCosts: "0.5"}}};
    expect(() => compareFinancingProposals({...i, proposals: [upfront]})).toThrow("proposal_comparison_upfront_charges_mismatch");
    const itau = i.proposals[0]!;
    const stray = {...itau, charges: itau.charges.map((c) => c.id.endsWith("waiver") ? {...c, instrumentId: "unknown"} : c)};
    expect(() => compareFinancingProposals({...i, proposals: [stray]})).toThrow("proposal_comparison_charge_payee_unknown");
  });
  it("refuses a charge counted twice, a non-positive charge and a post-horizon charge inside the horizon", () => {
    const i = input("0"), fundo = i.proposals[2]!;
    const twice = {...fundo, charges: [...fundo.charges, {...fundo.charges[0]!}]};
    expect(() => compareFinancingProposals({...i, proposals: [twice]})).toThrow("proposal_comparison_duplicate_charge");
    const zero = {...fundo, charges: fundo.charges.map((c) => ({...c, amount: "0"}))};
    expect(() => compareFinancingProposals({...i, proposals: [zero]})).toThrow("proposal_comparison_positive_charge_required");
    const early = {...fundo, cost: {...fundo.cost, chargesAfterHorizon: [{id: "late", category: "recurring_fee" as const, date: "2028-06-30", amount: "1"}]}};
    expect(() => compareFinancingProposals({...i, proposals: [early]})).toThrow("proposal_comparison_charge_inside_horizon");
  });
  it("puts a contract draw on a period end in that period", () => {
    const schedule = {baseDate: "2027-03-31", currency: "BRL", moneyUnit: "BRL million", grossAdvance: "70", upfrontWithheldCosts: "0", annualSpread: "0.03",
      unpaidInterestBase: "principal_plus_accrued" as const,
      periods: [{id: "p1", startDate: "2027-03-31", endDate: "2027-06-30", yearFraction: new P(91).div(365).toDecimalPlaces(20).toFixed(), annualIndex: "0.14",
        yearFractionConvention: "actual_365_fixed" as const, sourceAnchor: "x", scheduledPrincipal: "70", paysAccruedInterest: true}]};
    const l = proposalCompanyLedger(schedule, [{startDate: "2027-01-01", endDate: "2027-03-31"}, {startDate: "2027-04-01", endDate: "2027-06-30"}]);
    expect([l[0]!.draw, l[1]!.draw, l[0]!.closingPrincipal.toNumber()]).toEqual(["70", "0", 70]);
  });
});
