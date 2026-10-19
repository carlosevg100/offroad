import Decimal from "decimal.js";
import {describe, expect, it} from "vitest";
import {composeBoundFinancingComparison} from "./financing-comparison-composer";
import {prepareFinancingComparisonPacket} from "./financing-comparison-packet";
import {proposeFinancingComparisonHypotheses} from "./financing-comparison-premises";
import {adoptAuroraFacts, auroraFacts, auroraIds as ids} from "./financing-comparison.test-support";

const P = Decimal.clone({precision: 60});

const adopt = adoptAuroraFacts;
const near = (a: string, b: string, tol = "0.00005") => new P(a).minus(b).abs().lte(tol);

describe("C02 premises proposed from facts with origin, adopted, composed and compared", {timeout: 120000}, () => {
  it("stays inside the basis limit and states the origin of every premise", () => {
    const h = proposeFinancingComparisonHypotheses(auroraFacts());
    expect(h.length).toBeLessThanOrEqual(256);
    expect(h.every((x) => x.reason.startsWith("Origem: "))).toBe(true);
  });
  it("reproduces the oracle for the three proposals in the base and the bank's case", () => {
    const a = adopt(auroraFacts());
    const packet = prepareFinancingComparisonPacket(composeBoundFinancingComparison({envelope: a.envelope, scope: a.scope, question: "Qual eu fico?"}));
    expect(packet.status).toBe("prepared_for_human_review");
    const base = {[ids.itau]: ["4.0000", "13.2636", "1.9475", "51.8920"], [ids.santander]: ["4.0047", "19.4592", "1.9071", "52.4246"], [ids.fundo]: ["3.5475", "20.7828", "1.8788", "51.2504"]};
    for (const p of packet.comparison.cases[0]!.proposals) {
      const o = base[p.proposalId]!;
      expect([near(new P(p.equivalentSpread!).mul(100).toFixed(), o[0]!), near(p.minimumCash.amount, o[1]!), near(p.covenant.worstRatio, o[2]!), near(p.horizonFinancingCost, o[3]!)]).toEqual([true, true, true, true]);
    }
    const stress = packet.comparison.cases.find((c) => c.caseId === "bank-stress")!;
    expect(near(stress.proposals.find((p) => p.proposalId === ids.itau)!.minimumCash.amount, "-0.2610")).toBe(true);
    expect(packet.comparison.cases[0]!.proposals.find((p) => p.proposalId === ids.itau)!.conditioningFacts).toEqual(["cash_below_policy_minimum"]);
  });
  it("runs the lifetime on contract dates with national business days (independent review's dated recomputation)", () => {
    // Expected: the independent reviewer's dated recomputation with the correct Gregorian Easter (the
    // oracle's dated variant misplaces Easter 2027 and is not used): CDI + 4.118857762, 4.088867142, 3.567112894.
    const a = adopt(auroraFacts({dated: true}));
    const packet = prepareFinancingComparisonPacket(composeBoundFinancingComparison({envelope: a.envelope, scope: a.scope, question: "Qual eu fico?"}));
    const spread = (pid: string) => new P(packet.comparison.cases[0]!.proposals.find((p) => p.proposalId === pid)!.equivalentSpread!).mul(100).toFixed();
    expect([near(spread(ids.itau), "4.118857762", "0.0000001"), near(spread(ids.santander), "4.088867142", "0.0000001"), near(spread(ids.fundo), "3.567112894", "0.0000001")])
      .toEqual([true, true, true]);
  });
});
