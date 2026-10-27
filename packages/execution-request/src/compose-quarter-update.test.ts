import {createHash} from "node:crypto";
import {describe, expect, it} from "vitest";
import {adoptedCapitalPeriodFixture} from "@offroad/testing-fixtures/capital-structure-decision";
import {composeCapitalExecutionRequest, composeMethodExecutionRequest, executionContractBasisSchema, quarterUpdateContractBasis, quarterUpdatePriorResults,
  type ExecutionContractBasis, type QuarterUpdatePriors} from "./index";

const id = (n: number) => `a4190000-0000-4000-9000-${String(n).padStart(12, "0")}`;
const hex = (c: string) => c.repeat(64);
const sha = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
function basis(): ExecutionContractBasis {
  const fixture = adoptedCapitalPeriodFixture();
  const snapshot = {...fixture.snapshot, workId: id(2), versionId: id(3), purpose: "prepare-capital-structure-decision"};
  const canonical = JSON.stringify(snapshot);
  return executionContractBasisSchema.parse({schemaVersion: "execution-contract-basis.v2", organizationId: id(1), workId: id(2), principalId: id(9), authorityRevision: "3",
    policyFingerprint: hex("b"), purpose: "prepare-capital-structure-decision", contextKey: "base", versionId: id(3), envelope: {canonical, fingerprint: sha(canonical)},
    adoptions: [], hypotheses: snapshot.entries.map(e => ({id: e.decisionId, assumptionVersionId: id(3), fingerprint: hex("c")})),
    sources: [{resourceId: id(60), sourceVersionId: id(61), contentHash: hex("1"), rightsRevision: "1"}], unverifiedSources: [],
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
const prior = (n: number, sources: ExecutionContractBasis["sources"]) => ({executionId: id(n), inputSnapshot: "{}", resultFingerprint: hex(String(n % 10)), sources});
const priors: QuarterUpdatePriors = {
  weeklyCash: prior(71, [{resourceId: id(60), sourceVersionId: id(61), contentHash: hex("1"), rightsRevision: "1"}, {resourceId: id(62), sourceVersionId: id(63), contentHash: hex("2"), rightsRevision: "2"}]),
  covenant: prior(72, [{resourceId: id(64), sourceVersionId: id(65), contentHash: hex("3"), rightsRevision: "1"}, {resourceId: id(62), sourceVersionId: id(63), contentHash: hex("2"), rightsRevision: "2"}]),
};

describe("prior results only change the quarter close", () => {
  it("leaves every other method's request byte for byte the same, with or without priors", () => {
    const plain = composeCapitalExecutionRequest({basis: basis(), ask, ids, now});
    const withPriors = composeMethodExecutionRequest({basis: basis(), ask, ids, now, priors});
    if (!plain.ok || !withPriors.ok) throw new Error("composition refused");
    expect([withPriors.contractText, withPriors.snapshotText, withPriors.gatesText]).toEqual([plain.contractText, plain.snapshotText, plain.gatesText]);
    expect("priorResults" in withPriors).toBe(false);
  });
  it("names the two prior results in a fixed order, and none when one is missing", () => {
    expect(quarterUpdatePriorResults(priors)).toEqual([{role: "weekly_cash", executionId: id(71), resultFingerprint: hex("1")}, {role: "covenant", executionId: id(72), resultFingerprint: hex("2")}]);
    expect(quarterUpdatePriorResults({...priors, covenant: null})).toBeNull();
  });
  it("pins the close's sources first and then each prior source it does not pin, once", () => {
    expect(quarterUpdateContractBasis(basis(), priors).sources.map((s) => s.sourceVersionId)).toEqual([id(61), id(63), id(65)]);
    expect(quarterUpdateContractBasis(basis(), {weeklyCash: null, covenant: null}).sources).toEqual(basis().sources);
  });
});
