import Decimal from "decimal.js";
import {describe, expect, it} from "vitest";
import {buildDriverOperatingProjection, type DriverOperatingProjectionInput, type DriverProjectionScenario} from "./operating-projection";

// Aurora (ficha C24, synthetic). BRL millions, volume in thousand tonnes, unit costs in BRL per kg;
// figures are those of the independent oracle (modelo_c24.py / resultados.json).
const three = (v: string) => [v, v, v];
const scenario = (id: string, o: Partial<DriverProjectionScenario> = {}): DriverProjectionScenario =>
  ({id, label: id, role: "alternative", basedOn: "base", volumeGrowthRate: null, volumeFactor: null, overrides: {}, inputCostShock: null, ...o});
const auroraProjection = (): DriverOperatingProjectionInput => ({
  currency: "BRL", dayCountBasis: 360, calibrationTolerance: "0.005",
  actual: {id: "2025", startDate: "2025-01-01", endDate: "2025-12-31", reportedRevenue: "420", reportedEbitda: "52",
    drivers: {volume: "105", netUnitPrice: "4", inputCostPerUnit: "0.992", otherVariableCostPerUnit: "1.767", fixedCosts: "78.3",
      receivableDays: "50", inventoryDays: "45", payableDays: "45"}},
  periods: [2026, 2027, 2028].map((y) => ({id: String(y), startDate: `${y}-01-01`, endDate: `${y}-12-31`})),
  base: {volume: ["107.5", "110", "112.5"], netUnitPrice: ["4.1", "4.215", "4.32"], inputCostPerUnit: ["1.01", "1.04", "1.07"],
    otherVariableCostPerUnit: ["1.822", "1.882", "1.9327"], fixedCosts: ["81.8", "85.6", "89.4"],
    receivableDays: three("50"), inventoryDays: three("45"), payableDays: three("45"), maintenanceCapex: three("8"), leasePayments: three("3"),
    depreciation: three("12"), interestExpense: ["17.5", "15", "15"], taxRate: three("0.34")},
  scenarios: [
    scenario("trigo-repasse-6m", {inputCostShock: {fromPeriodId: "2027", rate: "0.15", passThroughLagMonths: 6}}),
    scenario("trigo-sem-repasse", {inputCostShock: {fromPeriodId: "2027", rate: "0.15", passThroughLagMonths: 12}}),
    scenario("prazo-60", {overrides: {receivableDays: three("60")}}),
    scenario("volume-menor", {volumeFactor: "0.98"}),
    scenario("informado", {role: "informed", volumeGrowthRate: "0.03", overrides: {receivableDays: three("60")}}),
    scenario("informado-trigo-4m", {role: "informed", basedOn: "informado", inputCostShock: {fromPeriodId: "2027", rate: "0.15", passThroughLagMonths: 4}}),
  ],
  companyVersions: [
    {id: "orcamento", label: "Orçamento 2026 aprovado", status: "approved", periodId: "2026", metric: "ebitda", value: "58"},
    {id: "revisao-julho", label: "Revisão de julho", status: "under_review", periodId: "2026", metric: "ebitda", value: "55.5"},
  ],
});
const r1 = (v: string | null | undefined, p = 1) => new Decimal(v!).toDecimalPlaces(p, Decimal.ROUND_HALF_UP).toNumber();

