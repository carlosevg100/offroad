import {createHash} from "node:crypto";
import {describe, expect, it} from "vitest";
import {capitalDecisionCompositionFixture} from "@offroad/testing-fixtures/capital-structure-decision";
import {composeCapitalStructureDecision} from "./index";
function setup() {
  const f = capitalDecisionCompositionFixture();
  const seal = () => {const canonical = JSON.stringify(f.snapshot); const envelope = {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")};
    for (const a of [...f.input.alternatives, ...f.input.sensitivities]) {a.projection.operating.envelope = envelope; a.projection.funding.input.envelope = envelope;}
    return f.input;};
  return {...f, seal};
}
describe("capital decision composition", () => {
  it("compares calculated alternatives without choosing a winner by cash or spread", () => {
    const f = setup(); const r = composeCapitalStructureDecision(f.input);
    expect(r.status).toBe("comparison_prepared"); expect(r.alternatives.map(a => a.projection.cash!.summary!.closingAvailable)).toEqual(["123", "144.5"]);
    expect(r.ranking).toBeNull(); expect(r.recommendation).toBeNull(); expect(r.grantsExecution).toBe(false);
    expect(r.pendingReviews).toContain("contractual_constraints");
  });
  it("recomputes sensitivity and identifies changed contributions instead of accepting changed results", () => {
    const r = composeCapitalStructureDecision(setup().input); const s = r.sensitivities[0]!;
    expect(s.projection.cash!.summary!.closingAvailable).toBe("83"); expect(s.baselineSummary!.closingAvailable).toBe("123");
    expect(s.changedContributions.map(c => c.fieldPath)).toEqual(["operating_projection.revenue.quantities"]);
  });
  it("frames a decision without company intake or a forecast", () => {
    const f = setup(); const r = composeCapitalStructureDecision({...f.input, alternatives: [], sensitivities: []});
    expect(r.status).toBe("framed"); expect(r.framing.companyRequiredForFraming).toBe(false); expect(r.contributions).toEqual([]);
    expect(r.gaps.map(g => g.code)).toContain("alternatives_required");
  });
  it("preserves a missing forecast as a partial comparison without inventing an alternative value", () => {
    const f = setup(); const missing = f.input.alternatives[1]!.projection.operating.expenses.cashTaxesPaid;
    missing.decisionId = null; missing.missingReason = "Tax forecast absent";
    const r = composeCapitalStructureDecision(f.input); expect(r.status).toBe("partial"); expect(r.alternatives[1]!.projection.cash).toBeNull();
    expect(r.alternatives[0]!.projection.cash!.summary!.closingAvailable).toBe("123");
  });
  it("requires the current structure or an explicit reason for excluding it", () => {
    const f = setup(); const changed = {...f.input, alternatives: f.input.alternatives.map(a => ({...a, kind: "change"}))};
    expect(composeCapitalStructureDecision(changed).gaps.map(g => g.code)).toContain("current_structure_required");
    expect(composeCapitalStructureDecision({...changed, maintenanceExclusion: {reason: "Synthetic current facility cannot be maintained", basisDecisionIds: []}}).gaps.map(g => g.code)).not.toContain("current_structure_required");
    expect(() => composeCapitalStructureDecision({...f.input, maintenanceExclusion: {reason: "Contradictory", basisDecisionIds: []}})).toThrow();
  });
  it("rejects a different opening cash adoption even when its numerical value matches", () => {
    const f = setup(); const target = f.input.alternatives[1]!.projection.funding.input.openingAvailable;
    const e = structuredClone(f.snapshot.entries.find(e => e.decisionId === target.decisionId)!);
    e.decisionId = "a0000000-0000-4000-8000-000000000001"; e.slotKey = "a".repeat(64); f.snapshot.entries.push(e); target.decisionId = e.decisionId;
    expect(() => composeCapitalStructureDecision(f.seal())).toThrow(/common_opening_adoptions/);
  });
  it("rejects changing the historical debt opening to make an alternative look better", () => {
    const f = setup(); const target = f.input.alternatives[1]!.projection.funding.input.instruments[0]!.terms.openingPrincipal;
    const e = structuredClone(f.snapshot.entries.find(e => e.decisionId === target.decisionId)!);
    e.decisionId = "a0000000-0000-4000-8000-000000000002"; e.slotKey = "b".repeat(64); f.snapshot.entries.push(e); target.decisionId = e.decisionId;
    expect(() => composeCapitalStructureDecision(f.seal())).toThrow(/common_opening_debt/);
    e.value.value = "50";
    expect(() => composeCapitalStructureDecision(f.seal())).toThrow(/common_opening_debt/);
  });
  it("rejects duplicated identities or scenarios and an unknown sensitivity baseline", () => {
    const f = setup(); f.input.alternatives[1]!.id = f.input.alternatives[0]!.id; expect(() => composeCapitalStructureDecision(f.input)).toThrow();
    const j = setup(); j.input.alternatives[1]!.projection = j.input.alternatives[0]!.projection; expect(() => composeCapitalStructureDecision(j.input)).toThrow(/scenario_reused/);
    const k = setup(); k.input.sensitivities[0]!.baseAlternativeId = "missing"; expect(() => composeCapitalStructureDecision(k.input)).toThrow();
  });
  it("does not accept evidence references outside the selected calculations for a recommendation", () => {
    const f = setup(); const recommendation = {alternativeId: "change", rationale: "Conditional professional proposal", basisDecisionIds: ["a0000000-0000-4000-8000-000000000001"], conditions: ["Confirm terms"], wouldChangeIf: ["Terms worsen"]};
    expect(() => composeCapitalStructureDecision({...f.input, recommendation})).toThrow(/judgment_evidence_missing/);
    recommendation.basisDecisionIds = [f.input.alternatives[1]!.projection.funding.input.instruments[0]!.terms.couponRates.decisionId!];
    expect(composeCapitalStructureDecision({...f.input, recommendation}).recommendation!.status).toBe("proposed_judgment");
  });
  it("flags a scenario that changes labels without changing a financial operand", () => {
    const f = setup(); const stress = f.input.sensitivities[0]!.projection.operating.revenue.quantities;
    f.snapshot.entries.find(e => e.decisionId === stress.decisionId)!.value.value = ["10", "10"];
    const r = composeCapitalStructureDecision(f.seal()); expect(r.status).toBe("partial"); expect(r.gaps.map(g => g.code)).toContain("sensitivity_has_no_changed_operands");
  });
  it("rejects foreign work scope and preserves reproducibility", () => {
    const f = setup(); const before = JSON.stringify(f.input); const r = composeCapitalStructureDecision(f.input);
    expect(composeCapitalStructureDecision(f.input)).toEqual(r); expect(JSON.stringify(f.input)).toBe(before);
    expect(() => composeCapitalStructureDecision({...f.input, workId: "a0000000-0000-4000-8000-000000000001"})).toThrow(/scope_mismatch/);
  });
});
