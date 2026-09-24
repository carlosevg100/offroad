import {createHash} from "node:crypto";
import {beforeEach, describe, expect, it, vi} from "vitest";
import {executionCanonicalText, executionContractSchema, executionGatesSchema, executionInputFingerprint} from "@offroad/agent-contracts";
import {methodSelectionVersion, VOICE_FILTER_VERSION} from "@offroad/credit-playbook";
import {capitalProcedurePacketV2InputSchema} from "@offroad/financial-model";
import {adoptedCapitalPeriodFixture} from "@offroad/testing-fixtures/capital-structure-decision";
const mocks = vi.hoisted(() => ({rpc: vi.fn(), project: vi.fn(), workspace: vi.fn(), revalidate: vi.fn(), conventions: {override: null as null | (() => unknown)}}));
// The real playbook, with a seam to hand the gates a conventions result the receipt schema refuses.
vi.mock("@offroad/credit-playbook", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@offroad/credit-playbook")>();
  return {...actual, evaluateConventionsGate: (...args: Parameters<typeof actual.evaluateConventionsGate>) => mocks.conventions.override?.() ?? actual.evaluateConventionsGate(...args)};
});
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({revalidatePath: mocks.revalidate}));
vi.mock("@/lib/auth/workspace", () => ({requireWorkspace: mocks.workspace}));
import {requestCapitalExecution} from "@/app/[locale]/app/projects/[projectId]/executions/actions";
import {contractBasisVersions} from "./contract";
import {executionGatesVersion} from "./gates";
import {executionRequestFailure} from "./failure";

