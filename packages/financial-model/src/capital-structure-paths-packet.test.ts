import {createHash} from "node:crypto";
import Decimal from "decimal.js";
import {describe, expect, it} from "vitest";
import {prepareCapitalPathsPacket, capitalPathsPacketOutputSchema} from "./capital-structure-paths-packet";
import {calculateAdoptedCapitalStructurePaths} from "./adopted-capital-structure-paths";
import {adoptedCapitalPathsOutputSchema} from "./capital-structure-paths-results";
import {capitalPathsPacketExecutorContracts} from "./capital-structure-paths-contracts";
import {auroraCapitalPathsBasis, auroraCapitalPathsKernel} from "./capital-structure-paths.test-support";

const packet = (k = auroraCapitalPathsKernel()) => prepareCapitalPathsPacket(auroraCapitalPathsBasis(k).seal());
const n = (v: string | null | undefined, p = 1) => Number(v).toFixed(p);
describe("capital structure paths packet", {timeout: 600_000}, () => {
  const p = packet(), r = p.readings!;
  it("leads with what happens without action", () => {
    expect([r.withoutAction.firstBelowMinimum, n(r.withoutAction.lowest.amount), r.withoutAction.peakYear.year, n(r.withoutAction.peakYear.service), n(r.withoutAction.peakYear.availableForService)])
      .toEqual(["2026-12-31", "-78.6", 2027, "89.7", "35.7"]);
    expect(p.status).toBe("prepared_for_human_review");
  });
  it("recommends from the gates, with its condition, its amortization and a dated fallback", () => {
    const rec = r.recommendation!;
    expect([rec.pathId, n(rec.minimumCash.amount, 2), n(rec.horizonFinancingCost, 2), n(rec.netDebtAtHorizon, 2), rec.leverage.map((x) => n(x.ratio, 2)), n(rec.stressWorst.ratio, 2)])
      .toEqual(["sem-linha-debenture", "15.46", "49.44", "79.31", ["2.20", "1.85", "1.42"], "2.37"]);
    const l = rec.longInstrument!;
    expect([l.issueTarget, l.issueFloorInsideGates, l.termYears, l.firstAmortizationYear, l.lastAmortizationYear, n(l.equivalentSpread, 4), n(l.equivalentSpreadAtCondition, 4), l.insideGatesAtCondition])
      .toEqual(["80", "74.44", "7", 2029, 2033, "0.0346", "0.0356", true]);
    expect([r.alternative!.pathId, r.alternative!.issueTarget, r.alternative!.conditions, r.alternative!.decisionBy]).toEqual(["banco-sem-linha", "70", ["basket_without_consent", "amortization_after_horizon"], "2026-11-15"]);
    expect([rec.mustPrecede, rec.daysToMaturity]).toEqual([{instrumentId: "ccb-bradesco", date: "2027-09-15"}, 304]);
  });
  it("keeps facts, readings and recommendations apart, with what would change them and no verdict", () => {
    expect(r.assessment).toEqual({facts: ["status_quo_below_minimum_cash", "status_quo_peak_service_exceeds_available_cash", "indenture_basket_partly_occupied"],
      readings: ["recommended_path_inside_every_gate", "cheapest_path_misses_a_gate", "paths_with_the_project_miss_gates", "stress_policy_headroom_tight", "shorter_amortization_fails_after_horizon",
        "alternative_depends_on_consent", "alternative_misses_amortization_test"],
      recommendations: ["follow_recommended_path_under_condition", "review_project_before_committing", "ask_for_the_longer_amortization", "negotiate_covenant_headroom_in_new_terms", "keep_dated_alternative"],
      wouldChange: ["issue_demand_below_minimum_amount", "sensitivity_breaks_recommendation"]});
    expect(r.wouldChange.sensitivities.map((s) => [s.id, s.recommendationHolds, s.failedGatesOnRecommended])).toEqual([["trigo", false, ["policy_stress"]],
      ["prazo-redes-60", false, ["minimum_cash_base", "policy_stress"]], ["caixa-minimo-25", false, ["minimum_cash_base"]]]);
    expect(Object.keys(r)).not.toContain("verdict");
    expect([r.horizon.candidatePaths, r.horizon.companionPaths]).toEqual([7, 2]);
  });
  it("refuses a recommendation that does not come from the gates", () => {
    const forged = {...p, readings: {...r, recommendation: {...r.recommendation!, pathId: "debenture-com-linha"}}};
    expect(() => capitalPathsPacketOutputSchema.parse(forged)).toThrow("capital_paths_recommendation_not_from_gates");
  });
  it("refuses, through the adopted basis, a long issue labeled seasonal to leave the test after the horizon", () => {
    const k = auroraCapitalPathsKernel();
    k.instruments.find((x) => x.id === "debenture-80")!.afterHorizon = {kind: "seasonal_release", settlementMonthsAfterDraw: 6, justification: "Rótulo sazonal sem calendário"};
    expect(() => packet(k)).toThrow("capital_paths_seasonal_release_unverified:debenture-80");
  });
  it("is deterministic, validated and published", () => {
    expect(packet().fingerprint).toBe(p.fingerprint);
    expect(adoptedCapitalPathsOutputSchema.parse(calculateAdoptedCapitalStructurePaths(auroraCapitalPathsBasis().seal().analysis)).status).toBe("partial_composition");
    expect(capitalPathsPacketExecutorContracts().executor).toEqual({module: "@offroad/financial-model", exportName: "prepareCapitalPathsPacket", version: "2026.10.27-v1"});
  });
});

