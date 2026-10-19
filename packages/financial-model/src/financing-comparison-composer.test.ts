import {createHash} from "node:crypto";
import {describe, expect, it} from "vitest";
import {composeBoundFinancingComparison} from "./financing-comparison-composer";
import {prepareFinancingComparisonPacket} from "./financing-comparison-packet";
import {c02Ids, c02PacketInput} from "./financing-comparison.test-support";

/** The same Aurora basis plus the case and label adoptions a confirmation records. */
function adoptedCases() {
  const p = c02PacketInput(), f = p.basis;
  f.contribute("case.role", "convention", {type: "text", value: "base"});
  f.contribute("case.label", "explanation", {type: "text", value: "Plano da companhia"});
  f.contribute("case.role", "convention", {type: "text", value: "stress"}, "bank-stress");
  f.contribute("case.label", "explanation", {type: "text", value: "Caso do banco"}, "bank-stress");
  f.contribute("case.changes", "explanation", {type: "list", value: ["EBITDA 15% menor a partir do 4T26"]}, "bank-stress");
  f.contribute("case.inherits", "convention", {type: "text", value: "base"}, "bank-stress");
  for (const [id, label] of [[c02Ids.itau, "itau"], [c02Ids.santander, "santander"], [c02Ids.fundo, "fundo"]] as const)
    f.contribute(`proposal.${id}.label`, "identity", {type: "text", value: label});
  const direct = p.seal();
  return {direct, envelope: direct.cases[0]!.analysis.envelope, scope: direct.cases[0]!.analysis.scope};
}

describe("C02 comparison composed from the working basis alone", {timeout: 120000}, () => {
  it("finds the cases, the existing debt and the proposals and reproduces the direct packet", () => {
    const {direct, envelope, scope} = adoptedCases();
    const composed = composeBoundFinancingComparison({envelope, scope, question: direct.question});
    expect(composed.cases.map((c) => [c.id, c.role, c.label, c.changes])).toEqual([
      ["base", "base", "Plano da companhia", []], ["bank-stress", "stress", "Caso do banco", ["EBITDA 15% menor a partir do 4T26"]]]);
    expect(composed.cases[0]!.analysis.instruments).toHaveLength(6);
    expect(composed.cases[1]!.analysis.inheritedScenario).toBe("base");
    const a = prepareFinancingComparisonPacket(composed), b = prepareFinancingComparisonPacket(direct);
    expect(a.comparison.cases.map((c) => c.proposals.map((p) => [p.proposalId, p.equivalentSpread, p.minimumCash, p.eliminatoryFacts, p.conditioningFacts])))
      .toEqual(b.comparison.cases.map((c) => c.proposals.map((p) => [p.proposalId, p.equivalentSpread, p.minimumCash, p.eliminatoryFacts, p.conditioningFacts])));
    expect(a.status).toBe("prepared_for_human_review");
  });
  it("declares an absent premise missing instead of composing a number", () => {
    const {envelope, scope, direct} = adoptedCases();
    const basis = JSON.parse(envelope.canonical) as {entries: {fieldPath: string}[]};
    basis.entries = basis.entries.filter((e) => !e.fieldPath.endsWith(".company.cashTaxRate"));
    const canonical = JSON.stringify(basis);
    const sealed = {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")};
    const composed = composeBoundFinancingComparison({envelope: sealed, scope, question: direct.question});
    expect(composed.cases[0]!.analysis.company.cashTaxRate.missingReason).toContain("No contribution adopted for company.cashTaxRate");
    expect(prepareFinancingComparisonPacket(composed).status).toBe("framed");
  });
});
