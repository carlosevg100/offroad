import Decimal from "decimal.js";
import {describe, expect, it} from "vitest";
import {calculateAdoptedFinancingComparison} from "./adopted-financing-comparison";
import {analysisTestId as id} from "./adopted-analysis.test-support";
import {c02ComparisonFixture as fixture, c02Ids as UUID, c02PeriodEnds as ends} from "./financing-comparison.test-support";

const P = Decimal.clone({precision: 60});

const oracle = {
  base: {
    [UUID.itau]: {spread: "4.0000", life: "3.5", min: ["13.2636", ends[9]], service2028: "64.3725", worst: "1.9475", headroom: "1.0525", free: "30", cost: "51.8920", netDebt: "81.3197"},
    [UUID.santander]: {spread: "4.0047", life: "4", min: ["19.4592", ends[7]], service2028: "56.1175", worst: "1.9071", headroom: "1.0929", free: "37", cost: "52.4246", netDebt: "81.6387"},
    [UUID.fundo]: {spread: "3.5475", life: "4.75", min: ["20.7828", ends[7]], service2028: "56.7119", worst: "1.8788", headroom: "0.8712", free: "58", cost: "51.2504", netDebt: "80.5113"},
  },
  bank: {
    [UUID.itau]: {min: ["-0.2610", ends[9]], worst: "2.4513", headroom: "0.5487", netDebt: "94.8443"},
    [UUID.santander]: {min: ["8.1700", ends[9]], worst: "2.4368", headroom: "0.5632", netDebt: "95.1633"},
    [UUID.fundo]: {min: ["9.7266", ends[9]], worst: "2.3936", headroom: "0.3564", netDebt: "93.6068"},
  },
};
const near = (a: string, b: string, tol = "0.00005") => new P(a).minus(b).abs().lte(tol);

describe("C02 comparison over adopted company, debt and proposals", {timeout: 60000}, () => {
  it("reproduces the oracle base case from adopted premises only", () => {
    const f = fixture(), r = calculateAdoptedFinancingComparison(f.seal());
    expect(r.status).toBe("partial_composition"); expect(r.gaps).toEqual([]);
    for (const p of r.comparison!.proposals) {
      const o = oracle.base[p.id]!;
      expect(near(new P(p.equivalentSpread!).mul(100).toFixed(), o.spread)).toBe(true);
      expect(near(p.weightedAverageLifeYears, o.life)).toBe(true);
      expect([p.minimumCash.periodId, near(p.minimumCash.amount, o.min[0]!)]).toEqual([o.min[1], true]);
      expect(near(p.debtServiceByYear["2028"]!, o.service2028)).toBe(true);
      expect(near(p.covenant.worst.ratio, o.worst)).toBe(true);
      expect(near(p.covenant.worst.headroom, o.headroom)).toBe(true);
      expect(near(p.freeReceivablesAfter, o.free)).toBe(true);
      expect(near(p.horizonFinancingCost, o.cost)).toBe(true);
      expect(near(p.netDebtAtHorizon, o.netDebt)).toBe(true);
    }
    expect(r.contributions).toHaveLength(f.entries.length);
    expect(calculateAdoptedFinancingComparison(f.seal())).toEqual(r);
    expect(r.grantsExecution).toBe(false); expect(r.grantsPublication).toBe(false);
  });
  it("reproduces the bank's stress case (EBITDA -15%) from adopted premises", () => {
    const r = calculateAdoptedFinancingComparison(fixture("0.15").seal());
    for (const p of r.comparison!.proposals) {
      const o = oracle.bank[p.id]!;
      expect([p.minimumCash.periodId, near(p.minimumCash.amount, o.min[0]!)]).toEqual([o.min[1], true]);
      expect(near(p.covenant.worst.ratio, o.worst)).toBe(true);
      expect(near(p.covenant.worst.headroom, o.headroom)).toBe(true);
      expect(near(p.netDebtAtHorizon, o.netDebt)).toBe(true);
    }
  });
  it("names the missing premise instead of defaulting it", () => {
    const f = fixture(); f.input.company.cashTaxRate = {...f.input.company.cashTaxRate, decisionId: null, missingReason: "Tax rate not adopted yet"} as never;
    const r = calculateAdoptedFinancingComparison(f.seal());
    expect(r.status).toBe("missing_inputs"); expect(r.comparison).toBeNull();
    expect(r.gaps.map((g) => g.operand)).toContain(`comparison.${id(4)}.company.cashTaxRate`);
  });
  it("refuses an accrued coupon without its payment schedule and a draw outside the horizon", () => {
    const f = fixture(); delete (f.input.instruments[0]!.terms as {paysAccruedCoupon?: unknown}).paysAccruedCoupon;
    expect(() => calculateAdoptedFinancingComparison(f.seal())).toThrow("comparison_accrued_coupon_schedule_mismatch");
    const g = fixture(); g.set(`proposal.${UUID.fundo}.lifetime.drawDate`, {type: "date", value: "2026-01-31"});
    expect(() => calculateAdoptedFinancingComparison(g.seal())).toThrow("proposal_comparison_draw_outside_horizon");
  });
});
