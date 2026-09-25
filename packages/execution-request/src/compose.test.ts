import {createHash} from "node:crypto";
import {describe, expect, it} from "vitest";
import {executionContractFingerprint, executionInputFingerprint} from "@offroad/agent-contracts";
import {adoptedCapitalPeriodFixture} from "@offroad/testing-fixtures/capital-structure-decision";
import {composeCapitalExecutionRequest, contractBasisVersions, executionContractBasisSchema, type ExecutionContractBasis} from "./index";

const id = (n: number) => `a4190000-0000-4000-9000-${String(n).padStart(12, "0")}`;
const hex = (c: string) => c.repeat(64);
const sha = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const EM_DASH = String.fromCodePoint(0x2014);
type Entry = {decisionId: string; fieldPath: string; dimensions: Record<string, string | null>};

/** The v2 basis of the request action tests, over the synthetic adopted capital period. */
function basis(change: (entries: Entry[]) => Entry[] = entries => entries): ExecutionContractBasis {
  const fixture = adoptedCapitalPeriodFixture();
  const snapshot = {...fixture.snapshot, workId: id(2), versionId: id(3), purpose: "prepare-capital-structure-decision"};
  snapshot.entries = change(snapshot.entries as Entry[]) as typeof snapshot.entries;
  const canonical = JSON.stringify(snapshot);
  return executionContractBasisSchema.parse({schemaVersion: "execution-contract-basis.v2", organizationId: id(1), workId: id(2), principalId: id(9), authorityRevision: "3",
    policyFingerprint: hex("b"), purpose: "prepare-capital-structure-decision", contextKey: "base", versionId: id(3), envelope: {canonical, fingerprint: sha(canonical)},
    adoptions: [], hypotheses: snapshot.entries.map(e => ({id: e.decisionId, assumptionVersionId: id(3), fingerprint: hex("c")})), sources: [], unverifiedSources: [],
    profile: {id: id(30), platformReleaseId: "prepare-capital-structure-decision-2026.09.21-v4",
      method: {platformReleaseId: "prepare-capital-structure-decision-2026.09.21-v4", houseReleaseId: null, methodId: "prepare-capital-structure-decision", methodVersion: "2026.09.21-v4",
        manifestHash: hex("e"), baseManifestHash: hex("e"), compilerVersion: "2026.09.21-v9", compilerHash: hex("f"),
        executor: {key: "@offroad/financial-model#prepareCapitalProcedurePacketV2", version: "2026.09.21-v2", sourceClosureHash: hex("1"), inputContractHash: hex("2"), outputContractHash: hex("3")}, formulas: []},
      tools: [], allowedEffects: ["read_only"], limits: {maxCostMicrousd: 0, maxModelCalls: 0, maxDurationMs: 31000}, fingerprint: hex("4")},
    company: {entityId: id(80), registration: "registered", research: "recorded", researchAsOf: "2026-09-20T12:00:00+00:00"}});
}
const ask = {question: "Does the current structure sustain the plan?", objectives: ["Measure liquidity"], asOf: "2026-12-31", situationIds: ["refinancing", "near-covenant"]};
const ids = {executionId: id(40), requestId: id(41), processingRunId: id(42), snapshotId: id(43)};
const now = new Date("2026-09-24T12:00:00.000Z");

