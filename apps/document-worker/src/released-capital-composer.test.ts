import {createHash} from "node:crypto";
import {describe, expect, it} from "vitest";
import {readContextualBasis} from "@offroad/reconciliation";
import {composeBoundCapitalPacketV2, deriveBoundCapitalScope, prepareCapitalProcedurePacketV2} from "@offroad/financial-model";
import {adoptedCapitalPeriodFixture, capitalStructureDecisionFixture} from "@offroad/testing-fixtures/capital-structure-decision";
import {loadReleasedCapital} from "./released-method-executor";

const identity = {methodId: "prepare-capital-structure-decision", methodVersion: "2026.09.21-v4", manifestHash: "2c023cf7b7ec7e35b7f59d363a9b287cb245d3196cd431fc0c2bf1fc937f8478"};
const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function compose(snapshot: {workId: string; purpose: string; versionId: string}, asOf: string) {
  const canonical = JSON.stringify(snapshot); const envelope = {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")};
  const scope = {workId: snapshot.workId, purpose: snapshot.purpose, versionId: snapshot.versionId};
  const basis = readContextualBasis(envelope, scope);
  return composeBoundCapitalPacketV2({envelope, scope, question: "Does the current structure sustain the plan?", objectives: ["Measure liquidity"], asOf, ...deriveBoundCapitalScope(basis, asOf)});
}

describe("published capital executor over a bound packet", () => {
  it("accepts the composed input and reports a partial decision with named gaps", () => {
    const {executor} = loadReleasedCapital(identity);
    const packet = compose(capitalStructureDecisionFixture().snapshot, "2027-12-31");
    expect(executor.capitalProcedurePacketV2InputSchema.safeParse(packet).success).toBe(true);
    const result = executor.prepareCapitalProcedurePacketV2(packet);
    expect(result.status).toBe("partial");
    expect(result.decision.informationGaps.filter(g => g.code === "projection_input_missing").length).toBe(26);
    expect(result.decision.alternatives[0]!.projection.summary).toBeNull();
    expect(result.grantsExecution).toBe(false); expect(result.grantsPublication).toBe(false);
  });
  it("calculates the same bytes as the workspace source for a fully adopted basis", () => {
    const {executor} = loadReleasedCapital(identity);
    const packet = compose(adoptedCapitalPeriodFixture().snapshot, "2026-12-31");
    const released = executor.prepareCapitalProcedurePacketV2(packet);
    expect(released.decision.alternatives[0]!.projection.summary!.closingAvailable).toBe("123");
    expect(fingerprint(released)).toBe(fingerprint(prepareCapitalProcedurePacketV2(packet)));
  });
});