const id = (n: number) => `a4190000-0000-4000-9000-${String(n).padStart(12, "0")}`;
const hex = (c: string) => c.repeat(64);
const EM_DASH = String.fromCodePoint(0x2014);
type Entry = {decisionId: string; fieldPath: string; dimensions: Record<string, string | null>};
function sealed(change: (entries: Entry[]) => Entry[] = entries => entries) {
  const fixture = adoptedCapitalPeriodFixture();
  const snapshot = {...fixture.snapshot, workId: id(2), versionId: id(3), purpose: "prepare-capital-structure-decision"};
  snapshot.entries = change(snapshot.entries as Entry[]) as typeof snapshot.entries;
  const canonical = JSON.stringify(snapshot);
  return {snapshot, envelope: {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")}};
}
const company = {entityId: id(80), registration: "registered", research: "recorded", researchAsOf: "2026-09-20T12:00:00+00:00"};
function basis(seal = sealed()) {
  return {schemaVersion: "execution-contract-basis.v2", organizationId: id(1), workId: id(2), principalId: id(9), authorityRevision: "3", policyFingerprint: hex("b"),
    purpose: "prepare-capital-structure-decision", contextKey: "base", versionId: id(3), envelope: seal.envelope,
    adoptions: [], hypotheses: seal.snapshot.entries.map(e => ({id: e.decisionId, assumptionVersionId: id(3), fingerprint: hex("c")})), sources: [], unverifiedSources: [],
    profile: {id: id(30), platformReleaseId: "prepare-capital-structure-decision-2026.09.21-v4",
      method: {platformReleaseId: "prepare-capital-structure-decision-2026.09.21-v4", houseReleaseId: null, methodId: "prepare-capital-structure-decision", methodVersion: "2026.09.21-v4",
        manifestHash: hex("e"), baseManifestHash: hex("e"), compilerVersion: "2026.09.21-v9", compilerHash: hex("f"),
        executor: {key: "@offroad/financial-model#prepareCapitalProcedurePacketV2", version: "2026.09.21-v2", sourceClosureHash: hex("1"), inputContractHash: hex("2"), outputContractHash: hex("3")}, formulas: []},
      tools: [], allowedEffects: ["read_only"], limits: {maxCostMicrousd: 0, maxModelCalls: 0, maxDurationMs: 31000}, fingerprint: hex("4")},
    company};
}
const input = {locale: "pt-BR", projectId: id(2), versionId: id(3), requestId: id(41), question: "Does the current structure sustain the plan?", objectives: ["Measure liquidity"], asOf: "2026-12-31",
  situationIds: ["refinancing"]};
const conflict = (details: string) => ({data: null, error: {message: "execution_request_conflict", code: "23505", details}});
/** The basis step answers with `served`; the request step accepts. */
function serve(served: unknown) {
  mocks.rpc.mockImplementation(async (name: string) => name === "execution_contract_basis_v2" ? {data: served, error: null}
    : name === "request_work_execution_v2" ? {data: {executionId: id(50), jobId: id(51), replayed: false, gatesFingerprint: hex("9")}, error: null} : {data: null, error: {code: "42883", message: "unexpected"}});
}
const rpcNames = () => mocks.rpc.mock.calls.map(([name]) => name);
function submitted() {
  const call = mocks.rpc.mock.calls.find(([name]) => name === "request_work_execution_v2");
  if (!call) throw new Error("nothing was submitted");
  const args = call[1] as {p_contract_text: string; p_snapshot_text: string; p_gates_text: string};
  return {args, contract: executionContractSchema.parse(JSON.parse(args.p_contract_text)), packet: JSON.parse(args.p_snapshot_text), gates: executionGatesSchema.parse(JSON.parse(args.p_gates_text))};
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.conventions.override = null;
  const query = {select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: mocks.project};
  mocks.workspace.mockResolvedValue({organization: {id: id(1)}, supabase: {from: () => query, rpc: mocks.rpc}});
  mocks.project.mockResolvedValue({data: {id: id(2)}});
  serve(basis());
});

describe("capital execution request action", () => {
  it("rejects malformed input before touching the workspace", async () => {
    expect(await requestCapitalExecution({...input, asOf: "yesterday"})).toEqual({ok: false, error: "invalid"});
    expect(await requestCapitalExecution({...input, objectives: []})).toEqual({ok: false, error: "invalid"});
    expect(await requestCapitalExecution({...input, extra: true})).toEqual({ok: false, error: "invalid"});
    const withoutSituations: Record<string, unknown> = {...input}; delete withoutSituations.situationIds;
    expect(await requestCapitalExecution(withoutSituations)).toEqual({ok: false, error: "invalid"});
    expect(await requestCapitalExecution({...input, situationIds: "refinancing"})).toEqual({ok: false, error: "invalid"});
    expect(await requestCapitalExecution({...input, situationIds: ["x".repeat(81)]})).toEqual({ok: false, error: "invalid"});
    expect(mocks.workspace).not.toHaveBeenCalled();
  });
  it("cannot request outside the workspace project", async () => {
    mocks.project.mockResolvedValue({data: null});
    expect(await requestCapitalExecution(input)).toEqual({ok: false, error: "denied"});
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("assembles the v2 basis on the server, composes packet, contract and gates from it and submits the three texts", async () => {
    expect(await requestCapitalExecution(input)).toEqual({ok: true, executionId: id(50), replayed: false});
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "execution_contract_basis_v2", {p_work_id: id(2), p_version_id: id(3)});
    expect(rpcNames()).toEqual(["execution_contract_basis_v2", "request_work_execution_v2"]);
    const {args, contract, packet} = submitted();
    expect(Object.keys(args).sort()).toEqual(["p_contract_text", "p_gates_text", "p_snapshot_text"]);
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
  it("sends the gates as the canonical text of a closed receipt, with the conventions mapped without owner or reason", async () => {
    await requestCapitalExecution({...input, situationIds: ["refinancing", "near-covenant", "refinancing"]});
    const {args, gates} = submitted();
    expect(executionCanonicalText(JSON.parse(args.p_gates_text))).toBe(args.p_gates_text);
    expect(executionGatesSchema.safeParse(JSON.parse(args.p_gates_text)).success).toBe(true);
    expect(gates).toEqual({schemaVersion: "execution-gates.v1", gatesVersion: executionGatesVersion, blocked: false, companyRegistration: "registered", research: "recorded",
      methodSelection: {selectionVersion: methodSelectionVersion, situationIds: ["refinancing", "near-covenant"], methodId: "prepare-capital-structure-decision", methodVersion: "2026.09.21-v4"},
      conventions: ["policy.capital.iof", "policy.capital.anbima-b3-conventions", "policy.capital.tax-regime"].map(key => ({key, version: "2026.09.21-v1", status: "required_missing", effective: "gap"})),
      voice: {version: VOICE_FILTER_VERSION, blockCount: 0, warnCount: 0}});
    expect(args.p_gates_text).not.toMatch(/owner|reason|label|message|Respons/);
  });
  it("pins exactly the one basis version the gates were evaluated over", async () => {
    await requestCapitalExecution(input);
    expect(contractBasisVersions(submitted().contract)).toEqual([id(3)]);
  });
  it("refuses a contract that would pin another or more than one basis version, before sending anything", async () => {
    const mixed = basis(); mixed.hypotheses = mixed.hypotheses.map((pin, n) => n === 0 ? {...pin, assumptionVersionId: id(8)} : pin);
    const foreign = basis(); foreign.hypotheses = foreign.hypotheses.map(pin => ({...pin, assumptionVersionId: id(8)}));
    for (const served of [mixed, foreign]) {
      serve(served);
      expect(await requestCapitalExecution(input)).toEqual({ok: false, error: "invalid"});
    }
    expect(rpcNames().every(name => name === "execution_contract_basis_v2")).toBe(true);
  });
  it("refuses an unregistered company before sending anything and names it", async () => {
    serve({...basis(), company: {...company, registration: "missing", research: "missing", researchAsOf: null}});
    expect(await requestCapitalExecution(input)).toEqual({ok: false, error: "company_unregistered"});
    // Registration comes first: even with a selection the method does not serve.
    expect(await requestCapitalExecution({...input, situationIds: []})).toEqual({ok: false, error: "company_unregistered"});
    expect(rpcNames().every(name => name === "execution_contract_basis_v2")).toBe(true);
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it.each([["missing", null], ["abstained", "2026-09-19T12:00:00+00:00"]])("records research %s as a gap instead of refusing", async (research, researchAsOf) => {
    serve({...basis(), company: {...company, research, researchAsOf}});
    expect(await requestCapitalExecution(input)).toEqual({ok: true, executionId: id(50), replayed: false});
    expect(submitted().gates).toMatchObject({research, companyRegistration: "registered", blocked: false});
  });
  it.each([[[], "situation_required"], [["not-a-situation"], "situation_unknown"], [["Giro sazonal"], "situation_unknown"], [["receivables"], "method_not_applicable"]])(
    "maps the method selection refusal for %j to %s before sending anything", async (situationIds, expected) => {
      expect(await requestCapitalExecution({...input, situationIds})).toEqual({ok: false, error: expected});
      expect(rpcNames()).toEqual(["execution_contract_basis_v2"]);
    });
  it("accepts a selection that crosses situations when the method serves at least one of them", async () => {
    expect(await requestCapitalExecution({...input, situationIds: ["receivables", "refinancing"]})).toMatchObject({ok: true});
    expect(submitted().gates.methodSelection.situationIds).toEqual(["receivables", "refinancing"]);
  });
  it("refuses a released method version whose reference data keys the screen does not know", async () => {
    const other = basis(); other.profile.method = {...other.profile.method, methodVersion: "2026.10.01-v5"};
    serve(other);
    expect(await requestCapitalExecution(input)).toEqual({ok: false, error: "method_unavailable"});
    expect(rpcNames()).toEqual(["execution_contract_basis_v2"]);
  });
  it("never audits what the person typed, even when it carries a pattern the voice filter blocks", async () => {
    const typed = {...input, question: `Ótima pergunta ${EM_DASH} como IA, o banco vai aceitar?`, objectives: [`Vale destacar a liquidez ${EM_DASH} já`]};
    expect(await requestCapitalExecution(typed)).toEqual({ok: true, executionId: id(50), replayed: false});
    const {packet, gates} = submitted();
    expect(packet.decision.review.composition.question).toBe(typed.question);
    expect(gates.voice.blockCount).toBe(0); expect(gates.blocked).toBe(false);
  });
  it("refuses a request whose system text carries a blocked pattern and never sends its gates", async () => {
    // A scenario label of the basis is quoted inside the reason the composer writes for a missing operand.
    const seal = sealed(entries => entries.filter(e => e.fieldPath !== "capital.operatingCashAccount")
      .map(e => e.dimensions.scenario === "house" ? {...e, dimensions: {...e.dimensions, scenario: `house ${EM_DASH} plan`}} : e));
    serve(basis(seal));
    expect(await requestCapitalExecution(input)).toEqual({ok: false, error: "voice_blocked"});
    expect(rpcNames()).toEqual(["execution_contract_basis_v2"]);
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("refuses with gates_invalid when the receipt cannot be built as the closed schema, and sends nothing", async () => {
    mocks.conventions.override = () => ({version: "2026.09.24-v1", referenceDate: input.asOf, gaps: ["policy.capital.iof"],
      entries: [{key: "policy.capital.iof", version: "a version written as prose", status: "draft", owner: "Synthetic owner", effective: "gap", reason: "status_draft"}]});
    expect(await requestCapitalExecution(input)).toEqual({ok: false, error: "gates_invalid"});
    expect(rpcNames()).toEqual(["execution_contract_basis_v2"]);
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("names unverified sources instead of submitting a payload the database will refuse", async () => {
    serve({...basis(), unverifiedSources: [{sourceVersionId: id(60), reason: "bytes_unverified"}]});
    expect(await requestCapitalExecution(input)).toEqual({ok: false, error: "provenance_denied", unverifiedSources: [{sourceVersionId: id(60), reason: "bytes_unverified"}]});
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it("refuses a basis that belongs to another work, version or purpose, or that lacks the company block", async () => {
    const withoutCompany: Record<string, unknown> = basis(); delete withoutCompany.company;
    for (const served of [{...basis(), workId: id(7)}, {...basis(), versionId: id(7)}, {...basis(), purpose: "other"}, withoutCompany, {...basis(), schemaVersion: "execution-contract-basis.v1"}]) {
      serve(served);
      expect(await requestCapitalExecution(input)).toEqual({ok: false, error: "invalid"});
    }
    expect(rpcNames().every(name => name === "execution_contract_basis_v2")).toBe(true);
  });
  it.each([["execution_producer_denied", "42501", "producer_denied"], ["execution_method_unavailable", "42501", "method_unavailable"], ["execution_profile_ambiguous", "42501", "method_unavailable"],
    ["execution_basis_denied", "42501", "basis_denied"], ["execution_access_denied", "42501", "denied"], ["execution_subject_required", "42501", "denied"]])("reports %s from the basis step as %s", async (message, code, expected) => {
    mocks.rpc.mockImplementation(async () => ({data: null, error: {message, code}}));
    expect(await requestCapitalExecution(input)).toEqual({ok: false, error: expected});
    expect(mocks.rpc).toHaveBeenCalledTimes(1); expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it.each([["execution_payload_provenance_denied", "42501", "provenance_denied"], ["execution_source_pin_denied", "42501", "provenance_denied"], ["execution_basis_pin_denied", "42501", "basis_denied"],
    ["execution_contract_denied", "42501", "stale"], ["execution_budget_expired", "22023", "stale"], ["execution_input_limit", "22023", "invalid"], ["network", undefined, "unavailable"],
    ["execution_gates_invalid", "22023", "gates_invalid"], ["execution_gates_blocked", "42501", "gates_blocked"], ["execution_gates_mismatch", "42501", "gates_mismatch"]])("reports %s from the request step as %s", async (message, code, expected) => {
    mocks.rpc.mockImplementation(async (name: string) => name === "execution_contract_basis_v2" ? {data: basis(), error: null} : {data: null, error: {message, code}});
    expect(await requestCapitalExecution(input)).toEqual({ok: false, error: expected});
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("follows the execution the database names for a repeated request id and never scans the list", async () => {
    mocks.rpc.mockImplementation(async (name: string) => name === "execution_contract_basis_v2" ? {data: basis(), error: null} : conflict(id(70)));
    expect(await requestCapitalExecution(input)).toEqual({ok: true, executionId: id(70), replayed: true});
    expect(rpcNames()).toEqual(["execution_contract_basis_v2", "request_work_execution_v2"]);
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it.each(["", "not-a-uuid", undefined])("reports a conflict when the detail names no execution (%s)", async (details) => {
    mocks.rpc.mockImplementation(async (name: string) => name === "execution_contract_basis_v2" ? {data: basis(), error: null} : conflict(details as string));
    expect(await requestCapitalExecution(input)).toEqual({ok: false, error: "conflict"});
    expect(rpcNames()).toEqual(["execution_contract_basis_v2", "request_work_execution_v2"]);
  });
  it("does not follow a detail on a unique violation that is not the request conflict", async () => {
    mocks.rpc.mockImplementation(async (name: string) => name === "execution_contract_basis_v2" ? {data: basis(), error: null} : {data: null, error: {message: "duplicate key value", code: "23505", details: id(70)}});
    expect(await requestCapitalExecution(input)).toEqual({ok: false, error: "conflict"});
  });
  it("maps refusals by name before falling back to the SQLSTATE", () => {
    expect(executionRequestFailure({code: "23505", message: "duplicate key"})).toBe("conflict");
    expect(executionRequestFailure({code: "42501", message: "permission denied"})).toBe("denied");
    expect(executionRequestFailure({code: "22P02", message: "invalid input syntax"})).toBe("invalid");
    expect(executionRequestFailure({code: "23514", message: "check constraint"})).toBe("invalid");
    expect(executionRequestFailure({code: "42501", message: "execution_contract_denied"})).toBe("stale");
    expect(executionRequestFailure({code: "22023", message: "execution_gates_invalid"})).toBe("gates_invalid");
    expect(executionRequestFailure({code: "42501", message: "execution_gates_blocked"})).toBe("gates_blocked");
    expect(executionRequestFailure({code: "42501", message: "execution_gates_mismatch"})).toBe("gates_mismatch");
    expect(executionRequestFailure(null)).toBe("unavailable");
  });
});
