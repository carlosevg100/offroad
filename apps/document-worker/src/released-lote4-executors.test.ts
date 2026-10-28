import {describe, expect, it} from "vitest";
import {prepareBoardCapitalDiscussionPacket, prepareCapitalPathsPacket, prepareDocumentFolderInventoryPacket, prepareReceivedProposalPacket} from "@offroad/financial-model";
import {loadReleasedCompiled, loadReleasedExecutionProfile} from "./released-method-executor";

// The ficha calibration fixtures live with each method's own tests; they are loaded at run time so
// the worker build does not compile another package's test sources.
const support = (file: string) => new URL(`../../../packages/financial-model/src/${file}`, import.meta.url).href;
type Sealed = {seal(): unknown};
const methods = [
  {identity: {methodId: "organize-document-folder", methodVersion: "2026.10.27-v1", manifestHash: "4378d63bf0b7465838fefe7e3463dbc755cd6c022803a60ac7fe32d368f75248"},
    exportName: "prepareDocumentFolderInventoryPacket", source: prepareDocumentFolderInventoryPacket as (i: unknown) => {fingerprint: string},
    input: async () => ((await import(/* @vite-ignore */ support("document-folder-inventory-runs.test-support.ts"))) as {folderPacketInput: () => unknown}).folderPacketInput()},
  {identity: {methodId: "evaluate-received-proposal", methodVersion: "2026.10.27-v1", manifestHash: "4e092f29299e5cefcf650532b470794a387c077474503ace43909a93c1d040e0"},
    exportName: "prepareReceivedProposalPacket", source: prepareReceivedProposalPacket as (i: unknown) => {fingerprint: string},
    input: async () => {
      const m = (await import(/* @vite-ignore */ support("evaluate-received-proposal.test-support.ts"))) as {receivedProposalQuestion: string; auroraReceivedProposalBasis: () => Sealed};
      return {schemaVersion: "received-proposal-packet-input.v1", question: m.receivedProposalQuestion, analysis: m.auroraReceivedProposalBasis().seal()};
    }},
  {identity: {methodId: "evaluate-financing-paths", methodVersion: "2026.10.27-v1", manifestHash: "e306d411ea0e88bcbabe3bb3a62e80bfd43d1e65055477cfcda042d549606af4"},
    exportName: "prepareCapitalPathsPacket", source: prepareCapitalPathsPacket as (i: unknown) => {fingerprint: string},
    input: async () => ((await import(/* @vite-ignore */ support("capital-structure-paths.test-support.ts"))) as {auroraCapitalPathsBasis: () => Sealed}).auroraCapitalPathsBasis().seal()},
  // C47, the role-bound version published from main 34cb9daf: the calibration's second turn (the material prepared).
  {identity: {methodId: "prepare-board-capital-discussion", methodVersion: "2026.10.27-v1", manifestHash: "48a38410ef49409ebd2ea5f017a25c498443c337da193ac4a0a931f843094a98"},
    exportName: "prepareBoardCapitalDiscussionPacket", source: prepareBoardCapitalDiscussionPacket as (i: unknown) => {fingerprint: string},
    input: async () => ((await import(/* @vite-ignore */ support("board-capital-discussion-runs.test-support.ts"))) as {boardPacketInput: (turn: number) => unknown}).boardPacketInput(2)},
];

describe.each(methods)("installed published executor $identity.methodId", ({identity, exportName, source, input}) => {
  it("loads the immutable calculation with a zero-model, zero-cost profile that grants nothing", () => {
    const {executor, profile} = loadReleasedCompiled(identity);
    expect(executor[exportName]).toBeTypeOf("function");
    expect(executor[exportName]).not.toBe(source);
    expect(profile.method.manifestHash).toBe(identity.manifestHash);
    expect(profile.grantsExecution).toBe(false);
    expect(profile.limits).toMatchObject({maxCostMicrousd: 0, maxModelCalls: 0});
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

describe("the board discussion (C47)", () => {
  it("packages only the published manifest: the earlier candidate of the literal-id version has no executor", () => {
    expect(() => loadReleasedCompiled({methodId: "prepare-board-capital-discussion", methodVersion: "2026.10.27-v1", manifestHash: "55ae460feed68a733634865c5b85dba0695cac5c1da7ac584244a9f44c4c5686"}))
      .toThrow("published_method_executor_unavailable");
  });
});
