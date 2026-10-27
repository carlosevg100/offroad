import {describe, expect, it} from "vitest";
// The package entry sets the Decimal context the dated-debt kernel requires.
import "./index";
import {capitalPathInstrumentCost, evaluateCapitalStructurePaths as direct, type CapitalStructurePathsInput} from "./capital-structure-paths";
import {auroraCapitalPaths} from "./capital-structure-paths.fixture";

const n = (v: string | null | undefined, p = 2) => Number(v).toFixed(p);
const run = (edit: (i: CapitalStructurePathsInput) => void = () => undefined) => {const i = auroraCapitalPaths(); edit(i); return direct(i);};

describe("capital structure paths", {timeout: 600_000}, () => {
  const r = run();
  const path = (id: string) => r.paths.find((p) => p.id === id)!;
  const year = (id: string, y: number) => path(id).debtServiceByYear.find((x) => x.year === y)!;
  it("reproduces the oracle without action: December 2026 first, 2027 service against cash available before the project", () => {
    const p = path("manter");
    expect([p.belowPolicyMinimum[0], n(p.closingAvailableByPeriod[1]!.closingAvailable), n(p.closingAvailableByPeriod[5]!.closingAvailable)]).toEqual(["2026-12-31", "-10.83", "-78.63"]);
    expect([n(year("manter", 2027).service), n(year("manter", 2027).principal), n(year("manter", 2027).interestPaid), n(year("manter", 2027).availableForService, 1)])
      .toEqual(["89.68", "76.67", "13.01", "35.7"]);
  });
  it("reproduces the recommended plan of the oracle on cash, cost, net debt and the indenture definition", () => {
    const p = path("sem-linha-debenture");
    expect([n(p.minimumCash.amount), p.minimumCash.periodId, n(p.horizonFinancingCost), n(p.netDebtAtHorizon)]).toEqual(["15.46", "2026-12-31", "49.44", "79.31"]);
    expect(p.indenture.base.map((x) => n(x.ratio))).toEqual(["2.20", "1.85", "1.42"]);
    expect([n(p.indenture.stress[1]!.ratio), n(p.stressMinimumCash.amount, 1)]).toEqual(["2.37", "13.1"]);
    expect(p.prepayments.map((x) => [x.instrumentId, n(x.amount), n(x.premium, 5)])).toEqual([["debenture-2021", "45.00", "0.10125"], ["ccb-bradesco", "40.00", "0.40000"]]);
  });
  it("reproduces the oracle's other paths on the same base", () => {
    const rows = ["ccb-tres-anos", "debenture-com-linha", "adiar-linha"].map((id) => [id, n(path(id).minimumCash.amount), n(path(id).horizonFinancingCost), n(path(id).netDebtAtHorizon)]);
    expect(rows).toEqual([["ccb-tres-anos", "-64.71", "34.59", "87.04"], ["debenture-com-linha", "15.04", "56.89", "102.15"], ["adiar-linha", "-60.18", "31.31", "88.84"]]);
    expect([n(path("alongar-com-banco").minimumCash.amount), n(path("alongar-com-banco").horizonFinancingCost), n(year("ccb-tres-anos", 2027).service)]).toEqual(["11.81", "56.54", "102.97"]);
  });
  it("recomputes taxes per path and keeps semiannual interest accrued until paid", () => {
    expect(new Set(r.paths.map((p) => p.taxesInHorizon)).size).toBe(r.paths.length);
    const first = path("manter").closingAvailableByPeriod[0]!;
    expect([n(first.interestPaid), n(first.interestAccrued)]).toEqual(["2.36", "4.85"]);
  });
  it("measures the aggregate basket while the 2021 debenture is outstanding", () => {
    expect([n(path("sem-linha-debenture").basket!.peak), path("sem-linha-debenture").basket!.consentRequired]).toEqual(["15.00", false]);
    expect([n(path("alongar-com-banco").basket!.peak), n(path("alongar-com-banco").basket!.excess), path("alongar-com-banco").basket!.consentRequired]).toEqual(["36.00", "21.00", true]);
    // The 2027 seasonal line with R$ 15 mi of receivables beside the extended Bradesco breaches the basket.
    expect([path("alongar-bradesco").basket!.peakPeriodId, n(path("alongar-bradesco").basket!.peak)]).toEqual(["2027-12-31", "27.00"]);
  });
  it("tests the amortization after the horizon on the capacity kernel", () => {
    const [seven, five] = path("sem-linha-debenture").amortizationTests;
    expect([seven!.passes, n(seven!.years[0]!.scheduledAmortization), n(seven!.years[0]!.availableAfterInterest)]).toEqual([true, "22.67", "23.18"]);
    expect([five!.profileId, five!.passes, five!.firstShortfallYear, n(five!.years[0]!.scheduledAmortization), n(five!.years[0]!.availableAfterInterest, 1)]).toEqual(["cinco-anos", false, 2029, "33.33", "23.7"]);
    expect(path("debenture-com-linha").gates.find((g) => g.id === "amortization_after_horizon")!.status).toBe("not_tested");
  });
  it("orders by declared gates, then cost, and dates the fallback", () => {
    expect(r.ranking.slice(0, 3).map((x) => x.pathId)).toEqual(["sem-linha-debenture", "adiar-linha", "banco-sem-linha"]);
    const rec = r.recommendation!;
    expect([rec.pathId, rec.longInstrumentId, rec.alternative!.pathId, rec.alternative!.conditions]).toEqual(["sem-linha-debenture", "debenture-80", "banco-sem-linha",
      ["basket_without_consent", "amortization_after_horizon"]]);
    expect([rec.mustPrecede, rec.decidedBeforeMaturity, rec.demand!.issueFloorInsideGates, rec.condition!.insideGates]).toEqual([{instrumentId: "ccb-bradesco", date: "2027-09-15"}, true, "74.44", true]);
    expect([n(path("bradesco-sem-linha").shortfallVsPolicyMinimum), path("bradesco-sem-linha").minimumCash.periodId]).toEqual(["18.23", "2028-06-30"]);
  });
  it("prices new debt over its life and says what would change the recommendation", () => {
    const cost = (id: string) => r.instrumentCosts.find((c) => c.instrumentId === id)! as {equivalentSpread?: string; alternatives: {equivalentSpread?: string}[]};
    expect([n(cost("debenture-80").equivalentSpread, 4), n(cost("debenture-80").alternatives[0]!.equivalentSpread, 4), n(r.recommendation!.condition!.cost.status === "calculated" ? r.recommendation!.condition!.cost.equivalentSpread : null, 4)])
      .toEqual(["0.0346", "0.0355", "0.0356"]);
    expect(r.sensitivities.map((s) => [s.id, s.recommendationHolds])).toEqual([["trigo", false], ["prazo-redes-60", false], ["caixa-minimo-25", false]]);
  });
  it("refuses what would bend the method", () => {
    expect(() => run((i) => {i.instruments[0]!.couponTreatment = "cash_paid";})).toThrow("capital_paths_coupon_calendar_mismatch");
    expect(() => run((i) => {i.basket!.occupied = "0";})).toThrow("capital_paths_basket_usage_understated");
    expect(() => run((i) => {i.instruments.find((x) => x.id === "debenture-80")!.afterHorizon = {kind: "none"};})).toThrow("capital_paths_residual_without_after_horizon_terms");
    expect(() => run((i) => {i.paths[0]!.instrumentIds = ["debenture-2021", "finame"];})).toThrow("capital_paths_existing_debt_omitted");
    expect(() => direct({...auroraCapitalPaths(), cashTaxes: ["1"]})).toThrow();
    expect(() => direct({...auroraCapitalPaths(), recommendation: "sem-linha-debenture"})).toThrow();
  });
  it("never lets a seasonal label take long debt out of the test after the horizon", () => {
    const seasonal = {kind: "seasonal_release" as const, settlementMonthsAfterDraw: 6, justification: "Rótulo sazonal sem calendário verificável"};
    expect(() => run((i) => {i.instruments.find((x) => x.id === "debenture-80")!.afterHorizon = seasonal;})).toThrow("capital_paths_seasonal_release_unverified:debenture-80");
    expect(() => run((i) => {const g = i.instruments.find((x) => x.id === "giro-4t28")!; g.draws = g.draws.map((x) => x === "0" ? x : "30");})).toThrow("draw_above_seasonal_consumption");
    expect(() => run((i) => {(i.instruments.find((x) => x.id === "giro-4t28")!.afterHorizon as {settlementMonthsAfterDraw: number}).settlementMonthsAfterDraw = 2;})).toThrow("settlement_outside_first_year_after_horizon");
    const residual = path("sem-linha-debenture").afterHorizon.residuals.find((x) => x.instrumentId === "giro-4t28")!;
    expect([residual.kind, residual.settlementDate]).toEqual(["seasonal_release", "2029-03-31"]);
  });
});

