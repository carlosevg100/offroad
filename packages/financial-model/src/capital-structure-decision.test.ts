import {createHash} from "node:crypto";
import {describe, expect, it} from "vitest";
import {capitalStructureDecisionFixture, capitalDecisionFixtureId as id} from "@offroad/testing-fixtures/capital-structure-decision";
import {capitalStructureDecisionInputSchema, prepareCapitalStructureComparison} from "./capital-structure-decision";

const fixture = () => capitalStructureDecisionInputSchema.parse(capitalStructureDecisionFixture().input);
function mutateBasis(input: ReturnType<typeof fixture>, change: (snapshot: ReturnType<typeof capitalStructureDecisionFixture>["snapshot"]) => void) {
  const snapshot = JSON.parse(input.basis!.envelope.canonical);
  change(snapshot);
  const canonical = JSON.stringify(snapshot);
  input.basis!.envelope = {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")};
}

describe("capital structure comparison basis", () => {
  it("compares explicit house and requested scenarios without ranking or hiding negative cash", () => {
    const result = prepareCapitalStructureComparison(fixture());
    expect(result.status).toBe("basis_comparable");
    expect(result.alternatives.map(a => a.id)).toEqual(["current", "refinance"]);
    expect(result.alternatives.map(a => a.values.map(v => v.value))).toEqual([["-10", "40"], ["20", "10"]]);
    expect(result.contributions).toHaveLength(4);
    expect(result.contributions.every(c => c.kind === "hypothesis" && c.actorId && c.reason)).toBe(true);
    expect(result.recommendation).toBeNull();
    expect(result.calculationTraces).toEqual([]);
    expect(result.grantsExecution).toBe(false);
  });
  it("returns useful framing without an entity, company intake, projection or invented zero", () => {
    const input = fixture();
    input.entityId = null; input.perimeter = null; input.basis = null; input.alternatives = [];
    const result = prepareCapitalStructureComparison(input);
    expect(result.status).toBe("framed");
    expect(result.question).toBe(input.question);
    expect(result.objectives).toEqual(input.objectives);
    expect(result.gaps.map(g => g.code)).toEqual(expect.arrayContaining(["context_required", "basis_required", "alternatives_required", "current_structure_required"]));
    expect(result.contributions).toEqual([]);
  });
  it("keeps missing projection and pricing inputs absent, never substituting another available adoption", () => {
    const input = fixture();
    input.alternatives[1]!.selections[0] = {metricId: "cash", decisionId: null, missingReason: "Projection depends on an unavailable financing quote"};
    const result = prepareCapitalStructureComparison(input);
    expect(result.status).toBe("partial");
    expect(result.alternatives[1]!.values[0]).toMatchObject({value: null, decisionId: null});
    expect(result.gaps).toContainEqual({code: "metric_input_required", alternativeId: "refinance", metricId: "cash", reason: "Projection depends on an unavailable financing quote"});
  });
  it("requires the current structure or an explicit exclusion, and allows deferring financing", () => {
    const input = fixture(); input.alternatives[0]!.kind = "defer";
    expect(prepareCapitalStructureComparison(input).status).toBe("partial");
    input.maintenanceExclusion = {reason: "Declared decision excludes continuing an expiring facility", basisDecisionIds: [id(100)]};
    expect(prepareCapitalStructureComparison(input).status).toBe("basis_comparable");
    input.alternatives[0]!.kind = "maintain";
    expect(() => prepareCapitalStructureComparison(input)).toThrow("Ambiguous current structure");
  });
  it.each(["entityId", "perimeter", "periodEnd", "periodStart", "currency", "unit", "definitionVersionId", "scenario"] as const)("rejects mixed %s even when the basis digest is valid", dimension => {
    const input = fixture();
    const values = {entityId: id(99), perimeter: "consolidated", periodEnd: "2028-12-31", periodStart: "2027-01-01", currency: "USD", unit: "ratio", definitionVersionId: id(99), scenario: "other"};
    mutateBasis(input, b => {b.entries[0]!.dimensions[dimension] = values[dimension];});
    expect(() => prepareCapitalStructureComparison(input)).toThrow(/capital_comparison_(context|metric)_mismatch/);
  });
  it("does not relabel EBITDA as cash or a managerial metric as a contractual definition", () => {
    const input = fixture();
    mutateBasis(input, b => {b.entries[0]!.fieldPath = "financials.ebitda";});
    expect(() => prepareCapitalStructureComparison(input)).toThrow("capital_comparison_metric_mismatch");
    const contractual = fixture();
    mutateBasis(contractual, b => {b.entries[1]!.definitionKind = "managerial";});
    expect(() => prepareCapitalStructureComparison(contractual)).toThrow("capital_comparison_metric_mismatch");
  });
  it("carries contractual restrictions without pretending they have been evaluated", () => {
    const input = fixture();
    input.constraints = [{id: "contract-limit", kind: "contractual", definitionVersionId: id(21), description: "Evaluate the covenant under its executed contract", alternativeIds: ["current"]}];
    const result = prepareCapitalStructureComparison(input);
    expect(result.status).toBe("partial");
    expect(result.constraints[0]!.evaluation).toBe("pending");
    input.constraints[0]!.definitionVersionId = null;
    expect(() => prepareCapitalStructureComparison(input)).toThrow("Contractual constraint requires");
  });
  it("rejects tampering, a foreign work or purpose, missing contributions and duplicate identities", () => {
    const tampered = fixture(); tampered.basis!.envelope.canonical += " ";
    expect(() => prepareCapitalStructureComparison(tampered)).toThrow("adoption_basis_integrity_mismatch");
    const foreign = fixture(); foreign.workId = id(98);
    expect(() => prepareCapitalStructureComparison(foreign)).toThrow("capital_comparison_basis_scope_mismatch");
    const purpose = fixture(); purpose.purpose = "another decision";
    expect(() => prepareCapitalStructureComparison(purpose)).toThrow("capital_comparison_basis_scope_mismatch");
    const missing = fixture(); missing.alternatives[0]!.selections[0]!.decisionId = id(98);
    expect(() => prepareCapitalStructureComparison(missing)).toThrow("capital_comparison_contribution_missing");
    const duplicate = fixture(); duplicate.alternatives.push(duplicate.alternatives[0]!);
    expect(() => prepareCapitalStructureComparison(duplicate)).toThrow("Duplicate comparison identity");
  });
  it("preserves old contributions, normalized values and reproducibility across a new basis revision", () => {
    const input = fixture(); const before = structuredClone(input);
    const old = prepareCapitalStructureComparison(input);
    expect(input).toEqual(before);
    expect(prepareCapitalStructureComparison(input)).toEqual(old);
    const revised = fixture();
    mutateBasis(revised, b => {b.entries[0]!.value.value = "50"; b.versionId = id(90); b.revision = 2;});
    revised.basis!.scope.versionId = id(90);
    expect(prepareCapitalStructureComparison(revised).fingerprint).not.toBe(old.fingerprint);
    expect(prepareCapitalStructureComparison(input)).toEqual(old);
    mutateBasis(input, b => {b.entries[0]!.dimensions.scale = "1000";});
    expect(prepareCapitalStructureComparison(input).alternatives[0]!.values[0]!.value).toBe("-10");
  });
  it("rejects ambiguous periods, out-of-horizon metrics, undeclared metrics and unbound evidence", () => {
    const flow = fixture(); flow.metrics[1]!.periodStart = null;
    expect(() => prepareCapitalStructureComparison(flow)).toThrow("Declare a flow interval");
    const horizon = fixture(); horizon.horizon.end = "2027-06-30";
    expect(() => prepareCapitalStructureComparison(horizon)).toThrow("Metric outside decision horizon");
    const unknown = fixture(); unknown.alternatives[0]!.selections[0]!.metricId = "unknown";
    expect(() => prepareCapitalStructureComparison(unknown)).toThrow("Unknown metric selection");
    const evidence = fixture(); evidence.alternatives[0]!.tradeoffs = [{classification: "judgment", description: "A qualified tradeoff", basisDecisionIds: [id(999)]}];
    expect(() => prepareCapitalStructureComparison(evidence)).toThrow("capital_comparison_contribution_missing");
  });
});
