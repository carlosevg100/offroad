import {createHash} from "node:crypto";
import {describe, expect, it} from "vitest";
import {executionCanonicalText, executionContractFingerprint, executionContractSchema, executionInputFingerprint, pinExecutionContract} from "@offroad/agent-contracts";
import {composeBoundCapitalPacketV2, deriveBoundCapitalScope} from "@offroad/financial-model";
import {readContextualBasis} from "@offroad/reconciliation";
import {adoptedCapitalPeriodFixture} from "@offroad/testing-fixtures/capital-structure-decision";
import {composeExecutionContract, executionBudgetWindowMs, executionContractBasisSchema, executionContractText, snapshotFingerprint, type ExecutionContractBasis} from "./contract";

const id = (n: number) => `a4170000-0000-4000-9000-${String(n).padStart(12, "0")}`;
const hex = (c: string) => c.repeat(64);
function basis(): ExecutionContractBasis {
  const canonical = JSON.stringify({schemaVersion: "contextual-adoption.v1", versionId: id(3), workId: id(2), purpose: "prepare-capital-structure-decision", entries: []});
  return executionContractBasisSchema.parse({
    schemaVersion: "execution-contract-basis.v1", organizationId: id(1), workId: id(2), principalId: id(9),
    authorityRevision: "7", policyFingerprint: hex("b"), purpose: "prepare-capital-structure-decision", contextKey: "base", versionId: id(3),
    envelope: {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")},
    adoptions: [{id: id(10), assumptionVersionId: id(3), fingerprint: hex("c")}], hypotheses: [{id: id(11), assumptionVersionId: id(3), fingerprint: hex("c")}],
    sources: [{resourceId: id(2), sourceVersionId: id(20), contentHash: hex("d"), rightsRevision: "2"}], unverifiedSources: [{sourceVersionId: id(21), reason: "bytes_unverified"}],
    profile: {id: id(30), platformReleaseId: "prepare-capital-structure-decision-2026.09.21-v4",
      method: {platformReleaseId: "prepare-capital-structure-decision-2026.09.21-v4", houseReleaseId: null, methodId: "prepare-capital-structure-decision", methodVersion: "2026.09.21-v4",
        manifestHash: hex("e"), baseManifestHash: hex("e"), compilerVersion: "2026.09.21-v9", compilerHash: hex("f"),
        executor: {key: "@offroad/financial-model#prepareCapitalProcedurePacketV2", version: "2026.09.21-v2", sourceClosureHash: hex("1"), inputContractHash: hex("2"), outputContractHash: hex("3")}, formulas: []},
      tools: [], allowedEffects: ["read_only"], limits: {maxCostMicrousd: 0, maxModelCalls: 0, maxDurationMs: 31000}, fingerprint: hex("4")},
  });
}
const ids = {executionId: id(40), requestId: id(41), processingRunId: id(42), snapshotId: id(43)};
const now = new Date("2026-09-24T12:00:00.000Z");

describe("execution contract composition", () => {
  it("copies identity, authority, method bytes and pins from the basis and pins the exact snapshot text", () => {
    const b = basis(); const snapshot = {schemaVersion: "capital-procedure-packet-input.v2", decision: {question: "q"}};
    const text = executionCanonicalText(snapshot);
    const contract = composeExecutionContract(b, text, ids, now);
    expect(contract.method).toEqual(b.profile.method); expect(contract.tools).toEqual(b.profile.tools); expect(contract.allowedEffects).toEqual(b.profile.allowedEffects);
    expect(contract.purpose).toBe(b.purpose); expect(contract.organizationId).toBe(b.organizationId); expect(contract.principalId).toBe(b.principalId);
    expect(contract.audience).toEqual({kind: "work_participants", workId: b.workId, policyFingerprint: b.policyFingerprint});
    expect(contract.policy).toEqual({version: "execution-authority.v1", fingerprint: b.policyFingerprint, authorityRevision: "7"});
    expect(contract.inputs).toEqual({snapshotId: ids.snapshotId, fingerprint: snapshotFingerprint(text), sources: b.sources, adoptions: b.adoptions, hypotheses: b.hypotheses});
    expect(contract.inputs.fingerprint).toBe(executionInputFingerprint(snapshot));
    expect(contract.budget).toEqual({maxCostMicrousd: 0, maxModelCalls: 0, maxDurationMs: 31000, expiresAt: new Date(now.getTime() + executionBudgetWindowMs).toISOString()});
    expect(contract.requestedAt).toBe(now.toISOString());
    expect(executionContractSchema.safeParse(contract).success).toBe(true);
    expect(() => pinExecutionContract(contract, executionContractFingerprint(contract))).not.toThrow();
    expect(contract).not.toHaveProperty("unverifiedSources"); expect(contract).not.toHaveProperty("profileId");
  });
  it("is byte stable for the same inputs and changes only where the snapshot changes", () => {
    const b = basis(); const text = executionCanonicalText({a: 1});
    const first = composeExecutionContract(b, text, ids, now); const second = composeExecutionContract(basis(), text, {...ids}, new Date(now));
    expect(executionContractText(second)).toBe(executionContractText(first));
    expect(executionContractText(first)).toBe(executionCanonicalText(JSON.parse(executionContractText(first))));
    const other = composeExecutionContract(b, executionCanonicalText({a: 2}), ids, now);
    expect(other.inputs.fingerprint).not.toBe(first.inputs.fingerprint);
    expect({...other, inputs: first.inputs}).toEqual(first);
  });
  it("refuses a basis whose released profile is incomplete", () => {
    const b = basis();
    expect(executionContractBasisSchema.safeParse({...b, profile: {...b.profile, method: undefined}}).success).toBe(false);
    expect(executionContractBasisSchema.safeParse({...b, profile: {...b.profile, allowedEffects: []}}).success).toBe(false);
    expect(() => composeExecutionContract({...b, profile: {...b.profile, allowedEffects: [] as never}}, executionCanonicalText({}), ids, now)).toThrow("execution_basis_profile_incomplete");
    expect(() => composeExecutionContract({...b, authorityRevision: "0"}, executionCanonicalText({}), ids, now)).toThrow();
  });
  it("serializes a composed capital packet to the same bytes on every composition", () => {
    const f = adoptedCapitalPeriodFixture(); const canonical = JSON.stringify(f.snapshot);
    const envelope = {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")};
    const scope = {workId: f.snapshot.workId, purpose: f.snapshot.purpose, versionId: f.snapshot.versionId};
    const input = {envelope, scope, question: "Does the current structure sustain the plan?", objectives: ["Measure liquidity"], asOf: "2026-12-31", ...deriveBoundCapitalScope(readContextualBasis(envelope, scope), "2026-12-31")};
    const first = executionCanonicalText(composeBoundCapitalPacketV2(input)); const second = executionCanonicalText(composeBoundCapitalPacketV2(JSON.parse(JSON.stringify(input))));
    expect(second).toBe(first); expect(snapshotFingerprint(first)).toBe(executionInputFingerprint(composeBoundCapitalPacketV2(input)));
    expect(first).toContain(`"workId":"${scope.workId}"`); expect(Buffer.byteLength(first, "utf8")).toBeLessThan(8388608);
  });
});
