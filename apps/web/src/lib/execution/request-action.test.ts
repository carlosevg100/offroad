import {createHash} from "node:crypto";
import {beforeEach, describe, expect, it, vi} from "vitest";
import {executionContractSchema, executionInputFingerprint} from "@offroad/agent-contracts";
import {capitalProcedurePacketV2InputSchema} from "@offroad/financial-model";
import {adoptedCapitalPeriodFixture} from "@offroad/testing-fixtures/capital-structure-decision";
const mocks = vi.hoisted(() => ({rpc: vi.fn(), project: vi.fn(), workspace: vi.fn(), revalidate: vi.fn()}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({revalidatePath: mocks.revalidate}));
vi.mock("@/lib/auth/workspace", () => ({requireWorkspace: mocks.workspace}));
import {requestCapitalExecution} from "@/app/[locale]/app/projects/[projectId]/executions/actions";
import {executionRequestFailure} from "./failure";

const id = (n: number) => `a4190000-0000-4000-9000-${String(n).padStart(12, "0")}`;
const hex = (c: string) => c.repeat(64);
const fixture = adoptedCapitalPeriodFixture();
const snapshot = {...fixture.snapshot, workId: id(2), versionId: id(3), purpose: "prepare-capital-structure-decision"};
const canonical = JSON.stringify(snapshot);
function basis() {
  return {schemaVersion: "execution-contract-basis.v1", organizationId: id(1), workId: id(2), principalId: id(9), authorityRevision: "3", policyFingerprint: hex("b"),
    purpose: "prepare-capital-structure-decision", contextKey: "base", versionId: id(3), envelope: {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")},
    adoptions: [], hypotheses: snapshot.entries.map(e => ({id: e.decisionId, assumptionVersionId: id(3), fingerprint: hex("c")})), sources: [], unverifiedSources: [],
    profile: {id: id(30), platformReleaseId: "prepare-capital-structure-decision-2026.09.21-v4",
      method: {platformReleaseId: "prepare-capital-structure-decision-2026.09.21-v4", houseReleaseId: null, methodId: "prepare-capital-structure-decision", methodVersion: "2026.09.21-v4",
        manifestHash: hex("e"), baseManifestHash: hex("e"), compilerVersion: "2026.09.21-v9", compilerHash: hex("f"),
        executor: {key: "@offroad/financial-model#prepareCapitalProcedurePacketV2", version: "2026.09.21-v2", sourceClosureHash: hex("1"), inputContractHash: hex("2"), outputContractHash: hex("3")}, formulas: []},
      tools: [], allowedEffects: ["read_only"], limits: {maxCostMicrousd: 0, maxModelCalls: 0, maxDurationMs: 31000}, fingerprint: hex("4")}};
}
const input = {locale: "pt-BR", projectId: id(2), versionId: id(3), requestId: id(41), question: "Does the current structure sustain the plan?", objectives: ["Measure liquidity"], asOf: "2026-12-31"};
beforeEach(() => {
  vi.clearAllMocks();
  const query = {select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: mocks.project};
  mocks.workspace.mockResolvedValue({organization: {id: id(1)}, supabase: {from: () => query, rpc: mocks.rpc}});
  mocks.project.mockResolvedValue({data: {id: id(2)}});
  mocks.rpc.mockImplementation(async (name: string) => name === "execution_contract_basis_v1" ? {data: basis(), error: null}
    : name === "request_work_execution_v1" ? {data: {executionId: id(50), jobId: id(51), replayed: false}, error: null} : {data: null, error: {code: "42883", message: "unexpected"}});
});

describe("capital execution request action", () => {
  it("rejects malformed input before touching the workspace", async () => {
    expect(await requestCapitalExecution({...input, asOf: "yesterday"})).toEqual({ok: false, error: "invalid"});
    expect(await requestCapitalExecution({...input, objectives: []})).toEqual({ok: false, error: "invalid"});
    expect(await requestCapitalExecution({...input, extra: true})).toEqual({ok: false, error: "invalid"});
    expect(mocks.workspace).not.toHaveBeenCalled();
  });
  it("cannot request outside the workspace project", async () => {
    mocks.project.mockResolvedValue({data: null});
    expect(await requestCapitalExecution(input)).toEqual({ok: false, error: "denied"});
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("assembles the basis on the server, composes packet and contract from it and submits both texts", async () => {
    expect(await requestCapitalExecution(input)).toEqual({ok: true, executionId: id(50), replayed: false});
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "execution_contract_basis_v1", {p_work_id: id(2), p_version_id: id(3)});
    const [name, args] = mocks.rpc.mock.calls[1]!; expect(name).toBe("request_work_execution_v1");
    const contract = executionContractSchema.parse(JSON.parse(args.p_contract_text)); const packet = JSON.parse(args.p_snapshot_text);
    expect(capitalProcedurePacketV2InputSchema.safeParse(packet).success).toBe(true);
    expect(contract.inputs.fingerprint).toBe(createHash("sha256").update(args.p_snapshot_text, "utf8").digest("hex"));
    expect(contract.inputs.fingerprint).toBe(executionInputFingerprint(packet));
    expect(contract).toMatchObject({requestId: id(41), workId: id(2), organizationId: id(1), principalId: id(9), purpose: "prepare-capital-structure-decision",
      method: basis().profile.method, policy: {authorityRevision: "3", fingerprint: hex("b")}, budget: {maxCostMicrousd: 0, maxModelCalls: 0, maxDurationMs: 31000}});
    expect(contract.inputs.hypotheses).toEqual(basis().hypotheses);
    expect(packet.decision.review.composition).toMatchObject({workId: id(2), question: input.question, objectives: input.objectives});
    expect(packet.decision.review.composition.alternatives[0].projection.operating.envelope).toEqual(basis().envelope);
    expect(packet.decision.review.composition.alternatives[0].projection.operating.convention.decisionId).not.toBeNull();
    expect(mocks.revalidate).toHaveBeenCalledWith(`/pt-BR/app/projects/${id(2)}/executions`);
  });
  it("names unverified sources instead of submitting a payload the database will refuse", async () => {
    mocks.rpc.mockImplementation(async (name: string) => name === "execution_contract_basis_v1" ? {data: {...basis(), unverifiedSources: [{sourceVersionId: id(60), reason: "bytes_unverified"}]}, error: null} : {data: null, error: null});
    expect(await requestCapitalExecution(input)).toEqual({ok: false, error: "provenance_denied", unverifiedSources: [{sourceVersionId: id(60), reason: "bytes_unverified"}]});
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it("refuses a basis that belongs to another work, version or purpose", async () => {
    for (const change of [{workId: id(7)}, {versionId: id(7)}, {purpose: "other"}]) {
      mocks.rpc.mockImplementation(async (name: string) => name === "execution_contract_basis_v1" ? {data: {...basis(), ...change}, error: null} : {data: null, error: null});
      expect(await requestCapitalExecution(input)).toEqual({ok: false, error: "invalid"});
    }
    expect(mocks.rpc.mock.calls.every(([name]) => name === "execution_contract_basis_v1")).toBe(true);
  });
  it.each([["execution_producer_denied", "42501", "producer_denied"], ["execution_method_unavailable", "42501", "method_unavailable"], ["execution_profile_ambiguous", "42501", "method_unavailable"],
    ["execution_basis_denied", "42501", "basis_denied"], ["execution_access_denied", "42501", "denied"], ["execution_subject_required", "42501", "denied"]])("reports %s from the basis step as %s", async (message, code, expected) => {
    mocks.rpc.mockImplementation(async () => ({data: null, error: {message, code}}));
    expect(await requestCapitalExecution(input)).toEqual({ok: false, error: expected});
    expect(mocks.rpc).toHaveBeenCalledTimes(1); expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it.each([["execution_payload_provenance_denied", "42501", "provenance_denied"], ["execution_source_pin_denied", "42501", "provenance_denied"], ["execution_basis_pin_denied", "42501", "basis_denied"],
    ["execution_contract_denied", "42501", "invalid"], ["execution_budget_expired", "22023", "invalid"], ["network", undefined, "unavailable"]])("reports %s from the request step as %s", async (message, code, expected) => {
    mocks.rpc.mockImplementation(async (name: string) => name === "execution_contract_basis_v1" ? {data: basis(), error: null} : {data: null, error: {message, code}});
    expect(await requestCapitalExecution(input)).toEqual({ok: false, error: expected});
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("points at the execution the same request id already created instead of duplicating it", async () => {
    mocks.rpc.mockImplementation(async (name: string) => name === "execution_contract_basis_v1" ? {data: basis(), error: null}
      : name === "request_work_execution_v1" ? {data: null, error: {message: "execution_request_conflict", code: "23505"}}
      : {data: [{executionId: id(70), requestId: id(41), processingRunId: id(71), createdAt: "2026-09-24T12:00:00+00:00", jobStatus: "queued", runStatus: "queued", outcome: null, reason: null, purpose: "prepare-capital-structure-decision"}], error: null});
    expect(await requestCapitalExecution(input)).toEqual({ok: true, executionId: id(70), replayed: true});
    mocks.rpc.mockImplementation(async (name: string) => name === "execution_contract_basis_v1" ? {data: basis(), error: null}
      : name === "request_work_execution_v1" ? {data: null, error: {message: "execution_request_conflict", code: "23505"}} : {data: [], error: null});
    expect(await requestCapitalExecution(input)).toEqual({ok: false, error: "conflict"});
  });
  it("maps refusals by name before falling back to the SQLSTATE", () => {
    expect(executionRequestFailure({code: "23505", message: "duplicate key"})).toBe("conflict");
    expect(executionRequestFailure({code: "42501", message: "permission denied"})).toBe("denied");
    expect(executionRequestFailure({code: "22P02", message: "invalid input syntax"})).toBe("invalid");
    expect(executionRequestFailure(null)).toBe("unavailable");
  });
});
