import {describe, expect, it} from "vitest";
import {
  evaluateLongitudinalJourneyCatalogue,
  longitudinalGoldJourneys,
  type LongitudinalJourneyContract,
} from "./longitudinal-journeys";

describe("longitudinal gold journey contracts", () => {
  it("defines all eight journeys with complete gates and a visible Execution Brief before work", () => {
    const decision = evaluateLongitudinalJourneyCatalogue(longitudinalGoldJourneys);
    expect(decision).toMatchObject({valid: true, journeyCount: 8, blockers: []});
    expect(decision.warnings).toHaveLength(8);
    expect(longitudinalGoldJourneys.every((journey) => journey.gateRequirements.length === 14)).toBe(true);
  });

  it("uses intent-specific plans rather than the same generic checklist", () => {
    const briefOutputs = new Map(longitudinalGoldJourneys.map((journey) => [
      journey.journeyId,
      journey.stages.find((stage) => stage.surface === "execution_brief")!.requiredOutputs.join(" | "),
    ]));
    expect(briefOutputs.get("G1")).toContain("RI/CVM/source plan");
    expect(briefOutputs.get("G3")).toContain("receivables analysis plan");
    expect(briefOutputs.get("G5")).toContain("clause and cross-reference plan");
    expect(briefOutputs.get("G8")).toContain("mandate and freshness plan");
    expect(new Set(briefOutputs.values()).size).toBe(8);
  });

  it("fails when work starts before the Execution Brief", () => {
    const broken: LongitudinalJourneyContract[] = longitudinalGoldJourneys.map((journey) => journey.journeyId === "G1"
      ? {...journey, stages: [journey.stages[0]!, journey.stages[3]!, journey.stages[1]!, journey.stages[2]!, ...journey.stages.slice(4)]}
      : journey);
    expect(evaluateLongitudinalJourneyCatalogue(broken).blockers)
      .toContain("execution_brief_not_before_work:G1");
  });

  it("fails an incomplete gate map or dangling transition", () => {
    const broken: LongitudinalJourneyContract[] = longitudinalGoldJourneys.map((journey) => journey.journeyId === "G4"
      ? {
          ...journey,
          gateRequirements: [...journey.gateRequirements.slice(0, 13), journey.gateRequirements[0]!],
          stages: journey.stages.map((stage, index) => index === 0 ? {...stage, nextStageIds: ["G4-S99"]} : stage),
        }
      : journey);
    const decision = evaluateLongitudinalJourneyCatalogue(broken);
    expect(decision.blockers).toEqual(expect.arrayContaining([
      "gate_coverage_invalid:G4",
      "unknown_next_stage:G4-S01:G4-S99",
    ]));
  });
});
