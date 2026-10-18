import {describe, expect, it} from "vitest";
import {composeBoundInvestmentPacket} from "./investment-decision-composer";
import {prepareInvestmentDecisionPacket} from "./investment-decision-packet";
import {c32PacketWithCaseMetadata} from "./investment-decision-packet.test-support";

const compose = (f: ReturnType<typeof c32PacketWithCaseMetadata>) => {
  const envelope = f.seal(), a = f.input.cases[0]!.analysis;
  return composeBoundInvestmentPacket({envelope, scope: a.scope, question: f.input.question});
};

describe("bound investment packet composer", () => {
  it("reads cases and operands from the basis and reproduces the hand-built packet", () => {
    const f = c32PacketWithCaseMetadata({quantum: "10000"});
    const composed = compose(f);
    expect(composed.cases.map(c => [c.id, c.role, c.analysis.inheritedScenario ?? null])).toEqual([
      ["base", "base", null], ["capex-120", "sensitivity", "base"], ["defer-12", "deferral", null], ["economy-4", "sensitivity", "base"], ["slower-start", "sensitivity", "base"]]);
    const fromBasis = prepareInvestmentDecisionPacket(composed), byHand = prepareInvestmentDecisionPacket(f.input);
    const metrics = (p: typeof fromBasis) => Object.fromEntries(p.comparison.metrics.map(m => [m.caseId, [m.netPresentValue, m.annualIrr, m.paybackYears, m.companyMinimumCash]]));
    expect(metrics(fromBasis)).toEqual(metrics(byHand));
    expect(fromBasis.status).toBe("prepared_for_human_review");
    expect(composed.cases.find(c => c.id === "economy-4")!.changes).toEqual(["Economia anual em regime de R$ 4 milhões em vez de R$ 6 milhões"]);
  });

  it("declares a missing operand instead of inventing it", () => {
    const f = c32PacketWithCaseMetadata();
    const i = f.basis.entries.findIndex(e => e.fieldPath.endsWith(".valuation.discountRate") && e.dimensions.scenario === "base");
    f.basis.entries.splice(i, 1);
    const packet = prepareInvestmentDecisionPacket(compose(f));
    expect(packet.status).toBe("partial");
    expect(packet.gaps.find(g => g.caseId === "base")!.reason).toContain("No contribution adopted for valuation.discountRate in scenario base");
    // Sensitivities inherit the same absence from the base.
    expect(packet.gaps.some(g => g.caseId === "economy-4" && g.reason.includes("or inherited base"))).toBe(true);
  });

  it("treats a slot adopted twice as missing and refuses a basis without cases or with two analyses", () => {
    const f = c32PacketWithCaseMetadata();
    const e = f.basis.entries.find(x => x.fieldPath.endsWith(".valuation.irrLower") && x.dimensions.scenario === "base")!;
    f.basis.entries.push({...e, decisionId: "ac400000-0000-4000-9000-000000009999", slotKey: "f".repeat(64)});
    expect(prepareInvestmentDecisionPacket(compose(f)).gaps.some(g => g.reason.includes("2 contributions match valuation.irrLower"))).toBe(true);
    const g = c32PacketWithCaseMetadata();
    for (let n = g.basis.entries.length - 1; n >= 0; n--) if (g.basis.entries[n]!.fieldPath.endsWith(".case.role")) g.basis.entries.splice(n, 1);
    expect(() => compose(g)).toThrow("investment_packet_cases_missing");
  });
});
