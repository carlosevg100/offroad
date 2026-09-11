import {describe, expect, it} from "vitest";
import {currentCapabilityLedger, evaluateCapabilityLedger, type CapabilityLedger} from "./index";

describe("capability ledger", () => {
  it("records current deployment and quality, promoting only what the founder approved", () => {
    const decision = evaluateCapabilityLedger(currentCapabilityLedger);

    expect(decision.valid).toBe(true);
    expect(decision.entryCount).toBe(44);
    expect(decision.blockers).toEqual([]);
    // Two scopes are in production, both on the founder's instruction of 10 September 2026: the
    // released R01 reading and the seven deterministic Case 01 debt methods. Only the first carries
    // customer work; the debt methods are selectable and recorded and produce no deliverable yet.
    expect(currentCapabilityLedger.entries.filter((entry) => entry.qualityMaturity === "production").map((entry) => entry.capabilityId))
      .toEqual(["finance.case01-debt-methods", "finance.receivables-released-analysis"]);
    expect(currentCapabilityLedger.entries.filter((entry) => entry.allowedUses.includes("customer_work")).map((entry) => entry.capabilityId))
      .toEqual(["finance.receivables-released-analysis"]);
    expect(currentCapabilityLedger.entries.some((entry) => entry.allowedUses.includes("external_material") || entry.allowedUses.includes("external_action"))).toBe(false);
  });

  it("keeps preliminary documentary customer work blocked before reviewed release evidence", () => {
    const candidate = currentCapabilityLedger.entries.find(entry => entry.capabilityId === "execution.preliminary-documentary-work")!;
    expect(candidate).toMatchObject({availability:"specified",exposure:"none",qualityMaturity:"specified",evidenceRefs:[],allowedUses:[]});
    const decision = evaluateCapabilityLedger({...currentCapabilityLedger, entries:[{...candidate, allowedUses:["customer_work"]}]});
    expect(decision.blockers.some(blocker => blocker.code === "customer_reliance_requires_live_production_scope")).toBe(true);
  });

  it("records a verified mandate contract with an empty population and no live lender network", () => {
    const byId = new Map(currentCapabilityLedger.entries.map((entry) => [entry.capabilityId, entry]));
    expect(byId.get("capital.verified-mandate-record")).toMatchObject({availability: "live", exposure: "internal", qualityMaturity: "tested", allowedUses: ["internal_validation"]});
    expect(byId.get("capital.verified-mandate-record")!.limitations.some((limitation) => limitation.includes("No real fund has registered"))).toBe(true);
    expect(byId.get("capital.live-mandate-network")).toMatchObject({availability: "absent", exposure: "none", qualityMaturity: "unsupported", runtimeRefs: [], allowedUses: []});
  });

  it("keeps the Case 01 compiler live but allowlisted and the universal compiler specified", () => {
    const byId = new Map(currentCapabilityLedger.entries.map((entry) => [entry.capabilityId, entry]));
    expect(byId.get("workflow.case01-compiler")).toMatchObject({availability: "live", exposure: "allowlisted", qualityMaturity: "tested"});
    expect(byId.get("workflow.universal-compiler")).toMatchObject({availability: "specified", exposure: "none", qualityMaturity: "specified"});
    expect(byId.get("workflow.objective-plan-core")).toMatchObject({availability: "live", exposure: "internal", qualityMaturity: "tested"});
    expect(byId.get("workflow.objective-plan-core")?.exactScope).toMatch(/Fourteen normalized objective classes/);
    expect(byId.get("workflow.preflight-capability-gate")).toMatchObject({availability: "live", exposure: "internal", qualityMaturity: "tested"});
    expect(byId.get("workflow.objective-preflight-shadow")).toMatchObject({availability: "shadow", exposure: "internal", qualityMaturity: "implemented"});
    expect(byId.get("workflow.universal-dispatch-candidate-shadow")).toMatchObject({availability: "shadow", exposure: "internal", qualityMaturity: "implemented"});
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

  it("records security inventory and quarantine as bounded internal capabilities", () => {
    const byId = new Map(currentCapabilityLedger.entries.map((entry) => [entry.capabilityId, entry]));
    expect(byId.get("trust.security-current-state-inventory")).toMatchObject({
      availability: "live",
      exposure: "internal",
      qualityMaturity: "tested",
      allowedUses: ["internal_validation"],
    });
    expect(byId.get("documents.governed-quarantine-shadow")).toMatchObject({
      availability: "shadow",
      exposure: "internal",
      qualityMaturity: "implemented",
      allowedUses: ["internal_validation"],
    });
    expect(byId.get("documents.governed-quarantine-shadow")?.limitations).toEqual(expect.arrayContaining([
      expect.stringMatching(/append-only/),
      expect.stringMatching(/Scanner engine/),
      expect.stringMatching(/staging adversarial/),
    ]));
  });

  it("records the governed Office foundation as implemented but not promoted", () => {
    const capability = currentCapabilityLedger.entries.find((entry) => entry.capabilityId === "artifacts.governed-office-foundation");
    expect(capability).toMatchObject({
      availability: "live",
      exposure: "allowlisted",
      qualityMaturity: "implemented",
      allowedUses: ["internal_validation"],
    });
    expect(capability?.allowedUses).not.toEqual(expect.arrayContaining(["customer_work", "external_material", "external_action"]));
    expect(capability?.limitations).toEqual(expect.arrayContaining([
      expect.stringMatching(/no deploy receipt/),
      expect.stringMatching(/not mean promoted/),
    ]));
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

  it("keeps the replacement router gate implemented until its strict real-model run passes", () => {
    const byId = new Map(currentCapabilityLedger.entries.map((entry) => [entry.capabilityId, entry]));
    expect(byId.get("gold.intent-router-stability-gate")).toMatchObject({
      availability: "live",
      exposure: "internal",
      qualityMaturity: "implemented",
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
