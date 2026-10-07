import Decimal from "decimal.js";
import {describe, expect, it} from "vitest";
import {findMaximumDebtCapacity, projectDebtCapacityAmount, type DebtCapacityInput} from "./debt-capacity";
const D = Decimal.clone({precision: 60});
const affine = (fixed: string, perUnitNewDebt = "0") => ({fixed, perUnitNewDebt});
const unit = () => ({drawAtStart: "0", drawAtEnd: "0", principalPaidAtEnd: "0",
  interestFactorOnOpeningAndStartDraw: "0.1", interestFactorOnEndDraw: "0", interestFactorCreditOnEndAmortization: "0",
  factorConvention: "dated_contract_split_at_cash_flows" as const, paysAccruedInterest: true,
  unpaidInterestBase: "principal_plus_accrued" as const, withheldCostPerUnitDraw: "0", sourceAnchor: "synthetic dated unit schedule"});
function simple(): DebtCapacityInput {
  return {currency: "BRL", moneyUnit: "BRL", openingDate: "2026-12-31", endDate: "2028-12-31", maximumAmount: "200", monetaryQuantum: "0.01",
    definition: "maximum_monetary_quantum_amount_under_all_adopted_scenario_period_constraints",
    horizon: {mode: "full_settlement", newDebtFinalPaymentDate: "2028-12-31", existingDebtFinalPaymentDates: [], sourceAnchor: "synthetic maturity"},
    scenarios: [{id: "base", sourceAnchor: "synthetic base", openingAvailableCash: "0", cashNetting: "signed_available", includeNewAccruedInterestInDebt: false,
      rules: [{id: "cash", kind: "minimum_available_cash", threshold: "10", measurement: "all_period_ends", sourceAnchor: "synthetic adopted minimum"},
        {id: "covenant", kind: "maximum_net_debt_to_ebitda", threshold: "5", measurement: "all_period_ends", sourceAnchor: "synthetic covenant"}],
      periods: [2027, 2028].map((year, k) => ({id: String(year), startDate: `${year}-01-01`, endDate: `${year}-12-31`, sourceAnchor: "synthetic raw operating drivers",
        ebitda: affine(k === 0 ? "20" : "120"), covenantEbitdaAdjustment: affine("0"), nonCashEbitdaBridge: affine("0"), cashLeasePayments: affine("0"),
        changeInWorkingCapital: affine("0"), maintenanceCapex: affine("0"), growthCapex: affine(k === 0 ? "100" : "0"),
        taxableBaseBeforeNewDebtInterest: affine("0"), cashTaxRate: "0", lossTaxTreatment: "no_cash_benefit", newDebtTaxDeduction: "paid_interest",
        cfadsGrowthCapexTreatment: "exclude_growth_capex", cfadsDefinitionAnchor: "synthetic explicit CFADS excludes growth capex", existingCashInterest: "0", existingCashPrincipalPaid: "0",
        otherExistingFinancingCashAvailable: affine("0"), capitalCashAvailable: affine("0"), existingDebtForRatio: "0",
        newFinancing: {...unit(), drawAtStart: k === 0 ? "1" : "0", principalPaidAtEnd: k === 1 ? "1" : "0"}}))}]};
}
function c04(delayed = false): DebtCapacityInput {
  const years = [2027, 2028, 2029, 2030, 2031];
  const cdi = ["0.14", "0.1275", "0.12", "0.12", "0.12"];
  const baseE = ["56.6", "58.8", "61.2", "63.6", "66.1"];
  const deb = ["80", "80", "53.33", "26.67", "0"];
  const fa = ["16.66", "9.99", "3.32", "0", "0"];
  const projectE = delayed ? ["0", "0", "0", "6", "12"] : ["0", "0", "6", "12", "12"];
  return {currency: "BRL", moneyUnit: "BRL million", openingDate: "2026-12-31", endDate: "2031-12-31", maximumAmount: "200", monetaryQuantum: "0.001",
    definition: "maximum_monetary_quantum_amount_under_all_adopted_scenario_period_constraints",
    horizon: {mode: "calibration_window", newDebtFinalPaymentDate: "2032-12-31", existingDebtFinalPaymentDates: ["2031-12-31"], sourceAnchor: "C04 Python truncates remaining life"},
    scenarios: [false, true].map(adverse => ({id: adverse ? "adverse" : "base", sourceAnchor: "C04 synthetic Python adopted annual inputs", openingAvailableCash: "15.3",
      cashNetting: "signed_available", includeNewAccruedInterestInDebt: false,
      rules: [{id: "covenant", kind: "maximum_net_debt_to_ebitda", threshold: adverse ? "3" : "2.5", measurement: "all_period_ends", sourceAnchor: "C04 covenant/headroom"},
        ...adverse ? [] : [{id: "market", kind: "maximum_net_debt_to_ebitda" as const, threshold: "2.75", measurement: "all_period_ends" as const, sourceAnchor: "C04 synthetic market assumption"},
          {id: "interest", kind: "minimum_interest_coverage" as const, threshold: "2.5", measurement: "all_period_ends" as const, sourceAnchor: "C04 synthetic interest threshold"}]],
      periods: years.map((year, k) => {
        const prevDeb = k === 0 ? "80" : deb[k - 1]!; const prevFa = k === 0 ? "23.33" : fa[k - 1]!;
        const oldInterest = new D(prevDeb).plus(deb[k]!).div(2).times(new D(cdi[k]!).plus("0.029"))
          .plus(new D(prevFa).plus(fa[k]!).div(2).times("0.097")).plus(new D(10).times(new D(cdi[k]!).plus("0.02")));
        const oldAmort = new D(prevDeb).minus(deb[k]!).plus(new D(prevFa).minus(fa[k]!));
        const stress = adverse ? "0.85" : "1"; const perE = new D(projectE[k]!).div(60);
        const draw = delayed ? year === 2028 || year === 2029 : year === 2027 || year === 2028;
        const perDep = year >= 2029 ? "0.1" : year === 2028 ? "0.05" : "0";
        const e = {fixed: new D(baseE[k]!).times(stress).toFixed(), perUnitNewDebt: perE.times(stress).toDecimalPlaces(20).toFixed()};
        return {id: String(year), startDate: `${year}-01-01`, endDate: `${year}-12-31`, sourceAnchor: "C04 synthetic annual calibration",
          ebitda: e, covenantEbitdaAdjustment: affine("-3"), nonCashEbitdaBridge: affine("0"), cashLeasePayments: affine("3"),
          changeInWorkingCapital: affine("2.5", perE.minus(k ? new D(projectE[k - 1]!).div(60) : 0).toDecimalPlaces(20).toFixed()),
          maintenanceCapex: affine("8", projectE[k] !== "0" ? "0.025" : "0"), growthCapex: affine("0", draw ? "0.5" : "0"),
          taxableBaseBeforeNewDebtInterest: affine(new D(e.fixed).minus(12).minus(3).minus(oldInterest).toFixed(), new D(e.perUnitNewDebt).minus(perDep).toDecimalPlaces(20).toFixed()),
          cashTaxRate: "0.34", lossTaxTreatment: "no_cash_benefit" as const, newDebtTaxDeduction: "accrued_interest" as const,
          cfadsGrowthCapexTreatment: "exclude_growth_capex" as const, cfadsDefinitionAnchor: "C04 cash available before debt service",
          existingCashInterest: oldInterest.toFixed(), existingCashPrincipalPaid: oldAmort.toFixed(), existingDebtForRatio: new D(deb[k]!).plus(fa[k]!).plus(20).toFixed(),
          otherExistingFinancingCashAvailable: affine("0"), capitalCashAvailable: affine("0"),
          newFinancing: {...unit(), drawAtStart: "0", drawAtEnd: draw ? "0.5" : "0", principalPaidAtEnd: year >= 2030 ? "0.33333333333333333333" : "0",
            unpaidInterestBase: "principal_only" as const, factorConvention: "adopted_annual_average_balance_approximation" as const,
            interestFactorOnOpeningAndStartDraw: new D(cdi[k]!).plus("0.025").toFixed(),
            interestFactorOnEndDraw: new D(cdi[k]!).plus("0.025").div(2).toFixed(), interestFactorCreditOnEndAmortization: new D(cdi[k]!).plus("0.025").div(2).toFixed()}};
      })}))};
}

