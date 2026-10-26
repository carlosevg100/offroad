import {describe, expect, it} from "vitest";
import {prepareOperatingProjectionPacket, prepareProjectionChallengePacket, prepareQuarterUpdatePacket, prepareReceivablesFundingPacket} from "@offroad/financial-model";
import {loadReleasedCompiled, loadReleasedExecutionProfile} from "./released-method-executor";

// The ficha calibration fixtures live with each method's own tests; they are loaded at run time so
// the worker build does not compile another package's test sources.
const support = (file: string) => new URL(`../../../packages/financial-model/src/${file}`, import.meta.url).href;
type Sealed = {seal(): unknown};
const methods = [
  {identity: {methodId: "build-operating-projection", methodVersion: "2026.10.26-v1", manifestHash: "4caf3653c36d13d238967cc35b0f34f3a4f641fe55cb5f42b60f471127a5614a"},
    exportName: "prepareOperatingProjectionPacket", source: prepareOperatingProjectionPacket as (i: unknown) => {fingerprint: string}, maxDurationMs: 31000,
    input: async () => ({schemaVersion: "operating-projection-packet-input.v1", question: "Não temos projeção pronta. Ajuda a construir uma para discutir o financiamento.",
      analysis: ((await import(/* @vite-ignore */ support("operating-projection.test-support.ts"))) as {auroraProjectionBasis: () => Sealed}).auroraProjectionBasis().seal()})},
  {identity: {methodId: "challenge-financial-projection", methodVersion: "2026.10.26-v1", manifestHash: "1180b9a1e88f3e9bf0857f0f98232fac2cdd34c7496388c9d61f2a2580c2ff64"},
    exportName: "prepareProjectionChallengePacket", source: prepareProjectionChallengePacket as (i: unknown) => {fingerprint: string}, maxDurationMs: 31000,
    input: async () => ({schemaVersion: "projection-challenge-packet-input.v1", question: "Que premissas você questionaria nessa projeção? Vai para os bancos semana que vem.",
      analysis: ((await import(/* @vite-ignore */ support("projection-challenge.test-support.ts"))) as {auroraProjectionBasis: () => Sealed}).auroraProjectionBasis().seal()})},
  {identity: {methodId: "monetize-receivables-for-working-capital", methodVersion: "2026.10.26-v1", manifestHash: "40acfbd4ff347ee89baad9310dacefc9c73c9d501a13241c0a4d0b3ebd23b3e5"},
    exportName: "prepareReceivablesFundingPacket", source: prepareReceivablesFundingPacket as (i: unknown) => {fingerprint: string}, maxDurationMs: 31000,
    input: async () => ({schemaVersion: "receivables-funding-packet-input.v1", question: "Tenho uns 60 milhões de recebíveis. Dá para usar isso para financiar a safra em vez da linha do banco?",
      analysis: ((await import(/* @vite-ignore */ support("receivables-funding.test-support.ts"))) as {auroraReceivablesFundingBasis: () => Sealed}).auroraReceivablesFundingBasis().seal()})},
  {identity: {methodId: "update-after-quarter-close", methodVersion: "2026.10.26-v1", manifestHash: "f09b5f5227bf74f31e6c4f65a132f990ea2fadfca86e9be0fedf9723fa8c5729"},
    exportName: "prepareQuarterUpdatePacket", source: prepareQuarterUpdatePacket as (i: unknown) => {fingerprint: string}, maxDurationMs: 31000,
    input: async () => ({schemaVersion: "quarter-update-packet-input.v1", question: "Fechou o trimestre. Atualiza tudo.",
      analysis: ((await import(/* @vite-ignore */ support("quarter-update.test-support.ts"))) as {auroraQuarterUpdateBasis: () => Sealed}).auroraQuarterUpdateBasis().seal()})},
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
