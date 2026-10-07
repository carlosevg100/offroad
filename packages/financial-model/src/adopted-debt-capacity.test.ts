import {describe, expect, it} from "vitest";
import type {DebtCapacityInput} from "@offroad/financial-core";
import {calculateAdoptedDebtCapacity, type AdoptedDebtCapacityInput} from "./adopted-debt-capacity";
import {analysisTestBasis, analysisTestId as id} from "./adopted-analysis.test-support";
import {adoptedDebtCapacityInputSchema} from "./adopted-debt-capacity";

function fixture(adverse = false) {
  const f = analysisTestBasis(`debt_capacity.${id(4)}.`, "2026-12-31", "2028-12-31");
  const num = (p: string, unit: string, value: string, scenario = "base") => f.contribute(p, unit, {type: "number", value}, scenario);
  const text = (p: string, value: string, scenario = "base") => f.contribute(p, "convention", {type: "text", value}, scenario);
  const list = (p: string, unit: string, value: string[], scenario = "base") => f.contribute(p, unit, {type: "list", value}, scenario);
  const scenario = (adverse: boolean, sid: string) => {
    const sc = adverse ? "adverse" : "base", p = `scenario.${sid}.`;
    const affine = Object.fromEntries(["ebitda", "covenantEbitdaAdjustment", "nonCashEbitdaBridge", "cashLeasePayments", "changeInWorkingCapital", "maintenanceCapex", "growthCapex", "taxableBaseBeforeNewDebtInterest", "otherExistingFinancingCashAvailable", "capitalCashAvailable"].map(k => [k, {
      fixed: list(p + k + ".fixed", "currency", k === "ebitda" ? ["20", adverse ? "110" : "120"] : k === "growthCapex" ? ["100", "0"] : ["0", "0"], sc),
      perUnitNewDebt: list(p + k + ".perUnitNewDebt", "ratio", ["0", "0"], sc)}]));
    const money = Object.fromEntries(["existingCashInterest", "existingCashPrincipalPaid", "existingDebtForRatio"].map(k => [k, list(p + k, "currency", ["0", "0"], sc)]));
    const ratios = Object.fromEntries(["drawAtStart", "drawAtEnd", "principalPaidAtEnd", "interestFactorOnOpeningAndStartDraw", "interestFactorOnEndDraw", "interestFactorCreditOnEndAmortization", "withheldCostPerUnitDraw"].map(k => [k, list(p + "newFinancing." + k, "ratio", k === "drawAtStart" ? ["1", "0"] : k === "principalPaidAtEnd" ? ["0", "1"] : k === "interestFactorOnOpeningAndStartDraw" ? ["0.1", "0.1"] : ["0", "0"], sc)]));
    return {id: sid, scenario: sc, terms: {openingAvailableCash: num(p + "openingAvailableCash", "currency", "0", sc),
      cashNetting: text(p + "cashNetting", "signed_available", sc), includeNewAccruedInterestInDebt: f.contribute(p + "includeNewAccruedInterestInDebt", "convention", {type: "boolean", value: false}, sc),
      periodEnds: list(p + "periodEnds", "date", ["2027-12-31", "2028-12-31"], sc), affine, money, ratios: {cashTaxRate: list(p + "cashTaxRate", "ratio", ["0", "0"], sc)},
      conventions: {lossTaxTreatment: list(p + "lossTaxTreatment", "convention", ["no_cash_benefit", "no_cash_benefit"], sc), newDebtTaxDeduction: list(p + "newDebtTaxDeduction", "convention", ["paid_interest", "paid_interest"], sc), cfadsGrowthCapexTreatment: list(p + "cfadsGrowthCapexTreatment", "convention", ["exclude_growth_capex", "exclude_growth_capex"], sc)},
      cfadsDefinitionAnchors: list(p + "cfadsDefinitionAnchors", "reference_id", ["synthetic CFADS", "synthetic CFADS"], sc),
      newFinancing: {ratios, conventions: {factorConvention: list(p + "newFinancing.factorConvention", "convention", ["dated_contract_split_at_cash_flows", "dated_contract_split_at_cash_flows"], sc), paysAccruedInterest: list(p + "newFinancing.paysAccruedInterest", "convention", ["true", "true"], sc), unpaidInterestBase: list(p + "newFinancing.unpaidInterestBase", "convention", ["principal_plus_accrued", "principal_plus_accrued"], sc)}}},
      rules: [{id: id(adverse ? 302 : 301), kind: text(p + `rule.${id(adverse ? 302 : 301)}.kind`, "minimum_available_cash", sc), threshold: num(p + `rule.${id(adverse ? 302 : 301)}.threshold`, "currency", "10", sc)}]};
  };
  const input = {...f.context, analysisId: id(4), scenario: "base", maximumAmount: num("maximumAmount", "currency", "200"), monetaryQuantum: num("monetaryQuantum", "currency", "0.01"), fixedReviewAmount: num("fixedReviewAmount", "currency", "90"),
    horizonMode: text("horizonMode", "full_settlement"), newDebtFinalPaymentDate: f.contribute("newDebtFinalPaymentDate", "date", {type: "date", value: "2028-12-31"}), existingDebtFinalPaymentDates: list("existingDebtFinalPaymentDates", "date", []),
    scenarios: [scenario(false, id(300)), ...adverse ? [scenario(true, id(310))] : []]} as unknown as AdoptedDebtCapacityInput;
  const seal = () => ({...input, envelope: f.seal()});
  return {...f, input, seal};
}

