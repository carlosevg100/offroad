import {describe, expect, it} from "vitest";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {loadReleasedCapital, verifyInstalledMethodArtifacts} from "./released-method-executor";
import {releasedMethodArtifacts} from "./released-methods.generated";
import {prepareCapitalProcedurePacketV2} from "@offroad/financial-model";
const identity = {methodId:"prepare-capital-structure-decision",methodVersion:"2026.09.21-v4",manifestHash:"2c023cf7b7ec7e35b7f59d363a9b287cb245d3196cd431fc0c2bf1fc937f8478"};
describe("installed published capital executor", () => {
  it("loads the distinct immutable calculation and its derived profile", () => {
    const {executor, profile} = loadReleasedCapital(identity);
    expect(executor.prepareCapitalProcedurePacketV2).not.toBe(prepareCapitalProcedurePacketV2);
    expect(profile.method.manifestHash).toBe(identity.manifestHash);
    expect(profile.grantsExecution).toBe(false);
    expect(profile.limits).toEqual({maxCostMicrousd:0,maxModelCalls:0,maxDurationMs:31000});
  });
  it("rejects unavailable identities rather than replacing them with current source", () => {
    expect(() => loadReleasedCapital({...identity,methodVersion:"unpublished"})).toThrow("published_method_executor_unavailable");
    expect(() => loadReleasedCapital({...identity,manifestHash:"0".repeat(64)})).toThrow("published_method_executor_unavailable");
    expect(() => loadReleasedCapital({...identity,methodId:"underwrite-receivables-pool"})).toThrow("published_method_executor_unavailable");
  });
  it("keeps input and output validation inside the packaged module", () => {
    const {executor} = loadReleasedCapital(identity);
    expect(executor.capitalProcedurePacketV2InputSchema.safeParse({}).success).toBe(false);
    expect(executor.capitalProcedurePacketV2OutputSchema.safeParse({}).success).toBe(false);
    expect(() => executor.prepareCapitalProcedurePacketV2({})).toThrow();
  });
  it("verifies both published artifacts at startup without executing a customer job", () => {
    expect(verifyInstalledMethodArtifacts()).toBe(2);
    const entry = releasedMethodArtifacts.find(r => r.methodId === identity.methodId)!;
    expect(createHash("sha256").update(readFileSync(new URL(`../released-methods/${entry.artifactHash}.cjs`, import.meta.url))).digest("hex")).toBe(entry.artifactHash);
  });
});
