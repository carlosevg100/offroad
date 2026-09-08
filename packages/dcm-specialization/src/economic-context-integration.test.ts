import {describe, expect, it} from "vitest";
import type {EconomicContextCompileRequest} from "@offroad/agent-contracts";
import {compileObjectiveSpecialization} from "./index";

const baselineInput = {objectiveText: "Refinanciamento de dívida", taskIds: ["C05", "S10"], explicitActivationKeys: ["jurisdiction:BR"]};
function context(): EconomicContextCompileRequest {
  return {schemaVersion: "economic-context-compile-request.v1", intent: "financial_analysis", targetObjectIds: ["synthetic-solar"], context: {schemaVersion: "economic-context.v1", asOf: "2026-09-08", objects: [{id: "synthetic-solar", type: "asset", attributes: [
    {dimension: "sector", value: "energy", status: "confirmed", evidenceRefs: [{sourceId: "synthetic-report", sourceVersion: "1", anchor: "asset description"}]},
    {dimension: "subsector", value: "solar", status: "confirmed", evidenceRefs: [{sourceId: "synthetic-report", sourceVersion: "1", anchor: "technology"}]},
    {dimension: "revenue_model", value: "merchant", status: "confirmed", evidenceRefs: [{sourceId: "synthetic-report", sourceVersion: "1", anchor: "uncontracted production"}]},
    {dimension: "lifecycle", value: "construction", status: "confirmed", evidenceRefs: [{sourceId: "synthetic-report", sourceVersion: "1", anchor: "construction schedule"}]},
  ]}]}};
}

describe("objective specialization consumer compatibility", () => {
  it("preserves the no-context payload and explicit baseline fingerprint", () => {
    const result = compileObjectiveSpecialization(baselineInput);
    expect(result.fingerprint).toBe("2b6600bdc46081fb177694533b9600208c6f9b7d90929f8144d8d45199bfd900");
    expect(result).not.toHaveProperty("economicContextPlan");
    expect(result.selectedPackIds).toEqual(["core.institutional-dcm", "jurisdiction.brazil", "objective.refinance-liability-management"]);
    expect(result.coverageBinding.taskIds).toEqual(["C05", "S10"]);
  });
  it("attaches a sector plan without changing released packs, profile or task coverage", () => {
    const baseline = compileObjectiveSpecialization(baselineInput);
    const result = compileObjectiveSpecialization({...baselineInput, economicContext: context()});
    expect(result.fingerprint).not.toBe(baseline.fingerprint);
    expect(result.selectedPackIds).toEqual(baseline.selectedPackIds);
    expect(result.profile).toEqual(baseline.profile);
    expect(result.coverageBinding).toEqual(baseline.coverageBinding);
    expect(result.economicContextPlan?.activations.map((item) => item.moduleId)).toEqual(expect.arrayContaining(["sector.solar", "revenue.merchant", "lifecycle.construction"]));
    expect(result.economicContextPlan?.willExecute).toBe(false);
    expect(result.economicContextPlan?.externalEffectAllowed).toBe(false);
    expect(result.economicContextPlan?.requirements.every((item) => item.evidenceStatus === "not_examined")).toBe(true);
  });
  it.each(["proposed", "inferred", "conflicting"] as const)("%s context remains unresolved and cannot expand execution", (status) => {
    const request = context();
    request.context.objects[0]!.attributes.forEach((item) => {item.status = status;});
    const result = compileObjectiveSpecialization({...baselineInput, economicContext: request});
    expect(result.economicContextPlan?.activations).toEqual([]);
    expect(result.economicContextPlan?.requirements).toEqual([]);
    expect(result.economicContextPlan?.gaps.some((item) => item.code === "attribute_unresolved")).toBe(true);
    expect(result.economicContextPlan?.willExecute).toBe(false);
    expect(result.coverageBinding).toEqual(compileObjectiveSpecialization(baselineInput).coverageBinding);
  });
  it("invalidates the plan and specialization when a bound source version changes", () => {
    const request = context();
    const before = compileObjectiveSpecialization({...baselineInput, economicContext: request});
    request.context.objects[0]!.attributes[2]!.evidenceRefs[0]!.sourceVersion = "2";
    const after = compileObjectiveSpecialization({...baselineInput, economicContext: request});
    expect(after.fingerprint).not.toBe(before.fingerprint);
    expect(after.economicContextPlan?.contextFingerprint).not.toBe(before.economicContextPlan?.contextFingerprint);
    expect(after.economicContextPlan?.fingerprint).not.toBe(before.economicContextPlan?.fingerprint);
    expect(after.economicContextPlan?.requirements.find((item) => item.moduleId === "revenue.merchant")?.activationFingerprint).not.toBe(before.economicContextPlan?.requirements.find((item) => item.moduleId === "revenue.merchant")?.activationFingerprint);
    expect(after.selectedPackIds).toEqual(before.selectedPackIds);
    expect(after.coverageBinding).toEqual(before.coverageBinding);
  });
});
