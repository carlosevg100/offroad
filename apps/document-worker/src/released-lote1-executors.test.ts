import {describe, expect, it} from "vitest";
import {prepareDebtCapacityPacket, prepareFinancingComparisonPacket, prepareRelativeDebtCostPacket} from "@offroad/financial-model";
import {loadReleasedCompiled, loadReleasedExecutionProfile} from "./released-method-executor";

// The ficha calibration fixtures live with each method's own tests; they are loaded at run time so
// the worker build does not compile another package's test sources.
const support = (file: string) => new URL(`../../../packages/financial-model/src/${file}`, import.meta.url).href;
type Sealed = {seal(): unknown};
const methods = [
  {identity: {methodId: "compare-financing-proposals", methodVersion: "2026.10.19-v2", manifestHash: "99845f7641e498c7fb0aa6f439b0376076d849c523a5a15af8935a113be43726"},
    exportName: "prepareFinancingComparisonPacket", source: prepareFinancingComparisonPacket as (i: unknown) => {fingerprint: string}, maxDurationMs: 61000,
    input: async () => ((await import(/* @vite-ignore */ support("financing-comparison.test-support.ts"))) as {c02PacketInput: () => Sealed}).c02PacketInput().seal()},
  {identity: {methodId: "analyze-relative-debt-cost", methodVersion: "2026.10.19-v2", manifestHash: "8ec65ef01d6640001ff7e5049f82d9d0add523cf4013085c05081e0550f57796"},
    exportName: "prepareRelativeDebtCostPacket", source: prepareRelativeDebtCostPacket as (i: unknown) => {fingerprint: string}, maxDurationMs: 31000,
    input: async () => ((await import(/* @vite-ignore */ support("relative-debt-cost.test-support.ts"))) as {c03PacketInput: () => Sealed}).c03PacketInput().seal()},
  {identity: {methodId: "assess-debt-capacity", methodVersion: "2026.10.19-v2", manifestHash: "13574b282016b8122f07ab4164fa4c68e5af4b3eb26078189e9e72fe668484c5"},
    exportName: "prepareDebtCapacityPacket", source: prepareDebtCapacityPacket as (i: unknown) => {fingerprint: string}, maxDurationMs: 31000,
    input: async () => ((await import(/* @vite-ignore */ support("debt-capacity.test-support.ts"))) as {c04PacketInput: () => Sealed}).c04PacketInput().seal()},
];

describe.each(methods)("installed published executor $identity.methodId", ({identity, exportName, source, maxDurationMs, input}) => {
  it("loads the immutable calculation with a zero-model, zero-cost profile that grants nothing", () => {
    const {executor, profile} = loadReleasedCompiled(identity);
    expect(executor[exportName]).toBeTypeOf("function");
    expect(executor[exportName]).not.toBe(source);
    expect(profile.method.manifestHash).toBe(identity.manifestHash);
    expect(profile.grantsExecution).toBe(false);
    expect(profile.limits).toEqual({maxCostMicrousd: 0, maxModelCalls: 0, maxDurationMs});
    expect(loadReleasedExecutionProfile(identity)).toEqual(profile);
  });

  it("computes on the ficha calibration exactly what the reviewed source computes", async () => {
    const sealed = JSON.stringify(await input());
    const {executor} = loadReleasedCompiled(identity);
    const packaged = (executor[exportName] as (i: unknown) => {fingerprint: string})(JSON.parse(sealed));
    expect(packaged.fingerprint).toBe(source(JSON.parse(sealed)).fingerprint);
  }, 120000);

  it("rejects malformed input inside the packaged module and any unpublished identity", () => {
    const {executor} = loadReleasedCompiled(identity);
    expect(() => (executor[exportName] as (i: unknown) => unknown)({})).toThrow();
    expect(() => loadReleasedCompiled({...identity, manifestHash: "0".repeat(64)})).toThrow("published_method_executor_unavailable");
  });
});
