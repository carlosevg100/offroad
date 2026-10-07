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
  it("preserves published v24 bytes and compares prospective v28 economic results", () => {
    const {executor} = loadReleasedCapital(identity);
    const packet = compose(adoptedCapitalPeriodFixture().snapshot, "2026-12-31");
    const released = executor.prepareCapitalProcedurePacketV2(packet);
    expect(released.decision.alternatives[0]!.projection.summary!.closingAvailable).toBe("123");
    // HEAD 615ea82dc94fd153145b85c546a4e5fa31ed2ef2 was independently replayed
    // from its complete first-party source closure: v24 and this exact pin.
    expect(fingerprint(released)).toBe("fd0aef48b2f4ade57967f9511df3acb674cdcea6dadec6bc475196daab53514c");
    const prospective = prepareCapitalProcedurePacketV2(packet);
    expect(released.decision.provenance.financialCoreVersion).toBe("2026.09.20-v24");
    expect(prospective.decision.provenance.financialCoreVersion).toBe("2026.10.07-v28");
    expect(fingerprint(prospective)).not.toBe(fingerprint(released));
    // These are economic outputs, compared directly; neither inputs nor released
    // results are relabeled or normalized to make different versions identical.
    expect(prospective.status).toBe(released.status);
    expect(prospective.decision.informationGaps).toEqual(released.decision.informationGaps);
    expect(prospective.decision.alternatives.map(a => ({id:a.id,rows:a.projection.rows,summary:a.projection.summary})))
      .toEqual(released.decision.alternatives.map(a => ({id:a.id,rows:a.projection.rows,summary:a.projection.summary})));
    expect(prospective.grantsExecution).toBe(released.grantsExecution);
    expect(prospective.grantsPublication).toBe(released.grantsPublication);
    // v28 is a new prospective identity; all economic rows above still equal the
    // independently pinned v24 result. The historical fingerprint stays untouched.
    expect(fingerprint(prospective)).toBe("6bff192627561906c42a3444b1662aa7e91a01cc930165874fe020f88ef3492e");
  });
});