/** Seeded generator: the same sequence on every run. */
function seeded(seed: number) {let x = seed >>> 0; return () => {x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296;};}
const hashWithout = (o: Record<string, unknown>) => {const {fingerprint: _f, ...rest} = o; return createHash("sha256").update(JSON.stringify(rest)).digest("hex");};
describe("capital structure paths packet, seeded invariants", {timeout: 900_000}, () => {
  it("prepares the packet with generated profiles (repeating shares, trailing zeros) and amounts, and every fingerprint is the canonical one", () => {
    const next = seeded(31);
    for (const [n, amount] of ["80", "81.23", (10 + next() * 190).toFixed(2), (10 + next() * 190).toFixed(2)].entries()) {
      const k = auroraCapitalPathsKernel(); k.sensitivities = [];
      const d = k.instruments.find((x) => x.id === "debenture-80")!;
      d.draws = d.draws.map((x) => x === "0" ? x : amount);
      d.charges = [{id: "emissao", periodEnd: "2027-03-31", category: "origination_fee", amount: (Number(amount) * 0.02).toFixed(8)}];
      const effective = 1 + Math.floor(next() * 4), one = new Decimal(1).div(effective).toDecimalPlaces(20, Decimal.ROUND_DOWN).toFixed();
      const shares = [...Array.from({length: effective}, (_, y) => ({year: 2029 + y, share: one})), {year: 2029 + effective, share: "0"}];
      if (n === 0) shares.splice(0, shares.length, ...[2029, 2030, 2031].map((year) => ({year, share: "0.33333333333333333333"})), {year: 2032, share: "0"});
      (d.afterHorizon as {alternatives: unknown[]}).alternatives = [{id: "gerado", label: "Perfil gerado", shares}];
      const p = packet(k);
      const parsed = capitalPathsPacketOutputSchema.parse(JSON.parse(JSON.stringify(p)));
      expect([hashWithout(p as unknown as Record<string, unknown>), hashWithout(parsed as unknown as Record<string, unknown>)]).toEqual([p.fingerprint, p.fingerprint]);
      const result = adoptedCapitalPathsOutputSchema.parse(JSON.parse(JSON.stringify(p.result)));
      expect(hashWithout(result as unknown as Record<string, unknown>)).toBe(p.result.fingerprint);
      const test = p.result.evaluation!.paths.find((x) => x.id === "sem-linha-debenture")?.amortizationTests.find((t) => t.profileId === "gerado");
      if (test) expect(test.years.every((y) => Number(y.scheduledAmortization) >= 0)).toBe(true);
    }
  });
});


