import {createHash} from "node:crypto";
import {describe, expect, it} from "vitest";
import {adoptedDefinedRatioFixture} from "@offroad/testing-fixtures/capital-structure-decision";
import {calculateAdoptedDefinedRatio} from "./index";
function setup() {
  const f = adoptedDefinedRatioFixture();
  return {...f, seal: () => {const canonical = JSON.stringify(f.snapshot); return {...f.input, envelope: {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")}};}};
}
describe("adopted defined ratio", () => {
  it("uses adopted numerator denominator limit and comparator without certifying a contract", () => {
    const f = setup(); const r = calculateAdoptedDefinedRatio(f.input);
    expect(r.status).toBe("defined_boundary_calculated"); expect(r.calculation).toMatchObject({ratio: "3", satisfiesDefinedBoundary: true});
    expect(r.contributions).toHaveLength(5); expect(r.derivedDependencies).toEqual(f.snapshot.entries.map(e => e.decisionId));
    expect(r.classification).toBe("working_hypothesis"); expect(r.certifiesContractualCompliance).toBe(false); expect(r.grantsExecution).toBe(false);
  });
  it("changes the boundary only when a different comparator is actually adopted", () => {
    const f = setup(); f.snapshot.entries.find(e => e.fieldPath.endsWith(".comparator"))!.value.value = "lt";
    expect(calculateAdoptedDefinedRatio(f.seal()).calculation!.satisfiesDefinedBoundary).toBe(false);
  });
  it("keeps a missing covenant limit unresolved instead of supplying a house threshold", () => {
    const f = setup(); f.input.limit.decisionId = null; f.input.limit.missingReason = "Contract limit not identified";
    const r = calculateAdoptedDefinedRatio(f.input); expect(r.calculation).toBeNull(); expect(r.gaps[0]!.operand).toBe("limit");
  });
  it.each(["entityId", "perimeter", "scenario", "periodStart", "periodEnd", "definitionVersionId", "unit"] as const)("rejects incompatible %s", field => {
    const f = setup(); const e = f.snapshot.entries[1]!;
    const changes = {entityId: "a0000000-0000-4000-8000-000000000001", perimeter: "parent", scenario: "standard", periodStart: "2027-07-01", periodEnd: "2028-12-31", definitionVersionId: "a0000000-0000-4000-8000-000000000001", unit: "ratio"};
    e.dimensions[field] = changes[field]; expect(() => calculateAdoptedDefinedRatio(f.seal())).toThrow(/context_mismatch|currency/);
  });
  it("refuses managerial observations relabeled as contractual by the caller", () => {
    const f = setup(); f.snapshot.entries[0]!.definitionKind = "managerial";
    expect(() => calculateAdoptedDefinedRatio(f.seal())).toThrow(/context_mismatch/);
    expect(() => calculateAdoptedDefinedRatio({...setup().input, definitionKind: "managerial"})).toThrow(/relabel/);
  });
  it("keeps a nonpositive denominator as a gap without a favorable ratio", () => {
    const f = setup(); f.snapshot.entries[1]!.value.value = "-100";
    const r = calculateAdoptedDefinedRatio(f.seal()); expect(r.status).toBe("missing_or_incompatible_inputs");
    expect(r.calculation!.satisfiesDefinedBoundary).toBeNull(); expect(r.gaps[0]!.operand).toBe("denominator");
  });
  it("rejects implicit scaling currency relabeling and unsupported rounding conventions", () => {
    const f = setup(); f.snapshot.entries[0]!.dimensions.scale = "1000";
    expect(calculateAdoptedDefinedRatio(f.seal()).calculation).toBeNull();
    const g = setup(); g.snapshot.entries[0]!.dimensions.currency = "USD";
    expect(() => calculateAdoptedDefinedRatio(g.seal())).toThrow(/context_mismatch/);
    const h = setup(); h.snapshot.entries[4]!.value.value = "round_ratio_before_comparison";
    expect(() => calculateAdoptedDefinedRatio(h.seal())).toThrow();
  });
  it("rejects a repeated contribution or original observation across operands", () => {
    const f = setup(); f.input.denominator.selection = f.input.numerator.selection;
    expect(() => calculateAdoptedDefinedRatio(f.input)).toThrow(/reused/);
    const g = setup(); for (const e of g.snapshot.entries.slice(0, 2)) e.observationId = "a0000000-0000-4000-8000-000000000001";
    expect(() => calculateAdoptedDefinedRatio(g.seal())).toThrow(/reused/);
  });
  it("preserves hypotheses and refuses foreign scope or result injection", () => {
    const f = setup(); const before = JSON.stringify(f.input); const r = calculateAdoptedDefinedRatio(f.input);
    expect(calculateAdoptedDefinedRatio(f.input)).toEqual(r); expect(JSON.stringify(f.input)).toBe(before);
    expect(() => calculateAdoptedDefinedRatio({...f.input, calculation: {ratio: "1"}})).toThrow();
    expect(() => calculateAdoptedDefinedRatio({...f.input, scope: {...f.input.scope, workId: "a0000000-0000-4000-8000-000000000001"}})).toThrow();
  });
});
