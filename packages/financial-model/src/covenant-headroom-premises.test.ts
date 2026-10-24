import {createHash} from "node:crypto";
import {describe, expect, it} from "vitest";
import type {AdoptionBasisEntry, AdoptionBasisSnapshot} from "@offroad/reconciliation";
import {analysisTestId as id} from "./adopted-analysis.test-support";
import {composeBoundCovenantHeadroom} from "./covenant-headroom-composer";
import {prepareCovenantHeadroomPacket, type CovenantHeadroomPacket} from "./covenant-headroom-packet";
import {proposeCovenantHeadroomHypotheses, type CovenantHeadroomFacts} from "./covenant-headroom-premises";
import {auroraCovenantBasis, auroraCovenantFacts} from "./covenant-headroom.test-support";

const question = "Como estamos contra os covenants?";
type Options = Parameters<typeof auroraCovenantFacts>[0];
function adopt(facts: CovenantHeadroomFacts) {
  let n = 9000;
  const entries: AdoptionBasisEntry[] = proposeCovenantHeadroomHypotheses(facts).map((h) => ({decisionId: id(n++), slotKey: createHash("sha256").update(h.fieldPath + h.dimensions.scenario).digest("hex"),
    kind: "hypothesis", fieldPath: h.fieldPath, dimensions: {...h.dimensions}, value: h.value, observationId: null, referenceValue: null, referenceDimensions: null,
    definitionKind: "managerial", actorId: id(5), reason: h.reason}) as AdoptionBasisEntry);
  const snapshot: AdoptionBasisSnapshot = {schemaVersion: "contextual-adoption.v1", versionId: id(500), setId: id(6), workId: id(7), purpose: "synthetic covenant headroom",
    contextKey: "covenants", revision: 1, previousVersionId: null, classification: "working_basis", entries};
  return {entries, snapshot, scope: {workId: id(7), purpose: snapshot.purpose, versionId: id(500)}};
}
const seal = (snapshot: AdoptionBasisSnapshot) => {const canonical = JSON.stringify(snapshot); return {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")};};
const compose = (a: ReturnType<typeof adopt>, entries = a.entries, extra: {headlineMeasurementId?: string} = {}) =>
  composeBoundCovenantHeadroom({envelope: seal({...a.snapshot, entries}), scope: a.scope, question, ...extra});
const packetOf = (facts: CovenantHeadroomFacts, entries?: (e: AdoptionBasisEntry[]) => AdoptionBasisEntry[]) => {
  const a = adopt(facts); return prepareCovenantHeadroomPacket(compose(a, entries ? entries(a.entries) : a.entries));
};
const reference = (o: Options = {}) => prepareCovenantHeadroomPacket({schemaVersion: "covenant-headroom-packet-input.v1", question, headlineMeasurementId: "dez26-base", analysis: auroraCovenantBasis(o).seal()});
/** What the answer says, without identities of the basis. */
const content = (p: CovenantHeadroomPacket) => ({status: p.status, readings: p.readings, headroom: p.result.headroom, definitions: p.result.definitions,
  openQuestions: p.result.openQuestions, consequence: p.result.consequence, resultStatus: p.result.status, classification: p.result.classification,
  gaps: p.gaps.map((g) => ({operand: g.operand.replace(/^covenant\.[0-9a-f-]{36}\./, ""), reason: g.reason}))});

describe("C12 premises proposed from facts with origin, adopted, composed and measured", () => {
  it("stays inside the basis limit and states the origin of every premise", () => {
    for (const o of [{}, {policyDefinition: "EBITDA gerencial sem descontar arrendamentos"}, {policyOnManagerial: true}] as Options[]) {
      const h = proposeCovenantHeadroomHypotheses(auroraCovenantFacts(o));
      expect(h.length).toBeLessThanOrEqual(256);
      expect(h.every((x) => x.reason.startsWith("Origem: "))).toBe(true);
      expect(h.every((x) => x.fieldPath.startsWith("covenant.") && x.dimensions.scale === "1")).toBe(true);
    }
  });
  it.each([
    ["the open policy definition", {}],
    ["the written policy definition", {policyDefinition: "EBITDA gerencial sem descontar arrendamentos"}],
    ["the policy measured on managerial EBITDA", {policyOnManagerial: true}],
    ["both", {policyDefinition: "EBITDA gerencial sem descontar arrendamentos", policyOnManagerial: true}],
  ] as [string, Options][])("reproduces the hand-built basis with %s", (_, o) => {
    const p = packetOf(auroraCovenantFacts(o));
    expect(content(p)).toEqual(content(reference(o)));
    expect(p.readings!.headline.measurementId).toBe("dez26-base");
  });
  it("answers the calibration with the numbers of the packet test", () => {
    const p = packetOf(auroraCovenantFacts());
    expect(p.status).toBe("partial");
    expect(Number(p.readings!.headline.ratio).toFixed(2)).toBe("2.20");
    expect(p.readings!.headline.byLimit.map((l) => [l.limitId, Number(l.ebitdaHeadroom).toFixed(2)])).toEqual([["aditamento", "13.76"], ["politica", "6.22"]]);
    expect(p.readings!.policyBindsFirst).toBe(true);
    expect(p.readings!.worst).toMatchObject({measurementId: "dez27-adverso", limitId: "politica"});
    expect(p.readings!.contrasts).toEqual(["dez26-sem-safra", "junho-gerencial", "dez26-escritura-original"]);
    expect(p.gaps).toEqual([expect.objectContaining({reason: "A ata não diz qual EBITDA a política usa"})]);
  });
  it("declares an absent mandatory operand missing and leaves an absent optional one out", () => {
    const gapped = packetOf(auroraCovenantFacts(), (e) => e.filter((x) => !x.fieldPath.endsWith(".measurement.dez26-base.debt")));
    expect(gapped.status).toBe("framed");
    expect(gapped.readings).toBeNull();
    expect(gapped.gaps.map((g) => g.reason)).toContain("No contribution adopted for measurement.dez26-base.debt in scenario base");
    const facts = auroraCovenantFacts({policyDefinition: "EBITDA gerencial sem descontar arrendamentos"});
    facts.measurements[0]!.value.unrealizedEbitda = null;
    const a = adopt(facts), input = compose(a);
    expect(input.analysis.measurements[0]!.unrealizedEbitda).toBeNull();
    const p = prepareCovenantHeadroomPacket(input);
    expect(p.status).toBe("prepared_for_human_review");
    expect(p.gaps).toEqual([]);
    expect(p.readings!.headline.byLimit.every((l) => l.unrealizedEbitdaLossToLimit === null)).toBe(true);
    // A consequence the contract does not state is a named gap, never a default.
    const silent = auroraCovenantFacts({policyDefinition: "EBITDA gerencial"}); silent.consequence.crossDefault = null;
    expect(packetOf(silent).gaps.map((g) => g.reason)).toEqual(["No contribution adopted for consequence.crossDefault in scenario base"]);
  });
  it("reports a slot adopted twice as missing", () => {
    const p = packetOf(auroraCovenantFacts(), (e) => {
      const twice = e.find((x) => x.fieldPath.endsWith(".limit.aditamento.maximumRatio"))!;
      return [...e, {...twice, decisionId: id(9999), slotKey: createHash("sha256").update("second contribution").digest("hex"), value: {type: "number", value: "3.5"}}];
    });
    expect(p.status).toBe("framed");
    expect(p.gaps.map((g) => g.reason)).toContain("2 contributions match limit.aditamento.maximumRatio for scenario base; keep one value per slot in the working basis");
  });
  it("keeps an adopted adjustment whose operands are gone as a gap, never a dropped deduction", () => {
    const p = packetOf(auroraCovenantFacts({policyDefinition: "EBITDA gerencial"}),
      (e) => e.filter((x) => !/\.measurement\.dez26-base\.adjustment\.arrendamentos\.(label|amount)$/.test(x.fieldPath)));
    expect(p.status).toBe("framed");
    expect(p.gaps.map((g) => g.reason)).toEqual(expect.arrayContaining([
      "No contribution adopted for measurement.dez26-base.adjustment.arrendamentos.label in scenario base",
      "No contribution adopted for measurement.dez26-base.adjustment.arrendamentos.amount in scenario base"]));
  });
  it("reads an operand adopted in the inherited top scenario, as the reader does, and refuses two across both", () => {
    const facts = auroraCovenantFacts();
    const moved = (e: AdoptionBasisEntry[]) => e.map((x) => x.fieldPath.endsWith(".measurement.dez26-adverso.debt") ? {...x, dimensions: {...x.dimensions, scenario: "base"}} : x);
    expect(content(packetOf(facts, moved))).toEqual(content(reference()));
    const both = packetOf(facts, (e) => {
      const own = e.find((x) => x.fieldPath.endsWith(".measurement.dez26-adverso.debt"))!;
      return [...e, {...own, decisionId: id(9998), slotKey: createHash("sha256").update("inherited contribution").digest("hex"), dimensions: {...own.dimensions, scenario: "base"}}];
    });
    expect(both.status).toBe("framed");
    expect(both.gaps.map((g) => g.reason)).toContain("2 contributions match measurement.dez26-adverso.debt for scenario adverse; keep one value per slot in the working basis");
  });
  it("recovers the headline from the basis and refuses one that is not a test", () => {
    const a = adopt(auroraCovenantFacts());
    expect(compose(a).headlineMeasurementId).toBe("dez26-base");
    expect(compose(a, a.entries, {headlineMeasurementId: "dez27-base"}).headlineMeasurementId).toBe("dez27-base");
    expect(() => compose(a, a.entries, {headlineMeasurementId: "junho-gerencial"})).toThrow("headline must be a test measurement");
    expect(() => compose(a, a.entries.filter((e) => !e.fieldPath.endsWith(".headlineMeasurementId")))).toThrow("covenant_headroom_headline_missing");
    expect(() => compose(a, a.entries.filter((e) => !e.fieldPath.endsWith(".readingDate")))).toThrow("covenant_headroom_analysis_missing");
  });
  it("refuses inconsistent facts before proposing premises", () => {
    const refuse = (change: (f: CovenantHeadroomFacts) => void, message: string) => {const f = auroraCovenantFacts(); change(f); expect(() => proposeCovenantHeadroomHypotheses(f)).toThrow(message);};
    refuse((f) => {f.headline.value = "junho-gerencial";}, "The headline must be a test measurement");
    refuse((f) => {f.endDate = f.readingDate;}, "The end date must follow the reading date");
    refuse((f) => {f.measurements[1]!.value.limitIds = ["inexistente"];}, "names an unknown limit");
    refuse((f) => {f.measurements[6]!.value.role = "test"; f.measurements[6]!.value.limitIds = ["aditamento"];}, "off its limits' test dates");
    refuse((f) => {f.measurements[7]!.value.role = "test";}, "names a superseded limit");
    refuse((f) => {for (const m of f.measurements) m.value.limitIds = m.value.limitIds.filter((x) => x !== "politica");}, "Limit politica in force is never tested");
    refuse((f) => {f.measurements[1]!.value.unrealizedEbitda = "1"; f.measurements[1]!.value.date = "2026-09-15";}, "not after the reading date");
    refuse((f) => {f.effects[0]!.value.withoutEffectMeasurementId = "dez27-base";}, "different dates");
    refuse((f) => {f.measurements[2]!.value.id = "dez26-base";}, "Duplicate measurement");
    refuse((f) => {f.limits[2]!.term.value.id = "aditamento";}, "Duplicate limit");
    refuse((f) => {f.limits[0]!.term.value.testDates = [];}, "needs its test dates");
    refuse((f) => {f.measurements[0]!.value.cash = "15.457201861";}, "Invalid string");
    refuse((f) => {f.measurements[0]!.value.debt = "-1";}, "Invalid string");
    refuse((f) => {f.limits[0]!.term.value.id = "a".repeat(41);}, "Invalid string");
    const big = auroraCovenantFacts(), adjustments = Array.from({length: 8}, (_, i) => ({id: `ajuste-${i}`, label: `Ajuste ${i}`, amount: "0"}));
    for (const m of big.measurements) m.value.adjustments = adjustments;
    for (let i = 0; i < 4; i++) big.measurements.push({...big.measurements[3]!, value: {...big.measurements[3]!.value, id: `contraste-${i}`}});
    expect(() => proposeCovenantHeadroomHypotheses(big)).toThrow("covenant_headroom_premises_exceed_basis");
  });
});