describe("capital execution request composition", () => {
  it("sends exactly the bytes the web request action composed before the move", () => {
    // Golden digests computed from apps/web/src/lib/execution (contract.ts, gates.ts and the action's
    // own sequence) at 7eb90d00, before this package existed, with the same basis, ask, ids and clock.
    const composed = composeCapitalExecutionRequest({basis: basis(), ask, ids, now});
    if (!composed.ok) throw new Error(composed.error);
    expect({contract: sha(composed.contractText), snapshot: sha(composed.snapshotText), gates: sha(composed.gatesText)}).toEqual({
      contract: "7c0da956fa2c9f77f3c197d7f52003773f6e2b6ce68bacf5b92bdd3942a6513d",
      snapshot: "a4199ad51044e7b74739d5ebce7cbbb42760a4097cf13d47605687427066d4cc",
      gates: "4572e4b3ff8bcda43f2dd85f0a7f99f6873e1a5aa417c45a483a19713a0cf4b5",
    });
    expect([composed.contractText.length, composed.snapshotText.length, composed.gatesText.length]).toEqual([13804, 119624, 700]);
    expect(composed.contract.inputs.fingerprint).toBe(sha(composed.snapshotText));
    expect(composed.contract.inputs.fingerprint).toBe(executionInputFingerprint(composed.packet));
    expect(executionContractFingerprint(composed.contract)).toBe(sha(composed.contractText));
    expect(contractBasisVersions(composed.contract)).toEqual([id(3)]);
  });
  it("is byte stable: the same basis, ask, ids and clock give the same three texts", () => {
    const first = composeCapitalExecutionRequest({basis: basis(), ask, ids, now});
    const second = composeCapitalExecutionRequest({basis: JSON.parse(JSON.stringify(basis())), ask: {...ask, objectives: [...ask.objectives]}, ids: {...ids}, now: new Date(now)});
    expect(second).toEqual(first);
  });
  it("refuses in the action's order: registration, method, situations, then unverified sources", () => {
    const unregistered = {...basis(), company: {...basis().company, registration: "missing" as const}, unverifiedSources: [{sourceVersionId: id(60), reason: "bytes_unverified" as const}]};
    expect(composeCapitalExecutionRequest({basis: unregistered, ask, ids, now})).toEqual({ok: false, error: "company_unregistered"});
    const other = basis(); other.profile.method = {...other.profile.method, methodVersion: "2026.10.01-v5"};
    expect(composeCapitalExecutionRequest({basis: other, ask, ids, now})).toEqual({ok: false, error: "method_unavailable"});
    expect(composeCapitalExecutionRequest({basis: basis(), ask: {...ask, situationIds: []}, ids, now})).toEqual({ok: false, error: "situation_required"});
    expect(composeCapitalExecutionRequest({basis: {...basis(), unverifiedSources: [{sourceVersionId: id(60), reason: "bytes_unverified"}]}, ask, ids, now}))
      .toEqual({ok: false, error: "provenance_denied", unverifiedSources: [{sourceVersionId: id(60), reason: "bytes_unverified"}]});
  });
  it("refuses a contract that would pin another or more than one basis version", () => {
    const mixed = basis(); mixed.hypotheses = mixed.hypotheses.map((pin, n) => n === 0 ? {...pin, assumptionVersionId: id(8)} : pin);
    expect(composeCapitalExecutionRequest({basis: mixed, ask, ids, now})).toEqual({ok: false, error: "composition_invalid"});
    expect(composeCapitalExecutionRequest({basis: basis(), ask: {...ask, asOf: "not a date"}, ids, now})).toEqual({ok: false, error: "composition_invalid"});
  });
  it("refuses system text with a blocked pattern and never builds its gates text; a person's own words are not audited", () => {
    const blocked = basis(entries => entries.filter(e => e.fieldPath !== "capital.operatingCashAccount")
      .map(e => e.dimensions.scenario === "house" ? {...e, dimensions: {...e.dimensions, scenario: `house ${EM_DASH} plan`}} : e));
    expect(composeCapitalExecutionRequest({basis: blocked, ask, ids, now})).toEqual({ok: false, error: "voice_blocked"});
    const typed = composeCapitalExecutionRequest({basis: basis(), ask: {...ask, question: `Ótima pergunta ${EM_DASH} o banco vai aceitar?`}, ids, now});
    expect(typed).toMatchObject({ok: true, gates: {blocked: false, voice: {blockCount: 0}}});
  });
});
