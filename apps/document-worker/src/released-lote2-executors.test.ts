import {describe, expect, it} from "vitest";
import {prepareCovenantHeadroomPacket, prepareDebtTablePacket, prepareWeeklyCashPacket} from "@offroad/financial-model";
import {loadReleasedCompiled, loadReleasedExecutionProfile} from "./released-method-executor";

// The ficha calibration fixtures live with each method's own tests; they are loaded at run time so
// the worker build does not compile another package's test sources.
const support = (file: string) => new URL(`../../../packages/financial-model/src/${file}`, import.meta.url).href;
type Sealed = {seal(): unknown};
const methods = [
  {identity: {methodId: "build-company-debt-table", methodVersion: "2026.10.23-v1", manifestHash: "3602b80383f4497d73ba67b1f567ab99f088a1b9929d9112874b01a30ea67379"},
    exportName: "prepareDebtTablePacket", source: prepareDebtTablePacket as (i: unknown) => {fingerprint: string}, maxDurationMs: 31000,
    input: async () => ({schemaVersion: "debt-table-packet-input.v1", question: "Monta a tabela de dívida com tudo que temos.",
      analysis: ((await import(/* @vite-ignore */ support("debt-table.test-support.ts"))) as {auroraDebtTableBasis: () => Sealed}).auroraDebtTableBasis().seal()})},
  {identity: {methodId: "measure-covenant-headroom", methodVersion: "2026.10.23-v1", manifestHash: "729794a4dd27c16f15abae1986b414c966f369f49e3b27b3e24197fe9b68bc67"},
    exportName: "prepareCovenantHeadroomPacket", source: prepareCovenantHeadroomPacket as (i: unknown) => {fingerprint: string}, maxDurationMs: 31000,
    input: async () => ({schemaVersion: "covenant-headroom-packet-input.v1", question: "Como estamos contra os covenants?", headlineMeasurementId: "dez26-base",
      analysis: ((await import(/* @vite-ignore */ support("covenant-headroom.test-support.ts"))) as {auroraCovenantBasis: () => Sealed}).auroraCovenantBasis().seal()})},
  {identity: {methodId: "project-weekly-cash", methodVersion: "2026.10.23-v1", manifestHash: "b7e135f7e60457bfd79f19817a064f1d69bf7301c1f7efcefed736e771362fb1"},
    exportName: "prepareWeeklyCashPacket", source: prepareWeeklyCashPacket as (i: unknown) => {fingerprint: string}, maxDurationMs: 31000,
    input: async () => ({schemaVersion: "weekly-cash-packet-input.v1", question: "Como fica o caixa até dezembro e o que vence?",
      analysis: ((await import(/* @vite-ignore */ support("weekly-cash.test-support.ts"))) as {auroraWeeklyCashBasis: () => Sealed}).auroraWeeklyCashBasis().seal()})},
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
