import Decimal from "decimal.js";
import {describe, expect, it} from "vitest";
import {buildDeferredFinancingSchedule, solveEquivalentFinancingSpread,
  type DeferredFinancingScheduleInput, type EquivalentFinancingCostInput} from "./equivalent-financing-cost";

const Precise = Decimal.clone({precision: 60});
const inventory: EquivalentFinancingCostInput["costInventory"] = ["origination_fee", "recurring_fee", "tax", "other"].map(category =>
  ({category: category as EquivalentFinancingCostInput["costInventory"][number]["category"], status: "zero", reason: "synthetic explicit assessment"}));
const oneYear = (): EquivalentFinancingCostInput => ({
  baseDate: "2027-01-01", currency: "BRL", moneyUnit: "BRL",
  intervals: [{id: "year", startDate: "2027-01-01", endDate: "2028-01-01", yearFraction: "1", annualIndex: "0", yearFractionConvention: "adopted_year_fraction", sourceAnchor: "synthetic-one-year"}],
  netFlows: [{id: "draw", date: "2027-01-01", amount: "99", sourceAnchor: "net100-minus1"}, {id: "repayment", date: "2028-01-01", amount: "-110", sourceAnchor: "synthetic-payment"}],
  costInventory: structuredClone(inventory), convention: "multiplicative_index_and_spread_on_net_borrower_flows",
  lowerSpread: "-0.2", upperSpread: "0.2",
});

// Independent C02 Python output (model and published resultados.json), not a TS-derived
// golden result. Quarter labels are the oracle's explicit approximation, not adopted bank dates.
const oracleC02 = [
  {id: "bank-a", spread: "0.023", fee: "0.010", tax: "0.03373", amort: [6, 8, 10, 12, 14, 16, 18, 20], semiannual: false, expectedSpread: "0.040000", expectedLife: "3.5"},
  {id: "bank-b", spread: "0.0255", fee: "0.008", tax: "0.03373", amort: [10, 12, 14, 16, 18, 20], semiannual: false, expectedSpread: "0.040047", expectedLife: "4"},
  {id: "fund", spread: "0.031", fee: "0.015", tax: "0", amort: [16, 20], semiannual: true, expectedSpread: "0.035475", expectedLife: "4.75"},
];
function fixture(proposal: typeof oracleC02[number]): DeferredFinancingScheduleInput {
  let previous = "2026-12-31"; let repaid = new Precise(0);
  return {baseDate: previous, currency: "BRL", moneyUnit: "BRL million", grossAdvance: "70",
    upfrontWithheldCosts: new Precise(proposal.fee).plus(proposal.tax).times(70).toFixed(),
    annualSpread: proposal.spread, unpaidInterestBase: "principal_plus_accrued",
    periods: Array.from({length: 21}, (_, q) => {
      const end = new Date(Date.UTC(2027 + Math.floor(q / 4), (q % 4 + 1) * 3, 0)).toISOString().slice(0, 10);
      const amort = proposal.amort.includes(q)
        ? q === proposal.amort.at(-1) ? new Precise(70).minus(repaid) : new Precise(70).div(proposal.amort.length).toDecimalPlaces(20)
        : new Precise(0);
      repaid = repaid.plus(amort);
      const p = {id: `q${q}`, startDate: previous, endDate: end,
        yearFraction: "0.25", annualIndex: q < 4 ? "0.14" : q < 8 ? "0.1275" : "0.12",
        yearFractionConvention: "adopted_year_fraction" as const, sourceAnchor: "C02-Python-quarter-approximation",
        scheduledPrincipal: amort.toFixed(), paysAccruedInterest: !proposal.semiannual || q % 2 === 1 || q === 20};
      previous = end; return p;
    })};
}
function solveSchedule(input: DeferredFinancingScheduleInput) {
  const schedule = buildDeferredFinancingSchedule(input);
  const result = solveEquivalentFinancingSpread({baseDate: input.baseDate, currency: input.currency,
    moneyUnit: input.moneyUnit, intervals: input.periods.map(({scheduledPrincipal: _p, paysAccruedInterest: _i, ...period}) => period),
    netFlows: schedule.netFlows, costInventory: structuredClone(inventory),
    convention: "multiplicative_index_and_spread_on_net_borrower_flows", lowerSpread: "0", upperSpread: "0.2"});
  return {schedule, result};
}