describe("operating projection by driver", () => {
  const r = buildDriverOperatingProjection(auroraProjection()), p = r.projection!;
  const s = (id: string) => p.scenarios.find((x) => x.id === id)!;
  it("rebuilds the last actual year from its drivers within the tolerance", () => {
    expect([r1(r.calibration.modeledRevenue), r1(r.calibration.modeledEbitda), r.calibration.reproduces]).toEqual([420, 52, true]);
  });
  it("projects the base with cash available near sixty percent of EBITDA", () => {
    expect(p.base.map((x) => r1(x.revenue, 2))).toEqual([440.75, 463.65, 486]);
    expect(p.base.map((x) => r1(x.ebitda))).toEqual([54.5, 56.6, 58.8]);
    expect(p.base.map((x) => r1(x.changeInWorkingCapital))).toEqual([2.9, 3.2, 3.1]);
    expect(p.base.map((x) => r1(x.incomeTax))).toEqual([7.5, 9.1, 9.8]);
    expect(p.base.map((x) => r1(x.cashAvailableForDebt))).toEqual([33.1, 33.4, 34.9]);
    expect(p.base.map((x) => r1(x.conversion, 2))).toEqual([0.61, 0.59, 0.59]);
  });
  it("reads the input cost shock with its pass-through rule and the other scenarios", () => {
    expect([r1(s("trigo-repasse-6m").rows[1]!.ebitda), r1(s("trigo-repasse-6m").rows[1]!.cashAvailableForDebt), r1(s("trigo-repasse-6m").rows[1]!.netUnitPrice, 3)]).toEqual([48.1, 26.5, 4.293]);
    expect([r1(s("trigo-sem-repasse").rows[1]!.ebitda), r1(s("trigo-sem-repasse").rows[1]!.cashAvailableForDebt)]).toEqual([39.5, 22.1]);
    expect(s("trigo-sem-repasse").rows.map((x) => r1(x.ebitda))).toEqual([54.5, 39.5, 58.8]);
    expect([r1(s("prazo-60").rows[0]!.changeInWorkingCapital), r1(s("prazo-60").rows[0]!.cashAvailableForDebt)]).toEqual([15.1, 20.9]);
    expect([r1(s("volume-menor").rows[1]!.ebitda), r1(s("volume-menor").rows[1]!.cashAvailableForDebt)]).toEqual([53.8, 31.6]);
  });
  it("reproduces the informed turn and its shock over it", () => {
    expect(s("informado").rows.map((x) => r1(x.ebitda))).toEqual([55.3, 58.4, 61.7]);
    expect([r1(s("informado").rows[0]!.changeInWorkingCapital), r1(s("informado").rows[0]!.cashAvailableForDebt)]).toEqual([15.6, 21]);
    expect([r1(s("informado-trigo-4m").rows[1]!.ebitda), r1(s("informado-trigo-4m").rows[1]!.cashAvailableForDebt)]).toEqual([52.6, 27.7]);
    expect(r1(s("informado").rows[0]!.effects.changeInWorkingCapital)).toBe(12.7);
    expect(p.largestCashReduction).toMatchObject({scenarioId: "prazo-60", periodId: "2026"});
  });
  it("states sensitivities in currency and compares company versions without replacing them", () => {
    expect([r1(p.sensitivities[1]!.ebitdaPerOnePercentPrice, 2), r1(p.sensitivities[1]!.ebitdaLossPerOnePercentInputCost, 2),
      r1(p.sensitivities[1]!.workingCapitalPerReceivableDay, 2), r1(p.sensitivities[1]!.pricePercentShareOfEbitda, 3)]).toEqual([4.64, 1.14, 1.29, 0.082]);
    expect(p.comparisons.map((c) => [c.id, c.companyValue, r1(c.difference, 2), r1(c.unitPriceEquivalent, 4)])).toEqual([["orcamento", "58", 3.49, 0.0325], ["revisao-julho", "55.5", 0.99, 0.0092]]);
  });
  it("withholds the projection when the last year is not reproduced", () => {
    const i = auroraProjection(); i.actual.drivers.fixedCosts = "70";
    const w = buildDriverOperatingProjection(i);
    expect(w.calibration.reproduces).toBe(false); expect(w.projection).toBeNull();
  });
  it("refuses malformed drivers, rules and references", () => {
    const refuse = (change: (i: DriverOperatingProjectionInput) => void, code: string) => {const i = auroraProjection(); change(i); expect(() => buildDriverOperatingProjection(i)).toThrow(code);};
    refuse((i) => {i.base.volume = ["107.5", "110"];}, "operating_projection_column_length");
    refuse((i) => {i.scenarios = [scenario("x", {basedOn: "later"}), scenario("later")];}, "operating_projection_unknown_scenario");
    refuse((i) => {i.scenarios = [scenario("x", {volumeGrowthRate: "0.03", overrides: {volume: three("1")}})];}, "operating_projection_volume_rule_conflict");
    refuse((i) => {i.scenarios = [scenario("x", {inputCostShock: {fromPeriodId: "2030", rate: "0.1", passThroughLagMonths: 6}})];}, "operating_projection_unknown_period");
    refuse((i) => {i.scenarios = [scenario("x", {inputCostShock: {fromPeriodId: "2027", rate: "0.1", passThroughLagMonths: 13}})];}, "operating_projection_pass_through_lag");
    refuse((i) => {i.scenarios = [scenario("base")];}, "operating_projection_scenario_identity");
    refuse((i) => {i.companyVersions[0]!.periodId = "2025";}, "operating_projection_unknown_period");
    refuse((i) => {i.base.volume = ["-1", "110", "112.5"];}, "operating_projection_invalid_amount");
    refuse((i) => {i.base.fixedCosts = ["81.812345678", "85.6", "89.4"];}, "operating_projection_invalid_amount");
    refuse((i) => {(i as {dayCountBasis: number}).dayCountBasis = 30;}, "operating_projection_day_count_basis");
    refuse((i) => {i.periods[1]!.startDate = "2027-01-02";}, "operating_projection_period_coverage");
  });
  it("is deterministic and independent of global Decimal configuration", () => {
    const precision = Decimal.precision, rounding = Decimal.rounding;
    try {Decimal.set({precision: 3, rounding: Decimal.ROUND_DOWN}); expect(buildDriverOperatingProjection(auroraProjection())).toEqual(r);}
    finally {Decimal.set({precision, rounding});}
  });
});
