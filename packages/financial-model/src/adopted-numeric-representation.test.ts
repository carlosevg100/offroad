import {createHash} from "node:crypto";
import {describe, expect, it} from "vitest";
import {adoptedDebtLiquidityFixture} from "@offroad/testing-fixtures/capital-structure-decision";
import {calculateAdoptedDebtLiquidity} from "./adopted-debt-liquidity";
import {resolveAdoptedCurrencyValues} from "./adopted-numeric-representation";
import type {AdoptionBasisEntry, AdoptionBasisSnapshot} from "@offroad/reconciliation";

const id = (n: number) => `e1510000-0000-4000-9000-${String(n).padStart(12, "0")}`;
function fixture(mode = "reported_in_declared_scale") {
  const base = adoptedDebtLiquidityFixture();
  const snapshot = structuredClone(base.snapshot) as AdoptionBasisSnapshot;
  const selected = [base.input.openingAvailable.decisionId!, base.input.instruments[0]!.terms.openingPrincipal.decisionId!];
  const targets = snapshot.entries.filter(e => selected.includes(e.decisionId));
  targets.forEach(e => {e.dimensions.scale = "1000";});
  const groupId = id(1);
  const add = (field: "mode" | "members", n: number, value: AdoptionBasisEntry["value"]) => {
    const original = targets[0]!;
    const entry: AdoptionBasisEntry = {...structuredClone(original), decisionId: id(n), slotKey: createHash("sha256").update(field).digest("hex"),
      fieldPath: `numeric_representation.${groupId}.${field}`, kind: "hypothesis", observationId: null,
      dimensions: {...original.dimensions, periodStart: original.dimensions.periodEnd, unit: field === "mode" ? "convention" : "contribution_ids", scale: "1", definitionVersionId: id(n + 100)},
      value, reason: "Synthetic adopted interpretation of explicitly named numeric contributions"};
    snapshot.entries.push(entry);
    return {decisionId: entry.decisionId, definitionVersionId: entry.dimensions.definitionVersionId!, definitionKind: entry.definitionKind};
  };
  const group = {id: groupId, mode: add("mode", 2, {type: "text", value: mode}), members: add("members", 3, {type: "list", value: selected})};
  const refresh = () => {const canonical = JSON.stringify(snapshot); return {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")};};
  return {base, snapshot, selected, group, refresh,
    input: () => ({scope: base.input.scope, envelope: refresh(), decisionIds: selected, groups: [group]})};
}

describe("adopted numeric representation", () => {
  it("resolves a batch under two adopted interpretation contributions with all original values intact", () => {
    const f = fixture(); const before = JSON.stringify(f.snapshot); const result = resolveAdoptedCurrencyValues(f.input());
    expect(result.status).toBe("resolved"); expect(result.values.map(v => v.trace!.values)).toEqual([["130000"], ["100000"]]);
    expect(result.contributions).toHaveLength(4); expect(result.values.every(v => v.interpretationDecisionIds.length === 2)).toBe(true);
    expect(JSON.stringify(f.snapshot)).toBe(before); expect(result.grantsExecution).toBe(false);
    expect(result.classification).toBe("working_hypothesis");
  });
  it("distinguishes already normalized values under the same reported scale", () => {
    const f = fixture("already_in_currency_units");
    expect(resolveAdoptedCurrencyValues(f.input()).values.map(v => v.trace!.values)).toEqual([["130"], ["100"]]);
  });
  it("returns a named gap for a non-unit value with no adopted representation", () => {
    const f = fixture(); const result = resolveAdoptedCurrencyValues({...f.input(), groups: []});
    expect(result.status).toBe("partial"); expect(result.gaps).toHaveLength(2); expect(result.values.every(v => v.trace === null)).toBe(true);
  });
  it("normalizes the debt and cash composition without rewriting the immutable basis", () => {
    const f = fixture(); const input = {...f.base.input, envelope: f.refresh(), numericInterpretations: [f.group]};
    const result = calculateAdoptedDebtLiquidity(input);
    expect(result.liquidity!.closingAvailable).toBe("9020"); // 130000 + 20 - 100000 * 1.1 * 1.1
    expect(result.debt!.instruments[0]!.rows[0]!.openingPrincipal).toBe("100000");
    expect(result.contributions.find(e => e.decisionId === f.selected[1])!.value).toEqual({type: "number", value: "100"});
    expect(result.derivedDependencies.every(d => d.decisionIds.includes(f.group.mode.decisionId))).toBe(true);
    expect(calculateAdoptedDebtLiquidity(input).fingerprint).toBe(result.fingerprint);
  });
  it("keeps composition blocked when representation is absent rather than silently using raw amounts", () => {
    const f = fixture(); const result = calculateAdoptedDebtLiquidity({...f.base.input, envelope: f.refresh()});
    expect(result.status).toBe("missing_inputs"); expect(result.debt).toBeNull(); expect(result.liquidity).toBeNull();
  });
  it.each(["entityId", "perimeter", "currency", "scenario", "periodStart", "periodEnd"] as const)("refuses an interpretation with a mismatched %s", field => {
    const f = fixture(); const mode = f.snapshot.entries.find(e => e.decisionId === f.group.mode.decisionId)!;
    mode.dimensions[field] = field === "entityId" ? id(99) : field === "currency" ? "USD" : field === "periodStart" ? "2026-12-30" : field === "periodEnd" ? "2027-01-01" : "other";
    expect(() => resolveAdoptedCurrencyValues(f.input())).toThrow(/context_mismatch/);
  });
  it("refuses interpretation of an unlisted replacement contribution", () => {
    const f = fixture(); const target = f.snapshot.entries.find(e => e.decisionId === f.selected[0])!; target.decisionId = id(70);
    expect(() => resolveAdoptedCurrencyValues({...f.input(), decisionIds: [id(70)]})).toThrow("numeric_interpretation_invalid_member");
  });
  it("rejects duplicate members, conflicting groups and forged definition versions", () => {
    const f = fixture(); const members = f.snapshot.entries.find(e => e.decisionId === f.group.members.decisionId)!;
    members.value = {type: "list", value: [f.selected[0]!, f.selected[0]!]};
    expect(() => resolveAdoptedCurrencyValues(f.input())).toThrow("numeric_interpretation_duplicate_member");
    const valid = fixture(); expect(() => resolveAdoptedCurrencyValues({...valid.input(), groups: [valid.group, valid.group]})).toThrow();
    valid.group.mode.definitionVersionId = id(80);
    expect(() => resolveAdoptedCurrencyValues(valid.input())).toThrow("numeric_interpretation_contribution_mismatch");
  });
  it("rejects foreign scope and tampered bytes even with a valid-looking group", () => {
    const f = fixture(); expect(() => resolveAdoptedCurrencyValues({...f.input(), scope: {...f.base.input.scope, workId: id(88)}})).toThrow("adoption_basis_scope_mismatch");
    const raw = f.input(); raw.envelope.canonical += " ";
    expect(() => resolveAdoptedCurrencyValues(raw)).toThrow("adoption_basis_integrity_mismatch");
  });
  it("normalizes a whole monetary series without per-payment interpretations", () => {
    const f = fixture(); const member = f.snapshot.entries.find(e => e.decisionId === f.selected[0])!;
    member.value = {type: "list", value: ["1.5", "0", "-2"]};
    expect(resolveAdoptedCurrencyValues(f.input()).values[0]!.trace!.values).toEqual(["1500", "0", "-2000"]);
    expect(resolveAdoptedCurrencyValues(f.input()).values[0]!.interpretationDecisionIds).toHaveLength(2);
  });
  it("rejects a member outside the adopted period or with a non-monetary unit", () => {
    const f = fixture(); const target = f.snapshot.entries.find(e => e.decisionId === f.selected[0])!;
    target.dimensions.periodEnd = "2027-01-01";
    expect(() => resolveAdoptedCurrencyValues(f.input())).toThrow("numeric_interpretation_period_mismatch");
    target.dimensions.periodEnd = "2026-12-31"; target.dimensions.unit = "ratio";
    expect(() => resolveAdoptedCurrencyValues(f.input())).toThrow("numeric_interpretation_currency_required");
  });
});
