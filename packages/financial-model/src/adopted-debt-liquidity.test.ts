import {createHash} from "node:crypto";
import {describe, expect, it} from "vitest";
import {adoptedDebtLiquidityFixture} from "@offroad/testing-fixtures/capital-structure-decision";
import {adoptedDebtLiquidityInputSchema, calculateAdoptedDebtLiquidity} from "./adopted-debt-liquidity";
const fixture = () => adoptedDebtLiquidityInputSchema.parse(adoptedDebtLiquidityFixture().input);
type Snapshot = ReturnType<typeof adoptedDebtLiquidityFixture>["snapshot"];
function mutate(input: ReturnType<typeof fixture>, change: (snapshot: Snapshot) => void) {
  const snapshot: Snapshot = JSON.parse(input.envelope.canonical); change(snapshot);
  const canonical = JSON.stringify(snapshot); input.envelope = {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")};
}
const entry = (b: Snapshot, suffix: string) => b.entries.find(e => e.fieldPath.endsWith(suffix))!;
describe("debt and liquidity composed from adopted parameters", () => {
  it("matches the independent cash oracle and keeps every derived movement tied to its adopted terms", () => {
    const result = calculateAdoptedDebtLiquidity(fixture());
    expect(result.liquidity?.closingAvailable).toBe("29"); // 130 + 20 - 100*1.1*1.1.
    expect(result.liquidity?.closingRestricted).toBe("500");
    expect(result.debt?.instruments[0]!.closingPrincipal).toBe("0");
    expect(result.contributions).toHaveLength(18); expect(result.derivedDependencies).toHaveLength(10);
    expect(result.derivedDependencies.every(d => d.decisionIds.length === 15)).toBe(true);
    expect(result.grantsExecution).toBe(false); expect(result.classification).toBe("working_hypothesis");
    expect(result.status).toBe("partial_composition"); expect(result.liquidity?.status).toBe("partial");
    expect(result.exclusions).toContain("financing_fees");
  });
  it("uses one adoption per typed series, not one adoption per calculated payment", () => {
    const input = fixture();
    mutate(input, b => {
      entry(b, ".periodEnds").value.value = Array.from({length: 59}, (_, n) => new Date(Date.UTC(2027, 0, n + 1)).toISOString().slice(0, 10));
      for (const key of ["indexationRates", "couponRates", "drawdowns", "scheduledPrincipal", "prepayments"]) entry(b, `.${key}`).value.value = Array(59).fill("0");
      entry(b, ".repayAll").value.value = Array(59).fill("false");
    });
    const result = calculateAdoptedDebtLiquidity(input);
    expect(result.contributions).toHaveLength(18); expect(result.derivedDependencies).toHaveLength(295);
    expect(result.debt?.instruments[0]!.closingPrincipal).toBe("100"); expect(result.liquidity?.closingAvailable).toBe("150");
  });
  it("does not calculate a deceptively complete cash balance when an essential rate is missing", () => {
    const input = fixture(); const rate = input.instruments[0]!.terms.couponRates;
    rate.decisionId = null; rate.missingReason = "Effective curve not yet adopted";
    const result = calculateAdoptedDebtLiquidity(input);
    expect(result.status).toBe("missing_inputs"); expect(result.debt).toBeNull(); expect(result.liquidity).toBeNull();
    expect(result.gaps).toEqual([{operand: `debt.${input.instruments[0]!.id}.couponRates`, reason: rate.missingReason}]);
  });
  it.each(["entityId", "perimeter", "currency", "scenario", "periodStart", "periodEnd", "definitionVersionId", "unit", "scale"] as const)("rejects a mismatched series %s even with a valid digest", key => {
    const input = fixture(); mutate(input, b => {
      const values = {entityId: "c1510000-0000-4000-9000-000000000099", perimeter: "consolidated", currency: "USD", scenario: "other", periodStart: "2027-01-02", periodEnd: "2027-02-27", definitionVersionId: "c1510000-0000-4000-9000-000000000098", unit: "percent", scale: "1000"};
      entry(b, ".couponRates").dimensions[key] = values[key];
    });
    expect(() => calculateAdoptedDebtLiquidity(input)).toThrow("debt_basis_context_mismatch");
  });
  it("refuses series with missing members, opaque JSON, invalid booleans and out-of-order dates", () => {
    for (const [key, value] of [["couponRates", ["0.1"]], ["repayAll", ["false", "1"]], ["periodEnds", ["2027-02-28", "2027-01-31"]]] as const) {
      const input = fixture(); mutate(input, b => {entry(b, `.${key}`).value.value = [...value];});
      expect(() => calculateAdoptedDebtLiquidity(input)).toThrow();
    }
    const opaque = fixture(); mutate(opaque, b => {entry(b, ".couponRates").value = {type: "text", value: '["0.1","0.1"]'};});
    expect(() => calculateAdoptedDebtLiquidity(opaque)).toThrow("debt_basis_context_mismatch");
  });
  it("does not accept EBITDA or a debt aggregate as an operating movement", () => {
    for (const fieldPath of ["financials.ebitda", "liquidity.cash_outflow", "financials.debt_service"]) {
      const input = fixture(); mutate(input, b => {entry(b, "operating_receipts").fieldPath = fieldPath;});
      expect(() => calculateAdoptedDebtLiquidity(input)).toThrow("debt_basis_context_mismatch");
    }
    for (const category of ["debt_service", "working_capital_release", "operating_payments"]) {
      const input = fixture(); input.operatingEvents[0]!.category = category as typeof input.operatingEvents[0]["category"];
      expect(() => calculateAdoptedDebtLiquidity(input)).toThrow();
    }
  });
  it("refuses duplicate instruments, cash contributions and source observations disguised as separate hypotheses", () => {
    const duplicate = fixture(); duplicate.instruments.push(structuredClone(duplicate.instruments[0]!));
    expect(() => calculateAdoptedDebtLiquidity(duplicate)).toThrow("Duplicate instrument");
    const cash = fixture(); cash.operatingEvents.push({...cash.operatingEvents[0]!, id: "again"});
    expect(() => calculateAdoptedDebtLiquidity(cash)).toThrow("debt_basis_missing_or_reused_contribution");
    const observation = fixture(); mutate(observation, b => {
      entry(b, ".openingPrincipal").observationId = "c1510000-0000-4000-9000-000000000099";
      entry(b, "operating_receipts").observationId = "c1510000-0000-4000-9000-000000000099";
    });
    expect(() => calculateAdoptedDebtLiquidity(observation)).toThrow("debt_basis_reused_observation");
  });
  it("binds payment account and cash category to adopted fields instead of caller relabeling", () => {
    const input = fixture(); input.operatingEvents[0]!.account = "restricted";
    expect(() => calculateAdoptedDebtLiquidity(input)).toThrow("debt_basis_context_mismatch");
    const restricted = fixture(); mutate(restricted, b => {entry(b, ".paymentAccount").value.value = "restricted";});
    const result = calculateAdoptedDebtLiquidity(restricted);
    expect(result.liquidity?.closingAvailable).toBe("150"); expect(result.liquidity?.closingRestricted).toBe("379");
  });
  it("requires declared unit scale for scalars and lists instead of guessing normalization", () => {
    const input = fixture(); mutate(input, b => {entry(b, "available_cash").dimensions.scale = "1.00";});
    expect(calculateAdoptedDebtLiquidity(input).liquidity?.closingAvailable).toBe("29");
    mutate(input, b => {entry(b, "available_cash").dimensions.scale = "1000";});
    expect(() => calculateAdoptedDebtLiquidity(input)).toThrow("debt_basis_context_mismatch");
    mutate(input, b => {entry(b, "available_cash").dimensions.scale = "1"; entry(b, ".drawdowns").dimensions.scale = "1000";});
    expect(() => calculateAdoptedDebtLiquidity(input)).toThrow("debt_basis_context_mismatch");
  });
  it("keeps negative rates, residual debt and zero flows explicit in the composed calculation", () => {
    const input = fixture(); mutate(input, b => {entry(b, ".couponTreatment").value.value = "cash_paid"; entry(b, ".couponRates").value.value = ["-0.1", "-0.1"]; entry(b, ".repayAll").value.value = ["false", "false"];});
    const result = calculateAdoptedDebtLiquidity(input);
    expect(result.liquidity?.closingAvailable).toBe("170"); expect(result.debt?.instruments[0]!.closingPrincipal).toBe("100");
  });
  it("reproduces the old scenario after a new adoption without mutating its envelope or result", () => {
    const input = fixture(); const before = structuredClone(input); const original = calculateAdoptedDebtLiquidity(input);
    const changed = fixture(); changed.scope.versionId = "c1510000-0000-4000-9000-000000000099"; changed.scenario = "requested";
    mutate(changed, b => {b.versionId = changed.scope.versionId; b.revision = 2; for (const e of b.entries) if (e.dimensions.scenario === "house") e.dimensions.scenario = "requested"; entry(b, ".couponRates").value.value = ["0.2", "0.2"];});
    expect(calculateAdoptedDebtLiquidity(changed).liquidity?.closingAvailable).toBe("6");
    expect(calculateAdoptedDebtLiquidity(input)).toEqual(original); expect(input).toEqual(before);
  });
  it("rejects a modified envelope, foreign work, missing reason and injected debt results", () => {
    const tampered = fixture(); tampered.envelope.canonical += " ";
    expect(() => calculateAdoptedDebtLiquidity(tampered)).toThrow("adoption_basis_integrity_mismatch");
    const foreign = fixture(); foreign.scope.workId = "c1510000-0000-4000-9000-000000000099";
    expect(() => calculateAdoptedDebtLiquidity(foreign)).toThrow("adoption_basis_scope_mismatch");
    const absent = fixture(); absent.openingAvailable.decisionId = null;
    expect(() => calculateAdoptedDebtLiquidity(absent)).toThrow();
    expect(() => calculateAdoptedDebtLiquidity({...fixture(), debt: {closingPrincipal: "0"}})).toThrow();
  });
});
