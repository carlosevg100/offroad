import Decimal from "decimal.js";
import {describe, expect, it} from "vitest";
import {calculateAdoptedInvestmentAnalysis, type AdoptedInvestmentAnalysisInput} from "./adopted-investment-analysis";
import {analysisTestBasis, analysisTestId as id} from "./adopted-analysis.test-support";
// Source money has the platform's adopted eight-decimal precision. Derived flows retain
// engine precision and are never rounded back into observations.
const D = Decimal.clone({precision: 60}), mm = (v: string) => new D(v).times(1000000).toDecimalPlaces(8).toFixed();

function fixture() {
  const f = analysisTestBasis(`investment.${id(4)}.`, "2025-12-31", "2036-12-31"), years = Array.from({length: 11}, (_, k) => 2026 + k);
  const number = (p: string, unit: string, value: string) => f.contribute(p, unit, {type: "number", value});
  const text = (p: string, value: string) => f.contribute(p, "convention", {type: "text", value});
  const date = (p: string, value: string) => f.contribute(p, "date", {type: "date", value});
  const list = (p: string, unit: string, value: string[]) => f.contribute(p, unit, {type: "list", value});
  const money = Object.fromEntries(["annualNetRevenue", "annualAvoidedOperatingCost", "annualVariableOperatingCost", "annualFixedOperatingCost", "annualMaintenanceCapex", "growthCapexPaid", "annualDepreciation"].map(k => [k, list("project." + k, "currency", years.map(y => {
    const growth = new D("1.04").pow(Math.max(0, y - 2027));
    return k === "annualNetRevenue" ? "0" : k === "annualAvoidedOperatingCost" ? mm(growth.times(30).toFixed())
      : k === "annualVariableOperatingCost" ? mm(growth.times("19.5").toFixed()) : k === "annualFixedOperatingCost" ? mm(growth.times("4.5").toFixed())
      : k === "annualMaintenanceCapex" ? mm("0.6") : k === "annualDepreciation" ? mm("1.8") : y === 2026 ? mm("10") : y === 2027 ? mm("8") : "0";
  }))]));
  const opening = Object.fromEntries(["receivables", "inventory", "newPayables", "lostSupplierCredit"].map(k => [k, number("project.openingWorkingCapital." + k, "currency", "0")]));
  const project = {money, openingWorkingCapital: opening, cashTaxRate: list("project.cashTaxRate", "ratio", years.map(() => "0.34")),
    lossTaxTreatment: list("project.lossTaxTreatment", "convention", years.map(() => "no_cash_benefit")), fixedCostScaling: list("project.fixedCostScaling", "convention", years.map(() => "load")),
    exposure: {mode: "monthly_ramp", operationStartMonth: date("project.ramp.operationStartMonth", "2027-05-01"), stageMonths: list("project.ramp.stageMonths", "months", ["3"]), stageLoads: list("project.ramp.stageLoads", "ratio", ["0.5"]), terminalLoad: number("project.ramp.terminalLoad", "ratio", "1")},
    closingWorkingCapital: {mode: "startup_drivers", startup: {money: {annualIncrementalRevenue: number("project.startup.annualIncrementalRevenue", "currency", "0"), annualNewVariableCost: number("project.startup.annualNewVariableCost", "currency", mm("19.5")), annualDisplacedPurchases: number("project.startup.annualDisplacedPurchases", "currency", mm("30"))},
      days: {receivableDays: number("project.startup.receivableDays", "days", "0"), inventoryDays: number("project.startup.inventoryDays", "days", "45"), newSupplierDays: number("project.startup.newSupplierDays", "days", "30"), lostSupplierDays: number("project.startup.lostSupplierDays", "days", "60")}, adoptedYearDays: text("project.startup.adoptedYearDays", "360")},
      retainedCapitalMultipliers: list("project.startup.retainedCapitalMultipliers", "ratio", years.map(y => y === 2026 || y === 2036 ? "0" : "1"))}};
  const companyMoney = {ebitda: "40", nonCashEbitdaBridge: "0", cashLeasePayments: "3", netWorkingCapitalChange: "2", maintenanceCapex: "8", growthCapex: "4", taxableBaseBeforeProject: "20", netFinancingCashAvailable: "-10", netCapitalCashAvailable: "0", netRestrictedCashMovement: "0", closingDebtStock: "30"};
  const company = {openingAvailableCash: number("company.openingAvailableCash", "currency", mm("20")), openingRestrictedCash: number("company.openingRestrictedCash", "currency", mm("7")),
    money: Object.fromEntries(Object.entries(companyMoney).map(([k, v]) => [k, list("company." + k, "currency", years.map(y => k === "closingDebtStock" && y >= 2033 ? "0" : mm(v)))])),
    cashTaxRate: list("company.cashTaxRate", "ratio", years.map(() => "0.34")), lossTaxTreatment: list("company.lossTaxTreatment", "convention", years.map(() => "no_cash_benefit")),
    debtInventoryStatus: text("company.debtInventoryStatus", "provided"), debtIds: list("company.debtIds", "identity", ["synthetic-debt"]), finalPaymentDates: list("company.finalPaymentDates", "date", ["2033-12-31"])};
  const valuation = {perspective: text("valuation.perspective", "standalone_project"), baseDate: date("valuation.baseDate", "2026-12-31"), timing: text("valuation.timing", "adopted_times"), adoptedTimes: list("valuation.adoptedTimes", "years", years.map((_, k) => String(k))),
    discountRate: number("valuation.discountRate", "ratio", "0.15"), irrLower: number("valuation.irrLower", "ratio", "-0.5"), irrUpper: number("valuation.irrUpper", "ratio", "2"), precisionMode: text("valuation.precisionMode", "unrounded"), precisionDecimals: number("valuation.precisionDecimals", "count", "0"), precisionQuantum: number("valuation.precisionQuantum", "currency", "0")};
  const input = {...f.context, analysisId: id(4), scenario: "base", periodEnds: list("periodEnds", "date", years.map(y => `${y}-12-31`)), project, company, valuation} as unknown as AdoptedInvestmentAnalysisInput;
  return {...f, input, seal: () => ({...input, envelope: f.seal()})};
}

