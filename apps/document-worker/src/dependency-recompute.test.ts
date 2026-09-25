import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {describe, expect, it, vi} from "vitest";
import {executionContractSchema, executionGatesSchema} from "@offroad/agent-contracts";
import {composeCapitalExecutionRequest, type ExecutionContractBasis} from "@offroad/execution-request";
import {adoptedCapitalPeriodFixture} from "@offroad/testing-fixtures/capital-structure-decision";
import {runDependencyRecomputeOnce, type DependencyRecomputeQueue, type RecomputeClaim} from "./dependency-recompute";

const id = (n: number) => `a4183200-0000-4000-9000-${String(n).padStart(12, "0")}`;
const hex = (c: string) => c.repeat(64);
const sha = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const EM_DASH = String.fromCodePoint(0x2014);
type Entry = {decisionId: string; fieldPath: string; dimensions: Record<string, string | null>};

/** The v2 basis the database assembles for the original requester at the head revision. */
function basis(change: (entries: Entry[]) => Entry[] = entries => entries): ExecutionContractBasis {
  const fixture = adoptedCapitalPeriodFixture();
  const snapshot = {...fixture.snapshot, workId: id(2), versionId: id(3), purpose: "prepare-capital-structure-decision"};
  snapshot.entries = change(snapshot.entries as Entry[]) as typeof snapshot.entries;
  const canonical = JSON.stringify(snapshot);
  return {schemaVersion: "execution-contract-basis.v2", organizationId: id(1), workId: id(2), principalId: id(9), authorityRevision: "4", policyFingerprint: hex("b"),
    purpose: "prepare-capital-structure-decision", contextKey: "base", versionId: id(3), envelope: {canonical, fingerprint: sha(canonical)},
    adoptions: [], hypotheses: snapshot.entries.map(e => ({id: e.decisionId, assumptionVersionId: id(3), fingerprint: hex("c")})), sources: [], unverifiedSources: [],
    profile: {id: id(30), platformReleaseId: "prepare-capital-structure-decision-2026.09.21-v4",
      method: {platformReleaseId: "prepare-capital-structure-decision-2026.09.21-v4", houseReleaseId: null, methodId: "prepare-capital-structure-decision", methodVersion: "2026.09.21-v4",
        manifestHash: hex("e"), baseManifestHash: hex("e"), compilerVersion: "2026.09.21-v9", compilerHash: hex("f"),
        executor: {key: "@offroad/financial-model#prepareCapitalProcedurePacketV2", version: "2026.09.21-v2", sourceClosureHash: hex("1"), inputContractHash: hex("2"), outputContractHash: hex("3")}, formulas: []},
      tools: [], allowedEffects: ["read_only"], limits: {maxCostMicrousd: 0, maxModelCalls: 0, maxDurationMs: 31000}, fingerprint: hex("4")},
    company: {entityId: id(80), registration: "registered", research: "recorded", researchAsOf: "2026-09-20T12:00:00+00:00"}};
}
const origin = {methodId: "prepare-capital-structure-decision", purpose: "prepare-capital-structure-decision", question: "Does the current structure sustain the plan?",
  objectives: ["Measure liquidity", "Test the refinancing"], asOf: "2026-12-31", situationIds: ["refinancing"]};
const claim = (overrides: Partial<RecomputeClaim> = {}): RecomputeClaim => ({claimed: true, candidateId: id(50), leaseId: id(51), capability: hex("a"), attempt: 1,
  leaseExpiresAt: "2026-09-26T12:02:00.000+00:00", organizationId: id(1), workId: id(2), requestId: id(52), baseExecutionId: id(53), origin, ...overrides});
const now = new Date("2026-09-26T12:00:00.000Z");
let sequence = 60;
const newId = () => id(sequence++);

function queue(options: {claim?: RecomputeClaim | null; basis?: Awaited<ReturnType<DependencyRecomputeQueue["basis"]>>;
  submit?: Awaited<ReturnType<DependencyRecomputeQueue["submit"]>> | Error} = {}) {
  const calls = {basis: 0, submit: [] as string[][], fail: [] as string[]};
  const q: DependencyRecomputeQueue = {
    claim: vi.fn(async () => options.claim === undefined ? claim() : options.claim),
    basis: vi.fn(async () => { calls.basis++; return options.basis ?? {available: true as const, versionId: id(3), basis: basis()}; }),
    submit: vi.fn(async (_c, contractText, snapshotText, gatesText) => {
      calls.submit.push([contractText, snapshotText, gatesText]);
      if (options.submit instanceof Error) throw options.submit;
      return options.submit ?? {produced: true as const, candidateId: id(50), executionId: id(70)};
    }),
    fail: vi.fn(async (_c, code) => { calls.fail.push(code); return {failed: true, candidateId: id(50), state: "failed" as const, reason: code}; }),
  };
  return {q, calls};
}

