import {describe, expect, it} from "vitest";
import {challengeProjection, projectByDrivers, type ProjectionChallengeInput, type ProjectionDriverCase} from "./projection-challenge";

// Aurora Alimentos (fichas C24 and C26, synthetic). Volume in thousand tonnes, price and variable cost in
// BRL per kg, other values in BRL millions. Expectations from modelo_c26.py / resultados.json.
const years = ["2025", "2026", "2027", "2028"];
const variable = ["2.759", "2.832", "2.922", "3.0027"];
const interest = ["17.5", "17.5", "15", "15"];
const build = (quantity: string[], price: string[], fixed: string[], receivableDays: string, capex: string): ProjectionDriverCase => ({
  periods: years.map((id, i) => ({id, quantity: quantity[i]!, netUnitPrice: price[i]!, variableUnitCost: variable[i]!, fixedCosts: fixed[i]!, interestExpense: interest[i]!})),
  receivableDays, inventoryDays: "45", payableDays: "45", maintenanceCapex: capex, leasePayments: "3", depreciation: "12", taxRate: "0.34"});
export const auroraReference = build(["105", "107.5", "110", "112.5"], ["4", "4.1", "4.215", "4.32"], ["78.3", "81.8", "85.6", "89.4"], "50", "8");
export const auroraPlan = build(["105", "109.7", "114.7", "119.8"], ["4", "4.14", "4.285", "4.435"], ["78.3", "80.6", "83.1", "85.6"], "45", "5");
export const auroraChallenge: ProjectionChallengeInput = {currency: "BRL", dayBasis: "360", targetPeriodId: "2028", reference: auroraReference, plan: auroraPlan,
  assumptions: [
    {id: "volume", label: "Volume +4,5% ao ano", drivers: ["quantity"]},
    {id: "preco", label: "Preço +3,5% ao ano", drivers: ["netUnitPrice"]},
    {id: "fixos", label: "Custos fixos +3% ao ano", drivers: ["fixedCosts"]},
    {id: "prazo-capex", label: "Prazo de 45 dias e capex de manutenção de R$ 5 mi", drivers: ["receivableDays", "maintenanceCapex"]},
  ],
  capacity: {maximumQuantity: "118", investmentInPlan: false}, requestedReceivableDays: "60", premiumOverAverage: null};
const n = (v: string | null | undefined, p = 1) => Number(v).toFixed(p);

