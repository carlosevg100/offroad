import {describe, expect, it} from "vitest";
import {calculationBasis, factKeyOf, indexFacts, reconcileFacts, type FactCandidate} from "./facts";

const base: FactCandidate = {fieldPath: "interim_financials.2026_05.gross_debt", normalizedValue: "5670186000", valueType: "number", sourceDocument: "synthetic_itr.pdf", evidenceRank: 2, informationClass: "reviewed", confidence: 0.95, anchorVerified: true, periodStart: "2026-01-01", periodEnd: "2026-05-31", entityName: "Synthetic company", entityScope: "consolidated", currency: "BRL", unit: "currency", scale: "1", scenario: "actual", definitionVersionId: "reported-debt-v1"};

describe("observation dimensions before contextual adoption", () => {
  it("keeps standalone and consolidated observations without choosing the company number", () => {
    const facts = reconcileFacts([{...base, normalizedValue: "4567602000", entityScope: "standalone", confidence: 0.99}, base]);
    expect(facts).toHaveLength(2);
    expect(facts.every((fact) => fact.conflicts.length === 0)).toBe(true);
    expect(indexFacts(facts).has(base.fieldPath)).toBe(false);
    expect(indexFacts(facts).has(`${base.fieldPath}|${base.periodEnd}`)).toBe(false);
  });
  it.each([
    {entityScope: "standalone"}, {periodStart: "2026-04-01"}, {periodEnd: "2026-06-30"},
    {currency: "USD"}, {unit: "thousands"}, {scale: "1000"}, {scenario: "budget"}, {definitionVersionId: "contract-debt-v1"},
  ])("does not collide or select an unqualified value for %j", (dimension) => {
    const other = {...base, ...dimension};
    expect(factKeyOf(other)).not.toBe(factKeyOf(base));
    const facts = reconcileFacts([base, other]);
    expect(facts).toHaveLength(2);
    expect(indexFacts(facts).has(base.fieldPath)).toBe(false);
  });
  it("preserves conflicting and corroborating sources without confidence becoming authority", () => {
    const candidates = [base, {...base, sourceDocument: "synthetic_management.pdf", evidenceRank: 4, confidence: 1, normalizedValue: "6000000000"}, {...base, sourceDocument: "synthetic_copy.pdf"}];
    const [fact] = reconcileFacts(candidates);
    expect(fact?.observations).toHaveLength(3);
    expect(fact?.conflicts).toHaveLength(1);
    expect(fact?.accepted.sourceDocument).toBe(base.sourceDocument);
    expect(fact).not.toHaveProperty("official");
    expect(fact).not.toHaveProperty("adopted");
  });
  it("avoids delimiter collisions and does not fill unknown dimensions", () => {
    expect(factKeyOf({...base, fieldPath: "a|b", entityName: "c"})).not.toBe(factKeyOf({...base, fieldPath: "a", entityName: "b|c"}));
    const incomplete = {...base};
    delete incomplete.entityScope;
    delete incomplete.currency;
    delete incomplete.scale;
    const [fact] = reconcileFacts([incomplete]);
    expect(fact?.key.entityScope).toBeUndefined();
    expect(fact?.key.currency).toBeUndefined();
    expect(fact?.key.scale).toBeUndefined();
  });
});


describe("calculation basis without implicit adoption", () => {
  it("blocks only the incomplete input and preserves independent complete inputs", () => {
    const incomplete = {...base, fieldPath: "historical_financials.2026.revenue"};
    delete incomplete.unit;
    const result = calculationBasis(reconcileFacts([base, incomplete]));
    expect(result.facts.map((f) => f.key.fieldPath)).toEqual([base.fieldPath]);
    expect(result.blocked).toEqual([{fieldPath: incomplete.fieldPath, reasons: ["unit_unknown"]}]);
  });
  it("does not use tolerance or higher confidence to select a conflicting value", () => {
    const facts = reconcileFacts([base, {...base, normalizedValue: "5670186001", confidence: 1}]);
    expect(facts[0]?.disputed).toBe(false);
    expect(calculationBasis(facts).facts).toEqual([]);
    expect(calculationBasis(facts).blocked[0]?.reasons).toContain("conflicting_observations");
  });
  it("requires a context when monetary inputs have distinct currencies or perimeters", () => {
    const result = calculationBasis(reconcileFacts([base, {...base, fieldPath: "other.metric", currency: "USD", entityScope: "standalone"}]));
    expect(result.facts).toEqual([]);
    expect(result.blocked.every((f) => f.reasons.includes("currency_selection_required") && f.reasons.includes("context_selection_required"))).toBe(true);
  });
  it("allows corroboration but keeps both original observations", () => {
    const result = calculationBasis(reconcileFacts([base, {...base, sourceDocument: "other.pdf"}]));
    expect(result.blocked).toEqual([]);
    expect(result.facts[0]?.observations).toHaveLength(2);
  });
  it("requires currency for money but not for a declared ratio", () => {
    const candidate = {...base}; delete candidate.currency;
    expect(calculationBasis(reconcileFacts([candidate])).blocked[0]?.reasons).toContain("currency_unknown");
    expect(calculationBasis(reconcileFacts([{...candidate, unit: "ratio"}])).blocked).toEqual([]);
  });
});
