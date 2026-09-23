import {createHash} from "node:crypto";
import {describe, expect, it} from "vitest";
import {executionCanonicalText} from "@offroad/agent-contracts";
import {composeBoundCapitalPacketV2, deriveBoundCapitalScope, prepareCapitalProcedurePacketV2} from "@offroad/financial-model";
import {readContextualBasis} from "@offroad/reconciliation";
import {capitalStructureDecisionFixture} from "@offroad/testing-fixtures/capital-structure-decision";
import {projectWorkExecution, projectWorkExecutionList, readCommittedResult, workExecutionState} from "./read";

const id = (n: number) => `a4180000-0000-4000-9000-${String(n).padStart(12, "0")}`;
const hex = (c: string) => c.repeat(64);
function packetText() {
  const f = capitalStructureDecisionFixture(); const canonical = JSON.stringify(f.snapshot);
  const envelope = {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")};
  const scope = {workId: f.snapshot.workId, purpose: f.snapshot.purpose, versionId: f.snapshot.versionId};
  const packet = composeBoundCapitalPacketV2({envelope, scope, question: "Does the current structure hold?", objectives: ["Measure liquidity"], asOf: "2027-12-31", ...deriveBoundCapitalScope(readContextualBasis(envelope, scope), "2027-12-31")});
  return executionCanonicalText(prepareCapitalProcedurePacketV2(packet));
}
const base = {schemaVersion: "work-execution-read.v1", executionId: id(1), workId: id(2), requestId: id(3), processingRunId: id(4), createdAt: "2026-09-24T12:00:00+00:00",
  job: {status: "queued", attempts: 0, lastErrorCode: null, availableAt: "2026-09-24T12:00:00+00:00", updatedAt: "2026-09-24T12:00:00+00:00"},
  run: {status: "queued", completedAt: null, usage: {}},
  manifest: {contractFingerprint: hex("a"), inputFingerprint: hex("b"), purpose: "prepare-capital-structure-decision", method: {methodId: "prepare-capital-structure-decision", methodVersion: "2026.09.21-v4", manifestHash: hex("c")}, budget: {maxModelCalls: 0}, requestedAt: "2026-09-24T12:00:00+00:00"},
  operation: null, result: null, inputsCurrent: true};

describe("work execution read projection", () => {
  it("shows a queued execution without a result", () => {
    const view = projectWorkExecution(base);
    expect(view).toMatchObject({state: "queued", outcome: null, reason: null, inputsCurrent: true, result: null, manifest: {methodId: "prepare-capital-structure-decision", methodVersion: "2026.09.21-v4"}});
    expect(projectWorkExecution({...base, job: {...base.job, status: "leased"}}).state).toBe("leased");
    expect(projectWorkExecution({...base, job: {...base.job, status: "failed", lastErrorCode: "execution_calculation_failed"}}).state).toBe("failed");
    expect(projectWorkExecution({...base, job: null}).state).toBe("unknown");
  });
  it("reads the published packet out of committed bytes and lists gaps and requirements", () => {
    const text = packetText();
    const view = projectWorkExecution({...base, job: {...base.job, status: "succeeded"}, result: {outcome: "succeeded", reason: "calculated", resultFingerprint: hex("d"), canonicalResult: text, committedAt: "2026-09-24T12:05:00+00:00"}});
    expect(view.state).toBe("succeeded"); expect(view.reason).toBe("calculated");
    if (!view.result || view.result.withheld) throw new Error("result expected");
    expect(view.result.packet?.status).toBe("partial"); expect(view.result.marker).toBeNull();
    expect(view.result.packet?.alternatives).toEqual([{id: "current", label: "Current structure as recorded in the working basis", kind: "maintain", calculated: false}]);
    expect(view.result.packet?.informationGaps.filter(g => g.code === "projection_input_missing")).toHaveLength(26);
    expect(view.result.packet?.nextRequirements).toEqual(["source", "assumption", "contract", "market", "implementation", "recommendation"]);
    expect(view.result.packet?.contributions).toBe(0);
  });
  it("keeps the worker's partial marker distinct from a packet and never narrates unknown bytes", () => {
    expect(readCommittedResult(executionCanonicalText({status: "partial", reason: "invalid_input"}))).toEqual({packet: null, marker: {status: "partial", reason: "invalid_input"}});
    expect(readCommittedResult("{\"approved\":true}")).toEqual({packet: null, marker: null});
    expect(readCommittedResult("not json")).toEqual({packet: null, marker: null});
    const view = projectWorkExecution({...base, result: {outcome: "partial", reason: "budget_exhausted", resultFingerprint: hex("d"), canonicalResult: executionCanonicalText({status: "partial", reason: "budget_exhausted"}), committedAt: "2026-09-24T12:05:00+00:00"}});
    expect(view.state).toBe("partial"); expect(view.result).toMatchObject({withheld: false, packet: null, marker: {reason: "budget_exhausted"}});
  });
  it("withholds bytes the database withheld and says why", () => {
    const view = projectWorkExecution({...base, inputsCurrent: false, result: {withheld: "inputs_not_current", outcome: "succeeded", reason: "calculated", resultFingerprint: hex("d"), committedAt: "2026-09-24T12:05:00+00:00"}});
    expect(view.state).toBe("withheld"); expect(view.inputsCurrent).toBe(false);
    expect(view.result).toEqual({withheld: true, resultFingerprint: hex("d"), committedAt: "2026-09-24T12:05:00+00:00"});
    expect(JSON.stringify(view)).not.toContain("canonicalResult");
  });
  it("fails closed on a shape it does not recognize", () => {
    expect(() => projectWorkExecution({...base, schemaVersion: "other"})).toThrow();
    expect(() => projectWorkExecution({...base, result: {outcome: "approved", reason: "x", resultFingerprint: hex("d"), canonicalResult: "{}", committedAt: "now"}})).toThrow();
    expect(() => projectWorkExecution({...base, job: {...base.job, leaseId: id(9)}})).not.toThrow();
  });
  it("projects the list with a cursor only when more rows exist", () => {
    const row = (n: number, jobStatus: string | null, outcome: string | null) => ({executionId: id(n), requestId: id(n), processingRunId: id(n), createdAt: `2026-09-24T12:00:${String(n % 60).padStart(2, "0")}+00:00`, jobStatus, runStatus: null, outcome, reason: outcome ? "calculated" : null, purpose: "prepare-capital-structure-decision"});
    const short = projectWorkExecutionList([row(1, "queued", null), row(2, "succeeded", "succeeded")]);
    expect(short.nextCursor).toBeNull(); expect(short.items.map(i => i.state)).toEqual(["queued", "succeeded"]);
    const long = projectWorkExecutionList(Array.from({length: 26}, (_, n) => row(n + 1, "queued", null)));
    expect(long.items).toHaveLength(25); expect(long.nextCursor).toBe(id(25));
    expect(workExecutionState({outcome: null, jobStatus: "mystery"})).toBe("unknown");
  });
});