describe("dated economic equivalent financing cost", () => {
  it.each(oracleC02)("matches independent C02 spread and principal-weighted life: $id", proposal => {
    const {schedule, result} = solveSchedule(fixture(proposal));
    expect(result.status).toBe("calculated");
    expect(new Precise(result.annualSpread!).minus(proposal.expectedSpread).abs().lt("0.0000005")).toBe(true);
    expect(new Precise(schedule.weightedAverageLifeYears).minus(proposal.expectedLife).abs().lt("0.000000000001")).toBe(true);
    expect(new Precise(result.residualPresentValue!).abs().lt("0.000000000001")).toBe(true);
    expect(result.regulatoryCet).toBe(false);
  });

  it("includes entry cost once: 99 net received and 110 repaid imply 11.111111 percent", () => {
    const result = solveEquivalentFinancingSpread(oneYear());
    expect(new Precise(result.annualSpread!).minus(new Precise(110).div(99).minus(1)).abs().lt("1e-18")).toBe(true);
  });
  it("uses the dated curve rather than constant CDI or spread plus upfront costs divided by maturity", () => {
    const input = fixture(oracleC02[0]!); const original = solveSchedule(input).result;
    input.periods.forEach(p => {p.annualIndex = "0.14";});
    const flat = solveSchedule(input).result;
    expect(flat.annualSpread).not.toBe(original.annualSpread);
    expect(original.annualSpread).not.toBe(new Precise("0.023").plus(new Precise("0.04373").div("5.25")).toFixed());
  });
  it("supports a negative equivalent spread without clipping the root to zero", () => {
    const input = oneYear(); input.netFlows[0]!.amount = "100"; input.netFlows[1]!.amount = "-95";
    expect(solveEquivalentFinancingSpread(input).annualSpread).toBe("-0.05");
  });
  it("returns an explicit unbracketed result rather than an invented boundary root", () => {
    const input = oneYear(); input.netFlows[1]!.amount = "-500";
    expect(solveEquivalentFinancingSpread(input)).toMatchObject({status: "root_not_bracketed", annualSpread: null});
  });
  it("keeps unknown tax separate from a zero-tax assumption", () => {
    const input = oneYear(); input.costInventory[2]!.status = "unknown";
    expect(solveEquivalentFinancingSpread(input)).toMatchObject({status: "missing_inputs", annualSpread: null, gaps: [expect.objectContaining({category: "tax"})]});
    input.costInventory[2]!.status = "not_applicable";
    expect(solveEquivalentFinancingSpread(input).status).toBe("calculated");
  });
  it("requires every assessment, curve interval and exact flow date", () => {
    const duplicate = oneYear(); duplicate.costInventory[3] = duplicate.costInventory[0]!;
    expect(() => solveEquivalentFinancingSpread(duplicate)).toThrow("financing_cost_inventory_required");
    const gap = oneYear(); gap.intervals[0]!.startDate = "2027-02-01";
    expect(() => solveEquivalentFinancingSpread(gap)).toThrow("financing_curve_coverage");
    const date = oneYear(); date.netFlows[1]!.date = "2027-12-01";
    expect(() => solveEquivalentFinancingSpread(date)).toThrow("financing_cash_flow_requires_curve_boundary");
  });
  it("checks ACT/365 fractions and requires adopted business-day counts for DU/252", () => {
    const input = oneYear(); input.intervals[0]!.yearFractionConvention = "actual_365_fixed";
    expect(solveEquivalentFinancingSpread(input).status).toBe("calculated");
    input.intervals[0]!.yearFraction = "0.25";
    expect(() => solveEquivalentFinancingSpread(input)).toThrow("financing_year_fraction_mismatch");
    input.intervals[0]!.yearFractionConvention = "business_days_252";
    expect(() => solveEquivalentFinancingSpread(input)).toThrow("financing_business_day_count_required");
    input.intervals[0]!.businessDays = 63;
    expect(solveEquivalentFinancingSpread({...input, upperSpread: "1"}).status).toBe("calculated");
    input.intervals[0]!.businessDays = 64;
    expect(() => solveEquivalentFinancingSpread(input)).toThrow("financing_year_fraction_mismatch");
  });
  it("refuses a nonconventional stream instead of returning an arbitrary root", () => {
    const input = oneYear(); input.netFlows[1]!.amount = "10";
    expect(() => solveEquivalentFinancingSpread(input)).toThrow("financing_nonconventional_stream");
    input.netFlows[0]!.amount = "-1";
    expect(() => solveEquivalentFinancingSpread(input)).toThrow("financing_positive_net_advance_required");
  });
  it("nets simultaneous components once without depending on their input order", () => {
    const input = oneYear(); input.netFlows[0]!.amount = "100";
    input.netFlows.push({id: "fee", date: input.baseDate, amount: "-1", sourceAnchor: "specified-fee"});
    expect(solveEquivalentFinancingSpread(input).annualSpread).toBe(solveEquivalentFinancingSpread(oneYear()).annualSpread);
    input.netFlows.reverse();
    expect(solveEquivalentFinancingSpread(input).annualSpread).toBe(solveEquivalentFinancingSpread(oneYear()).annualSpread);
  });
  it("refuses impossible dates, duplicate identities and an invalid bracket", () => {
    const badDate = oneYear(); badDate.intervals[0]!.endDate = "2027-02-30";
    expect(() => solveEquivalentFinancingSpread(badDate)).toThrow();
    const duplicate = oneYear(); duplicate.netFlows[1]!.id = duplicate.netFlows[0]!.id;
    expect(() => solveEquivalentFinancingSpread(duplicate)).toThrow("financing_duplicate_flow");
    const bracket = oneYear(); bracket.lowerSpread = bracket.upperSpread;
    expect(() => solveEquivalentFinancingSpread(bracket)).toThrow("financing_invalid_root_bracket");
  });
});

