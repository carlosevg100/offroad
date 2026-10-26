import {describe, expect, it} from "vitest";
import {prepareProjectionChallengePacket} from "./projection-challenge-packet";
import {projectionChallengePacketExecutorContracts} from "./projection-challenge-contracts";
import {auroraProjectionBasis, type AuroraProjectionOptions} from "./projection-challenge.test-support";

const question = "Que premissas você questionaria nessa projeção? Vai para os bancos semana que vem.";
const packet = (o: AuroraProjectionOptions = {}) => prepareProjectionChallengePacket({schemaVersion: "projection-challenge-packet-input.v1", question, analysis: auroraProjectionBasis(o).seal()});
const n = (v: string | null | undefined, p = 1) => Number(v).toFixed(p);

describe("projection challenge packet", () => {
  it("leads with the gap, the margin without a stated cause and the assumptions in order of effect", () => {
    const p = packet(), r = p.readings!;
    expect(p.status).toBe("prepared_for_human_review");
    expect([n(r.gap.ebitda), n(r.gap.cash), n(r.gap.plan.ebitda), n(r.gap.reference.ebitda)]).toEqual(["27.2", "19.1", "86.0", "58.8"]);
    expect([n(Number(r.gap.planMarginFirst) * 100 + ""), n(Number(r.gap.plan.margin) * 100 + ""), r.gap.marginCauseStated]).toEqual(["12.4", "16.2", null]);
    expect(r.assumptions.map((a) => [a.assumptionId, n(a.effect.ebitda), n(a.effect.cash)])).toEqual([["preco", "12.9", "7.8"], ["volume", "9.6", "4.7"], ["fixos", "3.8", "2.5"], ["prazo-capex", "0.0", "3.3"]]);
    expect(r.largestAssumptionId).toBe("preco");
    expect(r.assumptions.every((a) => a.evidenceThatWouldSustain!.length > 0 && a.ruler)).toBe(true);
    expect([n(r.interaction.fromReference.ebitda), n(r.interaction.fromReference.cash)]).toEqual(["0.8", "0.7"]);
    expect([n(r.unitMargin.planFirst, 2), n(r.unitMargin.planTarget, 2)]).toEqual(["1.24", "1.43"]);
  });
  it("finds the plant's capacity and recommends the plan as the upside case", () => {
    const r = packet().readings!;
    expect(r.capacity).toMatchObject({firstPeriodAbove: "2028", investmentInPlan: false, aboveWithoutInvestment: true});
    expect(n(r.capacity!.excessAtTarget)).toBe("1.8");
    expect(r.recommendation).toEqual({kind: "present_plan_as_upside_case", baseCase: "reference_with_documented_assumptions",
      conditions: ["preco", "volume", "fixos", "prazo-capex"], capacityCondition: "limit_quantity_to_capacity_or_add_the_investment_and_its_financing"});
    expect(packet({documented: ["preco"]}).readings!.recommendation.conditions).toEqual(["volume", "fixos", "prazo-capex"]);
  });
  it("names the missing capacity as a gap and asks for it", () => {
    const p = packet({capacity: false});
    expect(p.status).toBe("partial");
    expect(p.gaps).toEqual([{operand: "capacity", reason: "installed_capacity_not_informed"}]);
    expect(p.readings!.openQuestions).toEqual(["installed_capacity"]);
  });
  it("reads the premium mix the price would need and asks what decides it", () => {
    const p = packet({premiumOverAverage: "0.25"});
    expect([n(p.readings!.premiumMix!.shareNeededAtTarget, 3), n(p.readings!.premiumMix!.sharePerPeriod, 3)]).toEqual(["0.106", "0.035"]);
    expect(p.readings!.openQuestions).toEqual(["current_premium_share", "premium_incremental_unit_cost", "premium_sell_in_since_launch"]);
  });
  it("is deterministic, refuses scenarios and haircuts, and publishes its contract", () => {
    expect(packet().fingerprint).toBe(packet().fingerprint);
    const input = {schemaVersion: "projection-challenge-packet-input.v1", question, analysis: auroraProjectionBasis().seal()};
    expect(() => prepareProjectionChallengePacket({...input, scenarios: [{revenue: "-0.1"}]})).toThrow("Unrecognized key");
    expect(() => prepareProjectionChallengePacket({...input, analysis: {...input.analysis, uniformHaircut: "0.1"}})).toThrow("Unrecognized key");
    expect(packet().exclusions).toEqual(["scenario_execution", "model_rebuild", "material_production", "credit_approval", "method_release"]);
    expect(projectionChallengePacketExecutorContracts().executor.exportName).toBe("prepareProjectionChallengePacket");
  });
});
