import {createHash} from "node:crypto";
import {describe, expect, it} from "vitest";
import type {AdoptionBasisEntry, AdoptionBasisSnapshot} from "@offroad/reconciliation";
import {analysisTestId as id} from "./adopted-analysis.test-support";
import {composeBoundOperatingProjection} from "./operating-projection-composer";
import {prepareOperatingProjectionPacket, type OperatingProjectionPacket} from "./operating-projection-packet";
import {proposeOperatingProjectionHypotheses, type OperatingProjectionFacts} from "./operating-projection-premises";
import {auroraProjectionBasis, auroraProjectionFacts, type AuroraOptions} from "./operating-projection.test-support";

const question = "Não temos projeção pronta. Ajuda a construir uma para discutir o financiamento.";
function adopt(facts: OperatingProjectionFacts) {
  let n = 9000;
  const entries: AdoptionBasisEntry[] = proposeOperatingProjectionHypotheses(facts).map((h) => ({decisionId: id(n++), slotKey: createHash("sha256").update(h.fieldPath + h.dimensions.scenario).digest("hex"),
    kind: "hypothesis", fieldPath: h.fieldPath, dimensions: {...h.dimensions}, value: h.value, observationId: null, referenceValue: null, referenceDimensions: null,
    definitionKind: "managerial", actorId: id(5), reason: h.reason}) as AdoptionBasisEntry);
  const snapshot: AdoptionBasisSnapshot = {schemaVersion: "contextual-adoption.v1", versionId: id(500), setId: id(6), workId: id(7), purpose: "synthetic operating projection",
    contextKey: "projection", revision: 1, previousVersionId: null, classification: "working_basis", entries};
  return {entries, snapshot, scope: {workId: id(7), purpose: snapshot.purpose, versionId: id(500)}};
}
const seal = (snapshot: AdoptionBasisSnapshot) => {const canonical = JSON.stringify(snapshot); return {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")};};
const compose = (a: ReturnType<typeof adopt>, entries = a.entries) => composeBoundOperatingProjection({envelope: seal({...a.snapshot, entries}), scope: a.scope, question});
const packetOf = (facts: OperatingProjectionFacts, entries?: (e: AdoptionBasisEntry[]) => AdoptionBasisEntry[]) => {
  const a = adopt(facts); return prepareOperatingProjectionPacket(compose(a, entries ? entries(a.entries) : a.entries));
};
const reference = (o: AuroraOptions = {}) => prepareOperatingProjectionPacket({schemaVersion: "operating-projection-packet-input.v1", question, analysis: auroraProjectionBasis(o).seal()});
/** What the answer says, without identities of the basis. */
const content = (p: OperatingProjectionPacket) => ({status: p.status, readings: p.readings, projection: p.result.projection, origins: p.result.origins,
  companyVersions: p.result.companyVersions, openQuestions: p.result.openQuestions, purpose: p.result.purpose, resultStatus: p.result.status,
  classification: p.result.classification, gaps: p.gaps.map((g) => ({operand: g.operand.replace(/^operating_projection\.[0-9a-f-]{36}\./, ""), reason: g.reason}))});

describe("C24 premises proposed from facts with origin, adopted, composed and projected", () => {
  it("stays inside the basis limit and states the origin of every premise", () => {
    for (const o of [{}, {informed: true}, {cause: false}] as AuroraOptions[]) {
      const h = proposeOperatingProjectionHypotheses(auroraProjectionFacts(o));
      expect(h.length).toBeLessThanOrEqual(256);
      expect(h.every((x) => x.reason.startsWith("Origem: "))).toBe(true);
      expect(h.every((x) => x.fieldPath.startsWith("operating_projection.") && x.dimensions.scale === "1")).toBe(true);
    }
  });
  it.each([
    ["the first turn", {}],
    ["the CFO's answers", {informed: true}],
    ["an unexplained difference", {cause: false}],
    ["a last year that is not reproduced", {fixedCosts2025: "70"}],
    ["estimated, informed and house history", {history: {drivers: "estimate", revenue: "informed", ebitda: "house"}}],
  ] as [string, AuroraOptions][])("reproduces the hand-built basis with %s", (_, o) => {
    expect(content(packetOf(auroraProjectionFacts(o)))).toEqual(content(reference(o)));
  });
  it("declares an absent driver missing and projects nothing", () => {
    const p = packetOf(auroraProjectionFacts(), (e) => e.filter((x) => !x.fieldPath.endsWith(".base.fixedCosts")));
    expect(p.status).toBe("framed"); expect(p.readings).toBeNull();
    expect(p.gaps.map((g) => g.reason)).toContain("No contribution adopted for base.fixedCosts in scenario base");
  });
  it("reports a slot adopted twice as missing", () => {
    const p = packetOf(auroraProjectionFacts(), (e) => {
      const twice = e.find((x) => x.fieldPath.endsWith(".actual.volume"))!;
      return [...e, {...twice, decisionId: id(9999), slotKey: createHash("sha256").update("second").digest("hex"), value: {type: "number", value: "110"}}];
    });
    expect(p.status).toBe("framed");
    expect(p.gaps.map((g) => g.reason)).toContain("2 contributions match actual.volume for scenario base; keep one value per slot in the working basis");
  });
  it("keeps a scenario rule whose parts are partly gone as a gap, never a dropped rule", () => {
    const p = packetOf(auroraProjectionFacts(), (e) => e.filter((x) => !x.fieldPath.endsWith(".scenario.trigo-repasse-6m.shock.rate")));
    expect(p.status).toBe("framed");
    expect(p.gaps.map((g) => g.reason)).toContain("No contribution adopted for scenario.trigo-repasse-6m.shock.rate in scenario trigo-repasse-6m");
  });
  it("refuses inconsistent facts before proposing premises", () => {
    const refuse = (change: (f: OperatingProjectionFacts) => void, message: string) => {const f = auroraProjectionFacts(); change(f); expect(() => proposeOperatingProjectionHypotheses(f)).toThrow(message);};
    refuse((f) => {f.base[0]!.values = ["1", "2"];}, "one value and one origin per projected year");
    refuse((f) => {f.base[1]!.driver = "volume";}, "Every driver needs one base column");
    refuse((f) => {f.scenarios[0]!.basedOn = "volume-menor";}, "must be based on the base or an earlier scenario");
    refuse((f) => {f.scenarios[3]!.overrides = [{driver: "volume", values: ["1", "1", "1"], origin: "house", source: "x"}];}, "two volume rules");
    refuse((f) => {f.scenarios[0]!.inputCostShock!.value.fromPeriodEnd = "2030-12-31";}, "shocks an unknown period");
    refuse((f) => {f.companyVersions[0]!.version.origin = "house";}, "must come from the company");
    refuse((f) => {f.periodEnds = ["2025-06-30", "2027-12-31", "2028-12-31"];}, "must follow the actual year");
    refuse((f) => {f.base[4]!.values = ["81.812345678", "85.6", "89.4"];}, "has an invalid value");
  });
});