describe("unpaid contractual interest and full amortization horizon", () => {
  function deferred(): DeferredFinancingScheduleInput {
    return {baseDate: "2027-01-01", currency: "BRL", moneyUnit: "BRL", grossAdvance: "100", upfrontWithheldCosts: "0", annualSpread: "0",
      unpaidInterestBase: "principal_plus_accrued", periods: [
        {id: "a", startDate: "2027-01-01", endDate: "2028-01-01", yearFraction: "1", annualIndex: "0.1", yearFractionConvention: "adopted_year_fraction", sourceAnchor: "a", scheduledPrincipal: "0", paysAccruedInterest: false},
        {id: "b", startDate: "2028-01-01", endDate: "2029-01-01", yearFraction: "1", annualIndex: "0.1", yearFractionConvention: "adopted_year_fraction", sourceAnchor: "b", scheduledPrincipal: "100", paysAccruedInterest: true},
      ]};
  }
  it("compounds 10 of unpaid interest into next period's base and pays 21 once", () => {
    const result = buildDeferredFinancingSchedule(deferred());
    expect(result.rows[1]).toMatchObject({interestBase: "110", interestAccrued: "11", interestPaid: "21", closingAccruedInterest: "0", cashDebtService: "121"});
    expect(result.netFlows.map(f => f.amount)).toEqual(["100", "0", "-121"]);
  });
  it("does not compound when the adopted contract keeps unpaid interest outside the base", () => {
    const input = deferred(); input.unpaidInterestBase = "principal_only";
    expect(buildDeferredFinancingSchedule(input).rows[1]).toMatchObject({interestBase: "100", interestPaid: "20", cashDebtService: "120"});
  });
  it("accrues before end-date amortization rather than reducing the opening interest base", () => {
    const input = deferred(); input.periods[0]!.scheduledPrincipal = "50"; input.periods[1]!.scheduledPrincipal = "50";
    expect(buildDeferredFinancingSchedule(input).rows[1]).toMatchObject({interestBase: "60", interestAccrued: "6", interestPaid: "16", cashDebtService: "66"});
  });
  it("refuses a horizon ending before principal or unpaid interest settlement", () => {
    const input = deferred(); input.periods.pop();
    expect(() => buildDeferredFinancingSchedule(input)).toThrow("financing_full_settlement_horizon_required");
    const unpaid = deferred(); unpaid.periods[1]!.paysAccruedInterest = false;
    expect(() => buildDeferredFinancingSchedule(unpaid)).toThrow("financing_full_settlement_horizon_required");
  });
  it("does not relabel a later zero-balance forecast date as the actual final payment", () => {
    const input = deferred();
    input.periods.push({...input.periods[1]!, id: "after-payment", startDate: "2029-01-01", endDate: "2030-01-01", scheduledPrincipal: "0"});
    expect(buildDeferredFinancingSchedule(input)).toMatchObject({finalPaymentDate: "2029-01-01", projectedThroughDate: "2030-01-01"});
  });
  it("refuses excess principal repayment and a withholding that erases proceeds", () => {
    const input = deferred(); input.periods[0]!.scheduledPrincipal = "101";
    expect(() => buildDeferredFinancingSchedule(input)).toThrow("financing_amortization_exceeds_principal");
    const fee = deferred(); fee.upfrontWithheldCosts = "100";
    expect(() => buildDeferredFinancingSchedule(fee)).toThrow("financing_positive_net_advance_required");
  });
  it("keeps both engines deterministic under a caller's different global Decimal context", () => {
    const input = deferred(); const baseline = buildDeferredFinancingSchedule(input); const expectedCost = solveEquivalentFinancingSpread(oneYear());
    const precision = Decimal.precision; const rounding = Decimal.rounding;
    try {Decimal.set({precision: 5, rounding: Decimal.ROUND_DOWN});
      expect(buildDeferredFinancingSchedule(input)).toEqual(baseline);
      expect(solveEquivalentFinancingSpread(oneYear())).toEqual(expectedCost);
    } finally {Decimal.set({precision, rounding});}
    expect(input).toEqual(deferred());
  });
});