/** Seeded generator: the same sequence on every run. */
function seeded(seed: number) {let x = seed >>> 0; return () => {x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296;};}
const withIssue = (amount: string) => {
  const i = auroraCapitalPaths(), d = i.instruments.find((x) => x.id === "debenture-80")!;
  d.draws = d.draws.map((x) => x === "0" ? x : amount);
  d.charges = [{id: "emissao", periodEnd: "2027-03-31", category: "origination_fee", amount: (Number(amount) * 0.02).toFixed(8)}];
  return i;
};
describe("equivalent cost over the life", {timeout: 600_000}, () => {
  it("closes the principal on the last payment for every profile and amount, seeded", () => {
    const next = seeded(20261027);
    const amounts = ["74.44", "79.99", "81.23", ...Array.from({length: 40}, () => (10 + next() * 190).toFixed(2))];
    for (const amount of amounts) for (const profileId of [undefined, "cinco-anos"]) {
      const c = capitalPathInstrumentCost(withIssue(amount), "debenture-80", profileId ? {profileId} : {});
      expect(c.status).toBe("calculated");
      if (c.status !== "calculated") continue;
      const principal = c.flows.reduce((t, f) => t + Number(f.principal), 0);
      expect(Math.abs(principal - Number(amount))).toBeLessThan(1e-9);
      expect(Number(c.flows.at(-1)!.principal)).toBeGreaterThan(0);
    }
  });
  it("prices on the same flows as the cash calculation, for every coupon convention", () => {
    const conventions = [["opening_principal", "quarter", "cash_paid"], ["average_principal", "quarter", "cash_paid"], ["opening_principal", "semester", "accrued_until_paid"],
      ["average_principal", "semester", "accrued_until_paid"]] as const;
    const spreads: string[] = [];
    for (const [couponBase, interestEvery, couponTreatment] of conventions) {
      const i = auroraCapitalPaths(); i.sensitivities = [];
      const ccb = i.instruments.find((x) => x.id === "ccb-tres-anos")!;
      Object.assign(ccb, {couponBase, interestEvery, couponTreatment});
      const r = direct(i), cost = r.instrumentCosts.find((c) => c.instrumentId === "ccb-tres-anos")!;
      expect(cost.status).toBe("calculated");
      if (cost.status !== "calculated") continue;
      spreads.push(cost.equivalentSpread);
      const withIt = r.paths.find((p) => p.id === "ccb-tres-anos")!, without = r.paths.find((p) => p.id === "manter")!;
      for (const f of cost.flows.filter((x) => x.periodEnd <= "2028-12-31")) {
        const a = withIt.closingAvailableByPeriod.find((x) => x.periodId === f.periodEnd)!, b = without.closingAvailableByPeriod.find((x) => x.periodId === f.periodEnd)!;
        const service = Number(a.interestPaid) + Number(a.scheduledPrincipal) - Number(b.interestPaid) - Number(b.scheduledPrincipal);
        expect(Math.abs(service - Number(f.debtService))).toBeLessThan(1e-7);
        expect(Math.abs(Number(a.charges) - Number(b.charges) - Number(f.charges))).toBeLessThan(1e-9);
      }
    }
    expect(new Set(spreads).size).toBe(4);
    expect(Number(spreads[1])).toBeLessThan(Number(spreads[0]));
  });
});