describe("capacity from immutable adopted drivers", () => {
  it("finds the largest full-life amount, replays the next tick and tests the fixed amount", () => {
    const f = fixture(), r = calculateAdoptedDebtCapacity(f.seal());
    expect(r.capacity?.maximumFeasibleAmount).toBe("150"); expect(r.capacity?.finalChecks!.every(c => c.passed)).toBe(true);
    expect(r.capacity?.followingChecks!.some(c => !c.passed && c.date === "2028-12-31")).toBe(true);
    expect(r.fixedReview?.constraintsPassed).toBe(false); expect(r.contributions).toHaveLength(f.entries.length);
    expect(r.profile?.moneyUnit).toBe("BRL"); expect(r.grantsExecution).toBe(false); expect(r.grantsPublication).toBe(false);
    expect(calculateAdoptedDebtCapacity(f.seal())).toEqual(r);
  });
  it("intersects every year's limits across base and adverse scenarios", () => {
    const f = fixture(true), r = calculateAdoptedDebtCapacity(f.seal()); expect(r.capacity?.maximumFeasibleAmount).toBe("100");
    expect(r.capacity?.finalChecks!.every(c => c.passed)).toBe(true); expect(f.entries.length).toBeLessThan(256);
  });
  it("requires adopted search bounds, unit precision and no free financing profile", () => {
    const f = fixture(), i = f.seal(); expect(() => calculateAdoptedDebtCapacity({...i, maximumAmount: "500"})).toThrow();
    expect(() => calculateAdoptedDebtCapacity({...i, profile: {} as DebtCapacityInput})).toThrow();
    f.input.monetaryQuantum = {...f.input.monetaryQuantum, decisionId: null, missingReason: "Missing monetary precision"};
    const r = calculateAdoptedDebtCapacity(f.seal()); expect(r.capacity).toBeNull(); expect(r.fixedReview).toBeNull(); expect(r.gaps[0]!.reason).toBe("Missing monetary precision");
  });
  it("denies byte tampering and a different work, purpose, version or entity", () => {
    const f = fixture(), i = f.seal(); expect(() => calculateAdoptedDebtCapacity({...i, envelope: {...i.envelope, canonical: i.envelope.canonical + " "}})).toThrow("adoption_basis_integrity_mismatch");
    for (const scope of [{...i.scope, workId: id(900)}, {...i.scope, purpose: "different purpose"}, {...i.scope, versionId: id(901)}]) expect(() => calculateAdoptedDebtCapacity({...i, scope})).toThrow("adoption_basis_scope_mismatch");
    expect(() => calculateAdoptedDebtCapacity({...i, entityId: id(902)})).toThrow("analysis_basis_context_mismatch");
  });
  it("does not interchange scenario, period, definition, coefficient unit or scale", () => {
    for (const change of [{scenario: "other"}, {periodEnd: "2029-12-31"}, {definitionVersionId: id(902)}, {currency: "USD"}, {unit: "currency"}, {scale: "1000"}]) {
      const f = fixture(), e = f.entries.find(e => e.fieldPath.endsWith("ebitda.perUnitNewDebt"))!;
      e.dimensions = {...e.dimensions, ...change}; expect(() => calculateAdoptedDebtCapacity(f.seal())).toThrow();
    }
  });
  it("does not silently extend a projection or certify an unamortized debt", () => {
    const f = fixture(); f.set("newDebtFinalPaymentDate", {type: "date", value: "2033-12-31"});
    expect(() => calculateAdoptedDebtCapacity(f.seal())).toThrow("capacity_final_amortization_horizon_required");
    f.set("horizonMode", {type: "text", value: "calibration_window"}); expect(calculateAdoptedDebtCapacity(f.seal()).capacity?.status).toBe("calibration_only");
    const g = fixture(); g.set("newFinancing.principalPaidAtEnd", {type: "list", value: ["0", "0.5"]}); expect(() => calculateAdoptedDebtCapacity(g.seal())).toThrow("capacity_final_settlement_required");
  });
  it("requires a dated source series for each operand and never treats an absent cash rule as zero", () => {
    const f = fixture(); f.input.scenarios[0]!.rules[0]!.threshold = {...f.input.scenarios[0]!.rules[0]!.threshold, decisionId: null, missingReason: "Client has not adopted minimum cash"};
    expect(calculateAdoptedDebtCapacity(f.seal()).capacity).toBeNull();
    const g = fixture(); g.set("ebitda.fixed", {type: "list", value: ["20"]}); expect(() => calculateAdoptedDebtCapacity(g.seal())).toThrow("capacity_adopted_series_mismatch");
  });
  it("rejects reused observations and preserves the previous result after a new adoption", () => {
    const f = fixture(), old = calculateAdoptedDebtCapacity(f.seal()); f.set("maximumAmount", {type: "number", value: "140"});
    const revised = calculateAdoptedDebtCapacity(f.seal()); expect(revised.capacity?.maximumFeasibleAmount).toBe("140"); expect(revised.fingerprint).not.toBe(old.fingerprint); expect(old.capacity?.maximumFeasibleAmount).toBe("150");
    const g = fixture(); g.entries[0]!.observationId = id(800); g.entries[1]!.observationId = id(800); expect(() => calculateAdoptedDebtCapacity(g.seal())).toThrow("analysis_missing_or_reused_contribution");
  });
  it("normalizes adopted thousands without scaling financing coefficients or rates", () => {
    const f = fixture(); for (const e of f.entries) if (e.dimensions.unit === "currency") e.dimensions.scale = "1000";
    const i = f.seal(); expect(calculateAdoptedDebtCapacity(i).capacity).toBeNull();
    const group = id(900), members = f.entries.filter(e => e.dimensions.unit === "currency").map(e => e.decisionId);
    const mode = f.contribute(`numeric_representation.${group}.mode`, "convention", {type: "text", value: "reported_in_declared_scale"});
    const member = f.contribute(`numeric_representation.${group}.members`, "contribution_ids", {type: "list", value: members});
    for (const e of f.entries.slice(-2)) e.fieldPath = e.fieldPath.replace(`debt_capacity.${id(4)}.`, "");
    const interpretation = (s: typeof mode) => ({decisionId: s.decisionId!, definitionVersionId: s.definitionVersionId, definitionKind: s.definitionKind});
    const normalizedInput = adoptedDebtCapacityInputSchema.parse({...f.input, envelope: f.seal().envelope, numericInterpretations: [{id: group, mode: interpretation(mode), members: interpretation(member)}]});
    const r = calculateAdoptedDebtCapacity(normalizedInput);
    expect(r.capacity?.maximumFeasibleAmount).toBe("150000"); expect(r.profile?.scenarios[0]!.periods[0]!.newFinancing.drawAtStart).toBe("1");
  });
});
