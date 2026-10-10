import Decimal from "decimal.js";
import {describe, expect, it} from "vitest";
import {matchesMethodValue} from "@offroad/credit-playbook";
import {investmentDecisionPacketOutputSchema, prepareInvestmentDecisionPacket} from "./investment-decision-packet";
import {investmentDecisionPacketExecutorContracts} from "./investment-decision-contracts";
import {c32PacketInput} from "./investment-decision-packet.test-support";

const D = Decimal.clone({precision: 60});
const millions = (v: string | null, places = 1) => v === null ? null : new D(v).div(1000000).toDecimalPlaces(places).toNumber();
const percent = (v: string | null) => v === null ? null : new D(v).times(100).toDecimalPlaces(1).toNumber();

describe("investment decision packet over adopted scenarios", () => {
  it("reproduces the five C32 cases of the independent oracle", () => {
    // The oracle rounds each annual flow to R$ 0.01 million before discounting; the same
    // calibration quantum is adopted here. Unrounded values are asserted in the next test.
    const f = c32PacketInput({quantum: "10000"}); f.seal();
    const packet = prepareInvestmentDecisionPacket(f.input);
    const m = Object.fromEntries(packet.comparison.metrics.map(x => [x.caseId, x]));
    // projeto_embalagem.py (v2, payback on the valuation grid): VPL a 15%, TIR, payback desde 2026.
    const oracle: Record<string, [number, number, number]> = {
      "base": [0.7, 15.8, 5.9], "economy-4": [-6.3, 7.7, 8.2], "capex-120": [-2.1, 13.0, 6.4], "slower-start": [-1.0, 14.0, 6.3], "defer-12": [1.4, 16.7, 6.7]};
    for (const [caseId, [npv, irr, payback]] of Object.entries(oracle)) {
      expect(millions(m[caseId]!.netPresentValue), caseId).toBe(npv);
      expect(percent(m[caseId]!.annualIrr), caseId).toBe(irr);
      expect(new D(m[caseId]!.paybackYears!).toDecimalPlaces(1).toNumber(), caseId).toBe(payback);
    }
    expect(m.base!.startupWorkingCapital).toBe("5812500");
    expect(packet.comparison.baseCaseId).toBe("base");
    // The premises that change the conclusion: value turns negative.
    expect(packet.comparison.conclusionChangingCaseIds).toEqual(["economy-4", "capex-120", "slower-start"]);
    expect(packet.comparison.timingCaseIds).toEqual(["defer-12"]);
    expect(m["economy-4"]!.signDiffersFromBase).toBe(true); expect(m["defer-12"]!.signDiffersFromBase).toBe(false);
    expect(millions(m.base!.irrMinusDiscountRate === null ? null : new D(m.base!.irrMinusDiscountRate).times(1000000).toFixed(), 3)).toBeCloseTo(0.008, 3);
    // Cash the project consumes before it pays back: R$ 10 mi in 2026 and R$ 11.66 mi in 2027.
    expect(millions(m.base!.peakCumulativeCashNeed!.amount, 2)).toBe(-21.66);
    expect(m.base!.peakCumulativeCashNeed!.periodEndDate).toBe("2027-12-31");
    // The opening balance counts: without the project the minimum is the R$ 20 mi opening cash.
    expect(m.base!.companyMinimumCash!.withoutProject).toEqual({amount: "20000000", periodEndDate: "2025-12-31"});
    expect(m.base!.companyMinimumCash!.withProject.periodEndDate).toBe("2027-12-31");
    expect(millions(m.base!.companyMinimumCash!.withProject.amount, 2)).toBe(10.74);
    expect(new D(m.base!.companyMinimumCash!.withProject.amount).lt(m.base!.companyMinimumCash!.withoutProject.amount)).toBe(true);
    expect(packet.status).toBe("prepared_for_human_review"); expect(packet.gaps).toEqual([]);
    expect(packet.classification).toBe("working_hypothesis");
    expect(packet.grantsExecution).toBe(false); expect(packet.grantsPublication).toBe(false);
  });

  it("keeps unrounded engine precision unless a calibration quantum is adopted", () => {
    const f = c32PacketInput(); f.seal();
    const m = Object.fromEntries(prepareInvestmentDecisionPacket(f.input).comparison.metrics.map(x => [x.caseId, x]));
    // Same drivers, no rounding: economy at R$ 4 mi gives -6.35, displayed -6.4 instead of the oracle's -6.3.
    expect(millions(m["economy-4"]!.netPresentValue, 2)).toBe(-6.35);
    expect(millions(m.base!.netPresentValue, 2)).toBe(0.73);
  });

  it("matches its published contracts and is byte-stable", () => {
    const f = c32PacketInput(); f.seal();
    const contracts = investmentDecisionPacketExecutorContracts();
    const packet = prepareInvestmentDecisionPacket(f.input);
    expect(matchesMethodValue(contracts.inputs.value, f.input)).toBe(true);
    expect(matchesMethodValue(contracts.outputs.value, packet)).toBe(true);
    expect(JSON.stringify(prepareInvestmentDecisionPacket(f.input))).toBe(JSON.stringify(packet));
    for (const forged of [{grantsExecution: true}, {grantsPublication: true}, {status: "approved"}, {recommendation: "seguir"}])
      expect(() => investmentDecisionPacketOutputSchema.parse({...packet, ...forged})).toThrow();
  });

  it("keeps independent parts and declares gaps when an operand is not adopted", () => {
    const f = c32PacketInput(); f.seal();
    const base = f.input.cases[0]!.analysis;
    base.valuation.discountRate = {...base.valuation.discountRate, decisionId: null, missingReason: "Custo de capital não adotado"};
    const packet = prepareInvestmentDecisionPacket(f.input);
    expect(packet.status).toBe("partial");
    expect(packet.gaps.some(g => g.caseId === "base" && g.reason === "Custo de capital não adotado")).toBe(true);
    const base0 = packet.comparison.metrics[0]!;
    expect(base0.netPresentValue).toBeNull(); expect(base0.startupWorkingCapital).toBe("5812500");
    // Without a base value no case can be said to change the conclusion.
    expect(packet.comparison.conclusionChangingCaseIds).toEqual([]);
  });

  it("refuses ambiguous packets: no base, two bases, shared scenarios, mixed bases or unexplained cases", () => {
    const fresh = () => {const f = c32PacketInput(); f.seal(); return f.input;};
    const noBase = fresh(); noBase.cases.shift(); expect(() => prepareInvestmentDecisionPacket(noBase)).toThrow();
    const twoBases = fresh(); (twoBases.cases[1] as {role: string}).role = "base"; expect(() => prepareInvestmentDecisionPacket(twoBases)).toThrow();
    const sameScenario = fresh(); sameScenario.cases[1]!.analysis = sameScenario.cases[0]!.analysis; expect(() => prepareInvestmentDecisionPacket(sameScenario)).toThrow();
    const silent = fresh(); silent.cases[2]!.changes = []; expect(() => prepareInvestmentDecisionPacket(silent)).toThrow();
    const mixed = fresh(); mixed.cases[3]!.analysis = {...mixed.cases[3]!.analysis, currency: "USD"}; expect(() => prepareInvestmentDecisionPacket(mixed)).toThrow();
    const freeNumbers = fresh(); expect(() => prepareInvestmentDecisionPacket({...freeNumbers, npv: "1000000"})).toThrow();
  });

  it("inherits only declared base operands", () => {
    const fresh = () => {const f = c32PacketInput(); f.seal(); return f.input;};
    // Without the declaration, a sensitivity cannot silently read the base scenario.
    const undeclared = fresh(); delete (undeclared.cases[1]!.analysis as {inheritedScenario?: string}).inheritedScenario;
    expect(() => prepareInvestmentDecisionPacket(undeclared)).toThrow("analysis_basis_context_mismatch");
    // Inheriting from another sensitivity, or the base inheriting, is refused.
    const chained = fresh(); chained.cases[2]!.analysis.inheritedScenario = "economy-4"; expect(() => prepareInvestmentDecisionPacket(chained)).toThrow();
    const baseInherits = fresh(); baseInherits.cases[0]!.analysis.inheritedScenario = "economy-4"; expect(() => prepareInvestmentDecisionPacket(baseInherits)).toThrow();
    const selfInherits = fresh(); selfInherits.cases[1]!.analysis.inheritedScenario = "economy-4"; expect(() => prepareInvestmentDecisionPacket(selfInherits)).toThrow();
  });
});
