import {createHash} from "node:crypto";
import Decimal from "decimal.js";
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
import {auroraWeeklyCash} from "./weekly-cash-streams.test-support";
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
  it("review r2 F1: a series attributed to two causes cannot stretch the shorter one's window", () => {
    const b = bases((f) => {
      f.bridges[0]!.causes[1]!.value.until = "2026-10-01";
      f.streamUpdates[1]!.value.causeIds = ["trigo", "prazo-redes"];
    });
    expect(() => packetOf(b)).toThrow("quarter_update_series_shared_by_causes");
  });
  it("review r2 F2: a series outside the scenario used does not carry a cause", () => {
    const harvest = auroraWeeklyCash.streams.find((s) => s.id === "safra-30")!;
    const b = bases((f) => {
      f.streamUpdates = [{value: {streamId: "safra-30", causeIds: ["trigo"], transform: {kind: "scale", factor: "1.01"}, dates: [...harvest.dates], amounts: harvest.amounts.map((a) => new Decimal(a).plus("0.01").toFixed())},
        origin: "estimate", source: "série fora do cenário informado"}];
    });
    expect(() => packetOf(b)).toThrow("quarter_update_series_outside_scenario");
  });
  it("review r3: a November covenant, an EBITDA to November and a monthly statement are not updated by the December results", () => {
    const b = bases((f) => {
      f.bridges[0]!.causes[1]!.value.until = "2027-03-31";
      const d = (id: string, label: string, kind: "analysis" | "plan", reads: string[], start: string, end: string, recomputedBy: string, owner: string) =>
        ({value: {id, label, kind, reads, horizonStart: start, horizonEnd: end, recomputedBy, owner, ...identity[id]!}, origin: "house" as const, source: "mapa de dependências"});
      const identity: Record<string, {quantities: string[]; definition: string | null; scenario: string | null}> = {
        "covenant-nov": {quantities: ["covenant_ratio"], definition: "Definição da escritura (CVM 156 menos arrendamentos)", scenario: "base"},
        "ebitda-nov": {quantities: ["annual_ebitda"], definition: null, scenario: "base"}, "dre-mensal": {quantities: ["monthly_ebitda"], definition: null, scenario: "linha-17"}};
      f.dependents.push(d("covenant-nov", "Covenant até 30/11/2026", "analysis", ["ebitda", "caixa"], "2026-01-01", "2026-11-30", "covenant:dez26-base", "measure-covenant-headroom"),
        d("ebitda-nov", "EBITDA acumulado até novembro", "plan", ["ebitda"], "2026-01-01", "2026-11-30", "projection:2026", "build-operating-projection"),
        d("dre-mensal", "DRE mensal do quarto trimestre", "analysis", ["ebitda"], "2026-10-01", "2026-12-31", "weekly_cash", "build-operating-projection"));
      for (const x of f.dependents) if (x.value.id === "plano-2027") x.value.recomputedBy = "projection:2027";
    });
    const p = packetOf(b);
    expect(p.status).toBe("prepared_for_human_review");
    expect(p.readings!.updated).toEqual(["caixa-semanal", "covenant-dez26", "covenant-dez26-gerencial", "projecao-2026"]);
    expect(p.readings!.ownedElsewhere.map((x) => x.dependentId)).toEqual(["plano-2027", "linha-embalagem", "covenant-nov", "ebitda-nov", "dre-mensal"]);
  });
  it("review r3: an inconsistent or token weekly propagation keeps the weekly cash affected and the packet partial", () => {
    const tiny = bases((f) => {
      const s = f.streamUpdates[1]!.value; s.amounts = auroraWeeklyCash.streams.find((x) => x.id === "insumos")!.amounts.map((a, k) => k === 3 ? "5.80000001" : a);
    });
    const p = packetOf(tiny);
    expect(p.status).toBe("partial");
    expect(p.readings!.updated).not.toContain("caixa-semanal");
    expect(p.gaps.map((g) => g.reason)).toEqual(["structural_cause_series_not_matching_factor", "affected_not_recomputed"]);
    const cheaper = bases((f) => {const s = f.streamUpdates[1]!.value; s.amounts = s.amounts.map((a, k) => s.dates[k]! > "2026-09-30" ? "5.7" : a);});
    const q = packetOf(cheaper);
    expect(q.readings!.affectedNotRecomputed).toContain("caixa-semanal");
    expect(q.gaps.map((g) => g.reason)).toEqual(["structural_cause_series_not_matching_factor", "affected_not_recomputed"]);
  });
  it("review r4: an identity transform with noise inside the tolerance does not update the weekly cash", () => {
    const prior = auroraWeeklyCash.streams.find((x) => x.id === "insumos")!;
    const p = packetOf(bases((f) => {const s = f.streamUpdates[1]!.value; s.transform = {kind: "scale", factor: "1"}; s.dates = [...prior.dates]; s.amounts = prior.amounts.map((a, k) => k === 3 ? "5.80000001" : a);}));
    expect(p.status).toBe("partial");
    expect(p.gaps.map((g) => g.reason)).toEqual(["structural_cause_weekly_effect_inconsistent", "affected_not_recomputed"]);
    expect(p.readings!.updated).not.toContain("caixa-semanal");
  });
  it("review r4: an EBITDA statement bound to the weekly cash through a driver line is not updated, and asking for it makes the packet partial", () => {
    const b = bases((f) => {
      f.bridges[0]!.causes[1]!.value.driverLineId = "ebitda";
      f.dependents.push({value: {id: "dre-semanal", label: "EBITDA no horizonte semanal", kind: "analysis", reads: ["ebitda"], horizonStart: "2026-09-14", horizonEnd: "2027-01-03",
        recomputedBy: "weekly_cash", owner: "build-operating-projection", quantities: ["monthly_ebitda"], definition: null, scenario: "linha-17"}, origin: "house", source: "mapa de dependências"});
    });
    const p = prepareQuarterUpdatePacket(composeBoundQuarterUpdate({prior: {weeklyCash: b.weeklyCash, covenant: b.covenant}, update: b.update, question, askedDependentIds: ["dre-semanal"]}));
    expect(p.readings!.affectedNotRecomputed).toContain("dre-semanal");
    expect(p.status).toBe("partial");
    expect(p.gaps.map((g) => g.reason)).toEqual(["asked_dependent_not_recomputed"]);
  });
  it("review r4: the managerial reading is not updated by the indenture result", () => {
    const b = bases((f) => {
      f.covenant.value.measurementIds = ["dez26-base"];
      for (const d of f.dependents) if (d.value.id === "covenant-dez26-gerencial") d.value.recomputedBy = "covenant:dez26-base";
    });
    const p = prepareQuarterUpdatePacket(composeBoundQuarterUpdate({prior: {weeklyCash: b.weeklyCash, covenant: b.covenant}, update: b.update, question, askedDependentIds: ["covenant-dez26-gerencial"]}));
    expect(p.readings!.updated).toEqual(["caixa-semanal", "covenant-dez26", "projecao-2026"]);
    expect(p.readings!.affectedNotRecomputed).toContain("covenant-dez26-gerencial");
    expect(p.status).toBe("partial");
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
