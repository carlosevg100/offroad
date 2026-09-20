import {createHash} from "node:crypto";
import {describe, expect, it} from "vitest";
import {calculateAdoptedLeverage} from "./adopted-basis";

const id = (n: number) => `a9990000-0000-4000-9000-${String(n).padStart(12, "0")}`;
function fixture(revision = 1, amount = "300") {
  const dimensions = {entityId: id(1), perimeter: "standalone", periodStart: "2025-01-01", periodEnd: "2025-12-31", currency: "BRL", unit: "currency", scale: "1", scenario: "actual", definitionVersionId: id(2)};
  const entries = [amount, "100"].map((value, i) => ({decisionId: id(10 + i), slotKey: String(i).repeat(64), kind: "hypothesis", fieldPath: i ? "financials.ebitda" : "financials.net_debt", dimensions, value: {type: "number", value}, observationId: null, referenceValue: null, referenceDimensions: null, definitionKind: "reported", actorId: id(3), reason: "Synthetic explicitly selected input"}));
  const snapshot = {schemaVersion: "contextual-adoption.v1", versionId: id(100 + revision), setId: id(4), workId: id(5), purpose: "capital structure decision", contextKey: "actual", revision, previousVersionId: revision === 1 ? null : id(100 + revision - 1), classification: "working_basis", entries};
  const canonical = JSON.stringify(snapshot);
  return {snapshot, envelope: {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")}, scope: {workId: id(5), purpose: snapshot.purpose, versionId: snapshot.versionId}, netDebtDecisionId: id(10), ebitdaDecisionId: id(11)};
}
describe("calculation from an immutable contextual basis", () => {
  it("reproduces the old value and fingerprint after a new hypothesis exists", () => {
    const old = fixture();
    const revised = fixture(2, "450");
    expect(calculateAdoptedLeverage(old).value).toBe("3");
    expect(calculateAdoptedLeverage(revised).value).toBe("4.5");
    expect(calculateAdoptedLeverage(old)).toEqual(calculateAdoptedLeverage(fixture()));
    expect(calculateAdoptedLeverage(old).basisFingerprint).toBe(old.envelope.fingerprint);
    expect(calculateAdoptedLeverage(old).classification).toBe("working_hypothesis");
  });
  it("refuses altered bytes, another work, another purpose and another version", () => {
    const input = fixture();
    expect(() => calculateAdoptedLeverage({...input, envelope: {...input.envelope, canonical: input.envelope.canonical.replace('"300"', '"900"')}})).toThrow("adoption_basis_integrity_mismatch");
    for (const scope of [{...input.scope, workId: id(90)}, {...input.scope, purpose: "another purpose"}, {...input.scope, versionId: id(91)}]) {
      expect(() => calculateAdoptedLeverage({...input, scope})).toThrow("adoption_basis_scope_mismatch");
    }
  });
  it("never falls back to rank or an available input when the selection is absent", () => {
    const input = fixture();
    expect(() => calculateAdoptedLeverage({...input, netDebtDecisionId: id(99)})).toThrow("adoption_calculation_inputs_required");
    expect(() => calculateAdoptedLeverage({...input, netDebtDecisionId: input.ebitdaDecisionId})).toThrow("adoption_calculation_inputs_required");
  });
  it("rejects combining budget with actual even when both are authorized", () => {
    const input = fixture();
    input.snapshot.entries[1]!.dimensions = {...input.snapshot.entries[1]!.dimensions, scenario: "budget"};
    const canonical = JSON.stringify(input.snapshot);
    expect(() => calculateAdoptedLeverage({...input, envelope: {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")}})).toThrow("adoption_calculation_context_mismatch");
  });
  it("rejects non-unit scale because the basis does not prove numeric normalization", () => {
    const input = fixture();
    input.snapshot.entries[0]!.dimensions = {...input.snapshot.entries[0]!.dimensions, scale: "1000"};
    const canonical = JSON.stringify(input.snapshot);
    expect(() => calculateAdoptedLeverage({...input, envelope: {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")}})).toThrow("adoption_calculation_unit_scale_required");
  });
});
