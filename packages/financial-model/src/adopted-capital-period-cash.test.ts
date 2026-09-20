import {createHash} from "node:crypto";
import {describe, expect, it} from "vitest";
import {adoptedCapitalPeriodFixture} from "@offroad/testing-fixtures/capital-structure-decision";
import {calculateAdoptedCapitalPeriodCash} from "./index";
function setup() {
  const f = adoptedCapitalPeriodFixture();
  const seal = () => {const canonical = JSON.stringify(f.snapshot); const envelope = {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")}; f.input.operating.envelope = envelope; f.input.funding.input.envelope = envelope; return f.input;};
  return {...f, seal};
}
describe("adopted capital period cash", () => {
  it("composes adopted budgets, debt and capital without double counting", () => {
    const f = setup(); const r = calculateAdoptedCapitalPeriodCash(f.input);
    expect(r.cash!.summary).toMatchObject({closingAvailable: "123", closingRestricted: "500", closingDebt: "0", nominalFinancingCostInHorizon: "47"});
    expect(r.operation.projection!.totalCashBeforeFinancing).toBe("70"); expect(r.grantsExecution).toBe(false);
    expect(r.classification).toBe("working_hypothesis"); expect(r.derivedDependencies[0]!.decisionIds).toHaveLength(r.contributions.length);
  });
  it("accepts an explicitly empty capital ledger but not an unknown inventory", () => {
    const f = setup(); expect(calculateAdoptedCapitalPeriodCash({...f.input, capitalMovements: null}).cash!.summary!.closingAvailable).toBe("53");
    f.snapshot.entries.find(e => e.decisionId === f.input.capitalMovementInventory.decisionId)!.value.value = "unknown";
    const r = calculateAdoptedCapitalPeriodCash(f.seal()); expect(r.cash).toBeNull(); expect(r.gaps.some(g => g.operand === "capital.movementInventory")).toBe(true);
  });
  it("supports an adopted absence of debt without inventing a zero-principal instrument", () => {
    const f = setup(); f.snapshot.entries = f.snapshot.entries.filter(e => !e.fieldPath.startsWith("debt.") && !e.fieldPath.startsWith("financing."));
    const r = calculateAdoptedCapitalPeriodCash({...f.seal(), funding: f.noDebt});
    expect(r.cash!.summary).toMatchObject({closingAvailable: "270", closingDebt: "0", nominalFinancingCostInHorizon: "0"}); expect(r.funding).toBeNull();
  });
  it("blocks absent debt declarations and opening cash rather than treating either as known zero", () => {
    const f = setup(); f.noDebt.inventory.decisionId = null; f.noDebt.inventory.missingReason = "Debt inventory not reviewed";
    expect(calculateAdoptedCapitalPeriodCash({...f.input, funding: f.noDebt}).cash).toBeNull();
    const j = setup(); j.noDebt.openingAvailable.decisionId = null; j.noDebt.openingAvailable.missingReason = "Cash balance missing";
    expect(calculateAdoptedCapitalPeriodCash({...j.input, funding: j.noDebt}).cash).toBeNull();
  });
  it.each(["entityId", "perimeter", "currency", "scenario", "openingScenario", "openingDate", "endDate"] as const)("rejects a different financing %s", field => {
    const f = setup(); f.input.funding.input[field] = field.endsWith("Date") ? "2027-01-15" : field === "entityId" ? "a0000000-0000-4000-8000-000000000001" : field === "currency" ? "USD" : "other";
    expect(() => calculateAdoptedCapitalPeriodCash(f.input)).toThrow();
  });
  it("refuses different basis bytes even if both describe the same scope", () => {
    const f = setup(); const other = structuredClone(f.snapshot); other.revision++;
    const canonical = JSON.stringify(other); f.input.funding.input.envelope = {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")};
    expect(() => calculateAdoptedCapitalPeriodCash(f.input)).toThrow(/snapshot_mismatch/);
  });
  it("rejects a direct operating cash overlay on an accrual budget", () => {
    const f = setup(); const e = f.snapshot.entries.find(e => e.fieldPath === "cash.available.operating_receipts")!;
    const input = {...f.input, funding: {...f.input.funding, input: {...f.input.funding.input, operatingEvents: [{id: "duplicate", date: "2027-01-15", account: "available", category: "operating_receipts", selection: {decisionId: e.decisionId, definitionVersionId: e.dimensions.definitionVersionId, definitionKind: e.definitionKind, missingReason: null}}]}}};
    expect(() => calculateAdoptedCapitalPeriodCash(input)).toThrow(/duplicate_direct_operating_cash/);
  });
  it("rejects capital movements with a mismatched definition and propagates missing series", () => {
    const f = setup(); f.input.capitalMovements.amounts.definitionVersionId = "a0000000-0000-4000-8000-000000000001";
    expect(() => calculateAdoptedCapitalPeriodCash(f.input)).toThrow(/context_mismatch/);
    const j = setup(); j.input.capitalMovements.amounts.decisionId = null; j.input.capitalMovements.amounts.missingReason = "Equity amount undecided";
    expect(calculateAdoptedCapitalPeriodCash(j.input).cash).toBeNull();
  });
  it("refuses inconsistent series and repeated economic charges", () => {
    const f = setup(); f.snapshot.entries.find(e => e.decisionId === f.input.capitalMovements.amounts.decisionId)!.value.value = ["80"];
    expect(() => calculateAdoptedCapitalPeriodCash(f.seal())).toThrow(/series_length/);
    const j = setup(); j.snapshot.entries.find(e => e.decisionId === j.input.capitalMovements.economicIds.decisionId)!.value.value = ["fee", "distribution"];
    expect(() => calculateAdoptedCapitalPeriodCash(j.seal())).toThrow(/duplicate_movement/);
  });
  it("refuses reuse of an original observation across capital and operating uses", () => {
    const f = setup(); const a = f.snapshot.entries.find(e => e.decisionId === f.input.capitalMovements.amounts.decisionId)!;
    const b = f.snapshot.entries.find(e => e.decisionId === f.input.operating.expenses.growthCapexPaid.decisionId)!;
    a.observationId = b.observationId = "a0000000-0000-4000-8000-000000000001";
    expect(() => calculateAdoptedCapitalPeriodCash(f.seal())).toThrow(/reused_observation/);
  });
  it("does not accept free capital amounts or a caller supplied result", () => {
    const f = setup(); expect(() => calculateAdoptedCapitalPeriodCash({...f.input, cash: {closingAvailable: "999"}})).toThrow();
    expect(() => calculateAdoptedCapitalPeriodCash({...f.input, capitalMovements: {...f.input.capitalMovements, amounts: ["80", "10"]}})).toThrow();
  });
  it("reproduces all traces and preserves the immutable basis", () => {
    const f = setup(); const before = JSON.stringify(f.input); const r = calculateAdoptedCapitalPeriodCash(f.input);
    expect(calculateAdoptedCapitalPeriodCash(f.input)).toEqual(r); expect(JSON.stringify(f.input)).toBe(before);
  });
});