describe("dependency recompute in the worker", () => {
  it("is idle when nothing is schedulable", async () => {
    const {q, calls} = queue({claim: null});
    expect(await runDependencyRecomputeOnce(q)).toEqual({status: "idle"});
    expect(calls.basis).toBe(0);
  });

  it("composes from the requester's basis what the root was asked, with the candidate as the request id, and submits the three texts", async () => {
    sequence = 60;
    const {q, calls} = queue();
    expect(await runDependencyRecomputeOnce(q, {now: () => now, newId})).toEqual({status: "produced", candidateId: id(50), executionId: id(70)});
    const [contractText, snapshotText, gatesText] = calls.submit[0]!;
    const contract = executionContractSchema.parse(JSON.parse(contractText!));
    const packet = JSON.parse(snapshotText!);
    const gates = executionGatesSchema.parse(JSON.parse(gatesText!));
    expect(contract).toMatchObject({requestId: id(50), executionId: id(60), processingRunId: id(61), workId: id(2), principalId: id(9), policy: {authorityRevision: "4"}});
    expect(contract.inputs.snapshotId).toBe(id(62));
    expect(packet.decision.review.composition).toMatchObject({question: origin.question, objectives: origin.objectives});
    expect(packet.decision.review.asOf).toBe(origin.asOf);
    expect(gates.methodSelection.situationIds).toEqual(["refinancing"]);
    // The same bytes the web request action sends for the same basis, ask, ids and clock.
    const expected = composeCapitalExecutionRequest({basis: basis(), ask: {question: origin.question, objectives: origin.objectives, asOf: origin.asOf, situationIds: origin.situationIds},
      ids: {executionId: id(60), requestId: id(50), processingRunId: id(61), snapshotId: id(62)}, now});
    if (!expected.ok) throw new Error(expected.error);
    expect([contractText, snapshotText, gatesText]).toEqual([expected.contractText, expected.snapshotText, expected.gatesText]);
    expect(calls.fail).toEqual([]);
  });

  it.each([
    ["no origin", {origin: null}],
    ["no question", {origin: {...origin, question: null}}],
    ["no situations", {origin: {...origin, situationIds: null}}],
    ["no objectives", {origin: {...origin, objectives: []}}],
    ["an origin that does not parse", {origin: {...origin, question: 42}}],
  ])("records origin_unavailable when the root was not asked through the capital request (%s)", async (_label, overrides) => {
    const {q, calls} = queue({claim: claim(overrides)});
    expect(await runDependencyRecomputeOnce(q)).toEqual({status: "failed", candidateId: id(50), reason: "origin_unavailable"});
    expect(calls.basis).toBe(0);
    expect(calls.fail).toEqual(["origin_unavailable"]);
  });

  it("reports the decline the database recorded for a requester without authority, and records nothing else", async () => {
    const {q, calls} = queue({basis: {available: false, state: "declined", reason: "requester_not_authorized:execution_access_denied"}});
    expect(await runDependencyRecomputeOnce(q)).toEqual({status: "declined", candidateId: id(50), reason: "requester_not_authorized:execution_access_denied"});
    expect(calls.fail).toEqual([]);
    expect(calls.submit).toEqual([]);
  });

  it.each([
    ["a basis the database could not pin", {available: false as const, state: "scheduled" as const, reason: "basis_not_pinned"}],
    ["a basis of another work", {available: true as const, versionId: id(3), basis: {...basis(), workId: id(7)}}],
    ["a basis of another purpose", {available: true as const, versionId: id(3), basis: {...basis(), purpose: "other"}}],
    ["a basis at another version", {available: true as const, versionId: id(4), basis: basis()}],
    ["a basis that is not the v2 schema", {available: true as const, versionId: id(3), basis: {...basis(), schemaVersion: "execution-contract-basis.v1"}}],
  ])("records basis_unavailable for %s", async (_label, served) => {
    const {q, calls} = queue({basis: served});
    expect(await runDependencyRecomputeOnce(q)).toMatchObject({status: "failed", reason: "basis_unavailable"});
    expect(calls.submit).toEqual([]);
  });

  it("records the gate refusal it finds before submitting, by its code", async () => {
    const unregistered = queue({basis: {available: true, versionId: id(3), basis: {...basis(), company: {...basis().company, registration: "missing"}}}});
    expect(await runDependencyRecomputeOnce(unregistered.q)).toMatchObject({status: "failed", reason: "company_unregistered"});
    const blocked = queue({basis: {available: true, versionId: id(3), basis: basis(entries => entries.filter(e => e.fieldPath !== "capital.operatingCashAccount")
      .map(e => e.dimensions.scenario === "house" ? {...e, dimensions: {...e.dimensions, scenario: `house ${EM_DASH} plan`}} : e))}});
    expect(await runDependencyRecomputeOnce(blocked.q)).toMatchObject({status: "failed", reason: "voice_blocked"});
    const unverified = queue({basis: {available: true, versionId: id(3), basis: {...basis(), unverifiedSources: [{sourceVersionId: id(90), reason: "bytes_unverified"}]}}});
    expect(await runDependencyRecomputeOnce(unverified.q)).toMatchObject({status: "failed", reason: "provenance_denied"});
    for (const run of [unregistered, blocked, unverified]) expect(run.calls.submit).toEqual([]);
  });

  it("reports what the submission recorded: declined, failed with the gate code, or heads that moved", async () => {
    const declined = queue({submit: {produced: false, candidateId: id(50), state: "declined", reason: "requester_not_authorized:execution_access_denied"}});
    expect(await runDependencyRecomputeOnce(declined.q)).toEqual({status: "declined", candidateId: id(50), reason: "requester_not_authorized:execution_access_denied"});
    const refused = queue({submit: {produced: false, candidateId: id(50), state: "failed", reason: "execution_gates_blocked"}});
    expect(await runDependencyRecomputeOnce(refused.q)).toEqual({status: "failed", candidateId: id(50), reason: "execution_gates_blocked"});
    const moved = queue({submit: {produced: false, candidateId: id(50), state: "scheduled", reason: "heads_moved"}});
    expect(await runDependencyRecomputeOnce(moved.q)).toEqual({status: "stale", candidateId: id(50), reason: "heads_moved"});
  });

  it("throws on a transport failure, so the lease expires and the candidate is claimed again", async () => {
    const {q} = queue({submit: new Error("recompute_transport_failed")});
    await expect(runDependencyRecomputeOnce(q)).rejects.toThrow("recompute_transport_failed");
  });

  it("never reaches a model", () => {
    const source = readFileSync(new URL("./dependency-recompute.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/model-gateway|provider|anthropic|openai/i);
  });
});
