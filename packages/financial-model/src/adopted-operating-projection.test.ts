import {createHash} from "node:crypto";
import {describe, expect, it} from "vitest";
import {adoptedOperatingProjectionFixture} from "@offroad/testing-fixtures/capital-structure-decision";
import {calculateAdoptedOperatingProjection} from "./index";
function setup() {
  const f = adoptedOperatingProjectionFixture();
  const seal = () => {const canonical = JSON.stringify(f.snapshot); f.input.envelope = {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")}; return f.input;};
  return {...f, seal};
}
describe("adopted operating projection", () => {
  it("recomputes from adopted drivers and preserves original hypotheses and dependencies", () => {
    const f = setup(); const r = calculateAdoptedOperatingProjection(f.input);
    expect(r.projection!.rows.map(p => p.cashBeforeFinancing)).toEqual(["20", "50"]);
    expect(r.projection!.totalCashBeforeFinancing).toBe("70"); expect(r.classification).toBe("working_hypothesis");
    expect(r.contributions).toHaveLength(f.snapshot.entries.length); expect(r.derivedDependencies[1]!.decisionIds).toHaveLength(f.snapshot.entries.length);
    expect(r.grantsExecution).toBe(false); expect(r.status).toBe("partial_composition");
  });
  it("returns a gap for an absent tax estimate without replacing it with zero", () => {
    const f = setup(); f.input.expenses.cashTaxesPaid.decisionId = null; f.input.expenses.cashTaxesPaid.missingReason = "Tax forecast unavailable";
    const r = calculateAdoptedOperatingProjection(f.input); expect(r.projection).toBeNull(); expect(r.gaps).toContainEqual({operand: "operating_projection.cashTaxesPaid", reason: "Tax forecast unavailable"});
  });
  it.each(["entityId", "perimeter", "currency", "scenario", "periodStart", "periodEnd", "definitionVersionId", "unit"] as const)("rejects a mismatched %s", field => {
    const f = setup(); const e = f.snapshot.entries.find(e => e.decisionId === f.input.expenses.cashTaxesPaid.decisionId)!;
    e.dimensions[field] = field === "periodStart" || field === "periodEnd" ? "2027-01-15" : field.endsWith("Id") ? "a0000000-0000-4000-8000-000000000001" : "other";
    expect(() => calculateAdoptedOperatingProjection(f.seal())).toThrow();
  });
  it("rejects different history for opening stocks while preserving projected scenario", () => {
    const f = setup(); f.snapshot.entries[0]!.dimensions.scenario = "house";
    expect(() => calculateAdoptedOperatingProjection(f.seal())).toThrow(/context_mismatch/);
  });
  it("rejects ambiguous scale and nonunit quantities without silent conversions", () => {
    const f = setup(); f.snapshot.entries.find(e => e.decisionId === f.input.revenue.netUnitPrices.decisionId)!.dimensions.scale = "1000";
    const r = calculateAdoptedOperatingProjection(f.seal()); expect(r.projection).toBeNull(); expect(r.gaps[0]!.reason).toMatch(/representation/);
    const j = setup(); j.snapshot.entries.find(e => e.decisionId === j.input.revenue.quantities.decisionId)!.dimensions.scale = "1000";
    expect(() => calculateAdoptedOperatingProjection(j.seal())).toThrow(/context_mismatch/);
  });
  it("rejects reused contributions and original observations across financial operands", () => {
    const f = setup(); f.input.expenses.growthCapexPaid = f.input.expenses.maintenanceCapexPaid;
    expect(() => calculateAdoptedOperatingProjection(f.input)).toThrow(/reused/);
    const j = setup(); j.snapshot.entries[0]!.observationId = j.snapshot.entries[1]!.observationId = "a0000000-0000-4000-8000-000000000001";
    expect(() => calculateAdoptedOperatingProjection(j.seal())).toThrow(/reused/);
  });
  it("rejects incompatible series length or a free result injected by the caller", () => {
    const f = setup(); f.snapshot.entries.find(e => e.decisionId === f.input.expenses.cashTaxesPaid.decisionId)!.value.value = ["8"];
    expect(() => calculateAdoptedOperatingProjection(f.seal())).toThrow(/series_length/);
    const j = setup(); expect(() => calculateAdoptedOperatingProjection({...j.input, result: "100"})).toThrow();
  });
  it("requires the adopted revenue convention to match the chosen drivers", () => {
    const f = setup(); f.snapshot.entries.find(e => e.decisionId === f.input.revenue.convention.decisionId)!.value.value = "amount";
    expect(() => calculateAdoptedOperatingProjection(f.seal())).toThrow();
  });
  it("rejects a forged envelope and foreign work scope", () => {
    const f = setup(); expect(() => calculateAdoptedOperatingProjection({...f.input, envelope: {...f.input.envelope, canonical: f.input.envelope.canonical + " "}})).toThrow();
    expect(() => calculateAdoptedOperatingProjection({...f.input, scope: {...f.input.scope, workId: "a0000000-0000-4000-8000-000000000001"}})).toThrow();
  });
  it("reproduces under the same versions without modifying the adopted snapshot", () => {
    const f = setup(); const before = JSON.stringify(f.input); const r = calculateAdoptedOperatingProjection(f.input);
    expect(calculateAdoptedOperatingProjection(f.input)).toEqual(r); expect(JSON.stringify(f.input)).toBe(before);
  });
  it("accepts an adopted amount convention without multiplying revenue a second time", () => {
    const f = setup(); const amount = f.snapshot.entries.find(e => e.decisionId === f.input.revenue.netUnitPrices.decisionId)!;
    amount.fieldPath = "operating_projection.revenue.amounts"; amount.value.value = ["200", "200"];
    f.snapshot.entries.find(e => e.decisionId === f.input.revenue.convention.decisionId)!.value.value = "amount";
    const r = calculateAdoptedOperatingProjection({...f.seal(), revenue: {mode: "amount", convention: f.input.revenue.convention, amounts: f.input.revenue.netUnitPrices}});
    expect(r.projection!.totalCashBeforeFinancing).toBe("70");
    expect(r.contributions.some(e => e.decisionId === f.input.revenue.quantities.decisionId)).toBe(false);
  });
  it("blocks the projection when the accrual-to-cash convention is not adopted", () => {
    const f = setup(); f.input.convention.decisionId = null; f.input.convention.missingReason = "Definition not agreed";
    const r = calculateAdoptedOperatingProjection(f.input); expect(r.projection).toBeNull(); expect(r.gaps[0]!.operand).toBe("operating_projection.convention");
  });

});
