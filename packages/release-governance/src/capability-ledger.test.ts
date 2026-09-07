import {describe, expect, it} from "vitest";
import {currentCapabilityLedger, evaluateCapabilityLedger, type CapabilityLedger} from "./index";

describe("capability ledger", () => {
  it("records current deployment and quality without promoting any analytical scope to production", () => {
    const decision = evaluateCapabilityLedger(currentCapabilityLedger);

    expect(decision.valid).toBe(true);
    expect(decision.entryCount).toBe(35);
    expect(decision.blockers).toEqual([]);
    expect(currentCapabilityLedger.entries.some((entry) => entry.allowedUses.includes("customer_work"))).toBe(false);
    expect(currentCapabilityLedger.entries.some((entry) => entry.qualityMaturity === "production")).toBe(false);
  });

  it("keeps the Case 01 compiler live but allowlisted and the universal compiler specified", () => {
    const byId = new Map(currentCapabilityLedger.entries.map((entry) => [entry.capabilityId, entry]));
    expect(byId.get("workflow.case01-compiler")).toMatchObject({availability: "live", exposure: "allowlisted", qualityMaturity: "tested"});
    expect(byId.get("workflow.universal-compiler")).toMatchObject({availability: "specified", exposure: "none", qualityMaturity: "specified"});
    expect(byId.get("workflow.objective-plan-core")).toMatchObject({availability: "live", exposure: "internal", qualityMaturity: "tested"});
    expect(byId.get("workflow.objective-plan-core")?.exactScope).toMatch(/Fourteen normalized objective classes/);
    expect(byId.get("workflow.preflight-capability-gate")).toMatchObject({availability: "live", exposure: "internal", qualityMaturity: "tested"});
    expect(byId.get("workflow.objective-preflight-shadow")).toMatchObject({availability: "shadow", exposure: "internal", qualityMaturity: "implemented"});
    expect(byId.get("workflow.specialist-method-binding-shadow")).toMatchObject({availability: "shadow", exposure: "internal", qualityMaturity: "implemented"});
    expect(byId.get("intent.semantic-objective-resolution-shadow")).toMatchObject({availability: "shadow", exposure: "internal", qualityMaturity: "implemented"});
  });

  it("records the execution brief and safe run-derived progress as live without claiming customer reliance", () => {
    const byId = new Map(currentCapabilityLedger.entries.map((entry) => [entry.capabilityId, entry]));
    expect(byId.get("experience.execution-brief")).toMatchObject({availability: "live", exposure: "universal", qualityMaturity: "implemented", allowedUses: ["internal_validation"]});
    expect(byId.get("experience.live-work")).toMatchObject({availability: "live", exposure: "universal", qualityMaturity: "implemented", allowedUses: ["internal_validation"]});
  });

  it("records the database compatibility preflight without overstating operational maturity", () => {
    const byId = new Map(currentCapabilityLedger.entries.map((entry) => [entry.capabilityId, entry]));
    expect(byId.get("trust.worker-schema-boot-gate")).toMatchObject({
      availability: "live",
      exposure: "internal",
      qualityMaturity: "tested",
      allowedUses: ["internal_validation"],
    });
  });

  it("keeps the governed R01 refresh internal until the specialist is promoted", () => {
    const byId = new Map(currentCapabilityLedger.entries.map((entry) => [entry.capabilityId, entry]));
    expect(byId.get("continuity.r01-governed-refresh")).toMatchObject({
      availability: "live",
      exposure: "internal",
      qualityMaturity: "implemented",
      allowedUses: ["internal_validation"],
    });
  });

  it("records the bounded router gate as tested after a strict real-model run passes", () => {
    const byId = new Map(currentCapabilityLedger.entries.map((entry) => [entry.capabilityId, entry]));
    expect(byId.get("gold.intent-router-stability-gate")).toMatchObject({
      availability: "live",
      exposure: "internal",
      qualityMaturity: "tested",
      allowedUses: ["internal_validation"],
    });
  });

  it("fails closed when a specified capability claims runtime or a fixture is presented as live evidence", () => {
    const weakened: CapabilityLedger = {
      ...currentCapabilityLedger,
      entries: currentCapabilityLedger.entries.map((entry) => {
        if (entry.capabilityId === "workflow.universal-compiler") return {...entry, runtimeRefs: ["fake/runtime"], allowedUses: ["internal_validation"], exposure: "internal" as const};
        if (entry.capabilityId === "capital.synthetic-matching") return {...entry, fixtureRefs: []};
        return entry;
      }),
    };
    const decision = evaluateCapabilityLedger(weakened);
    expect(decision.valid).toBe(false);
    expect(decision.blockers).toEqual(expect.arrayContaining([
      {code: "specified_capability_claims_runtime", capabilityId: "workflow.universal-compiler"},
      {code: "mocked_capability_fixture_missing", capabilityId: "capital.synthetic-matching"},
    ]));
  });

  it("does not allow customer reliance without a live production-quality scope", () => {
    const promotedByLabelOnly: CapabilityLedger = {
      ...currentCapabilityLedger,
      entries: currentCapabilityLedger.entries.map((entry) => entry.capabilityId === "finance.deterministic-kernels"
        ? {...entry, allowedUses: ["customer_work"]}
        : entry),
    };
    const decision = evaluateCapabilityLedger(promotedByLabelOnly);
    expect(decision.valid).toBe(false);
    expect(decision.blockers).toContainEqual({
      code: "customer_reliance_requires_live_production_scope",
      capabilityId: "finance.deterministic-kernels",
    });
  });
});
