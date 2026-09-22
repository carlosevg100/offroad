import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";
import {executionContractSchema, executionInputFingerprint as hash} from "./execution-contract";
import {assertContractMatchesExecutionProfile, deriveExecutionProfile} from "./execution-profile";

const real = JSON.parse(readFileSync(new URL("../../credit-playbook/knowledge/reviews/runs/capital-structure-decision-2026-09-21-v4-publication/manifest.json", import.meta.url), "utf8"));
const release = {id: "prepare-capital-structure-decision-2026.09.21-v4", manifestHash: "2c023cf7b7ec7e35b7f59d363a9b287cb245d3196cd431fc0c2bf1fc937f8478"};
const synthetic = () => {
  const ref = {module: "synthetic", exportName: "calculate", version: "1"};
  const sources = [{path: "synthetic.ts", hash: "a".repeat(64)}];
  const component = {id: "synthetic", version: "1", kind: "rule", inputs: {type: "string"}, outputs: {type: "string"}, executor: ref};
  return {schemaVersion: "compiled-procedure-manifest.v1", procedure: {id: "synthetic", version: "1"},
    compiler: {version: "1", sources, hash: hash(sources)},
    components: [{component, componentHash: hash(component), executor: {...ref, sources, hash: hash({ref, sources, inputContractHash: hash(component.inputs), outputContractHash: hash(component.outputs)})}}],
    budget: {currency: "BRL", maxCostMinorUnits: 0, maxModelCalls: 0, maxDurationMs: 31000}, allowedTools: [] as string[], maximumEffect: "none", grantsExecution: false};
};
const derive = (manifest: unknown) => {const manifestHash = hash(manifest); return deriveExecutionProfile({...manifest as object, manifestHash}, {id: "synthetic-1", manifestHash});};
const candidate = () => JSON.parse(readFileSync(new URL("../test-fixtures/execution-contract.json", import.meta.url), "utf8")).contract;

describe("published execution profile", () => {
  it("derives the exact published capital v4 without changing its method or permissions", () => {
    const profile = deriveExecutionProfile(real, release);
    expect(profile.method).toMatchObject({platformReleaseId: release.id, manifestHash: release.manifestHash,
      compilerVersion: "2026.09.21-v9", compilerHash: "228e32c8ea62f5111152b2e4a96f0bad1d1ca9f1ac7c2b2d4ccce822e415e97f",
      executor: {key: "@offroad/financial-model#prepareCapitalProcedurePacketV2", version: "2026.09.21-v2"}, formulas: []});
    expect(profile.limits).toEqual({maxCostMicrousd: 0, maxModelCalls: 0, maxDurationMs: 31000});
    expect(profile).toMatchObject({allowedEffects: ["read_only"], tools: [], grantsExecution: false, formulaCoverage: "executor_source_closure"});
    expect(profile.originalBudget).toEqual(real.budget);
    expect(Object.isFrozen(profile.method.executor)).toBe(true);
    const contract = candidate(); contract.method = profile.method; contract.tools = []; contract.allowedEffects = ["read_only"];
    contract.budget = {...contract.budget, ...profile.limits};
    expect(() => assertContractMatchesExecutionProfile(contract, profile)).not.toThrow();
    expect(() => assertContractMatchesExecutionProfile(contract, JSON.parse(JSON.stringify(profile)))).toThrow("execution_profile_derivation_required");
  });
  it("rejects changed bytes under a published hash and a different release identity", () => {
    expect(() => deriveExecutionProfile({...real, maximumEffect: "external"}, release)).toThrow("execution_profile_manifest_mismatch");
    expect(() => deriveExecutionProfile(real, {...release, id: "other"})).toThrow("execution_profile_release_mismatch");
  });
  it.each(["compiler", "component", "executor", "missing executor", "unknown format"])("rejects inconsistent %s even under a newly signed fixture", change => {
    const manifest = synthetic();
    if (change === "compiler") manifest.compiler.hash = "b".repeat(64);
    if (change === "component") manifest.components[0]!.componentHash = "b".repeat(64);
    if (change === "executor") manifest.components[0]!.executor.hash = "b".repeat(64);
    if (change === "missing executor") Object.assign(manifest.components[0]!, {executor: null});
    if (change === "unknown format") manifest.schemaVersion = "legacy";
    expect(() => derive(manifest)).toThrow();
  });
  it("rejects missing or ambiguous executors without selecting the first", () => {
    const manifest = synthetic();
    expect(() => derive({...manifest, components: []})).toThrow();
    expect(() => derive({...manifest, components: [...manifest.components, ...manifest.components]})).toThrow("execution_profile_component_duplicate");
    const other = {...manifest.components[0]!, component: {...manifest.components[0]!.component, id: "other"}};
    other.componentHash = hash(other.component);
    expect(() => derive({...manifest, components: [...manifest.components, other]})).toThrow("execution_profile_executor_ambiguous");
  });
  it.each(["cost", "model", "tool", "effect"])("does not invent an adapter for %s authority", change => {
    const manifest = synthetic();
    if (change === "cost") manifest.budget.maxCostMinorUnits = 1;
    if (change === "model") manifest.budget.maxModelCalls = 1;
    if (change === "tool") manifest.allowedTools = ["external_search"];
    if (change === "effect") manifest.maximumEffect = "commit";
    expect(() => derive(manifest)).toThrow("execution_profile_policy_requires_adapter");
  });
  it.each(["executor", "formula", "compiler", "house", "cost", "calls", "duration", "effect", "tool"])("rejects a contract that expands %s beyond its profile", change => {
    const profile = derive(synthetic()), contract = candidate();
    contract.method = structuredClone(profile.method); contract.tools = []; contract.allowedEffects = ["read_only"];
    contract.budget = {...contract.budget, ...profile.limits};
    if (change === "executor") contract.method.executor.version = "2";
    if (change === "formula") contract.method.formulas = [{id: "unpublished", version: "1", sourceHash: "b".repeat(64)}];
    if (change === "compiler") contract.method.compilerHash = "b".repeat(64);
    if (change === "house") contract.method.houseReleaseId = contract.workId;
    if (change === "cost") contract.budget.maxCostMicrousd = 1;
    if (change === "calls") contract.budget.maxModelCalls = 1;
    if (change === "duration") contract.budget.maxDurationMs++;
    if (change === "effect") contract.allowedEffects.push("compile_artifact");
    if (change === "tool") contract.tools = [{id: "calculate", version: "1", effect: "read_only"}];
    expect(() => assertContractMatchesExecutionProfile(contract, profile)).toThrow();
  });
  it("permits a smaller duration and refuses missing or invalid duration", () => {
    const profile = derive(synthetic()), contract = candidate();
    contract.method = profile.method; contract.tools = []; contract.allowedEffects = ["read_only"];
    contract.budget = {...contract.budget, ...profile.limits, maxDurationMs: 100};
    expect(() => assertContractMatchesExecutionProfile(contract, profile)).not.toThrow();
    for (const maxDurationMs of [undefined, 0, -1, 0.5, Infinity]) expect(executionContractSchema.safeParse({...contract, budget: {...contract.budget, maxDurationMs}}).success).toBe(false);
  });
});
