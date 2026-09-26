import {capitalProcedurePacketBlocks, readCapitalProcedurePacketBlocks, type CapitalProcedurePacketLike} from "@offroad/domain-contracts";
// The packet the SQL producer and the contract mapping are proved against.
import packetFixture from "../../../../../packages/domain-contracts/src/fixtures/execution-result-packet.json";
import {describe, expect, it, vi} from "vitest";

vi.mock("server-only", () => ({}));

import {artifactReadFixture, artifactRpc} from "@/lib/artifacts/artifact-read.test-support";
import {parseArtifactRead} from "@/lib/artifacts/authorized-artifact-reader";
import {executionResultHref, executionResultSubject, executionRevisionFromRead, loadExecutionRevision} from "./revision";

const workId = "10000000-0000-4000-8000-000000000001";
const executionId = "20000000-0000-4000-8000-000000000001";
const revisionId = "30000000-0000-4000-8000-000000000001";
const packet = packetFixture as unknown as CapitalProcedurePacketLike;
const blocks = capitalProcedurePacketBlocks(packet) as unknown as NonNullable<Parameters<typeof artifactReadFixture>[0]["blocks"]>;
const execution = {executionId, resultFingerprint: "d".repeat(64), inputFingerprint: "e".repeat(64)};
const traces = [`capital-procedure-packet:${packet.fingerprint}`, `capital-decision-delivery:${packet.decision.fingerprint}`, "financial-core:financial-core.2026.09.18", `execution-gates:${"f".repeat(64)}`];

const recorded = (overrides: Partial<Parameters<typeof artifactReadFixture>[0]> = {}) => artifactReadFixture({
  workId, kind: "execution_result", subject: executionResultSubject(executionId), revisionId, release: "released", format: "json", execution, traces, blocks, ...overrides,
});
function parsed(value: ReturnType<typeof artifactReadFixture>) {
  const result = parseArtifactRead(value);
  if (!result.ok) throw new Error(result.error);
  return result.read;
}
const client = (reads: ReturnType<typeof artifactReadFixture>[]) => ({rpc: artifactRpc(reads)}) as never;

describe("the registered revision of an execution result", () => {
  it("gives the blocks and the pins of a revision the reader may serve", () => {
    const state = executionRevisionFromRead(parsed(recorded({freshness: "stale", revisionNo: 1})), executionId);
    expect(state).toEqual({state: "ready", revision: {
      revisionNo: 1, recordedAt: "2026-09-26T18:39:57.123456+00:00", freshness: "stale",
      pins: {resultFingerprint: "d".repeat(64), packetFingerprint: packet.fingerprint, gatesFingerprint: "f".repeat(64)},
      blocks: readCapitalProcedurePacketBlocks(blocks),
    }});
    // Without a gate receipt among the traces, the revision pins none.
    const plain = executionRevisionFromRead(parsed(recorded({traces: traces.slice(0, 3)})), executionId);
    expect(plain.state === "ready" && plain.revision.pins.gatesFingerprint).toBeNull();
  });

  it("serves nothing the database withheld and reads nothing it cannot map", () => {
    expect(executionRevisionFromRead(parsed(recorded({restriction: {kind: "source_rights", linkIds: ["9f000000-0000-4000-8000-000000000001"], unresolvedRevisionIds: []}})), executionId))
      .toEqual({state: "withheld"});
    expect(executionRevisionFromRead(parsed(recorded({release: "blocked"})), executionId)).toEqual({state: "withheld"});
    expect(executionRevisionFromRead(parsed(recorded({execution: {...execution, executionId: "20000000-0000-4000-8000-000000000002"}})), executionId)).toEqual({state: "unavailable"});
    expect(executionRevisionFromRead(parsed(recorded({blocks: blocks.filter((block) => block.blockKey !== "framing")})), executionId)).toEqual({state: "unavailable"});
  });

  it("reads the head, or the exact revision a link names, and answers a revision of another execution as a mismatch", async () => {
    const head = await loadExecutionRevision(client([recorded()]), {workId, executionId});
    expect(head.state).toBe("ready");
    expect(await loadExecutionRevision(client([]), {workId, executionId})).toEqual({state: "absent"});
    expect((await loadExecutionRevision(client([recorded()]), {workId, executionId, revisionId})).state).toBe("ready");
    const other = recorded({subject: executionResultSubject("20000000-0000-4000-8000-000000000009"), execution: {...execution, executionId: "20000000-0000-4000-8000-000000000009"}});
    expect(await loadExecutionRevision(client([other]), {workId, executionId, revisionId})).toEqual({state: "mismatch"});
    expect(await loadExecutionRevision(client([]), {workId, executionId, revisionId})).toEqual({state: "mismatch"});
    const broken = {rpc: async () => ({data: null, error: {code: "08006", message: "connection failure"}})} as never;
    expect(await loadExecutionRevision(broken, {workId, executionId})).toEqual({state: "unavailable"});
    expect(await loadExecutionRevision(broken, {workId, executionId, revisionId})).toEqual({state: "unavailable"});
  });

  it("links a citation to the execution's screen on the exact revision", () => {
    expect(executionResultHref("pt-BR", workId, {executionId, revisionId})).toBe(`/pt-BR/app/projects/${workId}/executions/${executionId}?revision=${revisionId}`);
  });
});
