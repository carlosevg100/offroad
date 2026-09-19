import {describe, expect, it} from "vitest";
import {composeMethod, matchesMethodValue} from "./compose-method";
import {protectedMethodInvariants} from "./method-component";

const context = {organizationId: "synthetic-house", unitId: "synthetic-unit", workType: "synthetic-work"};
const contract = {id: "synthetic.text", version: "2026.09.19-v1", value: {type: "string"}};
const component = () => ({id: "synthetic.narrative", version: "2026.09.19-v1", title: "Synthetic composition fixture", kind: "narrative", text: "Synthetic base",
  inputs: contract, outputs: contract, dependencies: [], tools: [], effect: "none", budget: {maxModelCalls: 0, maxDurationMs: 1000, maxCostMinorUnits: 0, currency: "BRL"},
  rights: {inheritSourceRestrictions: true, purposes: ["internal_validation"], sourceClasses: ["synthetic_fixture"]}, competencies: ["financial_analysis"],
  invariants: [...protectedMethodInvariants], evidence: [], overridePoints: [{id: "synthetic.title", target: "narrative", contract, requiresRationale: true}]});
const override = (scope = "organization", scopeId = context.organizationId) => ({componentId: "synthetic.narrative", pointId: "synthetic.title", version: "2026.09.19-v1", scope, scopeId,
  rationale: "Synthetic reviewed divergence", source: {versionId: "a5140000-0000-4000-9000-000000000001", fingerprint: "a".repeat(64)}, value: scope});
const input = () => ({baseManifestHash: "b".repeat(64), context, components: [component()], overrides: [override()]});

describe("published method composition", () => {
  it("selects declared organization, unit and work-type precedence with all provenance retained", () => {
    const value = input(); value.overrides = [override("work_type", context.workType), override(), override("unit", context.unitId)];
    const result = composeMethod(value);
    expect(result.parameters[0]?.scope).toBe("work_type");
    expect(result.parameters[0]?.source).toEqual(override().source);
    expect(result.overrides).toHaveLength(3);
    expect(result.components).toEqual(value.components);
    expect(result.grantsExecution).toBe(false);
    expect(composeMethod({...value, overrides: [...value.overrides].reverse()})).toEqual(result);
  });
  it("blocks ambiguous same-scope overrides without selecting a winner", () => {
    expect(() => composeMethod({...input(), overrides: [override(), {...override(), value: "other"}]})).toThrow("method_override_ambiguous");
  });
  it("rejects cross-organization and non-applicable unit or work-type scope", () => {
    for (const scope of ["organization", "unit", "work_type"]) expect(() => composeMethod({...input(), overrides: [override(scope, "different")]})).toThrow("method_override_scope_conflict");
  });
  it("rejects undeclared covenant, law, invariant, executor and budget patches", () => {
    for (const pointId of ["contractual_definition", "law", "access_barriers", "executor", "budget"]) expect(() => composeMethod({...input(), overrides: [{...override(), pointId}]})).toThrow("method_protected_override");
    expect(() => composeMethod({...input(), overrides: [{...override(), executor: "arbitrary"}]})).toThrow();
  });
  it("blocks protected law and contract rules even if an author declares an override point", () => {
    const {text: _text, ...base} = component();
    for (const authority of ["law", "contract"]) expect(() => composeMethod({...input(), components: [{...base, kind: "rule", authority, statement: "Synthetic", executor: {module: "@offroad/financial-core", exportName: "synthetic", version: "2026.09.19-v1"}}]})).toThrow("method_protected_override");
  });
  it("rejects untyped values and never silently falls back to the base", () => {
    expect(() => composeMethod({...input(), overrides: [{...override(), value: 10}]})).toThrow("method_override_contract_conflict");
    expect(() => composeMethod({...input(), components: [{...component(), rights: {inheritSourceRestrictions: false, purposes: ["internal_validation"], sourceClasses: ["synthetic_fixture"]}}]})).toThrow();
  });
  it("requires rationale, version and exact source fingerprint", () => {
    for (const value of [{...override(), rationale: ""}, {...override(), version: "latest"}, {...override(), source: {...override().source, fingerprint: "latest"}}]) expect(() => composeMethod({...input(), overrides: [value]})).toThrow();
  });
  it("preserves a prior composition when inputs or new bindings change", () => {
    const value = input(); const before = composeMethod(value); const snapshot = structuredClone(before);
    value.overrides[0]!.value = "new candidate";
    const after = composeMethod(value);
    expect(after.manifestHash).not.toBe(before.manifestHash);
    expect(before).toEqual(snapshot);
  });
  it("rejects duplicate component identities", () => {
    expect(() => composeMethod({...input(), components: [component(), component()]})).toThrow("method_component_duplicate");
  });
  it("validates nested values, real dates and exact decimal strings", () => {
    expect(matchesMethodValue({type: "decimal_string"}, "123456789123456789.001")).toBe(true);
    expect(matchesMethodValue({type: "decimal_string"}, 0.1)).toBe(false);
    expect(matchesMethodValue({type: "date"}, "2026-02-30")).toBe(false);
    expect(matchesMethodValue({type: "date"}, "2024-02-29")).toBe(true);
    expect(matchesMethodValue({type: "object", fields: {values: {required: true, value: {type: "array", items: {type: "integer"}}}}}, {values: [1, 2]})).toBe(true);
    expect(matchesMethodValue({type: "object", fields: {values: {required: true, value: {type: "array", items: {type: "integer"}}}}}, {values: [1, "2"]})).toBe(false);
    expect(matchesMethodValue({type: "object", fields: {values: {required: false, value: {type: "boolean"}}}}, {extra: true})).toBe(false);
  });
});