describe("projection challenge", () => {
  const r = challengeProjection(auroraChallenge);
  const effect = (id: string) => r.effects.find(e => e.assumptionId === id)!;
  it("projects the C24 reference by drivers", () => {
    const b = projectByDrivers(auroraReference, "360")[3]!;
    expect([n(b.revenue.toFixed()), n(b.ebitda.toFixed()), n(b.margin!.mul(100).toFixed()), n(b.tax.toFixed()), n(b.cashAvailable!.toFixed())]).toEqual(["486.0", "58.8", "12.1", "9.8", "34.9"]);
  });
  it("reproduces the plan and the gap in 2028", () => {
    expect(r.plan.map(x => n(x.ebitda))).toEqual(["52.0", "62.9", "73.2", "86.0"]);
    expect(r.plan.map(x => n(Number(x.margin) * 100 + ""))).toEqual(["12.4", "13.8", "14.9", "16.2"]);
    expect(n(r.plan[3]!.cashAvailable)).toBe("54.0");
    expect([n(r.gap.ebitda), n(r.gap.cash)]).toEqual(["27.2", "19.1"]);
    expect(r.plan[0]!.cashAvailable).toBeNull();
  });
  it("isolates each assumption from the reference, in order of size, with the residual", () => {
    expect(r.order.map(o => o.assumptionId)).toEqual(["preco", "volume", "fixos", "prazo-capex"]);
    expect(["preco", "volume", "fixos", "prazo-capex"].map(id => [n(effect(id).fromReference.ebitda), n(effect(id).fromReference.cash)]))
      .toEqual([["12.9", "7.8"], ["9.6", "4.7"], ["3.8", "2.5"], ["0.0", "3.3"]]);
    expect([n(r.interaction.fromReference.ebitda), n(r.interaction.fromReference.cash)]).toEqual(["0.8", "0.7"]);
    expect(n(r.order[2]!.cumulativeShareOfEbitdaGap, 3)).toBe("0.969");
  });
  it("measures the same assumptions from the plan, independent of order", () => {
    expect(["preco", "volume", "fixos", "prazo-capex"].map(id => [n(effect(id).fromPlan.ebitda), n(effect(id).fromPlan.cash)]))
      .toEqual([["13.8", "8.4"], ["10.5", "5.4"], ["3.8", "2.5"], ["0.0", "3.6"]]);
    const reversed = challengeProjection({...auroraChallenge, assumptions: [...auroraChallenge.assumptions].reverse()});
    expect(reversed.effects.map(e => e.fromPlan).reverse()).toEqual(r.effects.map(e => e.fromPlan));
    expect(reversed.order).toEqual(r.order);
    expect(reversed.interaction).toEqual(r.interaction);
  });
  it("reads unit margin, growth, capacity and receivable days", () => {
    expect([n(r.unitMargin.planFirst, 3), n(r.unitMargin.planTarget, 3), n(r.unitMargin.referenceTarget, 3), n(r.unitMargin.planChange, 3)]).toEqual(["1.241", "1.432", "1.317", "0.154"]);
    const volume = effect("volume").drivers[0]!;
    expect([n(volume.planGrowth, 3), n(volume.referenceGrowth, 3)]).toEqual(["0.045", "0.023"]);
    expect(n(effect("fixos").drivers[0]!.referenceGrowth, 3)).toBe("0.045");
    expect(r.capacity).toMatchObject({firstPeriodAbove: "2028", aboveWithoutInvestment: true});
    expect(n(r.capacity!.periodsAbove[0]!.excess)).toBe("1.8");
    expect([n(r.receivables.cashPerDayAtReferenceRevenue, 2), n(r.receivables.cashAtRequestedDays)]).toEqual(["1.35", "22.1"]);
    expect(effect("prazo-capex").drivers.map(d => [d.driver, n(d.plan, 0), n(d.reference, 0)])).toEqual([["receivableDays", "45", "50"], ["maintenanceCapex", "5", "8"]]);
  });
  it("reads the mix the price would need", () => {
    const m = challengeProjection({...auroraChallenge, premiumOverAverage: "0.25"}).premiumMix!;
    expect([n(m.shareNeededAtTarget, 3), n(m.sharePerPeriod, 3)]).toEqual(["0.106", "0.035"]);
  });
  it("refuses a uniform cut, an unexplained difference and an assumption without a number", () => {
    const run = (o: Partial<ProjectionChallengeInput>) => () => challengeProjection({...auroraChallenge, ...o});
    expect(run({assumptions: [{id: "tudo", label: "Corte uniforme", drivers: ["quantity", "netUnitPrice", "fixedCosts", "receivableDays", "maintenanceCapex"]}]})).toThrow("projection_challenge_income_drivers_grouped");
    expect(run({assumptions: auroraChallenge.assumptions.slice(1)})).toThrow("projection_challenge_unassigned_difference");
    expect(run({assumptions: [...auroraChallenge.assumptions, {id: "imposto", label: "Imposto", drivers: ["taxRate"]}]})).toThrow("projection_challenge_assumption_without_difference");
    expect(run({assumptions: [...auroraChallenge.assumptions, {id: "dup", label: "Volume de novo", drivers: ["quantity"]}]})).toThrow("projection_challenge_driver_in_two_assumptions");
    expect(run({targetPeriodId: "2025"})).toThrow("projection_challenge_target_period");
    expect(run({plan: {...auroraPlan, periods: auroraPlan.periods.slice(1)}})).toThrow("projection_challenge_period_mismatch");
    expect(run({capacity: {maximumQuantity: "0", investmentInPlan: false}})).toThrow("projection_challenge_capacity");
    expect(run({plan: {...auroraPlan, taxRate: "1.5"}})).toThrow("projection_challenge_tax_rate");
    expect(run({premiumOverAverage: "0"})).toThrow("projection_challenge_premium_not_positive");
  });
});
