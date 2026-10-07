import Decimal from "decimal.js";
import {describe, expect, it} from "vitest";
import {buildInvestmentProject, calculateProjectRampExposure, calculateStartupWorkingCapital,
  projectCompanyWithAndWithoutInvestment, valueInvestmentProject,
  type InvestmentProjectInput, type ProjectValuationInput, type CompanyCounterfactualInput} from "./investment-project";

const Exact = Decimal.clone({precision: 60});
const zeroWc = {receivables: "0", inventory: "0", newPayables: "0", lostSupplierCredit: "0"};
const startup = {annualIncrementalRevenue: "0", annualNewVariableCost: "19.5", annualDisplacedPurchases: "30",
  receivableDays: "0", inventoryDays: "45", newSupplierDays: "30", lostSupplierDays: "60", adoptedYearDays: "360" as const,
  sourceAnchor: "C32 synthetic adopted startup operands"};
function c32(): InvestmentProjectInput {
  const working = calculateStartupWorkingCapital(startup);
  return {currency: "BRL", moneyUnit: "BRL million", openingDate: "2025-12-31", endDate: "2036-12-31",
    openingIncrementalWorkingCapital: zeroWc, definition: "incremental_unlevered_cash_flow",
    periods: Array.from({length: 11}, (_, k) => {
      const year = 2026 + k;
      const ramp = calculateProjectRampExposure({startDate: `${year}-01-01`, endDate: `${year}-12-31`,
        operationStartMonth: "2027-05-01", stages: [{months: 3, load: "0.5"}], terminalLoad: "1", sourceAnchor: "C32 synthetic monthly ramp"});
      const growth = new Exact("1.04").pow(Math.max(0, year - 2027));
      return {id: String(year), startDate: `${year}-01-01`, endDate: `${year}-12-31`, sourceAnchor: "C32 synthetic unlevered project",
        annualNetRevenue: "0", annualAvoidedOperatingCost: growth.times(30).toFixed(), annualVariableOperatingCost: growth.times("19.5").toFixed(),
        annualFixedOperatingCost: growth.times("4.5").toFixed(), fixedCostScaling: "load" as const,
        loadYearFraction: ramp.loadEquivalentYearFraction, activeYearFraction: ramp.activeYearFraction,
        annualMaintenanceCapex: "0.6", growthCapexPaid: year === 2026 ? "10" : year === 2027 ? "8" : "0",
        annualDepreciation: "1.8", cashTaxRate: "0.34", lossTaxTreatment: "no_cash_benefit" as const,
        closingIncrementalWorkingCapital: year >= 2027 && year < 2036 ?
          {receivables: working.receivables, inventory: working.inventory, newPayables: working.newPayables, lostSupplierCredit: working.lostSupplierCredit} : zeroWc};
    })};
}
function c04(): InvestmentProjectInput {
  return {currency: "BRL", moneyUnit: "BRL million", openingDate: "2026-12-31", endDate: "2043-12-31",
    openingIncrementalWorkingCapital: zeroWc, definition: "incremental_unlevered_cash_flow",
    periods: Array.from({length: 17}, (_, k) => {
      const year = 2027 + k; const load = year < 2029 ? "0" : year === 2029 ? "0.5" : "1";
      return {id: String(year), startDate: `${year}-01-01`, endDate: `${year}-12-31`, sourceAnchor: "C04 synthetic project operands",
        annualNetRevenue: "80", annualAvoidedOperatingCost: "0", annualVariableOperatingCost: "68", annualFixedOperatingCost: "0",
        fixedCostScaling: "load" as const, loadYearFraction: load, activeYearFraction: year < 2029 ? "0" : "1",
        annualMaintenanceCapex: "1.5", growthCapexPaid: year < 2029 ? "30" : "0", annualDepreciation: "4",
        cashTaxRate: "0.34", lossTaxTreatment: "no_cash_benefit" as const,
        closingIncrementalWorkingCapital: {...zeroWc, receivables: year === 2029 ? "6" : year >= 2030 && year < 2043 ? "12" : "0"}};
    })};
}
function valuation(p: InvestmentProjectInput, decimals: number): ProjectValuationInput {
  const rows = buildInvestmentProject(p).rows;
  return {baseDate: rows[0]!.endDate, currency: p.currency, moneyUnit: p.moneyUnit,
    flows: rows.map((r, k) => ({id: r.periodId, date: r.endDate, amount: r.unleveredCashFlow, adoptedTimeYears: String(k), sourceAnchor: "synthetic annual Python calibration"})),
    timing: "adopted_times", timingSourceAnchor: "Python annual approximate times: first year t=0",
    discountRate: "0.15", irrLower: "-0.5", irrUpper: "2",
    flowPrecision: {mode: "calibration_rounding", decimals, reason: "Published Python rounds cash flows before NPV/IRR"}};
}
function counterfactual(p = c32()): CompanyCounterfactualInput {
  return {project: p, openingAvailableCash: "20", openingRestrictedCash: "7", definition: "same_baseline_and_financing_with_and_without_investment",
    debtInventory: {status: "provided", instruments: [{instrumentId: "new", finalPaymentDate: "2033-12-31", sourceAnchor: "synthetic adopted amortization"}]},
    periods: p.periods.map(q => ({periodId: q.id, startDate: q.startDate, endDate: q.endDate, sourceAnchor: "synthetic common baseline",
      ebitda: "40", nonCashEbitdaBridge: "0", cashLeasePayments: "3", netWorkingCapitalChange: "2", maintenanceCapex: "8", growthCapex: "4",
      taxableBaseBeforeProject: "20", cashTaxRate: "0.34", lossTaxTreatment: "no_cash_benefit",
      netFinancingCashAvailable: "-10", netCapitalCashAvailable: "0", netRestrictedCashMovement: "0", closingDebtStock: q.endDate < "2033-12-31" ? "30" : "0"}))};
}

