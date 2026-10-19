import {createHash} from "node:crypto";
import Decimal from "decimal.js";
import {describe, expect, it} from "vitest";
import type {AdoptionBasisEntry, AdoptionBasisSnapshot} from "@offroad/reconciliation";
import {composeBoundDebtCapacity} from "./debt-capacity-composer";
import {prepareDebtCapacityPacket} from "./debt-capacity-packet";
import {proposeDebtCapacityHypotheses, type DebtCapacityFacts} from "./debt-capacity-premises";
import {auroraCapacityFacts} from "./debt-capacity.test-support";
import {analysisTestId as id} from "./adopted-analysis.test-support";

const r = (v: string, p = 1) => new Decimal(v).toDecimalPlaces(p).toNumber();
function adopt(facts: DebtCapacityFacts) {
  let n = 9000;
  const entries: AdoptionBasisEntry[] = proposeDebtCapacityHypotheses(facts).map((h) => ({decisionId: id(n++), slotKey: createHash("sha256").update(h.fieldPath + h.dimensions.scenario).digest("hex"),
    kind: "hypothesis", fieldPath: h.fieldPath, dimensions: {...h.dimensions}, value: h.value, observationId: null, referenceValue: null, referenceDimensions: null,
    definitionKind: "managerial", actorId: id(5), reason: h.reason}) as AdoptionBasisEntry);
  const snapshot: AdoptionBasisSnapshot = {schemaVersion: "contextual-adoption.v1", versionId: id(500), setId: id(6), workId: id(7), purpose: "synthetic capacity",
    contextKey: "capacidade", revision: 1, previousVersionId: null, classification: "working_basis", entries};
  const canonical = JSON.stringify(snapshot);
  return {entries, envelope: {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")}, scope: {workId: id(7), purpose: snapshot.purpose, versionId: id(500)}};
}
const question = "Quanto de dívida a gente aguenta tomar para a segunda linha de R$ 60 milhões?";
const packetOf = (facts: DebtCapacityFacts) => {const a = adopt(facts); return prepareDebtCapacityPacket(composeBoundDebtCapacity({envelope: a.envelope, scope: a.scope, question}));};

describe("C04 premises proposed from facts with origin, adopted, composed and measured", {timeout: 180000}, () => {
  it("stays inside the basis limit and states the origin of every premise", () => {
    const h = proposeDebtCapacityHypotheses(auroraCapacityFacts());
    expect(h.length).toBeLessThanOrEqual(256);
    expect(h.every((x) => x.reason.startsWith("Origem: "))).toBe(true);
  });
  it("reproduces the independent oracle for both schedules (modelo_c04.py)", () => {
    const p = packetOf(auroraCapacityFacts()), at = (c: string) => p.cases.find((x) => x.caseId === c)!;
    expect(at("informed").limits.map((l) => [l.id, r(l.capacity!)])).toEqual([["covenant", 54.8], ["interest", 72], ["market", 76.8]]);
    expect(at("phased").limits.map((l) => [l.id, r(l.capacity!)])).toEqual([["covenant", 79.5], ["interest", 107.6], ["market", 108.6]]);
    expect(at("informed").binding!.limitId).toBe("covenant");
    expect(at("informed").binding!.date).toBe("2028-12-31");
    expect(at("informed").review!.fits).toBe(false);
    expect(at("informed").review!.failingLimitIds).toEqual(["covenant"]);
    expect(at("phased").review!.fits).toBe(true);
    const plan = at("informed").plan!.find((y) => y.date === "2029-12-31")!;
    expect([r(plan.scheduledExistingPrincipal, 2), r(plan.cashAfterInterest, 2), plan.paysWithoutRefinancing]).toEqual([22.67, 23.56, true]);
    expect(at("informed").calibrationOnly).toBe(true);
  });
  it("refuses inconsistent facts before proposing premises", () => {
    const two = auroraCapacityFacts(); two.cases[1]!.value.role = "informed";
    expect(() => proposeDebtCapacityHypotheses(two)).toThrow("Exactly one informed case");
    const short = auroraCapacityFacts(); short.company.ebitda.value.pop();
    expect(() => proposeDebtCapacityHypotheses(short)).toThrow("Company ebitda must have one value per period");
    const over = auroraCapacityFacts(); over.structure.value.amortizationShares[6] = "0.5";
    expect(() => proposeDebtCapacityHypotheses(over)).toThrow("Repayment shares");
    const nothing = auroraCapacityFacts(); nothing.cases[0]!.value.capex = nothing.cases[0]!.value.capex.map(() => "0");
    expect(() => proposeDebtCapacityHypotheses(nothing)).toThrow("needs a positive use");
  });
  it("leaves an unstated limit out and an absent operand as a named gap, never a default", () => {
    const facts = auroraCapacityFacts(); facts.requestedAmount = null;
    const p = packetOf(facts);
    expect(p.cases.every((c) => c.review === null)).toBe(true);
    const a = adopt(auroraCapacityFacts());
    const pruned = a.entries.filter((e) => !e.fieldPath.endsWith(".openingAvailableCash"));
    const snapshot = {...JSON.parse(a.envelope.canonical), entries: pruned}, canonical = JSON.stringify(snapshot);
    const gapped = prepareDebtCapacityPacket(composeBoundDebtCapacity({envelope: {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")}, scope: a.scope, question}));
    expect(gapped.status).toBe("framed");
    expect(gapped.cases[0]!.gaps.some((g) => g.reason.startsWith("No contribution adopted for scenario."))).toBe(true);
  });
});
