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
