import {createHash} from "node:crypto";
import {describe, expect, it} from "vitest";
import {adoptedFinancingFixture} from "@offroad/testing-fixtures/capital-structure-decision";
import {calculateAdoptedFinancingLiquidity} from "./adopted-financing-costs";

function fixture() {
  const f = adoptedFinancingFixture();
  const input = () => {const canonical = JSON.stringify(f.snapshot); return {...f.input, envelope: {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")}};};
  const entry = (suffix: string) => f.snapshot.entries.find(e => e.fieldPath.endsWith(suffix))!;
  return {...f, input, entry};
}
describe("financing costs under adopted inputs", () => {
  it("composes debt, operating cash and withheld fees exactly once under all selected contributions", () => {
    const f = fixture(); const result = calculateAdoptedFinancingLiquidity(f.input());
    expect(result.liquidity!.closingAvailable).toBe("3"); expect(result.liquidity!.closingRestricted).toBe("500");
    expect(result.financing!.totals).toMatchObject({proceedsAfterWithholding: "95", nominalCharges: "5", closingPrincipal: "0"});
    expect(result.contributions).toHaveLength(31);
    expect(result.derivedDependencies.every(d => d.decisionIds.includes(f.entry(".amounts").decisionId))).toBe(true);
    expect(result.grantsExecution).toBe(false); expect(result.classification).toBe("working_hypothesis");
  });
  it("recalculates capitalized adopted costs and settles them with principal rather than as cash received", () => {
    const f = fixture(); f.entry(".treatments").value.value = ["capitalized_at_period_start"]; f.entry(".accounts").value.value = ["none"];
    const result = calculateAdoptedFinancingLiquidity(f.input());
    expect(result.financing!.debt![0]!.rows[0]!.capitalizedCharges).toBe("5");
    expect(result.liquidity!.closingAvailable).toBe("1.95"); // 130 +20 +100 -(100+100+5)*1.1*1.1
  });
  it("requires adopted gross draw convention and never supplies it from an unchecked flag", () => {
    const f = fixture(); f.entry(".drawConvention").value.value = "net_proceeds";
    expect(() => calculateAdoptedFinancingLiquidity(f.input())).toThrow();
    f.input().financing[0]!.drawConvention.decisionId = null; f.input().financing[0]!.drawConvention.missingReason = "Gross or net convention not yet resolved";
    expect(calculateAdoptedFinancingLiquidity(f.input())).toMatchObject({status: "missing_inputs", financing: null, liquidity: null});
  });
  it("keeps unknown taxes as a named gap and does not return a misleading net balance", () => {
    const f = fixture(); f.entry("tax.assessment").value.value = "unknown";
    const result = calculateAdoptedFinancingLiquidity(f.input());
    expect(result).toMatchObject({status: "missing_inputs", financing: null, liquidity: null});
    expect(result.gaps.some(g => g.operand.endsWith(".tax"))).toBe(true);
  });
  it("permits an empty charge ledger only under explicit zero or non-applicability assessments", () => {
    const f = fixture(); f.entry("origination_fee.assessment").value.value = "zero";
    const input = {...f.input(), financing: [{...f.input().financing[0]!, charges: null}]};
    expect(calculateAdoptedFinancingLiquidity(input).liquidity!.closingAvailable).toBe("8");
    f.entry("origination_fee.assessment").value.value = "specified";
    expect(calculateAdoptedFinancingLiquidity({...f.input(), financing: input.financing})).toMatchObject({status: "missing_inputs", liquidity: null});
  });
  it.each(["entityId", "perimeter", "currency", "scenario", "periodStart", "periodEnd", "definitionVersionId", "unit"] as const)("rejects adopted costs with mismatched %s", key => {
    const f = fixture(); const e = f.entry(".treatments");
    e.dimensions[key] = key.endsWith("Id") ? "c1520000-0000-4000-9000-000000008888" : key === "currency" ? "USD" : key === "periodStart" ? "2026-12-31" : key === "periodEnd" ? "2027-03-01" : "other";
    expect(() => calculateAdoptedFinancingLiquidity(f.input())).toThrow("financing_basis_context_mismatch");
  });
  it("requires monetary scale interpretation and propagates missing adopted series", () => {
    const f = fixture(); f.entry(".amounts").dimensions.scale = "1000";
    expect(calculateAdoptedFinancingLiquidity(f.input())).toMatchObject({status: "missing_inputs", liquidity: null});
    f.entry(".amounts").dimensions.scale = "1"; const s = f.input().financing[0]!.charges!.dates;
    s.decisionId = null; s.missingReason = "Actual settlement dates not yet adopted";
    expect(calculateAdoptedFinancingLiquidity(f.input())).toMatchObject({status: "missing_inputs", financing: null});
  });
  it("rejects inconsistent typed series instead of parsing encoded JSON or guessing missing members", () => {
    const f = fixture(); f.entry(".dates").value.value = ["2027-01-01", "2027-01-02"];
    expect(() => calculateAdoptedFinancingLiquidity(f.input())).toThrow("financing_basis_series_length_mismatch");
    f.entry(".dates").value = {type: "text", value: '["2027-01-01"]'};
    expect(() => calculateAdoptedFinancingLiquidity(f.input())).toThrow("financing_basis_context_mismatch");
  });
  it("refuses duplicate inventory, foreign instrument and duplicate original observation", () => {
    const f = fixture(); const input = f.input(); input.financing.push(input.financing[0]!);
    expect(() => calculateAdoptedFinancingLiquidity(input)).toThrow("Financing inventory");
    const other = fixture(); other.input().financing[0]!.instrumentId = "c1520000-0000-4000-9000-000000008888";
    expect(() => calculateAdoptedFinancingLiquidity(other.input())).toThrow("Financing inventory");
    const repeated = fixture(); const observationId = "c1520000-0000-4000-9000-000000008888";
    repeated.entry(".drawConvention").observationId = observationId; repeated.entry(".treatments").observationId = observationId;
    expect(() => calculateAdoptedFinancingLiquidity(repeated.input())).toThrow("financing_basis_missing_or_reused_contribution");
  });
  it("preserves the old snapshot and produces the same fingerprint after a later contribution changes", () => {
    const f = fixture(); const old = f.input(); const first = calculateAdoptedFinancingLiquidity(old);
    f.entry(".amounts").value.value = ["6"];
    expect(calculateAdoptedFinancingLiquidity(old)).toEqual(first);
    expect(calculateAdoptedFinancingLiquidity(f.input()).liquidity!.closingAvailable).toBe("2");
    expect(first.liquidity!.closingAvailable).toBe("3");
  });
  it("rejects forged envelope and injected precomputed financing results", () => {
    const f = fixture(); const input = f.input(); input.envelope.canonical += " ";
    expect(() => calculateAdoptedFinancingLiquidity(input)).toThrow("adoption_basis_integrity_mismatch");
    expect(() => calculateAdoptedFinancingLiquidity({...f.input(), computedCosts: "0"})).toThrow();
  });
  it("normalizes adopted cost amounts and retains the interpretation in each derived dependency", () => {
    const f = fixture(); const amount = f.entry(".amounts"); amount.dimensions.scale = "1000"; amount.value.value = ["0.005"];
    const groupId = "c1520000-0000-4000-9000-000000009990";
    function add(field: "mode" | "members", n: number) {
      const e = {...structuredClone(amount), decisionId: `c1520000-0000-4000-9000-${String(n).padStart(12, "0")}`,
        slotKey: createHash("sha256").update(field).digest("hex"), fieldPath: `numeric_representation.${groupId}.${field}`,
        dimensions: {...amount.dimensions, scale: "1", unit: field === "mode" ? "convention" : "contribution_ids"},
        value: field === "mode" ? {type: "text" as const, value: "reported_in_declared_scale"} : {type: "list" as const, value: [amount.decisionId]}};
      f.snapshot.entries.push(e); return {decisionId: e.decisionId, definitionVersionId: e.dimensions.definitionVersionId, definitionKind: e.definitionKind};
    }
    const group = {id: groupId, mode: add("mode", 9991), members: add("members", 9992)};
    const result = calculateAdoptedFinancingLiquidity({...f.input(), numericInterpretations: [group]});
    expect(result.liquidity!.closingAvailable).toBe("3");
    expect(result.financing!.charges[0]!.amount).toBe("5");
    expect(result.contributions.find(e => e.decisionId === amount.decisionId)!.value).toEqual({type: "list", value: ["0.005"]});
    expect(result.derivedDependencies.every(d => d.decisionIds.includes(group.mode.decisionId) && d.decisionIds.includes(group.members.decisionId))).toBe(true);
  });
  it("validates adopted amortization against debt including financed charges", () => {
    const f = fixture(); f.entry(".treatments").value.value = ["capitalized_at_period_start"]; f.entry(".accounts").value.value = ["none"];
    f.entry(".couponTreatment").value.value = "cash_paid"; f.entry(".scheduledPrincipal").value.value = ["0", "205"]; f.entry(".repayAll").value.value = ["false", "false"];
    const result = calculateAdoptedFinancingLiquidity(f.input());
    expect(result.financing!.totals!.closingPrincipal).toBe("0"); expect(result.liquidity!.closingAvailable).toBe("4");
  });
});
