import {describe, expect, it} from "vitest";
import {capitalPlanningCompatibilityPolicy} from "@offroad/credit-playbook";
import {capitalPlanningArtifactTiming} from "./capital-planning";
import {runCapitalPlanningFixture} from "./capital-planning.test-support";
describe("canonical capital planning adapter", () => {
  it("records duration only after a useful alternative map and its task are persisted", async () => {
    const r = await runCapitalPlanningFixture(null);
    expect(r.outcome.status).toBe("succeeded"); expect(r.failed).toBe(false);
    expect(r.completed).toMatchObject({firstUsefulArtifact: {durationMs: 250, boundary: "worker_start_to_persisted_alternative_map"}});
    expect(r.stages.find(s => s.stage === "capital_planning" && s.status === "succeeded")?.detail)
      .toMatchObject({firstUsefulArtifact: {durationMs: 250}});
  });
  it("never records a useful artifact duration when final artifact persistence fails", async () => {
    const r = await runCapitalPlanningFixture(null, true);
    expect(r.outcome.status).toBe("failed"); expect(r.failed).toBe(true); expect(r.completed).toBeUndefined();
    expect(r.stages.some(s => s.stage === "capital_planning" && s.status === "succeeded")).toBe(false);
    expect(JSON.stringify(r.stages)).not.toContain("firstUsefulArtifact");
  });
  it("uses the canonical policy without activating the new decision executor", async () => {
    const r = await runCapitalPlanningFixture("cfo");
    expect(r.requests).toHaveLength(1);
    expect(r.requests[0]).toMatchObject({system: capitalPlanningCompatibilityPolicy.system, task: "capital_planning"});
    expect(r.completed).toMatchObject({compatibilityPolicy: {hash: capitalPlanningCompatibilityPolicy.policyHash}});
    expect(capitalPlanningCompatibilityPolicy.activatesCapitalDecisionProcedure).toBe(false);
  });
  it("reports clock failure as unavailable instead of manufacturing a latency", () => {
    for (const [start, end] of [[10, 9], [NaN, 20], [0, Infinity], [0, Number.MAX_VALUE]])
      expect(capitalPlanningArtifactTiming(start!, end!).durationMs).toBeNull();
  });
  it("keeps the metric content free with explicit boundaries and no browser latency claim", () => {
    expect(capitalPlanningArtifactTiming(100, 123.6)).toEqual({schemaVersion: "capital.first-useful-artifact.v1",
      boundary: "worker_start_to_persisted_alternative_map", durationMs: 24, includesQueue: false, includesBrowserDelivery: false});
  });
});
