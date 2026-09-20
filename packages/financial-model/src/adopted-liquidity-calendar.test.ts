import {createHash} from "node:crypto";
import {describe, expect, it} from "vitest";
import {adoptedLiquidityCalendarFixture, capitalDecisionFixtureId as id} from "@offroad/testing-fixtures/capital-structure-decision";
import {adoptedLiquidityCalendarInputSchema, calculateAdoptedLiquidityCalendar} from "./adopted-liquidity-calendar";
const fixture = () => adoptedLiquidityCalendarInputSchema.parse(adoptedLiquidityCalendarFixture().input);
function mutate(input: ReturnType<typeof fixture>, change: (snapshot: ReturnType<typeof adoptedLiquidityCalendarFixture>["snapshot"]) => void) {
  const snapshot = JSON.parse(input.envelope.canonical); change(snapshot);
  const canonical = JSON.stringify(snapshot); input.envelope = {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")};
}
describe("liquidity under an explicitly adopted basis", () => {
  it("matches the independent cash oracle and retains each hypothesis and its adoption", () => {
    const result = calculateAdoptedLiquidityCalendar(fixture());
    expect(result.calculation.closingAvailable).toBe("50"); expect(result.calculation.maximumKnownShortfall).toBe("30");
    expect(result.calculation.closingRestricted).toBe("100"); expect(result.bindings).toHaveLength(4);
    expect(result.contributions).toHaveLength(4); expect(result.classification).toBe("working_hypothesis"); expect(result.grantsExecution).toBe(false);
    expect(result.calculationId).toBe("financial.dated_liquidity");
  });
  it("keeps missing cash inputs explicit and never substitutes another contribution", () => {
    const input = fixture(); input.events[0]!.selection = {...input.events[0]!.selection, decisionId: null, missingReason: "Debt quote pending"};
    const result = calculateAdoptedLiquidityCalendar(input);
    expect(result.calculation.status).toBe("partial"); expect(result.calculation.closingAvailable).toBeNull();
    expect(result.bindings[2]).toMatchObject({decisionId: null, missingReason: "Debt quote pending"});
  });
  it.each(["entityId", "perimeter", "currency", "scenario", "periodStart", "periodEnd", "definitionVersionId"] as const)("rejects incompatible %s even with a correct digest", dimension => {
    const input = fixture(); const values = {entityId: id(99), perimeter: "consolidated", currency: "USD", scenario: "requested", periodStart: "2027-01-01", periodEnd: "2027-12-31", definitionVersionId: id(99)};
    mutate(input, snapshot => {snapshot.entries[2]!.dimensions[dimension] = values[dimension];});
    expect(() => calculateAdoptedLiquidityCalendar(input)).toThrow("liquidity_adoption_context_mismatch");
  });
  it("rejects EBITDA relabeling, altered bytes, another work and repeated contributions", () => {
    const ebitda = fixture(); mutate(ebitda, b => {b.entries[2]!.fieldPath = "financials.ebitda";});
    expect(() => calculateAdoptedLiquidityCalendar(ebitda)).toThrow("liquidity_adoption_context_mismatch");
    const tampered = fixture(); tampered.envelope.canonical += " ";
    expect(() => calculateAdoptedLiquidityCalendar(tampered)).toThrow("adoption_basis_integrity_mismatch");
    const foreign = fixture(); foreign.scope.workId = id(99);
    expect(() => calculateAdoptedLiquidityCalendar(foreign)).toThrow("adoption_basis_scope_mismatch");
    const repeated = fixture(); repeated.events.push({...repeated.events[0]!, id: "duplicate-payment"});
    expect(() => calculateAdoptedLiquidityCalendar(repeated)).toThrow("liquidity_contribution_missing_or_reused");
  });
  it("reproduces an old revision after a requested scenario is adopted without rescaling normalized values", () => {
    const input = fixture(); const before = structuredClone(input); const old = calculateAdoptedLiquidityCalendar(input);
    const requested = fixture(); requested.scenario = "requested"; requested.scope.versionId = id(90);
    mutate(requested, b => {b.versionId = id(90); b.revision = 2; for (const e of b.entries.slice(2)) e.dimensions.scenario = "requested"; b.entries[2]!.value.value = "15";});
    expect(calculateAdoptedLiquidityCalendar(requested).calculation.closingAvailable).toBe("75");
    expect(calculateAdoptedLiquidityCalendar(input)).toEqual(old); expect(input).toEqual(before);
    mutate(input, b => {b.entries[0]!.dimensions.scale = "1000";});
    expect(calculateAdoptedLiquidityCalendar(input).calculation.closingAvailable).toBe("50");
  });
});