describe("investment project: C04/C32 independent calibration and counterfactuals", () => {
  it("captures lost supplier finance even with no incremental revenue", () => {
    const r = calculateStartupWorkingCapital(startup);
    expect(r.lostSupplierCredit).toBe("5"); expect(r.inventory).toBe("2.4375");
    expect(r.newPayables).toBe("1.625"); expect(r.netRequirement).toBe("5.8125");
  });
  it("calculates growth receivables and inventory under adopted days, without a guessed calendar", () => {
    const r = calculateStartupWorkingCapital({...startup, annualIncrementalRevenue: "100", receivableDays: "30", adoptedYearDays: "365"});
    expect(new Exact(r.receivables).minus(new Exact(3000).div(365)).abs().lt("1e-19")).toBe(true);
    expect(() => calculateStartupWorkingCapital({...startup, lostSupplierDays: undefined as never})).toThrow();
  });
  it("carries three half-load months through a November startup into January", () => {
    const args = {operationStartMonth: "2027-11-01", stages: [{months: 3, load: "0.5"}], terminalLoad: "1", sourceAnchor: "synthetic delayed startup"};
    const first = calculateProjectRampExposure({...args, startDate: "2027-01-01", endDate: "2027-12-31"});
    const next = calculateProjectRampExposure({...args, startDate: "2028-01-01", endDate: "2028-12-31"});
    expect(first.activeMonths).toBe(2); expect(new Exact(first.loadEquivalentYearFraction).times(12).toNumber()).toBeCloseTo(1, 12);
    expect(new Exact(next.loadEquivalentYearFraction).times(12).toNumber()).toBeCloseTo(11.5, 12);
  });
  it("refuses partial month periods instead of fabricating a ramp-day convention", () => {
    expect(() => calculateProjectRampExposure({startDate: "2027-01-02", endDate: "2027-12-31", operationStartMonth: "2027-05-01", stages: [], terminalLoad: "1", sourceAnchor: "synthetic"})).toThrow("project_month_aligned_period_required");
  });
  it("reproduces C32 published annual unlevered flows and VPL/TIR, independently of the debt", () => {
    const p = c32(); const r = buildInvestmentProject(p);
    // From C32/projeto_resultados.json, not values computed by this TS implementation.
    expect(r.rows.map(q => new Exact(q.unleveredCashFlow).toDecimalPlaces(2).toNumber())).toEqual([-10, -11.66, 4.13, 4.3, 4.47, 4.64, 4.83, 5.02, 5.22, 5.43, 11.46]);
    expect(r.rows[1]!.changeInWorkingCapital).toBe("5.8125"); expect(r.rows.at(-1)!.changeInWorkingCapital).toBe("-5.8125");
    const v = valueInvestmentProject(valuation(p, 2));
    expect(new Exact(v.netPresentValue).toDecimalPlaces(1).toNumber()).toBe(0.7);
    expect(v.irrStatus).toBe("calculated"); expect(new Exact(v.annualIrr!).times(100).toDecimalPlaces(1).toNumber()).toBe(15.8);
    const lowerWacc = valueInvestmentProject({...valuation(p, 2), discountRate: "0.115"});
    expect(new Exact(lowerWacc.netPresentValue).toDecimalPlaces(1).toNumber()).toBe(4.5);
    // Oracle adds one extra year to an interpolation on a t=0-first-year grid.
    expect(new Exact(v.payback!.interpolatedTimeYears).toDecimalPlaces(1).toNumber()).toBe(5.9);
  });
  it("reproduces C04 poor project economics before proposing any debt", () => {
    const v = valueInvestmentProject(valuation(c04(), 1));
    expect(new Exact(v.netPresentValue).toDecimalPlaces(1).toNumber()).toBe(-26.7);
    expect(new Exact(v.annualIrr!).times(100).toDecimalPlaces(1).toNumber()).toBe(6.8);
    expect(new Exact(v.payback!.interpolatedTimeYears).toDecimalPlaces(1).toNumber()).toBe(10.7);
  });
  it("does not automatically release terminal working capital", () => {
    const p = c32(); p.periods.at(-1)!.closingIncrementalWorkingCapital = structuredClone(p.periods.at(-2)!.closingIncrementalWorkingCapital);
    expect(buildInvestmentProject(p).rows.at(-1)!.changeInWorkingCapital).toBe("0");
  });
  it("distinguishes fixed costs during active time from costs scaling with load", () => {
    const p = c32(); p.periods[1]!.fixedCostScaling = "active_time";
    expect(new Exact(buildInvestmentProject(p).rows[1]!.incrementalEbitda).toNumber()).toBeCloseTo(2.6875, 12);
  });
  it("refuses duplicate, missing, impossible-date or inconsistent exposure periods", () => {
    let p = c32(); p.periods.splice(2, 1); expect(() => buildInvestmentProject(p)).toThrow("project_period_coverage");
    p = c32(); p.periods[1]!.id = p.periods[0]!.id; expect(() => buildInvestmentProject(p)).toThrow("project_duplicate_period");
    p = c32(); p.periods[0]!.endDate = "2026-02-30"; expect(() => buildInvestmentProject(p)).toThrow();
    p = c32(); p.periods[1]!.loadYearFraction = "1"; expect(() => buildInvestmentProject(p)).toThrow("project_load_exceeds_active_time");
  });
  it("does not infer a cash tax benefit on a loss", () => {
    const p = c32(); p.periods[1]!.annualFixedOperatingCost = "50";
    const noBenefit = buildInvestmentProject(p); expect(noBenefit.rows[1]!.incrementalCashTax).toBe("0");
    p.periods[1]!.lossTaxTreatment = "immediate_cash_benefit";
    expect(new Exact(buildInvestmentProject(p).rows[1]!.incrementalCashTax).lt(0)).toBe(true);
  });
  it("keeps a dated NPV separate from the adopted annual calibration", () => {
    const input: ProjectValuationInput = {baseDate: "2027-01-01", currency: "BRL", moneyUnit: "BRL",
      flows: [{id: "capex", date: "2027-01-01", amount: "-100", sourceAnchor: "synthetic"}, {id: "terminal", date: "2028-01-01", amount: "110", sourceAnchor: "synthetic"}],
      timing: "actual_365_fixed", timingSourceAnchor: "actual elapsed civil days divided by 365", discountRate: "0.1", irrLower: "-0.2", irrUpper: "1", flowPrecision: {mode: "unrounded"}};
    const v = valueInvestmentProject(input); expect(v.netPresentValue).toBe("0"); expect(v.annualIrr).toBe("0.1");
    expect(v.payback!.interpolatedTimeYears).toBe(new Exact(100).div(110).toDecimalPlaces(20).toFixed());
  });
  it("retains NPV but refuses an arbitrary IRR for a nonconventional stream", () => {
    const i = valuation(c04(), 1); i.flows.at(-1)!.amount = "-100";
    const r = valueInvestmentProject(i); expect(r.irrStatus).toBe("nonconventional_stream"); expect(r.annualIrr).toBeNull();
  });
  it("reports a root outside the explicit bracket, not an endpoint pretending to be IRR", () => {
    const i = valuation(c32(), 2); i.irrUpper = "0.01";
    expect(valueInvestmentProject(i).irrStatus).toBe("root_not_bracketed");
  });
  it("requires strictly increasing valuation times, identified flow rounding and no hidden time overrides", () => {
    let i = valuation(c04(), 1); i.flows[1]!.adoptedTimeYears = "0"; expect(() => valueInvestmentProject(i)).toThrow("project_valuation_time_order");
    i = valuation(c04(), 1); i.timing = "actual_365_fixed"; expect(() => valueInvestmentProject(i)).toThrow("project_unused_adopted_time");
    i = valuation(c04(), 1); delete i.flows[2]!.adoptedTimeYears; expect(() => valueInvestmentProject(i)).toThrow("project_adopted_time_required");
  });
  it("holds baseline and financing constant, with restricted cash unavailable in both cases", () => {
    const r = projectCompanyWithAndWithoutInvestment(counterfactual());
    expect(r.rows.every(q => q.closingRestrictedCash === "7")).toBe(true);
    expect(r.rows[0]!.withoutProject.closingAvailableCash).toBe("26.2");
    expect(r.rows[0]!.withProject.closingAvailableCash).toBe("16.2");
    expect(new Exact(r.rows[1]!.withProject.ebitda).toNumber()).toBeCloseTo(43.25, 12);
    expect(r.requiredDebtHorizon).toBe("2033-12-31"); expect(r.financingHeldConstant).toBe(true); expect(r.intraperiodLiquidityVerified).toBe(false);
  });
  it("recalculates company taxes when baseline losses absorb project profit", () => {
    const i = counterfactual(); i.periods[1]!.taxableBaseBeforeProject = "-5";
    const r = projectCompanyWithAndWithoutInvestment(i); const row = r.rows[1]!;
    expect(row.withProject.cashTax).toBe("0"); expect(row.withoutProject.cashTax).toBe("0");
    expect(new Exact(row.incrementalCompanyCash).toNumber()).toBeCloseTo(3.25 - 0.4 - 8 - 5.8125, 12);
    expect(new Exact(row.incrementalCompanyCash).minus(r.project.rows[1]!.unleveredCashFlow).toNumber()).toBeCloseTo(0.697, 12);
  });
  it("refuses to stop the company projection before the new debt is repaid", () => {
    const i = counterfactual(); i.project.periods = i.project.periods.slice(0, 3); i.project.endDate = "2028-12-31"; i.periods = i.periods.slice(0, 3);
    expect(() => projectCompanyWithAndWithoutInvestment(i)).toThrow("company_final_amortization_horizon_required");
  });
  it("refuses different periods, duplicate debt identities or spending restricted money below zero", () => {
    let i = counterfactual(); i.periods[1]!.periodId = "other"; expect(() => projectCompanyWithAndWithoutInvestment(i)).toThrow("company_counterfactual_period_mismatch");
    i = counterfactual(); if (i.debtInventory.status === "provided") i.debtInventory.instruments.push(i.debtInventory.instruments[0]!);
    expect(() => projectCompanyWithAndWithoutInvestment(i)).toThrow("company_duplicate_debt_identity");
    i = counterfactual(); i.periods[1]!.netRestrictedCashMovement = "-8"; expect(() => projectCompanyWithAndWithoutInvestment(i)).toThrow("company_restricted_cash_negative");
  });
  it("does not invent missing future company drivers", () => {
    const i = counterfactual(); i.periods.pop(); expect(() => projectCompanyWithAndWithoutInvestment(i)).toThrow("company_counterfactual_periods_required");
  });
  it("does not mutate operands or the application's Decimal precision", () => {
    const p = c32(); const before = structuredClone(p); const precision = Decimal.precision;
    try {Decimal.set({precision: 5}); expect(buildInvestmentProject(p).rows[1]!.changeInWorkingCapital).toBe("5.8125"); expect(Decimal.precision).toBe(5);}
    finally {Decimal.set({precision});} expect(p).toEqual(before);
  });
  it("refuses debt stock inconsistent with a supposedly complete maturity inventory", () => {
    let i = counterfactual(); i.periods.at(-1)!.closingDebtStock = "1";
    expect(() => projectCompanyWithAndWithoutInvestment(i)).toThrow("company_debt_not_settled_at_horizon");
    i = counterfactual(); i.debtInventory = {status: "no_debt", reason: "synthetic declared no debt"};
    expect(() => projectCompanyWithAndWithoutInvestment(i)).toThrow("company_debt_inventory_mismatch");
  });

});