describe("debt capacity: joint constraints and all declared dates", () => {
  it("finds the maximum when zero debt fails the minimum-cash requirement", () => {
    const r = findMaximumDebtCapacity(simple()); expect(r.status).toBe("calculated"); expect(r.maximumFeasibleAmount).toBe("150");
    expect(r.finalChecks!.every(c => c.passed)).toBe(true); expect(r.followingChecks!.some(c => !c.passed && c.date === "2028-12-31")).toBe(true);
    expect(r.viableRegions.some(v => v.lower === "100" && v.upper === "150")).toBe(true);
    expect(projectDebtCapacityAmount(simple(), "0").constraintsPassed).toBe(false);
  });
  it("returns no joint solution when a downside limit conflicts with the base's funding floor", () => {
    const i = simple(); const adverse = structuredClone(i.scenarios[0]!); adverse.id = "adverse";
    adverse.rules[0]!.threshold = "0"; adverse.periods[0]!.ebitda.fixed = "18"; adverse.periods[1]!.ebitda.fixed = "100"; i.scenarios.push(adverse);
    const r = findMaximumDebtCapacity(i); expect(r.status).toBe("no_feasible_amount"); expect(r.maximumFeasibleAmount).toBeNull();
  });
  it("confers C04 Python's L1/L3/L4 sizing without calling a truncated window lifetime viability", () => {
    // Independent published Python: 54.8 (current timing), 80.0 (delayed timing).
    const r = findMaximumDebtCapacity(c04()); expect(r.status).toBe("calibration_only"); expect(r.fullLifeVerified).toBe(false);
    expect(new D(r.maximumFeasibleAmount!).toDecimalPlaces(1).toNumber()).toBe(54.8);
    const later = findMaximumDebtCapacity(c04(true)); expect(new D(later.maximumFeasibleAmount!).toDecimalPlaces(1).toNumber()).toBe(80);
    expect(r.followingChecks!.some(c => c.ruleId === "covenant" && !c.passed)).toBe(true);
  });
  it("does not confuse C04 size with joint cash/debt-service feasibility", () => {
    const i = c04(); i.scenarios.forEach(s => {
      s.rules.push({id: "liquidity", kind: "minimum_available_cash", threshold: s.id === "base" ? "15" : "0", measurement: "all_period_ends", sourceAnchor: "C04 adopted cash floor"});
      if (s.id === "base") s.rules.push({id: "dscr", kind: "minimum_debt_service_coverage", threshold: "1.2", measurement: "all_period_ends", sourceAnchor: "C04 stated DSCR"});
    });
    expect(findMaximumDebtCapacity(i).status).toBe("no_feasible_amount");
  });
  it("shows the C04 old-profile cash rather than copying numbers from the revised 2033 table", () => {
    const r = projectDebtCapacityAmount(c04(), "45");
    const base = r.financialRows.find(s => s.scenarioId === "base")!.rows;
    const adverse = r.financialRows.find(s => s.scenarioId === "adverse")!.rows;
    expect(Math.min(...base.map(p => Number(p.closingAvailableCash)))).toBeCloseTo(-1.2, 1);
    expect(Math.min(...adverse.map(p => Number(p.closingAvailableCash)))).toBeCloseTo(-33.7, 1);
  });
  it("implements a tighter company rule at every date, independently of the covenant", () => {
    const i = c04(); i.scenarios[0]!.rules.push({id: "client", kind: "maximum_net_debt_to_ebitda", threshold: "2", measurement: "all_period_ends", sourceAnchor: "C04 client's own policy"});
    const r = findMaximumDebtCapacity(i); expect(new D(r.maximumFeasibleAmount!).toDecimalPlaces(0).toNumber()).toBe(32);
    expect(r.followingChecks!.some(c => c.ruleId === "client" && !c.passed)).toBe(true);
  });
  it("checks the final repayment instead of stopping at the debt's grace period", () => {
    const i = simple(); i.endDate = "2027-12-31"; i.scenarios[0]!.periods.pop();
    expect(() => findMaximumDebtCapacity(i)).toThrow("capacity_final_amortization_horizon_required");
  });
  it("refuses to pretend missing amortization or unpaid capitalized interest is settled", () => {
    const i = simple(); i.scenarios[0]!.periods[1]!.newFinancing.principalPaidAtEnd = "0.9";
    expect(() => findMaximumDebtCapacity(i)).toThrow("capacity_final_settlement_required");
    i.scenarios[0]!.periods[1]!.newFinancing.principalPaidAtEnd = "1"; i.scenarios[0]!.periods[1]!.newFinancing.paysAccruedInterest = false;
    expect(() => findMaximumDebtCapacity(i)).toThrow("capacity_final_settlement_required");
  });
  it("requires actual unit payments to match the maturity inventory", () => {
    const i = simple(); i.horizon.newDebtFinalPaymentDate = "2028-06-30";
    expect(() => findMaximumDebtCapacity(i)).toThrow("capacity_maturity_inventory_mismatch");
  });
  it("checks accrued interest capitalization under the adopted contract", () => {
    const i = simple(); i.scenarios[0]!.periods[0]!.newFinancing.paysAccruedInterest = false;
    const r = findMaximumDebtCapacity(i); const rows = r.unitSchedules[0]!.rows;
    expect(rows[0]!.closingAccruedInterestPerUnit).toBe("0.1"); expect(rows[1]!.interestAccruedPerUnit).toBe("0.11"); expect(rows[1]!.interestPaidPerUnit).toBe("0.21");
  });
  it("replays the maximum monetary lattice point and rejects the next point", () => {
    const i = simple(); i.scenarios[0]!.rules[0]!.threshold = "10.0001";
    const r = findMaximumDebtCapacity(i); expect(r.maximumFeasibleAmount).toBe("149.99");
    expect(r.finalChecks!.every(c => c.passed)).toBe(true); expect(r.followingChecks!.some(c => !c.passed)).toBe(true);
  });
  it("reveals a search-domain ceiling instead of reporting an unsupported intrinsic maximum", () => {
    const i = simple(); i.maximumAmount = "120"; const r = findMaximumDebtCapacity(i);
    expect(r.maximumFeasibleAmount).toBe("120"); expect(r.boundedBySearchDomain).toBe(true); expect(r.followingChecks).toBeNull();
  });
  it("handles tax kinks by regions and verifies the final company cash at the chosen amount", () => {
    const i = simple(); i.scenarios[0]!.periods.forEach(p => {p.cashTaxRate = "0.34"; p.taxableBaseBeforeNewDebtInterest = affine("12");});
    const r = findMaximumDebtCapacity(i); expect(r.finalChecks!.every(c => c.passed)).toBe(true);
    expect(r.followingChecks!.some(c => !c.passed)).toBe(true);
    expect(r.financialRowsAtMaximum![0]!.rows[0]!.cashTax).toBe("0");
  });
  it("can intersect disconnected net-cash regions without assuming monotonic feasibility", () => {
    const i = simple(); i.endDate = "2027-12-31"; i.maximumAmount = "10"; i.horizon.mode = "calibration_window";
    const s = i.scenarios[0]!; s.periods.pop(); s.openingAvailableCash = "8"; s.cashNetting = "nonnegative_available";
    s.rules = [{id: "cov", kind: "maximum_net_debt_to_ebitda", threshold: "2", measurement: "all_period_ends", sourceAnchor: "synthetic"}];
    const p = s.periods[0]!; p.ebitda = affine("2", "1"); p.growthCapex = affine("0", "5"); p.existingDebtForRatio = "9"; p.newFinancing.interestFactorOnOpeningAndStartDraw = "0";
    const r = findMaximumDebtCapacity(i); expect(r.maximumFeasibleAmount).toBe("10");
    expect(projectDebtCapacityAmount(i, "2").constraintsPassed).toBe(true); expect(projectDebtCapacityAmount(i, "4").constraintsPassed).toBe(false); expect(projectDebtCapacityAmount(i, "6").constraintsPassed).toBe(true);
  });
  it("denies zero or negative covenant EBITDA instead of interpreting a negative ratio as safe", () => {
    const i = simple(); i.scenarios[0]!.periods[0]!.covenantEbitdaAdjustment = affine("-20");
    expect(findMaximumDebtCapacity(i).status).toBe("no_feasible_amount");
  });
  it("treats a zero interest/service denominator as not applicable, not an infinite invented ratio", () => {
    const i = simple(); const s = i.scenarios[0]!; s.periods.forEach(p => p.newFinancing.interestFactorOnOpeningAndStartDraw = "0");
    s.rules.push({id: "interest", kind: "minimum_interest_coverage", threshold: "2.5", measurement: "all_period_ends", sourceAnchor: "synthetic"});
    const r = findMaximumDebtCapacity(i); expect(r.finalChecks!.filter(c => c.kind === "minimum_interest_coverage").every(c => c.passed && !c.applicable && c.metric === null)).toBe(true);
  });
  it("does not accept approximated midpoint interest under the dated-contract label", () => {
    const i = simple(); i.scenarios[0]!.periods[0]!.newFinancing.interestFactorOnEndDraw = "0.05";
    expect(() => findMaximumDebtCapacity(i)).toThrow("capacity_dated_period_must_split_at_cash_flow");
  });
  it("rejects duplicate rules/scenarios, missing future periods and impossible dates", () => {
    let i = simple(); i.scenarios[0]!.rules.push(i.scenarios[0]!.rules[0]!); expect(() => findMaximumDebtCapacity(i)).toThrow("capacity_duplicate_rule");
    i = simple(); i.scenarios.push(i.scenarios[0]!); expect(() => findMaximumDebtCapacity(i)).toThrow("capacity_duplicate_scenario");
    i = simple(); i.scenarios[0]!.periods[1]!.startDate = "2028-02-01"; expect(() => findMaximumDebtCapacity(i)).toThrow("capacity_period_coverage");
    i = simple(); i.endDate = "2028-02-30"; expect(() => findMaximumDebtCapacity(i)).toThrow();
  });
  it("refuses negative costs, excess draw/amortization, residual old debt and nonsensical quantum", () => {
    let i = simple(); i.scenarios[0]!.periods[1]!.growthCapex = affine("-1"); expect(() => findMaximumDebtCapacity(i)).toThrow("capacity_negative_operating_outlay");
    i = simple(); i.scenarios[0]!.periods[1]!.newFinancing.drawAtStart = "1"; expect(() => findMaximumDebtCapacity(i)).toThrow("capacity_unit_profile_not_normalized");
    i = simple(); i.scenarios[0]!.periods[1]!.existingDebtForRatio = "1"; expect(() => findMaximumDebtCapacity(i)).toThrow("capacity_existing_debt_not_settled_at_horizon");
    i = simple(); i.monetaryQuantum = "201"; expect(() => findMaximumDebtCapacity(i)).toThrow("capacity_quantum_exceeds_domain");
  });
  it("retains deterministic output without changing operands or the global Decimal context", () => {
    const i = simple(); const copy = structuredClone(i); const before = Decimal.precision;
    try {Decimal.set({precision: 5}); expect(findMaximumDebtCapacity(i).maximumFeasibleAmount).toBe("150"); expect(Decimal.precision).toBe(5);}
    finally {Decimal.set({precision: before});} expect(i).toEqual(copy);
  });
  it("matches exhaustive lattice search across tax and cash-netting regimes", () => {
    for (const growth of ["20", "25", "30"]) for (const netting of ["signed_available", "nonnegative_available"] as const) {
      const i = simple(); i.maximumAmount = "40"; i.monetaryQuantum = "1";
      const s = i.scenarios[0]!; s.cashNetting = netting; s.periods[0]!.growthCapex.fixed = growth;
      s.periods.forEach(p => {p.cashTaxRate = "0.34"; p.taxableBaseBeforeNewDebtInterest = affine("2");});
      let highest: string | null = null;
      for (let n = 0; n <= 40; n++) if (projectDebtCapacityAmount(i, String(n)).constraintsPassed) highest = String(n);
      expect(findMaximumDebtCapacity(i).maximumFeasibleAmount).toBe(highest);
    }
  });
  it("fixed-profile review preserves the same negative-input and maturity gates as sizing", () => {
    const i = simple(); i.horizon.newDebtFinalPaymentDate = "2028-06-30";
    expect(() => projectDebtCapacityAmount(i, "100")).toThrow("capacity_maturity_inventory_mismatch");
    i.horizon.newDebtFinalPaymentDate = "2028-12-31"; i.scenarios[0]!.periods[0]!.growthCapex.fixed = "-1";
    expect(() => projectDebtCapacityAmount(i, "100")).toThrow("capacity_negative_operating_outlay");
  });

});
