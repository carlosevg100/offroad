import {createHash} from "node:crypto";
import {describe, expect, it} from "vitest";
import type {AdoptionBasisEntry, AdoptionBasisSnapshot} from "@offroad/reconciliation";
import {analysisTestId as id} from "./adopted-analysis.test-support";
import {composeBoundProjectionChallenge} from "./projection-challenge-composer";
import {prepareProjectionChallengePacket, type ProjectionChallengePacket} from "./projection-challenge-packet";
import {proposeProjectionChallengeHypotheses, type ProjectionChallengeFacts} from "./projection-challenge-premises";
import {auroraProjectionBasis, auroraProjectionFacts, type AuroraProjectionOptions} from "./projection-challenge.test-support";

const question = "Que premissas você questionaria nessa projeção?";
function adopt(facts: ProjectionChallengeFacts) {
  let n = 9000;
  const entries: AdoptionBasisEntry[] = proposeProjectionChallengeHypotheses(facts).map((h) => ({decisionId: id(n++), slotKey: createHash("sha256").update(h.fieldPath + h.dimensions.scenario).digest("hex"),
    kind: "hypothesis", fieldPath: h.fieldPath, dimensions: {...h.dimensions}, value: h.value, observationId: null, referenceValue: null, referenceDimensions: null,
    definitionKind: "managerial", actorId: id(5), reason: h.reason}) as AdoptionBasisEntry);
  const snapshot: AdoptionBasisSnapshot = {schemaVersion: "contextual-adoption.v1", versionId: id(500), setId: id(6), workId: id(7), purpose: "synthetic projection challenge",
    contextKey: "projection", revision: 1, previousVersionId: null, classification: "working_basis", entries};
  return {entries, snapshot, scope: {workId: id(7), purpose: snapshot.purpose, versionId: id(500)}};
}
const seal = (snapshot: AdoptionBasisSnapshot) => {const canonical = JSON.stringify(snapshot); return {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")};};
const compose = (a: ReturnType<typeof adopt>, entries = a.entries) => composeBoundProjectionChallenge({envelope: seal({...a.snapshot, entries}), scope: a.scope, question});
const packetOf = (facts: ProjectionChallengeFacts, entries?: (e: AdoptionBasisEntry[]) => AdoptionBasisEntry[]) => {
  const a = adopt(facts); return prepareProjectionChallengePacket(compose(a, entries ? entries(a.entries) : a.entries));
};
const reference = (o: AuroraProjectionOptions = {}) => prepareProjectionChallengePacket({schemaVersion: "projection-challenge-packet-input.v1", question, analysis: auroraProjectionBasis(o).seal()});
/** What the answer says, without identities of the basis. */
const content = (p: ProjectionChallengePacket) => ({status: p.status, readings: p.readings, challenge: p.result.challenge, assumptions: p.result.assumptions,
  unitConvention: p.result.unitConvention, capacitySource: p.result.capacitySource, marginCause: p.result.marginCause, resultStatus: p.result.status,
  classification: p.result.classification, gaps: p.gaps.map((g) => ({operand: g.operand.replace(/^projection_challenge\.[0-9a-f-]{36}\./, ""), reason: g.reason}))});

describe("C26 premises proposed from facts with origin, adopted, composed and challenged", () => {
  it("stays inside the basis limit and states the origin of every premise", () => {
    for (const o of [{}, {premiumOverAverage: "0.25"}, {capacity: false}] as AuroraProjectionOptions[]) {
      const h = proposeProjectionChallengeHypotheses(auroraProjectionFacts(o));
      expect(h.length).toBeLessThanOrEqual(256);
      expect(h.every((x) => x.reason.startsWith("Origem: "))).toBe(true);
      expect(h.every((x) => x.fieldPath.startsWith("projection_challenge.") && x.dimensions.scale === "1")).toBe(true);
    }
  });
  it.each([
    ["the plan as sent", {}],
    ["no capacity informed", {capacity: false}],
    ["the price documented", {documented: ["preco"]}],
    ["the premium line in turn two", {premiumOverAverage: "0.25", marginCause: "Linha premium lançada em março"}],
  ] as [string, AuroraProjectionOptions][])("reproduces the hand-built basis with %s", (_, o) => {
    expect(content(packetOf(auroraProjectionFacts(o)))).toEqual(content(reference(o)));
  });
  it("answers the calibration with the numbers of the packet test", () => {
    const r = packetOf(auroraProjectionFacts()).readings!;
    expect(Number(r.gap.ebitda).toFixed(1)).toBe("27.2");
    expect(r.assumptions.map((a) => [a.assumptionId, Number(a.effect.ebitda).toFixed(1)])).toEqual([["preco", "12.9"], ["volume", "9.6"], ["fixos", "3.8"], ["prazo-capex", "0.0"]]);
    expect(r.recommendation.kind).toBe("present_plan_as_upside_case");
  });
  it("declares an absent operand missing and a slot adopted twice as missing", () => {
    const gapped = packetOf(auroraProjectionFacts(), (e) => e.filter((x) => !x.fieldPath.endsWith(".case.plan.fixedCosts")));
    expect(gapped.status).toBe("framed");
    expect(gapped.readings).toBeNull();
    expect(gapped.gaps.map((g) => g.reason)).toContain("No contribution adopted for case.plan.fixedCosts in scenario plano");
    const twice = packetOf(auroraProjectionFacts(), (e) => {
      const one = e.find((x) => x.fieldPath.endsWith(".case.reference.maintenanceCapex"))!;
      return [...e, {...one, decisionId: id(9999), slotKey: createHash("sha256").update("second contribution").digest("hex"), value: {type: "number", value: "6"}}];
    });
    expect(twice.status).toBe("framed");
    expect(twice.gaps.map((g) => g.reason)).toContain("2 contributions match case.reference.maintenanceCapex for scenario referencia; keep one value per slot in the working basis");
  });
  it("keeps the evidence of an assumption as a gap when it is not adopted, never invented", () => {
    const p = packetOf(auroraProjectionFacts(), (e) => e.filter((x) => !x.fieldPath.endsWith(".assumption.fixos.evidence")));
    expect(p.status).toBe("partial");
    expect(p.readings!.assumptions.find((a) => a.assumptionId === "fixos")!.evidenceThatWouldSustain).toBeNull();
    expect(p.gaps.map((g) => g.reason)).toEqual(["No contribution adopted for assumption.fixos.evidence in scenario plano"]);
  });
  it("refuses a basis without its anchor or structure", () => {
    const a = adopt(auroraProjectionFacts());
    expect(() => compose(a, a.entries.filter((e) => !e.fieldPath.endsWith(".periodIds")))).toThrow("projection_challenge_analysis_missing");
    expect(() => compose(a, a.entries.filter((e) => !e.fieldPath.endsWith(".structure.planScenario")))).toThrow("projection_challenge_structure_missing");
  });
  it("refuses inconsistent facts before proposing premises", () => {
    const refuse = (change: (f: ProjectionChallengeFacts) => void, message: string) => {const f = auroraProjectionFacts(); change(f); expect(() => proposeProjectionChallengeHypotheses(f)).toThrow(message);};
    refuse((f) => {f.targetPeriodId.value = "2025";}, "The target must be a period after the first");
    refuse((f) => {f.plan.value.quantity = f.plan.value.quantity.slice(1);}, "one value per period");
    refuse((f) => {f.planScenario = f.referenceScenario;}, "their own scenarios");
    refuse((f) => {f.assumptions[1]!.term.value.drivers = ["quantity"];}, "A driver belongs to two assumptions");
    refuse((f) => {f.assumptions[1]!.term.value.id = "volume";}, "Duplicate assumption");
    refuse((f) => {f.capacity!.maximumQuantity.value = "0";}, "Capacity must be positive");
    refuse((f) => {f.plan.value.taxRate = "1.5";}, "cannot exceed one");
    refuse((f) => {f.plan.value.fixedCosts[3] = "85.600000001";}, "Invalid string");
  });
});