describe("investment before financing over adopted company and project", () => {
  it("derives C32 startup capital, eleven annual flows and value from adopted drivers", () => {
    const f = fixture(), r = calculateAdoptedInvestmentAnalysis(f.seal());
    expect(r.startupCapital?.netRequirement).toBe("5812500"); expect(r.startupCapital?.lostSupplierCredit).toBe("5000000");
    expect(r.project!.rows.map(q => new D(q.unleveredCashFlow).div(1000000).toDecimalPlaces(2).toNumber())).toEqual([-10, -11.66, 4.13, 4.3, 4.47, 4.64, 4.83, 5.02, 5.22, 5.43, 11.46]);
    expect(new D(r.valuation!.netPresentValue).div(1000000).toDecimalPlaces(1).toNumber()).toBe(0.7);
    expect(new D(r.valuation!.annualIrr!).times(100).toDecimalPlaces(1).toNumber()).toBe(15.8);
    expect(r.valuation!.cashFlowTrace[0]!.timeYears).toBe("0");
    expect(r.company?.requiredDebtHorizon).toBe("2033-12-31"); expect(r.company?.financingHeldConstant).toBe(true);
    expect(r.contributions).toHaveLength(f.entries.length); expect(calculateAdoptedInvestmentAnalysis(f.seal())).toEqual(r);
    expect(r.grantsExecution).toBe(false); expect(r.grantsPublication).toBe(false);
  });
  it("continues the monthly ramp through January after a November startup", () => {
    const f = fixture(); f.set("project.ramp.operationStartMonth", {type: "date", value: "2027-11-01"}); const r = calculateAdoptedInvestmentAnalysis(f.seal());
    expect(r.ramp![1]!.activeMonths).toBe(2); expect(new D(r.ramp![2]!.loadEquivalentYearFraction).times(12).toNumber()).toBeCloseTo(11.5, 12);
    expect(r.project?.rows[1]!.changeInWorkingCapital).toBe("5812500");
  });
  it("analyzes C04's investment before financing using adopted stocks and period exposures", () => {
    const f = fixture(), years = Array.from({length: 17}, (_, k) => 2027 + k);
    f.input.openingDate = "2026-12-31"; f.input.endDate = "2043-12-31"; f.input.company = null;
    f.set("periodEnds", {type: "list", value: years.map(y => `${y}-12-31`)});
    const values = {annualNetRevenue: "80", annualAvoidedOperatingCost: "0", annualVariableOperatingCost: "68", annualFixedOperatingCost: "0", annualMaintenanceCapex: "1.5", annualDepreciation: "4"};
    for (const [k, v] of Object.entries(values)) f.set("project." + k, {type: "list", value: years.map(() => mm(v))});
    f.set("project.growthCapexPaid", {type: "list", value: years.map(y => y < 2029 ? mm("30") : "0")});
    for (const [k, v] of [["cashTaxRate", "0.34"], ["lossTaxTreatment", "no_cash_benefit"], ["fixedCostScaling", "load"]]) f.set("project." + k, {type: "list", value: years.map(() => v!)});
    const list = (p: string, unit: string, value: string[]) => f.contribute(p, unit, {type: "list", value});
    f.input.project.exposure = {mode: "provided_period_exposures", loadYearFractions: list("project.exposure.loadYearFractions", "ratio", years.map(y => y < 2029 ? "0" : y === 2029 ? "0.5" : "1")), activeYearFractions: list("project.exposure.activeYearFractions", "ratio", years.map(y => y < 2029 ? "0" : "1"))};
    f.input.project.closingWorkingCapital = {mode: "provided_stocks", stocks: {
      receivables: list("project.closingWorkingCapital.receivables", "currency", years.map(y => y === 2029 ? mm("6") : y >= 2030 && y < 2043 ? mm("12") : "0")),
      inventory: list("project.closingWorkingCapital.inventory", "currency", years.map(() => "0")), newPayables: list("project.closingWorkingCapital.newPayables", "currency", years.map(() => "0")), lostSupplierCredit: list("project.closingWorkingCapital.lostSupplierCredit", "currency", years.map(() => "0"))}};
    f.set("valuation.adoptedTimes", {type: "list", value: years.map((_, k) => String(k))}); f.set("valuation.baseDate", {type: "date", value: "2027-12-31"});
    for (const e of f.entries) {e.dimensions.periodStart = f.input.openingDate; e.dimensions.periodEnd = f.input.endDate;}
    const unrounded = calculateAdoptedInvestmentAnalysis(f.seal());
    // Independent Python with the same raw drivers gives 6.726855701373891%; the
    // original oracle rounds flows to 0.1 BRL million before valuation, yielding
    // 6.754497888348132%, displayed as 6.8%. Preserve both and their chosen precision.
    expect(new D(unrounded.valuation!.annualIrr!).times(100).toNumber()).toBeCloseTo(6.726855701373891, 11);
    f.set("valuation.precisionMode", {type: "text", value: "calibration_monetary_quantum"});
    f.set("valuation.precisionQuantum", {type: "number", value: "100000"});
    const r = calculateAdoptedInvestmentAnalysis(f.seal());
    expect(new D(r.valuation!.netPresentValue).div(1000000).toDecimalPlaces(1).toNumber()).toBe(-26.7);
    expect(new D(r.valuation!.annualIrr!).times(100).toDecimalPlaces(1).toNumber()).toBe(6.8);
    expect(r.project!.rows[2]!.changeInWorkingCapital).toBe("6000000"); expect(r.project!.rows.at(-1)!.changeInWorkingCapital).toBe("-12000000");
    expect(r.company).toBeNull(); expect(r.startupCapital).toBeNull(); expect(r.ramp).toBeNull(); expect(r.status).toBe("missing_inputs");
  });
  it("preserves financed supplier credit in verticalization with no new revenue", () => {
    const f = fixture(); f.set("project.startup.annualIncrementalRevenue", {type: "number", value: "0"});
    const r = calculateAdoptedInvestmentAnalysis(f.seal()); expect(r.startupCapital?.receivables).toBe("0"); expect(r.startupCapital?.netRequirement).toBe("5812500");
    f.set("project.startup.lostSupplierDays", {type: "number", value: "0"}); expect(calculateAdoptedInvestmentAnalysis(f.seal()).startupCapital?.netRequirement).toBe("812500");
  });
  it("values incremental company cash under joint taxes instead of adding standalone project tax", () => {
    const f = fixture(); f.set("valuation.perspective", {type: "text", value: "incremental_company"});
    f.set("company.taxableBaseBeforeProject", {type: "list", value: Array(11).fill("-20000000")});
    const r = calculateAdoptedInvestmentAnalysis(f.seal());
    expect(r.project!.rows[1]!.incrementalCashTax).not.toBe("0"); expect(r.company!.rows[1]!.withProject.cashTax).toBe("0");
    expect(r.valuation!.cashFlowTrace[1]!.amount).toBe(r.company!.rows[1]!.incrementalCompanyCash);
    expect(r.company!.rows[0]!.closingRestrictedCash).toBe("7000000");
  });
  it("keeps the supported investment when company data or WACC is absent", () => {
    const f = fixture(); f.input.company = null; const r = calculateAdoptedInvestmentAnalysis(f.seal()); expect(r.project).not.toBeNull(); expect(r.valuation).not.toBeNull(); expect(r.company).toBeNull(); expect(r.status).toBe("missing_inputs");
    const g = fixture(); g.input.valuation.discountRate = {...g.input.valuation.discountRate, decisionId: null, missingReason: "WACC requires adoption"};
    const q = calculateAdoptedInvestmentAnalysis(g.seal()); expect(q.project).not.toBeNull(); expect(q.company).not.toBeNull(); expect(q.valuation).toBeNull();
    g.set("valuation.perspective", {type: "text", value: "incremental_company"}); g.input.company = null; expect(calculateAdoptedInvestmentAnalysis(g.seal()).valuation).toBeNull();
  });
  it("never releases terminal working capital without its adopted stock multiplier", () => {
    const f = fixture(); f.set("project.startup.retainedCapitalMultipliers", {type: "list", value: ["0", ...Array(10).fill("1")]});
    const r = calculateAdoptedInvestmentAnalysis(f.seal()); expect(r.project!.rows.at(-1)!.changeInWorkingCapital).toBe("0");
    expect(r.project!.rows.at(-1)!.closingWorkingCapital).toBe("5812500");
  });
  it("rejects free cash flows, other context and contribution/observation reuse", () => {
    const f = fixture(), i = f.seal(); expect(() => calculateAdoptedInvestmentAnalysis({...i, flows: ["100000000"]})).toThrow();
    expect(() => calculateAdoptedInvestmentAnalysis({...i, scope: {...i.scope, purpose: "other purpose"}})).toThrow("adoption_basis_scope_mismatch");
    for (const change of [{entityId: id(900)}, {periodEnd: "2033-12-31"}, {definitionVersionId: id(901)}, {scenario: "other"}, {currency: "USD"}, {unit: "currency"}, {scale: "1000"}]) {
      const g = fixture(), e = g.entries.find(e => e.fieldPath.endsWith("project.ramp.terminalLoad"))!; e.dimensions = {...e.dimensions, ...change}; expect(() => calculateAdoptedInvestmentAnalysis(g.seal())).toThrow();
    }
    const g = fixture(); g.entries[0]!.observationId = id(800); g.entries[1]!.observationId = id(800); expect(() => calculateAdoptedInvestmentAnalysis(g.seal())).toThrow("analysis_missing_or_reused_contribution");
  });
  it("refuses missing future drivers, unequal columns and maturities beyond the projection", () => {
    const f = fixture(); f.set("company.finalPaymentDates", {type: "list", value: ["2040-12-31"]}); expect(() => calculateAdoptedInvestmentAnalysis(f.seal())).toThrow("company_final_amortization_horizon_required");
    const g = fixture(); g.set("company.ebitda", {type: "list", value: ["40000000", "41600000"]}); expect(() => calculateAdoptedInvestmentAnalysis(g.seal())).toThrow("investment_adopted_series_mismatch");
    const h = fixture(); h.input.company!.money.ebitda = {...h.input.company!.money.ebitda, decisionId: null, missingReason: "Future company projection not adopted"};
    expect(calculateAdoptedInvestmentAnalysis(h.seal()).company).toBeNull();
  });
  it("distinguishes actual dated discounting from the explicit oracle time grid", () => {
    const f = fixture();
    f.set("valuation.timing", {type: "text", value: "actual_365_fixed"}); expect(() => calculateAdoptedInvestmentAnalysis(f.seal())).toThrow("investment_unused_valuation_times");
    f.set("valuation.adoptedTimes", {type: "list", value: []}); f.set("valuation.baseDate", {type: "date", value: "2025-12-31"});
    const dated = calculateAdoptedInvestmentAnalysis(f.seal()); expect(dated.valuation!.cashFlowTrace[0]!.timeYears).toBe("1");
    expect(dated.valuation!.operands.timing).toBe("actual_365_fixed");
    expect(dated.valuation!.cashFlowTrace.every(row => new D(row.timeYears).gt(0))).toBe(true);
    f.set("valuation.precisionDecimals", {type: "number", value: "2"}); expect(() => calculateAdoptedInvestmentAnalysis(f.seal())).toThrow("investment_unused_rounding_precision");
  });
});
