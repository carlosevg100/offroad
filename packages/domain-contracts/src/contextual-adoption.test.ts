import {describe, expect, it} from "vitest";
import {adoptObservationForWorkSchema, proposeAssumptionRevisionSchema, adoptionBasisSnapshotSchema} from "./contextual-adoption";

const id = "a9990000-0000-4000-9000-000000000001";
const dimensions = {entityId: id, perimeter: "standalone", periodStart: "2025-01-01", periodEnd: "2025-12-31", currency: "BRL", unit: "currency", scale: "1", scenario: "actual", definitionVersionId: id};
const revision = {requestId: id, workId: id, purpose: "capital structure decision", contextKey: "actual-2025", expectedVersionId: null, reason: "Explicitly selected for this work"};
const hypothesis = {...revision, fieldPath: "financials.cash", dimensions, value: {type: "number", value: "9007199254740993.123456789"}, referenceObservationId: null};
const entry = {decisionId: id, slotKey: "a".repeat(64), kind: "hypothesis", fieldPath: hypothesis.fieldPath, dimensions, value: hypothesis.value, observationId: null, referenceValue: null, referenceDimensions: null, definitionKind: "reported", actorId: id, reason: revision.reason};

describe("contextual adoption contracts", () => {
  it("requires an explicit previous version even on the first adoption", () => {
    expect(adoptObservationForWorkSchema.safeParse({...revision, observationId: id}).success).toBe(true);
    const {expectedVersionId: _base, ...missing} = revision;
    expect(adoptObservationForWorkSchema.safeParse({...missing, observationId: id}).success).toBe(false);
  });
  it("preserves exact user decimals as a hypothesis without publishing a source", () => {
    expect(proposeAssumptionRevisionSchema.parse(hypothesis).value.value).toBe("9007199254740993.123456789");
    expect(proposeAssumptionRevisionSchema.safeParse({...hypothesis, publish: true}).success).toBe(false);
    expect(proposeAssumptionRevisionSchema.safeParse({...hypothesis, confidence: 1}).success).toBe(false);
  });
  it.each(["entityId", "perimeter", "periodEnd", "unit", "scale", "scenario", "definitionVersionId"])("refuses to infer missing %s", (dimension) => {
    expect(proposeAssumptionRevisionSchema.safeParse({...hypothesis, dimensions: {...dimensions, [dimension]: null}}).success).toBe(false);
  });
  it("keeps money denominated while allowing explicitly dimensionless ratios", () => {
    expect(proposeAssumptionRevisionSchema.safeParse({...hypothesis, dimensions: {...dimensions, currency: null}}).success).toBe(false);
    expect(proposeAssumptionRevisionSchema.safeParse({...hypothesis, dimensions: {...dimensions, currency: null, unit: "ratio"}}).success).toBe(true);
  });
  it("refuses duplicate slots and any global official classification", () => {
    const basis = {schemaVersion: "contextual-adoption.v1", versionId: id, setId: id, workId: id, purpose: revision.purpose, contextKey: revision.contextKey, revision: 1, previousVersionId: null, classification: "working_basis", entries: [entry]};
    expect(adoptionBasisSnapshotSchema.safeParse(basis).success).toBe(true);
    expect(adoptionBasisSnapshotSchema.safeParse({...basis, entries: [entry, entry]}).success).toBe(false);
    expect(adoptionBasisSnapshotSchema.safeParse({...basis, classification: "official"}).success).toBe(false);
    expect(adoptionBasisSnapshotSchema.safeParse({...basis, entries: [{...entry, kind: "observation"}]}).success).toBe(false);
  });
});
