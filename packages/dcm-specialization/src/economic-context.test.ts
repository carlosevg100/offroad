import {describe, expect, it} from "vitest";
import type {EconomicContextAttribute, EconomicContextCompileRequest} from "@offroad/agent-contracts";
import {compileEconomicContext} from "./economic-context";

function attr(dimension: EconomicContextAttribute["dimension"], value: string, period?: EconomicContextAttribute["period"]): EconomicContextAttribute {
  return {dimension, value, status: "confirmed", evidenceRefs: [{sourceId: "synthetic-source", sourceVersion: "1", anchor: "section-1"}], ...(period ? {period} : {})};
}
function request(attributes: EconomicContextAttribute[], intent: EconomicContextCompileRequest["intent"] = "financial_analysis"): EconomicContextCompileRequest {
  return {schemaVersion: "economic-context-compile-request.v1", context: {schemaVersion: "economic-context.v1", asOf: "2026-09-08", objects: [{id: "synthetic-asset", type: "asset", attributes}]}, intent, targetObjectIds: ["synthetic-asset"]};
}
const solar = () => [attr("sector", "energy"), attr("subsector", "solar")];
const modules = (input: EconomicContextCompileRequest) => compileEconomicContext(input).activations.map((item) => item.moduleId);

describe("object-scoped economic planning", () => {
  it("changes required work for merchant exposure without dropping contracted revenue", () => {
    const contracted = request([...solar(), attr("revenue_model", "contracted")]);
    const hybrid = structuredClone(contracted);
    hybrid.context.objects[0]!.attributes.push(attr("revenue_model", "merchant"));
    expect(modules(contracted)).not.toContain("revenue.merchant");
    expect(modules(hybrid)).toEqual(expect.arrayContaining(["sector.solar", "revenue.contracted", "revenue.merchant"]));
    const result = compileEconomicContext(hybrid);
    expect(result.requirements.flatMap((r) => r.scenarioIds)).toContain("merchant.joint_price_volume_downside");
    expect(result.requirements.every((r) => r.evidenceStatus === "not_examined")).toBe(true);
    expect(result.willExecute).toBe(false);
    expect(result.externalEffectAllowed).toBe(false);
  });
  it("replaces operating work with construction requirements", () => {
    const building = compileEconomicContext(request([...solar(), attr("lifecycle", "construction")]));
    const operating = compileEconomicContext(request([...solar(), attr("lifecycle", "operating")]));
    expect(building.requirements.flatMap((r) => r.evidenceNeeded)).toContain("construction_budget_schedule_and_milestones");
    expect(operating.requirements.flatMap((r) => r.evidenceNeeded)).not.toContain("construction_budget_schedule_and_milestones");
  });
  it("does not replace availability payments with toll traffic assumptions", () => {
    const common = [attr("sector", "transport"), attr("subsector", "road")];
    const toll = compileEconomicContext(request([...common, attr("revenue_model", "toll")]));
    const availability = compileEconomicContext(request([...common, attr("revenue_model", "availability")]));
    expect(toll.requirements.flatMap((r) => r.scenarioIds)).toContain("toll.traffic_mix_downside");
    expect(availability.requirements.flatMap((r) => r.scenarioIds)).not.toContain("toll.traffic_mix_downside");
    expect(availability.requirements.flatMap((r) => r.scenarioIds)).toContain("availability.performance_deductions");
  });
  it("keeps factual answers free of financial, market and scenario work", () => {
    const result = compileEconomicContext(request([...solar(), attr("revenue_model", "contracted"), attr("lifecycle", "construction")], "factual_answer"));
    expect(result.requirements.length).toBeGreaterThan(0);
    for (const requirement of result.requirements) {
      expect(requirement.methods).toEqual([]);
      expect(requirement.scenarioIds).toEqual([]);
      expect(requirement.marketCriteriaIds).toEqual([]);
      expect(requirement.evidenceNeeded).not.toContain("construction_budget_schedule_and_milestones");
    }
  });
  it("preserves investor mandate unknowns instead of calculating credit for matching", () => {
    const result = compileEconomicContext(request([attr("business_model", "receivables_pool")], "market_matching"));
    expect(result.requirements.flatMap((r) => r.marketCriteriaIds)).toContain("mandate.confirmed_eligibility_policy");
    expect(result.requirements.flatMap((r) => r.methods)).toEqual([]);
    expect(result.requirements.flatMap((r) => r.evidenceNeeded)).toContain("dated_authorized_provider_mandate");
  });
  it("never inherits cash-flow classification from a holding or another asset", () => {
    const input = request([attr("subsector", "solar")]);
    input.context.objects[0]!.parentObjectId = "synthetic-holding";
    input.context.objects.push({id: "synthetic-holding", type: "group", attributes: [attr("sector", "energy")]});
    expect(modules(input)).not.toContain("sector.solar");
    expect(compileEconomicContext(input).gaps).toEqual(expect.arrayContaining([expect.objectContaining({code: "module_context_incomplete", objectId: "synthetic-asset"})]));
  });
  it("keeps unresolved declarations visible without activating methods", () => {
    for (const status of ["proposed", "inferred", "conflicting", "unknown"] as const) {
      const input = request([{...attr("revenue_model", "contracted"), status, value: status === "unknown" ? null : "contracted"}]);
      expect(modules(input)).toEqual([]);
      expect(compileEconomicContext(input).gaps[0]?.code).toBe("attribute_unresolved");
    }
  });
  it("does not activate an older confirmed assertion through an overlapping dispute", () => {
    const input = request([
      attr("revenue_model", "contracted", {start: "2026-01-01", end: "2026-12-31"}),
      {...attr("revenue_model", "contracted", {start: "2026-06-01", end: "2026-12-31"}), status: "conflicting"},
    ]);
    expect(modules(input)).toEqual([]);
    input.context.objects[0]!.attributes[1]!.period = {start: "2027-01-01", end: "2027-12-31"};
    expect(modules(input)).toContain("revenue.contracted");
  });
  it("requires economic periods to intersect when combining predicates", () => {
    const input = request([
      attr("sector", "energy", {start: "2025-01-01", end: "2025-12-31"}),
      attr("subsector", "solar", {start: "2026-01-01", end: "2026-12-31"}),
    ]);
    expect(modules(input)).not.toContain("sector.solar");
    expect(compileEconomicContext(input).gaps).toEqual(expect.arrayContaining([expect.objectContaining({code: "non_overlapping_periods"})]));
    input.context.objects[0]!.attributes[0]!.period!.end = "2026-06-30";
    expect(compileEconomicContext(input).activations[0]?.period).toEqual({start: "2026-01-01", end: "2026-06-30"});
  });
  it("supports a future contracted period and merchant tail without blending them", () => {
    const result = compileEconomicContext(request([
      attr("revenue_model", "contracted", {start: "2027-01-01", end: "2035-12-31"}),
      attr("revenue_model", "merchant", {start: "2036-01-01", end: "2040-12-31"}),
    ]));
    expect(result.activations).toEqual(expect.arrayContaining([
      expect.objectContaining({moduleId: "revenue.contracted", period: {start: "2027-01-01", end: "2035-12-31"}}),
      expect.objectContaining({moduleId: "revenue.merchant", period: {start: "2036-01-01", end: "2040-12-31"}}),
    ]));
  });
  it("is order-independent, but invalidates changed evidence or economic classification", () => {
    const input = request([...solar(), attr("revenue_model", "merchant")]);
    const before = compileEconomicContext(input);
    input.context.objects[0]!.attributes.reverse();
    expect(compileEconomicContext(input)).toEqual(before);
    input.context.objects[0]!.attributes[0]!.evidenceRefs[0]!.sourceVersion = "2";
    expect(compileEconomicContext(input).fingerprint).not.toBe(before.fingerprint);
  });
  it("does not invalidate a scoped plan when an unrelated object changes", () => {
    const input = request(solar());
    const before = compileEconomicContext(input);
    input.context.objects.push({id: "synthetic-unrelated", type: "company", attributes: [attr("sector", "retail")]});
    expect(compileEconomicContext(input)).toEqual(before);
  });
  it("reports unsupported and absent context instead of claiming coverage", () => {
    expect(compileEconomicContext(request([])).gaps[0]?.code).toBe("context_missing");
    expect(compileEconomicContext(request([attr("subsector", "unsupported-subsector")])).gaps[0]?.code).toBe("attribute_uncovered");
  });
  it("does not infer a specific industry from its broad parent sector", () => {
    const result = compileEconomicContext(request([attr("sector", "energy")]));
    expect(result.activations).toEqual([]);
    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0]).toMatchObject({code: "attribute_uncovered", moduleId: null, value: "energy"});
  });
  it("refuses Cartesian expansion beyond the documented composition limit", () => {
    const attributes: EconomicContextAttribute[] = [];
    for (let day = 1; day <= 17; day++) {
      const start = `2026-01-${String(day).padStart(2, "0")}`;
      attributes.push(attr("sector", "energy", {start, end: "2026-12-31"}));
      attributes.push(attr("subsector", "solar", {start, end: "2026-12-31"}));
    }
    const result = compileEconomicContext(request(attributes));
    expect(result.activations).toEqual([]);
    expect(result.gaps).toEqual(expect.arrayContaining([expect.objectContaining({code: "composition_limit"})]));
  });
});
