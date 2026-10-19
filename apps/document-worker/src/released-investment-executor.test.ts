import {describe, expect, it} from "vitest";
import {prepareInvestmentDecisionPacket} from "@offroad/financial-model";
import {loadReleasedCompiled, loadReleasedExecutionProfile} from "./released-method-executor";

const identity = {methodId: "analyze-investment-project", methodVersion: "2026.10.09-v2", manifestHash: "aff463906b33b63104790fe9beb18521511dffbbf4cb63344c015e79496cf9d2"};
// The C32 calibration fixture lives with the method's own tests; it is loaded at run time so the
// worker build does not compile another package's test sources.
const supportPath = new URL("../../../packages/financial-model/src/investment-decision-packet.test-support.ts", import.meta.url).href;
async function c32Input() {
  const {c32PacketInput} = await import(/* @vite-ignore */ supportPath) as {c32PacketInput: (o?: {quantum?: string}) => {seal(): void; input: unknown}};
  const fixture = c32PacketInput({quantum: "10000"});
  fixture.seal();
  return fixture.input;
}

describe("installed published investment executor", () => {
  it("loads the immutable calculation with a zero-model, zero-cost profile that grants nothing", () => {
    const {executor, profile} = loadReleasedCompiled(identity);
    expect(executor.prepareInvestmentDecisionPacket).not.toBe(prepareInvestmentDecisionPacket);
    expect(profile.method.manifestHash).toBe(identity.manifestHash);
    expect(profile.grantsExecution).toBe(false);
    expect(profile.limits).toEqual({maxCostMicrousd: 0, maxModelCalls: 0, maxDurationMs: 31000});
    expect(loadReleasedExecutionProfile(identity)).toEqual(profile);
  });

  it("computes on the C32 calibration exactly what the reviewed source computes", async () => {
    const input = await c32Input();
    const {executor} = loadReleasedCompiled(identity);
    const packaged = (executor.prepareInvestmentDecisionPacket as (i: unknown) => {fingerprint: string; comparison: {conclusionChangingCaseIds: string[]}})(JSON.parse(JSON.stringify(input)));
    const source = prepareInvestmentDecisionPacket(JSON.parse(JSON.stringify(input)));
    expect(packaged.fingerprint).toBe(source.fingerprint);
    expect(packaged.comparison.conclusionChangingCaseIds).toEqual(["economy-4", "capex-120", "slower-start"]);
  });

  it("rejects malformed input inside the packaged module and any unpublished identity", () => {
    const {executor} = loadReleasedCompiled(identity);
    expect(() => (executor.prepareInvestmentDecisionPacket as (i: unknown) => unknown)({})).toThrow();
    expect(() => loadReleasedCompiled({...identity, manifestHash: "0".repeat(64)})).toThrow("published_method_executor_unavailable");
  });
});
