import Decimal from "decimal.js";
import {describe, expect, it} from "vitest";
import {calculateAdoptedFinancingComparison, type AdoptedFinancingComparisonInput} from "./adopted-financing-comparison";
import {analysisTestBasis, analysisTestId as id} from "./adopted-analysis.test-support";

// Ficha C02 (fictitious company "Aurora") read entirely from adopted premises. Expected values
// come from the independent Python oracle modelo_c02.py (resultados.json), never from this code.
const P = Decimal.clone({precision: 60});
const ends = ["2026-09-30", "2026-12-31", "2027-03-31", "2027-06-30", "2027-09-30", "2027-12-31", "2028-03-31", "2028-06-30", "2028-09-30", "2028-12-31"];
const starts = ["2026-07-01", ...ends.slice(0, -1).map((e) => {const d = new Date(`${e}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10);})];
const cdi = ["0.149", "0.149", "0.14", "0.14", "0.14", "0.14", "0.1275", "0.1275", "0.1275", "0.1275"];
const rate16 = (v: Decimal) => v.toDecimalPlaces(16, Decimal.ROUND_HALF_UP).toFixed();
const floating = (spread: string) => cdi.map((c) => rate16(new P(c).plus(1).mul(new P(spread).plus(1)).pow("0.25").minus(1)));
const fixed = (annual: string) => cdi.map(() => rate16(new P(annual).plus(1).pow("0.25").minus(1)));
const ebitdaBase = ["13.5", "14", "14", "14", "14.3", "14.3", "14.7", "14.7", "14.7", "14.7"];
const iof = (v: string) => new P(v).mul(new P("0.000082").mul(182).plus("0.0038")).toFixed();
const IOF70 = new P(70).mul("0.03373").toFixed();
const UUID = {debenture: id(901), bradesco: id(902), finame: id(903), giro26: id(904), giro27: id(905), giro28: id(906), itau: id(911), santander: id(912), fundo: id(913)};

function fixture(shock = "0") {
  const f = analysisTestBasis(`comparison.${id(4)}.`, "2026-06-30", "2028-12-31");
  const number = (p: string, unit: string, value: string) => f.contribute(p, unit, {type: "number", value});
  const text = (p: string, unit: string, value: string) => f.contribute(p, unit, {type: "text", value});
  const date = (p: string, value: string) => f.contribute(p, "date", {type: "date", value});
  const list = (p: string, unit: string, value: string[]) => f.contribute(p, unit, {type: "list", value});
  const q10 = (v: (q: number) => string) => ends.map((_, q) => v(q));
  const terms = (path: string, opening: string, rates: string[], o: {draw?: [number, string]; amort?: Record<number, string>; prepay?: Record<number, string>; pays?: number[]; base?: string}) => ({
    timing: text(`${path}.timing`, "convention", "draw_at_period_start_pay_at_period_end"), indexer: text(`${path}.indexer`, "convention", "none"),
    indexationTreatment: text(`${path}.indexationTreatment`, "convention", "not_applicable"),
    couponTreatment: text(`${path}.couponTreatment`, "convention", o.pays ? "accrued_until_paid" : "cash_paid"),
    couponBase: text(`${path}.couponBase`, "convention", o.base ?? "opening_principal"),
    drawdownAccount: text(`${path}.drawdownAccount`, "convention", "available"), paymentAccount: text(`${path}.paymentAccount`, "convention", "available"),
    openingPrincipal: number(`${path}.openingPrincipal`, "currency", opening),
    indexationRates: list(`${path}.indexationRates`, "ratio", q10(() => "0")), couponRates: list(`${path}.couponRates`, "ratio", rates),
    drawdowns: list(`${path}.drawdowns`, "currency", q10((q) => o.draw && o.draw[0] === q ? o.draw[1] : "0")),
    scheduledPrincipal: list(`${path}.scheduledPrincipal`, "currency", q10((q) => o.amort?.[q] ?? "0")),
    prepayments: list(`${path}.prepayments`, "currency", q10((q) => o.prepay?.[q] ?? "0")),
    repayAll: list(`${path}.repayAll`, "boolean", q10(() => "false")),
    ...(o.pays ? {paysAccruedCoupon: list(`${path}.paysAccruedCoupon`, "boolean", q10((q) => String(o.pays!.includes(q))))} : {})});
  const charges = (path: string, rows: [string, string, number, string, boolean][]) => rows.length ? {
    chargeIds: list(`${path}.chargeIds`, "identity", rows.map((r) => r[0])), categories: list(`${path}.categories`, "convention", rows.map((r) => r[1])),
    dates: list(`${path}.dates`, "date", rows.map((r) => starts[r[2]]!)), amounts: list(`${path}.amounts`, "currency", rows.map((r) => r[3])),
    deductible: list(`${path}.deductible`, "boolean", rows.map((r) => String(r[4])))} : null;
  const finameAmort = Object.fromEntries(ends.map((_, q) => [q, new P(30).div(54).mul(3).toDecimalPlaces(8).toFixed()]));
  const instruments = [
    {id: UUID.debenture, terms: terms(`debt.${UUID.debenture}`, "60", floating("0.024"), {amort: {1: "15", 3: "15", 5: "15", 7: "15"}, pays: [1, 3, 5, 7, 9]}), charges: null},
    {id: UUID.bradesco, terms: terms(`debt.${UUID.bradesco}`, "40", floating("0.026"), {prepay: {2: "40"}}),
      charges: charges(`debt.${UUID.bradesco}.charges`, [["bradesco-premium", "other", 2, "0.4", true]])},
    {id: UUID.finame, terms: terms(`debt.${UUID.finame}`, "30", fixed("0.097"), {amort: finameAmort, base: "average_principal"}), charges: null},
    ...([[UUID.giro26, "0.025", 1, "17", 2], [UUID.giro27, "0.020", 5, "20", 6], [UUID.giro28, "0.020", 9, "20", undefined]] as const).map(([gid, s, q, v, repay]) => ({id: gid,
      terms: terms(`debt.${gid}`, "0", floating(s), {draw: [q, v], ...(repay !== undefined ? {amort: {[repay]: v}} : {})}),
      charges: charges(`debt.${gid}.charges`, [[`${gid}-fee`, "origination_fee", q, new P(v).mul("0.003").toFixed(), true], [`${gid}-iof`, "tax", q, iof(v), true]])})),
  ];
  const proposal = (pid: string, label: string, spread: string, fee: string, withIof: boolean, lifeAmort: number[], semiannual: boolean, inHorizon: Record<number, string>,
    collateral: string, cov: {lease: boolean; dates: number[]; limit: string}) => {
    const path = `proposal.${pid}`;
    let repaid = new P(0); const lifeEnds: string[] = [], amort: string[] = [], pays: string[] = [], index: string[] = [];
    for (let q = 0; q < 21; q++) {
      lifeEnds.push(new Date(Date.UTC(2027 + Math.floor(q / 4), (q % 4 + 1) * 3, 0)).toISOString().slice(0, 10));
      const a = lifeAmort.includes(q) ? (q === lifeAmort.at(-1) ? new P(70).minus(repaid) : new P(70).div(lifeAmort.length).toDecimalPlaces(8)) : new P(0);
      repaid = repaid.plus(a); amort.push(a.toFixed()); pays.push(String(!semiannual || q % 2 === 1 || q === 20)); index.push(q < 4 ? "0.14" : q < 8 ? "0.1275" : "0.12");
    }
    return {id: pid, label,
      terms: terms(`${path}.terms`, "0", floating(spread), {draw: [2, "70"], amort: inHorizon, ...(semiannual ? {pays: [3, 5, 7, 9]} : {})}),
      charges: charges(`${path}.charges`, [[`${label}-fee`, "origination_fee", 2, new P(70).mul(fee).toFixed(), true], ...(withIof ? [[`${label}-iof`, "tax", 2, IOF70, true] as [string, string, number, string, boolean]] : []),
        ...(new P(collateral).gt(0) ? [[`${label}-waiver`, "other", 1, "0.525", false] as [string, string, number, string, boolean]] : [])]),
      collateralConsumed: number(`${path}.collateralConsumed`, "currency", collateral),
      covenant: {name: text(`${path}.covenant.name`, "identity", cov.lease ? "lease liability in debt, IFRS 16 EBITDA" : "excluding leases"),
        leaseLiabilityInDebt: text(`${path}.covenant.leaseLiabilityInDebt`, "boolean", String(cov.lease)), leaseLiability: number(`${path}.covenant.leaseLiability`, "currency", "8"),
        ebitdaExcludesLeases: text(`${path}.covenant.ebitdaExcludesLeases`, "boolean", String(!cov.lease)), trailingPeriods: number(`${path}.covenant.trailingPeriods`, "count", "4"),
        measurementPeriods: list(`${path}.covenant.measurementPeriods`, "date", cov.dates.map((q) => ends[q]!)), limit: number(`${path}.covenant.limit`, "ratio", cov.limit),
        comparator: text(`${path}.covenant.comparator`, "convention", "lte")},
      lifetime: {grossAdvance: number(`${path}.lifetime.grossAdvance`, "currency", "70"),
        upfrontWithheldCosts: number(`${path}.lifetime.upfrontWithheldCosts`, "currency", new P(70).mul(fee).plus(withIof ? IOF70 : 0).toFixed()),
        annualSpread: number(`${path}.lifetime.annualSpread`, "ratio", spread), unpaidInterestBase: text(`${path}.lifetime.unpaidInterestBase`, "convention", "principal_plus_accrued"),
        lowerSpread: number(`${path}.lifetime.lowerSpread`, "ratio", "0"), upperSpread: number(`${path}.lifetime.upperSpread`, "ratio", "0.2"),
        periodEnds: list(`${path}.lifetime.periodEnds`, "date", lifeEnds), yearFractions: list(`${path}.lifetime.yearFractions`, "ratio", lifeEnds.map(() => "0.25")),
        annualIndex: list(`${path}.lifetime.annualIndex`, "ratio", index),
        yearFractionConventions: list(`${path}.lifetime.yearFractionConventions`, "convention", lifeEnds.map(() => "adopted_year_fraction")),
        scheduledPrincipal: list(`${path}.lifetime.scheduledPrincipal`, "currency", amort), paysAccruedInterest: list(`${path}.lifetime.paysAccruedInterest`, "boolean", pays)}};
  };
  const proposals = [
    proposal(UUID.itau, "itau", "0.023", "0.010", true, [6, 8, 10, 12, 14, 16, 18, 20], false, {8: "8.75"}, "28", {lease: true, dates: [3, 5, 7, 9], limit: "3"}),
    proposal(UUID.santander, "santander", "0.0255", "0.008", true, [10, 12, 14, 16, 18, 20], false, {}, "21", {lease: false, dates: [5, 9], limit: "3"}),
    proposal(UUID.fundo, "fundo", "0.031", "0.015", false, [16, 20], true, {}, "0", {lease: false, dates: [3, 5, 7, 9], limit: "2.75"}),
  ];
  const company = {openingAvailableCash: number("company.openingAvailableCash", "currency", "35"),
    money: {ebitda: list("company.ebitda", "currency", q10((q) => new P(ebitdaBase[q]!).mul(q >= 1 ? new P(1).minus(shock) : 1).toFixed())),
      cashLeasePayments: list("company.cashLeasePayments", "currency", q10(() => "0.75")),
      depreciationAndAmortization: list("company.depreciationAndAmortization", "currency", q10(() => "3")),
      workingCapitalCashFlow: list("company.workingCapitalCashFlow", "currency", q10((q) => new P("-0.625").plus([1, 5, 9].includes(q) ? -25 : 0).plus([2, 6].includes(q) ? 25 : 0).toFixed())),
      maintenanceCapexPaid: list("company.maintenanceCapexPaid", "currency", q10(() => "2")), growthCapexPaid: list("company.growthCapexPaid", "currency", q10(() => "0"))},
    cashTaxRate: number("company.cashTaxRate", "ratio", "0.34"), lossTaxTreatment: text("company.lossTaxTreatment", "convention", "no_cash_benefit"),
    freeReceivablesPool: number("company.freeReceivablesPool", "currency", "58"), minimumCashFrom: date("company.minimumCashFrom", ends[2]!),
    covenantHistoryPeriods: list("company.covenantHistory.periods", "identity", ["1T26", "2T26"]),
    covenantHistoryEbitda: list("company.covenantHistory.ebitda", "currency", ["13.5", "13.5"]),
    covenantHistoryLeasePayments: list("company.covenantHistory.leasePayments", "currency", ["0.75", "0.75"])};
  const input = {...f.context, comparisonId: id(4), scenario: "base", periodEnds: list("periodEnds", "date", ends), company, instruments, proposals} as unknown as AdoptedFinancingComparisonInput;
  return {...f, input, seal: () => ({...input, envelope: f.seal()})};
}

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
  it("refuses an accrued coupon without its payment schedule and a window outside the horizon", () => {
    const f = fixture(); delete (f.input.proposals[2]!.terms as {paysAccruedCoupon?: unknown}).paysAccruedCoupon;
    expect(() => calculateAdoptedFinancingComparison(f.seal())).toThrow("comparison_accrued_coupon_schedule_mismatch");
    const g = fixture(); g.set("company.minimumCashFrom", {type: "date", value: "2029-03-31"});
    expect(() => calculateAdoptedFinancingComparison(g.seal())).toThrow();
  });
});
