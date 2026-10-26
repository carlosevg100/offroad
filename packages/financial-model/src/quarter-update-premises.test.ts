import {createHash} from "node:crypto";
import {describe, expect, it} from "vitest";
import type {AdoptionBasisEntry, AdoptionBasisSnapshot} from "@offroad/reconciliation";
import type {ProposedHypothesis} from "./investment-premises";
import {composeBoundQuarterUpdate} from "./quarter-update-composer";
import {prepareQuarterUpdatePacket} from "./quarter-update-packet";
import {proposeQuarterUpdateHypotheses} from "./quarter-update-premises";
import {proposeWeeklyCashHypotheses} from "./weekly-cash-premises";
import {proposeCovenantHeadroomHypotheses} from "./covenant-headroom-premises";
import {auroraPriorCovenantFacts, auroraQuarterUpdateBasis, auroraQuarterUpdateFacts} from "./quarter-update.test-support";
import {auroraWeeklyCashFacts} from "./weekly-cash.test-support";
import {analysisTestId as id} from "./adopted-analysis.test-support";

const question = "Fechou o trimestre. Atualiza tudo.";
function envelopeOf(entries: AdoptionBasisEntry[], version: number, purpose: string) {
  const snapshot: AdoptionBasisSnapshot = {schemaVersion: "contextual-adoption.v1", versionId: id(version), setId: id(6), workId: id(7), purpose,
    contextKey: purpose, revision: 1, previousVersionId: null, classification: "working_basis", entries};
  const canonical = JSON.stringify(snapshot);
  return {envelope: {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")}, scope: {workId: id(7), purpose, versionId: id(version)}};
}
function adopt(hypotheses: ProposedHypothesis[], start: number) {
  let n = start;
  return hypotheses.map((h) => ({decisionId: id(n++), slotKey: createHash("sha256").update(h.fieldPath + h.dimensions.scenario).digest("hex"),
    kind: "hypothesis", fieldPath: h.fieldPath, dimensions: {...h.dimensions}, value: h.value, observationId: null, referenceValue: null, referenceDimensions: null,
    definitionKind: "managerial", actorId: id(5), reason: h.reason}) as AdoptionBasisEntry);
}
/** The two prior versions adopted by their own premises, and the close adopted on a third basis that names them. */
function bases(edit: (facts: ReturnType<typeof auroraQuarterUpdateFacts>) => void = () => undefined) {
  const weeklyCash = envelopeOf(adopt(proposeWeeklyCashHypotheses(auroraWeeklyCashFacts()), 9000), 501, "synthetic weekly cash");
  const covenant = envelopeOf(adopt(proposeCovenantHeadroomHypotheses(auroraPriorCovenantFacts()), 9400), 502, "synthetic covenant headroom");
  const facts = auroraQuarterUpdateFacts(weeklyCash.envelope.fingerprint, covenant.envelope.fingerprint); edit(facts);
  const entries = adopt(proposeQuarterUpdateHypotheses(facts), 9700);
  return {weeklyCash, covenant, entries, update: envelopeOf(entries, 503, "synthetic quarter update")};
}
const packetOf = (b: {weeklyCash: ReturnType<typeof envelopeOf>; covenant: ReturnType<typeof envelopeOf>; update: ReturnType<typeof envelopeOf>}) =>
  prepareQuarterUpdatePacket(composeBoundQuarterUpdate({prior: {weeklyCash: b.weeklyCash, covenant: b.covenant}, update: b.update, question}));

describe("C54 premises proposed from facts with origin, adopted, composed and measured", {timeout: 300000}, () => {
  it("stays inside the basis limit and states the origin of every premise", () => {
    const b = bases(), h = proposeQuarterUpdateHypotheses(auroraQuarterUpdateFacts(b.weeklyCash.envelope.fingerprint, b.covenant.envelope.fingerprint));
    expect(h.length).toBeLessThanOrEqual(256);
    expect(h.every((x) => x.reason.startsWith("Origem: "))).toBe(true);
  });
  it("reproduces the hand-built calibration: same readings and numbers, priors untouched", () => {
    const b = bases(), p = packetOf(b);
    const reference = prepareQuarterUpdatePacket({schemaVersion: "quarter-update-packet-input.v1", question, analysis: auroraQuarterUpdateBasis().seal()});
    expect(p.status).toBe("prepared_for_human_review");
    expect(p.gaps).toEqual([]);
    expect(p.readings).toEqual(reference.readings);
    expect(p.result.update).toEqual(reference.result.update);
    expect(p.result.prior.weeklyCash.basisFingerprint).toBe(b.weeklyCash.envelope.fingerprint);
  });
  it("declares an absent operand missing and never supplies it", () => {
    const b = bases(), update = envelopeOf(b.entries.filter((e) => !e.fieldPath.endsWith(".line.caixa.actual")), 503, "synthetic quarter update");
    const p = packetOf({...b, update});
    expect(p.status).toBe("framed");
    expect(p.gaps.some((g) => g.operand.endsWith(".line.caixa.actual") && g.reason.startsWith("No contribution adopted for line.caixa.actual"))).toBe(true);
  });
  it("review r1: removing the weekly series of the structural causes through the full path is a gap", () => {
    const b = bases((f) => {f.streamUpdates = [];});
    const p = packetOf(b);
    expect(p.status).toBe("partial");
    expect(p.gaps.filter((g) => g.reason === "structural_cause_not_in_weekly_cash")).toHaveLength(2);
    expect(Number(p.readings!.projectedEbitda.updated).toFixed(1)).toBe("53.5");
  });
  it("refuses a composition whose structure is missing, by name", () => {
    const b = bases(), without = (suffix: string) => ({...b, update: envelopeOf(b.entries.filter((e) => !e.fieldPath.endsWith(suffix)), 503, "synthetic quarter update")});
    expect(() => packetOf(without(".cause.trigo.lineId"))).toThrow("quarter_update_cause_bridge_missing");
    expect(() => packetOf(without(".line.prazo.unit"))).toThrow("quarter_update_line_unit_missing");
    expect(() => packetOf(without(".covenant.measurementIds"))).toThrow("quarter_update_covenant_measurement_missing");
  });
  it("refuses inconsistent facts before proposing premises", () => {
    const fp = "a".repeat(64);
    const calendarEnd = auroraQuarterUpdateFacts(fp, fp); calendarEnd.bridges[0]!.causes[0]!.value.until = "2026-12-31";
    expect(() => proposeQuarterUpdateHypotheses(calendarEnd)).toThrow("a calendar cause has none");
    const calendarMoves = auroraQuarterUpdateFacts(fp, fp); calendarMoves.streamUpdates[0]!.value.causeIds = ["estoque-trigo"];
    expect(() => proposeQuarterUpdateHypotheses(calendarMoves)).toThrow("must be moved by structural causes");
    const noCashBridge = auroraQuarterUpdateFacts(fp, fp); noCashBridge.bridges = [noCashBridge.bridges[0]!, {...noCashBridge.bridges[0]!, lineId: "receita"}];
    expect(() => proposeQuarterUpdateHypotheses(noCashBridge)).toThrow("Cash and EBITDA each need one bridge");
    const natureless = auroraQuarterUpdateFacts(fp, fp); natureless.bridges[0]!.causes[1]!.value.nature = null;
    expect(() => proposeQuarterUpdateHypotheses(natureless)).toThrow("only a structural cause is a flow or a balance shift");
    const balanceOnEbitda = auroraQuarterUpdateFacts(fp, fp); balanceOnEbitda.bridges[0]!.causes[1]!.value.nature = "balance";
    expect(() => proposeQuarterUpdateHypotheses(balanceOnEbitda)).toThrow("a balance shift belongs to the cash bridge");
    const precise = auroraQuarterUpdateFacts(fp, fp); precise.bridges[0]!.causes[0]!.value.amount = "0.123456789";
    expect(() => proposeQuarterUpdateHypotheses(precise)).toThrow();
  });
});