describe("the recommended spread is the cost in its own path", {timeout: 900_000}, () => {
  it("gives the same cost whether a dated charge sits in the instrument or in the path, and its flows have zero present value at the published spread", () => {
    const next = seeded(47), periods = ["2027-03-31", "2027-12-31", "2028-06-30", "2028-12-31"];
    for (let n = 0; n < 3; n++) {
      const charge = {id: "gerado", periodEnd: periods[Math.floor(next() * periods.length)]!, category: "recurring_fee" as const, amount: (0.05 + next() * 1.5).toFixed(4)};
      const inInstrument = auroraCapitalPathsKernel(), inPath = auroraCapitalPathsKernel();
      for (const k of [inInstrument, inPath]) k.sensitivities = [];
      inInstrument.instruments.find((x) => x.id === "debenture-80")!.charges.push(charge);
      inPath.paths.find((x) => x.id === "sem-linha-debenture")!.charges.push({...charge, instrumentId: "debenture-80"});
      const a = packet(inInstrument), b = packet(inPath);
      const la = a.readings!.recommendation!.longInstrument!, lb = b.readings!.recommendation!.longInstrument!;
      expect([lb.equivalentSpread, lb.equivalentSpreadAtCondition, b.readings!.recommendation!.horizonFinancingCost]).toEqual([la.equivalentSpread, la.equivalentSpreadAtCondition, a.readings!.recommendation!.horizonFinancingCost]);
      const cost = b.result.evaluation!.recommendation!.longCost!;
      expect(cost.status).toBe("calculated");
      if (cost.status !== "calculated") continue;
      expect(cost.flows.some((f) => f.periodEnd === charge.periodEnd && new Decimal(f.charges).gte(charge.amount))).toBe(true);
      // Independent present value of the published flows at the published spread, on the adopted curve.
      const k = inPath, index = (end: string) => {const i = k.periodEnds.indexOf(end); return i >= 0 ? k.index.annualByPeriod[i]! : k.index.afterHorizon.find((x) => x.year === Number(end.slice(0, 4)))!.annualRate;};
      let factor = new Decimal(1), pv = new Decimal("80");
      for (const f of cost.flows) {factor = factor.times(new Decimal(index(f.periodEnd)).plus(1).times(new Decimal(cost.equivalentSpread).plus(1)).pow("0.25")); pv = pv.minus(new Decimal(f.debtService).plus(f.charges).div(factor));}
      expect(pv.abs().lt("0.000000001")).toBe(true);
    }
  });
  it("keeps a path charge on another instrument in the horizon cost and declares it outside the spread", () => {
    const k = auroraCapitalPathsKernel(); k.sensitivities = [];
    k.paths.find((x) => x.id === "sem-linha-debenture")!.charges.push({id: "anuencia", instrumentId: "debenture-2021", periodEnd: "2027-03-31", category: "other", amount: "0.3"});
    const base = auroraCapitalPathsKernel(); base.sensitivities = [];
    const p = packet(k), q = packet(base), l = p.readings!.recommendation!.longInstrument!;
    expect([l.chargesOutsideSpread, l.equivalentSpread === q.readings!.recommendation!.longInstrument!.equivalentSpread,
      new Decimal(p.readings!.recommendation!.horizonFinancingCost).minus(q.readings!.recommendation!.horizonFinancingCost).toFixed()])
      .toEqual([[{id: "anuencia", instrumentId: "debenture-2021", periodEnd: "2027-03-31", amount: "0.3"}], true, "0.3"]);
  });
});
